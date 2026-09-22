import type { BrainAnswerState, BrainEvidenceItem } from "./types";
import { humanLabelFromEvidence } from "./context";

export type DisplayEvidenceRow = {
  key: string;
  type: string;
  entityId: string;
  label: string;
  freshnessNote?: string | null;
  kind: "company" | "knowledge";
};

/**
 * User-facing evidence list — readable labels, no raw objects.
 */
export function formatEvidenceForDisplay(evidence: BrainEvidenceItem[] | undefined): {
  company: DisplayEvidenceRow[];
  knowledge: DisplayEvidenceRow[];
  freshnessWarnings: string[];
} {
  const company: DisplayEvidenceRow[] = [];
  const knowledge: DisplayEvidenceRow[] = [];
  const freshnessWarnings: string[] = [];
  const seen = new Set<string>();

  for (const ev of evidence || []) {
    const label = humanLabelFromEvidence(ev);
    const type = String(ev.entityType || ev.sourceDomain || "record").toLowerCase();
    const entityId = ev.entityId != null ? String(ev.entityId) : ev.evidenceId;
    const key = `${type}:${entityId}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const row: DisplayEvidenceRow = {
      key,
      type,
      entityId,
      label,
      freshnessNote: ev.freshnessNote || null,
      kind: ev.sourceDomain === "knowledge" || type === "passage" || type === "document" ? "knowledge" : "company",
    };

    if (ev.freshnessNote && /stale|aging|outdated/i.test(String(ev.freshnessNote))) {
      freshnessWarnings.push(`${label}: ${ev.freshnessNote}`);
    }

    if (row.kind === "knowledge") knowledge.push(row);
    else company.push(row);
  }

  return { company, knowledge, freshnessWarnings };
}

export function answerStateBanner(state: BrainAnswerState | undefined): {
  tone: "ok" | "warn" | "deny" | "info";
  label: string;
} | null {
  switch (state) {
    case "SUPPORTED":
      return null;
    case "PARTIALLY_SUPPORTED":
      return { tone: "warn", label: "Partial answer — limited by available evidence" };
    case "INSUFFICIENT_EVIDENCE":
      return { tone: "info", label: "Not enough authoritative eliteOS data" };
    case "AMBIGUOUS_ENTITY":
      return { tone: "info", label: "Multiple matches — choose one" };
    case "STALE_DATA":
      return { tone: "warn", label: "Data may be stale — check sync time" };
    case "PERMISSION_DENIED":
      return { tone: "deny", label: "Outside your authorized eliteOS access" };
    case "CAPABILITY_UNAVAILABLE":
      return { tone: "info", label: "eliteOS does not currently expose that to the agent" };
    default:
      return state ? { tone: "info", label: String(state) } : null;
  }
}

/**
 * Hide raw [ev_*] machine citations from normal employee-facing prose.
 * Validation still uses the raw answer + citedEvidenceIds on the server.
 * Debug mode may show originals.
 */
export function displayAnswerForUser(
  answer: string | undefined | null,
  opts: { showEvidenceIds?: boolean } = {}
): string {
  const text = String(answer || "");
  if (opts.showEvidenceIds) return text;
  return text
    .replace(/\s*\[ev_[a-f0-9]{8,32}\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sanitize debug payload for UI — strip anything that looks like a secret. */
export function sanitizeDebugPayload(result: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    "ok",
    "answerState",
    "toolCalls",
    "modelSteps",
    "durationMs",
    "planner",
    "permittedCapabilities",
    "validation",
    "toolTrace",
    "providerMeta",
    "debugStop",
    "blockedUnsupportedClaim",
    "evidenceCount",
  ];
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k === "evidenceCount") {
      out.evidenceCount = Array.isArray(result.evidence) ? result.evidence.length : 0;
      continue;
    }
    if (k in result) out[k] = result[k];
  }
  return out;
}
