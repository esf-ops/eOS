"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Bug,
  Building2,
  FileText,
  Gem,
  Loader2,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  BRAIN_AGENT_CHAT_PATH,
  answerStateBanner,
  buildBrainAgentContext,
  canShowBrainAgentDebug,
  displayAnswerForUser,
  formatEvidenceForDisplay,
  mergeResolvedFromEvidence,
  sanitizeDebugPayload,
  type BrainAgentRunResult,
  type BrainAgentThreadContext,
  type BrainEvidenceItem,
} from "@/lib/brainAgent";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type Provenance = {
  company: Array<{ type: string; entityId: string; label: string }>;
  knowledge: Array<{ id: string; title: string; locator?: string | null }>;
  analysisNotes: string[];
};

type ClarifyOption = { id: string; label: string; meta?: string };

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  answerState?: string;
  options?: ClarifyOption[];
  provenance?: Provenance;
  freshnessWarnings?: string[];
  toolCalls?: number;
  streaming?: boolean;
};

const STARTERS = [
  { label: "Account status", prompt: "What's going on with our top builder accounts recently?" },
  { label: "Find a quote", prompt: "Find the latest quote for an account I name." },
  { label: "Material on hand", prompt: "Do we have any Taj Mahal slabs that could work for a vanity?" },
  { label: "Company knowledge", prompt: "What do our approved install standards say about seam placement?" },
  { label: "Account lookup", prompt: "Pull up Garman Built." },
  { label: "Jobs for an account", prompt: "Show recent jobs for an account I have open." },
];

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function chipsFromContext(ctx: BrainAgentThreadContext) {
  const chips: Array<{ type: string; id: string; label: string }> = [];
  if (ctx.accountId && ctx.accountLabel) chips.push({ type: "account", id: ctx.accountId, label: ctx.accountLabel });
  if (ctx.quoteId && ctx.quoteLabel) chips.push({ type: "quote", id: ctx.quoteId, label: ctx.quoteLabel });
  if (ctx.jobId && ctx.jobLabel) chips.push({ type: "job", id: ctx.jobId, label: ctx.jobLabel });
  if (ctx.materialLabel) chips.push({ type: "material", id: "material", label: ctx.materialLabel });
  return chips;
}

function provenanceFromEvidence(evidence: BrainEvidenceItem[] | undefined): Provenance {
  const formatted = formatEvidenceForDisplay(evidence);
  return {
    company: formatted.company.map((c) => ({
      type: c.type,
      entityId: c.entityId,
      label: c.label,
    })),
    knowledge: formatted.knowledge.map((k) => ({
      id: k.entityId,
      title: k.label,
      locator: k.freshnessNote || null,
    })),
    analysisNotes: formatted.freshnessWarnings,
  };
}

