/**
 * Per-run backsplash eligibility for Takeoff Review → Estimate Scope → Digital Estimate.
 *
 * Estimator authority: which countertop runs meet a wall/cabinet (eligible).
 * Customer authority (later): No / 4-inch / custom / full-height style.
 * Brain authority: eligible run lengths × customer height → billed SF / price.
 *
 * Legacy drafts stored area-level `backsplashHeightIn` (often `4` on every sibling
 * row). Positive legacy height is only an initial eligibility suggestion — never
 * customer pricing authority.
 */

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function pieceTypeOf(run) {
  if (!run || typeof run !== "object") return "counter";
  if (run.pieceType === "splash" || run.isBacksplash) return "splash";
  if (run.pieceType === "fhb") return "fhb";
  return run.pieceType === "counter" ? "counter" : String(run.pieceType || "counter");
}

function areaForcesNoBacksplash(area) {
  if (!area || typeof area !== "object") return false;
  if (area.backsplashIncluded === false) return true;
  const scope = String(area.backsplashScope ?? "");
  return scope === "no_stone" || scope === "tile_by_others";
}

/**
 * Resolve a single run's eligibility without mutating.
 *
 * @param {object|null|undefined} run
 * @param {object|null|undefined} [area]
 * @returns {{ eligible: boolean, source: string }}
 */
export function resolveRunBacksplashEligible(run, area = null) {
  // Explicit per-run estimator/manual decisions are the physical-scope authority.
  // This check MUST precede legacy area flags: islands commonly carry a stale
  // `backsplashIncluded:false`, and hydration previously used that area hint to
  // reset an estimator-confirmed true on the final run.
  const explicitSource = String(run?.backsplashEligibilitySource || "explicit");
  const estimatorAuthoritative =
    explicitSource === "estimator_confirmed" ||
    explicitSource === "manual" ||
    explicitSource === "previously_saved_manual";
  if (
    typeof run?.backsplashEligible === "boolean" &&
    (estimatorAuthoritative || run.backsplashEligible === false)
  ) {
    return {
      eligible: run.backsplashEligible,
      source: explicitSource
    };
  }

  if (areaForcesNoBacksplash(area)) {
    return { eligible: false, source: "area_excluded" };
  }

  if (typeof run?.backsplashEligible === "boolean") {
    return { eligible: run.backsplashEligible, source: explicitSource };
  }

  const pt = pieceTypeOf(run);
  if (pt === "splash" || pt === "fhb") {
    return { eligible: true, source: "piece_type" };
  }

  const runHeight = Number(run?.backsplashHeightIn);
  if (Number.isFinite(runHeight) && runHeight > 0) {
    return { eligible: true, source: "legacy_height" };
  }

  // Area-level positive height / included+linear is a legacy eligibility hint for
  // counter runs in that area (islands normally live in a separate area with
  // backsplashIncluded=false).
  const areaHeight = Number(area?.backsplashHeightIn ?? area?.backsplashHeight);
  if (Number.isFinite(areaHeight) && areaHeight > 0) {
    return { eligible: true, source: "legacy_height" };
  }
  if (area?.backsplashIncluded === true && (Number(area?.backsplashLinearIn) || 0) > 0) {
    return { eligible: true, source: "legacy_area_included" };
  }

  return { eligible: false, source: "default" };
}

/**
 * Sum approved countertop run lengths marked backsplash-eligible.
 * Splash/fhb piece types contribute their own length (they are splash geometry).
 *
 * @param {object|null|undefined} room
 * @param {{ excludedRunIds?: Iterable<string> }} [opts]
 */
export function sumEligibleBacksplashLengthIn(room, opts = {}) {
  const excluded = new Set([...(opts.excludedRunIds ?? [])].map(String).filter(Boolean));
  let lengthIn = 0;
  let eligibleRunCount = 0;
  let excludedRunCount = 0;
  let totalCounterRuns = 0;

  const visit = (run, area) => {
    if (!run || typeof run !== "object") return;
    const id = String(run.id ?? "").trim();
    if (id && excluded.has(id)) return;
    const pt = pieceTypeOf(run);
    if (pt === "counter") totalCounterRuns += 1;
    const { eligible } = resolveRunBacksplashEligible(run, area);
    if (!eligible) {
      if (pt === "counter") excludedRunCount += 1;
      return;
    }
    const len = Number(run.lengthIn) || 0;
    if (len <= 0) return;
    lengthIn = round2(lengthIn + len);
    eligibleRunCount += 1;
  };

  for (const area of room?.areas ?? []) {
    for (const run of area?.runs ?? []) visit(run, area);
  }
  for (const run of room?.runs ?? []) visit(run, null);
  for (const piece of room?.pieces ?? []) visit(piece, null);

  return {
    eligibleBacksplashLengthIn: lengthIn,
    eligibleRunCount,
    excludedRunCount,
    totalCounterRuns
  };
}

