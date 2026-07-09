import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { VISUALIZER_DISCLAIMER } from "../lib/config";

export type RecentRender = {
  id: string;
  materialName: string;
  materialId: string;
  renderedImage: string;
  createdAt: number;
};

type PreviewPanelProps = {
  phase: "empty" | "ready" | "loading" | "result";
  roomPreview: string | null;
  renderedImage: string | null;
  materialName: string | null;
  error: string | null;
  recentRenders: RecentRender[];
  onSelectRecent: (render: RecentRender) => void;
  onTryAnotherColor: () => void;
  onUploadAnotherPhoto: () => void;
  onDownload: () => void;
};

export function PreviewPanel({
  phase,
  roomPreview,
  renderedImage,
  materialName,
  error,
  recentRenders,
  onSelectRecent,
  onTryAnotherColor,
  onUploadAnotherPhoto,
  onDownload,
}: PreviewPanelProps) {
  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <h2>Preview</h2>
        <p className="panel-sub">Before and after concept render</p>
      </div>

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {phase === "loading" ? (
        <div className="preview-state loading">
          <div className="spinner" aria-hidden />
          <p className="loading-title">Generating concept render…</p>
          <p className="loading-sub">This may take a few seconds.</p>
        </div>
      ) : null}

      {phase === "result" && roomPreview && renderedImage ? (
        <div className="result-view">
          {materialName ? <p className="result-material">Material · {materialName}</p> : null}
          <BeforeAfterSlider beforeSrc={roomPreview} afterSrc={renderedImage} />
          <p className="disclaimer compact">{VISUALIZER_DISCLAIMER}</p>
          <div className="result-actions">
            <button type="button" className="btn btn-secondary" onClick={onTryAnotherColor}>
              Try another color
            </button>
            <button type="button" className="btn btn-secondary" onClick={onUploadAnotherPhoto}>
              Upload another photo
            </button>
            <button type="button" className="btn btn-primary" onClick={onDownload}>
              Download result
            </button>
          </div>
        </div>
      ) : null}

      {phase !== "loading" && phase !== "result" && roomPreview ? (
        <div className="preview-state ready">
          <img src={roomPreview} alt="Uploaded room" className="room-preview" />
          <p className="hint">Choose a material and generate your visualization.</p>
        </div>
      ) : null}

      {phase === "empty" ? (
        <div className="preview-state empty">
          <div className="empty-icon" aria-hidden>◇</div>
          <p className="empty-title">No room photo yet</p>
          <p className="hint">Upload a kitchen or bath photo to begin.</p>
        </div>
      ) : null}

      {recentRenders.length > 0 ? (
        <div className="recent-renders">
          <h3>Recent renders</h3>
          <div className="recent-grid">
            {recentRenders.map((item) => (
              <button
                key={item.id}
                type="button"
                className="recent-card"
                onClick={() => onSelectRecent(item)}
              >
                <img src={item.renderedImage} alt={item.materialName} />
                <span>{item.materialName}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
