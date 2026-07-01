/**
 * verifyMorawareSalesQuery.mjs — unit tests for deterministic Moraware Sales query helpers.
 *
 *   node --check backend-core/src/scripts/verifyMorawareSalesQuery.mjs
 *   node backend-core/src/scripts/verifyMorawareSalesQuery.mjs
 */

import assert from "node:assert/strict";
import {
  classifyMorawareJobTags,
  classifyTextTags,
  rowMissingSqft,
  rowMatchesMorawareQueryFilters,
  buildMorawareQuerySummary,
  executeMorawareSalesQuery,
  normalizeMorawareQueryFilters
} from "../sales/morawareSalesQuery.js";

function row(overrides = {}) {
  return {
    source_job_id: "1001",
    account_name: "Sample Account",
    salesperson_name: "Sample Rep",
    process_name: "Kitchen",
    created_at_source: "2026-06-10T12:00:00Z",
    worksheet_sqft: 80,
    sqft_found: true,
    ...overrides
  };
}

// ── Tag classifier ────────────────────────────────────────────────────────

{
  const tags = classifyTextTags("Kitchen FHBS install");
  assert.ok(tags.includes("full_height_backsplash"), "FHBS matches full_height_backsplash");
  console.log("ok: FHBS → full_height_backsplash");
}

{
  const tags = classifyTextTags("full height backsplash to cabinets");
  assert.ok(tags.includes("full_height_backsplash"), "full height backsplash phrase matches");
  console.log("ok: full height backsplash phrase");
}

{
  const tags = classifyTextTags("warranty repair callback");
  assert.ok(tags.includes("customer_service"), "warranty repair matches customer_service");
  console.log("ok: warranty repair → customer_service");
}

{
  const tags = classifyTextTags("tear out existing tops demo");
  assert.ok(tags.includes("tear_out"), "tear out existing tops matches tear_out");
  console.log("ok: tear out phrase");
}

{
  assert.ok(classifyTextTags("remt sale").includes("remnant"), "remt matches remnant");
  assert.ok(classifyTextTags("remnant top").includes("remnant"), "remnant matches remnant");
  console.log("ok: remt / remnant");
}

{
  const tags = classifyTextTags("wet bar top install");
  assert.ok(tags.includes("wet_bar"), "wet bar matches wet_bar");
  console.log("ok: wet bar");
}

{
  assert.equal(rowMissingSqft({ sqft_found: false, worksheet_sqft: 50 }), true);
  assert.equal(rowMissingSqft({ sqft_found: true, worksheet_sqft: 0 }), true);
  assert.equal(rowMissingSqft({ sqft_found: true, worksheet_sqft: 42 }), false);
  const tags = classifyMorawareJobTags({ sqft_found: false, worksheet_sqft: null }, { job_name: "No sqft job" });
  assert.ok(tags.includes("missing_sqft"), "missing_sqft derived from sqft_found / worksheet_sqft");
  console.log("ok: missing_sqft derived tag");
}

// ── Query filters ─────────────────────────────────────────────────────────

{
  const filters = normalizeMorawareQueryFilters({ account: "Bedrock", limit: 9999 });
  assert.equal(filters.limit, 250, "limit capped at 250");
  const rows = [
    row({ account_name: "Bedrock Builders LLC" }),
    row({ account_name: "Other Co", source_job_id: "1002" })
  ];
  const matched = rows.filter((r) => rowMatchesMorawareQueryFilters(r, filters));
  assert.equal(matched.length, 1);
  assert.equal(matched[0].account_name, "Bedrock Builders LLC");
  console.log("ok: account filter");
}

{
  const filters = normalizeMorawareQueryFilters({ salesperson: "knake" });
  const rows = [row({ salesperson_name: "Ben Knake" }), row({ salesperson_name: "Other", source_job_id: "1002" })];
  assert.equal(rows.filter((r) => rowMatchesMorawareQueryFilters(r, filters)).length, 1);
  console.log("ok: salesperson filter");
}

{
  const filters = normalizeMorawareQueryFilters({ tags: ["wet_bar"] });
  const enrichment = { job_name: "Basement wet bar" };
  assert.equal(rowMatchesMorawareQueryFilters(row(), filters, enrichment), true);
  assert.equal(rowMatchesMorawareQueryFilters(row(), filters, { job_name: "Kitchen only" }), false);
  console.log("ok: tag filter");
}

{
  const filters = normalizeMorawareQueryFilters({ missing_sqft: true });
  assert.equal(rowMatchesMorawareQueryFilters(row({ sqft_found: false }), filters), true);
  assert.equal(rowMatchesMorawareQueryFilters(row({ worksheet_sqft: 90 }), filters), false);
  console.log("ok: missing_sqft filter");
}

{
  const filters = normalizeMorawareQueryFilters({ min_sqft: 100, max_sqft: 200 });
  assert.equal(rowMatchesMorawareQueryFilters(row({ worksheet_sqft: 150 }), filters), true);
  assert.equal(rowMatchesMorawareQueryFilters(row({ worksheet_sqft: 50 }), filters), false);
  assert.equal(rowMatchesMorawareQueryFilters(row({ worksheet_sqft: 250 }), filters), false);
  console.log("ok: min/max sqft filter");
}

// ── Summary + execute ─────────────────────────────────────────────────────

{
  const rows = [
    row({ worksheet_sqft: 100, sqft_found: true }),
    row({ source_job_id: "1002", worksheet_sqft: 50, sqft_found: true }),
    row({ source_job_id: "1003", sqft_found: false, worksheet_sqft: null })
  ];
  const summary = buildMorawareQuerySummary(rows);
  assert.equal(summary.job_count, 3);
  assert.equal(summary.jobs_with_sqft, 2);
  assert.equal(summary.total_sqft, 150);
  assert.equal(summary.avg_sqft_per_job, 75);
  assert.equal(summary.missing_sqft_count, 1);
  console.log("ok: summary calculations");
}

{
  const facts = [
    row({ account_name: "Bedrock Builders", created_at_source: "2026-06-05T00:00:00Z" }),
    row({
      source_job_id: "1002",
      account_name: "Other",
      created_at_source: "2026-01-01T00:00:00Z",
      worksheet_sqft: 120
    })
  ];
  const filters = normalizeMorawareQueryFilters({
    date_from: "2026-06-01",
    date_to: "2026-06-30",
    tags: ["kitchen"]
  });
  const result = executeMorawareSalesQuery(facts, filters, new Map());
  assert.equal(result.total_count, 1);
  assert.equal(result.summary.job_count, 1);
  assert.ok(result.filters_applied.some((c) => c.key === "date_range"));
  console.log("ok: executeMorawareSalesQuery date + tag");
}

console.log(`\nverifyMorawareSalesQuery: all tests passed`);
