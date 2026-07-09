import { MaterialPicker } from "./MaterialPicker";
import type { VisualizerTexture } from "../lib/textureCatalog";

type MaterialStudioProps = {
  roomPreview: string;
  textures: VisualizerTexture[];
  textureCount: number;
  usesElite100Assets?: boolean;
  fallbackStaticOnly?: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onGenerate: () => void;
  onChangePhoto: () => void;
  generating: boolean;
  canGenerate: boolean;
};

export function MaterialStudio({
  roomPreview,
  textures,
  textureCount,
  usesElite100Assets = false,
  fallbackStaticOnly = false,
  selectedId,
  onSelect,
  onGenerate,
  onChangePhoto,
  generating,
  canGenerate,
}: MaterialStudioProps) {
  const catalogLabel = usesElite100Assets
    ? "Elite 100 preview colors"
    : fallbackStaticOnly
      ? "Available Elite preview colors"
      : "Elite preview colors";

  return (
    <section className="viz-studio" aria-label="Choose your countertop color">
      <div className="viz-studio-stage">
        <div className="viz-room-frame">
          <img src={roomPreview} alt="Your kitchen" className="viz-room-image" draggable={false} />
          <button
            type="button"
            className="viz-btn viz-btn-glass viz-room-change"
            onClick={onChangePhoto}
            disabled={generating}
          >
            Change photo
          </button>
        </div>
      </div>

      <aside className="viz-studio-panel">
        <div className="viz-panel-head">
          <h2>Choose your color</h2>
          <p>
            {catalogLabel} · {textureCount} options
          </p>
        </div>

        <MaterialPicker
          textures={textures}
          selectedId={selectedId}
          onSelect={onSelect}
          disabled={generating}
          totalCount={textureCount}
        />

        <div className="viz-panel-cta">
          <button
            type="button"
            className="viz-btn viz-btn-primary viz-btn-block"
            disabled={!canGenerate || generating}
            onClick={onGenerate}
          >
            {generating ? "Generating…" : "Generate preview"}
          </button>
        </div>
      </aside>
    </section>
  );
}
