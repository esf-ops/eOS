import { streamText } from "ai";
import { requireToolById } from "@/lib/ai-tools/registry";
import type { SlabAITool } from "@/lib/ai-tools/types";
import { getAIModel, getAIProviderConfig } from "./provider";
import { streamMockContent, buildMockStructuredResult } from "./mock";
import { createGenerationId, recordTelemetry } from "./telemetry";
import type { GenerationRequest } from "./types";
import type { SlabAIAuthContext, SlabAIExecutionContext, SlabAIResult } from "./executionContext";
import { assemblePromptLayers } from "./promptAssembly";
import {
  citationsFromPassages,
  filterValidCitations,
  retrieveKnowledge,
  type KnowledgePassage,
} from "./knowledge";
import { executeGovernedAction, type AiQuoteDetail } from "./actions";
import {
  buildOperationalSources,
  detectOperationalConflicts,
  serializeOperationalContext,
  type AIAccountSummary,
  type SlabAIOperationalContext,
} from "./operationalContext";
import { brainFetch } from "@/lib/auth/resolveContext";

const MAX_TEXT_LEN = 4000;

export function sanitizeFormData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      out[key] = value.replace(/\u0000/g, "").trim().slice(0, MAX_TEXT_LEN);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function validateToolInput(tool: SlabAITool, formData: Record<string, unknown>) {
  const parsed = tool.formSchema.safeParse(sanitizeFormData(formData));
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed";
    throw Object.assign(new Error(message), {
      code: "VALIDATION_ERROR",
      status: 400,
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

export type PreparedGeneration = {
  tool: SlabAITool;
  values: Record<string, unknown>;
  generationId: string;
  mockMode: boolean;
  modelId: string;
  executionContext: SlabAIExecutionContext;
  auth: SlabAIAuthContext;
  passages: KnowledgePassage[];
  quote?: AiQuoteDetail | null;
  account?: AIAccountSummary | null;
  operationalContext: SlabAIOperationalContext;
  operationalSources: ReturnType<typeof buildOperationalSources>;
  actionsCalled: string[];
  warnings: string[];
  evidenceMode: SlabAIResult["evidenceMode"];
  actionCount: number;
};

function buildKnowledgeQuery(tool: SlabAITool, values: Record<string, unknown>): string {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = values[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return "";
  };
  // Controlled phrase — prefer structured tool fields over dumping the whole form
  const structured = [
    pick("manufacturer"),
    pick("model", "machineModel"),
    pick("material"),
    pick("tooling", "blade", "tool"),
    pick("operation"),
    pick("symptom", "issue", "problem"),
    pick("finish", "application"),
    pick("product", "color", "productName"),
    pick("question", "notes", "details", "scope"),
  ].filter(Boolean);
  if (structured.length) {
    return [tool.title, ...structured].join(" ").slice(0, 400);
  }
  const parts = Object.values(values)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map(String)
    .slice(0, 12);
  return [tool.title, ...parts].join(" ").slice(0, 240);
}

export async function prepareGeneration(
  request: GenerationRequest & { auth: SlabAIAuthContext }
): Promise<PreparedGeneration> {
  const tool = requireToolById(request.toolId);
  const values = validateToolInput(tool, request.formData ?? {});
  const config = getAIProviderConfig();
  const generationId = request.generationId || createGenerationId();

  if (!config.mockMode && !config.hasApiKey) {
    throw Object.assign(
      new Error("AI provider is unavailable. Configure OPENAI_API_KEY or enable AI_MOCK_MODE."),
      { code: "AI_UNAVAILABLE", status: 503 }
    );
  }

  if (!request.auth.organizationId && request.auth.authMode !== "dev_bypass") {
    throw Object.assign(new Error("Organization context is required for protected AI generation."), {
      code: "ORG_REQUIRED",
      status: 403,
    });
  }

  const executionContext: SlabAIExecutionContext = {
    generationId,
    user: {
      id: request.auth.userId,
      displayName: request.auth.displayName ?? undefined,
      role: request.auth.role,
    },
    organization: { id: request.auth.organizationId },
    tool: {
      id: tool.id,
      promptVersion: tool.promptVersion,
      modelClass: tool.modelClass,
    },
    authMode: request.auth.authMode,
    accessToken: request.auth.accessToken,
  };

  const warnings: string[] = [];
  let passages: KnowledgePassage[] = [];
  let actionCount = 0;
  const actionsCalled: string[] = [];
  let quote: AiQuoteDetail | null = null;
  let account: AIAccountSummary | null = null;
  let jobs: Array<Record<string, unknown>> = [];
  let truncatedOps = false;

  if (tool.knowledgeEnabled) {
    const kn = await retrieveKnowledge(request.auth, {
      query: buildKnowledgeQuery(tool, values),
      sourceTypes: tool.knowledgeSourceTypes,
      limit: 5,
      seedSentinel: true,
      manufacturer: typeof values.manufacturer === "string" ? values.manufacturer : undefined,
      machineModel: typeof values.model === "string" ? values.model : undefined,
      material: typeof values.material === "string" ? values.material : undefined,
    });
    passages = kn.passages;
    if (kn.error) warnings.push(kn.error);
    if (!kn.installed) {
      warnings.push("Knowledge tables not installed — using controlled sentinel fixtures where available.");
    }
    if (!passages.length) {
      warnings.push(
        "No approved technical source was found. The following is general diagnostic guidance and should be verified against manufacturer specifications."
      );
    }
  }

  const allowed = tool.allowedActions || [];
  const quoteId = typeof values.loadedQuoteId === "string" ? values.loadedQuoteId.trim() : "";
  if (quoteId && allowed.includes("retrieveQuote")) {
    try {
      const result = await executeGovernedAction<{ quote: AiQuoteDetail }>({
        actionName: "retrieveQuote",
        input: { quoteId },
        allowedActions: allowed,
        context: executionContext,
        auth: request.auth,
      });
      quote = result.quote;
      actionCount += 1;
      actionsCalled.push("retrieveQuote");
    } catch (err) {
      warnings.push((err as Error).message || "Unable to retrieve the quote. Continue manually or try again.");
    }
  }

  let accountId = typeof values.loadedAccountId === "string" ? values.loadedAccountId.trim() : "";
  if (!accountId && typeof values.accountId === "string") accountId = values.accountId.trim();

  // Account Brief: require selected account ID (search alone is not enough)
  if (tool.id === "account-brief" && !accountId) {
    warnings.push("Select an account from search results before generating a brief. Ambiguous names are not auto-selected.");
  }

  if (accountId && allowed.includes("retrieveAccount")) {
    try {
      const result = await executeGovernedAction<{ account: AIAccountSummary }>({
        actionName: "retrieveAccount",
        input: { accountId },
        allowedActions: allowed,
        context: executionContext,
        auth: request.auth,
      });
      account = result.account;
      actionCount += 1;
      actionsCalled.push("retrieveAccount");
    } catch (err) {
      warnings.push((err as Error).message || "Account context could not be retrieved.");
    }
  }

  if (account?.accountId && allowed.includes("listAccountJobs")) {
    try {
      const result = await executeGovernedAction<{
        items: Array<Record<string, unknown>>;
        truncated?: boolean;
      }>({
        actionName: "listAccountJobs",
        input: { accountId: account.accountId, limit: 8 },
        allowedActions: allowed,
        context: executionContext,
        auth: request.auth,
      });
      jobs = result.items || [];
      if (result.truncated) truncatedOps = true;
      actionCount += 1;
      actionsCalled.push("listAccountJobs");
    } catch (err) {
      warnings.push((err as Error).message || "Job context could not be retrieved.");
    }
  }

  warnings.push(...detectOperationalConflicts({ formValues: values, account, quote }));

  const operationalContext: SlabAIOperationalContext = {
    accounts: account ? [account] : [],
    quotes: quote ? [quote] : [],
    jobs,
    truncated: truncatedOps,
    warnings: warnings.filter((w) => /differ|mismatch|truncated|stale|Account Directory/i.test(w)),
  };
  const operationalSources = buildOperationalSources(operationalContext);

  const evidenceMode: SlabAIResult["evidenceMode"] = passages.length || operationalSources.length
    ? tool.safetyClass === "machine-guidance"
      ? "verified"
      : "mixed"
    : tool.knowledgeEnabled
      ? "general"
      : operationalSources.length
        ? "mixed"
        : "none";

  const modelHandle = getAIModel(tool.modelClass);

  recordTelemetry({
    type: "generation_started",
    generationId,
    organizationId: request.auth.organizationId,
    userId: request.auth.userId,
    toolId: tool.id,
    promptVersion: tool.promptVersion,
    model: modelHandle.modelId,
    provider: config.provider,
    timestamp: new Date().toISOString(),
  });

  void persistGenerationStart({
    auth: request.auth,
    generationId,
    tool,
    values,
    modelId: modelHandle.modelId,
    provider: config.provider,
    retrievalCount: passages.length,
    actionCount,
  });

  return {
    tool,
    values,
    generationId,
    mockMode: config.mockMode,
    modelId: modelHandle.modelId,
    executionContext,
    auth: request.auth,
    passages,
    quote,
    account,
    operationalContext,
    operationalSources,
    actionsCalled,
    warnings,
    evidenceMode,
    actionCount,
  };
}

async function persistGenerationStart(opts: {
  auth: SlabAIAuthContext;
  generationId: string;
  tool: SlabAITool;
  values: Record<string, unknown>;
  modelId: string;
  provider: string;
  retrievalCount: number;
  actionCount: number;
}) {
  if (opts.auth.authMode === "dev_bypass" || !opts.auth.accessToken) return;
  try {
    await brainFetch("/api/slab-ai/generations", opts.auth, {
      method: "POST",
      body: JSON.stringify({
        id: opts.generationId,
        toolId: opts.tool.id,
        promptVersion: opts.tool.promptVersion,
        provider: opts.provider,
        model: opts.modelId,
        modelClass: opts.tool.modelClass,
        title: `${opts.tool.title}`,
        inputSnapshot: opts.values,
        retrievalCount: opts.retrievalCount,
        actionCount: opts.actionCount,
      }),
    });
  } catch {
    /* history optional until migration applied */
  }
}

async function persistGenerationComplete(opts: {
  auth: SlabAIAuthContext;
  generationId: string;
  result: SlabAIResult;
  latencyMs: number;
  status: "completed" | "failed" | "aborted";
  errorCode?: string;
  usage?: Record<string, unknown>;
  retrievalCount: number;
  actionCount: number;
}) {
  if (opts.auth.authMode === "dev_bypass" || !opts.auth.accessToken) return;
  try {
    await brainFetch(`/api/slab-ai/generations/${opts.generationId}`, opts.auth, {
      method: "PATCH",
      body: JSON.stringify({
        status: opts.status,
        outputContent: opts.result.content,
        warnings: opts.result.warnings,
        assumptions: opts.result.assumptions,
        sourceMetadata: opts.result.sources,
        usageMetadata: opts.usage || {},
        latencyMs: opts.latencyMs,
        retrievalCount: opts.retrievalCount,
        actionCount: opts.actionCount,
        errorCode: opts.errorCode,
      }),
    });
  } catch {
    /* ignore */
  }
}

function buildQuoteBlock(quote: AiQuoteDetail | null | undefined): string | null {
  if (!quote) return null;
  return JSON.stringify(quote, null, 2);
}

function enrichContent(opts: {
  tool: SlabAITool;
  content: string;
  passages: KnowledgePassage[];
  warnings: string[];
  evidenceMode: SlabAIResult["evidenceMode"];
  operationalSources?: SlabAIResult["operationalSources"];
  actionsCalled?: string[];
  truncated?: boolean;
}): SlabAIResult {
  const sources = citationsFromPassages(opts.passages);
  const warnings = [...opts.warnings];
  let content = opts.content;

  if (opts.tool.safetyClass === "machine-guidance") {
    if (opts.passages.length) {
      if (!content.includes("Verified")) {
        content = `### Verified Manufacturer / Tooling Guidance\n\nEvidence from approved sources was supplied. Prefer those specifics over inference.\n\n${content}`;
      }
    } else if (!content.toLowerCase().includes("general")) {
      content = `### General Diagnostic Reasoning\n\nNo approved technical source was retrieved. Treat numeric settings as unverified.\n\n${content}`;
    }
  }

  return {
    content,
    sources,
    operationalSources: opts.operationalSources || [],
    warnings,
    assumptions: [],
    evidenceMode: opts.evidenceMode,
    confidence: opts.passages.length || (opts.operationalSources || []).length ? "medium" : "low",
    contextInspector: {
      knowledgeCount: opts.passages.length,
      operationalCount: (opts.operationalSources || []).length,
      actionsCalled: opts.actionsCalled || [],
      truncated: opts.truncated,
    },
  };
}

export async function createGenerationStream(
  prepared: PreparedGeneration,
  signal?: AbortSignal
): Promise<Response> {
  const started = Date.now();
  const {
    tool,
    values,
    generationId,
    mockMode,
    modelId,
    executionContext,
    auth,
    passages,
    quote,
    operationalContext,
    operationalSources,
    actionsCalled,
    warnings,
    evidenceMode,
    actionCount,
  } = prepared;

  const quoteBlock = buildQuoteBlock(quote);
  const opsBlock =
    (operationalContext.accounts?.length ||
      operationalContext.quotes?.length ||
      operationalContext.jobs?.length)
      ? serializeOperationalContext(operationalContext)
      : null;
  const userPrompt = tool.buildPrompt(values);
  const layers = assemblePromptLayers({
    systemPolicy:
      "You are a specialized AI coworker inside slabOS AI Studio for stone fabrication. You assist employees with drafting and diagnosis. You are never the authority for pricing, permissions, inventory quantities, or machine setpoints.",
    toolInstructions: tool.systemPrompt,
    promptVersion: tool.promptVersion,
    safetyClass: tool.safetyClass,
    evidencePolicy: tool.evidencePolicy,
    executionContext,
    passages,
    userFormPrompt: userPrompt,
    quoteContextBlock: quoteBlock,
    operationalContextBlock: opsBlock,
  });

  const encoder = new TextEncoder();

  const finishHeaders = (extra: Record<string, string> = {}) => ({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Generation-Id": generationId,
    "X-AI-Mock-Mode": mockMode ? "1" : "0",
    "X-AI-Model": modelId,
    "X-Prompt-Version": tool.promptVersion,
    "X-Evidence-Mode": evidenceMode || "none",
    "X-Source-Count": String(passages.length),
    "X-Operational-Source-Count": String(operationalSources.length),
    "X-Auth-Mode": auth.authMode,
    ...extra,
  });

  if (mockMode) {
    const structured = buildMockStructuredResult(tool, values, { passages, warnings, evidenceMode, quote });
    structured.sources = filterValidCitations(
      structured.sources.map((s) => s.id),
      passages
    ) as typeof structured.sources;
    if (!structured.sources.length && passages.length) {
      structured.sources = citationsFromPassages(passages);
    }
    structured.operationalSources = operationalSources;
    structured.contextInspector = {
      knowledgeCount: passages.length,
      operationalCount: operationalSources.length,
      actionsCalled,
      truncated: Boolean(operationalContext.truncated),
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const meta = JSON.stringify({
            type: "slab_ai_meta",
            sources: structured.sources,
            operationalSources: structured.operationalSources,
            warnings: structured.warnings,
            assumptions: structured.assumptions,
            evidenceMode: structured.evidenceMode,
            confidence: structured.confidence,
            contextInspector: structured.contextInspector,
          });
          controller.enqueue(encoder.encode(`<!--SLAB_AI_META:${meta}-->\n`));
          for await (const chunk of streamMockContent(tool, values, signal, structured.content)) {
            controller.enqueue(encoder.encode(chunk));
          }
          recordTelemetry({
            type: "generation_completed",
            generationId,
            organizationId: auth.organizationId,
            userId: auth.userId,
            toolId: tool.id,
            promptVersion: tool.promptVersion,
            model: modelId,
            provider: "mock",
            success: true,
            latencyMs: Date.now() - started,
            timestamp: new Date().toISOString(),
            errorCode: `ops:${operationalSources.length}:kn:${passages.length}`,
          });
          void persistGenerationComplete({
            auth,
            generationId,
            result: structured,
            latencyMs: Date.now() - started,
            status: "completed",
            retrievalCount: passages.length,
            actionCount,
          });
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return new Response(stream, { headers: finishHeaders() });
  }

  const modelHandle = getAIModel(tool.modelClass);
  if (modelHandle.kind !== "openai") {
    throw Object.assign(new Error("AI provider misconfigured"), { code: "AI_UNAVAILABLE", status: 503 });
  }

  const result = streamText({
    model: modelHandle.model,
    system: layers.system,
    prompt: layers.prompt,
    abortSignal: signal,
  });

  Promise.resolve(result.usage)
    .then((usage) => {
      recordTelemetry({
        type: "generation_completed",
        generationId,
        organizationId: auth.organizationId,
        userId: auth.userId,
        toolId: tool.id,
        promptVersion: tool.promptVersion,
        model: modelId,
        provider: "openai",
        latencyMs: Date.now() - started,
        success: true,
        tokenUsage: {
          promptTokens: (usage as { inputTokens?: number }).inputTokens,
          completionTokens: (usage as { outputTokens?: number }).outputTokens,
        },
        timestamp: new Date().toISOString(),
      });
    })
    .catch(() => undefined);

  // Stream with meta prefix for sources
  const meta = enrichContent({
    tool,
    content: "",
    passages,
    warnings,
    evidenceMode,
    operationalSources,
    actionsCalled,
    truncated: operationalContext.truncated,
  });
  const prefix = `<!--SLAB_AI_META:${JSON.stringify({
    type: "slab_ai_meta",
    sources: meta.sources,
    operationalSources: meta.operationalSources,
    warnings: meta.warnings,
    assumptions: meta.assumptions,
    evidenceMode: meta.evidenceMode,
    confidence: meta.confidence,
    contextInspector: meta.contextInspector,
  })}-->\n`;

  const upstream = result.toTextStreamResponse({
    headers: finishHeaders(),
  });

  const reader = upstream.body?.getReader();
  if (!reader) return upstream;

  let full = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(prefix));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            full += new TextDecoder().decode(value, { stream: true });
            controller.enqueue(value);
          }
        }
        void persistGenerationComplete({
          auth,
          generationId,
          result: enrichContent({
            tool,
            content: full,
            passages,
            warnings,
            evidenceMode,
            operationalSources,
            actionsCalled,
            truncated: operationalContext.truncated,
          }),
          latencyMs: Date.now() - started,
          status: "completed",
          retrievalCount: passages.length,
          actionCount,
        });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: finishHeaders() });
}

/** Kept for tests that call the old message builder. */
export function buildGenerationMessages(tool: SlabAITool, values: Record<string, unknown>) {
  return {
    system: tool.systemPrompt,
    prompt: tool.buildPrompt(values),
  };
}
