/**
 * Account 360 / Overview copy for QuickBooks financial availability.
 * Linked vs unlinked must never be confused.
 */

export function customerFinancialsEmptyCopy({ linked = false, status = null } = {}) {
  if (status === "unlinked" || linked === false) {
    return "Connect QuickBooks to view financial history.";
  }
  if (status === "ok" || status === "stale") {
    return "No staged financial activity is available for this QuickBooks customer.";
  }
  return "QuickBooks is connected, but financial data is currently unavailable.";
}
