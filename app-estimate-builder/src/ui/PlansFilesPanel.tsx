import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import type { QuoteFile } from "../lib/estimateTypes";

/**
 * Plans & files for the open estimate, stored in the shared `quote_files` system (same Brain routes
 * Internal Estimate and Quote Library use). Saved estimates upload straight onto the quote; before the
 * first save, uploads are held as pending ids and Brain links them on save. Files follow the current
 * revision. The browser never sees storage paths — only short-lived signed URLs.
 */

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.gif,.doc,.docx,.txt,application/pdf,image/*";
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|gif)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/i;

function roleFor(mime: string): string {
  if (mime === "application/pdf") return "cabinet_plan";
  if (mime.startsWith("image/")) return "photo";
  return "other";
}

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTag(mime: string | null): string {
  if (mime === "application/pdf") return "PDF";
  if (mime?.startsWith("image/")) return "IMG";
  if (mime?.includes("word")) return "DOC";
  return "FILE";
}

export default function PlansFilesPanel({
  token,
  quoteId,
  pending,
  onPendingChange,
  readOnly,
  preview
}: {
  token: string;
  quoteId: string | null;
  pending: QuoteFile[];
  onPendingChange: (next: QuoteFile[]) => void;
  readOnly: boolean;
  preview: boolean;
}) {
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", stop);
    document.addEventListener("drop", stop);
    return () => {
      document.removeEventListener("dragover", stop);
      document.removeEventListener("drop", stop);
    };
  }, []);

  const load = useCallback(async () => {
    if (!quoteId || preview) {
      setFiles([]);
      return;
    }
    try {
      const res = await apiGet<{ files?: QuoteFile[] }>(`/api/quote-files?quoteId=${encodeURIComponent(quoteId)}`, token);
      setFiles(Array.isArray(res.files) ? res.files : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [quoteId, token, preview]);

  useEffect(() => {
    setError(null);
    void load();
  }, [load]);

  const upload = useCallback(
    async (list: File[]) => {
      if (!list.length || readOnly || preview) return;
      setError(null);
      const added: QuoteFile[] = [];
      const failures: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const mime = file.type || "application/octet-stream";
        if (file.size > MAX_BYTES) {
          failures.push(`${file.name} is over 50 MB`);
          continue;
        }
        if (!ALLOWED_MIME.test(mime)) {
          failures.push(`${file.name} is not a PDF, image, Word, or text file`);
          continue;
        }
        setBusy(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : "Uploading…");
        try {
          const intent = await apiPost<{ quoteFileId: string; signedUploadUrl: string }>("/api/quote-files/upload-intent", token, {
            ...(quoteId ? { quoteId } : {}),
            originalFilename: file.name,
            mimeType: mime,
            fileSizeBytes: file.size,
            fileRole: roleFor(mime),
            visibility: "internal"
          });
          const put = await fetch(intent.signedUploadUrl, { method: "PUT", headers: { "content-type": mime }, body: file });
          if (!put.ok) throw new Error(`storage upload failed (HTTP ${put.status})`);
          await apiPost("/api/quote-files/confirm-upload", token, { quoteFileId: intent.quoteFileId });
          added.push({
            id: intent.quoteFileId,
            originalFilename: file.name,
            fileRole: roleFor(mime),
            mimeType: mime,
            fileSizeBytes: file.size,
            createdAt: new Date().toISOString()
          });
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setBusy(null);
      if (failures.length) setError(failures.join(" · "));
      if (!added.length) return;
      if (quoteId) await load();
      else onPendingChange([...pending, ...added]);
    },
    [quoteId, token, readOnly, preview, load, pending, onPendingChange]
  );

  const download = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const res = await apiPost<{ signedUrl: string }>("/api/quote-files/download-url", token, { quoteFileId: id });
        window.open(res.signedUrl, "_blank", "noopener,noreferrer");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [token]
  );

  const remove = useCallback(
    async (f: QuoteFile) => {
      if (!window.confirm(`Remove "${f.originalFilename}" from this estimate?`)) return;
      setError(null);
      try {
        await apiPost("/api/quote-files/archive", token, { quoteFileId: f.id });
        if (pending.some((p) => p.id === f.id)) onPendingChange(pending.filter((p) => p.id !== f.id));
        else await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [token, pending, onPendingChange, load]
  );

  const disabled = readOnly || preview || Boolean(busy);
  const rows: Array<QuoteFile & { pendingLink?: boolean }> = [...files, ...pending.map((p) => ({ ...p, pendingLink: true }))];

  return (
    <section className="eb-files" aria-labelledby="eb-files-title">
      <div className="eb-files-head">
        <h2 id="eb-files-title">Plans &amp; files</h2>
        {rows.length ? <span className="eb-muted eb-small">{rows.length}</span> : null}
      </div>
      <div
        className={`eb-files-drop${dragOver ? " is-over" : ""}${disabled ? " is-disabled" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          if (!disabled && Array.from(e.dataTransfer.types).includes("Files")) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          if (!disabled) void upload(Array.from(e.dataTransfer.files));
        }}
      >
        {preview ? (
          <p className="eb-small eb-muted">Attaching files needs a signed-in session.</p>
        ) : readOnly ? (
          <p className="eb-small eb-muted">Files live on the current revision.</p>
        ) : busy ? (
          <p className="eb-small">{busy}</p>
        ) : (
          <p className="eb-small">
            Drop plans here or{" "}
            <button type="button" className="eb-link" onClick={() => inputRef.current?.click()}>
              choose files
            </button>
            <span className="eb-muted"> · PDF, images, Word · 50 MB max</span>
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            void upload(list);
          }}
        />
      </div>
      {error ? <p className="eb-small eb-danger-text">{error}</p> : null}
      {rows.length ? (
        <ul className="eb-files-list">
          {rows.map((f) => (
            <li key={f.id}>
              <span className="eb-files-tag" aria-hidden="true">
                {fileTag(f.mimeType)}
              </span>
              <span className="eb-files-name">
                <button type="button" className="eb-link" title={f.originalFilename} onClick={() => void download(f.id)}>
                  {f.originalFilename}
                </button>
                <span className="eb-muted eb-small">
                  {formatBytes(f.fileSizeBytes)}
                  {f.pendingLink ? " · attaches when you save" : ""}
                </span>
              </span>
              {!readOnly && !preview ? (
                <button type="button" className="eb-link eb-files-remove" aria-label={`Remove ${f.originalFilename}`} onClick={() => void remove(f)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
