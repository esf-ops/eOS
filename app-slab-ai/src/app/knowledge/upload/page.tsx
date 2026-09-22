"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/components/auth/AuthProvider";

const SOURCE_TYPES = [
  { id: "sop", label: "Company SOP" },
  { id: "machine_manual", label: "Machine Manual" },
  { id: "tooling_manual", label: "Tooling / Blade Documentation" },
  { id: "material_care", label: "Material Technical Documentation" },
  { id: "manufacturer", label: "Manufacturer Care Guide" },
  { id: "safety", label: "Safety Document" },
  { id: "install_standard", label: "Installation Standard" },
  { id: "quote_policy", label: "Quote / Sales Policy" },
  { id: "training", label: "Training Document" },
  { id: "customer_care_policy", label: "Customer Care Policy" },
  { id: "other", label: "General Reference" },
];

const AUTHORITIES = [
  { id: "company_policy", label: "Company policy" },
  { id: "manufacturer_primary", label: "Manufacturer primary" },
  { id: "tooling_supplier", label: "Tooling supplier" },
  { id: "internal_training", label: "Internal training" },
  { id: "general_reference", label: "General reference" },
];

export default function KnowledgeUploadPage() {
  const { accessToken, context } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("sop");
  const [authority, setAuthority] = useState("company_policy");
  const [manufacturer, setManufacturer] = useState("");
  const [machineModel, setMachineModel] = useState("");
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);

  if (!context?.canAdministerKnowledge) {
    return (
      <div>
        <AppHeader title="Upload knowledge" subtitle="Admin only" />
        <p className="text-sm text-[var(--fg-secondary)]">You do not have knowledge administration permission.</p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF, DOCX, TXT, or Markdown file.");
      return;
    }
    setBusy(true);
    setError(null);
    setDup(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);

      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch("/api/ai/knowledge/documents", {
        method: "POST",
        headers,
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          fileBase64,
          title: title || file.name.replace(/\.[^.]+$/, ""),
          sourceType,
          authority,
          manufacturer: manufacturer || undefined,
          machineModel: machineModel || undefined,
          material: material || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        document?: { id: string };
        duplicateWarning?: { title?: string; id?: string };
      };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.duplicateWarning) {
        setDup(`Exact duplicate of “${data.duplicateWarning.title || data.duplicateWarning.id}” already in this organization.`);
      }
      if (data.document?.id) router.push(`/knowledge/${data.document.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AppHeader
        title="Upload knowledge"
        subtitle="Files are stored privately, extracted for review, and are not AI-searchable until approved."
      />
      <p className="mb-4 text-xs text-[var(--muted-fg)]">
        <Link href="/knowledge" className="underline">
          ← Knowledge library
        </Link>
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">File (PDF, DOCX, TXT, Markdown · max 25 MB)</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            required
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Defaults to filename"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Source type</span>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Authority class</span>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
          >
            {AUTHORITIES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Manufacturer</span>
            <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Machine model</span>
            <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" value={machineModel} onChange={(e) => setMachineModel(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Material</span>
            <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" value={material} onChange={(e) => setMaterial(e.target.value)} />
          </label>
        </div>
        {dup ? <p className="text-xs text-amber-800">{dup}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Uploading & extracting…" : "Upload for review"}
        </button>
      </form>
    </div>
  );
}
