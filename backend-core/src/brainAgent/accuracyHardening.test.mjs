/**
 * Accuracy hardening — rectangular fit, duplicate-call protection, partial answers.
 * No deterministic business workflows; scripted model paths only for tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateOneRectangularFit,
  evaluateRectangularFitBatch,
  RECTANGULAR_FIT_DISCLAIMER,
} from "./capabilities/rectangularFit.mjs";
import { CAPABILITY_INPUT_SCHEMAS } from "./capabilitySchemas.mjs";
import {
  registerCapability,
  listCapabilityNames,
  _resetCapabilityRegistryForTests,
} from "./capabilityRegistry.mjs";
import { registerFoundationCapabilities } from "./capabilities/registerFoundation.mjs";
import { ensureFoundationCapabilities, _resetBrainAgentGatewayForTests } from "./gateway.mjs";
import { runBrainAgent, normalizeToolCallKey } from "./agentRuntime.mjs";
import { createScriptedModelDriver } from "./modelDriver.mjs";
import { makeEvidence } from "./evidence.mjs";
import { ANSWER_STATES } from "./answerStates.mjs";
import { validateAnswerAgainstEvidence } from "./answerValidation.mjs";

function reset() {
  _resetCapabilityRegistryForTests();
  _resetBrainAgentGatewayForTests();
  registerFoundationCapabilities();
  ensureFoundationCapabilities();
}

const gatewayCtx = {
  db: {},
  getSupabase: () => ({}),
  user: { id: "u1", role: "admin" },
  organizationId: "00000000-0000-4000-8000-000000000099",
  async requireHead() {
    return { ok: true };
  },
};

describe("1 — Rectangular fit (Taj Mahal / 48×22 vanity regression)", () => {
  const req = { requiredLength: 48, requiredWidth: 22, allowRotation: true };

  const cases = [
    { id: "a", length: 28.53, width: 66.89, expect: true },
    { id: "b", length: 24.22, width: 65.12, expect: true },
    { id: "c", length: 23.25, width: 30.04, expect: false },
    { id: "d", length: 52.29, width: 51.46, expect: true },
    { id: "e", length: 10.94, width: 57.61, expect: false },
  ];

  it("matches expected fit outcomes including 52.29×51.46", () => {
    for (const c of cases) {
      const r = evaluateOneRectangularFit({
        ...req,
        availableLength: c.length,
        availableWidth: c.width,
      });
      assert.equal(r.fits, c.expect, `${c.id} ${c.length}x${c.width} expected fits=${c.expect}`);
    }
    // Explicit: 28.53×66.89 fits via rotation
    const rotated = evaluateOneRectangularFit({
      ...req,
      availableLength: 28.53,
      availableWidth: 66.89,
    });
    assert.equal(rotated.fits, true);
    assert.equal(rotated.orientation, "rotated");
  });

  it("batch returns authoritative evidence with disclaimer", () => {
    const batch = evaluateRectangularFitBatch({
      ...req,
      candidates: cases.map((c) => ({ id: c.id, length: c.length, width: c.width })),
    });
    assert.equal(batch.ok, true);
    assert.equal(batch.fitsCount, 3);
    assert.match(batch.disclaimer, /Dimensional fit only/);
    assert.equal(batch.evidence?.[0]?.authoritative, true);
    assert.ok(batch.results.find((r) => r.id === "d" && r.fits === true));
    assert.ok(RECTANGULAR_FIT_DISCLAIMER.length > 20);
  });

  it("capability schema is registered", () => {
    reset();
    assert.ok(listCapabilityNames().includes("brain.evaluate_rectangular_fit"));
    assert.deepEqual(CAPABILITY_INPUT_SCHEMAS["brain.evaluate_rectangular_fit"].required, [
      "requiredLength",
      "requiredWidth",
      "candidates",
    ]);
  });
});

describe("2 — Model chooses fit after inventory (scripted; not runtime workflow)", () => {
  it("inventory → evaluate_rectangular_fit → grounded answer", async () => {
    reset();
    registerCapability({
      name: "brain.search_inventory",
      description: "test inventory",
      domain: "inventory",
      mode: "read",
      requiredHead: null,
      sensitivity: "low",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.search_inventory"],
      validateInput: () => ({ ok: true }),
      async execute() {
        const items = [
          { materialId: "m1", lengthIn: 28.53, widthIn: 66.89, colorName: "Taj Mahal" },
          { materialId: "m2", lengthIn: 52.29, widthIn: 51.46, colorName: "Taj Mahal" },
          { materialId: "m3", lengthIn: 10.94, widthIn: 57.61, colorName: "Taj Mahal" },
        ];
        const evidence = items.map((item) =>
          makeEvidence({
            sourceDomain: "inventory",
            sourceSystem: "test",
            entityType: "material",
            entityId: item.materialId,
            authoritative: true,
            data: item,
          })
        );
        return { ok: true, items, evidence };
      },
    });

    const driver = createScriptedModelDriver([
      {
        type: "call_tool",
        capability: "brain.search_inventory",
        input: { query: "Taj Mahal" },
      },
      (ctx) => {
        const items = ctx.lastObservation?.items || [];
        assert.ok(items.length >= 3);
        return {
          type: "call_tool",
          capability: "brain.evaluate_rectangular_fit",
          input: {
            requiredLength: 48,
            requiredWidth: 22,
            allowRotation: true,
            candidates: items.map((i) => ({
              id: i.materialId,
              length: i.lengthIn,
              width: i.widthIn,
            })),
          },
        };
      },
      (ctx) => {
        const fitEv = ctx.evidenceSnapshot?.find((e) => e.entityType === "rectangular_fit");
        assert.ok(fitEv);
        assert.equal(fitEv.data.fitsCount, 2);
        return {
          type: "final_answer",
          answer: `Two Taj Mahal remnants dimensionally fit a 48×22 vanity [${fitEv.evidenceId}]. ${fitEv.data.disclaimer}`,
          citedEvidenceIds: [fitEv.evidenceId],
        };
      },
    ]);

    const result = await runBrainAgent({
      message: "Do we have any Taj Mahal that could work for a 48 x 22 vanity?",
      context: {},
      gatewayCtx,
      modelDriver: driver,
      debug: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.answerState, ANSWER_STATES.SUPPORTED);
    assert.equal(result.toolCalls, 2);
    assert.match(result.answer, /Two Taj Mahal/);
  });
});

describe("3 — Duplicate identical tool calls are not re-executed", () => {
  it("second identical call returns DUPLICATE_TOOL_CALL without burning budget", async () => {
    reset();
    let executions = 0;
    registerCapability({
      name: "brain.search_entities",
      description: "test",
      domain: "cross",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.search_entities"],
      validateInput: () => ({ ok: true }),
      async execute() {
        executions += 1;
        const ev = makeEvidence({
          sourceDomain: "account",
          sourceSystem: "test",
          entityType: "account",
          entityId: "a1",
          authoritative: true,
          data: { accountId: "a1", accountName: "Garman Built" },
        });
        return { ok: true, items: [{ accountId: "a1", accountName: "Garman Built" }], evidence: [ev] };
      },
    });

    const sameCall = {
      type: "call_tool",
      capability: "brain.search_entities",
      input: { entityType: "account", query: "Garman Built" },
    };

    const driver = createScriptedModelDriver([
      sameCall,
      sameCall, // identical
      (ctx) => {
        assert.equal(ctx.lastObservation?.code, "DUPLICATE_TOOL_CALL");
        const evId = ctx.evidenceSnapshot?.[0]?.evidenceId;
        return {
          type: "final_answer",
          answer: `Garman Built found [${evId}].`,
          citedEvidenceIds: [evId],
        };
      },
    ]);

    const result = await runBrainAgent({
      message: "Pull up Garman Built",
      context: {},
      gatewayCtx,
      modelDriver: driver,
      debug: true,
    });
    assert.equal(executions, 1);
    assert.equal(result.toolCalls, 1); // duplicate did not increment
    assert.ok(result.toolTrace?.some((t) => t.code === "DUPLICATE_TOOL_CALL" && t.skipped));
    assert.equal(result.ok, true);
  });

  it("normalizeToolCallKey is order-stable", () => {
    const a = normalizeToolCallKey("brain.query_metric", { metric: "quote_count", dimension: "account", period: "quarter" });
    const b = normalizeToolCallKey("brain.query_metric", { period: "quarter", dimension: "account", metric: "quote_count" });
    assert.equal(a, b);
  });
});

describe("4 — Partial evidence prefers PARTIALLY_SUPPORTED over empty exhaustion", () => {
  it("tool budget exhaustion with account evidence → PARTIALLY_SUPPORTED", async () => {
    reset();
    registerCapability({
      name: "brain.search_entities",
      description: "test",
      domain: "cross",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.search_entities"],
      validateInput: () => ({ ok: true }),
      async execute(input) {
        const ev = makeEvidence({
          sourceDomain: "account",
          sourceSystem: "test",
          entityType: "account",
          entityId: "g1",
          authoritative: true,
          data: { accountId: "g1", accountName: "Garman Built", query: input.query },
        });
        return { ok: true, items: [{ accountId: "g1", accountName: "Garman Built" }], evidence: [ev] };
      },
    });

    // Burn budget with distinct (non-duplicate) calls then no final answer
    const steps = [];
    for (let i = 0; i < 8; i++) {
      steps.push({
        type: "call_tool",
        capability: "brain.search_entities",
        input: { entityType: "account", query: `Garman Built variant ${i}` },
      });
    }
    // 9th attempt after budget → partial stop
    steps.push({
      type: "call_tool",
      capability: "brain.search_entities",
      input: { entityType: "account", query: "should not execute" },
    });

    const result = await runBrainAgent({
      message: "What's going on with Garman Built right now, and is there anything I should be concerned about?",
      context: {},
      gatewayCtx,
      modelDriver: createScriptedModelDriver(steps),
      debug: true,
      maxToolCalls: 8,
    });

    assert.equal(result.answerState, ANSWER_STATES.PARTIALLY_SUPPORTED);
    assert.equal(result.toolCalls, 8);
    assert.equal(result.debugStop?.stopReason, "tool_budget_exhausted");
    assert.ok(result.debugStop?.evidenceDomains?.includes("account"));
    assert.match(result.answer, /partial|limit|evidence/i);
  });

  it("model may explicitly return PARTIALLY_SUPPORTED final_answer", async () => {
    reset();
    const ev = makeEvidence({
      sourceDomain: "job",
      sourceSystem: "test",
      entityType: "job",
      entityId: "j1",
      authoritative: true,
      data: { jobId: "j1", accountId: "g1" },
    });
    registerCapability({
      name: "brain.get_related_records",
      description: "test",
      domain: "job",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.get_related_records"],
      validateInput: () => ({ ok: true }),
      async execute() {
        return { ok: true, items: [{ jobId: "j1" }], evidence: [ev] };
      },
    });

    const driver = createScriptedModelDriver([
      {
        type: "call_tool",
        capability: "brain.get_related_records",
        input: { relation: "jobs", accountId: "g1" },
      },
      (ctx) => ({
        type: "final_answer",
        answerState: ANSWER_STATES.PARTIALLY_SUPPORTED,
        answer: `Garman Built has active job j1 [${ctx.evidenceSnapshot[0].evidenceId}]. eliteOS does not currently expose a concern score, so I cannot reliably determine whether anything else requires concern.`,
        citedEvidenceIds: [ctx.evidenceSnapshot[0].evidenceId],
      }),
    ]);

    const result = await runBrainAgent({
      message: "What's going on with Garman Built?",
      context: {},
      gatewayCtx,
      modelDriver: driver,
    });
    assert.equal(result.ok, true);
    assert.equal(result.answerState, ANSWER_STATES.PARTIALLY_SUPPORTED);
  });
});

describe("5 — Unsupported derived claims remain blocked", () => {
  it("final_answer inventing fit without computation evidence is blocked", async () => {
    const result = await runBrainAgent({
      message: "which slab fits",
      context: {},
      gatewayCtx,
      modelDriver: createScriptedModelDriver([
        {
          type: "final_answer",
          answer: "Only the first two slabs fit a 48x22 vanity.",
          citedEvidenceIds: [],
        },
      ]),
    });
    assert.equal(result.ok, false);
    assert.equal(result.blockedUnsupportedClaim, true);
  });

  it("validateAnswerAgainstEvidence still rejects fabricated evidence ids", () => {
    const ev = makeEvidence({
      sourceDomain: "computation",
      sourceSystem: "test",
      entityType: "rectangular_fit",
      authoritative: true,
      data: { fitsCount: 1 },
    });
    const v = validateAnswerAgainstEvidence({
      answerText: "Fits [ev_deadbeefdeadbeef]",
      evidenceBag: [ev],
      requiresAuthoritative: true,
    });
    assert.equal(v.ok, false);
    assert.equal(v.code, "FABRICATED_EVIDENCE");
  });
});

describe("6 — Quote-metric → related-jobs multi-hop still passes", () => {
  it("unchanged happy path", async () => {
    reset();
    const topAccountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    registerCapability({
      name: "brain.query_metric",
      description: "test",
      domain: "quote",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.query_metric"],
      validateInput: () => ({ ok: true }),
      async execute() {
        const rows = [{ accountId: topAccountId, quoteCount: 12, sampleCustomerName: "Top Builder" }];
        const ev = makeEvidence({
          sourceDomain: "quote",
          sourceSystem: "test",
          entityType: "metric",
          entityId: "quote_count_by_account",
          authoritative: true,
          data: { metric: "quote_count", rows },
        });
        return { ok: true, metric: "quote_count", rows, evidence: [ev] };
      },
    });
    registerCapability({
      name: "brain.get_related_records",
      description: "test",
      domain: "job",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.get_related_records"],
      validateInput: (input) =>
        input?.relation === "jobs" && input?.accountId
          ? { ok: true }
          : { ok: false, code: "VALIDATION_ERROR", error: "bad" },
      async execute(input) {
        assert.equal(input.accountId, topAccountId);
        const ev = makeEvidence({
          sourceDomain: "job",
          sourceSystem: "test",
          entityType: "job",
          entityId: "job-9",
          authoritative: true,
          data: { jobId: "job-9", accountId: input.accountId },
        });
        return { ok: true, items: [{ jobId: "job-9" }], evidence: [ev] };
      },
    });

    const driver = createScriptedModelDriver([
      {
        type: "call_tool",
        capability: "brain.query_metric",
        input: { metric: "quote_count", dimension: "account", period: "quarter", order: "desc", limit: 5 },
      },
      (ctx) => ({
        type: "call_tool",
        capability: "brain.get_related_records",
        input: { relation: "jobs", accountId: ctx.lastObservation.rows[0].accountId },
      }),
      (ctx) => {
        const metricEv = ctx.evidenceSnapshot.find((e) => e.entityType === "metric");
        const jobEv = ctx.evidenceSnapshot.find((e) => e.entityType === "job");
        return {
          type: "final_answer",
          answer: `Top Builder [${metricEv.evidenceId}] job [${jobEv.evidenceId}]`,
          citedEvidenceIds: [metricEv.evidenceId, jobEv.evidenceId],
        };
      },
    ]);

    const result = await runBrainAgent({
      message:
        "Which account has had the most quoting activity this quarter, and what active jobs do we have for them?",
      context: {},
      gatewayCtx,
      modelDriver: driver,
    });
    assert.equal(result.ok, true);
    assert.equal(result.answerState, ANSWER_STATES.SUPPORTED);
    assert.equal(result.toolCalls, 2);
  });
});
