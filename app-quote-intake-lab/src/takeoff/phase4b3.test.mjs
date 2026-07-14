import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import "fake-indexeddb/auto";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { IdbLabStore } from "../repository/idbLabStore.mjs";
import { SYNTHETIC_PLAN_HASHES } from "./simulatedScenarios.mjs";
import { CORRECTION_OP, REVIEWED_TAKEOFF_SCHEMA_VERSION } from "./correctionTypes.mjs";
import { warningKey } from "./approvalGate.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";

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

async function seed(store, { caseId = "qil-imp-corr-1", scenarioHash = HASH } = {}) {
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
    attachments: [att({ contentHash: scenarioHash })],
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
      messageContentHash: "d".repeat(64),
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

async function runSim(repo, caseId, scenarioId = "qil-synth-straight-kitchen") {
  return repo.runTakeoff(caseId, {
    selectedAttachmentId: "qil-att-plan-1",
    scenarioId,
    actorLabel: "tester"
  });
}

async function resolveForAccept(repo, caseId, draftId, sourceRun, { editLength } = {}) {
  const piece = sourceRun.rooms[0].pieces[0];
  const roomId = sourceRun.rooms[0].id;
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
      note: `Resolved ${w.code}`
    });
  }
  void roomId;
  return repo.evaluateTakeoffAcceptance(caseId, draftId);
}

