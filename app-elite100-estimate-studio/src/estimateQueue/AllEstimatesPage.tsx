/**
 * All Estimates — Studio-backed historical registry.
 * Command Center remains the action queue.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiGet } from "../lib/api";

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
  { key: "archived", label: "Archived" }
];

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
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
    <div className="eos-page" data-testid="studio-all-estimates">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">All Estimates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete Studio estimate history. Command Center remains the action queue.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`all-estimates-filter-${f.key}`}
            className={
              filter === f.key
                ? "rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background"
                : "rounded-md border border-border px-2.5 py-1 text-xs"
            }
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, project, estimate…"
          className="min-w-[220px] flex-1 rounded-md border border-border px-3 py-2 text-sm"
          data-testid="all-estimates-search"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <p className="mb-2 text-xs text-muted-foreground">{total} estimate{total === 1 ? "" : "s"}</p>

      <ul className="divide-y divide-border rounded-lg border border-border bg-background">
        {rows.map((r) => (
          <li
            key={r.estimateId}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            data-testid="all-estimates-row"
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                {r.customerName || "Customer"} — {r.projectName || "Project"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {r.quoteNumber || r.intakeCaseId} · Rev {r.revision} ·{" "}
                {r.lifecycleStatusLabel || r.lifecycleStatus}
                {r.publicationStatus ? ` · Pub: ${r.publicationStatus}` : ""}
                {r.acceptanceStatus && r.acceptanceStatus !== "none"
                  ? ` · Acceptance: ${r.acceptanceStatus}`
                  : ""}
                {r.soldStatus && r.soldStatus !== "none" ? ` · Sold` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-sm font-semibold">{money(r.customerTotal)}</span>
              <button
                type="button"
                data-testid="all-estimates-open"
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                onClick={() =>
                  onOpenEstimate(r.primaryAction?.intakeCaseId || r.intakeCaseId, {
                    openTarget: "scope"
                  })
                }
              >
                Open
              </button>
            </div>
          </li>
        ))}
        {!loading && rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No estimates match.</li>
        ) : null}
      </ul>
    </div>
  );
}