export function AssistantWorkspace() {
  const { accessToken, context: authContext } = useAuth();
  const [thread, setThread] = useState<BrainAgentThreadContext>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [latestEvidence, setLatestEvidence] = useState<BrainEvidenceItem[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [lastDebug, setLastDebug] = useState<Record<string, unknown> | null>(null);
  const [wantDebug, setWantDebug] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const showDebugControls = canShowBrainAgentDebug(authContext?.role);

  const authHeaders = useCallback((): HeadersInit => {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }, [accessToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const latestProvenance = [...messages].reverse().find((m) => m.provenance)?.provenance || null;

  function clearChip(type: string) {
    setThread((c) => {
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

  async function submitTurn(opts: { message: string; entityPick?: ClarifyOption }) {
    const displayText = opts.message.trim();
    if (!displayText) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: uid(), role: "user", text: displayText },
    ];
    setMessages(nextMessages);
    setBusy(true);

    let resolved = { ...thread };
    if (opts.entityPick) {
      // Attach chosen clarify option for the model — do not classify account vs quote in the app.
      resolved = {
        ...resolved,
        selectedEntityId: opts.entityPick.id,
        selectedEntityLabel: opts.entityPick.label,
      };
      setThread(resolved);
    }

    const context = buildBrainAgentContext({
      resolved,
      recentMessages: nextMessages.map((m) => ({ role: m.role, text: m.text })),
      latestEvidence,
    });

    try {
      const res = await fetch(BRAIN_AGENT_CHAT_PATH, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          message: displayText,
          context,
          debug: wantDebug && showDebugControls,
        }),
      });
      const data = (await res.json()) as BrainAgentRunResult & {
        path?: string;
        legacyAssistant?: boolean;
        error?: string;
      };

      if (data.legacyAssistant === true || data.path === "legacy-assistant") {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: "Misrouted to the legacy assistant. Primary chat must use the Brain Agent.",
            answerState: "CAPABILITY_UNAVAILABLE",
          },
        ]);
        return;
      }

      if (showDebugControls && wantDebug) {
        setLastDebug(
          sanitizeDebugPayload({
            ...data,
            evidence: data.evidence,
          } as Record<string, unknown>)
        );
      }

      if (!res.ok && !data.answer) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: data.error || data.answer || "Unable to reach the Brain Agent.",
            answerState: data.answerState || "CAPABILITY_UNAVAILABLE",
          },
        ]);
        return;
      }

      const evidence = Array.isArray(data.evidence) ? data.evidence : [];
      setLatestEvidence(evidence);
      setThread((prev) => mergeResolvedFromEvidence({ ...prev, ...resolved }, evidence));

      const provenance = provenanceFromEvidence(evidence);
      const freshness = formatEvidenceForDisplay(evidence).freshnessWarnings;
      const banner = answerStateBanner(data.answerState);

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: data.answer || "I don't have enough authoritative eliteOS data to answer that.",
          answerState: data.answerState,
          options: data.answerState === "AMBIGUOUS_ENTITY" ? data.options : undefined,
          provenance,
          freshnessWarnings: [
            ...(banner && banner.tone !== "ok" ? [banner.label] : []),
            ...freshness,
          ],
          toolCalls: data.toolCalls,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: (err as Error).message || "Request failed.",
          answerState: "CAPABILITY_UNAVAILABLE",
        },
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

  function onSelectOption(opt: ClarifyOption) {
    void submitTurn({
      message: `Use this match: ${opt.label}`,
      entityPick: opt,
    });
  }

  const chips = chipsFromContext(thread);
  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col gap-3 lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <header className="shrink-0 border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-fg)]">
                eliteOS
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--fg)] md:text-[1.75rem]">
                Ask eliteOS
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--fg-secondary)]">
                Natural language over your authorized company data. The Brain Agent investigates —
                no Skill picker required.
              </p>
            </div>
            {showDebugControls ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--muted-fg)]">
                  <input
                    type="checkbox"
                    checked={wantDebug}
                    onChange={(e) => setWantDebug(e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  Agent debug
                </label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--fg-secondary)] hover:bg-[var(--muted)]"
                  onClick={() => setDebugOpen((v) => !v)}
                >
                  <Bug className="h-3 w-3" />
                  {debugOpen ? "Hide trace" : "Show trace"}
                </button>
              </div>
            ) : null}
          </div>
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

        {showDebugControls && debugOpen ? (
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--muted)]/25 px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
              Agent debug (admin)
            </p>
            {lastDebug ? (
              <pre className="max-h-40 overflow-auto rounded-lg bg-[var(--bg)] p-2 text-[10px] leading-relaxed text-[var(--fg-secondary)]">
                {JSON.stringify(lastDebug, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-[var(--muted-fg)]">
                Enable “Agent debug” and send a message to capture tool trace, latency, and validation.
              </p>
            )}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          {empty ? (
            <div className="mx-auto flex max-w-2xl flex-col items-stretch gap-6 pt-6 md:pt-10">
              <p className="text-center text-sm text-[var(--fg-secondary)]">
                Ask about accounts, quotes, jobs, inventory, or approved company knowledge.
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
                Prefer a guided form?{" "}
                <Link href="/tools" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                  Open Skills
                </Link>
              </p>
            </div>
          ) : (
            <ul className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((m) => {
                const banner = answerStateBanner(m.answerState);
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "rounded-xl px-3.5 py-3 text-sm leading-relaxed",
                      m.role === "user"
                        ? "ml-8 bg-[var(--accent)] text-white"
                        : "mr-4 border border-[var(--border)] bg-[var(--bg)]/40 text-[var(--fg)]"
                    )}
                  >
                    {m.role === "assistant" && banner ? (
                      <p
                        className={cn(
                          "mb-2 rounded-md px-2 py-1 text-[11px] font-medium",
                          banner.tone === "deny" && "bg-red-500/10 text-red-700",
                          banner.tone === "warn" && "bg-amber-500/10 text-amber-800",
                          banner.tone === "info" && "bg-[var(--muted)] text-[var(--fg-secondary)]"
                        )}
                      >
                        {banner.label}
                      </p>
                    ) : null}
                    {m.role === "assistant" ? (
                      <div className="ai-markdown prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {displayAnswerForUser(m.text, { showEvidenceIds: wantDebug && showDebugControls })}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    )}
                    {typeof m.toolCalls === "number" && m.role === "assistant" ? (
                      <p className="mt-1.5 text-[10px] text-[var(--muted-fg)]">
                        Investigation: {m.toolCalls} tool call{m.toolCalls === 1 ? "" : "s"}
                      </p>
                    ) : null}
                    {m.freshnessWarnings?.length ? (
                      <ul className="mt-2 space-y-0.5">
                        {m.freshnessWarnings.map((w) => (
                          <li key={w.slice(0, 48)} className="text-[11px] text-amber-800">
                            {w}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.options?.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {m.options.map((opt) => (
                          <li key={opt.id}>
                            <button
                              type="button"
                              disabled={busy}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/30 disabled:opacity-50"
                              onClick={() => onSelectOption(opt)}
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
                  </li>
                );
              })}
              {busy ? (
                <li className="mr-4 inline-flex items-center gap-1.5 px-3.5 text-xs text-[var(--muted-fg)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Investigating…
                </li>
              ) : null}
              <div ref={bottomRef} />
            </ul>
          )}
        </div>

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
              placeholder="Ask about an account, quote, job, material, or company knowledge…"
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
            Read-only Brain Agent — investigates authorized eliteOS data; does not change records.
          </p>
        </div>
      </section>

      <aside className="flex min-h-0 w-full shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] lg:w-[340px] xl:w-[380px]">
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5 text-xs font-semibold text-[var(--accent)]">
          Sources & evidence
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {!latestProvenance ? (
            <p className="text-xs leading-relaxed text-[var(--muted-fg)]">
              Company data and approved knowledge used by the agent will appear here.
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
                        {c.type === "account" || c.type.includes("account") ? (
                          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        ) : c.type === "quote" || c.type.includes("quote") ? (
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
                  <p className="text-xs text-[var(--muted-fg)]">No company records cited for this turn.</p>
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
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--muted-fg)]">No approved knowledge passages cited.</p>
                )}
              </section>
              {latestProvenance.analysisNotes.length ? (
                <section>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-fg)]">
                    Freshness
                  </h3>
                  <ul className="space-y-1">
                    {latestProvenance.analysisNotes.map((n) => (
                      <li key={n.slice(0, 40)} className="text-xs text-amber-800">
                        {n}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Skills</p>
            <p className="mt-1 text-xs text-[var(--fg-secondary)]">
              Optional guided forms — not required for Ask eliteOS.
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
      </aside>
    </div>
  );
}
