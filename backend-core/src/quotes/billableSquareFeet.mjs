/**
 * Authoritative billable square-footage ceiling for Elite estimating.
 *
 * Every independently priced SF section must round upward to the next whole
 * square foot before pricing. Do not ceil the combined room/project total.
 *
 * Shared by Internal Estimate, Studio, Digital Estimate, and print paths.
 */

/**
 * @param {unknown} rawSf measured / exact section square feet
 * @returns {number} whole-number billable SF (>= 0)
 */
export function ceilBillableSquareFeet(rawSf) {
  const n = Number(rawSf);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Pure commercial ceiling — 10.0→10, 10.1→11 (not banker's / half-up).
  return Math.ceil(n);
}

/**
 * Sum of independently ceiled SF sections (never ceil-after-sum).
 * @param {Iterable<unknown>|unknown[]} sections
 * @returns {number}
 */
export function sumBillableSquareFeetSections(sections) {
  let total = 0;
  for (const raw of sections || []) {
    total += ceilBillableSquareFeet(raw);
  }
  return total;
}

/**
 * Derive billable SF for a Studio/IE room from pieces when present,
 * otherwise the room-level countertop SF.
 * Each included piece is an independently priced section.
 *
 * @param {{
 *   countertopSqft?: unknown,
 *   pieces?: Array<{ included?: boolean, sqft?: unknown }>|null
 * }} room
 * @returns {{ rawSf: number, billableSf: number, sections: Array<{ key: string, rawSf: number, billableSf: number }> }}
 */
export function billableCountertopFromRoom(room) {
  const pieces = Array.isArray(room?.pieces)
    ? room.pieces.filter((p) => p && p.included !== false)
    : [];
  const sections = [];
  if (pieces.length > 0) {
    for (const p of pieces) {
      const rawSf = Math.max(0, Number(p.sqft) || 0);
      const billableSf = ceilBillableSquareFeet(rawSf);
      sections.push({
        key: String(p.id || p.name || `piece-${sections.length}`),
        rawSf,
        billableSf
      });
    }
  } else {
    const rawSf = Math.max(0, Number(room?.countertopSqft) || 0);
    sections.push({
      key: "countertop",
      rawSf,
      billableSf: ceilBillableSquareFeet(rawSf)
    });
  }
  const rawSf = sections.reduce((s, x) => s + x.rawSf, 0);
  const billableSf = sections.reduce((s, x) => s + x.billableSf, 0);
  return { rawSf, billableSf, sections };
}

/**
 * Backsplash section billing — room-level splash SF is one priced section unless
 * explicitly split. Height modes do not invent SF; they use estimator geometry.
 *
 * @param {{
 *   includeBacksplash?: boolean,
 *   backsplashSqft?: unknown,
 *   backsplashSections?: Array<{ included?: boolean, sqft?: unknown, id?: unknown, name?: unknown }>|null
 * }} room
 */
export function billableBacksplashFromRoom(room) {
  if (room?.includeBacksplash === false) {
    return { rawSf: 0, billableSf: 0, sections: [] };
  }
  const explicit = Array.isArray(room?.backsplashSections)
    ? room.backsplashSections.filter((s) => s && s.included !== false)
    : [];
  const sections = [];
  if (explicit.length > 0) {
    for (const s of explicit) {
      const rawSf = Math.max(0, Number(s.sqft) || 0);
      sections.push({
        key: String(s.id || s.name || `splash-${sections.length}`),
        rawSf,
        billableSf: ceilBillableSquareFeet(rawSf)
      });
    }
  } else {
    const rawSf = Math.max(0, Number(room?.backsplashSqft) || 0);
    if (rawSf > 0) {
      sections.push({
        key: "backsplash",
        rawSf,
        billableSf: ceilBillableSquareFeet(rawSf)
      });
    }
  }
  const rawSf = sections.reduce((s, x) => s + x.rawSf, 0);
  const billableSf = sections.reduce((s, x) => s + x.billableSf, 0);
  return { rawSf, billableSf, sections };
}
