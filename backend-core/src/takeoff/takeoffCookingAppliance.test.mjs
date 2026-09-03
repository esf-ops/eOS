/**
 * Cooking appliance classification + piece segmentation.
 * Run: node backend-core/src/takeoff/takeoffCookingAppliance.test.mjs
 */
import assert from "node:assert/strict";
import {
  applyCookingApplianceToRun,
  classifyTakeoffPlanSource,
  cookingApplianceCreatesCooktopCutout,
  cookingApplianceFromLegacyCutoutKey,
  cookingApplianceInterruptsCountertop,
  cookingApplianceNeedsReview,
  normalizeCookingAppliance
} from "./takeoffCookingAppliance.mjs";
import {
  convertCookingApplianceType,
  countertopSfForRun,
  insertApplianceGap,
  mergePieces,
  splitPieceAtLength,
  totalCountertopSfExcludingApplianceGaps
} from "./takeoffPieceSegmentation.mjs";
import { normalizeRunCutouts, normalizeTakeoffCutoutScope } from "./takeoffCutoutScope.mjs";

console.log("\ntakeoffCookingAppliance.test.mjs\n");

{
  assert.equal(cookingApplianceCreatesCooktopCutout("cooktop"), true);
  assert.equal(cookingApplianceInterruptsCountertop("cooktop"), false);
  assert.equal(cookingApplianceCreatesCooktopCutout("freestanding_range"), false);
  assert.equal(cookingApplianceInterruptsCountertop("freestanding_range"), true);
  assert.equal(cookingApplianceInterruptsCountertop("slide_in_range"), true);
  assert.equal(cookingApplianceNeedsReview({ type: "unknown_cooking_appliance" }), true);
  console.log("ok: cooktop vs freestanding/slide-in rules");
}

{
  const cook = applyCookingApplianceToRun({ lengthIn: 96, depthIn: 25.5, cutouts: [] }, "cooktop");
  assert.ok(cook.cutouts.some((c) => c.type === "cooktop"));
  assert.equal(cook.applianceGap, false);

  const range = applyCookingApplianceToRun(
    { lengthIn: 96, depthIn: 25.5, cutouts: [{ type: "cooktop", quantity: 1, source: "ai_suggested" }] },
    "freestanding_range",
    { widthIn: 30 }
  );
  assert.equal(range.cutouts.some((c) => c.type === "cooktop"), false);
  assert.equal(range.cookingAppliance.type, "freestanding_range");
  console.log("ok: cooktop keeps cutout; freestanding removes cooktop cutout");
}

{
  const hint = cookingApplianceFromLegacyCutoutKey("range");
  assert.equal(hint?.type, "freestanding_range");
  assert.equal(hint?.reviewRequired, true);
  const norm = normalizeRunCutouts({ range: 1, cooktop: 1 });
  assert.ok(norm.cutouts.some((c) => c.type === "cooktop"));
  assert.equal(norm.cookingApplianceHint?.type, "freestanding_range");
  assert.equal(
    norm.cutouts.some((c) => c.type === "cooktop" && c.note === "range"),
    false
  );
  console.log("ok: unknown/legacy range does not silently become only cooktop cutout");
}

{
  const takeoff = {
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "run-1",
                label: "Perimeter",
                lengthIn: 96,
                depthIn: 25.5,
                cutouts: [{ type: "range", quantity: 1, source: "ai_suggested" }]
              }
            ]
          }
        ]
      }
    ]
  };
  const { takeoff: normalized } = normalizeTakeoffCutoutScope(takeoff);
  const run = normalized.rooms[0].areas[0].runs[0];
  assert.equal(run.cookingAppliance?.type, "freestanding_range");
  assert.equal(run.cutouts.some((c) => c.type === "cooktop"), false);
  console.log("ok: normalizeTakeoffCutoutScope lifts legacy range to freestanding_range");
}

