/**
 * Phase 4B.4B.2 — browser-native base64 / failed-run display (no paid Gemini).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { LiveGeminiTakeoffAdapter } from "./liveGeminiTakeoffAdapter.mjs";
import { formatMeasuredTakeoffCount, formatMeasuredTakeoffSf, formatTakeoffSf } from "./takeoffDisplay.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { getSimulatedTakeoffAdapter } from "./simulatedTakeoffAdapter.mjs";
import { fakeValidSyntheticStagedProvider, testTakeoffConfig } from "../../server/takeoff/fakeStagedTakeoffProvider.mjs";
import { sanitizeLiveTakeoffRequest } from "../../server/takeoff/sanitizeTakeoffRequest.mjs";
import { runLiveTakeoffPipeline } from "../../server/takeoff/takeoffPipeline.mjs";
import { APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES } from "./syntheticLiveAllowlist.mjs";
import { bytesToBase64, toUint8Array } from "./base64.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, "../../fixtures/takeoff/qil-synth-kitchen-island-plan.pdf");
const ADAPTER_SRC = join(__dirname, "liveGeminiTakeoffAdapter.mjs");
const SERVICE_SRC = join(__dirname, "takeoffService.mjs");

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function seedEliteCase(store, { caseId, attachment }) {
  const caseRow = {
    id: caseId,
    status: "qil_intake_review",
    dataSource: "imported",
    receivedAt: "2026-07-15T15:00:00.000Z",
    updatedAt: "2026-07-15T15:00:00.000Z",
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
      importTimestamp: "2026-07-15T15:00:00.000Z",
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
    acceptedAt: "2026-07-15T15:05:00.000Z",
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
    proposedSquareFootage: 39.25,
    statedSquareFootage: 39.25
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
        stagedProvider: args.stagedProvider ?? fakeValidSyntheticStagedProvider()
      });
    }
  });
}

describe("Phase 4B.4B.2 browser-native base64", () => {
  it("bytesToBase64 works when globalThis.Buffer is unavailable", () => {
    const saved = globalThis.Buffer;
    try {
      // Simulate browser: remove Node Buffer
      // eslint-disable-next-line no-global-assign
      globalThis.Buffer = undefined;
      const out = bytesToBase64(Uint8Array.from([72, 105])); // "Hi"
      assert.equal(out, "SGk=");
      assert.equal(typeof globalThis.Buffer, "undefined");
    } finally {
      globalThis.Buffer = saved;
    }
  });

  it("known small sequence produces exact expected base64", () => {
    assert.equal(bytesToBase64(Uint8Array.from([0, 0, 0])), "AAAA");
    assert.equal(bytesToBase64(new Uint8Array([255, 239])), "/+8=");
    assert.equal(bytesToBase64(new ArrayBuffer(0)), "");
  });

  it("synthetic PDF bytes round-trip: encode → decode → identical length/hash/magic", () => {
    const pdf = new Uint8Array(readFileSync(PDF_PATH));
    const saved = globalThis.Buffer;
    let b64;
    try {
      globalThis.Buffer = undefined;
      b64 = bytesToBase64(pdf);
    } finally {
      globalThis.Buffer = saved;
    }
    const decoded = Buffer.from(b64, "base64");
    assert.equal(decoded.length, pdf.length);
    assert.equal(sha(decoded), sha(pdf));
    assert.equal(sha(decoded), APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES[0]);
    assert.equal(decoded[0], 0x25); // %
    assert.equal(decoded[1], 0x50); // P
    assert.equal(decoded[2], 0x44); // D
    assert.equal(decoded[3], 0x46); // F
  });

  it("encoding works for a payload larger than one conversion chunk", () => {
    const big = new Uint8Array(200_000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    const saved = globalThis.Buffer;
    let b64;
    try {
      globalThis.Buffer = undefined;
      b64 = bytesToBase64(big);
    } finally {
      globalThis.Buffer = saved;
    }
    const decoded = Buffer.from(b64, "base64");
    assert.equal(decoded.length, big.length);
    assert.equal(sha(decoded), sha(big));
  });

  it("LiveGeminiTakeoffAdapter source does not reference Buffer", () => {
    const src = readFileSync(ADAPTER_SRC, "utf8");
    assert.doesNotMatch(src, /\bBuffer\b/);
    assert.match(src, /bytesToBase64/);
    assert.match(src, /toUint8Array/);
    const svc = readFileSync(SERVICE_SRC, "utf8");
    assert.doesNotMatch(svc, /\bBuffer\.(from|isBuffer)\b/);
  });

  it("HTTP live adapter sends browser-encoded base64 without Buffer", async () => {
    const pdf = new Uint8Array(readFileSync(PDF_PATH));
    const hash = sha(pdf);
    let postedBase64 = null;
    const saved = globalThis.Buffer;
    const adapter = new LiveGeminiTakeoffAdapter({
      labToken: "tok",
      baseUrl: "http://127.0.0.1:5197",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init.body));
        postedBase64 = body.contentBase64;
        assert.equal(body.contentHash, hash);
        return {
          ok: true,
          json: async () => ({
            ok: true,
            run: {
              id: "qil-toff-http-1",
              caseId: "c1",
              labTakeoffStatus: "qil_takeoff_review",
              calculation: { measuredCombinedSf: 42.58 }
            }
          })
        };
      }
    });
    try {
      globalThis.Buffer = undefined;
      const out = await adapter.run({
        caseId: "c1",
        acceptedIntakeSnapshotId: "s1",
        attachmentId: "a1",
        filename: "qil-synth-kitchen-island-plan.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        contentHash: hash,
        contentBytes: pdf,
        liveTransmissionAcknowledged: true,
        actorLabel: "tester"
      });
      assert.equal(out.ok, true);
      assert.ok(postedBase64);
    } finally {
      globalThis.Buffer = saved;
    }
    assert.equal(sha(Buffer.from(postedBase64, "base64")), hash);
  });
});

describe("Phase 4B.4B.2 failed-run display + overlay", () => {
  it("failed live run shows unavailable measurements rather than zero totals", async () => {
    const store = new MemoryLabStore();
    await store.ready();
    const pdf = new Uint8Array(readFileSync(PDF_PATH));
    const caseId = await seedEliteCase(store, {
      caseId: "qil-imp-442-fail-ui",
      attachment: {
        id: "qil-att-442",
        filename: "qil-synth-kitchen-island-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        contentHash: sha(pdf),
        source: "imported_eml",
        bytes: pdf
      }
    });
    const repo = new LocalQuoteIntakeRepository({
      store,
      fixtureCases: [],
      asOfMode: "fixture",
      takeoffAdapter: getSimulatedTakeoffAdapter(),
      liveTakeoffAdapter: makeLiveAdapter()
    });
    const success = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-442",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: pdf,
      actorLabel: "tester",
      stagedProvider: fakeValidSyntheticStagedProvider()
    });
    assert.equal(success.ok, true);
    const measured = success.run.calculation.measuredCombinedSf;

    const failAdapter = new LiveGeminiTakeoffAdapter({
      labToken: "t",
      fetchImpl: async () => {
        throw Object.assign(new Error("forced"), { code: "FORCED_FAIL" });
      }
    });
    // Force failure after verification by making toUint8 path fine but fetch fail
    const failRepo = new LocalQuoteIntakeRepository({
      store,
      fixtureCases: [],
      asOfMode: "fixture",
      takeoffAdapter: getSimulatedTakeoffAdapter(),
      liveTakeoffAdapter: failAdapter
    });
    const failed = await failRepo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-442",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: pdf,
      actorLabel: "tester"
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.run.calculation.measuredCombinedSf, null);
    assert.equal(failed.run.calculation.measuredCountertopSf, null);
    assert.equal(failed.run.calculation.sinkCutoutCount, null);
    assert.equal(formatMeasuredTakeoffSf(failed.run, failed.run.calculation.measuredCombinedSf), "—");
    assert.equal(formatMeasuredTakeoffCount(failed.run, failed.run.calculation.sinkCutoutCount), "—");
    assert.equal(formatTakeoffSf(null), "—");

    const overlay = await failRepo.getTakeoffOverlay(caseId);
    assert.equal(overlay.measuredCombinedSquareFootage, measured);
    assert.equal(overlay.latestTakeoffState, "qil_takeoff_failed");
    assert.equal(overlay.latestTakeoffRunId, failed.runId);

    const retry = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-442",
      providerMode: "live",
      liveTransmissionAcknowledged: true,
      contentBytes: pdf,
      actorLabel: "tester",
      stagedProvider: fakeValidSyntheticStagedProvider()
    });
    assert.equal(retry.ok, true);
    assert.notEqual(retry.runId, failed.runId);
    assert.notEqual(retry.runId, success.runId);
    const runs = await repo.listTakeoffRuns(caseId);
    assert.ok(runs.some((r) => r.id === success.runId));
    assert.ok(runs.some((r) => r.id === failed.runId));
    assert.ok(runs.some((r) => r.id === retry.runId));
  });

  it("simulated takeoff remains unchanged and does not read attachment bytes", async () => {
    const store = new MemoryLabStore();
    await store.ready();
    const pdf = new Uint8Array(readFileSync(PDF_PATH));
    const caseId = await seedEliteCase(store, {
      caseId: "qil-imp-442-sim",
      attachment: {
        id: "qil-att-sim",
        filename: "qil-synth-kitchen-island-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        contentHash: sha(pdf),
        source: "imported_eml",
        bytes: pdf
      }
    });
    const repo = new LocalQuoteIntakeRepository({
      store,
      fixtureCases: [],
      asOfMode: "fixture",
      takeoffAdapter: getSimulatedTakeoffAdapter(),
      liveTakeoffAdapter: makeLiveAdapter()
    });
    const blocked = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-sim",
      actorLabel: "tester",
      contentBytes: pdf
    });
    assert.equal(blocked.ok, false);
    assert.match(String(blocked.run.failure?.code ?? ""), /BYTES_FORBIDDEN/i);

    const ok = await repo.runTakeoff(caseId, {
      selectedAttachmentId: "qil-att-sim",
      actorLabel: "tester",
      scenarioId: "qil-synth-kitchen-island",
      providerMode: "simulated"
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.run.provider.mode, "simulated");
  });

  it("toUint8Array accepts ArrayBuffer and TypedArray views", () => {
    const u8 = Uint8Array.from([1, 2, 3, 4]);
    assert.deepEqual([...toUint8Array(u8.buffer)], [1, 2, 3, 4]);
    assert.deepEqual([...toUint8Array(u8.subarray(1, 3))], [2, 3]);
  });
});
