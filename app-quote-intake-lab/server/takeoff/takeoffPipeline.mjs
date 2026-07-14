/**
 * Staged live takeoff pipeline (Pass 1 inventory → Pass 2 evidence → Pass 3 geometry).
 * Deterministic eliteOS calc remains authoritative for measured SF.
 */

import { applyDeterministicMeasurements } from "../../src/takeoff/labMeasurementCalc.mjs";
import { validateLabTakeoffRun } from "../../src/takeoff/validateLabTakeoff.mjs";
import {
  LAB_TAKEOFF_STATUS,
  PROVIDER_MODE_LIVE
} from "../../src/takeoff/takeoffTypes.mjs";
import { geminiTakeoffJsonGenerate } from "./geminiTakeoffClient.mjs";
import {
  TAKEOFF_EVIDENCE_PROMPT_VERSION,
  TAKEOFF_EVIDENCE_SYSTEM_PROMPT,
  TAKEOFF_GEOMETRY_PROMPT_VERSION,
  TAKEOFF_GEOMETRY_SYSTEM_PROMPT,
  TAKEOFF_INVENTORY_PROMPT_VERSION,
  TAKEOFF_INVENTORY_SYSTEM_PROMPT,
  buildEvidenceUserMessage,
  buildGeometryUserMessage,
  buildInventoryUserMessage
} from "./takeoffPrompts.mjs";
import {
  validateEvidencePass,
  validateGeometryPass,
  validateInventoryPass
} from "./validateProviderExtraction.mjs";
import { takeoffRequestAuditMeta } from "./sanitizeTakeoffRequest.mjs";

export const LIVE_TAKEOFF_PROVIDER_NAME = "LiveGeminiTakeoffAdapter";
export const LIVE_TAKEOFF_PROVIDER_VERSION = "live-gemini-takeoff-1.0.0";

/**
 * @param {{
 *   request: ReturnType<import('./sanitizeTakeoffRequest.mjs').sanitizeLiveTakeoffRequest>,
 *   config: object,
 *   fetchImpl?: typeof fetch,
 *   stagedProvider?: {
 *     inventory?: (meta:object)=>Promise<object>|object,
 *     evidence?: (meta:object, inventory:object)=>Promise<object>|object,
 *     geometry?: (meta:object, inventory:object, evidence:object)=>Promise<object>|object
 *   }
 * }} args
 */
