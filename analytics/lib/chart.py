"""Matplotlib charting helpers for Safe analytics."""

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import pandas as pd

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Envio color palette
COLORS = [
    "#FF5722",  # primary orange
    "#2196F3",  # blue
    "#4CAF50",  # green
    "#9C27B0",  # purple
    "#FF9800",  # amber
    "#00BCD4",  # cyan
    "#E91E63",  # pink
    "#607D8B",  # blue-grey
    "#8BC34A",  # light green
    "#795548",  # brown
]

plt.rcParams.update({
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "axes.grid": True,
    "grid.alpha": 0.3,
    "font.size": 11,
})


def _fmt_number(n):
    """Format large numbers: 1.2M, 345K, etc."""
    if abs(n) >= 1e12:
        return f"{n/1e12:.1f}T"
    if abs(n) >= 1e9:
        return f"{n/1e9:.1f}B"
    if abs(n) >= 1e6:
        return f"{n/1e6:.1f}M"
    if abs(n) >= 1e3:
        return f"{n/1e3:.1f}K"
    return str(int(n))


def _number_formatter(x, _pos):
    return _fmt_number(x)


def _save(fig, filename: str) -> str:
    path = OUTPUT_DIR / filename
    fig.savefig(path, bbox_inches="tight", dpi=150)
    plt.close(fig)
    return str(path)


def time_series(
    df: pd.DataFrame,
    x: str,
    y: str | list[str],
    title: str,
    filename: str,
    ylabel: str = "",
    figsize: tuple = (12, 5),
) -> str:
    """Line chart over time. y can be a single column or list of columns."""
    fig, ax = plt.subplots(figsize=figsize)
    y_cols = [y] if isinstance(y, str) else y
    for i, col in enumerate(y_cols):
        ax.plot(df[x], df[col], color=COLORS[i % len(COLORS)], linewidth=2, label=col, marker="o", markersize=4)
    ax.set_title(title, fontsize=14, fontweight="bold", pad=12)
    ax.set_ylabel(ylabel)
    ax.yaxis.set_major_formatter(ticker.FuncFormatter(_number_formatter))
    if len(y_cols) > 1:
        ax.legend()
    fig.autofmt_xdate()
    return _save(fig, filename)


def bar_chart(
    df: pd.DataFrame,
    x: str,
    y: str,
    title: str,
    filename: str,
    ylabel: str = "",
    horizontal: bool = False,
    figsize: tuple = (12, 6),
    color: str | None = None,
) -> str:
    """Bar chart (vertical or horizontal)."""
    fig, ax = plt.subplots(figsize=figsize)
    bar_color = color or COLORS[0]
    if horizontal:
        ax.barh(df[x], df[y], color=bar_color)
        ax.xaxis.set_major_formatter(ticker.FuncFormatter(_number_formatter))
        ax.set_xlabel(ylabel)
        ax.invert_yaxis()
    else:
        ax.bar(df[x], df[y], color=bar_color)
        ax.yaxis.set_major_formatter(ticker.FuncFormatter(_number_formatter))
        ax.set_ylabel(ylabel)
        fig.autofmt_xdate()
    ax.set_title(title, fontsize=14, fontweight="bold", pad=12)
    return _save(fig, filename)


def stacked_bar(
    df: pd.DataFrame,
    x: str,
    y_cols: list[str],
    title: str,
    filename: str,
    ylabel: str = "",
    figsize: tuple = (12, 6),
) -> str:
    """Stacked bar chart for composition."""
    fig, ax = plt.subplots(figsize=figsize)
    bottom = None
    for i, col in enumerate(y_cols):
        ax.bar(df[x], df[col], bottom=bottom, color=COLORS[i % len(COLORS)], label=col)
        bottom = df[col] if bottom is None else bottom + df[col]
    ax.set_title(title, fontsize=14, fontweight="bold", pad=12)
    ax.set_ylabel(ylabel)
    ax.yaxis.set_major_formatter(ticker.FuncFormatter(_number_formatter))
    ax.legend()
    fig.autofmt_xdate()
    return _save(fig, filename)


def heatmap(
    df: pd.DataFrame,
    x: str,
    y: str,
    value: str,
    title: str,
    filename: str,
    figsize: tuple = (14, 8),
) -> str:
    """Heatmap from long-form data."""
    pivot = df.pivot_table(index=y, columns=x, values=value, aggfunc="sum").fillna(0)
    fig, ax = plt.subplots(figsize=figsize)
    im = ax.imshow(pivot.values, aspect="auto", cmap="YlOrRd")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels(pivot.columns, rotation=45, ha="right")
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(pivot.index)
    ax.set_title(title, fontsize=14, fontweight="bold", pad=12)
    fig.colorbar(im, ax=ax, shrink=0.8)
    return _save(fig, filename)
