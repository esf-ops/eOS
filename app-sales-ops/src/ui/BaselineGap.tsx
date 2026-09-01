import React, { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "../lib/api";
import { salespersonDisplayName } from "../lib/salespersonLabel";

type Access = { isOrgAdmin?: boolean };
type Person = { userId: string; salespersonLabel?: string | null; displayName?: string | null };

type BookSlice = { accounts: number; sf: number };
type CauseRow = { letter: string; bucket: string; maySf: number; juneSf: number; julySf: number; totalSf: number };
type QueueRow = {
  accountName: string;
  maySf: number;
  juneSf: number;
  julySf: number;
  totalSf: number;
  missingStableIdSf: number;
  currentOwner: string;
  historicalAttributionEvidence: string;
  accountDirectoryCandidateStatus: string;
  morawareLinkStatus: string;
  matchEvidence: string;
  identityStatus: string;
  bucket: string;
  requiredAction: string;
};

type GapReport = {
  verdict: string;
  activationGate: string;
  identityApprovalRequired?: boolean;
  historicalOwnershipGapFound?: boolean;
  attributionWrites?: boolean;
  assignedUserId?: string | null;
  salespersonLabel?: string | null;
  recommendedNextStep?: string;
  expected?: { may: number; june: number; july: number; total: number };
  nameMatchedReconstruction?: { actual: { may: number; june: number; july: number; total: number }; reconciled: boolean };
  stableIdReconstruction?: { actual: { may: number; june: number; july: number; total: number }; reconciled: boolean };
  unresolvedStableIdSf?: number;
  currentBookPreviewGapSf?: number;
  currentBookVsHistoricalBook?: { both: BookSlice; historicalOnly: BookSlice; currentOnly: BookSlice };
  gapByCause?: CauseRow[];
  reviewQueue?: QueueRow[];
  approvalState?: { approved: number; pendingExact: number; noCandidate: number };
};

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(n));
}

