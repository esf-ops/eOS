/**
 * eliteOS AI Takeoff — deterministic measurement calculator.
 *
 * Pure function: takes a TakeoffResult, recomputes all square-footage from raw dimensions.
 * Does NOT use AI-provided totals for computation — those are stored separately for audit.
 * Does NOT import pricing logic. Does NOT call any API or perform I/O.
 *
 * Math mirrors app-quote/src/lib/measurementEngine.ts:
 *   - Rectangle sf = (lengthIn × depthIn) / 144
 *   - Triangle sf = (lengthIn × depthIn) / 144 / 2
 *   - Corner overlap deduction = depthA × depthB / 144 (for L=1, U=2 corners)
 *   - Chargeable ceiling: round exact SF up to next whole integer
 *     (except when already a whole number within 0.005 tolerance)
 */

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute sf for a single run (rectangle or triangle).
 * @param {number} lengthIn
 * @param {number} depthIn
 * @param {"rect"|"tri"} [shape]
 * @returns {number}
 */
export function sfFromRun(lengthIn, depthIn, shape = "rect") {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  const raw = (l * d) / 144;
  return round2(shape === "tri" ? raw / 2 : raw);
}

/**
 * Elite rule: round exact SF up to next whole square foot.
 * Exact whole numbers (within 0.005) are not bumped.
 * @param {number} exactSf
 * @returns {number}
 */
export function chargeableSfFromExact(exactSf) {
  const ex = round2(exactSf);
  if (ex <= 0) return 0;
  const whole = Math.round(ex);
  if (Math.abs(ex - whole) < 0.005) return whole;
  return Math.ceil(ex);
}

/**
 * Corner overlap deduction for a single 90° joint (depth_a × depth_b / 144).
 * @param {number} depthA_in
 * @param {number} depthB_in
 * @returns {number}
 */
export function cornerOverlapSf(depthA_in, depthB_in) {
  const a = Number(depthA_in) || 0;
  const b = Number(depthB_in) || 0;
  if (a <= 0 || b <= 0) return 0;
  return round2((a * b) / 144);
}

/**
 * Sum run sf for an area, apply any explicit corner deductions, return per-area totals.
 *
 * @param {import('./takeoffContract.mjs').TakeoffArea} area
 * @returns {{ countertopSf: number, backsplashSf: number, fhbSf: number, totalSf: number, overlapDeductionSf: number, runBreakdown: Array<{runId:string,label:string,sfExact:number,pieceType:string}> }}
 */
export function computeAreaSf(area) {
  let countertopSf = 0;
  let backsplashSf = 0;
  let fhbSf = 0;
  let overlapDeductionSf = 0;
  const runBreakdown = [];

  for (const run of (area.runs ?? [])) {
    const sf = sfFromRun(run.lengthIn, run.depthIn, run.shape);
    const pieceType = run.pieceType ?? (run.isBacksplash ? "splash" : "counter");
    runBreakdown.push({ runId: run.id, label: run.label, sfExact: sf, pieceType });
    if (pieceType === "counter") countertopSf = round2(countertopSf + sf);
    else if (pieceType === "fhb") fhbSf = round2(fhbSf + sf);
    else backsplashSf = round2(backsplashSf + sf);
  }

  // Apply explicit corner deductions (from the schema's cornerDeductions array).
  for (const cd of (area.cornerDeductions ?? [])) {
    const deduction = cd.sfDeducted != null
      ? round2(Number(cd.sfDeducted))
      : cornerOverlapSf(cd.depthA_in, cd.depthB_in);
    overlapDeductionSf = round2(overlapDeductionSf + deduction);
  }
  countertopSf = round2(Math.max(0, countertopSf - overlapDeductionSf));

  // Backsplash scope + manual sf support (v6.3).
  // Priority order:
  //   1. "no_stone" / "tile_by_others" scope — estimator confirmed no stone BS, zero regardless.
  //   2. backsplashManualSf > 0 — direct sf entry, overrides linear×height.
  //   3. backsplashLinearIn > 0 — area-level linear inches × height (legacy + normal flow).
  //   4. Splash runs already accumulated from area.runs above (backsplashSf already set).
  if (area.backsplashScope === "no_stone" || area.backsplashScope === "tile_by_others") {
    backsplashSf = 0;
  } else if ((area.backsplashManualSf ?? 0) > 0) {
    backsplashSf = round2(Number(area.backsplashManualSf));
  } else if ((area.backsplashLinearIn ?? 0) > 0 && backsplashSf === 0) {
    const heightIn = area.backsplashHeightIn ?? 4;
    backsplashSf = round2(sfFromRun(area.backsplashLinearIn, heightIn));
  }

  const totalSf = round2(countertopSf + backsplashSf + fhbSf);
  return { countertopSf, backsplashSf, fhbSf, totalSf, overlapDeductionSf, runBreakdown };
}

