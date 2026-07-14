import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTakeoffRequest } from "./buildTakeoffRequest.mjs";
import { applyDeterministicMeasurements, sfFromRun } from "./labMeasurementCalc.mjs";
import {
  LAB_TAKEOFF_STATUS,
  PROVIDER_MODE_SIMULATED,
  REVIEWED_TAKEOFF_SCHEMA_VERSION
} from "./takeoffTypes.mjs";
import { canTransitionLabTakeoff } from "./takeoffStates.mjs";
import { SimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";
import { SYNTHETIC_PLAN_HASHES, SCENARIO_IDS } from "./simulatedScenarios.mjs";
import { validateLabTakeoffRun } from "./validateLabTakeoff.mjs";

const BASE_CASE = {
  caseId: "qil-case-lab-synth-001",
  acceptedIntakeSnapshotId: "qil-snap-lab-synth-001",
  elite100Decision: "elite_100_candidate",
  intent: "new_quote_request",
  actorLabel: "Lab Tester",
  transmissionAcknowledgmentPlaceholder: true
};

function synthAttachment(scenarioId, overrides = {}) {
  return {
    id: `qil-att-${scenarioId}`,
    filename: `${scenarioId}.pdf`,
    contentType: "application/pdf",
    sizeBytes: 2048,
    contentHash: SYNTHETIC_PLAN_HASHES[scenarioId],
    source: "synthetic_fixture",
    ...overrides
  };
}

function validInput(scenarioId = "qil-synth-straight-kitchen", extra = {}) {
  const att = synthAttachment(scenarioId);
  return {
    ...BASE_CASE,
    attachments: [att],
    selectedAttachmentId: att.id,
    scenarioId,
    ...extra
  };
}

describe("Phase 4B.0 TakeoffRequest", () => {
  it("builds a valid TakeoffRequest", () => {
    const req = buildTakeoffRequest(validInput());
    assert.equal(req.caseId, BASE_CASE.caseId);
    assert.equal(req.acceptedIntakeSnapshotId, BASE_CASE.acceptedIntakeSnapshotId);
    assert.equal(req.elite100Decision, "elite_100_candidate");
    assert.equal(req.attachment.contentHash.length, 64);
    assert.equal(req.attachment.transmissionAcknowledgmentPlaceholder, true);
  });

  it("requires accepted intake snapshot", () => {
    assert.throws(
      () => buildTakeoffRequest(validInput("qil-synth-straight-kitchen", { acceptedIntakeSnapshotId: null })),
      (e) => e.code === "ACCEPTED_INTAKE_REQUIRED"
    );
  });

  it("requires Elite 100 candidate decision", () => {
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", { elite100Decision: "program_unknown" })
        ),
      (e) => e.code === "ELITE_100_CANDIDATE_REQUIRED"
    );
  });

  it("rejects non-Elite-100 and not-quote cases", () => {
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", { elite100Decision: "non_elite_100_candidate" })
        ),
      (e) => e.code === "NON_ELITE_100"
    );
    assert.throws(
      () => buildTakeoffRequest(validInput("qil-synth-straight-kitchen", { intent: "not_quote_related" })),
      (e) => e.code === "NOT_QUOTE_RELATED"
    );
  });

  it("enforces one-attachment policy and rejects missing selection", () => {
    const a = synthAttachment("qil-synth-straight-kitchen");
    const b = synthAttachment("qil-synth-l-kitchen", { id: "qil-att-second" });
    assert.throws(
      () =>
        buildTakeoffRequest({
          ...BASE_CASE,
          attachments: [a, b],
          selectedAttachmentId: a.id,
          selectedAttachmentIds: [a.id, b.id]
        }),
      (e) => e.code === "MULTIPLE_ATTACHMENTS"
    );
    assert.throws(
      () =>
        buildTakeoffRequest({
          ...BASE_CASE,
          attachments: [a],
          selectedAttachmentId: "missing"
        }),
      (e) => e.code === "ATTACHMENT_NOT_FOUND"
    );
  });

  it("never accepts attachment bytes", () => {
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [synthAttachment("qil-synth-straight-kitchen", { bytes: new Uint8Array([1, 2]) })]
          })
        ),
      (e) => e.code === "ATTACHMENT_BYTES_FORBIDDEN"
    );
  });

  it("rejects unsupported MIME and empty hashes", () => {
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [synthAttachment("qil-synth-straight-kitchen", { contentType: "text/plain" })]
          })
        ),
      (e) => e.code === "UNSUPPORTED_MIME"
    );
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [synthAttachment("qil-synth-straight-kitchen", { contentHash: "" })]
          })
        ),
      (e) => e.code === "ATTACHMENT_HASH_REQUIRED"
    );
  });

  it("rejects production URLs and production takeoff/IE/library IDs", () => {
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [
              synthAttachment("qil-synth-straight-kitchen", {
                storageUrl: "https://xyz.supabase.co/storage/v1/object/eliteos-quote-files/x"
              })
            ]
          })
        ),
      (e) => e.code === "PRODUCTION_STORAGE_URL"
    );
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [
              synthAttachment("qil-synth-straight-kitchen", { productionTakeoffJobId: "qto-prod-1" })
            ]
          })
        ),
      (e) => e.code === "PRODUCTION_TAKEOFF_ID"
    );
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [synthAttachment("qil-synth-straight-kitchen", { internalEstimateId: "ie-1" })]
          })
        ),
      (e) => e.code === "INTERNAL_ESTIMATE_ID"
    );
    assert.throws(
      () =>
        buildTakeoffRequest(
          validInput("qil-synth-straight-kitchen", {
            attachments: [synthAttachment("qil-synth-straight-kitchen", { quoteLibraryId: "ql-1" })]
          })
        ),
      (e) => e.code === "QUOTE_LIBRARY_ID"
    );
  });
});

