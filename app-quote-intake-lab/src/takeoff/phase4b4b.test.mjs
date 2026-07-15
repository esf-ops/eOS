import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { parseEmlUpload } from "../inbound/emlInboundAdapter.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";
import { LiveGeminiTakeoffAdapter } from "./liveGeminiTakeoffAdapter.mjs";
import { TakeoffService } from "./takeoffService.mjs";
import { CORRECTION_OP } from "./correctionTypes.mjs";
import { warningKey } from "./approvalGate.mjs";
import {
  APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES,
  BLOCKED_PLACEHOLDER_PLAN_HASHES,
  assertApprovedForLiveTakeoff,
  isApprovedSyntheticLiveHash
} from "./syntheticLiveAllowlist.mjs";
import { fakeValidSyntheticStagedProvider, testTakeoffConfig } from "../../server/takeoff/fakeStagedTakeoffProvider.mjs";
import { sanitizeLiveTakeoffRequest } from "../../server/takeoff/sanitizeTakeoffRequest.mjs";
import { runLiveTakeoffPipeline } from "../../server/takeoff/takeoffPipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, "../../fixtures/takeoff/qil-synth-kitchen-island-plan.pdf");
const EML_PATH = join(__dirname, "../fixtures/eml/synth-kitchen-island-live-takeoff.eml");
const GT_PATH = join(__dirname, "../../fixtures/takeoff/qil-synth-kitchen-island-plan.ground-truth.json");
const PLACEHOLDER_B64 = "JVBERi0xLjEKMSAwIG9iajw8Pj5lbmRvYmoKdHJhaWxlcjw8Pj4KJSVFT0YK";

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function seedEliteCase(store, { caseId, attachment }) {
  const caseRow = {
    id: caseId,
    status: "qil_intake_review",
    dataSource: "imported",
    receivedAt: "2026-07-14T20:00:00.000Z",
    updatedAt: "2026-07-14T20:00:00.000Z",
    priority: "normal",
    senderName: "Avery",
    senderEmail: "avery.nguyen@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Lab Sales",
    assignedEstimator: null,
    customerAccount: "Example Homes LLC",
    projectName: "Maple Court Kitchen",
    projectAddress: "100 Example Way",
    emailSubject: "Elite 100",
    emailExcerpt: "Synthetic",
    attachments: [attachment],
    requestedColor: "Calacatta Mira",
    resolvedPriceGroup: null,
    proposedSquareFootage: 39.25,
    sinkCutoutCount: 1,
    edgeProfile: "eased",
    backsplashScope: "standard",
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
      messageContentHash: "f".repeat(64),
      parserWarnings: [],
      rawSourcePreserved: true,
      originalFilename: "x.eml",
      textBody: "body",
      to: [],
      cc: [],
      replyTo: null,
      thread: { conversationId: null, inReplyTo: null, references: [], threadKey: caseId },
      importTimestamp: "2026-07-14T20:00:00.000Z",
      importActor: "tester",
      htmlPresent: false
    }
  };
  await store.saveImportedCase({
    caseRow,
    attachmentBlobs: attachment.bytes
      ? [{ attachmentId: attachment.id, bytes: attachment.bytes }]
      : []
  });
  await store.saveReviewedSnapshot({
    id: `qil-snap-${caseId}`,
    caseId,
    runId: `qil-run-${caseId}`,
    acceptedAt: "2026-07-14T20:05:00.000Z",
    acceptedBy: "tester",
    intent: "new_quote_request",
    workflowEligibility: "elite_100_candidate",
    fields: [
      { key: "statedSquareFootage", value: 39.25, unknown: false },
      { key: "sinkCutoutCount", value: 1, unknown: false }
    ],
    missingInformation: [],
    missingKeys: [],
    corrections: [],
    provider: { name: "sim", mode: "simulated", version: "1" },
    note: "snap"
  });
  await store.setCaseOverlay(caseId, {
    status: "qil_intake_review",
    acceptedSnapshotId: `qil-snap-${caseId}`,
    proposedSquareFootage: 39.25
  });
  return caseId;
}

