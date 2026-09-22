/**
 * Brain Agent runtime — true iterative investigation loop.
 *
 * MODEL → TOOL → OBSERVATION → MODEL → … → EVIDENCE-GROUNDED ANSWER
 *
 * Deterministic application code ONLY:
 * - auth / org / head permission (gateway)
 * - capability allowlist enforcement
 * - input/schema validation
 * - identical-call deduplication
 * - limits / timeouts
 * - evidence provenance + factual support checking
 * - server-side computations (metrics, rectangular fit)
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
      out[key] = v.slice(0, 20).map((item) =>
        item && typeof item === "object" ? sanitizeToolInputForDebug(item) : item
      );
    } else if (typeof v === "object") {
      out[key] = sanitizeToolInputForDebug(v);
    } else {
      out[key] = String(v).slice(0, 80);
    }
  }
  return out;
}

/** Stable fingerprint for identical capability+input deduplication. */
export function normalizeToolCallKey(capability, input) {
  const norm = (v) => {
    if (v == null) return null;
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
      return out;
    }
    return String(v);
  };
  return JSON.stringify({ capability: String(capability || ""), input: norm(input || {}) });
}

function summarizeObservation(obs) {
  if (!obs || typeof obs !== "object") return null;
  return {
    ok: Boolean(obs.ok),
    code: obs.code || null,
    error: obs.error || null,
    itemCount: obs.itemCount,
    metric: obs.metric || null,
    fitsCount: obs.fitsCount,
    truncated: Boolean(obs.truncated),
  };
}

function evidenceDomainsCollected(evidenceBag) {
  const domains = new Set();
  for (const ev of evidenceBag || []) {
    if (ev?.sourceDomain) domains.add(String(ev.sourceDomain));
    if (ev?.entityType) domains.add(String(ev.entityType));
  }
  return [...domains].sort();
}

function hasUsefulPartialEvidence(evidenceBag) {
  return (evidenceBag || []).some((ev) => {
    const t = String(ev?.entityType || "");
    const d = String(ev?.sourceDomain || "");
    return (
      ev?.authoritative !== false &&
      (t === "account" ||
        t === "quote" ||
        t === "job" ||
        t === "metric" ||
        t === "material" ||
        t === "rectangular_fit" ||
        d === "account" ||
        d === "quote" ||
        d === "job" ||
        d === "inventory" ||
        d === "computation")
    );
  });
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
    results,
    metric,
    period,
    dimension,
    truncated,
    truncatedScan,
    evidenceForModel: efm,
    evidence,
    capability,
    expectedInputSchema,
    disclaimer,
    fitsCount,
    requiredLength,
    requiredWidth,
  } = result;

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
    disclaimer: disclaimer || null,
    fitsCount: typeof fitsCount === "number" ? fitsCount : undefined,
    requiredLength: requiredLength ?? undefined,
    requiredWidth: requiredWidth ?? undefined,
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
    results: results ? results.slice(0, AGENT_LIMITS.maxRowsPerCall) : undefined,
    metricAccountIds,
    evidence: (efm || (evidence || []).map(evidenceForModel) || []).slice(0, 40),
  };
}

function debugStopMeta({
  reason,
  toolCalls,
  maxToolCalls,
  evidenceBag,
  lastProviderMeta,
}) {
  return {
    stopReason: reason,
    toolBudgetRemaining: Math.max(0, maxToolCalls - toolCalls),
    evidenceDomains: evidenceDomainsCollected(evidenceBag),
    providerMeta: lastProviderMeta,
  };
}

