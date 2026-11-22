"""The networks that read a board.

Every network is a body and a head. A body turns the 64 square tokens, their
marks and the context numbers into one vector for the board and one for each
square; the head turns the board's vector into the task's output, or for a
task that asks about every square each square's vector into that square's.
For a task that asks which move is played, a head of its own gives a logit to
every pair of squares, the one a move leaves and the one it reaches
(``MoveNet``).
Three bodies ship, so a leaderboard can say what the architecture is worth on
a task:

- ``transformer``: each square is a token and every square attends to every
  other from the first layer. A learned bias per head for each offset between
  two squares (how many files and ranks apart) tells attention about the
  board's geometry: files, ranks, diagonals and knight hops are offsets. The
  context numbers enter as one more token. A run can leave the offsets out
  (``geometry: false``), and it can have attention told what each piece
  attacks on this board (``attacks: true``): which squares a piece hits and
  which it stands behind one man of, worked out from the tokens with no
  search (``encode/relations.py``), each with a learned weight per head.
- ``conv``: a residual tower of 3x3 convolutions over the 8x8 board, the kind
  of network the first AlphaZero-style engines used, which sees further only
  as it gets deeper. With ``squeeze`` every block also weighs its channels by
  what the whole board holds (squeeze-and-excitation), as the towers of Leela
  and the first Maia did.
- ``hybrid``: a few blocks of the tower first, then transformer layers over
  the squares it leaves: what stands next to what before what looks at what.

Where a row is a sequence of positions (a player's moves through a game),
any of the three reads each position and ``GameBody`` reads the positions in
order.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

from ..encode.board import TOKENS
from ..encode.relations import BETWEEN, REACH, RELATIONS


class Block(nn.Module):
    """A pre-norm transformer layer whose attention between squares is biased by their offset, and by what
    it is told of each pair of squares on this board when it is told anything."""

    def __init__(self, dim: int, heads: int, dropout: float, *, geometry: bool = True, told: int = 0):
        super().__init__()
        self.heads = heads
        self.dropout = dropout
        self.norm_attention = nn.LayerNorm(dim)
        self.qkv = nn.Linear(dim, 3 * dim)
        self.project = nn.Linear(dim, dim)
        self.register_parameter("offset_bias", nn.Parameter(torch.zeros(heads, 15 * 15)) if geometry else None)
        # One weight per head for each thing told of a pair of squares. They start at nothing, so a
        # network told something starts as the one told nothing.
        self.register_parameter("told_bias", nn.Parameter(torch.zeros(heads, told)) if told else None)
        self.norm_mlp = nn.LayerNorm(dim)
        self.mlp = nn.Sequential(nn.Linear(dim, 4 * dim), nn.GELU(), nn.Linear(4 * dim, dim))
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, offsets: torch.Tensor, told: torch.Tensor | None = None) -> torch.Tensor:
        batch, length, dim = x.shape
        q, k, v = (
            self.qkv(self.norm_attention(x))
            .view(batch, length, 3, self.heads, dim // self.heads)
            .permute(2, 0, 3, 1, 4)
        )
        bias = q.new_zeros(self.heads, length, length)
        if self.offset_bias is not None:
            bias[:, 1:, 1:] = self.offset_bias[:, offsets].to(bias.dtype)
        if told is not None:
            # ``told[batch, thing, asks, looked at]``: the context token is told nothing of any square.
            said = torch.einsum("ht,btqk->bhqk", self.told_bias.to(bias.dtype), told.to(bias.dtype))
            bias = bias + F.pad(said, (1, 0, 1, 0))
        attended = F.scaled_dot_product_attention(
            q, k, v, attn_mask=bias, dropout_p=self.dropout if self.training else 0.0
        )
        x = x + self.drop(self.project(attended.transpose(1, 2).reshape(batch, length, dim)))
        return x + self.drop(self.mlp(self.norm_mlp(x)))


def square_offsets() -> torch.Tensor:
    """For each pair of squares, how many files and ranks apart they are, as one of 15 by 15 numbers."""
    files = torch.arange(64) % 8
    ranks = torch.arange(64) // 8
    return (files[:, None] - files[None, :] + 7) * 15 + (ranks[:, None] - ranks[None, :] + 7)


class SquareTransformer(nn.Module):
    def __init__(
        self,
        *,
        marks: int,
        context: int,
        dim: int,
        depth: int,
        heads: int,
        dropout: float,
        geometry: bool = True,
        attacks: bool = False,
    ):
        super().__init__()
        self.piece = nn.Embedding(TOKENS, dim)
        self.place = nn.Parameter(torch.zeros(64, dim))
        self.mark = nn.Linear(marks, dim, bias=False)
        self.context = nn.Sequential(nn.Linear(context, dim), nn.GELU(), nn.Linear(dim, dim))
        self.blocks = nn.ModuleList(
            Block(dim, heads, dropout, geometry=geometry, told=len(RELATIONS) if attacks else 0) for _ in range(depth)
        )
        self.norm = nn.LayerNorm(dim)
        self.out_dim = 2 * dim
        self.square_dim = dim
        self.attacks = attacks
        self.register_buffer("offsets", square_offsets(), persistent=False)
        if attacks:
            # The tables a board's attacks are read from (``encode/relations.py``). They are no weights.
            self.register_buffer("reach", torch.from_numpy(REACH), persistent=False)
            between = BETWEEN.reshape(64 * 64, 64).T.astype(np.float32)
            self.register_buffer("between", torch.from_numpy(np.ascontiguousarray(between)), persistent=False)
            self.register_buffer("each", torch.arange(64), persistent=False)
        nn.init.normal_(self.place, std=0.02)

    def told(self, tokens: torch.Tensor) -> torch.Tensor | None:
        """What attention is told of each pair of squares of each board, ``[batch, things, 64, 64]`` in the
        order of ``RELATIONS``, or nothing for a network that is told nothing: whether the piece on the
        square that asks attacks the square it looks at, whether it is attacked from there, and the same two
        for a piece that stands behind one man."""
        if not self.attacks:
            return None
        men = (tokens > 0).to(self.between.dtype)
        between = (men @ self.between).view(-1, 64, 64)
        reach = self.reach[tokens, self.each]
        hits, behind = reach & (between == 0), reach & (between == 1)
        return torch.stack([hits, hits.transpose(1, 2), behind, behind.transpose(1, 2)], dim=1).to(self.place.dtype)

    def encode(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """The context token and the 64 squares after the last layer, ``[batch, 65, dim]``."""
        squares = self.piece(tokens) + self.place + self.mark(marks)
        x = torch.cat([self.context(context)[:, None, :], squares], dim=1)
        told = self.told(tokens)
        for block in self.blocks:
            x = block(x, self.offsets, told)
        return self.norm(x)

    def forward(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        x = self.encode(tokens, marks, context)
        return torch.cat([x[:, 0], x[:, 1:].mean(dim=1)], dim=-1)

    def squares(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """One vector a square, ``[batch, 64, square_dim]``."""
        return self.encode(tokens, marks, context)[:, 1:]


class Residual(nn.Module):
    """Two 3x3 convolutions around a skip. With ``squeeze`` the block also weighs each of its channels by
    what the whole board holds, through a layer that many times narrower (squeeze-and-excitation)."""

    def __init__(self, dim: int, squeeze: int = 0):
        super().__init__()
        self.first = nn.Conv2d(dim, dim, 3, padding=1, bias=False)
        self.first_norm = nn.BatchNorm2d(dim)
        self.second = nn.Conv2d(dim, dim, 3, padding=1, bias=False)
        self.second_norm = nn.BatchNorm2d(dim)
        self.gate = (
            nn.Sequential(nn.Linear(dim, dim // squeeze), nn.ReLU(), nn.Linear(dim // squeeze, dim)) if squeeze else None
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = F.relu(self.first_norm(self.first(x)))
        y = self.second_norm(self.second(y))
        if self.gate is not None:
            y = y * torch.sigmoid(self.gate(y.mean(dim=(2, 3))))[:, :, None, None]
        return F.relu(x + y)


def board_planes(tokens: torch.Tensor, marks: torch.Tensor) -> torch.Tensor:
    """A board as planes for a convolution, ``[batch, tokens + marks, 8, 8]``: one plane a token, one a mark."""
    planes = torch.cat([F.one_hot(tokens, TOKENS).to(marks.dtype), marks], dim=-1)
    return planes.transpose(1, 2).reshape(len(tokens), -1, 8, 8)


class SquareConv(nn.Module):
    def __init__(self, *, marks: int, context: int, dim: int, depth: int, dropout: float, squeeze: int = 0):
        super().__init__()
        self.stem = nn.Conv2d(TOKENS + marks, dim, 3, padding=1)
        self.context = nn.Linear(context, dim)
        self.blocks = nn.ModuleList(Residual(dim, squeeze) for _ in range(depth))
        self.drop = nn.Dropout(dropout)
        self.out_dim = 2 * dim
        self.square_dim = dim

    def tower(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """The board after the last block, ``[batch, dim, 8, 8]``."""
        x = F.relu(self.stem(board_planes(tokens, marks)) + self.context(context)[:, :, None, None])
        for block in self.blocks:
            x = block(x)
        return x

    def forward(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        x = self.tower(tokens, marks, context)
        return self.drop(torch.cat([x.mean(dim=(2, 3)), x.amax(dim=(2, 3))], dim=-1))

    def squares(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """One vector a square, ``[batch, 64, square_dim]``."""
        return self.drop(self.tower(tokens, marks, context).flatten(2).transpose(1, 2))


class SquareHybrid(nn.Module):
    """A few residual blocks of convolutions over the board, then transformer layers over its squares.

    The convolutions read what stands next to what, with the context numbers added to every square as the
    tower has them. Their output for a square is then that square's token, and the layers after are the
    square transformer's own, with its offsets and the context numbers as one more token. Maia-2 puts its
    two parts in this order, with its attention over groups of channels where this one's is over squares.
    """

    def __init__(self, *, marks: int, context: int, dim: int, depth: int, heads: int, dropout: float, convs: int):
        super().__init__()
        self.stem = nn.Conv2d(TOKENS + marks, dim, 3, padding=1)
        self.shade = nn.Linear(context, dim)
        self.convs = nn.ModuleList(Residual(dim) for _ in range(convs))
        self.place = nn.Parameter(torch.zeros(64, dim))
        self.context = nn.Sequential(nn.Linear(context, dim), nn.GELU(), nn.Linear(dim, dim))
        self.blocks = nn.ModuleList(Block(dim, heads, dropout) for _ in range(depth))
        self.norm = nn.LayerNorm(dim)
        self.out_dim = 2 * dim
        self.square_dim = dim
        self.register_buffer("offsets", square_offsets(), persistent=False)
        nn.init.normal_(self.place, std=0.02)

    def encode(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """The context token and the 64 squares after the last layer, ``[batch, 65, dim]``."""
        x = F.relu(self.stem(board_planes(tokens, marks)) + self.shade(context)[:, :, None, None])
        for conv in self.convs:
            x = conv(x)
        squares = x.flatten(2).transpose(1, 2) + self.place
        x = torch.cat([self.context(context)[:, None, :], squares], dim=1)
        for block in self.blocks:
            x = block(x, self.offsets)
        return self.norm(x)

    def forward(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        x = self.encode(tokens, marks, context)
        return torch.cat([x[:, 0], x[:, 1:].mean(dim=1)], dim=-1)

    def squares(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """One vector a square, ``[batch, 64, square_dim]``."""
        return self.encode(tokens, marks, context)[:, 1:]


class GameBody(nn.Module):
    """A body for a row that is a sequence of positions.

    The board body reads every position with that position's own numbers, where a row of one position has
    its context numbers. A few transformer layers then read the positions in order, with the row's own
    numbers as one more token and a learned vector for each place in the sequence. A batch is as long as
    its longest row, and ``held`` says which of a shorter row's places are positions: the board body reads
    those alone, so what fills a row out costs nothing and reaches no batch statistic, and nothing attends
    to it.
    """

    def __init__(self, board: nn.Module, *, context: int, depth: int, heads: int, dropout: float, most: int):
        super().__init__()
        self.board = board
        dim = board.out_dim
        self.context = nn.Sequential(nn.Linear(context, dim), nn.GELU(), nn.Linear(dim, dim))
        self.place = nn.Parameter(torch.zeros(most, dim))
        layer = nn.TransformerEncoderLayer(
            dim, heads, 2 * dim, dropout, activation="gelu", batch_first=True, norm_first=True
        )
        self.over = nn.TransformerEncoder(layer, depth, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(dim)
        self.out_dim = 2 * dim
        nn.init.normal_(self.place, std=0.02)

    def forward(
        self,
        tokens: torch.Tensor,
        marks: torch.Tensor,
        numbers: torch.Tensor,
        held: torch.Tensor,
        context: torch.Tensor,
    ) -> torch.Tensor:
        rows, length = held.shape
        boards = self.board(tokens[held], marks[held], numbers[held])
        x = boards.new_zeros(rows, length, boards.shape[-1])
        x[held] = boards
        x = x + self.place[:length].to(x.dtype)
        x = torch.cat([self.context(context)[:, None, :].to(x.dtype), x], dim=1)
        hidden = torch.cat([held.new_zeros(rows, 1), ~held], dim=1)
        x = self.norm(self.over(x, src_key_padding_mask=hidden))
        real = held[..., None].to(x.dtype)
        return torch.cat([x[:, 0], (x[:, 1:] * real).sum(dim=1) / real.sum(dim=1).clamp(min=1.0)], dim=-1)


class BoardNet(nn.Module):
    """A body under a two-layer head.

    The head reads the board's vector and gives ``outputs`` numbers: one, a number or the logit of a
    chance, or one logit for each of a task's tags. With ``squares`` it reads each square's vector
    instead and gives every square its logit.
    """

    def __init__(self, body: nn.Module, *, outputs: int = 1, squares: bool = False):
        super().__init__()
        self.body = body
        self.per_square = squares
        width = body.square_dim if squares else body.out_dim // 2
        self.head = nn.Sequential(
            nn.Linear(body.square_dim if squares else body.out_dim, width), nn.GELU(), nn.Linear(width, outputs)
        )
        self.single = outputs == 1

    def forward(self, *inputs: torch.Tensor) -> torch.Tensor:
        """What the body reads: a board's tokens, marks and context numbers, or for a row that is a sequence
        what ``GameBody`` reads."""
        read = self.body.squares if self.per_square else self.body
        output = self.head(read(*inputs))
        return output.squeeze(-1) if self.single else output


class MoveNet(nn.Module):
    """A body under a head that gives every move a logit.

    A move is the square it leaves and the square it reaches. Each square's vector is read twice, once as
    a square to leave and once as a square to reach, and a move's logit is how well the first of its
    squares, read the first way, matches the second read the second way. The output is one logit for each
    of the 64 by 64 pairs, a pair at the first square's number times 64 plus the second's
    (``encode/moves.py``). Which pairs are moves the position allows is the task's to say: the loss and
    the chances are taken over those alone.
    """

    def __init__(self, body: nn.Module):
        super().__init__()
        self.body = body
        self.leave = nn.Linear(body.square_dim, body.square_dim)
        self.reach = nn.Linear(body.square_dim, body.square_dim)
        self.scale = body.square_dim**-0.5

    def forward(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        squares = self.body.squares(tokens, marks, context)
        return (self.leave(squares) @ self.reach(squares).transpose(1, 2)).flatten(1) * self.scale


# What the layers that read a game's positions in order are, unless a run's ``over`` block says otherwise.
OVER = {"depth": 2, "heads": 4}


def build_net(
    config: dict[str, Any],
    *,
    marks: int,
    context: int,
    outputs: int = 1,
    squares: bool = False,
    steps: int | None = None,
    most: int = 0,
    moves: bool = False,
) -> BoardNet | MoveNet:
    """The network a run's ``learner`` block describes, under the head its task asks for.

    With ``steps`` a row is a sequence of up to ``most`` positions, each with that many numbers of its own:
    the body named reads each position with them, under a ``GameBody`` that reads the row's ``context``.
    With ``moves`` the head gives every pair of squares a logit (``MoveNet``).
    """
    shared = {
        "marks": marks,
        "context": context if steps is None else steps,
        "dim": int(config["dim"]),
        "depth": int(config["depth"]),
        "dropout": float(config.get("dropout", 0.0)),
    }
    if config["body"] == "transformer":
        body = SquareTransformer(
            heads=int(config["heads"]),
            geometry=bool(config.get("geometry", True)),
            attacks=bool(config.get("attacks", False)),
            **shared,
        )
    elif config["body"] == "conv":
        body = SquareConv(squeeze=int(config.get("squeeze", 0)), **shared)
    elif config["body"] == "hybrid":
        body = SquareHybrid(heads=int(config["heads"]), convs=int(config["convs"]), **shared)
    else:
        raise ValueError(f"no body named {config['body']!r}: the lab has transformer, conv and hybrid")
    if steps is not None:
        if squares or moves:
            raise ValueError(f"a row that is a sequence of positions has no head a {'move' if moves else 'square'}")
        over = {**OVER, **config.get("over", {})}
        body = GameBody(
            body, context=context, depth=int(over["depth"]), heads=int(over["heads"]), dropout=shared["dropout"], most=most
        )
    if moves:
        return MoveNet(body)
    return BoardNet(body, outputs=outputs, squares=squares)


def parameter_count(model: nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters())
