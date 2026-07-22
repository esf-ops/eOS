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
          frontEdgeLengthIn: Number(run.finishedEdge?.frontEdgeLengthIn) || null,
          leftExposed: run.leftExposed ?? run.finishedEdge?.leftExposed ?? null,
          rightExposed: run.rightExposed ?? run.finishedEdge?.rightExposed ?? null,
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
export function patchRun(result, locator, patch) {
  const { roomId, areaId, runId } = locator;
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
            runs: (area.runs ?? []).map((run) =>
              run.id === runId ? { ...run, ...patch } : run
            )
          };
        })
      };
    })
  };
}

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
 */
export function patchRunFinishedEdge(result, locator, finishedEdge) {
  const fe = finishedEdge && typeof finishedEdge === "object" ? finishedEdge : {};
  const front = Math.max(0, Number(fe.frontEdgeLengthIn) || 0);
  const left = Math.max(0, Number(fe.leftExposedEdgeLengthIn) || 0);
  const right = Math.max(0, Number(fe.rightExposedEdgeLengthIn) || 0);
  const other = Math.max(0, Number(fe.otherExposedEdgeLengthIn) || 0);
  const adj = Number(fe.adjustmentIn) || 0;
  if (adj !== 0 && !String(fe.adjustmentReason || "").trim()) {
    throw Object.assign(new Error("Finished-edge adjustment requires a reason"), {
      code: "finished_edge_adjustment_reason_required"
    });
  }
  const total = Math.max(0, Math.round((front + left + right + other + adj) * 100) / 100);
  return patchRun(result, locator, {
    leftExposed: left > 0,
    rightExposed: right > 0,
    frontExposed: front > 0,
    backExposed: other > 0,
    finishedEdge: {
      finishedEdgeConfirmed: true,
      frontEdgeLengthIn: front,
      leftExposedEdgeLengthIn: left,
      rightExposedEdgeLengthIn: right,
      otherExposedEdgeLengthIn: other,
      totalFinishedEdgeLengthIn: total,
      approved: true,
      source: "estimator_confirmed",
      approvalSource: "estimator_confirmed",
      approvedAt: new Date().toISOString(),
      adjustmentIn: adj,
      adjustmentReason: fe.adjustmentReason || null
    }
  });
}
