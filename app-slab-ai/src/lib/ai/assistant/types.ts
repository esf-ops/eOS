/**
 * Assistant conversation types — thread context + turn outcomes.
 * Operational IDs are authoritative; names are presentation.
 */

export type AssistantEntityChip = {
  type: "account" | "quote" | "job" | "material" | "knowledge";
  id: string;
  label: string;
};

export type AssistantThreadContext = {
  accountId?: string | null;
  accountLabel?: string | null;
  quoteId?: string | null;
  quoteLabel?: string | null;
  jobId?: string | null;
  jobLabel?: string | null;
  materialLabel?: string | null;
  lastSkillId?: string | null;
};

export type AssistantIntent =
  | "account_brief"
  | "quote_scope"
  | "machine_troubleshooter"
  | "stone_care"
  | "remnant_pitch"
  | "inventory_search"
  | "ops_lookup"
  | "general";

export type ClarifyQuestion = {
  id: string;
  prompt: string;
  field?: string;
};

export type DisambiguationOption = {
  id: string;
  label: string;
  meta?: string;
  updatedAt?: string | null;
};

export type AssistantTurnResult =
  | {
      mode: "clarify";
      intent: AssistantIntent;
      message: string;
      questions: ClarifyQuestion[];
      context: AssistantThreadContext;
      suggestedFields?: Record<string, unknown>;
    }
  | {
      mode: "disambiguate";
      intent: AssistantIntent;
      message: string;
      domain: "account" | "quote";
      options: DisambiguationOption[];
      context: AssistantThreadContext;
    }
  | {
      mode: "generate";
      intent: AssistantIntent;
      skillId: string;
      formData: Record<string, unknown>;
      context: AssistantThreadContext;
      assistantNote?: string;
    }
  | {
      mode: "message";
      intent: AssistantIntent;
      message: string;
      context: AssistantThreadContext;
      operationalSources?: Array<{ type: string; entityId: string; label: string }>;
      followUps?: string[];
    };
