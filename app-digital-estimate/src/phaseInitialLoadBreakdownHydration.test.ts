/**
 * Public Digital Estimate — initial-load breakdown hydration from published snapshot.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseInitialLoadBreakdownHydration.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildUpdatedBreakdown,
  failClosedRoomPricing,
  resolveCustomerSafeRoomPricing,
} from "./customerEstimateBreakdown.ts";
import type { PublicRoomPricing } from "./publicConfigApi.ts";

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");

console.log("\nphaseInitialLoadBreakdownHydration.test.ts\n");

const publishedRoomPricing = {
  kind: "original",
  projectTotal: 7120,
  rooms: [
    {
      roomId: "kitchen",
      roomName: "Kitchen",
      selectedMaterial: "Group F",
      countertopAmount: 4197,
      backsplashAmount: 459,
      addOnsAmount: 0,
      roomTotal: 4656,
      addOnLines: [],
    },
    {
      roomId: "bath",
      roomName: "Master Bath",
      selectedMaterial: "Group F",
      countertopAmount: 2100,
      backsplashAmount: 364,
      addOnsAmount: 0,
      roomTotal: 2464,
      addOnLines: [],
    },
  ],
  projectAddOns: [],
} as unknown as PublicRoomPricing;

{
  // 1. Fresh published link: no calculation yet → hydrate from published snapshot
  const hydrated = resolveCustomerSafeRoomPricing(null, publishedRoomPricing);
  assert.ok(hydrated?.rooms?.length === 2, "1. published rooms hydrate with no calc");
  assert.equal(hydrated?.projectTotal, 7120);
  const breakdown = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 7120,
      roomPricing: hydrated,
    },
    rooms: [],
  });
  assert.equal(breakdown.total, 7120, "1. breakdown total matches Your estimate");
  assert.ok(
    breakdown.lines.some((l) => l.roomName === "Kitchen" && l.label === "Countertop"),
    "1. Kitchen countertop present",
  );
  assert.ok(
    breakdown.lines.some((l) => l.roomName === "Master Bath" && l.label === "Countertop"),
    "1. multi-room Master Bath present",
  );
  assert.equal(
    breakdown.emptyMessage,
    undefined,
    "1. no Save-a-selection fallback for normal published estimate",
  );
  console.log("ok: 1. fresh load hydrates published room breakdown");
}

{
  // 2. As-published calc without roomPricing still hydrates published rooms
  const hydrated = resolveCustomerSafeRoomPricing(
    {
      pricingAuthority: "authoritative_backend_reprice",
      configuredDisplayTotal: 7120,
      baselineDisplayTotal: 7120,
      displayTotalDelta: 0,
      roomPricing: null,
    },
    publishedRoomPricing,
  );
  assert.equal(hydrated?.projectTotal, 7120, "2. as-published missing rooms uses snapshot");
  assert.equal(
    failClosedRoomPricing(
      {
        pricingAuthority: "authoritative_backend_reprice",
        roomPricing: null,
      },
      publishedRoomPricing,
    ),
    null,
    "2. legacy failClosed alone still returns null (resolver is the hydration path)",
  );
  console.log("ok: 2. as-published calc without roomPricing hydrates snapshot");
}

{
  // 3. Configured divergence without room detail stays fail-closed
  const missing = resolveCustomerSafeRoomPricing(
    {
      pricingAuthority: "authoritative_backend_reprice",
      configuredDisplayTotal: 7800,
      baselineDisplayTotal: 7120,
      displayTotalDelta: 680,
      roomPricing: null,
    },
    publishedRoomPricing,
  );
  assert.equal(missing, null, "3. diverged configured total without rooms fails closed");
  const empty = buildUpdatedBreakdown({
    calculation: {
      pricingAuthority: "authoritative_backend_reprice",
      configuredDisplayTotal: 7800,
      roomPricing: null,
    },
    rooms: [],
  });
  assert.equal(empty.lines.length, 0);
  assert.equal(empty.emptyMessage, "Save a selection to refresh your estimate.");
  console.log("ok: 3. genuine missing/unsafe still fail-closed");
}

{
  // 4. Selection-save path with live rooms still preferred
  const live = {
    kind: "updated" as const,
    projectTotal: 7441,
    rooms: [
      {
        roomId: "kitchen",
        roomName: "Kitchen",
        selectedMaterial: "Group G",
        countertopAmount: 4500,
        backsplashAmount: 459,
        addOnsAmount: 0,
        roomTotal: 4959,
        addOnLines: [],
      },
    ],
    projectAddOns: [],
  } as unknown as PublicRoomPricing;
  const resolved = resolveCustomerSafeRoomPricing(
    {
      pricingAuthority: "authoritative_backend_reprice",
      configuredDisplayTotal: 7441,
      baselineDisplayTotal: 7120,
      displayTotalDelta: 321,
      roomPricing: live,
    },
    publishedRoomPricing,
  );
  assert.equal(resolved?.projectTotal, 7441, "4. live save roomPricing wins over published");
  console.log("ok: 4. after selection change, live breakdown still preferred");
}

{
  // 5. View wires resolver into display + print (no save-to-hydrate)
  assert.match(view, /resolveCustomerSafeRoomPricing/);
  assert.match(view, /forSafeDisplay/);
  assert.match(
    view,
    /resolveCustomerSafeRoomPricing\(savedCalc,\s*publishedRoomPricing\)/,
  );
  assert.match(view, /customerPricingStatus:\s*"baseline"/);
  assert.doesNotMatch(view, /saveConfigurationSelections\(\)[\s\S]{0,80}breakdown/);
  console.log("ok: 5. ConfigurationView hydrates on display/print without forcing save");
}

console.log("\nphaseInitialLoadBreakdownHydration.test.ts: ok\n");
