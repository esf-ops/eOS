import React, { useEffect, useState } from "react";
import EmailEstimateModal from "./components/email-estimate/EmailEstimateModal";
import { apiPatch, apiPost } from "./lib/api";
import { QuoteFilesBlock } from "./QuoteFilesBlock";
import {
  formatDateTime,
  formatMoneyStandard,
  formatMoneyWhole,
  formatShortDate,
  formatSqft
} from "./lib/format";
import {
  displayAccountColumn,
  labelHandoffDocStatus,
  labelQuoteSource,
  labelQuoteStatus
} from "./lib/labels";

// ---------------------------------------------------------------------------
// Local pure helpers — small enough to define here; also used by the main app
// table, but duplication is intentional to keep this component self-contained.
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function loc(row: Record<string, unknown>): string {
  const bits = [str(row.city), str(row.state), str(row.zip)].filter(Boolean);
  return bits.join(", ") || "—";
}

function statusPillClass(raw: unknown): string {
  const s = str(raw).toLowerCase();
  if (s === "sold" || s === "won") return "pill pill-status-won";
  if (s === "lost") return "pill pill-status-lost";
  if (
    s === "lead_submitted" ||
    s === "reviewing" ||
    s === "contacted" ||
    s === "quoted"
  )
    return "pill pill-status-lead";
  if (
    s === "draft" ||
    s === "sent" ||
    s === "revised" ||
    s === "follow_up" ||
    s === "testing_review" ||
    s === "submitted"
  )
    return "pill pill-status-active";
  if (s === "archived") return "pill pill-status-neutral";
  return "pill pill-status-neutral";
}

function handoffPillClass(status: unknown): string {
  const s = str(status).toLowerCase();
  if (s === "generated" || s === "reviewed" || s === "completed")
    return "pill pill-status-won";
  if (s === "voided") return "pill pill-status-lost";
  if (s === "draft") return "pill pill-status-active";
  return "pill pill-status-neutral";
}

function formatTimelineEntry(ev: Record<string, unknown>): {
  time: string;
  body: string;
} {
  const t = str(ev.type);
  const at = formatDateTime(ev.at);
  if (t === "status") {
    const oldS = labelQuoteStatus(ev.old_status);
    const newS = labelQuoteStatus(ev.new_status);
    return { time: at, body: `Status changed: ${oldS} → ${newS}` };
  }
  if (t === "monday") {
    return {
      time: at,
      body: `Monday sync: ${str(ev.action)} (${str(ev.status)})`
    };
  }
  return { time: at, body: JSON.stringify(ev) };
}

function latestHandoffDoc(
  detail: Record<string, unknown>,
  docType: string
): Record<string, unknown> | undefined {
  const rows = Array.isArray(detail.handoff_documents)
    ? (detail.handoff_documents as Record<string, unknown>[])
    : [];
  const matches = rows.filter((r) => str(r.doc_type) === docType);
  if (!matches.length) return undefined;
  return [...matches].sort((a, b) =>
    String(b.generated_at || "").localeCompare(String(a.generated_at || ""))
  )[0];
}

function pickDisplayTotal(r: Record<string, unknown>): number {
  const cdt = Number(r.customer_display_total);
  if (Number.isFinite(cdt) && cdt > 0) return cdt;
  return Number(r.grand_total) || 0;
}

function looksLikeEmail(value: string): boolean {
  const v = String(value || "").trim();
  return v.includes("@") && v.includes(".");
}

function buildEmailDefaultSubject(header: Record<string, unknown>): string {
  let subject = "Elite Stone Fabrication Estimate";
  const qn = str(header.quote_number);
  const cust = str(header.customer_name);
  const proj = str(header.project_name);
  if (qn) subject += ` ${qn}`;
  if (cust) subject += ` for ${cust}`;
  else if (proj) subject += ` — ${proj}`;
  return subject;
}

