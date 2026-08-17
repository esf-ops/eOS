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
 * @typedef {string} Account360PanelKey
 */

export const ACCOUNT360_COUNT_FAMILIES = Object.freeze([
  "financials",
  "relationship",
  "insights",
  "trend",
  "invoices",
  "history",
  "timeline",
  "notes",
  "followups",
  "abort"
]);

/**
 * Surfaces that may be visited in Account 360.
 * Overview always loads compact summary resources (financials/relationship/insights).
 * Deep resources are lazy and keyed separately.
 * @param {"overview"|"connections"|"relationship"|"financials"|"insights"|"notes"|"followups"} surface
 * @returns {string[]}
 */
export function account360FetchesForSurface(surface) {
  if (surface === "overview") return ["financials", "relationship", "insights"];
  if (surface === "connections") return [];
  if (surface === "relationship") return ["timeline:all"];
  if (surface === "financials") return ["history:all"];
  if (surface === "insights") return [];
  if (surface === "notes") return ["notes:all"];
  if (surface === "followups") return ["followups:open"];
  return [];
}

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
  /** @type {Map<string, Record<string, unknown>>} */
  const byAccount = new Map();
  /** @type {Map<string, { seq: number, promise: Promise<unknown> }>} */
  const inFlight = new Map();
  /** @type {AbortController|null} */
  let controller = null;
  let generation = 0;
  let inflightSeq = 0;
  /** @type {string|null} */
  let activeAccountId = null;
  /** @type {Record<string, number>} */
  const counts = {
    financials: 0,
    relationship: 0,
    insights: 0,
    trend: 0,
    invoices: 0,
    history: 0,
    timeline: 0,
    notes: 0,
    followups: 0,
    abort: 0
  };

  function inflightKey(accountId, key) {
    return `${accountId}::${key}`;
  }

  function clearInFlightForAccount(accountId) {
    const prefix = `${accountId}::`;
    for (const k of [...inFlight.keys()]) {
      if (k.startsWith(prefix)) inFlight.delete(k);
    }
  }

  return {
    beginAccount(accountId) {
      const id = String(accountId || "");
      if (id && id === activeAccountId && controller && !controller.signal.aborted) {
        return { accountId: id, generation, signal: controller.signal };
      }
      generation += 1;
      if (controller) {
        controller.abort();
        counts.abort += 1;
      }
      controller = new AbortController();
      inFlight.clear();
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
      const family = String(key || "").split(":")[0];
      if (family && family !== "abort" && Object.prototype.hasOwnProperty.call(counts, family)) {
        counts[family] += 1;
      }
    },

    getInFlight(accountId, key) {
      return inFlight.get(inflightKey(accountId, key)) || null;
    },

    clearPanel(accountId, key) {
      const id = String(accountId || "");
      const slot = byAccount.get(id);
      if (slot) delete slot[key];
      inFlight.delete(inflightKey(id, key));
    },

    clearPanelFamily(accountId, family) {
      const id = String(accountId || "");
      const slot = byAccount.get(id);
      const prefix = `${family}:`;
      if (slot) {
        for (const key of Object.keys(slot)) {
          if (key === family || key.startsWith(prefix)) delete slot[key];
        }
      }
      const inflightPrefix = `${id}::`;
      for (const k of [...inFlight.keys()]) {
        if (!k.startsWith(inflightPrefix)) continue;
        const panelKey = k.slice(inflightPrefix.length);
        if (panelKey === family || panelKey.startsWith(prefix)) inFlight.delete(k);
      }
    },

    invalidateAccount(accountId) {
      const id = String(accountId || "");
      byAccount.delete(id);
      clearInFlightForAccount(id);
    },

    clear() {
      if (controller) controller.abort();
      controller = null;
      byAccount.clear();
      inFlight.clear();
      activeAccountId = null;
    },

    requestCounts() {
      return { ...counts };
    },

    /**
     * Cache-or-dedupe a resource load. `loader` is the network function.
     * @param {string} accountId
     * @param {string} key
     * @param {() => Promise<unknown>} loader
     */
    loadResource(accountId, key, loader) {
      const id = String(accountId || "");
      if (this.hasPanel(id, key)) {
        return Promise.resolve(this.getPanel(id, key));
      }
      const existing = this.getInFlight(id, key);
      if (existing) return existing.promise;
      const seq = ++inflightSeq;
      const generationSnapshot = generation;
      this.markFetch(key);
      const promise = Promise.resolve()
        .then(() => loader())
        .then((value) => {
          const cur = inFlight.get(inflightKey(id, key));
          if (cur && cur.seq === seq && this.isCurrent(generationSnapshot, id)) {
            this.setPanel(id, key, value);
          }
          return value;
        })
        .finally(() => {
          const cur = inFlight.get(inflightKey(id, key));
          if (cur && cur.seq === seq) inFlight.delete(inflightKey(id, key));
        });
      inFlight.set(inflightKey(id, key), { seq, promise });
      return promise;
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

/** Expected coordinator counts for Overview→…→Financials on one account (page-1 only). */
export const ACCOUNT360_DEFAULT_NAV_BUDGET = Object.freeze({
  financials: 1,
  relationship: 1,
  insights: 1,
  trend: 0,
  invoices: 0,
  history: 1,
  timeline: 1,
  notes: 0,
  followups: 0,
  abort: 0
});

/**
 * Deterministic navigation planner for tests — mirrors ProfilePanel + lazy tab policy.
 * @param {{
 *   beginAccount: Function,
 *   hasPanel: Function,
 *   setPanel: Function,
 *   markFetch: Function,
 *   loadResource?: Function
 * }} store
 * @param {string} accountId
 * @param {string[]} surfaces
 */

export function replayAccount360Navigation(store, accountId, surfaces) {
  store.beginAccount(accountId);
  for (const surface of surfaces) {
    const keys = [
      ...account360FetchesForSurface("overview"),
      ...account360FetchesForSurface(surface)
    ];
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!needsAccount360Fetch(store, accountId, key)) continue;
      store.markFetch(key);
      store.setPanel(accountId, key, { ok: true, key });
      if (key === "financials") {
        // Compact financials payload already includes trailing_12 trend + invoice page 1.
        if (!store.hasPanel(accountId, "trend:trailing_12")) {
          store.setPanel(accountId, "trend:trailing_12", { seededFromFinancials: true });
        }
        if (!store.hasPanel(accountId, "invoices")) {
          store.setPanel(accountId, "invoices", { seededFromFinancials: true });
        }
      }
    }
  }
  return store.requestCounts();
}
