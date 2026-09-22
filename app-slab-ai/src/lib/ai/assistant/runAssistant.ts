import { brainFetch } from "@/lib/auth/resolveContext";
import type { SlabAIAuthContext } from "@/lib/ai/executionContext";
import {
  classifyIntent,
  defaultFollowUps,
  extractEntityHints,
  inferMachineFields,
  inferStoneCareFields,
} from "./intent";
import type { AssistantThreadContext, AssistantTurnResult, DisambiguationOption } from "./types";

function LATEST_QUOTE_NEED(message: string): boolean {
  return /\b(latest|recent|last)\s+quote\b/i.test(message) || /\bshow\s+me\s+their\b/i.test(message);
}

export type AssistantTurnInput = {
  message: string;
  context?: AssistantThreadContext;
  /** User selected an ambiguous entity */
  selectedEntity?: { domain: "account" | "quote"; id: string; label: string };
  /** Answers to prior clarify questions */
  clarifyAnswers?: Record<string, string>;
  auth: SlabAIAuthContext;
};

async function searchAccounts(auth: SlabAIAuthContext, q: string) {
  if (auth.authMode === "dev_bypass" || !auth.accessToken) {
    return { items: [] as DisambiguationOption[], ambiguous: false, error: "Account search requires Brain auth." };
  }
  try {
    const res = await brainFetch(`/api/slab-ai/accounts/search?q=${encodeURIComponent(q)}&limit=8`, auth);
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{ accountId: string; label?: string; accountName?: string; locationHint?: string }>;
      ambiguous?: boolean;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      return { items: [], ambiguous: false, error: data.error || "Account search unavailable", code: data.code };
    }
    const items = (data.items || []).map((i) => ({
      id: i.accountId,
      label: i.label || i.accountName || i.accountId,
      meta: i.locationHint || undefined,
    }));
    return { items, ambiguous: Boolean(data.ambiguous) || items.length > 1, error: undefined };
  } catch (e) {
    return { items: [], ambiguous: false, error: (e as Error).message };
  }
}

async function searchQuotes(auth: SlabAIAuthContext, q: string, accountId?: string | null) {
  if (auth.authMode === "dev_bypass" || !auth.accessToken) {
    return { items: [] as DisambiguationOption[], error: "Quote search requires Brain auth." };
  }
  try {
    const params = new URLSearchParams({ q, limit: "8" });
    if (accountId) params.set("accountId", accountId);
    const res = await brainFetch(`/api/slab-ai/quotes/search?${params}`, auth);
    const data = (await res.json().catch(() => ({}))) as {
      rows?: Array<{ quoteId: string; quoteNumber?: string | null; projectName?: string | null; customerName?: string | null }>;
      items?: Array<{ quoteId: string; quoteNumber?: string | null; projectName?: string | null; customerName?: string | null }>;
      error?: string;
    };
    if (!res.ok) return { items: [], error: data.error || "Quote search unavailable" };
    const rows = data.items || data.rows || [];
    return {
      items: rows.map((r) => ({
        id: r.quoteId,
        label: r.quoteNumber || r.projectName || r.quoteId.slice(0, 8),
        meta: [r.customerName, r.projectName].filter(Boolean).join(" · ") || undefined,
      })),
      error: undefined,
    };
  } catch (e) {
    return { items: [], error: (e as Error).message };
  }
}

