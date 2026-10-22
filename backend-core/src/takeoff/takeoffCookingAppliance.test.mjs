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
  normalizeCookingAppliance,
  reconcileCookingApplianceEvidence,
  cookingApplianceApprovalIssue
} from "./takeoffCookingAppliance.mjs";
import {
  CONSOLIDATED_BLOCKING_CODES,
  collectConsolidatedHardBlockers
} from "./takeoffConsolidatedApproval.mjs";
import { buildSystemPrompt, buildUserMessage } from "./takeoffExtractionPrompt.mjs";
import { buildEvidenceSystemPrompt } from "./takeoffDimensionEvidencePrompt.mjs";
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

// ── reconcileCookingApplianceEvidence (fresh AI output guard) ──────────────────

function aiTakeoff(runs) {
  return { rooms: [{ id: "r1", name: "Kitchen", areas: [{ id: "a1", runs }] }] };
}
const cooktopCutout = () => [{ type: "cooktop", quantity: 1, source: "ai_suggested" }];

{
  // Cambridge II floor plan: range drawn on a 9'-9½" wall, AI returned one run + cooktop cutout.
  const takeoff = aiTakeoff([
    {
      id: "run-range",
      label: "Range wall",
      lengthIn: 117.5,
      depthIn: 25.5,
      cutouts: cooktopCutout(),
      cookingAppliance: { type: "cooktop", confidence: "high", reviewRequired: false, source: "ai_suggested" },
      notes: ["Range centered on wall"]
    }
  ]);
  const { takeoff: out, changed, corrections } = reconcileCookingApplianceEvidence(takeoff);
  const run = out.rooms[0].areas[0].runs[0];
  assert.equal(changed, true);
  assert.equal(run.cookingAppliance.type, "unknown_cooking_appliance");
  assert.equal(run.cookingAppliance.reviewRequired, true);
  assert.equal(run.cutouts.some((c) => c.type === "cooktop"), false, "range text → no cooktop cutout");
  assert.equal(run.requiresEstimatorReview, true);
  assert.equal(corrections[0].op, "cooktop_reclassified_unknown_range_text");
  assert.equal(takeoff.rooms[0].areas[0].runs[0].cutouts.length, 1, "input not mutated");
  console.log("ok: range text on a cooktop-cutout run → unknown, cutout withheld, review");
}

{
  for (const label of ["Stove wall", "Slide-in wall", "Free standing range run"]) {
    const { takeoff: out } = reconcileCookingApplianceEvidence(
      aiTakeoff([{ id: "x", label, lengthIn: 179, depthIn: 25.5, cutouts: cooktopCutout() }])
    );
    assert.equal(out.rooms[0].areas[0].runs[0].cutouts.length, 0, `${label}: cutout withheld`);
  }
  console.log("ok: stove / slide-in / free-standing wording all withhold the cooktop cutout");
}

{
  // Woodharbor cabinet plan: "30\" Gas Cooktop" over DEFF B36 with oven in tall cab — a real cooktop.
  const takeoff = aiTakeoff([
    {
      id: "run-cook",
      label: "Left wall",
      lengthIn: 78,
      depthIn: 25.5,
      cutouts: cooktopCutout(),
      cookingAppliance: { type: "cooktop", confidence: "high", reviewRequired: false, source: "ai_suggested" },
      notes: ["30\" gas cooktop over DEFF B36", "Vent hood by others", "Range hood above"]
    }
  ]);
  const { takeoff: out, changed } = reconcileCookingApplianceEvidence(takeoff);
  assert.equal(changed, false, "classified cooktop with cooktop evidence is left alone");
  assert.equal(out, takeoff);
  console.log("ok: labeled cooktop (with 'range hood' note) keeps cutout, no review noise");
}

{
  const { takeoff: out } = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "x",
        label: "Perimeter",
        lengthIn: 103.5,
        depthIn: 25.5,
        cutouts: cooktopCutout(),
        cookingAppliance: { type: "cooktop", confidence: "high", source: "ai_suggested" },
        notes: ["Cooktop or range — unclear"]
      }
    ])
  );
  const run = out.rooms[0].areas[0].runs[0];
  assert.equal(run.cookingAppliance.type, "cooktop");
  assert.equal(run.cookingAppliance.reviewRequired, true);
  assert.equal(run.cutouts.length, 1, "conflict keeps cutout but requires review");
  assert.equal(cookingApplianceNeedsReview(run.cookingAppliance), true);
  console.log("ok: cooktop + range wording conflict → review, cutout kept");
}

