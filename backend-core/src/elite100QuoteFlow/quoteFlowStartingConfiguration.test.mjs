/**
 * Quote Flow Starting Configuration.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowStartingConfiguration.test.mjs
 */
import assert from "node:assert/strict";
import {
  applyEstimatorSelectionAction,
  extractRequestedSelectionsFromEmailBody,
  resolveRequestedSelectionsAgainstCatalog
} from "./quoteFlowRequestedSelections.mjs";
import {
  applyStartingConfigurationToScope,
  emptyStartingConfiguration,
  mergeStartingConfigurationSafe,
  patchStartingConfiguration,
  resolveStartingConfigurationForSetScope,
  seedStartingConfigurationFromConfirmed,
  STARTING_CONFIGURATION_VERSION
} from "./quoteFlowStartingConfiguration.mjs";

console.log("\nquoteFlowStartingConfiguration.test.mjs\n");

const CATALOG = [
  {
    id: "c-fioressa",
    colorName: "Calacatta Fioressa",
    priceGroupLabel: "Group C",
    priceGroupCode: "group_c"
  }
];

function confirmedFromBody(body) {
  let state = resolveRequestedSelectionsAgainstCatalog(
    extractRequestedSelectionsFromEmailBody(body, { messageKey: "msg-start-1" }),
    CATALOG
  );
  for (const item of state.items) {
    if (item.status === "unresolved" || !item.resolved) continue;
    state = applyEstimatorSelectionAction(state, {
      selectionId: item.id,
      action: "confirm",
      actorUserId: "user-sentinel"
    });
  }
  return state;
}

{
  const requested = confirmedFromBody(
    "Please quote Calacatta Fioressa in the kitchen, Group A in both bathrooms, stainless kitchen sink, eased edge, include tear-out."
  );
  const seeded = seedStartingConfigurationFromConfirmed(requested, {
    roomsFromTakeoff: [
      { id: "r1", name: "Kitchen", pieces: [] },
      { id: "r2", name: "Primary Bath", pieces: [] }
    ]
  });
  assert.equal(seeded.version, STARTING_CONFIGURATION_VERSION);
  assert.equal(seeded.quote.colorName, "Calacatta Fioressa");
  assert.equal(seeded.quote.materialGroup, "Group C");
  assert.equal(seeded.quote.edgeProfileToken, "edge_eased");
  assert.equal(seeded.addOns.tearout, 1);
  assert.equal(seeded.addOns["qty-ss"], 1);
  assert.ok(seeded.rooms.some((r) => r.roomId === "r1" && r.colorName === "Calacatta Fioressa"));
  assert.ok(seeded.rooms.some((r) => r.roomId === "r2" && r.materialGroup === "Group A"));
  console.log("ok: confirmed customer material seeds Starting Configuration (room-specific)");
}

{
  const requested = confirmedFromBody("Please quote Calacatta Fioressa with eased edge.");
  const seeded = seedStartingConfigurationFromConfirmed(requested, { roomsFromTakeoff: [] });
  const overridden = patchStartingConfiguration(
    seeded,
    {
      quote: {
        materialGroup: "Group B",
        colorName: "Axbridge",
        colorTbd: false,
        edgeProfileToken: "edge_bevel"
      }
    },
    "user-sentinel"
  );
  assert.equal(overridden.userSet, true);
  assert.equal(overridden.quote.materialGroup, "Group B");
  assert.equal(overridden.quote.colorName, "Axbridge");
  assert.equal(overridden.quote.edgeProfileToken, "edge_bevel");
  console.log("ok: estimator can override suggested starting material/edge");
}

{
  const patched = patchStartingConfiguration(emptyStartingConfiguration(), {
    quote: { materialGroup: "Group A", colorName: "", colorTbd: true }
  });
  assert.equal(patched.quote.colorTbd, true);
  assert.equal(patched.quote.colorName, "");
  console.log("ok: Color TBD remains valid");
}

