import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  archiveAccountNote,
  createAccountNote,
  getAccountNotes,
  updateAccountNote
} from "../lib/accountDirectoryApi";
import {
  applyHistoryPage,
  canLoadMoreHistory,
  shouldApplyHistoryPage
} from "../lib/account360History.mjs";
import { isAbortError } from "../lib/account360RequestCoordinator.mjs";
import {
  AD_NOTE_BODY_MAX,
  AD_NOTES_CACHE_KEY,
  AD_NOTES_EMPTY_COPY,
  AD_NOTES_EMPTY_HINT,
  AD_NOTES_PAGE_SIZE,
  noteItemId,
  prependCreatedNote,
  removeNoteFromPage,
  replaceNoteInPage,
  validateNoteDraft
} from "../lib/accountDirectoryNotes.mjs";
import { formatWhen } from "../lib/accountDirectoryRelationshipUi";
import type { AccountNote, AccountNotesPage } from "../lib/types";

type NotesSessionStore = {
  getSignal: () => AbortSignal | null;
  getGeneration: () => number;
  isCurrent: (generation: number, accountId: string) => boolean;
  getPanel: (accountId: string, key: string) => unknown;
  hasPanel: (accountId: string, key: string) => boolean;
  setPanel: (accountId: string, key: string, value: unknown) => void;
  clearPanelFamily: (accountId: string, family: string) => void;
  loadResource: (accountId: string, key: string, loader: () => Promise<unknown>) => Promise<unknown>;
};

function writeNotesCache(store: NotesSessionStore | null, accountId: string, page: AccountNotesPage) {
  if (!store) return;
  store.clearPanelFamily(accountId, "notes");
  store.setPanel(accountId, AD_NOTES_CACHE_KEY, page);
}