{
  // AI emitted a bare cooktop cutout without classifying; normalizer promoted it to a legacy cooktop.
  const { takeoff: normalized } = normalizeTakeoffCutoutScope(
    aiTakeoff([{ id: "x", label: "Back wall", lengthIn: 96, depthIn: 25.5, cutouts: cooktopCutout() }])
  );
  assert.equal(normalized.rooms[0].areas[0].runs[0].cookingAppliance.source, "legacy");
  const { takeoff: out, corrections } = reconcileCookingApplianceEvidence(normalized);
  const run = out.rooms[0].areas[0].runs[0];
  assert.equal(run.cookingAppliance.reviewRequired, true);
  assert.equal(run.cutouts.length, 1);
  assert.equal(corrections[0].op, "cooktop_review_required");
  console.log("ok: unclassified cooktop cutout requires estimator confirmation");
}

{
  const { takeoff: out } = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "x",
        label: "Back wall",
        lengthIn: 96,
        depthIn: 25.5,
        cutouts: cooktopCutout(),
        cookingAppliance: { type: "cooktop", confidence: "high", source: "ai_suggested" }
      }
    ]),
    { evidenceCookingAppliances: [{ type: "slide_in_range", confidence: "high" }] }
  );
  assert.equal(out.rooms[0].areas[0].runs[0].cookingAppliance.reviewRequired, true);
  const { changed } = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "x",
        label: "Back wall",
        lengthIn: 96,
        depthIn: 25.5,
        cutouts: cooktopCutout(),
        cookingAppliance: { type: "cooktop", confidence: "high", source: "ai_suggested" }
      }
    ]),
    { evidenceCookingAppliances: [{ type: "slide_in_range", confidence: "low" }] }
  );
  assert.equal(changed, false, "low-confidence evidence does not flag");
  console.log("ok: evidence pass saw a range → cooktop run flagged for review");
}

{
  const { takeoff: out, corrections } = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "x",
        label: "Left of range",
        lengthIn: 40,
        depthIn: 25.5,
        cutouts: [...cooktopCutout(), { type: "kitchen_sink", quantity: 1 }],
        cookingAppliance: { type: "slide_in_range", confidence: "high", source: "ai_suggested", widthIn: 30 }
      }
    ])
  );
  const run = out.rooms[0].areas[0].runs[0];
  assert.equal(run.cookingAppliance.type, "slide_in_range");
  assert.deepEqual(run.cutouts.map((c) => c.type), ["kitchen_sink"]);
  assert.equal(corrections[0].op, "range_cooktop_cutout_removed");
  console.log("ok: range-typed run never keeps a cooktop cutout (other cutouts kept)");
}

{
  const runs = [
    { id: "a", label: "Sink wall", lengthIn: 91.5, depthIn: 25.5, cutouts: [{ type: "kitchen_sink", quantity: 1 }] },
    { id: "b", label: "Range wall", lengthIn: 30, depthIn: 25.5, cutouts: [] }
  ];
  const takeoff = aiTakeoff(runs);
  const res = reconcileCookingApplianceEvidence(takeoff);
  assert.equal(res.changed, false);
  assert.equal(res.takeoff, takeoff);
  assert.equal(reconcileCookingApplianceEvidence(null).changed, false);
  console.log("ok: runs without cooking cutouts untouched");
}

{
  // Woodharbor Gemini run: "Plan indicates a cooktop cutout, not a slide-in range." must not flag.
  const { changed } = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "x",
        label: "Cooktop wall",
        lengthIn: 78,
        depthIn: 25.5,
        cutouts: cooktopCutout(),
        cookingAppliance: { type: "cooktop", confidence: "high", source: "ai_suggested" },
        assemblyNotes: "Plan indicates a cooktop cutout, not a slide-in range. No range here; rather than a stove."
      }
    ]),
    { evidenceCookingAppliances: [{ type: "cooktop", confidence: "high", widthIn: 30 }] }
  );
  assert.equal(changed, false);
  console.log("ok: negated range wording does not flag a labeled cooktop");
}

