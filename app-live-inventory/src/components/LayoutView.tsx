import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { PieceGeometry } from "./MeasureView";
import {
  autoPlace,
  largestOffcut,
  layoutUsage,
  pieceRect,
  polygonAreaIn2,
  polygonBounds,
  snap,
  validateLayout,
  type LayoutPiece,
  type PieceStatus,
  type Pt,
  type Rect,
} from "../lib/layout";
import { analyzeSlabImage, simplifyPolyline } from "../lib/slabOutline";

type Props = {
  imageUrl: string;
  lengthIn: number | null | undefined;
  widthIn: number | null | undefined;
  geometry?: PieceGeometry | null;
  title: string;
  subtitle?: string;
  job?: { lengthIn: number; widthIn: number } | null;
  onClose: () => void;
};

/** Stone outline in inches plus the image→inch scale. */
type Stone = { poly: Pt[]; ipp: number; areaIn2: number; boundsPx: Rect };
/** Viewport: image-px crop origin and css px per image px. */
type View = { ox: number; oy: number; s: number; cw: number; ch: number };

const SPACING_OPTIONS = [
  { value: 0, label: "None" },
  { value: 0.125, label: "⅛″" },
  { value: 0.25, label: "¼″" },
  { value: 0.5, label: "½″" },
];
const TRIM_OPTIONS = [
  { value: 0, label: "None" },
  { value: 0.5, label: "½″" },
  { value: 1, label: "1″" },
];
const MAGNET_IN = 1.5;

function fmtIn(n: number) {
  const r = Math.round(n * 8) / 8;
  const whole = Math.floor(r);
  const frac = r - whole;
  const fracs: Record<string, string> = { "0.125": "⅛", "0.25": "¼", "0.375": "⅜", "0.5": "½", "0.625": "⅝", "0.75": "¾", "0.875": "⅞" };
  return `${whole || (frac ? "" : "0")}${fracs[String(frac)] || ""}″`;
}

function fmtSqft(n: number) {
  return `${n >= 100 ? Math.round(n) : Math.round(n * 10) / 10} ft²`;
}

function stoneFromImage(img: HTMLImageElement, geometry: PieceGeometry | null | undefined, lengthIn?: number | null, widthIn?: number | null): Stone {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  let pxPoly: Pt[] | null = null;
  let ipp = 0;
  if (geometry?.outline_px?.length && geometry.image_width_px && geometry.image_height_px && geometry.px_per_in) {
    const sx = nw / geometry.image_width_px;
    const sy = nh / geometry.image_height_px;
    if (Math.abs(sx - sy) <= 0.02) {
      pxPoly = geometry.outline_px.map(([x, y]) => ({ x: x * sx, y: y * sy }));
      ipp = 1 / (geometry.px_per_in * sx);
    }
  }
  if (!pxPoly) {
    const analyzed = analyzeSlabImage(img, { lengthIn: lengthIn ?? null, widthIn: widthIn ?? null });
    const eps = Math.max(4, Math.min(nw, nh) * 0.006);
    pxPoly = simplifyPolyline(analyzed.contour, eps);
    if (pxPoly.length < 4) pxPoly = analyzed.contour;
    ipp = analyzed.inchesPerPixel;
  }
  const poly = pxPoly.map((p) => ({ x: p.x * ipp, y: p.y * ipp }));
  return { poly, ipp, areaIn2: polygonAreaIn2(poly), boundsPx: polygonBounds(pxPoly) };
}

