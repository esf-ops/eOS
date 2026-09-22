import { z } from "zod";
import type { AssistantIntent } from "./types";

/** Allowed planner actions — must map to existing governed capabilities only. */
export const PLANNER_ACTIONS = [
  "search_account",
  "load_account",
  "search_quote",
  "load_quote",
  "list_account_jobs",
  "load_job",
  "search_inventory",
  "generate_account_brief",
  "generate_quote_scope",
  "generate_stone_care",
  "troubleshoot_machine",
  "generate_remnant_marketing",
  "search_knowledge",
  "clarify",
  "general_answer",
] as const;

export type PlannerAction = (typeof PLANNER_ACTIONS)[number];

export const plannerEntityHintsSchema = z.object({
  accountName: z.string().trim().max(80).optional().nullable(),
  quoteNumber: z.string().trim().max(80).optional().nullable(),
  material: z.string().trim().max(80).optional().nullable(),
  jobHint: z.string().trim().max(80).optional().nullable(),
  manufacturer: z.string().trim().max(80).optional().nullable(),
  productColor: z.string().trim().max(80).optional().nullable(),
});

export const plannerModifiersSchema = z.object({
  latest: z.boolean().optional().nullable(),
  oldest: z.boolean().optional().nullable(),
  current: z.boolean().optional().nullable(),
  active: z.boolean().optional().nullable(),
});

export const assistantPlanSchema = z.object({
  intent: z.enum([
    "account_brief",
    "quote_scope",
    "machine_troubleshooter",
    "stone_care",
    "remnant_pitch",
    "inventory_search",
    "ops_lookup",
    "general",
  ]),
  action: z.enum(PLANNER_ACTIONS),
  entityHints: plannerEntityHintsSchema.optional().nullable(),
  modifiers: plannerModifiersSchema.optional().nullable(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().trim().max(280).optional().nullable(),
  /** Short operational note only — never private chain-of-thought. */
  reasoningSummary: z.string().trim().max(200).optional().nullable(),
});

export type AssistantPlan = z.infer<typeof assistantPlanSchema>;

export function validateAssistantPlan(raw: unknown): AssistantPlan | null {
  const parsed = assistantPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function intentFromAction(action: PlannerAction): AssistantIntent {
  switch (action) {
    case "generate_account_brief":
      return "account_brief";
    case "generate_quote_scope":
      return "quote_scope";
    case "troubleshoot_machine":
      return "machine_troubleshooter";
    case "generate_stone_care":
      return "stone_care";
    case "generate_remnant_marketing":
      return "remnant_pitch";
    case "search_inventory":
      return "inventory_search";
    case "search_account":
    case "load_account":
    case "search_quote":
    case "load_quote":
    case "list_account_jobs":
    case "load_job":
    case "search_knowledge":
      return "ops_lookup";
    case "clarify":
    case "general_answer":
    default:
      return "general";
  }
}