export async function runLiveTakeoffPipeline({ request, config, fetchImpl, stagedProvider }) {
  if (!config.takeoff?.liveEnabled) {
    throw Object.assign(new Error("Live takeoff is disabled (QIL_LIVE_TAKEOFF_ENABLED=false)."), {
      statusCode: 503,
      code: "LIVE_TAKEOFF_DISABLED"
    });
  }
  if (config.takeoff.provider !== "gemini") {
    throw Object.assign(new Error(`Unsupported takeoff provider: ${config.takeoff.provider}`), {
      statusCode: 503,
      code: "UNSUPPORTED_PROVIDER"
    });
  }
  if (!stagedProvider) {
    if (!config._apiKey) {
      throw Object.assign(new Error("No Gemini API key configured for the lab server."), {
        statusCode: 503,
        code: "MISSING_API_KEY"
      });
    }
    if (!config.takeoff.model) {
      throw Object.assign(new Error("QIL_TAKEOFF_MODEL must be set — model is not guessed."), {
        statusCode: 503,
        code: "MISSING_MODEL"
      });
    }
  }

  const startedAt = new Date().toISOString();
  const meta = {
    caseId: request.caseId,
    filename: request.filename,
    mimeType: request.mimeType,
    contentHash: request.contentHash,
    maxPages: config.takeoff.maxPages
  };
  const passMeta = { inventory: null, evidence: null, geometry: null };

  // Pass 1 — inventory
  const inventoryRaw = await runPass({
    passLabel: "inventory",
    staged: stagedProvider?.inventory,
    stagedArgs: [meta],
    gemini: () =>
      geminiTakeoffJsonGenerate({
        apiKey: config._apiKey,
        modelName: config.takeoff.model,
        systemPrompt: TAKEOFF_INVENTORY_SYSTEM_PROMPT,
        userMessage: buildInventoryUserMessage(meta),
        mimeType: request.mimeType,
        contentBytes: request.contentBytes,
        timeoutMs: config.takeoff.timeoutMs,
        passLabel: "inventory",
        fetchImpl
      }),
    passMeta,
    promptVersion: TAKEOFF_INVENTORY_PROMPT_VERSION
  });
  const inventory = validateInventoryPass(inventoryRaw, { maxPages: config.takeoff.maxPages });

  // Pass 2 — evidence
  const evidenceRaw = await runPass({
    passLabel: "evidence",
    staged: stagedProvider?.evidence,
    stagedArgs: [meta, inventory],
    gemini: () =>
      geminiTakeoffJsonGenerate({
        apiKey: config._apiKey,
        modelName: config.takeoff.verificationModel || config.takeoff.model,
        systemPrompt: TAKEOFF_EVIDENCE_SYSTEM_PROMPT,
        userMessage: buildEvidenceUserMessage(meta, inventory),
        mimeType: request.mimeType,
        contentBytes: request.contentBytes,
        timeoutMs: config.takeoff.timeoutMs,
        passLabel: "evidence",
        fetchImpl
      }),
    passMeta,
    promptVersion: TAKEOFF_EVIDENCE_PROMPT_VERSION
  });
  const evidence = validateEvidencePass(evidenceRaw, { maxPages: config.takeoff.maxPages });

  // Pass 3 — geometry
  const geometryRaw = await runPass({
    passLabel: "geometry",
    staged: stagedProvider?.geometry,
    stagedArgs: [meta, inventory, evidence],
    gemini: () =>
      geminiTakeoffJsonGenerate({
        apiKey: config._apiKey,
        modelName: config.takeoff.verificationModel || config.takeoff.model,
        systemPrompt: TAKEOFF_GEOMETRY_SYSTEM_PROMPT,
        userMessage: buildGeometryUserMessage(meta, inventory, evidence),
        mimeType: request.mimeType,
        contentBytes: request.contentBytes,
        timeoutMs: config.takeoff.timeoutMs,
        passLabel: "geometry",
        fetchImpl
      }),
    passMeta,
    promptVersion: TAKEOFF_GEOMETRY_PROMPT_VERSION
  });
  const geometry = validateGeometryPass(geometryRaw, {
    maxPages: config.takeoff.maxPages,
    evidenceIds: new Set(evidence.evidence.map((e) => e.id))
  });

  const { rooms, calculation } = applyDeterministicMeasurements(
    geometry.rooms,
    geometry.providerTotals
  );

  const runId = `qil-toff-live-${compactStamp(startedAt)}-${Math.random().toString(16).slice(2, 8)}`;
  /** @type {import('../../src/takeoff/takeoffTypes.mjs').TakeoffRun} */
  let run = {
    id: runId,
    caseId: request.caseId,
    acceptedIntakeSnapshotId: request.acceptedIntakeSnapshotId,
    attachmentId: request.attachmentId,
    attachmentContentHash: request.contentHash,
    provider: {
      name: LIVE_TAKEOFF_PROVIDER_NAME,
      mode: PROVIDER_MODE_LIVE,
      version: LIVE_TAKEOFF_PROVIDER_VERSION,
      note: "Live Gemini takeoff via isolated lab server — provider totals are non-authoritative; deterministic calc owns measured SF."
    },
    startedAt,
    completedAt: new Date().toISOString(),
    labTakeoffStatus: LAB_TAKEOFF_STATUS.REVIEW,
    humanReviewState: "unreviewed",
    pages: geometry.pages?.length ? geometry.pages : inventory.pages,
    rooms,
    evidence: evidence.evidence,
    warnings: [
      ...inventory.warnings,
      ...evidence.warnings,
      ...geometry.warnings,
      {
        code: "PROVIDER_TOTALS_NON_AUTHORITATIVE",
        severity: "informational",
        message: "Provider-proposed totals are for reconciliation only. Deterministic eliteOS measurement is authoritative.",
        blocking: false,
        estimatorActionRequired: false
      }
    ],
    corrections: [],
    calculation,
    confidence: geometry.confidence,
    failure: null,
    acceptedSnapshotId: null,
    liveMeta: {
      inventoryPromptVersion: TAKEOFF_INVENTORY_PROMPT_VERSION,
      evidencePromptVersion: TAKEOFF_EVIDENCE_PROMPT_VERSION,
      geometryPromptVersion: TAKEOFF_GEOMETRY_PROMPT_VERSION,
      passes: passMeta,
      request: takeoffRequestAuditMeta(request)
    }
  };

  const validated = validateLabTakeoffRun(run);
  const forceManual =
    validated.warnings.some((w) => w.severity === "approval_blocking") ||
    geometry.warnings.some((w) => w.severity === "approval_blocking");
  run = {
    ...run,
    warnings: mergeWarnings(run.warnings, validated.warnings),
    labTakeoffStatus: forceManual ? LAB_TAKEOFF_STATUS.MANUAL_REVIEW : validated.labTakeoffStatus
  };

  assertNoSensitiveLeak(run);

  return {
    startedAt,
    completedAt: run.completedAt,
    run,
    audit: takeoffRequestAuditMeta(request),
    promptVersions: {
      inventory: TAKEOFF_INVENTORY_PROMPT_VERSION,
      evidence: TAKEOFF_EVIDENCE_PROMPT_VERSION,
      geometry: TAKEOFF_GEOMETRY_PROMPT_VERSION
    }
  };
}

async function runPass({ passLabel, staged, stagedArgs, gemini, passMeta, promptVersion }) {
  if (typeof staged === "function") {
    const parsed = await staged(...stagedArgs);
    passMeta[passLabel] = {
      model: "staged-fake",
      promptVersion,
      latencyMs: 0,
      usage: null,
      providerRequestId: null,
      parseError: null,
      mode: "fake"
    };
    return parsed;
  }
  const out = await gemini();
  passMeta[passLabel] = {
    model: out.modelUsed,
    promptVersion,
    latencyMs: out.latencyMs,
    usage: out.usage,
    providerRequestId: out.providerRequestId,
    parseError: out.parseError,
    mode: "live"
  };
  if (out.parseError || !out.parsed) {
    throw Object.assign(new Error(`${passLabel} pass returned invalid JSON.`), {
      statusCode: 502,
      code: "INVALID_JSON",
      details: { parseError: out.parseError }
    });
  }
  return out.parsed;
}

function mergeWarnings(a, b) {
  const seen = new Set();
  const out = [];
  for (const w of [...(a ?? []), ...(b ?? [])]) {
    const key = `${w.code}|${w.message}|${w.pieceId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

function compactStamp(iso) {
  return String(iso).replace(/[-:TZ.]/g, "").slice(0, 14);
}

function assertNoSensitiveLeak(run) {
  const blob = JSON.stringify(run);
  if (/generativelanguage\.googleapis\.com|AIza[0-9A-Za-z_-]{10,}/i.test(blob)) {
    throw new Error("Takeoff run must not embed provider URLs or API key material.");
  }
  if (/contentBase64|inline_data|BEGIN PRIVATE/i.test(blob)) {
    throw new Error("Takeoff run must not embed attachment content.");
  }
}
