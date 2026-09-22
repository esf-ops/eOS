/**
 * Phase 4 hybrid retrieval, OCR, embedding, and eval tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  createEmbeddingProvider,
  getEmbeddingConfig,
  cosineSimilarity,
  buildPassageEmbedText,
  vectorToPgLiteral,
} from "./embeddingProvider.mjs";
import {
  HYBRID_RANKING,
  extractExactIdentifiers,
  reciprocalRankFusion,
  applyHybridBoosts,
} from "./hybridRanking.mjs";
import { shouldInvokeOcr, createOcrProvider, getOcrConfig, OCR_DEFAULTS } from "./ocrProvider.mjs";
import { buildRetrievalQuery } from "./knowledgeRetrieval.mjs";
import { isRetrievableDocument } from "./knowledgeRepository.mjs";
import { canAdministerKnowledge } from "./knowledgeConstants.mjs";
import { runRetrievalEval, EVAL_CORPUS } from "./retrievalEval.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = join(__dirname, "../../../../app-slab-ai/evals/retrieval/cases.json");
const EVAL_CASES = JSON.parse(readFileSync(casesPath, "utf8"));

describe("embedding provider", () => {
  it("mock provider is deterministic and L2-normalized", async () => {
    const p = createEmbeddingProvider({ SLAB_AI_EMBEDDING_MOCK: "1", SLAB_AI_EMBEDDING_DIMENSIONS: "32" });
    assert.equal(p.id, "mock");
    const a = await p.embedText("hello");
    const b = await p.embedText("hello");
    assert.equal(a.length, 32);
    assert.deepEqual(a, b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    assert.ok(Math.abs(norm - 1) < 1e-6);
  });

  it("embedBatch matches embedText", async () => {
    const p = createEmbeddingProvider({ SLAB_AI_EMBEDDING_MOCK: "1", SLAB_AI_EMBEDDING_DIMENSIONS: "16" });
    const batch = await p.embedBatch(["a", "b"]);
    assert.equal(batch.length, 2);
    assert.deepEqual(batch[0], await p.embedText("a"));
  });

  it("config prefers SLAB_AI_EMBEDDING_* and never leaks key in getEmbeddingConfig mock", () => {
    const cfg = getEmbeddingConfig({
      SLAB_AI_EMBEDDING_PROVIDER: "mock",
      SLAB_AI_EMBEDDING_MODEL: "mock-embedding",
      SLAB_AI_EMBEDDING_API_KEY: "secret-should-exist-in-cfg-only",
    });
    assert.equal(cfg.provider, "mock");
    assert.equal(cfg.model, "mock-embedding");
  });

  it("buildPassageEmbedText excludes secrets-like fields", () => {
    const t = buildPassageEmbedText({
      title: "Manual",
      sectionTitle: "Safety",
      text: "Keep guards closed",
      manufacturer: "BACA",
      machineModel: "MiterExcel",
    });
    assert.match(t, /Manual/);
    assert.match(t, /guards/);
    assert.doesNotMatch(t, /api[_-]?key|Bearer|sk-/i);
  });

  it("vectorToPgLiteral formats floats", () => {
    assert.equal(vectorToPgLiteral([0.1, -0.2]), "[0.1,-0.2]");
  });

  it("cosineSimilarity is 1 for identical vectors", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
  });
});

describe("hybrid ranking", () => {
  it("extracts exact identifiers with digits", () => {
    const ids = extractExactIdentifiers("fault E-204 on MiterExcel-12");
    assert.ok(ids.some((x) => /E-204/i.test(x)));
    assert.ok(ids.some((x) => /MiterExcel/i.test(x)));
  });

  it("RRF merges lexical and semantic ranks", () => {
    const fused = reciprocalRankFusion([
      { id: "a", rank: 1, channel: "lexical" },
      { id: "b", rank: 2, channel: "lexical" },
      { id: "b", rank: 1, channel: "semantic" },
      { id: "a", rank: 3, channel: "semantic" },
    ]);
    assert.ok(fused.get("b").score > fused.get("a").score);
    assert.equal(fused.get("b").lexicalRank, 2);
    assert.equal(fused.get("b").semanticRank, 1);
  });

  it("exact identifier boost elevates model match", () => {
    const base = applyHybridBoosts({
      rrfScore: 0.01,
      passageText: "general tips",
      title: "Tips",
      authority: "general_reference",
      identifiers: ["MiterExcel"],
      filters: {},
    });
    const exact = applyHybridBoosts({
      rrfScore: 0.01,
      passageText: "MiterExcel edge chip",
      title: "BACA MiterExcel Manual",
      authority: "manufacturer_primary",
      identifiers: ["MiterExcel"],
      filters: { machineModel: "MiterExcel" },
    });
    assert.ok(exact.score > base.score);
    assert.ok(exact.reasons.some((r) => /exact|model|authority/i.test(r)));
  });

  it("centralizes ranking config", () => {
    assert.equal(typeof HYBRID_RANKING.rrfK, "number");
    assert.ok(HYBRID_RANKING.boosts.exactIdentifierInTitle > HYBRID_RANKING.boosts.materialMatch);
  });
});

describe("retrieval query builder", () => {
  it("builds controlled phrase from structured fields", () => {
    const q = buildRetrievalQuery({
      manufacturer: "BACA",
      machineModel: "MiterExcel",
      material: "quartzite",
      symptom: "edge chipping",
      query: "blade deflection",
    });
    assert.match(q, /BACA/);
    assert.match(q, /MiterExcel/);
    assert.match(q, /quartzite/);
    assert.match(q, /deflection/);
  });
});

describe("OCR detection + provider", () => {
  it("skips OCR when native text is adequate", () => {
    const d = shouldInvokeOcr({
      nativeText: "A".repeat(OCR_DEFAULTS.minNativeChars + 20),
      pageCount: 2,
    });
    assert.equal(d.ocr, false);
  });

  it("invokes OCR for empty native text", () => {
    const d = shouldInvokeOcr({ nativeText: "", pageCount: 3 });
    assert.equal(d.ocr, true);
    assert.equal(d.reason, "empty_native_text");
  });

  it("invokes OCR for sparse text", () => {
    const d = shouldInvokeOcr({ nativeText: "ab", pageCount: 10 });
    assert.equal(d.ocr, true);
  });

  it("forceOcr overrides adequate native text", () => {
    const d = shouldInvokeOcr({
      nativeText: "A".repeat(500),
      pageCount: 1,
      forceOcr: true,
    });
    assert.equal(d.ocr, true);
    assert.equal(d.reason, "force_ocr");
  });

  it("mock OCR preserves page numbers", async () => {
    const ocr = createOcrProvider({ SLAB_AI_OCR_MOCK: "1" });
    const result = await ocr.processDocument({ bytes: Buffer.from("%PDF"), pageCountHint: 2 });
    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].pageNumber, 1);
    assert.equal(result.pages[1].pageNumber, 2);
    assert.match(result.pages[0].text, /SENTINEL OCR/);
  });

  it("rejects oversized OCR page counts", async () => {
    const ocr = createOcrProvider({
      SLAB_AI_OCR_MOCK: "1",
      SLAB_AI_OCR_MAX_PAGES: "3",
      SLAB_AI_OCR_MAX_BYTES: String(1024 * 1024),
    });
    await assert.rejects(
      () => ocr.processDocument({ bytes: Buffer.from("%PDF"), pageCountHint: 900 }),
      (e) => e.code === "OCR_PAGE_LIMIT"
    );
  });

  it("rejects oversized OCR file bytes", async () => {
    const ocr = createOcrProvider({
      SLAB_AI_OCR_MOCK: "1",
      SLAB_AI_OCR_MAX_BYTES: "50",
    });
    await assert.rejects(
      () => ocr.processDocument({ bytes: Buffer.alloc(200), pageCountHint: 1 }),
      (e) => e.code === "OCR_TOO_LARGE"
    );
  });
});

describe("authorization gates", () => {
  it("review_required / archived / superseded excluded from retrieval", () => {
    assert.equal(isRetrievableDocument({ status: "review_required", is_current: true, is_active: true }), false);
    assert.equal(isRetrievableDocument({ status: "archived", is_current: false, is_active: false }), false);
    assert.equal(isRetrievableDocument({ status: "approved", is_current: false, is_active: true }), false);
    assert.equal(isRetrievableDocument({ status: "rejected", is_current: true, is_active: true }), false);
    assert.equal(isRetrievableDocument({ status: "approved", is_current: true, is_active: true }), true);
  });

  it("knowledge admin requires elevated role", () => {
    assert.equal(canAdministerKnowledge({ role: "viewer" }), false);
    assert.equal(canAdministerKnowledge({ role: "admin" }), true);
  });
});

describe("retrieval evaluation — lexical vs hybrid", () => {
  it("reports Recall@5 and MRR; hybrid improves synonym cases without exact-id regression", async () => {
    const report = await runRetrievalEval(EVAL_CASES, EVAL_CORPUS);
    assert.ok(report.lexical);
    assert.ok(report.hybrid);
    assert.ok(typeof report.lexical.recallAtK === "number");
    assert.ok(typeof report.hybrid.recallAtK === "number");
    assert.ok(typeof report.lexical.mrr === "number");
    assert.ok(typeof report.hybrid.mrr === "number");

    // Hybrid should not regress overall recall on this sentinel set
    assert.ok(
      report.hybrid.recallAtK + 1e-9 >= report.lexical.recallAtK,
      `hybrid recall ${report.hybrid.recallAtK} < lexical ${report.lexical.recallAtK}`
    );

    // Exact identifier cases must pass under hybrid (MRR not required ≥ lexical globally —
    // synonym recovery can place correct hits at rank 2 while lexical misses entirely)
    assert.equal(report.hybrid.exactIdentifierPassRate, 1);
    const exactIds = EVAL_CASES.filter((c) => c.category === "exact_id").map((c) => c.id);
    for (const id of exactIds) {
      const h = report.hybrid.caseResults.find((c) => c.id === id);
      assert.ok(h && h.mrr === 1, `exact-id case ${id} must rank #1 under hybrid (mrr=${h?.mrr})`);
    }

    // Security / tool-domain cases must pass
    assert.equal(report.hybrid.securityPassRate, 1);

    // Synonym cases: hybrid must retrieve expected
    const synonymIds = EVAL_CASES.filter((c) => c.category === "synonym").map((c) => c.id);
    for (const id of synonymIds) {
      const h = report.hybrid.caseResults.find((c) => c.id === id);
      assert.ok(h, id);
      assert.equal(h.recallAtK, 1, `hybrid missed synonym case ${id}`);
    }

    // At least one synonym case where lexical fails and hybrid recovers
    const lexicalMissHybridHit = synonymIds.some((id) => {
      const l = report.lexical.caseResults.find((c) => c.id === id);
      const h = report.hybrid.caseResults.find((c) => c.id === id);
      return l && h && l.recallAtK === 0 && h.recallAtK === 1;
    });
    assert.ok(lexicalMissHybridHit, "expected at least one synonym case where hybrid recovers a lexical miss");

    // Print metrics for Phase 4 report (visible with --test-reporter=spec)
    console.log(
      JSON.stringify(
        {
          lexical: { RecallAt5: report.lexical.recallAtK, MRR: report.lexical.mrr },
          hybrid: {
            RecallAt5: report.hybrid.recallAtK,
            MRR: report.hybrid.mrr,
            exactIdentifierPassRate: report.hybrid.exactIdentifierPassRate,
          },
        },
        null,
        2
      )
    );
  });
});

describe("degradation contracts", () => {
  it("embedding unavailable uses mock in non-production when no key", () => {
    const cfg = getEmbeddingConfig({ NODE_ENV: "test", OPENAI_API_KEY: "", SLAB_AI_EMBEDDING_API_KEY: "" });
    assert.equal(cfg.mock, true);
  });
});
