/**
 * Lab takeoff correction + accepted snapshot orchestration (Phase 4B.3).
 */

import { evaluateTakeoffAcceptanceGate, warningKey } from "./approvalGate.mjs";
import {
  CORRECTION_OP,
  REVIEWED_TAKEOFF_SCHEMA_VERSION,
  TAKEOFF_REVIEW_STATE
} from "./correctionTypes.mjs";
import {
  computeReviewedFingerprint,
  hasMaterialCorrections
} from "./reviewedFingerprint.mjs";
import { buildReviewedProjection } from "./reviewedProjection.mjs";

export class TakeoffCorrectionService {
  /**
   * @param {{ store: any, actorLabel?: string }} opts
   */
  constructor(opts) {
    this._store = opts.store;
    this._actorLabel = opts.actorLabel ?? "Lab Estimator";
  }

  /**
   * Begin or resume a correction draft for a source run.
   */
  async beginCorrection(caseId, sourceRunId, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const run = await this._store.getTakeoffRun(sourceRunId);
    if (!run || run.caseId !== caseId) {
      reject("SOURCE_RUN_REQUIRED", "A persisted takeoff run is required to begin corrections.");
    }
    // Freeze assertion — do not mutate run
    const frozen = JSON.parse(JSON.stringify(run));

    const existing = await this._store.getTakeoffCorrectionDraftByRun?.(caseId, sourceRunId);
    if (existing) {
      const frozenAccepted =
        existing.frozen === true || existing.reviewState === TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT;
      return {
        draft: existing,
        resumed: true,
        frozen: frozenAccepted,
        accepted: frozenAccepted,
        sourceRun: frozen
      };
    }

    const snapshot = await this._store.getLatestAcceptedSnapshot(caseId);
    if (!snapshot) {
      reject("ACCEPTED_INTAKE_REQUIRED", "Accepted intake classification is required before corrections.");
    }
    const elite = snapshot.workflowEligibility ?? snapshot.humanEligibilityDecision;
    if (elite !== "elite_100_candidate") {
      reject("ELITE_100_CANDIDATE_REQUIRED", "Elite 100 candidate decision is required.");
    }

    const now = new Date().toISOString();
    const draft = {
      id: `qil-toff-draft-${compactStamp(now)}-${Math.random().toString(16).slice(2, 8)}`,
      caseId,
      sourceRunId: run.id,
      sourceAttachmentId: run.attachmentId,
      sourceAttachmentHash: run.attachmentContentHash,
      acceptedIntakeSnapshotId: snapshot.id,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      operations: [],
      reviewState: TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT,
      dirty: false,
      frozen: false,
      parentSnapshotId: null,
      baselineFingerprint: null,
      acceptedSnapshotId: null
    };

    await this._store.saveTakeoffCorrectionDraft(draft);
    await this._audit({
      caseId,
      runId: sourceRunId,
      draftId: draft.id,
      at: now,
      actorLabel: actor,
      eventType: "correction_draft_created",
      summary: `Correction draft created for run ${sourceRunId}.`,
      meta: { draftId: draft.id, sourceAttachmentHash: draft.sourceAttachmentHash }
    });

    await this._store.setTakeoffOverlay(caseId, {
      takeoffReviewState: TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT,
      latestCorrectionDraftId: draft.id,
      takeoffUpdatedAt: now
    });

    return { draft, resumed: false, sourceRun: frozen };
  }

  async getDraft(caseId, sourceRunId) {
    return (await this._store.getTakeoffCorrectionDraftByRun?.(caseId, sourceRunId)) ?? null;
  }

  async listDrafts(caseId) {
    return (await this._store.listTakeoffCorrectionDrafts?.(caseId)) ?? [];
  }

