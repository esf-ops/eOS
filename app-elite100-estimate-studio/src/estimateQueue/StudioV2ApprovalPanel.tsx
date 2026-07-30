/**
 * Studio V2 Slice E — Working Draft approval into immutable snapshot.
 * Calls POST /api/elite100-studio-v2/.../working-draft/approve only.
 * Does not import ActiveReviewPublishPanel or EstimateDigitalEstimatePanel.
 * Does not publish.
 */
import React, { useMemo, useState } from "react";

export type StudioV2ApprovalBlocker = {
  code?: string | null;
  message?: string;
};

export type StudioV2ApprovalReadiness = {
  allowed?: boolean;
  code?: string | null;
  message?: string | null;
  blockers?: StudioV2ApprovalBlocker[];
  status?: string | null;
  revision?: number | null;
  calculationCurrent?: boolean;
  priced?: boolean;
};

export type StudioV2ApprovedSummary = {
  approved?: boolean;
  estimateId?: string | null;
  revision?: number | null;
  status?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  customerDisplayTotal?: number | null;
  revisionEditPlaceholder?: string | null;
};

type Props = {
  readiness: StudioV2ApprovalReadiness | null | undefined;
  approvedSummary: StudioV2ApprovedSummary | null | undefined;
  status?: string | null;
  revision?: number | null;
  calcTotal?: number | null;
  calcAvailable?: boolean;
  calcStale: boolean;
  scopeDirty: boolean;
  optionsDirty: boolean;
  pricingDirty?: boolean;
  busy: boolean;
  error?: string | null;
  notice?: string | null;
  onApprove: (args: { confirmed: true; approvalNote?: string }) => void | Promise<void>;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(n));
}

