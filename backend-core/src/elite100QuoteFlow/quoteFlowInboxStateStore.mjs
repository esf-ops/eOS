/**
 * Quote Flow Inbox triage state — dismissed + opened message keys.
 * Persists in organization_integration_configs (integration_key=quote_flow_inbox).
 * Never touches Outlook / Graph mailbox state.
 */

export const QUOTE_FLOW_INBOX_INTEGRATION_KEY = "quote_flow_inbox";
const MAX_KEYS = 500;

/**
 * @param {unknown} value
 * @returns {Record<string, { at?: string, by?: string|null }>}
 */
function normalizeKeyMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  /** @type {Record<string, { at?: string, by?: string|null }>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (v && typeof v === "object") {
      out[key] = {
        at: v.at ? String(v.at) : undefined,
        by: v.by != null ? String(v.by) : null
      };
    } else if (v === true) {
      out[key] = { at: new Date().toISOString(), by: null };
    }
  }
  return out;
}

/**
 * Cap map size — drop oldest by `at`.
 * @param {Record<string, { at?: string, by?: string|null }>} map
 */
function capMap(map) {
  const entries = Object.entries(map || {});
  if (entries.length <= MAX_KEYS) return map;
  entries.sort((a, b) => String(a[1]?.at || "").localeCompare(String(b[1]?.at || "")));
  const keep = entries.slice(entries.length - MAX_KEYS);
  return Object.fromEntries(keep);
}

/**
 * In-memory fallback for tests / missing Supabase.
 */
export function createMemoryQuoteFlowInboxStateStore() {
  /** @type {Map<string, { dismissedMessageKeys: object, openedMessageKeys: object }>} */
  const byOrg = new Map();

  function getState(organizationId) {
    const org = String(organizationId || "").trim() || "_";
    if (!byOrg.has(org)) {
      byOrg.set(org, { dismissedMessageKeys: {}, openedMessageKeys: {} });
    }
    return byOrg.get(org);
  }

  return {
    mode: "memory",
    async readState(organizationId) {
      const s = getState(organizationId);
      return {
        dismissedMessageKeys: { ...s.dismissedMessageKeys },
        openedMessageKeys: { ...s.openedMessageKeys }
      };
    },
    async writeState(organizationId, next) {
      const s = getState(organizationId);
      s.dismissedMessageKeys = capMap(normalizeKeyMap(next.dismissedMessageKeys));
      s.openedMessageKeys = capMap(normalizeKeyMap(next.openedMessageKeys));
      return { ok: true, mode: "memory" };
    },
    async dismiss({ organizationId, messageKey, actorUserId = null }) {
      const key = String(messageKey || "").trim();
      if (!key) {
        const err = new Error("Message key required");
        err.statusCode = 400;
        err.code = "message_not_found";
        throw err;
      }
      const s = getState(organizationId);
      s.dismissedMessageKeys[key] = {
        at: new Date().toISOString(),
        by: actorUserId || null
      };
      s.dismissedMessageKeys = capMap(s.dismissedMessageKeys);
      return {
        ok: true,
        dismissed: true,
        messageKey: key,
        emailDeleted: false,
        mailboxMutated: false
      };
    },
    async restore({ organizationId, messageKey }) {
      const key = String(messageKey || "").trim();
      if (!key) {
        const err = new Error("Message key required");
        err.statusCode = 400;
        err.code = "message_not_found";
        throw err;
      }
      const s = getState(organizationId);
      delete s.dismissedMessageKeys[key];
      return {
        ok: true,
        restored: true,
        messageKey: key,
        emailDeleted: false,
        mailboxMutated: false
      };
    },
    async markOpened({ organizationId, messageKey, actorUserId = null }) {
      const key = String(messageKey || "").trim();
      if (!key) return { ok: false, opened: false };
      const s = getState(organizationId);
      if (!s.openedMessageKeys[key]) {
        s.openedMessageKeys[key] = {
          at: new Date().toISOString(),
          by: actorUserId || null
        };
        s.openedMessageKeys = capMap(s.openedMessageKeys);
      }
      return { ok: true, opened: true, messageKey: key, mailboxMutated: false };
    }
  };
}

