import React from "react";

export type GovernedColumn = {
  columnId: string;
  title?: string | null;
  type?: string | null;
  text?: string | null;
};

export type Account = {
  id: string;
  accountDirectoryAccountId?: string | null;
  mondayItemId?: string | null;
  accountName: string;
  mondayUrl?: string | null;
  status?: string | null;
  lastContact?: string | null;
  nextContact?: string | null;
  market?: string | null;
  branch?: string | null;
  accountType?: string | null;
  sampleProgram?: string | null;
  currentPrimarySupplier?: string | null;
  primaryPainPoint?: string | null;
  esfSolution?: string | null;
  nextStrategicMilestone?: string | null;
  targetSqFtPerMonth?: number | string | null;
  keyContact?: string | null;
  estKitchensPerMonth?: number | string | null;
  assignedUserId?: string | null;
  mondayAssignedUserId?: string | null;
  description?: string | null;
  syncedAt?: string | null;
  columns?: GovernedColumn[];
  intelligence?: {
    recommendedTier?: string | null;
    strategicPlay?: string | null;
    recommendedMonthlyTarget?: number | null;
    nextActions?: string[];
    performance?: {
      trailing12SqFt?: number;
      trailing12Jobs?: number;
      openTrailing12SqFt?: number;
      averageJobSqFt?: number;
      lastJobDate?: string | null;
      matchedReportNames?: string[];
      matchConfidence?: string;
      yearOverYearPct?: number | null;
    } | null;
  } | null;
};

export type WorkspaceSection = "summary" | "activity" | "subitems" | "files" | "docs";

export type AccountWorkspaceState = {
  account?: Account;
  intelligence?: Account["intelligence"];
  updates?: Array<Record<string, unknown>>;
  subitems?: Array<Record<string, unknown>>;
  files?: Array<Record<string, unknown>>;
  docs?: Array<Record<string, unknown>>;
  activities?: Array<Record<string, unknown>>;
  cursors?: Partial<Record<"updates" | "subitems" | "files" | "docs" | "activities", string | null>>;
  loading?: Partial<Record<"detail" | "updates" | "subitems" | "files" | "docs" | "activities", boolean>>;
  errors?: Partial<Record<"detail" | "updates" | "subitems" | "files" | "docs" | "activities", string>>;
  notFound?: boolean;
};

const SECTIONS: { id: WorkspaceSection; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "activity", label: "Activity" },
  { id: "subitems", label: "Subitems" },
  { id: "files", label: "Files" },
  { id: "docs", label: "Docs" }
];

