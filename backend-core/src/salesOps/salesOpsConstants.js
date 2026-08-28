/**
 * Sales Ops Head — governed constants.
 * Plan ramp/KPI defaults are eliteOS-owned. Monday board IDs are org config, never SaaS-global.
 */

export const SALES_OPS_HEAD_SLUG = "sales_ops";

export const SALES_OPS_ROLES = Object.freeze(["admin", "super_admin", "executive", "sales"]);

export const SALES_OPS_ORG_ADMIN_ROLES = Object.freeze(["admin", "super_admin", "executive"]);

export const PLAN_STATUSES = Object.freeze([
  "draft",
  "in_review",
  "approved",
  "active",
  "superseded",
  "archived"
]);

/** Prototype/reference blueprint only — never an approved or auto-assigned production plan. */
export const PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY = "prototype_cedar_valley_sales_plan_2026_2028";
/** @deprecated Use PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY. */
export const CEDAR_VALLEY_BLUEPRINT_KEY = PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY;

/** Prototype 2026–2028 ramp from the standalone dashboard. Reference/template material only. */
export const PROTOTYPE_CEDAR_VALLEY_RAMP = Object.freeze([
  { period: "2026-09", label: "Sep", year: "2026", installedTarget: 500, rollingThreeMonthTarget: 1800, qualifiedPipelineTarget: 5400 },
  { period: "2026-10", label: "Oct", year: "2026", installedTarget: 600, rollingThreeMonthTarget: 2100, qualifiedPipelineTarget: 6300 },
  { period: "2026-11", label: "Nov", year: "2026", installedTarget: 700, rollingThreeMonthTarget: 2350, qualifiedPipelineTarget: 7050 },
  { period: "2026-12", label: "Dec", year: "2026", installedTarget: 800, rollingThreeMonthTarget: 2550, qualifiedPipelineTarget: 7650 },
  { period: "2027-01", label: "Jan", year: "2027", installedTarget: 850, rollingThreeMonthTarget: 2750, qualifiedPipelineTarget: 8250 },
  { period: "2027-02", label: "Feb", year: "2027", installedTarget: 900, rollingThreeMonthTarget: 2950, qualifiedPipelineTarget: 8850 },
  { period: "2027-03", label: "Mar", year: "2027", installedTarget: 1000, rollingThreeMonthTarget: 3200, qualifiedPipelineTarget: 9600 },
  { period: "2027-04", label: "Apr", year: "2027", installedTarget: 1050, rollingThreeMonthTarget: 3450, qualifiedPipelineTarget: 10350 },
  { period: "2027-05", label: "May", year: "2027", installedTarget: 1150, rollingThreeMonthTarget: 3700, qualifiedPipelineTarget: 11100 },
  { period: "2027-06", label: "Jun", year: "2027", installedTarget: 1250, rollingThreeMonthTarget: 3950, qualifiedPipelineTarget: 11850 },
  { period: "2027-07", label: "Jul", year: "2027", installedTarget: 1300, rollingThreeMonthTarget: 4200, qualifiedPipelineTarget: 12600 },
  { period: "2027-08", label: "Aug", year: "2027", installedTarget: 1400, rollingThreeMonthTarget: 4500, qualifiedPipelineTarget: 13500 },
  { period: "2027-09", label: "Sep", year: "2027", installedTarget: 1500, rollingThreeMonthTarget: 4775, qualifiedPipelineTarget: 14325 },
  { period: "2027-10", label: "Oct", year: "2027", installedTarget: 1600, rollingThreeMonthTarget: 5025, qualifiedPipelineTarget: 15075 },
  { period: "2027-11", label: "Nov", year: "2027", installedTarget: 1675, rollingThreeMonthTarget: 5275, qualifiedPipelineTarget: 15825 },
  { period: "2027-12", label: "Dec", year: "2027", installedTarget: 1750, rollingThreeMonthTarget: 5525, qualifiedPipelineTarget: 16575 },
  { period: "2028-01", label: "Jan", year: "2028", installedTarget: 1850, rollingThreeMonthTarget: 5775, qualifiedPipelineTarget: 17325 },
  { period: "2028-02", label: "Feb", year: "2028", installedTarget: 1925, rollingThreeMonthTarget: 6000, qualifiedPipelineTarget: 18000 },
  { period: "2028-03", label: "Mar", year: "2028", installedTarget: 2000, rollingThreeMonthTarget: 6250, qualifiedPipelineTarget: 18750 },
  { period: "2028-04", label: "Apr", year: "2028", installedTarget: 2075, rollingThreeMonthTarget: 6500, qualifiedPipelineTarget: 19500 },
  { period: "2028-05", label: "May", year: "2028", installedTarget: 2175, rollingThreeMonthTarget: 6725, qualifiedPipelineTarget: 20175 },
  { period: "2028-06", label: "Jun", year: "2028", installedTarget: 2250, rollingThreeMonthTarget: 6900, qualifiedPipelineTarget: 20700 },
  { period: "2028-07", label: "Jul", year: "2028", installedTarget: 2300, rollingThreeMonthTarget: 7050, qualifiedPipelineTarget: 21150 },
  { period: "2028-08", label: "Aug", year: "2028", installedTarget: 2350, rollingThreeMonthTarget: 7175, qualifiedPipelineTarget: 21525 },
  { period: "2028-09", label: "Sep", year: "2028", installedTarget: 2400, rollingThreeMonthTarget: 7300, qualifiedPipelineTarget: 21900 },
  { period: "2028-10", label: "Oct", year: "2028", installedTarget: 2425, rollingThreeMonthTarget: 7400, qualifiedPipelineTarget: 22200 },
  { period: "2028-11", label: "Nov", year: "2028", installedTarget: 2475, rollingThreeMonthTarget: 7450, qualifiedPipelineTarget: 22350 },
  { period: "2028-12", label: "Dec", year: "2028", installedTarget: 2500, rollingThreeMonthTarget: 7500, qualifiedPipelineTarget: 22500 }
]);

