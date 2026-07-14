import { buildClassificationRequest, fingerprintClassificationRequest } from "./buildClassificationRequest.mjs";
import { evidenceFromManualCorrection } from "./evidence.mjs";
import { getSimulatedIntakeIntelligenceProvider } from "./simulatedProvider.mjs";
import { getLiveIntakeIntelligenceProvider } from "./liveIntakeIntelligenceProvider.mjs";
import { assertCanTransition, canStartClassification } from "./stateTransitions.mjs";
import { FIELD_LABELS, PROVIDER_MODE_LIVE, PROVIDER_MODE_SIMULATED } from "./classificationTypes.mjs";
import {
  hasBlockingValidationWarnings,
  structureValidationWarnings
} from "./validationWarnings.mjs";

const SOFT_FAIL_CODES = new Set([
  "SERVER_UNAVAILABLE",
  "LIVE_DISABLED",
  "LAB_TOKEN_MISSING",
  "MISSING_API_KEY",
  "MISSING_MODEL",
  "UNAUTHORIZED",
  "TOKEN_NOT_CONFIGURED",
  "ORIGIN_DENIED"
]);

/**
 * Orchestrates classification runs / corrections / acceptance against a lab store.
 * UI talks to LocalQuoteIntakeRepository, which delegates here.
 */
export class ClassificationService {
  /**
   * @param {{ store: any, provider?: any, actorLabel?: string, liveProvider?: any }} opts
   */
  constructor(opts) {
    this._store = opts.store;
    this._provider = opts.provider ?? getSimulatedIntakeIntelligenceProvider();
    this._liveProvider = opts.liveProvider ?? getLiveIntakeIntelligenceProvider();
    this._actorLabel = opts.actorLabel ?? "Lab Estimator (fixture)";
  }

  resolveProvider(providerMode) {
    const mode = providerMode === PROVIDER_MODE_LIVE ? PROVIDER_MODE_LIVE : PROVIDER_MODE_SIMULATED;
    return mode === PROVIDER_MODE_LIVE ? this._liveProvider : this._provider;
  }