  async applyOperation(caseId, draftId, operation, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const draft = await this._store.getTakeoffCorrectionDraft(draftId);
    if (!draft || draft.caseId !== caseId) {
      reject("DRAFT_NOT_FOUND", "Correction draft not found.");
    }
    if (draft.frozen || draft.reviewState === TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT) {
      reject(
        "DRAFT_FROZEN",
        "This correction draft was accepted. Use Create revision to start a new draft."
      );
    }
    const run = await this._store.getTakeoffRun(draft.sourceRunId);
    if (!run) reject("SOURCE_RUN_REQUIRED", "Source takeoff run missing.");

    // Validate direct-SF adds
    if (operation.type === CORRECTION_OP.ADD_PIECE) {
      const m = operation.piece?.measurement;
      if (m?.directSf != null && !m.directSfReason && !operation.note) {
        reject("DIRECT_SF_REASON_REQUIRED", "Estimator-entered direct SF requires a reason/note.");
      }
    }
    if (operation.type === CORRECTION_OP.EDIT_PIECE && operation.patch?.directSf != null) {
      if (!operation.patch.directSfReason && !operation.note) {
        reject("DIRECT_SF_REASON_REQUIRED", "Estimator-entered direct SF requires a reason/note.");
      }
    }
    if (
      operation.type === CORRECTION_OP.RESOLVE_WARNING &&
      operation.severity === "approval_blocking" &&
      operation.resolutionKind === "dismiss"
    ) {
      reject("BLOCKING_WARNING_CANNOT_DISMISS", "Approval-blocking warnings cannot be dismissed.");
    }

    const now = new Date().toISOString();
    const op = {
      id: `qil-op-${compactStamp(now)}-${Math.random().toString(16).slice(2, 6)}`,
      at: now,
      actorLabel: actor,
      ...operation
    };

    const next = {
      ...draft,
      operations: [...(draft.operations ?? []), op],
      updatedAt: now,
      updatedBy: actor,
      dirty: true,
      reviewState: TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT
    };

    const caseRow = opts.caseRow ?? (await this._store.getCase(caseId));
    const stated =
      (await this._store.getTakeoffOverlay(caseId))?.statedSquareFootage ??
      caseRow?.proposedSquareFootage ??
      null;
    const projection = buildReviewedProjection(run, next, { statedSquareFootage: stated });
    next.cachedProjection = {
      calculation: projection.calculation,
      pieceStatus: projection.pieceStatus,
      roomReviewed: projection.roomReviewed,
      sinkConfirmed: projection.sinkConfirmed,
      sinkCount: projection.sinkCount
    };

    await this._store.saveTakeoffCorrectionDraft(next);
    await this._audit({
      caseId,
      runId: draft.sourceRunId,
      draftId: draft.id,
      at: now,
      actorLabel: actor,
      eventType: mapOpToAudit(op.type),
      summary: `Correction operation ${op.type}.`,
      meta: { opType: op.type, pieceId: op.pieceId ?? null, roomId: op.roomId ?? null }
    });

    return { draft: next, projection, sourceRun: run };
  }

  async saveDraft(caseId, draftId, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const draft = await this._store.getTakeoffCorrectionDraft(draftId);
    if (!draft || draft.caseId !== caseId) reject("DRAFT_NOT_FOUND", "Correction draft not found.");
    const now = new Date().toISOString();
    const next = { ...draft, updatedAt: now, updatedBy: actor, dirty: false };
    await this._store.saveTakeoffCorrectionDraft(next);
    await this._audit({
      caseId,
      runId: draft.sourceRunId,
      draftId,
      at: now,
      actorLabel: actor,
      eventType: "correction_draft_saved",
      summary: `Correction draft saved (${draftId}).`,
      meta: { draftId }
    });
    return next;
  }

