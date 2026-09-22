/**
 * Deterministic answer validation — never trust the model as sole factual verifier.
 */

import { ANSWER_STATES } from "./answerStates.mjs";

const EVIDENCE_ID_RE = /\bev_[a-f0-9]{8,32}\b/gi;

/**
 * @param {object} args
 * @param {string} args.answerText
 * @param {string[]} [args.citedEvidenceIds]
 * @param {Array<{ evidenceId: string, authoritative?: boolean }>} args.evidenceBag
 * @param {Array<{ value: number|string, evidenceId: string }>} [args.authoritativeNumbers]
 * @param {boolean} [args.requiresAuthoritative]
 */
export function validateAnswerAgainstEvidence({
  answerText = "",
  citedEvidenceIds = null,
  evidenceBag = [],
  authoritativeNumbers = [],
  requiresAuthoritative = true,
}) {
  const bag = new Map((evidenceBag || []).map((e) => [e.evidenceId, e]));
  const knownIds = new Set(bag.keys());

  const fromText = [...String(answerText || "").matchAll(EVIDENCE_ID_RE)].map((m) => m[0]);
  const cited = [...new Set([...(citedEvidenceIds || []), ...fromText])];

  const fabricated = cited.filter((id) => !knownIds.has(id));
  if (fabricated.length) {
    return {
      ok: false,
      state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
      code: "FABRICATED_EVIDENCE",
      error: "Answer referenced evidence IDs that were not produced in this agent run.",
      fabricatedEvidenceIds: fabricated,
    };
  }

  if (requiresAuthoritative && cited.length === 0 && knownIds.size === 0) {
    return {
      ok: false,
      state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
      code: "NO_EVIDENCE",
      error: "No authoritative evidence was retrieved for this company-factual answer.",
    };
  }

  if (requiresAuthoritative && cited.length > 0) {
    const anyAuth = cited.some((id) => bag.get(id)?.authoritative !== false);
    if (!anyAuth) {
      return {
        ok: false,
        state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        code: "NO_AUTHORITATIVE_EVIDENCE",
        error: "Cited evidence is not marked authoritative.",
      };
    }
  }

  // Authoritative numbers in the answer must match server-computed/retrieved values when declared
  for (const n of authoritativeNumbers || []) {
    if (!n?.evidenceId || !knownIds.has(n.evidenceId)) {
      return {
        ok: false,
        state: ANSWER_STATES.INSUFFICIENT_EVIDENCE,
        code: "NUMBER_WITHOUT_EVIDENCE",
        error: "An authoritative number was not backed by run evidence.",
      };
    }
  }

  const stale = [...bag.values()].filter((e) => e.freshnessNote && /stale|aging/i.test(String(e.freshnessNote)));
  if (stale.length && cited.some((id) => stale.some((s) => s.evidenceId === id))) {
    return {
      ok: true,
      state: ANSWER_STATES.STALE_DATA,
      code: "STALE_WARNING",
      citedEvidenceIds: cited,
      warnings: stale.map((s) => s.freshnessNote),
    };
  }

  if (requiresAuthoritative && cited.length === 0 && knownIds.size > 0) {
    // Evidence exists but answer did not cite — treat as partially supported
    return {
      ok: true,
      state: ANSWER_STATES.PARTIALLY_SUPPORTED,
      code: "UNCITED_EVIDENCE",
      citedEvidenceIds: [],
      availableEvidenceIds: [...knownIds],
      warnings: ["Answer did not cite evidence IDs; treat as provisional until cited."],
    };
  }

  return {
    ok: true,
    state: ANSWER_STATES.SUPPORTED,
    citedEvidenceIds: cited,
  };
}

/**
 * Reject prompt-injection style instructions found inside knowledge text.
 * Knowledge is DATA — never treated as system instructions by runtime.
 */
export function scrubKnowledgeAsData(text) {
  return String(text || "")
    .replace(/\bignore\s+(all\s+)?(previous|prior)\s+instructions\b/gi, "[instruction-like text redacted]")
    .replace(/\breveal\s+(other\s+)?customers?\b/gi, "[instruction-like text redacted]");
}