function pickDefaultToEmail(header: Record<string, unknown>, iu: Record<string, unknown>): string {
  const customer = str(header.customer_email);
  if (looksLikeEmail(customer)) return customer;
  const jobInfo =
    iu.job_info && typeof iu.job_info === "object" ? (iu.job_info as Record<string, unknown>) : {};
  const accountContact = str(jobInfo.account_contact_email);
  if (looksLikeEmail(accountContact)) return accountContact;
  return customer;
}

function pickDefaultCcEmail(header: Record<string, unknown>, iu: Record<string, unknown>): string {
  const salesRep = str(header.sales_rep);
  if (looksLikeEmail(salesRep)) return salesRep;
  const jobInfo =
    iu.job_info && typeof iu.job_info === "object" ? (iu.job_info as Record<string, unknown>) : {};
  const accountContact = str(jobInfo.account_contact_email);
  if (looksLikeEmail(accountContact) && accountContact !== pickDefaultToEmail(header, iu)) {
    return accountContact;
  }
  return "";
}

// ---------------------------------------------------------------------------
// HandoffDocBlock — moved from QuoteLibraryApp to keep it with modal content.
// ---------------------------------------------------------------------------

function HandoffDocBlock({ doc }: { doc: Record<string, unknown> }) {
  const dtype = str(doc.doc_type);
  const title =
    dtype === "moraware_entry"
      ? "Moraware Entry Doc"
      : dtype === "quickbooks_entry"
        ? "QuickBooks Entry Doc"
        : dtype;
  const payload =
    doc.payload && typeof doc.payload === "object"
      ? (doc.payload as Record<string, unknown>)
      : {};
  const warnings = Array.isArray(payload.missing_field_warnings)
    ? (payload.missing_field_warnings as unknown[])
    : [];
  return (
    <div className="handoff-card">
      <div className="handoff-card-head">
        <h4>{title}</h4>
        <span className={handoffPillClass(doc.status)}>
          {labelHandoffDocStatus(doc.status)}
        </span>
      </div>
      <p className="handoff-card-meta">
        Generated {formatDateTime(doc.generated_at)}
      </p>
      {warnings.length ? (
        <div className="banner banner-warn" style={{ marginTop: 10 }}>
          {warnings.map((w, i) => (
            <div key={i}>{str(w)}</div>
          ))}
        </div>
      ) : null}
      <details>
        <summary className="handoff-card-summary">Review payload</summary>
        <div className="payload-preview">
          {JSON.stringify(payload, null, 2)}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuoteDetailModal
// ---------------------------------------------------------------------------

type RunAction = (
  label: string,
  fn: () => Promise<string | void>
) => Promise<void>;

export type QuoteDetailModalProps = {
  /** Whether the modal is currently open. */
  open: boolean;
  /** The ID of the quote being viewed. */
  detailId: string;
  /** Full detail payload from /api/quote-library/quotes/:id. */
  detail: Record<string, unknown>;
  /** Revision list from /api/quote-library/quotes/:id/revisions. */
  revisions: Record<string, unknown>[];
  /** Bearer token for API calls inside action handlers. */
  sessionToken: string;
  /** Base URL for the Internal Estimate head (e.g. https://internal.eliteosfab.com). */
  internalBase: string;
  /** Base URL for the Custom Quote head (e.g. https://custom.eliteosfab.com). */
  customQuoteBase: string;
  /** Close the modal and return to the list. */
  onClose: () => void;
  /** Shared action runner that sets list msg/err state and refreshes data. */
  runAction: RunAction;
  /** Select a different revision to view (updates detailId in the parent). */
  onRevisionSelect: (id: string) => void;
};

export function QuoteDetailModal({
  open,
  detailId,
  detail,
  revisions,
  sessionToken,
  internalBase,
  customQuoteBase,
  onClose,
  runAction,
  onRevisionSelect
}: QuoteDetailModalProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // Reset the debug toggle whenever a different quote is opened.
  useEffect(() => {
    setShowRaw(false);
    setEmailModalOpen(false);
  }, [detailId]);

  // Close on Escape key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Derive email defaults unconditionally (before any early return) so hook order stays stable.
  const header = (detail.header as Record<string, unknown>) || {};
  const snap = (detail.calculation_snapshot as Record<string, unknown>) || {};
  const iu = (snap.internal_ui as Record<string, unknown>) || {};
  const emailDefaultSubject = buildEmailDefaultSubject(header);
  const emailDefaultTo = pickDefaultToEmail(header, iu);
  const emailDefaultCc = pickDefaultCcEmail(header, iu);

  if (!open) return null;

  // ── Derive display values from the detail payload ────────────────────────
  const mondayBoard = str(header.monday_board_id);
  const mondayItem = str(header.monday_item_id);
  const mondayUrl =
    mondayBoard && mondayItem
      ? `https://monday.com/boards/${encodeURIComponent(mondayBoard)}/pulses/${encodeURIComponent(mondayItem)}`
      : "";

  const account = displayAccountColumn(header);
  const isInternal = str(header.quote_source) === "internal_quote";
  const isCustomQuote = str(header.quote_source) === "custom_quote";
  const isArchived = Boolean(header.archived_at) || str(header.quote_status) === "archived";
  const warnings = (
    Array.isArray(detail.warnings) ? (detail.warnings as unknown[]) : []
  ).filter((w): w is string => typeof w === "string");

  const moraDoc = latestHandoffDoc(detail, "moraware_entry");
  const qbDoc = latestHandoffDoc(detail, "quickbooks_entry");
  const handoffDocs = (
    Array.isArray(detail.handoff_documents)
      ? (detail.handoff_documents as unknown[])
      : []
  ) as Record<string, unknown>[];

  // Resolve the latest revision id for the "Open in Internal Estimate" link.
  const latestRevId = (() => {
    const flagged = revisions.find((r) => r.is_current_revision === true);
    if (flagged?.id) return str(flagged.id);
    const byNumber = revisions.reduce<Record<string, unknown> | null>(
      (best, r) => {
        if (!best) return r;
        const bn = Number(best.revision_number) || 0;
        const rn = Number(r.revision_number) || 0;
        return rn >= bn ? r : best;
      },
      null
    );
    return str(byNumber?.id || header.id || detailId || "");
  })();

  return (
    <>
      {/*
       * The .ql-modal-wrap covers the full viewport and provides the dimmed
       * backdrop. Clicking it (but not the inner panel) closes the modal.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quote ${str(header.quote_number) || ""} detail`}
        className="ql-modal-wrap"
        onClick={onClose}
      >
        {/* The visual panel — click propagation is stopped here. */}
        <div
          className="ql-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Sticky header ──────────────────────────────────────────── */}
          <header className="ql-modal-header">
            <div className="drawer-header-top">
              <p className="drawer-eyebrow">Quote</p>
              <button
                type="button"
                className="drawer-close"
                aria-label="Close quote detail"
                onClick={onClose}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-id-row">
              <span className="quote-num quote-num-lg">
                {str(header.quote_number) || "—"}
              </span>
              <span className={statusPillClass(header.quote_status)}>
                {str(header.quote_status_display) ||
                  labelQuoteStatus(header.quote_status)}
              </span>
              <span className="pill pill-source">
                {labelQuoteSource(header.quote_source)}
              </span>
            </div>
            <h2 className="drawer-title">{account.primary || "—"}</h2>
            {account.subline || account.projectCell ? (
              <p className="drawer-subtitle">
                {[
                  account.subline ? `Customer: ${account.subline}` : "",
                  account.projectCell ? `Project: ${account.projectCell}` : ""
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </header>

          {/* ── Scrollable body ─────────────────────────────────────────── */}
          <div className="ql-modal-body">
            {warnings.length ? (
              <div className="banner banner-warn" role="alert">
                {warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}

            {/* Overview */}
            <section
              className="drawer-block"
              aria-labelledby="qdm-overview"
            >
              <h3 id="qdm-overview" className="sr-only">
                Overview
              </h3>
              <div className="stat-grid">
                <div className="stat-card stat-card-prominent">
                  <p className="stat-label">
                    {header.customer_display_total != null
                      ? "Customer estimate total"
                      : "Total"}
                  </p>
                  <p className="stat-value stat-value-lg">
                    {formatMoneyStandard(pickDisplayTotal(header))}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Sq ft</p>
                  <p className="stat-value">
                    {formatSqft(header.estimated_sqft)}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Created</p>
                  <p className="stat-value-sm">
                    {formatShortDate(header.created_at)}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Updated</p>
                  <p className="stat-value-sm">
                    {formatShortDate(header.updated_at)}
                  </p>
                </div>
              </div>

              <dl className="drawer-meta-dl">
                <div className="dl-row">
                  <dt>Account</dt>
                  <dd>{str(header.account_name) || "—"}</dd>
                </div>
                <div className="dl-row">
                  <dt>Customer</dt>
                  <dd>{str(header.customer_name) || "—"}</dd>
                </div>
                <div className="dl-row">
                  <dt>Project / Elite job name</dt>
                  <dd>{str(header.project_name) || "—"}</dd>
                </div>
                <div className="dl-row">
                  <dt>Location</dt>
                  <dd>
                    {[str(header.project_address), loc(header)]
                      .filter((x) => x && x !== "—")
                      .join(" · ") || "—"}
                  </dd>
                </div>
                {str(header.sales_rep) ? (
                  <div className="dl-row">
                    <dt>Sales rep</dt>
                    <dd>{str(header.sales_rep)}</dd>
                  </div>
                ) : null}
                {str(header.branch) ? (
                  <div className="dl-row">
                    <dt>Branch</dt>
                    <dd>{str(header.branch)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {/* Workflow */}
            <section className="drawer-block">
              <h3>Workflow</h3>
              {isInternal ? (
                <a
                  href={`${internalBase}?quoteId=${encodeURIComponent(latestRevId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-block btn-with-icon"
                >
                  <span>Open latest in Internal Estimate</span>
                  <span className="btn-arrow" aria-hidden>
                    ↗
                  </span>
                </a>
              ) : isCustomQuote ? (
                <a
                  href={`${customQuoteBase}?quoteId=${encodeURIComponent(str(header.id || detailId))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-block btn-with-icon"
                >
                  <span>Open in Custom Quote</span>
                  <span className="btn-arrow" aria-hidden>
                    ↗
                  </span>
                </a>
              ) : (
                <p className="muted small workflow-hint" style={{ margin: 0 }}>
                  No dedicated quote editor for this source in Quote Library.
                </p>
              )}

              <div className="workflow-group">
                <p className="workflow-group-label">Customer delivery</p>
                <div className="workflow-row">
                  {isInternal ? (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={!sessionToken}
                      title={
                        sessionToken
                          ? "Preview and dry-run email the customer estimate"
                          : "Sign in to email an estimate"
                      }
                      onClick={() => setEmailModalOpen(true)}
                    >
                      Email estimate
                    </button>
                  ) : (
                    <p className="muted small workflow-hint" style={{ margin: 0 }}>
                      Email estimate is available for internal estimates only.
                    </p>
                  )}
                </div>
              </div>

              <div className="workflow-group">
                <p className="workflow-group-label">Update status</p>
                <div className="workflow-row">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      void runAction("Sent", async () => {
                        await apiPatch(
                          `/api/quote-library/quotes/${detailId}/status`,
                          sessionToken,
                          { status: "sent" }
                        );
                      })
                    }
                  >
                    Mark sent
                  </button>
                  <button
                    type="button"
                    className="btn btn-status btn-status-sold"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Mark this quote as sold? After selling, generate Moraware and QuickBooks entry docs from this panel (no automatic writeback to Moraware or QuickBooks)."
                        )
                      ) {
                        return;
                      }
                      void runAction("Sold", async () => {
                        await apiPost(
                          `/api/quote-library/quotes/${detailId}/mark-sold`,
                          sessionToken,
                          {}
                        );
                        return "Marked sold. Next: generate Moraware Entry Doc, then QuickBooks Entry Doc, when ready.";
                      });
                    }}
                  >
                    Mark sold
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      if (!window.confirm("Mark this quote as lost?"))
                        return;
                      void runAction("Lost", async () => {
                        await apiPatch(
                          `/api/quote-library/quotes/${detailId}/status`,
                          sessionToken,
                          { status: "lost" }
                        );
                      });
                    }}
                  >
                    Mark lost
                  </button>
                </div>
              </div>

              <div className="workflow-group">
                <p className="workflow-group-label">Manage</p>
                <div className="workflow-row">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={isArchived}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Soft-archive this quote family? All revisions will be hidden from the default library until Show archived is enabled."
                        )
                      ) {
                        return;
                      }
                      void runAction("Archived", async () => {
                        const res = (await apiPost(
                          `/api/quote-library/quotes/${detailId}/archive`,
                          sessionToken,
                          { confirm: true }
                        )) as Record<string, unknown>;
                        if (res.ok !== true) {
                          throw new Error(String(res.error || "Archive failed"));
                        }
                        const archivedCount = Number(res.archived_count ?? 0);
                        onClose();
                        if (archivedCount > 1) {
                          return `Archived ${archivedCount} revision(s) in this quote family.`;
                        }
                        return "Quote archived.";
                      });
                    }}
                  >
                    {isArchived ? "Archived" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Create a duplicate quote from this record?"
                        )
                      )
                        return;
                      void runAction("Duplicate", async () => {
                        const res = (await apiPost(
                          `/api/quote-library/quotes/${detailId}/duplicate`,
                          sessionToken
                        )) as Record<string, unknown>;
                        const qn = str(res.quote_number);
                        const qid = str(res.quoteId);
                        return qn
                          ? `Duplicate created: ${qn}${qid ? ` (ID ${qid})` : ""}`
                          : "Duplicate created.";
                      });
                    }}
                  >
                    Duplicate quote
                  </button>
                  {mondayUrl ? (
                    <a
                      className="btn secondary btn-with-icon"
                      href={mondayUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Open Monday item</span>
                      <span className="btn-arrow" aria-hidden>
                        ↗
                      </span>
                    </a>
                  ) : null}
                </div>
              </div>

              <details className="quiet-detail">
                <summary>Workflow guidance</summary>
                {isInternal ? (
                  <p>
                    <strong>Open latest in Internal Estimate</strong> loads the
                    full saved snapshot for the latest revision. Use{" "}
                    <strong>Save revision</strong> there to freeze the current
                    state and start R2/R3; <strong>Update quote</strong> edits
                    the latest revision in place; <strong>Restore</strong> copies
                    an older revision forward as a new latest.
                  </p>
                ) : isCustomQuote ? (
                  <p>
                    <strong>Open in Custom Quote</strong> opens the off-program
                    material worksheet head. Custom quotes do not use Internal
                    Estimate revision workflow.
                  </p>
                ) : null}
                <p>
                  <strong>After Mark sold,</strong> use{" "}
                  <em>Generate Moraware doc</em> and{" "}
                  <em>Generate QuickBooks doc</em> below. Documents are stored
                  for staff review only — there is no automatic writeback to
                  Moraware or QuickBooks.
                </p>
              </details>
            </section>

            {/* Revisions (internal quotes only) */}
            {isInternal ? (
              <section className="drawer-block">
                <h3>Revisions</h3>
                {revisions.length ? (
                  <ul className="revision-list">
                    {revisions.map((rev) => {
                      const revId = str(rev.id);
                      const isLatest = rev.is_current_revision === true;
                      const isViewing = revId === detailId;
                      return (
                        <li
                          key={revId}
                          className={`revision-row${isLatest ? " is-latest" : ""}${isViewing ? " is-viewing" : ""}`}
                        >
                          <div className="revision-id">
                            <span className="revision-chip">
                              {str(rev.revision_label) || "R?"}
                            </span>
                            <div className="revision-id-badges">
                              {isLatest ? (
                                <span className="pill pill-live">Latest</span>
                              ) : null}
                              {isViewing ? (
                                <span className="pill pill-status-active">
                                  Viewing
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="revision-meta">
                            <p className="revision-total">
                              {formatMoneyStandard(rev.grand_total)}
                            </p>
                            <p className="revision-meta-sub muted-note">
                              Updated {formatShortDate(rev.updated_at)}
                              {str(rev.quote_number) ? (
                                <>
                                  {" · "}
                                  <code className="revision-qnum">
                                    {str(rev.quote_number)}
                                  </code>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <div className="revision-actions">
                            {!isViewing ? (
                              <button
                                type="button"
                                className="btn ghost btn-xs"
                                onClick={() => onRevisionSelect(revId)}
                              >
                                View
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn ghost btn-xs btn-with-icon"
                              onClick={() =>
                                window.open(
                                  `${internalBase}/?quoteId=${encodeURIComponent(revId)}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                            >
                              <span>Open IE</span>
                              <span className="btn-arrow" aria-hidden>
                                ↗
                              </span>
                            </button>
                            {!isLatest ? (
                              <button
                                type="button"
                                className="btn ghost btn-xs"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Restore ${str(rev.revision_label) || "this revision"} as a new latest revision? Prior revisions stay in history.`
                                    )
                                  ) {
                                    return;
                                  }
                                  void runAction(
                                    "Restore revision",
                                    async () => {
                                      const res = (await apiPost(
                                        `/api/quote-library/quotes/${revId}/restore-as-revision`,
                                        sessionToken,
                                        {}
                                      )) as Record<string, unknown>;
                                      const newId = str(
                                        res.quoteId ?? res.quote_id
                                      );
                                      const qn = str(res.quote_number);
                                      if (newId) onRevisionSelect(newId);
                                      return qn
                                        ? `New latest revision ${qn} created from ${str(rev.revision_label) || "snapshot"}.`
                                        : "New latest revision created.";
                                    }
                                  );
                                }}
                              >
                                Restore
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="muted-note">
                    No revision rows found for this quote family.
                  </p>
                )}
              </section>
            ) : null}

            {/* Handoff documents */}
            <section className="drawer-block">
              <h3>Handoff documents</h3>
              <p className="muted-note section-lede">
                Generate handoff documents after Mark sold. Stored for staff
                review only — no automatic writeback to Moraware or QuickBooks.
              </p>
              <div className="handoff-grid">
                <div
                  className={`handoff-status-card${moraDoc ? "" : " is-empty"}`}
                >
                  <div className="handoff-status-head">
                    <p className="handoff-status-title">Moraware Entry Doc</p>
                    <span className={handoffPillClass(moraDoc?.status)}>
                      {labelHandoffDocStatus(moraDoc?.status)}
                    </span>
                  </div>
                  <p className="handoff-status-meta">
                    {moraDoc
                      ? `Generated ${formatDateTime(moraDoc.generated_at)}`
                      : "Not generated yet."}
                  </p>
                  <button
                    type="button"
                    className="btn secondary btn-block"
                    onClick={() =>
                      void runAction("Moraware doc", async () => {
                        await apiPost(
                          `/api/quote-library/quotes/${detailId}/generate-moraware-entry-doc`,
                          sessionToken
                        );
                        return "Moraware Entry Doc generated — review payload in document history.";
                      })
                    }
                  >
                    {moraDoc
                      ? "Regenerate Moraware doc"
                      : "Generate Moraware doc"}
                  </button>
                </div>
                <div
                  className={`handoff-status-card${qbDoc ? "" : " is-empty"}`}
                >
                  <div className="handoff-status-head">
                    <p className="handoff-status-title">QuickBooks Entry Doc</p>
                    <span className={handoffPillClass(qbDoc?.status)}>
                      {labelHandoffDocStatus(qbDoc?.status)}
                    </span>
                  </div>
                  <p className="handoff-status-meta">
                    {qbDoc
                      ? `Generated ${formatDateTime(qbDoc.generated_at)}`
                      : "Not generated yet."}
                  </p>
                  <button
                    type="button"
                    className="btn secondary btn-block"
                    onClick={() =>
                      void runAction("QuickBooks doc", async () => {
                        await apiPost(
                          `/api/quote-library/quotes/${detailId}/generate-quickbooks-entry-doc`,
                          sessionToken
                        );
                        return "QuickBooks Entry Doc generated — review payload in document history.";
                      })
                    }
                  >
                    {qbDoc
                      ? "Regenerate QuickBooks doc"
                      : "Generate QuickBooks doc"}
                  </button>
                </div>
              </div>
              {handoffDocs.length ? (
                <details className="quiet-detail">
                  <summary>
                    Document history ({handoffDocs.length}{" "}
                    {handoffDocs.length === 1 ? "document" : "documents"})
                  </summary>
                  <div className="handoff-doc-list">
                    {handoffDocs.map((h, i) => (
                      <HandoffDocBlock key={i} doc={h} />
                    ))}
                  </div>
                </details>
              ) : null}
            </section>

            {/* Quote Files */}
            <QuoteFilesBlock quoteId={detailId} token={sessionToken} />

            {/* Measurements & estimate */}
            <section className="drawer-block">
              <h3>Measurements &amp; estimate</h3>
              <p className="drawer-summary-text">
                {str(snap.inputSummary) ||
                  "No measurement summary on snapshot."}
              </p>
              <dl className="drawer-meta-dl drawer-meta-dl-compact">
                <div className="dl-row">
                  <dt>Material / pricing</dt>
                  <dd>
                    {str(
                      (iu as { internal_material_basis?: string })
                        .internal_material_basis
                    ) || "—"}
                  </dd>
                </div>
                {iu.sinks || iu.cooktops || iu.cutouts ? (
                  <div className="dl-row">
                    <dt>Sinks · cooktops · cutouts</dt>
                    <dd>
                      {[str(iu.sinks), str(iu.cooktops), str(iu.cutouts)]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                ) : null}
                <div className="dl-row">
                  <dt>Rooms</dt>
                  <dd>
                    {(detail.rooms as unknown[] | undefined)?.length ?? 0}
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Line items</dt>
                  <dd>
                    {(detail.line_items as unknown[] | undefined)?.length ?? 0}
                  </dd>
                </div>
                {Array.isArray(iu.custom_passthrough_items) &&
                (iu.custom_passthrough_items as unknown[]).length ? (
                  <div className="dl-row">
                    <dt>Passthrough items</dt>
                    <dd>
                      {(iu.custom_passthrough_items as unknown[]).length}
                    </dd>
                  </div>
                ) : null}
                {Array.isArray(iu.custom_line_items) &&
                (iu.custom_line_items as unknown[]).length ? (
                  <div className="dl-row">
                    <dt>Custom line items</dt>
                    <dd>{(iu.custom_line_items as unknown[]).length}</dd>
                  </div>
                ) : null}
              </dl>
              {Array.isArray(detail.rooms) &&
              (detail.rooms as Record<string, unknown>[]).length ? (
                <details className="quiet-detail">
                  <summary>
                    Rooms ({(detail.rooms as unknown[]).length})
                  </summary>
                  <ul className="drawer-line-list">
                    {(detail.rooms as Record<string, unknown>[])
                      .slice(0, 12)
                      .map((room, idx) => (
                        <li key={idx}>
                          {str(room.room_name) || "Room"} — countertop{" "}
                          {formatSqft(room.countertop_sqft)}
                          {room.backsplash_sqft != null &&
                          Number(room.backsplash_sqft) > 0
                            ? ` · backsplash ${Number(room.backsplash_sqft).toLocaleString()} sf`
                            : null}
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
              {Array.isArray(snap.material_breakdown) &&
              (snap.material_breakdown as unknown[]).length ? (
                <details className="quiet-detail">
                  <summary>
                    Material / color breakdown (
                    {(snap.material_breakdown as unknown[]).length})
                  </summary>
                  <ul className="drawer-line-list">
                    {(snap.material_breakdown as Record<string, unknown>[])
                      .slice(0, 24)
                      .map((ln, idx) => (
                        <li key={idx}>
                          {str(ln.room)} — {str(ln.piece)} ·{" "}
                          {str(ln.materialGroup)}
                          {ln.materialColor
                            ? ` · ${str(ln.materialColor)}`
                            : ""}{" "}
                          — {Number(ln.sqft ?? 0).toLocaleString()} sf · $
                          {Number(ln.wholesaleSubtotal ?? 0).toFixed(2)}
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </section>

            {/* Timeline */}
            <section className="drawer-block">
              <h3>Timeline</h3>
              <ul className="timeline">
                <li>
                  <div className="tl-time">
                    {formatDateTime(header.created_at)}
                  </div>
                  Quote created
                </li>
                {(Array.isArray(detail.status_timeline)
                  ? detail.status_timeline
                  : []
                )
                  .slice(0, 50)
                  .map((ev: unknown, i: number) => {
                    const e = ev as Record<string, unknown>;
                    const { time, body } = formatTimelineEntry(e);
                    return (
                      <li key={i}>
                        <div className="tl-time">{time}</div>
                        {body}
                      </li>
                    );
                  })}
                {(Array.isArray(detail.forecast_events)
                  ? detail.forecast_events
                  : []
                )
                  .slice(0, 15)
                  .map((ev: unknown, i: number) => {
                    const e = ev as Record<string, unknown>;
                    return (
                      <li key={`f-${i}`}>
                        <div className="tl-time">
                          {formatDateTime(e.event_at)}
                        </div>
                        Forecast: {str(e.event_type)}
                        {e.quote_value != null
                          ? ` · Value ${formatMoneyWhole(e.quote_value)}`
                          : null}
                      </li>
                    );
                  })}
                {detail.lead_assignment &&
                typeof detail.lead_assignment === "object" ? (
                  <li>
                    <div className="tl-time">
                      {formatDateTime(
                        (detail.lead_assignment as Record<string, unknown>)
                          .created_at
                      )}
                    </div>
                    Lead routing:{" "}
                    {str(
                      (detail.lead_assignment as Record<string, unknown>)
                        .assignment_source
                    )}{" "}
                    →{" "}
                    {str(
                      (detail.lead_assignment as Record<string, unknown>)
                        .assigned_sales_rep
                    ) || "—"}
                  </li>
                ) : null}
                {(Array.isArray(detail.monday_sync_log)
                  ? detail.monday_sync_log
                  : []
                )
                  .slice(0, 12)
                  .map((ev: unknown, i: number) => {
                    const e = ev as Record<string, unknown>;
                    return (
                      <li key={`m-${i}`}>
                        <div className="tl-time">
                          {formatDateTime(e.created_at)}
                        </div>
                        Monday: {str(e.action)} — {str(e.status)}
                      </li>
                    );
                  })}
              </ul>
            </section>

            {/* Admin / debug */}
            <section className="drawer-block debug-accordion">
              <button
                type="button"
                className="btn ghost btn-xs"
                onClick={() => setShowRaw((s) => !s)}
              >
                {showRaw ? "Hide" : "Show"} admin / debug — raw calculation
                snapshot
              </button>
              {showRaw ? (
                <pre>
                  {JSON.stringify(detail.calculation_snapshot ?? {}, null, 2)}
                </pre>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      <EmailEstimateModal
        open={emailModalOpen && isInternal}
        onClose={() => setEmailModalOpen(false)}
        quoteId={detailId}
        sessionToken={sessionToken}
        defaultToEmail={emailDefaultTo}
        defaultCcEmail={emailDefaultCc}
        defaultSubject={emailDefaultSubject}
        quoteNumber={str(header.quote_number) || null}
        revisionLabel={str(header.revision_label) || null}
      />
    </>
  );
}
