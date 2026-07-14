import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeLiveClassificationRequest } from "./sanitizeLiveRequest.mjs";
import { sanitizeLiveTakeoffRequest } from "./takeoff/sanitizeTakeoffRequest.mjs";
import { runLiveTakeoffPipeline } from "./takeoff/takeoffPipeline.mjs";
import { readLabServerConfig, readSafeLabServerConfig } from "./config.mjs";
import { createConcurrencyGate } from "./concurrency.mjs";
import { LiveGeminiTakeoffAdapter } from "../src/takeoff/liveGeminiTakeoffAdapter.mjs";
import { sfFromRun } from "../src/takeoff/labMeasurementCalc.mjs";
import {
  fakeConflictingDimensionStagedProvider,
  fakeIrregularGeometryStagedProvider,
  fakeMissingDimensionStagedProvider,
  fakeNoCountertopStagedProvider,
  fakeRateLimitStagedProvider,
  fakeTimeoutStagedProvider,
  fakeUnsupportedEvidenceStagedProvider,
  fakeValidSyntheticStagedProvider,
  loadGroundTruth,
  testTakeoffConfig
} from "./takeoff/fakeStagedTakeoffProvider.mjs";
import {
  buildSyntheticKitchenIslandPdfBytes,
  sha256Hex
} from "../fixtures/takeoff/generateSyntheticPlanPdf.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "../fixtures/takeoff");
const PDF_PATH = join(FIXTURE_DIR, "qil-synth-kitchen-island-plan.pdf");
const GT_PATH = join(FIXTURE_DIR, "qil-synth-kitchen-island-plan.ground-truth.json");

function loadFixturePdf() {
  return readFileSync(PDF_PATH);
}

function baseTakeoffBody(bytes, overrides = {}) {
  const hash = sha256Hex(bytes);
  return {
    caseId: "qil-case-live-toff-1",
    acceptedIntakeSnapshotId: "qil-snap-live-toff-1",
    attachmentId: "qil-att-synth-plan-1",
    filename: "qil-synth-kitchen-island-plan.pdf",
    mimeType: "application/pdf",
    sizeBytes: bytes.length,
    contentHash: hash,
    contentBase64: bytes.toString("base64"),
    liveTransmissionAcknowledged: true,
    actorLabel: "Lab Tester",
    requestedAt: "2026-07-14T20:00:00.000Z",
    elite100Decision: "elite_100_candidate",
    syntheticPlanAcknowledged: true,
    ...overrides
  };
}

describe("Phase 4B.4A synthetic plan fixture", () => {
  it("PDF opens with valid header and matches ground-truth hash/labels", () => {
    const bytes = loadFixturePdf();
    assert.equal(bytes.subarray(0, 5).toString("utf8"), "%PDF-");
    const gt = loadGroundTruth();
    assert.equal(sha256Hex(bytes), gt.contentHash);
    assert.equal(bytes.length, gt.sizeBytes);
    assert.equal(gt.expected.countertopSf, 39.25);
    assert.equal(gt.expected.backsplashSf, 3.33);
    assert.equal(gt.expected.sinkCount, 1);
    assert.equal(sfFromRun(120, 25.5), 21.25);
    assert.equal(sfFromRun(72, 36), 18);
    assert.equal(sfFromRun(120, 4), 3.33);
    const txt = bytes.toString("latin1");
    assert.match(txt, /SYNTHETIC QUOTE INTAKE LAB FIXTURE/);
    assert.match(txt, /120 in/);
    assert.match(txt, /25\.5 in/);
    assert.match(txt, /72 in/);
    assert.match(txt, /36 in/);
    assert.match(txt, /39\.25/);
    // Generator reproduces identical bytes
    assert.equal(sha256Hex(buildSyntheticKitchenIslandPdfBytes()), gt.contentHash);
  });
});

