import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listElite100TextureAssets,
  type Elite100TextureAsset,
} from "./lib/elite100TextureAssets";

type NormPoint = { nx: number; ny: number };
type TextureRenderMode = "cover" | "repeat";

type MaskSettings = {
  textureSlug: string;
  opacity: number;
  textureMode: TextureRenderMode;
  textureScale: number;
  textureRotation: number;
};

export type VisualizerMask = {
  id: string;
  label: string;
  points: NormPoint[];
} & MaskSettings;

type SceneInput = {
  photo: HTMLImageElement;
  masks: VisualizerMask[];
  textureImages: Map<string, HTMLImageElement>;
  draftPoints: NormPoint[];
  isDrawing: boolean;
  activeMaskId: string | null;
  showMaskOutlines: boolean;
};

const RENDER_TEXTURE_CACHE = new Map<string, HTMLImageElement>();
const COVER_SCALE_DEFAULT = 1;
const REPEAT_SCALE_DEFAULT = 0.55;
const LABEL_PRESETS = ["Countertop 1", "Countertop 2", "Island", "Backsplash"];

function defaultLabelForIndex(index: number): string {
  if (index < LABEL_PRESETS.length) return LABEL_PRESETS[index]!;
  return `Countertop ${index + 1}`;
}

function defaultMaskSettings(textures: readonly Elite100TextureAsset[]): MaskSettings {
  return {
    textureSlug: textures[0]?.slug ?? "",
    opacity: 0.82,
    textureMode: "cover",
    textureScale: COVER_SCALE_DEFAULT,
    textureRotation: 0,
  };
}

function maskToSettings(mask: VisualizerMask): MaskSettings {
  return {
    textureSlug: mask.textureSlug,
    opacity: mask.opacity,
    textureMode: mask.textureMode,
    textureScale: mask.textureScale,
    textureRotation: mask.textureRotation,
  };
}

function pickerImageUrl(texture: Elite100TextureAsset): string {
  return texture.thumbUrl;
}

function renderTextureUrl(texture: Elite100TextureAsset): string {
  return texture.fullUrl;
}

