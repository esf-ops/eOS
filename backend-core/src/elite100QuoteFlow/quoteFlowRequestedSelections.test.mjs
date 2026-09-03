/**
 * Quote Flow — customer-requested selections (email → confirm → Set Scope).
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowRequestedSelections.test.mjs
 */
import assert from "node:assert/strict";
import {
  extractRequestedSelectionsFromEmailBody,
  resolveRequestedSelectionsAgainstCatalog,
  mergeRequestedSelections,
  applyEstimatorSelectionAction,
  applyConfirmedSelectionsToScope,
  summarizeRequestedSelections,
  REQUESTED_SELECTIONS_VERSION
} from "./quoteFlowRequestedSelections.mjs";

console.log("\nquoteFlowRequestedSelections.test.mjs\n");

const CATALOG = [
  {
    id: "color-sentinel-calacatta-laza",
    colorName: "Calacatta Laza",
    priceGroupLabel: "Group C",
    priceGroupCode: "group_c"
  },
  {
    id: "color-sentinel-carrara-morro",
    colorName: "Carrara Morro",
    priceGroupLabel: "Group B",
    priceGroupCode: "group_b"
  }
];

const SMOKE_BODY =
  "Please quote Calacatta Laza in the kitchen, Group A in both bathrooms, stainless kitchen sink, rectangular vanity sinks, eased edge, include tear-out, and price a left waterfall on the island.";

function extractResolved(body, opts = {}) {
  const raw = extractRequestedSelectionsFromEmailBody(body, {
    messageKey: "msg-sentinel-1",
    subject: opts.subject || "TEST - CUSTOMER SELECTION EXTRACTION",
    ...opts
  });
  return resolveRequestedSelectionsAgainstCatalog(raw, CATALOG);
}

{
  const ex = extractResolved(SMOKE_BODY);
  const material = ex.items.find(
    (i) => i.kind === "material" && /calacatta laza/i.test(i.customerRawText || "")
  );
  assert.ok(material, "exact material color extracted");
  assert.equal(material.roomHint, "kitchen");
  assert.equal(material.resolved?.colorName, "Calacatta Laza");
  assert.equal(material.resolved?.materialGroup, "Group C");
  assert.equal(material.resolved?.matchConfidence, "high");
  console.log("ok: exact material color extracts and resolves to governed group");
}

{
  const ex = extractResolved(
    "Please quote something white with gray veins for the kitchen counters."
  );
  const vague = ex.items.find((i) => i.kind === "material");
  assert.ok(vague);
  assert.equal(vague.status, "unresolved");
  assert.equal(vague.resolved, null);
  assert.match(String(vague.customerRawText), /white/i);
  console.log("ok: vague material remains unresolved (no invented catalog match)");
}

{
  const ex = extractResolved(
    "Carrara Morro for the bathrooms. Calacatta Laza in the kitchen."
  );
  const kitchen = ex.items.find(
    (i) => i.kind === "material" && /calacatta/i.test(i.customerRawText || "")
  );
  const bath = ex.items.find(
    (i) => i.kind === "material" && /carrara/i.test(i.customerRawText || "")
  );
  assert.equal(kitchen?.roomHint, "kitchen");
  assert.equal(bath?.roomHint, "bath");
  assert.equal(kitchen?.resolved?.materialGroup, "Group C");
  assert.equal(bath?.resolved?.materialGroup, "Group B");
  console.log("ok: room-specific material requests stay room-specific");
}

{
  const ex = extractResolved(SMOKE_BODY);
  const ss = ex.items.find((i) => i.kind === "sink" && i.resolved?.addonKey === "qty-ss");
  const rect = ex.items.find((i) => i.kind === "sink" && i.resolved?.addonKey === "qty-v-rect");
  assert.ok(ss);
  assert.ok(rect);
  assert.equal(ss.roomHint, "kitchen");
  assert.equal(rect.roomHint, "bath");
  console.log("ok: sink requests extracted");
}

{
  const ex = extractResolved(SMOKE_BODY);
  const edge = ex.items.find((i) => i.kind === "edge");
  assert.ok(edge);
  assert.equal(edge.resolved?.edgeProfileToken, "edge_eased");
  assert.equal(ex.mentionSummary.edge, "explicitly_stated");
  console.log("ok: edge request extracted");
}

{
  const withTear = extractResolved("Please include tear-out for this remodel.");
  const without = extractResolved("Please quote Calacatta Laza for the kitchen only.");
  assert.equal(withTear.mentionSummary.tear_out, "explicitly_stated");
  assert.ok(withTear.items.some((i) => i.kind === "tear_out"));
  assert.equal(without.mentionSummary.tear_out, "not_mentioned");
  assert.equal(
    without.items.some((i) => i.kind === "tear_out"),
    false
  );
  console.log("ok: tear-out requested vs not_mentioned remain distinct");
}

{
  const std = extractResolved("Include a standard 4\" backsplash throughout.");
  const full = extractResolved("Customer wants full-height backsplash at the range.");
  const custom = extractResolved('Please include a 6" backsplash at the kitchen.');
  const stdItem = std.items.find((i) => i.kind === "backsplash");
  const fullItem = full.items.find((i) => i.kind === "backsplash");
  const customItem = custom.items.find((i) => i.kind === "backsplash");
  assert.equal(stdItem?.resolved?.backsplashHeightIn, 4);
  assert.equal(stdItem?.resolved?.includeBacksplash, true);
  assert.equal(fullItem?.resolved?.backsplashHeightMode, "full_height");
  assert.equal(customItem?.resolved?.backsplashHeightIn, 6);
  assert.equal(std.mentionSummary.backsplash, "explicitly_stated");
  console.log("ok: standard 4\" and custom/full-height backsplash preserved");
}

