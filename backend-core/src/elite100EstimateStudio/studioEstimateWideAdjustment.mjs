/**
 * Estimate-wide percentage adjustment — server authority.
 * Distributed across eligible customer-impact lines (same factor, not equal dollars).
 * Spahn trusted-account 3% consolidates into this path (no double application).
 */
import {
  SPAHN_ESTIMATE_ADJUSTMENT_PERCENT,
  isSpahnTrustedPartner,
  readTrustedPartnerAccountConfig
} from "./studioEstimateTrustedAccounts.mjs";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toCents(n) {
  return Math.round((Number(n) || 0) * 100);
}

function fromCents(c) {
  return round2(c / 100);
}

/**
 * @param {object|null|undefined} raw
 */
export function normalizeEstimateWideAdjustment(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      active: false,
      percentage: 0,
      reason: "",
      source: "manual",
      presentation: "distributed"
    };
  }
  let percentage = Number(raw.percentage);
  if (!Number.isFinite(percentage)) percentage = 0;
  percentage = Math.min(100, Math.max(0, round2(percentage)));
  const source = String(raw.source || "manual").trim() === "trusted_account_rule"
    ? "trusted_account_rule"
    : "manual";
  return {
    active: raw.active === true && percentage > 0,
    percentage,
    reason: String(raw.reason || "").trim(),
    source,
    presentation: "distributed",
    updatedAt: raw.updatedAt || null,
    updatedByUserId: raw.updatedByUserId || null
  };
}

/**
 * Resolve effective adjustment: Spahn auto-proposes 3% when trusted and no
 * conflicting manual adjustment is already active at a different percent.
 * @param {{
 *   scopeAdjustment?: object|null,
 *   partnerAccountId?: string|null,
 *   env?: NodeJS.ProcessEnv
 * }} args
 */
export function resolveEffectiveEstimateWideAdjustment(args = {}) {
  const manual = normalizeEstimateWideAdjustment(args.scopeAdjustment);
  const cfg = readTrustedPartnerAccountConfig(args.env);
  const spahnTrusted = isSpahnTrustedPartner(args.partnerAccountId, cfg);

  if (manual.active) {
    if (
      spahnTrusted &&
      manual.source === "manual" &&
      Math.abs(manual.percentage - SPAHN_ESTIMATE_ADJUSTMENT_PERCENT) < 0.001
    ) {
      // Same 3% — treat as trusted rule (no stack).
      return {
        ...manual,
        source: "trusted_account_rule",
        reason: manual.reason || "Spahn & Rose account pricing",
        spahnTrusted: true,
        rejectedDuplicate: false
      };
    }
    return { ...manual, spahnTrusted, rejectedDuplicate: false };
  }

  if (spahnTrusted) {
    return {
      active: true,
      percentage: SPAHN_ESTIMATE_ADJUSTMENT_PERCENT,
      reason: "Spahn & Rose account pricing",
      source: "trusted_account_rule",
      presentation: "distributed",
      updatedAt: null,
      updatedByUserId: null,
      spahnTrusted: true,
      rejectedDuplicate: false
    };
  }

  return { ...manual, spahnTrusted: false, rejectedDuplicate: false };
}

/**
 * Apply percentage to eligible exact line amounts using integer cents.
 * Returns adjusted lines + reconciliation. Does not invent lines.
 *
 * @param {{
 *   lines: Array<{ id: string, amountExact: number, percentageEligible?: boolean }>,
 *   percentage: number
 * }} args
 */
export function distributeEstimateWideAdjustment(args = {}) {
  const percentage = Math.min(100, Math.max(0, Number(args.percentage) || 0));
  const factor = 1 + percentage / 100;
  const lines = Array.isArray(args.lines) ? args.lines : [];
  const eligible = lines.filter((l) => l && l.percentageEligible !== false);
  const ineligible = lines.filter((l) => l && l.percentageEligible === false);

  const baseExactTotal = fromCents(
    lines.reduce((s, l) => s + toCents(l.amountExact), 0)
  );
  const eligibleBaseExact = fromCents(
    eligible.reduce((s, l) => s + toCents(l.amountExact), 0)
  );

  /** @type {Array<{ id: string, baseExact: number, exactAdjustment: number, adjustedExact: number, percentageEligible: boolean }>} */
  const adjusted = [];
  let adjustedEligibleCents = 0;
  for (const line of eligible) {
    const baseCents = toCents(line.amountExact);
    const adjCents = Math.round(baseCents * factor);
    const delta = adjCents - baseCents;
    adjustedEligibleCents += adjCents;
    adjusted.push({
      id: String(line.id),
      baseExact: fromCents(baseCents),
      exactAdjustment: fromCents(delta),
      adjustedExact: fromCents(adjCents),
      percentageEligible: true
    });
  }
  for (const line of ineligible) {
    const baseCents = toCents(line.amountExact);
    adjusted.push({
      id: String(line.id),
      baseExact: fromCents(baseCents),
      exactAdjustment: 0,
      adjustedExact: fromCents(baseCents),
      percentageEligible: false
    });
  }

  // Deterministic sub-cent reconcile: target = round2(eligibleBase * factor) in cents
  const targetEligibleCents = Math.round(toCents(eligibleBaseExact) * factor);
  let drift = targetEligibleCents - adjustedEligibleCents;
  if (drift !== 0 && adjusted.length) {
    // Prefer stable sort by id; apply ±1¢ to largest magnitude eligible lines.
    const eligibleAdj = adjusted
      .filter((a) => a.percentageEligible)
      .sort((a, b) => {
        const mag = Math.abs(toCents(b.baseExact)) - Math.abs(toCents(a.baseExact));
        if (mag !== 0) return mag;
        return String(a.id).localeCompare(String(b.id));
      });
    let i = 0;
    while (drift !== 0 && eligibleAdj.length) {
      const row = eligibleAdj[i % eligibleAdj.length];
      const step = drift > 0 ? 1 : -1;
      row.adjustedExact = fromCents(toCents(row.adjustedExact) + step);
      row.exactAdjustment = fromCents(toCents(row.exactAdjustment) + step);
      drift -= step;
      i += 1;
      if (i > eligibleAdj.length * 20) break;
    }
  }

  const exactAdjustment = fromCents(
    adjusted.reduce((s, a) => s + toCents(a.exactAdjustment), 0)
  );
  const adjustedExactTotal = fromCents(
    adjusted.reduce((s, a) => s + toCents(a.adjustedExact), 0)
  );

  return {
    percentage,
    factor,
    baseExactTotal,
    eligibleBaseExact,
    exactAdjustment,
    adjustedExactTotal,
    eligibleLineIds: eligible.map((l) => String(l.id)),
    excludedLineIds: ineligible.map((l) => String(l.id)),
    lines: adjusted
  };
}

/**
 * Compute the lump-sum adjustment amount that matches distribute on a single
 * total (used by calculator totals when line list is not yet available).
 */
export function computeEstimateWideAdjustmentAmount(preAdjustmentExact, percentage) {
  const pct = Math.min(100, Math.max(0, Number(percentage) || 0));
  if (pct <= 0) return 0;
  return round2((Number(preAdjustmentExact) || 0) * (pct / 100));
}
