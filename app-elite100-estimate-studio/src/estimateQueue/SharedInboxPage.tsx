import React, { useCallback, useEffect, useState } from "react";
import {
  classifySharedInboxError,
  fetchSharedInbox,
  importSharedInboxMessage,
  isTransientHttpError,
  newImportIdempotencyKey
} from "../lib/sharedInboxApi.mjs";

export type SharedInboxPageProps = {
  authToken: string | null;
  onOpenEstimate: (caseId: string, options?: { openTarget?: string }) => void;
};

type InboxAttachment = {
  attachmentKey?: string | null;
  filename: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  supportedForTakeoff?: boolean;
  supportedForImport?: boolean;
  support?: string;
};

type PrimaryAction = {
  key: string;
  label: string;
  openTarget?: string;
  mutates?: boolean;
};

type InboxRow = {
  messageKey: string;
  receivedAt?: string | null;
  sender?: { displayName?: string; safeAddressLabel?: string; emailPresent?: boolean };
  subject?: string;
  bodyPreview?: string;
  attachments?: InboxAttachment[];
  attachmentCount?: number;
  supportedAttachmentCount?: number;
  supportState?: string;
  supportExplanation?: string;
  importState?: string;
  intakeCaseId?: string | null;
  estimateId?: string | null;
  activeEstimateId?: string | null;
  assignedEstimator?: { userId?: string | null; label?: string };
  customerLabel?: string;
  projectLabel?: string;
  aiTakeoff?: { state?: string; takeoffJobId?: string | null; reviewReady?: boolean; label?: string };
  operationalState?: { key?: string; label?: string; openTarget?: string } | null;
  primaryAction?: PrimaryAction;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "not_imported", label: "Not imported" },
  { id: "imported", label: "Imported" },
  { id: "needs_review", label: "Needs review" },
  { id: "takeoff_ready", label: "AI Takeoff ready" }
] as const;

