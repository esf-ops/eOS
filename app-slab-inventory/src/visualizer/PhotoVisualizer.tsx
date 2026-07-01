import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  buildElite100VisualizerTextures,
  filterElite100VisualizerTextures,
  firstSelectableVisualizerTexture,
  type Elite100VisualizerGroup,
  type Elite100VisualizerTexture,
} from "../lib/elite100VisualizerTextures";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { exportBrandedPreview, exportPlainPreview } from "./exportBranded";
import {
  fitCanvasSize,
  loadImage,
  loadRenderTexture,
  renderScene,
  renderToCanvas,
} from "./render";
import { findVisualizerSample } from "./samples";
import {
  buildExportSummary,
  loadVisualizerSession,
  photoToDataUrl,
} from "./sessionStorage";
import {
  COVER_SCALE_DEFAULT,
  REPEAT_SCALE_DEFAULT,
  MAX_FAVORITES,
  defaultLabelForIndex,
  defaultMaskSettings,
  maskToSettings,
  workspaceModeLabel,
  type ExportMeta,
  type MaskSettings,
  type NormPoint,
  type VisualizerMask,
  type VisualizerSample,
  type WorkspaceMode,
} from "./types";
import { VisualizerEmptyState } from "./VisualizerEmptyState";
import { FavoriteToggleButton, VisualizerFavorites } from "./VisualizerFavorites";
import { VisualizerExportPanel } from "./VisualizerExportPanel";

export type PhotoVisualizerProps = {
  groups?: Elite100VisualizerGroup[] | null;
  priceGroupOrder?: string[];
  loading?: boolean;
  error?: string | null;
};

function textureUrlForSlug(textures: readonly Elite100VisualizerTexture[], slug: string): string | null {
  const asset = textures.find((t) => t.slug === slug);
  return asset?.hasImage ? asset.fullUrl : null;
}

function normalizeMask(mask: VisualizerMask): VisualizerMask {
  return {
    ...mask,
    textureOffsetX: mask.textureOffsetX ?? 0,
    textureOffsetY: mask.textureOffsetY ?? 0,
    brightness: mask.brightness ?? 1,
    contrast: mask.contrast ?? 1,
    saturation: mask.saturation ?? 1,
    lightingStrength: mask.lightingStrength ?? 0.55,
  };
}

