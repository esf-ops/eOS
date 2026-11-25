import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeSlabImage,
  areaSqFtFromContour,
  buildEdgeLabels,
  nearestEdgeInsert,
  simplifyPolyline,
  type Point,
} from "../lib/slabOutline";

export type PieceGeometry = {
  outline_px: [number, number][] | null;
  image_width_px: number | null;
  image_height_px: number | null;
  px_per_in: number | null;
  area_sqft: number | null;
  usable_long_in: number | null;
  usable_short_in: number | null;
  fit_frontier_in: [number, number][] | null;
  is_rectangular: boolean | null;
  swatch_url?: string | null;
};

type Props = {
  imageUrl: string;
  lengthIn: number | null;
  widthIn: number | null;
  geometry?: PieceGeometry | null;
  title?: string;
  onClose: () => void;
};

/** Stored outline (derived server-side from this photo) mapped onto the loaded image's pixels. */
function outlineFromGeometry(geometry: PieceGeometry | null | undefined, naturalW: number, naturalH: number) {
  if (!geometry?.outline_px?.length || !geometry.image_width_px || !geometry.image_height_px || !geometry.px_per_in) {
    return null;
  }
  const sx = naturalW / geometry.image_width_px;
  const sy = naturalH / geometry.image_height_px;
  if (Math.abs(sx - sy) > 0.02) return null;
  return {
    contour: geometry.outline_px.map(([x, y]) => ({ x: x * sx, y: y * sy })),
    inchesPerPixel: 1 / (geometry.px_per_in * sx),
  };
}

type Mode = "auto" | "edit";
type EditTool = "move" | "add";

function fmtIn(n: number) {
  return `${Math.round(n * 10) / 10}"`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hitPoint(contour: Point[], x: number, y: number, radius: number) {
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i];
    if (Math.hypot(p.x - x, p.y - y) <= radius) return i;
  }
  return -1;
}

