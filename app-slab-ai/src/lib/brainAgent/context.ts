import type { BrainAgentThreadContext, BrainEvidenceItem } from "./types";

type ChatTurn = { role: "user" | "assistant"; text: string };

/**
 * Build context for Brain Agent runs.
 * Passes thread memory only — no intent classification, no workflow state machine.
 */
export function buildBrainAgentContext(args: {
  resolved: {
    accountId?: string | null;
    accountLabel?: string | null;
    quoteId?: string | null;
    quoteLabel?: string | null;
    jobId?: string | null;
    jobLabel?: string | null;
    materialLabel?: string | null;
    selectedEntityId?: string | null;
    selectedEntityLabel?: string | null;
  };
  recentMessages: ChatTurn[];
  latestEvidence?: BrainEvidenceItem[] | null;
}): BrainAgentThreadContext {
  const priorEvidenceRefs = (args.latestEvidence || [])
    .slice(0, 12)
    .map((ev) => ({
      evidenceId: ev.evidenceId,
      entityType: ev.entityType ?? null,
      entityId: ev.entityId ?? null,
      label: humanLabelFromEvidence(ev),
    }))
    .filter((r) => r.label || r.entityId);

  return {
    accountId: args.resolved.accountId ?? null,
    accountLabel: args.resolved.accountLabel ?? null,
    quoteId: args.resolved.quoteId ?? null,
    quoteLabel: args.resolved.quoteLabel ?? null,
    jobId: args.resolved.jobId ?? null,
    jobLabel: args.resolved.jobLabel ?? null,
    materialLabel: args.resolved.materialLabel ?? null,
    selectedEntityId: args.resolved.selectedEntityId ?? null,
    selectedEntityLabel: args.resolved.selectedEntityLabel ?? null,
    recentMessages: args.recentMessages
      .filter((m) => m.text?.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text.trim().slice(0, 1200) })),
    priorEvidenceRefs,
  };
}

export function humanLabelFromEvidence(ev: BrainEvidenceItem): string {
  const data = (ev.data || {}) as Record<string, unknown>;
  const type = String(ev.entityType || ev.sourceDomain || "").toLowerCase();

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = data[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  };

  if (type === "quote" || ev.sourceDomain === "quote") {
    const q = pick("quoteNumber", "quoteLabel", "label", "title");
    if (q) return q.startsWith("Quote") ? q : `Quote ${q}`;
  }
  if (type === "job" || ev.sourceDomain === "job") {
    const j = pick("jobNumber", "jobLabel", "label", "title");
    if (j) return j.startsWith("Job") ? j : `Job ${j}`;
  }
  if (type === "account" || ev.sourceDomain === "account") {
    const a = pick("accountName", "label", "name", "title");
    if (a) return a;
  }
  if (ev.sourceDomain === "knowledge" || type === "passage" || type === "document") {
    const t = pick("title", "label", "locator");
    if (t) return t;
  }

  const fallback = pick(
    "accountName",
    "label",
    "quoteNumber",
    "quoteLabel",
    "jobNumber",
    "jobLabel",
    "title",
    "name",
    "materialName",
    "color"
  );
  if (fallback) return fallback;
  if (ev.entityType && ev.entityId) return `${ev.entityType} ${ev.entityId}`;
  if (ev.entityType) return String(ev.entityType);
  return ev.sourceDomain || "Company data";
}

/**
 * Merge entity IDs/labels from evidence into thread resolution chips.
 * Prefer explicit labels; do not invent IDs.
 */
export function mergeResolvedFromEvidence(
  current: BrainAgentThreadContext,
  evidence: BrainEvidenceItem[] | undefined
): BrainAgentThreadContext {
  const next = { ...current };
  for (const ev of evidence || []) {
    const data = (ev.data || {}) as Record<string, unknown>;
    const type = String(ev.entityType || data.entityType || "").toLowerCase();
    const id = ev.entityId != null ? String(ev.entityId) : data.accountId || data.quoteId || data.jobId;
    const label = humanLabelFromEvidence(ev);

    if ((type === "account" || ev.sourceDomain === "account") && id) {
      next.accountId = String(id);
      next.accountLabel = label;
    }
    if ((type === "quote" || ev.sourceDomain === "quote") && id) {
      next.quoteId = String(id);
      next.quoteLabel = label;
    }
    if ((type === "job" || ev.sourceDomain === "job") && id) {
      next.jobId = String(id);
      next.jobLabel = label;
    }
  }
  return next;
}

export function canShowBrainAgentDebug(role: string | null | undefined): boolean {
  const r = String(role || "").trim();
  return r === "admin" || r === "super_admin" || r === "executive";
}
