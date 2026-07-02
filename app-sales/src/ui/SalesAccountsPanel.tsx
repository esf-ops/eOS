import React, { useState } from "react";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { EmptyState, LoadingSkeleton, PanelShell, fmtNum, fmtPct } from "./sales-dashboard/components";

type AccountSlice = "top" | "attention" | "dormant" | "growth" | "decline" | "low_elite" | "high_ooc" | "quoted_np";

export default function SalesAccountsPanel() {
  const { data, loading, openAccountDetail, patchFilters } = useSalesDashboard();
  const [slice, setSlice] = useState<AccountSlice>("top");
  const acct = data?.accounts as Record<string, unknown> | undefined;

  const rows = (() => {
    switch (slice) {
      case "attention":
        return (acct?.attentionAccounts as object[]) ?? [];
      case "dormant":
        return (acct?.dormantAccounts as object[]) ?? [];
      case "growth":
        return (acct?.growthAccounts as object[]) ?? [];
      case "decline":
        return (acct?.declineAccounts as object[]) ?? [];
      case "low_elite":
        return (acct?.lowEliteAdoption as object[]) ?? [];
      case "high_ooc":
        return (acct?.highOutOfCollection as object[]) ?? [];
      case "quoted_np":
        return (acct?.quotedNotProduced as object[]) ?? [];
      default:
        return (acct?.topAccounts as object[]) ?? [];
    }
  })() as Array<Record<string, unknown>>;

  return (
    <PanelShell
      title="Accounts"
      subtitle="Account rankings, dormancy, focus scoring, and quote/production alignment."
      actions={<SalesExportMenu kinds={["visible_table", "accounts_attention"]} />}
    >
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      <div className="sd-filter-group sd-filter-group--wrap">
        {([
          ["top", "Top accounts"],
          ["attention", "Need attention"],
          ["dormant", "Dormant"],
          ["growth", "Growing"],
          ["decline", "Declining"],
          ["low_elite", "Low Elite 100"],
          ["high_ooc", "High OOC"],
          ["quoted_np", "Quoted not produced"]
        ] as const).map(([k, label]) => (
          <button key={k} type="button" className={`sd-chip${slice === k ? " is-on" : ""}`} onClick={() => {
            setSlice(k);
            if (k === "attention") patchFilters({ behindPriorYearOnly: true });
            if (k === "dormant") patchFilters({ dormantOnly: true });
          }}>
            {label}
          </button>
        ))}
      </div>
      {loading && !data ? <LoadingSkeleton /> : !data ? (
        <EmptyState title="No account data" />
      ) : (
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead>
              <tr><th>Account</th><th>Rep</th><th>Branch</th><th>Current</th><th>Prior</th><th>YoY</th><th>Focus</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={String(a.account)} className="sd-row-click" onClick={() => openAccountDetail(String(a.account))}>
                  <td>{String(a.account)}</td>
                  <td>{String(a.normalizedSalesperson ?? "—")}</td>
                  <td>{String(a.branch ?? "—")}</td>
                  <td>{fmtNum(Number(a.currentSqft))}</td>
                  <td>{fmtNum(Number(a.priorSqft))}</td>
                  <td>{fmtPct(Number(a.yoyPct))}</td>
                  <td>{String(a.focusScore ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
