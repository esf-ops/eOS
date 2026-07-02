import React from "react";
import type { SalesDashboardTab } from "../../lib/salesDashboardTypes";
import { useSalesDashboard } from "./SalesDashboardContext";

const TABS: ReadonlyArray<{ id: SalesDashboardTab; label: string }> = [
  { id: "command_center", label: "Command Center" },
  { id: "sales_performance", label: "Sales Performance" },
  { id: "forecasting", label: "Forecasting" },
  { id: "quote_pipeline", label: "Quote Pipeline" },
  { id: "production_flow", label: "Production Flow" },
  { id: "accounts", label: "Accounts" },
  { id: "colors_materials", label: "Colors / Materials" },
  { id: "data_explorer", label: "Data Explorer" },
  { id: "data_quality", label: "Data Quality" }
];

export default function SalesTabBar() {
  const { activeTab, setTab } = useSalesDashboard();

  return (
    <nav className="cc-tabbar" aria-label="Sales Head views">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`cc-tab${activeTab === t.id ? " is-on" : ""}`}
          aria-current={activeTab === t.id ? "page" : undefined}
          onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
