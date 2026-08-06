/**
 * Restricted Managerial Financial Metrics for the Weekly Operations Scorecard.
 * Currency-only, non-graded; separate from operational departments and the standard weekly report.
 * @module workforceManagerialFinancials
 */

/** Access scope slug stored in workforce_department_user_access.department_slug. */
export const MANAGERIAL_FINANCIALS_SLUG = "managerial_financials";

/** Stable section UUIDs (same pattern as operational grading sections). */
export const MANAGERIAL_LOC_SECTION_ID = "b2000001-0001-4001-8001-000000000014";
export const MANAGERIAL_AR_OVER_45_SECTION_ID = "b2000001-0001-4001-8001-000000000015";
export const MANAGERIAL_AP_OVER_30_SECTION_ID = "b2000001-0001-4001-8001-000000000016";

/**
 * @typedef {object} ManagerialFinancialSectionTemplate
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} goalDisplay
 * @property {null} goalNumeric
 * @property {"currency"} metricKind
 * @property {false} gradingEnabled
 * @property {number} sortOrder
 * @property {"USD"} unitLabel
 */

/** @type {ReadonlyArray<ManagerialFinancialSectionTemplate>} */
export const MANAGERIAL_FINANCIAL_SECTIONS = Object.freeze([
  {
    id: MANAGERIAL_LOC_SECTION_ID,
    slug: "line_of_credit_balance",
    name: "Line of Credit Balance",
    goalDisplay: "—",
    goalNumeric: null,
    metricKind: "currency",
    gradingEnabled: false,
    sortOrder: 140,
    unitLabel: "USD"
  },
  {
    id: MANAGERIAL_AR_OVER_45_SECTION_ID,
    slug: "accounts_receivable_over_45_days",
    name: "Accounts Receivable over 45 Days",
    goalDisplay: "—",
    goalNumeric: null,
    metricKind: "currency",
    gradingEnabled: false,
    sortOrder: 150,
    unitLabel: "USD"
  },
  {
    id: MANAGERIAL_AP_OVER_30_SECTION_ID,
    slug: "accounts_payable_over_30_days",
    name: "Accounts Payable over 30 Days",
    goalDisplay: "—",
    goalNumeric: null,
    metricKind: "currency",
    gradingEnabled: false,
    sortOrder: 160,
    unitLabel: "USD"
  }
]);

/** @type {ReadonlySet<string>} */
export const MANAGERIAL_FINANCIAL_SECTION_IDS = Object.freeze(
  new Set(MANAGERIAL_FINANCIAL_SECTIONS.map((s) => s.id))
);

/** @type {ReadonlyMap<string, ManagerialFinancialSectionTemplate>} */
const SECTION_BY_ID = new Map(MANAGERIAL_FINANCIAL_SECTIONS.map((s) => [s.id, s]));

/**
 * @param {string} sectionId
 */
export function isManagerialFinancialSectionId(sectionId) {
  return MANAGERIAL_FINANCIAL_SECTION_IDS.has(String(sectionId ?? "").trim());
}

/**
 * @param {string} slug
 */
export function isManagerialFinancialsSlug(slug) {
  return String(slug ?? "").trim() === MANAGERIAL_FINANCIALS_SLUG;
}

/**
 * @param {Array<{ slug?: string, department_slug?: string, departmentSlug?: string, isActive?: boolean, is_active?: boolean }>} assignments
 */
export function hasManagerialFinancialsAssignment(assignments) {
  for (const row of assignments ?? []) {
    const slug = String(row.slug ?? row.departmentSlug ?? row.department_slug ?? "").trim();
    if (!isManagerialFinancialsSlug(slug)) continue;
    const active = row.isActive !== false && row.is_active !== false;
    if (active) return true;
  }
  return false;
}

/**
 * Split scorecard rows so managerial currency metrics never mix into operational grades/totals/reports.
 * @param {Array<object>} rows
 */
export function partitionScorecardRows(rows) {
  /** @type {object[]} */
  const operationalRows = [];
  /** @type {object[]} */
  const managerialRows = [];
  for (const row of rows ?? []) {
    if (isManagerialFinancialSectionId(row.sectionId ?? row.id)) managerialRows.push(row);
    else operationalRows.push(row);
  }
  return { operationalRows, managerialRows };
}