async function searchMaterials(auth: SlabAIAuthContext, q: string) {
  if (auth.authMode === "dev_bypass" || !auth.accessToken) {
    return { message: "Inventory search requires Brain auth and slab_inventory access.", items: [] as string[] };
  }
  try {
    const res = await brainFetch(`/api/slab-ai/materials/search?q=${encodeURIComponent(q)}&limit=8`, auth);
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{ colorName?: string; materialName?: string; dimensions?: string; rack?: string; materialId?: string }>;
      error?: string;
      code?: string;
      truncated?: boolean;
    };
    if (res.status === 403) {
      return {
        message: "Material inventory search requires slab_inventory head access in addition to slabOS AI.",
        items: [] as string[],
      };
    }
    if (!res.ok) return { message: data.error || "Inventory search unavailable.", items: [] as string[] };
    const lines = (data.items || []).map((i) =>
      [i.colorName || i.materialName, i.dimensions, i.rack ? `rack ${i.rack}` : null].filter(Boolean).join(" · ")
    );
    const note = data.truncated
      ? " Results are truncated — this is not a complete inventory listing."
      : "";
    if (!lines.length) {
      return {
        message: `No matching active inventory rows were found for “${q}” in the Brain cache. Quantities are never invented.`,
        items: [],
      };
    }
    return {
      message: `Here is what the governed inventory cache returned for “${q}” (not a live vendor call).${note}`,
      items: lines,
      sources: (data.items || [])
        .filter((i) => i.materialId)
        .map((i) => ({
          type: "inventory",
          entityId: String(i.materialId),
          label: i.colorName || i.materialName || String(i.materialId),
        })),
    };
  } catch (e) {
    return { message: (e as Error).message, items: [] as string[] };
  }
}

/**
 * Decide the next assistant turn — clarify, disambiguate, generate a skill, or answer ops lookup.
 * Does not call write actions.
 */