function makeLiveAdapter() {
  const config = testTakeoffConfig();
  return new LiveGeminiTakeoffAdapter({
    labToken: "test-token",
    directConfig: config,
    directPipeline: async (args) => {
      const request = sanitizeLiveTakeoffRequest(
        {
          caseId: args.caseId,
          acceptedIntakeSnapshotId: args.acceptedIntakeSnapshotId,
          attachmentId: args.attachmentId,
          filename: args.filename,
          mimeType: args.mimeType,
          sizeBytes: args.sizeBytes,
          contentHash: args.contentHash,
          contentBase64: args.contentBase64,
          liveTransmissionAcknowledged: true,
          actorLabel: args.actorLabel,
          requestedAt: args.requestedAt,
          elite100Decision: args.elite100Decision,
          classificationHints: args.classificationHints,
          syntheticPlanAcknowledged: args.syntheticPlanAcknowledged
        },
        { maxAttachmentBytes: config.takeoff?.maxAttachmentBytes ?? 4_000_000 }
      );
      return runLiveTakeoffPipeline({
        request,
        config: args.config ?? config,
        stagedProvider: args.stagedProvider
      });
    }
  });
}

function repoOf(store, { live = makeLiveAdapter() } = {}) {
  return new LocalQuoteIntakeRepository({
    store,
    fixtureCases: [],
    asOfMode: "fixture",
    takeoffAdapter: getSimulatedTakeoffAdapter(),
    liveTakeoffAdapter: live
  });
}

async function resolveForAccept(repo, caseId, draftId, sourceRun) {
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
}

describe("Phase 4B.4B synthetic allowlist + EML fixture", () => {
  it("allowlist includes committed PDF hash and blocks placeholder", () => {
    const pdf = readFileSync(PDF_PATH);
    const gt = JSON.parse(readFileSync(GT_PATH, "utf8"));
    assert.equal(sha(pdf), gt.contentHash);
    assert.ok(APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES.includes(gt.contentHash));
    assert.equal(isApprovedSyntheticLiveHash(gt.contentHash), true);
    const placeholder = Buffer.from(PLACEHOLDER_B64, "base64");
    assert.ok(BLOCKED_PLACEHOLDER_PLAN_HASHES.includes(sha(placeholder)));
    assert.throws(() => assertApprovedForLiveTakeoff(sha(placeholder)), /Placeholder|restricted/i);
    assert.throws(() => assertApprovedForLiveTakeoff("ab".repeat(32)), /restricted|Unknown/i);
  });

  it("synthetic EML embeds the approved PDF hash/bytes", async () => {
    const eml = readFileSync(EML_PATH);
    const msg = await parseEmlUpload({ bytes: eml, filename: "synth-kitchen-island-live-takeoff.eml" });
    const att = msg.attachments[0];
    assert.equal(att.filename, "qil-synth-kitchen-island-plan.pdf");
    assert.equal(att.sizeBytes, 2272);
    assert.equal(att.contentHash, APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES[0]);
    assert.equal(sha(Buffer.from(att.bytes)), APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES[0]);
  });
});

