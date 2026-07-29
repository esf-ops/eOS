/**
 * Local-only Takeoff review fixture (Munsterman-shaped).
 * Used when ?localReview=1 — never hits production APIs.
 */
import {
  createEmptyManualTakeoffDraft,
  addManualRoom,
  addManualPiece
} from "../lib/emptyManualTakeoffDraft.mjs";

function withCutouts(takeoff, roomId, runLabel, cutouts) {
  const next = structuredClone(takeoff);
  for (const room of next.rooms || []) {
    if (String(room.id) !== String(roomId)) continue;
    for (const area of room.areas || []) {
      for (const run of area.runs || []) {
        if (String(run.label) !== String(runLabel)) continue;
        run.cutouts = cutouts;
        run.finishedEdge = {
          finishedEdgeConfirmed: true,
          approved: true,
          totalFinishedEdgeLengthIn: Number(run.lengthIn) || 0,
          exposedSides: { front: true, back: false, left: false, right: false }
        };
      }
    }
  }
  return next;
}

/**
 * @param {{ withWaterfall?: boolean, sinkWallLengthIn?: number }} [opts]
 */
export function buildLocalReviewTakeoffDraft(opts = {}) {
  let draft = createEmptyManualTakeoffDraft();
  draft = addManualRoom(draft, { name: "Kitchen", roomType: "Kitchen" });
  const kitchenId = draft.rooms[0].id;
  draft = addManualPiece(draft, kitchenId, {
    label: "Left run",
    lengthIn: 69.5,
    depthIn: 36,
    quantity: 1,
    backsplashEligible: true
  });
  draft = addManualPiece(draft, kitchenId, {
    label: "Back run",
    lengthIn: 112.5,
    depthIn: 25.5,
    quantity: 1,
    backsplashEligible: true
  });
  draft = addManualPiece(draft, kitchenId, {
    label: "Sink wall",
    lengthIn: opts.sinkWallLengthIn ?? 96,
    depthIn: 24,
    quantity: 1,
    backsplashEligible: true
  });
  draft = addManualPiece(draft, kitchenId, {
    label: "Kitchen Island",
    lengthIn: 96,
    depthIn: 36,
    quantity: 1,
    backsplashEligible: false
  });
  draft = withCutouts(draft, kitchenId, "Sink wall", [
    { type: "kitchen_sink", quantity: 1 },
    { type: "cooktop", quantity: 1 }
  ]);

  if (opts.withWaterfall) {
    for (const room of draft.rooms) {
      if (String(room.id) !== String(kitchenId)) continue;
      for (const area of room.areas || []) {
        for (const run of area.runs || []) {
          if (String(run.label) !== "Kitchen Island") continue;
          run.waterfallSegmentLengthsIn = { left: 36 };
          run.notes = "Left waterfall panel approved";
        }
      }
    }
  }

  draft = addManualRoom(draft, { name: "Bathroom", roomType: "Bath" });
  const bathId = draft.rooms[1].id;
  draft = addManualPiece(draft, bathId, {
    label: "Vanity Top",
    lengthIn: 37,
    depthIn: 22.5,
    quantity: 1,
    backsplashEligible: true
  });
  draft = withCutouts(draft, bathId, "Vanity Top", [
    { type: "vanity_bar_sink", quantity: 1 }
  ]);

  draft.projectAssumptions = [
    "Local review fixture — production-shaped Takeoff worksheet (not live AI)."
  ];
  draft.status = "draft";
  return draft;
}
