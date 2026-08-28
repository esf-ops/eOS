/**
 * Durable, PII-safe reconciliation progress.
 * Operators poll sync_state / health instead of waiting on a shell.
 */

import { randomUUID } from "node:crypto";
import { SALES_OPS_RECONCILE_STALL_MS } from "./salesOpsConstants.js";

export const RECONCILE_STAGES = Object.freeze([
  "schema",
  "users",
  "groups",
  "parent_items",
  "column_values",
  "subitems",
  "updates",
  "replies",
  "assets",
  "docs",
  "projection",
  "membership_reconcile",
  "complete"
]);

const SAFE_ERROR_MAX = 500;

export function formatElapsed(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  const s = Math.floor(n / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function deriveActivityState(progress, nowMs = Date.now()) {
  const status = String(progress?.status || "");
  if (status === "completed") return "COMPLETE";
  if (status === "failed") return "FAILED";
  if (progress?.rateLimitActive) return "RATE_LIMITED";
  const last = Date.parse(progress?.lastProgressAt || "");
  if (
    status === "running" &&
    Number.isFinite(last) &&
    nowMs - last > SALES_OPS_RECONCILE_STALL_MS &&
    !progress?.rateLimitActive
  ) {
    return "STALLED";
  }
  return "ACTIVE";
}

export function sanitizeProgress(progress) {
  if (!progress || typeof progress !== "object") return {};
  const elapsedMs = Number(progress.elapsedMs) || 0;
  const activityState = progress.activityState || deriveActivityState(progress);
  return {
    runId: progress.runId || null,
    syncMode: progress.syncMode || "full",
    status: progress.status || "running",
    activityState,
    stage: progress.stage || null,
    startedAt: progress.startedAt || null,
    lastProgressAt: progress.lastProgressAt || null,
    completedAt: progress.completedAt || null,
    elapsedMs,
    elapsed: formatElapsed(elapsedMs),
    parentProcessed: Number(progress.parentProcessed) || 0,
    parentTotal: progress.parentTotal == null ? null : Number(progress.parentTotal),
    subitemsProcessed: Number(progress.subitemsProcessed) || 0,
    updatesProcessed: Number(progress.updatesProcessed) || 0,
    repliesProcessed: Number(progress.repliesProcessed) || 0,
    assetsProcessed: Number(progress.assetsProcessed) || 0,
    docsProcessed: Number(progress.docsProcessed) || 0,
    projectionProcessed: Number(progress.projectionProcessed) || 0,
    projectionTotal: progress.projectionTotal == null ? null : Number(progress.projectionTotal),
    page: Number(progress.page) || 0,
    batchSize: Number(progress.batchSize) || 0,
    mondayRequestCount: Number(progress.mondayRequestCount) || 0,
    dbBatchCount: Number(progress.dbBatchCount) || 0,
    rateLimitWaitMs: Number(progress.rateLimitWaitMs) || 0,
    rateLimitActive: Boolean(progress.rateLimitActive),
    retries: Number(progress.retries) || 0,
    errors: Number(progress.errors) || 0,
    warnings: Number(progress.warnings) || 0,
    lastSafeError: progress.lastSafeError ? String(progress.lastSafeError).slice(0, SAFE_ERROR_MAX) : null,
    stageTimings: progress.stageTimings && typeof progress.stageTimings === "object" ? progress.stageTimings : {}
  };
}

function emitSafe(progress) {
  const safe = sanitizeProgress(progress);
  const line = {
    sales_ops_reconcile: true,
    runId: safe.runId,
    stage: safe.stage,
    processed: safe.parentProcessed,
    expected: safe.parentTotal,
    projection: safe.projectionTotal == null ? undefined : `${safe.projectionProcessed}/${safe.projectionTotal}`,
    page: safe.page || undefined,
    rate_limit_wait: safe.rateLimitActive ? `${(safe.rateLimitWaitMs / 1000).toFixed(1)}s` : undefined,
    elapsed: safe.elapsed,
    activityState: safe.activityState,
    errors: safe.errors,
    warnings: safe.warnings
  };
  console.info(JSON.stringify(line));
}

export function createReconcileProgress({
  store,
  organizationId,
  mondayBoardId,
  syncMode = "full",
  runId = randomUUID(),
  now = () => new Date().toISOString()
} = {}) {
  const startedAt = now();
  const startedMs = Date.now();
  const stageStarted = new Map();
  const state = {
    runId,
    syncMode,
    status: "running",
    activityState: "ACTIVE",
    stage: "schema",
    startedAt,
    lastProgressAt: startedAt,
    completedAt: null,
    elapsedMs: 0,
    parentProcessed: 0,
    parentTotal: null,
    subitemsProcessed: 0,
    updatesProcessed: 0,
    repliesProcessed: 0,
    assetsProcessed: 0,
    docsProcessed: 0,
    projectionProcessed: 0,
    projectionTotal: null,
    page: 0,
    batchSize: 0,
    mondayRequestCount: 0,
    dbBatchCount: 0,
    rateLimitWaitMs: 0,
    rateLimitActive: false,
    retries: 0,
    errors: 0,
    warnings: 0,
    lastSafeError: null,
    stageTimings: {}
  };

  function touch() {
    state.lastProgressAt = now();
    state.elapsedMs = Date.now() - startedMs;
    state.activityState = deriveActivityState(state);
  }

  async function persist() {
    touch();
    const metadata = sanitizeProgress(state);
    if (typeof store?.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId,
        syncMode,
        metadata,
        lastError: state.status === "failed" ? state.lastSafeError : null
      });
    }
    emitSafe(state);
  }

  return {
    runId,
    get snapshot() {
      return sanitizeProgress(state);
    },
    async start() {
      stageStarted.set(state.stage, Date.now());
      await persist();
    },
    async setStage(stage, extra = {}) {
      const prev = state.stage;
      if (prev && stageStarted.has(prev)) {
        state.stageTimings[prev] = (state.stageTimings[prev] || 0) + (Date.now() - stageStarted.get(prev));
      }
      state.stage = stage;
      stageStarted.set(stage, Date.now());
      Object.assign(state, extra);
      await persist();
    },
    async tick(extra = {}) {
      Object.assign(state, extra);
      await persist();
    },
    noteMondayRequest() {
      state.mondayRequestCount += 1;
    },
    noteDbBatch(n = 1) {
      state.dbBatchCount += Number(n) || 1;
    },
    async noteRateLimit({ waitMs = 0, attempt = 0 } = {}) {
      state.rateLimitActive = true;
      state.rateLimitWaitMs += Number(waitMs) || 0;
      state.retries += 1;
      state.activityState = "RATE_LIMITED";
      await persist();
      void attempt;
    },
    clearRateLimit() {
      state.rateLimitActive = false;
    },
    async complete(extra = {}) {
      Object.assign(state, extra);
      state.status = "completed";
      state.activityState = "COMPLETE";
      state.stage = "complete";
      state.completedAt = now();
      if (stageStarted.has("complete") === false) stageStarted.set("complete", Date.now());
      await persist();
      return sanitizeProgress(state);
    },
    async fail(error) {
      state.status = "failed";
      state.activityState = "FAILED";
      state.errors += 1;
      state.lastSafeError = String(error?.message || error || "reconcile_failed").slice(0, SAFE_ERROR_MAX);
      state.completedAt = now();
      await persist();
      return sanitizeProgress(state);
    }
  };
}

export function reconcileStatusFromSyncState(row, nowMs = Date.now()) {
  const metadata = sanitizeProgress(row?.metadata || {});
  const activityState = deriveActivityState(metadata, nowMs);
  return {
    ...metadata,
    activityState,
    lastSuccessfulReconcileAt: row?.lastSuccessfulReconcileAt || row?.last_successful_reconcile_at || null,
    lastCompleteCensusAt: row?.lastCompleteCensusAt || row?.last_complete_census_at || null
  };
}
