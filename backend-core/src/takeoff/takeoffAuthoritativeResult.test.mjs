/**
 * Authoritative selection + Save & merge preservation.
 * Run: node backend-core/src/takeoff/takeoffAuthoritativeResult.test.mjs
 */
import assert from "node:assert/strict";
import {
  hasEstimatorOwnedGeometry,
  hasEstimatorSavedEdits,
  mergeAiDraftPreservingConfirmed,
  removePieceFromTakeoff,
  removeRoomFromTakeoff,
  applyDeletionTombstones,
  saveMergeTakeoffDrafts,
  selectAuthoritativeTakeoffResult,
  findPendingAiTakeoffResult,
  summarizeAiFindingsPreview,
  readAiHandlingMeta
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

{
  const draft = {
    rooms: [
      {
        id: "room-keep",
        name: "Keep",
        _estimatorOwned: true,
        areas: [
          {
            id: "a1",
            runs: [
              { id: "run-keep", lengthIn: 100, depthIn: 25.5, _manual: true },
              { id: "run-ai-gone", lengthIn: 50, depthIn: 25.5 }
            ]
          }
        ]
      },
      {
        id: "room-ai-delete",
        name: "AI Gone Room",
        areas: [{ id: "a2", runs: [{ id: "run-in-gone-room", lengthIn: 40, depthIn: 24 }] }]
      },
      {
        id: "room-empty",
        name: "Empty Stay",
        _estimatorOwned: true,
        areas: [{ id: "a3", runs: [] }]
      }
    ]
  };

  const removedPiece = removePieceFromTakeoff(draft, "room-keep", "run-ai-gone");
  assert.equal(removedPiece.takeoff.rooms.find((r) => r.id === "room-keep").areas[0].runs.length, 1);
  assert.ok(removedPiece.takeoff.rooms.find((r) => r.id === "room-keep"));
  assert.deepEqual(removedPiece.deletedRunIds, ["run-ai-gone"]);

  const sfBefore = removedPiece.takeoff.rooms
    .flatMap((r) => r.areas.flatMap((a) => a.runs))
    .reduce((s, r) => s + ((r.lengthIn * r.depthIn) / 144), 0);
  assert.ok(sfBefore > 0);

  const removedRoom = removeRoomFromTakeoff(removedPiece.takeoff, "room-empty");
  assert.equal(removedRoom.takeoff.rooms.some((r) => r.id === "room-empty"), false);
  assert.ok(removedRoom.takeoff.rooms.some((r) => r.id === "room-keep"));
  assert.deepEqual(removedRoom.deletedRoomIds, ["room-empty"]);

  const tombstones = {
    deletedRoomIds: [...removedRoom.deletedRoomIds, "room-ai-delete"],
    deletedRunIds: [...removedPiece.deletedRunIds]
  };

  const aiAgain = {
    rooms: [
      {
        id: "room-ai-delete",
        name: "AI Gone Room",
        areas: [{ id: "a2", runs: [{ id: "run-in-gone-room", lengthIn: 40, depthIn: 24 }] }]
      },
      {
        id: "room-keep",
        name: "Keep",
        areas: [
          {
            id: "a1",
            runs: [
              { id: "run-keep", lengthIn: 1, depthIn: 1 },
              { id: "run-ai-gone", lengthIn: 99, depthIn: 25.5 },
              { id: "run-ai-new", lengthIn: 30, depthIn: 25.5 }
            ]
          }
        ]
      },
      {
        id: "room-ai-new",
        name: "Brand New AI",
        areas: [{ id: "a9", runs: [{ id: "run-brand", lengthIn: 20, depthIn: 25.5 }] }]
      }
    ]
  };

  const { merged } = mergeAiDraftPreservingConfirmed(
    removedRoom.takeoff,
    aiAgain,
    tombstones
  );
  assert.equal(merged.rooms.some((r) => r.id === "room-ai-delete"), false, "deleted AI room stays gone");
  assert.equal(merged.rooms.some((r) => r.id === "room-empty"), false, "deleted empty room stays gone");
  const keep = merged.rooms.find((r) => r.id === "room-keep");
  assert.ok(keep);
  assert.equal(keep.areas[0].runs.some((r) => r.id === "run-ai-gone"), false, "deleted AI piece stays gone");
  assert.equal(keep.areas[0].runs.find((r) => r.id === "run-keep").lengthIn, 100, "manual dims win");
  assert.ok(keep.areas[0].runs.some((r) => r.id === "run-ai-new"), "new AI piece may append");
  assert.ok(merged.rooms.some((r) => r.id === "room-ai-new"), "unrelated AI room appends");

  const normalized = applyDeletionTombstones(
    { rooms: [...merged.rooms, { id: "room-ai-delete", areas: [{ runs: [] }] }] },
    tombstones
  );
  assert.equal(normalized.rooms.some((r) => r.id === "room-ai-delete"), false);
  console.log("  ✓ remove room/piece + tombstones block AI reappearance after merge/poll");
}

{
  // Include/exclude is separate from remove — excluded runs stay in draft.
  const draft = manualDraft();
  const runId = draft.rooms[0].areas[0].runs[0].id;
  assert.ok(draft.rooms[0].areas[0].runs.some((r) => r.id === runId));
  const stillThere = applyDeletionTombstones(draft, { deletedRunIds: [] });
  assert.ok(stillThere.rooms[0].areas[0].runs.some((r) => r.id === runId));
  const hardRemoved = removePieceFromTakeoff(draft, draft.rooms[0].id, runId);
  assert.equal(hardRemoved.takeoff.rooms[0].areas[0].runs.length, 0);
  assert.ok(hardRemoved.takeoff.rooms[0], "room remains after last piece removed");
  console.log("  ✓ remove leaves empty room; include/exclude remains separate concept");
}

{
  const estimatorRow = {
    id: "res-manual",
    created_at: "2026-07-19T12:00:00.000Z",
    review_status: "needs_review",
    normalized_takeoff_json: manualDraft(),
    raw_ai_result_json: {
      _corrections: [{ id: "c1" }],
      _meta: {
        estimatorConfirmed: {
          confirmedAt: "2026-07-19T12:00:00.000Z",
          source: "estimator_save"
        }
      }
    }
  };
  const newerAi = {
    id: "res-ai-later",
    created_at: "2026-07-19T12:05:00.000Z",
    review_status: "needs_review",
    normalized_takeoff_json: aiDraft(),
    raw_ai_result_json: {
      _meta: { promptVersion: "v1", modelUsed: "gpt-test", aiExtraction: true }
    }
  };

  const auth = selectAuthoritativeTakeoffResult([newerAi, estimatorRow]);
  assert.equal(auth.source, "estimator_draft");
  assert.equal(auth.row.id, "res-manual", "manual draft remains authoritative");

  const pending = findPendingAiTakeoffResult([newerAi, estimatorRow], auth.row, {});
  assert.equal(pending.pendingAiAvailable, true);
  assert.equal(pending.pendingAiResultId, "res-ai-later");
  assert.equal(pending.pendingAiDraft.rooms[0].name, "AI Kitchen");

  const preview = summarizeAiFindingsPreview(pending.pendingAiDraft);
  assert.ok(preview.rooms.some((r) => r.name === "AI Kitchen"));
  assert.ok(preview.rooms[0].pieces.some((p) => p.name === "Sink run"));

  const afterMerge = findPendingAiTakeoffResult([newerAi, estimatorRow], auth.row, {
    lastMergedAiResultId: "res-ai-later"
  });
  assert.equal(afterMerge.pendingAiAvailable, false, "lastMerged prevents repeat prompt");

  const afterDismiss = findPendingAiTakeoffResult([newerAi, estimatorRow], auth.row, {
    dismissedAiResultIds: ["res-ai-later"]
  });
  assert.equal(afterDismiss.pendingAiAvailable, false, "dismissed AI does not prompt");

  const newerRun = {
    ...newerAi,
    id: "res-ai-even-later",
    created_at: "2026-07-19T12:10:00.000Z"
  };
  const again = findPendingAiTakeoffResult(
    [newerRun, newerAi, estimatorRow],
    auth.row,
    { dismissedAiResultIds: ["res-ai-later"] }
  );
  assert.equal(again.pendingAiAvailable, true);
  assert.equal(again.pendingAiResultId, "res-ai-even-later");

  const merged = saveMergeTakeoffDrafts(
    auth.row.normalized_takeoff_json,
    pending.pendingAiDraft
  ).merged;
  assert.ok(merged.rooms.some((r) => r.id === "room-manual-1"));
  assert.ok(merged.rooms.some((r) => r.id === "room-ai-kitchen"));
  assert.equal(
    merged.rooms.find((r) => r.id === "room-manual-1").areas[0].runs[0].lengthIn,
    120
  );

  const handling = readAiHandlingMeta({
    raw_ai_result_json: {
      _meta: { lastMergedAiResultId: "res-ai-later", dismissedAiResultIds: ["x"] }
    }
  });
  assert.equal(handling.lastMergedAiResultId, "res-ai-later");
  assert.deepEqual(handling.dismissedAiResultIds, ["x"]);
  console.log("  ✓ pending AI separate from authoritative; merge/dismiss tracking");
}

console.log("\ntakeoffAuthoritativeResult.test.mjs — passed\n");
