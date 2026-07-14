/**
 * Lab measurement bridge — authoritative measured SF via pure takeoffMeasurementCalc.
 *
 * Imports ONLY takeoffMeasurementCalc.mjs (no DB/network/env side effects).
 * Does not expose chargeable / priced / sell SF in the lab summary.
 */

import {
  computeTakeoffMeasurements,
  sfFromRun
} from "../../../backend-core/src/takeoff/takeoffMeasurementCalc.mjs";

/**
 * Convert lab rooms/pieces into a minimal production-shaped TakeoffResult for calc only.
 * @param {import("./takeoffTypes.mjs").TakeoffRoom[]} rooms
 */
export function toCalcTakeoffResult(rooms) {
  return {
    schemaVersion: "1.0",
    id: "qil-calc-only",
    status: "draft",
    rooms: (rooms ?? []).map((room) => {
      const meta = room.areaMeta ?? {};
      const runs = (room.pieces ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        lengthIn: p.measurement?.lengthIn ?? 0,
        depthIn: p.measurement?.depthIn ?? 0,
        shape: p.measurement?.shape ?? "rect",
        pieceType: p.measurement?.pieceType ?? "counter"
      }));
      const cutouts = (room.pieces ?? []).flatMap((p) => p.cutouts ?? []);
      return {
        id: room.id,
        name: room.name,
        areas: [
          {
            id: meta.areaId ?? `${room.id}-area`,
            label: meta.areaLabel ?? room.name,
            areaType: "countertop",
            runs,
            cutouts,
            ...(meta.backsplashScope != null && { backsplashScope: meta.backsplashScope }),
            ...(meta.backsplashLinearIn != null && { backsplashLinearIn: meta.backsplashLinearIn }),
            ...(meta.backsplashHeightIn != null && { backsplashHeightIn: meta.backsplashHeightIn }),
            ...(meta.cornerDeductions != null && { cornerDeductions: meta.cornerDeductions })
          }
        ]
      };
    })
  };
}

/**
 * Apply deterministic measured SF onto pieces/rooms and build calculation summary.
 * Provider-proposed totals are never authoritative.
 *
 * @param {import("./takeoffTypes.mjs").TakeoffRoom[]} rooms
 * @param {{
 *   providerProposedCountertopSf?: number|null,
 *   providerProposedBacksplashSf?: number|null,
 *   providerProposedCombinedSf?: number|null
 * }} [providerTotals]
 * @returns {{ rooms: import("./takeoffTypes.mjs").TakeoffRoom[], calculation: import("./takeoffTypes.mjs").TakeoffCalculationSummary }}
 */
export function applyDeterministicMeasurements(rooms, providerTotals = {}) {
  const calcResult = toCalcTakeoffResult(rooms);
  const measured = computeTakeoffMeasurements(calcResult);

  const nextRooms = (rooms ?? []).map((room) => {
    const rb = measured.roomBreakdown.find((r) => r.roomId === room.id);
    const pieces = (room.pieces ?? []).map((p) => {
      const lengthIn = p.measurement?.lengthIn;
      const depthIn = p.measurement?.depthIn;
      const shape = p.measurement?.shape ?? "rect";
      const measuredSf =
        lengthIn != null &&
        depthIn != null &&
        Number.isFinite(Number(lengthIn)) &&
        Number.isFinite(Number(depthIn)) &&
        Number(lengthIn) > 0 &&
        Number(depthIn) > 0
          ? sfFromRun(Number(lengthIn), Number(depthIn), shape)
          : 0;
      return {
        ...p,
        measurement: {
          ...p.measurement,
          measuredSf
        }
      };
    });
    return {
      ...room,
      pieces,
      measuredCountertopSf: rb?.countertopSf ?? 0,
      measuredBacksplashSf: rb?.backsplashSf ?? 0
    };
  });

  const sinkCutoutCount = nextRooms.reduce(
    (n, room) =>
      n +
      (room.pieces ?? []).reduce((m, p) => m + (Array.isArray(p.cutouts) ? p.cutouts.length : 0), 0),
    0
  );

  const providerProposedCountertopSf = numOrNull(providerTotals.providerProposedCountertopSf);
  const providerProposedBacksplashSf = numOrNull(providerTotals.providerProposedBacksplashSf);
  const providerProposedCombinedSf = numOrNull(providerTotals.providerProposedCombinedSf);

  const calculation = {
    measuredCountertopSf: measured.countertopExactSf,
    measuredBacksplashSf: measured.backsplashExactSf,
    measuredFhbSf: measured.fhbExactSf,
    measuredCombinedSf: measured.combinedExactSf,
    sinkCutoutCount,
    providerProposedCountertopSf,
    providerProposedBacksplashSf,
    providerProposedCombinedSf,
    countertopVarianceSf: variance(providerProposedCountertopSf, measured.countertopExactSf),
    backsplashVarianceSf: variance(providerProposedBacksplashSf, measured.backsplashExactSf),
    combinedVarianceSf: variance(providerProposedCombinedSf, measured.combinedExactSf),
    authorityNote:
      "Deterministic eliteOS measurement (takeoffMeasurementCalc) is authoritative. Provider-proposed totals are audit-only."
  };

  // Ensure no priced/chargeable vocabulary leaked into the summary object keys.
  assertNoPricingKeys(calculation);

  return { rooms: nextRooms, calculation };
}

export { sfFromRun, computeTakeoffMeasurements };

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function variance(provider, measured) {
  if (provider == null) return null;
  return Math.round((Number(provider) - Number(measured)) * 100) / 100;
}

function assertNoPricingKeys(obj) {
  const banned = ["chargeable", "priced", "sell", "quoteTotal", "price", "pricing"];
  for (const key of Object.keys(obj)) {
    if (banned.some((b) => key.toLowerCase().includes(b))) {
      throw new Error(`Lab calculation summary must not expose pricing key: ${key}`);
    }
  }
}