/**
 * @param {number|null|undefined} n
 */
export function formatUsdCurrency(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

/**
 * Neutral week-over-week currency comparison (up/down is not good/bad).
 * @param {number|null|undefined} currentValue
 * @param {number|null|undefined} priorValue
 * @param {{ priorWeekExists?: boolean }} [opts]
 */
export function buildCurrencyWeekComparison(currentValue, priorValue, opts = {}) {
  const current =
    currentValue != null && Number.isFinite(Number(currentValue)) ? Number(currentValue) : null;
  const prior = priorValue != null && Number.isFinite(Number(priorValue)) ? Number(priorValue) : null;
  const priorWeekExists = opts.priorWeekExists !== false;

  if (!priorWeekExists || prior == null) {
    return {
      currentValue: current,
      priorValue: null,
      currentDisplay: formatUsdCurrency(current),
      priorDisplay: null,
      dollarChange: null,
      percentChange: null,
      direction: /** @type {const} */ ("none"),
      dollarChangeText: "No prior week",
      percentChangeText: null,
      trendText: "No prior week"
    };
  }

  if (current == null) {
    return {
      currentValue: null,
      priorValue: prior,
      currentDisplay: null,
      priorDisplay: formatUsdCurrency(prior),
      dollarChange: null,
      percentChange: null,
      direction: /** @type {const} */ ("none"),
      dollarChangeText: "No current value",
      percentChangeText: null,
      trendText: `Prior week ${formatUsdCurrency(prior)}`
    };
  }

  const dollarChange = current - prior;
  let direction = "same";
  if (dollarChange > 0) direction = "up";
  else if (dollarChange < 0) direction = "down";

  const absDollars = formatUsdCurrency(Math.abs(dollarChange)) ?? "$0.00";
  let dollarChangeText = "Unchanged from last week";
  if (direction === "up") dollarChangeText = `Up ${absDollars} from last week`;
  else if (direction === "down") dollarChangeText = `Down ${absDollars} from last week`;

  let percentChange = null;
  let percentChangeText = null;
  if (prior !== 0) {
    percentChange = (dollarChange / Math.abs(prior)) * 100;
    const pctLabel = `${Math.abs(percentChange).toFixed(1)}%`;
    if (direction === "up") percentChangeText = `Up ${pctLabel} from last week`;
    else if (direction === "down") percentChangeText = `Down ${pctLabel} from last week`;
    else percentChangeText = "0.0% from last week";
  }

  const trendText = percentChangeText ? `${dollarChangeText} · ${percentChangeText}` : dollarChangeText;

  return {
    currentValue: current,
    priorValue: prior,
    currentDisplay: formatUsdCurrency(current),
    priorDisplay: formatUsdCurrency(prior),
    dollarChange,
    percentChange,
    direction,
    dollarChangeText,
    percentChangeText,
    trendText
  };
}

/**
 * @param {Array<object>} metrics
 * @param {{ weekLabel?: string, weekStart?: string, weekEnd?: string, generatedAt?: string }} meta
 */
export function buildManagerialFinancialReportText(metrics, meta = {}) {
  const generatedAt = meta.generatedAt || new Date().toISOString();
  const lines = [
    "Managerial Financial Report",
    meta.weekLabel ? `Week: ${meta.weekLabel}` : null,
    meta.weekStart && meta.weekEnd ? `${meta.weekStart} → ${meta.weekEnd}` : null,
    `Generated: ${generatedAt}`,
    "",
    "Restricted executive / leadership metrics only.",
    "This report does not include operational grades, mistakes, or the company weekly report.",
    ""
  ].filter((x) => x != null);

  for (const m of metrics ?? []) {
    lines.push(m.name);
    lines.push(`  Current: ${m.currentDisplay ?? "—"}`);
    lines.push(`  Prior week: ${m.priorDisplay ?? "—"}`);
    lines.push(`  Change: ${m.dollarChangeText ?? "—"}`);
    if (m.percentChangeText) lines.push(`  Percent: ${m.percentChangeText}`);
    lines.push(`  Trend: ${m.trendText ?? "—"}`);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * @param {Array<object>} metrics
 * @param {{ weekLabel?: string, weekStart?: string, weekEnd?: string, generatedAt?: string }} meta
 */
export function buildManagerialFinancialReportHtml(metrics, meta = {}) {
  const generatedAt = meta.generatedAt || new Date().toISOString();
  const generatedLabel = new Date(generatedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const cards = (metrics ?? [])
    .map((m) => {
      const pct =
        m.percentChangeText != null
          ? `<p class="mf-pct">${escapeHtml(m.percentChangeText)}</p>`
          : "";
      return `<article class="mf-card">
  <h2>${escapeHtml(m.name)}</h2>
  <p class="mf-current">${escapeHtml(m.currentDisplay ?? "—")}</p>
  <dl>
    <div><dt>Prior week</dt><dd>${escapeHtml(m.priorDisplay ?? "—")}</dd></div>
    <div><dt>Dollar change</dt><dd>${escapeHtml(m.dollarChangeText ?? "—")}</dd></div>
  </dl>
  ${pct}
  <p class="mf-trend">${escapeHtml(m.trendText ?? "—")}</p>
</article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Managerial Financial Report</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 0; padding: 32px; background: #f7f5f1; }
  .mf-wrap { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 1.75rem; margin: 0 0 8px; letter-spacing: -0.02em; }
  .mf-meta { color: #555; font-size: 0.95rem; margin: 0 0 8px; }
  .mf-note { color: #666; font-size: 0.85rem; margin: 0 0 24px; }
  .mf-grid { display: grid; gap: 16px; }
  .mf-card { background: #fff; border: 1px solid #d9d4cb; border-radius: 8px; padding: 20px 22px; box-shadow: 0 1px 0 rgba(0,0,0,0.03); }
  .mf-card h2 { margin: 0 0 10px; font-size: 1.05rem; font-family: system-ui, sans-serif; font-weight: 650; }
  .mf-current { font-size: 1.85rem; margin: 0 0 14px; font-variant-numeric: tabular-nums; }
  dl { margin: 0; display: grid; gap: 8px; }
  dl div { display: flex; justify-content: space-between; gap: 16px; font-family: system-ui, sans-serif; font-size: 0.9rem; }
  dt { color: #666; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  .mf-pct, .mf-trend { font-family: system-ui, sans-serif; font-size: 0.9rem; color: #444; margin: 12px 0 0; }
  @media print { body { background: #fff; padding: 16px; } .mf-card { break-inside: avoid; box-shadow: none; } }
</style>
</head>
<body>
<div class="mf-wrap">
  <h1>Managerial Financial Report</h1>
  <p class="mf-meta">${escapeHtml(meta.weekLabel || "Selected week")}${
    meta.weekStart && meta.weekEnd ? ` · ${escapeHtml(meta.weekStart)} → ${escapeHtml(meta.weekEnd)}` : ""
  }</p>
  <p class="mf-meta">Generated ${escapeHtml(generatedLabel)}</p>
  <p class="mf-note">Restricted financial metrics only. Not for broad distribution. Does not include operational grades or mistakes.</p>
  <div class="mf-grid">
${cards}
  </div>
</div>
</body>
</html>`;
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Ensure the three managerial sections exist for an organization (idempotent upsert by id).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {(error: unknown) => boolean} isMissingTableError
 */
export async function ensureManagerialFinancialSections(db, organizationId, isMissingTableError) {
  try {
    const rows = MANAGERIAL_FINANCIAL_SECTIONS.map((s) => ({
      id: s.id,
      organization_id: organizationId,
      name: s.name,
      goal_display: s.goalDisplay,
      goal_numeric: s.goalNumeric,
      metric_kind: s.metricKind,
      grading_enabled: s.gradingEnabled,
      sort_order: s.sortOrder,
      unit_label: s.unitLabel,
      is_active: true
    }));
    const { error } = await db.from("workforce_grading_sections").upsert(rows, { onConflict: "id" });
    if (error) {
      if (isMissingTableError(error)) return { seeded: false, schemaReady: false };
      throw error;
    }
    return { seeded: true, schemaReady: true };
  } catch (e) {
    if (isMissingTableError(e)) return { seeded: false, schemaReady: false };
    throw e;
  }
}

/**
 * @param {string} sectionId
 */
export function getManagerialFinancialSection(sectionId) {
  return SECTION_BY_ID.get(String(sectionId ?? "").trim()) ?? null;
}
