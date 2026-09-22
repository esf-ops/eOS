import { z } from "zod";
import type { SlabAIAuthContext, SlabAIExecutionContext } from "@/lib/ai/executionContext";
import { brainFetch } from "@/lib/auth/resolveContext";
import { recordTelemetry } from "@/lib/ai/telemetry";

export type ActionMode = "read" | "write";
export type ActionDomain = "quote" | "account" | "job" | "production" | "inventory" | "finance";

export type SlabAIActionDefinition<TIn, TOut> = {
  name: string;
  description: string;
  mode: ActionMode;
  domain: ActionDomain;
  requiredHead?: string;
  requiredRoles?: string[];
  inputSchema: z.ZodType<TIn>;
  execute: (input: TIn, context: SlabAIExecutionContext, auth: SlabAIAuthContext) => Promise<TOut>;
};

export type AiQuoteListItem = {
  quoteId: string;
  quoteNumber: string | null;
  status: string | null;
  accountName: string | null;
  accountDirectoryAccountId?: string | null;
  customerName: string | null;
  projectName: string | null;
  projectAddress: string | null;
  estimatedSqft: number | null;
  recordedTotal: number | null;
  salesRep?: string | null;
  branch?: string | null;
  note?: string;
};

export type AiQuoteDetail = AiQuoteListItem & {
  rooms: Array<{ name: string | null; notes: string | null }>;
  lineHints: Array<{ description: string | null; quantity: number | null; unit: string | null }>;
  authority: string;
  retrievedAt?: string;
};

export type TruncatedSearchResult<T> = {
  items: T[];
  totalMatches: number;
  returned: number;
  truncated: boolean;
  ambiguous?: boolean;
  queryTooShort?: boolean;
  retrievedAt?: string;
};

const searchQuotesSchema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(25).optional(),
  accountId: z.string().uuid().optional(),
});

