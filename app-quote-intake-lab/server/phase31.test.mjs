import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeLiveClassificationRequest } from "./sanitizeLiveRequest.mjs";
import { validateAndNormalizeClassificationResult } from "./validateClassificationResult.mjs";
import { stripJsonFences, geminiJsonGenerate } from "./geminiJsonClient.mjs";
import { runLiveClassificationPipeline } from "./classifyPipeline.mjs";
import { createConcurrencyGate } from "./concurrency.mjs";
import { describePhase31Boundary } from "../../backend-core/src/quoteIntakeLab/phase31LiveBoundary.mjs";
import { LiveIntakeIntelligenceProvider } from "../src/classification/liveIntakeIntelligenceProvider.mjs";
import { LocalQuoteIntakeRepository } from "../src/repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../src/repository/memoryLabStore.mjs";
import { parseEmlUpload } from "../src/inbound/emlInboundAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseRequest = {
  caseId: "c1",
  subject: "Need an Elite 100 estimate",
  textBody: "Color: Calacatta Mira\nEdge: eased edge\nSinks: 2 sink cutouts\nCustomer: Acme Homes",
  from: { name: "A", email: "a@example.com" },
  to: [{ name: null, email: "sales@example.com" }],
  cc: [],
  mailbox: "sales@example.com",
  attachments: [{ id: "1", filename: "kitchen-plan.pdf", contentType: "application/pdf", sizeBytes: 10 }]
};

describe("Visualizer transport discovery boundary", () => {
  it("documents Option B host and Brain remain unmounted", () => {
    const b = describePhase31Boundary();
    assert.equal(b.mountedInBrain, false);
    assert.match(b.liveHost, /app-quote-intake-lab\/server/);
  });

  it("does not import visualizer or production takeoff provider modules from lab server", () => {
    const indexSrc = readFileSync(join(__dirname, "index.mjs"), "utf8");
    assert.doesNotMatch(
      indexSrc,
      /visualizer|geminiVisualizer|app-ai-takeoff|takeoffWorkspace|geminiTakeoffProvider/i
    );
    // Lab-owned /takeoff endpoint is allowed (Phase 4B.4A); production modules are not.
    assert.match(indexSrc, /pathname === "\/takeoff"/);
    const clientSrc = readFileSync(join(__dirname, "geminiJsonClient.mjs"), "utf8");
    assert.match(clientSrc, /generativelanguage\.googleapis\.com/);
    assert.match(clientSrc, /NEVER log/);
  });
});