{
  const takeoff = {
    rooms: [
      {
        id: "r1",
        areas: [
          {
            id: "a1",
            runs: [{ id: "run-1", label: "Wall", lengthIn: 100, depthIn: 25.5, cutouts: [] }]
          }
        ]
      }
    ]
  };
  const split = splitPieceAtLength(takeoff, "r1", "run-1", 40);
  assert.equal(split.takeoff.rooms[0].areas[0].runs.length, 2);
  assert.equal(split.takeoff.rooms[0].areas[0].runs[0].lengthIn, 40);
  assert.equal(split.takeoff.rooms[0].areas[0].runs[1].lengthIn, 60);
  assert.equal(split.event.op, "piece_split");

  const merged = mergePieces(split.takeoff, "r1", split.leftRunId, split.rightRunId);
  assert.equal(merged.takeoff.rooms[0].areas[0].runs.length, 1);
  assert.equal(merged.takeoff.rooms[0].areas[0].runs[0].lengthIn, 100);
  assert.equal(merged.event.op, "pieces_merged");
  console.log("ok: split/merge preserve valid dimensions");
}

{
  const takeoff = {
    rooms: [
      {
        id: "r1",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "run-1",
                label: "Range wall",
                lengthIn: 110,
                depthIn: 25.5,
                cutouts: [{ type: "cooktop", quantity: 1, source: "ai_suggested" }]
              }
            ]
          }
        ]
      }
    ]
  };
  const beforeSf = totalCountertopSfExcludingApplianceGaps(takeoff);
  const gap = insertApplianceGap(takeoff, "r1", "run-1", {
    leftLengthIn: 40,
    gapWidthIn: 30,
    applianceType: "freestanding_range"
  });
  assert.equal(gap.takeoff.rooms[0].areas[0].runs.length, 2);
  const left = gap.takeoff.rooms[0].areas[0].runs[0];
  const right = gap.takeoff.rooms[0].areas[0].runs[1];
  assert.equal(left.lengthIn, 40);
  assert.equal(right.lengthIn, 40);
  assert.equal(left.cutouts.some((c) => c.type === "cooktop"), false);
  assert.equal(right.cutouts.some((c) => c.type === "cooktop"), false);
  const afterSf = totalCountertopSfExcludingApplianceGaps(gap.takeoff);
  // 30" gap removed from stone SF
  assert.ok(afterSf < beforeSf);
  const expectedDrop = (30 * 25.5) / 144;
  assert.ok(Math.abs(beforeSf - afterSf - expectedDrop) < 0.02);
  console.log("ok: freestanding range gap excludes appliance SF and removes cooktop cutout");
}

{
  const takeoff = {
    rooms: [
      {
        id: "r1",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "run-1",
                lengthIn: 96,
                depthIn: 25.5,
                cutouts: [{ type: "cooktop", quantity: 1, source: "ai_suggested" }],
                cookingAppliance: { type: "cooktop", source: "ai_suggested" }
              }
            ]
          }
        ]
      }
    ]
  };
  const converted = convertCookingApplianceType(takeoff, "r1", "run-1", "slide_in_range", {
    widthIn: 30
  });
  const run = converted.takeoff.rooms[0].areas[0].runs[0];
  assert.equal(run.cookingAppliance.type, "slide_in_range");
  assert.equal(run.cutouts.some((c) => c.type === "cooktop"), false);
  assert.equal(converted.event.op, "appliance_type_corrected");
  assert.equal(converted.needsSegmentation, true);
  console.log("ok: cooktop→slide-in removes cutout and flags segmentation");
}

{
  const unknown = normalizeCookingAppliance({
    type: "unknown_cooking_appliance",
    confidence: "low",
    source: "ai_suggested"
  });
  assert.equal(unknown.appliance.reviewRequired, true);
  assert.equal(cookingApplianceCreatesCooktopCutout("unknown_cooking_appliance"), false);
  console.log("ok: unknown cooking appliance does not silently become cooktop");
}

{
  const src = classifyTakeoffPlanSource({
    pages: [
      { pageType: "cabinet_plan", recommendedForTakeoff: true },
      { pageType: "email_context", recommendedForTakeoff: false }
    ]
  });
  assert.equal(src.planSourceClass, "cad_cabinet_plan");
  const sketch = classifyTakeoffPlanSource({
    pages: [{ pageType: "hand_sketch", recommendedForTakeoff: true }]
  });
  assert.equal(sketch.planSourceClass, "hand_drawn_sketch");
  console.log("ok: plan-source classification telemetry");
}

{
  assert.equal(countertopSfForRun({ lengthIn: 144, depthIn: 25.5, quantity: 1 }), 25.5);
  console.log("ok: countertop SF helper");
}

console.log("\nAll takeoffCookingAppliance tests passed.\n");