const retrieveQuoteSchema = z.object({ quoteId: z.string().uuid() });
const searchAccountsSchema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const retrieveAccountSchema = z.object({ accountId: z.string().uuid() });
const listAccountJobsSchema = z.object({
  accountId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
const retrieveJobSchema = z.object({
  accountId: z.string().uuid(),
  jobId: z.string().min(1).max(64),
});
const searchMaterialsSchema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

async function brainJson<T>(path: string, auth: SlabAIAuthContext): Promise<T> {
  const res = await brainFetch(path, auth);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw Object.assign(new Error(body.error || `Action failed (${res.status})`), {
      code: body.code || "ACTION_FAILED",
      status: res.status,
    });
  }
  return body;
}

export const searchQuotesAction: SlabAIActionDefinition<
  z.infer<typeof searchQuotesSchema>,
  TruncatedSearchResult<AiQuoteListItem> & { rows: AiQuoteListItem[] }
> = {
  name: "searchQuotes",
  description: "Search org-scoped quotes by number, customer, or project (read-only).",
  mode: "read",
  domain: "quote",
  inputSchema: searchQuotesSchema,
  async execute(input, _ctx, auth) {
    const params = new URLSearchParams({ q: input.query, limit: String(input.limit ?? 10) });
    if (input.accountId) params.set("accountId", input.accountId);
    const data = await brainJson<{
      rows?: AiQuoteListItem[];
      items?: AiQuoteListItem[];
      totalMatches?: number;
      returned?: number;
      truncated?: boolean;
      ambiguous?: boolean;
      retrievedAt?: string;
    }>(`/api/slab-ai/quotes/search?${params}`, auth);
    const items = data.items || data.rows || [];
    return {
      items,
      rows: items,
      totalMatches: data.totalMatches ?? items.length,
      returned: data.returned ?? items.length,
      truncated: Boolean(data.truncated),
      ambiguous: Boolean(data.ambiguous),
      retrievedAt: data.retrievedAt,
    };
  },
};

export const retrieveQuoteAction: SlabAIActionDefinition<
  z.infer<typeof retrieveQuoteSchema>,
  { quote: AiQuoteDetail }
> = {
  name: "retrieveQuote",
  description: "Retrieve a single org-scoped quote as AI-safe read-only evidence.",
  mode: "read",
  domain: "quote",
  inputSchema: retrieveQuoteSchema,
  async execute(input, _ctx, auth) {
    const data = await brainJson<{ quote: AiQuoteDetail }>(`/api/slab-ai/quotes/${input.quoteId}`, auth);
    return { quote: data.quote };
  },
};

export const searchAccountsAction: SlabAIActionDefinition<
  z.infer<typeof searchAccountsSchema>,
  TruncatedSearchResult<Record<string, unknown>>
> = {
  name: "searchAccounts",
  description: "Search Account Directory (requires account_directory head).",
  mode: "read",
  domain: "account",
  requiredHead: "account_directory",
  inputSchema: searchAccountsSchema,
  async execute(input, _ctx, auth) {
    const params = new URLSearchParams({ q: input.query, limit: String(input.limit ?? 10) });
    return brainJson(`/api/slab-ai/accounts/search?${params}`, auth);
  },
};

export const retrieveAccountAction: SlabAIActionDefinition<
  z.infer<typeof retrieveAccountSchema>,
  { account: Record<string, unknown> }
> = {
  name: "retrieveAccount",
  description: "Retrieve Account Directory / Account 360 summary (requires account_directory).",
  mode: "read",
  domain: "account",
  requiredHead: "account_directory",
  inputSchema: retrieveAccountSchema,
  async execute(input, _ctx, auth) {
    return brainJson(`/api/slab-ai/accounts/${input.accountId}`, auth);
  },
};

export const listAccountJobsAction: SlabAIActionDefinition<
  z.infer<typeof listAccountJobsSchema>,
  TruncatedSearchResult<Record<string, unknown>>
> = {
  name: "listAccountJobs",
  description: "List Moraware prepared jobs for an account via Account 360.",
  mode: "read",
  domain: "job",
  requiredHead: "account_directory",
  inputSchema: listAccountJobsSchema,
  async execute(input, _ctx, auth) {
    const params = new URLSearchParams({ limit: String(input.limit ?? 10) });
    return brainJson(`/api/slab-ai/accounts/${input.accountId}/jobs?${params}`, auth);
  },
};

export const retrieveJobAction: SlabAIActionDefinition<
  z.infer<typeof retrieveJobSchema>,
  { job: Record<string, unknown> }
> = {
  name: "retrieveJob",
  description: "Retrieve one Moraware prepared job within an account relationship.",
  mode: "read",
  domain: "job",
  requiredHead: "account_directory",
  inputSchema: retrieveJobSchema,
  async execute(input, _ctx, auth) {
    const listed = await listAccountJobsAction.execute(
      { accountId: input.accountId, limit: 20 },
      _ctx,
      auth
    );
    const job = (listed.items || []).find((j) => String(j.jobId) === input.jobId);
    if (!job) {
      throw Object.assign(new Error("Job not found for this account."), {
        code: "JOB_NOT_FOUND",
        status: 404,
      });
    }
    return { job };
  },
};

export const searchMaterialsAction: SlabAIActionDefinition<
  z.infer<typeof searchMaterialsSchema>,
  TruncatedSearchResult<Record<string, unknown>>
> = {
  name: "searchMaterials",
  description: "Search slab inventory cache (requires slab_inventory head).",
  mode: "read",
  domain: "inventory",
  requiredHead: "slab_inventory",
  inputSchema: searchMaterialsSchema,
  async execute(input, _ctx, auth) {
    const params = new URLSearchParams({ q: input.query, limit: String(input.limit ?? 10) });
    return brainJson(`/api/slab-ai/materials/search?${params}`, auth);
  },
};

const ACTION_REGISTRY = {
  searchQuotes: searchQuotesAction,
  retrieveQuote: retrieveQuoteAction,
  searchAccounts: searchAccountsAction,
  retrieveAccount: retrieveAccountAction,
  listAccountJobs: listAccountJobsAction,
  retrieveJob: retrieveJobAction,
  searchMaterials: searchMaterialsAction,
} as const;

export type SlabAIActionName = keyof typeof ACTION_REGISTRY;

export function getAction(name: string) {
  return ACTION_REGISTRY[name as SlabAIActionName] ?? null;
}

export function listActions() {
  return Object.values(ACTION_REGISTRY).map((a) => ({
    name: a.name,
    description: a.description,
    mode: a.mode,
    domain: a.domain,
    requiredHead: a.requiredHead || null,
    available: true,
  }));
}

/**
 * Execute a governed action: tool allowlist ∩ read-only ∩ schema.
 * Domain head enforcement happens on Brain.
 */
export async function executeGovernedAction<T = unknown>(opts: {
  actionName: string;
  input: unknown;
  allowedActions: string[];
  context: SlabAIExecutionContext;
  auth: SlabAIAuthContext;
}): Promise<T> {
  if (!opts.allowedActions.includes(opts.actionName)) {
    throw Object.assign(new Error(`Action "${opts.actionName}" is not allowed for this tool.`), {
      code: "ACTION_DENIED",
      status: 403,
    });
  }
  const action = getAction(opts.actionName);
  if (!action) {
    throw Object.assign(new Error(`Unknown action: ${opts.actionName}`), {
      code: "UNKNOWN_ACTION",
      status: 404,
    });
  }
  if (action.mode !== "read") {
    throw Object.assign(new Error("Write actions are disabled."), {
      code: "WRITE_DISABLED",
      status: 403,
    });
  }
  const parsed = action.inputSchema.safeParse(opts.input);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid action input"), {
      code: "VALIDATION_ERROR",
      status: 400,
      issues: parsed.error.issues,
    });
  }
  const started = Date.now();
  try {
    const out = (await action.execute(parsed.data as never, opts.context, opts.auth)) as T;
    recordTelemetry({
      type: "generation_completed",
      generationId: opts.context.generationId,
      organizationId: opts.context.organization.id,
      userId: opts.context.user.id,
      toolId: opts.context.tool.id,
      success: true,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      errorCode: `action:${opts.actionName}:${action.domain}:ok`,
    });
    return out;
  } catch (err) {
    recordTelemetry({
      type: "generation_failed",
      generationId: opts.context.generationId,
      organizationId: opts.context.organization.id,
      userId: opts.context.user.id,
      toolId: opts.context.tool.id,
      success: false,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      errorCode: `action:${opts.actionName}:${action.domain}:fail`,
    });
    throw err;
  }
}
