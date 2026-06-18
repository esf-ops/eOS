import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  listElite100TextureAssets,
  type Elite100TextureAsset,
} from "./lib/elite100TextureAssets";

type NormPoint = { nx: number; ny: number };
type TextureRenderMode = "cover" | "repeat";
type WorkspaceMode = "drawing" | "editing" | "preview";

type MaskSettings = {
  textureSlug: string;
  opacity: number;
  textureMode: TextureRenderMode;
  textureScale: number;
  textureRotation: number;
  feather: number;
};

export type VisualizerMask = {
  id: string;
  label: string;
  points: NormPoint[];
  visible: boolean;
} & MaskSettings;

type SceneInput = {
  photo: HTMLImageElement;
  masks: VisualizerMask[];
  textureImages: Map<string, HTMLImageElement>;
  draftPoints: NormPoint[];
  isDrawing: boolean;
  activeMaskId: string | null;
  showMaskOutlines: boolean;
  renderTextures: boolean;
};

const RENDER_TEXTURE_CACHE = new Map<string, HTMLImageElement>();
const COVER_SCALE_DEFAULT = 1;
const REPEAT_SCALE_DEFAULT = 0.55;
const DEFAULT_FEATHER = 6;
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
    feather: DEFAULT_FEATHER,
  };
}

function maskToSettings(mask: VisualizerMask): MaskSettings {
  return {
    textureSlug: mask.textureSlug,
    opacity: mask.opacity,
    textureMode: mask.textureMode,
    textureScale: mask.textureScale,
    textureRotation: mask.textureRotation,
    feather: mask.feather,
  };
}

