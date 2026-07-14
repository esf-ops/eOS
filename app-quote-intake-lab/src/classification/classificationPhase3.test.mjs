import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { parseEmlUpload } from "../inbound/emlInboundAdapter.mjs";
import { SimulatedIntakeIntelligenceProvider } from "./simulatedProvider.mjs";
import { buildClassificationRequest } from "./buildClassificationRequest.mjs";
import { canTransitionStatus, assertCanTransition, canStartClassification } from "./stateTransitions.mjs";
import { PROVIDER_MODE_SIMULATED } from "./classificationTypes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const emlDir = join(__dirname, "../fixtures/eml");

function readEml(name) {
  return new Uint8Array(readFileSync(join(emlDir, name)));
}

async function importEml(repo, filename) {
  const message = await parseEmlUpload({
    bytes: readEml(filename),
    filename,
    importActor: "Phase 3 test"
  });
  const result = await repo.confirmImport(message);
  assert.equal(result.ok, true);
  return repo.getCase(result.caseId);
}

function field(resultOrFields, key) {
  const fields = Array.isArray(resultOrFields) ? resultOrFields : resultOrFields?.fields;
  return (fields ?? []).find((f) => f.key === key);
}

describe("state transitions", () => {
  it("allows Phase 3 classify transitions and blocks takeoff/sent", () => {
    assert.equal(canTransitionStatus("qil_received", "qil_classifying"), true);
    assert.equal(canTransitionStatus("qil_classifying", "qil_intake_review"), true);
    assert.equal(canTransitionStatus("qil_classifying", "qil_not_quote"), true);
    assert.equal(canTransitionStatus("qil_classifying", "qil_takeoff_processing"), false);
    assert.equal(canTransitionStatus("qil_intake_review", "qil_sent_simulated"), false);
    assert.equal(canStartClassification("qil_received"), true);
    assert.throws(() => assertCanTransition("qil_received", "qil_ready_for_review"), /Illegal/);
  });
});