/**
 * Compute per-room totals from all its areas.
 *
 * @param {import('./takeoffContract.mjs').TakeoffRoom} room
 * @returns {{ roomId: string, roomName: string, countertopSf: number, backsplashSf: number, fhbSf: number, totalSf: number, areaBreakdown: Array<{areaId:string,label:string,countertopSf:number,backsplashSf:number,fhbSf:number,totalSf:number}> }}
 */
export function computeRoomSf(room) {
  let countertopSf = 0;
  let backsplashSf = 0;
  let fhbSf = 0;
  const areaBreakdown = [];

  for (const area of (room.areas ?? [])) {
    const a = computeAreaSf(area);
    countertopSf = round2(countertopSf + a.countertopSf);
    backsplashSf = round2(backsplashSf + a.backsplashSf);
    fhbSf = round2(fhbSf + a.fhbSf);
    areaBreakdown.push({
      areaId: area.id,
      label: area.label,
      countertopSf: a.countertopSf,
      backsplashSf: a.backsplashSf,
      fhbSf: a.fhbSf,
      totalSf: a.totalSf
    });
  }

  return {
    roomId: room.id,
    roomName: room.name,
    countertopSf,
    backsplashSf,
    fhbSf,
    totalSf: round2(countertopSf + backsplashSf + fhbSf),
    areaBreakdown
  };
}

/**
 * Top-level deterministic measurement computation for a full TakeoffResult.
 * Returns project-level totals, per-room breakdown, and chargeable (ceiling) sf.
 *
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult
 * @returns {TakeoffComputedMeasurements}
 *
 * @typedef {Object} TakeoffComputedMeasurements
 * @property {number} countertopExactSf
 * @property {number} backsplashExactSf
 * @property {number} fhbExactSf
 * @property {number} combinedExactSf
 * @property {number} chargeableCountertopSf  Ceiling-rounded per Elite rule
 * @property {number} chargeableBacksplashSf  Ceiling-rounded per Elite rule
 * @property {Array<{roomId:string,roomName:string,countertopSf:number,backsplashSf:number,fhbSf:number,totalSf:number,areaBreakdown:Array}>} roomBreakdown
 */
export function computeTakeoffMeasurements(takeoffResult) {
  let countertopExactSf = 0;
  let backsplashExactSf = 0;
  let fhbExactSf = 0;
  const roomBreakdown = [];

  for (const room of (takeoffResult.rooms ?? [])) {
    const r = computeRoomSf(room);
    countertopExactSf = round2(countertopExactSf + r.countertopSf);
    backsplashExactSf = round2(backsplashExactSf + r.backsplashSf);
    fhbExactSf = round2(fhbExactSf + r.fhbSf);
    roomBreakdown.push(r);
  }

  const combinedExactSf = round2(countertopExactSf + backsplashExactSf + fhbExactSf);

  return {
    countertopExactSf,
    backsplashExactSf,
    fhbExactSf,
    combinedExactSf,
    chargeableCountertopSf: chargeableSfFromExact(countertopExactSf),
    chargeableBacksplashSf: chargeableSfFromExact(backsplashExactSf),
    roomBreakdown
  };
}
