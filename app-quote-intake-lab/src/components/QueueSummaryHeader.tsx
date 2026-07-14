import type { QuoteIntakeStatusCounts } from "../domain/types";

type Props = {
  counts: QuoteIntakeStatusCounts;
  activeBucket: string;
  onSelectBucket: (bucket: string) => void;
};

const TILES: Array<{ key: keyof QuoteIntakeStatusCounts | "clear"; label: string; bucket: string }> = [
  { key: "new", label: "New", bucket: "new" },
  { key: "processing", label: "Processing", bucket: "processing" },
  { key: "ready_for_review", label: "Ready for review", bucket: "ready_for_review" },
  { key: "missing_information", label: "Missing information", bucket: "missing_information" },
  { key: "manual_review", label: "Manual review", bucket: "manual_review" },
  { key: "approved_ready", label: "Approved / ready", bucket: "approved_ready" },
  { key: "sent_simulated", label: "Simulated sent", bucket: "sent_simulated" }
];

export default function QueueSummaryHeader({ counts, activeBucket, onSelectBucket }: Props) {
  return (
    <section className="qil-summary" aria-label="Queue summary">
      <div className="qil-summary-head">
        <div>
          <h1>Estimator queue</h1>
          <p>
            {counts.total} fixture cases · times calculated as of fixture clock · asterisks mark simulated values
          </p>
        </div>
        {activeBucket ? (
          <button type="button" className="qil-btn-ghost" onClick={() => onSelectBucket("")}>
            Clear summary filter
          </button>
        ) : null}
      </div>
      <div className="qil-summary-grid">
        {TILES.map((tile) => {
          const value = counts[tile.key as keyof QuoteIntakeStatusCounts] ?? 0;
          const active = activeBucket === tile.bucket;
          return (
            <button
              key={tile.bucket}
              type="button"
              className={`qil-summary-tile${active ? " is-active" : ""}`}
              onClick={() => onSelectBucket(active ? "" : tile.bucket)}
              aria-pressed={active}
            >
              <span className="qil-summary-value">{value}</span>
              <span className="qil-summary-label">{tile.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