/**
 * @param {{ getSupabase?: Function|null }} [deps]
 */
export function createQuoteFlowInboxStateStore(deps = {}) {
  const getSupabase = deps.getSupabase || null;
  const memory = createMemoryQuoteFlowInboxStateStore();

  async function readRow(organizationId) {
    const org = String(organizationId || "").trim();
    if (!org || typeof getSupabase !== "function") return null;
    try {
      const db = getSupabase();
      if (!db?.from) return null;
      const { data, error } = await db
        .from("organization_integration_configs")
        .select("id,config,is_enabled")
        .eq("organization_id", org)
        .eq("integration_key", QUOTE_FLOW_INBOX_INTEGRATION_KEY)
        .maybeSingle();
      if (error || !data) return null;
      const cfg = data.config && typeof data.config === "object" ? data.config : {};
      return {
        id: data.id,
        dismissedMessageKeys: normalizeKeyMap(cfg.dismissedMessageKeys),
        openedMessageKeys: normalizeKeyMap(cfg.openedMessageKeys)
      };
    } catch {
      return null;
    }
  }

  async function persist(organizationId, next) {
    const org = String(organizationId || "").trim();
    const config = {
      dismissedMessageKeys: capMap(normalizeKeyMap(next.dismissedMessageKeys)),
      openedMessageKeys: capMap(normalizeKeyMap(next.openedMessageKeys))
    };

    // Always keep memory in sync for process lifetime.
    await memory.writeState(org, config);

    if (!org || typeof getSupabase !== "function") {
      return { ok: true, mode: "memory" };
    }
    try {
      const db = getSupabase();
      if (!db?.from) return { ok: true, mode: "memory" };
      const payload = {
        organization_id: org,
        integration_key: QUOTE_FLOW_INBOX_INTEGRATION_KEY,
        display_name: "Quote Flow Inbox",
        is_enabled: true,
        config,
        updated_at: new Date().toISOString()
      };
      const { error } = await db
        .from("organization_integration_configs")
        .upsert(payload, { onConflict: "organization_id,integration_key" });
      if (error) return { ok: true, mode: "memory_fallback", warning: error.message };
      return { ok: true, mode: "supabase" };
    } catch (e) {
      return { ok: true, mode: "memory_fallback", warning: e?.message };
    }
  }

  return {
    mode: "supabase_or_memory",
    async readState(organizationId) {
      const row = await readRow(organizationId);
      if (row) {
        return {
          dismissedMessageKeys: row.dismissedMessageKeys,
          openedMessageKeys: row.openedMessageKeys
        };
      }
      return memory.readState(organizationId);
    },
    async dismiss({ organizationId, messageKey, actorUserId = null }) {
      const key = String(messageKey || "").trim();
      if (!key) {
        const err = new Error("Message key required");
        err.statusCode = 400;
        err.code = "message_not_found";
        throw err;
      }
      const state = await this.readState(organizationId);
      state.dismissedMessageKeys[key] = {
        at: new Date().toISOString(),
        by: actorUserId || null
      };
      await persist(organizationId, state);
      return {
        ok: true,
        dismissed: true,
        messageKey: key,
        emailDeleted: false,
        mailboxMutated: false
      };
    },
    async restore({ organizationId, messageKey }) {
      const key = String(messageKey || "").trim();
      if (!key) {
        const err = new Error("Message key required");
        err.statusCode = 400;
        err.code = "message_not_found";
        throw err;
      }
      const state = await this.readState(organizationId);
      delete state.dismissedMessageKeys[key];
      await persist(organizationId, state);
      return {
        ok: true,
        restored: true,
        messageKey: key,
        emailDeleted: false,
        mailboxMutated: false
      };
    },
    async markOpened({ organizationId, messageKey, actorUserId = null }) {
      const key = String(messageKey || "").trim();
      if (!key) return { ok: false, opened: false };
      const state = await this.readState(organizationId);
      if (!state.openedMessageKeys[key]) {
        state.openedMessageKeys[key] = {
          at: new Date().toISOString(),
          by: actorUserId || null
        };
        await persist(organizationId, state);
      }
      return { ok: true, opened: true, messageKey: key, mailboxMutated: false };
    }
  };
}
