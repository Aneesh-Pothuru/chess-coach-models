import pytest

torch = pytest.importorskip("torch")

from chess_coach_models.nets.model import build_net, parameter_count  # noqa: E402


def batch(rows: int = 5, marks: int = 3, context: int = 6):
    generator = torch.Generator().manual_seed(0)
    return (
        torch.randint(0, 13, (rows, 64), generator=generator),
        torch.randint(0, 2, (rows, 64, marks), generator=generator).float(),
        torch.randn(rows, context, generator=generator),
    )


def fit(model, loss, steps: int, rate: float = 1e-2) -> tuple[float, float]:
    """What ``loss`` says of a net before the first of ``steps`` steps on one batch, and before the last."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=rate)
    said = []
    for _ in range(steps):
        now = loss()
        said.append(now.item())
        optimizer.zero_grad()
        now.backward()
        optimizer.step()
    return said[0], said[-1]


TRANSFORMER = {"body": "transformer", "dim": 32, "depth": 2, "heads": 4, "dropout": 0.0}
CONV = {"body": "conv", "dim": 16, "depth": 2, "dropout": 0.0}
# Every shape a run can ask for: the two bodies as they first shipped, then the transformer told what each
# piece attacks, the transformer without its offsets, the tower that weighs its channels, and the hybrid.
BODIES = [
    TRANSFORMER,
    CONV,
    {**TRANSFORMER, "attacks": True},
    {**TRANSFORMER, "geometry": False},
    {**CONV, "squeeze": 4},
    {"body": "hybrid", "dim": 32, "depth": 1, "heads": 4, "dropout": 0.0, "convs": 1},
]


@pytest.mark.parametrize("learner", BODIES)
def test_each_body_gives_one_number_a_board_and_learns(learner):
    torch.manual_seed(11)
    model = build_net(learner, marks=3, context=6)
    tokens, marks, context = batch()
    output = model(tokens, marks, context)
    assert output.shape == (5,)
    assert parameter_count(model) > 0
    wanted = torch.tensor([0.0, 1.0, 2.0, 3.0, 4.0])

    def loss():
        return torch.nn.functional.mse_loss(model(tokens, marks, context), wanted)

    first, last = fit(model, loss, steps=60)
    assert last < first / 4


def test_the_transformer_reads_marks_context_and_geometry():
    model = build_net(
        {"body": "transformer", "dim": 32, "depth": 2, "heads": 4, "dropout": 0.0}, marks=3, context=6
    ).eval()
    with torch.no_grad():
        for block in model.body.blocks:
            block.offset_bias.normal_()
    tokens, marks, context = batch()
    base = model(tokens, marks, context)
    assert not torch.allclose(base, model(tokens, 1 - marks, context))
    assert not torch.allclose(base, model(tokens, marks, context + 1))
    moved = tokens.roll(1, dims=1)
    assert not torch.allclose(base, model(moved, marks, context))
    offsets = model.body.offsets
    assert offsets.shape == (64, 64) and int(offsets.max()) == 224 and int(offsets.min()) == 0
    assert offsets[0, 0] == offsets[27, 27]
    assert offsets[0, 9] == offsets[18, 27]


def test_attention_is_told_what_each_piece_attacks_as_the_plain_tables_say():
    import numpy as np

    from chess_coach_models.encode.relations import RELATIONS, attacks

    learner = {**TRANSFORMER, "attacks": True}
    torch.manual_seed(7)
    model = build_net(learner, marks=3, context=6).eval()
    tokens, marks, context = batch()
    told = model.body.told(tokens)
    hits, behind = attacks(tokens.numpy())
    assert told.shape == (5, len(RELATIONS), 64, 64) and set(told.unique().tolist()) == {0.0, 1.0}
    for place, wanted in enumerate((hits, hits.transpose(0, 2, 1), behind, behind.transpose(0, 2, 1))):
        assert np.array_equal(told[:, place].numpy() > 0, wanted)
    # What it is told is weighed by weights that start at nothing: until they move, the network is the one
    # told nothing, weight for weight and answer for answer.
    torch.manual_seed(7)
    plain = build_net(TRANSFORMER, marks=3, context=6).eval()
    assert plain.body.told(tokens) is None
    assert [name for name in model.state_dict() if name not in plain.state_dict()] == [
        f"body.blocks.{layer}.told_bias" for layer in range(2)
    ]
    assert all(torch.equal(value, model.state_dict()[name]) for name, value in plain.state_dict().items())
    assert model.body.blocks[0].told_bias.shape == (4, len(RELATIONS))
    with torch.no_grad():
        base = model(tokens, marks, context)
        assert torch.allclose(base, plain(tokens, marks, context), atol=1e-6)
        for block in model.body.blocks:
            block.told_bias.normal_()
        assert not torch.allclose(base, model(tokens, marks, context), atol=1e-4)
    # The weights learn: the loss sends a gradient to every one of them from the first step.
    model.train()
    model(tokens, marks, context).sum().backward()
    assert all(block.told_bias.grad.abs().sum() > 0 for block in model.body.blocks)


def test_a_transformer_can_leave_its_offsets_out():
    without = build_net({**TRANSFORMER, "geometry": False}, marks=3, context=6)
    assert not any("offset_bias" in name for name in without.state_dict())
    assert all(block.offset_bias is None for block in without.body.blocks)
    assert parameter_count(build_net(TRANSFORMER, marks=3, context=6)) - parameter_count(without) == 2 * 4 * 15 * 15


def test_a_tower_that_weighs_its_channels_sees_the_whole_board_from_its_first_block():
    tokens, marks, context = batch()
    far = tokens.clone()
    far[:, 63] = (far[:, 63] + 1) % 13
    said = {}
    for name, learner in (("plain", {**CONV, "depth": 1}), ("squeeze", {**CONV, "depth": 1, "squeeze": 4})):
        torch.manual_seed(2)
        model = build_net(learner, marks=3, context=6, squares=True).eval()
        with torch.no_grad():
            said[name] = (model.body.squares(tokens, marks, context)[:, 0], model.body.squares(far, marks, context)[:, 0])
        gates = [name for name in model.state_dict() if ".gate." in name]
        assert len(gates) == (4 if name == "squeeze" else 0)
    # One block of 3x3 convolutions reaches three squares from a1, so h8 is out of its sight. The squeeze
    # reads a mean over the board, so the corner changes what a1 holds.
    assert torch.allclose(*said["plain"], atol=1e-6) and not torch.allclose(*said["squeeze"], atol=1e-6)


def test_a_hybrid_is_blocks_of_the_tower_then_layers_of_the_transformer():
    learner = {"body": "hybrid", "dim": 32, "depth": 2, "heads": 4, "dropout": 0.0, "convs": 3}
    model = build_net(learner, marks=3, context=6).eval()
    assert len(model.body.convs) == 3 and len(model.body.blocks) == 2
    names = list(model.state_dict())
    assert "body.convs.2.second.weight" in names and "body.blocks.1.offset_bias" in names and "body.place" in names
    tokens, marks, context = batch()
    with torch.no_grad():
        for block in model.body.blocks:
            block.offset_bias.normal_()
        base = model(tokens, marks, context)
        assert not torch.allclose(base, model(tokens, 1 - marks, context))
        assert not torch.allclose(base, model(tokens, marks, context + 1))
        assert not torch.allclose(base, model(tokens.roll(1, dims=1), marks, context))
    with pytest.raises(KeyError, match="convs"):
        build_net({"body": "hybrid", "dim": 32, "depth": 2, "heads": 4}, marks=3, context=6)


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_for_tags_gives_every_board_a_logit_a_tag_and_learns(learner):
    torch.manual_seed(11)
    model = build_net(learner, marks=3, context=6, outputs=4)
    tokens, marks, context = batch()
    assert model(tokens, marks, context).shape == (5, 4)
    wanted = torch.tensor([[1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 1, 1]]).float()

    def loss():
        return torch.nn.functional.binary_cross_entropy_with_logits(model(tokens, marks, context), wanted)

    first, last = fit(model, loss, steps=80)
    assert last < first / 4


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_for_squares_gives_every_square_its_own_logit_and_learns(learner):
    torch.manual_seed(11)
    model = build_net(learner, marks=3, context=6, squares=True)
    tokens, marks, context = batch()
    assert model.body.squares(tokens, marks, context).shape == (5, 64, model.body.square_dim)
    assert model(tokens, marks, context).shape == (5, 64)
    wanted = (tokens == 4).float()
    assert 0 < wanted.sum() < wanted.numel()

    def loss():
        return torch.nn.functional.binary_cross_entropy_with_logits(model(tokens, marks, context), wanted)

    first, last = fit(model, loss, steps=80)
    assert last < first / 4
    said = model.eval()(tokens, marks, context)
    assert ((said > 0) == (wanted > 0)).float().mean() > 0.95


def allowed_pairs(rows: int = 5, each: int = 20):
    """For each row, the pairs of squares its position allows and which of them was played."""
    generator = torch.Generator().manual_seed(1)
    pairs = torch.stack([torch.randperm(4096, generator=generator)[:each] for _ in range(rows)])
    return pairs, torch.randint(0, each, (rows,), generator=generator)


def over_allowed(logits, pairs):
    """A row's logits at the pairs its position allows."""
    return logits.gather(1, pairs)


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_for_moves_gives_every_pair_of_squares_a_logit_and_learns(learner):
    torch.manual_seed(11)
    model = build_net(learner, marks=3, context=6, moves=True)
    tokens, marks, context = batch()
    assert model(tokens, marks, context).shape == (5, 64 * 64)
    pairs, played = allowed_pairs()

    def loss():
        return torch.nn.functional.cross_entropy(over_allowed(model(tokens, marks, context), pairs), played)

    first, last = fit(model, loss, steps=120)
    assert last < first / 4
    said = over_allowed(model.eval()(tokens, marks, context), pairs).argmax(dim=1)
    assert torch.equal(said, played)