{
  const ex = extractResolved(SMOKE_BODY);
  const wf = ex.items.find((i) => i.kind === "waterfall");
  assert.ok(wf);
  assert.equal(wf.geometryReviewRequired, true);
  assert.equal(ex.mentionSummary.waterfall, "explicitly_stated");
  const silent = extractResolved("Please quote Calacatta Laza for the kitchen.");
  assert.equal(silent.mentionSummary.waterfall, "not_mentioned");
  assert.equal(
    silent.items.some((i) => i.kind === "waterfall"),
    false
  );
  console.log("ok: waterfall flagged for geometry review; silence is not_mentioned");
}

{
  let state = extractResolved(SMOKE_BODY);
  const material = state.items.find((i) => /calacatta/i.test(i.customerRawText || ""));
  state = applyEstimatorSelectionAction(state, {
    selectionId: material.id,
    action: "confirm",
    actorUserId: "user-sentinel-estimator"
  });
  assert.equal(state.items.find((i) => i.id === material.id).status, "confirmed");
  assert.ok(state.items.find((i) => i.id === material.id).confirmation?.confirmedAt);

  const rerun = extractResolved("Please quote Something Invented.pdf in laundry only.");
  const merged = mergeRequestedSelections(state, rerun);
  const kept = merged.items.find((i) => i.id === material.id);
  assert.equal(kept?.status, "confirmed");
  assert.equal(kept?.resolved?.colorName, "Calacatta Laza");
  console.log("ok: estimator-confirmed value survives Save Draft merge / AI rerun");
}

{
  let state = extractResolved(SMOKE_BODY);
  const sink = state.items.find((i) => i.resolved?.addonKey === "qty-ss");
  state = applyEstimatorSelectionAction(state, {
    selectionId: sink.id,
    action: "reject",
    actorUserId: "user-sentinel-estimator"
  });
  assert.equal(state.items.find((i) => i.id === sink.id).status, "rejected");
  const scope = applyConfirmedSelectionsToScope(
    { rooms: [{ id: "r1", name: "Kitchen", pieces: [{ id: "p1" }] }], addOns: {} },
    state
  );
  assert.equal(scope.addOns["qty-ss"], undefined);
  console.log("ok: estimator can reject an AI extraction; rejected excluded from Set Scope");
}

{
  let state = extractResolved(SMOKE_BODY);
  for (const item of state.items) {
    if (item.status === "unresolved") continue;
    state = applyEstimatorSelectionAction(state, {
      selectionId: item.id,
      action: "confirm",
      actorUserId: "user-sentinel-estimator"
    });
  }
  const unconfirmed = extractResolved(SMOKE_BODY);
  const emptyApply = applyConfirmedSelectionsToScope(
    { rooms: [{ id: "r1", name: "Kitchen", pieces: [{ id: "p1" }] }], addOns: {} },
    unconfirmed
  );
  assert.equal(emptyApply.addOns.tearout, undefined);
  assert.equal(emptyApply.customerRequestedSelections?.applied?.length || 0, 0);

  const scope = applyConfirmedSelectionsToScope(
    {
      rooms: [
        { id: "r1", name: "Kitchen", pieces: [{ id: "p1", lengthIn: 96 }] },
        { id: "r2", name: "Primary Bath", pieces: [{ id: "p2", lengthIn: 60 }] }
      ],
      addOns: {}
    },
    state
  );
  assert.equal(scope.rooms[0].colorNameOverride, "Calacatta Laza");
  assert.equal(scope.rooms[0].materialGroupOverride, "Group C");
  assert.equal(scope.rooms[1].materialGroupOverride, "Group A");
  assert.equal(scope.colorName, "Calacatta Laza");
  assert.equal(scope.materialGroup, "Group C");
  assert.equal(scope.edgeProfileToken, "edge_eased");
  assert.equal(scope.addOns.tearout, 1);
  assert.equal(scope.addOns["qty-ss"], 1);
  assert.equal(scope.addOns["qty-v-rect"], 1);
  assert.ok((scope.customerRequestedWarnings || []).some((w) => /waterfall/i.test(w.message || "")));
  assert.ok((scope.customerRequestedSelections?.applied || []).length >= 5);
  console.log("ok: Set Scope includes confirmed selections and excludes unconfirmed AI suggestions");
  console.log("ok: Internal Estimate starting scope initializes with confirmed selections");
}

{
  const empty = extractRequestedSelectionsFromEmailBody("", { messageKey: null });
  assert.equal(empty.items.length, 0);
  assert.equal(empty.mentionSummary.tear_out, "not_mentioned");
  const scope = applyConfirmedSelectionsToScope(
    { rooms: [{ id: "r1", name: "Kitchen", pieces: [] }], addOns: {}, materialGroup: "Group B" },
    empty
  );
  assert.equal(scope.materialGroup, "Group B");
  assert.deepEqual(scope.addOns, {});
  console.log("ok: manual takeoff workflow still works with no extracted selections");
}

{
  const summary = summarizeRequestedSelections(extractResolved(SMOKE_BODY));
  assert.ok(summary.total >= 5);
  assert.ok(summary.resolved >= 1);
  assert.equal(typeof summary.needsReview, "number");
  assert.equal(extractResolved(SMOKE_BODY).extractionVersion, REQUESTED_SELECTIONS_VERSION);
  console.log("ok: summarizeRequestedSelections");
}

console.log("\nAll quoteFlowRequestedSelections tests passed.\n");