describe("live request construction", () => {
  it("keeps only permitted metadata fields", () => {
    const clean = sanitizeLiveClassificationRequest(baseRequest);
    assert.equal(clean.subject, baseRequest.subject);
    assert.equal(clean.attachments[0].filename, "kitchen-plan.pdf");
    assert.equal(Object.prototype.hasOwnProperty.call(clean.attachments[0], "bytes"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(clean, "htmlBody"), false);
  });

  it("rejects attachment bytes", () => {
    assert.throws(
      () =>
        sanitizeLiveClassificationRequest({
          ...baseRequest,
          attachments: [{ filename: "a.pdf", bytes: [1, 2, 3] }]
        }),
      /bytes/i
    );
  });

  it("rejects raw HTML fields", () => {
    assert.throws(() => sanitizeLiveClassificationRequest({ ...baseRequest, html: "<p>x</p>" }), /HTML/i);
  });

  it("frontend live payload excludes bytes and credentials", async () => {
    let seen = null;
    const provider = new LiveIntakeIntelligenceProvider({
      baseUrl: "http://127.0.0.1:5197",
      labToken: "lab-token",
      fetchImpl: async (url, init) => {
        seen = { url: String(url), body: JSON.parse(init.body), headers: init.headers };
        return {
          ok: true,
          json: async () => ({
            ok: true,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            result: {
              intent: "new_quote_request",
              intentConfidence: 0.8,
              intentReason: "t",
              workflowEligibility: "elite_100_candidate",
              senderClaimsElite100: true,
              catalogValidationState: "needs_human_review",
              catalogValidationNote: "n",
              overallConfidence: 0.7,
              confidenceReason: "c",
              uncertaintyFlags: [],
              fields: [],
              missingInformation: [],
              missingKeys: [],
              warnings: [],
              suggestedStatus: "qil_intake_review",
              provider: { name: "LiveGeminiIntakeIntelligenceProvider", mode: "live", version: "x" }
            }
          })
        };
      }
    });
    await provider.classify({
      ...baseRequest,
      attachments: [{ id: "1", filename: "kitchen-plan.pdf", contentType: "application/pdf", sizeBytes: 9, bytes: new Uint8Array([9]) }]
    });
    assert.ok(!("bytes" in (seen.body.attachments[0] ?? {})));
    assert.ok(!JSON.stringify(seen.body).includes("GEMINI"));
    assert.ok(!JSON.stringify(seen.headers).toLowerCase().includes("api"));
    assert.equal(seen.headers["X-QIL-Lab-Token"], "lab-token");
  });
});

describe("schema + evidence validation", () => {
  it("validates enums, strips unsupported fields, checks evidence", () => {
    const { result, validationWarnings } = validateAndNormalizeClassificationResult(
      {
        intent: "new_quote_request",
        intentConfidence: 0.9,
        workflowEligibility: "elite_100_candidate",
        catalogValidationState: "needs_human_review",
        overallConfidence: 0.8,
        suggestedStatus: "qil_intake_review",
        fields: [
          {
            key: "requestedColorText",
            value: "Calacatta Mira",
            unknown: false,
            confidence: 0.9,
            evidence: {
              sourceType: "body",
              sourceId: "body",
              excerpt: "Calacatta Mira",
              charStart: 7,
              charEnd: 21,
              extractionMethod: "model",
              confidence: 0.9
            }
          },
          { key: "priceTotal", value: 1234, unknown: false }
        ],
        missingInformation: [],
        warnings: ["looked at the PDF visually"]
      },
      baseRequest,
      { providerName: "Live", providerMode: "live", providerVersion: "t" }
    );
    assert.equal(result.fields.length, 14);
    assert.equal(result.fields.find((f) => f.key === "requestedColorText").unknown, false);
    assert.ok(validationWarnings.some((w) => /unsupported field/i.test(w)));
    assert.ok(validationWarnings.some((w) => /pricing|OCR|attachment inspection|takeoff/i.test(w)));
  });

  it("marks unknown when evidence excerpt not in source", () => {
    const { result } = validateAndNormalizeClassificationResult(
      {
        intent: "unclear",
        workflowEligibility: "manual_review_required",
        catalogValidationState: "not_checked",
        suggestedStatus: "qil_manual_review",
        fields: [
          {
            key: "projectName",
            value: "Invented Project",
            unknown: false,
            evidence: {
              sourceType: "body",
              excerpt: "this excerpt does not exist",
              extractionMethod: "model",
              confidence: 0.9
            }
          }
        ]
      },
      baseRequest,
      { providerName: "Live", providerMode: "live", providerVersion: "t" }
    );
    assert.equal(result.fields.find((f) => f.key === "projectName").unknown, true);
  });

  it("surfaces parseError for invalid model JSON", async () => {
    const r = await geminiJsonGenerate({
      apiKey: "k",
      modelName: "m",
      systemPrompt: "s",
      userMessage: "u",
      fetchImpl: async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "not-json{{" }] } }]
          })
      })
    });
    assert.equal(r.parsed, null);
    assert.ok(r.parseError);
  });

  it("strips json fences", () => {
    assert.equal(stripJsonFences('```json\n{"a":1}\n```'), '{"a":1}');
  });
});

