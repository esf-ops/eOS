/**
 * verifySalesDashboardSummary.mjs — lightweight unit tests for the Phase 1
 * Sales Dashboard bento summary aggregation logic.
 *
 * Tests the pure aggregation helpers (mirrored from salesHead.js) without a
 * database connection. Run:
 *
 *   node --check backend-core/src/scripts/verifySalesDashboardSummary.mjs
 *   node backend-core/src/scripts/verifySalesDashboardSummary.mjs
 *
 * These tests verify:
 *   1. Value uses customer_display_total over grand_total, falls back safely
 *   2. Outcome classification (won / lost / open) from quote_status
 *   3. Win rate = won / (won + lost)
 *   4. Empty input returns zeros + empty arrays (never throws / no fake data)
 *   5. Out-of-range rows excluded
 *   6. Null/blank status and null monday_item_id do not crash
 *   7. Monday handoff counts won quotes missing monday_item_id only
 *   8. Recent quote mapping is null-safe and never exposes Moraware attribution
 */

/* ── Inline helpers (mirror salesHead.js logic without imports) ────────── */

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

function classifyQuoteOutcome(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (/won|sold|accepted|approved/.test(s)) return "won";
  if (/lost|rejected|declined|cancel/.test(s)) return "lost";
  return "open";
}

function isFollowUpStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  return /follow.?up|lead_submitted|reviewing/.test(s);
}

function monthShortLabel(ym) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = Number(String(ym).slice(5, 7));
  const name = names[m - 1] || String(ym);
  return `${name} ${String(ym).slice(0, 4)}`;
}

function buildSalesDashboardSummary(rows, { startDate, endDate, todayYmd, weekStartYmd }) {
  let openValue = 0;
  let wonValue = 0;
  let lostValue = 0;
  let openCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let totalCount = 0;
  let totalValue = 0;
  let newToday = 0;
  let newThisWeek = 0;
  let followUp = 0;
  let mondayHandoff = 0;
  const trendMap = new Map();

  for (const row of rows || []) {
    const dateStr = row?.created_at ? String(row.created_at).slice(0, 10) : null;
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
    const { value } = pickKpiCdtValue(row);
    const outcome = classifyQuoteOutcome(row?.quote_status);

    totalCount += 1;
    totalValue += value;

    if (outcome === "won") {
      wonValue += value;
      wonCount += 1;
    } else if (outcome === "lost") {
      lostValue += value;
      lostCount += 1;
    } else {
      openValue += value;
      openCount += 1;
    }

    if (dateStr === todayYmd) newToday += 1;
    if (weekStartYmd && dateStr >= weekStartYmd && dateStr <= todayYmd) newThisWeek += 1;

    if (outcome === "open" && isFollowUpStatus(row?.quote_status)) followUp += 1;
    if (outcome === "won" && !String(row?.monday_item_id ?? "").trim()) mondayHandoff += 1;

    const ym = dateStr.slice(0, 7);
    if (!trendMap.has(ym)) {
      trendMap.set(ym, { period_start: ym, quoted_value: 0, won_value: 0, quote_count: 0 });
    }
    const t = trendMap.get(ym);
    t.quoted_value += value;
    if (outcome === "won") t.won_value += value;
    t.quote_count += 1;
  }

  const closed = wonCount + lostCount;
  const winRatePct = closed > 0 ? Math.round((wonCount / closed) * 1000) / 10 : 0;
  const averageQuoteValue = totalCount > 0 ? Math.round(totalValue / totalCount) : 0;

  const trend = [...trendMap.values()]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((t) => ({
      period: monthShortLabel(t.period_start),
      period_start: t.period_start,
      quoted_value: Math.round(t.quoted_value),
      won_value: Math.round(t.won_value),
      quote_count: t.quote_count
    }));

  return {
    summary: {
      open_pipeline_value: Math.round(openValue),
      won_value: Math.round(wonValue),
      active_quote_count: openCount,
      total_quote_count: totalCount,
      win_rate_pct: winRatePct,
      average_quote_value: averageQuoteValue,
      new_quotes_today: newToday,
      new_quotes_this_week: newThisWeek
    },
    estimate_outcomes: [
      { label: "Open", value: Math.round(openValue), count: openCount },
      { label: "Won", value: Math.round(wonValue), count: wonCount },
      { label: "Lost", value: Math.round(lostValue), count: lostCount }
    ],
    quote_activity: {
      new_today: newToday,
      new_this_week: newThisWeek,
      follow_up_queue: followUp,
      monday_handoff_needed: mondayHandoff,
      average_quote_value: averageQuoteValue
    },
    trend
  };
}

