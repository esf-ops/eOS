import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { LoadingPreview } from "./LoadingPreview";
import { VISUALIZER_DISCLAIMER } from "../lib/config";

type PreviewExperienceProps = {
  roomPreview: string;
  renderedImage: string;
  materialName: string | null;
  loading: boolean;
  error: string | null;
  onTryAnotherColor: () => void;
  onUploadAnotherPhoto: () => void;
  onDownload: () => void;
};

export function PreviewExperience({
  roomPreview,
  renderedImage,
  materialName,
  loading,
  error,
  onTryAnotherColor,
  onUploadAnotherPhoto,
  onDownload,
}: PreviewExperienceProps) {
  return (
    <section className="viz-preview" aria-label="Your countertop preview">
      <div className="viz-preview-stage">
        {loading ? (
          <LoadingPreview roomPreview={roomPreview} />
        ) : (
          <div className="viz-preview-reveal">
            <BeforeAfterSlider beforeSrc={roomPreview} afterSrc={renderedImage} />
          </div>
        )}
      </div>

      <aside className="viz-preview-panel">
        <div className="viz-panel-head">
          <p className="viz-eyebrow">Concept preview</p>
          <h2>Preview your new countertop</h2>
          {materialName ? <p className="viz-preview-material">{materialName}</p> : null}
        </div>

        {error ? (
          <div className="viz-alert viz-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="viz-preview-actions">
          <button
            type="button"
            className="viz-btn viz-btn-primary viz-btn-block"
            onClick={onDownload}
            disabled={loading || !renderedImage}
          >
            Download result
          </button>
          <button
            type="button"
            className="viz-btn viz-btn-secondary viz-btn-block"
            onClick={onTryAnotherColor}
            disabled={loading}
          >
            Try another color
          </button>
          <button
            type="button"
            className="viz-btn viz-btn-ghost viz-btn-block"
            onClick={onUploadAnotherPhoto}
            disabled={loading}
          >
            Upload another photo
          </button>
        </div>

        <p className="viz-disclaimer">{VISUALIZER_DISCLAIMER}</p>
      </aside>
    </section>
  );
}
