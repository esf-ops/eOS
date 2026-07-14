import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import "fake-indexeddb/auto";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { IdbLabStore } from "../repository/idbLabStore.mjs";
import { SYNTHETIC_PLAN_HASHES } from "./simulatedScenarios.mjs";
import { LAB_TAKEOFF_STATUS } from "./takeoffTypes.mjs";
import { TakeoffService } from "./takeoffService.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";

const STATED_SF = 48.5;
const HASH = SYNTHETIC_PLAN_HASHES["qil-synth-straight-kitchen"];

function makeAttachment(overrides = {}) {
  return {
    id: "qil-att-plan-1",
    filename: "qil-synth-straight-kitchen.pdf",
    contentType: "application/pdf",
    sizeBytes: 2048,
    contentHash: HASH,
    source: "synthetic_fixture",
    simulated: false,
    localOnly: true,
    ...overrides
  };
}

async function seedReadyCase(store, { caseId = "qil-imp-toff-1", statedSf = STATED_SF } = {}) {
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
    emailSubject: "Need Elite 100 estimate",
    emailExcerpt: "Synthetic",
    attachments: [makeAttachment()],
    requestedColor: "Calacatta Mira",
    resolvedPriceGroup: null,
    proposedSquareFootage: statedSf,
    sinkCutoutCount: null,
    edgeProfile: null,
    backsplashScope: null,
    missingInformation: [],
    aiConfidence: 0.9,
    takeoffState: "not_started",
    quotePreviewState: "none",
    unreadActivityCount: 0,
    internalNotes: "",
    simulatedLabels: ["imported locally"],
    events: [],
    importMeta: {
      dedupeKey: `mid:${caseId}@example.com`,
      dedupeStrategy: "message_id",
      messageId: `<${caseId}@example.com>`,
      messageContentHash: "b".repeat(64),
      parserWarnings: [],
      rawSourcePreserved: true,
      originalFilename: "synth.eml",
      textBody: "Synthetic body",
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
    catalogValidationState: "not_checked",
    overallConfidence: 0.9,
    fields: [
      {
        key: "statedSquareFootage",
        value: statedSf,
        unknown: false
      }
    ],
    missingInformation: [],
    missingKeys: [],
    corrections: [],
    provider: { name: "sim", mode: "simulated", version: "1" },
    note: "test snapshot"
  });
  await store.setCaseOverlay(caseId, {
    status: "qil_intake_review",
    acceptedSnapshotId: `qil-snap-${caseId}`,
    proposedSquareFootage: statedSf
  });
  return caseId;
}

function makeRepo(store, takeoffAdapter) {
  return new LocalQuoteIntakeRepository({
    store,
    asOfMode: "fixture",
    fixtureCases: [],
    takeoffAdapter: takeoffAdapter ?? getSimulatedTakeoffAdapter()
  });
}

