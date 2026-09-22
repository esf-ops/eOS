import { brainFetch } from "@/lib/auth/resolveContext";
import type { SlabAIAuthContext } from "@/lib/ai/executionContext";
import {
  defaultFollowUps,
  inferMachineFields,
  inferStoneCareFields,
  extractEntityHints,
} from "./intent";
import { planWithModel } from "./modelPlan";
import { extractAccountSearchQuery } from "./deterministicPlan";
import type { AssistantPlan } from "./plannerSchema";
import type { AssistantIntent, AssistantThreadContext, AssistantTurnResult, DisambiguationOption } from "./types";

export type AssistantTurnInput = {
  message: string;
  context?: AssistantThreadContext;
  selectedEntity?: { domain: "account" | "quote"; id: string; label: string };
  clarifyAnswers?: Record<string, string>;
  auth: SlabAIAuthContext;
};

type QuoteSearchItem = DisambiguationOption & { updatedAt?: string | null };

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
    return { items, ambiguous: Boolean(data.ambiguous) || items.length > 1, error: undefined as string | undefined };
  } catch (e) {
    return { items: [], ambiguous: false, error: (e as Error).message };
  }
}

async function searchQuotes(
  auth: SlabAIAuthContext,
  q: string,
  accountId?: string | null
): Promise<{ items: QuoteSearchItem[]; error?: string; orderedByUpdatedAt: boolean }> {
  if (auth.authMode === "dev_bypass" || !auth.accessToken) {
    return { items: [], error: "Quote search requires Brain auth.", orderedByUpdatedAt: false };
  }
  try {
    const params = new URLSearchParams({ q, limit: "8" });
    if (accountId) params.set("accountId", accountId);
    const res = await brainFetch(`/api/slab-ai/quotes/search?${params}`, auth);
    const data = (await res.json().catch(() => ({}))) as {
      rows?: Array<{
        quoteId: string;
        quoteNumber?: string | null;
        projectName?: string | null;
        customerName?: string | null;
        updatedAt?: string | null;
      }>;
      items?: Array<{
        quoteId: string;
        quoteNumber?: string | null;
        projectName?: string | null;
        customerName?: string | null;
        updatedAt?: string | null;
      }>;
      error?: string;
    };
    if (!res.ok) return { items: [], error: data.error || "Quote search unavailable", orderedByUpdatedAt: false };
    const rows = data.items || data.rows || [];
    const items: QuoteSearchItem[] = rows.map((r) => {
      const updatedAt = r.updatedAt ?? null;
      const when = updatedAt ? `updated ${String(updatedAt).slice(0, 10)}` : null;
      return {
        id: r.quoteId,
        label: r.quoteNumber || r.projectName || "Quote",
        meta: [r.customerName, r.projectName, when].filter(Boolean).join(" · ") || undefined,
        updatedAt,
      };
    });
    const orderedByUpdatedAt = items.length > 0 && items.every((i) => Boolean(i.updatedAt));
    return { items, error: undefined, orderedByUpdatedAt };
  } catch (e) {
    return { items: [], error: (e as Error).message, orderedByUpdatedAt: false };
  }
}

