/**
 * Distributed CURRENT_MORAWARE_JOB_SET writer lock.
 *
 * Reuses public.eos_sync_locks (lock_name PK, locked_by, locked_at, expires_at, metadata).
 * No migration: owner token is stored in locked_by; lease is expires_at.
 *
 * Acquire/release use compare-and-swap (insert unique / update where expired /
 * delete where locked_by = owner). A healthy unexpired lock cannot be stolen.
 * Only the current owner may release or renew.
 */

import crypto from "node:crypto";

import { CENSUS_SCOPE_FULL, CENSUS_SCOPE_INCREMENTAL, pickCensusScope } from "./morawareCurrentPopulation.mjs";

export const MORAWARE_POPULATION_LOCK_NAME = "moraware_population";
export const MORAWARE_POPULATION_LOCK_OWNER_HEADER = "x-moraware-population-lock-owner";
export const MORAWARE_POPULATION_LOCK_OWNER_ENV = "MORAWARE_POPULATION_LOCK_OWNER";
/** Default lease covers a long FULL crawl + 527-chunk import + rebuild. Heartbeat renews. */
export const MORAWARE_POPULATION_LOCK_LEASE_MS = 4 * 60 * 60 * 1000;
export const MORAWARE_POPULATION_LOCK_HEARTBEAT_MS = 15 * 60 * 1000;

export function createMorawarePopulationLockOwnerToken() {
  return crypto.randomUUID();
}

function lockName() {
  return MORAWARE_POPULATION_LOCK_NAME;
}

function asIso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function isActiveLock(row, nowMs) {
  if (!row?.expires_at) return false;
  const exp = Date.parse(String(row.expires_at));
  return Number.isFinite(exp) && exp > nowMs;
}

