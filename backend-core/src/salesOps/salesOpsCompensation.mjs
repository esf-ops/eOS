/**
 * Compensation configuration is separate from performance targets.
 * Proposal values are never silently finally approved.
 */

export const COMPENSATION_BASES = Object.freeze([
  "all_completed_sf",
  "incremental_above_baseline",
  "manual_exception"
]);

export const COMMISSION_REPORT_STATUSES = Object.freeze([
  "DRAFT",
  "PREPARED",
  "REVIEWED",
  "APPROVED",
  "READY_FOR_PAYMENT",
  "PAID",
  "ADJUSTED"
]);

export const LOCKED_COMMISSION_REPORT_STATUSES = Object.freeze(["APPROVED", "READY_FOR_PAYMENT", "PAID"]);

export function isCompensationFinallyApproved(row) {
  return Boolean(row?.finallyApproved) && String(row?.status) === "approved";
}

export function isCommissionReportLocked(status) {
  return LOCKED_COMMISSION_REPORT_STATUSES.includes(String(status || ""));
}

export function assignmentCoversDate(row, asOf) {
  const day = String(asOf || "").slice(0, 10);
  if (!day) return false;
  const from = row?.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : null;
  const to = row?.effectiveTo ? String(row.effectiveTo).slice(0, 10) : null;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Operational credited SF may exist for non-commissionable accounts.
 * Payable SF requires explicit eligibility covering the qualifying date,
 * and must not predate the compensation effective date.
 */
export function payableCommissionSf(facts, { eligibleAccountIds = null, effectiveDate = null, proposalFinallyApproved = false } = {}) {
  if (!proposalFinallyApproved) return null;
  const allow = eligibleAccountIds instanceof Set ? eligibleAccountIds : null;
  const effective = effectiveDate ? String(effectiveDate).slice(0, 10) : null;
  let total = 0;
  let known = 0;
  for (const fact of facts || []) {
    if (String(fact.status || "credited") === "reversed" && fact.creditedSf == null) continue;
    if (fact.commissionEligible !== true) continue;
    const ad = String(fact.accountDirectoryAccountId || "").trim();
    if (allow && !allow.has(ad)) continue;
    const q = String(fact.qualifyingDate || "").slice(0, 10);
    if (effective && q && q < effective) continue;
    const n = Number(fact.creditedSf);
    if (!Number.isFinite(n)) continue;
    total += n;
    known += 1;
  }
  if (!known) return 0;
  return Math.round(total * 100) / 100;
}

export function dtoCompensationProposal(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId ?? null,
    status: row.status || "proposal",
    baseSalary: row.baseSalary == null ? null : Number(row.baseSalary),
    ratePerSf: row.ratePerSf == null ? null : Number(row.ratePerSf),
    effectiveDate: row.effectiveDate ?? null,
    basis: COMPENSATION_BASES.includes(row.basis) ? row.basis : "all_completed_sf",
    finallyApproved: isCompensationFinallyApproved(row),
    notes: row.notes ?? null
  };
}