function display(value: unknown, fallback = "Not set") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatBytes(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "Size unknown";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function columnLines(columns: unknown) {
  if (!Array.isArray(columns)) return [];
  return columns
    .map((col) => {
      if (!col || typeof col !== "object") return null;
      const row = col as GovernedColumn;
      const text = String(row.text || "").trim();
      if (!text) return null;
      return { id: row.columnId, title: row.title || row.columnId, text };
    })
    .filter((row): row is { id: string; title: string; text: string } => Boolean(row));
}

function ArrowIcon() {
  return <span aria-hidden="true" className="arrow-icon">→</span>;
}

function Fact({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{display(value)}</strong>
    </div>
  );
}

function SectionStatus({ loading, error, empty, emptyLabel }: { loading?: boolean; error?: string; empty?: boolean; emptyLabel: string }) {
  if (loading) return <p className="workspace-muted">Loading…</p>;
  if (error) return <p className="workspace-muted">{error === "not_found" ? "This account is not available." : "This section could not be loaded."}</p>;
  if (empty) return <p className="workspace-muted">{emptyLabel}</p>;
  return null;
}

export default function Account360Workspace({
  account,
  workspace,
  section,
  onSection,
  writeError,
  mondayWriteEnabled,
  noteBody,
  followSummary,
  followDate,
  onNoteBody,
  onFollowSummary,
  onFollowDate,
  onSaveNote,
  onSaveFollowUp,
  onPatchStatus,
  onConvertFollowUp,
  onLoadMore
}: {
  account: Account;
  workspace: AccountWorkspaceState | null;
  section: WorkspaceSection;
  onSection: (tab: WorkspaceSection) => void;
  writeError: string | null;
  mondayWriteEnabled?: boolean;
  noteBody: string;
  followSummary: string;
  followDate: string;
  onNoteBody: (value: string) => void;
  onFollowSummary: (value: string) => void;
  onFollowDate: (value: string) => void;
  onSaveNote: () => void;
  onSaveFollowUp: () => void;
  onPatchStatus: (status: string) => void;
  onConvertFollowUp: (action: string) => void;
  onLoadMore: (key: "updates" | "subitems" | "files" | "docs" | "activities") => void;
}) {
  const detail = workspace?.account || account;
  const columns = columnLines(detail.columns);
  const updates = workspace?.updates || [];
  const activities = workspace?.activities || [];
  const subitems = workspace?.subitems || [];
  const files = workspace?.files || [];
  const docs = workspace?.docs || [];

  if (workspace?.notFound) {
    return (
      <div className="workspace-ops">
        <p className="kicker">Account workspace</p>
        <p>This account is not available.</p>
      </div>
    );
  }

  return (
    <div className="workspace-ops">
      {mondayWriteEnabled === false && (
        <p className="kicker">Monday writes are disabled. Account fields stay read-only until separately approved.</p>
      )}
      <div className="workspace-tabs" role="tablist" aria-label="Account 360 sections">
        {SECTIONS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            className={section === tab.id ? "active" : ""}
            onClick={() => onSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {writeError && <div className="field-error">{writeError}</div>}

      {section === "summary" && (
        <div className="workspace-section">
          <SectionStatus loading={workspace?.loading?.detail} error={workspace?.errors?.detail} />
          {detail.description && <p>{detail.description}</p>}
          <div className="account-facts account-facts-wide">
            <Fact label="Ownership" value={detail.mondayAssignedUserId ? `Monday person ${detail.mondayAssignedUserId}` : "Unassigned"} />
            <Fact label="Status" value={detail.status} />
            <Fact label="Key contact" value={detail.keyContact} />
            <Fact label="Last contact" value={detail.lastContact} />
            <Fact label="Next contact" value={detail.nextContact} />
            <Fact label="Market" value={detail.market} />
            <Fact label="Branch" value={detail.branch} />
            <Fact label="Type" value={detail.accountType} />
            <Fact label="Sample program" value={detail.sampleProgram} />
            <Fact label="Supplier" value={detail.currentPrimarySupplier} />
            <Fact label="Pain point" value={detail.primaryPainPoint} />
            <Fact label="ESF solution" value={detail.esfSolution} />
            <Fact label="Next milestone" value={detail.nextStrategicMilestone} />
            <Fact label="Target SQ FT / month" value={detail.targetSqFtPerMonth} />
            <Fact label="Est. kitchens / month" value={detail.estKitchensPerMonth} />
            <Fact label="Synced" value={detail.syncedAt ? String(detail.syncedAt).slice(0, 16) : null} />
          </div>
          {columns.length > 0 && (
            <div>
              <p className="kicker">Governed Monday fields</p>
              <div className="workspace-columns">
                {columns.map((col) => (
                  <div key={col.id}>
                    <span>{col.title}</span>
                    <strong>{col.text}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              onPatchStatus(String(fd.get("status") || ""));
            }}
          >
            <p className="kicker">Account profile</p>
            <label>
              Status
              <input name="status" defaultValue={detail.status || ""} />
            </label>
            <button type="submit">Save mapped field</button>
          </form>
          <div>
            <p className="kicker">Follow-up</p>
            <input placeholder="Summary" value={followSummary} onChange={(e) => onFollowSummary(e.target.value)} />
            <input type="date" value={followDate} onChange={(e) => onFollowDate(e.target.value)} />
            <button type="button" onClick={onSaveFollowUp}>Save follow-up</button>
          </div>
          {(detail.intelligence?.nextActions || []).length > 0 && (
            <div>
              <p className="kicker">Next moves</p>
              <ol className="account-actions">
                {(detail.intelligence?.nextActions || []).map((action, index) => (
                  <li key={action}>
                    <span>0{index + 1}</span>
                    <p>
                      {action}{" "}
                      <button type="button" onClick={() => onConvertFollowUp(action)}>
                        Convert to follow-up
                      </button>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {section === "activity" && (
        <div className="workspace-section note-composer">
          <p className="kicker">Updates</p>
          <SectionStatus
            loading={workspace?.loading?.updates}
            error={workspace?.errors?.updates}
            empty={updates.length === 0}
            emptyLabel="No Monday updates on this account."
          />
          {updates.map((row) => (
            <div className="activity-row" key={String(row.id || row.mondayUpdateId)}>
              <b>{display(row.bodyText || row.summary, "")}</b>
              <small>{display(row.mondayCreatedAt, "")}{row.creatorName ? ` · ${String(row.creatorName)}` : ""}</small>
            </div>
          ))}
          {workspace?.cursors?.updates && (
            <button type="button" onClick={() => onLoadMore("updates")}>Load more updates</button>
          )}
          <p className="kicker">Activity</p>
          <SectionStatus
            loading={workspace?.loading?.activities}
            error={workspace?.errors?.activities}
            empty={activities.length === 0}
            emptyLabel="No eliteOS activity recorded yet."
          />
          {activities.map((row) => (
            <div className="activity-row" key={String(row.id)}>
              <b>{display(row.summary || row.eventType, "")}</b>
              <small>{display(row.occurredAt, "")}{row.source ? ` · ${String(row.source)}` : ""}</small>
            </div>
          ))}
          {workspace?.cursors?.activities && (
            <button type="button" onClick={() => onLoadMore("activities")}>Load more activity</button>
          )}
          <textarea value={noteBody} onChange={(e) => onNoteBody(e.target.value)} placeholder="Add a Monday update…" />
          <button type="button" onClick={onSaveNote}>Add note</button>
        </div>
      )}

      {section === "subitems" && (
        <div className="workspace-section">
          <p className="kicker">Current Monday subitems</p>
          <SectionStatus
            loading={workspace?.loading?.subitems}
            error={workspace?.errors?.subitems}
            empty={subitems.length === 0}
            emptyLabel="No subitems on this account."
          />
          {subitems.map((item) => {
            const fields = columnLines(item.columns);
            return (
              <article className="workspace-card" key={String(item.id || item.mondayItemId)}>
                <div className="workspace-card-top">
                  <strong>{display(item.name, "Untitled subitem")}</strong>
                  <small>{display(item.sourceState, "active")}</small>
                </div>
                {fields.map((col) => (
                  <div className="workspace-line" key={col.id}>
                    <span>{col.title}</span>
                    <b>{col.text}</b>
                  </div>
                ))}
              </article>
            );
          })}
          {workspace?.cursors?.subitems && (
            <button type="button" onClick={() => onLoadMore("subitems")}>Load more subitems</button>
          )}
        </div>
      )}

      {section === "files" && (
        <div className="workspace-section">
          <p className="kicker">File metadata</p>
          <p className="workspace-muted">File content is unavailable. Authenticated asset fetch is not enabled (`asset_fetch_not_enabled`).</p>
          <SectionStatus
            loading={workspace?.loading?.files}
            error={workspace?.errors?.files}
            empty={files.length === 0}
            emptyLabel="No file metadata on this account."
          />
          {files.map((file) => (
            <article className="workspace-card" key={String(file.id || file.mondayAssetId)}>
              <div className="workspace-card-top">
                <strong>{display(file.filename, "Untitled file")}</strong>
                <small>{display(file.fileExtension, "type unknown")}</small>
              </div>
              <div className="workspace-line"><span>Size</span><b>{formatBytes(file.fileSize)}</b></div>
              <div className="workspace-line"><span>Source</span><b>{display(file.associatedKind, "item")}</b></div>
              <p className="workspace-muted">Content download is not available.</p>
            </article>
          ))}
          {workspace?.cursors?.files && (
            <button type="button" onClick={() => onLoadMore("files")}>Load more files</button>
          )}
        </div>
      )}

      {section === "docs" && (
        <div className="workspace-section">
          <p className="kicker">Monday Docs</p>
          <SectionStatus
            loading={workspace?.loading?.docs}
            error={workspace?.errors?.docs}
            empty={docs.length === 0}
            emptyLabel="No Docs metadata on this account."
          />
          {docs.map((doc) => {
            const access = String(doc.accessibility || "unknown").toLowerCase();
            const unsupported = access === "unsupported" || access === "inaccessible" || access === "unknown";
            return (
              <article className="workspace-card" key={String(doc.id || doc.mondayDocId)}>
                <div className="workspace-card-top">
                  <strong>{display(doc.title, "Untitled doc")}</strong>
                  <small>{access}</small>
                </div>
                {unsupported ? (
                  <p className="workspace-muted">This Doc is not available in eliteOS yet.</p>
                ) : (
                  <p className="workspace-muted">Governed Doc metadata loaded. Source URLs are not exposed.</p>
                )}
              </article>
            );
          })}
          {workspace?.cursors?.docs && (
            <button type="button" onClick={() => onLoadMore("docs")}>Load more docs</button>
          )}
        </div>
      )}

      <div className="account-modal-foot">
        <p><b>Ownership rule:</b> Monday.com Account Master List is the source of truth.</p>
        {detail.mondayUrl && (
          <a href={detail.mondayUrl} target="_blank" rel="noreferrer">
            Open account in Monday <ArrowIcon />
          </a>
        )}
      </div>
    </div>
  );
}
