import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listElite100TextureAssets,
  type Elite100TextureAsset,
} from "./lib/elite100TextureAssets";

type NormPoint = { nx: number; ny: number };
type TextureRenderMode = "cover" | "repeat";

type RenderInput = {
  photo: HTMLImageElement;
  points: NormPoint[];
  maskClosed: boolean;
  renderTextureImage: HTMLImageElement | null;
  opacity: number;
  scale: number;
  rotationDeg: number;
  textureMode: TextureRenderMode;
  showOutline: boolean;
};

const RENDER_TEXTURE_CACHE = new Map<string, HTMLImageElement>();

/** Picker cards only — never use for canvas overlay or export. */
function pickerImageUrl(texture: Elite100TextureAsset): string {
  return texture.thumbUrl;
}

/** Full-resolution asset for canvas overlay and download export. */
function renderTextureUrl(texture: Elite100TextureAsset): string {
  return texture.fullUrl;
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

/** object-fit: cover over the polygon bounding box — one continuous stone surface. */
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

/** Optional repeat mode — tiles the full-res texture at a larger scale. */
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
  input: Pick<RenderInput, "points" | "renderTextureImage" | "opacity" | "scale" | "rotationDeg" | "textureMode">,
) {
  const { points, renderTextureImage, opacity, scale, rotationDeg, textureMode } = input;
  if (!renderTextureImage || points.length < 3) return;

  const pixelPoints = toPixelPoints(points, width, height);
  ctx.save();
  clipToPolygon(ctx, pixelPoints);

  if (textureMode === "cover") {
    drawCoverTexture(ctx, renderTextureImage, pixelPoints, opacity, scale, rotationDeg);
  } else {
    drawRepeatTexture(
      ctx,
      renderTextureImage,
      pixelPoints,
      width,
      height,
      opacity,
      scale,
      rotationDeg,
    );
  }
  ctx.restore();
}

