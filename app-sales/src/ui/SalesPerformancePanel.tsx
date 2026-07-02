import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { EmptyState, LoadingSkeleton, PanelShell, SortableTable, fmtNum, fmtPct } from "./sales-dashboard/components";

export default function SalesPerformancePanel() {
  const { data, loading, patchFilters, openAccountDetail, filters } = useSalesDashboard();

  const rows = useMemo(() => {
    return (data?.salesPerformance?.accountRows ?? []).map((r) => ({
      ...r,
      currentSqft: fmtNum(r.currentSqft),
      priorSqft: fmtNum(r.priorSqft),
      yoyPct: fmtPct(r.yoyPct),
      eliteShare: r.eliteShare != null ? fmtPct(r.eliteShare) : "—",
      outShare: r.outShare != null ? fmtPct(r.outShare) : "—",
      focusScore: String(r.focusScore ?? 0),
      _raw: r
    }));
  }, [data]);

  const onSort = (key: string) => {
    patchFilters({
      sortBy: key,
      sortDir: filters.sortBy === key && filters.sortDir === "desc" ? "asc" : "desc"
    });
  };

  return (
    <PanelShell
      title="Sales Performance"
      subtitle="Rep, branch, and account YoY analysis from synced Moraware production facts."
      actions={<SalesExportMenu kinds={["visible_table", "accounts_attention"]} />}
    >
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      {loading && !data ? <LoadingSkeleton /> : !data ? (
        <EmptyState title="No performance data" />
      ) : (
        <div className="sd-stack">
          <div className="sd-stat-row">
            <div className="sd-stat"><span>Active accounts</span><strong>{data.salesPerformance?.activeAccountCount ?? 0}</strong></div>
            <div className="sd-stat"><span>Reps tracked</span><strong>{data.salesPerformance?.repSummary?.length ?? 0}</strong></div>
          </div>

          <section className="sd-section">
            <h3>Rep leaderboard</h3>
            <SortableTable
              columns={[
                { key: "salesperson", label: "Rep" },
                { key: "currentSqft", label: "Current sqft", align: "right" },
                { key: "priorSqft", label: "Prior sqft", align: "right" },
                { key: "yoyPct", label: "YoY %", align: "right" },
                { key: "accountCount", label: "Accounts", align: "right" }
              ]}
              rows={(data.salesPerformance?.repSummary ?? []).map((r) => ({
                salesperson: r.salesperson,
                currentSqft: fmtNum(r.currentSqft),
                priorSqft: fmtNum(r.priorSqft),
                yoyPct: fmtPct(r.yoyPct),
                accountCount: String(r.accountCount)
              }))}
              onSort={onSort}
              rowKey={(r) => r.salesperson}
            />
          </section>

          <section className="sd-section">
            <h3>Monthly YoY</h3>
            <div className="sd-chart">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.salesPerformance?.monthlyYoY ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="currentSqft" fill="#a3132f" name="Current" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="priorSqft" fill="#cbd5e1" name="Prior year" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="sd-section">
            <h3>Account performance</h3>
            <SortableTable
              columns={[
                { key: "account_name", label: "Account" },
                { key: "normalizedSalesperson", label: "Rep" },
                { key: "branch", label: "Branch" },
                { key: "currentSqft", label: "Current", align: "right" },
                { key: "priorSqft", label: "Prior", align: "right" },
                { key: "yoyPct", label: "YoY %", align: "right" },
                { key: "eliteShare", label: "Elite %", align: "right" },
                { key: "focusScore", label: "Focus", align: "right" }
              ]}
              rows={rows.map((r) => ({
                account_name: r.account,
                normalizedSalesperson: r.normalizedSalesperson ?? "—",
                branch: r.branch ?? "—",
                currentSqft: r.currentSqft,
                priorSqft: r.priorSqft,
                yoyPct: r.yoyPct,
                eliteShare: r.eliteShare,
                focusScore: r.focusScore
              }))}
              sortBy={filters.sortBy === "account_name" ? "account_name" : filters.sortBy}
              sortDir={filters.sortDir}
              onSort={onSort}
              onRowClick={(row) => openAccountDetail(String(row.account_name))}
              rowKey={(r) => String(r.account_name)}
            />
          </section>
        </div>
      )}
    </PanelShell>
  );
}
