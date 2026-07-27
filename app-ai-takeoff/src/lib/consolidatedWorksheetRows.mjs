/**
 * Consolidated Takeoff worksheet — pure row/update helpers.
 *
 * Row identity contract: every room, area, and run carries a draft-wide-unique id
 * (enforced by ensureUniqueTakeoffIdentity at AI normalization and at workspace
 * hydration). Update helpers here additionally scope by room and area so a patch
 * can only ever land on exactly one run.
 *
 * Backsplash contract: eligibility is per-run (`backsplashEligible`), never an
 * area-shared height. Customer chooses height/style later in Digital Estimate.
 *
 * Pure functions — no I/O, no React. Safe for browser + Node tests.
 */

import { resolveRunBacksplashEligible } from "../../../backend-core/src/takeoff/takeoffBacksplashEligibility.mjs";
import {
  normalizeRunCutouts,
  summarizeRunCutouts
} from "../../../backend-core/src/takeoff/takeoffCutoutScope.mjs";
import {
  applyRunPatchWithEdgeInvalidation,
  invalidateFinishedEdgeConfirmation
} from "./takeoffCorrectionCoordinator.mjs";

/** Rounded square feet from length × depth inches. */
export function sfFrom(lengthIn, depthIn) {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  return Math.round(((l * d) / 144) * 100) / 100;
}

/**
 * Flatten rooms/areas/runs into worksheet rows.
 * Row key = `${roomId}:${areaId}:${runId}` — unique per row given unique run ids.
 *
 * @param {object|null|undefined} result normalized takeoff JSON
 * @param {Set<string>} excludedRunIds
 */
export function flattenPieces(result, excludedRunIds) {
  const rows = [];
  for (const room of result?.rooms ?? []) {
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        const { cutouts } = normalizeRunCutouts(run.cutouts);
        const eligibility = resolveRunBacksplashEligible(run, area);
        rows.push({
          key: `${room.id}:${area.id}:${run.id}`,
          roomId: room.id,
          roomName: room.name || "Room",
          areaId: area.id,
          runId: run.id,
          pieceName: run.label || area.label || "Piece",
          lengthIn: Number(run.lengthIn) || 0,
          depthIn: Number(run.depthIn) || 0,
          quantity: Number(run.quantity) || 1,
          countertopSf: sfFrom(Number(run.lengthIn) || 0, Number(run.depthIn) || 0),
          backsplashEligible: eligibility.eligible,
          backsplashEligibleLengthIn: eligibility.eligible
            ? Math.max(0, Number(run.backsplashEligibleLengthIn) || Number(run.lengthIn) || 0)
            : 0,
          finishedEdge: run.finishedEdge || null,
          finishedEdgeTotalIn:
            run.finishedEdge?.totalFinishedEdgeLengthIn != null
              ? Number(run.finishedEdge.totalFinishedEdgeLengthIn)
              : null,
          finishedEdgeApproved:
            run.finishedEdge?.finishedEdgeConfirmed === true ||
            run.finishedEdge?.approved === true,
          pieceType: run.pieceType ?? (run.isBacksplash ? "splash" : "counter"),
          isBacksplash: run.isBacksplash === true || run.pieceType === "splash",
          frontEdgeLengthIn: Number(run.finishedEdge?.frontEdgeLengthIn) || null,
          leftExposed: run.leftExposed ?? run.finishedEdge?.leftExposed ?? run.finishedEdge?.exposedSides?.left ?? null,
          rightExposed: run.rightExposed ?? run.finishedEdge?.rightExposed ?? run.finishedEdge?.exposedSides?.right ?? null,
          backExposed: run.backExposed ?? run.finishedEdge?.backExposed ?? run.finishedEdge?.exposedSides?.back ?? null,
          frontExposed: run.frontExposed ?? run.finishedEdge?.frontExposed ?? run.finishedEdge?.exposedSides?.front ?? null,
          pieceTopology: run.pieceTopology ?? run.finishedEdge?.pieceTopology ?? null,
          attachedSide: run.attachedSide ?? run.finishedEdge?.attachedSide ?? null,
          exposedSides: run.finishedEdge?.exposedSides ?? null,
          included: !excludedRunIds.has(run.id),
          cutouts,
          cutoutsSummary: summarizeRunCutouts(cutouts),
          sideSplashLeftEligible: run.sideSplashLeftEligible === true,
          sideSplashRightEligible: run.sideSplashRightEligible === true,
          note: String(run.notes?.[0] ?? run.note ?? ""),
          lowConfidence:
            Boolean(run.requiresEstimatorReview) ||
            String(run.confidence ?? "").toLowerCase() === "low"
        });
      }
    }
  }
  return rows;
}

