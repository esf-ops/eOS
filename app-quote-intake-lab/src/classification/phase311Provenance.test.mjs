import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { parseEmlUpload } from "../inbound/emlInboundAdapter.mjs";
import { LiveIntakeIntelligenceProvider } from "./liveIntakeIntelligenceProvider.mjs";
import {
  caseValueProvenance,
  formatConfidenceWithProvenance,
  formatSfWithProvenance,
  resolveProvenance,
  usesFixtureAsterisk
} from "./provenance.mjs";
import {
  hasBlockingValidationWarnings,
  structureValidationWarning,
  structureValidationWarnings,
  warningsForRun
} from "./validationWarnings.mjs";
import { validateAndNormalizeClassificationResult } from "../../server/validateClassificationResult.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseRequest = {
  caseId: "c1",
  subject: "Need an Elite 100 estimate for Maple Court",
  textBody:
    "Customer: Northbridge Homes\nProject: Maple Court Kitchen\nColor: Calacatta Mira\nEdge: eased edge\nSinks: 2 sink cutouts\nTotal SF: 48.5\nSynthetic lab smoke only.",
  from: { name: "Avery", email: "avery@example.com" },
  to: [{ name: null, email: "sales@example.com" }],
  cc: [],
  mailbox: "sales@example.com",
  attachments: [{ id: "a1", filename: "kitchen-plan.pdf", contentType: "application/pdf", sizeBytes: 1200 }]
};

describe("Phase 3.1.1 provenance display", () => {
  it("never labels live unreviewed confidence as simulated", () => {
    const kind = resolveProvenance({
      dataSource: "imported",
      providerMode: "live",
      humanReviewState: "unreviewed",
      hasClassification: true
    });
    assert.equal(kind, "live_unreviewed");
    const label = formatConfidenceWithProvenance(0.95, kind);
    assert.match(label, /95%/);
    assert.match(label, /Live Gemini/);
    assert.match(label, /unreviewed/);
    assert.equal(/simulated/i.test(label), false);
  });

  it("keeps simulated classifier labeling for simulated runs", () => {
    const kind = resolveProvenance({
      dataSource: "imported",
      providerMode: "simulated",
      humanReviewState: "unreviewed",
      hasClassification: true
    });
    assert.equal(kind, "simulated_classifier");
    assert.match(formatConfidenceWithProvenance(0.8, kind), /simulated/);
  });

  it("keeps fixture asterisks fixture-only and omits them for live SF", () => {
    assert.equal(usesFixtureAsterisk("fixture_simulated"), true);
    assert.equal(usesFixtureAsterisk("live_unreviewed"), false);
    assert.match(formatSfWithProvenance(48.5, "fixture_simulated"), /\*$/);
    const liveSf = formatSfWithProvenance(48.5, "live_unreviewed");
    assert.match(liveSf, /48\.5 sf/);
    assert.match(liveSf, /AI extracted/);
    assert.equal(liveSf.includes("*"), false);
  });

  it("shows human-corrected provenance", () => {
    const kind = resolveProvenance({
      dataSource: "imported",
      providerMode: "live",
      humanReviewState: "corrected",
      fieldHumanReviewState: "corrected",
      hasClassification: true
    });
    assert.equal(kind, "human_corrected");
    assert.match(formatSfWithProvenance(50, kind), /corrected/);
  });

  it("formats case overlays with providerMode rather than fixture asterisk after live run", () => {
    const caseRow = {
      dataSource: "imported",
      proposedSquareFootage: 48.5,
      aiConfidence: 0.95,
      latestClassificationRunId: "run-1",
      classificationProviderMode: "live",
      classificationReviewState: "unreviewed"
    };
    assert.equal(caseValueProvenance(caseRow), "live_unreviewed");
    const sf = formatSfWithProvenance(caseRow.proposedSquareFootage, caseValueProvenance(caseRow));
    const conf = formatConfidenceWithProvenance(caseRow.aiConfidence, caseValueProvenance(caseRow));
    assert.equal(sf.includes("*"), false);
    assert.match(conf, /Live Gemini/);
  });

  it("fixture cases without classification keep asterisk", () => {
    const fixture = {
      dataSource: "fixture",
      proposedSquareFootage: 64.1,
      aiConfidence: 0.9,
      latestClassificationRunId: null,
      classificationProviderMode: null,
      classificationReviewState: null
    };
    assert.equal(caseValueProvenance(fixture), "fixture_simulated");
    assert.match(
      formatSfWithProvenance(fixture.proposedSquareFootage, caseValueProvenance(fixture)),
      /\*$/
    );
  });
});