describe("simulated provider scenarios", () => {
  const provider = new SimulatedIntakeIntelligenceProvider();

  it("labels itself simulated", () => {
    assert.equal(provider.mode, PROVIDER_MODE_SIMULATED);
    assert.match(provider.name, /Simulated/i);
  });

  it("classifies Elite 100 quote request with explicit fields + evidence", async () => {
    const repo = new LocalQuoteIntakeRepository({ store: new MemoryLabStore(), asOfMode: "fixture" });
    const c = await importEml(repo, "quote-with-fields.eml");
    const { result } = await provider.classify(buildClassificationRequest(c));
    assert.equal(result.intent, "new_quote_request");
    assert.equal(result.workflowEligibility, "elite_100_candidate");
    assert.equal(result.senderClaimsElite100, true);
    assert.ok(field(result, "requestedColorText").value);
    assert.ok(field(result, "requestedColorText").evidence?.excerpt);
    assert.equal(field(result, "sinkCutoutCount").value, 2);
    assert.match(String(field(result, "edgeProfile").value), /eased/i);
    assert.equal(field(result, "statedSquareFootage").value, 48.5);
    assert.ok(result.overallConfidence > 0.5);
    assert.ok(field(result, "requestedColorText").confidence > 0);
    assert.equal(result.catalogValidationState, "simulated_match");
    assert.match(result.catalogValidationNote, /not production/i);
    assert.ok(result.missingInformation.some((m) => m.key === "readable_plan_attachment" && m.resolved));
    assert.ok(result.warnings.some((w) => /not read|not inspected|metadata only/i.test(w)));
  });

  it("does not calculate square footage from dimensions", async () => {
    const providerLocal = new SimulatedIntakeIntelligenceProvider();
    const request = {
      caseId: "x",
      subject: "Kitchen estimate",
      textBody: "Need an Elite 100 estimate. Island is 96 x 42. Color: Calacatta Mira. Edge: eased edge. Sinks: 1 sink cutouts.",
      from: { name: "A", email: "a@example.com" },
      to: [{ name: null, email: "sales@example.com" }],
      cc: [],
      attachments: [],
      mailbox: "sales@example.com"
    };
    const { result } = await providerLocal.classify(request);
    assert.equal(field(result, "statedSquareFootage").unknown, true);
    assert.ok(result.warnings.some((w) => /not calculated/i.test(w)));
  });

  it("marks non-Elite quartzite as non_elite_100_candidate", async () => {
    const repo = new LocalQuoteIntakeRepository({ store: new MemoryLabStore(), asOfMode: "fixture" });
    const c = await importEml(repo, "quartzite-non-elite.eml");
    const { result } = await provider.classify(buildClassificationRequest(c));
    assert.equal(result.intent, "new_quote_request");
    assert.equal(result.workflowEligibility, "non_elite_100_candidate");
    assert.equal(result.suggestedStatus, "qil_not_elite_100");
  });

  it("marks schedule email as not_quote_related", async () => {
    const repo = new LocalQuoteIntakeRepository({ store: new MemoryLabStore(), asOfMode: "fixture" });
    const c = await importEml(repo, "non-quote-schedule.eml");
    const { result } = await provider.classify(buildClassificationRequest(c));
    assert.equal(result.intent, "not_quote_related");
    assert.equal(result.suggestedStatus, "qil_not_quote");
  });

  it("detects quote revision", async () => {
    const repo = new LocalQuoteIntakeRepository({ store: new MemoryLabStore(), asOfMode: "fixture" });
    const c = await importEml(repo, "quote-revision.eml");
    const { result } = await provider.classify(buildClassificationRequest(c));
    assert.equal(result.intent, "quote_revision");
    assert.ok(field(result, "revisionReference").value);
  });

  it("ambiguous quote keyword → manual review", async () => {
    const { result } = await provider.classify({
      caseId: "amb",
      subject: "Quick question",
      textBody: "About the quote we discussed earlier.",
      from: { name: "A", email: "a@example.com" },
      to: [{ name: null, email: "sales@example.com" }],
      cc: [],
      attachments: [],
      mailbox: "sales@example.com"
    });
    assert.equal(result.intent, "unclear");
    assert.equal(result.suggestedStatus, "qil_manual_review");
  });

  it("flags missing color/edge as quote_blocking", async () => {
    const { result } = await provider.classify({
      caseId: "miss",
      subject: "Need an estimate",
      textBody: "Please quote a kitchen remodel. Customer: Acme Homes.",
      from: { name: "A", email: "a@example.com" },
      to: [{ name: null, email: "sales@example.com" }],
      cc: [],
      attachments: [],
      mailbox: "sales@example.com"
    });
    const missing = result.missingInformation.filter((m) => !m.resolved);
    assert.ok(missing.some((m) => m.key === "requested_color_or_price_group" && m.severity === "quote_blocking"));
    assert.ok(missing.some((m) => m.key === "edge_profile" && m.severity === "quote_blocking"));
    assert.equal(result.provider.mode, "simulated");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "resolvedPriceGroup"), false);
  });

  it("keeps unknown values unknown without fabricating evidence", async () => {
    const { result } = await provider.classify({
      caseId: "unk",
      subject: "Need an Elite 100 estimate",
      textBody: "Need an Elite 100 estimate please.",
      from: { name: "A", email: "a@example.com" },
      to: [{ name: null, email: "sales@example.com" }],
      cc: [],
      attachments: [],
      mailbox: "sales@example.com"
    });
    const phone = field(result, "contactPhone");
    assert.equal(phone.unknown, true);
    assert.equal(phone.evidence, null);
  });

  it("does not assign authoritative price group", async () => {
    const { result } = await provider.classify({
      caseId: "pg",
      subject: "Need an Elite 100 estimate",
      textBody: "Need an Elite 100 estimate. Price group B please. Color: Calacatta Mira. Edge: eased edge. Sinks: 1 sink cutouts. Total SF: 20",
      from: { name: "A", email: "a@example.com" },
      to: [{ name: null, email: "sales@example.com" }],
      cc: [],
      attachments: [],
      mailbox: "sales@example.com"
    });
    const text = field(result, "elite100OrPriceGroupText");
    assert.ok(text.value);
    assert.match(String(text.confidenceReason), /not an authoritative/i);
  });
});

