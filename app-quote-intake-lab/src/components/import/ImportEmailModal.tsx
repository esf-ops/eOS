import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { formatByteLimit, LAB_MAX_ATTACHMENT_BYTES, LAB_MAX_EML_BYTES } from "../../inbound/limits.mjs";

type Method = "eml" | "paste";
type Step = "method" | "input" | "preview" | "success";

type PreviewState = {
  message: any;
  duplicateOfCaseId: string | null;
  duplicateReason: string | null;
  canConfirm: boolean;
};

type ImportRepo = {
  previewImport: (source: unknown) => Promise<PreviewState>;
  confirmImport: (message: unknown) => Promise<unknown>;
};

type Props = {
  open: boolean;
  repo: ImportRepo;
  importActor: string;
  onClose: () => void;
  onImported: (caseId: string) => void;
  onOpenCase: (caseId: string) => void;
};

const EMPTY_PASTE = {
  senderName: "",
  senderEmail: "",
  to: "sales@example.com",
  cc: "",
  subject: "",
  dateReceived: "",
  bodyText: "",
  mailbox: "sales@example.com"
};

export default function ImportEmailModal({ open, repo, importActor, onClose, onImported, onOpenCase }: Props) {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>("eml");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [paste, setPaste] = useState(EMPTY_PASTE);
  const [pasteFiles, setPasteFiles] = useState<File[]>([]);
  const [emlFile, setEmlFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("method");
    setMethod("eml");
    setError(null);
    setBusy(false);
    setPreview(null);
    setCreatedCaseId(null);
    setPaste(EMPTY_PASTE);
    setPasteFiles([]);
    setEmlFile(null);
  }, [open]);

  if (!open) return null;

  async function fileToBytes(file: File): Promise<Uint8Array> {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function buildPreview() {
    setError(null);
    setBusy(true);
    try {
      let source: any;
      if (method === "eml") {
        if (!emlFile) throw new Error("Choose a .eml file to continue.");
        if (!emlFile.name.toLowerCase().endsWith(".eml")) {
          throw new Error("Only .eml files are accepted.");
        }
        if (emlFile.size > LAB_MAX_EML_BYTES) {
          throw new Error(`File exceeds lab-only limit of ${formatByteLimit(LAB_MAX_EML_BYTES)}.`);
        }
        source = {
          kind: "eml_upload",
          bytes: await fileToBytes(emlFile),
          filename: emlFile.name,
          importActor
        };
      } else {
        const attachments = [];
        for (const f of pasteFiles) {
          if (f.size > LAB_MAX_ATTACHMENT_BYTES) {
            throw new Error(`Attachment ${f.name} exceeds ${formatByteLimit(LAB_MAX_ATTACHMENT_BYTES)}.`);
          }
          attachments.push({
            filename: f.name,
            contentType: f.type || "application/octet-stream",
            bytes: await fileToBytes(f)
          });
        }
        source = {
          kind: "manual_paste",
          importActor,
          input: { ...paste, attachments }
        };
      }
      const result = (await repo.previewImport(source)) as PreviewState;
      setPreview(result);
      setStep("preview");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview?.canConfirm || !preview.message) return;
    setBusy(true);
    setError(null);
    try {
      const result: any = await repo.confirmImport(preview.message);
      if (result.duplicate) {
        setError(result.reason || "Duplicate import blocked.");
        setPreview({
          ...preview,
          canConfirm: false,
          duplicateOfCaseId: result.caseId,
          duplicateReason: result.reason
        });
        return;
      }
      setCreatedCaseId(result.caseId);
      setStep("success");
      onImported(result.caseId);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function onPasteFiles(e: ChangeEvent<HTMLInputElement>) {
    setPasteFiles(Array.from(e.target.files ?? []));
  }

  function submitInput(e: FormEvent) {
    e.preventDefault();
    void buildPreview();
  }

  const msg = preview?.message;

  return (
    <div className="qil-modal-root" role="dialog" aria-modal="true" aria-labelledby="qil-import-title">
      <button type="button" className="qil-modal-backdrop" aria-label="Cancel import" onClick={onClose} />
      <div className="qil-modal">
        <header className="qil-modal-header">
          <div>
            <p className="qil-eyebrow">Local lab import</p>
            <h2 id="qil-import-title">Import email</h2>
          </div>
          <button type="button" className="qil-close-btn" onClick={onClose} aria-label="Close import dialog">
            ×
          </button>
        </header>

        <div className="qil-modal-body">
          {error ? <div className="qil-import-error">{error}</div> : null}

          {step === "method" ? (
            <div className="qil-import-method">
              <p>Choose how to bring a synthetic email into the lab. Nothing is uploaded to a server.</p>
              <div className="qil-import-method-grid">
                <button
                  type="button"
                  className={`qil-method-card${method === "eml" ? " is-active" : ""}`}
                  onClick={() => setMethod("eml")}
                >
                  <strong>Upload .eml</strong>
                  <span>Parse a local RFC822 export</span>
                </button>
                <button
                  type="button"
                  className={`qil-method-card${method === "paste" ? " is-active" : ""}`}
                  onClick={() => setMethod("paste")}
                >
                  <strong>Paste manually</strong>
                  <span>Enter headers, body, and files</span>
                </button>
              </div>
              <div className="qil-modal-actions">
                <button type="button" className="qil-btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="qil-btn-primary" onClick={() => setStep("input")}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === "input" ? (
            <form className="qil-import-form" onSubmit={submitInput}>
              {method === "eml" ? (
                <label className="qil-field">
                  <span className="qil-field-label">.eml file (lab-only, max {formatByteLimit(LAB_MAX_EML_BYTES)})</span>
                  <input
                    type="file"
                    accept=".eml,message/rfc822"
                    onChange={(e) => setEmlFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </label>
              ) : (
                <>
                  <div className="qil-form-grid">
                    <label className="qil-field">
                      <span className="qil-field-label">Sender name</span>
                      <input
                        value={paste.senderName}
                        onChange={(e) => setPaste({ ...paste, senderName: e.target.value })}
                      />
                    </label>
                    <label className="qil-field">
                      <span className="qil-field-label">Sender email *</span>
                      <input
                        type="email"
                        required
                        value={paste.senderEmail}
                        onChange={(e) => setPaste({ ...paste, senderEmail: e.target.value })}
                      />
                    </label>
                    <label className="qil-field">
                      <span className="qil-field-label">To *</span>
                      <input
                        required
                        value={paste.to}
                        onChange={(e) => setPaste({ ...paste, to: e.target.value })}
                      />
                    </label>
                    <label className="qil-field">
                      <span className="qil-field-label">CC</span>
                      <input value={paste.cc} onChange={(e) => setPaste({ ...paste, cc: e.target.value })} />
                    </label>
                    <label className="qil-field">
                      <span className="qil-field-label">Subject *</span>
                      <input
                        required
                        value={paste.subject}
                        onChange={(e) => setPaste({ ...paste, subject: e.target.value })}
                      />
                    </label>
                    <label className="qil-field">
                      <span className="qil-field-label">Date received</span>
                      <input
                        type="datetime-local"
                        value={paste.dateReceived}
                        onChange={(e) => setPaste({ ...paste, dateReceived: e.target.value })}
                      />
                    </label>
                    <label className="qil-field qil-field-span2">
                      <span className="qil-field-label">Receiving mailbox *</span>
                      <input
                        required
                        value={paste.mailbox}
                        onChange={(e) => setPaste({ ...paste, mailbox: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="qil-field">
                    <span className="qil-field-label">Plain-text body *</span>
                    <textarea
                      required
                      rows={8}
                      value={paste.bodyText}
                      onChange={(e) => setPaste({ ...paste, bodyText: e.target.value })}
                    />
                  </label>
                  <label className="qil-field">
                    <span className="qil-field-label">
                      Attachments (local only, max {formatByteLimit(LAB_MAX_ATTACHMENT_BYTES)} each)
                    </span>
                    <input type="file" multiple onChange={onPasteFiles} />
                  </label>
                </>
              )}
              <div className="qil-modal-actions">
                <button type="button" className="qil-btn-ghost" onClick={() => setStep("method")} disabled={busy}>
                  Back
                </button>
                <button type="submit" className="qil-btn-primary" disabled={busy}>
                  {busy ? "Parsing…" : "Preview normalized message"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "preview" && msg ? (
            <div className="qil-import-preview">
              {preview?.duplicateOfCaseId ? (
                <div className="qil-import-dup">
                  <strong>Duplicate detected</strong>
                  <p>{preview.duplicateReason}</p>
                  <button type="button" className="qil-btn-ghost" onClick={() => onOpenCase(preview.duplicateOfCaseId!)}>
                    Open existing case {preview.duplicateOfCaseId}
                  </button>
                </div>
              ) : (
                <p className="qil-import-ok">Ready to create a local `qil_received` case. No business fields will be inferred.</p>
              )}

              <dl className="qil-dl qil-dl-grid">
                <div>
                  <dt>Source</dt>
                  <dd>{msg.sourceType}</dd>
                </div>
                <div>
                  <dt>Message-ID</dt>
                  <dd>{msg.messageId ?? "— (hash dedupe)"}</dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>
                    {msg.from?.name ? `${msg.from.name} ` : ""}
                    &lt;{msg.from?.email}&gt;
                  </dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd>{(msg.to ?? []).map((a: any) => a.email).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>CC</dt>
                  <dd>{(msg.cc ?? []).map((a: any) => a.email).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{msg.subject}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{msg.sentOrReceivedAt ?? "—"}</dd>
                </div>
                <div>
                  <dt>Dedupe</dt>
                  <dd>
                    {msg.dedupeStrategy}: {String(msg.dedupeKey).slice(0, 48)}…
                  </dd>
                </div>
              </dl>

              {(msg.parserWarnings ?? []).length ? (
                <div className="qil-import-warnings">
                  <strong>Parser warnings</strong>
                  <ul>
                    {msg.parserWarnings.map((w: string) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="qil-detail-block">
                <h3>Plain-text body (HTML never rendered)</h3>
                <pre className="qil-body-pre">{msg.textBody || "(empty)"}</pre>
              </div>

              <div className="qil-detail-block">
                <h3>Attachments (local browser storage only)</h3>
                {(msg.attachments ?? []).length ? (
                  <ul className="qil-attach-list">
                    {msg.attachments.map((a: any) => (
                      <li key={a.id}>
                        <span>{a.filename}</span>
                        <small>
                          {a.contentType} · {a.sizeBytes} bytes · sha256:{a.contentHash.slice(0, 12)}…
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="qil-cell-meta">No attachments</p>
                )}
              </div>

              <div className="qil-modal-actions">
                <button type="button" className="qil-btn-ghost" onClick={() => setStep("input")} disabled={busy}>
                  Back
                </button>
                <button
                  type="button"
                  className="qil-btn-primary"
                  onClick={() => void confirm()}
                  disabled={busy || !preview?.canConfirm}
                >
                  {busy ? "Importing…" : "Confirm import"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "success" && createdCaseId ? (
            <div className="qil-import-success">
              <h3>Imported locally</h3>
              <p>
                Case <code>{createdCaseId}</code> is in the queue as <strong>Received</strong>. Data stays in this
                browser only.
              </p>
              <div className="qil-modal-actions">
                <button type="button" className="qil-btn-ghost" onClick={onClose}>
                  Close
                </button>
                <button
                  type="button"
                  className="qil-btn-primary"
                  onClick={() => {
                    onOpenCase(createdCaseId);
                    onClose();
                  }}
                >
                  Open case
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
