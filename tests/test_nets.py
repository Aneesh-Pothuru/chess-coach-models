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


@pytest.mark.parametrize(
    "learner",
    [
        {"body": "transformer", "dim": 32, "depth": 2, "heads": 4, "dropout": 0.0},
        {"body": "conv", "dim": 16, "depth": 2, "dropout": 0.0},
    ],
)
def test_each_body_gives_one_number_a_board_and_learns(learner):
    model = build_net(learner, marks=3, context=6)
    tokens, marks, context = batch()
    output = model(tokens, marks, context)
    assert output.shape == (5,)
    assert parameter_count(model) > 0
    wanted = torch.tensor([0.0, 1.0, 2.0, 3.0, 4.0])
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-2)
    first = None
    for _ in range(60):
        loss = torch.nn.functional.mse_loss(model(tokens, marks, context), wanted)
        first = first if first is not None else loss.item()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    assert loss.item() < first / 4


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


BODIES = [
    {"body": "transformer", "dim": 32, "depth": 2, "heads": 4, "dropout": 0.0},
    {"body": "conv", "dim": 16, "depth": 2, "dropout": 0.0},
]


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_for_tags_gives_every_board_a_logit_a_tag_and_learns(learner):
    model = build_net(learner, marks=3, context=6, outputs=4)
    tokens, marks, context = batch()
    assert model(tokens, marks, context).shape == (5, 4)
    wanted = torch.tensor([[1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 1, 1]]).float()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-2)
    first = None
    for _ in range(80):
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(tokens, marks, context), wanted)
        first = first if first is not None else loss.item()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    assert loss.item() < first / 4


@pytest.mark.parametrize("learner", BODIES)
def test_a_head_for_squares_gives_every_square_its_own_logit_and_learns(learner):
    model = build_net(learner, marks=3, context=6, squares=True)
    tokens, marks, context = batch()
    assert model.body.squares(tokens, marks, context).shape == (5, 64, model.body.square_dim)
    assert model(tokens, marks, context).shape == (5, 64)
    wanted = (tokens == 4).float()
    assert 0 < wanted.sum() < wanted.numel()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-2)
    first = None
    for _ in range(80):
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(tokens, marks, context), wanted)
        first = first if first is not None else loss.item()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    assert loss.item() < first / 4
    said = model.eval()(tokens, marks, context)
    assert ((said > 0) == (wanted > 0)).float().mean() > 0.95


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


def test_an_unknown_body_is_refused():
    with pytest.raises(ValueError):
        build_net({"body": "graph", "dim": 8, "depth": 1}, marks=1, context=1)
