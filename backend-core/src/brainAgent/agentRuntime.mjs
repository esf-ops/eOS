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

export const AGENT_LIMITS = Object.freeze({
  maxToolCalls: 8,
  maxModelSteps: 12,
  timeoutMs: 45_000,
  maxRowsPerCall: 25,
});

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
    truncated,
    truncatedScan,
    evidenceForModel: efm,
    evidence,
  } = result;

  return {
    ok: Boolean(ok),
    error: error || null,
    code: code || null,
    answerState: answerState || null,
    ambiguous: Boolean(ambiguous),
    truncated: Boolean(truncated || truncatedScan),
    metric: metric || null,
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

  while (modelSteps < AGENT_LIMITS.maxModelSteps) {
    if (Date.now() - started > AGENT_LIMITS.timeoutMs) {
      return finishAbstain({
        state: ANSWER_STATES.CAPABILITY_UNAVAILABLE,
        message: "Investigation timed out before enough evidence was gathered.",
        evidenceBag,
        toolCalls,
        toolTrace,
        debug,
        started,
        permittedNames,
      });
    }

    modelSteps += 1;
    const decision = await driver.nextStep({
      message,
      context,
      permittedCapabilities: permitted,
      permittedNames,
      history,
      evidenceSnapshot: evidenceBag.map(evidenceForModel),
    });

    const step = decision?.step;
    const checked = validateModelStep(step, permittedNames);
    if (!checked.ok) {
      return finishAbstain({
        state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        message: "The planner produced an invalid step. I will not invent a workflow.",
        evidenceBag,
        toolCalls,
        toolTrace,
        debug,
        started,
        permittedNames,
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
        // Model claimed facts without evidence — block; do not ship unsupported company facts
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
        toolTrace,
        debug,
        started,
        permittedNames,
      });
    }

    if (!permittedNames.has(action.capability)) {
      history.push({
        role: "observation",
        capability: action.capability,
        observation: {
          ok: false,
          code: "CAPABILITY_NOT_PERMITTED",
          error: "That tool is not available for your access.",
        },
      });
      toolTrace.push({ capability: action.capability, skipped: true, reason: "not_permitted" });
      continue;
    }

    const result = await executeCapability({
      name: action.capability,
      input: action.input || {},
      ctx: gatewayCtx,
    });
    toolCalls += 1;

    if (result.ok && Array.isArray(result.evidence)) {
      for (const ev of result.evidence) {
        if (ev.sourceDomain === "knowledge" && ev.data?.text) {
          ev.data = { ...ev.data, text: scrubKnowledgeAsData(ev.data.text) };
        }
        evidenceBag.push(ev);
      }
    }

    const observation = observationForModel(result);
    history.push({
      role: "tool_call",
      capability: action.capability,
      input: action.input || {},
    });
    history.push({
      role: "observation",
      capability: action.capability,
      observation,
    });

    toolTrace.push({
      capability: action.capability,
      ok: Boolean(result.ok),
      durationMs: Date.now() - started,
      evidenceCount: (result.evidence || []).length,
      code: result.code || null,
    });

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
      };
    }
  }

  return finishAbstain({
    state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
    message: "Investigation ended without a grounded final answer.",
    evidenceBag,
    toolCalls,
    toolTrace,
    debug,
    started,
    permittedNames,
  });
}

function finishAbstain({
  state,
  message,
  evidenceBag,
  toolCalls,
  toolTrace,
  debug,
  started,
  permittedNames,
  extra = {},
}) {
  return {
    ok: true,
    answerState: state,
    answer: userMessageForState(state, message),
    evidence: evidenceBag.map(evidenceForModel),
    toolCalls,
    toolTrace: debug ? toolTrace : undefined,
    validation: { ok: true, state },
    durationMs: Date.now() - started,
    permittedCapabilities: [...permittedNames],
    ...extra,
  };
}
