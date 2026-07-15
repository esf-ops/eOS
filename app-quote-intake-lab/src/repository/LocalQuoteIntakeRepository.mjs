import { ClassificationService } from "../classification/classificationService.mjs";
import { getSimulatedIntakeIntelligenceProvider } from "../classification/simulatedProvider.mjs";
import { TakeoffService } from "../takeoff/takeoffService.mjs";
import { TakeoffCorrectionService } from "../takeoff/takeoffCorrectionService.mjs";
import { getLiveGeminiTakeoffAdapter } from "../takeoff/liveGeminiTakeoffAdapter.mjs";
import { getSimulatedTakeoffAdapter } from "../takeoff/simulatedTakeoffAdapter.mjs";
import { inboundEmailAdapter } from "../inbound/inboundEmailAdapter.mjs";
import { caseFromInboundMessage } from "../inbound/caseFromInbound.mjs";
import { formatTurnaround } from "../domain/age.mjs";
import {
  buildStatusCounts,
  filterQuoteIntakeCases,
  uniqueEstimators,
  uniqueSalespeople
} from "../domain/filters.mjs";
import { getFixtureCases, FIXTURE_AS_OF } from "../fixtures/quoteIntakeCases.mjs";
import { getIdbLabStore } from "./idbLabStore.mjs";

/**
 * Composite repository: built-in fixtures + locally imported cases (IndexedDB / memory)
 * + classification overlays / runs + takeoff overlays / runs.
 */
export class LocalQuoteIntakeRepository {
  /**
   * @param {{
   *   store?: any,
   *   fixtureCases?: any[],
   *   asOfMode?: "wall"|"fixture",
   *   provider?: any,
   *   liveProvider?: any,
   *   takeoffAdapter?: any
   * }} [opts]
   */
  constructor(opts = {}) {
    this._store = opts.store ?? getIdbLabStore();
    this._fixtureCases = opts.fixtureCases ?? getFixtureCases();
    this._asOfMode = opts.asOfMode ?? "wall";
    this._adapter = opts.adapter ?? inboundEmailAdapter;
    this._provider = opts.provider ?? getSimulatedIntakeIntelligenceProvider();
    this._classification = new ClassificationService({
      store: this._store,
      provider: this._provider,
      liveProvider: opts.liveProvider
    });
    this._takeoff = new TakeoffService({
      store: this._store,
      takeoffAdapter: opts.takeoffAdapter ?? getSimulatedTakeoffAdapter(),
      liveTakeoffAdapter: opts.liveTakeoffAdapter ?? getLiveGeminiTakeoffAdapter()
    });
    this._corrections = new TakeoffCorrectionService({ store: this._store });
    this._ready = null;
  }

  async ready() {
    if (!this._ready) this._ready = this._store.ready();
    await this._ready;
    return this;
  }

  getAsOf() {
    if (this._asOfMode === "fixture") return FIXTURE_AS_OF;
    return new Date().toISOString();
  }

  async _allRaw() {
    await this.ready();
    const imported = await this._store.listImportedCases();
    const overlays = await this._store.listOverlays();
    const takeoffOverlays = (await this._store.listTakeoffOverlays?.()) ?? [];
    const byId = new Map(overlays.map((o) => [o.caseId, o]));
    const takeoffById = new Map(takeoffOverlays.map((o) => [o.caseId, o]));
    const mergedImported = imported.map((c) =>
      applyTakeoffOverlay(applyOverlay(c, byId.get(c.id)), takeoffById.get(c.id))
    );
    const mergedFixtures = this._fixtureCases.map((c) =>
      applyTakeoffOverlay(applyOverlay(c, byId.get(c.id)), takeoffById.get(c.id))
    );
    return [...mergedImported, ...mergedFixtures];
  }

  async listCases(filter = {}) {
    const asOf = this.getAsOf();
    const filtered = filterQuoteIntakeCases(await this._allRaw(), filter, asOf);
    const enriched = [];
    for (const c of filtered) {
      enriched.push(await this._hydrateProvenance(enrichCase(c, asOf)));
    }
    return enriched;
  }

  async getCase(id) {
    await this.ready();
    const local = await this._store.getCase(id);
    const overlay = await this._store.getOverlay(id);
    const takeoffOverlay = (await this._store.getTakeoffOverlay?.(id)) ?? null;
    if (local) {
      return this._hydrateProvenance(
        enrichCase(applyTakeoffOverlay(applyOverlay(local, overlay), takeoffOverlay), this.getAsOf())
      );
    }
    const fixture = this._fixtureCases.find((c) => c.id === id);
    return fixture
      ? this._hydrateProvenance(
          enrichCase(applyTakeoffOverlay(applyOverlay(fixture, overlay), takeoffOverlay), this.getAsOf())
        )
      : null;
  }

