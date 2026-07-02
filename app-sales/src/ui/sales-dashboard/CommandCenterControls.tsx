import React, { useEffect, useState } from "react";
import { useSalesDashboard } from "./SalesDashboardContext";
import SalesViewsBar from "./SalesViewsBar";

const QUICK_RANGES = [
  { key: "ytd", label: "YTD" },
  { key: "this_month", label: "This month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "rolling_30", label: "Last 30 days" },
  { key: "rolling_90", label: "Last 90 days" }
] as const;

export default function CommandCenterControls() {
  const { filters, patchFilters, resetFilters, data, refreshing } = useSalesDashboard();
  const [accountDraft, setAccountDraft] = useState(filters.account);
  const opts = data?.filterOptions;

  useEffect(() => {
    setAccountDraft(filters.account);
  }, [filters.account]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (accountDraft !== filters.account) patchFilters({ account: accountDraft });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [accountDraft, filters.account, patchFilters]);

  return (
    <>
      <SalesViewsBar />
      {refreshing ? <p className="cc-refreshing" role="status">Updating dashboard…</p> : null}
      <div className="cc-controls">
        <div className="cc-control">
          <label htmlFor="cc-branch">Branch / Location</label>
          <select id="cc-branch" value={filters.branch} onChange={(e) => patchFilters({ branch: e.target.value })}>
            <option value="">All branches</option>
            {(opts?.branches ?? []).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="cc-control">
          <label htmlFor="cc-rep">Salesperson</label>
          <select id="cc-rep" value={filters.salesperson} onChange={(e) => patchFilters({ salesperson: e.target.value })}>
            <option value="">All reps</option>
            {(opts?.salespeople ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="cc-control">
          <label htmlFor="cc-collection">Collection</label>
          <select id="cc-collection" value={filters.collectionStatus} onChange={(e) => patchFilters({ collectionStatus: e.target.value })}>
            <option value="">Any</option>
            <option value="elite100">Elite 100</option>
            <option value="out_of_collection">Out of collection</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div className="cc-control">
          <label htmlFor="cc-elite">Elite group</label>
          <input id="cc-elite" value={filters.eliteGroup} onChange={(e) => patchFilters({ eliteGroup: e.target.value })} placeholder="Promo, A, B…" />
        </div>
        <div className="cc-control">
          <label htmlFor="cc-color">Color contains</label>
          <input id="cc-color" value={filters.color} onChange={(e) => patchFilters({ color: e.target.value })} placeholder="Antique Gray…" />
        </div>
        <div className="cc-control">
          <label htmlFor="cc-search">Account / job search</label>
          <input id="cc-search" type="search" value={accountDraft} onChange={(e) => setAccountDraft(e.target.value)} placeholder="Fox, Grand Rail…" />
        </div>
        <button type="button" className="cc-reset-btn" onClick={resetFilters}>Reset</button>
      </div>
      <div className="cc-quickbar">
        {QUICK_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`cc-quick-btn${filters.quickRange === r.key ? " is-on" : ""}`}
            onClick={() => patchFilters({ quickRange: r.key })}
          >
            {r.label}
          </button>
        ))}
      </div>
    </>
  );
}