function formatReceived(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function stateChip(row: InboxRow): { label: string; tone: string } {
  switch (row.importState) {
    case "not_imported":
      return { label: "Not imported", tone: "neutral" };
    case "import_failed":
      return { label: "Import failed", tone: "danger" };
    case "takeoff_processing":
      return { label: "Takeoff processing", tone: "warn" };
    case "takeoff_ready":
      return { label: "Takeoff ready", tone: "accent" };
    case "needs_manual_review":
      return { label: "Needs review", tone: "warn" };
    case "unsupported_attachment":
      return { label: "Unsupported attachment", tone: "warn" };
    case "already_imported":
    case "imported":
      return { label: "Imported", tone: "ok" };
    default:
      return { label: row.importState || "Not imported", tone: "neutral" };
  }
}

/**
 * Shared Inbox — quote-request mailbox workspace.
 * Preview/refresh/open are read-only. Import is explicit and waits for backend success.
 */
export default function SharedInboxPage({ authToken, onOpenEstimate }: SharedInboxPageProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [items, setItems] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [mailboxDisplay, setMailboxDisplay] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const selected = items.find((r) => r.messageKey === selectedKey) || null;

  const loadInbox = useCallback(
    async (opts?: { preserveOnTransient?: boolean }) => {
      if (!authToken) {
        setRefreshError("Sign in to view Shared Inbox.");
        return;
      }
      setLoading(true);
      setRefreshError(null);
      try {
        const res = (await fetchSharedInbox(authToken, {
          state: filter,
          search: searchApplied || undefined,
          limit: 25,
          offset: 0
        })) as {
          items?: InboxRow[];
          mailboxDisplay?: string | null;
          total?: number;
        };
        setItems(Array.isArray(res.items) ? res.items : []);
        setMailboxDisplay(res.mailboxDisplay ?? null);
        setTotal(Number(res.total) || 0);
      } catch (e) {
        const classified = classifySharedInboxError(e);
        if (opts?.preserveOnTransient !== false && isTransientHttpError(e)) {
          // Keep currently displayed rows on 502/503/504.
          setRefreshError(classified.message);
        } else {
          setRefreshError(classified.message);
          if (!isTransientHttpError(e)) {
            setItems([]);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [authToken, filter, searchApplied]
  );

  useEffect(() => {
    void loadInbox({ preserveOnTransient: true });
  }, [loadInbox]);

  async function runPrimaryAction(row: InboxRow) {
    setActionError(null);
    const action = row.primaryAction;
    if (!action) return;

    const navigates =
      action.key === "open_estimate" ||
      action.key === "view_progress" ||
      action.key === "review_ai_takeoff" ||
      (action.key === "review_request" && row.intakeCaseId && !action.mutates);

    if (navigates && row.intakeCaseId) {
      onOpenEstimate(row.intakeCaseId, { openTarget: action.openTarget || "takeoff" });
      return;
    }

    const needsImport =
      action.key === "import_and_open" ||
      action.key === "retry_import" ||
      action.key === "create_manual_estimate" ||
      (action.key === "review_request" && action.mutates);

    if (!needsImport) {
      if (row.intakeCaseId) {
        onOpenEstimate(row.intakeCaseId, { openTarget: action.openTarget || "takeoff" });
      }
      return;
    }

    if (!authToken || importingKey) return;
    setImportingKey(row.messageKey);
    try {
      const result = (await importSharedInboxMessage(authToken, row.messageKey, {
        idempotencyKey: newImportIdempotencyKey()
      })) as {
        ok?: boolean;
        intakeCaseId?: string | null;
        alreadyImported?: boolean;
        item?: InboxRow | null;
        primaryAction?: PrimaryAction;
      };

      // Refresh row from confirmed backend result — never optimistic success.
      await loadInbox({ preserveOnTransient: true });

      const caseId = result.intakeCaseId || result.item?.intakeCaseId || null;
      if (caseId) {
        const openTarget =
          result.item?.primaryAction?.openTarget ||
          result.primaryAction?.openTarget ||
          action.openTarget ||
          "takeoff";
        onOpenEstimate(caseId, { openTarget });
      } else {
        setActionError(
          "The import may have completed, but its result could not be confirmed. Refresh the inbox before retrying."
        );
      }
    } catch (e) {
      const classified = classifySharedInboxError(e);
      setActionError(classified.message);
      if (classified.code === "message_already_imported") {
        await loadInbox({ preserveOnTransient: true });
      }
    } finally {
      setImportingKey(null);
    }
  }

  return (
    <div className="eq-root si-root" data-testid="shared-inbox-page">
      <header className="eq-header">
        <div>
          <h1 className="eq-title" data-testid="shared-inbox-title">
            Shared Inbox
          </h1>
          <p className="eq-subtitle">
            Quote requests received through the shared estimating mailbox.
            {mailboxDisplay ? ` (${mailboxDisplay})` : ""}
          </p>
        </div>
        <div className="eq-header-actions">
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="shared-inbox-refresh"
            disabled={loading || !authToken}
            onClick={() => void loadInbox({ preserveOnTransient: true })}
          >
            {loading ? "Refreshing…" : "Refresh inbox"}
          </button>
        </div>
      </header>

      {refreshError ? (
        <div className="eq-state eq-state--warn" data-testid="shared-inbox-refresh-error" role="status">
          {refreshError}
        </div>
      ) : null}
      {actionError ? (
        <div className="eq-state eq-state--error" data-testid="shared-inbox-action-error" role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="si-filters" data-testid="shared-inbox-filters">
        <div className="si-filter-chips" role="tablist" aria-label="Inbox filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`eq-chip ${filter === f.id ? "is-active" : ""}`}
              data-testid={`shared-inbox-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          className="si-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearchApplied(search.trim());
          }}
        >
          <label className="eq-sr-only" htmlFor="shared-inbox-search">
            Search inbox
          </label>
          <input
            id="shared-inbox-search"
            data-testid="shared-inbox-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sender, subject, attachment…"
            autoComplete="off"
          />
          <button type="submit" className="eq-btn-ghost" data-testid="shared-inbox-search-submit">
            Search
          </button>
        </form>
      </div>

      <div className="si-layout">
        <div className="si-list" data-testid="shared-inbox-list">
          {loading && items.length === 0 ? (
            <div className="eq-state" data-testid="shared-inbox-loading">
              Loading Shared Inbox…
            </div>
          ) : null}
          {!loading && items.length === 0 ? (
            <div className="eq-state" data-testid="shared-inbox-empty">
              No quote requests match this view.
            </div>
          ) : null}
          {items.map((row) => {
            const chip = stateChip(row);
            const isImporting = importingKey === row.messageKey;
            const filenames = (row.attachments || [])
              .slice(0, 3)
              .map((a) => a.filename)
              .filter(Boolean);
            return (
              <article
                key={row.messageKey}
                className={`si-row ${selectedKey === row.messageKey ? "is-selected" : ""}`}
                data-testid="shared-inbox-row"
                data-import-state={row.importState}
                data-message-key={row.messageKey}
              >
                <button
                  type="button"
                  className="si-row-main"
                  data-testid="shared-inbox-row-open"
                  onClick={() => setSelectedKey(row.messageKey)}
                >
                  <div className="si-row-top">
                    <strong className="si-sender">{row.sender?.displayName || "Unknown sender"}</strong>
                    <time className="si-received" dateTime={row.receivedAt || undefined}>
                      {formatReceived(row.receivedAt)}
                    </time>
                  </div>
                  <div className="si-subject">{row.subject || "(no subject)"}</div>
                  <p className="si-preview">{row.bodyPreview || ""}</p>
                  <div className="si-meta">
                    <span className={`si-chip si-chip--${chip.tone}`}>{chip.label}</span>
                    <span className="si-meta-item">
                      {row.attachmentCount || 0} attachment
                      {(row.attachmentCount || 0) === 1 ? "" : "s"}
                      {filenames.length ? ` · ${filenames.join(", ")}` : ""}
                    </span>
                    {(row.supportedAttachmentCount || 0) > 0 ? (
                      <span className="si-meta-item si-ok">Supported plan</span>
                    ) : (
                      <span className="si-meta-item">No supported plan</span>
                    )}
                    <span className="si-meta-item">
                      {row.assignedEstimator?.label || "Unassigned"}
                    </span>
                    {row.aiTakeoff?.label ? (
                      <span className="si-meta-item">AI Takeoff: {row.aiTakeoff.label}</span>
                    ) : null}
                  </div>
                </button>
                <div className="si-row-actions">
                  <button
                    type="button"
                    className="eq-btn-primary"
                    data-testid="shared-inbox-primary-action"
                    data-action-key={row.primaryAction?.key || ""}
                    disabled={Boolean(importingKey) || !row.primaryAction}
                    onClick={() => void runPrimaryAction(row)}
                  >
                    {isImporting ? "Importing…" : row.primaryAction?.label || "Open"}
                  </button>
                  <button
                    type="button"
                    className="eq-btn-ghost eq-btn-small"
                    data-testid="shared-inbox-view-details"
                    onClick={() => setSelectedKey(row.messageKey)}
                  >
                    View message details
                  </button>
                </div>
              </article>
            );
          })}
          {items.length > 0 ? (
            <p className="eq-muted si-count" data-testid="shared-inbox-count">
              Showing {items.length} of {total} (newest first)
            </p>
          ) : null}
        </div>

        <aside
          className="si-detail"
          data-testid="shared-inbox-detail"
          aria-label="Message details"
        >
          {!selected ? (
            <div className="eq-muted">Select a message to view details. Opening details does not import.</div>
          ) : (
            <div>
              <h2 className="si-detail-title">Message details</h2>
              <dl className="si-detail-dl">
                <div>
                  <dt>Sender</dt>
                  <dd>{selected.sender?.displayName || "Unknown sender"}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{formatReceived(selected.receivedAt)}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{selected.subject || "(no subject)"}</dd>
                </div>
                <div>
                  <dt>Preview</dt>
                  <dd className="si-detail-body">{selected.bodyPreview || "—"}</dd>
                </div>
                <div>
                  <dt>Support</dt>
                  <dd>{selected.supportExplanation || selected.supportState || "—"}</dd>
                </div>
                <div>
                  <dt>Import status</dt>
                  <dd>{stateChip(selected).label}</dd>
                </div>
                <div>
                  <dt>Linked estimate</dt>
                  <dd>
                    {selected.activeEstimateId || selected.estimateId
                      ? "Estimate linked"
                      : selected.intakeCaseId
                        ? "Intake linked — open to continue"
                        : "Not imported"}
                  </dd>
                </div>
                <div>
                  <dt>Estimator</dt>
                  <dd>{selected.assignedEstimator?.label || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>AI Takeoff</dt>
                  <dd>{selected.aiTakeoff?.label || "Not started"}</dd>
                </div>
                <div>
                  <dt>Customer / project</dt>
                  <dd>
                    {selected.customerLabel || "Customer not identified"} ·{" "}
                    {selected.projectLabel || "Project not named"}
                  </dd>
                </div>
              </dl>
              <h3 className="si-detail-sub">Attachments</h3>
              {(selected.attachments || []).length === 0 ? (
                <p className="eq-muted">No attachments</p>
              ) : (
                <ul className="si-att-list" data-testid="shared-inbox-attachment-list">
                  {(selected.attachments || []).map((a, idx) => (
                    <li key={a.attachmentKey || `${a.filename}-${idx}`}>
                      <span>{a.filename}</span>
                      <span className="eq-muted">
                        {a.supportedForTakeoff ? " · Supported for Takeoff" : " · Not supported for Takeoff"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="eq-muted si-detail-note">
                Secure plan viewing and download are not available in this phase. Attachment metadata
                only.
              </p>
              {/* Outlook compose / folder / download controls are intentionally not present. */}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
