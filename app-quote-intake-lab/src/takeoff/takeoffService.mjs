import { buildTakeoffRequest } from "./buildTakeoffRequest.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";
import { LAB_TAKEOFF_STATUS } from "./takeoffTypes.mjs";
import { validateLabTakeoffRun } from "./validateLabTakeoff.mjs";

/**
 * Orchestrates lab takeoff: request → adapter → immutable persist → overlay → audit.
 * Adapter injected; defaults to SimulatedTakeoffAdapter.
 */
export class TakeoffService {
  /**
   * @param {{ store: any, takeoffAdapter?: any, actorLabel?: string }} opts
   */
  constructor(opts) {
    this._store = opts.store;
    this._adapter = opts.takeoffAdapter ?? getSimulatedTakeoffAdapter();
    this._actorLabel = opts.actorLabel ?? "Lab Estimator";
  }

  /**
   * @param {string} caseId
   * @param {{
   *   selectedAttachmentId: string,
   *   actorLabel?: string,
   *   scenarioId?: string,
   *   transmissionAcknowledgmentPlaceholder?: boolean,
   *   caseRow?: object
   * }} opts
   */
  async runTakeoff(caseId, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const caseRow = opts.caseRow ?? (await this._loadCase(caseId));
    const snapshot = await this._store.getLatestAcceptedSnapshot(caseId);
    if (!snapshot) {
      reject("ACCEPTED_INTAKE_REQUIRED", "An accepted intake classification snapshot is required before takeoff.");
    }

    const elite =
      snapshot.workflowEligibility ??
      snapshot.humanEligibilityDecision ??
      caseRow.classificationElite100Decision ??
      null;
    if (elite !== "elite_100_candidate") {
      reject("ELITE_100_CANDIDATE_REQUIRED", "Accepted Elite 100 candidate decision is required before takeoff.");
    }

    const intent = snapshot.intent ?? snapshot.humanIntentDecision ?? null;
    if (intent === "not_quote_related") {
      reject("NOT_QUOTE_RELATED", "Case is marked not quote-related; takeoff is not allowed.");
    }

    const attachments = (caseRow.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      contentHash: a.contentHash,
      source: a.source ?? (caseRow.dataSource === "fixture" ? "synthetic_fixture" : "imported_eml")
      // never pass bytes
    }));

    const priorOverlay = (await this._store.getTakeoffOverlay?.(caseId)) ?? null;
    const statedFromEmail =
      priorOverlay?.statedSquareFootage ??
      caseRow.proposedSquareFootage ??
      fieldFromSnapshot(snapshot, "statedSquareFootage") ??
      null;

    const requestInput = {
      caseId,
      acceptedIntakeSnapshotId: snapshot.id,
      elite100Decision: "elite_100_candidate",
      intent: intent ?? "new_quote_request",
      attachments,
      selectedAttachmentId: opts.selectedAttachmentId,
      transmissionAcknowledgmentPlaceholder: opts.transmissionAcknowledgmentPlaceholder !== false,
      actorLabel: actor,
      scenarioId: opts.scenarioId
    };

    // Validate request before mutating overlays / calling adapter
    const request = buildTakeoffRequest(requestInput);
    const requestedAt = request.requestedAt;

    await this._audit({
      caseId,
      runId: null,
      at: requestedAt,
      actorLabel: actor,
      eventType: "takeoff_requested",
      summary: `Takeoff requested for attachment ${request.attachment.attachmentId}.`,
      meta: {
        attachmentId: request.attachment.attachmentId,
        attachmentContentHash: request.attachment.contentHash,
        acceptedIntakeSnapshotId: request.acceptedIntakeSnapshotId
      },
      previousState: priorOverlay?.latestTakeoffState ?? LAB_TAKEOFF_STATUS.NOT_STARTED,
      newState: LAB_TAKEOFF_STATUS.SIMULATING
    });

    await this._store.setTakeoffOverlay(caseId, {
      statedSquareFootage: statedFromEmail,
      latestTakeoffState: LAB_TAKEOFF_STATUS.SIMULATING,
      takeoffUpdatedAt: requestedAt
    });

    await this._audit({
      caseId,
      runId: null,
      at: new Date().toISOString(),
      actorLabel: actor,
      eventType: "takeoff_started",
      summary: `Takeoff started (${this._adapter.name} ${this._adapter.mode}).`,
      meta: { providerName: this._adapter.name, providerMode: this._adapter.mode },
      previousState: LAB_TAKEOFF_STATUS.SIMULATING,
      newState: LAB_TAKEOFF_STATUS.SIMULATING
    });

    let adapterOut;
    try {
      adapterOut = await this._adapter.run(requestInput);
    } catch (e) {
      return this._persistFailedRun({
        caseId,
        request,
        actor,
        statedFromEmail,
        priorOverlay,
        error: e
      });
    }

    const run = adapterOut?.run;
    if (!run) {
      return this._persistFailedRun({
        caseId,
        request,
        actor,
        statedFromEmail,
        priorOverlay,
        error: Object.assign(new Error("Adapter returned no run."), { code: "ADAPTER_EMPTY" })
      });
    }

    // Re-validate before persist (adapter should already have validated)
    const validated = validateLabTakeoffRun(run);
    const persistedRun = Object.freeze(
      JSON.parse(
        JSON.stringify({
          ...run,
          warnings: validated.warnings,
          labTakeoffStatus: run.labTakeoffStatus ?? validated.labTakeoffStatus
        })
      )
    );

    assertNoAttachmentBytes(persistedRun);
    await this._store.saveTakeoffRun(persistedRun);

    const warningCounts = countWarnings(persistedRun.warnings);
    const calc = persistedRun.calculation ?? {};
    const overlayPatch = {
      statedSquareFootage: statedFromEmail,
      measuredCountertopSquareFootage: calc.measuredCountertopSf ?? null,
      measuredBacksplashSquareFootage: calc.measuredBacksplashSf ?? null,
      measuredFullHeightBacksplashSquareFootage: calc.measuredFhbSf ?? null,
      measuredCombinedSquareFootage: calc.measuredCombinedSf ?? null,
      providerProposedSquareFootage: calc.providerProposedCombinedSf ?? null,
      takeoffVariance: calc.combinedVarianceSf ?? null,
      takeoffSinkCutoutCount: calc.sinkCutoutCount ?? 0,
      latestTakeoffRunId: persistedRun.id,
      latestTakeoffState: persistedRun.labTakeoffStatus,
      takeoffProviderMode: persistedRun.provider?.mode ?? null,
      takeoffWarningCounts: warningCounts,
      takeoffUpdatedAt: persistedRun.completedAt ?? new Date().toISOString()
    };
    await this._store.setTakeoffOverlay(caseId, overlayPatch);

    const completedEvent =
      persistedRun.labTakeoffStatus === LAB_TAKEOFF_STATUS.MANUAL_REVIEW
        ? "takeoff_requires_manual_review"
        : persistedRun.labTakeoffStatus === LAB_TAKEOFF_STATUS.FAILED
          ? "takeoff_failed"
          : "takeoff_completed";

    await this._audit({
      caseId,
      runId: persistedRun.id,
      at: persistedRun.completedAt ?? new Date().toISOString(),
      actorLabel: actor,
      eventType: completedEvent,
      summary: `Takeoff ${completedEvent.replace(/^takeoff_/, "").replace(/_/g, " ")} (${persistedRun.id}).`,
      meta: {
        labTakeoffStatus: persistedRun.labTakeoffStatus,
        measuredCombinedSquareFootage: calc.measuredCombinedSf ?? null,
        warningCounts
      },
      previousState: LAB_TAKEOFF_STATUS.SIMULATING,
      newState: persistedRun.labTakeoffStatus
    });

    await this._audit({
      caseId,
      runId: persistedRun.id,
      at: overlayPatch.takeoffUpdatedAt,
      actorLabel: actor,
      eventType: "latest_takeoff_overlay_updated",
      summary: `Latest takeoff overlay updated → ${persistedRun.labTakeoffStatus}.`,
      meta: {
        latestTakeoffRunId: persistedRun.id,
        statedSquareFootage: statedFromEmail,
        measuredCombinedSquareFootage: overlayPatch.measuredCombinedSquareFootage
      },
      previousState: priorOverlay?.latestTakeoffState ?? LAB_TAKEOFF_STATUS.SIMULATING,
      newState: persistedRun.labTakeoffStatus
    });

    return {
      ok: persistedRun.labTakeoffStatus !== LAB_TAKEOFF_STATUS.FAILED,
      runId: persistedRun.id,
      status: persistedRun.labTakeoffStatus,
      run: persistedRun,
      overlay: await this._store.getTakeoffOverlay(caseId)
    };
  }

  async listRuns(caseId) {
    return this._store.listTakeoffRuns(caseId);
  }

  async getRun(runId) {
    return this._store.getTakeoffRun(runId);
  }

  async getLatestRun(caseId) {
    return this._store.getLatestTakeoffRun(caseId);
  }

  async getOverlay(caseId) {
    return this._store.getTakeoffOverlay(caseId);
  }

  async listAuditEvents(caseId) {
    return this._store.listTakeoffAuditEvents(caseId);
  }

  async _persistFailedRun({ caseId, request, actor, statedFromEmail, priorOverlay, error }) {
    const at = new Date().toISOString();
    const runId = `qil-toff-fail-${compactStamp(at)}-${Math.random().toString(16).slice(2, 8)}`;
    const failedRun = Object.freeze({
      id: runId,
      caseId,
      acceptedIntakeSnapshotId: request.acceptedIntakeSnapshotId,
      attachmentId: request.attachment.attachmentId,
      attachmentContentHash: request.attachment.contentHash,
      provider: {
        name: this._adapter.name ?? "TakeoffAdapter",
        mode: this._adapter.mode ?? "simulated",
        version: this._adapter.version ?? "unknown",
        note: "Failed takeoff run — safe failure metadata only."
      },
      startedAt: request.requestedAt,
      completedAt: at,
      labTakeoffStatus: LAB_TAKEOFF_STATUS.FAILED,
      humanReviewState: "unreviewed",
      pages: [],
      rooms: [],
      evidence: [],
      warnings: [],
      corrections: [],
      calculation: {
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        measuredFhbSf: 0,
        measuredCombinedSf: 0,
        sinkCutoutCount: 0,
        providerProposedCountertopSf: null,
        providerProposedBacksplashSf: null,
        providerProposedCombinedSf: null,
        countertopVarianceSf: null,
        backsplashVarianceSf: null,
        combinedVarianceSf: null,
        authorityNote: "Failed run — no measured geometry."
      },
      confidence: null,
      failure: {
        code: error?.code ?? "TAKEOFF_FAILURE",
        message: String(error?.message ?? error).slice(0, 300)
      },
      acceptedSnapshotId: null
    });

    await this._store.saveTakeoffRun(failedRun);

    // Keep prior measured SF on failure; update pointer + state only.
    const overlayPatch = {
      statedSquareFootage: statedFromEmail,
      latestTakeoffRunId: failedRun.id,
      latestTakeoffState: LAB_TAKEOFF_STATUS.FAILED,
      takeoffProviderMode: failedRun.provider.mode,
      takeoffWarningCounts: priorOverlay?.takeoffWarningCounts ?? {
        informational: 0,
        estimator_review: 0,
        approval_blocking: 0,
        total: 0
      },
      takeoffUpdatedAt: at
    };
    if (priorOverlay?.measuredCountertopSquareFootage != null) {
      overlayPatch.measuredCountertopSquareFootage = priorOverlay.measuredCountertopSquareFootage;
      overlayPatch.measuredBacksplashSquareFootage = priorOverlay.measuredBacksplashSquareFootage ?? null;
      overlayPatch.measuredFullHeightBacksplashSquareFootage =
        priorOverlay.measuredFullHeightBacksplashSquareFootage ?? null;
      overlayPatch.measuredCombinedSquareFootage = priorOverlay.measuredCombinedSquareFootage ?? null;
      overlayPatch.providerProposedSquareFootage = priorOverlay.providerProposedSquareFootage ?? null;
      overlayPatch.takeoffVariance = priorOverlay.takeoffVariance ?? null;
      overlayPatch.takeoffSinkCutoutCount = priorOverlay.takeoffSinkCutoutCount ?? null;
    }
    await this._store.setTakeoffOverlay(caseId, overlayPatch);

    await this._audit({
      caseId,
      runId,
      at,
      actorLabel: actor,
      eventType: "takeoff_failed",
      summary: `Takeoff failed (${failedRun.failure.code}).`,
      meta: { code: failedRun.failure.code },
      previousState: LAB_TAKEOFF_STATUS.SIMULATING,
      newState: LAB_TAKEOFF_STATUS.FAILED
    });

    await this._audit({
      caseId,
      runId,
      at,
      actorLabel: actor,
      eventType: "latest_takeoff_overlay_updated",
      summary: "Latest takeoff overlay updated after failure (prior measured SF retained when present).",
      meta: {
        latestTakeoffRunId: runId,
        retainedMeasuredSf: priorOverlay?.measuredCombinedSquareFootage ?? null
      },
      previousState: priorOverlay?.latestTakeoffState ?? LAB_TAKEOFF_STATUS.SIMULATING,
      newState: LAB_TAKEOFF_STATUS.FAILED
    });

    return {
      ok: false,
      runId,
      status: LAB_TAKEOFF_STATUS.FAILED,
      run: failedRun,
      overlay: await this._store.getTakeoffOverlay(caseId),
      softFailure: false,
      code: failedRun.failure.code
    };
  }

  async _loadCase(caseId) {
    const local = await this._store.getCase?.(caseId);
    if (local) return local;
    // Fixtures are not in the store — callers using LocalQuoteIntakeRepository pass enriched cases via getCase first.
    const err = new Error("Case not found in lab store.");
    err.code = "CASE_NOT_FOUND";
    throw err;
  }

  async _audit(partial) {
    const at = partial.at ?? new Date().toISOString();
    await this._store.appendTakeoffAuditEvent({
      id: `qil-toff-aud-${compactStamp(at)}-${Math.random().toString(16).slice(2, 8)}`,
      caseId: partial.caseId,
      runId: partial.runId ?? null,
      at,
      actorLabel: partial.actorLabel,
      eventType: partial.eventType,
      summary: partial.summary,
      meta: sanitizeMeta(partial.meta),
      previousState: partial.previousState ?? null,
      newState: partial.newState ?? null
    });
  }
}

function fieldFromSnapshot(snapshot, key) {
  const f = (snapshot?.fields ?? []).find((x) => x.key === key);
  if (!f || f.unknown) return null;
  return f.value;
}

function countWarnings(warnings) {
  const counts = { informational: 0, estimator_review: 0, approval_blocking: 0, total: 0 };
  for (const w of warnings ?? []) {
    const sev = w.severity ?? "informational";
    if (counts[sev] != null) counts[sev] += 1;
    else counts.informational += 1;
    counts.total += 1;
  }
  return counts;
}

function assertNoAttachmentBytes(run) {
  const raw = JSON.stringify(run);
  if (/"bytes"\s*:/.test(raw) && /"bytes"\s*:\s*\[/.test(raw)) {
    const err = new Error("Takeoff run must not include attachment bytes.");
    err.code = "ATTACHMENT_BYTES_FORBIDDEN";
    throw err;
  }
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = { ...meta };
  delete out.bytes;
  delete out.attachmentBytes;
  delete out.prompt;
  delete out.credentials;
  delete out.apiKey;
  return out;
}

function compactStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  return d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function reject(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}