describe("Phase 4B.4B live TakeoffService path (fake Gemini)", () => {
  let store;
  let pdfBytes;
  let approvedHash;
  let caseId;

  before(async () => {
    store = new MemoryLabStore();
    await store.ready();
    pdfBytes = readFileSync(PDF_PATH);
    approvedHash = sha(pdfBytes);
    caseId = await seedEliteCase(store, {
      caseId: "qil-imp-44b-1",
      attachment: {
        id: "qil-att-live-1",
        filename: "qil-synth-kitchen-island-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: pdfBytes.length,
        contentHash: approvedHash,
        source: "imported_eml",
        bytes: pdfBytes
      }
    });
  });

  it("simulated remains default and rejects content bytes", async () => {
    const repo = repoOf(store);
    const blocked = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-live-1",
      actorLabel: "tester",
      contentBytes: pdfBytes
    });
    assert.equal(blocked.ok, false);
    assert.match(String(blocked.run.failure?.code ?? ""), /BYTES_FORBIDDEN|ATTACHMENT_BYTES/i);

    const out = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-live-1",
      actorLabel: "tester",
      scenarioId: "qil-synth-kitchen-island",
      providerMode: "simulated"
    });
    assert.equal(out.ok, true);
    assert.equal(out.run.provider.mode, "simulated");
  });

  it("live requires acknowledgment, allowlisted hash, and verified bytes", async () => {
    const repo = repoOf(store);
    let fetches = 0;
    const prev = globalThis.fetch;
    globalThis.fetch = async () => {
      fetches += 1;
      throw new Error("network forbidden");
    };
    try {
      const noAck = await repo.runTakeoff(caseId, {
        selectedAttachmentId: "qil-att-live-1",
        providerMode: "live",
        contentBytes: pdfBytes,
        actorLabel: "tester"
      });
      assert.equal(noAck.ok, false);
      assert.match(String(noAck.run.failure?.code ?? ""), /ACKNOWLEDGMENT/i);

      const noBytes = await repo.runTakeoff(caseId, {
        selectedAttachmentId: "qil-att-live-1",
        providerMode: "live",
        liveTransmissionAcknowledged: true,
        actorLabel: "tester"
      });
      assert.equal(noBytes.ok, false);
      assert.match(String(noBytes.run.failure?.code ?? ""), /BYTES/i);

      const bad = Buffer.from(pdfBytes);
      bad[0] = 0;
      const mismatch = await repo.runTakeoff(caseId, {
        selectedAttachmentId: "qil-att-live-1",
        providerMode: "live",
        liveTransmissionAcknowledged: true,
        contentBytes: bad,
        actorLabel: "tester"
      });
      assert.equal(mismatch.ok, false);
      assert.match(String(mismatch.run.failure?.code ?? ""), /HASH_MISMATCH/i);

      const live = await repo.runTakeoff(caseId, {
        selectedAttachmentId: "qil-att-live-1",
        providerMode: "live",
        liveTransmissionAcknowledged: true,
        contentBytes: pdfBytes,
        actorLabel: "tester",
        stagedProvider: fakeValidSyntheticStagedProvider()
      });
      assert.equal(live.ok, true);
      assert.equal(live.run.provider.mode, "live");
      assert.equal(live.run.provider.name, "LiveGeminiTakeoffAdapter");
      assert.equal(live.run.calculation.measuredCountertopSf, 39.25);
      assert.equal(live.run.calculation.measuredBacksplashSf, 3.33);
      assert.equal(live.run.calculation.sinkCutoutCount, 1);
      assert.match(JSON.stringify(live.run), /Live Gemini|live/);
      assert.doesNotMatch(JSON.stringify(live.run), /contentBase64|AIza|generativelanguage\.googleapis\.com\?key=/i);

      const overlay = await repo.getTakeoffOverlay(caseId);
      assert.equal(overlay.latestTakeoffRunId, live.runId);
      assert.equal(overlay.measuredCombinedSquareFootage, live.run.calculation.measuredCombinedSf);
      assert.equal(overlay.takeoffProviderMode, "live");
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("blocks unknown/real hashes and placeholder attachments for live", async () => {
    const unknownStore = new MemoryLabStore();
    await unknownStore.ready();
    const unknownBytes = randomBytes(2048);
    unknownBytes[0] = 0x25;
    unknownBytes[1] = 0x50;
    unknownBytes[2] = 0x44;
    unknownBytes[3] = 0x46;
    const unknownHash = sha(unknownBytes);
    const uid = await seedEliteCase(unknownStore, {
      caseId: "qil-imp-44b-unknown",
      attachment: {
        id: "qil-att-unknown",
        filename: "customer-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: unknownBytes.length,
        contentHash: unknownHash,
        source: "imported_eml",
        bytes: unknownBytes
      }
    });
    const unknownOut = await repoOf(unknownStore).runTakeoff(uid, {
      selectedAttachmentId: "qil-att-unknown",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: unknownBytes,
      actorLabel: "tester",
      stagedProvider: fakeValidSyntheticStagedProvider()
    });
    assert.equal(unknownOut.ok, false);
    assert.match(String(unknownOut.run.failure?.code ?? ""), /ALLOWLIST|SYNTHETIC|PLACEHOLDER/i);

    const phStore = new MemoryLabStore();
    await phStore.ready();
    const placeholder = Buffer.from(PLACEHOLDER_B64, "base64");
    const pid = await seedEliteCase(phStore, {
      caseId: "qil-imp-44b-ph",
      attachment: {
        id: "qil-att-ph",
        filename: "willow-park-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: placeholder.length,
        contentHash: sha(placeholder),
        source: "imported_eml",
        bytes: placeholder
      }
    });
    const phOut = await repoOf(phStore).runTakeoff(pid, {
      selectedAttachmentId: "qil-att-ph",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: placeholder,
      actorLabel: "tester",
      stagedProvider: fakeValidSyntheticStagedProvider()
    });
    assert.equal(phOut.ok, false);
    assert.match(String(phOut.run.failure?.code ?? ""), /PLACEHOLDER|ALLOWLIST|SYNTHETIC/i);
  });

  it("failed live run preserves prior success; correction/accept work on live run", async () => {
    const s = new MemoryLabStore();
    await s.ready();
    const cid = await seedEliteCase(s, {
      caseId: "qil-imp-44b-fail",
      attachment: {
        id: "qil-att-live-2",
        filename: "qil-synth-kitchen-island-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: pdfBytes.length,
        contentHash: approvedHash,
        source: "imported_eml",
        bytes: pdfBytes
      }
    });
    const okLive = makeLiveAdapter();
    const repo = repoOf(s, { live: okLive });
    const success = await repo.runTakeoff(cid, {
      selectedAttachmentId: "qil-att-live-2",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: pdfBytes,
      actorLabel: "tester",
      stagedProvider: fakeValidSyntheticStagedProvider()
    });
    assert.equal(success.ok, true);

    const failLive = new LiveGeminiTakeoffAdapter({
      labToken: "test-token",
      directPipeline: async () => {
        const err = new Error("Gemini inventory timed out.");
        err.code = "PROVIDER_TIMEOUT";
        throw err;
      },
      directConfig: testTakeoffConfig()
    });
    const failRepo = repoOf(s, { live: failLive });
    const failed = await failRepo.runTakeoff(cid, {
      selectedAttachmentId: "qil-att-live-2",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: pdfBytes,
      actorLabel: "tester"
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.run.labTakeoffStatus, "qil_takeoff_failed");
    const overlay = await failRepo.getTakeoffOverlay(cid);
    assert.equal(overlay.measuredCombinedSquareFootage, success.run.calculation.measuredCombinedSf);
    assert.ok(await failRepo.getTakeoffRun(success.runId));

    // Corrections + accepted snapshot against the successful live run
    const { draft } = await repo.beginTakeoffCorrection(cid, success.run.id, { actorLabel: "tester" });
    await resolveForAccept(repo, cid, draft.id, success.run);
    const gate = await repo.evaluateTakeoffAcceptance(cid, draft.id);
    assert.equal(gate.ready, true, gate.blockers?.join("; "));
    const accepted = await repo.acceptReviewedTakeoff(cid, draft.id, { actorLabel: "tester" });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.snapshot.sourceRunId, success.run.id);
    assert.equal(accepted.snapshot.sourceAttachmentHash, approvedHash);
  });

  it("HTTP live adapter uses lab token and never embeds Gemini key", async () => {
    let seen = null;
    const httpAdapter = new LiveGeminiTakeoffAdapter({
      baseUrl: "http://127.0.0.1:5197",
      labToken: "lab-token-xyz",
      fetchImpl: async (url, init) => {
        seen = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
        return {
          ok: true,
          json: async () => ({
            ok: true,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            run: {
              id: "qil-toff-http-1",
              caseId: "c",
              acceptedIntakeSnapshotId: "s",
              attachmentId: "a",
              attachmentContentHash: approvedHash,
              provider: {
                name: "LiveGeminiTakeoffAdapter",
                mode: "live",
                version: "x",
                note: "live"
              },
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              labTakeoffStatus: "qil_takeoff_review",
              humanReviewState: "unreviewed",
              pages: [{ pageNumber: 1, role: "plan" }],
              rooms: [],
              evidence: [
                {
                  id: "e1",
                  pageNumber: 1,
                  label: "L",
                  value: 1,
                  simulatedNote: "Live Gemini evidence"
                }
              ],
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
                authorityNote: "Deterministic eliteOS measurement"
              },
              confidence: "medium",
              failure: null
            }
          })
        };
      }
    });

    await httpAdapter.run({
      caseId: "c",
      acceptedIntakeSnapshotId: "s",
      attachmentId: "a",
      filename: "qil-synth-kitchen-island-plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      contentHash: approvedHash,
      contentBytes: pdfBytes,
      liveTransmissionAcknowledged: true,
      actorLabel: "tester"
    });

    assert.equal(seen.url, "http://127.0.0.1:5197/takeoff");
    assert.equal(seen.headers["X-QIL-Lab-Token"], "lab-token-xyz");
    assert.equal(seen.body.contentHash, approvedHash);
    assert.ok(seen.body.contentBase64);
    assert.equal(seen.body.liveTransmissionAcknowledged, true);
    assert.equal(Object.prototype.hasOwnProperty.call(seen.headers, "Authorization"), false);
    assert.doesNotMatch(JSON.stringify(seen.headers), /AIza|GEMINI/i);
  });

  it("TakeoffService dependency injection routes live through live adapter", async () => {
    let called = false;
    const service = new TakeoffService({
      store,
      takeoffAdapter: getSimulatedTakeoffAdapter(),
      liveTakeoffAdapter: {
        name: "FakeLive",
        mode: "live",
        version: "t",
        run: async (input) => {
          called = true;
          const adapter = makeLiveAdapter();
          return adapter.run({
            ...input,
            stagedProvider: fakeValidSyntheticStagedProvider()
          });
        }
      }
    });
    const out = await service.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-live-1",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: pdfBytes,
      actorLabel: "tester",
      caseRow: await store.getCase(caseId)
    });
    assert.equal(called, true);
    assert.equal(out.run.provider.mode, "live");
  });
});
