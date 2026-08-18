/**
 * Exact QuickBooks ListID → Account Directory UUID resolution.
 * Read-only. Names never authorize this mapping.
 */

import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";
import { normalizeQuickBooksListId } from "./accountDirectoryQbLinkValidation.mjs";

/**
 * @param {Array<object>|null|undefined} links
 * @returns {Map<string, string>} normalized ListID → account UUID
 */
export function indexActiveQuickBooksAccountIdsByListId(links = []) {
  const map = new Map();
  for (const link of links || []) {
    if (!link || link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "").trim();
    if (system && system !== ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM) continue;
    const listId = normalizeQuickBooksListId(
      link.externalId || link.external_id || link.listId || link.qbListId
    );
    const accountId = String(link.accountId || link.account_id || "").trim();
    if (!listId || !accountId || map.has(listId)) continue;
    map.set(listId, accountId);
  }
  return map;
}

/**
 * Exact org-scoped active quickbooks_desktop ListID lookup.
 * @param {{ listActiveExternalLinksByExternalId?: Function }} store
 * @param {{ organizationId: string, listId: unknown }} args
 * @returns {Promise<{ accountId: string, listId: string, linkId: string|null }|null>}
 */
export async function resolveActiveQuickBooksAccountByListId(store, { organizationId, listId }) {
  const id = normalizeQuickBooksListId(listId);
  if (!organizationId || !id || typeof store?.listActiveExternalLinksByExternalId !== "function") {
    return null;
  }
  const rows = await store.listActiveExternalLinksByExternalId(
    organizationId,
    ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM,
    id
  );
  const row = (rows || []).find((l) => l && l.isActive !== false);
  const accountId = String(row?.accountId || "").trim();
  if (!accountId) return null;
  return { accountId, listId: id, linkId: row.id || null };
}

/**
 * Batch exact ListID resolution. Never uses names.
 * @param {{
 *   listActiveExternalLinksByExternalIds?: Function,
 *   listActiveExternalLinksByExternalId?: Function
 * }} store
 * @param {{ organizationId: string, listIds?: unknown[] }} args
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveActiveQuickBooksAccountsByListIds(store, { organizationId, listIds }) {
  const ids = [...new Set((listIds || []).map((value) => normalizeQuickBooksListId(value)).filter(Boolean))];
  if (!organizationId || !ids.length) return new Map();
  if (typeof store.listActiveExternalLinksByExternalIds === "function") {
    const rows = await store.listActiveExternalLinksByExternalIds(
      organizationId,
      ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM,
      ids
    );
    return indexActiveQuickBooksAccountIdsByListId(rows);
  }
  const map = new Map();
  for (const id of ids) {
    const hit = await resolveActiveQuickBooksAccountByListId(store, { organizationId, listId: id });
    if (hit) map.set(hit.listId, hit.accountId);
  }
  return map;
}

/**
 * Promote a candidate whose exact QB ListID already has an active AD link.
 * @param {object} candidate
 * @param {Map<string, string>} accountIdByListId
 * @param {Map<string, object>} [directoryById]
 */
export function overlayExactQuickBooksLinkOnCandidate(candidate, accountIdByListId, directoryById) {
  const c = candidate && typeof candidate === "object" ? { ...candidate } : {};
  const listId = normalizeQuickBooksListId(c.qbListId);
  const existingId = (listId && accountIdByListId?.get(listId)) || null;
  if (!existingId) {
    if (c.accountId) c.createFromQuickBooksAllowed = false;
    return c;
  }
  const meta = directoryById?.get(existingId) || {};
  return {
    ...c,
    accountId: existingId,
    displayName: meta.displayName || c.displayName,
    identityKind: "EXISTING_AD_QB_BACKED",
    qbLinked: true,
    qbListId: listId || c.qbListId || null,
    createFromQuickBooksAllowed: false,
    confirmQbLinkAllowed: false,
    confirmMorawareAllowed: true,
    confirmAllowed: true
  };
}