export function PhotoVisualizer({
  groups = null,
  priceGroupOrder = [],
  loading = false,
  error = null,
}: PhotoVisualizerProps) {
  const textures = useMemo(
    () => buildElite100VisualizerTextures(groups, priceGroupOrder),
    [groups, priceGroupOrder],
  );

  const [textureSearch, setTextureSearch] = useState("");
  const [textureGroupFilter, setTextureGroupFilter] = useState("all");
  const [hasImageOnly, setHasImageOnly] = useState(true);
  const [presentationMode, setPresentationMode] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoSource, setPhotoSource] = useState<"upload" | "sample">("upload");
  const [sampleId, setSampleId] = useState<string | null>(null);
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
  const [favoriteSlugs, setFavoriteSlugs] = useState<string[]>([]);
  const [exportMeta, setExportMeta] = useState<ExportMeta>({ projectName: "", customerName: "", note: "" });

  const activeMask = useMemo(
    () => masks.find((m) => m.id === activeMaskId) ?? null,
    [masks, activeMaskId],
  );
  const visibleMasks = useMemo(() => masks.filter((m) => m.visible), [masks]);

  const workspaceMode: WorkspaceMode = useMemo(() => {
    if (isDrawing) return "drawing";
    if (activeMaskId) return "editing";
    return "preview";
  }, [isDrawing, activeMaskId]);

  const controlSettings = useMemo(() => {
    if (activeMask && !isDrawing) return maskToSettings(activeMask);
    return defaultSettings;
  }, [activeMask, isDrawing, defaultSettings]);

  const filteredTextures = useMemo(
    () => filterElite100VisualizerTextures(textures, {
      search: textureSearch,
      priceGroup: textureGroupFilter,
      hasImageOnly,
    }),
    [textures, textureSearch, textureGroupFilter, hasImageOnly],
  );

  const selectedTexture = useMemo(
    () => textures.find((t) => t.slug === controlSettings.textureSlug) ?? null,
    [textures, controlSettings.textureSlug],
  );

  const favoriteTextures = useMemo(
    () => favoriteSlugs
      .map((slug) => textures.find((t) => t.slug === slug))
      .filter(Boolean) as Elite100VisualizerTexture[],
    [favoriteSlugs, textures],
  );

  const textureGroupOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of textures) seen.add(t.priceGroup);
    const ordered = priceGroupOrder.filter((g) => seen.has(g));
    for (const g of seen) if (!ordered.includes(g)) ordered.push(g);
    return ordered;
  }, [textures, priceGroupOrder]);

  useEffect(() => {
    if (textures.length === 0) return;
    setDefaultSettings((prev) => {
      const current = textures.find((t) => t.slug === prev.textureSlug);
      if (current?.hasImage && current.fullUrl) return prev;
      const first = firstSelectableVisualizerTexture(textures);
      return first ? { ...prev, textureSlug: first.slug } : prev;
    });
  }, [textures]);

  const neededTextureSlugs = useMemo(() => {
    const slugs = new Set(masks.map((m) => m.textureSlug));
    slugs.add(defaultSettings.textureSlug);
    favoriteSlugs.forEach((s) => slugs.add(s));
    return [...slugs].filter(Boolean);
  }, [masks, defaultSettings.textureSlug, favoriteSlugs]);

  const scaleConfig = useMemo(() => {
    if (controlSettings.textureMode === "cover") {
      return { min: 0.5, max: 2.5, step: 0.01, label: "Scale" };
    }
    return { min: 0.25, max: 1.5, step: 0.01, label: "Tile size" };
  }, [controlSettings.textureMode]);

  const draftLabel = useMemo(() => defaultLabelForIndex(masks.length), [masks.length]);

  const canCompare = Boolean(
    photoImage && visibleMasks.length > 0 && visibleMasks.every((m) => textureImages.has(m.textureSlug)),
  );

  const statusHint = useMemo(() => {
    if (!photoImage) return "Upload a photo or choose a sample space to begin.";
    if (compareMode && canCompare) return "Drag the slider to compare before and after.";
    if (showBefore) return "Before view — original photo only.";
    if (isDrawing) {
      if (draftPoints.length === 0) return `Drawing ${draftLabel}. Click around the countertop edge.`;
      if (draftPoints.length < 3) return `Add at least 3 points, then complete the surface.`;
      return `Complete when the outline looks right, or undo a point.`;
    }
    if (visibleMasks.length === 0 && masks.length > 0) return "All surfaces are hidden. Show a surface to preview stone.";
    if (masks.length === 0) return "Add a surface to mark your first countertop zone.";
    if (activeMask) return `Editing ${activeMask.label}. Adjust material and realism settings.`;
    return `${visibleMasks.length} visible surface${visibleMasks.length !== 1 ? "s" : ""}. Select a zone to edit.`;
  }, [photoImage, compareMode, canCompare, showBefore, isDrawing, draftPoints.length, draftLabel, masks.length, visibleMasks.length, activeMask]);

  const applySettings = useCallback((patch: Partial<MaskSettings>) => {
    if (isDrawing || !activeMaskId) {
      setDefaultSettings((prev) => ({ ...prev, ...patch }));
      return;
    }
    setMasks((prev) => prev.map((m) => (m.id === activeMaskId ? { ...m, ...patch } : m)));
  }, [isDrawing, activeMaskId]);

  const revokePhotoUrl = useCallback((url: string | null) => {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
  }, []);

  const resetMaskState = useCallback(() => {
    setMasks([]);
    setActiveMaskId(null);
    setDraftPoints([]);
    setIsDrawing(true);
    setShowBefore(false);
    setCompareMode(false);
    setDefaultSettings(defaultMaskSettings(textures));
  }, [textures]);

  const loadPhotoFromUrl = useCallback(async (url: string, source: "upload" | "sample", sample: string | null) => {
    setPhotoError(null);
    resetMaskState();
    setPhotoUrl((prev) => {
      revokePhotoUrl(prev);
      return url;
    });
    setPhotoSource(source);
    setSampleId(sample);
    try {
      const img = await loadImage(url);
      setPhotoImage(img);
    } catch {
      setPhotoError("Could not load that image. Try a different file or sample.");
      setPhotoImage(null);
      revokePhotoUrl(url);
      setPhotoUrl(null);
    }
  }, [revokePhotoUrl, resetMaskState]);

  const handleUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose a JPG or PNG kitchen photo.");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    await loadPhotoFromUrl(nextUrl, "upload", null);
  }, [loadPhotoFromUrl]);

  const handleSelectSample = useCallback(async (sample: VisualizerSample) => {
    await loadPhotoFromUrl(sample.imageUrl, "sample", sample.id);
  }, [loadPhotoFromUrl]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void handleUpload(event.dataTransfer.files?.[0] ?? null);
  }, [handleUpload]);

  useEffect(() => () => { revokePhotoUrl(photoUrl); }, [photoUrl, revokePhotoUrl]);

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
          return [slug, await loadRenderTexture(url)] as const;
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
      if (failed.length) setTextureLoadError("Some Elite 100 display textures could not be loaded.");
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

  const buildSceneInput = useCallback(() => {
    if (!photoImage) return null;
    return {
      photo: photoImage,
      masks,
      textureImages,
      draftPoints,
      isDrawing,
      activeMaskId,
      showMaskOutlines: !showBefore && !compareMode && (isDrawing || activeMaskId !== null),
      renderTextures: !showBefore,
    };
  }, [photoImage, masks, textureImages, draftPoints, isDrawing, activeMaskId, showBefore, compareMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const input = buildSceneInput();
    if (!canvas || !input || canvasSize.width < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasSize.width * dpr);
    canvas.height = Math.round(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, canvasSize.width, canvasSize.height, input);

    if (canCompare && !showBefore) {
      afterCanvasRef.current = renderToCanvas(photoImage!, {
        masks,
        textureImages,
        draftPoints: [],
        isDrawing: false,
        activeMaskId: null,
        showMaskOutlines: false,
        renderTextures: true,
      }, canvasSize.width, canvasSize.height);
    }
  }, [photoImage, canvasSize, buildSceneInput, canCompare, showBefore, masks, textureImages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isDrawing) return;
      setDraftPoints([]);
      if (masks.length) {
        setIsDrawing(false);
        setActiveMaskId(masks[masks.length - 1]?.id ?? null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDrawing, masks]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!photoImage || !isDrawing || showBefore || compareMode || canvasSize.width < 1) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * canvasSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvasSize.height;
    setDraftPoints((prev) => [...prev, { nx: x / canvasSize.width, ny: y / canvasSize.height }]);
  }, [photoImage, isDrawing, showBefore, compareMode, canvasSize]);

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
    if (activeMask && !isDrawing) setDefaultSettings(maskToSettings(activeMask));
    setShowBefore(false);
    setCompareMode(false);
    setIsDrawing(true);
    setDraftPoints([]);
    setActiveMaskId(null);
  }, [activeMask, isDrawing]);

  const toggleFavorite = useCallback((slug: string) => {
    setFavoriteSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_FAVORITES) return prev;
      return [...prev, slug];
    });
  }, []);

  const resetTransform = useCallback(() => {
    applySettings({
      textureScale: controlSettings.textureMode === "cover" ? COVER_SCALE_DEFAULT : REPEAT_SCALE_DEFAULT,
      textureRotation: 0,
      textureOffsetX: 0,
      textureOffsetY: 0,
    });
  }, [applySettings, controlSettings.textureMode]);

  const resetTuning = useCallback(() => {
    applySettings({
      opacity: 0.82,
      feather: 6,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      lightingStrength: 0.55,
    });
  }, [applySettings]);

  const handleLoadSession = useCallback(async (sessionId: string) => {
    const session = loadVisualizerSession(sessionId);
    if (!session) return;
    setMasks(session.masks.map(normalizeMask));
    setDefaultSettings(session.defaultSettings);
    setFavoriteSlugs(session.favoriteSlugs);
    setExportMeta(session.exportMeta);
    setActiveMaskId(session.masks[session.masks.length - 1]?.id ?? null);
    setIsDrawing(false);
    setDraftPoints([]);
    setShowBefore(false);
    setCompareMode(false);

    if (session.photoDataUrl) {
      await loadPhotoFromUrl(session.photoDataUrl, session.photoSource, session.sampleId);
    } else if (session.sampleId) {
      const sample = findVisualizerSample(session.sampleId);
      if (sample) await loadPhotoFromUrl(sample.imageUrl, "sample", sample.id);
    }
  }, [loadPhotoFromUrl]);

  const handleExportBranded = useCallback(() => {
    if (!photoImage || !canCompare) return;
    exportBrandedPreview({
      scene: { photo: photoImage, masks, textureImages, draftPoints: [], isDrawing: false, activeMaskId: null, showMaskOutlines: false, renderTextures: true },
      exportMeta,
      colorName: selectedTexture?.colorName ?? null,
      materialName: selectedTexture?.materialName ?? null,
      priceGroup: selectedTexture?.priceGroup ?? null,
    });
  }, [photoImage, canCompare, masks, textureImages, exportMeta, selectedTexture]);

  const handleExportPlain = useCallback(() => {
    if (!photoImage || !canCompare) return;
    exportPlainPreview(
      { photo: photoImage, masks, textureImages, draftPoints: [], isDrawing: false, activeMaskId: null, showMaskOutlines: false, renderTextures: true },
      selectedTexture?.slug ?? "preview",
    );
  }, [photoImage, canCompare, masks, textureImages, selectedTexture]);

  const handleCopySummary = useCallback(async () => {
    const text = buildExportSummary(exportMeta, selectedTexture?.colorName ?? null, selectedTexture?.materialName ?? null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  }, [exportMeta, selectedTexture]);

  const controlsEnabled = Boolean(photoImage && !showBefore && !compareMode && (isDrawing || activeMaskId));
  const canComplete = isDrawing && draftPoints.length >= 3 && !showBefore;
  const canDownload = canCompare;

  return (
    <div className={`pv-page${presentationMode ? " presentation-mode" : ""}`}>
      <header className="pv-header">
        <div className="pv-header-text">
          <p className="pv-eyebrow">Elite Stone Visualizer</p>
          <h2 className="pv-title">Photo Visualizer</h2>
          <p className="pv-sub">
            Upload a kitchen photo or start from a sample space. Preview Elite 100 colors on your countertops.
          </p>
        </div>
        <div className="pv-header-actions">
          <button
            type="button"
            className={`btn secondary btn-sm${presentationMode ? " active" : ""}`}
            onClick={() => setPresentationMode((v) => !v)}
          >
            {presentationMode ? "Exit presentation" : "Presentation mode"}
          </button>
        </div>
      </header>

      {photoError ? <div className="banner banner-error pv-banner" role="alert">{photoError}</div> : null}
      {error ? <div className="banner banner-error pv-banner" role="alert">{error}</div> : null}
      {textureLoadError ? <div className="banner banner-warn pv-banner" role="status">{textureLoadError}</div> : null}

      <div className="pv-layout">
        <div className="pv-stage-column">
          {!photoImage ? (
            <VisualizerEmptyState
              dragOver={dragOver}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={handleDrop}
              onUploadClick={() => fileInputRef.current?.click()}
              onFileSelect={(file) => void handleUpload(file)}
              onSelectSample={handleSelectSample}
            />
          ) : (
            <>
              <div className="pv-stage-toolbar">
                <div className="pv-stage-toolbar-left">
                  {!presentationMode ? (
                    <span className={`pv-mode-pill mode-${workspaceMode}`}>{workspaceModeLabel(workspaceMode)}</span>
                  ) : null}
                  <p className="pv-stage-status" role="status">{statusHint}</p>
                </div>
                <div className="pv-stage-toolbar-right">
                  <button
                    type="button"
                    className={`pv-compare-btn standalone${compareMode ? " active" : ""}`}
                    disabled={!canCompare}
                    onClick={() => { setCompareMode((v) => !v); setShowBefore(false); }}
                  >
                    Compare slider
                  </button>
                  {!compareMode ? (
                    <div className="pv-compare-toggle" role="group" aria-label="Before and after">
                      <button type="button" className={`pv-compare-btn${showBefore ? " active" : ""}`} onClick={() => setShowBefore(true)}>Before</button>
                      <button type="button" className={`pv-compare-btn${!showBefore ? " active" : ""}`} onClick={() => setShowBefore(false)}>After</button>
                    </div>
                  ) : null}
                  <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)} />
                  {!presentationMode ? (
                    <button type="button" className="btn secondary btn-sm" onClick={() => replaceInputRef.current?.click()}>Replace photo</button>
                  ) : null}
                </div>
              </div>

              <div className="pv-stage" ref={workspaceRef}>
                {compareMode && canCompare && photoUrl ? (
                  <BeforeAfterSlider
                    beforeSrc={photoUrl}
                    afterCanvas={afterCanvasRef.current}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    enabled
                  />
                ) : (
                  <canvas
                    ref={canvasRef}
                    className={`pv-canvas${isDrawing && !showBefore ? " drawing" : ""}`}
                    onClick={handleCanvasClick}
                    role="img"
                    aria-label="Kitchen photo visualizer canvas"
                  />
                )}
                {isDrawing && !showBefore && !compareMode ? (
                  <div className="pv-draw-hint" aria-live="polite">
                    Click around the countertop edge. Complete when finished. Press Escape to cancel.
                  </div>
                ) : null}
              </div>

              {presentationMode && selectedTexture ? (
                <div className="pv-presentation-bar" aria-live="polite">
                  <strong>{selectedTexture.colorName}</strong>
                  {selectedTexture.materialName ? <span>{selectedTexture.materialName}</span> : null}
                </div>
              ) : null}
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)} />
        </div>

        {!presentationMode ? (
          <aside className="pv-controls" aria-label="Visualizer controls">
            <VisualizerExportPanel
              exportMeta={exportMeta}
              onExportMetaChange={(patch) => setExportMeta((prev) => ({ ...prev, ...patch }))}
              colorName={selectedTexture?.colorName ?? null}
              materialName={selectedTexture?.materialName ?? null}
              priceGroup={selectedTexture?.priceGroup ?? null}
              canExport={canDownload}
              onExportBranded={handleExportBranded}
              onExportPlain={handleExportPlain}
              onCopySummary={handleCopySummary}
              getSessionPayload={async () => ({
                photoDataUrl: photoImage ? await photoToDataUrl(photoImage) : null,
                photoSource,
                sampleId,
                masks,
                defaultSettings,
                favoriteSlugs,
                exportMeta,
              })}
              onLoadSession={handleLoadSession}
            />

            <VisualizerFavorites
              favorites={favoriteTextures}
              maxFavorites={MAX_FAVORITES}
              activeSlug={controlSettings.textureSlug}
              onToggleFavorite={toggleFavorite}
              onApplyFavorite={(slug) => applySettings({ textureSlug: slug })}
              canApply={Boolean(photoImage && masks.length > 0)}
            />

            <section className="pv-panel">
              <h3 className="pv-panel-title">Surfaces</h3>
              <div className="pv-btn-row">
                <button type="button" className="btn secondary btn-sm" disabled={!canComplete} onClick={completeMask}>Complete surface</button>
                <button type="button" className="btn secondary btn-sm" disabled={!(isDrawing && draftPoints.length)} onClick={() => setDraftPoints((p) => p.slice(0, -1))}>Undo point</button>
              </div>
              <button type="button" className="btn secondary btn-sm" disabled={!photoImage || isDrawing || showBefore} onClick={startAnotherMask}>Add surface</button>
              {masks.length > 0 ? (
                <ul className="pv-zone-list">
                  {masks.map((mask) => {
                    const texture = textures.find((t) => t.slug === mask.textureSlug);
                    const isActive = mask.id === activeMaskId && !isDrawing;
                    return (
                      <li key={mask.id} className={`pv-zone-item${isActive ? " active" : ""}${mask.visible ? "" : " hidden-zone"}`}>
                        <button type="button" className="pv-zone-main" onClick={() => { setActiveMaskId(mask.id); setIsDrawing(false); setDraftPoints([]); setShowBefore(false); }}>
                          <span className="pv-zone-swatch">{texture?.thumbUrl ? <img src={texture.thumbUrl} alt="" /> : "—"}</span>
                          <span className="pv-zone-copy">
                            <span className="pv-zone-label">{mask.label}</span>
                            <span className="pv-zone-meta">{texture?.colorName ?? "No color"}</span>
                          </span>
                        </button>
                        <div className="pv-zone-actions">
                          <button type="button" className="pv-zone-action" onClick={() => setMasks((p) => p.map((m) => m.id === mask.id ? { ...m, visible: !m.visible } : m))}>{mask.visible ? "Hide" : "Show"}</button>
                          <button type="button" className="pv-zone-action danger" onClick={() => setMasks((p) => p.filter((m) => m.id !== mask.id))}>Delete</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="pv-panel-hint">Mark your first countertop surface on the photo.</p>
              )}
            </section>

            <section className="pv-panel">
              <h3 className="pv-panel-title">Elite 100 colors</h3>
              {selectedTexture ? (
                <div className="pv-texture-selected">
                  <div className="pv-texture-selected-media">
                    {selectedTexture.thumbUrl ? <img src={selectedTexture.thumbUrl} alt="" /> : selectedTexture.colorName.slice(0, 2)}
                  </div>
                  <div className="pv-texture-selected-copy">
                    <strong>{selectedTexture.colorName}</strong>
                    {selectedTexture.materialName ? <span>{selectedTexture.materialName}</span> : null}
                  </div>
                  <FavoriteToggleButton
                    isFavorite={favoriteSlugs.includes(selectedTexture.slug)}
                    disabled={!selectedTexture.hasImage || (favoriteSlugs.length >= MAX_FAVORITES && !favoriteSlugs.includes(selectedTexture.slug))}
                    onClick={() => toggleFavorite(selectedTexture.slug)}
                    colorName={selectedTexture.colorName}
                  />
                </div>
              ) : null}
              <input type="search" className="pv-texture-search" placeholder="Search colors…" value={textureSearch} onChange={(e) => setTextureSearch(e.target.value)} disabled={loading} />
              <select className="pv-texture-group-filter" value={textureGroupFilter} onChange={(e) => setTextureGroupFilter(e.target.value)} disabled={loading}>
                <option value="all">All groups</option>
                {textureGroupOptions.map((g) => <option key={g} value={g}>Group {g}</option>)}
              </select>
              <div className="pv-texture-grid">
                {filteredTextures.map((texture) => (
                  <button
                    key={texture.slug}
                    type="button"
                    className={`pv-texture-btn${controlSettings.textureSlug === texture.slug ? " selected" : ""}`}
                    disabled={!controlsEnabled || !texture.hasImage}
                    onClick={() => applySettings({ textureSlug: texture.slug })}
                  >
                    {texture.thumbUrl ? <img src={texture.thumbUrl} alt="" loading="lazy" /> : texture.colorName.slice(0, 2)}
                    <span className="pv-texture-name">{texture.colorName}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="pv-panel">
              <h3 className="pv-panel-title">Transform &amp; realism</h3>
              <div className="pv-mode-row">
                <button type="button" className={`pv-mode-btn${controlSettings.textureMode === "cover" ? " active" : ""}`} disabled={!controlsEnabled} onClick={() => applySettings({ textureMode: "cover", textureScale: COVER_SCALE_DEFAULT })}>Cover</button>
                <button type="button" className={`pv-mode-btn${controlSettings.textureMode === "repeat" ? " active" : ""}`} disabled={!controlsEnabled} onClick={() => applySettings({ textureMode: "repeat", textureScale: REPEAT_SCALE_DEFAULT })}>Repeat</button>
              </div>
              {(["opacity", "textureScale", "textureRotation", "textureOffsetX", "textureOffsetY", "feather", "lightingStrength", "brightness", "contrast", "saturation"] as const).map((key) => {
                const configs: Record<string, { min: number; max: number; step: number; label: string }> = {
                  opacity: { min: 0.2, max: 1, step: 0.01, label: "Blend strength" },
                  textureScale: { min: scaleConfig.min, max: scaleConfig.max, step: scaleConfig.step, label: scaleConfig.label },
                  textureRotation: { min: 0, max: 359, step: 1, label: "Rotation" },
                  textureOffsetX: { min: -0.5, max: 0.5, step: 0.01, label: "Horizontal offset" },
                  textureOffsetY: { min: -0.5, max: 0.5, step: 0.01, label: "Vertical offset" },
                  feather: { min: 0, max: 24, step: 1, label: "Edge softness" },
                  lightingStrength: { min: 0, max: 1, step: 0.01, label: "Lighting match" },
                  brightness: { min: 0.6, max: 1.4, step: 0.01, label: "Brightness" },
                  contrast: { min: 0.6, max: 1.4, step: 0.01, label: "Contrast" },
                  saturation: { min: 0.5, max: 1.5, step: 0.01, label: "Saturation" },
                };
                const cfg = configs[key];
                const val = controlSettings[key] as number;
                return (
                  <label key={key} className="pv-slider">
                    <span>{cfg.label}</span>
                    <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={val} disabled={!controlsEnabled} onChange={(e) => applySettings({ [key]: Number(e.target.value) })} />
                    <span className="pv-slider-val">{key.includes("Offset") ? val.toFixed(2) : key === "textureRotation" ? `${val}°` : key === "opacity" || key === "lightingStrength" ? `${Math.round(val * 100)}%` : val.toFixed(2)}</span>
                  </label>
                );
              })}
              <div className="pv-btn-row">
                <button type="button" className="btn secondary btn-sm" disabled={!controlsEnabled} onClick={resetTransform}>Reset transform</button>
                <button type="button" className="btn secondary btn-sm" disabled={!controlsEnabled} onClick={resetTuning}>Reset tuning</button>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
