/**
 * Brain Agent Gateway — execute registered read capabilities with evidence.
 */

import { getCapability, listCapabilities } from "./capabilityRegistry.mjs";
import { evidenceForModel } from "./evidence.mjs";
import { ANSWER_STATES } from "./answerStates.mjs";
import { requireDomainHead, userMayAccessHead } from "../slabAi/slabAiPermissionIntersection.mjs";
import { registerFoundationCapabilities } from "./capabilities/registerFoundation.mjs";

let foundationsRegistered = false;

export function ensureFoundationCapabilities() {
  if (foundationsRegistered) return;
  registerFoundationCapabilities();
  foundationsRegistered = true;
}

/** Tests only — clear registry + allow re-registration of foundations. */
export function _resetBrainAgentGatewayForTests() {
  foundationsRegistered = false;
}

/**
 * @param {object} args
 */
export async function createGatewayContext({ db, getSupabase, user, organizationId }) {
  return {
    db,
    getSupabase,
    user,
    organizationId,
    async requireHead(domainHead) {
      const gate = await requireDomainHead({ db, user, domainHead });
      if (!gate.ok) {
        return {
          ...gate,
          answerState: ANSWER_STATES.PERMISSION_DENIED,
        };
      }
      return gate;
    },
  };
}

export async function listPermittedCapabilities({ db, user }) {
  ensureFoundationCapabilities();
  const heads = new Set(["*"]); // names without requiredHead always shown; filter by check below
  // Build actionable set for filtering
  for (const slug of ["account_directory", "slab_inventory", "sales", "finance", "slab_ai"]) {
    const check = await userMayAccessHead({ db, user, headSlug: slug });
    if (check.allowed) heads.add(slug);
  }
  // Always treat null requiredHead as available (quotes/knowledge/metric)
  const listed = listCapabilities({ permittedHeads: null, includeUnavailable: true }).map((c) => {
    if (!c.requiredHead) return { ...c, available: true };
    return { ...c, available: heads.has(c.requiredHead) };
  });
  return listed.filter((c) => c.available);
}

/**
 * Execute one capability. Returns evidence array always when ok.
 */
export async function executeCapability({ name, input, ctx }) {
  ensureFoundationCapabilities();
  const cap = getCapability(name);
  if (!cap) {
    return {
      ok: false,
      status: 404,
      code: "CAPABILITY_UNAVAILABLE",
      error: `Unknown capability: ${name}`,
      answerState: ANSWER_STATES.CAPABILITY_UNAVAILABLE,
      evidence: [],
    };
  }
  if (cap.mode !== "read") {
    return {
      ok: false,
      status: 403,
      code: "WRITE_FORBIDDEN",
      error: "Write capabilities are not available to the Brain agent.",
      evidence: [],
    };
  }

  if (typeof cap.validateInput === "function") {
    const v = cap.validateInput(input || {});
    if (v && v.ok === false) {
      return {
        ok: false,
        status: v.code === "CAPABILITY_UNAVAILABLE" ? 501 : 400,
        code: v.code || "VALIDATION_ERROR",
        error: v.error || "Invalid input",
        answerState:
          v.code === "CAPABILITY_UNAVAILABLE"
            ? ANSWER_STATES.CAPABILITY_UNAVAILABLE
            : ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        evidence: [],
      };
    }
  }

  if (cap.requiredHead) {
    const gate = await ctx.requireHead(cap.requiredHead);
    if (!gate.ok) {
      return {
        ...gate,
        answerState: ANSWER_STATES.PERMISSION_DENIED,
        evidence: [],
      };
    }
  }

  try {
    const result = await cap.execute(input || {}, ctx);
    if (!result || result.ok === false) {
      return {
        ...(result || { ok: false, error: "Capability failed" }),
        evidence: result?.evidence || [],
        answerState:
          result?.code === "DOMAIN_HEAD_REQUIRED"
            ? ANSWER_STATES.PERMISSION_DENIED
            : result?.answerState || ANSWER_STATES.INSUFFICIENT_EVIDENCE,
      };
    }
    const evidence = Array.isArray(result.evidence) ? result.evidence : [];
    return {
      ...result,
      ok: true,
      capability: cap.name,
      evidence,
      evidenceForModel: evidence.map(evidenceForModel),
    };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: "Capability execution failed",
      detail: String(e?.message || e),
      evidence: [],
      answerState: ANSWER_STATES.CAPABILITY_UNAVAILABLE,
    };
  }
}
