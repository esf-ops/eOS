/**
 * Selection authority + Studio readiness regressions for Digital Estimate save boundary.
 * Run: node backend-core/src/digitalEstimate/configuration/selectionAuthorityAndReadiness.test.mjs
 */
import assert from "node:assert/strict";
import {
  classifyPublicSelection,
  selectionMayBypassAvailability,
  isCanonicalBacksplashMode,
  isForbiddenSelectionLabel,
  sanitizeChangesSelectionLabel
} from "./selectionAuthority.mjs";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import {
  buildStudioPublicationReadinessDto,
  resolvePrimaryReadinessMessage,
  PUBLICATION_ONLY_FIELDS,
  PRICE_BEARING_SCOPE_FIELDS
} from "../../elite100EstimateStudio/studioPublicationReadiness.mjs";

console.log("\nselectionAuthorityAndReadiness.test.mjs\n");

// ---------------------------------------------------------------------------
// Selection classification
// ---------------------------------------------------------------------------
{
  const baselineOpt = {
    option_key: "edge:kitchen:edge_crescent",
    included_in_baseline: true,
    default_qty: 1,
    availability_state: "review_required"
  };
  const cls = classifyPublicSelection({
    optionKey: "edge:kitchen:edge_crescent",
    quantity: 1,
    option: baselineOpt,
    priorSelections: {}
  });
  assert.equal(cls, "unchanged_frozen_baseline");
  assert.equal(selectionMayBypassAvailability(cls), true);

  const savedCls = classifyPublicSelection({
    optionKey: "edge:kitchen:edge_crescent",
    quantity: 1,
    option: { ...baselineOpt, included_in_baseline: false, default_qty: 0 },
    priorSelections: { "edge:kitchen:edge_crescent": 1 }
  });
  assert.equal(savedCls, "existing_saved_configured");
  assert.equal(selectionMayBypassAvailability(savedCls), true);

  const newCls = classifyPublicSelection({
    optionKey: "edge:kitchen:edge_knife",
    quantity: 1,
    option: {
      option_key: "edge:kitchen:edge_knife",
      included_in_baseline: false,
      default_qty: 0,
      availability_state: "review_required"
    },
    priorSelections: { "edge:kitchen:edge_crescent": 1 }
  });
  assert.equal(newCls, "newly_requested");
  assert.equal(selectionMayBypassAvailability(newCls), false);
  console.log("ok: baseline / saved / newly-requested classification");
}

{
  assert.equal(isCanonicalBacksplashMode("none"), true);
  assert.equal(isCanonicalBacksplashMode("standard_4in"), true);
  assert.equal(isCanonicalBacksplashMode("bogus"), false);
  assert.equal(
    isForbiddenSelectionLabel("Elite will confirm this option and price."),
    true
  );
  assert.equal(
    sanitizeChangesSelectionLabel("Elite will confirm this option and price.", "Side splash"),
    "Side splash"
  );
  console.log("ok: backsplash modes + Changes label sanitization");
}

// ---------------------------------------------------------------------------
// normalizeSelectionPayload — unchanged review_required baseline does not block
// ---------------------------------------------------------------------------
{
  const options = [
    {
      option_key: "material:kitchen:promo",
      default_qty: 1,
      included_in_baseline: true,
      availability_state: "active",
      min_qty: 0,
      customer_price_treatment: "delta",
      sell_price: 0
    },
    {
      option_key: "edge:kitchen:edge_crescent",
      default_qty: 1,
      included_in_baseline: true,
      availability_state: "review_required",
      min_qty: 0,
      customer_price_treatment: "delta",
      sell_price: 0
    },
    {
      option_key: "backsplash:kitchen:none",
      default_qty: 0,
      included_in_baseline: false,
      availability_state: "active",
      min_qty: 0,
      customer_price_treatment: "absolute",
      sell_price: 0
    },
    {
      option_key: "backsplash:kitchen:standard_4in",
      default_qty: 1,
      included_in_baseline: true,
      availability_state: "active",
      min_qty: 0,
      customer_price_treatment: "absolute",
      sell_price: 0
    }
  ];

  const prior = {
    "material:kitchen:promo": 1,
    "edge:kitchen:edge_crescent": 1,
    "backsplash:kitchen:standard_4in": 1
  };

  const normalized = normalizeSelectionPayload(
    {
      selections: {
        "material:kitchen:promo": 1,
        "edge:kitchen:edge_crescent": 1,
        "backsplash:kitchen:none": 1,
        "backsplash:kitchen:standard_4in": 0
      }
    },
    options,
    { priorSelections: prior }
  );
  assert.equal(normalized.selections["backsplash:kitchen:none"], 1);
  assert.equal(normalized.selections["edge:kitchen:edge_crescent"], 1);
  console.log("ok: backsplash none + stale review_required baseline coexist in normalize");
}

