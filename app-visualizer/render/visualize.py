#!/usr/bin/env python3
"""CLI for local countertop visualization."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from .engine import parse_points_string, render_countertop_from_paths, save_bgr
except ImportError:
    from engine import parse_points_string, render_countertop_from_paths, save_bgr


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render countertop slab texture onto a kitchen photo")
    parser.add_argument("--kitchen", required=True, help="Path to kitchen photo")
    parser.add_argument("--slab", required=True, help="Path to slab texture image")
    parser.add_argument(
        "--points",
        required=True,
        help='Four polygon corners as "x1,y1 x2,y2 x3,y3 x4,y4" (image pixel coordinates)',
    )
    parser.add_argument("--output", required=True, help="Output image path")

    args = parser.parse_args(argv)

    kitchen = Path(args.kitchen)
    slab = Path(args.slab)
    output = Path(args.output)

    if not kitchen.exists():
        print(f"Kitchen image not found: {kitchen}", file=sys.stderr)
        return 1
    if not slab.exists():
        print(f"Slab image not found: {slab}", file=sys.stderr)
        return 1

    try:
        points = parse_points_string(args.points)
        result = render_countertop_from_paths(kitchen, slab, points)
        saved = save_bgr(result, output)
    except (ValueError, FileNotFoundError) as exc:
        print(f"Render failed: {exc}", file=sys.stderr)
        return 1

    print(f"Saved visualization to {saved}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
