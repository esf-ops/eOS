import React from "react";
import QuotePipelinePanel from "../QuotePipelinePanel";
import SalesCommandCenterView from "../SalesCommandCenterView";
import SalesCommandCenterPanel from "../SalesCommandCenterPanel";
import SalesPerformancePanel from "../SalesPerformancePanel";
import SalesForecastingPanel from "../SalesForecastingPanel";
import SalesProductionFlowPanel from "../SalesProductionFlowPanel";
import SalesAccountsPanel from "../SalesAccountsPanel";
import SalesColorsMaterialsPanel from "../SalesColorsMaterialsPanel";
import SalesDataQualityPanel from "../SalesDataQualityPanel";
import SalesQueryPanel from "../SalesQueryPanel";
import { useSalesDashboard } from "./SalesDashboardContext";

const COMMAND_CENTER_VIEW: "live" | "legacy" = "live";

export default function SalesTabPanels({
  token,
  onLoadError
}: {
  token: string;
  onLoadError: (msg: string) => void;
}) {
  const { activeTab } = useSalesDashboard();

  if (activeTab === "command_center") {
    return COMMAND_CENTER_VIEW === "live" ? (
      <SalesCommandCenterPanel />
    ) : (
      <SalesCommandCenterView token={token} onLoadError={onLoadError} />
    );
  }
  if (activeTab === "sales_performance") return <SalesPerformancePanel />;
  if (activeTab === "forecasting") return <SalesForecastingPanel />;
  if (activeTab === "quote_pipeline") {
    return (
      <div className="sd-card-wrap">
        <header className="sd-panel-head">
          <div>
            <h2 className="sd-panel-title">Quote Pipeline</h2>
            <p className="sd-panel-sub">Live Quote Library pipeline — same panel and API as before, aligned with the Sales Head shell.</p>
          </div>
        </header>
        <QuotePipelinePanel token={token} />
      </div>
    );
  }
  if (activeTab === "production_flow") return <SalesProductionFlowPanel />;
  if (activeTab === "accounts") return <SalesAccountsPanel />;
  if (activeTab === "colors_materials") return <SalesColorsMaterialsPanel />;
  if (activeTab === "data_explorer") {
    return (
      <div className="sd-card-wrap">
        <header className="sd-panel-head">
          <div>
            <h2 className="sd-panel-title">Data Explorer</h2>
            <p className="sd-panel-sub">Ask Sales Data — natural-language Moraware query explorer. Parser and API unchanged.</p>
          </div>
        </header>
        <SalesQueryPanel token={token} onLoadError={onLoadError} />
      </div>
    );
  }
  if (activeTab === "data_quality") return <SalesDataQualityPanel />;
  return null;
}