export function AccountNotes({
  sessionToken,
  accountId,
  session360,
  canEdit
}: {
  sessionToken: string | null;
  accountId: string;
  session360?: NotesSessionStore | null;
  canEdit: boolean;
}) {
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<AccountNotesPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const guardRef = useRef(0);

  useEffect(() => {
    guardRef.current += 1;
    setNotes(null);
    setPage(1);
    setError(null);
    setMoreBusy(false);
    setDraft("");
    setComposerOpen(false);
    setFormError(null);
    setEditingId(null);
    setConfirmArchiveId(null);
  }, [accountId]);

  useEffect(() => {
    if (!session360 || !sessionToken) return;
    const expectedAccountId = accountId;
    const guard = guardRef.current;
    const generation = session360.getGeneration();
    const signal = session360.getSignal() || undefined;

    if (page <= 1) {
      if (session360.hasPanel(accountId, AD_NOTES_CACHE_KEY)) {
        setNotes(session360.getPanel(accountId, AD_NOTES_CACHE_KEY) as AccountNotesPage);
        setBusy(false);
        setError(null);
        return;
      }
      setBusy(true);
      setError(null);
      void session360
        .loadResource(accountId, AD_NOTES_CACHE_KEY, () =>
          getAccountNotes(sessionToken, accountId, { page: 1, pageSize: AD_NOTES_PAGE_SIZE }, { signal }).then(
            (res) => applyHistoryPage(null, res, 1, noteItemId) as AccountNotesPage
          )
        )
        .then((res) => {
          if (guard !== guardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
          setNotes(res as AccountNotesPage);
        })
        .catch((err) => {
          if (guard !== guardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
          setNotes({ items: [] });
          setError(err instanceof ApiError ? err.message : "Could not load notes.");
        })
        .finally(() => {
          if (guard !== guardRef.current) return;
          if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setBusy(false);
        });
      return;
    }

    setMoreBusy(true);
    setError(null);
    void getAccountNotes(
      sessionToken,
      accountId,
      { page, pageSize: AD_NOTES_PAGE_SIZE },
      { signal }
    )
      .then((res) => {
        if (guard !== guardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
        setNotes((prev) => applyHistoryPage(prev, res, page, noteItemId) as AccountNotesPage);
      })
      .catch((err) => {
        if (guard !== guardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Could not load more notes.");
      })
      .finally(() => {
        if (guard !== guardRef.current) return;
        if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setMoreBusy(false);
      });
  }, [accountId, page, session360, sessionToken, retry]);

  async function onAddNote() {
    if (!sessionToken || saving) return;
    const checked = validateNoteDraft(draft);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await createAccountNote(sessionToken, accountId, { body: checked.body });
      const created = res.note;
      if (!created) throw new Error("Could not add note.");
      setNotes((prev) => {
        const next = prependCreatedNote(prev, created) as AccountNotesPage;
        writeNotesCache(session360 || null, accountId, next);
        return next;
      });
      setDraft("");
      setComposerOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add note.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(note: AccountNote) {
    if (!sessionToken || saving) return;
    const checked = validateNoteDraft(editDraft);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await updateAccountNote(sessionToken, accountId, note.id, {
        body: checked.body,
        rowVersion: note.rowVersion
      });
      if (!res.note) throw new Error("Could not update note.");
      setNotes((prev) => {
        const next = replaceNoteInPage(prev, res.note) as AccountNotesPage;
        writeNotesCache(session360 || null, accountId, next);
        return next;
      });
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not update note.");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(note: AccountNote) {
    if (!sessionToken || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await archiveAccountNote(sessionToken, accountId, note.id, { rowVersion: note.rowVersion });
      setNotes((prev) => {
        const next = removeNoteFromPage(prev, note.id) as AccountNotesPage;
        writeNotesCache(session360 || null, accountId, next);
        return next;
      });
      setConfirmArchiveId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not archive note.");
    } finally {
      setSaving(false);
    }
  }

  const items = notes?.items || [];

  return (
    <section className="ad-notes" aria-label="Internal notes">
      <div className="ad-section-head">
        <p className="ad-kicker">Notes</p>
        <h3>Internal notes</h3>
        <p className="muted">Staff-only context for this Account Directory account.</p>
      </div>

      {canEdit ? (
        composerOpen ? (
          <div className="ad-notes-composer">
            <label className="field">
              <span>Note</span>
              <textarea
                value={draft}
                maxLength={AD_NOTE_BODY_MAX}
                disabled={saving}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
              />
            </label>
            <div className="ad-notes-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void onAddNote()}>
                {saving ? "Saving…" : "Add note"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={saving}
                onClick={() => {
                  setComposerOpen(false);
                  setDraft("");
                  setFormError(null);
                }}
              >
                Cancel
              </button>
              <span className="ad-note-count">
                {draft.trim().length} / {AD_NOTE_BODY_MAX}
              </span>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setComposerOpen(true)}>
            Add note
          </button>
        )
      ) : null}

      {formError ? (
        <div className="banner banner-error" role="alert">
          {formError}
        </div>
      ) : null}

      {busy && !notes ? <p className="muted">Loading notes…</p> : null}

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
          <button
            type="button"
            className="btn btn-secondary btn-sm banner-dismiss"
            onClick={() => {
              session360?.clearPanelFamily(accountId, "notes");
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!busy && !error && items.length === 0 ? (
        <div className="ad-empty-state">
          <p>{AD_NOTES_EMPTY_COPY}</p>
          <p className="muted">{AD_NOTES_EMPTY_HINT}</p>
        </div>
      ) : null}

      {items.length ? (
        <ol className="ad-notes-list">
          {items.map((note, index) => (
            <li key={noteItemId(note, index)} className="ad-note">
              <div className="ad-note-meta">
                <strong>{note.author?.displayName || "Staff"}</strong>
                <span>{formatWhen(note.createdAt) || ""}</span>
                {note.edited ? <span>Edited</span> : null}
              </div>
              {editingId === note.id ? (
                <>
                  <label className="field">
                    <span>Edit note</span>
                    <textarea
                      value={editDraft}
                      maxLength={AD_NOTE_BODY_MAX}
                      disabled={saving}
                      onChange={(event) => setEditDraft(event.target.value)}
                      rows={4}
                    />
                  </label>
                  <div className="ad-notes-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={saving}
                      onClick={() => void onSaveEdit(note)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={saving}
                      onClick={() => {
                        setEditingId(null);
                        setFormError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="ad-note-body">{note.body}</p>
              )}
              {canEdit && editingId !== note.id ? (
                <div className="ad-notes-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={saving}
                    onClick={() => {
                      setEditingId(note.id);
                      setEditDraft(note.body);
                      setConfirmArchiveId(null);
                      setFormError(null);
                    }}
                  >
                    Edit
                  </button>
                  {confirmArchiveId === note.id ? (
                    <>
                      <span>Archive this note?</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={saving}
                        onClick={() => void onArchive(note)}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={saving}
                        onClick={() => setConfirmArchiveId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={saving}
                      onClick={() => setConfirmArchiveId(note.id)}
                    >
                      Archive
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {canLoadMoreHistory(notes?.pagination, items.length) ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={moreBusy}
          onClick={() => setPage((n) => n + 1)}
        >
          {moreBusy ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
