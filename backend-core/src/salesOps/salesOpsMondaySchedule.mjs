/**
 * Tiered READ-ONLY Monday → Sales Ops schedule.
 * Brain/Vercel Cron owns this. Not the Moraware Mac mini.
 * Future signed webhooks may call runLightMondayAccountSync({ itemIds }) for targeted refresh.
 * Schedules remain the safety net. Monday writes stay disabled.
 */

import { isMondayReadEnabled, isMondayWriteEnabled } from "./salesOpsMondayMirror.mjs";
import { runFullMondayReconcile } from "./salesOpsMondayReconcile.mjs";
import { runLightMondayAccountSync } from "./salesOpsMondayLightSync.mjs";
import { reconcileStatusFromSyncState, sanitizeProgress } from "./salesOpsMondayProgress.mjs";
import {
  createMondayScheduleLockOwnerToken,
  deferReasonForJob,
  heldJobTypeFromLock,
  mondayScheduleLockTtlMs
} from "./salesOpsMondayScheduleLock.mjs";

export const MONDAY_SYNC_JOB_TYPES = Object.freeze(["light", "deep", "full"]);

export const MONDAY_SCHEDULE_TYPE = Object.freeze({
  light: "LIGHT_ACCOUNT",
  deep: "DEEP_REFRESH",
  full: "FULL_RECONCILE"
});

export const MONDAY_SYNC_CADENCE = Object.freeze({
  light: { cron: "*/5 * * * *", intervalMs: 5 * 60 * 1000, path: "/api/internal/sales-ops/monday-sync/light" },
  deep: { cron: "15 * * * *", intervalMs: 60 * 60 * 1000, path: "/api/internal/sales-ops/monday-sync/deep" },
  full: { cron: "0 8 * * *", intervalMs: 24 * 60 * 60 * 1000, path: "/api/internal/sales-ops/monday-sync/full" }
});

export const MONDAY_SCHEDULE_STALE_MS = Object.freeze({
  light: 15 * 60 * 1000,
  deep: 3 * 60 * 60 * 1000,
  full: 36 * 60 * 60 * 1000
});

export function normalizeMondaySyncJobType(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (v === "light" || v === "light_account") return "light";
  if (v === "deep" || v === "deep_refresh") return "deep";
  if (v === "full" || v === "full_reconcile") return "full";
  return null;
}

export function nextExpectedRunAt(jobType, now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (jobType === "light") {
    const ms = MONDAY_SYNC_CADENCE.light.intervalMs;
    return new Date(Math.ceil((d.getTime() + 1) / ms) * ms).toISOString();
  }
  if (jobType === "deep") {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 15, 0, 0));
    if (next.getTime() <= d.getTime()) next.setUTCHours(next.getUTCHours() + 1);
    return next.toISOString();
  }
  if (jobType === "full") {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0, 0));
    if (next.getTime() <= d.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }
  return null;
}

export function formatMondayScheduleSlot(jobType, row, now = new Date()) {
  const meta = sanitizeProgress(row?.metadata || {});
  const lastCompleted = row?.lastSuccessfulReconcileAt || (meta.status === "completed" ? meta.completedAt : null) || null;
  const lastStarted = meta.startedAt || null;
  const lastMs = lastCompleted ? Date.parse(lastCompleted) : NaN;
  const staleMs = MONDAY_SCHEDULE_STALE_MS[jobType] || MONDAY_SCHEDULE_STALE_MS.full;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const stale = !Number.isFinite(lastMs) || nowMs - lastMs > staleMs;
  const status = meta.status || (lastCompleted ? "completed" : "never_run");
  return {
    scheduleType: MONDAY_SCHEDULE_TYPE[jobType] || jobType,
    lastStarted,
    lastCompleted,
    status,
    activityState: meta.activityState || (status === "never_run" ? "NEVER_RUN" : null),
    durationMs: Number(meta.elapsedMs) || 0,
    duration: meta.elapsed || null,
    recordsProcessed: Number(meta.parentProcessed) || 0,
    itemsProcessed: Number(meta.parentProcessed) || 0,
    mondayRequestCount: Number(meta.mondayRequestCount) || 0,
    dbBatchCount: Number(meta.dbBatchCount) || 0,
    rateLimitWaitMs: Number(meta.rateLimitWaitMs) || 0,
    rateLimitActive: Boolean(meta.rateLimitActive),
    lastSafeError: meta.lastSafeError || row?.lastError || null,
    nextExpectedRun: nextExpectedRunAt(jobType, now),
    stale,
    lastCompleteCensusAt: jobType === "full" ? row?.lastCompleteCensusAt || null : null
  };
}

export async function loadMondayScheduleStatus(store, organizationId, boardId, now = new Date()) {
  if (!boardId || typeof store.getMondaySyncState !== "function") {
    return {
      LIGHT_ACCOUNT: formatMondayScheduleSlot("light", null, now),
      DEEP_REFRESH: formatMondayScheduleSlot("deep", null, now),
      FULL_RECONCILE: formatMondayScheduleSlot("full", null, now)
    };
  }
  const [light, deep, full] = await Promise.all([
    store.getMondaySyncState(organizationId, boardId, "light"),
    store.getMondaySyncState(organizationId, boardId, "deep"),
    store.getMondaySyncState(organizationId, boardId, "full")
  ]);
  return {
    LIGHT_ACCOUNT: formatMondayScheduleSlot("light", light, now),
    DEEP_REFRESH: formatMondayScheduleSlot("deep", deep, now),
    FULL_RECONCILE: formatMondayScheduleSlot("full", full, now)
  };
}