function computeView(img: HTMLImageElement, stone: Stone, maxW: number, maxH: number): View {
  const b = stone.boundsPx;
  const pad = Math.max(b.w, b.h) * 0.035;
  const ox = Math.max(0, b.x - pad);
  const oy = Math.max(0, b.y - pad);
  const w = Math.min(img.naturalWidth, b.x + b.w + pad) - ox;
  const h = Math.min(img.naturalHeight, b.y + b.h + pad) - oy;
  const s = Math.min(maxW / w, maxH / h);
  return { ox, oy, s, cw: Math.round(w * s), ch: Math.round(h * s) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

type DrawOpts = {
  pieces: LayoutPiece[];
  status: Map<string, PieceStatus>;
  selectedId: string | null;
  previewCut: boolean;
  offcut: Rect | null;
  showScale: boolean;
};

/** Paints the slab crop + layout into `ctx`, where `k` is canvas px per image px. */
function drawLayout(ctx: CanvasRenderingContext2D, img: HTMLImageElement, stone: Stone, view: View, k: number, opts: DrawOpts) {
  const { ox, oy } = view;
  const toC = (inX: number, inY: number) => ({ x: (inX / stone.ipp - ox) * k, y: (inY / stone.ipp - oy) * k });
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, ox, oy, W / k, H / k, 0, 0, W, H);

  const rects = opts.pieces.map((p) => {
    const r = pieceRect(p);
    const a = toC(r.x, r.y);
    return { p, x: a.x, y: a.y, w: (r.w / stone.ipp) * k, h: (r.h / stone.ipp) * k };
  });

  if (opts.previewCut && rects.length) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (const r of rects) ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(11, 18, 32, 0.62)";
    ctx.fill("evenodd");
    ctx.restore();
  }

  // Stone outline.
  ctx.beginPath();
  stone.poly.forEach((p, i) => {
    const c = toC(p.x, p.y);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.closePath();
  ctx.setLineDash([6 * (k / view.s), 5 * (k / view.s)]);
  ctx.strokeStyle = "rgba(30, 76, 146, 0.55)";
  ctx.lineWidth = 1.5 * (k / view.s);
  ctx.stroke();
  ctx.setLineDash([]);

  const u = k / view.s; // css px → canvas px
  if (opts.offcut && opts.offcut.w >= 6 && opts.offcut.h >= 6) {
    const a = toC(opts.offcut.x, opts.offcut.y);
    const w = (opts.offcut.w / stone.ipp) * k;
    const h = (opts.offcut.h / stone.ipp) * k;
    ctx.save();
    ctx.setLineDash([4 * u, 4 * u]);
    ctx.strokeStyle = "rgba(12, 110, 58, 0.9)";
    ctx.lineWidth = 1.5 * u;
    ctx.fillStyle = "rgba(12, 110, 58, 0.08)";
    ctx.fillRect(a.x, a.y, w, h);
    ctx.strokeRect(a.x, a.y, w, h);
    ctx.setLineDash([]);
    const text = `Offcut ${fmtIn(opts.offcut.w)} × ${fmtIn(opts.offcut.h)}`;
    ctx.font = `600 ${11 * u}px "DM Sans", system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    if (tw + 16 * u < w && 24 * u < h) {
      ctx.fillStyle = "rgba(12, 110, 58, 0.92)";
      roundRect(ctx, a.x + 6 * u, a.y + 6 * u, tw + 12 * u, 18 * u, 9 * u);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(text, a.x + 12 * u, a.y + 19 * u);
    }
    ctx.restore();
  }

  for (const r of rects) {
    const st = opts.status.get(r.p.id);
    const bad = st ? !st.ok : false;
    const selected = opts.selectedId === r.p.id;
    if (!opts.previewCut) {
      ctx.fillStyle = bad ? "rgba(220, 38, 38, 0.22)" : "rgba(255, 255, 255, 0.16)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    } else if (bad) {
      ctx.fillStyle = "rgba(220, 38, 38, 0.25)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = "rgba(11, 18, 32, 0.75)";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = (selected ? 2.5 : 1.75) * u;
    ctx.strokeStyle = bad ? "#ef4444" : selected ? "#ffd166" : "#ffffff";
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    const name = r.p.label || "Piece";
    const dims = `${fmtIn(r.p.lengthIn)} × ${fmtIn(r.p.widthIn)}`;
    ctx.font = `700 ${12 * u}px "DM Sans", system-ui, sans-serif`;
    const nameW = ctx.measureText(name).width;
    ctx.font = `600 ${11 * u}px "DM Sans", system-ui, sans-serif`;
    const dimsW = ctx.measureText(dims).width;
    const roomy = r.w > Math.max(nameW, dimsW) + 20 * u && r.h > 44 * u;
    const pillW = (roomy ? Math.max(nameW, dimsW) : dimsW) + 16 * u;
    const pillH = (roomy ? 36 : 20) * u;
    if (r.w > pillW + 4 * u && r.h > pillH + 4 * u) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      ctx.fillStyle = bad ? "rgba(185, 28, 28, 0.92)" : "rgba(11, 18, 32, 0.82)";
      roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 8 * u);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      if (roomy) {
        ctx.font = `700 ${12 * u}px "DM Sans", system-ui, sans-serif`;
        ctx.fillText(name, cx, cy - 3 * u);
        ctx.font = `600 ${11 * u}px "DM Sans", system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(dims, cx, cy + 12 * u);
      } else {
        ctx.fillText(dims, cx, cy + 4 * u);
      }
      ctx.textAlign = "start";
    }
  }

  if (opts.showScale) {
    const footPx = (12 / stone.ipp) * k;
    const x0 = 14 * u;
    const y0 = H - 16 * u;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundRect(ctx, x0 - 8 * u, y0 - 22 * u, footPx + 16 * u, 32 * u, 8 * u);
    ctx.fill();
    ctx.strokeStyle = "#0b1220";
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 4 * u);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + footPx, y0);
    ctx.lineTo(x0 + footPx, y0 - 4 * u);
    ctx.stroke();
    ctx.fillStyle = "#0b1220";
    ctx.font = `700 ${10 * u}px "DM Sans", system-ui, sans-serif`;
    ctx.fillText("1 ft", x0, y0 - 9 * u);
  }
}

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function LayoutView({ imageUrl, lengthIn, widthIn, geometry, title, subtitle, job, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const [stone, setStone] = useState<Stone | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pieces, setPieces] = useState<LayoutPiece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spacingIn, setSpacingIn] = useState(0.25);
  const [edgeTrimIn, setEdgeTrimIn] = useState(0);
  const [previewCut, setPreviewCut] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", length: "", width: "" });

  const rules = useMemo(() => ({ spacingIn, edgeTrimIn }), [spacingIn, edgeTrimIn]);
  const status = useMemo(
    () => (stone ? validateLayout(pieces, stone.poly, rules) : new Map<string, PieceStatus>()),
    [pieces, stone, rules]
  );
  const deferredPieces = useDeferredValue(pieces);
  const offcut = useMemo(
    () => (stone ? largestOffcut(deferredPieces, stone.poly, { ...rules, cellIn: 1 }) : null),
    [deferredPieces, stone, rules]
  );
  const usage = stone ? layoutUsage(pieces, stone.areaIn2) : null;
  const problems = pieces.filter((p) => status.get(p.id)?.ok === false).length;

  // Load photo → stone outline → seed with the job piece.
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
        const s = stoneFromImage(img, geometry, lengthIn, widthIn);
        setStone(s);
        if (job) {
          const seed: LayoutPiece = { id: newId(), label: "Piece 1", lengthIn: job.lengthIn, widthIn: job.widthIn, x: 0, y: 0, rotated: false };
          const placed = autoPlace(seed, [], s.poly, { spacingIn: 0.25, edgeTrimIn: 0 });
          const b = polygonBounds(s.poly);
          setPieces([placed || { ...seed, x: b.x, y: b.y }]);
          setSelectedId(seed.id);
          if (!placed) setNote(`${fmtIn(job.lengthIn)} × ${fmtIn(job.widthIn)} doesn't fit on this piece.`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      setError("Could not load this piece's photo.");
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
    // Seed once per photo; job/geometry changes while open shouldn't reset the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Fit the viewport to the stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !stone || !imgRef.current) return;
    const fit = () => {
      const img = imgRef.current;
      if (!img) return;
      const maxW = Math.max(240, stage.clientWidth - 24);
      const maxH = Math.max(240, Math.min(window.innerHeight * 0.68, 760));
      setView(computeView(img, stone, maxW, maxH));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stone]);

  // Paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !stone || !view) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.cw * dpr);
    canvas.height = Math.round(view.ch * dpr);
    canvas.style.width = `${view.cw}px`;
    canvas.style.height = `${view.ch}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawLayout(ctx, img, stone, view, view.s * dpr, {
      pieces,
      status,
      selectedId,
      previewCut,
      offcut,
      showScale: true,
    });
  }, [stone, view, pieces, status, selectedId, previewCut, offcut]);

  const toInches = useCallback(
    (clientX: number, clientY: number): Pt | null => {
      const canvas = canvasRef.current;
      if (!canvas || !stone || !view) return null;
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) / view.s + view.ox;
      const py = (clientY - rect.top) / view.s + view.oy;
      return { x: px * stone.ipp, y: py * stone.ipp };
    },
    [stone, view]
  );

  function updatePiece(id: string, patch: Partial<LayoutPiece>) {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function rotatePiece(id: string) {
    setPieces((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const r = pieceRect(p);
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        return { ...p, rotated: !p.rotated, x: snap(cx - r.h / 2), y: snap(cy - r.w / 2) };
      })
    );
  }

  function removePiece(id: string) {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function addPiece(e: React.FormEvent) {
    e.preventDefault();
    if (!stone) return;
    const L = Number.parseFloat(draft.length);
    const Wd = Number.parseFloat(draft.width);
    if (!(L > 0 && Wd > 0)) {
      setNote("Enter a length and width in inches.");
      return;
    }
    const seed: LayoutPiece = {
      id: newId(),
      label: draft.label.trim() || `Piece ${pieces.length + 1}`,
      lengthIn: Math.max(L, Wd),
      widthIn: Math.min(L, Wd),
      x: 0,
      y: 0,
      rotated: false,
    };
    const placed = autoPlace(seed, pieces, stone.poly, rules);
    const b = polygonBounds(stone.poly);
    setPieces((prev) => [...prev, placed || { ...seed, x: b.x, y: b.y }]);
    setSelectedId(seed.id);
    setNote(placed ? null : `${seed.label} doesn't fit in the free stone — it's marked red. Try Auto-arrange or rotate.`);
    setDraft({ label: "", length: "", width: "" });
  }

  function autoArrange() {
    if (!stone || !pieces.length) return;
    const order = [...pieces].sort((a, b) => b.lengthIn * b.widthIn - a.lengthIn * a.widthIn);
    const placed: LayoutPiece[] = [];
    const misses: string[] = [];
    const b = polygonBounds(stone.poly);
    for (const p of order) {
      const at = autoPlace({ ...p, rotated: false }, placed, stone.poly, rules);
      if (at) placed.push(at);
      else {
        misses.push(p.label);
        placed.push({ ...p, x: b.x, y: b.y });
      }
    }
    const byId = new Map(placed.map((p) => [p.id, p]));
    setPieces(pieces.map((p) => byId.get(p.id) || p));
    setNote(misses.length ? `Couldn't fit ${misses.join(", ")} on this piece.` : "Arranged — biggest pieces first.");
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const pt = toInches(e.clientX, e.clientY);
    if (!pt) return;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const r = pieceRect(pieces[i]);
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
        setSelectedId(pieces[i].id);
        dragRef.current = { id: pieces[i].id, dx: pt.x - r.x, dy: pt.y - r.y, moved: false };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        return;
      }
    }
    setSelectedId(null);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || !stone) return;
    const pt = toInches(e.clientX, e.clientY);
    if (!pt) return;
    const piece = pieces.find((p) => p.id === drag.id);
    if (!piece) return;
    const { w, h } = pieceRect(piece);
    let x = pt.x - drag.dx;
    let y = pt.y - drag.dy;
    // Magnet to the stone edge (inside the trim) and to neighbours (kerf apart or aligned).
    const b = polygonBounds(stone.poly);
    const xs = [b.x + edgeTrimIn, b.x + b.w - edgeTrimIn - w];
    const ys = [b.y + edgeTrimIn, b.y + b.h - edgeTrimIn - h];
    for (const o of pieces) {
      if (o.id === piece.id) continue;
      const r = pieceRect(o);
      xs.push(r.x + r.w + spacingIn, r.x - w - spacingIn, r.x, r.x + r.w - w);
      ys.push(r.y + r.h + spacingIn, r.y - h - spacingIn, r.y, r.y + r.h - h);
    }
    const pull = (v: number, lines: number[]) => {
      let best = snap(v);
      let bd = MAGNET_IN;
      for (const l of lines) {
        const d = Math.abs(l - v);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      return best;
    };
    x = pull(x, xs);
    y = pull(y, ys);
    drag.moved = true;
    updatePiece(piece.id, { x, y });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !selectedId) return;
      const step = e.shiftKey ? 1 : 0.25;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        setPieces((prev) => prev.map((p) => (p.id === selectedId ? { ...p, x: p.x + dx, y: p.y + dy } : p)));
      } else if (e.key === "r" || e.key === "R") {
        rotatePiece(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removePiece(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selectedId]);

  function exportPng() {
    const img = imgRef.current;
    if (!img || !stone || !view) return;
    const k = Math.min(2, 2400 / (view.cw / view.s));
    const pw = Math.round((view.cw / view.s) * k);
    const ph = Math.round((view.ch / view.s) * k);
    const footer = Math.round(96 * Math.max(1, pw / 1400));
    const canvas = document.createElement("canvas");
    canvas.width = pw;
    canvas.height = ph + footer;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sub = document.createElement("canvas");
    sub.width = pw;
    sub.height = ph;
    const sctx = sub.getContext("2d");
    if (!sctx) return;
    drawLayout(sctx, img, stone, view, k, { pieces, status, selectedId: null, previewCut, offcut, showScale: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sub, 0, 0);
    const f = footer / 96;
    ctx.fillStyle = "#0b1220";
    ctx.font = `700 ${22 * f}px "Instrument Sans", "DM Sans", system-ui, sans-serif`;
    ctx.fillText(title, 24 * f, ph + 36 * f);
    ctx.font = `500 ${15 * f}px "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#4a5568";
    const u = layoutUsage(pieces, stone.areaIn2);
    const line = [
      subtitle,
      `${pieces.length} piece${pieces.length === 1 ? "" : "s"} · ${fmtSqft(u.usedSqft)} of ${fmtSqft(u.stoneSqft)} (${Math.round(u.pct)}%)`,
      offcut ? `largest offcut ${fmtIn(offcut.w)} × ${fmtIn(offcut.h)}` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    ctx.fillText(line, 24 * f, ph + 64 * f);
    ctx.font = `500 ${12 * f}px "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#8a94a6";
    ctx.textAlign = "right";
    ctx.fillText(`eliteOS Live Inventory · ${new Date().toLocaleDateString()}`, pw - 24 * f, ph + 64 * f);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/[^\w.-]+/g, "-")}-layout.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }

  const statusText = (p: LayoutPiece) => {
    const st = status.get(p.id);
    if (!st || st.ok) return null;
    const reasons: string[] = [];
    if (!st.inside) reasons.push(edgeTrimIn ? "Off the stone or inside the edge trim" : "Off the stone");
    if (st.overlaps.length) {
      const names = st.overlaps.map((id) => pieces.find((q) => q.id === id)?.label || "another piece");
      reasons.push(`${spacingIn ? "Too close to" : "Overlaps"} ${names.join(", ")}`);
    }
    return reasons.join(" · ");
  };

  return (
    <div className="li-measure-backdrop" role="presentation" onClick={onClose}>
      <div
        className="li-layout"
        role="dialog"
        aria-modal="true"
        aria-label={`Lay out job on ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="li-layout-head">
          <div>
            <p className="li-kicker">Lay out job</p>
            <h2>{title}</h2>
            {subtitle ? <p className="li-layout-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="li-measure-close" onClick={onClose} aria-label="Close layout">
            ×
          </button>
        </header>

        <div className="li-layout-body">
          <div className="li-layout-stage" ref={stageRef}>
            {loading ? <p className="li-muted">Reading the stone outline…</p> : null}
            {error ? <p className="li-error">{error}</p> : null}
            <canvas
              ref={canvasRef}
              className={dragRef.current ? "dragging" : ""}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={() => selectedId && rotatePiece(selectedId)}
            />
            <p className="li-layout-hint">
              Drag pieces · double-click or R to rotate · arrows nudge ¼″ (Shift 1″) · Delete removes
            </p>
          </div>

          <aside className="li-layout-side">
            {usage ? (
              <section className="li-layout-yield" aria-live="polite">
                <div className="li-layout-gauge" style={{ ["--pct" as string]: `${Math.min(100, usage.pct)}%` }}>
                  <strong>{Math.round(usage.pct)}%</strong>
                  <span>of stone used</span>
                </div>
                <dl>
                  <div>
                    <dt>Pieces</dt>
                    <dd>{fmtSqft(usage.usedSqft)}</dd>
                  </div>
                  <div>
                    <dt>Stone</dt>
                    <dd>{fmtSqft(usage.stoneSqft)}</dd>
                  </div>
                  <div>
                    <dt>Largest offcut</dt>
                    <dd>{offcut ? `${fmtIn(offcut.w)} × ${fmtIn(offcut.h)}` : "—"}</dd>
                  </div>
                </dl>
                <p className={`li-layout-verdict${problems ? " bad" : pieces.length ? " good" : ""}`}>
                  {!pieces.length
                    ? "Add the job's pieces to see how they cut from this stone."
                    : problems
                      ? `${problems} piece${problems === 1 ? "" : "s"} need${problems === 1 ? "s" : ""} attention`
                      : "Every piece fits"}
                </p>
              </section>
            ) : null}

            <form className="li-layout-add" onSubmit={addPiece}>
              <input
                aria-label="Piece name"
                placeholder="Name (e.g. Island)"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              />
              <div className="li-layout-dims">
                <input
                  aria-label="Length in inches"
                  inputMode="decimal"
                  placeholder="L″"
                  value={draft.length}
                  onChange={(e) => setDraft((d) => ({ ...d, length: e.target.value }))}
                />
                <span>×</span>
                <input
                  aria-label="Width in inches"
                  inputMode="decimal"
                  placeholder="W″"
                  value={draft.width}
                  onChange={(e) => setDraft((d) => ({ ...d, width: e.target.value }))}
                />
                <button type="submit" className="li-action primary" disabled={!stone}>
                  Add
                </button>
              </div>
            </form>
            {note ? <p className="li-tool-note">{note}</p> : null}

            <ul className="li-layout-list">
              {pieces.map((p) => {
                const problem = statusText(p);
                return (
                  <li
                    key={p.id}
                    className={`${selectedId === p.id ? "selected" : ""}${problem ? " bad" : ""}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="li-layout-dot" aria-hidden="true" />
                    <div className="li-layout-row">
                      <input
                        aria-label="Piece name"
                        value={p.label}
                        onChange={(e) => updatePiece(p.id, { label: e.target.value })}
                      />
                      <div className="li-layout-dims small">
                        <input
                          aria-label={`${p.label} length`}
                          inputMode="decimal"
                          defaultValue={p.lengthIn}
                          onChange={(e) => {
                            const v = Number.parseFloat(e.target.value);
                            if (v > 0) updatePiece(p.id, { lengthIn: v });
                          }}
                        />
                        <span>×</span>
                        <input
                          aria-label={`${p.label} width`}
                          inputMode="decimal"
                          defaultValue={p.widthIn}
                          onChange={(e) => {
                            const v = Number.parseFloat(e.target.value);
                            if (v > 0) updatePiece(p.id, { widthIn: v });
                          }}
                        />
                      </div>
                      {problem ? <p className="li-layout-problem">{problem}</p> : null}
                    </div>
                    <div className="li-layout-row-actions">
                      <button type="button" onClick={() => rotatePiece(p.id)} aria-label={`Rotate ${p.label}`} title="Rotate 90°">
                        ⟳
                      </button>
                      <button type="button" onClick={() => removePiece(p.id)} aria-label={`Remove ${p.label}`} title="Remove">
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="li-layout-settings">
              <label>
                <span>Saw spacing</span>
                <select
                  value={spacingIn}
                  onChange={(e) => {
                    setSpacingIn(Number(e.target.value));
                    setNote(null);
                  }}
                >
                  {SPACING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Edge trim</span>
                <select
                  value={edgeTrimIn}
                  onChange={(e) => {
                    setEdgeTrimIn(Number(e.target.value));
                    setNote(null);
                  }}
                >
                  {TRIM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="li-layout-toggle">
                <input type="checkbox" checked={previewCut} onChange={(e) => setPreviewCut(e.target.checked)} />
                <span>Preview cut pieces</span>
              </label>
            </div>

            <div className="li-actions">
              <button type="button" className="li-action" onClick={autoArrange} disabled={!pieces.length}>
                Auto-arrange
              </button>
              <button type="button" className="li-action" onClick={exportPng} disabled={!stone}>
                Save image
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
