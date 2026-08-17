/**
 * Phase 1 — read-only trusted QuickBooks customer search for the Account
 * Directory picker. Name matching is discovery only.
 *
 * Permanent identity remains the exact ListID, confirmed through the existing
 * Phase 0E linkQuickBooks path. This module never writes to QuickBooks or
 * creates external links.
 */

import { isAdQbRootCustomerFact } from "./accountDirectoryQbLinkValidation.mjs";

export const QB_CUSTOMER_SEARCH_MIN_QUERY = 2;
export const QB_CUSTOMER_SEARCH_MAX_RESULTS = 20;
export const QB_CUSTOMER_SEARCH_PUBLIC_FIELDS = Object.freeze(["listId", "displayName", "active"]);

/**
 * @param {unknown} raw
 */
export function normalizeQbCustomerSearchQuery(raw) {
  return String(raw ?? "").trim();
}

/**
 * @param {unknown} raw
 */
export function isQbCustomerSearchQueryTooShort(raw) {
  return normalizeQbCustomerSearchQuery(raw).length < QB_CUSTOMER_SEARCH_MIN_QUERY;
}

/**
 * Strip ILIKE / PostgREST filter metacharacters. Discovery still uses the
 * original trimmed query for exact ListID lookup.
 * @param {unknown} raw
 */
export function sanitizeQbCustomerSearchNeedle(raw) {
  return normalizeQbCustomerSearchQuery(raw)
    .replace(/[%_,()\\"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object|null|undefined} fact
 */
export function toPublicQuickBooksCustomerSearchItem(fact) {
  const listId = String(fact?.qbListId ?? fact?.qb_list_id ?? "").trim();
  const displayName = String(fact?.fullName ?? fact?.full_name ?? fact?.name ?? "").trim() || listId;
  return {
    listId,
    displayName,
    active: fact?.isActive !== false && fact?.is_active !== false
  };
}

/**
 * @param {object} item
 */
export function assertSafeQbCustomerSearchItem(item) {
  const keys = Object.keys(item || {});
  for (const key of keys) {
    if (!QB_CUSTOMER_SEARCH_PUBLIC_FIELDS.includes(key)) {
      throw new Error(`Unsafe QuickBooks search field blocked: ${key}`);
    }
  }
  if (/raw_payload|rawPayload|raw_hash|bill_city|bill_state/i.test(JSON.stringify(item))) {
    throw new Error("Unsafe QuickBooks search payload blocked.");
  }
  return item;
}

/**
 * @param {object} fact
 * @param {string} query trimmed original
 */
export function factMatchesQbCustomerSearch(fact, query) {
  if (!isAdQbRootCustomerFact(fact)) return false;
  const needle = String(query || "").trim();
  if (!needle) return false;
  const listId = String(fact.qbListId ?? fact.qb_list_id ?? "").trim();
  if (listId === needle) return true;
  const lowered = needle.toLowerCase();
  const name = String(fact.name || "").toLowerCase();
  const fullName = String(fact.fullName ?? fact.full_name ?? "").toLowerCase();
  return name.includes(lowered) || fullName.includes(lowered);
}

/**
 * @param {Array<{ listId: string, displayName: string, active: boolean }>} items
 */
export function sortQbCustomerSearchItems(items) {
  return [...(items || [])].sort(
    (a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), undefined, { sensitivity: "base" }) ||
      String(a.listId || "").localeCompare(String(b.listId || ""))
  );
}

/**
 * In-memory / test ranking of already-loaded org facts. Production uses the
 * store query (org + root + bounded ILIKE). Never dumps the full table to the
 * caller — always sliced to MAX_RESULTS.
 * @param {object[]} facts
 * @param {{ query: string, limit?: number }} opts
 */
export function selectTrustedQuickBooksRootCustomers(facts, { query, limit = QB_CUSTOMER_SEARCH_MAX_RESULTS } = {}) {
  const q = normalizeQbCustomerSearchQuery(query);
  if (isQbCustomerSearchQueryTooShort(q)) return [];
  const max = Math.min(QB_CUSTOMER_SEARCH_MAX_RESULTS, Math.max(1, Number(limit) || QB_CUSTOMER_SEARCH_MAX_RESULTS));
  const matched = [];
  for (const fact of facts || []) {
    if (!factMatchesQbCustomerSearch(fact, q)) continue;
    matched.push(assertSafeQbCustomerSearchItem(toPublicQuickBooksCustomerSearchItem(fact)));
  }
  return sortQbCustomerSearchItems(matched).slice(0, max);
}