export async function listMondayReadConfigs(store) {
  if (typeof store.listMondayReadConfigs === "function") {
    return (await store.listMondayReadConfigs()) || [];
  }
  const org = String(process.env.SALES_OPS_ORGANIZATION_ID || process.env.MORAWARE_DEFAULT_ORGANIZATION_ID || "").trim();
  if (!org || typeof store.getMondayConfig !== "function") return [];
  const cfg = await store.getMondayConfig(org);
  return cfg ? [cfg] : [];
}

export async function withMondayScheduleLock(store, { organizationId, jobType }, fn) {
  if (typeof store.acquireMondayScheduleLock !== "function") {
    return { ok: true, deferred: false, result: await fn() };
  }
  const ownerToken = createMondayScheduleLockOwnerToken();
  const acquired = await store.acquireMondayScheduleLock({
    organizationId,
    ownerToken,
    jobType,
    ttlMs: mondayScheduleLockTtlMs(jobType)
  });
  if (!acquired.acquired) {
    return {
      ok: true,
      deferred: true,
      reason: deferReasonForJob(jobType, acquired.heldJobType || heldJobTypeFromLock(acquired.lock)),
      heldJobType: acquired.heldJobType || heldJobTypeFromLock(acquired.lock),
      recoveredStale: false
    };
  }
  try {
    const result = await fn();
    return { ok: true, deferred: false, recoveredStale: Boolean(acquired.recovered_stale), result };
  } finally {
    if (typeof store.releaseMondayScheduleLock === "function") {
      await store.releaseMondayScheduleLock({ organizationId, ownerToken });
    }
  }
}

async function runJobForConfig(store, monday, { cfg, jobType, actorUserId, itemIds }) {
  const organizationId = cfg.organizationId;
  const writeEnabled = isMondayWriteEnabled(cfg);
  const locked = await withMondayScheduleLock(store, { organizationId, jobType }, async () => {
    if (jobType === "light") {
      return runLightMondayAccountSync(store, monday, { organizationId, cfg, actorUserId, itemIds });
    }
    return runFullMondayReconcile(store, monday, {
      organizationId,
      cfg,
      actorUserId,
      syncMode: jobType === "deep" ? "deep" : "full",
      markUnseen: jobType === "full"
    });
  });
  if (locked.deferred) {
    return {
      ok: true,
      deferred: true,
      organizationId,
      jobType,
      scheduleType: MONDAY_SCHEDULE_TYPE[jobType],
      reason: locked.reason,
      heldJobType: locked.heldJobType || null,
      writeEnabled: Boolean(writeEnabled),
      readEnabled: isMondayReadEnabled(cfg)
    };
  }
  return {
    ...locked.result,
    deferred: false,
    organizationId,
    jobType,
    scheduleType: MONDAY_SCHEDULE_TYPE[jobType],
    writeEnabled: Boolean(writeEnabled),
    readEnabled: isMondayReadEnabled(cfg)
  };
}

export async function runScheduledMondayJob({
  store,
  monday,
  jobType,
  organizationId = null,
  itemIds = null,
  actorUserId = null
} = {}) {
  const normalized = normalizeMondaySyncJobType(jobType);
  if (!normalized) {
    const err = new Error("Unknown Monday schedule job type.");
    err.status = 400;
    err.code = "unknown_job_type";
    throw err;
  }
  const wanted = organizationId ? String(organizationId).trim() : "";
  const configs = wanted
    ? [(await store.getMondayConfig(wanted))].filter(Boolean)
    : await listMondayReadConfigs(store);
  const eligible = configs.filter(
    (cfg) => cfg?.organizationId && cfg.accountMasterBoardId && isMondayReadEnabled(cfg)
  );
  const results = [];
  for (const cfg of eligible) {
    results.push(
      await runJobForConfig(store, monday, {
        cfg,
        jobType: normalized,
        actorUserId,
        itemIds: normalized === "light" ? itemIds : null
      })
    );
  }
  const deferred = results.filter((r) => r.deferred).length;
  const failed = results.filter((r) => r.ok === false).length;
  return {
    ok: true,
    jobType: normalized,
    scheduleType: MONDAY_SCHEDULE_TYPE[normalized],
    writeEnabled: false,
    webhookEnabled: false,
    organizations: eligible.length,
    deferred,
    failed,
    results
  };
}

export function mondayScheduleHealthFields({ cfg, schedules, now = new Date() } = {}) {
  const light = schedules?.LIGHT_ACCOUNT || formatMondayScheduleSlot("light", null, now);
  const deep = schedules?.DEEP_REFRESH || formatMondayScheduleSlot("deep", null, now);
  const full = schedules?.FULL_RECONCILE || formatMondayScheduleSlot("full", null, now);
  return {
    ownershipStale: Boolean(light.stale),
    deepRefreshStale: Boolean(deep.stale),
    fullReconcileStale: Boolean(full.stale),
    lastFullReconcileAt: cfg?.lastFullReconcileAt ?? cfg?.lastFullSyncAt ?? full.lastCompleteCensusAt ?? null,
    lastSuccessAt: cfg?.lastSuccessAt ?? light.lastCompleted ?? deep.lastCompleted ?? full.lastCompleted ?? null,
    schedules: {
      LIGHT_ACCOUNT: light,
      DEEP_REFRESH: deep,
      FULL_RECONCILE: full
    }
  };
}

export { reconcileStatusFromSyncState };
