"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/components/auth/AuthProvider";

type DocRow = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  version: number;
  authority: string;
  manufacturer?: string | null;
  chunkCount: number;
  fileName?: string | null;
  processingError?: string | null;
  updatedAt?: string;
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  review_required: "Review required",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
  processing_failed: "Processing failed",
};

export default function KnowledgeLibraryPage() {
  const { accessToken, context } = useAuth();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!context?.canAdministerKnowledge) return;
    const headers: HeadersInit = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
    const res = await fetch(`/api/ai/knowledge/documents${qs}`, { headers, cache: "no-store" });
    const data = (await res.json()) as { rows?: DocRow[]; error?: string; warning?: string };
    if (!res.ok) {
      setError(data.error || "Unable to load knowledge library");
      return;
    }
    setRows(data.rows || []);
    setWarning(data.warning || null);
    setError(null);
  }, [accessToken, context?.canAdministerKnowledge, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!context?.canAdministerKnowledge) {
    return (
      <div>
        <AppHeader title="Knowledge" subtitle="Approved company and manufacturer documentation for AI Studio." />
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-secondary)]">
          Knowledge administration requires an eliteOS admin, super_admin, or executive role with{" "}
          <code className="text-xs">slab_ai</code> access. You can still see sources cited in AI results when available.
        </p>
      </div>
    );
  }

  return (
    <div>
      <AppHeader
        title="Knowledge Hub"
        subtitle="Upload, review, and approve documentation before it becomes AI evidence."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/knowledge/upload"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          Upload source
        </Link>
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" className="text-sm underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {warning ? <p className="mb-3 text-xs text-amber-800">{warning}</p> : null}
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/knowledge/${row.id}`}
              className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--fg)]">{row.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted-fg)]">
                    {row.sourceType.replace(/_/g, " ")} · v{row.version} · {row.authority.replace(/_/g, " ")}
                    {row.manufacturer ? ` · ${row.manufacturer}` : ""}
                    {row.chunkCount ? ` · ${row.chunkCount} passages` : ""}
                  </p>
                </div>
                <span className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {STATUS_LABEL[row.status] || row.status}
                </span>
              </div>
              {row.processingError ? (
                <p className="mt-2 text-xs text-[var(--danger)]">{row.processingError}</p>
              ) : null}
            </Link>
          </li>
        ))}
        {!rows.length && !error ? (
          <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted-fg)]">
            No knowledge sources yet. Upload a PDF, DOCX, TXT, or Markdown file to begin.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
