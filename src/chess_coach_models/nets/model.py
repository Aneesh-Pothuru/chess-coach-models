"""The networks that read a board.

Every network is a body and a head. A body turns the 64 square tokens, their
marks and the context numbers into one vector for the board and one for each
square; the head turns the board's vector into the task's output, or for a
task that asks about every square each square's vector into that square's.
Two bodies ship, so a leaderboard can say what the architecture is worth on a
task:

- ``transformer``: each square is a token and every square attends to every
  other from the first layer. A learned bias per head for each offset between
  two squares (how many files and ranks apart) tells attention about the
  board's geometry: files, ranks, diagonals and knight hops are offsets. The
  context numbers enter as one more token.
- ``conv``: a residual tower of 3x3 convolutions over the 8x8 board, the kind
  of network the first AlphaZero-style engines used, which sees further only
  as it gets deeper.
"""

from __future__ import annotations

from typing import Any

import torch
import torch.nn.functional as F
from torch import nn

from ..encode.board import TOKENS


class Block(nn.Module):
    """A pre-norm transformer layer whose attention between squares is biased by their offset."""

    def __init__(self, dim: int, heads: int, dropout: float):
        super().__init__()
        self.heads = heads
        self.dropout = dropout
        self.norm_attention = nn.LayerNorm(dim)
        self.qkv = nn.Linear(dim, 3 * dim)
        self.project = nn.Linear(dim, dim)
        self.offset_bias = nn.Parameter(torch.zeros(heads, 15 * 15))
        self.norm_mlp = nn.LayerNorm(dim)
        self.mlp = nn.Sequential(nn.Linear(dim, 4 * dim), nn.GELU(), nn.Linear(4 * dim, dim))
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, offsets: torch.Tensor) -> torch.Tensor:
        batch, length, dim = x.shape
        q, k, v = (
            self.qkv(self.norm_attention(x))
            .view(batch, length, 3, self.heads, dim // self.heads)
            .permute(2, 0, 3, 1, 4)
        )
        bias = q.new_zeros(self.heads, length, length)
        bias[:, 1:, 1:] = self.offset_bias[:, offsets].to(bias.dtype)
        attended = F.scaled_dot_product_attention(
            q, k, v, attn_mask=bias, dropout_p=self.dropout if self.training else 0.0
        )
        x = x + self.drop(self.project(attended.transpose(1, 2).reshape(batch, length, dim)))
        return x + self.drop(self.mlp(self.norm_mlp(x)))


class SquareTransformer(nn.Module):
    def __init__(self, *, marks: int, context: int, dim: int, depth: int, heads: int, dropout: float):
        super().__init__()
        self.piece = nn.Embedding(TOKENS, dim)
        self.place = nn.Parameter(torch.zeros(64, dim))
        self.mark = nn.Linear(marks, dim, bias=False)
        self.context = nn.Sequential(nn.Linear(context, dim), nn.GELU(), nn.Linear(dim, dim))
        self.blocks = nn.ModuleList(Block(dim, heads, dropout) for _ in range(depth))
        self.norm = nn.LayerNorm(dim)
        self.out_dim = 2 * dim
        self.square_dim = dim
        files = torch.arange(64) % 8
        ranks = torch.arange(64) // 8
        offsets = (files[:, None] - files[None, :] + 7) * 15 + (ranks[:, None] - ranks[None, :] + 7)
        self.register_buffer("offsets", offsets, persistent=False)
        nn.init.normal_(self.place, std=0.02)

    def encode(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """The context token and the 64 squares after the last layer, ``[batch, 65, dim]``."""
        squares = self.piece(tokens) + self.place + self.mark(marks)
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


class Residual(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.first = nn.Conv2d(dim, dim, 3, padding=1, bias=False)
        self.first_norm = nn.BatchNorm2d(dim)
        self.second = nn.Conv2d(dim, dim, 3, padding=1, bias=False)
        self.second_norm = nn.BatchNorm2d(dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = F.relu(self.first_norm(self.first(x)))
        return F.relu(x + self.second_norm(self.second(y)))


class SquareConv(nn.Module):
    def __init__(self, *, marks: int, context: int, dim: int, depth: int, dropout: float):
        super().__init__()
        self.stem = nn.Conv2d(TOKENS + marks, dim, 3, padding=1)
        self.context = nn.Linear(context, dim)
        self.blocks = nn.ModuleList(Residual(dim) for _ in range(depth))
        self.drop = nn.Dropout(dropout)
        self.out_dim = 2 * dim
        self.square_dim = dim

    def tower(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """The board after the last block, ``[batch, dim, 8, 8]``."""
        planes = torch.cat([F.one_hot(tokens, TOKENS).to(marks.dtype), marks], dim=-1)
        x = planes.transpose(1, 2).reshape(len(tokens), -1, 8, 8)
        x = F.relu(self.stem(x) + self.context(context)[:, :, None, None])
        for block in self.blocks:
            x = block(x)
        return x

    def forward(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        x = self.tower(tokens, marks, context)
        return self.drop(torch.cat([x.mean(dim=(2, 3)), x.amax(dim=(2, 3))], dim=-1))

    def squares(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """One vector a square, ``[batch, 64, square_dim]``."""
        return self.drop(self.tower(tokens, marks, context).flatten(2).transpose(1, 2))


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

    def forward(self, tokens: torch.Tensor, marks: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        read = self.body.squares if self.per_square else self.body
        output = self.head(read(tokens, marks, context))
        return output.squeeze(-1) if self.single else output


def build_net(
    config: dict[str, Any], *, marks: int, context: int, outputs: int = 1, squares: bool = False
) -> BoardNet:
    """The network a run's ``learner`` block describes, under the head its task asks for."""
    shared = {
        "marks": marks,
        "context": context,
        "dim": int(config["dim"]),
        "depth": int(config["depth"]),
        "dropout": float(config.get("dropout", 0.0)),
    }
    if config["body"] == "transformer":
        return BoardNet(SquareTransformer(heads=int(config["heads"]), **shared), outputs=outputs, squares=squares)
    if config["body"] == "conv":
        return BoardNet(SquareConv(**shared), outputs=outputs, squares=squares)
    raise ValueError(f"no body named {config['body']!r}: the lab has transformer and conv")


def parameter_count(model: nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters())
