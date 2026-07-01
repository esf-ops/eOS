"""FastAPI server for local countertop visualization."""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .engine import parse_points_string, render_countertop_from_bytes, save_bgr

ROOT = Path(__file__).resolve().parent.parent
SLABS_DIR = ROOT / "slabs"
SAMPLES_DIR = ROOT / "samples"
UPLOADS_DIR = ROOT / "uploads"
OUTPUTS_DIR = ROOT / "outputs"

for directory in (SLABS_DIR, SAMPLES_DIR, UPLOADS_DIR, OUTPUTS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="eliteOS Countertop Visualizer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5190", "http://127.0.0.1:5190"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/files/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
app.mount("/files/slabs", StaticFiles(directory=str(SLABS_DIR)), name="slabs")
app.mount("/files/samples", StaticFiles(directory=str(SAMPLES_DIR)), name="samples")


def _list_slab_catalog() -> List[Dict]:
    catalog: List[Dict] = []
    for path in sorted(SLABS_DIR.glob("*")):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        catalog.append(
            {
                "id": path.stem,
                "name": path.stem.replace("-", " ").title(),
                "filename": path.name,
                "url": f"/files/slabs/{path.name}",
            }
        )
    return catalog


def _resolve_slab_bytes(slab_id: Optional[str], slab_upload: Optional[UploadFile]) -> bytes:
    if slab_upload is not None:
        data = slab_upload.file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Uploaded slab image is empty")
        return data

    if not slab_id:
        raise HTTPException(status_code=400, detail="Provide slab image upload or slab_id")

    slab_path = SLABS_DIR / f"{slab_id}.jpg"
    if not slab_path.exists():
        for ext in (".jpeg", ".png", ".webp"):
            candidate = SLABS_DIR / f"{slab_id}{ext}"
            if candidate.exists():
                slab_path = candidate
                break

    if not slab_path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown slab_id: {slab_id}")

    return slab_path.read_bytes()


def _parse_points(points: str) -> List[Tuple[float, float]]:
    try:
        parsed = json.loads(points)
        if isinstance(parsed, list) and len(parsed) == 4:
            return [(float(p[0]), float(p[1])) for p in parsed]
    except json.JSONDecodeError:
        pass

    try:
        return parse_points_string(points)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "countertop-visualizer"}


@app.get("/api/slabs")
def list_slabs() -> dict:
    return {"slabs": _list_slab_catalog()}


@app.post("/api/render")
async def render_countertop(
    kitchen_image: UploadFile = File(...),
    points: str = Form(...),
    slab_image: Optional[UploadFile] = File(None),
    slab_id: Optional[str] = Form(None),
) -> JSONResponse:
    kitchen_bytes = await kitchen_image.read()
    if not kitchen_bytes:
        raise HTTPException(status_code=400, detail="Kitchen image is empty")

    point_list = _parse_points(points)
    slab_bytes = _resolve_slab_bytes(slab_id, slab_image)

    try:
        result = render_countertop_from_bytes(kitchen_bytes, slab_bytes, point_list)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    render_id = f"{stamp}_{uuid.uuid4().hex[:8]}"
    output_name = f"{render_id}.jpg"
    output_path = OUTPUTS_DIR / output_name
    save_bgr(result, output_path)

    upload_name = f"{render_id}_kitchen.jpg"
    (UPLOADS_DIR / upload_name).write_bytes(kitchen_bytes)

    return JSONResponse(
        {
            "render_id": render_id,
            "output_url": f"/files/outputs/{output_name}",
            "output_filename": output_name,
            "disclaimer": (
                "Concept visualization only. Not an estimate, measurement, layout, "
                "inventory reservation, or production drawing."
            ),
        }
    )


@app.get("/api/render/{render_id}")
def get_render(render_id: str) -> FileResponse:
    for ext in (".jpg", ".jpeg", ".png"):
        path = OUTPUTS_DIR / f"{render_id}{ext}"
        if path.exists():
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="Render not found")
