import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { VISUALIZER_DISCLAIMER } from "../lib/config";

type PreviewStepProps = {
  roomPreview: string;
  renderedImage: string;
  materialName: string | null;
  loading: boolean;
  error: string | null;
  onTryAnotherColor: () => void;
  onUploadAnotherPhoto: () => void;
  onDownload: () => void;
};

export function PreviewStep({
  roomPreview,
  renderedImage,
  materialName,
  loading,
  error,
  onTryAnotherColor,
  onUploadAnotherPhoto,
  onDownload,
}: PreviewStepProps) {
  return (
    <section className="wizard-card wizard-card-preview">
      <header className="wizard-card-head">
        <h2>Preview your new countertop</h2>
        {materialName ? <p className="preview-material-name">{materialName}</p> : null}
      </header>

      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="preview-loading">
          <div className="spinner" aria-hidden />
          <p className="preview-loading-title">Creating your preview…</p>
          <p className="preview-loading-sub">This usually takes a few seconds.</p>
        </div>
      ) : (
        <>
          <BeforeAfterSlider beforeSrc={roomPreview} afterSrc={renderedImage} />
          <p className="disclaimer-inline">{VISUALIZER_DISCLAIMER}</p>
          <div className="preview-actions">
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
        </>
      )}
    </section>
  );
}
