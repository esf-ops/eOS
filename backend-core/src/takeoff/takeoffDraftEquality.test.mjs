/**
 * Semantic Takeoff draft equality unit tests.
 * Run: node backend-core/src/takeoff/takeoffDraftEquality.test.mjs
 */
import assert from "node:assert/strict";
import {
  normalizeTakeoffDraftForCompare,
  takeoffDraftsSemanticallyEqual
} from "./takeoffDraftEquality.mjs";

console.log("\ntakeoffDraftEquality.test.mjs\n");

const base = {
  rooms: [
    {
      id: "r1",
      name: "Kitchen",
      areas: [
        {
          id: "a1",
          runs: [
            {
              id: "c1",
              label: "A",
              lengthIn: 40,
              depthIn: 25,
              quantity: 1,
              backsplashEligible: false,
              finishedEdge: {
                finishedEdgeConfirmed: true,
                approved: true,
                exposedSides: { front: true, back: false, left: false, right: false },
                totalFinishedEdgeLengthIn: 40
              }
            }
          ]
        }
      ]
    }
  ]
};

{
  const a = structuredClone(base);
  const b = structuredClone(base);
  delete b.rooms[0].areas[0].runs[0].backsplashEligible;
  assert.equal(takeoffDraftsSemanticallyEqual(a, b), true);
  console.log("ok: false vs undefined backsplash equal");
}

{
  const a = structuredClone(base);
  const b = structuredClone(base);
  b.rooms[0].areas[0].runs[0].backsplashEligible = true;
  assert.equal(takeoffDraftsSemanticallyEqual(a, b), false);
  console.log("ok: backsplash true dirties compare");
}

{
  const a = structuredClone(base);
  const b = structuredClone(base);
  b.rooms[0].areas[0].runs[0].finishedEdge.finishedEdgeConfirmed = false;
  b.rooms[0].areas[0].runs[0].finishedEdge.approved = false;
  assert.equal(takeoffDraftsSemanticallyEqual(a, b), false);
  console.log("ok: exposed-edge confirmation included");
}

{
  const a = structuredClone(base);
  a.resultId = "x";
  a.createdAt = "t";
  const norm = normalizeTakeoffDraftForCompare(a);
  assert.equal("resultId" in norm, false);
  assert.ok(norm.rooms);
  console.log("ok: volatile metadata excluded from compare");
}

console.log("\nAll takeoffDraftEquality tests passed.\n");
