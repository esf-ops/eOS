/**
 * Authoritative selection + Save & merge preservation.
 * Run: node backend-core/src/takeoff/takeoffAuthoritativeResult.test.mjs
 */
import assert from "node:assert/strict";
import {
  hasEstimatorOwnedGeometry,
  hasEstimatorSavedEdits,
  mergeAiDraftPreservingConfirmed,
  saveMergeTakeoffDrafts,
  selectAuthoritativeTakeoffResult
} from "./takeoffAuthoritativeResult.mjs";

console.log("\ntakeoffAuthoritativeResult.test.mjs\n");

function manualDraft() {
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-manual-1",
        name: "Manual Test Room",
        _estimatorOwned: true,
        _manual: true,
        areas: [
          {
            id: "room-manual-1-a1",
            label: "Main",
            runs: [
              {
                id: "run-manual-1",
                label: "Manual piece",
                lengthIn: 120,
                depthIn: 25.5,
                quantity: 1,
                _estimatorOwned: true,
                _manual: true,
                notes: ["keep me"],
                cutouts: { sink: 1 }
              }
            ]
          }
        ]
      },
      {
        id: "room-empty-manual",
        name: "Empty Manual Room",
        _estimatorOwned: true,
        _manual: true,
        areas: [{ id: "room-empty-manual-a1", label: "Main", runs: [] }]
      }
    ]
  };
}

function aiDraft() {
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-ai-kitchen",
        name: "AI Kitchen",
        areas: [
          {
            id: "a1",
            runs: [{ id: "run-ai-1", label: "Sink run", lengthIn: 96, depthIn: 25.5 }]
          }
        ]
      }
    ]
  };
}

{
  const local = manualDraft();
  assert.equal(hasEstimatorOwnedGeometry(local), true);
  assert.equal(hasEstimatorOwnedGeometry(aiDraft()), false);
  console.log("  ✓ detector finds estimator-owned geometry including empty rooms");
}

{
  const before = manualDraft();
  const ai = aiDraft();
  const { merged, unconfirmedAiFindings } = saveMergeTakeoffDrafts(before, ai);

  const manual = merged.rooms.find((r) => r.id === "room-manual-1");
  const empty = merged.rooms.find((r) => r.id === "room-empty-manual");
  const kitchen = merged.rooms.find((r) => r.id === "room-ai-kitchen");
  const piece = manual.areas[0].runs.find((r) => r.id === "run-manual-1");

  assert.ok(manual, "manual room survives Save & merge");
  assert.ok(empty, "empty manual room survives Save & merge");
  assert.ok(kitchen, "AI room appends without replacing manual");
  assert.equal(piece.lengthIn, 120, "manual dimensions survive");
  assert.equal(piece.depthIn, 25.5);
  assert.equal(piece.notes[0], "keep me");
  assert.equal(piece.cutouts.sink, 1);
  assert.equal(manual.name, "Manual Test Room");
  assert.equal(kitchen._aiUnconfirmed, true);
  assert.ok(unconfirmedAiFindings.rooms.some((r) => r.roomId === "room-ai-kitchen"));
  console.log("  ✓ Save & merge preserves manual room/piece/empty + appends AI");
}

{
  const local = manualDraft();
  // Local already has AI kitchen from earlier load; AI payload is kitchen-only.
  local.rooms.push({
    id: "room-ai-kitchen",
    name: "AI Kitchen",
    areas: [
      {
        id: "a1",
        runs: [{ id: "run-ai-1", label: "Sink run", lengthIn: 96, depthIn: 25.5 }]
      }
    ]
  });
  const { merged } = mergeAiDraftPreservingConfirmed(local, aiDraft());
  assert.equal(merged.rooms.filter((r) => r.id === "room-manual-1").length, 1);
  assert.equal(merged.rooms.find((r) => r.id === "room-manual-1").areas[0].runs[0].lengthIn, 120);
  assert.ok(merged.rooms.find((r) => r.id === "room-ai-kitchen"));
  console.log("  ✓ merge is idempotent when AI rooms already present locally");
}

{
  const estimatorRow = {
    id: "res-estimator",
    created_at: "2026-07-19T10:00:00.000Z",
    review_status: "needs_review",
    normalized_takeoff_json: manualDraft(),
    raw_ai_result_json: {
      _corrections: [{ id: "c1" }],
      _meta: {
        estimatorConfirmed: {
          confirmedAt: "2026-07-19T10:00:00.000Z",
          source: "estimator_save"
        },
        reviewState: {
          manualRoomIds: ["room-manual-1", "room-empty-manual"],
          manualRunIds: ["run-manual-1"]
        }
      }
    }
  };
  const newerAiRow = {
    id: "res-ai",
    created_at: "2026-07-19T11:00:00.000Z",
    review_status: "needs_review",
    normalized_takeoff_json: aiDraft(),
    raw_ai_result_json: { _meta: { promptVersion: "x" } }
  };

  const picked = selectAuthoritativeTakeoffResult([newerAiRow, estimatorRow]);
  assert.equal(picked.source, "estimator_draft");
  assert.equal(picked.row.id, "res-estimator");
  assert.ok(
    picked.row.normalized_takeoff_json.rooms.some((r) => r.id === "room-manual-1"),
    "post-merge authoritative result is estimator-preserving"
  );
  console.log("  ✓ latest raw AI cannot displace estimator-confirmed merged result");
}

{
  const newerAiRow = {
    id: "res-ai",
    created_at: "2026-07-19T11:00:00.000Z",
    review_status: "needs_review",
    normalized_takeoff_json: aiDraft(),
    raw_ai_result_json: { _meta: {} }
  };
  const summary = {
    savedAt: "2026-07-19T11:05:00.000Z",
    lastCorrectionId: "corr-1",
    normalizedTakeoffJson: manualDraft(),
    estimatorConfirmed: {
      confirmedAt: "2026-07-19T11:05:00.000Z",
      source: "estimator_save"
    }
  };
  const picked = selectAuthoritativeTakeoffResult([newerAiRow], {
    jobResultSummary: summary
  });
  assert.equal(picked.source, "estimator_draft");
  assert.ok(
    picked.row.normalized_takeoff_json.rooms.some((r) => r.id === "room-manual-1"),
    "job.result_summary correction outranks pure AI table row"
  );
  console.log("  ✓ result_summary estimator fallback beats AI-only table row");
}

{
  const geometryOnly = {
    id: "res-geo",
    review_status: "needs_review",
    normalized_takeoff_json: manualDraft(),
    raw_ai_result_json: {}
  };
  assert.equal(hasEstimatorSavedEdits(geometryOnly), true);
  const picked = selectAuthoritativeTakeoffResult([
    { id: "ai", normalized_takeoff_json: aiDraft(), raw_ai_result_json: {} },
    geometryOnly
  ]);
  assert.equal(picked.row.id, "res-geo");
  console.log("  ✓ geometry markers alone mark estimator-saved edits");
}

console.log("\ntakeoffAuthoritativeResult.test.mjs — passed\n");
