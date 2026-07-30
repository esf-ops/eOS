/**
 * Governed Vanity Program — one-click add/remove, no questionnaire.
 * Run: node backend-core/src/elite100EstimateStudio/studioVanityProgramGovernance.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveGovernedVanityPrograms,
  buildVanityProgramScopePatch,
  governedVanityProgramLabel,
  isGovernedVanityRoomType
} from "./studioVanityProgramGovernance.mjs";
import { calculateStudioEstimateV4 } from "./elite100RoomPricingStudioAdapter.mjs";

const root = dirname(fileURLToPath(import.meta.url));

console.log("\nstudioVanityProgramGovernance.test.mjs\n");

{
  assert.equal(governedVanityProgramLabel("37_S").includes("37"), true);
  assert.equal(governedVanityProgramLabel("37_S").includes("37_S"), false);
  console.log("ok: package codes are never customer/estimator-facing labels");
}

{
  assert.equal(isGovernedVanityRoomType({ roomType: "vanity" }), true);
  assert.equal(isGovernedVanityRoomType({ roomType: "bathroom" }), false);
  console.log("ok: governed eligibility uses vanity room type");
}

const scope = {
  rooms: [
    {
      id: "bath",
      name: "Bathroom Vanity",
      roomType: "vanity",
      included: true,
      pieces: [
        {
          id: "vanity-top",
          name: "Vanity",
          included: true,
          lengthIn: 37,
          depthIn: 22.5,
          cutouts: [{ type: "sink", qty: 1 }]
        }
      ]
    },
    {
      id: "kitchen",
      name: "Kitchen",
      roomType: "Kitchen",
      included: true,
      pieces: [
        { id: "island", name: "Kitchen Island", included: true, lengthIn: 96, depthIn: 36, sqft: 24 }
      ]
    }
  ],
  roomConfigurations: {},
  addOns: { "qty-bar": 1 },
  materialGroup: "Group Promo",
  pricingBasis: "Wholesale"
};

{
  const before = resolveGovernedVanityPrograms({ scope, calculationSnapshot: null });
  const vanity = before.find((v) => v.roomId === "bath");
  assert.ok(vanity, "vanity room present");
  assert.equal(vanity.applied, false);
  assert.ok(
    vanity.eligible === true || vanity.eligible === false,
    "eligibility is explicit"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(vanity, "tripQuestion"),
    false,
    "no trip questionnaire field"
  );
  console.log("ok: read model has one add/remove decision, no trip question");
}

{
  const patch = buildVanityProgramScopePatch({ roomId: "bath", apply: true, scope });
  assert.ok(patch?.bath?.vanityProgram);
  assert.equal(patch.bath.vanityProgram.useStandardPricing, false);
  const appliedScope = {
    ...scope,
    roomConfigurations: {
      ...scope.roomConfigurations,
      ...patch
    }
  };
  const calc = await calculateStudioEstimateV4({
    scope: appliedScope,
    actor: { userId: "u1" },
    environment: {}
  });
  const programs = resolveGovernedVanityPrograms({
    scope: appliedScope,
    calculationSnapshot: calc
  });
  const vanity = programs.find((v) => v.roomId === "bath");
  assert.equal(vanity.applied, true);
  if (vanity.eligible) {
    assert.ok(
      vanity.programPrice == null || Number(vanity.programPrice) > 0,
      "server price when available"
    );
    assert.equal(String(vanity.programLabel || "").includes("37_S"), false);
  }
  console.log("ok: one-click add writes scope election; price from v4 calculator");
}

{
  const patch = buildVanityProgramScopePatch({ roomId: "bath", apply: false, scope });
  assert.equal(patch.bath.vanityProgram.useStandardPricing, true);
  console.log("ok: one-click remove restores standard pricing");
}

{
  const ui = readFileSync(
    join(root, "../../../app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"),
    "utf8"
  );
  assert.ok(ui.includes("Add Vanity Program"));
  assert.ok(ui.includes("Remove Vanity Program"));
  assert.equal(ui.includes("Same trip"), false);
  assert.equal(ui.includes("Needs confirmation"), false);
  assert.equal(ui.includes("Separate trip"), false);
  assert.equal(ui.includes("upgrade categor"), false);
  console.log("ok: UI has no Vanity questionnaire");
}

console.log("\nstudioVanityProgramGovernance.test.mjs — passed\n");
