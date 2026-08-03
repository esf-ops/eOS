/**
 * All Estimates — Studio-backed historical registry.
 * Presentation polish only; API and status meanings unchanged.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import Elite100StatusPill, {
  type Elite100StatusTone,
} from "../shell/Elite100StatusPill";
import Elite100ActionBar from "../shell/Elite100ActionBar";

export type AllEstimatesPageProps = {
  authToken: string | null;
  onOpenEstimate: (caseId: string, options?: { openTarget?: string }) => void;
};

type AllEstimatesRow = {
  estimateId: string;
  intakeCaseId: string;
  revision: number;
  quoteNumber?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  customerTotal?: number | null;
  lifecycleStatus?: string;
  lifecycleStatusLabel?: string;
  publicationStatus?: string | null;
  acceptanceStatus?: string | null;
  soldStatus?: string | null;
  updatedAt?: string | null;
  primaryAction?: { intakeCaseId?: string; estimateId?: string };
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "needs_scope", label: "Needs Scope" },
  { key: "needs_pricing", label: "Needs Pricing" },
  { key: "needs_approval", label: "Needs Approval" },
  { key: "published", label: "Published" },
  { key: "changes_requested", label: "Changes Requested" },
  { key: "accepted_awaiting_sold_review", label: "Accepted — Awaiting Sold Review" },
  { key: "sold", label: "Sold" },
  { key: "archived", label: "Archived" },
];

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function lifecycleTone(status: string | null | undefined): Elite100StatusTone {
  const s = String(status || "").toLowerCase();
  if (s.includes("sold")) return "success";
  if (s.includes("accepted")) return "accent";
  if (s.includes("published")) return "info";
  if (s.includes("archived")) return "neutral";
  if (s.includes("changes") || s.includes("approval") || s.includes("pricing") || s.includes("scope"))
    return "warn";
  if (s.includes("draft")) return "neutral";
  return "neutral";
}

function publicationLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (s === "active" || s === "published") return "Published";
  if (s === "none" || s === "unpublished") return null;
  return status.replace(/_/g, " ");
}

function acceptanceLabel(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const s = String(status).toLowerCase();
  if (s.includes("configured")) return "Accepted · Configured";
  if (s.includes("published") || s === "accepted") return "Accepted";
  if (s.includes("awaiting")) return "Accepted — Awaiting Sold Review";
  return status.replace(/_/g, " ");
}

function nextActionLabel(row: AllEstimatesRow): string {
  const life = String(row.lifecycleStatus || "").toLowerCase();
  if (life.includes("sold")) return "Review sold record";
  if (life.includes("accepted")) return "Complete sold review";
  if (life.includes("changes")) return "Review customer changes";
  if (life.includes("published")) return "Open Digital Estimate workspace";
  if (life.includes("approval")) return "Review & approve";
  if (life.includes("pricing")) return "Finish pricing";
  if (life.includes("scope")) return "Complete scope";
  if (life.includes("draft")) return "Continue drafting";
  return "Open estimate";
}

export default function AllEstimatesPage({ authToken, onOpenEstimate }: AllEstimatesPageProps) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AllEstimatesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filter && filter !== "all") q.set("filter", filter);
      if (search.trim()) q.set("search", search.trim());
      q.set("limit", "100");
      const body = await apiGet<{
        ok?: boolean;
        rows?: AllEstimatesRow[];
        total_count?: number;
        error?: string;
      }>(`/api/elite100-estimate-studio/all-estimates?${q.toString()}`, authToken);
      setRows(Array.isArray(body.rows) ? body.rows : []);
      setTotal(Number(body.total_count) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load estimates");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authToken, filter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="e100-page" data-testid="studio-all-estimates">
      <header className="e100-page-header">
        <div>
          <h1 className="e100-page-title">Estimates</h1>
          <p className="e100-page-sub">
            Studio estimate registry — drafts through sold. Open a row to continue in Studio V2.
          </p>
        </div>
        <Elite100ActionBar>
          <button
            type="button"
            className="eq-btn-secondary"
            onClick={() => void load()}
            data-testid="all-estimates-refresh"
          >
            Refresh
          </button>
        </Elite100ActionBar>
      </header>

      <div className="e100-filter-card" data-testid="all-estimates-filters">
        <div className="e100-filter-chips" role="tablist" aria-label="Estimate status filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              data-testid={`all-estimates-filter-${f.key}`}
              className={`e100-filter-chip${filter === f.key ? " is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="e100-filter-search">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, project, estimate…"
            className="e100-search-input"
            data-testid="all-estimates-search"
          />
        </div>
      </div>

      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading…</p> : null}

      <p className="e100-result-meta" data-testid="all-estimates-count">
        {total} estimate{total === 1 ? "" : "s"}
      </p>

      <div className="e100-table-card" role="table" aria-label="Estimates">
        <div className="e100-table-head" role="row">
          <span role="columnheader">Customer / project</span>
          <span role="columnheader">Estimate</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Total</span>
          <span role="columnheader">Updated</span>
          <span role="columnheader">Next action</span>
          <span role="columnheader"> </span>
        </div>
        {rows.map((r) => {
          const pub = publicationLabel(r.publicationStatus);
          const acc = acceptanceLabel(r.acceptanceStatus);
          const sold = r.soldStatus && r.soldStatus !== "none";
          return (
            <article
              key={r.estimateId}
              className="e100-table-row"
              role="row"
              data-testid="all-estimates-row"
            >
              <div className="e100-table-cell e100-table-cell--primary" role="cell">
                <strong>{r.customerName || "Customer"}</strong>
                <span className="muted">{r.projectName || "Project"}</span>
              </div>
              <div className="e100-table-cell" role="cell">
                <span>{r.quoteNumber || r.intakeCaseId}</span>
                <span className="muted">Rev {r.revision}</span>
              </div>
              <div className="e100-table-cell e100-table-cell--pills" role="cell">
                <Elite100StatusPill
                  label={r.lifecycleStatusLabel || r.lifecycleStatus || "Status"}
                  tone={lifecycleTone(r.lifecycleStatusLabel || r.lifecycleStatus)}
                />
                {pub ? <Elite100StatusPill label={pub} tone="info" /> : null}
                {acc ? <Elite100StatusPill label={acc} tone="accent" /> : null}
                {sold ? <Elite100StatusPill label="Sold" tone="success" /> : null}
              </div>
              <div className="e100-table-cell e100-table-cell--num" role="cell">
                {money(r.customerTotal)}
              </div>
              <div className="e100-table-cell muted" role="cell">
                {formatWhen(r.updatedAt)}
              </div>
              <div className="e100-table-cell" role="cell">
                <span className="e100-next-action">{nextActionLabel(r)}</span>
              </div>
              <div className="e100-table-cell e100-table-cell--actions" role="cell">
                <button
                  type="button"
                  data-testid="all-estimates-open"
                  className="eq-btn-primary eq-btn-small"
                  onClick={() =>
                    onOpenEstimate(r.primaryAction?.intakeCaseId || r.intakeCaseId, {
                      openTarget: "scope",
                    })
                  }
                >
                  Open
                </button>
              </div>
            </article>
          );
        })}
        {!loading && rows.length === 0 ? (
          <div className="e100-empty-inline" data-testid="all-estimates-empty">
            No estimates match.
          </div>
        ) : null}
      </div>
    </div>
  );
}
