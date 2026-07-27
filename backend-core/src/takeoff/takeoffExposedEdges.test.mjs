/**
 * Exposed-edge geometry + confirm-only correction contracts.
 * Run: node backend-core/src/takeoff/takeoffExposedEdges.test.mjs
 *   or: npm run eos:test:takeoff-exposed-edges
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PIECE_TOPOLOGIES,
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  defaultExposedSidesForTopology,
  formatExposedSidesSummary,
  mapLegacyExposedSides,
  needsExposedEdgeReview,
  suggestPieceTopology
} from "./takeoffExposedEdges.mjs";
import {
  draftFinishedEdgeGeometry,
  resolvePieceFinishedEdgeGeometry,
  sumFinishedEdgeLengthIn
} from "./takeoffPieceGeometryAuthority.mjs";
import { patchRunFinishedEdge } from "../../../app-ai-takeoff/src/lib/consolidatedWorksheetRows.mjs";
import { sanitizeInboxText } from "../elite100EstimateStudio/studioSharedInboxReadModel.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\ntakeoffExposedEdges.test.mjs\n");

// --- Geometry ---
{
  const island = calculateExposedEdgeInches(
    { lengthIn: 56, depthIn: 27, quantity: 1 },
    { front: true, back: true, left: true, right: true }
  );
  assert.equal(island.totalLf, 13.83);
  assert.equal(island.totalInches, 166);
  console.log("ok: 15 island 56×27 all sides = 13.83 LF");
}

{
  for (const attached of ["left", "right"]) {
    const sides = defaultExposedSidesForTopology(PIECE_TOPOLOGIES.PENINSULA, {
      attachedSide: attached
    });
    const calc = calculateExposedEdgeInches(
      { lengthIn: 86, depthIn: 36, quantity: 1 },
      sides
    );
    assert.equal(calc.totalLf, 17.33);
  }
  for (const attached of ["front", "back"]) {
    const sides = defaultExposedSidesForTopology(PIECE_TOPOLOGIES.PENINSULA, {
      attachedSide: attached
    });
    const calc = calculateExposedEdgeInches(
      { lengthIn: 86, depthIn: 36, quantity: 1 },
      sides
    );
    assert.equal(calc.totalLf, 13.17);
  }
  console.log("ok: 16–19 peninsula attached-side LF");
}

{
  const wall = defaultExposedSidesForTopology(PIECE_TOPOLOGIES.WALL_RUN);
  assert.deepEqual(wall, { front: true, back: false, left: false, right: false });
  const calc = calculateExposedEdgeInches({ lengthIn: 96, depthIn: 25.5 }, wall);
  assert.equal(calc.totalLf, 8);
  const withEnd = { ...wall, right: true };
  const calc2 = calculateExposedEdgeInches({ lengthIn: 96, depthIn: 25.5 }, withEnd);
  assert.equal(calc2.totalLf, 10.13);
  console.log("ok: 20–21 wall-run front / front+end");
}

{
  const vanity = defaultExposedSidesForTopology(PIECE_TOPOLOGIES.VANITY);
  assert.equal(vanity.front, true);
  assert.equal(vanity.back, false);
  assert.equal(vanity.left, false);
  assert.equal(vanity.right, false);
  const custom = defaultExposedSidesForTopology(PIECE_TOPOLOGIES.CUSTOM);
  assert.deepEqual(custom, { front: false, back: false, left: false, right: false });
  console.log("ok: 22–23 vanity/custom defaults");
}

{
  const qty2 = calculateExposedEdgeInches(
    { lengthIn: 56, depthIn: 27, quantity: 2 },
    { front: true, back: true, left: true, right: true }
  );
  assert.equal(qty2.totalLf, 27.67);
  assert.equal(qty2.quantity, 2);
  console.log("ok: 24 quantity multiplies LF exactly once");
}

{
  const none = calculateExposedEdgeInches(
    { lengthIn: 56, depthIn: 27 },
    { front: false, back: false, left: false, right: false }
  );
  assert.equal(none.totalLf, 0);
  assert.match(formatExposedSidesSummary(none.exposedSides, 0), /No sides selected/);
  console.log("ok: 25 zero sides = 0 LF");
}

{
  const mapped = mapLegacyExposedSides({
    finishedEdge: {
      frontEdgeLengthIn: 56,
      leftExposedEdgeLengthIn: 0,
      rightExposedEdgeLengthIn: 27,
      otherExposedEdgeLengthIn: 0
    }
  });
  assert.equal(mapped.front, true);
  assert.equal(mapped.right, true);
  assert.equal(mapped.back, false);
  assert.equal(mapped.left, false);
  console.log("ok: 26–27 back represented; legacy map preserves front/left/right");
}

{
  assert.equal(suggestPieceTopology({ label: "Island top" }), PIECE_TOPOLOGIES.ISLAND);
  assert.equal(needsExposedEdgeReview({ label: "Island", finishedEdge: { frontEdgeLengthIn: 56 } }), true);
  const draft = draftFinishedEdgeGeometry({
    lengthIn: 56,
    depthIn: 27,
    label: "Island top",
    areaType: "island"
  });
  assert.equal(draft.backExposed, true);
  assert.equal(draft.otherExposedEdgeLengthIn, 56);
  assert.equal(draft.totalFinishedEdgeLengthIn, 166);
  console.log("ok: island draft suggests all four sides");
}

{
  const pen = draftFinishedEdgeGeometry({
    lengthIn: 86,
    depthIn: 36,
    label: "Peninsula",
    areaType: "peninsula",
    attachedSide: "left"
  });
  assert.equal(pen.leftExposed, false);
  assert.equal(pen.frontExposed, true);
  assert.equal(pen.backExposed, true);
  assert.equal(pen.rightExposed, true);
  assert.equal(pen.totalFinishedEdgeLengthIn, 208);
  console.log("ok: peninsula attached-left draft");
}

{
  const fe = buildFinishedEdgeFromExposedSides({
    lengthIn: 56,
    depthIn: 27,
    quantity: 1,
    exposedSides: { front: true, back: true, left: true, right: true },
    topology: PIECE_TOPOLOGIES.ISLAND,
    confirm: true
  });
  assert.equal(fe.exposedSides.back, true);
  assert.equal(fe.otherExposedEdgeLengthIn, 56);
  assert.equal(fe.totalFinishedEdgeLengthIn, 166);
  assert.equal(fe.approved, true);
  const result = {
    rooms: [
      {
        id: "r1",
        areas: [{ id: "a1", runs: [{ id: "run1", lengthIn: 56, depthIn: 27, quantity: 1 }] }]
      }
    ]
  };
  const patched = patchRunFinishedEdge(
    result,
    { roomId: "r1", areaId: "a1", runId: "run1" },
    fe
  );
  const run = patched.rooms[0].areas[0].runs[0];
  assert.equal(run.backExposed, true);
  assert.equal(run.finishedEdge.exposedSides.back, true);
  assert.equal(run.finishedEdge.otherExposedEdgeLengthIn, 56);
  console.log("ok: patchRunFinishedEdge persists back + exposedSides");
}

{
  const pieces = [
    {
      id: "p1",
      quantity: 2,
      lengthIn: 56,
      depthIn: 27,
      finishedEdge: buildFinishedEdgeFromExposedSides({
        lengthIn: 56,
        depthIn: 27,
        quantity: 2,
        exposedSides: { front: true, back: true, left: true, right: true },
        confirm: true
      })
    },
    {
      id: "p2",
      included: false,
      quantity: 1,
      lengthIn: 100,
      depthIn: 25,
      finishedEdge: buildFinishedEdgeFromExposedSides({
        lengthIn: 100,
        depthIn: 25,
        quantity: 1,
        exposedSides: { front: true, back: false, left: false, right: false },
        confirm: true
      })
    }
  ];
  const sum = sumFinishedEdgeLengthIn(pieces, { requireApproved: true });
  assert.equal(sum.totalFinishedEdgeLf, 27.67);
  console.log("ok: 29–32 room sum includes qty once; excluded pieces omitted");
}

{
  const geo = resolvePieceFinishedEdgeGeometry({
    lengthIn: 10,
    depthIn: 25,
    quantity: 1,
    finishedEdge: {
      frontEdgeLengthIn: 10,
      leftExposedEdgeLengthIn: 0,
      rightExposedEdgeLengthIn: 0,
      otherExposedEdgeLengthIn: 0,
      approved: true,
      source: "estimator_confirmed"
    }
  });
  assert.equal(geo.totalFinishedEdgeLengthIn, 10);
  assert.equal(geo.backExposed, false);
  console.log("ok: 28 approved snapshot geometry resolves without silent rewrite of sides");
}

// --- UI / correction contracts ---
{
  const trigger = readFileSync(
    join(root, "app-ai-takeoff/src/components/ExposedSidesEditor.tsx"),
    "utf8"
  );
  const dialog = readFileSync(
    join(root, "app-ai-takeoff/src/components/ExposedSidesDialog.tsx"),
    "utf8"
  );
  const review = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(dialog, /Confirm exposed edges/);
  assert.match(dialog, /ctr-confirm-exposed-edges/);
  assert.match(dialog, /ctr-edge-\$\{key\}-exposed/);
  assert.match(dialog, /\["back", "Back"/);
  assert.match(dialog, /Mark the physical sides that will be exposed/);
  assert.match(dialog, /Pricing Setup/);
  assert.match(dialog, /htmlFor=\{/);
  assert.match(dialog, /name=\{`exposed-side/);
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /document\.body/);
  assert.equal(/updateDraft|saveTakeoffCorrection|scheduleSave/.test(dialog), false);
  assert.equal(/<details/.test(trigger), false);
  assert.match(review, /ExposedSidesDialog/);
  assert.match(review, /ExposedSidesTrigger|ExposedSidesEditor/);
  assert.match(review, /confirmExposedEdges/);
  assert.match(review, /applyLocalExposedEdgeConfirm/);
  assert.match(review, /Exposed edges/);
  assert.equal(/Set edges/.test(review), false);
  assert.equal(/edgeConfirmSavingRunId|drainCorrectionQueue|scheduleSave/.test(review), false);
  assert.match(review, /The Takeoff draft changed while you were editing/);
  assert.match(review, /saveTakeoffDraftExplicit/);
  assert.match(dialog, /Escape/);
  console.log("ok: 1–6/11/37–40/45 confirm-only UI + explicit-save dialog contracts");
}

{
  const rows = readFileSync(
    join(root, "app-ai-takeoff/src/lib/consolidatedWorksheetRows.mjs"),
    "utf8"
  );
  assert.match(rows, /otherExposedEdgeLengthIn/);
  assert.match(rows, /exposedSides/);
  assert.match(rows, /quantityApplied/);
  console.log("ok: worksheet rows persist four-side model");
}

{
  const routes = readFileSync(
    join(root, "backend-core/src/takeoff/takeoffWorkspaceRoutes.js"),
    "utf8"
  );
  assert.match(routes, /latestResultId/);
  assert.match(routes, /stale_takeoff_correction|e\?\.code/);
  const svc = readFileSync(
    join(root, "backend-core/src/takeoff/takeoffWorkspaceService.mjs"),
    "utf8"
  );
  assert.match(svc, /err\.latestResultId = latestResultId/);
  assert.match(svc, /stale_takeoff_correction/);
  console.log("ok: 10 409 returns conflict metadata; concurrency retained");
}

{
  const cleaned = sanitizeInboxText(
    "Hello [photo] team [icon] please quote <b>kitchen</b>  \n\n Thanks"
  );
  assert.equal(/\[photo\]|\[icon\]|<b>/.test(cleaned), false);
  assert.ok(cleaned.length <= 280);
  console.log("ok: 42–44 Shared Inbox preview strips [photo]/[icon]; no raw HTML");
}

{
  const format = readFileSync(
    join(root, "app-elite100-estimate-studio/src/lib/quoteIntakeFormat.mjs"),
    "utf8"
  );
  assert.match(format, /Customer not identified/);
  assert.match(format, /resolveCustomerDisplayLabel/);
  console.log("ok: 41 identity fallback uses Customer not identified");
}

{
  const statusSrc = readFileSync(
    join(root, "app-ai-takeoff/src/lib/emptyManualTakeoffDraft.mjs"),
    "utf8"
  );
  assert.match(statusSrc, /Previous Takeoff approved · Current draft needs estimator review/);
  assert.match(statusSrc, /Needs estimator review/);
  console.log("ok: 37–39 status consistency labels");
}

{
  // Zero side-effect contracts: confirm is local-only (Save draft is separate)
  const review = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  const confirmSlice = review.split("confirmExposedEdges")[1]?.slice(0, 1200) || "";
  assert.match(confirmSlice, /applyLocalExposedEdgeConfirm/);
  assert.equal(/saveTakeoffCorrection|saveTakeoffDraftExplicit|persistDraftWithResult/.test(confirmSlice), false);
  assert.equal(/approveAndBuildEstimate|publish|markSold|quickbooks/i.test(confirmSlice), false);
  console.log("ok: 46–51 edge confirm does not calculate/approve/publish/notify/sold/QB");
}

console.log("\ntakeoffExposedEdges.test.mjs: ok\n");