/**
 * Run a read-only investigation driven by the model.
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
  /** @type {Map<string, object>} */
  const priorCallByKey = new Map();

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

  const pushTrace = (entry) => {
    if (debug) toolTrace.push(entry);
  };

  while (modelSteps < AGENT_LIMITS.maxModelSteps) {
    if (Date.now() - started > AGENT_LIMITS.timeoutMs) {
      return finishStop({
        state: hasUsefulPartialEvidence(evidenceBag)
          ? ANSWER_STATES.PARTIALLY_SUPPORTED
          : ANSWER_STATES.CAPABILITY_UNAVAILABLE,
        message: hasUsefulPartialEvidence(evidenceBag)
          ? "I found some authoritative eliteOS data before timing out, but could not complete a full investigation within the time limit."
          : "Investigation timed out before enough evidence was gathered.",
        evidenceBag,
        toolCalls,
        modelSteps,
        toolTrace,
        debug,
        started,
        permittedNames,
        lastProviderMeta,
        maxToolCalls,
        stopReason: "timeout",
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
      return finishStop({
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
        maxToolCalls,
        stopReason: "invalid_model_step",
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
        debugStop: debug
          ? debugStopMeta({
              reason: "model_abstain",
              toolCalls,
              maxToolCalls,
              evidenceBag,
              lastProviderMeta,
            })
          : undefined,
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
        debugStop: debug
          ? debugStopMeta({
              reason: "model_clarify",
              toolCalls,
              maxToolCalls,
              evidenceBag,
              lastProviderMeta,
            })
          : undefined,
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
          debugStop: debug
            ? debugStopMeta({
                reason: "unsupported_claim_blocked",
                toolCalls,
                maxToolCalls,
                evidenceBag,
                lastProviderMeta,
              })
            : undefined,
        };
      }
      const state =
        action.answerState === ANSWER_STATES.PARTIALLY_SUPPORTED
          ? ANSWER_STATES.PARTIALLY_SUPPORTED
          : validation.state;
      return {
        ok: true,
        answerState: state,
        answer: action.answer,
        evidence: evidenceBag.map(evidenceForModel),
        toolCalls,
        modelSteps,
        toolTrace: debug ? toolTrace : undefined,
        validation: { ...validation, state },
        durationMs: Date.now() - started,
        planner: driver.kind,
        providerMeta: debug ? lastProviderMeta : undefined,
        debugStop: debug
          ? debugStopMeta({
              reason:
                state === ANSWER_STATES.PARTIALLY_SUPPORTED
                  ? "model_partial_answer"
                  : "model_final_answer",
              toolCalls,
              maxToolCalls,
              evidenceBag,
              lastProviderMeta,
            })
          : undefined,
        permittedCapabilities: [...permittedNames],
      };
    }

    // call_tool
    if (toolCalls >= maxToolCalls) {
      return finishStop({
        state: hasUsefulPartialEvidence(evidenceBag)
          ? ANSWER_STATES.PARTIALLY_SUPPORTED
          : ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        message: hasUsefulPartialEvidence(evidenceBag)
          ? "I gathered some authoritative eliteOS evidence but reached the tool-call limit before fully answering. What I found is partial — eliteOS may not currently expose every signal needed for a complete concern assessment."
          : "Reached the tool-call limit before a grounded answer was ready.",
        evidenceBag,
        toolCalls,
        modelSteps,
        toolTrace,
        debug,
        started,
        permittedNames,
        lastProviderMeta,
        maxToolCalls,
        stopReason: "tool_budget_exhausted",
      });
    }

    if (!permittedNames.has(action.capability)) {
      const observation = {
        ok: false,
        code: "CAPABILITY_NOT_PERMITTED",
        error: "That tool is not available for your access. Do not keep searching for it.",
        capability: action.capability,
      };
      history.push({
        role: "tool_call",
        capability: action.capability,
        input: action.input || {},
        modelStep: modelSteps,
      });
      history.push({ role: "observation", capability: action.capability, observation });
      pushTrace({
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
      continue;
    }

    const callKey = normalizeToolCallKey(action.capability, action.input || {});
    if (priorCallByKey.has(callKey)) {
      const prior = priorCallByKey.get(callKey);
      const observation = {
        ok: false,
        code: "DUPLICATE_TOOL_CALL",
        error: "This exact query was already executed.",
        message: "This exact query was already executed.",
        capability: action.capability,
        priorObservationSummary: prior,
      };
      history.push({
        role: "tool_call",
        capability: action.capability,
        input: action.input || {},
        modelStep: modelSteps,
        duplicate: true,
      });
      history.push({ role: "observation", capability: action.capability, observation });
      pushTrace({
        modelStep: modelSteps,
        capability: action.capability,
        ok: false,
        skipped: true,
        reason: "duplicate",
        durationMs: 0,
        evidenceCount: 0,
        code: "DUPLICATE_TOOL_CALL",
        input: sanitizeToolInputForDebug(action.input || {}),
        validationError: observation.error,
        toolCallingMode: lastProviderMeta.toolCallingMode,
        provider: lastProviderMeta.provider,
        model: lastProviderMeta.model,
      });
      // Do not burn tool budget on identical re-executions
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

    if (!result.ok && result.code === "VALIDATION_ERROR" && !result.expectedInputSchema) {
      const cap = getCapability(action.capability);
      result.expectedInputSchema = schemaForObservation(action.capability) || cap?.inputSchema || null;
      result.capability = action.capability;
    }

    const observation = observationForModel(result);
    priorCallByKey.set(callKey, summarizeObservation(observation));

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

    pushTrace({
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
        debugStop: debug
          ? debugStopMeta({
              reason: "permission_denied",
              toolCalls,
              maxToolCalls,
              evidenceBag,
              lastProviderMeta,
            })
          : undefined,
      };
    }
  }

  return finishStop({
    state: hasUsefulPartialEvidence(evidenceBag)
      ? ANSWER_STATES.PARTIALLY_SUPPORTED
      : ANSWER_STATES.INSUFFICIENT_EVIDENCE,
    message: hasUsefulPartialEvidence(evidenceBag)
      ? "I gathered some authoritative eliteOS evidence but could not complete a full answer with the available capabilities and step budget."
      : "Investigation ended without a grounded final answer.",
    evidenceBag,
    toolCalls,
    modelSteps,
    toolTrace,
    debug,
    started,
    permittedNames,
    lastProviderMeta,
    maxToolCalls,
    stopReason: "model_steps_exhausted",
  });
}

function finishStop({
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
  maxToolCalls,
  stopReason,
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
    debugStop: debug
      ? debugStopMeta({
          reason: stopReason,
          toolCalls,
          maxToolCalls,
          evidenceBag,
          lastProviderMeta,
        })
      : undefined,
    permittedCapabilities: [...permittedNames],
    ...extra,
  };
}
