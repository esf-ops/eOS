/**
 * Canonical mailbox sync orchestration for Command Center.
 *
 * Reuses previewQuoteIntakeMailbox + importQuoteIntakeMailboxMessages only.
 * Process-local run state (no SQL). Every run must reach a terminal state.
 */

import { randomUUID } from "node:crypto";
import { readSafeQuoteIntakeConfig } from "./quoteIntakeConfig.mjs";
import {
  importQuoteIntakeMailboxMessages,
  previewQuoteIntakeMailbox
} from "./quoteIntakeMailboxService.mjs";

/**
 * @typedef {"idle"|"running"|"completed"|"failed"|"timed_out"|"abandoned_after_restart"|"not_configured"|"permission_denied"} SyncUiState
 */

/** Default overall worker budget (preview + import + soft bootstrap). */
export const MAILBOX_SYNC_DEFAULT_TIMEOUT_MS = 90_000;

/** @type {Map<string, object>} */
const runsByOrg = new Map();

/** Monotonic process boot marker — fresh process always starts with empty runs. */
const PROCESS_BOOT_ID = randomUUID();

function emptyResult() {
  return {
    checked: 0,
    created: 0,
    duplicates: 0,
    ignored: null,
    failed: 0,
    manualReview: 0
  };
}

function isTerminalState(state) {
  return (
    state === "completed" ||
    state === "failed" ||
    state === "timed_out" ||
    state === "abandoned_after_restart"
  );
}

function readTimeoutMs(env = process.env) {
  const raw = Number(env?.QUOTE_INTAKE_MAILBOX_SYNC_TIMEOUT_MS);
  // Floor 50ms supports unit tests; production should use ≥5000ms.
  if (Number.isFinite(raw) && raw >= 50 && raw <= 600_000) return Math.floor(raw);
  return MAILBOX_SYNC_DEFAULT_TIMEOUT_MS;
}

function elapsedSecondsSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

function categorizeError(e) {
  const code = String(e?.code || "");
  if (code === "graph_disabled" || code === "graph_not_configured") {
    return {
      category: "not_configured",
      message: "Mailbox sync is not configured.",
      retryable: false
    };
  }
  if (code === "graph_token_failed") {
    return {
      category: "graph_authentication_failed",
      message: "Mailbox authentication failed.",
      retryable: true
    };
  }
  if (code === "graph_forbidden") {
    return {
      category: "permission_denied",
      message: "Mailbox access denied.",
      retryable: false
    };
  }
  if (code === "graph_throttled" || code === "graph_timeout" || code === "graph_unavailable") {
    return {
      category: "graph_unavailable",
      message: "Microsoft Graph was temporarily unavailable.",
      retryable: true
    };
  }
  if (code === "preview_failed") {
    return {
      category: "preview_failed",
      message: "Mailbox preview failed. No estimate records were changed.",
      retryable: true
    };
  }
  if (code === "import_failed") {
    return {
      category: "import_failed",
      message: "Mailbox import failed. No estimate records were changed by this failure.",
      retryable: true
    };
  }
  if (code === "sync_timeout" || code === "timeout") {
    return {
      category: "timeout",
      message: "Inbox synchronization took too long and was stopped.",
      retryable: true
    };
  }
  if (code === "sync_busy") {
    return {
      category: "sync_busy",
      message: "A mailbox sync is already running.",
      retryable: true
    };
  }
  return {
    category: "unexpected",
    message: "The inbox could not be synchronized. No estimate records were changed by this failure.",
    retryable: true
  };
}

/**
 * Apply a terminal patch only if this run still owns the org slot and is non-terminal.
 * Generation + runId protect against late timed-out workers overwriting a newer run.
 *
 * @returns {boolean} whether the patch applied
 */
function finalizeRun(orgId, runId, generation, patch) {
  const current = runsByOrg.get(orgId);
  if (!current) return false;
  if (current.runId !== runId) return false;
  if (current.generation !== generation) return false;
  if (isTerminalState(current.state)) return false;

  current.state = patch.state;
  current.completedAt = patch.completedAt || new Date().toISOString();
  current.failedAt = patch.failedAt || (patch.state === "failed" ? current.completedAt : null);
  if (patch.result) current.result = { ...emptyResult(), ...patch.result };
  current.safeError = patch.safeError ?? null;
  if (patch.state === "completed") {
    current.lastSuccessfulAt = current.completedAt;
  }
  current.workerActive = false;
  current.lastHeartbeatAt = new Date().toISOString();
  if (current.timeoutHandle) {
    clearTimeout(current.timeoutHandle);
    current.timeoutHandle = null;
  }
  return true;
}

/**
 * If a run is still "running" past the timeout, mark timed_out (status-path self-heal).
 */