/**
 * Immutably patch exactly one run, located by room + area + run id.
 * areaId is part of the locator so even a (never-expected) cross-area id
 * collision cannot fan an edit out to another row.
 *
 * @param {object} result
 * @param {{ roomId: string, areaId?: string|null, runId: string }} locator
 * @param {Record<string, unknown>} patch
 */
export function patchRun(result, locator, patch, options = {}) {
  const { roomId, areaId, runId } = locator;
  const invalidateEdge = options.invalidateEdge === true;
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room) => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        areas: (room.areas ?? []).map((area) => {
          if (areaId != null && area.id !== areaId) return area;
          return {
            ...area,
            runs: (area.runs ?? []).map((run) => {
              if (run.id !== runId) return run;
              if (invalidateEdge) {
                return applyRunPatchWithEdgeInvalidation(run, patch, {
                  invalidateEdge: true
                });
              }
              return { ...run, ...patch };
            })
          };
        })
      };
    })
  };
}

/**
 * Patch length/depth/quantity (or topology) and clear exposed-edge confirmation.
 * Backsplash / notes / cutouts must use plain patchRun instead.
 */
export function patchRunGeometry(result, locator, patch) {
  return patchRun(result, locator, patch, { invalidateEdge: true });
}

export { invalidateFinishedEdgeConfirmation };

/**
 * Rename a room. Intentionally room-wide: the room header renames the room
 * (and therefore every child piece's room label) — distinct from piece edits.
 *
 * @param {object} result
 * @param {string} roomId
 * @param {string} name
 */
export function renameRoom(result, roomId, name) {
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room) =>
      room.id === roomId ? { ...room, name } : room
    )
  };
}

/**
 * Move exactly one run from one room to another (first area of the target room).
 *
 * @param {object} result
 * @param {string} fromRoomId
 * @param {string} runId
 * @param {string} toRoomId
 */
export function reassignRun(result, fromRoomId, runId, toRoomId) {
  if (fromRoomId === toRoomId) return result;
  let moved = null;
  const stripped = {
    ...result,
    rooms: (result.rooms ?? []).map((room) => {
      if (room.id !== fromRoomId) return room;
      return {
        ...room,
        areas: (room.areas ?? []).map((area) => ({
          ...area,
          runs: (area.runs ?? []).filter((r) => {
            if (!moved && r.id === runId) {
              moved = r;
              return false;
            }
            return true;
          })
        }))
      };
    })
  };
  if (!moved) return result;
  return {
    ...stripped,
    rooms: (stripped.rooms ?? []).map((room) => {
      if (room.id !== toRoomId) return room;
      const areas =
        room.areas?.length > 0
          ? [...room.areas]
          : [{ id: `${room.id}-a1`, label: "Main", runs: [], backsplashScope: "stone" }];
      areas[0] = { ...areas[0], runs: [...(areas[0].runs ?? []), moved] };
      return { ...room, areas };
    })
  };
}

/**
 * Set backsplash eligibility on a run with optional eligible length override.
 * When eligible and length omitted, defaults to full piece run length.
 */
