/**
 * Slice 1 — after supported PDF intake: idempotent open-estimate + async AI queue.
 * Never blocks the estimator; never awaits full AI extraction.
 */

import { isQuoteIntakeAutomaticTakeoffEnabled } from "./quoteIntakeConfig.mjs";
import { TAKEOFF_INITIATION_MODE } from "./quoteIntakeTypes.mjs";
import { openEstimateForIntakeCase } from "../takeoff/intakeOpenEstimateService.mjs";
import { startAiTakeoffGeneration } from "../takeoff/takeoffGenerationOrchestrator.mjs";
import { readExtractionConfig } from "../takeoff/takeoffAiProvider.mjs";

/**
 * @param {object} caseRow
 * @returns {{ ok: true, attachment: object } | { ok: false, reason: string }}
 */
export function selectSingleSupportedPdfAttachment(caseRow) {
  const attachments = Array.isArray(caseRow?.attachments) ? caseRow.attachments : [];
  const pdfs = attachments.filter((a) => {
    const ct = String(a?.contentType ?? a?.mimeType ?? "").toLowerCase();
    const name = String(a?.safeFilename ?? a?.filename ?? "").toLowerCase();
    const kind = String(a?.kind ?? a?.classification ?? "").toLowerCase();
    return (
      ct.includes("pdf") ||
      name.endsWith(".pdf") ||
      kind === "pdf" ||
      kind === "supported_pdf"
    );
  });
  if (pdfs.length === 0) return { ok: false, reason: "no_supported_pdf" };
  if (pdfs.length > 1) return { ok: false, reason: "multi_pdf_ambiguous" };
  return { ok: true, attachment: pdfs[0] };
}

/**
 * Bootstrap Studio takeoff for one intake case: open-estimate then queue AI.
 *
 * @param {{
 *   repository: object,
 *   organizationId: string,
 *   intakeCaseId: string,
 *   actorUserId?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: Function,
 *   graphClient?: object|null,
 *   openEstimate?: typeof openEstimateForIntakeCase,
 *   startAi?: typeof startAiTakeoffGeneration,
 *   ensureStudioEstimate?: Function|null,
 *   scheduleFn?: Function,
 * }} deps
 */
