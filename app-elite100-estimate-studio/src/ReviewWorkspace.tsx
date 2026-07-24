/**
 * Customer review-request workspace — Studio resolve / revise / republish loop.
 * Reuses Brain review-request records; never shows sold/accept/payment.
 * Replacement customer URL is recovered from publication link metadata when available.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, ApiError } from "./lib/api";

export function reviewUiEnabled(): boolean {
  return (
    String(import.meta.env.VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED ?? "").trim() === "true"
  );
}

type QueueRow = {
  id: string;
  status: string;
  operatorStatus?: string;
  publicationId: string;
  publicationStatus?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  requestedAt: string;
  baselineDisplayTotal?: number | null;
  requestedDisplayTotal?: number | null;
  displayDelta?: number | null;
  changedSelectionCount?: number;
  intakeCaseId?: string | null;
  studioEstimateId?: string | null;
  revisedEstimateId?: string | null;
  linkedEstimateRevision?: number | null;
  resolutionState?: string;
};

type StaffBlocker = {
  code?: string;
  title?: string;
  staffMessage?: string;
  message?: string;
  productDisplayName?: string | null;
  category?: string | null;
  room?: string | null;
  quantity?: number | null;
  estimatorAction?: string | null;
  blocksApply?: boolean;
};

type Props = {
  token: string;
  onAuthFailure: () => void;
  onOpenEstimate?: (intakeCaseId: string) => void;
  initialReviewRequestId?: string | null;
};

type ActionTone = "primary" | "secondary" | "warning" | "destructive" | "neutral";

function moneyPlain(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Math.round(Number(n)).toLocaleString("en-US")}`;
}

function moneyDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const value = Number(n);
  const abs = `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return String(iso);
  }
}

function operatorLabel(s: string | undefined | null): string {
  const v = String(s || "");
  const map: Record<string, string> = {
    new: "New",
    in_review: "In review",
    revision_required: "Revision required",
    resolved_no_change: "Resolved — no change",
    resolved_republished: "Resolved — republished",
    rejected: "Rejected"
  };
  return map[v] || v || "—";
}

function publicationLabel(status: string | null | undefined) {
  const st = String(status || "").toLowerCase();
  if (!st) return "—";
  return st.charAt(0).toUpperCase() + st.slice(1);
}

function actionClass(tone: ActionTone) {
  return `review-action review-action--${tone}`;
}

function looksRawToken(value: string | null | undefined) {
  const s = String(value || "");
  if (!s) return false;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return true;
  if (/^(sink|faucet|qty-sink|qty-|material|accessory|specialty):/i.test(s)) return true;
  return s.includes(":") && /[0-9a-f]{8}/i.test(s);
}

export default function ReviewWorkspace({
  token,
  onAuthFailure,
  onOpenEstimate,
  initialReviewRequestId = null
}: Props) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialReviewRequestId || null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [applySelections, setApplySelections] = useState(false);
  const drawerTitleId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const reviewUiOn = reviewUiEnabled();

  async function loadQueue() {
    setError(null);
    setErrorCode(null);
    setLoadingQueue(true);
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const body = (await apiGet(
        `/api/elite100-estimate-studio/review-requests${q}`,
        token
      )) as { reviewRequests?: QueueRow[] };
      setRows(Array.isArray(body.reviewRequests) ? body.reviewRequests : []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        onAuthFailure();
        return;
      }
      setRows([]);
      const code =
        e instanceof ApiError &&
        e.body &&
        typeof e.body === "object" &&
        e.body !== null &&
        "code" in e.body
          ? String((e.body as { code?: unknown }).code || "")
          : "";
      setErrorCode(code || null);
      setError(e instanceof ApiError ? e.message : "Unable to load review queue");
    } finally {
      setLoadingQueue(false);
    }
  }

  function closeDrawer() {
    setSelectedId(null);
    setDetail(null);
    setOneTimeLink(null);
    setStaffNotice(null);
    const el = triggerRef.current;
    triggerRef.current = null;
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }

  async function loadDetail(id: string, trigger?: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger;
    setSelectedId(id);
    setDetailLoading(true);
    setBusy(true);
    setError(null);
    setOneTimeLink(null);
    setStaffNotice(null);
    try {
      const body = (await apiGet(
        `/api/elite100-estimate-studio/review-requests/${id}`,
        token
      )) as Record<string, unknown>;
      setDetail(body);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        onAuthFailure();
        return;
      }
      setDetail(null);
      setError(e instanceof ApiError ? e.message : "Unable to load review");
    } finally {
      setBusy(false);
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!reviewUiOn) return;
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, reviewUiOn]);

  useEffect(() => {
    if (!reviewUiOn || !initialReviewRequestId) return;
    void loadDetail(initialReviewRequestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, initialReviewRequestId, reviewUiOn]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !drawerRef.current) return;
    const root = drawerRef.current;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onTab);
    return () => root.removeEventListener("keydown", onTab);
  }, [selectedId, detailLoading, detail]);

  const reviewRequest = (detail?.reviewRequest || null) as Record<string, unknown> | null;
  const linkage = (detail?.linkage || null) as Record<string, unknown> | null;
  const pricingComparison = (detail?.pricingComparison || null) as Record<string, unknown> | null;
  const publicationGuidance = (detail?.publicationGuidance || null) as {
    state?: string;
    title?: string;
    message?: string | null;
    allowRepublish?: boolean;
    newerPublicationRef?: string | null;
  } | null;
  const blockers = (detail?.blockers || null) as {
    unsupportedSelections?: StaffBlocker[];
    unresolvedCommercial?: StaffBlocker[];
    hasBlockers?: boolean;
    canApplySelections?: boolean;
    canRepublish?: boolean;
  } | null;
  const comparison = (detail?.comparison || null) as {
    rows?: Array<Record<string, unknown>>;
  } | null;
  const timeline = (detail?.timeline || []) as Array<Record<string, unknown>>;

  const operatorStatus = String(reviewRequest?.operatorStatus || "");
  const open =
    operatorStatus === "new" ||
    operatorStatus === "in_review" ||
    operatorStatus === "revision_required";
  const resolved =
    operatorStatus === "resolved_no_change" ||
    operatorStatus === "resolved_republished" ||
    operatorStatus === "rejected";
  const publicationStatus = String(
    reviewRequest?.publicationStatus || publicationGuidance?.state || ""
  ).toLowerCase();
  const hasBlockers = Boolean(
    blockers?.hasBlockers ||
      blockers?.unsupportedSelections?.length ||
      blockers?.unresolvedCommercial?.length
  );
  const canApply = blockers?.canApplySelections !== false && !hasBlockers;
  const canRepublish = Boolean(blockers?.canRepublish && publicationGuidance?.allowRepublish !== false);

  const allBlockers = useMemo(() => {
    return [
      ...(blockers?.unsupportedSelections || []),
      ...(blockers?.unresolvedCommercial || [])
    ];
  }, [blockers]);

  if (!reviewUiOn) {
    return null;
  }

  async function runAction(
    path: string,
    body: Record<string, unknown>,
    opts?: { expectLink?: boolean }
  ) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setStaffNotice(null);
    try {
      const result = (await apiPost(
        `/api/elite100-estimate-studio/review-requests/${selectedId}/${path}`,
        token,
        body
      )) as {
        customerUrl?: string | null;
        staffNotice?: string | null;
        notice?: string | null;
        revisedEstimate?: { intakeCaseId?: string };
      };
      if (opts?.expectLink && result.customerUrl) {
        setOneTimeLink(result.customerUrl);
      }
      setStaffNotice(result.staffNotice || result.notice || null);
      await loadDetail(selectedId, triggerRef.current);
      await loadQueue();
      return result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
      if (selectedId) await loadDetail(selectedId, triggerRef.current);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copyNewLink() {
    if (!oneTimeLink) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink);
      setStaffNotice("Replacement customer link copied.");
    } catch {
      setError("Unable to copy link");
    }
  }

  function openCurrentEstimate() {
    const caseId = linkage?.intakeCaseId;
    if (caseId && onOpenEstimate) onOpenEstimate(String(caseId));
  }

  return (
    <section className="panel review-workspace" data-testid="studio-review-workspace">
      <header className="review-workspace-header">
        <div>
          <h2>Review Requests</h2>
          <p className="muted">
            Customer-submitted configuration changes — compare selections, resolve blockers, and take
            the next explicit action. Opening this screen never publishes or resolves a request.
          </p>
        </div>
      </header>

      {error ? (
        <div className="error-box" role="alert" data-testid="review-queue-error">
          {error}
          {errorCode ? <span className="muted"> ({errorCode})</span> : null}
        </div>
      ) : null}
      {staffNotice ? (
        <div className="warn-box" role="status">
          {staffNotice}
        </div>
      ) : null}

      <div className="review-toolbar search-row" role="toolbar" aria-label="Review request filters">
        <label className="review-filter-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            data-testid="review-status-filter"
          >
            <option value="">All statuses</option>
            <option value="review_requested">New</option>
            <option value="estimator_reviewing">In review</option>
            <option value="amendment_prepared">Revision required</option>
            <option value="updated_estimate_published">Resolved — republished</option>
            <option value="review_closed">Resolved / rejected</option>
          </select>
        </label>
        <button
          type="button"
          className={actionClass("secondary")}
          disabled={busy || loadingQueue}
          data-testid="review-queue-refresh"
          onClick={() => void loadQueue()}
        >
          Refresh
        </button>
      </div>

      <div className="review-list-panel">
        {loadingQueue ? (
          <p className="muted" data-testid="review-queue-loading">
            Loading review requests…
          </p>
        ) : null}
        <div className="review-table-wrap">
          <table className="review-table" data-testid="review-queue-table">
            <thead>
              <tr>
                <th scope="col">Customer / project</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
                <th scope="col">Published total</th>
                <th scope="col">Requested total</th>
                <th scope="col">Delta</th>
                <th scope="col">Estimate revision</th>
                <th scope="col">Publication state</th>
                <th scope="col">Open details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={selectedId === r.id ? "is-selected" : undefined}
                  data-testid="review-queue-row"
                >
                  <td>
                    <button
                      type="button"
                      className="review-customer-open"
                      data-testid="review-open-customer"
                      aria-label={`Open details for ${r.customerName || r.quoteNumber || "request"}`}
                      onClick={(e) => void loadDetail(r.id, e.currentTarget)}
                    >
                      <strong>
                        {r.customerName || r.quoteNumber || "Customer"}
                        {r.projectName ? ` · ${r.projectName}` : ""}
                      </strong>
                    </button>
                    {r.quoteNumber ? (
                      <div className="muted review-secondary-meta">{r.quoteNumber}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className="review-status-pill">{operatorLabel(r.operatorStatus || r.resolutionState)}</span>
                  </td>
                  <td>{formatWhen(r.requestedAt)}</td>
                  <td>{moneyPlain(r.baselineDisplayTotal)}</td>
                  <td>{moneyPlain(r.requestedDisplayTotal)}</td>
                  <td>{moneyDelta(r.displayDelta)}</td>
                  <td>{r.linkedEstimateRevision != null ? `R${r.linkedEstimateRevision}` : "—"}</td>
                  <td>{publicationLabel(r.publicationStatus)}</td>
                  <td className="review-table-actions">
                    <button
                      type="button"
                      className={actionClass("neutral")}
                      data-testid="review-open-details"
                      aria-label={`Open details for ${r.customerName || r.quoteNumber || "request"}`}
                      onClick={(e) => void loadDetail(r.id, e.currentTarget)}
                    >
                      Open details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loadingQueue && !error && !rows.length ? (
          <p className="muted" data-testid="review-queue-empty">
            No customer review requests.
          </p>
        ) : null}
      </div>

      {selectedId ? (
        <>
          <div
            className="review-drawer-backdrop"
            data-testid="review-drawer-backdrop"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            className="review-drawer"
            data-testid="review-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
          >
            <header className="review-drawer-header">
              <h3 id={drawerTitleId}>Request detail</h3>
              <button
                ref={closeBtnRef}
                type="button"
                className={actionClass("neutral")}
                data-testid="review-drawer-close"
                aria-label="Close request detail"
                onClick={closeDrawer}
              >
                Close
              </button>
            </header>

            {detailLoading ? (
              <p className="muted" data-testid="review-detail-loading">
                Loading detail…
              </p>
            ) : reviewRequest ? (
              <>
                <p className="review-stage" data-testid="review-operator-status">
                  <strong>{operatorLabel(String(reviewRequest.operatorStatus))}</strong>
                </p>

                <section className="review-detail-section">
                  <h4>Customer and project</h4>
                  <p>
                    {String(
                      (reviewRequest.estimateIdentity as { customerName?: string })?.customerName ||
                        "Customer"
                    )}{" "}
                    ·{" "}
                    {String(
                      (reviewRequest.estimateIdentity as { projectName?: string })?.projectName ||
                        "Project"
                    )}
                  </p>
                </section>

                <section className="review-detail-section">
                  <h4>Request status</h4>
                  <p className="muted">Submitted {formatWhen(String(reviewRequest.requestedAt))}</p>
                </section>

                <section className="review-detail-section">
                  <h4>Source estimate and publication</h4>
                  <p>
                    Quote{" "}
                    {String(
                      (reviewRequest.estimateIdentity as { quoteNumber?: string })?.quoteNumber || "—"
                    )}{" "}
                    · Source rev {String(linkage?.sourceEstimateRevision ?? "—")} · Publication{" "}
                    {publicationLabel(publicationStatus)}
                  </p>
                  {publicationGuidance?.message ? (
                    <div className="warn-box" data-testid="review-publication-guidance" role="status">
                      <strong>{publicationGuidance.title}</strong>
                      <p>{publicationGuidance.message}</p>
                      {publicationGuidance.newerPublicationRef ? (
                        <p className="muted">
                          Newer publication ref: {publicationGuidance.newerPublicationRef}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                {reviewRequest.customerNote ? (
                  <section className="review-detail-section">
                    <h4>Customer note</h4>
                    <p>{String(reviewRequest.customerNote)}</p>
                  </section>
                ) : null}

                <section className="review-detail-section" data-testid="review-pricing-comparison">
                  <h4>Pricing comparison</h4>
                  <ul className="review-pricing-list">
                    <li>
                      Published estimate:{" "}
                      <strong>{moneyPlain(pricingComparison?.currentPublishedTotal as number)}</strong>
                    </li>
                    <li>
                      Customer request:{" "}
                      <strong>
                        {moneyPlain(pricingComparison?.requestedConfiguredTotal as number)}
                      </strong>
                    </li>
                    <li>
                      Difference:{" "}
                      <strong>{moneyDelta(pricingComparison?.delta as number)}</strong>
                    </li>
                  </ul>
                </section>

                <section className="review-detail-section" data-testid="review-selection-comparison">
                  <h4>Customer selection changes</h4>
                  <ul className="review-selection-list">
                    {(comparison?.rows || []).map((row, i) => {
                      const requested = String(row.requestedSelection || row.displayLabel || "");
                      if (looksRawToken(requested)) return null;
                      return (
                        <li key={i}>
                          <strong>
                            {String(row.room || "Project")} · {String(row.category || "Product")}
                          </strong>
                          <div className="muted">Original: {String(row.originalSelection || "—")}</div>
                          <div>Requested: {requested}</div>
                          <div className="muted">
                            Quantity: {String(row.quantity ?? "—")} · Status:{" "}
                            {String(row.status || "Pending review")}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {!comparison?.rows?.length ? (
                    <p className="muted">No selection changes recorded.</p>
                  ) : null}
                </section>

                {allBlockers.length ? (
                  <section
                    className="review-detail-section review-blockers"
                    data-testid="review-blockers"
                    aria-labelledby="review-blockers-heading"
                  >
                    <h4 id="review-blockers-heading">Blockers / required attention</h4>
                    <ul>
                      {allBlockers.map((b, i) => {
                        const msg = String(b.staffMessage || b.message || "");
                        if (looksRawToken(msg)) {
                          return (
                            <li key={i}>
                              <strong>{b.title || "Needs catalog review"}</strong>
                              <p>
                                A customer selection cannot be applied safely. Open the Studio estimate
                                to choose an approved catalog option.
                              </p>
                              {b.estimatorAction ? (
                                <p className="muted">Next: {b.estimatorAction}</p>
                              ) : null}
                            </li>
                          );
                        }
                        return (
                          <li key={i}>
                            <strong>{b.title || "Needs attention"}</strong>
                            <p>{msg}</p>
                            {b.productDisplayName ? (
                              <p className="muted">Product: {b.productDisplayName}</p>
                            ) : null}
                            {b.room || b.category || b.quantity != null ? (
                              <p className="muted">
                                {[b.room, b.category, b.quantity != null ? `Qty ${b.quantity}` : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            ) : null}
                            {b.estimatorAction ? (
                              <p className="muted">Next: {b.estimatorAction}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="muted">Revision/republish remains blocked until these items are resolved.</p>
                  </section>
                ) : null}

                {reviewRequest.resolutionNote ? (
                  <section className="review-detail-section">
                    <h4>Estimator note</h4>
                    <p>{String(reviewRequest.resolutionNote)}</p>
                  </section>
                ) : null}

                {open && !resolved ? (
                  <label className="muted review-note-field">
                    Estimator note (required for no-change / reject)
                    <textarea
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      rows={2}
                      data-testid="review-resolution-note"
                    />
                  </label>
                ) : null}

                <section className="review-detail-section" data-testid="review-actions">
                  <h4>Available next actions</h4>
                  {resolved ? (
                    <p className="muted" data-testid="review-readonly">
                      This request is resolved. History is read-only.
                    </p>
                  ) : (
                    <div className="review-action-groups">
                      {operatorStatus === "new" ? (
                        <button
                          type="button"
                          className={actionClass("primary")}
                          disabled={busy}
                          data-testid="review-start"
                          onClick={() => void runAction("start", {})}
                        >
                          Start Review
                        </button>
                      ) : null}

                      {open && publicationStatus === "revoked" ? (
                        <button
                          type="button"
                          className={actionClass("primary")}
                          disabled={busy || !linkage?.intakeCaseId || !onOpenEstimate}
                          data-testid="review-open-current-estimate"
                          onClick={openCurrentEstimate}
                        >
                          Open Current Estimate
                        </button>
                      ) : null}

                      {open && publicationStatus !== "revoked" ? (
                        <>
                          <label className="muted review-apply-check">
                            <input
                              type="checkbox"
                              checked={applySelections}
                              disabled={!canApply || busy}
                              data-testid="review-apply-selections"
                              onChange={(e) => setApplySelections(e.target.checked)}
                            />{" "}
                            Apply customer selections to new revision (server-validated)
                            {!canApply ? (
                              <span className="muted"> — blocked until catalog issues are resolved</span>
                            ) : null}
                          </label>
                          <button
                            type="button"
                            className={actionClass("primary")}
                            disabled={busy || (applySelections && !canApply)}
                            data-testid="review-revise"
                            onClick={() => {
                              if (applySelections && !canApply) return;
                              void runAction("revise-estimate", {
                                applyCustomerSelections: applySelections && canApply
                              });
                            }}
                          >
                            Revise Estimate
                          </button>
                        </>
                      ) : null}

                      <button
                        type="button"
                        className={actionClass("secondary")}
                        disabled={busy || !open}
                        data-testid="review-no-change"
                        onClick={() =>
                          void runAction("resolve-no-change", { note: resolutionNote })
                        }
                      >
                        No Revision Needed
                      </button>

                      {linkage?.intakeCaseId && onOpenEstimate ? (
                        <button
                          type="button"
                          className={actionClass("secondary")}
                          disabled={busy}
                          data-testid="review-open-revised"
                          onClick={() => onOpenEstimate(String(linkage.intakeCaseId))}
                        >
                          Open source estimate
                        </button>
                      ) : null}

                      {hasBlockers ? (
                        <button
                          type="button"
                          className={actionClass("warning")}
                          disabled={busy || !linkage?.intakeCaseId || !onOpenEstimate}
                          data-testid="review-resolve-blocker"
                          onClick={openCurrentEstimate}
                        >
                          Resolve catalog blocker
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className={actionClass("destructive")}
                        disabled={busy || !open}
                        data-testid="review-reject"
                        onClick={() => void runAction("reject", { note: resolutionNote })}
                      >
                        Reject Request
                      </button>

                      {canRepublish ? (
                        <button
                          type="button"
                          className={actionClass("primary")}
                          disabled={busy || operatorStatus !== "revision_required"}
                          data-testid="review-republish"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Republish a replacement Digital Estimate link? This supersedes the prior customer link."
                              )
                            ) {
                              return;
                            }
                            void runAction(
                              "republish",
                              { confirm: true, note: resolutionNote || undefined },
                              { expectLink: true }
                            );
                          }}
                        >
                          Republish
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className={actionClass("secondary")}
                        disabled={busy || !oneTimeLink}
                        data-testid="review-copy-new-link"
                        onClick={() => void copyNewLink()}
                      >
                        Copy New Customer Link
                      </button>

                      <button
                        type="button"
                        className={actionClass("neutral")}
                        data-testid="review-return-list"
                        onClick={closeDrawer}
                      >
                        Return to list
                      </button>
                    </div>
                  )}
                </section>

                {oneTimeLink ? (
                  <div className="token-once" role="status" aria-live="polite">
                    <h4>One-time replacement link</h4>
                    <p>
                      Stable reusable customer link for the replacement publication. Use Replace Link
                      on the estimate if lost.
                    </p>
                  </div>
                ) : null}

                {timeline.length ? (
                  <section className="review-detail-section">
                    <h4>Timeline / history</h4>
                    <ul className="event-list" data-testid="review-timeline">
                      {timeline.map((ev) => (
                        <li key={String(ev.id)}>
                          {String(ev.eventType)} · {formatWhen(String(ev.createdAt))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : (
              <p className="muted">Unable to load this request.</p>
            )}
          </aside>
        </>
      ) : null}
    </section>
  );
}
