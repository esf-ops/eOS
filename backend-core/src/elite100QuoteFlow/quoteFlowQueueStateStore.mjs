/**
 * Quote Flow Estimate Queue archive state.
 * Persists in organization_integration_configs (integration_key=quote_flow_queue).
 * Non-destructive: never deletes takeoff jobs, intake cases, estimates, or emails,
 * and never cancels AI jobs.
 */

export const QUOTE_FLOW_QUEUE_INTEGRATION_KEY = "quote_flow_queue";
const MAX_KEYS = 500;

/**
 * @param {unknown} value
 * @returns {Record<string, { at?: string, by?: string|null }>}
 */
export function normalizeArchivedQueueKeyMap(value) {
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
export function createMemoryQuoteFlowQueueStateStore() {
  /** @type {Map<string, { archivedQueueItemKeys: object }>} */
  const byOrg = new Map();

  function getState(organizationId) {
    const org = String(organizationId || "").trim() || "_";
    if (!byOrg.has(org)) {
      byOrg.set(org, { archivedQueueItemKeys: {} });
    }
    return byOrg.get(org);
  }

  return {
    mode: "memory",
    async readState(organizationId) {
      const s = getState(organizationId);
      return {
        archivedQueueItemKeys: { ...s.archivedQueueItemKeys }
      };
    },
    async writeState(organizationId, next) {
      const s = getState(organizationId);
      s.archivedQueueItemKeys = capMap(
        normalizeArchivedQueueKeyMap(next.archivedQueueItemKeys)
      );
      return { ok: true, mode: "memory" };
    },
    async archive({ organizationId, queueItemKey, actorUserId = null }) {
      const key = String(queueItemKey || "").trim();
      if (!key) {
        const err = new Error("Queue item key required");
        err.statusCode = 400;
        err.code = "queue_item_key_required";
        throw err;
      }
      const s = getState(organizationId);
      s.archivedQueueItemKeys[key] = {
        at: new Date().toISOString(),
        by: actorUserId || null
      };
      s.archivedQueueItemKeys = capMap(s.archivedQueueItemKeys);
      return {
        ok: true,
        archived: true,
        queueItemKey: key,
        archivedAt: s.archivedQueueItemKeys[key].at,
        takeoffCancelled: false,
        takeoffDeleted: false,
        intakeDeleted: false,
        estimateDeleted: false,
        emailDeleted: false
      };
    },
    async restore({ organizationId, queueItemKey }) {
      const key = String(queueItemKey || "").trim();
      if (!key) {
        const err = new Error("Queue item key required");
        err.statusCode = 400;
        err.code = "queue_item_key_required";
        throw err;
      }
      const s = getState(organizationId);
      delete s.archivedQueueItemKeys[key];
      return {
        ok: true,
        restored: true,
        queueItemKey: key,
        takeoffCancelled: false,
        takeoffDeleted: false,
        intakeDeleted: false,
        estimateDeleted: false,
        emailDeleted: false
      };
    }
  };
}

/**
 * @param {{ getSupabase?: Function|null }} [deps]
 */
export function createQuoteFlowQueueStateStore(deps = {}) {
  const getSupabase = deps.getSupabase || null;
  const memory = createMemoryQuoteFlowQueueStateStore();

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
        .eq("integration_key", QUOTE_FLOW_QUEUE_INTEGRATION_KEY)
        .maybeSingle();
      if (error || !data) return null;
      const cfg = data.config && typeof data.config === "object" ? data.config : {};
      return {
        id: data.id,
        archivedQueueItemKeys: normalizeArchivedQueueKeyMap(cfg.archivedQueueItemKeys)
      };
    } catch {
      return null;
    }
  }

  async function persist(organizationId, next) {
    const org = String(organizationId || "").trim();
    const config = {
      archivedQueueItemKeys: capMap(
        normalizeArchivedQueueKeyMap(next.archivedQueueItemKeys)
      )
    };

    await memory.writeState(org, config);

    if (!org || typeof getSupabase !== "function") {
      return { ok: true, mode: "memory" };
    }
    try {
      const db = getSupabase();
      if (!db?.from) return { ok: true, mode: "memory" };
      const payload = {
        organization_id: org,
        integration_key: QUOTE_FLOW_QUEUE_INTEGRATION_KEY,
        display_name: "Quote Flow Estimate Queue",
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
        return { archivedQueueItemKeys: row.archivedQueueItemKeys };
      }
      return memory.readState(organizationId);
    },
    async archive({ organizationId, queueItemKey, actorUserId = null }) {
      const key = String(queueItemKey || "").trim();
      if (!key) {
        const err = new Error("Queue item key required");
        err.statusCode = 400;
        err.code = "queue_item_key_required";
        throw err;
      }
      const state = await this.readState(organizationId);
      const archivedAt = new Date().toISOString();
      state.archivedQueueItemKeys[key] = {
        at: archivedAt,
        by: actorUserId || null
      };
      await persist(organizationId, state);
      return {
        ok: true,
        archived: true,
        queueItemKey: key,
        archivedAt,
        takeoffCancelled: false,
        takeoffDeleted: false,
        intakeDeleted: false,
        estimateDeleted: false,
        emailDeleted: false
      };
    },
    async restore({ organizationId, queueItemKey }) {
      const key = String(queueItemKey || "").trim();
      if (!key) {
        const err = new Error("Queue item key required");
        err.statusCode = 400;
        err.code = "queue_item_key_required";
        throw err;
      }
      const state = await this.readState(organizationId);
      delete state.archivedQueueItemKeys[key];
      await persist(organizationId, state);
      return {
        ok: true,
        restored: true,
        queueItemKey: key,
        takeoffCancelled: false,
        takeoffDeleted: false,
        intakeDeleted: false,
        estimateDeleted: false,
        emailDeleted: false
      };
    }
  };
}
