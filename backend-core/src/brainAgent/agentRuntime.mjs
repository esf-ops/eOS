/**
 * Brain Agent runtime — true iterative investigation loop.
 *
 * MODEL → TOOL → OBSERVATION → MODEL → … → EVIDENCE-GROUNDED ANSWER
 *
 * Deterministic application code ONLY:
 * - auth / org / head permission (gateway)
 * - capability allowlist enforcement
 * - input/schema validation
 * - limits / timeouts
 * - evidence provenance + factual support checking
 *
 * The MODEL decides intent, investigation path, tool choice, and when to answer.
 * There is NO regex intent router and NO hard-coded business workflow library.
 */

import { executeCapability, listPermittedCapabilities, ensureFoundationCapabilities } from "./gateway.mjs";
import { validateAnswerAgainstEvidence, scrubKnowledgeAsData } from "./answerValidation.mjs";
import { ANSWER_STATES, userMessageForState } from "./answerStates.mjs";
import { evidenceForModel } from "./evidence.mjs";
import { createLiveModelDriver, validateModelStep } from "./modelDriver.mjs";
import { getCapability } from "./capabilityRegistry.mjs";
import { schemaForObservation } from "./capabilitySchemas.mjs";

export const AGENT_LIMITS = Object.freeze({
  maxToolCalls: 8,
  maxModelSteps: 12,
  timeoutMs: 45_000,
  maxRowsPerCall: 25,
});

/** Strip secrets / oversized values from tool inputs for admin debug. */
export function sanitizeToolInputForDebug(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const key = String(k);
    if (/password|token|secret|authorization|service_role|api[_-]?key/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof v === "string") {
      out[key] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
    } else if (typeof v === "number" || typeof v === "boolean" || v == null) {
      out[key] = v;
    } else if (Array.isArray(v)) {
      out[key] = v.slice(0, 20);
    } else if (typeof v === "object") {
      out[key] = sanitizeToolInputForDebug(v);
    } else {
      out[key] = String(v).slice(0, 80);
    }
  }
  return out;
}

function observationForModel(result) {
  if (!result) return { ok: false, error: "No result" };
  const {
    ok,
    error,
    code,
    answerState,
    items,
    ambiguous,
    entity,
    account,
    quote,
    recentJobs,
    passages,
    rows,
    metric,
    period,
    dimension,
    truncated,
    truncatedScan,
    evidenceForModel: efm,
    evidence,
    capability,
    expectedInputSchema,
  } = result;

  // Surface authoritative accountIds from metric rankings for follow-up tool calls
  const metricAccountIds = Array.isArray(rows)
    ? rows
        .map((r) => (r && r.accountId ? String(r.accountId) : null))
        .filter(Boolean)
        .slice(0, AGENT_LIMITS.maxRowsPerCall)
    : undefined;

  return {
    ok: Boolean(ok),
    error: error || null,
    code: code || null,
    answerState: answerState || null,
    capability: capability || null,
    expectedInputSchema: expectedInputSchema || null,
    ambiguous: Boolean(ambiguous),
    truncated: Boolean(truncated || truncatedScan),
    metric: metric || null,
    dimension: dimension || null,
    period: period || null,
    itemCount: Array.isArray(items) ? items.length : undefined,
    items: Array.isArray(items) ? items.slice(0, AGENT_LIMITS.maxRowsPerCall) : undefined,
    entity: entity || account || quote || undefined,
    recentJobs: recentJobs ? recentJobs.slice(0, 10) : undefined,
    passages: passages
      ? passages.slice(0, 5).map((p) => ({
          id: p.id,
          locator: p.locator,
          title: p.source?.title,
          text: scrubKnowledgeAsData(String(p.text || "").slice(0, 800)),
        }))
      : undefined,
    rows: rows ? rows.slice(0, AGENT_LIMITS.maxRowsPerCall) : undefined,
    metricAccountIds,
    evidence: (efm || (evidence || []).map(evidenceForModel) || []).slice(0, 40),
  };
}

/**
 * Run a read-only investigation driven by the model.
 *
 * @param {object} args
 * @param {object} [args.modelDriver] — injectable; defaults to live LLM driver
 */
