/**
 * Organization-scoped Monday schedule lock on public.eos_sync_locks.
 * Distinct from moraware_population. A healthy unexpired lock cannot be stolen.
 */

import crypto from "node:crypto";

export const MONDAY_SCHEDULE_LOCK_PREFIX = "sales_ops_monday:";

export const MONDAY_SCHEDULE_LOCK_TTL_MS = Object.freeze({
  light: 6 * 60 * 1000,
  deep: 25 * 60 * 1000,
  full: 90 * 60 * 1000
});

export function mondayScheduleLockName(organizationId) {
  return `${MONDAY_SCHEDULE_LOCK_PREFIX}${String(organizationId || "").trim()}`;
}

export function createMondayScheduleLockOwnerToken() {
  return crypto.randomUUID();
}

export function mondayScheduleLockTtlMs(jobType) {
  return MONDAY_SCHEDULE_LOCK_TTL_MS[jobType] || MONDAY_SCHEDULE_LOCK_TTL_MS.light;
}

function asIso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function isActiveLock(row, nowMs) {
  if (!row?.expires_at) return false;
  const exp = Date.parse(String(row.expires_at));
  return Number.isFinite(exp) && exp > nowMs;
}

function isUniqueViolation(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

export function heldJobTypeFromLock(lock) {
  const meta = lock?.metadata && typeof lock.metadata === "object" ? lock.metadata : {};
  return String(meta.jobType || "").trim() || null;
}

export function deferReasonForJob(requestedJobType, heldJobType) {
  if (!heldJobType) return "LOCKED";
  if (requestedJobType === "light" && (heldJobType === "deep" || heldJobType === "full")) {
    return "DEFERRED_FULL_OR_DEEP";
  }
  if (requestedJobType === "light" && heldJobType === "light") return "LIGHT_OVERLAP";
  return "DEFERRED";
}

/**
 * @param {{ get: Function, insert: Function, updateExpired: Function, deleteOwned: Function } | (() => object)} backend
 */
export function createMondayScheduleLockMethods(backend) {
  const b = () => (typeof backend === "function" ? backend() : backend);

  async function acquireMondayScheduleLock({
    organizationId,
    ownerToken,
    jobType = "light",
    ttlMs = null,
    now = new Date(),
    metadata = null
  } = {}) {
    const org = String(organizationId || "").trim();
    const name = mondayScheduleLockName(org);
    const token = String(ownerToken ?? "").trim();
    if (!org) throw new Error("acquireMondayScheduleLock: organizationId required");
    if (!token) throw new Error("acquireMondayScheduleLock: ownerToken required");
    const nowMs = now.getTime();
    const nowIso = asIso(now);
    const lease = Number.isFinite(ttlMs) ? ttlMs : mondayScheduleLockTtlMs(jobType);
    const expiresAt = new Date(nowMs + lease).toISOString();
    const row = {
      lock_name: name,
      locked_at: nowIso,
      locked_by: token,
      expires_at: expiresAt,
      metadata: {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        jobType,
        scheduleType:
          jobType === "full" ? "FULL_RECONCILE" : jobType === "deep" ? "DEEP_REFRESH" : "LIGHT_ACCOUNT"
      }
    };

    const existing = await b().get(name);
    if (existing && isActiveLock(existing, nowMs)) {
      if (String(existing.locked_by) === token) {
        return {
          acquired: true,
          already_owned: true,
          recovered_stale: false,
          lock: existing,
          owner_token: token
        };
      }
      return {
        acquired: false,
        reason: "locked",
        heldJobType: heldJobTypeFromLock(existing),
        lock: existing
      };
    }

    if (!existing) {
      try {
        const inserted = await b().insert(row);
        return { acquired: true, recovered_stale: false, lock: inserted || row, owner_token: token };
      } catch (e) {
        if (isUniqueViolation(e)) {
          const raced = await b().get(name);
          return {
            acquired: false,
            reason: "locked",
            heldJobType: heldJobTypeFromLock(raced),
            lock: raced
          };
        }
        throw e;
      }
    }

    const stolen = await b().updateExpired(name, nowIso, {
      locked_at: nowIso,
      locked_by: token,
      expires_at: expiresAt,
      metadata: row.metadata
    });
    if (!stolen) {
      const raced = await b().get(name);
      return {
        acquired: false,
        reason: "locked",
        heldJobType: heldJobTypeFromLock(raced),
        lock: raced
      };
    }
    return { acquired: true, recovered_stale: true, lock: stolen, owner_token: token };
  }

  async function releaseMondayScheduleLock({ organizationId, ownerToken } = {}) {
    const name = mondayScheduleLockName(organizationId);
    const token = String(ownerToken ?? "").trim();
    if (!token) throw new Error("releaseMondayScheduleLock: ownerToken required");
    const removed = await b().deleteOwned(name, token);
    if (!removed) return { released: false, reason: "not_owner" };
    return { released: true, lock: removed };
  }

  async function getMondayScheduleLock(organizationId) {
    return b().get(mondayScheduleLockName(organizationId));
  }

  return { acquireMondayScheduleLock, releaseMondayScheduleLock, getMondayScheduleLock };
}

export function createMemoryMondayScheduleLockBackend(map = new Map()) {
  return {
    async get(name) {
      return map.get(name) || null;
    },
    async insert(row) {
      if (map.has(row.lock_name)) {
        const err = new Error("duplicate");
        err.code = "23505";
        throw err;
      }
      const rec = { ...row, metadata: { ...(row.metadata || {}) } };
      map.set(row.lock_name, rec);
      return rec;
    },
    async updateExpired(name, nowIso, patch) {
      const existing = map.get(name);
      if (!existing) return null;
      const exp = Date.parse(String(existing.expires_at));
      const cutoff = Date.parse(String(nowIso));
      if (Number.isFinite(exp) && Number.isFinite(cutoff) && exp >= cutoff) return null;
      const next = { ...existing, ...patch, metadata: patch.metadata || existing.metadata };
      map.set(name, next);
      return next;
    },
    async deleteOwned(name, token) {
      const existing = map.get(name);
      if (!existing || String(existing.locked_by) !== String(token)) return null;
      map.delete(name);
      return existing;
    }
  };
}

export function createSupabaseMondayScheduleLockBackend(db) {
  function firstRow(data) {
    if (!data) return null;
    return Array.isArray(data) ? data[0] ?? null : data;
  }
  return {
    async get(name) {
      const res = await db.from("eos_sync_locks").select("*").eq("lock_name", name).limit(1);
      if (res.error) throw new Error(res.error.message || String(res.error));
      return firstRow(res.data);
    },
    async insert(row) {
      const ins = await db.from("eos_sync_locks").insert(row).select("*");
      if (ins.error) {
        const err = new Error(ins.error.message || String(ins.error));
        err.code = ins.error.code;
        throw err;
      }
      return firstRow(ins.data) || row;
    },
    async updateExpired(name, nowIso, patch) {
      const up = await db
        .from("eos_sync_locks")
        .update(patch)
        .eq("lock_name", name)
        .lt("expires_at", nowIso)
        .select("*");
      if (up.error) throw new Error(up.error.message || String(up.error));
      return firstRow(up.data);
    },
    async deleteOwned(name, token) {
      const del = await db
        .from("eos_sync_locks")
        .delete()
        .eq("lock_name", name)
        .eq("locked_by", token)
        .select("*");
      if (del.error) throw new Error(del.error.message || String(del.error));
      return firstRow(del.data);
    }
  };
}