  /**
   * Backfill provenance from the latest run when overlays predate Phase 3.1.1.
   * Presentation-only — does not change classification results.
   */
  async _hydrateProvenance(caseRow) {
    if (!caseRow?.latestClassificationRunId) return caseRow;
    if (caseRow.classificationProviderMode != null && caseRow.classificationReviewState != null) {
      return caseRow;
    }
    const run = await this._store.getClassificationRun?.(caseRow.latestClassificationRunId);
    if (!run) return caseRow;
    return {
      ...caseRow,
      classificationProviderMode: caseRow.classificationProviderMode ?? run.providerMode ?? null,
      classificationReviewState: caseRow.classificationReviewState ?? run.humanReviewState ?? null
    };
  }

  async getStatusCounts(filter = {}) {
    const asOf = this.getAsOf();
    const filtered = filterQuoteIntakeCases(await this._allRaw(), filter, asOf);
    return buildStatusCounts(filtered);
  }

  async listSalespeople() {
    return uniqueSalespeople(await this._allRaw());
  }

  async listEstimators() {
    return uniqueEstimators(await this._allRaw());
  }

  async countImported() {
    await this.ready();
    return this._store.countImported();
  }

  async previewImport(source) {
    const message = await this._adapter.ingest(source);
    await this.ready();
    const existingId = await this._store.findCaseIdByDedupeKey(message.dedupeKey);
    return {
      message,
      duplicateOfCaseId: existingId,
      duplicateReason: existingId
        ? message.dedupeStrategy === "message_id"
          ? "Matching Message-ID already imported into the lab."
          : "Matching content hash already imported into the lab."
        : null,
      canConfirm: !existingId
    };
  }

  async confirmImport(message) {
    await this.ready();
    const existingId = await this._store.findCaseIdByDedupeKey(message.dedupeKey);
    if (existingId) {
      return {
        ok: false,
        duplicate: true,
        caseId: existingId,
        dedupeKey: message.dedupeKey,
        reason:
          message.dedupeStrategy === "message_id"
            ? "Matching Message-ID already imported into the lab."
            : "Matching content hash already imported into the lab."
      };
    }

    const caseRow = await caseFromInboundMessage(message);
    const attachmentBlobs = (message.attachments ?? [])
      .filter((a) => a.bytes && a.bytes.byteLength >= 0)
      .map((a) => ({
        attachmentId: a.id,
        bytes: a.bytes,
        contentType: a.contentType,
        filename: a.filename
      }));

    const saved = await this._store.saveImportedCase({ caseRow, attachmentBlobs });
    if (saved.duplicate) {
      return {
        ok: false,
        duplicate: true,
        caseId: saved.caseId,
        dedupeKey: message.dedupeKey,
        reason: "Duplicate detected during save."
      };
    }

    return {
      ok: true,
      caseId: saved.caseId,
      dedupeKey: message.dedupeKey,
      duplicate: false
    };
  }

  async getAttachmentBytes(caseId, attachmentId) {
    await this.ready();
    return this._store.getAttachmentBytes(caseId, attachmentId);
  }

  async clearImported() {
    await this.ready();
    await this._store.clearImported();
  }

  async runClassification(caseId, opts = {}) {
    const caseRow = await this.getCase(caseId);
    if (!caseRow) {
      const err = new Error("Case not found");
      err.code = "CASE_NOT_FOUND";
      throw err;
    }
    // Strip enrichments — service needs durable fields
    const raw = { ...caseRow };
    delete raw.elapsedTurnaroundLabel;
    return this._classification.runClassification(raw, opts);
  }

  async applyClassificationCorrections(caseId, runId, corrections, opts = {}) {
    return this._classification.applyCorrections(caseId, runId, corrections, opts);
  }

  async acceptClassification(caseId, runId, opts = {}) {
    return this._classification.acceptClassification(caseId, runId, opts);
  }

  async listClassificationRuns(caseId) {
    await this.ready();
    return this._store.listClassificationRuns(caseId);
  }

  async getClassificationRun(runId) {
    await this.ready();
    return this._store.getClassificationRun(runId);
  }

  async getAcceptedSnapshot(caseId) {
    await this.ready();
    return this._store.getLatestAcceptedSnapshot(caseId);
  }

  async runTakeoff(caseId, opts = {}) {
    const caseRow = await this.getCase(caseId);
    if (!caseRow) {
      const err = new Error("Case not found");
      err.code = "CASE_NOT_FOUND";
      throw err;
    }
    const raw = { ...caseRow };
    delete raw.elapsedTurnaroundLabel;
    return this._takeoff.runTakeoff(caseId, { ...opts, caseRow: raw });
  }

  async listTakeoffRuns(caseId) {
    await this.ready();
    return this._store.listTakeoffRuns(caseId);
  }

  async getTakeoffRun(runId) {
    await this.ready();
    return this._store.getTakeoffRun(runId);
  }

  async getLatestTakeoffRun(caseId) {
    await this.ready();
    return this._store.getLatestTakeoffRun(caseId);
  }

