/**
 * Canonical mailbox sync orchestration for Command Center.
 *
 * Reuses previewQuoteIntakeMailbox + importQuoteIntakeMailboxMessages only.
 * Does not call Graph directly. Process-local run state (no SQL in this branch).
 */

import { randomUUID } from "node:crypto";
import { readSafeQuoteIntakeConfig } from "./quoteIntakeConfig.mjs";
import {
  importQuoteIntakeMailboxMessages,
  previewQuoteIntakeMailbox
} from "./quoteIntakeMailboxService.mjs";

/** @typedef {"idle"|"running"|"completed"|"failed"|"not_configured"|"permission_denied"} SyncUiState */

/** @type {Map<string, object>} */
const runsByOrg = new Map();

function emptyResult() {
  return Object.freeze({
    checked: 0,
    created: 0,
    duplicates: 0,
    ignored: null,
    failed: 0,
    manualReview: 0
  });
}

function publicStatus(orgId, env = process.env) {
  const cfg = readSafeQuoteIntakeConfig(env);
  const run = runsByOrg.get(String(orgId || "")) || null;
  const configured = Boolean(cfg.mailboxSyncEnabled && cfg.graphConfigured);

  /** @type {SyncUiState} */
  let state = "idle";
  if (!cfg.quoteIntakeApiEnabled || !cfg.graphEnabled) state = "not_configured";
  else if (!configured) state = "not_configured";
  else if (run?.state === "running") state = "running";
  else if (run?.state === "failed") state = "failed";
  else if (run?.state === "completed") state = "completed";
  else state = "idle";

  return Object.freeze({
    configured,
    canManualSync: configured && Boolean(cfg.mailboxSyncEnabled),
    mailboxDisplay: cfg.mailboxDisplay || null,
    state,
    activeRunId: run?.state === "running" ? run.runId : null,
    lastStartedAt: run?.startedAt || null,
    lastCompletedAt: run?.completedAt || null,
    lastSuccessfulAt: run?.lastSuccessfulAt || null,
    initiatedBy: run?.initiatedBy || null,
    result: run?.result ? { ...run.result } : emptyResult(),
    safeError: run?.safeError || null,
    recentRuns: run ? [toHistoryEntry(run)] : [],
    persistenceNote:
      "Run history is process-local until a durable sync-run store is added. No SQL in this branch."
  });
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

function categorizeError(e) {
  const code = String(e?.code || "");
  if (code === "graph_disabled" || code === "graph_not_configured") {
    return {
      category: "not_configured",
      message: "Mailbox sync is not configured.",
      retryable: false
    };
  }
  if (code === "graph_token_failed" || code === "graph_forbidden") {
    return {
      category: "authentication_failed",
      message: "Mailbox authentication failed.",
      retryable: true
    };
  }
  if (code === "graph_throttled" || code === "graph_timeout" || code === "graph_unavailable") {
    return {
      category: "provider_unavailable",
      message: "Microsoft Graph was temporarily unavailable.",
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
    category: "sync_failed",
    message: "The inbox could not be synchronized. No estimate records were changed by this failure.",
    retryable: true
  };
}

/**
 * Safe status snapshot — no Graph writes.
 * @param {{ organizationId: string, env?: NodeJS.ProcessEnv }} input
 */
export function getQuoteIntakeMailboxSyncStatus(input) {
  return publicStatus(input.organizationId, input.env ?? process.env);
}

/**
 * Start or attach to the canonical mailbox sync for an organization.
 * Always returns immediately with a status DTO (202 semantics at the route).
 *
 * @param {object} input same deps as importQuoteIntakeMailboxMessages + organizationId
 */
export function startOrAttachQuoteIntakeMailboxSync(input) {
  const orgId = String(input.organizationId || "").trim();
  if (!orgId) {
    const err = new Error("organization required");
    err.code = "graph_forbidden";
    err.statusCode = 400;
    throw err;
  }

  const existing = runsByOrg.get(orgId);
  if (existing?.state === "running") {
    return {
      attached: true,
      accepted: true,
      status: publicStatus(orgId, input.env)
    };
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const run = {
    runId,
    organizationId: orgId,
    state: "running",
    startedAt,
    completedAt: null,
    lastSuccessfulAt: existing?.lastSuccessfulAt || null,
    initiatedBy: "manual",
    result: emptyResult(),
    safeError: null,
    generation: (existing?.generation || 0) + 1
  };
  runsByOrg.set(orgId, run);

  void executeRun(run, input).catch(() => {
    /* executeRun records safeError */
  });

  return {
    attached: false,
    accepted: true,
    status: publicStatus(orgId, input.env)
  };
}

/**
 * @param {object} run
 * @param {object} input
 */
async function executeRun(run, input) {
  const orgId = run.organizationId;
  try {
    const preview = await previewQuoteIntakeMailbox({
      env: input.env,
      organizationId: orgId,
      actorUserId: input.actorUserId ?? null,
      repository: input.repository,
      graphClient: input.graphClient,
      fetchImpl: input.fetchImpl,
      body: {}
    });

    const messages = Array.isArray(preview.messages) ? preview.messages : [];
    const importableIds = messages
      .filter((m) => m && m.importable === true && m.graphMessageId)
      .map((m) => String(m.graphMessageId));

    const checked = messages.length;
    const alreadyImported = messages.filter(
      (m) => m?.alreadyImported || m?.eligibilityHint === "already_imported"
    ).length;
    // Non-importable rows that are not already imported (manual review / ineligible).
    // Derived only from preview eligibility — never from unchecked mailbox totals.
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

    if (importableIds.length) {
      const imported = await importQuoteIntakeMailboxMessages({
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
      });
      const audit = imported.audit || {};
      created = Number.isFinite(Number(audit.createdCount))
        ? Number(audit.createdCount)
        : 0;
      duplicates += Number.isFinite(Number(audit.duplicateCount))
        ? Number(audit.duplicateCount)
        : 0;
      failed = Number.isFinite(Number(audit.failedCount)) ? Number(audit.failedCount) : 0;
      manualReview = Number.isFinite(Number(audit.manualReviewCount))
        ? Number(audit.manualReviewCount)
        : 0;
    }

    const current = runsByOrg.get(orgId);
    if (!current || current.runId !== run.runId) return;

    current.state = "completed";
    current.completedAt = new Date().toISOString();
    current.lastSuccessfulAt = current.completedAt;
    current.result = Object.freeze({
      checked,
      created,
      duplicates,
      ignored,
      failed,
      manualReview
    });
    current.safeError = null;
  } catch (e) {
    const current = runsByOrg.get(orgId);
    if (!current || current.runId !== run.runId) return;
    current.state = "failed";
    current.completedAt = new Date().toISOString();
    current.safeError = categorizeError(e);
    current.result = emptyResult();
  }
}

/** Test helper — clear process-local state. */
export function __resetQuoteIntakeMailboxSyncStateForTests() {
  runsByOrg.clear();
}