function firstRow(data) {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

function isUniqueViolation(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

export function pickMorawarePopulationLockOwner({ headerValue, bodyValue, envValue } = {}) {
  return String(headerValue ?? bodyValue ?? envValue ?? "").trim();
}

export function pickMorawarePopulationLockOwnerFromRequest(req) {
  const header =
    (typeof req?.header === "function" ? req.header(MORAWARE_POPULATION_LOCK_OWNER_HEADER) : null) ||
    req?.headers?.[MORAWARE_POPULATION_LOCK_OWNER_HEADER] ||
    req?.headers?.["X-Moraware-Population-Lock-Owner"];
  const body = req?.body?.population_lock_owner;
  return pickMorawarePopulationLockOwner({ headerValue: header, bodyValue: body });
}

async function readLock(db) {
  const res = await db.from("eos_sync_locks").select("*").eq("lock_name", lockName()).limit(1);
  if (res.error) throw new Error(res.error.message || String(res.error));
  return firstRow(res.data);
}

export async function acquireMorawarePopulationLock(
  db,
  { ownerToken, lockedBy = null, ttlMs = MORAWARE_POPULATION_LOCK_LEASE_MS, metadata = null, now = new Date() } = {}
) {
  const token = String(ownerToken ?? "").trim();
  if (!token) throw new Error("acquireMorawarePopulationLock: ownerToken required");
  const nowMs = now.getTime();
  const nowIso = asIso(now);
  const expiresAt = new Date(nowMs + ttlMs).toISOString();
  const row = {
    lock_name: lockName(),
    locked_at: nowIso,
    locked_by: token,
    expires_at: expiresAt,
    metadata: {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      owner_token: token,
      locked_by_label: lockedBy || null
    }
  };

  const existing = await readLock(db);
  if (existing && isActiveLock(existing, nowMs)) {
    if (String(existing.locked_by) === token) {
      const renewed = await renewMorawarePopulationLock(db, { ownerToken: token, ttlMs, now, metadata: row.metadata });
      return { acquired: true, already_owned: true, lock: renewed.lock || existing, owner_token: token };
    }
    return { acquired: false, reason: "locked", lock: existing };
  }

  if (!existing) {
    const ins = await db.from("eos_sync_locks").insert(row).select("*");
    if (ins.error && isUniqueViolation(ins.error)) {
      return { acquired: false, reason: "locked", lock: await readLock(db) };
    }
    if (ins.error) throw new Error(ins.error.message || String(ins.error));
    return { acquired: true, recovered_stale: false, lock: firstRow(ins.data) || row, owner_token: token };
  }

  const up = await db
    .from("eos_sync_locks")
    .update({
      locked_at: nowIso,
      locked_by: token,
      expires_at: expiresAt,
      metadata: row.metadata
    })
    .eq("lock_name", lockName())
    .lt("expires_at", nowIso)
    .select("*");
  if (up.error) throw new Error(up.error.message || String(up.error));
  const updated = firstRow(up.data);
  if (!updated) return { acquired: false, reason: "locked", lock: await readLock(db) };
  return { acquired: true, recovered_stale: true, lock: updated, owner_token: token };
}

export async function renewMorawarePopulationLock(
  db,
  { ownerToken, ttlMs = MORAWARE_POPULATION_LOCK_LEASE_MS, now = new Date(), metadata = null } = {}
) {
  const token = String(ownerToken ?? "").trim();
  if (!token) throw new Error("renewMorawarePopulationLock: ownerToken required");
  const nowMs = now.getTime();
  const existing = await readLock(db);
  if (!existing) return { renewed: false, reason: "missing" };
  if (String(existing.locked_by) !== token) return { renewed: false, reason: "not_owner", lock: existing };
  if (!isActiveLock(existing, nowMs)) return { renewed: false, reason: "expired", lock: existing };
  const expiresAt = new Date(nowMs + ttlMs).toISOString();
  const patch = { expires_at: expiresAt };
  if (metadata && typeof metadata === "object") patch.metadata = metadata;
  const up = await db
    .from("eos_sync_locks")
    .update(patch)
    .eq("lock_name", lockName())
    .eq("locked_by", token)
    .select("*");
  if (up.error) throw new Error(up.error.message || String(up.error));
  const updated = firstRow(up.data);
  if (!updated) return { renewed: false, reason: "not_owner", lock: existing };
  return { renewed: true, lock: updated };
}

export async function releaseMorawarePopulationLock(db, { ownerToken } = {}) {
  const token = String(ownerToken ?? "").trim();
  if (!token) throw new Error("releaseMorawarePopulationLock: ownerToken required");
  const del = await db.from("eos_sync_locks").delete().eq("lock_name", lockName()).eq("locked_by", token).select("*");
  if (del.error) throw new Error(del.error.message || String(del.error));
  const removed = firstRow(del.data);
  if (!removed) return { released: false, reason: "not_owner" };
  return { released: true, lock: removed };
}

export async function assertMorawarePopulationLockOwner(db, { ownerToken, now = new Date(), renew = false } = {}) {
  const token = String(ownerToken ?? "").trim();
  if (!token) {
    return {
      ok: false,
      code: "population_lock_required",
      error: "Live Moraware population mutation requires an active moraware_population lock owner token."
    };
  }
  const existing = await readLock(db);
  const nowMs = now.getTime();
  if (!existing || !isActiveLock(existing, nowMs)) {
    return {
      ok: false,
      code: "population_lock_inactive",
      error: "moraware_population lock is missing or expired."
    };
  }
  if (String(existing.locked_by) !== token) {
    return {
      ok: false,
      code: "population_lock_denied",
      error: "moraware_population lock is owned by another run."
    };
  }
  if (renew) {
    const renewed = await renewMorawarePopulationLock(db, { ownerToken: token, now });
    return { ok: true, lock: renewed.lock || existing, renewed: Boolean(renewed.renewed) };
  }
  return { ok: true, lock: existing, renewed: false };
}

export function requireLiveCensusScope(raw) {
  const scope = pickCensusScope(raw);
  if (scope === CENSUS_SCOPE_FULL || scope === CENSUS_SCOPE_INCREMENTAL) return { ok: true, census_scope: scope };
  return {
    ok: false,
    code: "census_scope_required",
    error: "Live Moraware population import requires metadata.census_scope of full or incremental."
  };
}

export async function guardLiveMorawarePopulationWrite(
  db,
  { ownerToken, censusScope, requireCensusScope = false, now = new Date() } = {}
) {
  if (requireCensusScope) {
    const scope = requireLiveCensusScope(censusScope);
    if (!scope.ok) return { ...scope, status: 400 };
  }
  const asserted = await assertMorawarePopulationLockOwner(db, { ownerToken, now, renew: true });
  if (!asserted.ok) return { ...asserted, status: 409 };
  return {
    ok: true,
    lock: asserted.lock,
    census_scope: pickCensusScope(censusScope) || null
  };
}

export async function handleMorawarePopulationLockAction(
  db,
  { action, ownerToken, lockedBy, ttlMs, metadata, now = new Date() } = {}
) {
  const verb = String(action ?? "").trim().toLowerCase();
  if (verb === "acquire") {
    const token = String(ownerToken ?? "").trim() || createMorawarePopulationLockOwnerToken();
    const result = await acquireMorawarePopulationLock(db, { ownerToken: token, lockedBy, ttlMs, metadata, now });
    return { ...result, owner_token: token, action: "acquire" };
  }
  if (verb === "renew") {
    const result = await renewMorawarePopulationLock(db, { ownerToken, ttlMs, now, metadata });
    return { ...result, owner_token: ownerToken, action: "renew" };
  }
  if (verb === "release") {
    const result = await releaseMorawarePopulationLock(db, { ownerToken });
    return { ...result, owner_token: ownerToken, action: "release" };
  }
  return { ok: false, error: `Unknown population lock action "${action}"` };
}

export async function postMorawarePopulationLock({
  url,
  secret,
  action,
  ownerToken,
  lockedBy,
  ttlMs,
  metadata,
  fetchImpl = fetch
}) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-eos-cron-secret": secret,
      "x-moraware-sync-secret": secret,
      ...(ownerToken ? { [MORAWARE_POPULATION_LOCK_OWNER_HEADER]: ownerToken } : {})
    },
    body: JSON.stringify({
      action,
      owner_token: ownerToken || null,
      locked_by: lockedBy || null,
      ttl_ms: ttlMs || null,
      metadata: metadata || null
    })
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`moraware_population ${action} failed: HTTP ${res.status} ${JSON.stringify(parsed)}`);
    err.status = res.status;
    err.response = parsed;
    throw err;
  }
  return parsed;
}

export function startMorawarePopulationLockHeartbeat({ url, secret, ownerToken, intervalMs = MORAWARE_POPULATION_LOCK_HEARTBEAT_MS, logger, fetchImpl }) {
  const tick = async () => {
    try {
      await postMorawarePopulationLock({ url, secret, action: "renew", ownerToken, fetchImpl });
    } catch (e) {
      if (logger?.log) await logger.log("population_lock_renew_failed", { error: String(e?.message || e) });
    }
  };
  const id = setInterval(tick, intervalMs);
  if (typeof id.unref === "function") id.unref();
  return () => clearInterval(id);
}