function cloneMask(mask: VisualizerMask): VisualizerMask {
  return {
    ...mask,
    id: crypto.randomUUID(),
    label: `${mask.label} copy`,
    points: mask.points.map((p) => ({ ...p })),
    visible: true,
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

function drawCoverTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLImageElement,
  pixelPoints: { x: number; y: number }[],
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

function drawTextureFill(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelPoints: { x: number; y: number }[],
  texture: HTMLImageElement,
  settings: MaskSettings,
) {
  if (settings.textureMode === "cover") {
    drawCoverTexture(ctx, texture, pixelPoints, settings.textureScale, settings.textureRotation);
  } else {
    drawRepeatTexture(
      ctx,
      texture,
      pixelPoints,
      width,
      height,
      settings.textureScale,
      settings.textureRotation,
    );
  }
}

function drawMaskLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mask: VisualizerMask,
  texture: HTMLImageElement,
) {
  if (mask.points.length < 3) return;
  const pixelPoints = toPixelPoints(mask.points, width, height);
  const feather = Math.max(0, mask.feather);

  const texCanvas = document.createElement("canvas");
  texCanvas.width = width;
  texCanvas.height = height;
  const texCtx = texCanvas.getContext("2d");
  if (!texCtx) return;
  configureCanvasContext(texCtx);
  texCtx.save();
  clipToPolygon(texCtx, pixelPoints);
  drawTextureFill(texCtx, width, height, pixelPoints, texture, mask);
  texCtx.restore();

  if (feather <= 0) {
    ctx.save();
    ctx.globalAlpha = mask.opacity;
    ctx.drawImage(texCanvas, 0, 0);
    ctx.restore();
    return;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;
  maskCtx.fillStyle = "#ffffff";
  maskCtx.beginPath();
  tracePolygonPath(maskCtx, pixelPoints);
  maskCtx.fill();

  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaCtx = alphaCanvas.getContext("2d");
  if (!alphaCtx) return;
  alphaCtx.filter = `blur(${feather}px)`;
  alphaCtx.drawImage(maskCanvas, 0, 0);
  alphaCtx.filter = "none";

  ctx.save();
  ctx.globalAlpha = mask.opacity;
  ctx.drawImage(texCanvas, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(alphaCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
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
    renderTextures,
  } = input;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(photo, 0, 0, width, height);

  if (renderTextures) {
    for (const mask of masks) {
      if (!mask.visible) continue;
      const texture = textureImages.get(mask.textureSlug);
      if (texture) drawMaskLayer(ctx, width, height, mask, texture);
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

function exportFilename(masks: VisualizerMask[], textures: readonly Elite100TextureAsset[]): string {
  const visible = masks.filter((mask) => mask.visible);
  const primary = textures.find((t) => t.slug === visible[0]?.textureSlug);
  const slug = primary?.slug ?? "preview";
  const date = new Date().toISOString().slice(0, 10);
  return `eliteos-visualizer-${slug}-${date}.jpg`;
}

function workspaceModeLabel(mode: WorkspaceMode): string {
  if (mode === "drawing") return "Drawing";
  if (mode === "editing") return "Editing";
  return "Preview";
}

export function MaterialPhotoVisualizer() {
  const textures = useMemo(() => listElite100TextureAssets(), []);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

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
  const [showBefore, setShowBefore] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const activeMask = useMemo(
    () => masks.find((mask) => mask.id === activeMaskId) ?? null,
    [masks, activeMaskId],
  );

  const visibleMasks = useMemo(
    () => masks.filter((mask) => mask.visible),
    [masks],
  );

  const workspaceMode: WorkspaceMode = useMemo(() => {
    if (isDrawing) return "drawing";
    if (activeMaskId) return "editing";
    return "preview";
  }, [isDrawing, activeMaskId]);

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
    if (showBefore) return "Before view — original photo only. Toggle After to see stone overlays.";
    if (isDrawing) {
      if (draftPoints.length === 0) return `Drawing ${draftLabel}. Click around the countertop edge.`;
      if (draftPoints.length < 3) return `Drawing ${draftLabel}. Add at least 3 points, then complete the surface.`;
      return `Drawing ${draftLabel}. Complete when the outline looks right, or undo a point.`;
    }
    if (visibleMasks.length === 0 && masks.length > 0) return "All surfaces are hidden. Show a surface to preview stone.";
    if (masks.length === 0) return "Add a surface to mark your first countertop zone.";
    if (activeMask) return `Editing ${activeMask.label}. Adjust material, blend, and edge softness.`;
    return `${visibleMasks.length} visible surface${visibleMasks.length !== 1 ? "s" : ""}. Select a zone to edit.`;
  }, [photoImage, showBefore, isDrawing, draftPoints.length, draftLabel, masks.length, visibleMasks.length, activeMask]);

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
    setShowBefore(false);
    setDefaultSettings(defaultMaskSettings(textures));
  }, [textures]);

  const handleUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose a JPG or PNG kitchen photo.");
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

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void handleUpload(file);
  }, [handleUpload]);

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
      const maxW = Math.max(320, workspace.clientWidth - 32);
      const maxH = Math.max(320, Math.min(780, window.innerHeight * 0.62));
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
      showMaskOutlines: !showBefore && (isDrawing || activeMaskId !== null),
      renderTextures: !showBefore,
    };
  }, [photoImage, masks, textureImages, draftPoints, isDrawing, activeMaskId, showBefore]);

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isDrawing) return;
      setDraftPoints([]);
      if (masks.length > 0) {
        setIsDrawing(false);
        setActiveMaskId(masks[masks.length - 1]?.id ?? null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDrawing, masks]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!photoImage || !isDrawing || showBefore || canvasSize.width < 1) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * canvasSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvasSize.height;
    setDraftPoints((prev) => [
      ...prev,
      { nx: x / canvasSize.width, ny: y / canvasSize.height },
    ]);
  }, [photoImage, isDrawing, showBefore, canvasSize]);

  const completeMask = useCallback(() => {
    if (draftPoints.length < 3) return;
    const newMask: VisualizerMask = {
      id: crypto.randomUUID(),
      label: draftLabel,
      points: draftPoints,
      visible: true,
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
    setShowBefore(false);
    setIsDrawing(true);
    setDraftPoints([]);
    setActiveMaskId(null);
  }, [activeMask, isDrawing]);

  const undoLastPoint = useCallback(() => {
    setDraftPoints((prev) => prev.slice(0, -1));
  }, []);

  const deleteMask = useCallback((maskId: string) => {
    setMasks((prev) => {
      const next = prev.filter((mask) => mask.id !== maskId);
      setActiveMaskId((current) => {
        if (current !== maskId) return current;
        return next[next.length - 1]?.id ?? null;
      });
      return next;
    });
    setIsDrawing(false);
    setDraftPoints([]);
  }, []);

  const clearAllMasks = useCallback(() => {
    setMasks([]);
    setActiveMaskId(null);
    setDraftPoints([]);
    setIsDrawing(true);
    setShowBefore(false);
  }, []);

  const duplicateMask = useCallback((maskId: string) => {
    const source = masks.find((mask) => mask.id === maskId);
    if (!source) return;
    const copy = cloneMask(source);
    setMasks((prev) => [...prev, copy]);
    setActiveMaskId(copy.id);
    setIsDrawing(false);
    setDraftPoints([]);
  }, [masks]);

  const toggleMaskVisible = useCallback((maskId: string) => {
    setMasks((prev) => prev.map((mask) => (
      mask.id === maskId ? { ...mask, visible: !mask.visible } : mask
    )));
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
    setShowBefore(false);
  }, []);

  const handleTextureModeChange = useCallback((mode: TextureRenderMode) => {
    applySettings({
      textureMode: mode,
      textureScale: mode === "cover" ? COVER_SCALE_DEFAULT : REPEAT_SCALE_DEFAULT,
    });
  }, [applySettings]);

  const downloadPreview = useCallback(() => {
    if (!photoImage || visibleMasks.length === 0) return;
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
      renderTextures: true,
    });

    const link = document.createElement("a");
    link.download = exportFilename(masks, textures);
    link.href = oc.toDataURL("image/jpeg", 0.92);
    link.click();
  }, [photoImage, visibleMasks.length, masks, textureImages, textures]);

  const controlsEnabled = Boolean(photoImage && !showBefore && (isDrawing || activeMaskId));
  const canComplete = isDrawing && draftPoints.length >= 3 && !showBefore;
  const canUndo = isDrawing && draftPoints.length > 0;
  const canAddAnother = photoImage && !isDrawing && !showBefore;
  const canClearAll = masks.length > 0 || draftPoints.length > 0 || isDrawing;
  const canDownload = visibleMasks.length > 0
    && visibleMasks.every((mask) => textureImages.has(mask.textureSlug));

  return (
    <div className="pv-page">
      <header className="pv-header">
        <div className="pv-header-text">
          <p className="pv-eyebrow">Internal prototype</p>
          <h2 className="pv-title">Photo Visualizer</h2>
          <p className="pv-sub">
            Upload a kitchen photo, mark countertop surfaces, and preview Elite 100 stone textures — entirely in your browser.
          </p>
        </div>
      </header>

      {photoError ? <div className="banner banner-error pv-banner" role="alert">{photoError}</div> : null}
      {textureLoadError ? <div className="banner banner-warn pv-banner" role="status">{textureLoadError}</div> : null}

      <div className="pv-layout">
        <div className="pv-stage-column">
          {!photoImage ? (
            <div
              className={`pv-dropzone${dragOver ? " drag-over" : ""}`}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                className="sr-only"
                onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
              />
              <div className="pv-dropzone-inner">
                <div className="pv-dropzone-art" aria-hidden>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <rect x="3" y="14" width="18" height="6" rx="2" />
                  </svg>
                </div>
                <h3 className="pv-dropzone-title">Upload a kitchen photo</h3>
                <p className="pv-dropzone-sub">Drag and drop a JPG or PNG here, or choose a file from your computer.</p>
                <button type="button" className="btn primary" onClick={() => fileInputRef.current?.click()}>
                  Choose image
                </button>
                <p className="pv-dropzone-note">Nothing is uploaded to a server. Processing stays on this device.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="pv-stage-toolbar">
                <div className="pv-stage-toolbar-left">
                  <span className={`pv-mode-pill mode-${workspaceMode}`}>{workspaceModeLabel(workspaceMode)}</span>
                  <p className="pv-stage-status" role="status">{statusHint}</p>
                </div>
                <div className="pv-stage-toolbar-right">
                  <div className="pv-compare-toggle" role="group" aria-label="Before and after">
                    <button
                      type="button"
                      className={`pv-compare-btn${showBefore ? " active" : ""}`}
                      onClick={() => setShowBefore(true)}
                    >
                      Before
                    </button>
                    <button
                      type="button"
                      className={`pv-compare-btn${!showBefore ? " active" : ""}`}
                      onClick={() => setShowBefore(false)}
                    >
                      After
                    </button>
                  </div>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    className="sr-only"
                    onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
                  />
                  <button type="button" className="btn secondary btn-sm" onClick={() => replaceInputRef.current?.click()}>
                    Replace photo
                  </button>
                </div>
              </div>

              <div className="pv-stage" ref={workspaceRef}>
                <canvas
                  ref={canvasRef}
                  className={`pv-canvas${isDrawing && !showBefore ? " drawing" : ""}`}
                  onClick={handleCanvasClick}
                  role="img"
                  aria-label="Kitchen photo visualizer canvas"
                />
                {isDrawing && !showBefore ? (
                  <div className="pv-draw-hint" aria-live="polite">
                    Click around the countertop edge. Use Undo if needed. Complete when finished. Press Escape to cancel.
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        <aside className="pv-controls" aria-label="Visualizer controls">
          <section className="pv-panel pv-panel-export">
            <button
              type="button"
              className="btn primary pv-download-btn"
              disabled={!canDownload}
              onClick={downloadPreview}
            >
              Download preview
            </button>
            <p className="pv-panel-hint">Exports visible surfaces at full photo resolution (After view).</p>
          </section>

          <section className="pv-panel">
            <h3 className="pv-panel-title">Surfaces</h3>
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
            </div>
            <button type="button" className="btn secondary btn-sm pv-clear-all" disabled={!canClearAll} onClick={clearAllMasks}>
              Clear all masks
            </button>
            {masks.length > 0 ? (
              <ul className="pv-zone-list" aria-label="Countertop surfaces">
                {masks.map((mask) => {
                  const texture = textures.find((t) => t.slug === mask.textureSlug);
                  const isActive = mask.id === activeMaskId && !isDrawing;
                  return (
                    <li key={mask.id} className={`pv-zone-item${isActive ? " active" : ""}${mask.visible ? "" : " hidden-zone"}`}>
                      <button
                        type="button"
                        className="pv-zone-main"
                        onClick={() => selectMask(mask.id)}
                      >
                        <span className="pv-zone-swatch" aria-hidden>
                          {texture ? (
                            <img src={pickerImageUrl(texture)} alt="" loading="lazy" />
                          ) : (
                            <span className="pv-zone-swatch-fallback">—</span>
                          )}
                        </span>
                        <span className="pv-zone-copy">
                          <span className="pv-zone-label">{mask.label}</span>
                          <span className="pv-zone-meta">{texture?.colorName ?? "No texture"}</span>
                        </span>
                      </button>
                      <div className="pv-zone-actions">
                        <button
                          type="button"
                          className="pv-zone-action"
                          aria-label={mask.visible ? `Hide ${mask.label}` : `Show ${mask.label}`}
                          title={mask.visible ? "Hide surface" : "Show surface"}
                          onClick={() => toggleMaskVisible(mask.id)}
                        >
                          {mask.visible ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          className="pv-zone-action"
                          aria-label={`Duplicate ${mask.label}`}
                          title="Duplicate surface"
                          onClick={() => duplicateMask(mask.id)}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="pv-zone-action danger"
                          aria-label={`Delete ${mask.label}`}
                          title="Delete surface"
                          onClick={() => deleteMask(mask.id)}
                        >
                          Delete
                        </button>
                      </div>
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
              <p className="pv-panel-hint">No surfaces yet. Complete your first mask to add it here.</p>
            )}
          </section>

          <section className="pv-panel">
            <h3 className="pv-panel-title">Elite 100 texture</h3>
            <p className="pv-panel-hint">
              {isDrawing
                ? "New surfaces inherit the texture selected below."
                : activeMask
                  ? `Applies to ${activeMask.label}.`
                  : "Select a surface or start drawing to choose a texture."}
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
            <label className="pv-slider">
              <span>Soft edge</span>
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                value={controlSettings.feather}
                disabled={!controlsEnabled}
                onChange={(e) => applySettings({ feather: Number(e.target.value) })}
              />
              <span className="pv-slider-val">{controlSettings.feather}px</span>
            </label>
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
