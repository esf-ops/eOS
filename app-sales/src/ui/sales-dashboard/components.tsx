import React from "react";
import type { SalesDashboardKpi } from "../../lib/salesDashboardTypes";

export function fmtKpi(kpi: SalesDashboardKpi): string {
  const v = kpi.value;
  if (v == null) return "—";
  switch (kpi.format) {
    case "sqft":
      return `${Math.round(Number(v)).toLocaleString()} sqft`;
    case "currency":
      return `$${Math.round(Number(v)).toLocaleString()}`;
    case "percent":
      return `${Number(v).toFixed(1)}%`;
    case "count":
      return Number(v).toLocaleString();
    case "datetime":
      return v ? new Date(String(v)).toLocaleString() : "—";
    default:
      return String(v);
  }
}

export function deltaClass(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return "";
  return delta >= 0 ? "sd-delta--up" : "sd-delta--down";
}

export function KpiCard({ kpi, hero }: { kpi: SalesDashboardKpi; hero?: boolean }) {
  return (
    <article className={`sd-kpi${hero ? " sd-kpi--hero" : ""}`}>
      <p className="sd-kpi-label">{kpi.label}</p>
      <p className="sd-kpi-value">{fmtKpi(kpi)}</p>
      {kpi.delta != null && Number.isFinite(kpi.delta) ? (
        <p className={`sd-kpi-delta ${deltaClass(kpi.delta)}`}>{kpi.delta >= 0 ? "+" : ""}{kpi.delta.toFixed(1)}% YoY</p>
      ) : null}
    </article>
  );
}

export function PanelShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sd-panel">
      <header className="sd-panel-head">
        <div>
          <h2 className="sd-panel-title">{title}</h2>
          {subtitle ? <p className="sd-panel-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="sd-panel-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="sd-skeleton-grid" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sd-skeleton-card" />
      ))}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="sd-empty">
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export function BentoCard({ title, children, wide, hero, className }: { title: string; children: React.ReactNode; wide?: boolean; hero?: boolean; className?: string }) {
  return (
    <article className={`sd-bento${hero ? " sd-bento--hero" : ""}${wide ? " sd-bento--wide" : ""}${className ? ` ${className}` : ""}`}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export const CHART_COLORS = ["#a3132f", "#1d4ed8", "#047857", "#b45309", "#6366f1", "#0e7490"];

type SortableCol = { key: string; label: string; align?: "left" | "right" };

export function SortableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
  rowKey
}: {
  columns: SortableCol[];
  rows: T[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
}) {
  return (
    <div className="sd-table-wrap">
      <table className="sd-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "sd-ta-r" : undefined}>
                {onSort ? (
                  <button type="button" className="sd-sort-btn" onClick={() => onSort(c.key)}>
                    {c.label}{sortBy === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? "sd-row-click" : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? "sd-ta-r" : undefined}>
                  {String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
