"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, RotateCcw, Search, Sparkles, Star } from "lucide-react";
import type { SlabAITool } from "@/lib/ai-tools/types";
import { CATEGORY_LABELS } from "@/lib/ai-tools/types";
import { resolveToolIcon } from "@/lib/ai-tools/icons";
import { ToolForm, useToolForm } from "./ToolForm";
import { ToolOutput } from "./ToolOutput";
import { downloadBlob, markdownToDocxBlob } from "@/lib/export/docx";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

type SourceView = {
  id: string;
  title: string;
  locator?: string | null;
  sourceType: string;
  manufacturer?: string | null;
  version?: number | null;
  authority?: string | null;
  passageId?: string | null;
};

type Props = {
  tool: SlabAITool;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onGenerationComplete?: (payload: {
    generationId: string;
    content: string;
  }) => void;
};

function stripMeta(raw: string): { content: string; meta: Record<string, unknown> | null } {
  const m = raw.match(/^<!--SLAB_AI_META:([\s\S]*?)-->\n?/);
  if (!m) return { content: raw, meta: null };
  try {
    return { content: raw.slice(m[0].length), meta: JSON.parse(m[1]) as Record<string, unknown> };
  } catch {
    return { content: raw, meta: null };
  }
}

export function ToolWorkspace({ tool, favorite, onToggleFavorite, onGenerationComplete }: Props) {
  const { accessToken, context } = useAuth();
  const Icon = resolveToolIcon(tool.icon);
  const { values, setValues, errors, reset, validate } = useToolForm(tool);
  const [content, setContent] = useState("");
  const [editable, setEditable] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [operationalSources, setOperationalSources] = useState<
    Array<{ type: string; entityId: string; label: string; sourceSystem?: string | null; retrievedAt?: string }>
  >([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [evidenceMode, setEvidenceMode] = useState<string | null>(null);
  const [contextBanner, setContextBanner] = useState<string | null>(null);
  const [contextInspector, setContextInspector] = useState<{
    knowledgeCount: number;
    operationalCount: number;
    actionsCalled: string[];
    truncated?: boolean;
  } | null>(null);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteHits, setQuoteHits] = useState<Array<{ quoteId: string; quoteNumber: string | null; projectName: string | null; customerName: string | null }>>([]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountHits, setAccountHits] = useState<Array<{ accountId: string; label: string; accountName: string }>>([]);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountAmbiguous, setAccountAmbiguous] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }, [accessToken]);

  const generate = useCallback(async () => {
    if (!validate()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setError(null);
    setContent("");
    setFeedback(null);
    setCopied(false);
    setSources([]);
    setOperationalSources([]);
    setWarnings([]);
    setEvidenceMode(null);
    setContextInspector(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ toolId: tool.id, formData: values }),
        signal: controller.signal,
      });

      const isMock = res.headers.get("X-AI-Mock-Mode") === "1";
      setMockMode(isMock);
      setEvidenceMode(res.headers.get("X-Evidence-Mode"));
      const genId = res.headers.get("X-Generation-Id");
      if (genId) setGenerationId(genId);

      if (!res.ok) {
        let message = "Generation failed. Please try again.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* ignore */
        }
        throw Object.assign(new Error(message), { status: res.status });
      }

      if (!res.body) throw new Error("No response stream received.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        const parsed = stripMeta(full);
        setContent(parsed.content);
        if (parsed.meta) {
          if (Array.isArray(parsed.meta.sources)) setSources(parsed.meta.sources as SourceView[]);
          if (Array.isArray(parsed.meta.operationalSources)) {
            setOperationalSources(
              parsed.meta.operationalSources as Array<{
                type: string;
                entityId: string;
                label: string;
                sourceSystem?: string | null;
                retrievedAt?: string;
              }>
            );
          }
          if (Array.isArray(parsed.meta.warnings)) setWarnings(parsed.meta.warnings as string[]);
          if (typeof parsed.meta.evidenceMode === "string") setEvidenceMode(parsed.meta.evidenceMode);
          if (parsed.meta.contextInspector && typeof parsed.meta.contextInspector === "object") {
            setContextInspector(parsed.meta.contextInspector as typeof contextInspector);
          }
        }
      }
      full += decoder.decode();
      const parsed = stripMeta(full);
      setContent(parsed.content);
      if (parsed.meta) {
        if (Array.isArray(parsed.meta.sources)) setSources(parsed.meta.sources as SourceView[]);
        if (Array.isArray(parsed.meta.operationalSources)) {
          setOperationalSources(
            parsed.meta.operationalSources as Array<{
              type: string;
              entityId: string;
              label: string;
              sourceSystem?: string | null;
              retrievedAt?: string;
            }>
          );
        }
        if (Array.isArray(parsed.meta.warnings)) setWarnings(parsed.meta.warnings as string[]);
        if (parsed.meta.contextInspector && typeof parsed.meta.contextInspector === "object") {
          setContextInspector(parsed.meta.contextInspector as typeof contextInspector);
        }
      }
      if (genId) onGenerationComplete?.({ generationId: genId, content: parsed.content });
    } catch (err) {
      if ((err as Error).name === "AbortError") setError("Generation stopped.");
      else setError((err as Error).message || "Generation failed.");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [authHeaders, onGenerationComplete, tool.id, validate, values]);

  async function searchQuotes() {
    if (!quoteQuery.trim()) return;
    setQuoteBusy(true);
    try {
      const res = await fetch(`/api/ai/quotes/search?q=${encodeURIComponent(quoteQuery.trim())}`, {
        headers: authHeaders(),
      });
      const data = (await res.json()) as {
        rows?: Array<{ quoteId: string; quoteNumber: string | null; projectName: string | null; customerName: string | null }>;
        error?: string;
        warning?: string;
      };
      if (!res.ok) throw new Error(data.error || "Quote search failed");
      setQuoteHits(data.rows || []);
      if (data.warning) setContextBanner(data.warning);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setQuoteBusy(false);
    }
  }

  function loadQuote(hit: { quoteId: string; quoteNumber: string | null; projectName: string | null }) {
    setValues({ ...values, loadedQuoteId: hit.quoteId });
    setContextBanner(
      `Loaded from Quote ${hit.quoteNumber || hit.quoteId.slice(0, 8)}${hit.projectName ? ` · ${hit.projectName}` : ""} — drafting only; quote records are not changed.`
    );
  }

  async function searchAccounts() {
    if (!accountQuery.trim()) return;
    setAccountBusy(true);
    setAccountAmbiguous(false);
    try {
      const res = await fetch(`/api/ai/accounts/search?q=${encodeURIComponent(accountQuery.trim())}`, {
        headers: authHeaders(),
      });
      const data = (await res.json()) as {
        items?: Array<{ accountId: string; label?: string; accountName: string }>;
        ambiguous?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Account search failed");
      setAccountHits(
        (data.items || []).map((i) => ({
          accountId: i.accountId,
          accountName: i.accountName,
          label: i.label || i.accountName,
        }))
      );
      setAccountAmbiguous(Boolean(data.ambiguous));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAccountBusy(false);
    }
  }

  function loadAccount(hit: { accountId: string; accountName: string; label: string }) {
    const next: Record<string, unknown> = { ...values };
    if (tool.id === "quote-scope") {
      next.loadedAccountId = hit.accountId;
    }
    if (tool.id === "account-brief") {
      next.accountId = hit.accountId;
      next.accountSearch = hit.accountName;
    }
    setValues(next);
    setAccountAmbiguous(false);
    setContextBanner(`Selected account ${hit.label} — company data only; records are not changed.`);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function handleDocx() {
    const blob = await markdownToDocxBlob({
      title: tool.title,
      content,
    });
    const safe = tool.slug.replace(/[^a-z0-9-]/gi, "-");
    downloadBlob(blob, `${safe}-${new Date().toISOString().slice(0, 10)}.docx`);
  }

  function handlePrint() {
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const htmlBody = escaped
      .split("\n")
      .map((line) => {
        if (line.startsWith("### ")) return `<h2>${line.slice(4)}</h2>`;
        if (line.startsWith("## ")) return `<h1>${line.slice(3)}</h1>`;
        if (/^[-*]\s+/.test(line)) return `<li>${line.replace(/^[-*]\s+/, "")}</li>`;
        if (!line.trim()) return "<br/>";
        return `<p>${line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`;
      })
      .join("\n");
    w.document.write(`<!doctype html><html><head><title>${tool.title}</title>
      <style>
        body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;color:#1c1917;line-height:1.5}
        h1,h2{font-family:system-ui,sans-serif} h2{margin-top:1.4em}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${tool.title}</h1>
      <p style="color:#78716c;font-size:12px">Generated ${new Date().toLocaleString()} · slabOS AI Studio</p>
      ${htmlBody}
      <script>window.onload=()=>window.print()<\/script>
      </body></html>`);
    w.document.close();
  }

  async function handleFeedback(value: "up" | "down") {
    setFeedback(value);
    if (!generationId) return;
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ generationId, toolId: tool.id, feedback: value }),
      });
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
              {CATEGORY_LABELS[tool.category]}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{tool.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--fg-secondary)]">{tool.description}</p>
            {tool.safetyClass === "machine-guidance" ? (
              <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                Machine guidance: verifies manufacturer specs — never bypasses safety systems.
              </p>
            ) : null}
          </div>
        </div>
        {onToggleFavorite ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("h-4 w-4", favorite && "fill-[var(--accent)] text-[var(--accent)]")} />
            {favorite ? "Favorited" : "Favorite"}
          </button>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--fg)]">Inputs</h2>
            <p className="text-xs text-[var(--muted-fg)]">Required fields marked with *</p>
          </div>
          <div className="flex-1 space-y-4 p-4">
            {(tool.allowedActions || []).includes("searchQuotes") ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Load existing quote</p>
                <p className="mt-1 text-xs text-[var(--fg-secondary)]">
                  Search governed Quote Library evidence. AI drafts narrative only — it cannot change the quote.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={quoteQuery}
                    onChange={(e) => setQuoteQuery(e.target.value)}
                    placeholder="Quote #, customer, or project"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void searchQuotes()}
                    disabled={quoteBusy || streaming}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {quoteBusy ? "…" : "Search"}
                  </button>
                </div>
                {quoteHits.length > 0 ? (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                    {quoteHits.map((hit) => (
                      <li key={hit.quoteId}>
                        <button
                          type="button"
                          className="w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--muted)]"
                          onClick={() => loadQuote(hit)}
                        >
                          <span className="font-medium">{hit.quoteNumber || hit.quoteId.slice(0, 8)}</span>
                          {" · "}
                          {hit.customerName || hit.projectName || "Untitled"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {(tool.allowedActions || []).includes("searchAccounts") ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Load account</p>
                <p className="mt-1 text-xs text-[var(--fg-secondary)]">
                  Requires Account Directory access. Select an exact match — AI will not guess identity.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={accountQuery}
                    onChange={(e) => setAccountQuery(e.target.value)}
                    placeholder="Account name"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void searchAccounts()}
                    disabled={accountBusy || streaming}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {accountBusy ? "…" : "Search"}
                  </button>
                </div>
                {accountAmbiguous ? (
                  <p className="mt-2 text-xs text-amber-800">Multiple matches — select one account below.</p>
                ) : null}
                {accountHits.length > 0 ? (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                    {accountHits.map((hit) => (
                      <li key={hit.accountId}>
                        <button
                          type="button"
                          className="w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--muted)]"
                          onClick={() => loadAccount(hit)}
                        >
                          <span className="font-medium">{hit.label || hit.accountName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <ToolForm
              tool={tool}
              values={values}
              onChange={setValues}
              errors={errors}
              disabled={streaming}
            />
          </div>
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={streaming}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {streaming ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={streaming}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--muted)] disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => setEditable((v) => !v)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--muted)]"
            >
              {editable ? "Preview" : "Edit"}
            </button>
          </div>
        </section>

        <ToolOutput
          toolTitle={tool.title}
          emptyHint={tool.emptyStateHint}
          content={content}
          editable={editable}
          onContentChange={setContent}
          streaming={streaming}
          error={error}
          mockMode={mockMode}
          evidenceMode={evidenceMode}
          sources={sources}
          operationalSources={operationalSources}
          warnings={warnings}
          contextBanner={contextBanner || (context?.devBypass ? "DEV AUTH BYPASS active" : null)}
          contextInspector={contextInspector}
          showInspector={Boolean(context?.canAdministerKnowledge || context?.devBypass)}
          onCopy={() => void handleCopy()}
          onDownloadDocx={() => void handleDocx()}
          onPrint={handlePrint}
          onRegenerate={() => void generate()}
          onClear={() => {
            setContent("");
            setError(null);
            setFeedback(null);
            setSources([]);
            setOperationalSources([]);
            setWarnings([]);
            setContextInspector(null);
            setContextBanner(null);
          }}
          onStop={() => abortRef.current?.abort()}
          feedback={feedback}
          onFeedback={(v) => void handleFeedback(v)}
          copied={copied}
        />
      </div>
    </div>
  );
}