  /**
   * @param {import("../domain/types.ts").QuoteIntakeCase} caseRow
   * @param {{ actorLabel?: string, providerMode?: string }} [opts]
   */
  async runClassification(caseRow, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const provider = this.resolveProvider(opts.providerMode);
    const previousStatus = caseRow.status;

    if (!canStartClassification(caseRow.status) && caseRow.status !== "qil_classifying") {
      const err = new Error(`Case status ${caseRow.status} cannot start classification.`);
      err.code = "CLASSIFICATION_NOT_ALLOWED";
      throw err;
    }

    assertCanTransition(caseRow.status === "qil_classifying" ? "qil_classifying" : caseRow.status, "qil_classifying");

    const now = new Date().toISOString();
    await this._store.setCaseOverlay(caseRow.id, {
      status: "qil_classifying",
      updatedAt: now
    });
    await this._appendCaseEvent(caseRow, {
      at: now,
      actorType: "user",
      actorLabel: actor,
      eventType: "classification_started",
      summary: `Started ${provider.mode} classification (${provider.name} ${provider.version}).`
    });

    const request = buildClassificationRequest(caseRow);
    const inputFingerprint = await fingerprintClassificationRequest(request);
    const runId = `qil-run-${compactStamp(now)}-${inputFingerprint.slice(0, 8)}-${Math.random().toString(16).slice(2, 8)}`;

    let outcome;
    try {
      outcome = await provider.classify(request);
    } catch (e) {
      const failedAt = new Date().toISOString();
      const soft = SOFT_FAIL_CODES.has(e?.code);
      const restoreStatus =
        soft && previousStatus && previousStatus !== "qil_classifying" ? previousStatus : "qil_failed";

      const run = {
        id: runId,
        caseId: caseRow.id,
        providerName: provider.name,
        providerMode: provider.mode,
        providerVersion: provider.version,
        inputFingerprint,
        startedAt: now,
        completedAt: failedAt,
        result: null,
        warnings: [],
        failure: { message: String(e?.message ?? e), code: e?.code ?? "PROVIDER_FAILURE" },
        humanReviewState: "unreviewed",
        corrections: [],
        acceptedSnapshotId: null
      };
      await this._store.saveClassificationRun(run);

      if (restoreStatus === "qil_failed") {
        assertCanTransition("qil_classifying", "qil_failed");
      }

      await this._store.setCaseOverlay(caseRow.id, {
        status: restoreStatus,
        updatedAt: failedAt,
        latestClassificationRunId: runId,
        nextAction: soft
          ? `Live provider unavailable — switch to simulated or fix lab server (${e?.code ?? "error"})`
          : "Retry classification"
      });
      await this._appendCaseEvent(caseRow, {
        at: failedAt,
        actorType: "adapter",
        actorLabel: provider.name,
        eventType: "classification_failed",
        summary: `${provider.mode} classification failed (${e?.code ?? "error"}). Status restored to ${restoreStatus}.`
      });
      return { ok: false, runId, status: restoreStatus, softFailure: soft, code: e?.code ?? "PROVIDER_FAILURE" };
    }

    const result = outcome.result;
    const completedAt = outcome.completedAt ?? new Date().toISOString();
    const suggested = result.suggestedStatus;
    const rawWarnings =
      outcome.validationWarnings ??
      result.verification?.validationWarnings ??
      result.warnings ??
      [];
    const validationWarnings = structureValidationWarnings(rawWarnings);

    // Supersede prior unreviewed/corrected runs' review state when a newer run arrives
    const prior = await this._store.listClassificationRuns(caseRow.id);
    for (const p of prior) {
      if (p.humanReviewState === "unreviewed" || p.humanReviewState === "corrected") {
        await this._store.patchClassificationRun(p.id, { humanReviewState: "superseded" });
      }
    }

    const run = {
      id: runId,
      caseId: caseRow.id,
      providerName: provider.name,
      providerMode: provider.mode,
      providerVersion: provider.version,
      inputFingerprint,
      startedAt: outcome.startedAt ?? now,
      completedAt,
      result,
      warnings: validationWarnings.map((w) => w.message),
      validationWarnings,
      failure: null,
      humanReviewState: "unreviewed",
      corrections: [],
      acceptedSnapshotId: null
    };
    await this._store.saveClassificationRun(run);

    assertCanTransition("qil_classifying", suggested);
    const missingKeys = result.missingKeys ?? [];
    await this._store.setCaseOverlay(caseRow.id, {
      status: suggested,
      updatedAt: completedAt,
      latestClassificationRunId: runId,
      aiConfidence: result.overallConfidence,
      missingInformation: missingKeys,
      requestedColor: fieldValue(result.fields, "requestedColorText"),
      proposedSquareFootage: fieldValue(result.fields, "statedSquareFootage"),
      sinkCutoutCount: fieldValue(result.fields, "sinkCutoutCount"),
      edgeProfile: fieldValue(result.fields, "edgeProfile"),
      backsplashScope: fieldValue(result.fields, "backsplashDescription"),
      customerAccount: displayOrDash(fieldValue(result.fields, "customerAccount"), caseRow.customerAccount),
      projectName: displayOrDash(fieldValue(result.fields, "projectName"), caseRow.projectName),
      projectAddress: displayOrDash(fieldValue(result.fields, "projectAddress"), caseRow.projectAddress),
      // Never assign authoritative price group from AI inference
      resolvedPriceGroup: null,
      classificationProviderMode: provider.mode,
      classificationReviewState: "unreviewed",
      nextAction: `Review ${provider.mode} classification`
    });

    await this._appendCaseEvent(caseRow, {
      at: completedAt,
      actorType: "adapter",
      actorLabel: `${provider.name} (${provider.mode})`,
      eventType: "classification_completed",
      summary: `${provider.mode} classification → ${suggested} · intent ${result.intent}.`
    });

    return { ok: true, runId, status: suggested, result, providerMode: provider.mode };
  }

