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

export default function SalesDashboardFilters() {
  const { filters, patchFilters, clearFilter, resetFilters, data, refreshing } = useSalesDashboard();
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
    <div className={`sd-filters${refreshing ? " is-refreshing" : ""}`}>
      <SalesViewsBar />
      <div className="sd-filters-row">
        <div className="sd-filter-group">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`sd-chip${filters.quickRange === r.key ? " is-on" : ""}`}
              onClick={() => patchFilters({ quickRange: r.key })}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="sd-filter-inputs">
          <select value={filters.branch} onChange={(e) => patchFilters({ branch: e.target.value })} aria-label="Branch">
            <option value="">All branches</option>
            {(opts?.branches ?? []).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select value={filters.salesperson} onChange={(e) => patchFilters({ salesperson: e.target.value })} aria-label="Rep">
            <option value="">All reps</option>
            {(opts?.salespeople ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Filter account…"
            value={accountDraft}
            onChange={(e) => setAccountDraft(e.target.value)}
            aria-label="Account"
          />
          <button type="button" className="sd-btn sd-btn--ghost" onClick={() => setAdvancedOpen((o) => !o)}>
            {advancedOpen ? "Hide filters" : "Advanced filters"}
          </button>
          <button type="button" className="sd-btn sd-btn--ghost" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </div>

      {(data?.meta?.activeFilters?.length ?? 0) > 1 ? (
        <div className="sd-active-filters">
          {(data?.meta?.activeFilters ?? []).map((chip) =>
            chip.clearParam ? (
              <button key={chip.key} type="button" className="sd-chip sd-chip--soft is-on" onClick={() => clearFilter(chip.clearParam!)}>
                {chip.label} ×
              </button>
            ) : (
              <span key={chip.key} className="sd-chip sd-chip--soft">{chip.label}</span>
            )
          )}
        </div>
      ) : null}

      {advancedOpen ? (
        <div className="sd-advanced-panel">
          <div className="sd-advanced-grid">
            <label>
              Job status
              <select value={filters.jobStatus} onChange={(e) => patchFilters({ jobStatus: e.target.value })}>
                <option value="">Any</option>
                {(opts?.jobStatuses ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Collection
              <select value={filters.collectionStatus} onChange={(e) => patchFilters({ collectionStatus: e.target.value })}>
                <option value="">Any</option>
                <option value="elite100">Elite 100</option>
                <option value="out_of_collection">Out of collection</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label>
              Elite group
              <input value={filters.eliteGroup} onChange={(e) => patchFilters({ eliteGroup: e.target.value })} placeholder="Promo, A, B…" />
            </label>
            <label>
              Color contains
              <input value={filters.color} onChange={(e) => patchFilters({ color: e.target.value })} />
            </label>
            <label>
              Manufacturer / stone
              <input value={filters.manufacturer || filters.stone} onChange={(e) => patchFilters({ manufacturer: e.target.value, stone: e.target.value })} />
            </label>
            <label>
              Forecast window
              <select value={filters.forecastWindow} onChange={(e) => patchFilters({ forecastWindow: e.target.value })}>
                <option value="">Any</option>
                <option value="30">Next 30 days</option>
                <option value="60">Next 60 days</option>
                <option value="90">Next 90 days</option>
              </select>
            </label>
            <label>
              Sqft min
              <input type="number" value={filters.sqftMin} onChange={(e) => patchFilters({ sqftMin: e.target.value })} />
            </label>
            <label>
              Sqft max
              <input type="number" value={filters.sqftMax} onChange={(e) => patchFilters({ sqftMax: e.target.value })} />
            </label>
          </div>
          <div className="sd-toggle-row">
            <label className="sd-toggle">
              <input type="checkbox" checked={filters.dormantOnly} onChange={(e) => patchFilters({ dormantOnly: e.target.checked })} />
              Dormant accounts only
            </label>
            <label className="sd-toggle">
              <input type="checkbox" checked={filters.behindPriorYearOnly} onChange={(e) => patchFilters({ behindPriorYearOnly: e.target.checked })} />
              Behind prior year
            </label>
            <label className="sd-toggle">
              <input type="checkbox" checked={filters.unmappedOnly} onChange={(e) => patchFilters({ unmappedOnly: e.target.checked })} />
              Unmapped only
            </label>
            <label className="sd-toggle">
              <input type="checkbox" checked={filters.unknownColorsOnly} onChange={(e) => patchFilters({ unknownColorsOnly: e.target.checked })} />
              Unknown colors
            </label>
            <label className="sd-toggle">
              <input type="checkbox" checked={filters.quotedNotProducedOnly} onChange={(e) => patchFilters({ quotedNotProducedOnly: e.target.checked })} />
              Quoted not produced
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SalesFreshnessBanner() {
  const { data, refreshing } = useSalesDashboard();
  const meta = data?.meta;
  if (!meta) return null;
  return (
    <div className="sd-freshness" role="status">
      <span className="sd-freshness-dot" data-confidence={(meta.dataConfidenceScore ?? 0) >= 70 ? "high" : "low"} />
      {refreshing ? <span className="sd-freshness-refresh">Updating…</span> : null}
      <span>Moraware sync {meta.latestMorawareSync ? new Date(meta.latestMorawareSync).toLocaleString() : "unknown"}</span>
      <span className="sd-freshness-sep">·</span>
      <span>{meta.currentDateRange?.start} → {meta.currentDateRange?.end}</span>
      <span className="sd-freshness-sep">·</span>
      <span>Confidence {Math.round(meta.dataConfidenceScore ?? 0)}%</span>
      {meta.worksheetFactsAvailable ? (
        <>
          <span className="sd-freshness-sep">·</span>
          <span>Worksheet colors enriched</span>
        </>
      ) : null}
    </div>
  );
}
