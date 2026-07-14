import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { getFixtureCases } from "../fixtures/quoteIntakeCases.mjs";
import { SYNTHETIC_PLAN_HASHES } from "./simulatedScenarios.mjs";
import {
  DEFAULT_SIMULATED_SCENARIO_ID,
  listSimulatedScenarioOptions
} from "./scenarioCatalog.mjs";
import {
  evaluateTakeoffEligibility,
  groupWarningsBySeverity,
  listSupportedPlanAttachments
} from "./takeoffEligibility.mjs";
import {
  TAKEOFF_PROVENANCE,
  containsForbiddenPricingLabels,
  formatTakeoffSf,
  runProvenanceNote
} from "./takeoffDisplay.mjs";
import { LAB_TAKEOFF_STATUS } from "./takeoffTypes.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";

const HASH = SYNTHETIC_PLAN_HASHES["qil-synth-straight-kitchen"];
const STATED_SF = 40;

function makeAttachment(overrides = {}) {
  return {
    id: "qil-att-plan-1",
    filename: "kitchen-plan.pdf",
    contentType: "application/pdf",
    sizeBytes: 4096,
    contentHash: HASH,
    source: "synthetic_fixture",
    simulated: true,
    localOnly: true,
    ...overrides
  };
}

async function seedReadyCase(
  store,
  {
    caseId = "qil-imp-toff-ui-1",
    statedSf = STATED_SF,
    attachments,
    workflowEligibility = "elite_100_candidate"
  } = {}
) {
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
    attachments: attachments ?? [makeAttachment()],
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
      messageContentHash: "c".repeat(64),
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
    workflowEligibility,
    catalogValidationState: "not_checked",
    overallConfidence: 0.9,
    fields: [{ key: "statedSquareFootage", value: statedSf, unknown: false }],
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
    fixtureCases: [],
    asOfMode: "fixture",
    takeoffAdapter: takeoffAdapter ?? getSimulatedTakeoffAdapter()
  });
}

describe("Phase 4B.2 takeoff review eligibility", () => {
  it("requires accepted classification", () => {
    const caseItem = {
      id: "qil-no-snap",
      dataSource: "imported",
      attachments: [makeAttachment()],
      acceptedSnapshotId: null
    };
    const gate = evaluateTakeoffEligibility({ caseItem, acceptedSnapshot: null });
    assert.equal(gate.canOpenWorkspace, false);
    assert.ok(gate.reasons.includes("Classification must be accepted."));
  });

  it("requires Elite 100 candidate decision", async () => {
    const store = new MemoryLabStore();
    await store.ready();
    const caseId = await seedReadyCase(store, {
      caseId: "qil-non-elite",
      workflowEligibility: "non_elite_100_candidate"
    });
    const snap = await store.getLatestAcceptedSnapshot(caseId);
    const caseItem = await store.getCase(caseId);
    const gate = evaluateTakeoffEligibility({ caseItem, acceptedSnapshot: snap });
    assert.equal(gate.canOpenWorkspace, false);
    assert.ok(gate.reasons.includes("Case is not Elite 100."));
  });

  it("requires supported plan attachment with complete metadata", () => {
    const incomplete = {
      dataSource: "fixture",
      acceptedSnapshotId: "snap",
      attachments: [{ id: "a", filename: "x.pdf", contentType: "application/pdf" }]
    };
    const snap = { id: "snap", workflowEligibility: "elite_100_candidate", intent: "new_quote_request" };
    const gate = evaluateTakeoffEligibility({ caseItem: incomplete, acceptedSnapshot: snap });
    assert.equal(gate.canOpenWorkspace, false);
    assert.ok(gate.reasons.includes("Attachment metadata is incomplete."));
  });

  it("flags multiple attachments as requiring selection before run", () => {
    const caseItem = {
      dataSource: "imported",
      attachments: [
        makeAttachment({ id: "a1", contentHash: "a".repeat(64) }),
        makeAttachment({ id: "a2", contentHash: "b".repeat(64) })
      ]
    };
    const snap = { id: "snap", workflowEligibility: "elite_100_candidate", intent: "new_quote_request" };
    const open = evaluateTakeoffEligibility({ caseItem, acceptedSnapshot: snap });
    assert.equal(open.canOpenWorkspace, true);
    assert.equal(open.canRun, false);
    assert.ok(open.reasons.includes("Multiple attachments require selection."));
    const selected = evaluateTakeoffEligibility({
      caseItem,
      acceptedSnapshot: snap,
      selectedAttachmentId: "a2"
    });
    assert.equal(selected.canRun, true);
  });

  it("lists ten simulated scenarios with a simple-kitchen default", () => {
    const options = listSimulatedScenarioOptions();
    assert.equal(options.length, 10);
    assert.equal(DEFAULT_SIMULATED_SCENARIO_ID, "qil-synth-straight-kitchen");
    assert.ok(options.some((o) => o.id === DEFAULT_SIMULATED_SCENARIO_ID));
  });

  it("enriches fixture plan attachments with synthetic metadata for lab takeoff", () => {
    const fixtures = getFixtureCases();
    const withPlan = fixtures.find((c) =>
      (c.attachments ?? []).some((a) => String(a.contentType).includes("pdf"))
    );
    assert.ok(withPlan);
    const supported = listSupportedPlanAttachments(withPlan);
    assert.ok(supported.length >= 1);
    assert.match(supported[0].contentHash, /^[a-f0-9]{64}$/);
  });
});

