/**
 * DE.2C — deterministic money helpers (integer cents + basis points).
 * Official totals never accumulate via binary floating-point.
 */

/** Round half away-from-zero to nearest integer (banker's not used — matches commercial cents). */
export function roundHalfUpInteger(n) {
  if (!Number.isFinite(n)) throw new Error("non-finite money intermediate");
  return n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5);
}

/** Dollars (number or string) → integer cents. Rejects non-finite. */
export function dollarsToCents(dollars) {
  if (typeof dollars === "string") dollars = Number(dollars);
  if (!Number.isFinite(dollars)) throw new Error("invalid dollars");
  return roundHalfUpInteger(dollars * 100);
}

export function centsToDollars(cents) {
  if (!Number.isInteger(cents)) throw new Error("cents must be integer");
  return cents / 100;
}

/** SF → milli-SF (3 decimal places). */
export function sfToMilli(sf) {
  if (!Number.isFinite(sf) || sf < 0) throw new Error("invalid sf");
  return roundHalfUpInteger(sf * 1000);
}

/**
 * Line extension: rateCents/SF × milliSF → cents.
 * (rateCents * milliSF) / 1000, half-up.
 */
export function mulRateCentsByMilliSf(rateCents, milliSf) {
  if (!Number.isInteger(rateCents) || !Number.isInteger(milliSf)) {
    throw new Error("rate/milliSf must be integers");
  }
  if (rateCents < 0 || milliSf < 0) throw new Error("negative rate or sf");
  return roundHalfUpInteger((rateCents * milliSf) / 1000);
}

/**
 * Apply basis points to a cents amount → cents.
 * bps 200 = 2%, 300 = 3%, 1000 = 10%.
 */
export function applyBasisPointsToCents(cents, bps) {
  if (!Number.isInteger(cents) || !Number.isInteger(bps)) {
    throw new Error("cents/bps must be integers");
  }
  if (bps < 0) throw new Error("negative basis points");
  return roundHalfUpInteger((cents * bps) / 10000);
}

/**
 * Ceiling to next multiple of $10 (1000 cents).
 * Exact multiples of $10 stay unchanged.
 */
export function ceilCentsToTenDollars(cents) {
  if (!Number.isInteger(cents)) throw new Error("cents must be integer");
  if (cents < 0) throw new Error("negative total not authorized");
  if (cents === 0) return 0;
  const step = 1000;
  return Math.ceil(cents / step) * step;
}

export function assertFiniteCents(cents, label = "amount") {
  if (!Number.isInteger(cents) || !Number.isFinite(cents)) {
    throw new Error(`invalid ${label}`);
  }
  if (Number.isNaN(cents) || cents === Infinity || cents === -Infinity) {
    throw new Error(`non-finite ${label}`);
  }
}