export default function MeasureView({ imageUrl, lengthIn, widthIn, geometry, title, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const viewScaleRef = useRef(1);
  const dragRef = useRef<{ index: number } | null>(null);

  const [mode, setMode] = useState<Mode>("auto");
  const [editTool, setEditTool] = useState<EditTool>("move");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contour, setContour] = useState<Point[]>([]);
  const [inchesPerPixel, setInchesPerPixel] = useState(1 / 30);
  const [areaSqFt, setAreaSqFt] = useState<number | null>(null);

  const paint = useCallback(
    (nextContour: Point[], ipp: number, editMode: boolean, tool: EditTool) => {
      const canvas = canvasRef.current;
      const image = imgRef.current;
      if (!canvas || !image) return;

      const parent = canvas.parentElement;
      const maxW = parent?.clientWidth || 900;
      const maxH = Math.min(window.innerHeight * 0.7, 700);
      const nw = image.naturalWidth || image.width;
      const nh = image.naturalHeight || image.height;
      const scale = Math.min(maxW / nw, maxH / nh, 1.5);
      viewScaleRef.current = scale;
      const cw = Math.max(1, Math.round(nw * scale));
      const ch = Math.max(1, Math.round(nh * scale));
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(image, 0, 0, cw, ch);

      const scaled = nextContour.map((p) => ({ x: p.x * scale, y: p.y * scale }));
      const edges = buildEdgeLabels(nextContour, ipp, 0.5).map((e) => ({
        ...e,
        mid: { x: e.mid.x * scale, y: e.mid.y * scale },
      }));

      ctx.beginPath();
      scaled.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(30, 76, 146, 0.92)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "rgba(163, 19, 47, 0.08)";
      ctx.fill();

      ctx.font = '600 13px "DM Sans", system-ui, sans-serif';
      for (const edge of edges) {
        const label = fmtIn(edge.lengthIn);
        const tw = ctx.measureText(label).width;
        const padX = 8;
        const bx = edge.mid.x + edge.outward.x * 16 - (tw + padX * 2) / 2;
        const by = edge.mid.y + edge.outward.y * 16 - 10;
        ctx.fillStyle = "rgba(11, 26, 51, 0.9)";
        roundRect(ctx, bx, by, tw + padX * 2, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(label, bx + padX, by + 14);
      }

      if (editMode) {
        // Edge midpoints as add targets
        for (let i = 0; i < scaled.length; i++) {
          const a = scaled[i];
          const b = scaled[(i + 1) % scaled.length];
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.beginPath();
          ctx.arc(mx, my, tool === "add" ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = tool === "add" ? "#0c6e3a" : "rgba(30, 76, 146, 0.35)";
          ctx.fill();
          if (tool === "add") {
            ctx.fillStyle = "#fff";
            ctx.font = "700 11px DM Sans, system-ui, sans-serif";
            ctx.fillText("+", mx - 3.5, my + 3.5);
          }
        }

        for (const p of scaled) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#f59e0b";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      setAreaSqFt(areaSqFtFromContour(nextContour, ipp));
    },
    []
  );

  const runAuto = useCallback(() => {
    const image = imgRef.current;
    if (!image) return;
    const stored = outlineFromGeometry(geometry, image.naturalWidth, image.naturalHeight);
    if (stored) {
      setContour(stored.contour);
      setInchesPerPixel(stored.inchesPerPixel);
      paint(stored.contour, stored.inchesPerPixel, false, "move");
      return;
    }
    const analyzed = analyzeSlabImage(image, { lengthIn, widthIn });
    // Keep enough vertices for irregular remnants (not forced to 4).
    const epsilon = Math.max(4, Math.min(image.naturalWidth, image.naturalHeight) * 0.006);
    let pts = simplifyPolyline(analyzed.contour, epsilon);
    if (pts.length < 4) pts = analyzed.contour;
    // Cap runaway outlines but allow complex shapes (L / notches).
    if (pts.length > 24) {
      pts = simplifyPolyline(pts, epsilon * 2);
    }
    setContour(pts);
    setInchesPerPixel(analyzed.inchesPerPixel);
    paint(pts, analyzed.inchesPerPixel, false, "move");
  }, [lengthIn, widthIn, geometry, paint]);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    setLoading(true);
    setError(null);
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      try {
        runAuto();
        setMode("auto");
        setEditTool("move");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      setError("Could not load slab photo for measure (CORS or missing image).");
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl, runAuto]);

  useEffect(() => {
    if (!contour.length || !imgRef.current) return;
    paint(contour, inchesPerPixel, mode === "edit", editTool);
  }, [mode, editTool, contour, inchesPerPixel, paint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (mode === "edit" && (e.key === "a" || e.key === "A")) setEditTool("add");
      if (mode === "edit" && (e.key === "v" || e.key === "V")) setEditTool("move");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, mode]);

  function canvasToImage(clientX: number, clientY: number): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * canvas.width;
    const sy = ((clientY - rect.top) / rect.height) * canvas.height;
    const scale = viewScaleRef.current || 1;
    return { x: sx / scale, y: sy / scale };
  }

  function insertOnEdge(pt: Point) {
    const maxDist = 18 / (viewScaleRef.current || 1);
    const hit = nearestEdgeInsert(contour, pt, maxDist);
    if (!hit) return false;
    const next = contour.slice();
    next.splice(hit.edgeIndex + 1, 0, hit.point);
    setContour(next);
    return true;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "edit") return;
    const pt = canvasToImage(e.clientX, e.clientY);
    if (!pt) return;
    const hitR = 14 / (viewScaleRef.current || 1);

    if (editTool === "add") {
      if (insertOnEdge(pt)) return;
      return;
    }

    const idx = hitPoint(contour, pt.x, pt.y, hitR);
    if (idx >= 0) {
      dragRef.current = { index: idx };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Move tool: double-click / alt-click still adds on an edge.
    if (e.detail >= 2 || e.altKey) {
      insertOnEdge(pt);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "edit" || !dragRef.current) return;
    const pt = canvasToImage(e.clientX, e.clientY);
    if (!pt) return;
    const next = contour.slice();
    next[dragRef.current.index] = pt;
    setContour(next);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    if (mode !== "edit") return;
    e.preventDefault();
    if (contour.length <= 3) return;
    const pt = canvasToImage(e.clientX, e.clientY);
    if (!pt) return;
    const hitR = 14 / (viewScaleRef.current || 1);
    const idx = hitPoint(contour, pt.x, pt.y, hitR);
    if (idx >= 0) {
      setContour(contour.filter((_, i) => i !== idx));
    }
  }

  return (
    <div className="li-measure-backdrop" role="presentation" onClick={onClose}>
      <div
        className="li-measure"
        role="dialog"
        aria-modal="true"
        aria-label={title ? `Measure ${title}` : "Measure slab"}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="li-measure-bar">
          <div className="li-measure-modes" role="group" aria-label="Measure mode">
            <button
              type="button"
              className={mode === "auto" ? "active" : ""}
              onClick={() => {
                setMode("auto");
                setEditTool("move");
                runAuto();
              }}
            >
              Auto
            </button>
            <button
              type="button"
              className={mode === "edit" ? "active" : ""}
              onClick={() => {
                setMode("edit");
                setEditTool("move");
              }}
            >
              Edit
            </button>
          </div>
          {mode === "edit" ? (
            <div className="li-measure-modes" role="group" aria-label="Edit tool">
              <button
                type="button"
                className={editTool === "move" ? "active" : ""}
                onClick={() => setEditTool("move")}
              >
                Move
              </button>
              <button
                type="button"
                className={editTool === "add" ? "active" : ""}
                onClick={() => setEditTool("add")}
              >
                Add point
              </button>
            </div>
          ) : null}
          <div className="li-measure-meta" aria-live="polite">
            <span className="li-measure-points">{contour.length} pts</span>
            {geometry?.usable_long_in && geometry.usable_short_in && !geometry.is_rectangular ? (
              <span className="li-measure-points">
                Largest usable {fmtIn(geometry.usable_long_in)} × {fmtIn(geometry.usable_short_in)}
              </span>
            ) : null}
            <span className="li-measure-area">
              Area: <strong>{areaSqFt != null ? `${areaSqFt} ft²` : "—"}</strong>
            </span>
          </div>
          <button type="button" className="li-measure-close" onClick={onClose} aria-label="Close measure">
            ×
          </button>
        </header>
        <div className="li-measure-stage">
          {loading ? <p className="li-muted">Tracing outline…</p> : null}
          {error ? <p className="li-error">{error}</p> : null}
          <canvas
            ref={canvasRef}
            className={mode === "edit" ? (editTool === "add" ? "adding" : "editing") : ""}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={onContextMenu}
          />
        </div>
        <p className="li-measure-note">
          {mode === "edit"
            ? editTool === "add"
              ? "Click a green + on an edge (or anywhere along an edge) to add a vertex. Switch to Move to drag corners. Right-click a point to remove."
              : "Drag orange handles to adjust. Use Add point for custom shapes (5+ sides). Right-click a point to remove."
            : geometry?.outline_px?.length
              ? "Outline measured from this piece's photo at true scale. Switch to Edit to adjust or add points."
              : "Auto traces the photo. Switch to Edit → Add point for custom remnant shapes."}
        </p>
      </div>
    </div>
  );
}
