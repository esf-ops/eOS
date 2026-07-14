import { useEffect, useState } from "react";
import type { QuoteIntakeCase, QuoteIntakeRepository } from "../../domain/types";
import { evaluateTakeoffEligibility } from "../../takeoff/takeoffEligibility.mjs";
import {
  TAKEOFF_PROVENANCE,
  formatTakeoffSf,
  labelTakeoffStatus
} from "../../takeoff/takeoffDisplay.mjs";
import { formatReceived } from "../../utils/format";

type Props = {
  caseItem: QuoteIntakeCase;
  repo: QuoteIntakeRepository;
  onOpenTakeoffReview: () => void;
};

export default function TakeoffCaseEntry({ caseItem, repo, onOpenTakeoffReview }: Props) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [canOpen, setCanOpen] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const snap = repo.getAcceptedSnapshot ? await repo.getAcceptedSnapshot(caseItem.id) : null;
      if (cancelled) return;
      const gate = evaluateTakeoffEligibility({
        caseItem,
        acceptedSnapshot: snap as object | null
      });
      setCanOpen(gate.canOpenWorkspace);
      // Case-detail blockers are structural only; attachment selection is handled in the workspace.
      setReasons(
        gate.reasons.filter(
          (r) => r !== "Multiple attachments require selection." && !r.startsWith("Selected attachment")
        )
      );
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, caseItem.id, caseItem.acceptedSnapshotId, caseItem.attachments, caseItem.latestTakeoffRunId]);

  const hasRun = Boolean(caseItem.latestTakeoffRunId || caseItem.latestTakeoffState);
  const warningTotal = caseItem.takeoffWarningCounts?.total ?? 0;

  return (
    <section className="qil-detail-block qil-toff-entry" aria-label="Takeoff review entry">
      <h3>Takeoff review</h3>
      <p className="qil-cell-meta">
        Lab simulated takeoff only — not ready for quote or pricing.{" "}
        <span className="qil-toff-prov">{TAKEOFF_PROVENANCE.SIMULATED_TAKEOFF}</span>
      </p>

      {hasRun ? (
        <dl className="qil-dl qil-dl-grid qil-toff-entry-summary">
          <div>
            <dt>Latest state</dt>
            <dd>{labelTakeoffStatus(caseItem.latestTakeoffState)}</dd>
          </div>
          <div>
            <dt>Latest run time</dt>
            <dd>{caseItem.takeoffUpdatedAt ? formatReceived(caseItem.takeoffUpdatedAt) : "—"}</dd>
          </div>
          <div>
            <dt>Provider mode</dt>
            <dd>{caseItem.takeoffProviderMode ?? "—"}</dd>
          </div>
          <div>
            <dt>Measured countertop SF</dt>
            <dd>{formatTakeoffSf(caseItem.measuredCountertopSquareFootage)}</dd>
          </div>
          <div>
            <dt>Stated SF</dt>
            <dd>{formatTakeoffSf(caseItem.statedSquareFootage ?? caseItem.proposedSquareFootage)}</dd>
          </div>
          <div>
            <dt>Variance</dt>
            <dd>{formatTakeoffSf(caseItem.takeoffVariance)}</dd>
          </div>
          <div>
            <dt>Sink count</dt>
            <dd>{caseItem.takeoffSinkCutoutCount ?? "—"}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{warningTotal}</dd>
          </div>
        </dl>
      ) : (
        <p className="qil-cell-meta">No simulated takeoff run yet for this case.</p>
      )}

      {checking ? <p className="qil-cell-meta">Checking eligibility…</p> : null}

      {!checking && !canOpen ? (
        <div className="qil-toff-entry-blockers">
          <strong>Takeoff Review unavailable</strong>
          <ul>
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="qil-toff-entry-actions">
        <button
          type="button"
          className="qil-btn-primary"
          disabled={!canOpen || checking}
          onClick={onOpenTakeoffReview}
        >
          Open Takeoff Review
        </button>
      </div>
    </section>
  );
}