describe("Phase 4B.4A takeoff request sanitization", () => {
  const bytes = loadFixturePdf();
  const limits = { maxAttachmentBytes: 4_000_000 };

  it("accepts valid synthetic PDF payload and verifies SHA-256", () => {
    const req = sanitizeLiveTakeoffRequest(baseTakeoffBody(bytes), limits);
    assert.equal(req.contentHash.length, 64);
    assert.equal(req.contentBytes.length, bytes.length);
    assert.equal(req.liveTransmissionAcknowledged, true);
  });

  it("rejects missing acknowledgment", () => {
    assert.throws(
      () =>
        sanitizeLiveTakeoffRequest(
          baseTakeoffBody(bytes, { liveTransmissionAcknowledged: false }),
          limits
        ),
      /acknowledgment/i
    );
  });

  it("rejects hash mismatch", () => {
    assert.throws(
      () =>
        sanitizeLiveTakeoffRequest(
          baseTakeoffBody(bytes, { contentHash: "a".repeat(64) }),
          limits
        ),
      /HASH_MISMATCH|hash/i
    );
  });

  it("rejects oversized attachments", () => {
    assert.throws(
      () => sanitizeLiveTakeoffRequest(baseTakeoffBody(bytes), { maxAttachmentBytes: 100 }),
      (e) => e.code === "ATTACHMENT_TOO_LARGE" || /exceeds max size|too large/i.test(String(e.message))
    );
  });

  it("rejects unsupported MIME and empty content", () => {
    assert.throws(
      () => sanitizeLiveTakeoffRequest(baseTakeoffBody(bytes, { mimeType: "application/zip" }), limits),
      /MIME|UNSUPPORTED/i
    );
    assert.throws(
      () =>
        sanitizeLiveTakeoffRequest(
          baseTakeoffBody(bytes, { contentBase64: "", sizeBytes: 0, contentHash: "0".repeat(64) }),
          limits
        ),
      /empty|content|SIZE/i
    );
  });

  it("rejects production URLs/IDs, HTML, and multiple attachments", () => {
    assert.throws(
      () =>
        sanitizeLiveTakeoffRequest(
          baseTakeoffBody(bytes, { storageUrl: "https://xxx.supabase.co/storage/v1/object/eliteos-quote-files/a" }),
          limits
        ),
      /Production/i
    );
    assert.throws(
      () =>
        sanitizeLiveTakeoffRequest(
          baseTakeoffBody(bytes, { internalEstimateId: "ie-123", quoteLibraryId: null }),
          limits
        ),
      /Production|IE|Quote Library/i
    );
    assert.throws(
      () => sanitizeLiveTakeoffRequest(baseTakeoffBody(bytes, { html: "<p>x</p>" }), limits),
      /HTML/i
    );
    assert.throws(
      () =>
        sanitizeLiveTakeoffRequest(
          baseTakeoffBody(bytes, { attachments: [{ id: "a" }, { id: "b" }] }),
          limits
        ),
      /Multiple/i
    );
  });

  it("classification sanitize still forbids attachment bytes (security intact)", () => {
    assert.throws(
      () =>
        sanitizeLiveClassificationRequest({
          caseId: "c1",
          subject: "s",
          textBody: "t",
          from: { email: "a@example.com" },
          to: [],
          attachments: [{ filename: "a.pdf", bytes: [1, 2, 3] }]
        }),
      /bytes/i
    );
    assert.equal(readLabServerConfig().maxBodyBytes, 256_000);
    const safe = readSafeLabServerConfig();
    assert.equal(typeof safe.takeoff.liveEnabled, "boolean");
    assert.equal(safe.takeoff.liveEnabled, false);
  });
});