export async function bootstrapIntakeCaseTakeoff(deps) {
  const env = deps.env ?? process.env;
  const organizationId = String(deps.organizationId ?? "").trim();
  const intakeCaseId = String(deps.intakeCaseId ?? "").trim();
  const openEstimate = deps.openEstimate || openEstimateForIntakeCase;
  const startAi = deps.startAi || startAiTakeoffGeneration;

  const base = {
    intakeCaseId,
    openEstimate: null,
    aiQueued: false,
    aiSkippedReason: null,
    studioEstimate: null,
    action: "Retry AI Takeoff or continue manually."
  };

  if (!isQuoteIntakeAutomaticTakeoffEnabled(env)) {
    return {
      ...base,
      ok: true,
      skipped: true,
      code: "automatic_takeoff_disabled",
      message: "Automatic AI Takeoff is disabled. Open the case to estimate manually."
    };
  }

  const caseRow = await deps.repository.getCase(organizationId, intakeCaseId);
  if (!caseRow) {
    return {
      ...base,
      ok: false,
      code: "case_not_found",
      message: "Intake case not found."
    };
  }

  const pdfPick = selectSingleSupportedPdfAttachment(caseRow);
  if (!pdfPick.ok) {
    return {
      ...base,
      ok: true,
      skipped: true,
      code: pdfPick.reason,
      message:
        pdfPick.reason === "multi_pdf_ambiguous"
          ? "Multiple PDFs found — open the case and choose a plan file."
          : "No supported PDF — open the case to estimate manually."
    };
  }

  let openResult;
  try {
    openResult = await openEstimate({
      repository: deps.repository,
      organizationId,
      intakeCaseId,
      actorUserId: deps.actorUserId ?? null,
      body: {},
      env,
      getSupabase: deps.getSupabase,
      graphClient: deps.graphClient ?? null,
      initiationMode: TAKEOFF_INITIATION_MODE.AUTOMATIC,
      repositoryMode: deps.repositoryMode
    });
  } catch (e) {
    const code = e?.code || "open_estimate_failed";
    // Soft-fail: case stays visible; estimator can open manually.
    return {
      ...base,
      ok: false,
      code,
      message: e?.message || "Unable to prepare takeoff for this case.",
      action:
        code === "multi_pdf_ambiguous" || code === "attachment_required"
          ? "Open the case and select a supported PDF."
          : "Retry Open Estimate or continue manually."
    };
  }

  const takeoffJobId = String(openResult?.takeoffJobId ?? "").trim();
  const out = {
    ...base,
    ok: true,
    openEstimate: {
      takeoffJobId: takeoffJobId || null,
      created: Boolean(openResult?.created),
      reused: Boolean(openResult?.reused),
      linkStatus: openResult?.linkStatus ?? null
    }
  };

  if (typeof deps.ensureStudioEstimate === "function" && takeoffJobId) {
    try {
      out.studioEstimate = await deps.ensureStudioEstimate({
        organizationId,
        intakeCaseId,
        takeoffJobId,
        actorUserId: deps.actorUserId ?? null
      });
    } catch {
      out.studioEstimate = { ok: false, code: "studio_estimate_deferred" };
    }
  }

  const aiConfig = readExtractionConfig(env);
  if (!aiConfig.enabled) {
    out.aiSkippedReason = "takeoff_ai_disabled";
    out.message = "Estimate is ready. AI Takeoff is unavailable — continue manually.";
    return out;
  }
  if (!aiConfig.apiKey) {
    out.aiSkippedReason = "takeoff_ai_key_missing";
    out.message = "Estimate is ready. AI Takeoff is not configured — continue manually.";
    return out;
  }
  if (!takeoffJobId || typeof deps.getSupabase !== "function") {
    out.aiSkippedReason = "takeoff_job_missing";
    out.message = "Estimate link created. Start AI Takeoff from the workspace if needed.";
    return out;
  }

  try {
    const supabase = deps.getSupabase();
    const ai = await startAi({
      supabase,
      organizationId,
      userId: deps.actorUserId ?? null,
      takeoffJobId,
      scheduleFn: deps.scheduleFn
    });
    out.aiQueued = Boolean(ai?.accepted || ai?.ok);
    out.ai = {
      accepted: Boolean(ai?.accepted || ai?.ok),
      reused: Boolean(ai?.reused),
      status: ai?.status ?? null,
      runId: ai?.runId ?? null
    };
    out.message = ai?.reused
      ? "AI Takeoff is already processing. You may continue building the estimate."
      : "AI Takeoff is queued. You may continue building the estimate.";
  } catch (e) {
    if (e?.code === "already_processing" || e?.statusCode === 409) {
      out.aiQueued = true;
      out.ai = { accepted: true, reused: true, status: "processing" };
      out.message = "AI Takeoff is already processing. You may continue building the estimate.";
      return out;
    }
    if (e?.code === "takeoff_already_approved") {
      out.aiSkippedReason = "takeoff_already_approved";
      out.message = "Takeoff is already approved. Continue in Scope Builder.";
      return out;
    }
    out.aiSkippedReason = e?.code || "ai_queue_failed";
    out.message =
      "Estimate is ready, but AI Takeoff could not be queued. Retry AI Takeoff or continue manually.";
    out.code = out.aiSkippedReason;
  }

  return out;
}

/**
 * Bootstrap many cases after mailbox import (best-effort; never fails the import).
 * @param {{
 *   repository: object,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   caseIds: string[],
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: Function,
 *   graphClient?: object|null,
 *   ensureStudioEstimate?: Function|null,
 *   scheduleFn?: Function,
 * }} deps
 */
export async function bootstrapIntakeCasesAfterImport(deps) {
  const caseIds = [...new Set((deps.caseIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const attempts = [];
  for (const intakeCaseId of caseIds) {
    try {
      const result = await bootstrapIntakeCaseTakeoff({
        ...deps,
        intakeCaseId
      });
      attempts.push({ intakeCaseId, ...result });
    } catch (e) {
      attempts.push({
        intakeCaseId,
        ok: false,
        code: e?.code || "bootstrap_failed",
        message: "Unable to auto-start takeoff for this case.",
        action: "Retry AI Takeoff or continue manually."
      });
    }
  }
  return {
    attempted: caseIds.length > 0,
    enabled: isQuoteIntakeAutomaticTakeoffEnabled(deps.env ?? process.env),
    attempts
  };
}