async function listAccountJobs(auth: SlabAIAuthContext, accountId: string) {
  if (auth.authMode === "dev_bypass" || !auth.accessToken) {
    return { message: "Job listing requires Brain auth and Account Directory access.", items: [] as string[] };
  }
  try {
    const res = await brainFetch(`/api/slab-ai/accounts/${accountId}/jobs?limit=10`, auth);
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{ jobId?: string; jobName?: string; status?: string; phase?: string }>;
      error?: string;
      code?: string;
    };
    if (res.status === 403) {
      return {
        message: "Listing jobs requires Account Directory access in addition to slabOS AI.",
        items: [] as string[],
      };
    }
    if (!res.ok) return { message: data.error || "Job listing unavailable.", items: [] as string[] };
    const lines = (data.items || []).map((j) =>
      [j.jobName || j.jobId, j.status, j.phase].filter(Boolean).join(" · ")
    );
    if (!lines.length) {
      return {
        message: "No prepared Moraware jobs were returned for this account in the authorized view.",
        items: [],
      };
    }
    return {
      message: "Open / recent jobs from governed Moraware prepared facts (read-only):",
      items: lines,
      sources: (data.items || [])
        .filter((j) => j.jobId)
        .map((j) => ({
          type: "job",
          entityId: String(j.jobId),
          label: j.jobName || String(j.jobId),
        })),
    };
  } catch (e) {
    return { message: (e as Error).message, items: [] as string[] };
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

async function resolveAccount(
  auth: SlabAIAuthContext,
  query: string,
  intent: AssistantIntent,
  context: AssistantThreadContext
): Promise<
  | { ok: true; context: AssistantThreadContext; item: DisambiguationOption }
  | { ok: false; result: AssistantTurnResult }
> {
  const found = await searchAccounts(auth, query.slice(0, 80));
  if (found.error && found.code === "DOMAIN_HEAD_REQUIRED") {
    return {
      ok: false,
      result: {
        mode: "message",
        intent,
        message:
          "Account lookup requires Account Directory access in addition to slabOS AI. I can still help with knowledge and drafting if you paste an account ID you are authorized to use.",
        context,
        followUps: defaultFollowUps(intent, context),
      },
    };
  }
  if (!found.items.length) {
    return {
      ok: false,
      result: {
        mode: "message",
        intent,
        message:
          found.error ||
          `I couldn’t find an Account Directory match for “${query}”. Try a fuller name or confirm Account Directory access.`,
        context,
        followUps: defaultFollowUps(intent, context),
      },
    };
  }
  if (found.items.length > 1 || found.ambiguous) {
    return {
      ok: false,
      result: {
        mode: "disambiguate",
        intent,
        message: `I found multiple accounts matching “${query}”. Select the correct one — I will not guess.`,
        domain: "account",
        options: found.items,
        context,
      },
    };
  }
  const item = found.items[0];
  return {
    ok: true,
    item,
    context: { ...context, accountId: item.id, accountLabel: item.label },
  };
}

function loadQuoteResult(
  item: QuoteSearchItem,
  intent: AssistantIntent,
  context: AssistantThreadContext,
  latest: boolean
): AssistantTurnResult {
  const next = { ...context, quoteId: item.id, quoteLabel: item.label };
  const when = item.updatedAt ? ` (updated ${String(item.updatedAt).slice(0, 10)})` : "";
  return {
    mode: "message",
    intent,
    message: latest
      ? `Loaded the most recent quote **${item.label}**${when}${item.meta ? ` — ${item.meta}` : ""}. Ask me to draft a customer-ready scope, or ask another question.`
      : `Loaded quote **${item.label}**${when}${item.meta ? ` — ${item.meta}` : ""}. Ask me to draft a customer-ready scope, or ask another question about this work.`,
    context: next,
    operationalSources: [{ type: "quote", entityId: item.id, label: item.label }],
    followUps: defaultFollowUps(intent, next),
  };
}

/**
 * Decide the next assistant turn via constrained planner → typed execution.
 * Does not call write actions. LLM never gets database access.
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

  const { plan } = await planWithModel(message || "continue", context);
  const answers = input.clarifyAnswers || {};
  const intent = plan.intent;
  const hints = {
    ...extractEntityHints(message),
    accountHint: plan.entityHints?.accountName || extractAccountSearchQuery(message) || undefined,
    quoteHint: plan.entityHints?.quoteNumber || undefined,
    material: plan.entityHints?.material || undefined,
    manufacturer: plan.entityHints?.manufacturer || undefined,
    productColor: plan.entityHints?.productColor || undefined,
  };
  const latest = Boolean(plan.modifiers?.latest);

  if (plan.needsClarification && plan.action === "clarify") {
    return {
      mode: "clarify",
      intent,
      message: plan.clarificationQuestion || "I need a bit more detail before I can help.",
      questions: [
        {
          id: "clarification",
          prompt: plan.clarificationQuestion || "What did you mean?",
        },
      ],
      context,
    };
  }

  // Resolve account when the plan needs one and we have a name hint
  const needsAccountResolve =
    !context.accountId &&
    Boolean(hints.accountHint) &&
    [
      "search_account",
      "load_account",
      "generate_account_brief",
      "list_account_jobs",
      "search_quote",
      "generate_quote_scope",
    ].includes(plan.action);

  if (needsAccountResolve && hints.accountHint) {
    const resolved = await resolveAccount(input.auth, hints.accountHint, intent, context);
    if (!resolved.ok) return resolved.result;
    context = resolved.context;
    if (plan.action === "search_account" || plan.action === "load_account") {
      return {
        mode: "message",
        intent,
        message: `Loaded **${resolved.item.label}** from Account Directory. Ask about their quotes, open jobs, or say “brief me” before a call.`,
        context,
        operationalSources: [
          { type: "account", entityId: resolved.item.id, label: resolved.item.label },
        ],
        followUps: defaultFollowUps(intent, context),
      };
    }
  }

  return executePlan(plan, {
    message,
    context,
    answers,
    hints,
    latest,
    auth: input.auth,
    intent,
  });
}

async function executePlan(
  plan: AssistantPlan,
  opts: {
    message: string;
    context: AssistantThreadContext;
    answers: Record<string, string>;
    hints: ReturnType<typeof extractEntityHints> & { accountHint?: string; quoteHint?: string };
    latest: boolean;
    auth: SlabAIAuthContext;
    intent: AssistantIntent;
  }
): Promise<AssistantTurnResult> {
  const { message, answers, hints, latest, auth, intent } = opts;
  let { context } = opts;

  switch (plan.action) {
    case "clarify": {
      return {
        mode: "clarify",
        intent,
        message: plan.clarificationQuestion || "I need a bit more detail.",
        questions: [{ id: "clarification", prompt: plan.clarificationQuestion || "What did you mean?" }],
        context,
      };
    }

    case "search_account":
    case "load_account": {
      if (context.accountId) {
        return {
          mode: "message",
          intent,
          message: `**${context.accountLabel}** is already in context. Ask about quotes, jobs, or say “brief me”.`,
          context,
          operationalSources: [
            { type: "account", entityId: context.accountId, label: context.accountLabel || context.accountId },
          ],
          followUps: defaultFollowUps(intent, context),
        };
      }
      const q = hints.accountHint || extractAccountSearchQuery(message);
      if (!q) {
        return {
          mode: "clarify",
          intent,
          message: "Which account should I look up?",
          questions: [{ id: "accountSearch", prompt: "Account name" }],
          context,
        };
      }
      const resolved = await resolveAccount(auth, q, intent, context);
      if (!resolved.ok) return resolved.result;
      return {
        mode: "message",
        intent,
        message: `Loaded **${resolved.item.label}** from Account Directory.`,
        context: resolved.context,
        operationalSources: [
          { type: "account", entityId: resolved.item.id, label: resolved.item.label },
        ],
        followUps: defaultFollowUps(intent, resolved.context),
      };
    }

    case "list_account_jobs": {
      if (!context.accountId) {
        const q = hints.accountHint || extractAccountSearchQuery(message);
        if (q) {
          const resolved = await resolveAccount(auth, q, intent, context);
          if (!resolved.ok) return resolved.result;
          context = resolved.context;
        } else {
          return {
            mode: "clarify",
            intent,
            message: "Which account’s jobs should I list?",
            questions: [{ id: "accountSearch", prompt: "Account name" }],
            context,
          };
        }
      }
      const jobs = await listAccountJobs(auth, context.accountId!);
      return {
        mode: "message",
        intent,
        message: [`**${context.accountLabel}**`, jobs.message, ...jobs.items.map((l) => `• ${l}`)].join("\n"),
        context,
        operationalSources: [
          { type: "account", entityId: context.accountId!, label: context.accountLabel || context.accountId! },
          ...(jobs.sources || []),
        ],
        followUps: defaultFollowUps(intent, context),
      };
    }

    case "search_quote":
    case "load_quote": {
      const q =
        hints.quoteHint ||
        (context.accountId ? context.accountLabel || "quote" : "quote").slice(0, 80);
      const quoteSearch = await searchQuotes(auth, q.length >= 2 ? q : "es", context.accountId);
      const items = quoteSearch.items;
      if (!items.length) {
        return {
          mode: "message",
          intent,
          message: context.accountLabel
            ? `No quotes were returned for ${context.accountLabel} in the authorized Quote Library search.`
            : quoteSearch.error || "No quotes matched. Try a quote number.",
          context,
          followUps: defaultFollowUps(intent, context),
        };
      }

      // Explicit latest/most recent/last → take authoritative newest (#1 when sorted by updated_at)
      if (latest) {
        if (!quoteSearch.orderedByUpdatedAt && !items[0]?.updatedAt) {
          return {
            mode: "message",
            intent,
            message:
              "I can’t determine the newest quote because authoritative updated timestamps were not available on the search results.",
            context,
            followUps: defaultFollowUps(intent, context),
          };
        }
        return loadQuoteResult(items[0], intent, context, true);
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
      return loadQuoteResult(items[0], intent, context, false);
    }

    case "search_inventory": {
      const q =
        hints.productColor ||
        hints.material ||
        plan.entityHints?.material ||
        message.replace(/do we have|any|remnants?|that could work.*/i, "").trim().slice(0, 80);
      const inv = await searchMaterials(auth, q || "slab");
      return {
        mode: "message",
        intent,
        message: [inv.message, ...(inv.items || []).map((l) => `• ${l}`)].join("\n"),
        context: { ...context, materialLabel: q || context.materialLabel },
        operationalSources: inv.sources,
        followUps: defaultFollowUps(intent, context),
      };
    }

    case "generate_stone_care": {
      const inferred = inferStoneCareFields(message, {
        manufacturer: hints.manufacturer,
        productColor: hints.productColor,
        material: hints.material,
      });
      for (const [k, v] of Object.entries(answers)) {
        if (v) inferred.fields[k] = v;
      }
      const stillMissing = inferred.missing.filter((q) => {
        const val = inferred.fields[q.field || q.id];
        return !val || String(val).trim() === "";
      });
      if (!inferred.fields.application && !stillMissing.some((m) => m.id === "application")) {
        stillMissing.push({
          id: "application",
          field: "application",
          prompt: "Is this for a kitchen countertop, vanity, shower, or another application?",
        });
      }
      if (stillMissing.length) {
        return {
          mode: "clarify",
          intent,
          message: `I can draft a care guide for ${[inferred.fields.manufacturer, inferred.fields.productColor].filter(Boolean).join(" ") || "that material"}. I only need a couple of details:`,
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
        context: {
          ...context,
          lastSkillId: "stone-care",
          materialLabel: String(inferred.fields.productColor || ""),
        },
        assistantNote:
          "Inferring manufacturer/product from your request. Approved manufacturer docs are preferred when loaded in Knowledge Hub.",
      };
    }

    case "troubleshoot_machine": {
      const inferred = inferMachineFields(message);
      for (const [k, v] of Object.entries(answers)) {
        if (v) inferred.fields[k] = v;
      }
      const stillMissing = inferred.missing.filter((q) => !inferred.fields[q.field || q.id]);
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

    case "generate_account_brief": {
      if (!context.accountId) {
        const q = hints.accountHint || extractAccountSearchQuery(message);
        if (q) {
          const resolved = await resolveAccount(auth, q, intent, context);
          if (!resolved.ok) return resolved.result;
          context = resolved.context;
        } else {
          return {
            mode: "clarify",
            intent,
            message: "Which account should I brief you on? Name the customer and I’ll search Account Directory.",
            questions: [{ id: "accountSearch", prompt: "Account name" }],
            context,
          };
        }
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

    case "generate_quote_scope": {
      if (!context.quoteId) {
        if (context.accountId) {
          const quotes = await searchQuotes(auth, context.accountLabel || "es", context.accountId);
          if (latest && quotes.items[0]) {
            context = {
              ...context,
              quoteId: quotes.items[0].id,
              quoteLabel: quotes.items[0].label,
            };
          } else if (quotes.items.length === 1) {
            context = {
              ...context,
              quoteId: quotes.items[0].id,
              quoteLabel: quotes.items[0].label,
            };
          } else if (quotes.items.length > 1) {
            return {
              mode: "disambiguate",
              intent,
              message: "Which quote should I draft scope from?",
              domain: "quote",
              options: quotes.items.slice(0, 8),
              context,
            };
          }
        }
      }
      if (!context.quoteId) {
        return {
          mode: "clarify",
          intent,
          message:
            "Load a quote first (quote number or select from an account), or open the Quote Scope skill for a full manual intake.",
          questions: [{ id: "quoteHint", prompt: "Quote number or customer/project name" }],
          context,
        };
      }
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
        assistantNote:
          "Drafting from the loaded quote record. Pricing stays in eliteOS quote systems — this is narrative scope only.",
      };
    }

    case "generate_remnant_marketing": {
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

    case "search_knowledge":
    case "load_job":
    case "general_answer":
    default: {
      if (context.accountLabel) {
        return {
          mode: "message",
          intent,
          message: `I have **${context.accountLabel}** in context${
            context.quoteLabel ? ` and quote **${context.quoteLabel}**` : ""
          }. Try: “Show me their latest quote”, “What jobs do they have?”, “Draft a scope”, or ask a shop/care question.`,
          context,
          followUps: defaultFollowUps(intent, context),
        };
      }
      return {
        mode: "message",
        intent,
        message:
          plan.reasoningSummary ||
          "I can help with accounts, quotes, jobs, inventory, care guides, and shop diagnostics using governed company data and approved knowledge. What do you need?",
        context,
        followUps: defaultFollowUps(intent, context),
      };
    }
  }
}
