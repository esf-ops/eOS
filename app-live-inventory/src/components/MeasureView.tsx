import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeSlabImage,
  areaSqFtFromContour,
  buildEdgeLabels,
  simplifyPolyline,
  type Point,
} from "../lib/slabOutline";

type Props = {
  imageUrl: string;
  lengthIn: number | null;
  widthIn: number | null;
  title?: string;
  onClose: () => void;
};

type Mode = "auto" | "edit";

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

function hitEdgeMid(contour: Point[], x: number, y: number, radius: number) {
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (Math.hypot(mx - x, my - y) <= radius) return i;
  }
  return -1;
}

export default function MeasureView({ imageUrl, lengthIn, widthIn, title, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const viewScaleRef = useRef(1);
  const dragRef = useRef<{ index: number } | null>(null);

  const [mode, setMode] = useState<Mode>("auto");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contour, setContour] = useState<Point[]>([]);
  const [inchesPerPixel, setInchesPerPixel] = useState(1 / 30);
  const [areaSqFt, setAreaSqFt] = useState<number | null>(null);

  const paint = useCallback(
    (nextContour: Point[], ipp: number, editMode: boolean) => {
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
      const edges = buildEdgeLabels(nextContour, ipp, 0.8).map((e) => ({
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
        for (const p of scaled) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.strokeStyle = "#1e4c92";
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
    const analyzed = analyzeSlabImage(image, { lengthIn, widthIn });
    // Fewer vertices so Edit is usable.
    const epsilon = Math.max(8, Math.min(image.naturalWidth, image.naturalHeight) * 0.012);
    let pts = simplifyPolyline(analyzed.contour, epsilon);
    if (pts.length < 4) pts = analyzed.contour;
    setContour(pts);
    setInchesPerPixel(analyzed.inchesPerPixel);
    paint(pts, analyzed.inchesPerPixel, false);
  }, [lengthIn, widthIn, paint]);

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
    paint(contour, inchesPerPixel, mode === "edit");
  }, [mode, contour, inchesPerPixel, paint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function canvasToImage(clientX: number, clientY: number): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * canvas.width;
    const sy = ((clientY - rect.top) / rect.height) * canvas.height;
    const scale = viewScaleRef.current || 1;
    return { x: sx / scale, y: sy / scale };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "edit") return;
    const pt = canvasToImage(e.clientX, e.clientY);
    if (!pt) return;
    const hitR = 12 / (viewScaleRef.current || 1);
    const idx = hitPoint(contour, pt.x, pt.y, hitR);
    if (idx >= 0) {
      dragRef.current = { index: idx };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    // Double-click / alt-click on edge midpoint inserts a vertex.
    if (e.detail >= 2 || e.altKey) {
      const edge = hitEdgeMid(contour, pt.x, pt.y, hitR * 1.4);
      if (edge >= 0) {
        const next = contour.slice();
        next.splice(edge + 1, 0, { x: pt.x, y: pt.y });
        setContour(next);
      }
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
                runAuto();
              }}
            >
              Auto
            </button>
            <button type="button" className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>
              Edit
            </button>
          </div>
          <div className="li-measure-area" aria-live="polite">
            Area: <strong>{areaSqFt != null ? `${areaSqFt} ft²` : "—"}</strong>
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
            className={mode === "edit" ? "editing" : ""}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={onContextMenu}
          />
        </div>
        <p className="li-measure-note">
          {mode === "edit"
            ? "Drag handles to adjust. Double-click an edge to add a point. Right-click a point to remove."
            : "Auto traces the photo. Switch to Edit to adjust corners and edges."}
        </p>
      </div>
    </div>
  );
}
