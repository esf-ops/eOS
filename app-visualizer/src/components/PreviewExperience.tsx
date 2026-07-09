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
            <div className="viz-stage-frame">
              <span className="viz-stage-badge">
                <span className="viz-stage-badge-dot" aria-hidden />
                Concept preview
                {materialName ? <span className="viz-stage-badge-material"> · {materialName}</span> : null}
              </span>
              <BeforeAfterSlider beforeSrc={roomPreview} afterSrc={renderedImage} />
            </div>
          </div>
        )}
      </div>

      {!loading ? (
        <div className="viz-actionbar-wrap">
          {error ? (
            <div className="viz-alert viz-alert-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="viz-actionbar">
            <button
              type="button"
              className="viz-btn viz-btn-primary"
              onClick={onDownload}
              disabled={!renderedImage}
            >
              Download result
            </button>
            <button type="button" className="viz-btn viz-btn-secondary" onClick={onTryAnotherColor}>
              Try another color
            </button>
            <button type="button" className="viz-btn viz-btn-ghost" onClick={onUploadAnotherPhoto}>
              Upload another photo
            </button>
          </div>

          <p className="viz-disclaimer">{VISUALIZER_DISCLAIMER}</p>
        </div>
      ) : null}
    </section>
  );
}
