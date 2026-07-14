import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { SYNTHETIC_PLAN_HASHES } from "./simulatedScenarios.mjs";
import { CORRECTION_OP } from "./correctionTypes.mjs";
import { warningKey } from "./approvalGate.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";
import {
  computeReviewedFingerprint,
  hasMaterialCorrections
} from "./reviewedFingerprint.mjs";
import { reviewedSfProvenance } from "./takeoffDisplay.mjs";

const HASH = SYNTHETIC_PLAN_HASHES["qil-synth-straight-kitchen"];
const STATED = 48;

function att(overrides = {}) {
  return {
    id: "qil-att-plan-1",
    filename: "plan.pdf",
    contentType: "application/pdf",
    sizeBytes: 4096,
    contentHash: HASH,
    source: "synthetic_fixture",
    ...overrides
  };
}

async function seed(store, { caseId = "qil-imp-431-1" } = {}) {
  const caseRow = {
    id: caseId,
    status: "qil_intake_review",
    dataSource: "imported",
    receivedAt: "2026-07-14T18:00:00.000Z",
    updatedAt: "2026-07-14T18:00:00.000Z",
    priority: "normal",
    senderName: "Lab",
    senderEmail: "lab@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Lab Sales",
    assignedEstimator: null,
    customerAccount: "Synthetic Homes",
    projectName: "Lab Kitchen",
    projectAddress: "1 Example Way",
    emailSubject: "Elite 100",
    emailExcerpt: "Synthetic",
    attachments: [att()],
    requestedColor: "Calacatta Mira",
    resolvedPriceGroup: null,
    proposedSquareFootage: STATED,
    sinkCutoutCount: null,
    edgeProfile: null,
    backsplashScope: null,
    missingInformation: [],
    aiConfidence: 0.9,
    takeoffState: "not_started",
    quotePreviewState: "none",
    unreadActivityCount: 0,
    internalNotes: "",
    simulatedLabels: [],
    events: [],
    importMeta: {
      dedupeKey: `mid:${caseId}@example.com`,
      dedupeStrategy: "message_id",
      messageId: `<${caseId}@example.com>`,
      messageContentHash: "e".repeat(64),
      parserWarnings: [],
      rawSourcePreserved: true,
      originalFilename: "x.eml",
      textBody: "body",
      to: [],
      cc: [],
      replyTo: null,
      thread: { conversationId: null, inReplyTo: null, references: [], threadKey: caseId },
      importTimestamp: "2026-07-14T18:00:00.000Z",
      importActor: "tester",
      htmlPresent: false
    }
  };
  await store.saveImportedCase({ caseRow, attachmentBlobs: [] });
  await store.saveReviewedSnapshot({
    id: `qil-snap-${caseId}`,
    caseId,
    runId: `qil-run-${caseId}`,
    acceptedAt: "2026-07-14T18:05:00.000Z",
    acceptedBy: "tester",
    intent: "new_quote_request",
    workflowEligibility: "elite_100_candidate",
    fields: [{ key: "statedSquareFootage", value: STATED, unknown: false }],
    missingInformation: [],
    missingKeys: [],
    corrections: [],
    provider: { name: "sim", mode: "simulated", version: "1" },
    note: "snap"
  });
  await store.setCaseOverlay(caseId, {
    status: "qil_intake_review",
    acceptedSnapshotId: `qil-snap-${caseId}`,
    proposedSquareFootage: STATED
  });
  return caseId;
}

function repoOf(store) {
  return new LocalQuoteIntakeRepository({
    store,
    fixtureCases: [],
    asOfMode: "fixture",
    takeoffAdapter: getSimulatedTakeoffAdapter()
  });
}

async function resolveForAccept(repo, caseId, draftId, sourceRun, { editLength } = {}) {
  const piece = sourceRun.rooms[0].pieces[0];
  if (editLength != null) {
    await repo.applyTakeoffCorrection(caseId, draftId, {
      type: CORRECTION_OP.EDIT_PIECE,
      pieceId: piece.id,
      patch: { lengthIn: editLength, depthIn: piece.measurement.depthIn, clearDirectSf: true },
      note: "Edited length"
    });
  }
  for (const room of sourceRun.rooms) {
    for (const p of room.pieces) {
      await repo.applyTakeoffCorrection(caseId, draftId, {
        type: CORRECTION_OP.CONFIRM_PIECE,
        pieceId: p.id
      });
    }
    await repo.applyTakeoffCorrection(caseId, draftId, {
      type: CORRECTION_OP.MARK_ROOM_REVIEWED,
      roomId: room.id
    });
  }
  await repo.applyTakeoffCorrection(caseId, draftId, {
    type: CORRECTION_OP.CONFIRM_SINK_COUNT,
    sinkCount: sourceRun.calculation.sinkCutoutCount ?? 0,
    note: "Confirmed sinks"
  });
  for (const w of sourceRun.warnings ?? []) {
    await repo.applyTakeoffCorrection(caseId, draftId, {
      type: CORRECTION_OP.RESOLVE_WARNING,
      warningKey: warningKey(w),
      severity: w.severity,
      resolutionKind: w.severity === "approval_blocking" ? "fixed_by_correction" : "acknowledged",
      note: "acked"
    });
  }
  return repo.evaluateTakeoffAcceptance(caseId, draftId);
}

