import React from "react";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { EmptyState, LoadingSkeleton, PanelShell, fmtNum } from "./sales-dashboard/components";
import type { DataQualityIssue } from "../lib/salesDashboardTypes";

const TAB_LABELS: Record<string, string> = {
  command_center: "Command Center",
  accounts: "Accounts",
  colors_materials: "Colors / Materials",
  data_explorer: "Data Explorer",
  data_quality: "Data Quality"
};

function formatSample(sample: unknown): string {
  if (typeof sample === "string") return sample;
  if (!sample || typeof sample !== "object") return String(sample ?? "");
  const o = sample as Record<string, unknown>;
  const parts = ["account", "color", "jobId", "sqft", "lastSync"]
    .map((k) => (o[k] != null ? `${k}: ${o[k]}` : ""))
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : JSON.stringify(sample);
}

export default function SalesDataQualityPanel() {
  const { data, loading, navigateDataQualityIssue, copyIssueSamples } = useSalesDashboard();
  const dq = data?.dataQuality;

  return (
    <PanelShell
      title="Data Quality"
      subtitle="Actionable cleanup queue — drill into affected tabs without editing mappings here."
      actions={<SalesExportMenu kinds={["data_quality", "visible_table"]} />}
    >
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      {loading && !data ? <LoadingSkeleton /> : !data ? (
        <EmptyState title="No data quality report" />
      ) : (
        <div className="sd-stack">
          <div className="sd-stat-row">
            <div className="sd-stat"><span>Confidence</span><strong>{fmtNum(dq?.dataConfidenceScore)}%</strong></div>
            <div className="sd-stat"><span>Issues</span><strong>{dq?.issueCount ?? 0}</strong></div>
            <div className="sd-stat"><span>Worksheet facts</span><strong>{dq?.worksheetFactsAvailable ? "Yes" : "No"}</strong></div>
          </div>
          {(dq?.issues ?? []).map((issue) => (
            <DataQualityIssueCard
              key={issue.id}
              issue={issue}
              onView={() => navigateDataQualityIssue(issue)}
              onCopySamples={() => void copyIssueSamples(issue)}
            />
          ))}
          {(dq?.issues?.length ?? 0) === 0 ? (
            <EmptyState title="No open issues" message="Data quality looks clean for the current filter set." />
          ) : null}
        </div>
      )}
    </PanelShell>
  );
}

function DataQualityIssueCard({
  issue,
  onView,
  onCopySamples
}: {
  issue: DataQualityIssue;
  onView: () => void;
  onCopySamples: () => void;
}) {
  const tabLabel = issue.navigateTab ? TAB_LABELS[issue.navigateTab] ?? issue.navigateTab : "Dashboard";

  return (
    <article className={`sd-issue sd-issue--${issue.severity}`}>
      <header className="sd-issue-head">
        <h3>{issue.title}</h3>
        <span className={`sd-badge sd-badge--${issue.severity}`}>{issue.severity}</span>
      </header>
      <p className="sd-muted">{issue.suggestedFix}</p>
      <dl className="sd-dl sd-dl--inline">
        <div><dt>Count impact</dt><dd>{issue.count.toLocaleString()}</dd></div>
        <div><dt>Sqft impact</dt><dd>{fmtNum(issue.sqftImpact)}</dd></div>
        <div><dt>Owner</dt><dd>{issue.owner}</dd></div>
        <div><dt>Affected tab</dt><dd>{tabLabel}</dd></div>
      </dl>
      {(issue.samples?.length ?? 0) > 0 ? (
        <div className="sd-issue-samples">
          <p className="sd-issue-samples-label">Sample rows</p>
          <ul className="sd-list sd-list--compact">
            {issue.samples.slice(0, 5).map((s, i) => (
              <li key={i}>{formatSample(s)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="sd-issue-actions">
        <button type="button" className="sd-btn sd-btn--primary sd-btn--sm" onClick={onView}>
          {issue.actionLabel || "View in dashboard"}
        </button>
        {(issue.samples?.length ?? 0) > 0 ? (
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={onCopySamples}>
            Copy samples
          </button>
        ) : null}
      </div>
    </article>
  );
}