export default function BaselineGap({ token, access }: { token: string; access: Access }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [report, setReport] = useState<GapReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const loadPeople = useCallback(async () => {
    const data = (await apiGet("/api/sales-ops/admin/people", token)) as { people?: Person[] };
    setPeople(data.people || []);
  }, [token]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("packKey", "starter_handoff_v1");
    if (assignedUserId) params.set("assignedUserId", assignedUserId);
    if (showDetails) params.set("showIds", "1");
    const data = (await apiGet(`/api/sales-ops/admin/baseline-gap?${params}`, token)) as GapReport;
    setReport(data);
    if (!assignedUserId && data.assignedUserId) setAssignedUserId(data.assignedUserId);
  }, [token, assignedUserId, showDetails]);

  useEffect(() => {
    if (!access.isOrgAdmin) return;
    void (async () => {
      setBusy(true);
      setError("");
      try {
        await loadPeople();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load salespeople.");
      } finally {
        setBusy(false);
      }
    })();
  }, [access.isOrgAdmin, loadPeople]);

  useEffect(() => {
    if (!access.isOrgAdmin) return;
    void (async () => {
      setBusy(true);
      setError("");
      try {
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load the baseline gap report.");
      } finally {
        setBusy(false);
      }
    })();
  }, [access.isOrgAdmin, load]);

  if (!access.isOrgAdmin) return null;

  const book = report?.currentBookVsHistoricalBook;
  const nameActual = report?.nameMatchedReconstruction?.actual;
  const stableActual = report?.stableIdReconstruction?.actual;

  return (
    <div className="tab-page identity-review">
      <p className="kicker">Baseline reconciliation</p>
      <h2>Explain the May–July completed-install gap before Actual SF is written.</h2>
      <p className="workspace-muted">
        Historical credit uses the approved starter book, not today’s Monday assignment. Current owner is CRM
        visibility only. This report does not approve identity and does not write attribution facts.
      </p>
      {error && <div className="field-error">{error}</div>}
      <div className="plan-admin-actions identity-review-filters">
        <label>
          Salesperson
          <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
            <option value="">Select salesperson</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {salespersonDisplayName(p.salespersonLabel, p.displayName)}
              </option>
            ))}
          </select>
        </label>
        <label className="identity-check">
          <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />
          Technical details
        </label>
      </div>

      {report && (
        <>
          <div className="plan-kpi-cards">
            <article className="plan-kpi-card">
              <span>Verdict</span>
              <strong>{report.verdict}</strong>
              <small>Activation gate: {report.activationGate}</small>
            </article>
            <article className="plan-kpi-card">
              <span>Unresolved stable-ID SF</span>
              <strong>{fmt(report.unresolvedStableIdSf)}</strong>
              <small>Current-book preview gap {fmt(report.currentBookPreviewGapSf)}</small>
            </article>
            <article className="plan-kpi-card">
              <span>Approvals on historical book</span>
              <strong>
                {report.approvalState?.approved ?? 0} / pending {report.approvalState?.pendingExact ?? 0} / none{" "}
                {report.approvalState?.noCandidate ?? 0}
              </strong>
              <small>Attribution writes: {report.attributionWrites ? "on" : "still off"}</small>
            </article>
          </div>
          {report.recommendedNextStep && <p className="workspace-muted">{report.recommendedNextStep}</p>}

          <h3>Current book vs historical book</h3>
          <div className="month-goal-head baseline-book-head">
            <span>Set</span>
            <span>Accounts</span>
            <span>May–July SF</span>
          </div>
          {[
            ["In both", book?.both],
            ["Historical only", book?.historicalOnly],
            ["Current only", book?.currentOnly]
          ].map(([label, slice]) => (
            <div className="month-goal-row baseline-book-row" key={String(label)}>
              <strong>{label}</strong>
              <span>{fmt((slice as BookSlice | undefined)?.accounts)}</span>
              <span>{fmt((slice as BookSlice | undefined)?.sf)}</span>
            </div>
          ))}

          <h3>Acceptance reconstruction</h3>
          <div className="month-goal-head baseline-recon-head">
            <span>Source</span>
            <span>May</span>
            <span>June</span>
            <span>July</span>
            <span>Total</span>
          </div>
          <div className="month-goal-row baseline-recon-row">
            <strong>Expected</strong>
            <span>{fmt(report.expected?.may)}</span>
            <span>{fmt(report.expected?.june)}</span>
            <span>{fmt(report.expected?.july)}</span>
            <span>{fmt(report.expected?.total)}</span>
          </div>
          <div className="month-goal-row baseline-recon-row">
            <strong>Name-matched starter book</strong>
            <span>{fmt(nameActual?.may)}</span>
            <span>{fmt(nameActual?.june)}</span>
            <span>{fmt(nameActual?.july)}</span>
            <span>{fmt(nameActual?.total)}</span>
          </div>
          <div className="month-goal-row baseline-recon-row">
            <strong>Stable ID (approved + Moraware)</strong>
            <span>{fmt(stableActual?.may)}</span>
            <span>{fmt(stableActual?.june)}</span>
            <span>{fmt(stableActual?.july)}</span>
            <span>{fmt(stableActual?.total)}</span>
          </div>

          <h3>Gap by cause</h3>
          <div className="month-goal-head baseline-cause-head">
            <span>Bucket</span>
            <span>May</span>
            <span>June</span>
            <span>July</span>
            <span>Total</span>
          </div>
          {(report.gapByCause || [])
            .filter((row) => row.totalSf)
            .map((row) => (
              <div className="month-goal-row baseline-cause-row" key={row.letter}>
                <strong>
                  {row.letter}. {row.bucket.replace(/_/g, " ")}
                </strong>
                <span>{fmt(row.maySf)}</span>
                <span>{fmt(row.juneSf)}</span>
                <span>{fmt(row.julySf)}</span>
                <span>{fmt(row.totalSf)}</span>
              </div>
            ))}

          <h3>Human review queue</h3>
          <p className="workspace-muted">Sorted by missing stable-ID SF. Names first; IDs stay behind technical details.</p>
          <div className="month-goal-head baseline-queue-head">
            <span>Account</span>
            <span>May</span>
            <span>June</span>
            <span>July</span>
            <span>Total</span>
            <span>Owner</span>
            <span>Action</span>
          </div>
          {(report.reviewQueue || []).map((row) => (
            <article className="month-goal-row baseline-queue-row" key={row.accountName}>
              <div>
                <strong>{row.accountName}</strong>
                <small>
                  {row.matchEvidence} · {row.accountDirectoryCandidateStatus} · Moraware {row.morawareLinkStatus}
                </small>
              </div>
              <span>{fmt(row.maySf)}</span>
              <span>{fmt(row.juneSf)}</span>
              <span>{fmt(row.julySf)}</span>
              <span>{fmt(row.totalSf)}</span>
              <span>{row.currentOwner}</span>
              <span>{row.requiredAction}</span>
            </article>
          ))}
          {!busy && (report.reviewQueue || []).length === 0 && (
            <p className="workspace-muted">No unresolved historical-book accounts in this salesperson scope.</p>
          )}
        </>
      )}
    </div>
  );
}