{
  // Cambridge Gemini run: "a standard 30\" range width is assumed" with no labeled width or sides.
  const evidence = [{ type: "slide_in_range", confidence: "high", widthIn: null, leftCounterLengthIn: null }];
  const { takeoff: out, corrections } = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "l",
        label: "Range wall - Left of range",
        lengthIn: 56,
        depthIn: 25.5,
        cutouts: [],
        cookingAppliance: { type: "slide_in_range", confidence: "high", source: "ai_suggested", widthIn: 30 }
      }
    ]),
    { evidenceCookingAppliances: evidence }
  );
  const run = out.rooms[0].areas[0].runs[0];
  assert.equal(run.cookingAppliance.widthIn, undefined, "assumed width removed");
  assert.equal(run.cookingAppliance.reviewRequired, true);
  assert.equal(run.requiresEstimatorReview, true);
  assert.ok(run.notes.some((n) => /not labeled on the plan/.test(n)));
  assert.deepEqual(
    corrections.map((c) => c.op),
    ["range_width_unlabeled_removed", "range_sides_unlabeled"]
  );
  assert.ok(cookingApplianceApprovalIssue(run), "still blocks approval");

  const labeledEvidence = [{ type: "slide_in_range", confidence: "high", widthIn: 30, leftCounterLengthIn: 26.5 }];
  const kept = reconcileCookingApplianceEvidence(
    aiTakeoff([
      {
        id: "l",
        label: "Left of range",
        lengthIn: 26.5,
        depthIn: 25.5,
        cutouts: [],
        cookingAppliance: { type: "slide_in_range", confidence: "high", source: "ai_suggested", widthIn: 30 }
      }
    ]),
    { evidenceCookingAppliances: labeledEvidence }
  );
  assert.equal(kept.changed, false, "labeled width and sides are kept");
  console.log("ok: unlabeled range width removed and unlabeled sides flagged; labeled values kept");
}

// ── Prompt guidance ────────────────────────────────────────────────────────────

{
  const sys = buildSystemPrompt();
  const exampleStart = sys.indexOf("Schema (TakeoffResult v1.0):");
  const exampleEnd = sys.indexOf("── EXTRACTION RULES");
  const example = sys.slice(exampleStart, exampleEnd);
  assert.ok(!/"type":\s*"cooktop"/.test(example), "schema example must not teach a cooktop cutout");
  assert.ok(example.includes("slide_in_range"), "schema example shows a split range wall");
  assert.ok(sys.includes("HOW TO TELL A COOKTOP FROM A RANGE"));
  assert.ok(/burner symbol alone proves nothing/i.test(sys));

  const evidenceSys = buildEvidenceSystemPrompt();
  assert.ok(evidenceSys.includes("cookingAppliances"));
  assert.ok(!/symbol indicating an opening/.test(evidenceSys), "burner symbol is not a cutout indicator");

  const msg = buildUserMessage({
    originalFilename: "plan.pdf",
    dimensionEvidence: {
      dimensions: [{ id: "dim-1", label: "Range wall", lengthIn: 117.5, depthIn: null, category: "countertop_run" }],
      cookingAppliances: [
        { type: "freestanding_range", label: "Range", widthIn: null, cues: ["No cabinet codes"], confidence: "medium", pageNumber: 1 }
      ]
    }
  });
  assert.ok(msg.includes("[freestanding_range] Range · width not labeled"));
  assert.ok(msg.includes("TWO runs"));
  console.log("ok: prompts teach range vs cooktop and pass evidence appliances through");
}

// ── Approval: unresolved appliances block billable approval ────────────────────

