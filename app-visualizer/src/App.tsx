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
import { VISUALIZER_DISCLAIMER } from "./lib/config";
import { buildLocalTextureCatalog, mergeApiTextures, type VisualizerTexture } from "./lib/textureCatalog";
import { DEMO_ROOMS } from "./lib/samples";

type WizardStep = 1 | 2 | 3;

const MAX_UPLOAD_MB_DEFAULT = 10;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function friendlyError(err: unknown, maxUploadMb: number): string {
  if (err instanceof VisualizerApiError) {
    if (err.status === 413) return `Photo is too large. Maximum size is ${maxUploadMb} MB.`;
    if (err.status === 429) return String(err.message);
    if (err.status === 503) return String(err.message);
    if (err.status === 504) return "Preview timed out. Please try again.";
    return String(err.message);
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function App() {
  const [config, setConfig] = useState<PublicVisualizerConfig | null>(null);
  const [textures, setTextures] = useState<VisualizerTexture[]>([]);
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
    void fetchPublicVisualizerConfig()
      .then(setConfig)
      .catch(() => setConfig(null));

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
      });
  }, [localCatalog]);

  useEffect(() => {
    if (!roomFile) {
      setRoomPreview(null);
      return;
    }
    const url = URL.createObjectURL(roomFile);
    setRoomPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [roomFile]);

  function validateRoomFile(file: File): string | null {
    const mime = file.type.toLowerCase();
    if (mime && !ACCEPTED_TYPES.has(mime) && !mime.startsWith("image/")) {
      return "Please use a JPG or PNG photo.";
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      return `Photo is too large. Maximum size is ${maxUploadMb} MB.`;
    }
    return null;
  }

  function acceptRoomFile(file: File) {
    const validationError = validateRoomFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setRenderedImage(null);
    setMaterialName(null);
    setRoomFile(file);
    setWizardStep(2);
  }

  async function handleDemoRoom(room: (typeof DEMO_ROOMS)[number]) {
    setError(null);
    try {
      const res = await fetch(room.imageUrl);
      if (!res.ok) throw new Error("Failed to load demo room");
      const blob = await res.blob();
      acceptRoomFile(new File([blob], `${room.id}.jpg`, { type: blob.type || "image/jpeg" }));
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

  return (
    <div className="viz-app">
      <VisualizerBackground />
      <VisualizerHeader />

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

        {showTopError ? (
          <div className="viz-alert viz-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <main className="viz-stage" key={wizardStep}>
          {wizardStep === 1 ? (
            <UploadExperience
              maxUploadMb={maxUploadMb}
              disabled={generating}
              onFileSelected={acceptRoomFile}
              onDemoRoomSelected={(room) => void handleDemoRoom(room)}
              fileInputRef={fileInputRef}
            />
          ) : null}

          {wizardStep === 2 && roomPreview ? (
            <MaterialStudio
              roomPreview={roomPreview}
              textures={textures}
              textureCount={textureCount}
              usesElite100Assets={usesElite100Assets}
              fallbackStaticOnly={fallbackStaticOnly}
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
      </div>

      <footer className="viz-footer">
        <p>{VISUALIZER_DISCLAIMER}</p>
      </footer>
    </div>
  );
}
