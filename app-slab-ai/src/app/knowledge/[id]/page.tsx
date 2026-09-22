"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/components/auth/AuthProvider";

type Doc = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  version: number;
  authority: string;
  manufacturer?: string | null;
  machineModel?: string | null;
  material?: string | null;
  chunkCount: number;
  fileName?: string | null;
  extractionPreview?: string | null;
  processingError?: string | null;
  approvedAt?: string | null;
  reviewNote?: string | null;
  contentSha256?: string | null;
  extractionMethod?: string | null;
  ocrStatus?: string | null;
  ocrProvider?: string | null;
  ocrPageCount?: number | null;
  ocrError?: string | null;
  embeddingStatus?: string | null;
  embeddingError?: string | null;
};

type Passage = {
  id: string;
  locator?: string | null;
  text: string;
  page_number?: number | null;
  section_title?: string | null;
  extraction_origin?: string | null;
};

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, context } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!context?.canAdministerKnowledge) return;
    const headers: HeadersInit = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`/api/ai/knowledge/documents/${params.id}`, { headers, cache: "no-store" });
    const data = (await res.json()) as { document?: Doc; passages?: Passage[]; error?: string };
    if (!res.ok) {
      setError(data.error || "Unable to load document");
      return;
    }
    setDoc(data.document || null);
    setPassages(data.passages || []);
    setError(null);
  }, [accessToken, context?.canAdministerKnowledge, params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch(`/api/ai/knowledge/documents/${params.id}?action=${action}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ note, ...extra }),
      });
      const data = (await res.json()) as { error?: string; document?: Doc };
      if (!res.ok) throw new Error(data.error || "Action failed");
      setDoc(data.document || null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!context?.canAdministerKnowledge) {
    return (
      <div>
        <AppHeader title="Source detail" subtitle="Admin only" />
        <p className="text-sm">Knowledge administration permission required.</p>
      </div>
    );
  }

  return (
    <div>
      <AppHeader title={doc?.title || "Source detail"} subtitle="Review extracted content before approval." />
      <p className="mb-4 text-xs text-[var(--muted-fg)]">
        <Link href="/knowledge" className="underline">
          ← Knowledge library
        </Link>
      </p>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {doc ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--muted-fg)]">Status</dt>
                <dd className="font-medium">{doc.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-fg)]">Version</dt>
                <dd className="font-medium">v{doc.version}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-fg)]">Type / authority</dt>
                <dd>
                  {doc.sourceType} · {doc.authority}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-fg)]">Chunks</dt>
                <dd>{doc.chunkCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-fg)]">File</dt>
                <dd>{doc.fileName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-fg)]">Manufacturer / model</dt>
                <dd>
                  {doc.manufacturer || "—"} / {doc.machineModel || "—"}
                </dd>
              </div>
            </dl>
            {doc.extractionMethod === "ocr" || doc.extractionMethod === "mixed" ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                OCR extracted — verify technical values (RPM, dimensions, model numbers) before approval.
                {doc.ocrPageCount ? ` · ${doc.ocrPageCount} pages` : ""}
                {doc.ocrProvider ? ` · ${doc.ocrProvider}` : ""}
              </p>
            ) : null}
            {doc.embeddingStatus && doc.embeddingStatus !== "complete" ? (
              <p className="mt-2 text-xs text-[var(--muted-fg)]">
                Semantic index: {doc.embeddingStatus}
                {doc.embeddingError ? ` — ${doc.embeddingError}` : ""}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">Review note</h3>
            <textarea
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {doc.status === "review_required" || doc.status === "rejected" || doc.status === "archived" ? (
                <button type="button" disabled={busy} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white" onClick={() => void act("approve")}>
                  Approve
                </button>
              ) : null}
              {doc.status === "review_required" ? (
                <button type="button" disabled={busy} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs" onClick={() => void act("reject")}>
                  Reject
                </button>
              ) : null}
              {doc.status === "approved" ? (
                <button type="button" disabled={busy} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs" onClick={() => void act("archive")}>
                  Archive
                </button>
              ) : null}
              {doc.status === "archived" || doc.status === "rejected" ? (
                <button type="button" disabled={busy} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs" onClick={() => void act("restore")}>
                  Restore to review
                </button>
              ) : null}
              {doc.status === "processing_failed" || doc.ocrStatus === "failed" || doc.embeddingStatus === "failed" ? (
                <button type="button" disabled={busy} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs" onClick={() => void act("reprocess")}>
                  Retry processing
                </button>
              ) : null}
              {doc.status === "review_required" || doc.status === "processing_failed" ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-900"
                  onClick={() => void act("reprocess", { forceOcr: true })}
                >
                  Force OCR reprocess
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted-fg)]">
              Approval is required before this source can appear in AI retrieval. Upload ≠ trust.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">Extracted preview</h3>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-3 text-xs leading-relaxed">
              {doc.extractionPreview || "(no preview)"}
            </pre>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">Passages ({passages.length})</h3>
            <ul className="mt-3 max-h-96 space-y-3 overflow-auto">
              {passages.map((p) => (
                <li key={p.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">
                  <p className="font-medium text-[var(--muted-fg)]">
                    {p.locator || p.section_title || "Passage"}
                    {p.page_number != null ? ` · page ${p.page_number}` : ""}
                    {p.extraction_origin === "ocr" ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                        OCR
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--fg)]">{p.text.slice(0, 600)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-fg)]">Loading…</p>
      )}
    </div>
  );
}