  /**
   * @param {string} caseId
   * @param {string} runId
   * @param {Array<{ fieldKey: string, action: string, value?: unknown, note?: string }>} corrections
   * @param {{ actorLabel?: string, humanEligibility?: string|null, humanIntent?: string|null }} [opts]
   */
  async applyCorrections(caseId, runId, corrections, opts = {}) {
    const run = await this._store.getClassificationRun(runId);
    if (!run || run.caseId !== caseId) {
      const err = new Error("Classification run not found.");
      err.code = "RUN_NOT_FOUND";
      throw err;
    }
    if (run.humanReviewState === "accepted" || run.humanReviewState === "superseded") {
      const err = new Error("Cannot correct an accepted or superseded run — re-run classification instead.");
      err.code = "RUN_IMMUTABLE";
      throw err;
    }
    if (!run.result) {
      const err = new Error("Run has no result to correct.");
      err.code = "RUN_NO_RESULT";
      throw err;
    }

    const actor = opts.actorLabel ?? this._actorLabel;
    const at = new Date().toISOString();
    const fields = structuredCloneFields(run.result.fields);
    const applied = [];

    for (const c of corrections ?? []) {
      const field = fields.find((f) => f.key === c.fieldKey);
      if (!field) continue;
      const before = field.value;
      if (c.action === "confirm") {
        field.humanReviewState = "confirmed";
        if (field.evidence) {
          field.evidence = { ...field.evidence, humanConfirmed: true };
        }
      } else if (c.action === "clear" || c.action === "mark_unknown") {
        field.value = null;
        field.unknown = true;
        field.confidence = null;
        field.confidenceReason = "Cleared by estimator.";
        field.evidence = evidenceFromManualCorrection(c.note ?? "Cleared / unknown");
        field.humanReviewState = "corrected";
      } else if (c.action === "edit") {
        field.value = c.value ?? null;
        field.unknown = field.value == null || field.value === "";
        field.confidence = field.unknown ? null : 1;
        field.confidenceReason = "Estimator edit.";
        field.evidence = evidenceFromManualCorrection(c.note ?? "Edited value");
        field.humanReviewState = "corrected";
      }
      applied.push({
        id: `corr-${runId}-${c.fieldKey}-${applied.length}`,
        at,
        actorLabel: actor,
        fieldKey: c.fieldKey,
        action: c.action,
        before,
        after: field.value,
        note: c.note ?? null
      });
    }

    const patch = {
      result: { ...run.result, fields },
      corrections: [...(run.corrections ?? []), ...applied],
      humanReviewState: "corrected"
    };
    if (opts.humanEligibility != null) {
      patch.result = {
        ...patch.result,
        humanEligibilityDecision: opts.humanEligibility
      };
    }
    if (opts.humanIntent != null) {
      patch.result = {
        ...patch.result,
        humanIntentDecision: opts.humanIntent
      };
    }

    await this._store.patchClassificationRun(runId, patch);
    await this._store.setCaseOverlay(caseId, {
      classificationReviewState: "corrected",
      updatedAt: at
    });
    await this._store.appendAuditEvent({
      id: `aud-${caseId}-${compactStamp(at)}-corr`,
      caseId,
      at,
      actorType: "user",
      actorLabel: actor,
      eventType: "classification_corrected",
      summary: `Estimator corrected ${applied.length} field(s) on ${runId}.`,
      meta: { runId, fieldKeys: applied.map((a) => a.fieldKey) }
    });

    return { ok: true, runId, corrections: applied };
  }