describe("Phase 3.1.1 validation warnings", () => {
  it("maps char-range coercion to informational (non-blocking)", () => {
    const w = structureValidationWarning(
      "Field statedSquareFootage: invalid character range — coerced from excerpt location."
    );
    assert.equal(w.code, "EVIDENCE_RANGE_COERCED");
    assert.equal(w.severity, "informational");
    assert.equal(w.stage, "evidence_validation");
    assert.equal(w.fieldKey, "statedSquareFootage");
    assert.equal(w.estimatorActionRequired, false);
  });

  it("blocks acceptance on unsupported top-level pricing keys", () => {
    const list = structureValidationWarnings(["Ignored unsupported top-level key: pricingQuote"]);
    assert.equal(hasBlockingValidationWarnings(list), true);
    assert.equal(list[0].severity, "blocking");
  });

  it("surfaces and persists structured warnings on live-labeled runs; informational stay visible", async () => {
    const raw = {
      intent: "new_quote_request",
      workflowEligibility: "elite_100_candidate",
      catalogValidationState: "not_checked",
      suggestedStatus: "qil_intake_review",
      overallConfidence: 0.95,
      fields: [
        {
          key: "statedSquareFootage",
          value: 48.5,
          unknown: false,
          confidence: 0.95,
          evidence: {
            sourceType: "body",
            excerpt: "Total SF: 48.5",
            charStart: -1,
            charEnd: 0
          }
        },
        {
          key: "requestedColorText",
          value: "Calacatta Mira",
          unknown: false,
          confidence: 0.9,
          evidence: {
            sourceType: "body",
            excerpt: "Color: Calacatta Mira",
            charStart: 9999,
            charEnd: 10000
          }
        }
      ],
      missingInformation: [],
      warnings: []
    };
    const { result, validationWarnings } = validateAndNormalizeClassificationResult(raw, baseRequest, {
      providerName: "LiveGeminiIntakeIntelligenceProvider",
      providerMode: "live",
      providerVersion: "live-gemini-1.0.0"
    });
    assert.equal(validationWarnings.length, 2);
    assert.ok(validationWarnings.every((w) => /invalid character range/i.test(w)));

    const store = new MemoryLabStore();
    const live = new LiveIntakeIntelligenceProvider({
      labToken: "t",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result,
          validationWarnings
        })
      })
    });
    const repo = new LocalQuoteIntakeRepository({
      store,
      asOfMode: "fixture",
      liveProvider: live
    });
    const eml = join(__dirname, "../fixtures/eml/plain-text.eml");
    const message = await parseEmlUpload({
      bytes: new Uint8Array(readFileSync(eml)),
      filename: "plain-text.eml",
      importActor: "t"
    });
    const imp = await repo.confirmImport(message);
    const out = await repo.runClassification(imp.caseId, { providerMode: "live" });
    assert.equal(out.ok, true);
    const run = await repo.getClassificationRun(out.runId);
    const structured = warningsForRun(run);
    assert.equal(structured.length, 2);
    assert.ok(structured.every((w) => w.code === "EVIDENCE_RANGE_COERCED"));
    assert.equal(hasBlockingValidationWarnings(structured), false);
    assert.equal(run.providerMode, "live");
    assert.equal(/simulated/i.test(formatConfidenceWithProvenance(0.95, "live_unreviewed")), false);

    const row = await repo.getCase(imp.caseId);
    assert.equal(row.classificationProviderMode, "live");
    const sfLabel = formatSfWithProvenance(row.proposedSquareFootage, caseValueProvenance(row));
    assert.equal(sfLabel.includes("*"), false);
    assert.match(sfLabel, /AI extracted|48\.5/);

    // Informational warnings do not silently disappear after accept
    const accepted = await repo.acceptClassification(imp.caseId, out.runId, { actorLabel: "t" });
    assert.equal(accepted.ok, true);
    const after = await repo.getClassificationRun(out.runId);
    assert.equal(warningsForRun(after).length, 2);
  });

  it("blocking warnings prevent acceptance", async () => {
    const store = new MemoryLabStore();
    const live = new LiveIntakeIntelligenceProvider({
      labToken: "t",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: {
            intent: "new_quote_request",
            workflowEligibility: "elite_100_candidate",
            catalogValidationState: "not_checked",
            suggestedStatus: "qil_intake_review",
            overallConfidence: 0.5,
            fields: [],
            missingInformation: [],
            missingKeys: [],
            warnings: ["Ignored unsupported top-level key: pricingQuote"],
            provider: {
              name: "LiveGeminiIntakeIntelligenceProvider",
              mode: "live",
              version: "live-gemini-1.0.0"
            }
          },
          validationWarnings: ["Ignored unsupported top-level key: pricingQuote"]
        })
      })
    });
    const repo = new LocalQuoteIntakeRepository({
      store,
      asOfMode: "fixture",
      liveProvider: live
    });
    const eml = join(__dirname, "../fixtures/eml/plain-text.eml");
    const message = await parseEmlUpload({
      bytes: new Uint8Array(readFileSync(eml)),
      filename: "plain-text.eml",
      importActor: "t"
    });
    const imp = await repo.confirmImport(message);
    const out = await repo.runClassification(imp.caseId, { providerMode: "live" });
    assert.equal(out.ok, true);
    await assert.rejects(
      () => repo.acceptClassification(imp.caseId, out.runId, { actorLabel: "t" }),
      (e) => e.code === "BLOCKING_VALIDATION_WARNINGS"
    );
  });
});
