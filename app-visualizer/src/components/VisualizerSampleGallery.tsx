import type { VisualizerSample } from "../lib/samples";

type VisualizerSampleGalleryProps = {
  samples: VisualizerSample[];
  onSelectSample: (sample: VisualizerSample) => void;
  disabled?: boolean;
};

export function VisualizerSampleGallery({
  samples,
  onSelectSample,
  disabled = false,
}: VisualizerSampleGalleryProps) {
  return (
    <div className="pv-sample-gallery">
      <div className="pv-sample-gallery-header">
        <h3 className="pv-sample-gallery-title">Sample spaces</h3>
        <p className="pv-sample-gallery-sub">Try a bundled kitchen or vanity photo</p>
      </div>
      <div className="pv-sample-grid">
        {samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="pv-sample-card"
            disabled={disabled}
            onClick={() => onSelectSample(sample)}
            style={{ "--sample-accent": sample.accent } as React.CSSProperties}
          >
            <img src={sample.imageUrl} alt="" loading="lazy" />
            <span className="pv-sample-card-title">{sample.title}</span>
            <span className="pv-sample-card-sub">{sample.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
