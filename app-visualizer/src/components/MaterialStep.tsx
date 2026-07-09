import { MaterialPicker } from "./MaterialPicker";
import type { VisualizerTexture } from "../lib/textureCatalog";

type MaterialStepProps = {
  roomPreview: string;
  textures: VisualizerTexture[];
  textureCount: number;
  usesElite100Assets?: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onGenerate: () => void;
  onChangePhoto: () => void;
  generating: boolean;
  canGenerate: boolean;
};

export function MaterialStep({
  roomPreview,
  textures,
  textureCount,
  usesElite100Assets = false,
  selectedId,
  onSelect,
  onGenerate,
  onChangePhoto,
  generating,
  canGenerate,
}: MaterialStepProps) {
  const catalogLabel = usesElite100Assets ? "Elite 100 preview colors" : "Available preview colors";

  return (
    <section className="wizard-card">
      <header className="wizard-card-head">
        <h2>Choose your countertop color</h2>
        <p>
          {catalogLabel} · {textureCount} options
        </p>
      </header>

      <div className="room-hero">
        <img src={roomPreview} alt="Your kitchen" className="room-hero-image" />
        <button type="button" className="btn btn-text" onClick={onChangePhoto} disabled={generating}>
          Change photo
        </button>
      </div>

      <MaterialPicker
        textures={textures}
        selectedId={selectedId}
        onSelect={onSelect}
        disabled={generating}
        totalCount={textureCount}
      />

      <div className="wizard-actions">
        <button
          type="button"
          className="btn btn-primary btn-xl"
          disabled={!canGenerate || generating}
          onClick={onGenerate}
        >
          {generating ? "Creating your preview…" : "Generate preview"}
        </button>
      </div>
    </section>
  );
}