function reclaimStaleRunningRun(orgId, env = process.env) {
  const run = runsByOrg.get(orgId);
  if (!run || run.state !== "running") return run;
  const timeoutMs = Number(run.timeoutMs) || readTimeoutMs(env);
  const started = Date.parse(run.startedAt);
  if (!Number.isFinite(started)) {
    finalizeRun(orgId, run.runId, run.generation, {
      state: "abandoned_after_restart",
      completedAt: new Date().toISOString(),
      safeError: {
        category: "unexpected",
        message: "Mailbox sync lost its start time and was abandoned.",
        retryable: true
      },
      result: run.result || emptyResult()
    });
    return runsByOrg.get(orgId);
  }
  if (Date.now() - started >= timeoutMs) {
    finalizeRun(orgId, run.runId, run.generation, {
      state: "timed_out",
      completedAt: new Date().toISOString(),
      safeError: {
        category: "timeout",
        message: "Inbox synchronization took too long and was stopped.",
        retryable: true
      },
      result: run.result || emptyResult()
    });
    console.error("[quote-intake] mailbox sync timed out (reclaim)", {
      runId: run.runId,
      organizationId: orgId,
      timeoutMs
    });
  }
  return runsByOrg.get(orgId);
}

function toHistoryEntry(run) {
  return Object.freeze({
    runId: run.runId,
    startedAt: run.startedAt,
    completedAt: run.completedAt || null,
    initiatedBy: run.initiatedBy,
    status: run.state,
    created: run.result?.created ?? 0,
    duplicates: run.result?.duplicates ?? 0,
    failed: run.result?.failed ?? 0,
    safeErrorCategory: run.safeError?.category || null
  });
}

function publicStatus(orgId, env = process.env) {
  const cfg = readSafeQuoteIntakeConfig(env);
  reclaimStaleRunningRun(orgId, env);

  let run = runsByOrg.get(String(orgId || "")) || null;
  const configured = Boolean(cfg.mailboxSyncEnabled && cfg.graphConfigured);

  if (run?.state === "running" && run.workerActive !== true) {
    finalizeRun(orgId, run.runId, run.generation, {
      state: "abandoned_after_restart",
      completedAt: new Date().toISOString(),
      safeError: {
        category: "unexpected",
        message: "Mailbox sync lost its worker and was abandoned. You can try again.",
        retryable: true
      },
      result: run.result || emptyResult()
    });
    run = runsByOrg.get(String(orgId || "")) || null;
  }

  /** @type {SyncUiState} */
  let state = "idle";
  if (!cfg.quoteIntakeApiEnabled || !cfg.graphEnabled || !configured) {
    state = "not_configured";
  } else if (run?.state === "running" && run.workerActive) {
    state = "running";
  } else if (run && isTerminalState(run.state)) {
    state = run.state;
  } else {
    state = "idle";
  }

  const startedAt = run?.startedAt || null;
  const completedAt = run?.completedAt || null;
  let elapsedSeconds = null;
  if (startedAt) {
    if (completedAt) {
      const a = Date.parse(startedAt);
      const b = Date.parse(completedAt);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        elapsedSeconds = Math.max(0, Math.floor((b - a) / 1000));
      }
    } else {
      elapsedSeconds = elapsedSecondsSince(startedAt);
    }
  }

  const retryable =
    state === "idle" ||
    state === "completed" ||
    state === "failed" ||
    state === "timed_out" ||
    state === "abandoned_after_restart" ||
    Boolean(run?.safeError?.retryable);

  return Object.freeze({
    configured,
    canManualSync: configured && Boolean(cfg.mailboxSyncEnabled),
    mailboxDisplay: cfg.mailboxDisplay || null,
    state,
    runId: run?.runId || null,
    activeRunId: state === "running" ? run?.runId || null : null,
    startedAt,
    lastStartedAt: startedAt,
    completedAt,
    lastCompletedAt: completedAt,
    lastSuccessfulAt: run?.lastSuccessfulAt || null,
    elapsedSeconds,
    lastHeartbeatAt: run?.lastHeartbeatAt || null,
    initiatedBy: run?.initiatedBy || null,
    retryable,
    result: run?.result ? { ...run.result } : emptyResult(),
    safeError: run?.safeError || null,
    recentRuns: run ? [toHistoryEntry(run)] : [],
    processBootId: PROCESS_BOOT_ID,
    persistenceNote:
      "Run history is process-local until a durable sync-run store is added. Fresh processes start idle. No SQL in this branch. Distributed multi-instance lock is a later hardening task."
  });
}

/**
 * Safe status snapshot — no Graph writes. Self-heals stale running runs.
 * @param {{ organizationId: string, env?: NodeJS.ProcessEnv }} input
 */
export function getQuoteIntakeMailboxSyncStatus(input) {
  return publicStatus(input.organizationId, input.env ?? process.env);
}