export async function planAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  let context: AssistantThreadContext = { ...(input.context || {}) };
  const message = String(input.message || "").trim();
  if (!message && !input.selectedEntity && !input.clarifyAnswers) {
    return {
      mode: "message",
      intent: "general",
      message: "Ask slabOS anything about your work — accounts, quotes, shop issues, care guides, or material.",
      context,
      followUps: defaultFollowUps("general", context),
    };
  }

  if (input.selectedEntity?.domain === "account") {
    context = {
      ...context,
      accountId: input.selectedEntity.id,
      accountLabel: input.selectedEntity.label,
    };
    if (!message || /^\s*(pull\s+up|look\s+up|open|continue)\b/i.test(message) || message === "continue") {
      return {
        mode: "message",
        intent: "ops_lookup",
        message: `Loaded **${input.selectedEntity.label}**. Ask about their quotes, open jobs, or say “brief me” before a call.`,
        context,
        operationalSources: [
          { type: "account", entityId: input.selectedEntity.id, label: input.selectedEntity.label },
        ],
        followUps: defaultFollowUps("ops_lookup", context),
      };
    }
  }
  if (input.selectedEntity?.domain === "quote") {
    context = {
      ...context,
      quoteId: input.selectedEntity.id,
      quoteLabel: input.selectedEntity.label,
    };
    if (!message || message === "continue") {
      return {
        mode: "message",
        intent: "ops_lookup",
        message: `Loaded quote **${input.selectedEntity.label}**. Ask me to draft a customer-ready scope, or ask another question.`,
        context,
        operationalSources: [
          { type: "quote", entityId: input.selectedEntity.id, label: input.selectedEntity.label },
        ],
        followUps: defaultFollowUps("ops_lookup", context),
      };
    }
  }

  const intent = classifyIntent(message || "continue", context);
  const hints = extractEntityHints(message);

  // Merge clarify answers into a synthetic field bag
  const answers = input.clarifyAnswers || {};

  // --- Account resolution ---
  const wantsAccount =
    !context.accountId &&
    (hints.accountHint ||
      intent === "account_brief" ||
      (/^\s*(pull\s+up|look\s+up|open|brief|what.?s\s+going\s+on\s+with)\b/i.test(message) &&
        !hints.quoteHint));

  if (wantsAccount) {
    const q =
      hints.accountHint ||
      message
        .replace(
          /^(pull\s+up|look\s+up|open|brief\s+me\s+on|briefing\s+for|what.?s\s+going\s+on\s+with)\s+/i,
          ""
        )
        .replace(/[?.!]+$/, "")
        .trim();
    if (q && q.length >= 2) {
      const found = await searchAccounts(input.auth, q.slice(0, 80));
      if (found.error && found.code === "DOMAIN_HEAD_REQUIRED") {
        return {
          mode: "message",
          intent,
          message:
            "Account lookup requires Account Directory access in addition to slabOS AI. I can still help with knowledge and drafting if you paste an account ID you are authorized to use.",
          context,
          followUps: defaultFollowUps(intent, context),
        };
      }
      if (found.items.length === 0) {
        return {
          mode: "message",
          intent,
          message:
            found.error ||
            `I couldn’t find an Account Directory match for “${q}”. Try a fuller name or confirm Account Directory access.`,
          context,
          followUps: defaultFollowUps(intent, context),
        };
      }
      if (found.items.length > 1 || found.ambiguous) {
        return {
          mode: "disambiguate",
          intent,
          message: `I found multiple accounts matching “${q}”. Select the correct one — I will not guess.`,
          domain: "account",
          options: found.items,
          context,
        };
      }
      context = {
        ...context,
        accountId: found.items[0].id,
        accountLabel: found.items[0].label,
      };
      // Plain pull-up: load context and stop (follow-ups drive next step)
      if (intent === "ops_lookup" && !LATEST_QUOTE_NEED(message) && !hints.quoteHint) {
        return {
          mode: "message",
          intent,
          message: `Loaded **${found.items[0].label}** from Account Directory. Ask about their quotes, open jobs, or say “brief me” before a call.`,
          context,
          operationalSources: [
            { type: "account", entityId: found.items[0].id, label: found.items[0].label },
          ],
          followUps: defaultFollowUps(intent, context),
        };
      }
    }
  }

  // --- Quote resolution ---
  if (intent === "ops_lookup" && (/quote/i.test(message) || hints.quoteHint)) {
    const found = await searchQuotes(input.auth, (hints.quoteHint || "quote").slice(0, 80), context.accountId);
    // If user asked for latest quote with account context, search by account name or use account filter with broad query
    const quoteSearch =
      context.accountId
        ? await searchQuotes(input.auth, hints.quoteHint || context.accountLabel || "a", context.accountId)
        : found;
    const items = quoteSearch.items.length ? quoteSearch.items : found.items;
    if (!items.length) {
      return {
        mode: "message",
        intent,
        message: context.accountLabel
          ? `No recent quotes were returned for ${context.accountLabel} in the authorized Quote Library search.`
          : quoteSearch.error || "No quotes matched. Try a quote number.",
        context,
        followUps: defaultFollowUps(intent, context),
      };
    }
    if (items.length > 1 && !hints.quoteHint) {
      return {
        mode: "disambiguate",
        intent,
        message: context.accountLabel
          ? `Here are recent quotes for ${context.accountLabel}. Select one to continue.`
          : "Multiple quotes matched. Select one.",
        domain: "quote",
        options: items.slice(0, 8),
        context,
      };
    }
    context = {
      ...context,
      quoteId: items[0].id,
      quoteLabel: items[0].label,
    };
    return {
      mode: "message",
      intent,
      message: `Loaded quote **${items[0].label}**${items[0].meta ? ` (${items[0].meta})` : ""}. Ask me to draft a customer-ready scope, or ask another question about this work.`,
      context,
      operationalSources: [{ type: "quote", entityId: items[0].id, label: items[0].label }],
      followUps: defaultFollowUps(intent, context),
    };
  }

  // --- Inventory ---
  if (intent === "inventory_search") {
    const q = hints.productColor || hints.material || message.replace(/do we have|any|remnants?|that could work.*/i, "").trim().slice(0, 80);
    const inv = await searchMaterials(input.auth, q || "slab");
    return {
      mode: "message",
      intent,
      message: [inv.message, ...(inv.items || []).map((l) => `• ${l}`)].join("\n"),
      context: { ...context, materialLabel: q || context.materialLabel },
      operationalSources: inv.sources,
      followUps: defaultFollowUps(intent, context),
    };
  }

  // --- Stone care ---
  if (intent === "stone_care") {
    const inferred = inferStoneCareFields(message, hints);
    for (const [k, v] of Object.entries(answers)) {
      if (v) inferred.fields[k] = v;
    }
    const stillMissing = inferred.missing.filter((q) => {
      const val = inferred.fields[q.field || q.id];
      return !val || String(val).trim() === "";
    });
    // application still required
    if (!inferred.fields.application) {
      if (!stillMissing.some((m) => m.id === "application")) {
        stillMissing.push({
          id: "application",
          field: "application",
          prompt: "Is this for a kitchen countertop, vanity, shower, or another application?",
        });
      }
    }
    if (stillMissing.length && !Object.keys(answers).length) {
      return {
        mode: "clarify",
        intent,
        message: `I can draft a care guide for ${[inferred.fields.manufacturer, inferred.fields.productColor].filter(Boolean).join(" ") || "that material"}. I only need a couple of details:`,
        questions: stillMissing.slice(0, 3),
        context,
        suggestedFields: inferred.fields,
      };
    }
    if (stillMissing.length && Object.keys(answers).length) {
      // still missing after answers
      return {
        mode: "clarify",
        intent,
        message: "Still need a bit more before I draft the care guide:",
        questions: stillMissing.slice(0, 3),
        context,
        suggestedFields: inferred.fields,
      };
    }
    return {
      mode: "generate",
      intent,
      skillId: "stone-care",
      formData: inferred.fields,
      context: { ...context, lastSkillId: "stone-care", materialLabel: String(inferred.fields.productColor || "") },
      assistantNote: "Inferring manufacturer/product from your request. Approved manufacturer docs are preferred when loaded in Knowledge Hub.",
    };
  }

  // --- Machine ---
  if (intent === "machine_troubleshooter") {
    const inferred = inferMachineFields(message);
    for (const [k, v] of Object.entries(answers)) {
      if (v) inferred.fields[k] = v;
    }
    const stillMissing = inferred.missing.filter((q) => !inferred.fields[q.field || q.id]);
    if (stillMissing.length && Object.keys(answers).length < inferred.missing.length) {
      const pending = stillMissing.filter((q) => !answers[q.field || q.id]);
      if (pending.length) {
        return {
          mode: "clarify",
          intent,
          message: "I can help diagnose safely. A few clarifiers will improve the guidance:",
          questions: pending.slice(0, 3),
          context,
          suggestedFields: inferred.fields,
        };
      }
    }
    // Ensure required fields have values
    if (!inferred.fields.manufacturer) inferred.fields.manufacturer = "Unknown";
    if (!inferred.fields.model) inferred.fields.model = String(inferred.fields.manufacturer);
    if (!inferred.fields.material) inferred.fields.material = "Stone";
    if (!inferred.fields.bladeOrTool) inferred.fields.bladeOrTool = "As installed (unspecified)";
    return {
      mode: "generate",
      intent,
      skillId: "machine-troubleshooter",
      formData: inferred.fields,
      context: { ...context, lastSkillId: "machine-troubleshooter" },
    };
  }

  // --- Account brief ---
  if (intent === "account_brief") {
    if (!context.accountId) {
      return {
        mode: "clarify",
        intent,
        message: "Which account should I brief you on? Name the customer and I’ll search Account Directory.",
        questions: [{ id: "accountSearch", prompt: "Account name" }],
        context,
      };
    }
    return {
      mode: "generate",
      intent,
      skillId: "account-brief",
      formData: {
        accountId: context.accountId,
        accountSearch: context.accountLabel || "",
        focusQuestion: message,
      },
      context: { ...context, lastSkillId: "account-brief" },
    };
  }

  // --- Quote scope ---
  if (intent === "quote_scope") {
    if (!context.quoteId && !hints.quoteHint) {
      if (context.accountId) {
        const quotes = await searchQuotes(input.auth, context.accountLabel || "a", context.accountId);
        if (quotes.items.length > 1) {
          return {
            mode: "disambiguate",
            intent,
            message: "Which quote should I draft scope from?",
            domain: "quote",
            options: quotes.items.slice(0, 8),
            context,
          };
        }
        if (quotes.items.length === 1) {
          context = { ...context, quoteId: quotes.items[0].id, quoteLabel: quotes.items[0].label };
        }
      }
    }
    if (!context.quoteId) {
      return {
        mode: "clarify",
        intent,
        message: "Load a quote first (quote number or select from an account), or open the Quote Scope skill for a full manual intake.",
        questions: [{ id: "quoteHint", prompt: "Quote number or customer/project name" }],
        context,
      };
    }
    // Minimal valid quote-scope form — narrative driven by loaded quote + message
    return {
      mode: "generate",
      intent,
      skillId: "quote-scope",
      formData: {
        customerProjectName: context.accountLabel || context.quoteLabel || "Project",
        projectType: "other",
        roomArea: "As described on the loaded quote",
        materialColor: "Per loaded quote",
        thickness: "3 cm",
        edgeProfile: "Per loaded quote",
        sinkCutouts: 0,
        cooktopCutouts: 0,
        faucetHoles: 0,
        templateRequired: true,
        installationRequired: true,
        tearOut: false,
        projectNotes: message,
        loadedQuoteId: context.quoteId,
        loadedAccountId: context.accountId || "",
      },
      context: { ...context, lastSkillId: "quote-scope" },
      assistantNote: "Drafting from the loaded quote record. Pricing stays in eliteOS quote systems — this is narrative scope only.",
    };
  }

  // --- Remnant ---
  if (intent === "remnant_pitch") {
    const fields: Record<string, unknown> = {
      materialType: hints.material || "Quartzite",
      manufacturer: hints.manufacturer || "",
      colorName: hints.productColor || answers.colorName || "",
      lengthIn: answers.lengthIn ? Number(answers.lengthIn) : undefined,
      widthIn: answers.widthIn ? Number(answers.widthIn) : undefined,
      thickness: "3 cm",
      finish: "Polished",
      quantity: 1,
      possibleApplication: "vanity",
      notes: message.slice(0, 500),
    };
    const missing: Array<{ id: string; field: string; prompt: string }> = [];
    if (!fields.colorName) missing.push({ id: "colorName", field: "colorName", prompt: "Color / name?" });
    if (!fields.lengthIn) missing.push({ id: "lengthIn", field: "lengthIn", prompt: "Length (inches)?" });
    if (!fields.widthIn) missing.push({ id: "widthIn", field: "widthIn", prompt: "Width (inches)?" });
    if (missing.length) {
      return {
        mode: "clarify",
        intent,
        message:
          "I can draft remnant marketing copy. Share material color and size (L × W inches), or open the Remnant Marketing skill.",
        questions: missing.slice(0, 3),
        context,
        suggestedFields: fields,
      };
    }
    return {
      mode: "generate",
      intent,
      skillId: "remnant-pitch",
      formData: fields,
      context: { ...context, lastSkillId: "remnant-pitch", materialLabel: String(fields.colorName) },
    };
  }

  // --- General ---
  return {
    mode: "message",
    intent,
    message: context.accountLabel
      ? `I have **${context.accountLabel}** in context${context.quoteLabel ? ` and quote **${context.quoteLabel}**` : ""}. Try: “Show me their latest quote”, “Draft a scope”, or ask a shop/care question.`
      : "I can brief accounts, draft quote scope, troubleshoot shop issues, create care guides, and search inventory — using only governed company data and approved knowledge. What do you need?",
    context,
    followUps: defaultFollowUps(intent, context),
  };
}