describe("Phase 4B.4A fake staged takeoff pipeline", () => {
  const bytes = loadFixturePdf();
  const gt = loadGroundTruth();
  const config = testTakeoffConfig();

  async function runStaged(stagedProvider) {
    const request = sanitizeLiveTakeoffRequest(baseTakeoffBody(bytes), {
      maxAttachmentBytes: config.takeoff.maxAttachmentBytes
    });
    return runLiveTakeoffPipeline({ request, config, stagedProvider });
  }

  it("valid synthetic extraction — deterministic SF authority + sink count without deduction", async () => {
    const out = await runStaged(fakeValidSyntheticStagedProvider());
    const run = out.run;
    assert.equal(run.provider.mode, "live");
    assert.equal(run.calculation.measuredCountertopSf, gt.expected.countertopSf);
    assert.equal(run.calculation.measuredBacksplashSf, gt.expected.backsplashSf);
    assert.ok(
      Math.abs(run.calculation.measuredCombinedSf - gt.expected.combinedSf) <= gt.toleranceSf
    );
    assert.equal(run.calculation.sinkCutoutCount, 1);
    // Provider totals present but non-authoritative
    assert.equal(run.calculation.providerProposedCountertopSf, gt.expected.countertopSf);
    assert.match(run.calculation.authorityNote, /authoritative/i);
    // Sink does not reduce CT SF below ground truth
    assert.equal(run.calculation.measuredCountertopSf, 39.25);
    const blob = JSON.stringify(run);
    assert.equal(
      /chargeable|pricedSquare|sellSquare|quoteTotal|quote_library|import-from-takeoff|internalEstimateId|quoteLibraryId/i.test(
        blob
      ),
      false
    );
    assert.equal(/generativelanguage\.googleapis\.com|AIza/i.test(blob), false);
    assert.equal(/contentBase64|inline_data/i.test(blob), false);
  });

  it("provider-total variance is calculated when totals disagree", async () => {
    const base = fakeValidSyntheticStagedProvider();
    const staged = {
      ...base,
      geometry: async () => {
        const g = await base.geometry();
        g.providerProposedTotals.countertopSf = 50;
        return g;
      }
    };
    const out = await runStaged(staged);
    assert.ok(out.run.calculation.countertopVarianceSf !== 0);
  });

  it("missing dimension / conflict / irregular / no countertop failures", async () => {
    const missing = await runStaged(fakeMissingDimensionStagedProvider());
    assert.ok(missing.run.warnings.some((w) => /MISSING_DIMENSION/i.test(w.code)));

    const conflict = await runStaged(fakeConflictingDimensionStagedProvider());
    assert.ok(conflict.run.warnings.some((w) => /CONFLICT/i.test(w.code)));

    const irregular = await runStaged(fakeIrregularGeometryStagedProvider());
    assert.ok(irregular.run.warnings.some((w) => /UNSUPPORTED_GEOMETRY/i.test(w.code)));

    await assert.rejects(
      () => runStaged(fakeNoCountertopStagedProvider()),
      (e) => e.code === "NO_COUNTERTOP_CONTENT"
    );
  });

  it("unsupported evidence is rejected", async () => {
    await assert.rejects(
      () => runStaged(fakeUnsupportedEvidenceStagedProvider()),
      (e) => e.code === "EVIDENCE_FAILURE"
    );
  });

  it("timeout and rate-limit normalize to safe codes", async () => {
    await assert.rejects(
      () => runStaged(fakeTimeoutStagedProvider()),
      (e) => e.code === "PROVIDER_TIMEOUT"
    );
    await assert.rejects(
      () => runStaged(fakeRateLimitStagedProvider()),
      (e) => e.code === "RATE_LIMITED"
    );
  });

  it("disabled takeoff flag blocks pipeline", async () => {
    const request = sanitizeLiveTakeoffRequest(baseTakeoffBody(bytes), {
      maxAttachmentBytes: 4_000_000
    });
    await assert.rejects(
      () =>
        runLiveTakeoffPipeline({
          request,
          config: testTakeoffConfig({ takeoff: { liveEnabled: false } }),
          stagedProvider: fakeValidSyntheticStagedProvider()
        }),
      (e) => e.code === "LIVE_TAKEOFF_DISABLED"
    );
  });

  it("LiveGeminiTakeoffAdapter direct path + independent concurrency gate", async () => {
    const adapter = new LiveGeminiTakeoffAdapter({
      directPipeline: runLiveTakeoffPipeline,
      directConfig: config
    });
    const result = await adapter.run({
      caseId: "qil-case-adapter-1",
      acceptedIntakeSnapshotId: "qil-snap-1",
      attachmentId: "qil-att-1",
      filename: "qil-synth-kitchen-island-plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      contentBytes: bytes,
      liveTransmissionAcknowledged: true,
      actorLabel: "tester",
      stagedProvider: fakeValidSyntheticStagedProvider()
    });
    assert.equal(result.ok, true);
    assert.equal(result.run.calculation.measuredCountertopSf, 39.25);
    assert.ok(await adapter.getRun(result.runId));

    const gate = createConcurrencyGate(1);
    let started = 0;
    await assert.rejects(
      async () => {
        const p1 = gate.run(async () => {
          started += 1;
          await new Promise((r) => setTimeout(r, 30));
        });
        await Promise.resolve();
        await gate.run(async () => {});
        await p1;
      },
      (e) => e.code === "CONCURRENCY_LIMIT"
    );
    assert.equal(started, 1);
  });

  it("does not call fetch / Gemini during fake tests", async () => {
    let fetches = 0;
    const prev = globalThis.fetch;
    globalThis.fetch = async () => {
      fetches += 1;
      throw new Error("network forbidden");
    };
    try {
      await runStaged(fakeValidSyntheticStagedProvider());
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("server sources do not import production takeoff/visualizer modules", () => {
    const indexSrc = readFileSync(join(__dirname, "index.mjs"), "utf8");
    assert.match(indexSrc, /pathname === "\/takeoff"/);
    assert.doesNotMatch(indexSrc, /app-ai-takeoff|takeoffWorkspace|geminiTakeoffProvider|visualizer/i);
    const pipelineSrc = readFileSync(join(__dirname, "takeoff/takeoffPipeline.mjs"), "utf8");
    assert.doesNotMatch(pipelineSrc, /backend-core\/src\/takeoff\/(?!.*Measurement)/);
    assert.doesNotMatch(pipelineSrc, /geminiTakeoffProvider|takeoffExtractionService|takeoffWorkspace/i);
  });
});

describe("Phase 4B.4A frontend dist secret scan (when present)", () => {
  it("built assets must not contain Gemini keys or takeoff API key URLs", () => {
    const distJs = join(__dirname, "../dist/assets");
    if (!existsSync(distJs)) return;
    let files;
    try {
      files = readdirSync(distJs).filter((f) => f.endsWith(".js"));
    } catch {
      return;
    }
    for (const f of files) {
      const src = readFileSync(join(distJs, f), "utf8");
      assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
      assert.doesNotMatch(src, /generativelanguage\.googleapis\.com[^"']*key=/i);
      assert.doesNotMatch(src, /QIL_GEMINI_API_KEY\s*=\s*['"][^'"]+['"]/);
    }
  });
});
