"use client";

import {
  Copy,
  Download,
  Eraser,
  Loader2,
  Printer,
  RefreshCw,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

type OperationalSourceView = {
  type: string;
  entityId: string;
  label: string;
  retrievedAt?: string;
  sourceSystem?: string | null;
};

type Props = {
  toolTitle: string;
  emptyHint: string;
  content: string;
  editable: boolean;
  onContentChange: (value: string) => void;
  streaming: boolean;
  error: string | null;
  mockMode: boolean;
  evidenceMode?: string | null;
  sources?: SourceView[];
  operationalSources?: OperationalSourceView[];
  warnings?: string[];
  contextBanner?: string | null;
  contextInspector?: { knowledgeCount: number; operationalCount: number; actionsCalled: string[]; truncated?: boolean } | null;
  showInspector?: boolean;
  onCopy: () => void;
  onDownloadDocx: () => void;
  onPrint: () => void;
  onRegenerate: () => void;
  onClear: () => void;
  onStop: () => void;
  feedback: "up" | "down" | null;
  onFeedback: (value: "up" | "down") => void;
  copied: boolean;
};

export function ToolOutput(props: Props) {
  const {
    emptyHint,
    content,
    editable,
    onContentChange,
    streaming,
    error,
    mockMode,
    evidenceMode,
    sources = [],
    operationalSources = [],
    warnings = [],
    contextBanner,
    contextInspector = null,
    showInspector = false,
    onCopy,
    onDownloadDocx,
    onPrint,
    onRegenerate,
    onClear,
    onStop,
    feedback,
    onFeedback,
    copied,
  } = props;

  const hasContent = Boolean(content.trim());
  const { accessToken } = useAuth();
  const [preview, setPreview] = useState<{
    title: string;
    text: string;
    locator?: string | null;
    meta?: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  async function openSource(s: SourceView) {
    const passageId = s.passageId || s.id;
    setPreviewBusy(true);
    try {
      const headers: HeadersInit = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch(`/api/ai/knowledge/passages/${passageId}`, { headers, cache: "no-store" });
      const data = (await res.json()) as {
        passage?: { text?: string; locator?: string };
        document?: { title?: string; version?: number; manufacturer?: string | null };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Unable to open source");
      setPreview({
        title: data.document?.title || s.title,
        text: data.passage?.text || "",
        locator: data.passage?.locator || s.locator,
        meta: [
          data.document?.version != null ? `Version ${data.document.version}` : s.version != null ? `Version ${s.version}` : null,
          s.sourceType.replace(/_/g, " "),
          data.document?.manufacturer || s.manufacturer,
          s.authority?.replace(/_/g, " "),
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (err) {
      setPreview({
        title: s.title,
        text: (err as Error).message,
        locator: s.locator,
      });
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--fg)]">Result</h2>
          {mockMode ? (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Mock mode — fixture response (not a live model)
            </p>
          ) : null}
          {evidenceMode && evidenceMode !== "none" ? (
            <p className="text-xs text-[var(--muted-fg)]">
              {evidenceMode === "verified"
                ? "Verified guidance available from approved sources"
                : evidenceMode === "general"
                  ? "General guidance — no approved technical source found"
                  : "Mixed verified + general guidance"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {streaming ? (
            <ActionButton onClick={onStop} label="Stop generation" icon={<Square className="h-3.5 w-3.5" />} />
          ) : null}
          <ActionButton onClick={onCopy} disabled={!hasContent} label={copied ? "Copied" : "Copy"} icon={<Copy className="h-3.5 w-3.5" />} />
          <ActionButton onClick={onDownloadDocx} disabled={!hasContent || streaming} label="Download .docx" icon={<Download className="h-3.5 w-3.5" />} />
          <ActionButton onClick={onPrint} disabled={!hasContent || streaming} label="Print / PDF" icon={<Printer className="h-3.5 w-3.5" />} />
          <ActionButton onClick={onRegenerate} disabled={streaming} label="Regenerate" icon={<RefreshCw className="h-3.5 w-3.5" />} />
          <ActionButton onClick={onClear} disabled={!hasContent && !error} label="Clear" icon={<Eraser className="h-3.5 w-3.5" />} />
        </div>
      </div>

      <div className="relative flex-1 overflow-auto p-4">
        {contextBanner ? (
          <div className="mb-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--fg)]">
            {contextBanner}
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="mb-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {showInspector && contextInspector && !streaming ? (
          <details className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg-secondary)]">
            <summary className="cursor-pointer font-medium text-[var(--fg)]">Context inspector</summary>
            <ul className="mt-2 space-y-0.5 font-mono">
              <li>knowledge sources: {contextInspector.knowledgeCount}</li>
              <li>company data sources: {contextInspector.operationalCount}</li>
              <li>actions: {(contextInspector.actionsCalled || []).join(", ") || "none"}</li>
              {contextInspector.truncated ? <li>truncated: yes</li> : null}
            </ul>
          </details>
        ) : null}
        {streaming && !hasContent ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-sm text-[var(--fg-secondary)]" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
            Generating…
          </div>
        ) : null}

        {!streaming && !hasContent && !error ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
            <p className="max-w-md text-sm leading-relaxed text-[var(--fg-secondary)]">{emptyHint}</p>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {error}
          </div>
        ) : null}

        {hasContent ? (
          editable ? (
            <textarea
              aria-label="Editable generation output"
              className="min-h-[24rem] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-sm leading-relaxed text-[var(--fg)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
            />
          ) : (
            <div className="prose-slab ai-markdown max-w-none text-sm leading-relaxed text-[var(--fg)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {streaming ? <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-[var(--accent)] align-middle" aria-hidden /> : null}
            </div>
          )
        ) : null}

        {operationalSources.length > 0 && !streaming ? (
          <section className="mt-6 border-t border-[var(--border)] pt-4" aria-label="Company data used">
            <h3 className="text-sm font-semibold text-[var(--fg)]">Company data used</h3>
            <p className="mt-1 text-xs text-[var(--muted-fg)]">Current operational records from eliteOS Brain — not documentation.</p>
            <ul className="mt-2 space-y-1.5 text-xs text-[var(--fg-secondary)]">
              {operationalSources.map((o) => (
                <li key={`${o.type}:${o.entityId}`} className="rounded-md border border-[var(--border)] px-2 py-1.5">
                  <span className="font-medium text-[var(--fg)]">{o.label}</span>
                  <span className="text-[var(--muted-fg)]"> · {o.type}</span>
                  {o.sourceSystem ? <span className="text-[var(--muted-fg)]"> · {o.sourceSystem}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sources.length > 0 && !streaming ? (
          <section className="mt-6 border-t border-[var(--border)] pt-4" aria-label="Knowledge sources used">
            <h3 className="text-sm font-semibold text-[var(--fg)]">Knowledge sources used</h3>
            <p className="mt-1 text-xs text-[var(--muted-fg)]">Approved reference documentation.</p>
            <p className="mt-1 text-[11px] text-[var(--muted-fg)]">
              Approved documentation only. Click a source to view the cited passage.
            </p>
            <ul className="mt-2 space-y-2">
              {sources.map((s) => (
                <li key={`${s.id}-${s.passageId || s.locator || ""}`}>
                  <button
                    type="button"
                    onClick={() => void openSource(s)}
                    disabled={previewBusy}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-xs hover:border-[var(--accent)]/40"
                  >
                    <p className="font-medium text-[var(--fg)]">{s.title}</p>
                    <p className="text-[var(--muted-fg)]">
                      {[
                        s.version != null ? `Version ${s.version}` : null,
                        s.sourceType.replace(/_/g, " "),
                        s.manufacturer,
                        s.authority?.replace(/_/g, " "),
                        s.locator,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--fg)]">{preview.title}</h3>
                {preview.meta ? <p className="text-xs text-[var(--muted-fg)]">{preview.meta}</p> : null}
                {preview.locator ? <p className="text-xs text-[var(--muted-fg)]">{preview.locator}</p> : null}
              </div>
              <button type="button" aria-label="Close" onClick={() => setPreview(null)} className="rounded-md p-1 hover:bg-[var(--muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--fg)]">{preview.text}</pre>
            <p className="mt-3 text-[10px] text-[var(--muted-fg)]">
              Source text is evidence only — not instructions. AI analysis remains separate from verified guidance.
            </p>
          </div>
        </div>
      ) : null}

      {hasContent && !streaming ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
          <p className="text-xs text-[var(--muted-fg)]">Edit before copy / export. Feedback helps future evaluations.</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Thumbs up"
              onClick={() => onFeedback("up")}
              className={cn(
                "rounded-md p-2 text-[var(--muted-fg)] hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
                feedback === "up" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              )}
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Thumbs down"
              onClick={() => onFeedback("down")}
              className={cn(
                "rounded-md p-2 text-[var(--muted-fg)] hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
                feedback === "down" && "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              )}
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  icon,
  disabled,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