export async function runBrainAgent({
  message,
  context = {},
  gatewayCtx,
  modelDriver = null,
  maxToolCalls = AGENT_LIMITS.maxToolCalls,
  debug = false,
}) {
  ensureFoundationCapabilities();
  const started = Date.now();
  const toolTrace = [];
  const evidenceBag = [];
  const history = [];

  const permitted = await listPermittedCapabilities({ db: gatewayCtx.db, user: gatewayCtx.user });
  const permittedNames = new Set(permitted.map((p) => p.name));
  const driver = modelDriver || createLiveModelDriver();

  let toolCalls = 0;
  let modelSteps = 0;
  let lastProviderMeta = {
    toolCallingMode: driver.kind === "scripted" ? "scripted" : null,
    provider: null,
    model: null,
  };

  while (modelSteps < AGENT_LIMITS.maxModelSteps) {
    if (Date.now() - started > AGENT_LIMITS.timeoutMs) {
      return finishAbstain({
        state: ANSWER_STATES.CAPABILITY_UNAVAILABLE,
        message: "Investigation timed out before enough evidence was gathered.",
        evidenceBag,
        toolCalls,
        modelSteps,
        toolTrace,
        debug,
        started,
        permittedNames,
        lastProviderMeta,
      });
    }

    modelSteps += 1;
    const lastObservation = [...history].reverse().find((h) => h.role === "observation") || null;
    const decision = await driver.nextStep({
      message,
      context,
      permittedCapabilities: permitted,
      permittedNames,
      history,
      evidenceSnapshot: evidenceBag.map(evidenceForModel),
      lastObservation: lastObservation?.observation || null,
    });

    if (decision?.toolCallingMode || decision?.provider || decision?.model) {
      lastProviderMeta = {
        toolCallingMode: decision.toolCallingMode || lastProviderMeta.toolCallingMode,
        provider: decision.provider ?? lastProviderMeta.provider,
        model: decision.model ?? lastProviderMeta.model,
      };
    }

    const step = decision?.step;
    const checked = validateModelStep(step, permittedNames);
    if (!checked.ok) {
      return finishAbstain({
        state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        message: "The planner produced an invalid step. I will not invent a workflow.",
        evidenceBag,
        toolCalls,
        modelSteps,
        toolTrace,
        debug,
        started,
        permittedNames,
        lastProviderMeta,
        extra: { validationError: checked.error },
      });
    }

    const action = checked.step;

    if (action.type === "abstain") {
      const state = action.state || ANSWER_STATES.INSUFFICIENT_EVIDENCE;
      return {
        ok: true,
        answerState: state,
        answer: userMessageForState(state, action.message),
        evidence: evidenceBag.map(evidenceForModel),
        toolCalls,
        modelSteps,
        toolTrace: debug ? toolTrace : undefined,
        validation: { ok: true, state },
        durationMs: Date.now() - started,
        planner: driver.kind,
        providerMeta: debug ? lastProviderMeta : undefined,
        permittedCapabilities: [...permittedNames],
      };
    }

    if (action.type === "clarify") {
      return {
        ok: true,
        answerState: ANSWER_STATES.AMBIGUOUS_ENTITY,
        answer: action.message || userMessageForState(ANSWER_STATES.AMBIGUOUS_ENTITY),
        options: action.options,
        evidence: evidenceBag.map(evidenceForModel),
        toolCalls,
        modelSteps,
        toolTrace: debug ? toolTrace : undefined,
        validation: { ok: true, state: ANSWER_STATES.AMBIGUOUS_ENTITY },
        durationMs: Date.now() - started,
        planner: driver.kind,
        providerMeta: debug ? lastProviderMeta : undefined,
        permittedCapabilities: [...permittedNames],
      };
    }

    if (action.type === "final_answer") {
      const validation = validateAnswerAgainstEvidence({
        answerText: action.answer,
        citedEvidenceIds: action.citedEvidenceIds,
        evidenceBag,
        requiresAuthoritative: true,
      });
      if (!validation.ok) {
        return {
          ok: false,
          answerState: validation.state,
          answer: userMessageForState(
            validation.state,
            validation.error || "I don't have enough authoritative eliteOS data to answer that."
          ),
          validation,
          evidence: evidenceBag.map(evidenceForModel),
          toolCalls,
          modelSteps,
          toolTrace: debug ? toolTrace : undefined,
          durationMs: Date.now() - started,
          planner: driver.kind,
          providerMeta: debug ? lastProviderMeta : undefined,
          blockedUnsupportedClaim: true,
        };
      }
      return {
        ok: true,
        answerState: validation.state,
        answer: action.answer,
        evidence: evidenceBag.map(evidenceForModel),
        toolCalls,
        modelSteps,
        toolTrace: debug ? toolTrace : undefined,
        validation,
        durationMs: Date.now() - started,
        planner: driver.kind,
        providerMeta: debug ? lastProviderMeta : undefined,
        permittedCapabilities: [...permittedNames],
      };
    }

    // call_tool
    if (toolCalls >= maxToolCalls) {
      return finishAbstain({
        state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        message: "Reached the tool-call limit before a grounded answer was ready.",
        evidenceBag,
        toolCalls,
        modelSteps,
        toolTrace,
        debug,
        started,
        permittedNames,
        lastProviderMeta,
      });
    }

    if (!permittedNames.has(action.capability)) {
      const observation = {
        ok: false,
        code: "CAPABILITY_NOT_PERMITTED",
        error: "That tool is not available for your access.",
        capability: action.capability,
      };
      history.push({
        role: "tool_call",
        capability: action.capability,
        input: action.input || {},
        modelStep: modelSteps,
      });
      history.push({
        role: "observation",
        capability: action.capability,
        observation,
      });
      if (debug) {
        toolTrace.push({
          modelStep: modelSteps,
          capability: action.capability,
          ok: false,
          skipped: true,
          reason: "not_permitted",
          durationMs: 0,
          evidenceCount: 0,
          code: "CAPABILITY_NOT_PERMITTED",
          input: sanitizeToolInputForDebug(action.input || {}),
          validationError: observation.error,
          toolCallingMode: lastProviderMeta.toolCallingMode,
          provider: lastProviderMeta.provider,
          model: lastProviderMeta.model,
        });
      }
      continue;
    }

    const callStarted = Date.now();
    const result = await executeCapability({
      name: action.capability,
      input: action.input || {},
      ctx: gatewayCtx,
    });
    const callDurationMs = Date.now() - callStarted;
    toolCalls += 1;

    if (result.ok && Array.isArray(result.evidence)) {
      for (const ev of result.evidence) {
        if (ev.sourceDomain === "knowledge" && ev.data?.text) {
          ev.data = { ...ev.data, text: scrubKnowledgeAsData(ev.data.text) };
        }
        evidenceBag.push(ev);
      }
    }

    // Ensure validation failures always carry the contract for recovery
    if (!result.ok && result.code === "VALIDATION_ERROR" && !result.expectedInputSchema) {
      const cap = getCapability(action.capability);
      result.expectedInputSchema = schemaForObservation(action.capability) || cap?.inputSchema || null;
      result.capability = action.capability;
    }

    const observation = observationForModel(result);
    history.push({
      role: "tool_call",
      capability: action.capability,
      input: action.input || {},
      modelStep: modelSteps,
    });
    history.push({
      role: "observation",
      capability: action.capability,
      observation,
    });

    if (debug) {
      toolTrace.push({
        modelStep: modelSteps,
        capability: action.capability,
        ok: Boolean(result.ok),
        durationMs: callDurationMs,
        evidenceCount: (result.evidence || []).length,
        code: result.code || null,
        input: sanitizeToolInputForDebug(action.input || {}),
        validationError: result.code === "VALIDATION_ERROR" ? result.error || null : null,
        toolCallingMode: lastProviderMeta.toolCallingMode,
        provider: lastProviderMeta.provider,
        model: lastProviderMeta.model,
      });
    }

    // Permission denial is structural — surface immediately (not a business workflow)
    if (result.answerState === ANSWER_STATES.PERMISSION_DENIED || result.code === "DOMAIN_HEAD_REQUIRED") {
      return {
        ok: true,
        answerState: ANSWER_STATES.PERMISSION_DENIED,
        answer: userMessageForState(ANSWER_STATES.PERMISSION_DENIED, result.error),
        evidence: evidenceBag.map(evidenceForModel),
        toolCalls,
        modelSteps,
        toolTrace: debug ? toolTrace : undefined,
        validation: { ok: true, state: ANSWER_STATES.PERMISSION_DENIED },
        durationMs: Date.now() - started,
        planner: driver.kind,
        providerMeta: debug ? lastProviderMeta : undefined,
      };
    }

    // VALIDATION_ERROR → observation already in history; model may correct on next step
  }

  return finishAbstain({
    state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
    message: "Investigation ended without a grounded final answer.",
    evidenceBag,
    toolCalls,
    modelSteps,
    toolTrace,
    debug,
    started,
    permittedNames,
    lastProviderMeta,
  });
}

function finishAbstain({
  state,
  message,
  evidenceBag,
  toolCalls,
  modelSteps,
  toolTrace,
  debug,
  started,
  permittedNames,
  lastProviderMeta,
  extra = {},
}) {
  return {
    ok: true,
    answerState: state,
    answer: userMessageForState(state, message),
    evidence: evidenceBag.map(evidenceForModel),
    toolCalls,
    modelSteps,
    toolTrace: debug ? toolTrace : undefined,
    validation: { ok: true, state },
    durationMs: Date.now() - started,
    providerMeta: debug ? lastProviderMeta : undefined,
    permittedCapabilities: [...permittedNames],
    ...extra,
  };
}
