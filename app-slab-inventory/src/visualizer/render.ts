import type { MaskSettings, NormPoint, SceneInput, VisualizerMask } from "./types";

const RENDER_TEXTURE_CACHE = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function loadRenderTexture(url: string): Promise<HTMLImageElement> {
  const cached = RENDER_TEXTURE_CACHE.get(url);
  if (cached) return cached;
  const img = await loadImage(url);
  RENDER_TEXTURE_CACHE.set(url, img);
  return img;
}

export function configureCanvasContext(ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

export function toPixelPoints(points: NormPoint[], width: number, height: number) {
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

function tracePolygonPath(ctx: CanvasRenderingContext2D, pixelPoints: { x: number; y: number }[]) {
  pixelPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

function clipToPolygon(ctx: CanvasRenderingContext2D, pixelPoints: { x: number; y: number }[]) {
  ctx.beginPath();
  tracePolygonPath(ctx, pixelPoints);
  ctx.clip();
}

function resetCanvasState(ctx: CanvasRenderingContext2D) {
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
}

function filterForSettings(settings: MaskSettings): string {
  const b = settings.brightness;
  const c = settings.contrast;
  const s = settings.saturation;
  if (b === 1 && c === 1 && s === 1) return "none";
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

function drawCoverTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLImageElement,
  pixelPoints: { x: number; y: number }[],
  settings: MaskSettings,
) {
  const bounds = polygonBounds(pixelPoints);
  const centerX = bounds.minX + bounds.w / 2 + bounds.w * settings.textureOffsetX;
  const centerY = bounds.minY + bounds.h / 2 + bounds.h * settings.textureOffsetY;
  const texW = texture.naturalWidth;
  const texH = texture.naturalHeight;
  if (texW < 1 || texH < 1) return;

  const coverScale = Math.max(bounds.w / texW, bounds.h / texH) * settings.textureScale;
  const drawW = texW * coverScale;
  const drawH = texH * coverScale;

  ctx.save();
  ctx.filter = filterForSettings(settings);
  ctx.translate(centerX, centerY);
  ctx.rotate((settings.textureRotation * Math.PI) / 180);
  ctx.drawImage(texture, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawRepeatTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLImageElement,
  pixelPoints: { x: number; y: number }[],
  canvasW: number,
  canvasH: number,
  settings: MaskSettings,
) {
  const bounds = polygonBounds(pixelPoints);
  const center = polygonCentroid(pixelPoints);
  center.x += bounds.w * settings.textureOffsetX;
  center.y += bounds.h * settings.textureOffsetY;
  const texW = texture.naturalWidth;
  const texH = texture.naturalHeight;
  if (texW < 1 || texH < 1) return;

  const aspect = texH / texW;
  const base = Math.max(canvasW, canvasH) * settings.textureScale;
  const tileW = Math.max(48, base);
  const tileH = Math.max(48, tileW * aspect);
  const coverW = Math.max(bounds.w, canvasW) * 1.75;
  const coverH = Math.max(bounds.h, canvasH) * 1.75;

  ctx.save();
  ctx.filter = filterForSettings(settings);
  ctx.translate(center.x, center.y);
  ctx.rotate((settings.textureRotation * Math.PI) / 180);
  ctx.translate(-center.x, -center.y);

  for (let y = center.y - coverH; y < center.y + coverH; y += tileH) {
    for (let x = center.x - coverW; x < center.x + coverW; x += tileW) {
      ctx.drawImage(texture, x, y, tileW, tileH);
    }
  }
  ctx.restore();
}

function drawTextureFill(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelPoints: { x: number; y: number }[],
  texture: HTMLImageElement,
  settings: MaskSettings,
) {
  if (settings.textureMode === "cover") {
    drawCoverTexture(ctx, texture, pixelPoints, settings);
  } else {
    drawRepeatTexture(ctx, texture, pixelPoints, width, height, settings);
  }
}

function buildTextureLayerCanvas(
  width: number,
  height: number,
  pixelPoints: { x: number; y: number }[],
  texture: HTMLImageElement,
  mask: VisualizerMask,
): HTMLCanvasElement | null {
  const textureLayerCanvas = document.createElement("canvas");
  textureLayerCanvas.width = width;
  textureLayerCanvas.height = height;
  const texCtx = textureLayerCanvas.getContext("2d");
  if (!texCtx) return null;
  configureCanvasContext(texCtx);
  texCtx.save();
  clipToPolygon(texCtx, pixelPoints);
  drawTextureFill(texCtx, width, height, pixelPoints, texture, mask);
  texCtx.restore();
  resetCanvasState(texCtx);
  return textureLayerCanvas;
}

function buildFeatherMaskCanvas(
  width: number,
  height: number,
  pixelPoints: { x: number; y: number }[],
  feather: number,
): HTMLCanvasElement | null {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;

  maskCtx.fillStyle = "#ffffff";
  maskCtx.beginPath();
  tracePolygonPath(maskCtx, pixelPoints);
  maskCtx.fill();
  resetCanvasState(maskCtx);

  if (feather <= 0) return maskCanvas;

  const blurredMaskCanvas = document.createElement("canvas");
  blurredMaskCanvas.width = width;
  blurredMaskCanvas.height = height;
  const blurCtx = blurredMaskCanvas.getContext("2d");
  if (!blurCtx) return maskCanvas;

  blurCtx.filter = `blur(${feather}px)`;
  blurCtx.drawImage(maskCanvas, 0, 0);
  resetCanvasState(blurCtx);
  return blurredMaskCanvas;
}

function buildMaskedTextureCanvas(
  textureLayerCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
): HTMLCanvasElement | null {
  const maskedTextureCanvas = document.createElement("canvas");
  maskedTextureCanvas.width = textureLayerCanvas.width;
  maskedTextureCanvas.height = textureLayerCanvas.height;
  const maskedCtx = maskedTextureCanvas.getContext("2d");
  if (!maskedCtx) return null;

  configureCanvasContext(maskedCtx);
  maskedCtx.drawImage(textureLayerCanvas, 0, 0);
  maskedCtx.globalCompositeOperation = "destination-in";
  maskedCtx.drawImage(maskCanvas, 0, 0);
  resetCanvasState(maskedCtx);
  return maskedTextureCanvas;
}

/** Preserve original photo lighting by soft-light blending a luminance map over the texture. */
function applyLightingPreservation(
  overlayCanvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  width: number,
  height: number,
  pixelPoints: { x: number; y: number }[],
  feather: number,
  strength: number,
): HTMLCanvasElement {
  if (strength <= 0) return overlayCanvas;

  const lightingCanvas = document.createElement("canvas");
  lightingCanvas.width = width;
  lightingCanvas.height = height;
  const lCtx = lightingCanvas.getContext("2d");
  if (!lCtx) return overlayCanvas;

  configureCanvasContext(lCtx);
  lCtx.drawImage(photo, 0, 0, width, height);
  resetCanvasState(lCtx);

  const maskCanvas = buildFeatherMaskCanvas(width, height, pixelPoints, feather);
  if (maskCanvas) {
    const clipped = document.createElement("canvas");
    clipped.width = width;
    clipped.height = height;
    const cCtx = clipped.getContext("2d");
    if (cCtx) {
      cCtx.drawImage(lightingCanvas, 0, 0);
      cCtx.globalCompositeOperation = "destination-in";
      cCtx.drawImage(maskCanvas, 0, 0);
      resetCanvasState(cCtx);
      lCtx.clearRect(0, 0, width, height);
      lCtx.drawImage(clipped, 0, 0);
    }
  }

  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const rCtx = result.getContext("2d");
  if (!rCtx) return overlayCanvas;

  configureCanvasContext(rCtx);
  rCtx.drawImage(overlayCanvas, 0, 0);
  rCtx.globalAlpha = strength;
  rCtx.globalCompositeOperation = "soft-light";
  rCtx.drawImage(lightingCanvas, 0, 0);
  resetCanvasState(rCtx);
  return result;
}

function drawHardEdgeMaskLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelPoints: { x: number; y: number }[],
  texture: HTMLImageElement,
  mask: VisualizerMask,
  photo: HTMLImageElement,
) {
  const oc = document.createElement("canvas");
  oc.width = width;
  oc.height = height;
  const oCtx = oc.getContext("2d");
  if (!oCtx) return;

  oCtx.save();
  clipToPolygon(oCtx, pixelPoints);
  drawTextureFill(oCtx, width, height, pixelPoints, texture, mask);
  oCtx.restore();
  resetCanvasState(oCtx);

  const lit = applyLightingPreservation(oc, photo, width, height, pixelPoints, mask.feather, mask.lightingStrength);
  ctx.save();
  ctx.globalAlpha = mask.opacity;
  ctx.drawImage(lit, 0, 0);
  ctx.restore();
  resetCanvasState(ctx);
}

function drawMaskLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mask: VisualizerMask,
  texture: HTMLImageElement,
  photo: HTMLImageElement,
) {
  if (mask.points.length < 3) return;
  const pixelPoints = toPixelPoints(mask.points, width, height);
  const feather = Math.max(0, mask.feather);

  try {
    const textureLayerCanvas = buildTextureLayerCanvas(width, height, pixelPoints, texture, mask);
    if (!textureLayerCanvas) {
      drawHardEdgeMaskLayer(ctx, width, height, pixelPoints, texture, mask, photo);
      return;
    }

    let overlayCanvas: HTMLCanvasElement = textureLayerCanvas;

    if (feather > 0) {
      const maskCanvas = buildFeatherMaskCanvas(width, height, pixelPoints, feather);
      if (maskCanvas) {
        const maskedTextureCanvas = buildMaskedTextureCanvas(textureLayerCanvas, maskCanvas);
        if (maskedTextureCanvas) overlayCanvas = maskedTextureCanvas;
      }
    }

    overlayCanvas = applyLightingPreservation(
      overlayCanvas,
      photo,
      width,
      height,
      pixelPoints,
      feather,
      mask.lightingStrength,
    );

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.globalAlpha = mask.opacity;
    ctx.drawImage(overlayCanvas, 0, 0);
    ctx.restore();
    resetCanvasState(ctx);
  } catch {
    drawHardEdgeMaskLayer(ctx, width, height, pixelPoints, texture, mask, photo);
  }
}

function drawPolygonOutline(
  ctx: CanvasRenderingContext2D,
  points: NormPoint[],
  width: number,
  height: number,
  opts: { active: boolean; closed: boolean; label?: string; dimmed?: boolean },
) {
  const pixelPoints = toPixelPoints(points, width, height);
  if (pixelPoints.length === 0) return;

  ctx.save();
  const dimmed = opts.dimmed ?? false;
  ctx.strokeStyle = opts.active
    ? "rgba(163, 19, 47, 0.95)"
    : dimmed
      ? "rgba(15, 23, 42, 0.22)"
      : "rgba(15, 23, 42, 0.45)";
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

export function renderScene(
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
    renderTextures,
  } = input;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(photo, 0, 0, width, height);
  resetCanvasState(ctx);

  if (renderTextures) {
    for (const mask of masks) {
      if (!mask.visible) continue;
      const texture = textureImages.get(mask.textureSlug);
      if (texture) drawMaskLayer(ctx, width, height, mask, texture, photo);
    }
  }

  if (showMaskOutlines) {
    for (const mask of masks) {
      if (!mask.visible) continue;
      const isActive = mask.id === activeMaskId && !isDrawing;
      drawPolygonOutline(ctx, mask.points, width, height, {
        active: isActive,
        closed: true,
        label: isActive ? mask.label : undefined,
        dimmed: !isActive,
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

export function fitCanvasSize(
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

export function exportFilename(slug: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `eliteos-visualizer-${slug}-${date}.jpg`;
}

export function renderToCanvas(
  photo: HTMLImageElement,
  input: Omit<SceneInput, "photo">,
  width = photo.naturalWidth,
  height = photo.naturalHeight,
): HTMLCanvasElement | null {
  const oc = document.createElement("canvas");
  oc.width = width;
  oc.height = height;
  const ctx = oc.getContext("2d");
  if (!ctx) return null;
  renderScene(ctx, width, height, { ...input, photo });
  return oc;
}