  async discardDraft(caseId, draftId, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const draft = await this._store.getTakeoffCorrectionDraft(draftId);
    if (!draft || draft.caseId !== caseId) reject("DRAFT_NOT_FOUND", "Correction draft not found.");
    if (draft.acceptedSnapshotId || draft.frozen) {
      reject(
        "DRAFT_FROZEN",
        "Accepted or frozen drafts cannot be discarded. Use Create revision to revise."
      );
    }
    await this._store.deleteTakeoffCorrectionDraft(draftId);
    const now = new Date().toISOString();
    await this._audit({
      caseId,
      runId: draft.sourceRunId,
      draftId,
      at: now,
      actorLabel: actor,
      eventType: "correction_draft_discarded",
      summary: `Correction draft discarded (${draftId}).`,
      meta: { draftId }
    });
    const remaining = await this.listDrafts(caseId);
    const open = remaining.find((d) => !d.frozen);
    const overlay = await this._store.getTakeoffOverlay(caseId);
    const hasAccepted = Boolean(overlay?.latestReviewedTakeoffSnapshotId);
    await this._store.setTakeoffOverlay(caseId, {
      latestCorrectionDraftId: open?.id ?? null,
      takeoffReviewState: open
        ? TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT
        : hasAccepted
          ? TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT
          : TAKEOFF_REVIEW_STATE.UNREVIEWED,
      takeoffUpdatedAt: now
    });
    return { ok: true };
  }

  async evaluateGate(caseId, draftId, opts = {}) {
    const draft = await this._store.getTakeoffCorrectionDraft(draftId);
    if (!draft || draft.caseId !== caseId) reject("DRAFT_NOT_FOUND", "Correction draft not found.");
    const run = await this._store.getTakeoffRun(draft.sourceRunId);
    const snap = await this._store.getLatestAcceptedSnapshot(caseId);
    const caseRow = opts.caseRow ?? (await this._store.getCase(caseId));
    const stated =
      (await this._store.getTakeoffOverlay(caseId))?.statedSquareFootage ??
      caseRow?.proposedSquareFootage ??
      null;
    return evaluateTakeoffAcceptanceGate({
      sourceRun: run,
      draft,
      acceptedIntakeSnapshot: snap,
      statedSquareFootage: stated
    });
  }

