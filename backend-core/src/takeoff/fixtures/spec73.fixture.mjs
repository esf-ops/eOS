/**
 * Spec 73 takeoff fixture — known-good kitchen measurement plan.
 *
 * Source: Elite internal measurement plan (Spec 73).
 * Expected results (verified by hand + eliteOS deterministic calculator):
 *   Countertop exact sf:   59.96
 *   Backsplash exact sf:    6.61
 *   Combined exact sf:     66.57
 *
 * Assumptions captured in this fixture:
 *   - Standard counter depth: 25.5"
 *   - Peninsula depth: 41" (non-standard)
 *   - Open peninsula end: no backsplash on that end
 *   - Stove wall: stove opening excluded; left + right runs separate
 *   - U-shape corners: handled as non-overlapping rectangles (overlapMode: "none")
 *   - Backsplash: 238 linear inches @ 4" height (total countertop perimeter minus open ends)
 *   - Source page: 1 (single-page plan)
 *
 * Run breakdown:
 *   Dishwasher wall / left run   91.5  × 25.5   = 16.20 sf
 *   Sink wall center             72.0  × 25.5   = 12.75 sf
 *   Peninsula                    77.5  × 41.0   = 22.07 sf
 *   Stove wall left              26.5  × 25.5   =  4.69 sf
 *   Stove wall right             24.0  × 25.5   =  4.25 sf
 *   ──────────────────────────────────────────────────────
 *   Countertop total                             = 59.96 sf
 *
 *   Backsplash                  238.0 ×  4.0    =  6.61 sf
 *   ──────────────────────────────────────────────────────
 *   Combined total                               = 66.57 sf
 */

import { makeTakeoffResult, makeTakeoffRoom, makeTakeoffArea, makeTakeoffRun, TAKEOFF_STATUS, TAKEOFF_CONFIDENCE } from "../takeoffContract.mjs";

/**
 * Build the Spec 73 TakeoffResult fixture.
 * IDs are deterministic for reproducible tests.
 * @returns {import('../takeoffContract.mjs').TakeoffResult}
 */
export function buildSpec73Fixture() {
  // ── countertop runs ────────────────────────────────────────────────────────

  const runDishwasherWall = makeTakeoffRun({
    id: "spec73-run-01",
    label: "Dishwasher wall / left run",
    lengthIn: 91.5,
    depthIn: 25.5,
    shape: "rect",
    pieceType: "counter",
    sourcePages: [1],
    notes: ["Left of dishwasher; measured wall-to-wall"]
  });

  const runSinkWall = makeTakeoffRun({
    id: "spec73-run-02",
    label: "Sink wall center",
    lengthIn: 72,
    depthIn: 25.5,
    shape: "rect",
    pieceType: "counter",
    sourcePages: [1],
    notes: ["Center back wall with sink; standard depth"]
  });

  const runPeninsula = makeTakeoffRun({
    id: "spec73-run-03",
    label: "Peninsula",
    lengthIn: 77.5,
    depthIn: 41,
    shape: "rect",
    pieceType: "counter",
    sourcePages: [1],
    notes: ["Non-standard 41\" depth; open end — no backsplash on open side"]
  });

  const runStoveLeft = makeTakeoffRun({
    id: "spec73-run-04",
    label: "Stove wall left",
    lengthIn: 26.5,
    depthIn: 25.5,
    shape: "rect",
    pieceType: "counter",
    sourcePages: [1],
    notes: ["Left of stove opening; stove gap excluded"]
  });

  const runStoveRight = makeTakeoffRun({
    id: "spec73-run-05",
    label: "Stove wall right",
    lengthIn: 24,
    depthIn: 25.5,
    shape: "rect",
    pieceType: "counter",
    sourcePages: [1],
    notes: ["Right of stove opening; stove gap excluded"]
  });

  // ── countertop areas ───────────────────────────────────────────────────────

  // Main U-shape (dishwasher wall + sink wall + peninsula form the U).
  // Corners are handled as non-overlapping rectangles per Elite convention (overlapMode: none).
  const areaMainKitchen = makeTakeoffArea({
    id: "spec73-area-01",
    label: "Main kitchen",
    areaType: "countertop",
    overlapMode: "none",
    backsplashIncluded: true,
    runs: [runDishwasherWall, runSinkWall, runPeninsula],
    cornerDeductions: [],
    assumptions: [
      "U-shape corners treated as non-overlapping rectangles",
      "Peninsula open end has no backsplash",
      "Standard depth 25.5\" except peninsula at 41\""
    ],
    sourcePages: [1]
  });

  // Stove wall — separate area because stove opening breaks the run.
  const areaStoveWall = makeTakeoffArea({
    id: "spec73-area-02",
    label: "Stove wall",
    areaType: "countertop",
    overlapMode: "none",
    backsplashIncluded: true,
    runs: [runStoveLeft, runStoveRight],
    assumptions: ["Stove opening (range) excluded from measurement"],
    sourcePages: [1]
  });

  // ── backsplash area ────────────────────────────────────────────────────────
  // Expressed as total linear inches @ 4" height (not run-by-run).
  // 238" = perimeter excluding peninsula open end and stove opening.
  const areaBacksplash = makeTakeoffArea({
    id: "spec73-area-03",
    label: "4\" backsplash",
    areaType: "backsplash",
    backsplashIncluded: true,
    backsplashLinearIn: 238,
    backsplashHeightIn: 4,
    assumptions: [
      "Peninsula open end excluded from backsplash linear footage",
      "Stove opening excluded from backsplash linear footage"
    ],
    sourcePages: [1],
    aiProvidedSf: 6.61
  });

  // ── room ───────────────────────────────────────────────────────────────────
  const room = makeTakeoffRoom({
    id: "spec73-room-01",
    name: "Kitchen",
    roomType: "Kitchen",
    areas: [areaMainKitchen, areaStoveWall, areaBacksplash],
    confidence: TAKEOFF_CONFIDENCE.HIGH,
    assumptions: [
      "Standard counter depth 25.5\"",
      "Peninsula depth 41\"",
      "No backsplash on open peninsula end",
      "Stove opening excluded from backsplash"
    ],
    sourcePages: [1]
  });

  // ── takeoff result ─────────────────────────────────────────────────────────
  return makeTakeoffResult({
    id: "spec73-fixture-v1",
    status: TAKEOFF_STATUS.REVIEWED,
    confidence: TAKEOFF_CONFIDENCE.HIGH,
    rooms: [room],
    source: {
      fileName: "spec73-kitchen-plan.pdf",
      fileType: "pdf",
      pageCount: 1
    },
    projectAssumptions: [
      "Standard counter depth 25.5\"",
      "Peninsula non-standard depth 41\"",
      "U-shape corner overlaps: non-overlapping rectangle method",
      "Stove opening and open peninsula excluded from backsplash",
      "4\" standard backsplash height"
    ],
    aiProvidedTotals: {
      countertopExactSf: 59.96,
      backsplashExactSf: 6.61,
      combinedExactSf: 66.57
    }
  });
}

/** Expected computed values for the Spec 73 fixture (deterministic reference). */
export const SPEC73_EXPECTED = Object.freeze({
  countertopExactSf: 59.96,
  backsplashExactSf: 6.61,
  combinedExactSf: 66.57,
  chargeableCountertopSf: 60,   // ceiling(59.96) = 60
  chargeableBacksplashSf: 7     // ceiling(6.61)  = 7
});