describe("Phase 4B.0 SimulatedTakeoffAdapter", () => {
  it("is deterministic and labeled simulated for each scenario", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    assert.equal(adapter.mode, PROVIDER_MODE_SIMULATED);
    for (const scenarioId of SCENARIO_IDS) {
      const a = await adapter.run(validInput(scenarioId));
      const b = await adapter.run(validInput(scenarioId));
      assert.equal(a.run.provider.mode, "simulated");
      assert.match(a.run.provider.note, /does not read plan bytes/i);
      assert.equal(a.run.scenarioId, scenarioId);
      assert.equal(a.run.calculation.measuredCountertopSf, b.run.calculation.measuredCountertopSf);
      assert.equal(a.run.calculation.measuredCombinedSf, b.run.calculation.measuredCombinedSf);
      assert.ok(a.run.evidence.every((e) => /simulated/i.test(e.simulatedNote)));
      assert.equal(/gemini|opened the pdf|ocr/i.test(JSON.stringify(a.run.evidence)), false);
    }
  });

  it("never makes network calls", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("network forbidden");
    };
    try {
      await adapter.run(validInput());
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("computes piece / room / total measured SF authoritatively", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const { run } = await adapter.run(validInput("qil-synth-straight-kitchen"));
    const expectedPiece = sfFromRun(120, 25.5);
    assert.equal(run.rooms[0].pieces[0].measurement.measuredSf, expectedPiece);
    assert.equal(run.rooms[0].measuredCountertopSf, expectedPiece);
    assert.equal(run.calculation.measuredCountertopSf, expectedPiece);
    assert.equal(run.calculation.measuredCombinedSf, expectedPiece);
  });

  it("calculates L-shape with corner deduction and standard/FHB backsplash", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const l = (await adapter.run(validInput("qil-synth-l-kitchen"))).run;
    // 96×25.5 + 84×25.5 − 25.5×25.5  → /144
    assert.equal(l.calculation.measuredCountertopSf, 27.36);

    const splash = (await adapter.run(validInput("qil-synth-standard-splash"))).run;
    assert.ok(splash.calculation.measuredBacksplashSf > 0);
    assert.equal(splash.calculation.measuredBacksplashSf, sfFromRun(120, 4));

    const fhb = (await adapter.run(validInput("qil-synth-fhb"))).run;
    assert.equal(fhb.calculation.measuredFhbSf, sfFromRun(60, 48));
    assert.ok(fhb.calculation.measuredCombinedSf > fhb.calculation.measuredCountertopSf);
  });

  it("does not deduct sink cutout area from measured SF", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const withCuts = (await adapter.run(validInput("qil-synth-sink-cutouts"))).run;
    assert.equal(withCuts.calculation.sinkCutoutCount, 2);
    assert.equal(withCuts.calculation.measuredCountertopSf, sfFromRun(110, 25.5));
    assert.ok(withCuts.warnings.some((w) => w.code === "CUTOUT_SCOPE_ONLY"));
  });

  it("treats provider totals as non-authoritative and emits variance warnings", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const { run } = await adapter.run(validInput("qil-synth-straight-kitchen"));
    assert.ok(run.calculation.providerProposedCombinedSf != null);
    assert.notEqual(run.calculation.providerProposedCombinedSf, run.calculation.measuredCombinedSf);
    assert.ok(run.calculation.combinedVarianceSf != null);
    assert.match(run.calculation.authorityNote, /authoritative/i);
    assert.ok(run.warnings.some((w) => w.code === "PROVIDER_TOTAL_VARIANCE"));
  });

  it("maps missing dims / conflicts / irregular to manual review", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    for (const id of ["qil-synth-missing-dim", "qil-synth-conflict-dim", "qil-synth-irregular"]) {
      const { run, status } = await adapter.run(validInput(id));
      assert.equal(status, LAB_TAKEOFF_STATUS.MANUAL_REVIEW);
      assert.equal(run.labTakeoffStatus, LAB_TAKEOFF_STATUS.MANUAL_REVIEW);
    }
    const missing = (await adapter.run(validInput("qil-synth-missing-dim"))).run;
    assert.ok(missing.warnings.some((w) => w.code === "MISSING_DIMENSION" && w.blocking));
    const conflict = (await adapter.run(validInput("qil-synth-conflict-dim"))).run;
    assert.ok(conflict.warnings.some((w) => w.code === "CONFLICTING_DIMENSION"));
    const irregular = (await adapter.run(validInput("qil-synth-irregular"))).run;
    assert.ok(irregular.warnings.some((w) => w.code === "UNSUPPORTED_GEOMETRY"));
  });

  it("links evidence and validates warning severity fields", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const { run } = await adapter.run(validInput("qil-synth-kitchen-island"));
    for (const piece of run.rooms.flatMap((r) => r.pieces)) {
      for (const eid of piece.measurement.evidenceIds ?? []) {
        assert.ok(run.evidence.some((e) => e.id === eid));
      }
    }
    for (const w of run.warnings) {
      assert.ok(["informational", "estimator_review", "approval_blocking"].includes(w.severity));
      assert.equal(typeof w.blocking, "boolean");
      assert.equal(typeof w.estimatorActionRequired, "boolean");
      assert.ok(w.code && w.message);
    }
  });

  it("detects duplicate ids and orphan evidence links", () => {
    const rooms = [
      {
        id: "r1",
        name: "K",
        pieces: [
          {
            id: "p1",
            label: "A",
            roomId: "r1",
            measurement: {
              lengthIn: 10,
              depthIn: 10,
              shape: "rect",
              pieceType: "counter",
              measuredSf: 0,
              evidenceIds: ["missing-ev"]
            }
          },
          {
            id: "p1",
            label: "dup",
            roomId: "r1",
            measurement: {
              lengthIn: 10,
              depthIn: 10,
              shape: "rect",
              pieceType: "counter",
              measuredSf: 0,
              evidenceIds: []
            }
          }
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0
      }
    ];
    const { rooms: measuredRooms, calculation } = applyDeterministicMeasurements(rooms);
    const result = validateLabTakeoffRun({
      id: "run1",
      caseId: "c1",
      acceptedIntakeSnapshotId: "qil-snap-1",
      attachmentId: "a1",
      attachmentContentHash: SYNTHETIC_PLAN_HASHES["qil-synth-straight-kitchen"],
      provider: { name: "x", mode: "simulated", version: "1", note: "sim" },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      labTakeoffStatus: LAB_TAKEOFF_STATUS.REVIEW,
      humanReviewState: "unreviewed",
      pages: [{ pageNumber: 1 }],
      rooms: measuredRooms,
      evidence: [
        {
          id: "ev1",
          pageNumber: 1,
          label: "dimension unused",
          value: 1,
          simulatedNote: "Simulated fixture evidence — unused."
        }
      ],
      warnings: [],
      corrections: [],
      calculation,
      confidence: "high",
      failure: null
    });
    assert.ok(result.warnings.some((w) => w.code === "DUPLICATE_ID"));
    assert.ok(result.warnings.some((w) => w.code === "ORPHAN_EVIDENCE_LINK"));
  });

  it("excludes pricing, IE import, and Quote Library fields", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const { run } = await adapter.run(validInput());
    const raw = JSON.stringify(run);
    assert.equal(/chargeable|priced|sellSquare|quoteTotal|pricing/i.test(raw), false);
    assert.equal(/takeoff_import_v1|import-from-takeoff|quote_headers|quote_library/i.test(raw), false);
    assert.equal(REVIEWED_TAKEOFF_SCHEMA_VERSION, "qil_reviewed_takeoff_v1");
  });

  it("lists runs in memory and enforces status model transitions", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const { runId } = await adapter.run(validInput());
    const listed = await adapter.listRuns(BASE_CASE.caseId);
    assert.ok(listed.some((r) => r.id === runId));
    assert.equal(await adapter.getRun("missing"), null);
    assert.equal(
      canTransitionLabTakeoff(LAB_TAKEOFF_STATUS.NOT_STARTED, LAB_TAKEOFF_STATUS.SIMULATING),
      true
    );
    assert.equal(
      canTransitionLabTakeoff(LAB_TAKEOFF_STATUS.REVIEW, "qil_ready_for_review"),
      false
    );
    assert.equal(
      canTransitionLabTakeoff(LAB_TAKEOFF_STATUS.REVIEW, "approved_for_import"),
      false
    );
  });

  it("multi-room scenario produces multiple rooms", async () => {
    const adapter = new SimulatedTakeoffAdapter();
    const { run } = await adapter.run(validInput("qil-synth-multi-room"));
    assert.equal(run.rooms.length, 2);
    assert.ok(run.calculation.measuredCountertopSf > 0);
  });
});