  async acceptSnapshot(caseId, draftId, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const draft = await this._store.getTakeoffCorrectionDraft(draftId);
    if (!draft || draft.caseId !== caseId) reject("DRAFT_NOT_FOUND", "Correction draft not found.");
    if (draft.frozen || draft.reviewState === TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT) {
      reject(
        "DRAFT_FROZEN",
        "This draft was already accepted. Use Create revision to revise the reviewed takeoff."
      );
    }

    const gate = await this.evaluateGate(caseId, draftId, opts);
    if (!gate.ready) {
      const err = new Error(`Acceptance blocked: ${gate.blockers.join(" ")}`);
      err.code = "ACCEPTANCE_BLOCKED";
      err.blockers = gate.blockers;
      throw err;
    }

    const run = await this._store.getTakeoffRun(draft.sourceRunId);
    const projection = gate.projection;
    const fingerprint = computeReviewedFingerprint({
      sourceRunId: run.id,
      sourceAttachmentHash: run.attachmentContentHash,
      acceptedIntakeSnapshotId: draft.acceptedIntakeSnapshotId,
      projection,
      operations: draft.operations
    });

    const priorOverlay = await this._store.getTakeoffOverlay(caseId);
    const priorLatestId = priorOverlay?.latestReviewedTakeoffSnapshotId ?? null;
    const priorLatest = priorLatestId
      ? await this._store.getReviewedTakeoffSnapshot(priorLatestId)
      : null;

    if (priorLatest?.snapshotFingerprint && priorLatest.snapshotFingerprint === fingerprint) {
      return {
        ok: false,
        code: "TAKEOFF_NO_CHANGES_SINCE_ACCEPTANCE",
        message:
          "The latest accepted snapshot already represents these reviewed values. No new snapshot was created.",
        snapshot: priorLatest,
        fingerprint,
        gate
      };
    }

    if (
      draft.baselineFingerprint &&
      draft.parentSnapshotId &&
      fingerprint === draft.baselineFingerprint
    ) {
      return {
        ok: false,
        code: "TAKEOFF_NO_CHANGES_SINCE_ACCEPTANCE",
        message:
          "No material changes since the parent accepted snapshot. Create material revisions before accepting again.",
        snapshot: priorLatest,
        fingerprint,
        gate
      };
    }

    const now = new Date().toISOString();
    const snapshotId = `qil-toff-snap-${compactStamp(now)}-${Math.random().toString(16).slice(2, 8)}`;
    const material = hasMaterialCorrections(run, draft, projection);

    const snapshot = Object.freeze(
      JSON.parse(
        JSON.stringify({
          id: snapshotId,
          schemaVersion: REVIEWED_TAKEOFF_SCHEMA_VERSION,
          caseId,
          sourceRunId: run.id,
          sourceAttachmentId: run.attachmentId,
          sourceAttachmentHash: run.attachmentContentHash,
          acceptedIntakeSnapshotId: draft.acceptedIntakeSnapshotId,
          acceptedAt: now,
          acceptedBy: actor,
          rooms: projection.rooms,
          excludedPieces: projection.excludedPieces,
          addedPieceIds: projection.addedPieceIds,
          sinkCutoutCount: projection.sinkCount,
          calculation: {
            measuredCountertopSf: projection.calculation.measuredCountertopSf,
            measuredBacksplashSf: projection.calculation.measuredBacksplashSf,
            measuredFhbSf: projection.calculation.measuredFhbSf,
            measuredCombinedSf: projection.calculation.measuredCombinedSf,
            sinkCutoutCount: projection.sinkCount,
            statedSquareFootage: projection.calculation.statedSquareFootage ?? null,
            statedVersusReviewedVarianceSf: projection.calculation.statedVersusReviewedVarianceSf,
            providerProposedCountertopSf: run.calculation?.providerProposedCountertopSf ?? null,
            providerProposedBacksplashSf: run.calculation?.providerProposedBacksplashSf ?? null,
            providerProposedCombinedSf: run.calculation?.providerProposedCombinedSf ?? null,
            originalDeterministicCountertopSf: run.calculation?.measuredCountertopSf ?? null,
            originalDeterministicBacksplashSf: run.calculation?.measuredBacksplashSf ?? null,
            originalDeterministicFhbSf: run.calculation?.measuredFhbSf ?? null,
            originalDeterministicCombinedSf: run.calculation?.measuredCombinedSf ?? null,
            providerVersusReviewedVarianceSf: projection.calculation.providerVersusReviewedVarianceSf,
            originalVersusReviewedVarianceSf: projection.calculation.originalVersusReviewedVarianceSf,
            authorityNote: projection.calculation.authorityNote
          },
          evidence: run.evidence ?? [],
          evidenceStates: projection.evidenceStates,
          warningResolutions: projection.warningResolutions,
          sourceWarnings: run.warnings ?? [],
          operations: draft.operations,
          correctionsAuditRef: draft.id,
          snapshotFingerprint: fingerprint,
          materiallyCorrected: material,
          parentSnapshotId: draft.parentSnapshotId ?? null,
          labMetadata: {
            noPricing: true,
            noInternalEstimateImport: true,
            noQuoteLibrary: true,
            noCustomerEmail: true,
            simulatedProvider: run.provider?.mode === "simulated",
            note: "Accepted lab reviewed takeoff snapshot — does not create a quote or pricing."
          },
          supersedesSnapshotId: priorLatestId,
          note: opts.note ?? "Accepted lab reviewed takeoff snapshot."
        })
      )
    );

    assertNoPricingFields(snapshot);
    await this._store.saveReviewedTakeoffSnapshot(snapshot);

    await this._store.setTakeoffOverlay(caseId, {
      takeoffReviewState: TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT,
      latestReviewedTakeoffSnapshotId: snapshotId,
      latestCorrectionDraftId: draft.id,
      reviewedMeasuredCountertopSquareFootage: snapshot.calculation.measuredCountertopSf,
      reviewedMeasuredBacksplashSquareFootage: snapshot.calculation.measuredBacksplashSf,
      reviewedMeasuredFullHeightBacksplashSquareFootage: snapshot.calculation.measuredFhbSf,
      reviewedMeasuredCombinedSquareFootage: snapshot.calculation.measuredCombinedSf,
      reviewedSinkCutoutCount: snapshot.sinkCutoutCount,
      takeoffUpdatedAt: now
    });

    await this._audit({
      caseId,
      runId: run.id,
      draftId: draft.id,
      snapshotId,
      at: now,
      actorLabel: actor,
      eventType: "takeoff_snapshot_accepted",
      summary: `Accepted reviewed takeoff snapshot ${snapshotId}.`,
      meta: {
        snapshotId,
        schemaVersion: REVIEWED_TAKEOFF_SCHEMA_VERSION,
        measuredCombinedSquareFootage: snapshot.calculation.measuredCombinedSf,
        fingerprint,
        materiallyCorrected: material
      },
      previousState: TAKEOFF_REVIEW_STATE.READY_FOR_ACCEPTANCE,
      newState: TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT
    });

    const frozenDraft = {
      ...draft,
      reviewState: TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT,
      acceptedSnapshotId: snapshotId,
      frozen: true,
      dirty: false,
      updatedAt: now,
      updatedBy: actor
    };
    await this._store.saveTakeoffCorrectionDraft(frozenDraft);

    const rerun = await this._store.getTakeoffRun(run.id);
    if (JSON.stringify(rerun.rooms) !== JSON.stringify(run.rooms)) {
      throw new Error("Invariant violated: source takeoff run was mutated.");
    }

    return {
      ok: true,
      snapshot,
      gate,
      fingerprint,
      materiallyCorrected: material,
      draft: frozenDraft,
      exitCorrectionMode: true
    };
  }