{
  const requested = confirmedFromBody(
    "Stainless kitchen sink and rectangular vanity sinks, include tear-out."
  );
  const seeded = seedStartingConfigurationFromConfirmed(requested, { roomsFromTakeoff: [] });
  assert.equal(seeded.addOns["qty-ss"], 1);
  assert.equal(seeded.addOns["qty-v-rect"], 1);
  assert.equal(seeded.addOns.tearout, 1);
  console.log("ok: starting sink + tear-out use existing add-on keys");
}

{
  const requested = confirmedFromBody(
    "Please quote Calacatta Fioressa and price a left waterfall on the island."
  );
  const seeded = seedStartingConfigurationFromConfirmed(requested, { roomsFromTakeoff: [] });
  assert.ok((seeded.warnings || []).some((w) => /waterfall/i.test(w.message || "")));
  const scope = applyStartingConfigurationToScope({ rooms: [], addOns: {} }, seeded);
  assert.ok((scope.customerRequestedWarnings || []).some((w) => /waterfall/i.test(w.message || "")));
  assert.equal(scope.addOns?.waterfall, undefined);
  console.log("ok: waterfall cannot bypass geometry requirements");
}

{
  const requested = confirmedFromBody("Please quote Calacatta Fioressa, eased edge.");
  const seeded = seedStartingConfigurationFromConfirmed(requested, {
    roomsFromTakeoff: [{ id: "r1", name: "Kitchen", pieces: [{ id: "p1" }] }]
  });
  const overridden = patchStartingConfiguration(seeded, {
    quote: { materialGroup: "Group D", colorName: "Custom Override", colorTbd: false }
  });
  const kept = resolveStartingConfigurationForSetScope({
    existingStartingConfiguration: overridden,
    requestedSelections: requested,
    roomsFromTakeoff: [{ id: "r1", name: "Kitchen", pieces: [] }]
  });
  assert.equal(kept.quote.colorName, "Custom Override");
  assert.equal(kept.userSet, true);

  const scope = applyStartingConfigurationToScope(
    {
      rooms: [{ id: "r1", name: "Kitchen", pieces: [{ id: "p1" }] }],
      addOns: {}
    },
    kept
  );
  assert.equal(scope.materialGroup, "Group D");
  assert.equal(scope.colorName, "Custom Override");
  assert.equal(scope.edgeProfileToken, "edge_eased");
  assert.ok(scope.quoteFlowStartingConfiguration?.snapshot);
  console.log("ok: Set Scope uses Starting Configuration; Internal Estimate initializes from it");
}

{
  const unconfirmed = resolveRequestedSelectionsAgainstCatalog(
    extractRequestedSelectionsFromEmailBody("Please quote Calacatta Fioressa.", {
      messageKey: "m2"
    }),
    CATALOG
  );
  const seeded = seedStartingConfigurationFromConfirmed(unconfirmed, { roomsFromTakeoff: [] });
  assert.equal(seeded.status, "empty");
  const scope = applyStartingConfigurationToScope(
    { rooms: [], addOns: {}, materialGroup: "Group Promo" },
    seeded
  );
  assert.equal(scope.materialGroup, "Group Promo");
  console.log("ok: raw/unconfirmed AI suggestions do not bypass estimator control");
}

{
  const a = patchStartingConfiguration(emptyStartingConfiguration(), {
    quote: { materialGroup: "Group C", colorName: "Kept" }
  });
  const b = seedStartingConfigurationFromConfirmed(
    confirmedFromBody("Please quote Calacatta Fioressa."),
    { roomsFromTakeoff: [] }
  );
  const merged = mergeStartingConfigurationSafe(a, b);
  assert.equal(merged.quote.colorName, "Kept");
  console.log("ok: Save Draft / queue reload preserve estimator Starting Configuration");
}

{
  const std = seedStartingConfigurationFromConfirmed(
    confirmedFromBody('Include a standard 4" backsplash throughout.'),
    { roomsFromTakeoff: [{ id: "r1", name: "Kitchen", pieces: [] }] }
  );
  assert.ok(std.rooms.some((r) => r.backsplashHeightIn === 4 || r.includeBacksplash === true));
  console.log("ok: backsplash defaults/rules remain intact via seed projection");
}

console.log("\nAll quoteFlowStartingConfiguration tests passed.\n");
