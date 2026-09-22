"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Building2,
  Copy,
  Download,
  FileText,
  Gem,
  Loader2,
  Printer,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { downloadBlob, markdownToDocxBlob } from "@/lib/export/docx";
import type { AssistantThreadContext, ClarifyQuestion, DisambiguationOption } from "@/lib/ai/assistant/types";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant" | "system";

type Provenance = {
  company: Array<{ type: string; entityId: string; label: string }>;
  knowledge: Array<{
    id: string;
    title: string;
    locator?: string | null;
    sourceType?: string;
  }>;
  analysisNotes: string[];
};

type Artifact = {
  id: string;
  title: string;
  skillId: string;
  content: string;
  editable: boolean;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  clarify?: ClarifyQuestion[];
  options?: DisambiguationOption[];
  domain?: "account" | "quote";
  followUps?: string[];
  provenance?: Provenance;
  artifactId?: string;
  streaming?: boolean;
};

const STARTERS = [
  { label: "Brief me on an account", prompt: "Brief me on an account before I call them." },
  { label: "Draft a quote scope", prompt: "Find a quote and draft a customer-ready scope." },
  { label: "Troubleshoot a shop issue", prompt: "We're getting chipping on a Taj Mahal miter. What should we check?" },
  { label: "Create a care guide", prompt: "Make a care guide for Cambria Whitendale." },
  { label: "Find material", prompt: "Do we have any Taj Mahal that could work for a vanity?" },
  { label: "Search company knowledge", prompt: "What do our approved install standards say about seam placement?" },
];

function stripMeta(raw: string): { content: string; meta: Record<string, unknown> | null } {
  const m = raw.match(/^<!--SLAB_AI_META:([\s\S]*?)-->\n?/);
  if (!m) return { content: raw, meta: null };
  try {
    return { content: raw.slice(m[0].length), meta: JSON.parse(m[1]) as Record<string, unknown> };
  } catch {
    return { content: raw, meta: null };
  }
}

function chipsFromContext(ctx: AssistantThreadContext) {
  const chips: Array<{ type: string; id: string; label: string }> = [];
  if (ctx.accountId && ctx.accountLabel) chips.push({ type: "account", id: ctx.accountId, label: ctx.accountLabel });
  if (ctx.quoteId && ctx.quoteLabel) chips.push({ type: "quote", id: ctx.quoteId, label: ctx.quoteLabel });
  if (ctx.jobId && ctx.jobLabel) chips.push({ type: "job", id: ctx.jobId, label: ctx.jobLabel });
  if (ctx.materialLabel) chips.push({ type: "material", id: "material", label: ctx.materialLabel });
  return chips;
}