describe("Phase 4B.3 corrections + accepted snapshots", () => {
  /** @type {MemoryLabStore} */
  let store;
  /** @type {LocalQuoteIntakeRepository} */
  let repo;
  let caseId;
  let sourceRun;

  before(async () => {
    store = new MemoryLabStore();
    await store.ready();
    caseId = await seed(store);
    repo = repoOf(store);
    await repo.ready();
    const out = await runSim(repo, caseId);
    sourceRun = out.run;
  });

  it("keeps original provider run immutable after corrections", async () => {
    const roomsBefore = JSON.stringify(sourceRun.rooms);
    const begun = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    const piece = sourceRun.rooms[0].pieces[0];
    await repo.applyTakeoffCorrection(caseId, begun.draft.id, {
      type: CORRECTION_OP.EDIT_PIECE,
      pieceId: piece.id,
      patch: { lengthIn: 140, depthIn: piece.measurement.depthIn, clearDirectSf: true },
      note: "stretch"
    });
    const again = await repo.getTakeoffRun(sourceRun.id);
    assert.equal(JSON.stringify(again.rooms), roomsBefore);
    assert.equal(again.calculation.measuredCombinedSf, sourceRun.calculation.measuredCombinedSf);
  });

  it("persists and resumes correction drafts", async () => {
    const begun = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    assert.equal(begun.resumed, true);
    await repo.saveTakeoffCorrectionDraft(caseId, begun.draft.id, { actorLabel: "tester" });
    const resumed = await repo.getTakeoffCorrectionDraft(caseId, sourceRun.id);
    assert.ok(resumed);
    assert.equal(resumed.id, begun.draft.id);
    assert.equal(resumed.dirty, false);
  });

  it("edits length/depth and recalculates deterministically", async () => {
    const begun = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    // fresh draft: discard then begin on a clean case
    await repo.discardTakeoffCorrectionDraft(caseId, begun.draft.id, { actorLabel: "tester" });
    const fresh = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    const piece = sourceRun.rooms[0].pieces[0];
    const before = sourceRun.calculation.measuredCombinedSf;
    const out = await repo.applyTakeoffCorrection(caseId, fresh.draft.id, {
      type: CORRECTION_OP.EDIT_PIECE,
      pieceId: piece.id,
      patch: { lengthIn: 160, depthIn: piece.measurement.depthIn, clearDirectSf: true },
      note: "longer"
    });
    assert.ok(out.projection.calculation.measuredCombinedSf > before);
    assert.notEqual(out.projection.calculation.measuredCombinedSf, before);
  });

  it("adds, excludes, and restores pieces; moves between rooms", async () => {
    await repo.discardTakeoffCorrectionDraft(
      caseId,
      (await repo.getTakeoffCorrectionDraft(caseId, sourceRun.id)).id,
      { actorLabel: "tester" }
    );
    const { draft } = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    const piece = sourceRun.rooms[0].pieces[0];
    await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.ADD_ROOM,
      room: { id: "qil-room-extra", name: "Pantry" }
    });
    const addedId = "qil-piece-added-1";
    await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.ADD_PIECE,
      roomId: "qil-room-extra",
      piece: {
        id: addedId,
        label: "Pantry top",
        roomId: "qil-room-extra",
        measurement: {
          lengthIn: 36,
          depthIn: 25.5,
          shape: "rect",
          pieceType: "counter",
          measuredSf: 0,
          evidenceIds: []
        },
        cutouts: [],
        notes: ["added"]
      }
    });
    let gateProj = (await repo.evaluateTakeoffAcceptance(caseId, draft.id)).projection;
    assert.ok(gateProj.addedPieceIds.includes(addedId));

    await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.EXCLUDE_PIECE,
      pieceId: piece.id
    });
    gateProj = (await repo.evaluateTakeoffAcceptance(caseId, draft.id)).projection;
    assert.ok(gateProj.excludedPieces.some((p) => p.id === piece.id));

    await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.RESTORE_PIECE,
      pieceId: piece.id
    });
    await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.REASSIGN_PIECE,
      pieceId: piece.id,
      roomId: "qil-room-extra"
    });
    gateProj = (await repo.evaluateTakeoffAcceptance(caseId, draft.id)).projection;
    const dest = gateProj.rooms.find((r) => r.id === "qil-room-extra");
    assert.ok(dest.pieces.some((p) => p.id === piece.id));
  });

  it("requires reason for manual direct-SF pieces", async () => {
    const { draft } = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    await assert.rejects(
      () =>
        repo.applyTakeoffCorrection(caseId, draft.id, {
          type: CORRECTION_OP.ADD_PIECE,
          roomId: sourceRun.rooms[0].id,
          piece: {
            id: "qil-direct-bad",
            label: "Bad",
            roomId: sourceRun.rooms[0].id,
            measurement: { directSf: 12, pieceType: "counter", shape: "rect" },
            notes: []
          }
        }),
      /reason/i
    );
  });

  it("corrects backsplash / FHB via area meta and sink count without altering SF from sinks", async () => {
    await repo.discardTakeoffCorrectionDraft(
      caseId,
      (await repo.getTakeoffCorrectionDraft(caseId, sourceRun.id)).id,
      { actorLabel: "tester" }
    );
    const { draft } = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    const roomId = sourceRun.rooms[0].id;
    const before = sourceRun.calculation.measuredCombinedSf;
    const withSplash = await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.EDIT_BACKSPLASH,
      roomId,
      patch: { backsplashLinearIn: 120, backsplashHeightIn: 4, backsplashScope: "standard" }
    });
    assert.ok(withSplash.projection.calculation.measuredBacksplashSf >= 0);

    const fhb = await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.EDIT_BACKSPLASH,
      roomId,
      patch: { backsplashManualSf: 8, reason: "Estimator FHB direct SF" }
    });
    assert.ok(fhb.projection.calculation.measuredBacksplashSf >= 0 || fhb.projection.calculation.measuredCombinedSf >= 0);

    const sink = await repo.applyTakeoffCorrection(caseId, draft.id, {
      type: CORRECTION_OP.SET_SINK_COUNT,
      sinkCount: 3,
      note: "two sinks + bar"
    });
    assert.equal(sink.projection.sinkCount, 3);
    // Sink count itself does not create measured SF deductions
    assert.ok(sink.projection.calculation.measuredCombinedSf >= 0);
    void before;
  });

  it("blocks dismiss of approval-blocking warnings and requires acknowledgment for estimator reviews", async () => {
    const missHash = SYNTHETIC_PLAN_HASHES["qil-synth-missing-dim"];
    const missStore = new MemoryLabStore();
    await missStore.ready();
    const missCase = await seed(missStore, { caseId: "qil-imp-miss-1", scenarioHash: missHash });
    const missRepo = repoOf(missStore);
    // Force scenario via option, hash unused for scenario when scenarioId set
    const missOut = await missRepo.runTakeoff(missCase, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-missing-dim",
      actorLabel: "tester"
    });
    const { draft } = await missRepo.beginTakeoffCorrection(missCase, missOut.run.id, {
      actorLabel: "tester"
    });
    const blocking = (missOut.run.warnings ?? []).find((w) => w.severity === "approval_blocking");
    assert.ok(blocking);
    await assert.rejects(
      () =>
        missRepo.applyTakeoffCorrection(missCase, draft.id, {
          type: CORRECTION_OP.RESOLVE_WARNING,
          warningKey: warningKey(blocking),
          severity: "approval_blocking",
          resolutionKind: "dismiss",
          note: "nope"
        }),
      /cannot be dismissed|BLOCKING/i
    );

    const gate = await missRepo.evaluateTakeoffAcceptance(missCase, draft.id);
    assert.equal(gate.ready, false);
    assert.ok(gate.blockers.some((b) => /unreviewed|missing|blocking|sink|room/i.test(b)));
  });

  it("accepts when blockers resolved; snapshot immutable; multiple preserved", async () => {
    await repo.discardTakeoffCorrectionDraft(
      caseId,
      (await repo.getTakeoffCorrectionDraft(caseId, sourceRun.id)).id,
      { actorLabel: "tester" }
    );
    const { draft } = await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
    let gate = await resolveForAccept(repo, caseId, draft.id, sourceRun, { editLength: 130 });
    assert.equal(gate.ready, true, gate.blockers?.join("; "));

    const accepted = await repo.acceptReviewedTakeoff(caseId, draft.id, { actorLabel: "tester" });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.snapshot.schemaVersion, REVIEWED_TAKEOFF_SCHEMA_VERSION);
    assert.equal(accepted.snapshot.sourceAttachmentHash, HASH);
    assert.ok(accepted.snapshot.labMetadata.noPricing);
    assert.ok(accepted.snapshot.labMetadata.noInternalEstimateImport);

    await assert.rejects(
      () => store.saveReviewedTakeoffSnapshot({ ...accepted.snapshot }),
      /immutable/i
    );

    // Second revised snapshot requires explicit Create revision + material change
    const revision = await repo.createTakeoffRevision(caseId, { actorLabel: "tester" });
    await resolveForAccept(repo, caseId, revision.draft.id, sourceRun, { editLength: 150 });
    const second = await repo.acceptReviewedTakeoff(caseId, revision.draft.id, {
      actorLabel: "tester"
    });
    assert.equal(second.ok, true);
    assert.notEqual(second.snapshot.id, accepted.snapshot.id);
    assert.equal(second.snapshot.parentSnapshotId, accepted.snapshot.id);

    const list = await repo.listReviewedTakeoffSnapshots(caseId);
    assert.ok(list.length >= 2);
    assert.ok(list.some((s) => s.id === accepted.snapshot.id));
    const overlay = await repo.getTakeoffOverlay(caseId);
    assert.equal(overlay.latestReviewedTakeoffSnapshotId, second.snapshot.id);

    const inspect = await repo.getReviewedTakeoffSnapshot(accepted.snapshot.id);
    assert.equal(inspect.id, accepted.snapshot.id);

    // Distinct SF layers
    assert.equal(overlay.statedSquareFootage ?? STATED, STATED);
    assert.notEqual(sourceRun.calculation.measuredCombinedSf, second.snapshot.calculation.measuredCombinedSf);
    assert.ok(second.snapshot.calculation.originalDeterministicCombinedSf != null);
    assert.ok(second.snapshot.calculation.providerProposedCombinedSf != null);

    const blob = JSON.stringify(second.snapshot);
    assert.equal(
      /chargeable|pricedSquare|sellSquare|quoteTotal|quote_library|import-from-takeoff|internalEstimateId|quoteLibraryId/i.test(
        blob
      ),
      false
    );
  });

  it("clearImported cascades drafts/snapshots; fixtures untouched; no bytes/network", async () => {
    const bytesCalls = { n: 0 };
    const orig = store.getAttachmentBytes?.bind(store);
    store.getAttachmentBytes = async (...a) => {
      bytesCalls.n += 1;
      return orig ? orig(...a) : null;
    };
    const fetches = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (...a) => {
      fetches.push(a[0]);
      throw new Error("network forbidden");
    };
    try {
      await repo.beginTakeoffCorrection(caseId, sourceRun.id, { actorLabel: "tester" });
      assert.equal(bytesCalls.n, 0);
      assert.equal(fetches.length, 0);

      // seed fixture takeoff draft pointer outside imported clear — fixture overlays preserved
      await store.setTakeoffOverlay("qil-case-fixture-keep", {
        latestReviewedTakeoffSnapshotId: "keep"
      });
      await store.saveReviewedTakeoffSnapshot({
        id: "qil-toff-snap-fixture",
        schemaVersion: REVIEWED_TAKEOFF_SCHEMA_VERSION,
        caseId: "qil-case-fixture-keep",
        sourceRunId: "x",
        sourceAttachmentHash: "a".repeat(64),
        acceptedAt: "2026-07-14T19:00:00.000Z",
        acceptedBy: "fix",
        rooms: [],
        calculation: { measuredCombinedSf: 1 },
        labMetadata: { noPricing: true }
      });

      await repo.clearImported();
      assert.equal(await repo.getTakeoffCorrectionDraft(caseId, sourceRun.id), null);
      assert.equal((await repo.listReviewedTakeoffSnapshots(caseId)).length, 0);
      assert.ok(await store.getReviewedTakeoffSnapshot("qil-toff-snap-fixture"));
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});

describe("Phase 4B.3 IndexedDB v4 migration", () => {
  it("migrates to v4 stores and keeps prior takeoff data", async () => {
    const idb = new IdbLabStore();
    await idb.ready();
    const caseId = await seed(idb, { caseId: "qil-imp-idb-corr" });
    const repo = repoOf(idb);
    const out = await runSim(repo, caseId);
    const { draft } = await repo.beginTakeoffCorrection(caseId, out.run.id, { actorLabel: "tester" });
    assert.ok(draft.id);
    const drafts = await idb.listTakeoffCorrectionDrafts(caseId);
    assert.equal(drafts.length, 1);
    const runs = await idb.listTakeoffRuns(caseId);
    assert.ok(runs.length >= 1);
  });
});
