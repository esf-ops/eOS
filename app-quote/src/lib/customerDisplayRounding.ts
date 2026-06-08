/**
 * Customer-facing Estimate Summary display rounding helpers.
 *
 * Intentionally zero-dependency: no React, no app imports, no config, no side effects.
 * Keeping this isolated prevents circular-import / TDZ issues that arise when rounding
 * helpers are co-located with large shared modules (e.g. prototypeQuoteMath.ts).
 *
 * Rule: each positive customer Estimate Summary row (countertop material, backsplash
 * material, add-ons, customer-facing custom lines) rounds UP to the next $5 (ceiling).
 * Negative amounts (Discount / Credit reductions) are preserved exactly — we never
 * reduce a credit benefit via rounding.
 * The customer-facing Estimated project total = sum of those displayed rows.
 */

/**
 * Round a project-level customer estimate row amount UP to the next $5 (ceiling).
 * - Positive amounts: ceil to next $5 (e.g. $342 → $345, $3,531.15 → $3,535, $200 → $200).
 * - Negative amounts (credits): returned exactly — never rounds down a credit.
 * - Zero or non-finite: returns 0.
 */
export function roundCustomerDisplay(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n < 0) return n; // Discount / Credit: preserve exact reduction, never penalize customer
  return Math.ceil(n / 5) * 5;
}
