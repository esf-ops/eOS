import { generateObject } from "ai";
import { getAIModel, getAIProviderConfig } from "@/lib/ai/provider";
import type { AssistantThreadContext } from "./types";
import {
  PLANNER_ACTIONS,
  assistantPlanSchema,
  type AssistantPlan,
  validateAssistantPlan,
} from "./plannerSchema";
import { buildDeterministicPlan, extractAccountSearchQuery } from "./deterministicPlan";

const PLANNER_SYSTEM = `You are the slabOS assistant planner for Elite Stone Fabrication employees.

Return ONLY structured JSON matching the schema. You do NOT have database access.
You do NOT invent entity IDs, prices, rankings, inventory quantities, or machine setpoints.

Extract entityHints cleanly:
- From "Brief me on an account before I call them. 319 design" → accountName = "319 design"
- From "brief me on an account 319 design and decor" → accountName = "319 design and decor"
- Strip instructional phrases like brief/pull up/before I call/an account.

Allowed actions (choose one): ${PLANNER_ACTIONS.join(", ")}

Rules:
- If the user asks for "top/best account" without a metric → needsClarification=true and ask which measure (quote activity, active jobs, etc.). Never invent rankings. Do not suggest finance metrics unless the user asked and finance is separately authorized (assume it is NOT).
- latest/most recent/last quote → modifiers.latest=true
- Pronouns (their/that) use thread context; still set the correct action.
- reasoningSummary must be a short operational note only (or omit). Never private chain-of-thought.`;

/**
 * Model-assisted planner using the fast model. Falls back to deterministic on mock/failure.
 */
export async function planWithModel(
  message: string,
  context: AssistantThreadContext
): Promise<{ plan: AssistantPlan; source: "model" | "deterministic" }> {
  const deterministic = buildDeterministicPlan(message, context);
  const config = getAIProviderConfig();

  if (config.mockMode || !config.hasApiKey) {
    return { plan: deterministic, source: "deterministic" };
  }

  try {
    const handle = getAIModel("fast");
    if (handle.kind !== "openai") {
      return { plan: deterministic, source: "deterministic" };
    }

    const { object } = await generateObject({
      model: handle.model,
      schema: assistantPlanSchema,
      system: PLANNER_SYSTEM,
      prompt: [
        `User message: ${message}`,
        `Thread context (authoritative IDs only when present): ${JSON.stringify({
          accountId: context.accountId || null,
          accountLabel: context.accountLabel || null,
          quoteId: context.quoteId || null,
          quoteLabel: context.quoteLabel || null,
          jobId: context.jobId || null,
          materialLabel: context.materialLabel || null,
        })}`,
      ].join("\n"),
      temperature: 0,
    });

    const validated = validateAssistantPlan(object);
    if (!validated) {
      return { plan: deterministic, source: "deterministic" };
    }

    // Harden entity extraction: never allow instruction fluff to survive as accountName
    const safeAccount =
      cleanAccountHint(validated.entityHints?.accountName) ||
      extractAccountSearchQuery(message) ||
      deterministic.entityHints?.accountName ||
      null;

    const merged: AssistantPlan = {
      ...validated,
      entityHints: {
        ...(validated.entityHints || {}),
        accountName: safeAccount,
        material: validated.entityHints?.material || deterministic.entityHints?.material || null,
        productColor:
          validated.entityHints?.productColor || deterministic.entityHints?.productColor || null,
        manufacturer:
          validated.entityHints?.manufacturer || deterministic.entityHints?.manufacturer || null,
        quoteNumber:
          validated.entityHints?.quoteNumber || deterministic.entityHints?.quoteNumber || null,
      },
      modifiers: {
        ...(deterministic.modifiers || {}),
        ...(validated.modifiers || {}),
      },
      // Prefer deterministic clarify for top-account if model missed it
      needsClarification:
        validated.needsClarification ||
        (deterministic.action === "clarify" && deterministic.needsClarification),
      clarificationQuestion:
        validated.clarificationQuestion ||
        (deterministic.needsClarification ? deterministic.clarificationQuestion : null),
      action:
        deterministic.action === "clarify" && deterministic.needsClarification
          ? "clarify"
          : validated.action,
    };

    const final = validateAssistantPlan(merged);
    return { plan: final || deterministic, source: final ? "model" : "deterministic" };
  } catch {
    return { plan: deterministic, source: "deterministic" };
  }
}

function cleanAccountHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/\bbefore\s+(i\s+)?call(\s+them)?\b/gi, " ")
    .replace(/\ban?\s+account\b/gi, " ")
    .replace(/\bbrief(\s+me)?(\s+on)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return null;
  if (/^(them|it|that|this|please)$/i.test(cleaned)) return null;
  // Reject if still mostly instruction
  if (/before i call|brief me on/i.test(cleaned)) return null;
  return cleaned.slice(0, 80);
}
