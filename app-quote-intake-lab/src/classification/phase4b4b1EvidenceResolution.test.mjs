/**
 * Phase 4B.4B.1 — classification evidence-resolution correction (fake Gemini only).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { parseEmlUpload } from "../inbound/emlInboundAdapter.mjs";
import { LiveIntakeIntelligenceProvider } from "./liveIntakeIntelligenceProvider.mjs";
import { validateAndNormalizeClassificationResult } from "../../server/validateClassificationResult.mjs";
import {
  activeBlockingWarnings,
  fieldHasUnresolvedInvalidEvidence,
  hasActiveBlockingValidationWarnings,
  structureValidationWarning,
  structureValidationWarnings,
  warningsForRun
} from "./validationWarnings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EML = join(__dirname, "../fixtures/eml/synth-kitchen-island-live-takeoff.eml");

function field(result, key) {
  return (result?.fields ?? []).find((f) => f.key === key);
}

function baseRequestFromBody(textBody) {
  return {
    caseId: "qil-case-evidence",
    subject: "Elite 100 quote request — Maple Court Kitchen (synthetic)",
    textBody,
    from: { name: "Avery Nguyen", email: "avery.nguyen@example.com" },
    to: [{ name: null, email: "sales@example.com" }],
    cc: [],
    attachments: [{ id: "a1", filename: "qil-synth-kitchen-island-plan.pdf", contentType: "application/pdf", sizeBytes: 2272 }]
  };
}

async function importSynthCase(repo) {
  const message = await parseEmlUpload({
    bytes: new Uint8Array(readFileSync(EML)),
    filename: "synth-kitchen-island-live-takeoff.eml",
    importActor: "tester"
  });
  const imp = await repo.confirmImport(message);
  return imp.caseId;
}

function fakeLiveWithInvalidEvidence(textBody) {
  const raw = {
    intent: "new_quote_request",
    workflowEligibility: "elite_100_candidate",
    catalogValidationState: "not_checked",
    suggestedStatus: "qil_intake_review",
    overallConfidence: 0.72,
    fields: [
      {
        key: "statedSquareFootage",
        value: 42.58,
        unknown: false,
        confidence: 0.8,
        evidence: {
          sourceType: "body",
          excerpt: "combined plan takeoff SF 42.58",
          charStart: 0,
          charEnd: 12
        }
      },
      {
        key: "requestedColorText",
        value: "Calacatta Mira",
        unknown: false,
        confidence: 0.9,
        evidence: {
          sourceType: "body",
          excerpt: "Calacatta Mira",
          charStart: 0,
          charEnd: 14
        }
      },
      {
        key: "edgeProfile",
        value: "eased",
        unknown: false,
        confidence: 0.9,
        evidence: {
          sourceType: "body",
          excerpt: "eased",
          charStart: 0,
          charEnd: 5
        }
      },
      {
        key: "sinkCutoutCount",
        value: 1,
        unknown: false,
        confidence: 0.9,
        evidence: {
          sourceType: "body",
          excerpt: "Sink cutouts: 1",
          charStart: 0,
          charEnd: 15
        }
      },
      {
        key: "customerAccount",
        value: "Example Homes LLC",
        unknown: false,
        confidence: 0.85,
        evidence: {
          sourceType: "body",
          excerpt: "Example Homes LLC",
          charStart: 0,
          charEnd: 17
        }
      },
      {
        key: "projectName",
        value: "Maple Court Kitchen",
        unknown: false,
        confidence: 0.85,
        evidence: {
          sourceType: "body",
          excerpt: "Maple Court Kitchen",
          charStart: 0,
          charEnd: 19
        }
      }
    ],
    missingInformation: [],
    warnings: [
      "Stripped provider warning that claimed pricing/takeoff/OCR/attachment inspection."
    ]
  };
  const { result, validationWarnings } = validateAndNormalizeClassificationResult(
    raw,
    baseRequestFromBody(textBody),
    {
      providerName: "LiveGeminiIntakeIntelligenceProvider",
      providerMode: "live",
      providerVersion: "live-gemini-1.0.0"
    }
  );
  return new LiveIntakeIntelligenceProvider({
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
}

describe("Phase 4B.4B.1 evidence warning field model", () => {
  it("EVIDENCE_INVALID contains fieldKey and detail fields", () => {
    const w = structureValidationWarning(
      'Field statedSquareFootage: evidence excerpt not found in body. Excerpt: "combined plan takeoff SF 42.58".'
    );
    assert.equal(w.code, "EVIDENCE_INVALID");
    assert.equal(w.severity, "blocking");
    assert.equal(w.fieldKey, "statedSquareFootage");
    assert.equal(w.fieldLabel, "Stated total square footage");
    assert.equal(w.claimedSourceType, "body");
    assert.equal(w.safeEvidenceExcerpt, "combined plan takeoff SF 42.58");
    assert.equal(w.validationFailureReason, "excerpt_not_found_in_source");
    assert.ok(w.warningId);
    assert.equal(w.resolutionState, "unresolved");
    assert.match(w.requiredResolutionAction ?? "", /Edit|Mark unknown/i);
  });

  it("blocking warning without fieldKey is contract_defect", () => {
    const w = structureValidationWarning("Ignored unsupported top-level key: pricingQuote");
    assert.equal(w.severity, "blocking");
    assert.equal(w.fieldKey, null);
    assert.equal(w.blockingState, "contract_defect");
  });

  it("WARNING UI fields are structurally separable (no code/title collapse)", () => {
    const list = structureValidationWarnings([
      'Field statedSquareFootage: evidence excerpt not found in body. Excerpt: "x".',
      "Field statedSquareFootage: evidence invalid — value marked unknown. Rejected: 42.58.",
      "Stripped provider warning that claimed pricing/takeoff/OCR/attachment inspection."
    ]);
    assert.equal(list.length, 3);
    assert.ok(list.every((w) => w.warningId && w.code && w.explanation));
    assert.ok(list[0].code !== list[0].explanation);
    assert.equal(list[2].code, "UNSUPPORTED_CLAIM_STRIPPED");
    assert.equal(list[2].severity, "informational");
  });
});

describe("Phase 4B.4B.1 human resolution + acceptance gate", () => {
  it("invalid evidence value is not trusted; confirm disabled; edit resolves", async () => {
    const store = new MemoryLabStore();
    const live = fakeLiveWithInvalidEvidence(
      `Customer: Example Homes LLC
Project: Maple Court Kitchen
Requested Elite 100 color: Calacatta Mira
Edge: eased
Sink cutouts: 1
Stated countertop SF: 39.25`
    );
    const repo = new LocalQuoteIntakeRepository({ store, asOfMode: "fixture", liveProvider: live });
    const caseId = await importSynthCase(repo);
    const out = await repo.runClassification(caseId, { providerMode: "live", actorLabel: "tester" });
    assert.equal(out.ok, true);
    const run = await repo.getClassificationRun(out.runId);

    const sfField = field(run.result, "statedSquareFootage");
    assert.equal(sfField.unknown, true);
    assert.equal(sfField.value, null);
    assert.equal(sfField.evidence, null);

    const evidenceInvalid = warningsForRun(run).filter((w) => w.code === "EVIDENCE_INVALID");
    assert.ok(evidenceInvalid.length >= 1);
    assert.ok(evidenceInvalid.every((w) => w.fieldKey));
    assert.equal(fieldHasUnresolvedInvalidEvidence(run, "statedSquareFootage"), true);
    assert.equal(hasActiveBlockingValidationWarnings(run), true);

    await assert.rejects(
      () =>
        repo.applyClassificationCorrections(caseId, out.runId, [
          { fieldKey: "statedSquareFootage", action: "confirm" }
        ]),
      (e) => e.code === "CONFIRM_FORBIDDEN_INVALID_EVIDENCE"
    );

    await assert.rejects(
      () =>
        repo.applyClassificationCorrections(caseId, out.runId, [
          { fieldKey: "statedSquareFootage", action: "edit", value: 39.25 }
        ]),
      (e) => e.code === "CORRECTION_NOTE_REQUIRED"
    );

    await repo.applyClassificationCorrections(
      caseId,
      out.runId,
      [
        {
          fieldKey: "statedSquareFootage",
          action: "edit",
          value: 39.25,
          note: "Restored stated SF from synthetic email body"
        }
      ],
      { actorLabel: "tester" }
    );

    const after = await repo.getClassificationRun(out.runId);
    assert.equal(field(after.result, "statedSquareFootage").value, 39.25);
    assert.equal(field(after.result, "statedSquareFootage").evidence.sourceType, "manual_correction");
    assert.equal(fieldHasUnresolvedInvalidEvidence(after, "statedSquareFootage"), false);
    const sfWarning = warningsForRun(after).find(
      (w) => w.code === "EVIDENCE_INVALID" && w.fieldKey === "statedSquareFootage"
    );
    assert.equal(sfWarning.resolutionState, "resolved_by_human_correction");
    assert.ok(after.warningResolutions?.length >= 1);

    // Original immutable messages still present
    assert.ok(
      structureValidationWarnings(after.validationWarnings).some(
        (w) => w.code === "EVIDENCE_INVALID" && w.fieldKey === "statedSquareFootage"
      )
    );
  });

  it("mark unknown resolves evidence warning; required missing can still block accept via remaining fields", async () => {
    const store = new MemoryLabStore();
    const live = fakeLiveWithInvalidEvidence(
      `Customer: Example Homes LLC
Project: Maple Court Kitchen
Requested Elite 100 color: Calacatta Mira
Edge: eased
Sink cutouts: 1
Stated countertop SF: 39.25`
    );
    const repo = new LocalQuoteIntakeRepository({ store, asOfMode: "fixture", liveProvider: live });
    const caseId = await importSynthCase(repo);
    const out = await repo.runClassification(caseId, { providerMode: "live", actorLabel: "tester" });

    // Resolve only SF as unknown — other invalid-evidence fields (if any) must still block,
    // and missing SF is OK when plan attachment present (present_unverified resolves total_sf).
    await repo.applyClassificationCorrections(
      caseId,
      out.runId,
      [{ fieldKey: "statedSquareFootage", action: "mark_unknown", note: "Confirmed unknown after invalid evidence" }],
      { actorLabel: "tester" }
    );
    const mid = await repo.getClassificationRun(out.runId);
    const sfW = warningsForRun(mid).find(
      (w) => w.code === "EVIDENCE_INVALID" && w.fieldKey === "statedSquareFootage"
    );
    assert.equal(sfW.resolutionState, "resolved_by_marked_unknown");

    // Resolve any remaining EVIDENCE_INVALID fields so only missing-info policy remains.
    const remaining = activeBlockingWarnings(mid).filter((w) => w.code === "EVIDENCE_INVALID");
    for (const w of remaining) {
      await repo.applyClassificationCorrections(
        caseId,
        out.runId,
        [{ fieldKey: w.fieldKey, action: "mark_unknown", note: `Marked unknown (${w.fieldKey})` }],
        { actorLabel: "tester" }
      );
    }

    // Edit required-ish color/edge/sinks so missing-info does not block unrelated optional fields
    const latest = await repo.getClassificationRun(out.runId);
    const edits = [];
    for (const key of ["requestedColorText", "edgeProfile", "sinkCutoutCount"]) {
      const f = field(latest.result, key);
      if (!f || f.unknown) {
        const value = key === "sinkCutoutCount" ? 1 : key === "edgeProfile" ? "eased" : "Calacatta Mira";
        edits.push({
          fieldKey: key,
          action: "edit",
          value,
          note: `Human supplied ${key}`
        });
      }
    }
    if (edits.length) {
      await repo.applyClassificationCorrections(caseId, out.runId, edits, { actorLabel: "tester" });
    }

    const ready = await repo.getClassificationRun(out.runId);
    assert.equal(hasActiveBlockingValidationWarnings(ready), false);
    const stripped = warningsForRun(ready).find((w) => w.code === "UNSUPPORTED_CLAIM_STRIPPED");
    assert.ok(stripped);
    assert.equal(stripped.severity, "informational");

    const accepted = await repo.acceptClassification(caseId, out.runId, { actorLabel: "tester" });
    assert.equal(accepted.ok, true);
    assert.ok(accepted.snapshot.warningResolutions?.length >= 1);
    assert.ok(accepted.snapshot.reviewedWarnings?.length >= 1);

    // History still has original blocking code on immutable list
    const frozen = await repo.getClassificationRun(out.runId);
    assert.ok(
      structureValidationWarnings(frozen.validationWarnings).some((w) => w.code === "EVIDENCE_INVALID")
    );
  });

  it("optional unknown field does not create unrelated blocker; unsupported stays informational when stripped", async () => {
    const store = new MemoryLabStore();
    const live = fakeLiveWithInvalidEvidence(
      `Customer: Example Homes LLC
Project: Maple Court Kitchen
Requested Elite 100 color: Calacatta Mira
Edge: eased
Sink cutouts: 1
Stated countertop SF: 39.25
Notes: please call later`
    );
    const repo = new LocalQuoteIntakeRepository({ store, asOfMode: "fixture", liveProvider: live });
    const caseId = await importSynthCase(repo);
    const out = await repo.runClassification(caseId, { providerMode: "live", actorLabel: "tester" });
    const run = await repo.getClassificationRun(out.runId);

    const stripped = warningsForRun(run).filter((w) => w.code === "UNSUPPORTED_CLAIM_STRIPPED");
    assert.ok(stripped.length >= 1);
    assert.ok(stripped.every((w) => w.severity === "informational"));

    // customerNotes optional — clear does not invent unrelated blockers
    await repo.applyClassificationCorrections(
      caseId,
      out.runId,
      [{ fieldKey: "customerNotes", action: "clear", note: "Optional notes cleared" }],
      { actorLabel: "tester" }
    );
    const after = await repo.getClassificationRun(out.runId);
    const missing = after.result.missingInformation ?? [];
    assert.ok(!missing.some((m) => m.key === "customerNotes" && m.severity === "quote_blocking"));
  });

  it("acceptance remains blocked until every EVIDENCE_INVALID field is resolved", async () => {
    const store = new MemoryLabStore();
    const live = fakeLiveWithInvalidEvidence(
      `Customer: Example Homes LLC
Project: Maple Court Kitchen
Requested Elite 100 color: Calacatta Mira
Edge: eased
Sink cutouts: 1
Stated countertop SF: 39.25`
    );
    const repo = new LocalQuoteIntakeRepository({ store, asOfMode: "fixture", liveProvider: live });
    const caseId = await importSynthCase(repo);
    const out = await repo.runClassification(caseId, { providerMode: "live", actorLabel: "tester" });

    await assert.rejects(
      () => repo.acceptClassification(caseId, out.runId, { actorLabel: "tester" }),
      (e) => e.code === "BLOCKING_VALIDATION_WARNINGS"
    );

    // Correct wrong field only — still blocked if other EVIDENCE_INVALID remain
    await repo.applyClassificationCorrections(
      caseId,
      out.runId,
      [
        {
          fieldKey: "statedSquareFootage",
          action: "edit",
          value: 39.25,
          note: "SF from email"
        }
      ],
      { actorLabel: "tester" }
    );
    const mid = await repo.getClassificationRun(out.runId);
    if (activeBlockingWarnings(mid).length) {
      await assert.rejects(
        () => repo.acceptClassification(caseId, out.runId, { actorLabel: "tester" }),
        (e) => e.code === "BLOCKING_VALIDATION_WARNINGS"
      );
    }
  });
});
