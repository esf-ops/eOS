/**
 * Customer-facing Estimate Summary display rounding helpers.
 *
 * Intentionally zero-dependency: no React, no app imports, no config, no side effects.
 * Keeping this isolated prevents circular-import / TDZ issues that arise when rounding
 * helpers are co-located with large shared modules (e.g. prototypeQuoteMath.ts).
 *
 * Rule: each visible customer Estimate Summary row (countertop material, backsplash
 * material, add-ons, customer-facing custom lines) rounds up independently to the
 * nearest $10.  The customer-facing Estimated project total = sum of those rounded rows.
 */

/**
 * Round a project-level customer estimate row amount up to the nearest $10.
 * Returns 0 for zero, negative, or non-finite inputs.
 */
export function roundCustomerDisplay(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}
