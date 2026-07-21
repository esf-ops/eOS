/**
 * Frontend contract for the live-pricing fixes:
 *  - Updated breakdown renders the authoritative $0 backsplash (never falls
 *    back to the Original amount when the server says zero).
 *  - Side-splash lines appear under room Add-ons with server-priced amounts.
 *
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseBacksplashSideSplashLive.ui.test.ts
 */
import assert from "node:assert/strict";
import { buildUpdatedBreakdown, buildChangesBreakdown } from "./customerEstimateBreakdown.ts";
import type { PublicRoomPricing } from "./publicConfigApi.ts";

function roomPricing(overrides: Partial<PublicRoomPricing["rooms"][number]> = {}): PublicRoomPricing {
  return {
    kind: "updated",
    projectTotal: 4490,
    rooms: [
      {
        roomId: "kitchen",
        roomName: "Kitchen",
        countertopAmount: 3400,
        backsplashAmount: 0,
        addOnsAmount: 85,
        roomTotal: 3485,
        addOnLines: [
          {
            label: "Side splash — Right side, Sink Run",
            amount: 85,
            category: "side_splash",
          },
        ],
        ...overrides,
      } as PublicRoomPricing["rooms"][number],
    ],
    projectAddOns: [],
  } as unknown as PublicRoomPricing;
}

// 1. Updated renders Backsplash $0 from the authoritative DTO — no Original fallback.
{
  const view = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 4490,
      roomPricing: roomPricing(),
    },
  });
  const backsplash = view.lines.find((l) => l.label === "Backsplash");
  assert.ok(backsplash, "Backsplash row present");
  assert.equal(backsplash!.amount, 0, "authoritative zero is rendered, not dropped");
  assert.equal(backsplash!.amountLabel, "$0");
  console.log("ok: Updated renders authoritative Backsplash $0");
}

// 2. Side-splash line appears indented under the room Add-ons with server amount.
{
  const view = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 4490,
      roomPricing: roomPricing(),
    },
  });
  const side = view.lines.find((l) => /^Side splash/.test(l.label));
  assert.ok(side, "side-splash add-on line present");
  assert.equal(side!.amount, 85);
  assert.equal(side!.indent, true);
  assert.equal(side!.roomName, "Kitchen");
  assert.match(side!.label, /Right side/);
  assert.match(side!.label, /Sink Run/);
  console.log("ok: side-splash line renders under room Add-ons with backend amount");
}

// 3. Changes view surfaces the side-splash delta row.
{
  const view = buildChangesBreakdown({
    changeLines: [],
    roomPricingChanges: {
      kind: "changes",
      totalDelta: 85,
      rows: [
        {
          roomName: "Kitchen",
          category: "side_splash",
          categoryLabel: "Add-ons",
          originalLabel: "No side splash",
          updatedLabel: "Side splash — Right side, Sink Run",
          amountDelta: 85,
          status: "changed",
        },
      ],
    } as never,
  });
  const row = view.lines.find((l) => /Side splash/.test(l.label));
  assert.ok(row, "changes row present");
  assert.equal(row!.amountLabel, "+$85");
  console.log("ok: Changes shows the side-splash delta");
}

console.log("\nAll phaseBacksplashSideSplashLive UI tests passed.\n");
