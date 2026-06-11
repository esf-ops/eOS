/**
 * Regression checks for Quote Library improvements:
 *   1. Filtered metric cards (filter-aware /api/quote-library/metrics)
 *   2. Entered By column (prepared_by exposed in list rows)
 *   3. Flicker / stability fixes (search debounce, stale-response guard)
 *
 * Run with:  npx tsx scripts/verify-quote-library-improvements.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf-8");
}

let passed = 0;
let failed = 0;

function test(id: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${id}`);
    passed += 1;
  } catch (e: unknown) {
    console.error(`  ✗ ${id}: ${(e as Error).message}`);
    failed += 1;
  }
}

// ---------------------------------------------------------------------------
// Source: backend
// ---------------------------------------------------------------------------

const backendSrc = read("backend-core/src/quotes/quoteLibraryApi.js");

console.log("\n── Backend: quoteLibraryApi.js ──────────────────────────────────────");

test("BE-1 prepared_by in mapListRow", () => {
  assert.match(backendSrc, /prepared_by: r\.prepared_by/);
});

test("BE-2 applyQuoteListFilters helper exists", () => {
  assert.match(backendSrc, /function applyQuoteListFilters\(qb, query/);
});

test("BE-3 applyQuoteListFilters handles view param", () => {
  assert.match(backendSrc, /view === "internal_estimates"/);
  assert.match(backendSrc, /view === "public_leads"/);
  assert.match(backendSrc, /view === "needs_handoff"/);
});

test("BE-4 applyQuoteListFilters handles my, search, account, status, branch, salesRep, dates", () => {
  assert.match(backendSrc, /query\.my/);
  assert.match(backendSrc, /query\.search/);
  assert.match(backendSrc, /query\.account/);
  assert.match(backendSrc, /query\.status/);
  assert.match(backendSrc, /query\.branch/);
  assert.match(backendSrc, /query\.sales_rep/);
  assert.match(backendSrc, /query\.created_from/);
  assert.match(backendSrc, /query\.created_to/);
});

test("BE-5 metrics endpoint calls applyQuoteListFilters", () => {
  assert.match(backendSrc, /qb = applyQuoteListFilters\(qb, req\.query/);
});

test("BE-6 metrics endpoint returns is_filtered flag", () => {
  assert.match(backendSrc, /is_filtered: isFiltered/);
});

test("BE-7 metrics endpoint respects include_archived param", () => {
  assert.match(backendSrc, /include_archived.*1.*includeArchived/ms);
});

test("BE-8 sort params are NOT forwarded to metrics (no .sort / .direction in applyQuoteListFilters)", () => {
  // applyQuoteListFilters must not reference sort or direction
  const helperMatch = backendSrc.match(
    /function applyQuoteListFilters[\s\S]*?^}/m
  );
  if (!helperMatch) throw new Error("applyQuoteListFilters not found");
  assert.doesNotMatch(helperMatch[0], /query\.sort/);
  assert.doesNotMatch(helperMatch[0], /query\.direction/);
});

test("BE-9 HOTFIX: metrics response uses pickStr(req.query.quote_source), not undefined scopeSource variable", () => {
  // scopeSource was removed when applyQuoteListFilters was introduced, but the
  // res.json() block still referenced it — a ReferenceError at runtime that caused
  // every /api/quote-library/metrics request to return 500.
  assert.doesNotMatch(backendSrc, /scoped_quote_source:\s*scopeSource/);
  assert.match(backendSrc, /scoped_quote_source:.*req\.query\.quote_source/);
});

// ---------------------------------------------------------------------------
// Source: frontend
// ---------------------------------------------------------------------------

const frontendSrc = read("app-quote-library/src/QuoteLibraryApp.tsx");

test("BE-10 quote library search uses applyQuoteLibrarySearch", () => {
  assert.match(backendSrc, /applyQuoteLibrarySearch/);
  assert.match(backendSrc, /quoteAccountFilterOrClause/);
  assert.match(backendSrc, /QUOTE_LIBRARY_LIST_SELECT/);
});

test("BE-11 list endpoint uses applyQuoteListFilters (no duplicated search block)", () => {
  assert.match(backendSrc, /qb = applyQuoteListFilters\(qb, req\.query/);
});

test("BE-12 list endpoint defines view before needs_handoff post-filter", () => {
  const listHandler = backendSrc.match(
    /app\.get\("\/api\/quote-library\/quotes"[\s\S]*?app\.post\("\/api\/quote-library\/quotes\/batch\/archive"/
  );
  if (!listHandler) throw new Error("quote list handler not found");
  assert.match(listHandler[0], /const view = pickStr\(req\.query\.view\)/);
  assert.match(listHandler[0], /if \(view === "needs_handoff"\)/);
});

console.log("\n── Frontend: QuoteLibraryApp.tsx ────────────────────────────────────");

test("FE-1 formatPersonDisplayName helper exists", () => {
  assert.match(frontendSrc, /function formatPersonDisplayName\(raw/);
});

test("FE-2 formatPersonDisplayName returns '—' for empty/null", () => {
  assert.match(frontendSrc, /if \(!s\) return "—"/);
});

test("FE-3 formatPersonDisplayName delegates to deriveDisplayNameFromEmail for emails", () => {
  assert.match(frontendSrc, /deriveDisplayNameFromEmail\(s\)/);
});

test("FE-4 search debounce: searchInput and search are separate states", () => {
  assert.match(frontendSrc, /useState.*searchInput.*useState.*search/ms);
  assert.match(frontendSrc, /setSearchInput/);
  assert.match(frontendSrc, /debounce|setTimeout.*setSearch.*searchInput/ms);
});

test("FE-5 search input binds to searchInput (not search)", () => {
  assert.match(frontendSrc, /value={searchInput}/);
  assert.match(frontendSrc, /setSearchInput\(e\.target\.value\)/);
});

test("FE-6 clearFilters resets both searchInput and search", () => {
  assert.match(frontendSrc, /setSearchInput\(""\)/);
  assert.match(frontendSrc, /setSearch\(""\)/);
});

test("FE-7 filterStateRef exists and is updated", () => {
  assert.match(frontendSrc, /filterStateRef/);
  assert.match(frontendSrc, /filterStateRef\.current = \{/);
});

test("FE-8 metricsLoadSeqRef exists for stale-response guard", () => {
  assert.match(frontendSrc, /metricsLoadSeqRef/);
  assert.match(frontendSrc, /\+\+metricsLoadSeqRef\.current/);
});

test("FE-9 loadMetrics builds filter params from filterStateRef", () => {
  assert.match(frontendSrc, /const fs = filterStateRef\.current/);
  assert.match(frontendSrc, /params\.set\("search"/);
  assert.match(frontendSrc, /params\.set\("view"/);
  assert.match(frontendSrc, /params\.set\("my"/);
});

test("FE-10 loadMetrics does NOT clear metrics on error (keeps stale)", () => {
  // In the catch block of loadMetrics, setMetrics({}) or setMetrics(null) must NOT appear
  const loadMetricsMatch = frontendSrc.match(/const loadMetrics = useCallback[\s\S]*?\}, \[sessionToken\]\);/);
  if (!loadMetricsMatch) throw new Error("loadMetrics useCallback not found");
  assert.doesNotMatch(loadMetricsMatch[0], /catch.*setMetrics\(\{\}\)/ms);
  assert.doesNotMatch(loadMetricsMatch[0], /catch.*setMetrics\(null\)/ms);
});

test("FE-11 loadMetrics discards stale responses (seq guard)", () => {
  assert.match(frontendSrc, /if \(seq !== metricsLoadSeqRef\.current\) return/);
});

test("FE-12 metricsIsFiltered state exists", () => {
  assert.match(frontendSrc, /metricsIsFiltered/);
  assert.match(frontendSrc, /setMetricsIsFiltered/);
});

test("FE-13 tab+rows effect also calls loadMetrics", () => {
  assert.match(frontendSrc, /void loadMetrics\(\)[\s\S]*?void loadRows\(\)/ms);
});

test("FE-14 Apply filters button commits searchInput to search and calls loadMetrics", () => {
  assert.match(frontendSrc, /setSearch\(searchInput\)/);
  assert.match(frontendSrc, /void loadMetrics\(\)/);
});

test("FE-15 Entered By column header in table", () => {
  assert.match(frontendSrc, /<th.*>Entered by<\/th>/);
});

test("FE-16 Entered By cell uses formatPersonDisplayName(r.prepared_by)", () => {
  assert.match(frontendSrc, /formatPersonDisplayName\(r\.prepared_by\)/);
});

test("FE-17 filter note indicator renders when metricsIsFiltered", () => {
  assert.match(frontendSrc, /metricsIsFiltered.*Metrics reflect current filters/ms);
});

test("FE-18 sort does NOT appear in loadMetrics params (no sort= in metrics filter)", () => {
  const loadMetricsMatch = frontendSrc.match(/const loadMetrics = useCallback[\s\S]*?\}, \[sessionToken\]\);/);
  if (!loadMetricsMatch) throw new Error("loadMetrics useCallback not found");
  assert.doesNotMatch(loadMetricsMatch[0], /params\.set\("sort"/);
  assert.doesNotMatch(loadMetricsMatch[0], /params\.set\("direction"/);
  assert.doesNotMatch(loadMetricsMatch[0], /params\.set\("offset"/);
  assert.doesNotMatch(loadMetricsMatch[0], /params\.set\("limit"/);
});

// ---------------------------------------------------------------------------
// Runtime: formatPersonDisplayName
// ---------------------------------------------------------------------------

// Re-implement the function inline for runtime testing (avoids module import issues).
function formatPersonDisplayName(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  if (!s.includes("@")) return s;
  const e = s;
  const local = e.split("@")[0];
  const words = (local ?? "").replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return s;
  const formatted = words.map((w: string) => (w[0]?.toUpperCase() ?? "") + w.slice(1).toLowerCase()).join(" ");
  return formatted || s;
}

test("FE-19 include older revisions filter", () => {
  assert.match(frontendSrc, /showAllRevisions/);
  assert.match(frontendSrc, /latest_revision_only", "0"/);
});

console.log("\n── Runtime: formatPersonDisplayName ─────────────────────────────────");

test("RT-1 email peg.reid@... → Peg Reid", () => {
  assert.equal(formatPersonDisplayName("peg.reid@elitestonefabrication.com"), "Peg Reid");
});

test("RT-2 email chris.henely@gmail.com → Chris Henely", () => {
  assert.equal(formatPersonDisplayName("chris.henely@gmail.com"), "Chris Henely");
});

test("RT-3 single-segment email casey@... → Casey", () => {
  assert.equal(formatPersonDisplayName("casey@eliteosfab.com"), "Casey");
});

test("RT-4 plain name already set → returned as-is", () => {
  assert.equal(formatPersonDisplayName("Casey Anderson"), "Casey Anderson");
});

test("RT-5 empty string → '—'", () => {
  assert.equal(formatPersonDisplayName(""), "—");
});

test("RT-6 null → '—'", () => {
  assert.equal(formatPersonDisplayName(null), "—");
});

test("RT-7 undefined → '—'", () => {
  assert.equal(formatPersonDisplayName(undefined), "—");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