/**
 * Start or attach to the canonical mailbox sync for an organization.
 * Returns immediately (202 semantics at the route).
 *
 * @param {object} input same deps as importQuoteIntakeMailboxMessages + organizationId
 */
export function startOrAttachQuoteIntakeMailboxSync(input) {
  const env = input.env ?? process.env;
  const orgId = String(input.organizationId || "").trim();
  if (!orgId) {
    const err = new Error("organization required");
    err.code = "graph_forbidden";
    err.statusCode = 400;
    throw err;
  }

  reclaimStaleRunningRun(orgId, env);

  const existing = runsByOrg.get(orgId);
  if (existing?.state === "running" && existing.workerActive) {
    return {
      attached: true,
      accepted: true,
      status: publicStatus(orgId, env)
    };
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const timeoutMs = readTimeoutMs(env);
  const generation = (existing?.generation || 0) + 1;
  const run = {
    runId,
    organizationId: orgId,
    state: "running",
    startedAt,
    completedAt: null,
    failedAt: null,
    lastSuccessfulAt: existing?.lastSuccessfulAt || null,
    initiatedBy: "manual",
    result: emptyResult(),
    safeError: null,
    generation,
    workerActive: true,
    lastHeartbeatAt: startedAt,
    timeoutMs,
    timeoutHandle: null
  };
  runsByOrg.set(orgId, run);

  run.timeoutHandle = setTimeout(() => {
    const applied = finalizeRun(orgId, runId, generation, {
      state: "timed_out",
      completedAt: new Date().toISOString(),
      safeError: {
        category: "timeout",
        message: "Inbox synchronization took too long and was stopped.",
        retryable: true
      },
      result: runsByOrg.get(orgId)?.result || emptyResult()
    });
    if (applied) {
      console.error("[quote-intake] mailbox sync timed out", {
        runId,
        organizationId: orgId,
        timeoutMs
      });
    }
  }, timeoutMs);
  // Do not keep the process alive solely for the timeout handle.
  if (typeof run.timeoutHandle.unref === "function") run.timeoutHandle.unref();

  // Launch worker outside the request turn; never await here.
  setImmediate(() => {
    void executeRun(run, { ...input, env }).catch((e) => {
      console.error("[quote-intake] mailbox sync worker rejected", {
        runId,
        organizationId: orgId,
        code: e?.code || "unexpected"
      });
      finalizeRun(orgId, runId, generation, {
        state: "failed",
        completedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        safeError: categorizeError(e),
        result: emptyResult()
      });
    });
  });

  return {
    attached: false,
    accepted: true,
    status: publicStatus(orgId, env)
  };
}

function heartbeat(run) {
  run.lastHeartbeatAt = new Date().toISOString();
}

/**
 * Race a promise against the remaining run budget. Does not cancel the underlying
 * connector; late completion is ignored via generation/runId checks in finalizeRun.
 */
function withRunBudget(run, promise) {
  const timeoutMs = Number(run.timeoutMs) || MAILBOX_SYNC_DEFAULT_TIMEOUT_MS;
  const started = Date.parse(run.startedAt) || Date.now();
  const remaining = Math.max(1, timeoutMs - (Date.now() - started));
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Inbox synchronization took too long and was stopped.");
      err.code = "sync_timeout";
      reject(err);
    }, remaining);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * @param {object} run
 * @param {object} input
 */