function textureUrlForSlug(
  textures: readonly Elite100TextureAsset[],
  slug: string,
): string | null {
  const asset = textures.find((t) => t.slug === slug);
  return asset ? renderTextureUrl(asset) : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function loadRenderTexture(url: string): Promise<HTMLImageElement> {
  const cached = RENDER_TEXTURE_CACHE.get(url);
  if (cached) return cached;
  const img = await loadImage(url);
  RENDER_TEXTURE_CACHE.set(url, img);
  return img;
}

function configureCanvasContext(ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

function toPixelPoints(points: NormPoint[], width: number, height: number) {
  return points.map((p) => ({ x: p.nx * width, y: p.ny * height }));
}

function polygonCentroid(points: { x: number; y: number }[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function polygonBounds(points: { x: number; y: number }[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function clipToPolygon(ctx: CanvasRenderingContext2D, pixelPoints: { x: number; y: number }[]) {
  ctx.beginPath();
  pixelPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.clip();
}

function drawCoverTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLImageElement,
  pixelPoints: { x: number; y: number }[],
  opacity: number,
  scale: number,
  rotationDeg: number,
) {
  const bounds = polygonBounds(pixelPoints);
  const centerX = bounds.minX + bounds.w / 2;
  const centerY = bounds.minY + bounds.h / 2;
  const texW = texture.naturalWidth;
  const texH = texture.naturalHeight;
  if (texW < 1 || texH < 1) return;

  const coverScale = Math.max(bounds.w / texW, bounds.h / texH) * scale;
  const drawW = texW * coverScale;
  const drawH = texH * coverScale;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(centerX, centerY);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(texture, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawRepeatTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLImageElement,
  pixelPoints: { x: number; y: number }[],
  canvasW: number,
  canvasH: number,
  opacity: number,
  scale: number,
  rotationDeg: number,
) {
  const bounds = polygonBounds(pixelPoints);
  const center = polygonCentroid(pixelPoints);
  const texW = texture.naturalWidth;
  const texH = texture.naturalHeight;
  if (texW < 1 || texH < 1) return;

  const aspect = texH / texW;
  const base = Math.max(canvasW, canvasH) * scale;
  const tileW = Math.max(48, base);
  const tileH = Math.max(48, tileW * aspect);
  const coverW = Math.max(bounds.w, canvasW) * 1.75;
  const coverH = Math.max(bounds.h, canvasH) * 1.75;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(center.x, center.y);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-center.x, -center.y);

  for (let y = center.y - coverH; y < center.y + coverH; y += tileH) {
    for (let x = center.x - coverW; x < center.x + coverW; x += tileW) {
      ctx.drawImage(texture, x, y, tileW, tileH);
    }
  }
  ctx.restore();
}

function drawMaskedTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: NormPoint[],
  texture: HTMLImageElement,
  settings: MaskSettings,
) {
  if (points.length < 3) return;
  const pixelPoints = toPixelPoints(points, width, height);
  ctx.save();
  clipToPolygon(ctx, pixelPoints);

  if (settings.textureMode === "cover") {
    drawCoverTexture(
      ctx,
      texture,
      pixelPoints,
      settings.opacity,
      settings.textureScale,
      settings.textureRotation,
    );
  } else {
    drawRepeatTexture(
      ctx,
      texture,
      pixelPoints,
      width,
      height,
      settings.opacity,
      settings.textureScale,
      settings.textureRotation,
    );
  }
  ctx.restore();
}

function drawPolygonOutline(
  ctx: CanvasRenderingContext2D,
  points: NormPoint[],
  width: number,
  height: number,
  opts: { active: boolean; closed: boolean; label?: string },
) {
  const pixelPoints = toPixelPoints(points, width, height);
  if (pixelPoints.length === 0) return;

  ctx.save();
  ctx.strokeStyle = opts.active ? "rgba(163, 19, 47, 0.95)" : "rgba(15, 23, 42, 0.45)";
  ctx.lineWidth = opts.active ? Math.max(2, width / 500) : Math.max(1.5, width / 700);
  ctx.setLineDash(opts.closed ? [] : [8, 6]);
  ctx.beginPath();
  pixelPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  if (opts.closed && pixelPoints.length >= 3) ctx.closePath();
  ctx.stroke();

  const r = opts.active ? Math.max(4, width / 180) : Math.max(3, width / 220);
  pixelPoints.forEach((p) => {
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = opts.active ? "rgba(163, 19, 47, 0.95)" : "rgba(15, 23, 42, 0.5)";
    ctx.lineWidth = opts.active ? 2 : 1.5;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  if (opts.label && pixelPoints.length >= 3) {
    const center = polygonCentroid(pixelPoints);
    const fontSize = Math.max(11, width / 55);
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeText(opts.label, center.x, center.y);
    ctx.fillText(opts.label, center.x, center.y);
  }
  ctx.restore();
}

function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: SceneInput,
) {
  configureCanvasContext(ctx);
  const {
    photo,
    masks,
    textureImages,
    draftPoints,
    isDrawing,
    activeMaskId,
    showMaskOutlines,
  } = input;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(photo, 0, 0, width, height);

  for (const mask of masks) {
    const texture = textureImages.get(mask.textureSlug);
    if (texture) {
      drawMaskedTexture(ctx, width, height, mask.points, texture, mask);
    }
  }

  if (showMaskOutlines) {
    for (const mask of masks) {
      const isActive = mask.id === activeMaskId && !isDrawing;
      drawPolygonOutline(ctx, mask.points, width, height, {
        active: isActive,
        closed: true,
        label: isActive ? mask.label : undefined,
      });
    }
  }

  if (isDrawing && draftPoints.length > 0) {
    drawPolygonOutline(ctx, draftPoints, width, height, {
      active: true,
      closed: false,
    });
  }
}

function fitCanvasSize(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
) {
  const ratio = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return {
    width: Math.max(1, Math.round(naturalW * ratio)),
    height: Math.max(1, Math.round(naturalH * ratio)),
  };
}

export function MaterialPhotoVisualizer() {
  const textures = useMemo(() => listElite100TextureAssets(), []);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [masks, setMasks] = useState<VisualizerMask[]>([]);
  const [activeMaskId, setActiveMaskId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<NormPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [defaultSettings, setDefaultSettings] = useState<MaskSettings>(() => defaultMaskSettings(textures));
  const [textureImages, setTextureImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [textureLoadError, setTextureLoadError] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const activeMask = useMemo(
    () => masks.find((mask) => mask.id === activeMaskId) ?? null,
    [masks, activeMaskId],
  );

  const controlSettings = useMemo(() => {
    if (activeMask && !isDrawing) return maskToSettings(activeMask);
    return defaultSettings;
  }, [activeMask, isDrawing, defaultSettings]);

  const neededTextureSlugs = useMemo(() => {
    const slugs = new Set(masks.map((mask) => mask.textureSlug));
    slugs.add(defaultSettings.textureSlug);
    return [...slugs].filter(Boolean);
  }, [masks, defaultSettings.textureSlug]);

  const scaleConfig = useMemo(() => {
    if (controlSettings.textureMode === "cover") {
      return { min: 0.5, max: 2.5, step: 0.01, label: "Zoom" };
    }
    return { min: 0.25, max: 1.5, step: 0.01, label: "Tile size" };
  }, [controlSettings.textureMode]);

  const draftLabel = useMemo(
    () => defaultLabelForIndex(masks.length),
    [masks.length],
  );

  const statusHint = useMemo(() => {
    if (!photoImage) return "Upload a kitchen photo to begin.";
    if (isDrawing) {
      if (draftPoints.length === 0) return `Drawing ${draftLabel}. Click around the surface to mark points.`;
      if (draftPoints.length < 3) return `Drawing ${draftLabel}. Add at least 3 points, then complete the mask.`;
      return `Drawing ${draftLabel}. Complete the mask or add more points.`;
    }
    if (masks.length === 0) return "Click Add mask to mark your first countertop zone.";
    if (activeMask) return `Select material and blend for ${activeMask.label}, or add another mask.`;
    return `${masks.length} mask${masks.length !== 1 ? "s" : ""} completed. Select a mask to adjust material and blend.`;
  }, [photoImage, isDrawing, draftPoints.length, draftLabel, masks.length, activeMask]);

  const applySettings = useCallback((patch: Partial<MaskSettings>) => {
    if (isDrawing || !activeMaskId) {
      setDefaultSettings((prev) => ({ ...prev, ...patch }));
      return;
    }
    setMasks((prev) => prev.map((mask) => (
      mask.id === activeMaskId ? { ...mask, ...patch } : mask
    )));
  }, [isDrawing, activeMaskId]);

  const revokePhotoUrl = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  const resetMaskState = useCallback(() => {
    setMasks([]);
    setActiveMaskId(null);
    setDraftPoints([]);
    setIsDrawing(true);
    setDefaultSettings(defaultMaskSettings(textures));
  }, [textures]);

  const handleUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file (JPEG, PNG, etc.).");
      return;
    }
    setPhotoError(null);
    resetMaskState();
    const nextUrl = URL.createObjectURL(file);
    setPhotoUrl((prev) => {
      revokePhotoUrl(prev);
      return nextUrl;
    });
    try {
      const img = await loadImage(nextUrl);
      setPhotoImage(img);
    } catch {
      setPhotoError("Could not load that image. Try a different file.");
      setPhotoImage(null);
      revokePhotoUrl(nextUrl);
      setPhotoUrl(null);
    }
  }, [revokePhotoUrl, resetMaskState]);

  useEffect(() => () => {
    revokePhotoUrl(photoUrl);
  }, [photoUrl, revokePhotoUrl]);

  useEffect(() => {
    if (neededTextureSlugs.length === 0) {
      setTextureImages(new Map());
      return;
    }

    let alive = true;
    setTextureLoadError(null);

    Promise.all(
      neededTextureSlugs.map(async (slug) => {
        const url = textureUrlForSlug(textures, slug);
        if (!url) return [slug, null] as const;
        try {
          const img = await loadRenderTexture(url);
          return [slug, img] as const;
        } catch {
          return [slug, null] as const;
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      const next = new Map<string, HTMLImageElement>();
      const failed: string[] = [];
      for (const [slug, img] of entries) {
        if (img) next.set(slug, img);
        else failed.push(slug);
      }
      setTextureImages(next);
      if (failed.length > 0) {
        setTextureLoadError("Some full-resolution textures could not be loaded.");
      }
    });

    return () => { alive = false; };
  }, [neededTextureSlugs, textures]);

  useEffect(() => {
    if (!photoImage || !workspaceRef.current) return;
    const workspace = workspaceRef.current;

    const updateSize = () => {
      const maxW = Math.max(280, workspace.clientWidth - 2);
      const maxH = Math.max(240, Math.min(720, window.innerHeight * 0.58));
      setCanvasSize(fitCanvasSize(photoImage.naturalWidth, photoImage.naturalHeight, maxW, maxH));
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(workspace);
    return () => ro.disconnect();
  }, [photoImage]);

  const buildSceneInput = useCallback((): SceneInput | null => {
    if (!photoImage) return null;
    return {
      photo: photoImage,
      masks,
      textureImages,
      draftPoints,
      isDrawing,
      activeMaskId,
      showMaskOutlines: isDrawing || activeMaskId !== null,
    };
  }, [photoImage, masks, textureImages, draftPoints, isDrawing, activeMaskId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photoImage || canvasSize.width < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const input = buildSceneInput();
    if (!input) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logicalW = canvasSize.width;
    const logicalH = canvasSize.height;

    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, logicalW, logicalH, input);
  }, [photoImage, canvasSize, buildSceneInput]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!photoImage || !isDrawing || canvasSize.width < 1) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * canvasSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvasSize.height;
    setDraftPoints((prev) => [
      ...prev,
      { nx: x / canvasSize.width, ny: y / canvasSize.height },
    ]);
  }, [photoImage, isDrawing, canvasSize]);

  const completeMask = useCallback(() => {
    if (draftPoints.length < 3) return;
    const newMask: VisualizerMask = {
      id: crypto.randomUUID(),
      label: draftLabel,
      points: draftPoints,
      ...defaultSettings,
    };
    setMasks((prev) => [...prev, newMask]);
    setActiveMaskId(newMask.id);
    setDraftPoints([]);
    setIsDrawing(false);
  }, [draftPoints, draftLabel, defaultSettings]);

  const startAnotherMask = useCallback(() => {
    if (activeMask && !isDrawing) {
      setDefaultSettings(maskToSettings(activeMask));
    }
    setIsDrawing(true);
    setDraftPoints([]);
    setActiveMaskId(null);
  }, [activeMask, isDrawing]);

  const undoLastPoint = useCallback(() => {
    setDraftPoints((prev) => prev.slice(0, -1));
  }, []);

  const deleteSelectedMask = useCallback(() => {
    if (!activeMaskId) return;
    setMasks((prev) => {
      const next = prev.filter((mask) => mask.id !== activeMaskId);
      setActiveMaskId(next[next.length - 1]?.id ?? null);
      return next;
    });
    setIsDrawing(false);
    setDraftPoints([]);
  }, [activeMaskId]);

  const clearAllMasks = useCallback(() => {
    setMasks([]);
    setActiveMaskId(null);
    setDraftPoints([]);
    setIsDrawing(true);
  }, []);

  const updateMaskLabel = useCallback((maskId: string, label: string) => {
    setMasks((prev) => prev.map((mask) => (
      mask.id === maskId ? { ...mask, label } : mask
    )));
  }, []);

  const selectMask = useCallback((maskId: string) => {
    setActiveMaskId(maskId);
    setIsDrawing(false);
    setDraftPoints([]);
  }, []);

  const handleTextureModeChange = useCallback((mode: TextureRenderMode) => {
    applySettings({
      textureMode: mode,
      textureScale: mode === "cover" ? COVER_SCALE_DEFAULT : REPEAT_SCALE_DEFAULT,
    });
  }, [applySettings]);

  const downloadPreview = useCallback(() => {
    if (!photoImage || masks.length === 0) return;
    const oc = document.createElement("canvas");
    oc.width = photoImage.naturalWidth;
    oc.height = photoImage.naturalHeight;
    const ctx = oc.getContext("2d");
    if (!ctx) return;

    renderScene(ctx, oc.width, oc.height, {
      photo: photoImage,
      masks,
      textureImages,
      draftPoints: [],
      isDrawing: false,
      activeMaskId: null,
      showMaskOutlines: false,
    });

    const link = document.createElement("a");
    link.download = "countertop-visualizer-preview.jpg";
    link.href = oc.toDataURL("image/jpeg", 0.92);
    link.click();
  }, [photoImage, masks, textureImages]);

  const controlsEnabled = Boolean(photoImage && (isDrawing || activeMaskId));
  const canComplete = isDrawing && draftPoints.length >= 3;
  const canUndo = isDrawing && draftPoints.length > 0;
  const canAddAnother = photoImage && !isDrawing;
  const canDeleteSelected = Boolean(activeMaskId && !isDrawing);
  const canClearAll = masks.length > 0 || draftPoints.length > 0 || isDrawing;
  const canDownload = masks.length > 0 && masks.every((mask) => textureImages.has(mask.textureSlug));

  return (
    <div className="pv-page">
      <header className="pv-header">
        <div className="pv-header-text">
          <p className="pv-eyebrow">Internal prototype</p>
          <h2 className="pv-title">Photo Visualizer</h2>
          <p className="pv-sub">
            Mark countertop zones in a kitchen photo and preview mapped Elite 100 stone textures. All processing stays in your browser.
          </p>
        </div>
        <div className="pv-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="btn primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload photo
          </button>
        </div>
      </header>

      {photoError ? <div className="banner banner-error pv-banner" role="alert">{photoError}</div> : null}
      {textureLoadError ? <div className="banner banner-warn pv-banner" role="status">{textureLoadError}</div> : null}

      <p className="pv-status" role="status">{statusHint}</p>

      <div className="pv-layout">
        <div className="pv-workspace-wrap">
          <div className="pv-workspace" ref={workspaceRef}>
            {!photoImage ? (
              <div className="pv-empty">
                <div className="pv-empty-art" aria-hidden>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.4" />
                    <path d="M21 16l-5.2-5.2a1.6 1.6 0 0 0-2.2 0L9 14.6 7.5 13" />
                  </svg>
                </div>
                <p className="pv-empty-title">Upload a kitchen photo to begin.</p>
                <p className="pv-empty-sub">JPEG or PNG from your computer. Nothing is uploaded to a server.</p>
                <button type="button" className="btn secondary" onClick={() => fileInputRef.current?.click()}>
                  Choose image
                </button>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className={`pv-canvas${isDrawing ? " drawing" : ""}`}
                onClick={handleCanvasClick}
                role="img"
                aria-label="Kitchen photo visualizer canvas"
              />
            )}
          </div>
        </div>

        <aside className="pv-controls" aria-label="Visualizer controls">
          <section className="pv-panel">
            <h3 className="pv-panel-title">Masks</h3>
            <div className="pv-btn-row">
              <button type="button" className="btn secondary btn-sm" disabled={!canComplete} onClick={completeMask}>
                Complete mask
              </button>
              <button type="button" className="btn secondary btn-sm" disabled={!canUndo} onClick={undoLastPoint}>
                Undo last point
              </button>
            </div>
            <div className="pv-btn-row">
              <button type="button" className="btn secondary btn-sm" disabled={!canAddAnother} onClick={startAnotherMask}>
                Add another mask
              </button>
              <button type="button" className="btn secondary btn-sm" disabled={!canDeleteSelected} onClick={deleteSelectedMask}>
                Delete selected
              </button>
            </div>
            <button type="button" className="btn secondary btn-sm pv-clear-all" disabled={!canClearAll} onClick={clearAllMasks}>
              Clear all masks
            </button>
            {masks.length > 0 ? (
              <ul className="pv-mask-list" aria-label="Completed masks">
                {masks.map((mask) => {
                  const texture = textures.find((t) => t.slug === mask.textureSlug);
                  const isActive = mask.id === activeMaskId && !isDrawing;
                  return (
                    <li key={mask.id}>
                      <button
                        type="button"
                        className={`pv-mask-card${isActive ? " active" : ""}`}
                        onClick={() => selectMask(mask.id)}
                      >
                        <span className="pv-mask-card-label">{mask.label}</span>
                        <span className="pv-mask-card-meta">{texture?.colorName ?? "Texture"}</span>
                      </button>
                      {isActive ? (
                        <label className="pv-mask-rename">
                          <span className="sr-only">Rename {mask.label}</span>
                          <input
                            type="text"
                            value={mask.label}
                            onChange={(e) => updateMaskLabel(mask.id, e.target.value)}
                            aria-label={`Rename ${mask.label}`}
                          />
                        </label>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="pv-panel-hint">No completed masks yet.</p>
            )}
          </section>

          <section className="pv-panel">
            <h3 className="pv-panel-title">Elite 100 texture</h3>
            <p className="pv-panel-hint">
              {isDrawing
                ? "New masks inherit the texture selected below."
                : activeMask
                  ? `Applies to ${activeMask.label}.`
                  : "Select a mask or start drawing to choose a texture."}
            </p>
            <div className="pv-texture-grid" role="listbox" aria-label="Elite 100 textures">
              {textures.map((texture) => (
                <TexturePickerButton
                  key={texture.slug}
                  texture={texture}
                  selected={controlSettings.textureSlug === texture.slug}
                  disabled={!controlsEnabled}
                  onSelect={() => applySettings({ textureSlug: texture.slug })}
                />
              ))}
            </div>
          </section>

          <section className="pv-panel">
            <h3 className="pv-panel-title">Blend</h3>
            <div className="pv-mode-row" role="group" aria-label="Texture mode">
              <button
                type="button"
                className={`pv-mode-btn${controlSettings.textureMode === "cover" ? " active" : ""}`}
                disabled={!controlsEnabled}
                onClick={() => handleTextureModeChange("cover")}
              >
                Cover surface
              </button>
              <button
                type="button"
                className={`pv-mode-btn${controlSettings.textureMode === "repeat" ? " active" : ""}`}
                disabled={!controlsEnabled}
                onClick={() => handleTextureModeChange("repeat")}
              >
                Repeat texture
              </button>
            </div>
            <label className="pv-slider">
              <span>Opacity</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.01}
                value={controlSettings.opacity}
                disabled={!controlsEnabled}
                onChange={(e) => applySettings({ opacity: Number(e.target.value) })}
              />
              <span className="pv-slider-val">{Math.round(controlSettings.opacity * 100)}%</span>
            </label>
            <label className="pv-slider">
              <span>{scaleConfig.label}</span>
              <input
                type="range"
                min={scaleConfig.min}
                max={scaleConfig.max}
                step={scaleConfig.step}
                value={controlSettings.textureScale}
                disabled={!controlsEnabled}
                onChange={(e) => applySettings({ textureScale: Number(e.target.value) })}
              />
              <span className="pv-slider-val">{controlSettings.textureScale.toFixed(2)}×</span>
            </label>
            <label className="pv-slider">
              <span>Rotation</span>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={controlSettings.textureRotation}
                disabled={!controlsEnabled}
                onChange={(e) => applySettings({ textureRotation: Number(e.target.value) })}
              />
              <span className="pv-slider-val">{controlSettings.textureRotation}°</span>
            </label>
          </section>

          <section className="pv-panel">
            <button
              type="button"
              className="btn primary"
              disabled={!canDownload}
              onClick={downloadPreview}
            >
              Download preview
            </button>
            <p className="pv-panel-hint">Exports all masks at full photo resolution.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TexturePickerButton({
  texture,
  selected,
  disabled,
  onSelect,
}: {
  texture: Elite100TextureAsset;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`pv-texture-btn${selected ? " selected" : ""}`}
      disabled={disabled}
      onClick={onSelect}
      title={texture.colorName}
    >
      {thumbFailed ? (
        <span className="pv-texture-fallback" aria-hidden>{texture.colorName.slice(0, 2)}</span>
      ) : (
        <img
          src={pickerImageUrl(texture)}
          alt=""
          loading="lazy"
          onError={() => setThumbFailed(true)}
        />
      )}
      <span className="pv-texture-name">{texture.colorName}</span>
    </button>
  );
}