describe("Phase 4B.2 takeoff review service integration", () => {
  /** @type {MemoryLabStore} */
  let store;
  /** @type {LocalQuoteIntakeRepository} */
  let repo;
  let caseId;

  before(async () => {
    store = new MemoryLabStore();
    await store.ready();
    caseId = await seedReadyCase(store);
    repo = makeRepo(store);
    await repo.ready();
  });

  it("run action calls TakeoffService and persists the run", async () => {
    const caseItem = await repo.getCase(caseId);
    const snap = await repo.getAcceptedSnapshot(caseId);
    const gate = evaluateTakeoffEligibility({ caseItem, acceptedSnapshot: snap });
    assert.equal(gate.canOpenWorkspace, true);
    assert.equal(gate.canRun, true);

    const out = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: DEFAULT_SIMULATED_SCENARIO_ID,
      actorLabel: "UI tester"
    });
    assert.equal(out.ok, true);
    assert.ok(out.runId);
    assert.equal(out.run.provider.mode, "simulated");
    assert.equal(out.run.attachmentContentHash, HASH);
    assert.equal(out.run.bytes, undefined);
    assert.equal(JSON.stringify(out.run).includes("attachmentBytes"), false);

    const runs = await repo.listTakeoffRuns(caseId);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].id, out.runId);
  });

  it("summary keeps stated and measured SF distinct; provider non-authoritative", async () => {
    const caseItem = await repo.getCase(caseId);
    const run = await repo.getLatestTakeoffRun(caseId);
    assert.equal(caseItem.statedSquareFootage ?? caseItem.proposedSquareFootage, STATED_SF);
    assert.notEqual(run.calculation.measuredCombinedSf, null);
    assert.notEqual(caseItem.statedSquareFootage, run.calculation.measuredCombinedSf);
    assert.ok(run.calculation.authorityNote || run.provider.note);
    assert.match(runProvenanceNote(run), /Simulated takeoff/i);
    assert.ok(TAKEOFF_PROVENANCE.EMAIL_STATED.includes("Email"));
    assert.ok(TAKEOFF_PROVENANCE.DETERMINISTIC.includes("deterministic"));
    assert.ok(TAKEOFF_PROVENANCE.SIMULATED_PROVIDER.includes("Simulated"));
  });

  it("shows sink count without SF deduction and groups warning severities", async () => {
    const out = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-sink-cutouts",
      actorLabel: "UI tester"
    });
    assert.ok(out.run.calculation.sinkCutoutCount >= 1);
    const beforeSf = out.run.calculation.measuredCountertopSf;
    // Cutouts must not zero out measured SF
    assert.ok(beforeSf > 0);

    const manual = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: "qil-synth-missing-dim",
      actorLabel: "UI tester"
    });
    assert.equal(manual.run.labTakeoffStatus, LAB_TAKEOFF_STATUS.MANUAL_REVIEW);
    const groups = groupWarningsBySeverity(manual.run.warnings);
    assert.ok(groups.approval_blocking.length + groups.estimator_review.length >= 1);

    const labels = [
      formatTakeoffSf(out.run.calculation.measuredCombinedSf),
      TAKEOFF_PROVENANCE.DETERMINISTIC,
      "sink cutout count"
    ].join(" ");
    assert.equal(containsForbiddenPricingLabels(labels), false);
    assert.equal(containsForbiddenPricingLabels("Chargeable SF"), true);
  });

  it("failed run preserves prior success and remains in history", async () => {
    // Ensure a successful measured baseline exists (manual-review scenarios may measure 0).
    const baseline = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: DEFAULT_SIMULATED_SCENARIO_ID,
      actorLabel: "UI tester"
    });
    assert.equal(baseline.ok, true);
    assert.ok(baseline.run.calculation.measuredCombinedSf > 0);

    const failingAdapter = {
      name: "FailAdapter",
      mode: "simulated",
      version: "fail-1",
      async run() {
        const err = new Error("Injected adapter failure");
        err.code = "SIMULATED_FAIL";
        throw err;
      }
    };
    const failRepo = makeRepo(store, failingAdapter);
    const before = await failRepo.getCase(caseId);
    const priorMeasured = before.measuredCombinedSquareFootage;
    assert.ok(priorMeasured != null && priorMeasured > 0);

    const failed = await failRepo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-plan-1",
      scenarioId: DEFAULT_SIMULATED_SCENARIO_ID,
      actorLabel: "UI tester"
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.run.labTakeoffStatus, LAB_TAKEOFF_STATUS.FAILED);

    const after = await failRepo.getCase(caseId);
    assert.equal(after.measuredCombinedSquareFootage, priorMeasured);
    assert.equal(after.latestTakeoffState, LAB_TAKEOFF_STATUS.FAILED);

    const history = await failRepo.listTakeoffRuns(caseId);
    assert.ok(history.length >= 2);
    assert.ok(history.some((r) => r.labTakeoffStatus === LAB_TAKEOFF_STATUS.FAILED));
    assert.ok(
      history.some(
        (r) =>
          r.labTakeoffStatus === LAB_TAKEOFF_STATUS.REVIEW ||
          r.labTakeoffStatus === LAB_TAKEOFF_STATUS.MANUAL_REVIEW
      )
    );

    // Selecting an older run for inspection is a UI concern — history still immutable.
    const older = history.find((r) => r.id !== after.latestTakeoffRunId);
    assert.ok(older);
    const reloaded = await failRepo.getTakeoffRun(older.id);
    assert.deepEqual(reloaded.rooms, older.rooms);
  });

  it("never reads attachment bytes and never makes network calls", async () => {
    let bytesCalls = 0;
    const orig = store.getAttachmentBytes?.bind(store);
    store.getAttachmentBytes = async (...args) => {
      bytesCalls += 1;
      return orig ? orig(...args) : null;
    };

    const fetches = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      fetches.push(args[0]);
      throw new Error("network forbidden in Phase 4B.2");
    };
    try {
      await repo.runTakeoff(caseId, {
        selectedAttachmentId: "qil-att-plan-1",
        scenarioId: "qil-synth-l-kitchen",
        actorLabel: "UI tester"
      });
      assert.equal(bytesCalls, 0);
      assert.equal(fetches.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exposes no pricing / IE / Quote Library fields on persisted runs", async () => {
    const runs = await repo.listTakeoffRuns(caseId);
    const blob = JSON.stringify(runs);
    assert.equal(
      /chargeable|pricedSquare|sellSquare|quoteTotal|quote_library|import-from-takeoff|takeoff_import_v1|internalEstimate/i.test(
        blob
      ),
      false
    );
  });
});