{
  const applianceBlockers = (takeoff, reviewState = null) =>
    collectConsolidatedHardBlockers(takeoff, reviewState).filter(
      (b) => b.code === "COOKING_APPLIANCE_UNRESOLVED"
    );
  const kitchen = (runs) => ({
    rooms: [{ id: "r1", name: "Kitchen", areas: [{ id: "a1", label: "Perimeter", runs }] }]
  });

  // AI left one continuous 117.5" run across a range it could not dimension.
  const spanning = kitchen([
    {
      id: "run-1",
      label: "Range wall",
      lengthIn: 117.5,
      depthIn: 25.5,
      cutouts: [],
      cookingAppliance: { type: "freestanding_range", confidence: "medium", reviewRequired: true, source: "ai_suggested" }
    }
  ]);
  assert.equal(applianceBlockers(spanning).length, 1, "unresolved range blocks approval");
  assert.ok(CONSOLIDATED_BLOCKING_CODES.has("COOKING_APPLIANCE_UNRESOLVED"));
  assert.equal(
    applianceBlockers(spanning, { excludedRunIds: ["run-1"] }).length,
    0,
    "excluded pieces are not billed and do not block"
  );

  // Even an AI range with a width and no review flag needs staff to resolve the opening.
  const aiConfident = structuredClone(spanning);
  aiConfident.rooms[0].areas[0].runs[0].cookingAppliance = {
    type: "slide_in_range", confidence: "high", reviewRequired: false, source: "ai_suggested", widthIn: 30
  };
  assert.equal(applianceBlockers(aiConfident).length, 1);

  // Staff split at the opening: left piece carries the confirmed gap, right piece is plain stone.
  const split = insertApplianceGap(spanning, "r1", "run-1", {
    leftLengthIn: 40,
    gapWidthIn: 30,
    applianceType: "freestanding_range"
  });
  assert.equal(applianceBlockers(split.takeoff).length, 0, "split resolves the blocker");
  const sfAfter = totalCountertopSfExcludingApplianceGaps(split.takeoff);
  assert.ok(Math.abs(sfAfter - ((40 + 47.5) * 25.5) / 144) < 0.01, "range opening is not billed");

  // Staff confirm the AI already split the stone (e.g. "left of range" piece) without inventing a gap.
  const confirmed = convertCookingApplianceType(spanning, "r1", "run-1", "freestanding_range", {
    source: "estimator_confirmed",
    confidence: "high",
    sidesConfirmed: true
  });
  assert.equal(confirmed.needsSegmentation, false);
  assert.equal(confirmed.takeoff.rooms[0].areas[0].runs[0].applianceSidesConfirmed, true);
  assert.equal(confirmed.event.sidesConfirmed, true);
  assert.equal(applianceBlockers(confirmed.takeoff).length, 0);

  // Confirming the type alone (no split, no sides confirmation) stays blocked.
  const typeOnly = convertCookingApplianceType(spanning, "r1", "run-1", "freestanding_range", {
    source: "estimator_confirmed"
  });
  assert.equal(typeOnly.needsSegmentation, true);
  assert.equal(applianceBlockers(typeOnly.takeoff).length, 1);

  // Switching a confirmed range back to cooktop drops the sides flag.
  const back = convertCookingApplianceType(confirmed.takeoff, "r1", "run-1", "cooktop", {
    source: "estimator_confirmed"
  });
  assert.equal(back.takeoff.rooms[0].areas[0].runs[0].applianceSidesConfirmed, undefined);
  assert.equal(applianceBlockers(back.takeoff).length, 0);

  // Unknown appliance blocks; a clearly labeled AI cooktop does not.
  const unknown = kitchen([
    {
      id: "u", label: "Wall", lengthIn: 96, depthIn: 25.5, cutouts: [],
      cookingAppliance: { type: "unknown_cooking_appliance", confidence: "low", reviewRequired: true, source: "ai_suggested" }
    }
  ]);
  assert.equal(applianceBlockers(unknown).length, 1);
  const cooktop = kitchen([
    {
      id: "c", label: "Left wall", lengthIn: 78, depthIn: 25.5, cutouts: cooktopCutout(),
      cookingAppliance: { type: "cooktop", confidence: "high", reviewRequired: false, source: "ai_suggested" }
    }
  ]);
  assert.equal(applianceBlockers(cooktop).length, 0, "labeled cooktop is not blocked");
  const flaggedCooktop = structuredClone(cooktop);
  flaggedCooktop.rooms[0].areas[0].runs[0].cookingAppliance.reviewRequired = true;
  assert.equal(applianceBlockers(flaggedCooktop).length, 1, "review-flagged cooktop is blocked");
  assert.equal(cookingApplianceApprovalIssue({}), null);
  console.log("ok: unresolved cooking appliances block approval until split or confirmed");
}

console.log("\nAll takeoffCookingAppliance tests passed.\n");
