/**
 * Digital Estimate customer-experience polish — page structure, rooms,
 * permissions surface, save/review markers, a11y hooks.
 *
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseCustomerExperiencePolish.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  groupMissingInformationRequirements,
  missingInfoHeadline,
} from "./itemsForLater.ts";
import {
  isCategoryAllowed,
  normalizeCatalogPermissions,
  permissionKeyForRole,
} from "./catalogPermissions.ts";
import {
  buildOriginalBreakdown,
  buildUpdatedBreakdown,
  buildChangesBreakdown,
} from "./customerEstimateBreakdown.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const vm = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const publicSvc = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs",
  ),
  "utf8",
);
const permsMod = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/customerCatalogPermissions.mjs",
  ),
  "utf8",
);

console.log("\nphaseCustomerExperiencePolish.test.ts\n");

// --- 1-8 page structure ---
assert.ok(view.includes('data-testid="de-compact-header"'), "1. compact header");
assert.ok(view.includes('data-testid="de-header-original"'), "2. original total");
assert.ok(view.includes('data-testid="de-header-current"'), "2. current total");
assert.ok(view.includes('data-testid="de-header-difference"'), "2. difference");
assert.ok(view.includes('data-testid="de-project-details-summary"'), "3. project details collapsible");
assert.ok(view.includes("groupMissingInformationRequirements"), "4. items for later grouped");
assert.ok(view.includes('data-testid="de-rooms-column"'), "5. rooms near top");
assert.ok(view.includes("catalogPermissions"), "6. catalog permissions wired");
assert.ok(view.includes("readOnly={!allowed"), "6. disabled categories hide Change");
assert.ok(!/stackTrace|console\.error\(error\)|pricingBasis|Wholesale rate/i.test(view), "7. no diagnostics");
assert.ok(!view.includes("countertopSf"), "8. no raw SF fields");
assert.ok(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
  view.match(/data-testid="de-compact-header"[\s\S]{0,800}/)?.[0] || "",
), "8. no UUIDs in header region");
console.log("ok: 1-8 page structure");

// Items for later grouping unit tests
{
  const grouped = groupMissingInformationRequirements([
    { customerCopy: "Sink model needed before fabrication for Kitchen", roomName: "Kitchen", timing: "fabrication" },
    { customerCopy: "Sink model needed before fabrication for Coffee Bar", roomName: "Coffee Bar", timing: "fabrication" },
    { customerCopy: "Confirm phone number", roomName: null, timing: "optional", optional: true },
  ]);
  assert.equal(grouped.length, 2);
  const sink = grouped.find((g) => /sink model/i.test(g.title));
  assert.ok(sink);
  assert.deepEqual(sink!.rooms.sort(), ["Coffee Bar", "Kitchen"]);
  assert.match(missingInfoHeadline(grouped), /3 details/);
  console.log("ok: 4. Items for later deduplicates and groups rooms");
}

// --- 9-18 room cards ---
assert.ok(view.includes('data-testid="de-room-total"'), "9. room total");
assert.ok(view.includes('data-testid="de-color-selected-badge"'), "10. material selected badge");
assert.ok(view.includes('data-testid="de-choice-option"'), "11. choice selected state");
assert.ok(view.includes("summarizeSideSplashSelections"), "12. side-splash summary");
assert.ok(view.includes("de-open-sink-modal"), "13. sink row");
assert.ok(view.includes("de-open-faucet-modal"), "14. faucet row");
assert.ok(view.includes("de-open-accessories-modal"), "15. accessories");
assert.ok(view.includes("priceEffectLabel"), "16. edge premium effect");
assert.ok(view.includes('data-testid="de-room-price-summary"'), "17. room price summary");
assert.ok(!view.includes("hidden_allocation"), "18. hidden lines absent from UI source");
assert.ok(view.includes("Room price summary"), "17. summary label");
console.log("ok: 9-18 room cards");

// --- 19-25 permissions ---
{
  const p = normalizeCatalogPermissions({ sink: false, faucet: false, edge: false });
  assert.equal(isCategoryAllowed(p, "sink"), false);
  assert.equal(isCategoryAllowed(p, "faucet"), false);
  assert.equal(isCategoryAllowed(p, "accessories"), true);
  assert.equal(isCategoryAllowed(p, "edge"), false);
  assert.equal(isCategoryAllowed(p, "backsplash"), true);
  assert.equal(permissionKeyForRole("sidesplash"), "side_splash");
  assert.equal(permissionKeyForRole("accessory"), "accessories");
}
assert.ok(publicSvc.includes("catalog_permission_denied"), "24. backend rejects forbidden");
assert.ok(publicSvc.includes("collectForbiddenCatalogSelections"), "24. enforcement helper");
assert.ok(api.includes("catalog_permission_denied"), "24. API maps permission denied");
assert.ok(permsMod.includes("CUSTOMER_CATALOG_PERMISSION_KEYS"), "25. permission keys");
assert.ok(view.includes('readOnly={!allowed("sink")}'), "19. sink permission");
assert.ok(view.includes('readOnly={!allowed("faucet")}'), "20. faucet permission");
assert.ok(view.includes('allowed("accessories")'), "21. accessories permission");
assert.ok(view.includes('allowed("edge")'), "22. edge permission");
assert.ok(view.includes('readOnly={!allowed("backsplash")}'), "23. backsplash permission");
console.log("ok: 19-25 permissions");

// --- 26-33 Original / Updated / Changes ---
{
  const pricing = {
    kind: "original" as const,
    projectTotal: 5000,
    rooms: [
      {
        roomId: "kitchen",
        roomName: "Kitchen",
        countertopAmount: 4000,
        backsplashAmount: 200,
        addOnsAmount: 150,
        roomTotal: 4350,
        addOnLines: [{ label: "Sink cutout", amount: 150, category: "sink_cutout" }],
      },
    ],
    projectAddOns: [{ label: "Trip charge", amount: 150 }],
  };
  const original = buildOriginalBreakdown({
    roomPricing: pricing as never,
    totals: { estimatedProjectTotal: 5000 },
  });
  assert.ok(original.lines.some((l) => l.label === "Countertop"));
  assert.ok(original.lines.some((l) => l.label === "Backsplash"));
  assert.ok(original.lines.some((l) => /Sink cutout/.test(l.label)));
  assert.equal(original.total, 5000);

  const updated = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 5200,
      roomPricing: { ...pricing, kind: "updated", projectTotal: 5200 } as never,
    },
  });
  assert.equal(updated.kind, "updated");
  assert.ok(updated.lines.some((l) => l.label === "Countertop"));

  const changes = buildChangesBreakdown({
    changeLines: [],
    roomPricingChanges: {
      kind: "changes",
      totalDelta: 200,
      rows: [
        {
          roomName: "Kitchen",
          category: "material",
          categoryLabel: "Material",
          originalLabel: "Promo",
          updatedLabel: "Group F",
          amountDelta: 200,
          status: "changed",
        },
      ],
    } as never,
  });
  assert.ok(changes.lines.some((l) => /Promo → Group F/.test(l.label)));
  assert.ok(changes.lines.some((l) => /Kitchen total change/.test(l.label)));
}
assert.ok(vm.includes("roomPricing"), "32. room pricing on view model");
console.log("ok: 26-33 Original/Updated/Changes hierarchy");

// --- 34-40 save / review ---
assert.ok(view.includes('data-save-state={saveState}'), "34. save status");
assert.ok(view.includes("Couldn’t save — Retry"), "35. failed save retry");
assert.ok(view.includes('saveState === "unsaved" || saveState === "saving" || saveState === "error" ? savedCalc : latestCalc'), "40. pending not labeled saved");
assert.ok(view.includes("submittedRef"), "37/38. double-click guard");
assert.ok(view.includes('data-testid="de-review-submit"'), "37. review submit");
assert.ok(view.includes("Your selections were sent to Elite for review"), "39. confirmation");
assert.ok(view.includes('data-testid="de-review-cta"'), "37. review CTA");
console.log("ok: 34-40 save/review");

// --- 41-48 responsive / a11y ---
assert.ok(view.includes('data-testid="de-mobile-total-bar"'), "47. mobile total bar");
assert.ok(view.includes("lg:hidden"), "47. mobile-only bar");
assert.ok(view.includes("focus-visible:outline"), "48. visible focus states");
assert.ok(view.includes('role="dialog"'), "42. modal dialog");
assert.ok(view.includes('aria-modal="true"'), "42. aria-modal");
assert.ok(view.includes('e.key === "Escape"'), "42. Escape closes");
assert.ok(view.includes('data-testid="de-modal-done"'), "43. Done closes modal");
assert.ok(view.includes("Selected"), "44. selected not color-only");
assert.ok(view.includes("py-3"), "45. tap-sized controls");
assert.ok(view.includes("pb-36 lg:pb-10") || view.includes("pb-28 lg:pb-10"), "46. sticky bar clearance");
console.log("ok: 41-48 responsive/a11y markers");

// --- 49-60 regression markers ---
assert.ok(publicSvc.includes("resolveSideSplashPriceEffect") || publicSvc.includes("sideSplash"), "51. side-splash still backend");
assert.ok(publicSvc.includes("resolveEdgeOptionPriceEffect") || publicSvc.includes("edgeEffect"), "52. edge backend");
assert.ok(publicSvc.includes("assertPublicConfigurationHasNoForbiddenContent"), "57. public redaction");
assert.ok(view.includes("Elite Stone Fabrication") || view.includes("Elite Surfaces"), "branding");
assert.ok(!view.includes("setInterval"), "58. no aggressive polling in view");
console.log("ok: 49-60 regression markers present");

console.log("\nAll phaseCustomerExperiencePolish tests passed.\n");
