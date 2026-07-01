import type { VisualizerSample } from "./types";

type VisualizerSampleGalleryProps = {
  samples: VisualizerSample[];
  onSelectSample: (sample: VisualizerSample) => void;
  compact?: boolean;
};

export function VisualizerSampleGallery({
  samples,
  onSelectSample,
  compact = false,
}: VisualizerSampleGalleryProps) {
  return (
    <div className={`pv-sample-gallery${compact ? " compact" : ""}`}>
      <div className="pv-sample-gallery-header">
        <h3 className="pv-sample-gallery-title">Sample spaces</h3>
        <p className="pv-sample-gallery-sub">
          Start instantly with a curated kitchen or vanity scene.
        </p>
      </div>
      <div className="pv-sample-grid" role="list">
        {samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="pv-sample-card"
            role="listitem"
            onClick={() => onSelectSample(sample)}
          >
            <span className="pv-sample-media" style={{ background: sample.accent }}>
              <img src={sample.imageUrl} alt="" loading="lazy" />
            </span>
            <span className="pv-sample-copy">
              <strong>{sample.title}</strong>
              <span>{sample.subtitle}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
