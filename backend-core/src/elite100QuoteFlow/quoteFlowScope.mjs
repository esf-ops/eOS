/**
 * Official scope detection shared by Inbox (1B) and Set Scope (1C).
 */

import { deriveScopeReadiness } from "../elite100EstimateStudio/studioSimplifiedWorkflow.mjs";

/**
 * Official scope already set → AI Takeoff must not rerun; Set Scope is idempotent.
 * @param {object|null|undefined} estimate
 */
export function isOfficialScopeSet(estimate) {
  if (!estimate) return false;
  const status = String(estimate.status || "").toLowerCase();
  if (["ready_to_price", "priced", "approved"].includes(status)) return true;
  try {
    if (deriveScopeReadiness(estimate).ready === true) return true;
  } catch {
    /* ignore */
  }
  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  return rooms.some((r) => {
    if (!r || r.included === false) return false;
    const pieces = Array.isArray(r.pieces) ? r.pieces : [];
    return pieces.some((p) => p && p.excluded !== true && p.include !== false);
  });
}
