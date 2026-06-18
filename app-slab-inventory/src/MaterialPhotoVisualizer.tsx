import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listElite100TextureAssets,
  type Elite100TextureAsset,
} from "./lib/elite100TextureAssets";

type NormPoint = { nx: number; ny: number };

type RenderInput = {
  photo: HTMLImageElement;
  points: NormPoint[];
  maskClosed: boolean;
  texture: HTMLImageElement | null;
  opacity: number;
  scale: number;
  rotationDeg: number;
  showOutline: boolean;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
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

function drawTiledTexture(
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
  const base = Math.min(canvasW, canvasH) * scale;
  const tileW = Math.max(8, base);
  const tileH = Math.max(8, (texture.naturalHeight / texture.naturalWidth) * tileW);
  const coverW = Math.max(bounds.w, canvasW) * 1.5;
  const coverH = Math.max(bounds.h, canvasH) * 1.5;

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

function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: RenderInput,
) {
  const { photo, points, maskClosed, texture, opacity, scale, rotationDeg, showOutline } = input;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(photo, 0, 0, width, height);

  const pixelPoints = toPixelPoints(points, width, height);

  if (maskClosed && texture && pixelPoints.length >= 3) {
    ctx.save();
    ctx.beginPath();
    pixelPoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.clip();
    drawTiledTexture(ctx, texture, pixelPoints, width, height, opacity, scale, rotationDeg);
    ctx.restore();
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
  const [textureImage, setTextureImage] = useState<HTMLImageElement | null>(null);
  const [textureError, setTextureError] = useState<string | null>(null);
  const [textureLoading, setTextureLoading] = useState(false);
  const [opacity, setOpacity] = useState(0.82);
  const [scale, setScale] = useState(0.28);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const selectedTexture = useMemo(
    () => textures.find((t) => t.slug === selectedSlug) ?? null,
    [textures, selectedSlug],
  );

  const statusHint = useMemo(() => {
    if (!photoImage) return "Upload a kitchen photo to begin.";
    if (!maskClosed) {
      if (points.length === 0) return "Click around the countertop to mark the surface.";
      if (points.length < 3) return "Add at least 3 points, then complete the mask.";
      return "Add more points or complete the mask when the outline looks right.";
    }
    if (!selectedTexture) return "Choose an Elite 100 texture.";
    if (textureLoading) return "Loading texture…";
    if (textureError) return textureError;
    return "Adjust opacity, scale, and rotation to blend the stone into your photo.";
  }, [photoImage, maskClosed, points.length, selectedTexture, textureLoading, textureError]);

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
      setTextureImage(null);
      setTextureError(null);
      return;
    }
    let alive = true;
    setTextureLoading(true);
    setTextureError(null);
    loadImage(selectedTexture.fullUrl)
      .then((img) => {
        if (!alive) return;
        setTextureImage(img);
      })
      .catch(() => {
        if (!alive) return;
        setTextureImage(null);
        setTextureError(`Could not load texture for ${selectedTexture.colorName}.`);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photoImage || canvasSize.width < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    renderScene(ctx, canvas.width, canvas.height, {
      photo: photoImage,
      points,
      maskClosed,
      texture: maskClosed ? textureImage : null,
      opacity,
      scale,
      rotationDeg,
      showOutline: !maskClosed && points.length > 0,
    });
  }, [photoImage, canvasSize, points, maskClosed, textureImage, opacity, scale, rotationDeg]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!photoImage || maskClosed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    setPoints((prev) => [...prev, { nx: x / canvas.width, ny: y / canvas.height }]);
  }, [photoImage, maskClosed]);

  const completeMask = useCallback(() => {
    if (points.length >= 3) setMaskClosed(true);
  }, [points.length]);

  const clearMask = useCallback(() => {
    setPoints([]);
    setMaskClosed(false);
  }, []);

  const downloadPreview = useCallback(() => {
    if (!photoImage || !maskClosed || points.length < 3) return;
    const oc = document.createElement("canvas");
    oc.width = photoImage.naturalWidth;
    oc.height = photoImage.naturalHeight;
    const ctx = oc.getContext("2d");
    if (!ctx) return;
    renderScene(ctx, oc.width, oc.height, {
      photo: photoImage,
      points,
      maskClosed: true,
      texture: textureImage,
      opacity,
      scale,
      rotationDeg,
      showOutline: false,
    });
    const link = document.createElement("a");
    link.download = `countertop-visualizer-${selectedTexture?.slug ?? "preview"}.jpg`;
    link.href = oc.toDataURL("image/jpeg", 0.92);
    link.click();
  }, [photoImage, maskClosed, points, textureImage, opacity, scale, rotationDeg, selectedTexture?.slug]);

  const canComplete = photoImage && !maskClosed && points.length >= 3;
  const canDownload = photoImage && maskClosed && points.length >= 3 && textureImage;

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
                style={{ width: canvasSize.width, height: canvasSize.height }}
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
              <span>Scale</span>
              <input
                type="range"
                min={0.08}
                max={1.2}
                step={0.01}
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
            <p className="pv-panel-hint">Exports a full-resolution JPEG from your original photo.</p>
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
          src={texture.thumbUrl}
          alt=""
          loading="lazy"
          onError={() => setThumbFailed(true)}
        />
      )}
      <span className="pv-texture-name">{texture.colorName}</span>
    </button>
  );
}
