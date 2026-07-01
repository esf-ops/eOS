/**
 * Run: node app-sales/src/lib/salesQueryParser.test.mjs
 */
import assert from "node:assert/strict";
import { parseSalesQuery } from "./salesQueryParser.ts";

const NOW = new Date("2026-07-01T12:00:00Z");

{
  const r = parseSalesQuery("full height backsplash jobs in June", NOW);
  assert.ok(r.filters.tags?.includes("full_height_backsplash"));
  assert.equal(r.filters.date_from, "2026-06-01");
  assert.equal(r.filters.date_to, "2026-06-30");
  console.log("ok: full height backsplash jobs in June");
}

{
  const r = parseSalesQuery("jobs for Bedrock Builders this year", NOW);
  assert.equal(r.filters.account, "Bedrock Builders");
  assert.equal(r.filters.date_from, "2026-01-01");
  assert.equal(r.filters.date_to, "2026-07-01");
  console.log("ok: jobs for Bedrock Builders this year");
}

{
  const r = parseSalesQuery("customer service jobs last month", NOW);
  assert.ok(r.filters.tags?.includes("customer_service"));
  assert.equal(r.filters.date_from, "2026-06-01");
  assert.equal(r.filters.date_to, "2026-06-30");
  console.log("ok: customer service jobs last month");
}

{
  const r = parseSalesQuery("jobs missing sqft", NOW);
  assert.equal(r.filters.missing_sqft, true);
  assert.ok(r.filters.tags?.includes("missing_sqft"));
  console.log("ok: jobs missing sqft");
}

{
  const r = parseSalesQuery("jobs over 100 sqft", NOW);
  assert.equal(r.filters.min_sqft, 100);
  console.log("ok: jobs over 100 sqft");
}

console.log("\nsalesQueryParser: all tests passed");
