import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialStudio } from "./components/MaterialStudio";
import { PreviewExperience } from "./components/PreviewExperience";
import { UploadExperience } from "./components/UploadExperience";
import { VisualizerBackground } from "./components/VisualizerBackground";
import { VisualizerHeader } from "./components/VisualizerHeader";
import { WizardStepIndicator } from "./components/WizardStepIndicator";
import {
  downloadDataUrl,
  fetchPublicVisualizerConfig,
  fetchPublicVisualizerTextures,
  renderPublicVisualizer,
  VisualizerApiError,
  type PublicVisualizerConfig,
} from "./lib/api";
import { isCambriaVisualizerMode } from "./lib/cambriaMode";
import { fetchCambriaVisualizerTextures } from "./lib/cambriaTextures";
import {
  CAMBRIA_VISUALIZER_COPY,
  DEFAULT_VISUALIZER_COPY,
  VISUALIZER_DISCLAIMER,
} from "./lib/config";
import { normalizeRoomImage } from "./lib/imageNormalize";
import { buildLocalTextureCatalog, mergeApiTextures, type VisualizerTexture } from "./lib/textureCatalog";
import { DEMO_ROOMS } from "./lib/samples";

type WizardStep = 1 | 2 | 3;

const MAX_UPLOAD_MB_DEFAULT = 10;