async function executeRun(run, input) {
  const orgId = run.organizationId;
  const runId = run.runId;
  const generation = run.generation;

  try {
    heartbeat(run);

    let preview;
    try {
      preview = await withRunBudget(
        run,
        previewQuoteIntakeMailbox({
          env: input.env,
          organizationId: orgId,
          actorUserId: input.actorUserId ?? null,
          repository: input.repository,
          graphClient: input.graphClient,
          fetchImpl: input.fetchImpl,
          body: {}
        })
      );
    } catch (e) {
      if (e?.code === "sync_timeout") throw e;
      const err = e instanceof Error ? e : new Error("preview failed");
      if (!err.code) err.code = "preview_failed";
      throw err;
    }

    heartbeat(run);

    // If we already timed out while awaiting, stop without mutating a newer run.
    const mid = runsByOrg.get(orgId);
    if (!mid || mid.runId !== runId || mid.generation !== generation || isTerminalState(mid.state)) {
      return;
    }

    const messages = Array.isArray(preview?.messages) ? preview.messages : [];
    const importableIds = messages
      .filter((m) => m && m.importable === true && m.graphMessageId)
      .map((m) => String(m.graphMessageId));

    const checked = messages.length;
    const alreadyImported = messages.filter(
      (m) => m?.alreadyImported || m?.eligibilityHint === "already_imported"
    ).length;
    const ignored = messages.filter(
      (m) =>
        m &&
        m.importable !== true &&
        !(m.alreadyImported || m.eligibilityHint === "already_imported")
    ).length;

    let created = 0;
    let duplicates = alreadyImported;
    let failed = 0;
    let manualReview = 0;

    // Publish intermediate counters so status is not stuck at zeros during import.
    mid.result = {
      checked,
      created,
      duplicates,
      ignored,
      failed,
      manualReview
    };
    heartbeat(mid);

    if (importableIds.length) {
      let imported;
      try {
        imported = await withRunBudget(
          run,
          importQuoteIntakeMailboxMessages({
            env: input.env,
            organizationId: orgId,
            actorUserId: input.actorUserId ?? null,
            repository: input.repository,
            graphClient: input.graphClient,
            fetchImpl: input.fetchImpl,
            body: { messageIds: importableIds, confirm: true },
            getSupabase: input.getSupabase,
            ensureStudioEstimate: input.ensureStudioEstimate,
            scheduleFn: input.scheduleFn,
            bootstrapIntakeCases: input.bootstrapIntakeCases
          })
        );
      } catch (e) {
        if (e?.code === "sync_timeout") throw e;
        const err = e instanceof Error ? e : new Error("import failed");
        if (!err.code) err.code = "import_failed";
        throw err;
      }

      const audit = imported?.audit || {};
      created = Number.isFinite(Number(audit.createdCount)) ? Number(audit.createdCount) : 0;
      duplicates =
        alreadyImported +
        (Number.isFinite(Number(audit.duplicateCount)) ? Number(audit.duplicateCount) : 0);
      failed = Number.isFinite(Number(audit.failedCount)) ? Number(audit.failedCount) : 0;
      manualReview = Number.isFinite(Number(audit.manualReviewCount))
        ? Number(audit.manualReviewCount)
        : 0;
    }

    finalizeRun(orgId, runId, generation, {
      state: "completed",
      completedAt: new Date().toISOString(),
      result: {
        checked,
        created,
        duplicates,
        ignored,
        failed,
        manualReview
      },
      safeError: null
    });
  } catch (e) {
    const timedOut = String(e?.code || "") === "sync_timeout";
    console.error("[quote-intake] mailbox sync worker error", {
      runId,
      organizationId: orgId,
      code: e?.code || "unexpected",
      category: timedOut ? "timeout" : categorizeError(e).category
    });
    finalizeRun(orgId, runId, generation, {
      state: timedOut ? "timed_out" : "failed",
      completedAt: new Date().toISOString(),
      failedAt: timedOut ? null : new Date().toISOString(),
      safeError: categorizeError(
        timedOut
          ? Object.assign(new Error("Inbox synchronization took too long and was stopped."), {
              code: "sync_timeout"
            })
          : e
      ),
      result: runsByOrg.get(orgId)?.result || emptyResult()
    });
  } finally {
    const current = runsByOrg.get(orgId);
    if (
      current &&
      current.runId === runId &&
      current.generation === generation &&
      current.state === "running"
    ) {
      // Guaranteed terminalization if try/catch somehow left us running.
      finalizeRun(orgId, runId, generation, {
        state: "failed",
        completedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        safeError: {
          category: "unexpected",
          message:
            "The inbox could not be synchronized. No estimate records were changed by this failure.",
          retryable: true
        },
        result: current.result || emptyResult()
      });
    }
  }
}

/** Test helper — clear process-local state. */
export function __resetQuoteIntakeMailboxSyncStateForTests() {
  for (const run of runsByOrg.values()) {
    if (run?.timeoutHandle) clearTimeout(run.timeoutHandle);
  }
  runsByOrg.clear();
}

/** Test helper — inspect process-local run (no secrets). */
export function __getQuoteIntakeMailboxSyncRunForTests(organizationId) {
  const run = runsByOrg.get(String(organizationId || ""));
  if (!run) return null;
  return {
    runId: run.runId,
    state: run.state,
    generation: run.generation,
    workerActive: Boolean(run.workerActive),
    startedAt: run.startedAt,
    completedAt: run.completedAt || null
  };
}

/**
 * Test helper — force a stuck running record (workerActive false) to simulate
 * lost worker without waiting for timeout.
 */
export function __forceStuckRunningRunForTests(organizationId, overrides = {}) {
  const orgId = String(organizationId || "");
  const run = {
    runId: overrides.runId || randomUUID(),
    organizationId: orgId,
    state: "running",
    startedAt: overrides.startedAt || new Date(Date.now() - 1_000).toISOString(),
    completedAt: null,
    failedAt: null,
    lastSuccessfulAt: null,
    initiatedBy: "manual",
    result: emptyResult(),
    safeError: null,
    generation: overrides.generation || 1,
    workerActive: overrides.workerActive === true,
    lastHeartbeatAt: null,
    timeoutMs: overrides.timeoutMs || 1_000,
    timeoutHandle: null
  };
  runsByOrg.set(orgId, run);
  return run;
}