export function patchRunBacksplashEligibility(result, locator, args) {
  const eligible = Boolean(args?.eligible);
  const length =
    eligible === false
      ? 0
      : Number.isFinite(Number(args?.eligibleLengthIn))
        ? Math.max(0, Number(args.eligibleLengthIn))
        : null;
  return patchRun(result, locator, {
    backsplashEligible: eligible,
    backsplashEligibilitySource: "estimator_confirmed",
    ...(length != null
      ? {
          backsplashEligibleLengthIn: length,
          backsplashGeometry: {
            backsplashEligible: eligible,
            backsplashEligibleLengthIn: length,
            backsplashEdge: "back",
            approved: true,
            source: "estimator_confirmed",
            approvalSource: "estimator_confirmed",
            ...(args?.reason ? { overrideReason: String(args.reason) } : {})
          }
        }
      : {})
  });
}

/**
 * Persist estimator-approved finished-edge geometry on a run.
 * Accepts legacy length fields and/or exposedSides + dimensions.
 */
export function patchRunFinishedEdge(result, locator, finishedEdge) {
  const fe = finishedEdge && typeof finishedEdge === "object" ? finishedEdge : {};
  const front = Math.max(0, Number(fe.frontEdgeLengthIn) || 0);
  const left = Math.max(0, Number(fe.leftExposedEdgeLengthIn) || 0);
  const right = Math.max(0, Number(fe.rightExposedEdgeLengthIn) || 0);
  const other = Math.max(
    0,
    Number(fe.otherExposedEdgeLengthIn ?? fe.backExposedEdgeLengthIn) || 0
  );
  const adj = Number(fe.adjustmentIn) || 0;
  if (adj !== 0 && !String(fe.adjustmentReason || "").trim()) {
    throw Object.assign(new Error("Finished-edge adjustment requires a reason"), {
      code: "finished_edge_adjustment_reason_required"
    });
  }
  const qty = Math.max(1, Number(fe.quantityApplied) || Number(fe.quantity) || 1);
  const perUnit = Math.max(0, round2(front + left + right + other));
  const totalFromSides = Number.isFinite(Number(fe.totalFinishedEdgeLengthIn))
    ? Math.max(0, round2(Number(fe.totalFinishedEdgeLengthIn)))
    : round2(perUnit * qty + adj);
  const total = Math.max(0, round2(totalFromSides));
  const exposedSides =
    fe.exposedSides && typeof fe.exposedSides === "object"
      ? {
          front: fe.exposedSides.front === true || front > 0,
          back: fe.exposedSides.back === true || other > 0,
          left: fe.exposedSides.left === true || left > 0,
          right: fe.exposedSides.right === true || right > 0
        }
      : {
          front: front > 0,
          back: other > 0,
          left: left > 0,
          right: right > 0
        };
  const confirmed = fe.finishedEdgeConfirmed !== false && fe.approved !== false;
  return patchRun(result, locator, {
    leftExposed: exposedSides.left,
    rightExposed: exposedSides.right,
    frontExposed: exposedSides.front,
    backExposed: exposedSides.back,
    pieceTopology: fe.pieceTopology || fe.topology || null,
    attachedSide: fe.attachedSide ?? null,
    finishedEdge: {
      finishedEdgeConfirmed: confirmed,
      frontEdgeLengthIn: front,
      leftExposedEdgeLengthIn: left,
      rightExposedEdgeLengthIn: right,
      otherExposedEdgeLengthIn: other,
      backExposedEdgeLengthIn: other,
      totalFinishedEdgeLengthIn: total,
      perUnitFinishedEdgeLengthIn: perUnit,
      quantityApplied: qty,
      exposedSides,
      pieceTopology: fe.pieceTopology || fe.topology || null,
      attachedSide: fe.attachedSide ?? null,
      approved: confirmed,
      source: fe.source || "estimator_confirmed",
      approvalSource: fe.approvalSource || "estimator_confirmed",
      approvedAt: fe.approvedAt || new Date().toISOString(),
      adjustmentIn: adj,
      adjustmentReason: fe.adjustmentReason || null
    }
  });
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