function friendlyError(err: unknown, maxUploadMb: number): string {
  if (err instanceof VisualizerApiError) {
    if (err.status === 413) return `Photo is too large. Maximum size is ${maxUploadMb} MB.`;
    if (err.status === 429) return String(err.message);
    if (err.status === 503) return String(err.message);
    if (err.status === 504) return "Preview timed out. Please try again.";
    if (err.status === 502) {
      return (
        "We couldn't generate an image preview from that photo. " +
        "Please try another photo with the surface clearly visible."
      );
    }
    return String(err.message);
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function App() {
  const cambriaMode = useMemo(() => isCambriaVisualizerMode(), []);
  const copy = cambriaMode ? CAMBRIA_VISUALIZER_COPY : DEFAULT_VISUALIZER_COPY;

  const [config, setConfig] = useState<PublicVisualizerConfig | null>(null);
  const [textures, setTextures] = useState<VisualizerTexture[]>([]);
  const [texturesLoading, setTexturesLoading] = useState(true);
  const [usesElite100Assets, setUsesElite100Assets] = useState(false);
  const [fallbackStaticOnly, setFallbackStaticOnly] = useState(false);

  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [materialId, setMaterialId] = useState("");
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreview, setRoomPreview] = useState<string | null>(null);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const localCatalog = useMemo(() => buildLocalTextureCatalog(), []);

  const maxUploadMb = config?.maxUploadMb ?? MAX_UPLOAD_MB_DEFAULT;
  const textureCount = textures.length;

  useEffect(() => {
    if (!cambriaMode) return;
    const prev = document.title;
    document.title = "Cambria Visualizer";
    document.body.classList.add("viz-cambria-body");
    return () => {
      document.title = prev;
      document.body.classList.remove("viz-cambria-body");
    };
  }, [cambriaMode]);

  useEffect(() => {
    void fetchPublicVisualizerConfig()
      .then(setConfig)
      .catch(() => setConfig(null));

    setTexturesLoading(true);

    if (cambriaMode) {
      // Cambria-only: public showroom designs. Never fall back to Elite 100 / local catalog.
      void fetchCambriaVisualizerTextures()
        .then((list) => {
          setTextures(list);
          setUsesElite100Assets(false);
          setFallbackStaticOnly(false);
          if (list[0]) setMaterialId(list[0].id);
        })
        .catch((err: unknown) => {
          console.warn("[Cambria Visualizer] Failed to load Cambria textures:", err);
          setTextures([]);
          setUsesElite100Assets(false);
          setFallbackStaticOnly(false);
          setError(
            err instanceof Error
              ? err.message
              : "Cambria designs could not be loaded. Please try again.",
          );
        })
        .finally(() => setTexturesLoading(false));
      return;
    }

    void fetchPublicVisualizerTextures()
      .then((payload) => {
        const merged = mergeApiTextures(payload.textures);
        const list = merged.length ? merged : localCatalog.textures;
        setTextures(list);
        const usesElite = Boolean(payload.meta?.usesElite100Assets);
        setUsesElite100Assets(usesElite);
        setFallbackStaticOnly(Boolean(payload.meta?.fallbackStaticOnly) || !merged.length);
        if (!merged.length) {
          console.warn("[Elite Stone Visualizer] Using local fallback catalog; API returned no textures.");
        }
        if (list[0]) setMaterialId(list[0].id);
      })
      .catch(() => {
        console.warn("[Elite Stone Visualizer] Texture API unavailable; using local fallback catalog.");
        setTextures(localCatalog.textures);
        setUsesElite100Assets(false);
        setFallbackStaticOnly(true);
        if (localCatalog.textures[0]) setMaterialId(localCatalog.textures[0].id);
      })
      .finally(() => setTexturesLoading(false));
  }, [cambriaMode, localCatalog]);

  useEffect(() => {
    if (!roomFile) {
      setRoomPreview(null);
      return;
    }
    const url = URL.createObjectURL(roomFile);
    setRoomPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [roomFile]);

  async function acceptRoomFile(file: File) {
    setError(null);
    setRenderedImage(null);
    setMaterialName(null);

    let normalized: File;
    try {
      const result = await normalizeRoomImage(file);
      normalized = result.file;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't read that image. Please try another photo or take a new picture.",
      );
      return;
    }

    if (normalized.size > maxUploadMb * 1024 * 1024) {
      setError(`Photo is too large after processing. Maximum size is ${maxUploadMb} MB.`);
      return;
    }

    setRoomFile(normalized);
    setWizardStep(2);
  }

  async function handleDemoRoom(room: (typeof DEMO_ROOMS)[number]) {
    setError(null);
    try {
      const res = await fetch(room.imageUrl);
      if (!res.ok) throw new Error("Failed to load demo room");
      const blob = await res.blob();
      await acceptRoomFile(new File([blob], `${room.id}.jpg`, { type: blob.type || "image/jpeg" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load demo room");
    }
  }

  async function handleGenerate() {
    if (!roomFile || !materialId || generating) return;
    if (config && !config.renderEnabled) {
      setError("Preview is temporarily unavailable. Please try again later.");
      return;
    }

    setWizardStep(3);
    setGenerating(true);
    setError(null);

    try {
      const result = await renderPublicVisualizer({ roomFile, materialId });
      setRenderedImage(result.renderedImage);
      setMaterialName(result.materialName);
    } catch (err: unknown) {
      setWizardStep(2);
      setError(friendlyError(err, maxUploadMb));
    } finally {
      setGenerating(false);
    }
  }

  function handleTryAnotherColor() {
    setRenderedImage(null);
    setMaterialName(null);
    setError(null);
    setWizardStep(2);
  }

  function handleUploadAnotherPhoto() {
    setRenderedImage(null);
    setMaterialName(null);
    setRoomFile(null);
    setError(null);
    setWizardStep(1);
    fileInputRef.current?.click();
  }

  function handleChangePhoto() {
    setRenderedImage(null);
    setMaterialName(null);
    setRoomFile(null);
    setError(null);
    setWizardStep(1);
  }

  function handleDownload() {
    if (!renderedImage) return;
    downloadDataUrl(renderedImage, `countertop-preview-${materialId || "result"}.png`);
  }

  const canGenerate = Boolean(roomFile && materialId && config?.renderEnabled !== false);
  const showTopError = error && wizardStep !== 3;
  const showCambriaEmpty =
    cambriaMode && !texturesLoading && textureCount === 0 && wizardStep === 1;

  return (
    <div className={`viz-app${cambriaMode ? " viz-app--cambria visualizer-cambria-mode" : ""}`}>
      <VisualizerBackground />
      <VisualizerHeader productName={copy.productName} cambriaMode={cambriaMode} />

      <div className="viz-shell">
        {config && !config.publicVisualizerEnabled ? (
          <div className="viz-alert viz-alert-warn">
            The visualizer is temporarily unavailable. Please check back soon.
          </div>
        ) : null}

        {config && config.publicVisualizerEnabled && !config.renderEnabled ? (
          <div className="viz-alert viz-alert-warn">
            Preview generation is temporarily unavailable. You can still upload a photo and browse colors.
          </div>
        ) : null}

        <WizardStepIndicator currentStep={wizardStep} />

        {showTopError && !showCambriaEmpty ? (
          <div className="viz-alert viz-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        {showCambriaEmpty ? (
          <main className="viz-stage">
            <section className="viz-upload" aria-labelledby="viz-empty-title">
              <div className="viz-upload-intro">
                <p className="viz-eyebrow">{copy.eyebrow}</p>
                <h1 id="viz-empty-title" className="viz-hero-title">
                  {copy.emptyTexturesTitle}
                </h1>
                <p className="viz-hero-sub">{copy.emptyTexturesSub}</p>
              </div>
            </section>
          </main>
        ) : (
          <main className="viz-stage" key={wizardStep}>
            {wizardStep === 1 ? (
              <UploadExperience
                maxUploadMb={maxUploadMb}
                disabled={generating || texturesLoading || (cambriaMode && textureCount === 0)}
                onFileSelected={acceptRoomFile}
                onDemoRoomSelected={(room) => void handleDemoRoom(room)}
                fileInputRef={fileInputRef}
                eyebrow={copy.eyebrow}
                heroHeadline={copy.heroHeadline}
                heroSupporting={copy.heroSupporting}
              />
            ) : null}

            {wizardStep === 2 && roomPreview ? (
              <MaterialStudio
                roomPreview={roomPreview}
                textures={textures}
                textureCount={textureCount}
                usesElite100Assets={usesElite100Assets}
                fallbackStaticOnly={fallbackStaticOnly}
                catalogLabel={copy.catalogLabel}
                chooseColorTitle={copy.chooseColorTitle}
                searchPlaceholder={copy.searchPlaceholder}
                selectedId={materialId}
                onSelect={setMaterialId}
                onGenerate={() => void handleGenerate()}
                onChangePhoto={handleChangePhoto}
                generating={generating}
                canGenerate={canGenerate}
              />
            ) : null}

            {wizardStep === 3 && roomPreview ? (
              <PreviewExperience
                roomPreview={roomPreview}
                renderedImage={renderedImage ?? roomPreview}
                materialName={materialName}
                loading={generating}
                error={error}
                onTryAnotherColor={handleTryAnotherColor}
                onUploadAnotherPhoto={handleUploadAnotherPhoto}
                onDownload={handleDownload}
              />
            ) : null}
          </main>
        )}
      </div>

      <footer className="viz-footer">
        <p>{VISUALIZER_DISCLAIMER}</p>
      </footer>
    </div>
  );
}