@pytest.mark.parametrize("learner", BODIES)
def test_a_move_s_logit_reads_which_square_it_leaves_and_which_it_reaches(learner):
    torch.manual_seed(5)
    model = build_net(learner, marks=3, context=6, moves=True).eval()
    tokens, marks, context = batch()
    with torch.no_grad():
        logits = model(tokens, marks, context).view(5, 64, 64)
        squares = model.body.squares(tokens, marks, context)
        by_hand = (model.leave(squares[0, 12]) * model.reach(squares[0, 28])).sum() * model.scale
    assert torch.allclose(logits[0, 12, 28], by_hand, atol=1e-5)
    assert not torch.allclose(logits, logits.transpose(1, 2), atol=1e-4)


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_for_moves_keeps_the_body_a_saved_run_has(learner):
    torch.manual_seed(7)
    model = build_net(learner, marks=3, context=6)
    torch.manual_seed(7)
    mover = build_net(learner, marks=3, context=6, moves=True)
    names = list(mover.state_dict())
    assert [name for name in names if not name.startswith("body.")] == [
        "leave.weight", "leave.bias", "reach.weight", "reach.bias"
    ]
    width = mover.body.square_dim
    assert mover.leave.weight.shape == (width, width) and mover.reach.weight.shape == (width, width)
    body = [name for name in model.state_dict() if name.startswith("body.")]
    assert body == [name for name in names if name.startswith("body.")]
    assert all(torch.equal(model.state_dict()[name], mover.state_dict()[name]) for name in body)
    assert mover.load_state_dict({name: model.state_dict()[name] for name in body}, strict=False).unexpected_keys == []


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_with_one_number_keeps_the_weights_a_saved_run_has(learner):
    torch.manual_seed(7)
    model = build_net(learner, marks=3, context=6)
    names = list(model.state_dict())
    assert names[-4:] == ["head.0.weight", "head.0.bias", "head.2.weight", "head.2.bias"]
    width = model.body.out_dim
    assert model.head[0].weight.shape == (width // 2, width) and model.head[2].weight.shape == (1, width // 2)
    torch.manual_seed(7)
    wider = build_net(learner, marks=3, context=6, outputs=4)
    body = [name for name in names if name.startswith("body.")]
    assert body == [name for name in wider.state_dict() if name.startswith("body.")]
    assert all(torch.equal(model.state_dict()[name], wider.state_dict()[name]) for name in body)
    assert wider.load_state_dict({name: model.state_dict()[name] for name in body}, strict=False).unexpected_keys == []


OVER = {"over": {"depth": 1, "heads": 2}}


def game_batch(marks: int = 3, numbers: int = 5, context: int = 2):
    """Four rows of up to six positions: the first is full, and the others are filled out."""
    generator = torch.Generator().manual_seed(0)
    lengths = torch.tensor([6, 4, 2, 5])
    held = torch.arange(6)[None, :] < lengths[:, None]
    return (
        torch.randint(0, 13, (4, 6, 64), generator=generator),
        torch.randint(0, 2, (4, 6, 64, marks), generator=generator).float(),
        torch.randn(4, 6, numbers, generator=generator),
        held,
        torch.randn(4, context, generator=generator),
    )


@pytest.mark.parametrize("learner", BODIES)
def test_a_body_over_a_game_gives_one_number_a_row_and_learns(learner):
    torch.manual_seed(11)
    model = build_net({**learner, **OVER}, marks=3, context=2, steps=5, most=6)
    inputs = game_batch()
    assert model(*inputs).shape == (4,)
    assert model.body.out_dim == 2 * model.body.board.out_dim and model.body.place.shape[0] == 6
    wanted = torch.tensor([0.0, 1.0, 2.0, 3.0])

    def loss():
        return torch.nn.functional.mse_loss(model(*inputs), wanted)

    # A net that says the rows' mean for every row leaves about a third of the first loss, so a quarter asks
    # it to tell the rows apart. At the rate the one-board tests fit at, a transformer under the layers over
    # the game stays at that mean for a number of steps that depends on where it starts, and about one start
    # in five was still there after these 80. At a third of that rate no start of any shape is.
    first, last = fit(model, loss, steps=80, rate=3e-3)
    assert last < first / 4


@pytest.mark.parametrize("learner", BODIES)
def test_what_fills_a_short_row_out_changes_nothing_it_says(learner):
    torch.manual_seed(3)
    model = build_net({**learner, **OVER}, marks=3, context=2, steps=5, most=8).eval()
    tokens, marks, numbers, held, context = game_batch()
    with torch.no_grad():
        base = model(tokens, marks, numbers, held, context)
        # Other boards, marks and numbers where a row has no position.
        other = (tokens.clone(), marks.clone(), numbers.clone())
        other[0][~held] = 12 - other[0][~held]
        other[1][~held] = 1 - other[1][~held]
        other[2][~held] += 5.0
        assert torch.allclose(base, model(*other, held, context), atol=1e-5)
        # A longer batch: two more places that hold nothing.
        longer = [torch.cat([part, part[:, :2]], dim=1) for part in (tokens, marks, numbers)]
        assert torch.allclose(base, model(*longer, torch.cat([held, held[:, :2] & False], dim=1), context), atol=1e-5)
        # A row alone says what it said among the others.
        alone = model(tokens[1:2, :4], marks[1:2, :4], numbers[1:2, :4], held[1:2, :4], context[1:2])
        assert torch.allclose(base[1:2], alone, atol=1e-5)


def test_a_body_over_a_game_reads_the_order_of_its_positions_and_every_number():
    torch.manual_seed(3)
    model = build_net({**BODIES[0], **OVER}, marks=3, context=2, steps=5, most=6).eval()
    tokens, marks, numbers, held, context = game_batch()
    with torch.no_grad():
        model.body.place.normal_()
        base = model(tokens, marks, numbers, held, context)
        # The first row's positions the other way round: that row changes, and no other.
        turned = [part.clone() for part in (tokens, marks, numbers)]
        for part in turned:
            part[0] = part[0].flip(0)
        said = model(*turned, held, context)
        assert not torch.allclose(base[0], said[0], atol=1e-4) and torch.allclose(base[1:], said[1:], atol=1e-5)
        assert not torch.allclose(base, model(tokens, marks, numbers + 1, held, context), atol=1e-4)
        assert not torch.allclose(base, model(tokens, marks, numbers, held, context + 1), atol=1e-4)
        assert not torch.allclose(base, model(tokens, 1 - marks, numbers, held, context), atol=1e-4)


def test_a_body_over_a_game_has_two_layers_unless_a_run_says_and_no_head_a_square():
    model = build_net(BODIES[0], marks=3, context=2, steps=5, most=6)
    assert model.body.over.num_layers == 2
    assert build_net({**BODIES[0], **OVER}, marks=3, context=2, steps=5, most=6).body.over.num_layers == 1
    with pytest.raises(ValueError, match="no head a square"):
        build_net(BODIES[0], marks=3, context=2, steps=5, most=6, squares=True)
    with pytest.raises(ValueError, match="no head a move"):
        build_net(BODIES[0], marks=3, context=2, steps=5, most=6, moves=True)


def test_an_unknown_body_is_refused():
    with pytest.raises(ValueError):
        build_net({"body": "graph", "dim": 8, "depth": 1}, marks=1, context=1)
