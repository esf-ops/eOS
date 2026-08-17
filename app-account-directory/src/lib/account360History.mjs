/**
 * Account 360 deep-history helpers.
 * Pagination stays at the API; this only appends, dedupes, and bounds DOM.
 */

export const AD_360_RENDER_WINDOW = 200;
export const AD_360_HISTORY_PAGE_SIZE = 25;
export const AD_360_INVOICE_PAGE_SIZE = 50;
export const AD_360_TIMELINE_PAGE_SIZE = 25;

/**
 * @param {unknown} item
 * @param {number} index
 */
export function historyItemId(item, index = 0) {
  if (!item || typeof item !== "object") return `row-${index}`;
  const row = /** @type {Record<string, unknown>} */ (item);
  if (row.id) return String(row.id);
  const type = String(row.type || row.txn_type || "txn");
  const date = String(row.date || row.txn_date || "");
  const ref = String(row.referenceNumber || row.reference_number || "");
  const amount = String(row.amount ?? "");
  return `${type}:${date}:${ref}:${amount}` || `row-${index}`;
}

/**
 * @param {unknown} item
 * @param {number} index
 */
export function invoiceItemId(item, index = 0) {
  if (!item || typeof item !== "object") return `inv-${index}`;
  const row = /** @type {Record<string, unknown>} */ (item);
  if (row.id) return String(row.id);
  const ref = String(row.reference_number || row.referenceNumber || "");
  const date = String(row.invoice_date || row.date || "");
  const open = String(row.open_amount ?? row.balance ?? "");
  return `inv:${ref}:${date}:${open}` || `inv-${index}`;
}

/**
 * @param {unknown} item
 * @param {number} index
 */
export function timelineItemId(item, index = 0) {
  if (!item || typeof item !== "object") return `evt-${index}`;
  const row = /** @type {Record<string, unknown>} */ (item);
  if (row.id) return String(row.id);
  return `${row.family || row.familyClass || "evt"}:${row.at || ""}:${row.title || row.type || index}`;
}

/**
 * @param {unknown[]} prevItems
 * @param {unknown[]} nextItems
 * @param {(item: unknown, index: number) => string} idFn
 * @param {{ replace?: boolean, window?: number }} [opts]
 */
export function appendUniqueBounded(prevItems, nextItems, idFn, opts = {}) {
  const windowSize = Number(opts.window) > 0 ? Number(opts.window) : AD_360_RENDER_WINDOW;
  const incoming = Array.isArray(nextItems) ? nextItems : [];
  if (opts.replace) {
    const seen = new Set();
    const items = [];
    incoming.forEach((item, index) => {
      const id = idFn(item, index);
      if (seen.has(id)) return;
      seen.add(id);
      items.push(item);
    });
    return {
      items: items.slice(0, windowSize),
      added: Math.min(items.length, windowSize),
      duplicates: incoming.length - items.length,
      truncated: items.length > windowSize,
      atWindow: items.length >= windowSize
    };
  }
  const prev = Array.isArray(prevItems) ? prevItems : [];
  const seen = new Set(prev.map((item, index) => idFn(item, index)));
  const addedItems = [];
  incoming.forEach((item, index) => {
    const id = idFn(item, index);
    if (seen.has(id)) return;
    seen.add(id);
    addedItems.push(item);
  });
  const merged = [...prev, ...addedItems];
  const truncated = merged.length > windowSize;
  return {
    items: truncated ? merged.slice(0, windowSize) : merged,
    added: addedItems.length,
    duplicates: incoming.length - addedItems.length,
    truncated,
    atWindow: merged.length >= windowSize
  };
}

/**
 * @param {{ has_more?: boolean, hasMore?: boolean }|null|undefined} pagination
 * @param {number} itemCount
 * @param {number} [windowSize]
 */
export function canLoadMoreHistory(pagination, itemCount, windowSize = AD_360_RENDER_WINDOW) {
  const hasMore = Boolean(pagination?.has_more ?? pagination?.hasMore);
  return hasMore && Number(itemCount || 0) < windowSize;
}

/**
 * @param {{ has_more?: boolean, hasMore?: boolean }|null|undefined} pagination
 * @param {number} itemCount
 * @param {number} [windowSize]
 */
export function historyExhaustedCopy(pagination, itemCount, windowSize = AD_360_RENDER_WINDOW) {
  if (Number(itemCount || 0) >= windowSize) {
    return "Showing the first 200 rows. Narrow the filter to continue.";
  }
  if (itemCount > 0) return "End of available history.";
  return null;
}

/**
 * Ignore a paged response that no longer belongs to the active account/generation.
 * @param {{ isCurrent: (generation: number, accountId: string) => boolean }} store
 * @param {number} generation
 * @param {string} accountId
 * @param {string} expectedAccountId
 */
export function shouldApplyHistoryPage(store, generation, accountId, expectedAccountId) {
  return String(accountId || "") === String(expectedAccountId || "") && store.isCurrent(generation, expectedAccountId);
}

/**
 * Merge a paged response into the current list: replace page 1, append later pages,
 * drop duplicate IDs, and stop further growth at the render window.
 * @param {{ items?: unknown[], pagination?: { has_more?: boolean, hasMore?: boolean } }|null|undefined} prevPage
 * @param {{ items?: unknown[], pagination?: { has_more?: boolean, hasMore?: boolean } }|null|undefined} nextPage
 * @param {number} pageNumber
 * @param {(item: unknown, index: number) => string} idFn
 */
export function applyHistoryPage(prevPage, nextPage, pageNumber, idFn) {
  const incoming = Array.isArray(nextPage?.items) ? nextPage.items : [];
  const replace = Number(pageNumber) <= 1;
  const bounded = appendUniqueBounded(replace ? [] : prevPage?.items, incoming, idFn, { replace });
  const backendMore = Boolean(nextPage?.pagination?.has_more ?? nextPage?.pagination?.hasMore);
  return {
    ...(nextPage && typeof nextPage === "object" ? nextPage : {}),
    items: bounded.items,
    pagination: {
      ...(nextPage?.pagination || {}),
      has_more: backendMore && !bounded.atWindow && (replace || bounded.added > 0)
    }
  };
}