  /**
   * @param {string} caseId
   * @param {string} runId
   * @param {{ actorLabel?: string, parkStatus?: string|null }} [opts]
   */
  async acceptClassification(caseId, runId, opts = {}) {
    const run = await this._store.getClassificationRun(runId);
    if (!run || run.caseId !== caseId) {
      const err = new Error("Classification run not found.");
      err.code = "RUN_NOT_FOUND";
      throw err;
    }
    if (!run.result) {
      const err = new Error("Cannot accept a failed run.");
      err.code = "RUN_NO_RESULT";
      throw err;
    }
    if (run.humanReviewState === "accepted") {
      return { ok: true, alreadyAccepted: true, snapshotId: run.acceptedSnapshotId, runId };
    }

    const blocking = structureValidationWarnings(run.validationWarnings ?? run.warnings ?? []).filter(
      (w) => w.severity === "blocking"
    );
    if (hasBlockingValidationWarnings(run.validationWarnings ?? run.warnings ?? [])) {
      const err = new Error(
        `Acceptance blocked: ${blocking.length} validation warning(s) require resolution (schema integrity, invalid evidence, or unsupported claims).`
      );
      err.code = "BLOCKING_VALIDATION_WARNINGS";
      err.warnings = blocking;
      throw err;
    }

    const actor = opts.actorLabel ?? this._actorLabel;
    const at = new Date().toISOString();

    // Supersede other accepted snapshots
    const priorRuns = await this._store.listClassificationRuns(caseId);
    for (const p of priorRuns) {
      if (p.id !== runId && p.humanReviewState === "accepted") {
        await this._store.patchClassificationRun(p.id, { humanReviewState: "superseded" });
      }
    }

    const snapshotId = `qil-snap-${compactStamp(at)}-${runId.slice(-8)}`;
    const humanIntent = run.result.humanIntentDecision ?? run.result.intent;
    const humanEligibility =
      run.result.humanEligibilityDecision ?? run.result.workflowEligibility;

    let parkStatus = opts.parkStatus ?? null;
    if (!parkStatus) {
      if (humanIntent === "not_quote_related") parkStatus = "qil_not_quote";
      else if (humanEligibility === "non_elite_100_candidate") parkStatus = "qil_not_elite_100";
      else if (humanIntent === "unclear" || humanEligibility === "manual_review_required") {
        parkStatus = "qil_manual_review";
      } else {
        parkStatus = "qil_intake_review";
      }
    }

    const snapshot = Object.freeze({
      id: snapshotId,
      caseId,
      runId,
      acceptedAt: at,
      acceptedBy: actor,
      intent: humanIntent,
      workflowEligibility: humanEligibility,
      catalogValidationState: run.result.catalogValidationState,
      overallConfidence: run.result.overallConfidence,
      fields: structuredCloneFields(run.result.fields),
      missingInformation: structuredCloneJson(run.result.missingInformation),
      missingKeys: [...(run.result.missingKeys ?? [])],
      corrections: structuredCloneJson(run.corrections ?? []),
      provider: structuredCloneJson(run.result.provider),
      note: "Frozen reviewed intake snapshot — does not create a quote or start takeoff."
    });

    await this._store.saveReviewedSnapshot(snapshot);
    await this._store.patchClassificationRun(runId, {
      humanReviewState: "accepted",
      acceptedSnapshotId: snapshotId
    });

    const overlay = {
      status: parkStatus,
      updatedAt: at,
      acceptedSnapshotId: snapshotId,
      latestClassificationRunId: runId,
      missingInformation: snapshot.missingKeys,
      aiConfidence: snapshot.overallConfidence,
      requestedColor: fieldValue(snapshot.fields, "requestedColorText"),
      proposedSquareFootage: fieldValue(snapshot.fields, "statedSquareFootage"),
      sinkCutoutCount: fieldValue(snapshot.fields, "sinkCutoutCount"),
      edgeProfile: fieldValue(snapshot.fields, "edgeProfile"),
      backsplashScope: fieldValue(snapshot.fields, "backsplashDescription"),
      customerAccount: displayOrDash(fieldValue(snapshot.fields, "customerAccount"), "—"),
      projectName: displayOrDash(fieldValue(snapshot.fields, "projectName"), "—"),
      projectAddress: displayOrDash(fieldValue(snapshot.fields, "projectAddress"), "—"),
      resolvedPriceGroup: null,
      classificationProviderMode: run.providerMode,
      classificationReviewState: "accepted",
      nextAction: "Classification accepted (lab) — takeoff not started"
    };
    await this._store.setCaseOverlay(caseId, overlay);

    await this._store.appendAuditEvent({
      id: `aud-${caseId}-${compactStamp(at)}-accept`,
      caseId,
      at,
      actorType: "user",
      actorLabel: actor,
      eventType: "classification_accepted",
      summary: `Accepted ${run.providerMode} classification snapshot ${snapshotId}.`,
      meta: { runId, snapshotId, parkStatus, providerMode: run.providerMode }
    });

    // Also tip case events for imported rows
    const base = await this._store.getCase?.(caseId);
    if (base) {
      await this._appendCaseEvent(base, {
        at,
        actorType: "user",
        actorLabel: actor,
        eventType: "classification_accepted",
        summary: `Accepted classification snapshot ${snapshotId} (no quote / takeoff).`
      });
    }

    return { ok: true, snapshotId, runId, status: parkStatus, snapshot };
  }

  async listRuns(caseId) {
    return this._store.listClassificationRuns(caseId);
  }

  async getRun(runId) {
    return this._store.getClassificationRun(runId);
  }

  async getAcceptedSnapshot(caseId) {
    return this._store.getLatestAcceptedSnapshot(caseId);
  }
}

async function _noop() {}

ClassificationService.prototype._appendCaseEvent = async function appendCaseEvent(caseRow, partial) {
  const at = partial.at ?? new Date().toISOString();
  const event = {
    id: `${caseRow.id}-evt-${compactStamp(at)}-${Math.random().toString(16).slice(2, 6)}`,
    at,
    actorType: partial.actorType,
    actorLabel: partial.actorLabel,
    eventType: partial.eventType,
    summary: partial.summary,
    before: partial.before,
    after: partial.after
  };
  if (typeof this._store.appendCaseEvent === "function") {
    await this._store.appendCaseEvent(caseRow.id, event);
  } else {
    await this._store.setCaseOverlay(caseRow.id, {
      __pushEvent: event
    });
  }
  await _noop();
};

function fieldValue(fields, key) {
  const f = (fields ?? []).find((x) => x.key === key);
  if (!f || f.unknown) return null;
  return f.value;
}

function displayOrDash(value, fallback) {
  if (value == null || value === "") return fallback ?? "—";
  return value;
}

function structuredCloneFields(fields) {
  return structuredCloneJson(fields ?? []);
}

function structuredCloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function compactStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  return d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

export { FIELD_LABELS };