describe("Phase 4B.3.1 acceptance integrity + provenance", () => {
  let store;
  let repo;
  let caseId;
  let sourceRun;

  before(async () => {
    store = new MemoryLabStore();
    await store.ready();
    caseId = await seed(store);
    repo = repoOf(store);
    const out = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen",
      actorLabel: "tester"
    });
    sourceRun = out.run;
  });

  it("draft vs accepted provenance labels and human-corrected only after material ops", () => {
    const draftOnly = reviewedSfProvenance({ accepted: false, material: false });
    assert.equal(draftOnly.title, "Draft reviewed SF");
    assert.ok(draftOnly.chips.includes("Unaccepted draft"));
    assert.ok(draftOnly.chips.includes("Unchanged from original deterministic result"));
    assert.equal(draftOnly.chips.includes("Human corrected"), false);

    const draftMaterial = reviewedSfProvenance({ accepted: false, material: true });
    assert.ok(draftMaterial.chips.includes("Human corrected"));

    const acceptedReview = reviewedSfProvenance({ accepted: true, material: false });
    assert.equal(acceptedReview.title, "Accepted reviewed SF");
    assert.ok(acceptedReview.chips.includes("Human reviewed"));
    assert.equal(acceptedReview.chips.includes("Human corrected"), false);

    const acceptedMaterial = reviewedSfProvenance({ accepted: true, material: true });
    assert.ok(acceptedMaterial.chips.includes("Human corrected"));
  });

  it("review-only acceptance: blocks identical re-accept, freezes draft, requires Create revision", async () => {
    const { draft } = await repo.beginTakeoffCorrection(caseId, sourceRun.id, {
      actorLabel: "tester"
    });
    const gate = await resolveForAccept(repo, caseId, draft.id, sourceRun);
    assert.equal(gate.ready, true, gate.blockers?.join("; "));
    const draftAfter = await repo.getTakeoffCorrectionDraft(caseId, sourceRun.id);
    assert.equal(hasMaterialCorrections(sourceRun, draftAfter, gate.projection), false);

    const accepted = await repo.acceptReviewedTakeoff(caseId, draft.id, { actorLabel: "tester" });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.materiallyCorrected, false);
    assert.equal(accepted.exitCorrectionMode, true);
    assert.equal(accepted.draft.frozen, true);

    const countAfterFirst = (await repo.listReviewedTakeoffSnapshots(caseId)).length;

    // Frozen draft cannot be accepted again
    await assert.rejects(
      () => repo.acceptReviewedTakeoff(caseId, draft.id, { actorLabel: "tester" }),
      /frozen|Create revision/i
    );
    assert.equal((await repo.listReviewedTakeoffSnapshots(caseId)).length, countAfterFirst);

    // begin resumes frozen accepted draft
    const begun = await repo.beginTakeoffCorrection(caseId, sourceRun.id, {
      actorLabel: "tester"
    });
    assert.equal(begun.frozen, true);
    assert.equal(begun.accepted, true);

    // Create revision without material change cannot produce a second snapshot
    const rev = await repo.createTakeoffRevision(caseId, { actorLabel: "tester" });
    assert.equal(rev.draft.parentSnapshotId, accepted.snapshot.id);
    assert.equal(rev.draft.baselineFingerprint, accepted.snapshot.snapshotFingerprint);
    const noop = await repo.acceptReviewedTakeoff(caseId, rev.draft.id, { actorLabel: "tester" });
    assert.equal(noop.ok, false);
    assert.equal(noop.code, "TAKEOFF_NO_CHANGES_SINCE_ACCEPTANCE");
    assert.equal((await repo.listReviewedTakeoffSnapshots(caseId)).length, countAfterFirst);

    // Material revision creates a second snapshot; parent retained; original immutable
    await resolveForAccept(repo, caseId, rev.draft.id, sourceRun, { editLength: 142 });
    const second = await repo.acceptReviewedTakeoff(caseId, rev.draft.id, { actorLabel: "tester" });
    assert.equal(second.ok, true);
    assert.equal(second.materiallyCorrected, true);
    assert.equal(second.snapshot.parentSnapshotId, accepted.snapshot.id);
    assert.notEqual(second.snapshot.id, accepted.snapshot.id);
    assert.notEqual(second.snapshot.snapshotFingerprint, accepted.snapshot.snapshotFingerprint);

    const list = await repo.listReviewedTakeoffSnapshots(caseId);
    assert.ok(list.some((s) => s.id === accepted.snapshot.id));
    assert.ok(list.some((s) => s.id === second.snapshot.id));

    await assert.rejects(
      () => store.saveReviewedTakeoffSnapshot({ ...accepted.snapshot }),
      /immutable/i
    );
    const original = await repo.getReviewedTakeoffSnapshot(accepted.snapshot.id);
    assert.equal(original.id, accepted.snapshot.id);
    assert.equal(original.snapshotFingerprint, accepted.snapshot.snapshotFingerprint);
  });

  it("fingerprint matches only equivalent reviewed projections", async () => {
    const lateCase = await seed(store, { caseId: "qil-imp-431-fp" });
    const lateRepo = repoOf(store);
    const out = await lateRepo.runTakeoff(lateCase, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen",
      actorLabel: "tester"
    });
    const run = out.run;
    const { draft } = await lateRepo.beginTakeoffCorrection(lateCase, run.id, {
      actorLabel: "tester"
    });
    const gate = await resolveForAccept(lateRepo, lateCase, draft.id, run, { editLength: 120 });
    const fp1 = computeReviewedFingerprint({
      sourceRunId: run.id,
      sourceAttachmentHash: run.attachmentContentHash,
      acceptedIntakeSnapshotId: draft.acceptedIntakeSnapshotId,
      projection: gate.projection,
      operations: (await lateRepo.getTakeoffCorrectionDraft(lateCase, run.id)).operations
    });
    const fp2 = computeReviewedFingerprint({
      sourceRunId: run.id,
      sourceAttachmentHash: run.attachmentContentHash,
      acceptedIntakeSnapshotId: draft.acceptedIntakeSnapshotId,
      projection: gate.projection,
      operations: (await lateRepo.getTakeoffCorrectionDraft(lateCase, run.id)).operations
    });
    assert.equal(fp1, fp2);
  });

  it("completed sink / room / warning controls reopen correctly", async () => {
    const c = await seed(store, { caseId: "qil-imp-431-ctl" });
    const r = repoOf(store);
    const out = await r.runTakeoff(c, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen",
      actorLabel: "tester"
    });
    const run = out.run;
    const { draft } = await r.beginTakeoffCorrection(c, run.id, { actorLabel: "tester" });
    await resolveForAccept(r, c, draft.id, run);

    let gate = await r.evaluateTakeoffAcceptance(c, draft.id);
    assert.equal(gate.projection.sinkConfirmed, true);
    assert.ok(Object.values(gate.projection.roomReviewed).every(Boolean));
    for (const w of run.warnings ?? []) {
      assert.ok(gate.projection.warningResolutions[warningKey(w)]);
    }

    await r.applyTakeoffCorrection(c, draft.id, {
      type: CORRECTION_OP.REOPEN_SINK_CONFIRMATION
    });
    gate = await r.evaluateTakeoffAcceptance(c, draft.id);
    assert.equal(gate.projection.sinkConfirmed, false);

    const roomId = run.rooms[0].id;
    await r.applyTakeoffCorrection(c, draft.id, {
      type: CORRECTION_OP.REOPEN_ROOM_REVIEW,
      roomId
    });
    gate = await r.evaluateTakeoffAcceptance(c, draft.id);
    assert.equal(gate.projection.roomReviewed[roomId], false);

    if ((run.warnings ?? []).length) {
      const key = warningKey(run.warnings[0]);
      await r.applyTakeoffCorrection(c, draft.id, {
        type: CORRECTION_OP.REOPEN_WARNING_RESOLUTION,
        warningKey: key
      });
      gate = await r.evaluateTakeoffAcceptance(c, draft.id);
      assert.equal(gate.projection.warningResolutions[key], undefined);
    }
  });
});
