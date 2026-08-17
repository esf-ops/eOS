/**
 * Account 360 Connections workspace helpers.
 * Name search is discovery only. Permanent identity stays exact external IDs.
 */

export const QB_CUSTOMER_SEARCH_MIN_QUERY = 2;
export const QB_CUSTOMER_SEARCH_DEBOUNCE_MS = 300;
export const STALE_QB_FACT_COPY = "Linked identity — current QuickBooks customer details unavailable";
export const MULTIPLE_QB_NOTICE = "Multiple QuickBooks connections";
export const QB_DISCONNECT_TITLE = "Disconnect QuickBooks?";
export const QB_DISCONNECT_BODY =
  "This removes the Account Directory connection only. It does not modify QuickBooks.";
export const MW_DISCONNECT_TITLE = "Disconnect Moraware?";
export const MW_DISCONNECT_BODY =
  "This removes the Account Directory connection only. It does not modify Moraware.";

/**
 * @param {unknown} err
 */
export function isAbortError(err) {
  if (!err || typeof err !== "object") return false;
  const name = String(/** @type {{ name?: string }} */ (err).name || "");
  const message = String(/** @type {{ message?: string }} */ (err).message || "");
  return name === "AbortError" || /aborted|AbortError/i.test(message);
}

/**
 * @param {unknown} err
 */
export function safeIdentityErrorMessage(err) {
  if (!err || typeof err !== "object") return "The connection could not be updated.";
  const rec = /** @type {{ status?: number, code?: string, message?: string, body?: { code?: string, error?: string } }} */ (
    err
  );
  const code = String(rec.body?.code || rec.code || "");
  const status = Number(rec.status || 0);
  if (status === 403 || code === "forbidden") {
    return "You do not have permission to change this connection.";
  }
  if (code === "duplicate_external_id") {
    return "That identity is already linked to another Account Directory account.";
  }
  if (code === "qb_customer_not_found") {
    return "That QuickBooks customer is not available in trusted staged data.";
  }
  if (code === "qb_job_not_linkable") {
    return "Jobs and subcustomers cannot be linked as the QuickBooks customer identity.";
  }
  if (code === "qb_facts_unavailable") {
    return "Trusted QuickBooks customer data is unavailable. Try again later.";
  }
  if (code === "external_system_mismatch") {
    return "That connection could not be updated.";
  }
  const message = String(rec.body?.error || rec.message || "").trim();
  if (
    message &&
    message.length < 220 &&
    !/raw_payload|rawPayload|stack|sql|supabase|service.role/i.test(message)
  ) {
    return message;
  }
  return "The connection could not be updated.";
}

/**
 * @param {Array<{ system?: string, externalSystem?: string, isActive?: boolean }>} links
 */
export function partitionConnectionLinks(links) {
  const rows = Array.isArray(links) ? links.filter((l) => l && l.isActive !== false) : [];
  const qb = [];
  const moraware = [];
  const other = [];
  for (const link of rows) {
    const system = String(link.externalSystem || link.system || "").toLowerCase();
    if (system.includes("quickbooks")) qb.push(link);
    else if (system === "moraware") moraware.push(link);
    else other.push(link);
  }
  return { qb, moraware, other };
}

/**
 * @param {{ qbTrusted?: { available?: boolean, displayName?: string|null }, externalDisplayName?: string|null, system?: string }} link
 */
export function qbConnectionDisplayName(link) {
  if (link?.qbTrusted && link.qbTrusted.available === false) return STALE_QB_FACT_COPY;
  const trusted = String(link?.qbTrusted?.displayName || "").trim();
  if (trusted) return trusted;
  const stored = String(link?.externalDisplayName || "").trim();
  if (stored) return stored;
  return "QuickBooks customer";
}

/**
 * @param {{ qbTrusted?: { available?: boolean, active?: boolean|null } }} link
 */
export function qbConnectionStatusLabel(link) {
  if (link?.qbTrusted && link.qbTrusted.available === false) return "Linked — details unavailable";
  if (link?.qbTrusted?.active === false) return "Connected — inactive in QuickBooks";
  return "Connected";
}

/**
 * @param {Array<{ confirmAllowed?: boolean, proposedAccountId?: string|null, currentLink?: { linked?: boolean } }>} items
 * @param {string} accountId
 */
export function filterMorawareCandidatesForAccount(items, accountId) {
  const id = String(accountId || "").trim();
  return (items || []).filter(
    (row) =>
      Boolean(row?.confirmAllowed) &&
      String(row?.proposedAccountId || "") === id &&
      row?.currentLink?.linked !== true
  );
}

/**
 * Selection of a search result must not POST a link.
 * @param {"idle"|"searching"|"results"|"selected"|"confirming"|"success"|"error"} state
 * @param {"select"|"confirm"|"cancel"} action
 */
export function nextQbPickerLinkState(state, action) {
  if (action === "select") return "selected";
  if (action === "confirm" && state === "selected") return "confirming";
  if (action === "cancel") return state === "confirming" ? "selected" : "idle";
  return state;
}

export function shouldPostQbLinkOnSelect() {
  return false;
}