export const CEDAR_VALLEY_RAMP = PROTOTYPE_CEDAR_VALLEY_RAMP;

export const PROTOTYPE_CEDAR_VALLEY_METRIC_TARGETS = Object.freeze([
  { metricKey: "meaningful_touches", label: "Meaningful touches", unit: "count_per_week", cadence: "weekly", targetValue: 15, warningThreshold: 12, sourceAuthority: "plan", displayOrder: 10 },
  { metricKey: "meetings", label: "Meetings that move the account", unit: "count_per_week", cadence: "weekly", targetValue: 6, warningThreshold: 4, sourceAuthority: "plan", displayOrder: 20 },
  { metricKey: "qualified_opportunities", label: "New qualified opportunities", unit: "count_per_week", cadence: "weekly", targetValue: 3, warningThreshold: 2, sourceAuthority: "plan", displayOrder: 30 },
  { metricKey: "quote_follow_up_pct", label: "Quote follow-up compliance", unit: "percent", cadence: "monthly", targetValue: 95, warningThreshold: 85, sourceAuthority: "plan", displayOrder: 40 },
  { metricKey: "repeat_scheduled_share_pct", label: "Repeat or scheduled business share", unit: "percent", cadence: "rolling_3_month", targetValue: 70, warningThreshold: 55, sourceAuthority: "plan", displayOrder: 50 },
  { metricKey: "close_rate_pct", label: "Close rate by square foot", unit: "percent", cadence: "period", targetValue: 35, warningThreshold: 25, sourceAuthority: "plan", displayOrder: 60 }
]);

export const CEDAR_VALLEY_METRIC_TARGETS = PROTOTYPE_CEDAR_VALLEY_METRIC_TARGETS;

export const SCORECARD_FIELDS = Object.freeze([
  "installed",
  "pipeline",
  "quoted",
  "awarded",
  "touches",
  "meetings",
  "opportunities",
  "followUp",
  "repeatShare",
  "note"
]);

export const SCORECARD_SOURCES = Object.freeze([
  "manual",
  "monday",
  "moraware",
  "quote_library",
  "quickbooks",
  "calculated"
]);