{
  const options = [
    {
      option_key: "edge:kitchen:edge_knife",
      default_qty: 0,
      included_in_baseline: false,
      availability_state: "review_required",
      min_qty: 0,
      customer_price_treatment: "delta",
      sell_price: 0
    }
  ];
  assert.throws(
    () =>
      normalizeSelectionPayload(
        { selections: { "edge:kitchen:edge_knife": 1 } },
        options,
        { priorSelections: {} }
      ),
    (e) => e.code === "selection_unavailable" && e.restoreSavedState === true
  );
  console.log("ok: newly requested unavailable option is rejected");
}

{
  // Canonical backsplash orphan (option row missing) still normalizes.
  const normalized = normalizeSelectionPayload(
    { selections: { "backsplash:kitchen:none": 1 } },
    [],
    { priorSelections: {}, allowCanonicalBacksplashOrphans: true }
  );
  assert.equal(normalized.selections["backsplash:kitchen:none"], 1);
  console.log("ok: canonical backsplash none orphan allowed");
}

// ---------------------------------------------------------------------------
// Studio readiness DTO — no Approve + Approved contradiction
// ---------------------------------------------------------------------------
{
  const approved = buildStudioPublicationReadinessDto({
    estimate: {
      status: "approved",
      calculationFingerprint: "fp-1",
      approval: {
        approvedAt: "2026-07-21T12:00:00Z",
        calculationFingerprint: "fp-1",
        customerDisplayTotal: 8615.3
      },
      calculationSnapshot: { fingerprint: "fp-1" }
    },
    readiness: {
      eligible: true,
      blockingReasons: [],
      message: "Eligible"
    },
    configuration: {
      pricingValidThrough: "2026-08-20",
      customerChoiceGroups: ["edge"],
      allowedOptionKeys: [],
      roomLocks: [{ roomKey: "*", locked: true }]
    },
    publishedConfiguration: {
      envelopeFingerprint: null,
      choiceFlags: { edge: true }
    },
    activePublication: null
  });
  assert.equal(approved.pricing.approvalStatus, "approved_current");
  assert.equal(approved.pricing.calculationStatus, "calculated_current");
  assert.ok(
    !/Approve the Studio estimate/i.test(approved.primaryMessage.message),
    "must not ask to approve when already approved_current"
  );
  console.log("ok: approved_current primary message never asks to approve");
}

{
  const stale = buildStudioPublicationReadinessDto({
    estimate: {
      status: "approved",
      calculationFingerprint: "fp-2",
      approval: {
        approvedAt: "2026-07-21T12:00:00Z",
        calculationFingerprint: "fp-1",
        customerDisplayTotal: 8615.3
      }
    },
    readiness: {
      eligible: false,
      blockingReasons: [
        {
          code: "calculation_fingerprint_mismatch",
          message: "The approved estimate changed and must be recalculated."
        }
      ]
    },
    configuration: null,
    publishedConfiguration: null,
    activePublication: null
  });
  assert.equal(stale.pricing.approvalStatus, "approved_stale");
  assert.equal(stale.pricing.calculationStatus, "calculated_stale");
  assert.match(stale.primaryMessage.message, /Recalculate and approve/i);
  console.log("ok: fingerprint mismatch → stale pricing message");
}

{
  const msg = resolvePrimaryReadinessMessage({
    calculationStatus: "calculated_current",
    approvalStatus: "approved_current",
    publicationConfigurationStatus: "unsaved",
    publicationStatus: "blocked",
    pricingBlockers: [],
    configBlockers: []
  });
  assert.match(msg.message, /Save publication settings/i);
  assert.ok(!/Approve the Studio estimate/i.test(msg.message));
  console.log("ok: permission-only unsaved → save settings, not re-approve");
}

{
  assert.ok(PUBLICATION_ONLY_FIELDS.includes("customerCatalogPermissions"));
  assert.ok(PUBLICATION_ONLY_FIELDS.includes("pricingValidThrough"));
  assert.ok(PRICE_BEARING_SCOPE_FIELDS.includes("edgeLinearFeet"));
  assert.ok(!PUBLICATION_ONLY_FIELDS.includes("edgeLinearFeet"));
  console.log("ok: permission-only vs price-bearing field sets");
}

console.log("\nAll selectionAuthorityAndReadiness tests passed.\n");