describe("Phase 4B.1 takeoff persistence (memory)", () => {
  it("persists immutable simulated runs and case overlay", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const repo = makeRepo(store);

    const first = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen",
      actorLabel: "Tester"
    });
    assert.equal(first.ok, true);
    assert.equal(first.status, LAB_TAKEOFF_STATUS.REVIEW);
    assert.ok(first.run.calculation.measuredCountertopSf > 0);

    const listed = await repo.listTakeoffRuns(caseId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, first.runId);

    // Immutability
    await assert.rejects(() => store.saveTakeoffRun(first.run), (e) => e.code === "TAKEOFF_RUN_IMMUTABLE");

    const overlay = await repo.getTakeoffOverlay(caseId);
    assert.equal(overlay.statedSquareFootage, STATED_SF);
    assert.equal(overlay.measuredCountertopSquareFootage, first.run.calculation.measuredCountertopSf);
    assert.notEqual(overlay.measuredCountertopSquareFootage, overlay.statedSquareFootage);
    assert.equal(overlay.latestTakeoffRunId, first.runId);
    assert.equal(overlay.takeoffProviderMode, "simulated");
    assert.ok(overlay.takeoffWarningCounts.total >= 0);

    const caseRow = await repo.getCase(caseId);
    assert.equal(caseRow.proposedSquareFootage, STATED_SF);
    assert.equal(caseRow.statedSquareFootage, STATED_SF);
    assert.equal(caseRow.measuredCountertopSquareFootage, overlay.measuredCountertopSquareFootage);
  });

  it("retains multiple runs; latest pointer updates; prior run unchanged", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const repo = makeRepo(store);

    const a = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    const b = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-l-kitchen"
    });
    assert.notEqual(a.runId, b.runId);
    const runs = await repo.listTakeoffRuns(caseId);
    assert.equal(runs.length, 2);
    const overlay = await repo.getTakeoffOverlay(caseId);
    assert.equal(overlay.latestTakeoffRunId, b.runId);
    const latest = await repo.getTakeoffRun(overlay.latestTakeoffRunId);
    assert.equal(latest.scenarioId, "qil-synth-l-kitchen");

    const firstAgain = await repo.getTakeoffRun(a.runId);
    assert.equal(firstAgain.scenarioId, "qil-synth-straight-kitchen");
    assert.equal(firstAgain.calculation.measuredCountertopSf, a.run.calculation.measuredCountertopSf);
    assert.equal(overlay.measuredCountertopSquareFootage, b.run.calculation.measuredCountertopSf);
  });

  it("keeps provider-proposed totals non-authoritative on overlay", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const repo = makeRepo(store);
    const out = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    const overlay = await repo.getTakeoffOverlay(caseId);
    assert.ok(overlay.providerProposedSquareFootage != null);
    assert.notEqual(overlay.providerProposedSquareFootage, overlay.measuredCombinedSquareFootage);
    assert.equal(overlay.takeoffVariance, out.run.calculation.combinedVarianceSf);
  });

  it("persists manual-review state and warning counts", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const out = await makeRepo(store).runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-missing-dim"
    });
    assert.equal(out.status, LAB_TAKEOFF_STATUS.MANUAL_REVIEW);
    const overlay = await store.getTakeoffOverlay(caseId);
    assert.equal(overlay.latestTakeoffState, LAB_TAKEOFF_STATUS.MANUAL_REVIEW);
    assert.ok(overlay.takeoffWarningCounts.approval_blocking >= 1);
  });

  it("persists failed run without overwriting prior measured SF", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const failing = {
      name: "FailingAdapter",
      mode: "simulated",
      version: "fail-1",
      async run() {
        throw Object.assign(new Error("simulated failure"), { code: "SIM_FAIL" });
      }
    };
    const okRepo = makeRepo(store);
    const success = await okRepo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    const measured = success.overlay.measuredCombinedSquareFootage;

    const failRepo = makeRepo(store, failing);
    const failed = await failRepo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.status, LAB_TAKEOFF_STATUS.FAILED);
    const runs = await store.listTakeoffRuns(caseId);
    assert.equal(runs.length, 2);
    assert.ok(runs.some((r) => r.id === success.runId));
    assert.ok(runs.some((r) => r.labTakeoffStatus === LAB_TAKEOFF_STATUS.FAILED));

    const overlay = await store.getTakeoffOverlay(caseId);
    assert.equal(overlay.latestTakeoffState, LAB_TAKEOFF_STATUS.FAILED);
    assert.equal(overlay.latestTakeoffRunId, failed.runId);
    assert.equal(overlay.measuredCombinedSquareFootage, measured);
    assert.equal(overlay.statedSquareFootage, STATED_SF);
  });

  it("requires accepted snapshot and Elite 100 decision", async () => {
    const store = new MemoryLabStore();
    const caseId = "qil-imp-no-snap";
    await store.saveImportedCase({
      caseRow: {
        id: caseId,
        status: "qil_received",
        dataSource: "imported",
        receivedAt: "2026-07-14T18:00:00.000Z",
        attachments: [makeAttachment()],
        proposedSquareFootage: 10,
        importMeta: { dedupeKey: "mid:no-snap@example.com" },
        events: []
      },
      attachmentBlobs: []
    });
    const repo = makeRepo(store);
    await assert.rejects(
      () => repo.runTakeoff(caseId, { selectedAttachmentId: "qil-att-plan-1" }),
      (e) => e.code === "ACCEPTED_INTAKE_REQUIRED"
    );

    await store.saveReviewedSnapshot({
      id: "qil-snap-non-elite",
      caseId,
      runId: "r1",
      acceptedAt: "2026-07-14T18:05:00.000Z",
      acceptedBy: "t",
      intent: "new_quote_request",
      workflowEligibility: "non_elite_100_candidate",
      fields: [],
      missingKeys: [],
      corrections: [],
      provider: { mode: "simulated" }
    });
    await assert.rejects(
      () => repo.runTakeoff(caseId, { selectedAttachmentId: "qil-att-plan-1" }),
      (e) => e.code === "ELITE_100_CANDIDATE_REQUIRED"
    );
  });

  it("retains attachment hash and never persists attachment bytes", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const out = await makeRepo(store).runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    assert.equal(out.run.attachmentContentHash, HASH);
    const raw = JSON.stringify(out.run);
    assert.equal(/"bytes"\s*:\s*\[/.test(raw), false);
    assert.equal(/attachmentBytes/i.test(raw), false);
  });

  it("orders audit events and blocks pricing/IE/library fields", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    await makeRepo(store).runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    const events = await store.listTakeoffAuditEvents(caseId);
    const types = events.map((e) => e.eventType);
    assert.ok(types.includes("takeoff_requested"));
    assert.ok(types.includes("takeoff_started"));
    assert.ok(types.includes("takeoff_completed") || types.includes("takeoff_requires_manual_review"));
    assert.ok(types.includes("latest_takeoff_overlay_updated"));
    assert.ok(events[0].at <= events[events.length - 1].at);

    const blob = JSON.stringify({ run: await store.getLatestTakeoffRun(caseId), events });
    assert.equal(/chargeable|priced|sellSquare|quoteTotal|takeoff_import_v1|import-from-takeoff|quote_library/i.test(blob), false);
  });

  it("clearImported cascades takeoff data but preserves fixture takeoff", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    await makeRepo(store).runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });

    const fixtureCaseId = "qil-case-fixture-toff";
    await store.saveTakeoffRun({
      id: "qil-toff-fixture-1",
      caseId: fixtureCaseId,
      startedAt: "2026-07-14T17:00:00.000Z",
      labTakeoffStatus: LAB_TAKEOFF_STATUS.REVIEW,
      attachmentContentHash: HASH,
      rooms: [],
      warnings: [],
      calculation: { measuredCombinedSf: 1 }
    });
    await store.setTakeoffOverlay(fixtureCaseId, {
      latestTakeoffRunId: "qil-toff-fixture-1",
      measuredCombinedSquareFootage: 1
    });
    await store.appendTakeoffAuditEvent({
      id: "aud-fix-1",
      caseId: fixtureCaseId,
      at: "2026-07-14T17:00:00.000Z",
      eventType: "takeoff_completed",
      summary: "fixture"
    });

    await store.clearImported();
    assert.equal(await store.countImported(), 0);
    assert.equal((await store.listTakeoffRuns(caseId)).length, 0);
    assert.equal(await store.getTakeoffOverlay(caseId), null);
    assert.equal((await store.listTakeoffAuditEvents(caseId)).length, 0);
    assert.equal((await store.listTakeoffRuns(fixtureCaseId)).length, 1);
    assert.equal((await store.getTakeoffOverlay(fixtureCaseId))?.latestTakeoffRunId, "qil-toff-fixture-1");
  });

  it("makes no network calls", async () => {
    const store = new MemoryLabStore();
    const caseId = await seedReadyCase(store);
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network forbidden");
    };
    try {
      await makeRepo(store).runTakeoff(caseId, {
        selectedAttachmentId: "qil-att-plan-1",
        scenarioId: "qil-synth-sink-cutouts"
      });
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("Phase 4B.1 IndexedDB migration + parity", () => {
  /** @type {IdbLabStore} */
  let idb;

  before(async () => {
    idb = new IdbLabStore();
    await idb.ready();
    await idb.clearImported();
  });

  it("v3 stores persist takeoff while preserving Phase 2/3 data", async () => {
    const caseId = await seedReadyCase(idb, { caseId: "qil-imp-idb-toff-1" });
    await idb.saveClassificationRun({
      id: "qil-run-idb-1",
      caseId,
      providerMode: "simulated",
      startedAt: "2026-07-14T18:01:00.000Z",
      humanReviewState: "accepted",
      result: { intent: "new_quote_request" }
    });
    await idb.appendAuditEvent({
      id: "aud-cls-1",
      caseId,
      at: "2026-07-14T18:02:00.000Z",
      eventType: "classification_accepted",
      summary: "ok"
    });

    const service = new TakeoffService({ store: idb, takeoffAdapter: getSimulatedTakeoffAdapter() });
    const caseRow = await idb.getCase(caseId);
    const out = await service.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen",
      caseRow
    });
    assert.equal(out.ok, true);

    assert.equal((await idb.listClassificationRuns(caseId)).length, 1);
    assert.ok(await idb.getLatestAcceptedSnapshot(caseId));
    assert.equal((await idb.listAuditEvents(caseId)).length, 1);
    assert.equal((await idb.listTakeoffRuns(caseId)).length, 1);
    assert.ok((await idb.listTakeoffAuditEvents(caseId)).length >= 3);
    assert.equal((await idb.getTakeoffOverlay(caseId))?.latestTakeoffRunId, out.runId);

    const fixtureCaseId = "qil-case-fixture-idb-toff";
    await idb.setCaseOverlay(fixtureCaseId, { status: "qil_intake_review" });
    await idb.saveTakeoffRun({
      id: "qil-toff-fix-idb",
      caseId: fixtureCaseId,
      startedAt: "2026-07-14T17:00:00.000Z",
      labTakeoffStatus: LAB_TAKEOFF_STATUS.REVIEW,
      rooms: [],
      warnings: [],
      calculation: {}
    });

    await idb.clearImported();
    assert.equal(await idb.countImported(), 0);
    assert.equal((await idb.listTakeoffRuns(caseId)).length, 0);
    assert.equal((await idb.listTakeoffRuns(fixtureCaseId)).length, 1);
    assert.equal((await idb.getOverlay(fixtureCaseId))?.status, "qil_intake_review");
  });

  it("memory and IndexedDB share behavior contract for latest run", async () => {
    const mem = new MemoryLabStore();
    const memCase = await seedReadyCase(mem, { caseId: "qil-imp-parity-mem" });
    const idbCase = await seedReadyCase(idb, { caseId: "qil-imp-parity-idb" });

    const memOut = await makeRepo(mem).runTakeoff(memCase, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    const idbOut = await makeRepo(idb).runTakeoff(idbCase, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-straight-kitchen"
    });
    assert.equal(memOut.run.calculation.measuredCountertopSf, idbOut.run.calculation.measuredCountertopSf);
    assert.equal(
      (await mem.getTakeoffOverlay(memCase)).statedSquareFootage,
      (await idb.getTakeoffOverlay(idbCase)).statedSquareFootage
    );
  });
});
