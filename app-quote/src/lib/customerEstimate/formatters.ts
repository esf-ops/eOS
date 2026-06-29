/** Format a pre-rounded customer display dollar amount (no re-rounding). Positive only. */
export function formatDisplayDollars(displayAmount: number): string {
  return `$${Math.max(0, Math.round(displayAmount)).toLocaleString()}`;
}

/**
 * Format a customer display dollar amount that may be negative (e.g. Discount / Credit).
 * Negative amounts display as -$N; positive as $N; zero as $0.
 */
export function formatDisplayAmount(displayAmount: number): string {
  const n = Math.round(displayAmount);
  if (n < 0) return `-$${Math.abs(n).toLocaleString()}`;
  return `$${Math.max(0, n).toLocaleString()}`;
}