  /**
   * Start a new editable revision draft from the latest accepted snapshot.
   */
  async createRevision(caseId, opts = {}) {
    const actor = opts.actorLabel ?? this._actorLabel;
    const overlay = await this._store.getTakeoffOverlay(caseId);
    const latestId = overlay?.latestReviewedTakeoffSnapshotId;
    if (!latestId) {
      reject("NO_ACCEPTED_SNAPSHOT", "Accept a reviewed takeoff before creating a revision.");
    }
    const parent = await this._store.getReviewedTakeoffSnapshot(latestId);
    if (!parent) reject("NO_ACCEPTED_SNAPSHOT", "Latest accepted snapshot was not found.");

    const run = await this._store.getTakeoffRun(parent.sourceRunId);
    if (!run) reject("SOURCE_RUN_REQUIRED", "Source takeoff run missing for revision.");

    // Freeze any open draft for this run
    const existing = await this._store.getTakeoffCorrectionDraftByRun?.(caseId, parent.sourceRunId);
    if (existing && !existing.frozen) {
      await this._store.saveTakeoffCorrectionDraft({
        ...existing,
        frozen: true,
        reviewState: TAKEOFF_REVIEW_STATE.ACCEPTED_LAB_SNAPSHOT,
        updatedAt: new Date().toISOString()
      });
    }

    const now = new Date().toISOString();
    const draft = {
      id: `qil-toff-draft-${compactStamp(now)}-${Math.random().toString(16).slice(2, 8)}`,
      caseId,
      sourceRunId: parent.sourceRunId,
      sourceAttachmentId: parent.sourceAttachmentId,
      sourceAttachmentHash: parent.sourceAttachmentHash,
      acceptedIntakeSnapshotId: parent.acceptedIntakeSnapshotId,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      operations: JSON.parse(JSON.stringify(parent.operations ?? [])),
      reviewState: TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT,
      dirty: false,
      frozen: false,
      parentSnapshotId: parent.id,
      baselineFingerprint: parent.snapshotFingerprint,
      acceptedSnapshotId: null
    };

    await this._store.saveTakeoffCorrectionDraft(draft);
    await this._audit({
      caseId,
      runId: parent.sourceRunId,
      draftId: draft.id,
      snapshotId: parent.id,
      at: now,
      actorLabel: actor,
      eventType: "correction_draft_created",
      summary: `Revision draft created from accepted snapshot ${parent.id}.`,
      meta: {
        draftId: draft.id,
        parentSnapshotId: parent.id,
        baselineFingerprint: parent.snapshotFingerprint
      }
    });

    await this._store.setTakeoffOverlay(caseId, {
      takeoffReviewState: TAKEOFF_REVIEW_STATE.CORRECTION_DRAFT,
      latestCorrectionDraftId: draft.id,
      takeoffUpdatedAt: now
    });

    return { draft, parentSnapshot: parent, sourceRun: run, resumed: false, frozen: false };
  }

