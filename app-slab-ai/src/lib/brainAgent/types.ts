/**
 * Brain Agent client types — mirrors backend-core/src/brainAgent run response.
 * Read-only. No skill / intent routing.
 */

export type BrainAnswerState =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS_ENTITY"
  | "STALE_DATA"
  | "PERMISSION_DENIED"
  | "CAPABILITY_UNAVAILABLE"
  | string;

export type BrainEvidenceItem = {
  evidenceId: string;
  sourceDomain?: string | null;
  sourceSystem?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  retrievedAt?: string | null;
  sourceUpdatedAt?: string | null;
  authoritative?: boolean;
  freshnessNote?: string | null;
  data?: Record<string, unknown> | null;
};

export type BrainAgentClarifyOption = {
  id: string;
  label: string;
  meta?: string;
};

export type BrainAgentToolTraceEntry = {
  capability?: string;
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  durationMs?: number;
  evidenceCount?: number;
  code?: string | null;
};

export type BrainAgentRunResult = {
  ok: boolean;
  answer?: string;
  answerState?: BrainAnswerState;
  evidence?: BrainEvidenceItem[];
  options?: BrainAgentClarifyOption[];
  toolCalls?: number;
  modelSteps?: number;
  durationMs?: number;
  planner?: string;
  permittedCapabilities?: string[];
  validation?: {
    ok?: boolean;
    state?: string;
    code?: string;
    error?: string;
  };
  toolTrace?: BrainAgentToolTraceEntry[];
  blockedUnsupportedClaim?: boolean;
  error?: string;
  code?: string;
};

export type BrainAgentThreadContext = {
  accountId?: string | null;
  accountLabel?: string | null;
  quoteId?: string | null;
  quoteLabel?: string | null;
  jobId?: string | null;
  jobLabel?: string | null;
  materialLabel?: string | null;
  /** User-selected clarify option — model interprets; app does not classify domain. */
  selectedEntityId?: string | null;
  selectedEntityLabel?: string | null;
  /** Recent chat turns for model follow-up interpretation — not business workflow state. */
  recentMessages?: Array<{ role: "user" | "assistant"; text: string }>;
  /** Compact evidence refs from prior turns (ids/labels only). */
  priorEvidenceRefs?: Array<{
    evidenceId?: string;
    entityType?: string | null;
    entityId?: string | null;
    label?: string;
  }>;
};

/** Primary conversational path — must not point at legacy /api/ai/assistant. */
export const BRAIN_AGENT_CHAT_PATH = "/api/ai/brain-agent/run";

/** Legacy Skill/intent orchestrator — kept for rollback; not used by AssistantWorkspace. */
export const LEGACY_ASSISTANT_PATH = "/api/ai/assistant";
