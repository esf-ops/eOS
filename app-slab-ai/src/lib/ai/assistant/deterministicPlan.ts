import type { AssistantThreadContext } from "./types";
import {
  type AssistantPlan,
  type PlannerAction,
  intentFromAction,
  validateAssistantPlan,
} from "./plannerSchema";

const TOP_ACCOUNT_RE =
  /\b(top|best|#\s*1|number\s+one|highest|biggest)\s+(account|customer|builder|dealer)\b|\bour\s+top\s+account\b/i;
const LATEST_RE = /\b(most\s+recent|latest|last|newest)\b/i;
const QUOTE_RE = /\b(quote|estimate)\b/i;
const JOB_RE = /\b(jobs?|open\s+work|moraware)\b/i;
const CARE_RE =
  /\b(care\s*(sheet|guide)|maintenance\s*guide|cleaning\s*(guide|instructions)|care\s*instructions)\b/i;
const SCOPE_RE =
  /\b(scope|proposal\s*narrative|fabrication\s*scope|draft\s*(a\s*)?scope|turn\s+that\s+into)\b/i;
const MACHINE_RE =
  /\b(chipping|chip|breakout|wandering|cnc|bridge\s*saw|troubleshoot|blade|miter)\b/i;
const REMNANT_RE = /\b(remnant|leftover\s+slab|marketing\s+(copy|listing)|social\s+post)\b/i;
const INVENTORY_RE =
  /\b(do\s+we\s+have|inventory|in\s+stock|on\s+(the\s+)?rack|find\s+(any\s+)?(material|slab|remnant))\b/i;
const BRIEF_RE = /\b(brief(ing)?|before\s+(i\s+)?call|account\s+snapshot|what.?s\s+going\s+on\s+with)\b/i;
const PULL_RE = /^\s*(pull\s+up|look\s+up|open)\b/i;
const THEIR_RE = /\b(their|they|them|that\s+account|this\s+account)\b/i;

/**
 * Strip instructional scaffolding so search uses the entity phrase employees actually mean.
 * Fixes: "Brief me on an account before I call them. 319 design" → "319 design"
 */
export function extractAccountSearchQuery(message: string): string | null {
  const m = String(message || "").trim();
  if (!m) return null;

  const quoted = m.match(/["“]([^"”]{2,80})["”]/);
  if (quoted) return quoted[1].trim().slice(0, 80);

  // Prefer content after a sentence break when the trailing segment looks like a name
  const segments = m
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length >= 2) {
    const last = stripInstructionNoise(segments[segments.length - 1]);
    if (last.length >= 2 && !isPureInstruction(last)) return last.slice(0, 80);
  }

  const cleaned = stripInstructionNoise(m)
    .replace(/^[.,;:\s-]+/, "")
    .replace(/[?.!]+$/g, "")
    .trim();
  if (cleaned.length >= 2 && !isPureInstruction(cleaned)) return cleaned.slice(0, 80);
  return null;
}

export function stripInstructionNoise(s: string): string {
  return String(s || "")
    .replace(/\bbefore\s+(i\s+)?call(\s+them)?\b/gi, " ")
    .replace(/\bbrief(\s+me)?(\s+on)?(\s+an?\s+account)?\b/gi, " ")
    .replace(/\bpull\s+up\b/gi, " ")
    .replace(/\blook\s+up\b/gi, " ")
    .replace(/\bopen\b/gi, " ")
    .replace(/\bwhat.?s\s+going\s+on\s+with\b/gi, " ")
    .replace(/\ban?\s+account\b/gi, " ")
    .replace(/\bin\s+our\s+system\b/gi, " ")
    .replace(/\bshow\s+me\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPureInstruction(s: string): boolean {
  const t = s.toLowerCase().trim();
  if (t.length < 2) return true;
  return /^(them|it|that|this|please|thanks|thank you|an account|account)$/i.test(t);
}

export function extractMaterialHint(message: string): string | null {
  const m = message.trim();
  const taj = m.match(/\b(Taj\s+Mahal|Calacatta\s+\w+|Whitendale|Brittanicca)\b/i);
  if (taj) return taj[1];
  const brand = m.match(
    /\b(Cambria|Cosentino|Silestone|MSI|HanStone|Caesarstone)\s+([A-Za-z0-9][\w -]{1,40})/i
  );
  if (brand) return `${brand[1]} ${brand[2]}`.replace(/\b(care|guide|sheet|job|quartz).*$/i, "").trim();
  return null;
}

/**
 * Deterministic planner — fallback / validation companion to the model planner.
 * Must handle the known production phrases without requiring an API key.
 */
export function buildDeterministicPlan(
  message: string,
  context: AssistantThreadContext = {}
): AssistantPlan {
  const m = message.trim();
  const accountName = extractAccountSearchQuery(m);
  const material = extractMaterialHint(m);
  const latest = LATEST_RE.test(m);
  const quoteNumberMatch = m.match(/\b(?:quote|estimate)\s+#?\s*([A-Z0-9][\w-]{2,40})/i);
  const quoteNumber = quoteNumberMatch?.[1] || null;

  // Ranking without a metric — never invent
  if (TOP_ACCOUNT_RE.test(m)) {
    return validateAssistantPlan({
      intent: "general",
      action: "clarify",
      entityHints: {},
      modifiers: {},
      needsClarification: true,
      clarificationQuestion:
        "Top by quote activity, active jobs, or another measure you define? I need a governed metric before ranking — finance measures stay unavailable unless that domain is separately authorized.",
      reasoningSummary: "Ranking requested without an authoritative metric.",
    })!;
  }

  if (CARE_RE.test(m)) {
    const brand = m.match(/\b(Cambria|Cosentino|Silestone|MSI|HanStone|Caesarstone)\b/i);
    const color = material?.replace(new RegExp(`^${brand?.[1] || ""}\\s*`, "i"), "").trim() || material;
    return plan("generate_stone_care", "stone_care", {
      accountName,
      material: /quartz/i.test(m) ? "Quartz" : material,
      manufacturer: brand?.[1] || null,
      productColor: color || null,
    });
  }

  if (SCOPE_RE.test(m) || (context.quoteId && /\b(scope|draft|customer[- ]ready|shorter|that)\b/i.test(m))) {
    return plan("generate_quote_scope", "quote_scope", { accountName, quoteNumber }, { latest });
  }

  if (MACHINE_RE.test(m)) {
    return plan("troubleshoot_machine", "machine_troubleshooter", { material, accountName });
  }

  if (REMNANT_RE.test(m)) {
    return plan("generate_remnant_marketing", "remnant_pitch", { material, productColor: material });
  }

  if (INVENTORY_RE.test(m)) {
    return plan("search_inventory", "inventory_search", {
      material: material || accountName || stripInstructionNoise(m).slice(0, 80),
    });
  }

  if (JOB_RE.test(m) && (THEIR_RE.test(m) || context.accountId || /\b(show|list|what|open)\b/i.test(m))) {
    return plan("list_account_jobs", "ops_lookup", { accountName }, { active: true, current: true });
  }

  if (QUOTE_RE.test(m) && (latest || /\b(show|find|pull|get|load)\b/i.test(m) || THEIR_RE.test(m))) {
    return plan("search_quote", "ops_lookup", { accountName, quoteNumber }, { latest: latest || THEIR_RE.test(m) });
  }

  if (BRIEF_RE.test(m) && !QUOTE_RE.test(m)) {
    return plan(
      "generate_account_brief",
      "account_brief",
      { accountName },
      {},
      !accountName && !context.accountId
        ? {
            needsClarification: true,
            clarificationQuestion: "Which account should I brief you on?",
          }
        : undefined
    );
  }

  if (PULL_RE.test(m) && !QUOTE_RE.test(m)) {
    return plan("load_account", "ops_lookup", { accountName });
  }

  if (accountName && !context.accountId) {
    // Bare-ish name with brief-like framing already handled; treat leftover as account lookup
    if (/\b(account|customer|builder|decor|design|homes?|built)\b/i.test(m) || /^[A-Z0-9]/.test(accountName)) {
      return plan("search_account", "ops_lookup", { accountName });
    }
  }

  if (context.accountId && /\b(brief|summarize|call)\b/i.test(m)) {
    return plan("generate_account_brief", "account_brief", { accountName: context.accountLabel });
  }

  return plan("general_answer", "general", { accountName, material, quoteNumber }, { latest });
}

function plan(
  action: PlannerAction,
  intent: AssistantPlan["intent"],
  entityHints: Record<string, string | null | undefined> = {},
  modifiers: Record<string, boolean | undefined> = {},
  extra?: { needsClarification?: boolean; clarificationQuestion?: string }
): AssistantPlan {
  const cleanedHints: Record<string, string> = {};
  for (const [k, v] of Object.entries(entityHints)) {
    if (v && String(v).trim()) cleanedHints[k] = String(v).trim().slice(0, 80);
  }
  return validateAssistantPlan({
    intent: intent || intentFromAction(action),
    action,
    entityHints: cleanedHints,
    modifiers,
    needsClarification: Boolean(extra?.needsClarification),
    clarificationQuestion: extra?.clarificationQuestion || null,
    reasoningSummary: null,
  })!;
}