export default function StudioV2ApprovalPanel(props: Props) {
  const {
    readiness,
    approvedSummary,
    status,
    revision,
    calcTotal,
    calcAvailable,
    calcStale,
    scopeDirty,
    optionsDirty,
    pricingDirty = false,
    busy,
    error,
    notice,
    onApprove
  } = props;

  const [confirmed, setConfirmed] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");

  const alreadyApproved = Boolean(
    approvedSummary?.approved || String(status || "").toLowerCase() === "approved"
  );

  const localBlockers = useMemo(() => {
    /** @type {StudioV2ApprovalBlocker[]} */
    const list: StudioV2ApprovalBlocker[] = [];
    if (scopeDirty) {
      list.push({
        code: "unsaved_scope",
        message: "Unsaved scope changes — save scope before approving."
      });
    }
    if (optionsDirty) {
      list.push({
        code: "unsaved_options",
        message: "Unsaved estimate option changes — save options before approving."
      });
    }
    if (pricingDirty) {
      list.push({
        code: "unsaved_pricing",
        message: "Unsaved pricing changes — save pricing before approving."
      });
    }
    if (calcStale) {
      list.push({
        code: "calculation_stale",
        message: "Calculation is stale — recalculate before approving."
      });
    }
    if (!calcAvailable && !alreadyApproved) {
      list.push({
        code: "not_priced",
        message: "Estimate is not calculated — calculate before approving."
      });
    }
    return list;
  }, [scopeDirty, optionsDirty, pricingDirty, calcStale, calcAvailable, alreadyApproved]);

  const backendBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const allBlockers = [...localBlockers, ...backendBlockers.filter((b) => {
    const code = String(b?.code || "");
    // Avoid duplicate not_priced / calculation_stale from backend when local already shows them.
    if (code === "not_priced" && localBlockers.some((l) => l.code === "not_priced")) return false;
    if (code === "calculation_stale" && localBlockers.some((l) => l.code === "calculation_stale")) {
      return false;
    }
    return true;
  })];

  const backendAllowed = readiness?.allowed === true;
  const canApprove =
    !alreadyApproved &&
    !scopeDirty &&
    !optionsDirty &&
    !pricingDirty &&
    !calcStale &&
    Boolean(calcAvailable) &&
    backendAllowed &&
    confirmed &&
    !busy;

  const disabledReason = alreadyApproved
    ? null
    : scopeDirty
      ? "Save scope before approving."
      : optionsDirty
        ? "Save options before approving."
        : pricingDirty
          ? "Save pricing before approving."
          : calcStale
            ? "Recalculate before approving."
            : !calcAvailable
              ? "Calculate before approving."
              : !backendAllowed
                ? readiness?.message || "Backend readiness does not allow approval yet."
                : !confirmed
                  ? "Check the confirmation box before approving."
                  : busy
                    ? "Approval in progress…"
                    : null;

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-approval">
      <div className="studio-v2-panel__head">
        <h2>Approval</h2>
        {!alreadyApproved ? (
          <button
            type="button"
            className={`eq-btn-primary studio-v2-approve-btn${canApprove ? "" : " is-disabled"}`}
            disabled={!canApprove}
            aria-disabled={!canApprove}
            title={disabledReason || "Approve estimate"}
            onClick={() =>
              void onApprove({
                confirmed: true,
                approvalNote: approvalNote.trim() || undefined
              })
            }
            data-testid="studio-v2-approve"
          >
            {busy ? "Approving…" : "Approve Estimate"}
          </button>
        ) : null}
      </div>

      <p className="studio-v2-scope-editor__hint">
        Approval freezes the Working Draft into an immutable snapshot. Publishing to Digital
        Estimate is a separate step.
      </p>

      {!alreadyApproved && disabledReason && !canApprove ? (
        <p className="studio-v2-approve-disabled-hint" data-testid="studio-v2-approve-disabled-hint">
          Approve is disabled: {disabledReason}
        </p>
      ) : null}

      <dl className="studio-v2-dl">
        <div>
          <dt>Status</dt>
          <dd data-testid="studio-v2-approval-status">{status || readiness?.status || "—"}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd data-testid="studio-v2-approval-revision">
            {revision ?? readiness?.revision ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Calculated total</dt>
          <dd data-testid="studio-v2-approval-total">
            {money(calcTotal ?? approvedSummary?.customerDisplayTotal)}
          </dd>
        </div>
        {alreadyApproved ? (
          <>
            <div>
              <dt>Approved at</dt>
              <dd data-testid="studio-v2-approved-at">{approvedSummary?.approvedAt || "—"}</dd>
            </div>
            <div>
              <dt>Approved by</dt>
              <dd>{approvedSummary?.approvedBy || "—"}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {alreadyApproved ? (
        <>
          <p className="studio-v2-notice" data-testid="studio-v2-approved-notice">
            This estimate is approved and read-only.
          </p>
          <p className="eq-muted" data-testid="studio-v2-revision-placeholder">
            {approvedSummary?.revisionEditPlaceholder ||
              "Create revision/edit flow will be added in a later slice."}
          </p>
        </>
      ) : (
        <>
          {allBlockers.length ? (
            <ul className="studio-v2-warnings" data-testid="studio-v2-approval-blockers">
              {allBlockers.map((b, i) => (
                <li key={`${b.code || "b"}-${i}`}>{b.message || "Approval blocked"}</li>
              ))}
            </ul>
          ) : (
            <p className="studio-v2-notice" data-testid="studio-v2-approval-ready">
              Ready to approve — confirm below.
            </p>
          )}

          <label className="studio-v2-approval-confirm" data-testid="studio-v2-approval-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || alreadyApproved}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I confirm this scope and estimate are ready to approve.</span>
          </label>

          <label className="studio-v2-approval-note">
            <span>Approval note (optional)</span>
            <input
              type="text"
              value={approvalNote}
              disabled={busy || alreadyApproved}
              onChange={(e) => setApprovalNote(e.target.value)}
              maxLength={500}
            />
          </label>
        </>
      )}

      {error ? (
        <div className="error-box" data-testid="studio-v2-approval-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="studio-v2-notice" data-testid="studio-v2-approval-success">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
