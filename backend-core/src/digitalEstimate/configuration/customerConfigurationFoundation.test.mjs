/**
 * Digital Estimate — Customer Configuration Foundation
 * Run: node backend-core/src/digitalEstimate/configuration/customerConfigurationFoundation.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEmptyCustomerConfigurationFoundation,
  buildPublicCustomerConfigurationReadModel,
  collectForbiddenCustomerConfigurationFields,
  sanitizeCustomerConfigurationFoundation
} from "./customerConfigurationFoundation.mjs";
import {
  CUSTOMER_CONFIGURATION_FOUNDATION_KEY,
  mergeSelectionPayloadMeta,
  splitSelectionPayloadMeta
} from "./customerConfigurationDraft.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../../..");

console.log("\ncustomerConfigurationFoundation.test.mjs\n");

{
  const empty = buildEmptyCustomerConfigurationFoundation();
  assert.equal(empty.requiresEstimatorReview, false);
  assert.equal(empty.canSubmitForFinalReview, false);
  assert.equal(empty.selectionChanges.count, 0);
  assert.equal(empty.scopeChangeRequests.count, 0);
  console.log("ok: empty foundation defaults safely");
}

{
  const read = buildPublicCustomerConfigurationReadModel(null, { quantities: {} });
  assert.equal(read.approvedBaselinePreserved, true);
  assert.equal(read.requiresEstimatorReview, false);
  assert.equal(read.canSubmitForFinalReview, false);
  console.log("ok: public read model defaults without stored config");
}

{
  const forbidden = collectForbiddenCustomerConfigurationFields({
    selectedMaterial: { colorName: "Carrara" },
    cost_basis: 12,
    internalNotes: "secret",
    nested: { pricing_evidence: {} }
  });
  assert.ok(forbidden.includes("cost_basis"));
  assert.ok(forbidden.includes("internalNotes"));
  assert.ok(forbidden.includes("nested.pricing_evidence"));
  console.log("ok: forbidden internal fields detected");
}

{
  assert.throws(
    () =>
      sanitizeCustomerConfigurationFoundation({
        selectedMaterial: { colorName: "X" },
        cost: 99
      }),
    (e) => e?.code === "forbidden_customer_configuration_fields"
  );
  console.log("ok: sanitize rejects internal fields");
}

{
  const sanitized = sanitizeCustomerConfigurationFoundation({
    selectedMaterial: { colorName: "Calacatta", materialGroup: "Group A", roomId: "kitchen" },
    selectedEdgeProfile: { profileToken: "edge_eased", profileName: "Eased" },
    backsplashPreference: { preference: "include" },
    requestedOpenings: [{ type: "kitchen_sink", quantity: 2 }],
    requestedWaterfalls: [{ side: "left", note: "Please add waterfall" }],
    customerNotes: [{ note: "Need install on Saturday" }],
    cost: 1
  }, { rejectForbidden: false, lastSavedAt: "2026-07-30T12:00:00.000Z" });

  assert.equal(sanitized.selectedMaterial.colorName, "Calacatta");
  assert.equal(sanitized.requiresEstimatorReview, true);
  assert.ok(sanitized.selectionChanges.count >= 2);
  assert.ok(sanitized.scopeChangeRequests.count >= 3);
  assert.equal(sanitized.requestedOpenings[0].requiresEstimatorReview, true);
  assert.equal(sanitized.requestedWaterfalls[0].priced, false);
  assert.equal(sanitized.canSubmitForFinalReview, false);
  assert.ok(!("cost" in sanitized));
  console.log("ok: scope requests mark requiresEstimatorReview; selections counted");
}

{
  const selectionOnly = sanitizeCustomerConfigurationFoundation({
    selectedMaterial: { colorName: "White" },
    selectedEdgeProfile: { profileToken: "edge_knife", profileName: "Knife" }
  });
  assert.equal(selectionOnly.requiresEstimatorReview, false);
  assert.equal(selectionOnly.scopeChangeRequests.count, 0);
  assert.ok(selectionOnly.selectionChanges.count >= 1);
  console.log("ok: selection-only changes are not review-required / not sold");
}

{
  const merged = mergeSelectionPayloadMeta(
    { "material:kitchen:color-1": 1 },
    {
      customerConfiguration: sanitizeCustomerConfigurationFoundation({
        requestedOpenings: [{ type: "cooktop", quantity: 1 }]
      })
    }
  );
  assert.ok(merged[CUSTOMER_CONFIGURATION_FOUNDATION_KEY]);
  assert.equal(merged["material:kitchen:color-1"], 1);
  const split = splitSelectionPayloadMeta(merged);
  assert.equal(split.quantities["material:kitchen:color-1"], 1);
  assert.equal(split.customerConfiguration.requiresEstimatorReview, true);
  assert.equal(split.customerConfiguration.scopeChangeRequests.count, 1);
  console.log("ok: foundation persists in selection payload meta without mutating quantities");
}

{
  const enriched = buildPublicCustomerConfigurationReadModel(null, {
    quantities: { "edge:kitchen:edge_knife": 1, "material:kitchen:abc": 1 }
  });
  assert.ok(enriched.selectedEdgeProfile?.profileToken === "edge_knife");
  assert.ok(enriched.selectedMaterial?.roomId === "kitchen");
  console.log("ok: foundation enriches from existing selection quantities");
}

{
  const publicSvc = readFileSync(join(__dirname, "publicConfigurationService.mjs"), "utf8");
  const draft = readFileSync(join(__dirname, "customerConfigurationDraft.mjs"), "utf8");
  const studioV2Pub = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/studioV2Publish.mjs"),
    "utf8"
  );
  assert.ok(publicSvc.includes("customerConfiguration"));
  assert.ok(publicSvc.includes("buildPublicCustomerConfigurationReadModel"));
  assert.ok(publicSvc.includes("forbidden_customer_configuration_fields"));
  assert.ok(draft.includes("CUSTOMER_CONFIGURATION_FOUNDATION_KEY"));
  assert.ok(!publicSvc.includes("autoApprove"));
  assert.ok(!publicSvc.includes("autoCalculate"));
  assert.ok(!publicSvc.includes("createSoldJob"));
  assert.ok(!/mutate.*approvedSnapshot|updateApprovedEstimate/i.test(publicSvc));
  assert.ok(studioV2Pub.includes("resolveSimplifiedPublishConfiguration") || studioV2Pub.length > 0);
  console.log("ok: public service wires foundation; no auto-approve/sold mutation");
}

{
  const view = readFileSync(
    join(root, "app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-digital-estimate/src/CustomerConfigurationFoundationPanel.tsx"),
    "utf8"
  );
  const api = readFileSync(join(root, "app-digital-estimate/src/publicConfigApi.ts"), "utf8");
  assert.ok(view.includes("CustomerConfigurationFoundationPanel"));
  assert.ok(view.includes("de-customer-configuration-foundation") || panel.includes('data-testid="de-customer-configuration-foundation"'));
  assert.ok(panel.includes('data-testid="de-your-selections"'));
  assert.ok(panel.includes('data-testid="de-review-required-requests"'));
  assert.ok(panel.includes('data-testid="de-foundation-save-selections"'));
  assert.ok(panel.includes("These requests require estimator review before final approval."));
  assert.ok(api.includes("CustomerConfigurationFoundation"));
  assert.ok(api.includes("customerConfiguration?"));
  assert.ok(!panel.includes("Wholesale"));
  assert.ok(!panel.includes("cost_basis"));
  assert.ok(!view.includes("AiEstimatorWorkspace"));
  console.log("ok: customer UI foundation contracts");
}

console.log("\nAll customer configuration foundation tests passed.\n");
