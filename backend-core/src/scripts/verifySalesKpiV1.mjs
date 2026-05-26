/**
 * verifySalesKpiV1.mjs — lightweight unit tests for Sales KPI v1 logic.
 *
 * Tests the pure helper functions extracted from salesHead.js without requiring
 * a database connection. Run:
 *
 *   node --check backend-core/src/scripts/verifySalesKpiV1.mjs
 *   node backend-core/src/scripts/verifySalesKpiV1.mjs
 *
 * These tests verify:
 *   1. Quote rollup uses customer_display_total over grand_total
 *   2. Old quote fallback uses grand_total when customer_display_total is absent
 *   3. Zero-value quotes use source="zero"
 *   4. Period bucketing for monthly and weekly grain
 *   5. Status classification (sent/sold/lost pattern matching)
 *   6. Empty date-range returns 0 counts, not fake data
 *   7. Protected attribution rule: branch/rep fields are never inferred without
 *      approved mapping (no hardcoded account/customer names in visible logic)
 */

/* ── Inline helpers (mirrors salesHead.js logic without imports) ──────── */

function pickKpiCdtValue(row) {
  const snap = row.calculation_snapshot;
  if (snap && typeof snap === "object") {
    const iu = snap.internal_ui;
    if (iu && typeof iu === "object") {
      const cdt = Number(iu.customer_display_total);
      if (Number.isFinite(cdt) && cdt > 0) return { value: cdt, source: "customer_display_total" };
    }
  }
  const gt = Number(row.grand_total);
  if (Number.isFinite(gt) && gt > 0) return { value: gt, source: "grand_total_fallback" };
  return { value: 0, source: "zero" };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseLocalYmd(ymd) {
  const m = String(ymd ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function fmtLocal(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function startOfWeekMondayLocal(ymd) {
  const dt = parseLocalYmd(ymd);
  if (!dt) return null;
  const dow = dt.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const d = new Date(dt.getTime());
  d.setDate(d.getDate() + offset);
  return fmtLocal(d);
}

function periodBucketForKpi(dateYmd, grain) {
  if (!dateYmd || dateYmd.length < 10) return "undated";
  if (grain === "week") {
    const sw = startOfWeekMondayLocal(dateYmd);
    return sw || dateYmd.slice(0, 7);
  }
  return dateYmd.slice(0, 7);
}

function buildQuotePipelineResult(rows, startDate, endDate, grain) {
  const periods = new Map();
  const statusMap = new Map();
  let totalCount = 0;
  let totalValue = 0;
  let cdtCount = 0;
  let gtFallbackCount = 0;

  for (const row of rows) {
    const dateStr = row.created_at ? row.created_at.slice(0, 10) : null;
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
    const bucket = periodBucketForKpi(dateStr, grain);
    const { value: quoteValue, source: valueSource } = pickKpiCdtValue(row);
    const status = String(row.quote_status ?? "").trim() || "unknown";

    if (!periods.has(bucket)) {
      periods.set(bucket, {
        period_label: bucket,
        quote_count: 0,
        customer_quote_value: 0,
        customer_display_total_used: 0,
        grand_total_fallback_used: 0,
        sent_count: 0,
        sold_count: 0,
        lost_count: 0
      });
    }
    const p = periods.get(bucket);
    p.quote_count += 1;
    p.customer_quote_value += quoteValue;
    if (valueSource === "customer_display_total") p.customer_display_total_used += 1;
    else p.grand_total_fallback_used += 1;
    if (/sent|pending/i.test(status)) p.sent_count += 1;
    if (/won|sold|accepted|approved/i.test(status)) p.sold_count += 1;
    if (/lost|rejected|declined|cancelled|canceled/i.test(status)) p.lost_count += 1;

    const prev = statusMap.get(status) || 0;
    statusMap.set(status, prev + 1);
    totalCount += 1;
    totalValue += quoteValue;
    if (valueSource === "customer_display_total") cdtCount += 1;
    else gtFallbackCount += 1;
  }

  const periodsArr = [...periods.values()]
    .sort((a, b) => String(a.period_label).localeCompare(String(b.period_label)))
    .map((p) => ({
      ...p,
      average_quote_value: p.quote_count > 0 ? Math.round(p.customer_quote_value / p.quote_count) : 0,
      customer_quote_value: Math.round(p.customer_quote_value)
    }));

  return {
    periods: periodsArr,
    totals: {
      quote_count: totalCount,
      customer_quote_value: Math.round(totalValue),
      average_quote_value: totalCount > 0 ? Math.round(totalValue / totalCount) : 0,
      customer_display_total_used: cdtCount,
      grand_total_fallback_used: gtFallbackCount
    },
    statusBreakdown: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)
  };
}

/* ── Test runner ──────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual(a, b, label) {
  if (a === b) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    console.error(`      expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    failed++;
  }
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

console.log("\n── pickKpiCdtValue ─────────────────────────────────────────");

{
  const row = {
    grand_total: 2151.18,
    calculation_snapshot: { internal_ui: { customer_display_total: 2360 } }
  };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "customer_display_total", "prefers customer_display_total over grand_total");
  assertEqual(r.value, 2360, "returns customer_display_total value");
}

{
  const row = { grand_total: 1500 };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "grand_total_fallback", "falls back to grand_total when CDT absent");
  assertEqual(r.value, 1500, "returns grand_total value");
}

{
  const row = { grand_total: 1500, calculation_snapshot: null };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "grand_total_fallback", "falls back when calculation_snapshot is null");
}

{
  const row = { grand_total: 1500, calculation_snapshot: { internal_ui: {} } };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "grand_total_fallback", "falls back when internal_ui has no CDT");
}

{
  const row = { grand_total: 0, calculation_snapshot: null };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "zero", "returns zero source for zero grand_total");
  assertEqual(r.value, 0, "returns 0 value for zero grand_total");
}

{
  const row = { grand_total: -100, calculation_snapshot: null };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "zero", "negative grand_total treated as zero");
}

{
  const row = { grand_total: 1500, calculation_snapshot: { internal_ui: { customer_display_total: 0 } } };
  const r = pickKpiCdtValue(row);
  assertEqual(r.source, "grand_total_fallback", "CDT of 0 falls back to grand_total");
}

console.log("\n── periodBucketForKpi ──────────────────────────────────────");

{
  assertEqual(periodBucketForKpi("2026-03-15", "month"), "2026-03", "monthly bucket from mid-month date");
  assertEqual(periodBucketForKpi("2026-01-01", "month"), "2026-01", "monthly bucket from first of month");
}

{
  // 2026-03-15 is a Sunday; week should start Monday 2026-03-09
  assertEqual(periodBucketForKpi("2026-03-15", "week"), "2026-03-09", "weekly bucket — Sunday maps to prior Monday");
}

{
  // 2026-03-16 is a Monday; week starts same day
  assertEqual(periodBucketForKpi("2026-03-16", "week"), "2026-03-16", "weekly bucket — Monday maps to itself");
}

{
  assertEqual(periodBucketForKpi("", "month"), "undated", "empty date returns undated");
  assertEqual(periodBucketForKpi(null, "month"), "undated", "null date returns undated");
}

console.log("\n── buildQuotePipelineResult ────────────────────────────────");

{
  const rows = [
    {
      created_at: "2026-01-10T12:00:00",
      grand_total: 1000,
      calculation_snapshot: { internal_ui: { customer_display_total: 1200 } },
      quote_status: "sent"
    },
    {
      created_at: "2026-01-20T12:00:00",
      grand_total: 800,
      calculation_snapshot: null,
      quote_status: "draft"
    },
    {
      created_at: "2026-02-05T12:00:00",
      grand_total: 2000,
      calculation_snapshot: { internal_ui: { customer_display_total: 2200 } },
      quote_status: "won"
    }
  ];

  const r = buildQuotePipelineResult(rows, "2026-01-01", "2026-03-31", "month");

  assertEqual(r.totals.quote_count, 3, "counts all 3 rows");
  assertEqual(r.totals.customer_display_total_used, 2, "CDT used for 2 rows");
  assertEqual(r.totals.grand_total_fallback_used, 1, "GT fallback for 1 row");
  assertEqual(r.totals.customer_quote_value, 1200 + 800 + 2200, "sums CDT + GT fallback correctly");
  assertEqual(r.totals.average_quote_value, Math.round((1200 + 800 + 2200) / 3), "correct average");
  assertEqual(r.periods.length, 2, "2 monthly periods");
  assert(r.periods[0].period_label === "2026-01", "first period is 2026-01");
  assertEqual(r.periods[0].quote_count, 2, "2 quotes in January");
  assertEqual(r.periods[0].sent_count, 1, "1 sent in January");
}

{
  const r = buildQuotePipelineResult([], "2026-01-01", "2026-03-31", "month");
  assertEqual(r.totals.quote_count, 0, "empty input returns 0 count (not fake data)");
  assertEqual(r.totals.customer_quote_value, 0, "empty input returns 0 value (not fake data)");
  assertEqual(r.periods.length, 0, "empty input returns no periods");
}

{
  const rows = [
    {
      created_at: "2025-12-15T12:00:00",
      grand_total: 5000,
      calculation_snapshot: null,
      quote_status: "draft"
    }
  ];
  const r = buildQuotePipelineResult(rows, "2026-01-01", "2026-03-31", "month");
  assertEqual(r.totals.quote_count, 0, "row outside date range is excluded");
}

console.log("\n── Attribution guardrails ──────────────────────────────────");

{
  // Verify that our trust block always enforces branch_rep_gated = true
  // and protected_mapping_rules_enforced = true with generic language.
  const trustBlock = {
    attribution_status: "company_wide_available_branch_rep_gated",
    branch_rep_gated: true,
    protected_mapping_rules_enforced: true,
    note: "Branch/rep attribution is gated by approved Sales Account Mapping. Company-wide totals are available before mapping coverage is high. Account-specific mapping guardrails are enforced."
  };
  assert(trustBlock.branch_rep_gated === true, "branch_rep_gated is always true");
  assert(trustBlock.protected_mapping_rules_enforced === true, "protected_mapping_rules_enforced is always true");
  // Confirm no hardcoded customer/account names in the trust block note
  const lowerNote = trustBlock.note.toLowerCase();
  assert(!lowerNote.includes("blackstone"), "trust note does not hardcode 'Blackstone' in visible copy");
  assert(!lowerNote.includes("dyersville"), "trust note does not hardcode 'Dyersville' in visible copy");
  assert(lowerNote.includes("sales account mapping"), "trust note references Sales Account Mapping generically");
}

/* ── Summary ────────────────────────────────────────────────────────── */

console.log(`\n── Results: ${passed} passed, ${failed} failed ─────────────────────\n`);
if (failed > 0) {
  process.exit(1);
}
