/**
 * Manual takeoff draft helpers + durable worker stale rules.
 * Run:
 *   node app-ai-takeoff/src/lib/emptyManualTakeoffDraft.test.mjs
 *   node backend-core/src/takeoff/takeoffGenerationWorker.test.mjs
 */
import assert from "node:assert/strict";
import {
  addManualPiece,
  addManualRoom,
  collectManualOwnershipIds,
  createEmptyManualTakeoffDraft,
  deriveConsolidatedWorksheetStatus,
  hasUsableTakeoffGeometry,
  markRunEstimatorOwned
} from "./emptyManualTakeoffDraft.mjs";
import {
  mergeAiDraftPreservingConfirmed,
  saveMergeTakeoffDrafts,
  selectAuthoritativeTakeoffResult
} from "../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs";
import { deriveQueueWorkflowStatus } from "../../../backend-core/src/elite100EstimateStudio/studioEstimateQueueWorkflow.mjs";

console.log("\nemptyManualTakeoffDraft.test.mjs\n");

{
  const empty = createEmptyManualTakeoffDraft();
  assert.equal(hasUsableTakeoffGeometry(empty), false);
  assert.equal(hasUsableTakeoffGeometry(null), false);
  console.log("  ✓ empty draft has no usable geometry");
}

{
  let draft = createEmptyManualTakeoffDraft();
  draft = addManualRoom(draft, { name: "Visible Empty Room" });
  assert.equal(draft.rooms.length, 1);
  assert.equal(draft.rooms[0].areas[0].runs.length, 0);
  assert.equal(hasUsableTakeoffGeometry(draft), false);
  assert.ok(draft.rooms[0].id);
  assert.equal(draft.rooms[0].name, "Visible Empty Room");
  console.log("  ✓ empty room persists in draft immediately (visible Add Room)");
}

{
  let draft = createEmptyManualTakeoffDraft();
  draft = addManualRoom(draft, { name: "Manual Test Kitchen", roomType: "Kitchen" });
  assert.equal(draft.rooms.length, 1);
  assert.equal(draft.rooms[0].name, "Manual Test Kitchen");
  assert.equal(draft.rooms[0]._estimatorOwned, true);
  assert.equal(hasUsableTakeoffGeometry(draft), false, "room alone is not usable geometry");

  draft = addManualPiece(draft, draft.rooms[0].id, {
    label: "Sink run",
    lengthIn: 100,
    depthIn: 25.5
  });
  assert.equal(hasUsableTakeoffGeometry(draft), true);
  assert.equal(draft.rooms[0].areas[0].runs[0]._manual, true);
  const owned = collectManualOwnershipIds(draft);
  assert.ok(owned.manualRoomIds.includes(draft.rooms[0].id));
  assert.ok(owned.manualRunIds.includes(draft.rooms[0].areas[0].runs[0].id));
  console.log("  ✓ add room + piece before AI result");
}

{
  // Client Save & merge path: local estimator draft + pending AI server payload.
  let local = createEmptyManualTakeoffDraft();
  local = addManualRoom(local, { name: "Manual Test Room" });
  const emptyId = local.rooms[0].id;
  local = addManualRoom(local, { name: "Spare empty" });
  local = addManualPiece(local, emptyId, {
    label: "Manual piece",
    lengthIn: 120,
    depthIn: 25.5
  });
  const pieceId = local.rooms.find((r) => r.id === emptyId).areas[0].runs[0].id;

  const serverAi = {
    rooms: [
      {
        id: "ai-kitchen",
        name: "AI Kitchen",
        areas: [{ id: "a1", runs: [{ id: "ai-run", lengthIn: 80, depthIn: 25.5 }] }]
      }
    ]
  };

  const { merged } = saveMergeTakeoffDrafts(local, serverAi);
  assert.ok(merged.rooms.some((r) => r.id === emptyId), "manual room id stable");
  assert.ok(merged.rooms.some((r) => r.name === "Spare empty"), "empty manual room survives");
  assert.equal(
    merged.rooms.find((r) => r.id === emptyId).areas[0].runs[0].lengthIn,
    120,
    "manual dimensions survive Save & merge"
  );
  assert.equal(merged.rooms.find((r) => r.id === emptyId).areas[0].runs[0].id, pieceId);
  assert.ok(merged.rooms.some((r) => r.id === "ai-kitchen"), "AI appends");

  // Simulated post-merge poll returning AI-only must not displace when re-merged.
  const afterPoll = saveMergeTakeoffDrafts(merged, serverAi).merged;
  assert.ok(afterPoll.rooms.some((r) => r.id === emptyId));
  assert.equal(afterPoll.rooms.find((r) => r.id === emptyId).areas[0].runs[0].lengthIn, 120);
  console.log("  ✓ client Save & merge + post-merge refresh keep estimator geometry");
}