/** Semantic Monday-owned fields. Column IDs live in org config, never frontend. */
export const MONDAY_SEMANTIC_FIELDS = Object.freeze([
  "status",
  "lastContact",
  "nextContact",
  "market",
  "branch",
  "accountType",
  "sampleProgram",
  "currentPrimarySupplier",
  "primaryPainPoint",
  "esfSolution",
  "nextStrategicMilestone",
  "targetSqFtPerMonth",
  "salesExecutive",
  "keyContact",
  "estKitchensPerMonth"
]);

export const MONDAY_FIELD_TITLES = Object.freeze({
  status: ["Status"],
  lastContact: ["Last Contact", "Last contact"],
  nextContact: ["Next Contact", "Next contact"],
  market: ["Market"],
  branch: ["Branch", "Branch Location"],
  accountType: ["Account Type"],
  sampleProgram: ["Sample Program"],
  currentPrimarySupplier: ["Current Primary Supplier", "Current Supplier"],
  primaryPainPoint: ["Primary Pain Point", "Pain Point"],
  esfSolution: ["ESF Solution"],
  nextStrategicMilestone: ["Next Strategic Milestone", "Strategic Milestone"],
  targetSqFtPerMonth: ["Target Sq Ft Per Month", "Target Sq Ft", "Target Square Feet", "Target SQ FT/Month"],
  salesExecutive: ["Sales Executive", "Salesperson", "Owner"],
  keyContact: ["Key Contact"],
  estKitchensPerMonth: ["Est. Kitchens/Month", "Est. Kitchens / Month"]
});

export const PATCHABLE_ACCOUNT_FIELDS = Object.freeze([
  "status",
  "lastContact",
  "nextContact",
  "market",
  "branch",
  "accountType",
  "sampleProgram",
  "currentPrimarySupplier",
  "primaryPainPoint",
  "esfSolution",
  "nextStrategicMilestone",
  "targetSqFtPerMonth"
]);

export const SALES_OPS_ACCOUNT_LIST_DEFAULT_LIMIT = 50;
export const SALES_OPS_ACCOUNT_LIST_MAX_LIMIT = 100;
export const SALES_OPS_HEAVY_DEFAULT_LIMIT = 50;
export const SALES_OPS_HEAVY_MAX_LIMIT = 100;

/** Bounded persist/read chunks. Keep statements well under PostgREST payload limits. */
export const SALES_OPS_ITEM_PAGE_SIZE = 50;
export const SALES_OPS_EAV_ITEM_ID_BATCH = 100;
export const SALES_OPS_COLUMN_UPSERT_BATCH = 200;
export const SALES_OPS_ACCOUNT_UPSERT_BATCH = 100;
export const SALES_OPS_ITEM_UPSERT_BATCH = 50;
export const SALES_OPS_UPDATE_UPSERT_BATCH = 100;
export const SALES_OPS_ASSET_UPSERT_BATCH = 100;
export const SALES_OPS_DOC_UPSERT_BATCH = 50;
export const SALES_OPS_USER_UPSERT_BATCH = 50;
export const SALES_OPS_GROUP_UPSERT_BATCH = 50;
export const SALES_OPS_UPDATES_ITEM_ID_BATCH = 5;
export const SALES_OPS_DOC_FETCH_BATCH = 10;
export const SALES_OPS_RECONCILE_STALL_MS = 180000;

/** Account Directory exact Monday link. Distinct from Excel `account_master_list`. */
export const SALES_OPS_MONDAY_EXTERNAL_SYSTEM = "monday";

export const SALES_OPS_SOURCE_STATES = Object.freeze(["active", "archived", "deleted", "unavailable"]);

export function mondayExternalId(boardId, itemId) {
  return `${String(boardId)}:${String(itemId)}`;
}

export function isOrgAdminRole(role) {
  return SALES_OPS_ORG_ADMIN_ROLES.includes(String(role ?? "").trim());
}

export function firstNameFromFullName(fullName, email) {
  const n = String(fullName ?? "").trim();
  if (n) return n.split(/\s+/)[0];
  const e = String(email ?? "").trim();
  if (!e) return "Your";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const word = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean)[0] || "Your";
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}
