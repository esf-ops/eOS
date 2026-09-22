"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClientToolById } from "@/lib/ai-tools/client-catalog";

type HistoryRow = {
  id: string;
  toolId: string;
  title?: string;
  status: string;
  preview?: string;
  createdAt: string;
  sources?: unknown[];
};

export default function RecentPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    id: string;
    toolId: string;
    outputContent?: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    const headers: HeadersInit = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    void fetch("/api/ai/history?limit=40", { headers, cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { rows?: HistoryRow[]; warning?: string; error?: string };
        if (!res.ok) throw new Error(data.error || "Unable to load history");
        setRows(data.rows || []);
        setWarning(data.warning || null);
      })
      .catch((err) => setError((err as Error).message));
  }, [accessToken]);

  async function openRow(id: string) {
    const headers: HeadersInit = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`/api/ai/history/${id}`, { headers, cache: "no-store" });
    const data = (await res.json()) as {
      generation?: { id: string; toolId: string; outputContent?: string; title?: string };
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Unable to open generation");
      return;
    }
    setSelected(data.generation || null);
  }

  return (
    <div>
      <AppHeader
        title="Recent"
        subtitle="Organization-scoped generation history for your account. Cross-org access is blocked server-side."
      />
      {warning ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {warning}
        </p>
      ) : null}
      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      {selected ? (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--fg)]">{selected.title || selected.toolId}</h2>
              <Link
                href={`/tools/${getClientToolById(selected.toolId)?.slug || selected.toolId}`}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Open tool to regenerate
              </Link>
            </div>
            <button type="button" className="text-xs underline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap text-sm text-[var(--fg-secondary)]">
            {selected.outputContent || "(empty)"}
          </pre>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
              onClick={() => void navigator.clipboard.writeText(selected.outputContent || "")}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center text-sm text-[var(--fg-secondary)]">
          No durable generations yet. Run a tool after applying <code>eliteos_slab_ai_v1.sql</code>.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((entry) => {
            const tool = getClientToolById(entry.toolId);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => void openRow(entry.id)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-sm)] hover:border-[var(--accent)]/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--accent)]">{tool?.title || entry.toolId}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted-fg)]">
                        {new Date(entry.createdAt).toLocaleString()} · {entry.status}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--fg-secondary)]">
                    {entry.preview || entry.title}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