{
  const {
    removePieceFromTakeoff,
    removeRoomFromTakeoff,
    mergeAiDraftPreservingConfirmed
  } = await import("../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs");

  let draft = createEmptyManualTakeoffDraft();
  draft = addManualRoom(draft, { name: "Keep Room" });
  draft = addManualRoom(draft, { name: "Drop Room" });
  const keepId = draft.rooms[0].id;
  const dropId = draft.rooms[1].id;
  draft = addManualPiece(draft, keepId, { label: "A", lengthIn: 144, depthIn: 18 });
  draft = addManualPiece(draft, keepId, { label: "B", lengthIn: 72, depthIn: 18 });
  const runA = draft.rooms[0].areas[0].runs[0].id;
  const runB = draft.rooms[0].areas[0].runs[1].id;

  const sf = (t) =>
    t.rooms
      .flatMap((r) => r.areas.flatMap((a) => a.runs))
      .reduce((s, r) => s + (Number(r.lengthIn) * Number(r.depthIn)) / 144, 0);

  const before = sf(draft);
  const afterPiece = removePieceFromTakeoff(draft, keepId, runB);
  assert.ok(sf(afterPiece.takeoff) < before, "remove piece updates SF totals");
  assert.equal(afterPiece.takeoff.rooms.find((r) => r.id === keepId).areas[0].runs.length, 1);
  assert.ok(afterPiece.takeoff.rooms.find((r) => r.id === keepId));

  const afterLast = removePieceFromTakeoff(afterPiece.takeoff, keepId, runA);
  assert.equal(afterLast.takeoff.rooms.find((r) => r.id === keepId).areas[0].runs.length, 0);
  assert.ok(afterLast.takeoff.rooms.find((r) => r.id === keepId), "empty room remains");

  const afterRoom = removeRoomFromTakeoff(afterLast.takeoff, dropId);
  assert.equal(afterRoom.takeoff.rooms.some((r) => r.id === dropId), false);
  assert.equal(afterRoom.takeoff.rooms.length, 1);

  const resurrectAttempt = mergeAiDraftPreservingConfirmed(
    afterRoom.takeoff,
    {
      rooms: [
        {
          id: dropId,
          name: "Drop Room",
          areas: [{ runs: [{ id: "x", lengthIn: 10, depthIn: 10 }] }]
        }
      ]
    },
    {
      deletedRoomIds: afterRoom.deletedRoomIds,
      deletedRunIds: [...afterPiece.deletedRunIds, ...afterLast.deletedRunIds]
    }
  ).merged;
  assert.equal(resurrectAttempt.rooms.some((r) => r.id === dropId), false);
  console.log("  ✓ remove updates totals; empty room stays; tombstones block resurrection");
}


{
  let draft = createEmptyManualTakeoffDraft();
  draft = addManualRoom(draft, { name: "Kitchen" });
  draft = addManualPiece(draft, draft.rooms[0].id, { lengthIn: 120, depthIn: 25.5 });
  const runId = draft.rooms[0].areas[0].runs[0].id;
  draft = markRunEstimatorOwned(
    {
      ...draft,
      rooms: draft.rooms.map((r) => ({
        ...r,
        areas: r.areas.map((a) => ({
          ...a,
          runs: a.runs.map((run) =>
            run.id === runId ? { ...run, lengthIn: 111 } : run
          )
        }))
      }))
    },
    draft.rooms[0].id,
    runId
  );

  const ai = {
    rooms: [
      {
        id: draft.rooms[0].id,
        name: "AI Renamed",
        areas: [
          {
            id: "a1",
            runs: [{ id: runId, label: "Sink", lengthIn: 50, depthIn: 20 }]
          }
        ]
      },
      {
        id: "room-ai-only",
        name: "AI Pantry",
        areas: [{ id: "a2", runs: [{ id: "run-ai", lengthIn: 40, depthIn: 24 }] }]
      }
    ]
  };
  const { merged, unconfirmedAiFindings } = mergeAiDraftPreservingConfirmed(draft, ai);
  const kitchen = merged.rooms.find((r) => r.id === draft.rooms[0].id);
  const keptRun = kitchen.areas[0].runs.find((r) => r.id === runId);
  assert.equal(keptRun.lengthIn, 111, "manual measurement survives AI");
  assert.ok(merged.rooms.some((r) => r.id === "room-ai-only"));
  assert.ok(unconfirmedAiFindings.rooms.some((r) => r.roomId === "room-ai-only"));
  console.log("  ✓ AI merge preserves manual rooms/measurements and appends unconfirmed");
}

{
  const approved = {
    id: "r1",
    review_status: "approved",
    created_at: "2026-01-01",
    normalized_takeoff_json: { rooms: [{ id: "m1", areas: [{ runs: [{ id: "p1" }] }] }] }
  };
  const later = {
    id: "r2",
    review_status: "needs_review",
    created_at: "2026-01-02",
    normalized_takeoff_json: { rooms: [] }
  };
  assert.equal(selectAuthoritativeTakeoffResult([later, approved]).source, "approved");
  console.log("  ✓ approved takeoff never displaced");
}

{
  assert.equal(
    deriveConsolidatedWorksheetStatus({ jobStatus: "processing", hasUsableGeometry: false }),
    "Takeoff processing"
  );
  assert.equal(
    deriveConsolidatedWorksheetStatus({ jobStatus: "processing", hasUsableGeometry: true }),
    "Takeoff processing · manual draft in progress"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "completed",
      takeoffReviewStatus: "needs_review"
    }),
    "Takeoff queued"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "completed",
      takeoffReviewStatus: "needs_review",
      pieceCount: 1
    }),
    "Takeoff draft ready"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "completed",
      takeoffReviewStatus: "needs_review",
      linkStatus: "queued",
      pieceCount: 2
    }),
    "Takeoff draft ready",
    "stale link queued must not override completed job with geometry"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "completed",
      takeoffReviewStatus: "needs_review",
      roomCount: 1
    }),
    "Takeoff draft ready",
    "roomCount alone counts as usable geometry for queue status"
  );
  console.log("  ✓ status consistency (no idle / no fake draft ready / stale link ignored)");
}

console.log("\nemptyManualTakeoffDraft.test.mjs — passed\n");
