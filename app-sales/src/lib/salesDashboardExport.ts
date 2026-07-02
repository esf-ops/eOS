import type { SalesDashboardResponse, SalesDashboardTab } from "./salesDashboardTypes";

export type ExportKind =
  | "visible_table"
  | "accounts_attention"
  | "colors"
  | "data_quality"
  | "forecast"
  | "quote_pipeline";

export const EXPORT_KIND_LABELS: Record<ExportKind, string> = {
  visible_table: "Current table",
  accounts_attention: "Account attention list",
  colors: "Colors / materials",
  data_quality: "Data quality issues",
  forecast: "Forecast rows",
  quote_pipeline: "Quote pipeline rows"
};

function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function exportFilename(tab: SalesDashboardTab, kind: ExportKind): string {
  const slug = kind === "visible_table" ? tab : kind.replace(/_/g, "-");
  return `eliteos-sales-${slug}-${yyyymmdd()}.csv`;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function asRows(items: unknown[]): Record<string, unknown>[] {
  return items.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
}

export function collectExportRows(
  data: SalesDashboardResponse,
  tab: SalesDashboardTab,
  kind: ExportKind
): Record<string, unknown>[] {
  switch (kind) {
    case "visible_table": {
      const explorer = data.dataExplorer as { paginatedRows?: { rows?: Record<string, unknown>[] } } | undefined;
      if (tab === "accounts") {
        const accts = data.accounts as { attentionAccounts?: Record<string, unknown>[] } | undefined;
        return asRows(accts?.attentionAccounts ?? []);
      }
      if (tab === "colors_materials") {
        const colors = data.colorsMaterials as { colorRows?: Record<string, unknown>[] } | undefined;
        return asRows(colors?.colorRows ?? []);
      }
      if (tab === "sales_performance") {
        const perf = data.salesPerformance as { repSummary?: Record<string, unknown>[] } | undefined;
        return asRows(perf?.repSummary ?? []);
      }
      if (tab === "forecasting") {
        const fc = data.forecasting as { quoteForecastRows?: Record<string, unknown>[] } | undefined;
        return asRows(fc?.quoteForecastRows ?? []);
      }
      return explorer?.paginatedRows?.rows ?? [];
    }
    case "accounts_attention": {
      const accts = data.accounts as {
        attentionAccounts?: Record<string, unknown>[];
        dormantAccounts?: Record<string, unknown>[];
      } | undefined;
      const attention = accts?.attentionAccounts ?? [];
      const dormant = accts?.dormantAccounts ?? [];
      return asRows([...attention, ...dormant.filter((d) => !attention.some((a) => a.account === d.account))]);
    }
    case "colors": {
      const colors = data.colorsMaterials as { colorRows?: Record<string, unknown>[] } | undefined;
      return asRows(colors?.colorRows ?? []);
    }
    case "data_quality": {
      const issues = data.dataQuality?.issues ?? [];
      return issues.map((issue) => ({
        id: issue.id,
        type: issue.type,
        severity: issue.severity,
        title: issue.title,
        count: issue.count,
        sqftImpact: issue.sqftImpact,
        owner: issue.owner,
        suggestedFix: issue.suggestedFix,
        navigateTab: issue.navigateTab ?? "",
        samples: JSON.stringify(issue.samples ?? [])
      }));
    }
    case "forecast": {
      const fc = data.forecasting as { quoteForecastRows?: Record<string, unknown>[] } | undefined;
      return asRows(fc?.quoteForecastRows ?? []);
    }
    case "quote_pipeline": {
      const qp = data.quotePipeline as {
        openQuotes?: Record<string, unknown>[];
        quotedNotProducedRows?: Record<string, unknown>[];
      } | undefined;
      const open = qp?.openQuotes ?? [];
      const qnp = qp?.quotedNotProducedRows ?? [];
      return asRows([...open, ...qnp]);
    }
    default:
      return [];
  }
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): boolean {
  if (!rows.length) return false;
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