function mapRecentQuoteForSummary(row) {
  const { value } = pickKpiCdtValue(row || {});
  return {
    id: row?.id ?? null,
    quote_number: String(row?.quote_number ?? "").trim() || null,
    customer: String(row?.customer_name ?? "").trim() || null,
    project: String(row?.project_name ?? "").trim() || null,
    salesperson: String(row?.sales_rep ?? "").trim() || null,
    branch: String(row?.branch ?? "").trim() || null,
    value: Math.round(value),
    status: String(row?.quote_status ?? "").trim() || null,
    created_at: row?.created_at ?? null
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

const RANGE = { startDate: "2026-01-01", endDate: "2026-06-30", todayYmd: "2026-06-30", weekStartYmd: "2026-06-29" };

/* ── Tests ─────────────────────────────────────────────────────────────── */

console.log("\n── classifyQuoteOutcome ────────────────────────────────────");
{
  assertEqual(classifyQuoteOutcome("won"), "won", "won → won");
  assertEqual(classifyQuoteOutcome("sold"), "won", "sold → won");
  assertEqual(classifyQuoteOutcome("lost"), "lost", "lost → lost");
  assertEqual(classifyQuoteOutcome("cancelled"), "lost", "cancelled → lost");
  assertEqual(classifyQuoteOutcome("reviewing"), "open", "reviewing → open");
  assertEqual(classifyQuoteOutcome(""), "open", "blank → open");
  assertEqual(classifyQuoteOutcome(null), "open", "null status → open (no crash)");
}

console.log("\n── buildSalesDashboardSummary: mixed data ──────────────────");
{
  const rows = [
    { created_at: "2026-01-10T12:00:00", grand_total: 1000, calculation_snapshot: { internal_ui: { customer_display_total: 1200 } }, quote_status: "reviewing", monday_item_id: null },
    { created_at: "2026-02-05T12:00:00", grand_total: 2000, calculation_snapshot: null, quote_status: "won", monday_item_id: null },
    { created_at: "2026-02-20T12:00:00", grand_total: 3000, calculation_snapshot: null, quote_status: "won", monday_item_id: "M-123" },
    { created_at: "2026-03-01T12:00:00", grand_total: 500, calculation_snapshot: null, quote_status: "lost", monday_item_id: null }
  ];
  const r = buildSalesDashboardSummary(rows, RANGE);

  assertEqual(r.summary.total_quote_count, 4, "counts all 4 in-range rows");
  assertEqual(r.summary.open_pipeline_value, 1200, "open value uses CDT (1200)");
  assertEqual(r.summary.won_value, 5000, "won value sums two won quotes (2000 + 3000)");
  assertEqual(r.summary.active_quote_count, 1, "1 open quote");
  assertEqual(r.summary.win_rate_pct, 66.7, "win rate = 2 won / (2 won + 1 lost) = 66.7%");
  assertEqual(r.summary.average_quote_value, Math.round((1200 + 2000 + 3000 + 500) / 4), "average over all 4");
  assertEqual(r.quote_activity.follow_up_queue, 1, "1 follow-up (reviewing)");
  assertEqual(r.quote_activity.monday_handoff_needed, 1, "1 won quote missing monday_item_id");
  assertEqual(r.estimate_outcomes[0].count, 1, "outcomes: open count 1");
  assertEqual(r.estimate_outcomes[1].count, 2, "outcomes: won count 2");
  assertEqual(r.estimate_outcomes[2].count, 1, "outcomes: lost count 1");
  assertEqual(r.trend.length, 3, "3 monthly trend buckets (Jan, Feb, Mar)");
  assertEqual(r.trend[1].period, "Feb 2026", "second trend bucket labelled Feb 2026");
  assertEqual(r.trend[1].won_value, 5000, "Feb won_value = 5000");
}

console.log("\n── buildSalesDashboardSummary: empty input ─────────────────");
{
  const r = buildSalesDashboardSummary([], RANGE);
  assertEqual(r.summary.total_quote_count, 0, "empty → 0 count (not fake data)");
  assertEqual(r.summary.open_pipeline_value, 0, "empty → 0 open value");
  assertEqual(r.summary.win_rate_pct, 0, "empty → 0 win rate (no divide-by-zero)");
  assertEqual(r.estimate_outcomes.length, 3, "empty → still 3 outcome buckets, all zero");
  assertEqual(r.trend.length, 0, "empty → no trend buckets");
}

console.log("\n── buildSalesDashboardSummary: guards ──────────────────────");
{
  const r = buildSalesDashboardSummary(null, RANGE);
  assertEqual(r.summary.total_quote_count, 0, "null rows → 0 count (no crash)");
}
{
  const rows = [{ created_at: "2025-12-15T12:00:00", grand_total: 9999, quote_status: "won" }];
  const r = buildSalesDashboardSummary(rows, RANGE);
  assertEqual(r.summary.total_quote_count, 0, "out-of-range row excluded");
}
{
  const rows = [{ created_at: "2026-04-01T12:00:00", grand_total: 100, quote_status: null, monday_item_id: null }];
  const r = buildSalesDashboardSummary(rows, RANGE);
  assertEqual(r.summary.active_quote_count, 1, "null status treated as open (no crash)");
}

console.log("\n── mapRecentQuoteForSummary ────────────────────────────────");
{
  const row = {
    id: "abc",
    quote_number: "Q-1",
    customer_name: "Acme",
    project_name: "Kitchen",
    sales_rep: "Alex",
    branch: "Lisbon",
    grand_total: 1000,
    calculation_snapshot: { internal_ui: { customer_display_total: 1250 } },
    quote_status: "reviewing",
    created_at: "2026-05-01T00:00:00"
  };
  const m = mapRecentQuoteForSummary(row);
  assertEqual(m.value, 1250, "recent quote value uses CDT");
  assertEqual(m.customer, "Acme", "maps customer");
  assertEqual(m.branch, "Lisbon", "branch is a plain Quote Library field (not Moraware-attributed)");
  assert(!("worksheet_sqft" in m), "recent quote shape never exposes Moraware sqft");
}
{
  const m = mapRecentQuoteForSummary({});
  assertEqual(m.customer, null, "empty row → null customer (no crash)");
  assertEqual(m.value, 0, "empty row → 0 value");
}

/* ── Summary ────────────────────────────────────────────────────────── */

console.log(`\n── Results: ${passed} passed, ${failed} failed ─────────────────────\n`);
if (failed > 0) {
  process.exit(1);
}