  async getTakeoffOverlay(caseId) {
    await this.ready();
    return this._store.getTakeoffOverlay(caseId);
  }

  async listTakeoffAuditEvents(caseId) {
    await this.ready();
    return this._store.listTakeoffAuditEvents(caseId);
  }

  async beginTakeoffCorrection(caseId, sourceRunId, opts = {}) {
    await this.ready();
    return this._corrections.beginCorrection(caseId, sourceRunId, opts);
  }

  async getTakeoffCorrectionDraft(caseId, sourceRunId) {
    await this.ready();
    return this._corrections.getDraft(caseId, sourceRunId);
  }

  async applyTakeoffCorrection(caseId, draftId, operation, opts = {}) {
    await this.ready();
    const caseRow = await this.getCase(caseId);
    return this._corrections.applyOperation(caseId, draftId, operation, { ...opts, caseRow });
  }

  async saveTakeoffCorrectionDraft(caseId, draftId, opts = {}) {
    await this.ready();
    return this._corrections.saveDraft(caseId, draftId, opts);
  }

  async discardTakeoffCorrectionDraft(caseId, draftId, opts = {}) {
    await this.ready();
    return this._corrections.discardDraft(caseId, draftId, opts);
  }

  async evaluateTakeoffAcceptance(caseId, draftId, opts = {}) {
    await this.ready();
    const caseRow = await this.getCase(caseId);
    return this._corrections.evaluateGate(caseId, draftId, { ...opts, caseRow });
  }

  async acceptReviewedTakeoff(caseId, draftId, opts = {}) {
    await this.ready();
    const caseRow = await this.getCase(caseId);
    return this._corrections.acceptSnapshot(caseId, draftId, { ...opts, caseRow });
  }

  async createTakeoffRevision(caseId, opts = {}) {
    await this.ready();
    return this._corrections.createRevision(caseId, opts);
  }

  async listReviewedTakeoffSnapshots(caseId) {
    await this.ready();
    return this._corrections.listAcceptedSnapshots(caseId);
  }

  async getReviewedTakeoffSnapshot(snapshotId) {
    await this.ready();
    return this._corrections.getAcceptedSnapshot(snapshotId);
  }
}

const OVERLAY_KEYS = [
  "status",
  "updatedAt",
  "latestClassificationRunId",
  "acceptedSnapshotId",
  "aiConfidence",
  "missingInformation",
  "requestedColor",
  "proposedSquareFootage",
  "sinkCutoutCount",
  "edgeProfile",
  "backsplashScope",
  "customerAccount",
  "projectName",
  "projectAddress",
  "resolvedPriceGroup",
  "nextAction",
  "classificationProviderMode",
  "classificationReviewState"
];

const TAKEOFF_OVERLAY_KEYS = [
  "statedSquareFootage",
  "measuredCountertopSquareFootage",
  "measuredBacksplashSquareFootage",
  "measuredFullHeightBacksplashSquareFootage",
  "measuredCombinedSquareFootage",
  "providerProposedSquareFootage",
  "takeoffVariance",
  "takeoffSinkCutoutCount",
  "latestTakeoffRunId",
  "latestTakeoffState",
  "takeoffProviderMode",
  "takeoffWarningCounts",
  "takeoffUpdatedAt",
  "takeoffReviewState",
  "latestCorrectionDraftId",
  "latestReviewedTakeoffSnapshotId",
  "reviewedMeasuredCountertopSquareFootage",
  "reviewedMeasuredBacksplashSquareFootage",
  "reviewedMeasuredFullHeightBacksplashSquareFootage",
  "reviewedMeasuredCombinedSquareFootage",
  "reviewedSinkCutoutCount"
];

function applyOverlay(caseRow, overlay) {
  if (!overlay) return caseRow;
  const next = { ...caseRow };
  for (const key of OVERLAY_KEYS) {
    if (overlay[key] !== undefined) next[key] = overlay[key];
  }
  if (Array.isArray(overlay.extraEvents) && overlay.extraEvents.length) {
    next.events = [...(caseRow.events ?? []), ...overlay.extraEvents];
  }
  return next;
}

function applyTakeoffOverlay(caseRow, takeoffOverlay) {
  if (!takeoffOverlay) return caseRow;
  const next = { ...caseRow };
  for (const key of TAKEOFF_OVERLAY_KEYS) {
    if (takeoffOverlay[key] !== undefined) next[key] = takeoffOverlay[key];
  }
  return next;
}

function enrichCase(c, asOf) {
  return {
    ...c,
    elapsedTurnaroundLabel: formatTurnaround(c.receivedAt, asOf)
  };
}

let _browserRepo = null;

export function getLocalQuoteIntakeRepository() {
  if (!_browserRepo) _browserRepo = new LocalQuoteIntakeRepository();
  return _browserRepo;
}