/**
 * Ensure every run carries an explicit boolean `backsplashEligible`.
 * Legacy positive heights become eligibility suggestions; they are not copied
 * forward as per-run height authority for customer pricing.
 *
 * @param {object|null|undefined} takeoff
 * @returns {{ takeoff: object|null|undefined, changed: boolean }}
 */
export function normalizeTakeoffBacksplashEligibility(takeoff) {
  if (!takeoff || typeof takeoff !== "object" || !Array.isArray(takeoff.rooms)) {
    return { takeoff, changed: false };
  }

  let changed = false;
  const base = structuredClone(takeoff);

  const normalizeRun = (run, area) => {
    if (!run || typeof run !== "object") return run;
    const hadExplicit = typeof run.backsplashEligible === "boolean";
    const resolved = resolveRunBacksplashEligible(run, area);
    if (!hadExplicit) {
      run.backsplashEligible = resolved.eligible;
      if (!run.backsplashEligibilitySource) {
        run.backsplashEligibilitySource =
          resolved.source === "default" ? "default" : resolved.source;
      }
      changed = true;
    }
    return run;
  };

  for (const room of base.rooms) {
    if (!room || typeof room !== "object") continue;
    if (Array.isArray(room.runs)) {
      room.runs = room.runs.map((r) => normalizeRun(r, null));
    }
    if (Array.isArray(room.pieces)) {
      room.pieces = room.pieces.map((r) => normalizeRun(r, null));
    }
    if (Array.isArray(room.areas)) {
      room.areas = room.areas.map((area) => {
        if (!area || typeof area !== "object") return area;
        const runs = (area.runs ?? []).map((r) => normalizeRun(r, area));
        // Keep area.backsplashLinearIn aligned with eligible counter lengths when
        // any run carries eligibility — preferred geometry authority for legacy
        // calc paths that still read area-level linear inches.
        const eligibleLen = runs
          .filter((r) => r?.backsplashEligible === true && pieceTypeOf(r) === "counter")
          .reduce((s, r) => s + (Number(r.lengthIn) || 0), 0);
        const nextLinear = round2(eligibleLen);
        const prevLinear = Number(area.backsplashLinearIn) || 0;
        if (runs.some((r) => typeof r?.backsplashEligible === "boolean") && nextLinear !== prevLinear) {
          area = { ...area, runs, backsplashLinearIn: nextLinear };
          if (nextLinear > 0 && area.backsplashIncluded === false) {
            // An explicit estimator-confirmed run decision outranks a stale area
            // exclusion. Align the area aggregate so later legacy readers cannot
            // reinterpret the run on hydration.
            const hasConfirmedEligibleRun = runs.some(
              (r) =>
                r?.backsplashEligible === true &&
                r?.backsplashEligibilitySource === "estimator_confirmed"
            );
            if (hasConfirmedEligibleRun) {
              area = { ...area, backsplashIncluded: true };
            }
          } else if (nextLinear > 0 && area.backsplashIncluded == null) {
            area = { ...area, backsplashIncluded: true };
          }
          changed = true;
          return area;
        }
        return { ...area, runs };
      });
    }
  }

  return { takeoff: changed ? base : takeoff, changed };
}

/**
 * Provisional worksheet SF preview: eligible run lengths × standard 4".
 * Not customer pricing authority — summary only.
 *
 * @param {Array<{ backsplashEligible?: boolean, lengthIn?: number, included?: boolean }>} rows
 */
export function provisionalEligibleBacksplashSf(rows) {
  let sf = 0;
  for (const row of rows ?? []) {
    if (row?.included === false) continue;
    if (row?.backsplashEligible !== true) continue;
    const l = Number(row.lengthIn) || 0;
    if (l <= 0) continue;
    sf += (l * 4) / 144;
  }
  return round2(sf);
}
