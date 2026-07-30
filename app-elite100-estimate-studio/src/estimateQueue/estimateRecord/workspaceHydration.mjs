/**
 * Hydration policy for the one stable local edit buffer.
 *
 * Server responses arrive constantly (calculate, publication polling, revision
 * history). They update authoritative totals only. The editable form is
 * rebuilt exactly when:
 *
 *  - the page first loads;
 *  - the active editable revision id genuinely changes;
 *  - the server introduced structural objects the local buffer could not have
 *    invented (a Takeoff waterfall, a governed Vanity program row) AND the
 *    newest local payload is already acknowledged.
 *
 * Totals, breakdowns, warnings, publication status, and customer activity never
 * appear in this signature, so they can never rebuild the form.
 */

function ids(list, pick) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => String(pick(entry) || "").trim())
    .filter(Boolean)
    .sort();
}

/**
 * Identity-only fingerprint of server-owned structural scope.
 * @param {Record<string, unknown>|null|undefined} commercial
 * @returns {string}
 */
export function structuralScopeSignature(commercial) {
  if (!commercial || typeof commercial !== "object") return "";
  const c = /** @type {Record<string, any>} */ (commercial);
  const waterfalls = ids(c.waterfalls, (w) => w?.id || `${w?.pieceId || ""}:${w?.side || ""}`);
  const vanity = ids(c.vanityPrograms, (v) => v?.roomId || v?.id);
  const lines = ids(c.customLines, (l) => l?.id);
  return [
    `wf:${waterfalls.join(",")}`,
    `vn:${vanity.join(",")}`,
    `cl:${lines.join(",")}`
  ].join("|");
}

/**
 * @param {{
 *   previousEstimateId?: string|null,
 *   nextEstimateId?: string|null,
 *   previousSignature?: string,
 *   nextSignature?: string,
 *   hasPendingLocalEdits?: boolean,
 *   firstLoad?: boolean
 * }} input
 * @returns {{ rehydrate: boolean, reason: string }}
 */
export function decideBufferHydration(input = {}) {
  if (input.firstLoad === true) return { rehydrate: true, reason: "first_load" };
  const prevId = String(input.previousEstimateId || "");
  const nextId = String(input.nextEstimateId || "");
  if (nextId && prevId !== nextId) {
    return { rehydrate: true, reason: "active_revision_changed" };
  }
  // Never overwrite input the estimator has not had persisted yet.
  if (input.hasPendingLocalEdits === true) {
    return { rehydrate: false, reason: "pending_local_edits" };
  }
  if (String(input.previousSignature || "") !== String(input.nextSignature || "")) {
    return { rehydrate: true, reason: "server_structural_change" };
  }
  return { rehydrate: false, reason: "totals_only" };
}
