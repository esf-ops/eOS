/**
 * Edge grouping + review-submit regressions for Digital Estimate.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseEdgeGroupsAndReviewSubmit.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sortEdgeOptionsByCanonicalOrder,
  edgeTokenFromOptionKey,
  isIncludedEdgeToken,
  isUpgradedEdgeToken,
} from "./edgeGroups.ts";
import { classifyConfigurationMutationError } from "./publicConfigApi.ts";
import { resolveEdgeOptionPriceEffect } from "../../backend-core/src/digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { extractLockedRoomsFromEvidence } from "../../backend-core/src/digitalEstimate/configuration/configurationTrustedContext.mjs";
import {
  createInMemoryAmendmentRepository,
  createSupabaseAmendmentRepository,
} from "../../backend-core/src/digitalEstimate/configuration/amendmentRepository.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const reviewSvc = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/reviewRequestService.mjs"),
  "utf8",
);
const reviewRoutes = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/reviewRequestRoutes.js"),
  "utf8",
);
const amdRepo = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/amendmentRepository.mjs"),
  "utf8",
);
const trusted = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/configurationTrustedContext.mjs",
  ),
  "utf8",
);

console.log("\nphaseEdgeGroupsAndReviewSubmit.test.ts\n");

// 1. Edge options grouped
assert.ok(view.includes("de-edge-group-included"), "1. Included group");
assert.ok(view.includes("de-edge-group-upgraded"), "1. Upgraded group");
assert.ok(view.includes("Included edges"), "1. Included label");
assert.ok(view.includes("Upgraded edges"), "1. Upgraded label");
assert.ok(view.includes("de-edge-option"), "1. edge option buttons");
assert.ok(!/de-edge-dropdown[\s\S]{0,400}<select/.test(view), "1. flat native select removed from edge");
{
  const grouped = sortEdgeOptionsByCanonicalOrder([
    { optionKey: "edge:k:edge_knife", displayLabel: "Knife" },
    { optionKey: "edge:k:edge_eased", displayLabel: "Eased" },
    { optionKey: "edge:k:edge_small_ogee", displayLabel: "Small Ogee" },
    { optionKey: "edge:k:edge_bevel", displayLabel: "Bevel" },
  ]);
  assert.deepEqual(
    grouped.included.map((o) => edgeTokenFromOptionKey(o.optionKey)),
    ["edge_eased", "edge_bevel"],
  );
  assert.deepEqual(
    grouped.upgraded.map((o) => edgeTokenFromOptionKey(o.optionKey)),
    ["edge_small_ogee", "edge_knife"],
  );
  assert.equal(isIncludedEdgeToken("edge_eased"), true);
  assert.equal(isUpgradedEdgeToken("edge_crescent"), true);
}
console.log("ok: 1. edge groups");

// 2-5. Price effects
{
  const lf = 10.13;
  const original = resolveEdgeOptionPriceEffect({
    profileToken: "edge_eased",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: lf,
    pricingBasis: "direct",
  });
  assert.equal(original.priceEffectLabel, "Original selection");
  const included = resolveEdgeOptionPriceEffect({
    profileToken: "edge_bevel",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: lf,
    pricingBasis: "direct",
  });
  assert.equal(included.priceEffectLabel, "Included");
  for (const token of ["edge_small_ogee", "edge_crescent", "edge_knife"]) {
    const effect = resolveEdgeOptionPriceEffect({
      profileToken: token,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: lf,
      pricingBasis: "direct",
    });
    assert.match(effect.priceEffectLabel, /^\+\$/, token);
    assert.notEqual(effect.customerPriceTreatment, "review_required", token);
    assert.equal(effect.reviewReasonCode, null, token);
  }
  const missing = resolveEdgeOptionPriceEffect({
    profileToken: "edge_small_ogee",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 0,
    pricingBasis: "direct",
  });
  assert.equal(missing.customerPriceTreatment, "review_required");
  assert.equal(missing.reviewReasonCode, "missing_edge_lf");
}
console.log("ok: 2-5. edge price effects");

// Edge LF recovery from edgeFinalLf / project aggregate
{
  const { rooms } = extractLockedRoomsFromEvidence(
    {
      calculationSnapshotCopy: {
        internal_ui: {
          estimate_rooms: [
            {
              id: "kitchen",
              name: "Kitchen",
              countertopSqft: 40,
              backsplashSqft: 0,
              materialGroup: "Group Promo",
              edgeFinalLf: 12.5,
            },
          ],
          edge_linear_feet_total: 12.5,
        },
      },
    },
    {},
  );
  assert.ok(rooms[0].edgeLinearFeet >= 12.5);
}
assert.ok(trusted.includes("edgeFinalLf") || trusted.includes("edge_final_lf"), "LF recovery fields");
assert.ok(trusted.includes("edge_linear_feet_total"), "project aggregate recovery");
console.log("ok: edge LF recovery from freeze fields");

// 9. Print includes edge
assert.ok(
  readFileSync(join(__dirname, "customerPrintAdapter.ts"), "utf8").includes("Edge"),
  "9. print adapter edge",
);

// 10-17. Review submit path
assert.ok(amdRepo.includes("async createReviewRequest"), "supabase createReviewRequest present");
assert.ok(
  amdRepo.includes("getCurrentReviewRequestForSession"),
  "supabase getCurrentReviewRequestForSession",
);
assert.ok(reviewSvc.includes("stale_configuration"), "envelope mismatch not unavailable");
assert.ok(reviewSvc.includes("Your selections were sent to Elite for review."), "success copy");
assert.ok(reviewRoutes.includes("A newer estimate is available"), "replaced message");
assert.ok(reviewRoutes.includes("This estimate link is no longer active"), "expired message");
assert.ok(reviewRoutes.includes("Please wait for your changes to finish saving"), "pending message");
assert.ok(view.includes("Please wait for your changes to finish saving"), "13. pending blocks");
assert.ok(api.includes("We couldn’t send your review request"), "transient mapping");

{
  const expired = classifyConfigurationMutationError(410, {
    error: "gone",
    code: "publication_expired",
    lifecycleFatal: true,
  });
  assert.match(expired.message, /no longer active/i);
  assert.equal(expired.lifecycleFatal, true);

  const replaced = classifyConfigurationMutationError(410, {
    error: "gone",
    code: "publication_superseded",
    lifecycleFatal: true,
  });
  assert.match(replaced.message, /newer estimate/i);

  const pending = classifyConfigurationMutationError(409, {
    error: "stale",
    code: "stale_configuration",
  });
  assert.match(pending.message, /finish saving/i);

  const generic = classifyConfigurationMutationError(404, {
    error: "Estimate unavailable",
    code: "not_found",
  });
  assert.doesNotMatch(generic.message, /^Estimate unavailable$/i);
  assert.equal(generic.lifecycleFatal, false);
}
console.log("ok: 10-17. review readiness + messages");

// Memory createReviewRequest still works; supabase factory exposes create
{
  const mem = createInMemoryAmendmentRepository();
  const a = await mem.createReviewRequest({
    organizationId: "org",
    publicationId: "pub",
    envelopeId: "env",
    envelopeVersion: 1,
    sessionId: "sess",
    selectionId: "sel",
    calculationId: "calc",
    selectionHash: "hash1",
    calculationInputFingerprint: "fp1",
    clientIdempotencyKey: "idem-1",
    requestSnapshotJson: { version: 1 },
  });
  const b = await mem.createReviewRequest({
    organizationId: "org",
    publicationId: "pub",
    envelopeId: "env",
    envelopeVersion: 1,
    sessionId: "sess",
    selectionId: "sel",
    calculationId: "calc",
    selectionHash: "hash1",
    calculationInputFingerprint: "fp1",
    clientIdempotencyKey: "idem-1",
    requestSnapshotJson: { version: 1 },
  });
  assert.equal(a.reused, false);
  assert.equal(b.reused, true);
  assert.equal(a.request.id, b.request.id);
  assert.equal(typeof createSupabaseAmendmentRepository, "function");
}
console.log("ok: 12. duplicate idempotent review request");

// 18. no LF/rate in public view source for edge selector
assert.ok(!/ratePerLf|pricingBasis|W edge|D edge/.test(view.match(/de-edge-dropdown[\s\S]{0,2500}/)?.[0] || ""));
console.log("ok: 18. no LF/rate/basis in edge UI");

console.log("\nphaseEdgeGroupsAndReviewSubmit: all checks passed\n");
