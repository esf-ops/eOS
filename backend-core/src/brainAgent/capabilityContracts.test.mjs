/**
 * Capability contract usability — schemas, validation recovery, multi-hop without workflows.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_INPUT_SCHEMAS,
  getCapabilityInputSchema,
  capabilityToOpenAiTool,
  capabilityNameFromOpenAiTool,
  openAiToolName,
  schemaForObservation,
} from "./capabilitySchemas.mjs";
import {
  listCapabilityNames,
  listCapabilities,
  getCapability,
  registerCapability,
  _resetCapabilityRegistryForTests,
} from "./capabilityRegistry.mjs";
import { registerFoundationCapabilities } from "./capabilities/registerFoundation.mjs";
import { ensureFoundationCapabilities, executeCapability, _resetBrainAgentGatewayForTests } from "./gateway.mjs";
import { runBrainAgent, sanitizeToolInputForDebug } from "./agentRuntime.mjs";
import { createScriptedModelDriver } from "./modelDriver.mjs";
import { makeEvidence } from "./evidence.mjs";
import { ANSWER_STATES } from "./answerStates.mjs";

const FOUNDATION = [
  "brain.search_entities",
  "brain.get_entity",
  "brain.get_related_records",
  "brain.get_account_360",
  "brain.get_quote_360",
  "brain.search_inventory",
  "brain.search_company_knowledge",
  "brain.query_metric",
  "brain.evaluate_rectangular_fit",
];

function reset() {
  _resetCapabilityRegistryForTests();
  _resetBrainAgentGatewayForTests();
  registerFoundationCapabilities();
  ensureFoundationCapabilities();
}

describe("Capability input schemas (model-native contracts)", () => {
  it("every foundation capability has a JSON Schema with required/enums", () => {
    reset();
    for (const name of FOUNDATION) {
      const schema = getCapabilityInputSchema(name);
      assert.ok(schema, `missing schema for ${name}`);
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
      assert.ok(Array.isArray(schema.required) && schema.required.length > 0, `${name} needs required`);
      const cap = getCapability(name);
      assert.ok(cap?.inputSchema, `${name} registry missing inputSchema`);
      assert.deepEqual(cap.inputSchema.$id || name, schema.$id || name);
    }
  });

  it("listCapabilities exposes inputSchema to the model surface", () => {
    reset();
    const listed = listCapabilities();
    for (const name of FOUNDATION) {
      const row = listed.find((c) => c.name === name);
      assert.ok(row?.inputSchema?.properties, `${name} not listed with schema`);
    }
  });

  it("get_related_records contract requires relation=jobs and accountId", () => {
    const schema = CAPABILITY_INPUT_SCHEMAS["brain.get_related_records"];
    assert.deepEqual(schema.required, ["relation", "accountId"]);
    assert.deepEqual(schema.properties.relation.enum, ["jobs"]);
  });

  it("query_metric contract documents quote_count / account / period enums", () => {
    const schema = CAPABILITY_INPUT_SCHEMAS["brain.query_metric"];
    assert.deepEqual(schema.properties.metric.enum, ["quote_count"]);
    assert.deepEqual(schema.properties.dimension.enum, ["account"]);
    assert.ok(schema.properties.period.enum.includes("quarter"));
  });

  it("OpenAI tool name round-trips with underscores under brain prefix", () => {
    assert.equal(openAiToolName("brain.search_entities"), "brain_search_entities");
    assert.equal(capabilityNameFromOpenAiTool("brain_search_entities"), "brain.search_entities");
    assert.equal(capabilityNameFromOpenAiTool("brain_get_related_records"), "brain.get_related_records");
    const tool = capabilityToOpenAiTool({
      name: "brain.get_related_records",
      description: "jobs",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.get_related_records"],
    });
    assert.equal(tool.function.name, "brain_get_related_records");
    assert.deepEqual(tool.function.parameters.required, ["relation", "accountId"]);
  });
});

describe("Schema ↔ server validation alignment", () => {
  it("invalid get_related_records calls are blocked with expectedInputSchema", async () => {
    reset();
    const ctx = {
      db: {},
      getSupabase: () => ({}),
      user: { id: "u1", role: "admin" },
      organizationId: "00000000-0000-4000-8000-000000000099",
      async requireHead() {
        return { ok: true };
      },
    };

    const missingRelation = await executeCapability({
      name: "brain.get_related_records",
      input: { accountId: "11111111-1111-4111-8111-111111111111" },
      ctx,
    });
    assert.equal(missingRelation.ok, false);
    assert.equal(missingRelation.code, "VALIDATION_ERROR");
    assert.ok(missingRelation.expectedInputSchema);
    assert.deepEqual(missingRelation.expectedInputSchema.required, ["relation", "accountId"]);

    const badRelation = await executeCapability({
      name: "brain.get_related_records",
      input: { relation: "quotes", accountId: "11111111-1111-4111-8111-111111111111" },
      ctx,
    });
    assert.equal(badRelation.code, "VALIDATION_ERROR");

    const missingAccount = await executeCapability({
      name: "brain.get_related_records",
      input: { relation: "jobs" },
      ctx,
    });
    assert.equal(missingAccount.code, "VALIDATION_ERROR");
    assert.match(missingAccount.error, /accountId/i);
  });

  it("valid get_related_records input passes validateInput (execute may still need DB)", async () => {
    reset();
    const cap = getCapability("brain.get_related_records");
    const v = cap.validateInput({
      relation: "jobs",
      accountId: "11111111-1111-4111-8111-111111111111",
      limit: 5,
    });
    assert.equal(v.ok, true);
  });

  it("query_metric validateInput accepts foundation contract", () => {
    reset();
    const cap = getCapability("brain.query_metric");
    assert.equal(
      cap.validateInput({ metric: "quote_count", dimension: "account", period: "quarter", order: "desc", limit: 5 })
        .ok,
      true
    );
    assert.equal(cap.validateInput({ metric: "revenue", dimension: "account" }).code, "CAPABILITY_UNAVAILABLE");
  });
});

describe("Validation recovery loop (model corrects bad tool call)", () => {
  it("malformed get_related_records → VALIDATION_ERROR observation → corrected call succeeds", async () => {
    reset();
    registerCapability({
      name: "brain.get_related_records",
      description: "test jobs",
      domain: "job",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.get_related_records"],
      validateInput: (input) => {
        if (String(input?.relation || "") !== "jobs") {
          return { ok: false, error: 'relation must be "jobs"', code: "VALIDATION_ERROR" };
        }
        if (!String(input?.accountId || "").trim()) {
          return { ok: false, error: "accountId is required", code: "VALIDATION_ERROR" };
        }
        return { ok: true };
      },
      async execute(input) {
        const ev = makeEvidence({
          sourceDomain: "job",
          sourceSystem: "test",
          entityType: "job",
          entityId: "job-1",
          authoritative: true,
          data: { jobId: "job-1", accountId: input.accountId, status: "active" },
        });
        return { ok: true, items: [{ jobId: "job-1", status: "active" }], evidence: [ev] };
      },
    });

    const accountId = "11111111-1111-4111-8111-111111111111";
    const driver = createScriptedModelDriver([
      // Intentionally malformed — missing relation (production failure mode)
      {
        type: "call_tool",
        capability: "brain.get_related_records",
        input: { accountId },
      },
      // Model reads expectedInputSchema from observation and corrects
      (ctx) => {
        const obs = ctx.lastObservation;
        assert.equal(obs?.code, "VALIDATION_ERROR");
        assert.ok(obs?.expectedInputSchema);
        return {
          type: "call_tool",
          capability: "brain.get_related_records",
          input: { relation: "jobs", accountId },
        };
      },
      (ctx) => {
        const evId = ctx.evidenceSnapshot?.[0]?.evidenceId;
        assert.ok(evId);
        return {
          type: "final_answer",
          answer: `Active jobs retrieved for account [${evId}].`,
          citedEvidenceIds: [evId],
        };
      },
    ]);

    const result = await runBrainAgent({
      message: "what active jobs do we have for them?",
      context: {},
      gatewayCtx: {
        db: {},
        getSupabase: () => ({}),
        user: { id: "u1", role: "admin" },
        organizationId: "00000000-0000-4000-8000-000000000099",
        async requireHead() {
          return { ok: true };
        },
      },
      modelDriver: driver,
      debug: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.answerState, ANSWER_STATES.SUPPORTED);
    assert.equal(result.toolCalls, 2);
    assert.ok(result.toolTrace?.some((t) => t.code === "VALIDATION_ERROR" && t.validationError));
    assert.ok(result.toolTrace?.some((t) => t.ok === true && t.capability === "brain.get_related_records"));
  });
});

describe("Multi-hop metric → related jobs (scripted model path; not app workflow)", () => {
  it("uses accountId from query_metric evidence for get_related_records", async () => {
    reset();
    const topAccountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    registerCapability({
      name: "brain.query_metric",
      description: "test metric",
      domain: "quote",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.query_metric"],
      validateInput: () => ({ ok: true }),
      async execute() {
        const rows = [
          { accountId: topAccountId, quoteCount: 12, sampleCustomerName: "Top Builder" },
          { accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quoteCount: 3, sampleCustomerName: "Other" },
        ];
        const ev = makeEvidence({
          sourceDomain: "quote",
          sourceSystem: "test",
          entityType: "metric",
          entityId: "quote_count_by_account",
          authoritative: true,
          data: { metric: "quote_count", dimension: "account", period: "quarter", rows },
        });
        return {
          ok: true,
          metric: "quote_count",
          dimension: "account",
          period: "quarter",
          rows,
          evidence: [ev],
        };
      },
    });

    registerCapability({
      name: "brain.get_related_records",
      description: "test jobs",
      domain: "job",
      mode: "read",
      requiredHead: null,
      sensitivity: "medium",
      authoritativeSource: "test",
      inputSchema: CAPABILITY_INPUT_SCHEMAS["brain.get_related_records"],
      validateInput: (input) => {
        if (input?.relation !== "jobs" || !input?.accountId) {
          return { ok: false, error: "bad", code: "VALIDATION_ERROR" };
        }
        return { ok: true };
      },
      async execute(input) {
        assert.equal(input.accountId, topAccountId);
        assert.equal(input.relation, "jobs");
        const ev = makeEvidence({
          sourceDomain: "job",
          sourceSystem: "test",
          entityType: "job",
          entityId: "job-9",
          authoritative: true,
          data: { jobId: "job-9", accountId: input.accountId, label: "Job 9" },
        });
        return { ok: true, items: [{ jobId: "job-9", status: "active" }], evidence: [ev] };
      },
    });

    const driver = createScriptedModelDriver([
      {
        type: "call_tool",
        capability: "brain.query_metric",
        input: {
          metric: "quote_count",
          dimension: "account",
          period: "quarter",
          order: "desc",
          limit: 5,
        },
      },
      (ctx) => {
        const rows = ctx.lastObservation?.rows;
        assert.ok(Array.isArray(rows) && rows[0]?.accountId === topAccountId);
        assert.ok(ctx.lastObservation?.metricAccountIds?.includes(topAccountId));
        // Evidence data also retains accountId for the model
        const metricEv = ctx.evidenceSnapshot?.[0];
        assert.ok(metricEv?.data?.rows?.[0]?.accountId === topAccountId);
        return {
          type: "call_tool",
          capability: "brain.get_related_records",
          input: { relation: "jobs", accountId: rows[0].accountId },
        };
      },
      (ctx) => {
        const jobEv = ctx.evidenceSnapshot?.find((e) => e.entityType === "job");
        const metricEv = ctx.evidenceSnapshot?.find((e) => e.entityType === "metric");
        return {
          type: "final_answer",
          answer: `Top Builder leads quoting this quarter [${metricEv.evidenceId}] with active job Job 9 [${jobEv.evidenceId}].`,
          citedEvidenceIds: [metricEv.evidenceId, jobEv.evidenceId],
        };
      },
    ]);

    const result = await runBrainAgent({
      message:
        "Which account has had the most quoting activity this quarter, and what active jobs do we have for them?",
      context: {},
      gatewayCtx: {
        db: {},
        getSupabase: () => ({}),
        user: { id: "u1", role: "admin" },
        organizationId: "00000000-0000-4000-8000-000000000099",
        async requireHead() {
          return { ok: true };
        },
      },
      modelDriver: driver,
      debug: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.answerState, ANSWER_STATES.SUPPORTED);
    assert.equal(result.toolCalls, 2);
    assert.match(result.answer, /Top Builder/);
    // Per-call duration (not cumulative from agent start for first call alone — both should be finite small)
    assert.ok(result.toolTrace.every((t) => typeof t.durationMs === "number" && t.durationMs >= 0));
    assert.ok(result.toolTrace.every((t) => t.input && typeof t.modelStep === "number"));
    assert.equal(result.providerMeta?.toolCallingMode, "scripted");
  });
});

describe("Debug sanitization", () => {
  it("redacts secret-like keys from tool input", () => {
    const clean = sanitizeToolInputForDebug({
      accountId: "a1",
      relation: "jobs",
      access_token: "super-secret",
      nested: { password: "x", ok: true },
    });
    assert.equal(clean.accountId, "a1");
    assert.equal(clean.access_token, "[redacted]");
    assert.equal(clean.nested.password, "[redacted]");
    assert.equal(clean.nested.ok, true);
  });

  it("schemaForObservation is a safe clone", () => {
    const a = schemaForObservation("brain.get_related_records");
    a.required.push("hack");
    const b = schemaForObservation("brain.get_related_records");
    assert.deepEqual(b.required, ["relation", "accountId"]);
  });
});

describe("Permitted tools only", () => {
  it("registry names match foundation set", () => {
    reset();
    const names = listCapabilityNames().sort();
    assert.deepEqual(names.sort(), [...FOUNDATION].sort());
  });
});