function skillTitle(skillId: string): string {
  switch (skillId) {
    case "stone-care":
      return "Stone care guide";
    case "quote-scope":
      return "Quote scope";
    case "account-brief":
      return "Account brief";
    case "machine-troubleshooter":
      return "Shop diagnostic";
    case "remnant-pitch":
      return "Remnant marketing";
    default:
      return "Generated document";
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AssistantWorkspace() {
  const { accessToken } = useAuth();
  const [context, setContext] = useState<AssistantThreadContext>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"evidence" | "artifact">("evidence");
  const [pendingClarify, setPendingClarify] = useState<{
    questions: ClarifyQuestion[];
    fields: Record<string, unknown>;
    intentMessage: string;
  } | null>(null);
  const [clarifyDraft, setClarifyDraft] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [editArtifactSource, setEditArtifactSource] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }, [accessToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId) || null;
  const latestProvenance = [...messages].reverse().find((m) => m.provenance)?.provenance || null;

  function clearChip(type: string) {
    setContext((c) => {
      const next = { ...c };
      if (type === "account") {
        next.accountId = null;
        next.accountLabel = null;
      }
      if (type === "quote") {
        next.quoteId = null;
        next.quoteLabel = null;
      }
      if (type === "job") {
        next.jobId = null;
        next.jobLabel = null;
      }
      if (type === "material") next.materialLabel = null;
      return next;
    });
  }

  async function runGenerate(skillId: string, formData: Record<string, unknown>, assistantNote?: string) {
    const artId = uid();
    const streamingMsgId = uid();
    setArtifacts((prev) => [
      ...prev,
      { id: artId, title: skillTitle(skillId), skillId, content: "", editable: true },
    ]);
    setActiveArtifactId(artId);
    setPanelTab("artifact");
    setMessages((prev) => [
      ...prev,
      {
        id: streamingMsgId,
        role: "assistant",
        text: assistantNote || `Working on ${skillTitle(skillId).toLowerCase()}…`,
        streaming: true,
        artifactId: artId,
      },
    ]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ toolId: skillId, formData }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = "Generation failed.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* ignore */
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingMsgId ? { ...m, text: message, streaming: false } : m))
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId ? { ...m, text: "No response stream.", streaming: false } : m
          )
        );
        return;
      }

      let raw = "";
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const { content, meta } = stripMeta(raw);
        setArtifacts((prev) => prev.map((a) => (a.id === artId ? { ...a, content } : a)));
        if (meta) {
          const sources = (meta.sources as Provenance["knowledge"]) || [];
          const ops = (meta.operationalSources as Provenance["company"]) || [];
          const warnings = (meta.warnings as string[]) || [];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgId
                ? {
                    ...m,
                    provenance: {
                      company: ops,
                      knowledge: sources.map((s) => ({
                        id: String((s as { id?: string }).id || ""),
                        title: String((s as { title?: string }).title || "Source"),
                        locator: (s as { locator?: string | null }).locator,
                        sourceType: (s as { sourceType?: string }).sourceType,
                      })),
                      analysisNotes: warnings,
                    },
                  }
                : m
            )
          );
        }
      }

      const { content, meta } = stripMeta(raw);
      setArtifacts((prev) => prev.map((a) => (a.id === artId ? { ...a, content } : a)));
      const sources = ((meta?.sources as Provenance["knowledge"]) || []).map((s) => ({
        id: String((s as { id?: string }).id || ""),
        title: String((s as { title?: string }).title || "Source"),
        locator: (s as { locator?: string | null }).locator,
        sourceType: (s as { sourceType?: string }).sourceType,
      }));
      const ops = (meta?.operationalSources as Provenance["company"]) || [];
      const warnings = (meta?.warnings as string[]) || [];

      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMsgId
            ? {
                ...m,
                streaming: false,
                text: `Here’s your **${skillTitle(skillId)}**. Review it in the artifact panel — edit, copy, or download as DOCX.`,
                followUps: [
                  "Refine the tone for a customer email",
                  "What company data did you use?",
                  "Is there approved manufacturer guidance loaded?",
                ],
                provenance: {
                  company: ops,
                  knowledge: sources,
                  analysisNotes: warnings.length
                    ? warnings
                    : ["Conclusions below the evidence line are AI synthesis — verify against shop standards."],
                },
                artifactId: artId,
              }
            : m
        )
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMsgId
            ? { ...m, text: (err as Error).message || "Generation failed.", streaming: false }
            : m
        )
      );
    }
  }

  async function submitTurn(opts: {
    message: string;
    selectedEntity?: { domain: "account" | "quote"; id: string; label: string };
    clarifyAnswers?: Record<string, string>;
  }) {
    const displayText = opts.message.trim();
    if (displayText) {
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: displayText }]);
    }
    setBusy(true);
    setPendingClarify(null);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          message: opts.message,
          context,
          selectedEntity: opts.selectedEntity,
          clarifyAnswers: opts.clarifyAnswers,
        }),
      });
      const data = (await res.json()) as Record<string, unknown> & {
        ok?: boolean;
        error?: string;
        mode?: string;
        message?: string;
        context?: AssistantThreadContext;
        questions?: ClarifyQuestion[];
        options?: DisambiguationOption[];
        domain?: "account" | "quote";
        skillId?: string;
        formData?: Record<string, unknown>;
        assistantNote?: string;
        suggestedFields?: Record<string, unknown>;
        followUps?: string[];
        operationalSources?: Provenance["company"];
      };

      if (!res.ok || data.ok === false) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", text: data.error || "Something went wrong." },
        ]);
        return;
      }

      if (data.context) setContext(data.context);

      if (data.mode === "clarify" && data.questions?.length) {
        setPendingClarify({
          questions: data.questions,
          fields: data.suggestedFields || {},
          intentMessage: data.message || "",
        });
        setClarifyDraft({});
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: data.message || "I need a bit more detail.",
            clarify: data.questions,
          },
        ]);
        return;
      }

      if (data.mode === "disambiguate" && data.options?.length) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: data.message || "Select the correct match.",
            options: data.options,
            domain: data.domain,
          },
        ]);
        return;
      }

      if (data.mode === "generate" && data.skillId && data.formData) {
        if (data.assistantNote) {
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", text: data.assistantNote as string },
          ]);
        }
        await runGenerate(data.skillId, data.formData, data.assistantNote);
        return;
      }

      // message mode
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: data.message || "How can I help?",
          followUps: data.followUps,
          provenance: data.operationalSources?.length
            ? {
                company: data.operationalSources,
                knowledge: [],
                analysisNotes: [],
              }
            : undefined,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: (err as Error).message || "Request failed." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSend() {
    const text = composer.trim();
    if (!text || busy) return;
    setComposer("");
    void submitTurn({ message: text });
  }

  function onSelectEntity(domain: "account" | "quote", opt: DisambiguationOption) {
    void submitTurn({
      message: "continue",
      selectedEntity: { domain, id: opt.id, label: opt.label },
    });
  }

  function onSubmitClarify() {
    if (!pendingClarify) return;
    const answers: Record<string, string> = { ...clarifyDraft };
    const mergedMessage = [
      pendingClarify.intentMessage,
      ...pendingClarify.questions.map((q) => {
        const v = answers[q.field || q.id];
        return v ? `${q.prompt} ${v}` : "";
      }),
    ]
      .filter(Boolean)
      .join("\n");
    void submitTurn({
      message: mergedMessage || composer || "continue",
      clarifyAnswers: answers,
    });
  }

  async function copyArtifact() {
    if (!activeArtifact?.content) return;
    await navigator.clipboard.writeText(activeArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function downloadArtifact() {
    if (!activeArtifact?.content) return;
    const blob = await markdownToDocxBlob({
      title: activeArtifact.title,
      content: activeArtifact.content,
    });
    downloadBlob(blob, `${activeArtifact.skillId}-${Date.now()}.docx`);
  }

  function printArtifact() {
    if (!activeArtifact?.content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${activeArtifact.title}</title></head><body style="font-family:system-ui;padding:24px;white-space:pre-wrap">${activeArtifact.content
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</body></html>`
    );
    w.document.close();
    w.print();
  }

  const chips = chipsFromContext(context);
  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col gap-3 lg:flex-row">
      {/* Main conversation column */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <header className="shrink-0 border-b border-[var(--border)] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-fg)]">slabOS</p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--fg)] md:text-[1.75rem]">
            Ask slabOS anything about your work
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-secondary)]">
            Natural language first. Skills and Knowledge Hub stay available behind the assistant — you don’t pick a form to get started.
          </p>
          {chips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span
                  key={`${c.type}-${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/60 px-2.5 py-1 text-xs font-medium text-[var(--fg)]"
                >
                  <span className="text-[10px] uppercase tracking-wide text-[var(--muted-fg)]">{c.type}</span>
                  {c.label}
                  <button
                    type="button"
                    className="rounded p-0.5 text-[var(--muted-fg)] hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                    aria-label={`Clear ${c.type}`}
                    onClick={() => clearChip(c.type)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          {empty ? (
            <div className="mx-auto flex max-w-2xl flex-col items-stretch gap-6 pt-6 md:pt-10">
              <p className="text-center text-sm text-[var(--fg-secondary)]">
                Try a starter, or type what you need — accounts, quotes, shop issues, care guides, material.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 px-3.5 py-3 text-left text-sm font-medium text-[var(--fg)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/40"
                    onClick={() => {
                      setComposer(s.prompt);
                      textareaRef.current?.focus();
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-[var(--muted-fg)]">
                Prefer a guided workflow?{" "}
                <Link href="/tools" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                  Open Skills
                </Link>
              </p>
            </div>
          ) : (
            <ul className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "rounded-xl px-3.5 py-3 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-8 bg-[var(--accent)] text-white"
                      : "mr-4 border border-[var(--border)] bg-[var(--bg)]/40 text-[var(--fg)]"
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="ai-markdown prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  )}
                  {m.streaming ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted-fg)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                    </p>
                  ) : null}
                  {m.options?.length && m.domain ? (
                    <ul className="mt-3 space-y-1.5">
                      {m.options.map((opt) => (
                        <li key={opt.id}>
                          <button
                            type="button"
                            disabled={busy}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/30 disabled:opacity-50"
                            onClick={() => onSelectEntity(m.domain!, opt)}
                          >
                            <span className="font-medium">{opt.label}</span>
                            {opt.meta ? (
                              <span className="mt-0.5 block text-xs text-[var(--muted-fg)]">{opt.meta}</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {m.followUps?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.followUps.map((f) => (
                        <button
                          key={f}
                          type="button"
                          disabled={busy}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--fg-secondary)] hover:bg-[var(--muted)] disabled:opacity-50"
                          onClick={() => void submitTurn({ message: f })}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.artifactId ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      onClick={() => {
                        setActiveArtifactId(m.artifactId!);
                        setPanelTab("artifact");
                      }}
                    >
                      Open artifact →
                    </button>
                  ) : null}
                </li>
              ))}
              <div ref={bottomRef} />
            </ul>
          )}
        </div>

        {/* Clarify strip */}
        {pendingClarify ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
              Need a couple details
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {pendingClarify.questions.map((q) => (
                <label key={q.id} className="block text-xs text-[var(--fg-secondary)]">
                  <span className="mb-1 block">{q.prompt}</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--fg)]"
                    value={clarifyDraft[q.field || q.id] || ""}
                    onChange={(e) =>
                      setClarifyDraft((d) => ({ ...d, [q.field || q.id]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
              onClick={onSubmitClarify}
            >
              Continue
            </button>
          </div>
        ) : null}

        {/* Composer */}
        <div className="shrink-0 border-t border-[var(--border)] p-3 md:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/50 p-2 shadow-[var(--shadow-sm)] focus-within:border-[var(--accent)]/45">
            <textarea
              ref={textareaRef}
              rows={2}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Pull up an account, draft a scope, ask about chipping, care guides, material…"
              className="max-h-36 min-h-[52px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted-fg)]"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !composer.trim()}
              onClick={onSend}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted-fg)]">
            Read-only assistant — retrieves and drafts; does not change quotes, jobs, inventory, or CRM records.
          </p>
        </div>
      </section>

      {/* Evidence / Artifact side panel */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] lg:w-[340px] xl:w-[380px]">
        <div className="flex shrink-0 border-b border-[var(--border)]">
          <button
            type="button"
            className={cn(
              "flex-1 px-3 py-2.5 text-xs font-semibold",
              panelTab === "evidence" ? "border-b-2 border-[var(--accent)] text-[var(--accent)]" : "text-[var(--muted-fg)]"
            )}
            onClick={() => setPanelTab("evidence")}
          >
            Sources & evidence
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 px-3 py-2.5 text-xs font-semibold",
              panelTab === "artifact" ? "border-b-2 border-[var(--accent)] text-[var(--accent)]" : "text-[var(--muted-fg)]"
            )}
            onClick={() => setPanelTab("artifact")}
          >
            Artifact
          </button>
        </div>

        {panelTab === "evidence" ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
            {!latestProvenance ? (
              <p className="text-xs leading-relaxed text-[var(--muted-fg)]">
                Company data, approved knowledge, and AI analysis will appear here when slabOS uses them.
              </p>
            ) : (
              <>
                <section>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-fg)]">
                    Company data used
                  </h3>
                  {latestProvenance.company.length ? (
                    <ul className="space-y-1">
                      {latestProvenance.company.map((c) => (
                        <li key={`${c.type}-${c.entityId}`} className="flex items-start gap-2 text-xs">
                          {c.type === "account" ? (
                            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          ) : c.type === "quote" ? (
                            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          ) : (
                            <Gem className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          )}
                          <span>
                            <span className="font-medium">{c.label}</span>
                            <span className="ml-1 text-[var(--muted-fg)]">({c.type})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--muted-fg)]">No company records loaded for this turn.</p>
                  )}
                </section>
                <section>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-fg)]">
                    Knowledge used
                  </h3>
                  {latestProvenance.knowledge.length ? (
                    <ul className="space-y-1.5">
                      {latestProvenance.knowledge.map((k) => (
                        <li key={k.id || k.title} className="text-xs">
                          <span className="font-medium">{k.title}</span>
                          {k.locator ? (
                            <span className="mt-0.5 block text-[var(--muted-fg)]">{k.locator}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--muted-fg)]">
                      No approved knowledge document was retrieved. Ask a Knowledge Admin to load manufacturer docs if you need verified guidance.
                    </p>
                  )}
                </section>
                <section>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-fg)]">
                    AI reasoning
                  </h3>
                  {latestProvenance.analysisNotes.length ? (
                    <ul className="space-y-1">
                      {latestProvenance.analysisNotes.map((n) => (
                        <li key={n.slice(0, 40)} className="text-xs leading-relaxed text-[var(--fg-secondary)]">
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--muted-fg)]">
                      Synthesis is labeled separately from facts pulled from company systems or approved docs.
                    </p>
                  )}
                </section>
              </>
            )}
            <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Skills</p>
              <p className="mt-1 text-xs text-[var(--fg-secondary)]">
                Reusable workflows when you want a guided form.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { href: "/tools/account-brief", label: "Account Brief", Icon: Building2 },
                  { href: "/tools/quote-scope", label: "Quote Scope", Icon: FileText },
                  { href: "/tools/machine-troubleshooter", label: "Troubleshooter", Icon: Wrench },
                  { href: "/tools/stone-care", label: "Stone Care", Icon: Sparkles },
                  { href: "/tools/remnant-pitch", label: "Remnant", Icon: Gem },
                ].map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--fg-secondary)] hover:bg-[var(--muted)]"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {activeArtifact ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                  <p className="truncate text-xs font-semibold">{activeArtifact.title}</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-1.5 py-1 text-[10px] font-medium",
                        editArtifactSource
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                      )}
                      title="Edit source"
                      onClick={() => setEditArtifactSource((v) => !v)}
                    >
                      {editArtifactSource ? "Done" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                      title="Copy"
                      onClick={() => void copyArtifact()}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                      title="DOCX"
                      onClick={() => void downloadArtifact()}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                      title="Print"
                      onClick={printArtifact}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {copied ? <p className="px-3 pt-1 text-[10px] text-[var(--accent)]">Copied</p> : null}
                {editArtifactSource ? (
                  <textarea
                    className="min-h-0 flex-1 resize-none bg-transparent px-3 py-3 font-[family-name:var(--font-body)] text-xs leading-relaxed text-[var(--fg)] outline-none"
                    value={activeArtifact.content}
                    onChange={(e) =>
                      setArtifacts((prev) =>
                        prev.map((a) => (a.id === activeArtifact.id ? { ...a, content: e.target.value } : a))
                      )
                    }
                  />
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    {activeArtifact.content.trim() ? (
                      <div className="ai-markdown prose-sm max-w-none text-sm leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeArtifact.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--muted-fg)]">Generating…</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="p-4 text-xs text-[var(--muted-fg)]">
                Generated scopes, care guides, and briefs appear here as editable artifacts — not raw chat paste.
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