describe("classification persistence + workflow", () => {
  it("preserves run history, corrections, accepted snapshot immutability", async () => {
    const store = new MemoryLabStore();
    const repo = new LocalQuoteIntakeRepository({ store, asOfMode: "fixture" });
    const c = await importEml(repo, "quote-with-fields.eml");

    const first = await repo.runClassification(c.id, { actorLabel: "Tester" });
    assert.equal(first.ok, true);
    assert.equal(first.status, "qil_intake_review");

    const run1 = await repo.getClassificationRun(first.runId);
    assert.equal(run1.humanReviewState, "unreviewed");
    assert.equal(run1.providerMode, "simulated");

    await repo.applyClassificationCorrections(
      c.id,
      first.runId,
      [{ fieldKey: "edgeProfile", action: "edit", value: "bullnose", note: "correct edge" }],
      { actorLabel: "Tester" }
    );
    const corrected = await repo.getClassificationRun(first.runId);
    assert.equal(corrected.humanReviewState, "corrected");
    assert.equal(field(corrected.result, "edgeProfile").value, "bullnose");
    assert.equal(field(corrected.result, "edgeProfile").evidence.sourceType, "manual_correction");

    const accept = await repo.acceptClassification(c.id, first.runId, { actorLabel: "Tester" });
    assert.equal(accept.ok, true);
    const snap = await repo.getAcceptedSnapshot(c.id);
    assert.ok(snap);
    assert.equal(snap.id, accept.snapshotId);
    assert.equal(field(snap.fields, "edgeProfile").value, "bullnose");

    // Mutating accepted run corrections should fail
    await assert.rejects(
      () =>
        repo.applyClassificationCorrections(c.id, first.runId, [
          { fieldKey: "edgeProfile", action: "edit", value: "ogee" }
        ]),
      /accepted|superseded|immutable/i
    );

    // Re-run preserves original accepted run
    const second = await repo.runClassification(c.id, { actorLabel: "Tester" });
    assert.equal(second.ok, true);
    const runs = await repo.listClassificationRuns(c.id);
    assert.ok(runs.length >= 2);
    const original = runs.find((r) => r.id === first.runId);
    assert.ok(original);
    assert.equal(original.humanReviewState, "accepted");
    assert.equal(field(original.result, "edgeProfile").value, "bullnose");
    const newer = runs.find((r) => r.id === second.runId);
    assert.equal(newer.humanReviewState, "unreviewed");

    // Snapshot still intact
    const snap2 = await repo.getAcceptedSnapshot(c.id);
    assert.equal(snap2.id, snap.id);

    const after = await repo.getCase(c.id);
    assert.ok(["qil_intake_review", "qil_manual_review", "qil_not_quote", "qil_not_elite_100"].includes(after.status));
  });

  it("classifies non-quote import into qil_not_quote", async () => {
    const repo = new LocalQuoteIntakeRepository({ store: new MemoryLabStore(), asOfMode: "fixture" });
    const c = await importEml(repo, "non-quote-schedule.eml");
    const out = await repo.runClassification(c.id);
    assert.equal(out.status, "qil_not_quote");
    const listed = await repo.getCase(c.id);
    assert.equal(listed.status, "qil_not_quote");
  });

  it("clearImported removes import classification data but keeps fixtures", async () => {
    const store = new MemoryLabStore();
    const repo = new LocalQuoteIntakeRepository({ store, asOfMode: "fixture" });
    const c = await importEml(repo, "plain-text.eml");
    await repo.runClassification(c.id);
    const fixtureId = "qil-case-001";
    await repo.runClassification(fixtureId);
    assert.ok((await repo.listClassificationRuns(fixtureId)).length >= 1);
    await repo.clearImported();
    assert.equal(await repo.countImported(), 0);
    assert.equal((await repo.listClassificationRuns(c.id)).length, 0);
    assert.ok((await repo.listClassificationRuns(fixtureId)).length >= 1);
    const fixtures = await repo.listCases();
    assert.ok(fixtures.some((x) => x.id === fixtureId));
  });

  it("make no network calls during classification", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("network forbidden");
    };
    try {
      const repo = new LocalQuoteIntakeRepository({ store: new MemoryLabStore(), asOfMode: "fixture" });
      const c = await importEml(repo, "quote-with-fields.eml");
      await repo.runClassification(c.id);
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fixture identity + migration smoke", () => {
  it("committed classification eml fixtures use example.com only", () => {
    for (const name of [
      "quote-with-fields.eml",
      "non-quote-schedule.eml",
      "quartzite-non-elite.eml",
      "quote-revision.eml"
    ]) {
      const text = readFileSync(join(emlDir, name), "utf8");
      assert.match(text, /@example\.com/);
      assert.doesNotMatch(text, /@(gmail|yahoo|outlook)\./i);
    }
  });
});
