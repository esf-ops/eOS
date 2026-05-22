/**
 * Partner Quote Foundation v1 — unit checks (no DB, no hardcoded partner names).
 * Run: node backend-core/src/scripts/verifyPartnerQuoteFoundation.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pickPartnerAccountFromAccesses,
  partnerRoleAllowsCalculate,
  partnerRoleAllowsSubmit,
  sanitizePartnerCalculateResponse
} from "../quotes/partnerQuoteSanitize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function assertNoHardcodedPartnerNamesInModule(relPath) {
  const text = fs.readFileSync(path.join(repoRoot, relPath), "utf8");
  const banned = ["skogman", "Skogman", "SKOGMAN"];
  for (const b of banned) {
    assert(!text.includes(b), `${relPath} must not reference ${b}`);
  }
}

const accessesOne = [{ partner_account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "partner_user", is_active: true }];
const pickedOne = pickPartnerAccountFromAccesses(accessesOne, {});
assert.equal(pickedOne.partnerAccountId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

const accessesNone = [];
const denied = pickPartnerAccountFromAccesses(accessesNone, {});
assert.equal(denied.code, "partner_access_denied");

const multi = [
  { partner_account_id: "11111111-1111-4111-8111-111111111111", role: "partner_admin", is_active: true },
  { partner_account_id: "22222222-2222-4222-8222-222222222222", role: "partner_user", is_active: true }
];
const partnersById = new Map([
  ["11111111-1111-4111-8111-111111111111", { id: "11111111-1111-4111-8111-111111111111", account_slug: "alpha-dealer" }],
  ["22222222-2222-4222-8222-222222222222", { id: "22222222-2222-4222-8222-222222222222", account_slug: "beta-builder" }]
]);
const needsPick = pickPartnerAccountFromAccesses(multi, { partnersById });
assert.equal(needsPick.code, "partner_account_selection_required");
assert.equal(needsPick.allowedPartners?.length, 2);

const bySlug = pickPartnerAccountFromAccesses(multi, { partnerAccountSlug: "beta-builder", partnersById });
assert.equal(bySlug.partnerAccountId, "22222222-2222-4222-8222-222222222222");

const forbidden = pickPartnerAccountFromAccesses(multi, {
  partnerAccountId: "99999999-9999-4999-8999-999999999999",
  partnersById
});
assert.equal(forbidden.code, "partner_account_forbidden");

const calcFixture = {
  totals: { retail: 12000, wholesale: 8000, profit: 4000, estimated_sqft: 42 },
  warnings: [],
  lineItems: [{ item_name: "Counter", category: "material", unit_price: 10, line_subtotal: 100, quantity: 1, unit_type: "sf" }],
  snapshot: {
    totals: { retail: 12000, wholesale: 8000, profit: 4000 },
    ruleCount: 99,
    internal_ui: { secret: true },
    pricingStructure: { id: "x", code: "TIER_A", name: "Tier A", pricing_mode: "partner" },
    retailMarkupPercent: 25
  },
  pricing: { structureCode: "TIER_A" }
};
const safe = sanitizePartnerCalculateResponse(calcFixture);
assert.equal(safe.display, "partner_quote_safe");
assert.equal(safe.totals.estimate_total, 12000);
assert.ok(safe.totals.wholesale === undefined);
assert.ok(safe.snapshot.ruleCount === undefined);
assert.ok(safe.snapshot.internal_ui === undefined);
assert.ok(safe.snapshot.totals?.wholesale === undefined);
assert.equal(safe.pricing.structure_label, "TIER_A");

assert.equal(partnerRoleAllowsCalculate("viewer"), false);
assert.equal(partnerRoleAllowsSubmit("partner_user"), true);

const modulesToScan = [
  "backend-core/src/quotes/partnerContext.js",
  "backend-core/src/quotes/partnerQuotesApi.js",
  "backend-core/src/quotes/partnerQuoteSanitize.js",
  "backend-core/supabase/partner_quote_foundation_v1_additive.sql"
];
for (const m of modulesToScan) assertNoHardcodedPartnerNamesInModule(m);

console.log("[verifyPartnerQuoteFoundation] all checks passed");
