import type { DashboardFilters, SalesDashboardTab } from "./salesDashboardTypes";

export type DashboardViewDefinition = {
  id: string;
  label: string;
  description?: string;
  filters: Partial<DashboardFilters>;
  builtin?: boolean;
};

/** Built-in manager presets — no setup required. */
export const MANAGER_PRESETS: DashboardViewDefinition[] = [
  {
    id: "preset_today_command",
    label: "Today's Command Center",
    builtin: true,
    filters: { tab: "command_center", quickRange: "ytd" }
  },
  {
    id: "preset_ytd_vs_prior",
    label: "YTD vs Prior Year",
    builtin: true,
    filters: { tab: "sales_performance", quickRange: "ytd" }
  },
  {
    id: "preset_month_vs_ly",
    label: "This Month vs Last Year",
    builtin: true,
    filters: { tab: "sales_performance", quickRange: "this_month" }
  },
  {
    id: "preset_forecast_60",
    label: "Next 60 Days Forecast",
    builtin: true,
    filters: { tab: "forecasting", quickRange: "ytd", forecastWindow: "60" }
  },
  {
    id: "preset_accounts_call",
    label: "Accounts to Call",
    builtin: true,
    filters: { tab: "accounts", quickRange: "ytd", sortBy: "focus_score", sortDir: "desc" }
  },
  {
    id: "preset_yoy_declines",
    label: "Biggest YoY Declines",
    builtin: true,
    filters: { tab: "accounts", quickRange: "ytd", behindPriorYearOnly: true, sortBy: "yoy_sqft", sortDir: "asc" }
  },
  {
    id: "preset_elite_conversion",
    label: "Elite 100 Conversion Opportunities",
    builtin: true,
    filters: { tab: "accounts", quickRange: "ytd", collectionStatus: "out_of_collection", sortBy: "total_sqft", sortDir: "desc" }
  },
  {
    id: "preset_ooc_watchlist",
    label: "Out-of-Collection Watchlist",
    builtin: true,
    filters: { tab: "colors_materials", quickRange: "ytd", collectionStatus: "out_of_collection" }
  },
  {
    id: "preset_unknown_colors",
    label: "Unknown Colors / Mapping Cleanup",
    builtin: true,
    filters: { tab: "colors_materials", quickRange: "ytd", unknownColorsOnly: true, unmappedOnly: true }
  },
  {
    id: "preset_quote_followup",
    label: "Quote Pipeline Follow-up",
    builtin: true,
    filters: { tab: "quote_pipeline", quickRange: "ytd", quotedNotProducedOnly: true }
  },
  {
    id: "preset_rep_coaching",
    label: "Rep Coaching: All Reps",
    builtin: true,
    filters: { tab: "sales_performance", quickRange: "ytd", sortBy: "yoy_pct", sortDir: "desc" }
  }
];

/** Named saved-view templates (also available as presets). */
export const NAMED_VIEW_TEMPLATES: DashboardViewDefinition[] = [
  {
    id: "tpl_executive_overview",
    label: "Executive Overview",
    filters: { tab: "command_center", quickRange: "ytd" }
  },
  {
    id: "tpl_ytd_company",
    label: "YTD Company Performance",
    filters: { tab: "sales_performance", quickRange: "ytd" }
  },
  {
    id: "tpl_accounts_attention",
    label: "Accounts Needing Attention",
    filters: { tab: "accounts", quickRange: "ytd", sortBy: "focus_score", sortDir: "desc" }
  },
  {
    id: "tpl_ooc_opportunities",
    label: "Out-of-Collection Opportunities",
    filters: { tab: "accounts", quickRange: "ytd", collectionStatus: "out_of_collection" }
  },
  {
    id: "tpl_low_elite",
    label: "Low Elite 100 Adoption",
    filters: { tab: "accounts", quickRange: "ytd", eliteShareMax: "25", sortBy: "total_sqft", sortDir: "desc" }
  },
  {
    id: "tpl_forecast_60",
    label: "Forecast Next 60 Days",
    filters: { tab: "forecasting", quickRange: "ytd", forecastWindow: "60" }
  },
  {
    id: "tpl_pipeline_risk",
    label: "Quote Pipeline Risk",
    filters: { tab: "quote_pipeline", quickRange: "ytd", quotedNotProducedOnly: true }
  },
  {
    id: "tpl_data_cleanup",
    label: "Data Cleanup Queue",
    filters: { tab: "data_quality", quickRange: "ytd" }
  },
  {
    id: "tpl_rep_coaching",
    label: "Rep Coaching View",
    filters: { tab: "sales_performance", quickRange: "ytd" }
  },
  {
    id: "tpl_branch_performance",
    label: "Branch Performance",
    filters: { tab: "sales_performance", quickRange: "ytd" }
  }
];

export const ALL_BUILTIN_VIEWS: DashboardViewDefinition[] = [
  ...MANAGER_PRESETS,
  ...NAMED_VIEW_TEMPLATES.filter((t) => !MANAGER_PRESETS.some((p) => p.id === t.id))
];

export function viewTab(view: DashboardViewDefinition): SalesDashboardTab {
  return view.filters.tab ?? "command_center";
}