  async listAcceptedSnapshots(caseId) {
    return (await this._store.listReviewedTakeoffSnapshots?.(caseId)) ?? [];
  }

  async getAcceptedSnapshot(snapshotId) {
    return (await this._store.getReviewedTakeoffSnapshot?.(snapshotId)) ?? null;
  }

  async _audit(ev) {
    const event = {
      id: `qil-toff-aud-${compactStamp(ev.at)}-${Math.random().toString(16).slice(2, 8)}`,
      caseId: ev.caseId,
      runId: ev.runId ?? null,
      draftId: ev.draftId ?? null,
      snapshotId: ev.snapshotId ?? null,
      at: ev.at,
      actorType: "human",
      actorLabel: ev.actorLabel,
      eventType: ev.eventType,
      summary: ev.summary,
      meta: ev.meta ?? {},
      previousState: ev.previousState ?? null,
      newState: ev.newState ?? null
    };
    await this._store.appendTakeoffAuditEvent(event);
    return event;
  }
}

function mapOpToAudit(type) {
  switch (type) {
    case CORRECTION_OP.CONFIRM_PIECE:
      return "piece_confirmed";
    case CORRECTION_OP.EDIT_PIECE:
      return "measurement_corrected";
    case CORRECTION_OP.EXCLUDE_PIECE:
      return "piece_excluded";
    case CORRECTION_OP.ADD_PIECE:
      return "piece_added";
    case CORRECTION_OP.RENAME_ROOM:
    case CORRECTION_OP.ADD_ROOM:
    case CORRECTION_OP.MARK_ROOM_REVIEWED:
    case CORRECTION_OP.REASSIGN_PIECE:
      return "room_corrected";
    case CORRECTION_OP.EDIT_BACKSPLASH:
      return "backsplash_corrected";
    case CORRECTION_OP.SET_SINK_COUNT:
    case CORRECTION_OP.CONFIRM_SINK_COUNT:
      return "sink_count_corrected";
    case CORRECTION_OP.RESOLVE_WARNING:
      return "warning_resolved";
    default:
      return "correction_draft_saved";
  }
}

function assertNoPricingFields(obj) {
  const blob = JSON.stringify(obj);
  // Intentionally ignore labMetadata.noPricing / noInternalEstimateImport flags.
  if (
    /chargeable|pricedSquare|sellSquare|quoteTotal|"margin"|quote_library|import-from-takeoff|takeoff_import_v1|internalEstimateId|quoteLibraryId/i.test(
      blob
    )
  ) {
    throw new Error("Reviewed takeoff snapshot must not contain pricing / IE / Quote Library fields.");
  }
}

function compactStamp(iso) {
  return String(iso).replace(/[-:TZ.]/g, "").slice(0, 14);
}

function reject(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

export { warningKey };
