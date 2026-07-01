"""Local countertop texture rendering using OpenCV, Pillow, and NumPy."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
from PIL import Image


Point = tuple[float, float]


def _load_bgr(path: str | Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Could not load image: {path}")
    return img


def _load_bgr_from_bytes(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    return img


def _edge_length(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _quad_dimensions(points: Sequence[Point]) -> tuple[int, int]:
    if len(points) != 4:
        raise ValueError("Exactly 4 polygon points are required")

    p0, p1, p2, p3 = points
    width = max(_edge_length(p0, p1), _edge_length(p3, p2))
    height = max(_edge_length(p0, p3), _edge_length(p1, p2))
    return max(int(round(width)), 1), max(int(round(height)), 1)


def tile_texture(texture_bgr: np.ndarray, width: int, height: int) -> np.ndarray:
    """Repeat slab texture to cover width x height."""
    th, tw = texture_bgr.shape[:2]
    if th == 0 or tw == 0:
        raise ValueError("Slab texture has zero dimensions")

    cols = int(math.ceil(width / tw))
    rows = int(math.ceil(height / th))
    tiled = np.tile(texture_bgr, (rows, cols, 1))
    return tiled[:height, :width].copy()


def _polygon_mask(shape: tuple[int, int], points: Sequence[Point]) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    pts = np.array(points, dtype=np.int32).reshape((-1, 1, 2))
    cv2.fillConvexPoly(mask, pts, 255)
    return mask


def _preserve_luminance(original_bgr: np.ndarray, texture_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Replace chrominance with slab texture while keeping photo lighting from the original."""
    original_lab = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    texture_lab = cv2.cvtColor(texture_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

    blended_lab = texture_lab.copy()
    blended_lab[:, :, 0] = original_lab[:, :, 0]

    blended_bgr = cv2.cvtColor(blended_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    mask_f = (mask.astype(np.float32) / 255.0)[:, :, np.newaxis]
    return (original_bgr.astype(np.float32) * (1.0 - mask_f) + blended_bgr.astype(np.float32) * mask_f).astype(
        np.uint8
    )


def render_countertop(
    kitchen_bgr: np.ndarray,
    slab_bgr: np.ndarray,
    points: Sequence[Point],
) -> np.ndarray:
    """
    Warp tiled slab texture into a 4-point countertop polygon and composite
    onto the kitchen photo while preserving original luminance (shadows/highlights).
    """
    if len(points) != 4:
        raise ValueError("Exactly 4 polygon points are required")

    dst = np.array(points, dtype=np.float32)
    tex_w, tex_h = _quad_dimensions(points)
    tiled = tile_texture(slab_bgr, tex_w, tex_h)

    src = np.array(
        [[0, 0], [tex_w - 1, 0], [tex_w - 1, tex_h - 1], [0, tex_h - 1]],
        dtype=np.float32,
    )

    h, w = kitchen_bgr.shape[:2]
    matrix = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(tiled, matrix, (w, h), flags=cv2.INTER_LINEAR)

    mask = _polygon_mask((h, w), points)
    return _preserve_luminance(kitchen_bgr, warped, mask)


def render_countertop_from_paths(
    kitchen_path: str | Path,
    slab_path: str | Path,
    points: Sequence[Point],
) -> np.ndarray:
    kitchen = _load_bgr(kitchen_path)
    slab = _load_bgr(slab_path)
    return render_countertop(kitchen, slab, points)


def render_countertop_from_bytes(
    kitchen_bytes: bytes,
    slab_bytes: bytes,
    points: Sequence[Point],
) -> np.ndarray:
    kitchen = _load_bgr_from_bytes(kitchen_bytes)
    slab = _load_bgr_from_bytes(slab_bytes)
    return render_countertop(kitchen, slab, points)


def save_bgr(image_bgr: np.ndarray, output_path: str | Path, quality: int = 92) -> Path:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    suffix = out.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        pil.save(out, format="JPEG", quality=quality, optimize=True)
    elif suffix == ".png":
        pil.save(out, format="PNG", optimize=True)
    else:
        pil.save(out)
    return out


def encode_jpeg(image_bgr: np.ndarray, quality: int = 92) -> bytes:
    ok, buf = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Failed to encode JPEG")
    return buf.tobytes()


def parse_points_string(raw: str) -> list[Point]:
    """Parse 'x1,y1 x2,y2 x3,y3 x4,y4' into point tuples."""
    parts = raw.strip().split()
    if len(parts) != 4:
        raise ValueError('Expected 4 points in format "x1,y1 x2,y2 x3,y3 x4,y4"')

    points: list[Point] = []
    for part in parts:
        xy = part.split(",")
        if len(xy) != 2:
            raise ValueError(f"Invalid point: {part}")
        points.append((float(xy[0]), float(xy[1])))
    return points
