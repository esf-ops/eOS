/**
 * Lightweight in-session Account 360 request coordination.
 * Session/memory only — no cross-user or durable cache.
 */

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
 * @typedef {'financials'|'relationship'|'insights'} Account360PanelKey
 */

/**
 * @returns {{
 *   beginAccount: (accountId: string) => { accountId: string, generation: number, signal: AbortSignal },
 *   isCurrent: (generation: number, accountId: string) => boolean,
 *   getPanel: (accountId: string, key: Account360PanelKey) => unknown,
 *   hasPanel: (accountId: string, key: Account360PanelKey) => boolean,
 *   setPanel: (accountId: string, key: Account360PanelKey, value: unknown) => void,
 *   invalidateAccount: (accountId: string) => void,
 *   clear: () => void,
 *   requestCounts: () => Record<string, number>
 * }}
 */
export function createAccount360SessionStore() {
  /** @type {Map<string, Partial<Record<Account360PanelKey, unknown>>>} */
  const byAccount = new Map();
  /** @type {AbortController|null} */
  let controller = null;
  let generation = 0;
  /** @type {string|null} */
  let activeAccountId = null;
  /** @type {Record<string, number>} */
  const counts = { financials: 0, relationship: 0, insights: 0, abort: 0 };

  return {
    beginAccount(accountId) {
      const id = String(accountId || "");
      generation += 1;
      if (controller) {
        controller.abort();
        counts.abort += 1;
      }
      controller = new AbortController();
      activeAccountId = id;
      if (id && !byAccount.has(id)) byAccount.set(id, {});
      return { accountId: id, generation, signal: controller.signal };
    },

    getSignal() {
      return controller ? controller.signal : null;
    },

    getGeneration() {
      return generation;
    },

    getActiveAccountId() {
      return activeAccountId;
    },

    isCurrent(gen, accountId) {
      return Number(gen) === generation && String(accountId || "") === String(activeAccountId || "");
    },

    getPanel(accountId, key) {
      const slot = byAccount.get(String(accountId || ""));
      return slot ? slot[key] : undefined;
    },

    hasPanel(accountId, key) {
      const slot = byAccount.get(String(accountId || ""));
      return Boolean(slot && Object.prototype.hasOwnProperty.call(slot, key));
    },

    setPanel(accountId, key, value) {
      const id = String(accountId || "");
      if (!id) return;
      const slot = byAccount.get(id) || {};
      slot[key] = value;
      byAccount.set(id, slot);
    },

    /**
     * Count an actual network fetch for deterministic tests.
     * @param {Account360PanelKey} key
     */
    markFetch(key) {
      if (key === "financials" || key === "relationship" || key === "insights") {
        counts[key] += 1;
      }
    },

    clearPanel(accountId, key) {
      const id = String(accountId || "");
      const slot = byAccount.get(id);
      if (!slot) return;
      delete slot[key];
    },

    invalidateAccount(accountId) {
      byAccount.delete(String(accountId || ""));
    },

    clear() {
      if (controller) controller.abort();
      controller = null;
      byAccount.clear();
      activeAccountId = null;
    },

    requestCounts() {
      return { ...counts };
    }
  };
}

/**
 * Decide whether a panel needs a network fetch for the active account session.
 * @param {{ hasPanel: (accountId: string, key: Account360PanelKey) => boolean }} store
 * @param {string} accountId
 * @param {Account360PanelKey} key
 */
export function needsAccount360Fetch(store, accountId, key) {
  return !store.hasPanel(accountId, key);
}