function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: RenderInput,
) {
  configureCanvasContext(ctx);
  const {
    photo,
    points,
    maskClosed,
    renderTextureImage,
    opacity,
    scale,
    rotationDeg,
    textureMode,
    showOutline,
  } = input;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(photo, 0, 0, width, height);

  const pixelPoints = toPixelPoints(points, width, height);

  if (maskClosed && renderTextureImage && pixelPoints.length >= 3) {
    drawMaskedTexture(ctx, width, height, {
      points,
      renderTextureImage,
      opacity,
      scale,
      rotationDeg,
      textureMode,
    });
  }

  if (showOutline && pixelPoints.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(163, 19, 47, 0.92)";
    ctx.lineWidth = Math.max(2, width / 500);
    ctx.setLineDash(maskClosed ? [] : [8, 6]);
    ctx.beginPath();
    pixelPoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (maskClosed && pixelPoints.length >= 3) ctx.closePath();
    ctx.stroke();

    const r = Math.max(4, width / 180);
    pixelPoints.forEach((p) => {
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(163, 19, 47, 0.95)";
      ctx.lineWidth = 2;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
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

const COVER_SCALE_DEFAULT = 1;
const REPEAT_SCALE_DEFAULT = 0.55;

export function MaterialPhotoVisualizer() {
  const textures = useMemo(() => listElite100TextureAssets(), []);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [points, setPoints] = useState<NormPoint[]>([]);
  const [maskClosed, setMaskClosed] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(textures[0]?.slug ?? null);
  const [renderTextureImage, setRenderTextureImage] = useState<HTMLImageElement | null>(null);
  const [textureError, setTextureError] = useState<string | null>(null);
  const [textureLoading, setTextureLoading] = useState(false);
  const [opacity, setOpacity] = useState(0.82);
  const [textureMode, setTextureMode] = useState<TextureRenderMode>("cover");
  const [scale, setScale] = useState(COVER_SCALE_DEFAULT);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const selectedTexture = useMemo(
    () => textures.find((t) => t.slug === selectedSlug) ?? null,
    [textures, selectedSlug],
  );

  const scaleConfig = useMemo(() => {
    if (textureMode === "cover") {
      return { min: 0.5, max: 2.5, step: 0.01, label: "Zoom" };
    }
    return { min: 0.25, max: 1.5, step: 0.01, label: "Tile size" };
  }, [textureMode]);

  const statusHint = useMemo(() => {
    if (!photoImage) return "Upload a kitchen photo to begin.";
    if (!maskClosed) {
      if (points.length === 0) return "Click around the countertop to mark the surface.";
      if (points.length < 3) return "Add at least 3 points, then complete the mask.";
      return "Add more points or complete the mask when the outline looks right.";
    }
    if (!selectedTexture) return "Choose an Elite 100 texture.";
    if (textureLoading) return "Loading full-resolution texture…";
    if (textureError) return textureError;
    return textureMode === "cover"
      ? "Cover surface fills the countertop with one continuous stone image. Adjust zoom, opacity, and rotation."
      : "Repeat texture tiles the full-res image. Increase tile size to reduce visible seams.";
  }, [photoImage, maskClosed, points.length, selectedTexture, textureLoading, textureError, textureMode]);

  const revokePhotoUrl = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  const handleUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file (JPEG, PNG, etc.).");
      return;
    }
    setPhotoError(null);
    setPoints([]);
    setMaskClosed(false);
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
  }, [revokePhotoUrl]);

  useEffect(() => () => {
    revokePhotoUrl(photoUrl);
  }, [photoUrl, revokePhotoUrl]);

  useEffect(() => {
    if (!selectedTexture) {
      setRenderTextureImage(null);
      setTextureError(null);
      return;
    }

    const url = renderTextureUrl(selectedTexture);
    const cached = RENDER_TEXTURE_CACHE.get(url);
    if (cached) {
      setRenderTextureImage(cached);
      setTextureError(null);
      setTextureLoading(false);
      return;
    }

    let alive = true;
    setTextureLoading(true);
    setTextureError(null);
    loadRenderTexture(url)
      .then((img) => {
        if (!alive) return;
        setRenderTextureImage(img);
      })
      .catch(() => {
        if (!alive) return;
        setRenderTextureImage(null);
        setTextureError(`Could not load full texture for ${selectedTexture.colorName}.`);
      })
      .finally(() => {
        if (alive) setTextureLoading(false);
      });
    return () => { alive = false; };
  }, [selectedTexture]);

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

  const buildRenderInput = useCallback((): RenderInput | null => {
    if (!photoImage) return null;
    return {
      photo: photoImage,
      points,
      maskClosed,
      renderTextureImage: maskClosed ? renderTextureImage : null,
      opacity,
      scale,
      rotationDeg,
      textureMode,
      showOutline: !maskClosed && points.length > 0,
    };
  }, [
    photoImage,
    points,
    maskClosed,
    renderTextureImage,
    opacity,
    scale,
    rotationDeg,
    textureMode,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photoImage || canvasSize.width < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const input = buildRenderInput();
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
  }, [photoImage, canvasSize, buildRenderInput]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!photoImage || maskClosed || canvasSize.width < 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvasSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvasSize.height;
    setPoints((prev) => [
      ...prev,
      { nx: x / canvasSize.width, ny: y / canvasSize.height },
    ]);
  }, [photoImage, maskClosed, canvasSize]);

  const completeMask = useCallback(() => {
    if (points.length >= 3) setMaskClosed(true);
  }, [points.length]);

  const clearMask = useCallback(() => {
    setPoints([]);
    setMaskClosed(false);
  }, []);

  const handleTextureModeChange = useCallback((mode: TextureRenderMode) => {
    setTextureMode(mode);
    setScale(mode === "cover" ? COVER_SCALE_DEFAULT : REPEAT_SCALE_DEFAULT);
  }, []);

  const downloadPreview = useCallback(() => {
    if (!photoImage || !maskClosed || points.length < 3 || !renderTextureImage) return;
    const oc = document.createElement("canvas");
    oc.width = photoImage.naturalWidth;
    oc.height = photoImage.naturalHeight;
    const ctx = oc.getContext("2d");
    if (!ctx) return;

    renderScene(ctx, oc.width, oc.height, {
      photo: photoImage,
      points,
      maskClosed: true,
      renderTextureImage,
      opacity,
      scale,
      rotationDeg,
      textureMode,
      showOutline: false,
    });

    const link = document.createElement("a");
    link.download = `countertop-visualizer-${selectedTexture?.slug ?? "preview"}.jpg`;
    link.href = oc.toDataURL("image/jpeg", 0.92);
    link.click();
  }, [
    photoImage,
    maskClosed,
    points,
    renderTextureImage,
    opacity,
    scale,
    rotationDeg,
    textureMode,
    selectedTexture?.slug,
  ]);

  const canComplete = photoImage && !maskClosed && points.length >= 3;
  const canDownload = photoImage && maskClosed && points.length >= 3 && renderTextureImage;

  return (
    <div className="pv-page">
      <header className="pv-header">
        <div className="pv-header-text">
          <p className="pv-eyebrow">Internal prototype</p>
          <h2 className="pv-title">Photo Visualizer</h2>
          <p className="pv-sub">
            Mark a countertop in a kitchen photo and preview mapped Elite 100 stone textures. All processing stays in your browser.
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
                className="pv-canvas"
                onClick={handleCanvasClick}
                role="img"
                aria-label="Kitchen photo visualizer canvas"
              />
            )}
          </div>
        </div>

        <aside className="pv-controls" aria-label="Visualizer controls">
          <section className="pv-panel">
            <h3 className="pv-panel-title">Mask</h3>
            <div className="pv-btn-row">
              <button type="button" className="btn secondary btn-sm" disabled={!canComplete} onClick={completeMask}>
                Complete mask
              </button>
              <button type="button" className="btn secondary btn-sm" disabled={!photoImage || points.length === 0} onClick={clearMask}>
                Clear mask
              </button>
            </div>
            <p className="pv-panel-hint">
              {maskClosed
                ? "Mask locked. Clear to redraw the countertop outline."
                : "Click points on the photo, then complete the polygon."}
            </p>
          </section>

          <section className="pv-panel">
            <h3 className="pv-panel-title">Elite 100 texture</h3>
            <p className="pv-panel-hint">Mapped pilot textures only ({textures.length} available).</p>
            <div className="pv-texture-grid" role="listbox" aria-label="Elite 100 textures">
              {textures.map((texture) => (
                <TexturePickerButton
                  key={texture.slug}
                  texture={texture}
                  selected={selectedSlug === texture.slug}
                  disabled={!maskClosed}
                  onSelect={() => setSelectedSlug(texture.slug)}
                />
              ))}
            </div>
          </section>

          <section className="pv-panel">
            <h3 className="pv-panel-title">Blend</h3>
            <div className="pv-mode-row" role="group" aria-label="Texture mode">
              <button
                type="button"
                className={`pv-mode-btn${textureMode === "cover" ? " active" : ""}`}
                disabled={!maskClosed}
                onClick={() => handleTextureModeChange("cover")}
              >
                Cover surface
              </button>
              <button
                type="button"
                className={`pv-mode-btn${textureMode === "repeat" ? " active" : ""}`}
                disabled={!maskClosed}
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
                value={opacity}
                disabled={!maskClosed}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
              <span className="pv-slider-val">{Math.round(opacity * 100)}%</span>
            </label>
            <label className="pv-slider">
              <span>{scaleConfig.label}</span>
              <input
                type="range"
                min={scaleConfig.min}
                max={scaleConfig.max}
                step={scaleConfig.step}
                value={scale}
                disabled={!maskClosed}
                onChange={(e) => setScale(Number(e.target.value))}
              />
              <span className="pv-slider-val">{scale.toFixed(2)}×</span>
            </label>
            <label className="pv-slider">
              <span>Rotation</span>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={rotationDeg}
                disabled={!maskClosed}
                onChange={(e) => setRotationDeg(Number(e.target.value))}
              />
              <span className="pv-slider-val">{rotationDeg}°</span>
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
            <p className="pv-panel-hint">Exports a full-resolution JPEG using the full texture asset.</p>
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
