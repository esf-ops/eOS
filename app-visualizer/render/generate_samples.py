#!/usr/bin/env python3
"""Generate placeholder sample images for the visualizer MVP."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "samples"
SLABS = ROOT / "slabs"


def make_kitchen_sample(path: Path, width: int = 1280, height: int = 720) -> None:
    img = Image.new("RGB", (width, height), "#d8d4cc")
    draw = ImageDraw.Draw(img)

    # Back wall
    draw.rectangle([0, 0, width, int(height * 0.45)], fill="#ece8e0")

    # Upper cabinets
    for x in range(40, width - 40, 220):
        draw.rectangle([x, 40, x + 180, int(height * 0.28)], fill="#f5f3ef", outline="#c9c3b8", width=2)
        draw.line([x + 90, 40, x + 90, int(height * 0.28)], fill="#c9c3b8", width=2)

    # Backsplash
    draw.rectangle([0, int(height * 0.45), width, int(height * 0.58)], fill="#f0ebe3")

    # Countertop (target surface)
    counter_y0 = int(height * 0.58)
    counter_y1 = int(height * 0.72)
    draw.polygon(
        [
            (80, counter_y0),
            (width - 80, counter_y0),
            (width - 40, counter_y1),
            (40, counter_y1),
        ],
        fill="#b8b2a8",
        outline="#8f887d",
    )

    # Lower cabinets
    draw.rectangle([40, counter_y1, width - 40, height - 40], fill="#ebe6de", outline="#c9c3b8", width=2)
    draw.line([width // 2, counter_y1, width // 2, height - 40], fill="#c9c3b8", width=2)

    # Sink cutout hint
    sink_x = int(width * 0.55)
    draw.ellipse([sink_x, counter_y0 + 20, sink_x + 220, counter_y1 - 10], fill="#9a948a", outline="#7a746b")

    # Window light gradient on counter
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for i in range(counter_y0, counter_y1):
        alpha = int(35 * (1 - (i - counter_y0) / max(counter_y1 - counter_y0, 1)))
        odraw.line([(80, i), (width - 80, i)], fill=(255, 255, 255, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, quality=92)


def make_slab_texture(path: Path, base: tuple[int, int, int], vein: tuple[int, int, int], size: int = 512) -> None:
    rng = np.random.default_rng(42)
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    arr[:, :] = base

    for _ in range(18):
        y = int(rng.integers(0, size))
        thickness = int(rng.integers(2, 8))
        x_shift = int(rng.integers(-40, 40))
        for x in range(size):
            yy = min(max(y + int(thickness * np.sin((x + x_shift) / 28)), 0), size - 1)
            arr[yy : yy + thickness, x] = vein

    img = Image.fromarray(arr)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, quality=92)


def main() -> None:
    make_kitchen_sample(SAMPLES / "kitchen.jpg")
    make_slab_texture(SLABS / "sample.jpg", base=(235, 230, 222), vein=(190, 182, 170))
    make_slab_texture(SLABS / "warm-gray.jpg", base=(168, 160, 150), vein=(120, 112, 104))
    make_slab_texture(SLABS / "charcoal-vein.jpg", base=(72, 70, 68), vein=(130, 128, 126))
    print(f"Generated samples in {SAMPLES} and slabs in {SLABS}")


if __name__ == "__main__":
    main()
