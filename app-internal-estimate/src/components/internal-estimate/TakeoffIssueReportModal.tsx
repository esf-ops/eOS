import React, { useState } from "react";
import { TAKEOFF_ISSUE_CATEGORIES, type TakeoffIssueCategoryId, type TakeoffIssueReportPayload } from "../../lib/takeoffBeta";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: TakeoffIssueReportPayload) => Promise<void>;
  quoteId?: string | null;
}

export default function TakeoffIssueReportModal({
  open,
  onClose,
  onSubmit,
  quoteId = null,
}: Props) {
  const [category, setCategory] = useState<TakeoffIssueCategoryId>("other");
  const [note, setNote] = useState("");
  const [sourcePiece, setSourcePiece] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        category,
        note: note.trim() || undefined,
        quoteId,
        sourcePage: "ie_import_receipt",
        sourcePiece: sourcePiece.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit issue report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ie-takeoff-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="ie-takeoff-modal" role="dialog" aria-labelledby="ie-takeoff-issue-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="ie-takeoff-issue-title">Report takeoff issue</h3>
        {done ? (
          <p role="status">Issue report submitted — ops will review during beta.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value as TakeoffIssueCategoryId)} disabled={busy}>
                {TAKEOFF_ISSUE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>
              Source page / piece (optional)
              <input value={sourcePiece} onChange={(e) => setSourcePiece(e.target.value)} disabled={busy} />
            </label>
            <label>
              Note
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={busy} />
            </label>
            {error ? <p className="error small">{error}</p> : null}
            <div className="ie-takeoff-modal-actions">
              <button type="button" className="btn secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="btn primary btn-sm" disabled={busy}>{busy ? "Submitting…" : "Submit issue"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