describe("two-pass verification with fake provider", () => {
  it("runs extraction + verification without network to Google", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      const payload =
        calls === 1
          ? {
              intent: "new_quote_request",
              intentConfidence: 0.9,
              workflowEligibility: "elite_100_candidate",
              catalogValidationState: "needs_human_review",
              overallConfidence: 0.85,
              suggestedStatus: "qil_intake_review",
              fields: [
                {
                  key: "edgeProfile",
                  value: "eased edge",
                  unknown: false,
                  confidence: 0.9,
                  evidence: {
                    sourceType: "body",
                    excerpt: "eased edge",
                    extractionMethod: "model",
                    confidence: 0.9
                  }
                }
              ],
              missingInformation: [],
              warnings: []
            }
          : {
              intent: "new_quote_request",
              intentConfidence: 0.8,
              workflowEligibility: "elite_100_candidate",
              catalogValidationState: "needs_human_review",
              overallConfidence: 0.75,
              suggestedStatus: "qil_intake_review",
              fields: [
                {
                  key: "edgeProfile",
                  value: "eased edge",
                  unknown: false,
                  confidence: 0.7,
                  evidence: {
                    sourceType: "body",
                    excerpt: "eased edge",
                    extractionMethod: "verify",
                    confidence: 0.7
                  }
                }
              ],
              missingInformation: [],
              warnings: ["confidence downgraded"],
              uncertaintyFlags: ["verified"]
            };
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
            usageMetadata: { totalTokenCount: 10 }
          })
      };
    };

    const out = await runLiveClassificationPipeline({
      request: sanitizeLiveClassificationRequest(baseRequest),
      config: {
        liveAiEnabled: true,
        provider: "gemini",
        model: "fake-model",
        verificationModel: "fake-verify",
        verificationEnabled: true,
        timeoutMs: 5000,
        _apiKey: "fake-key"
      },
      fetchImpl
    });
    assert.equal(calls, 2);
    assert.equal(out.result.verification.ran, true);
    assert.equal(out.result.provider.mode, "live");
    assert.equal(out.result.fields.find((f) => f.key === "edgeProfile").value, "eased edge");
  });

  it("rejects when live disabled", async () => {
    await assert.rejects(
      () =>
        runLiveClassificationPipeline({
          request: sanitizeLiveClassificationRequest(baseRequest),
          config: {
            liveAiEnabled: false,
            provider: "gemini",
            model: "m",
            verificationEnabled: false,
            _apiKey: "k"
          },
          fetchImpl: async () => {
            throw new Error("should not fetch");
          }
        }),
      /disabled/i
    );
  });
});

describe("concurrency + timeout codes", () => {
  it("enforces concurrency limit", async () => {
    const gate = createConcurrencyGate(1);
    let release;
    const blocked = new Promise((r) => {
      release = r;
    });
    const p1 = gate.run(async () => {
      await blocked;
      return 1;
    });
    await assert.rejects(() => gate.run(async () => 2), /concurrency/i);
    release();
    assert.equal(await p1, 1);
  });

  it("maps abort to PROVIDER_TIMEOUT", async () => {
    await assert.rejects(
      () =>
        geminiJsonGenerate({
          apiKey: "k",
          modelName: "m",
          systemPrompt: "s",
          userMessage: "u",
          timeoutMs: 10,
          fetchImpl: async (_url, init) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
            })
        }),
      (e) => e.code === "PROVIDER_TIMEOUT"
    );
  });
});

describe("live vs simulated labeling + acceptance", () => {
  it("preserves run history and requires acceptance for live-labeled fake run", async () => {
    const store = new MemoryLabStore();
    const live = new LiveIntakeIntelligenceProvider({
      labToken: "t",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: validateAndNormalizeClassificationResult(
            {
              intent: "new_quote_request",
              workflowEligibility: "elite_100_candidate",
              catalogValidationState: "not_checked",
              suggestedStatus: "qil_intake_review",
              overallConfidence: 0.7,
              fields: [],
              missingInformation: [],
              warnings: []
            },
            baseRequest,
            {
              providerName: "LiveGeminiIntakeIntelligenceProvider",
              providerMode: "live",
              providerVersion: "live-gemini-1.0.0"
            }
          ).result
        })
      })
    });
    const repo = new LocalQuoteIntakeRepository({
      store,
      asOfMode: "fixture",
      liveProvider: live
    });

    const eml = join(__dirname, "../src/fixtures/eml/plain-text.eml");
    const message = await parseEmlUpload({
      bytes: new Uint8Array(readFileSync(eml)),
      filename: "plain-text.eml",
      importActor: "t"
    });
    const imp = await repo.confirmImport(message);
    const sim = await repo.runClassification(imp.caseId, { providerMode: "simulated" });
    assert.equal(sim.ok, true);
    const liveRun = await repo.runClassification(imp.caseId, { providerMode: "live" });
    assert.equal(liveRun.ok, true);
    const runs = await repo.listClassificationRuns(imp.caseId);
    assert.ok(runs.some((r) => r.providerMode === "simulated"));
    assert.ok(runs.some((r) => r.providerMode === "live"));
    const accepted = await repo.acceptClassification(imp.caseId, liveRun.runId, { actorLabel: "t" });
    assert.equal(accepted.ok, true);
  });
});
