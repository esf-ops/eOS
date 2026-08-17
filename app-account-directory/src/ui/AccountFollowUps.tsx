import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  archiveAccountFollowUp,
  completeAccountFollowUp,
  createAccountFollowUp,
  getAccountFollowUps,
  listFollowUpAssignees,
  reopenAccountFollowUp,
  updateAccountFollowUp
} from "../lib/accountDirectoryApi";
import {
  applyHistoryPage,
  canLoadMoreHistory,
  shouldApplyHistoryPage
} from "../lib/account360History.mjs";
import { isAbortError } from "../lib/account360RequestCoordinator.mjs";
import {
  AD_FOLLOW_UP_DETAILS_MAX,
  AD_FOLLOW_UP_TITLE_MAX,
  AD_FOLLOW_UPS_EMPTY_COMPLETED,
  AD_FOLLOW_UPS_EMPTY_HINT,
  AD_FOLLOW_UPS_EMPTY_OPEN,
  AD_FOLLOW_UPS_PAGE_SIZE,
  datetimeLocalFromIso,
  followUpDueLabel,
  followUpItemId,
  followUpsCacheKey,
  formatDueWhen,
  insertOpenFollowUp,
  removeFollowUpFromPage,
  replaceFollowUpInPage,
  validateFollowUpDraft
} from "../lib/accountDirectoryFollowUps.mjs";
import type { AccountFollowUp, AccountFollowUpsPage, FollowUpAssignee } from "../lib/types";

type FollowUpsSessionStore = {
  getSignal: () => AbortSignal | null;
  getGeneration: () => number;
  isCurrent: (generation: number, accountId: string) => boolean;
  getPanel: (accountId: string, key: string) => unknown;
  hasPanel: (accountId: string, key: string) => boolean;
  setPanel: (accountId: string, key: string, value: unknown) => void;
  clearPanelFamily: (accountId: string, family: string) => void;
  loadResource: (accountId: string, key: string, loader: () => Promise<unknown>) => Promise<unknown>;
};

function writeFollowUpsCache(
  store: FollowUpsSessionStore | null,
  accountId: string,
  status: string,
  page: AccountFollowUpsPage
) {
  if (!store) return;
  store.clearPanelFamily(accountId, "followups");
  store.setPanel(accountId, followUpsCacheKey(status), page);
}

const EMPTY_DRAFT = { title: "", dueLocal: "", details: "", assignedTo: "" };

export function AccountFollowUps({
  sessionToken,
  accountId,
  session360,
  canEdit
}: {
  sessionToken: string | null;
  accountId: string;
  session360?: FollowUpsSessionStore | null;
  canEdit: boolean;
}) {
  const [status, setStatus] = useState<"open" | "completed">("open");
  const [page, setPage] = useState(1);
  const [followUps, setFollowUps] = useState<AccountFollowUpsPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [staff, setStaff] = useState<FollowUpAssignee[]>([]);
  const guardRef = useRef(0);

  useEffect(() => {
    guardRef.current += 1;
    setFollowUps(null);
    setPage(1);
    setStatus("open");
    setError(null);
    setMoreBusy(false);
    setComposerOpen(false);
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setEditingId(null);
    setConfirmArchiveId(null);
    setStaff([]);
  }, [accountId]);

  useEffect(() => {
    if (!canEdit || !sessionToken || !accountId) return;
    let cancelled = false;
    void listFollowUpAssignees(sessionToken, accountId)
      .then((res) => {
        if (!cancelled) setStaff(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canEdit, sessionToken, accountId]);

  useEffect(() => {
    if (!session360 || !sessionToken) return;
    const expectedAccountId = accountId;
    const guard = guardRef.current;
    const generation = session360.getGeneration();
    const signal = session360.getSignal() || undefined;
    const key = followUpsCacheKey(status);

    if (page <= 1) {
      if (session360.hasPanel(accountId, key)) {
        setFollowUps(session360.getPanel(accountId, key) as AccountFollowUpsPage);
        setBusy(false);
        setError(null);
        return;
      }
      setBusy(true);
      setError(null);
      void session360
        .loadResource(accountId, key, () =>
          getAccountFollowUps(
            sessionToken,
            accountId,
            { page: 1, pageSize: AD_FOLLOW_UPS_PAGE_SIZE, status },
            { signal }
          ).then((res) => applyHistoryPage(null, res, 1, followUpItemId) as AccountFollowUpsPage)
        )
        .then((res) => {
          if (guard !== guardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
          setFollowUps(res as AccountFollowUpsPage);
        })
        .catch((err) => {
          if (guard !== guardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
          setFollowUps({ items: [] });
          setError(err instanceof ApiError ? err.message : "Could not load follow-ups.");
        })
        .finally(() => {
          if (guard !== guardRef.current) return;
          if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setBusy(false);
        });
      return;
    }

    setMoreBusy(true);
    setError(null);
    void getAccountFollowUps(
      sessionToken,
      accountId,
      { page, pageSize: AD_FOLLOW_UPS_PAGE_SIZE, status },
      { signal }
    )
      .then((res) => {
        if (guard !== guardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
        setFollowUps((prev) => applyHistoryPage(prev, res, page, followUpItemId) as AccountFollowUpsPage);
      })
      .catch((err) => {
        if (guard !== guardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Could not load more follow-ups.");
      })
      .finally(() => {
        if (guard !== guardRef.current) return;
        if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setMoreBusy(false);
      });
  }, [accountId, page, session360, sessionToken, retry, status]);

  function changeStatus(next: "open" | "completed") {
    setStatus(next);
    setPage(1);
    setFollowUps(null);
    setEditingId(null);
    setConfirmArchiveId(null);
    setFormError(null);
  }

  async function onAdd() {
    if (!sessionToken || saving) return;
    const checked = validateFollowUpDraft(draft.title, draft.dueLocal, draft.details);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await createAccountFollowUp(sessionToken, accountId, {
        title: checked.title,
        details: checked.details,
        dueAt: checked.dueAt,
        assignedTo: draft.assignedTo || null
      });
      if (!res.followUp) throw new Error("Could not add follow-up.");
      setFollowUps((prev) => {
        const next =
          status === "open"
            ? (insertOpenFollowUp(prev, res.followUp) as AccountFollowUpsPage)
            : (prev as AccountFollowUpsPage);
        writeFollowUpsCache(session360 || null, accountId, "open", next);
        return status === "open" ? next : prev;
      });
      setDraft(EMPTY_DRAFT);
      setComposerOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(item: AccountFollowUp) {
    if (!sessionToken || saving) return;
    const checked = validateFollowUpDraft(editDraft.title, editDraft.dueLocal, editDraft.details);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await updateAccountFollowUp(sessionToken, accountId, item.id, {
        title: checked.title,
        details: checked.details,
        dueAt: checked.dueAt,
        assignedTo: editDraft.assignedTo || null,
        rowVersion: item.rowVersion
      });
      if (!res.followUp) throw new Error("Could not update follow-up.");
      setFollowUps((prev) => {
        const next = replaceFollowUpInPage(prev, res.followUp) as AccountFollowUpsPage;
        writeFollowUpsCache(session360 || null, accountId, status, next);
        return next;
      });
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not update follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function onComplete(item: AccountFollowUp) {
    if (!sessionToken || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await completeAccountFollowUp(sessionToken, accountId, item.id, { rowVersion: item.rowVersion });
      setFollowUps((prev) => {
        const next = removeFollowUpFromPage(prev, item.id) as AccountFollowUpsPage;
        writeFollowUpsCache(session360 || null, accountId, status, next);
        return next;
      });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not complete follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function onReopen(item: AccountFollowUp) {
    if (!sessionToken || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await reopenAccountFollowUp(sessionToken, accountId, item.id, { rowVersion: item.rowVersion });
      setFollowUps((prev) => {
        const next = removeFollowUpFromPage(prev, item.id) as AccountFollowUpsPage;
        if (session360) {
          const existingOpen = session360.getPanel(accountId, followUpsCacheKey("open")) as AccountFollowUpsPage | null;
          session360.clearPanelFamily(accountId, "followups");
          session360.setPanel(accountId, followUpsCacheKey(status), next);
          if (res.followUp && existingOpen) {
            session360.setPanel(
              accountId,
              followUpsCacheKey("open"),
              insertOpenFollowUp(existingOpen, res.followUp) as AccountFollowUpsPage
            );
          }
        }
        return next;
      });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not reopen follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(item: AccountFollowUp) {
    if (!sessionToken || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await archiveAccountFollowUp(sessionToken, accountId, item.id, { rowVersion: item.rowVersion });
      setFollowUps((prev) => {
        const next = removeFollowUpFromPage(prev, item.id) as AccountFollowUpsPage;
        writeFollowUpsCache(session360 || null, accountId, status, next);
        return next;
      });
      setConfirmArchiveId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not archive follow-up.");
    } finally {
      setSaving(false);
    }
  }

  const items = followUps?.items || [];
  const emptyCopy = status === "completed" ? AD_FOLLOW_UPS_EMPTY_COMPLETED : AD_FOLLOW_UPS_EMPTY_OPEN;

  function assigneeSelect(value: string, onChange: (next: string) => void) {
    if (!staff.length) return null;
    return (
      <label className="field">
        <span>Assignee</span>
        <select value={value} disabled={saving} onChange={(event) => onChange(event.target.value)}>
          <option value="">Unassigned</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <section className="ad-followups" aria-label="Follow-ups">
      <div className="ad-section-head">
        <p className="ad-kicker">Follow-ups</p>
        <h3>Account follow-ups</h3>
        <p className="muted">Internal next actions for this Account Directory account.</p>
      </div>

      <div className="ad-followups-toolbar" role="tablist" aria-label="Follow-up status">
        <button
          type="button"
          className={status === "open" ? "btn btn-secondary btn-sm is-on" : "btn btn-ghost btn-sm"}
          onClick={() => changeStatus("open")}
        >
          Open
        </button>
        <button
          type="button"
          className={status === "completed" ? "btn btn-secondary btn-sm is-on" : "btn btn-ghost btn-sm"}
          onClick={() => changeStatus("completed")}
        >
          Completed
        </button>
      </div>

      {canEdit && status === "open" ? (
        composerOpen ? (
          <div className="ad-followups-composer">
            <label className="field">
              <span>Title</span>
              <input
                value={draft.title}
                maxLength={AD_FOLLOW_UP_TITLE_MAX}
                disabled={saving}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Due</span>
              <input
                type="datetime-local"
                value={draft.dueLocal}
                disabled={saving}
                onChange={(event) => setDraft((prev) => ({ ...prev, dueLocal: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Details</span>
              <textarea
                value={draft.details}
                maxLength={AD_FOLLOW_UP_DETAILS_MAX}
                disabled={saving}
                rows={3}
                onChange={(event) => setDraft((prev) => ({ ...prev, details: event.target.value }))}
              />
            </label>
            {assigneeSelect(draft.assignedTo, (assignedTo) => setDraft((prev) => ({ ...prev, assignedTo })))}
            <div className="ad-followups-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void onAdd()}>
                {saving ? "Saving…" : "Add follow-up"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={saving}
                onClick={() => {
                  setComposerOpen(false);
                  setDraft(EMPTY_DRAFT);
                  setFormError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setComposerOpen(true)}>
            Add follow-up
          </button>
        )
      ) : null}

      {formError ? (
        <div className="banner banner-error" role="alert">
          {formError}
        </div>
      ) : null}

      {busy && !followUps ? <p className="muted">Loading follow-ups…</p> : null}

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
          <button
            type="button"
            className="btn btn-secondary btn-sm banner-dismiss"
            onClick={() => {
              session360?.clearPanelFamily(accountId, "followups");
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!busy && !error && items.length === 0 ? (
        <div className="ad-empty-state">
          <p>{emptyCopy}</p>
          <p className="muted">{AD_FOLLOW_UPS_EMPTY_HINT}</p>
        </div>
      ) : null}

      {items.length ? (
        <ol className="ad-followups-list">
          {items.map((item, index) => {
            const dueState = item.dueState || "upcoming";
            return (
              <li key={followUpItemId(item, index)} className={`ad-followup ad-followup-${dueState}`}>
                <div className="ad-followup-meta">
                  <span className={`ad-followup-due ad-followup-due-${dueState}`}>{followUpDueLabel(dueState)}</span>
                  <span>{formatDueWhen(item.dueAt) || ""}</span>
                  {item.assignee?.displayName ? <span>{item.assignee.displayName}</span> : null}
                  {item.status === "completed" && item.completedAt ? (
                    <span>Completed {formatDueWhen(item.completedAt)}</span>
                  ) : null}
                </div>
                {editingId === item.id ? (
                  <>
                    <label className="field">
                      <span>Title</span>
                      <input
                        value={editDraft.title}
                        maxLength={AD_FOLLOW_UP_TITLE_MAX}
                        disabled={saving}
                        onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Due</span>
                      <input
                        type="datetime-local"
                        value={editDraft.dueLocal}
                        disabled={saving}
                        onChange={(event) => setEditDraft((prev) => ({ ...prev, dueLocal: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Details</span>
                      <textarea
                        value={editDraft.details}
                        maxLength={AD_FOLLOW_UP_DETAILS_MAX}
                        disabled={saving}
                        rows={3}
                        onChange={(event) => setEditDraft((prev) => ({ ...prev, details: event.target.value }))}
                      />
                    </label>
                    {assigneeSelect(editDraft.assignedTo, (assignedTo) =>
                      setEditDraft((prev) => ({ ...prev, assignedTo }))
                    )}
                    <div className="ad-followups-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={saving}
                        onClick={() => void onSaveEdit(item)}
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
                  <>
                    <p className="ad-followup-title">{item.title}</p>
                    {item.details ? <p className="ad-followup-details">{item.details}</p> : null}
                  </>
                )}
                {canEdit && editingId !== item.id ? (
                  <div className="ad-followups-actions">
                    {item.status === "open" ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={saving}
                        onClick={() => void onComplete(item)}
                      >
                        Complete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={saving}
                        onClick={() => void onReopen(item)}
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={saving}
                      onClick={() => {
                        setEditingId(item.id);
                        setEditDraft({
                          title: item.title,
                          dueLocal: datetimeLocalFromIso(item.dueAt),
                          details: item.details || "",
                          assignedTo: item.assignedTo || ""
                        });
                        setConfirmArchiveId(null);
                        setFormError(null);
                      }}
                    >
                      Edit
                    </button>
                    {confirmArchiveId === item.id ? (
                      <>
                        <span>Archive this follow-up?</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={saving}
                          onClick={() => void onArchive(item)}
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
                        onClick={() => setConfirmArchiveId(item.id)}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {canLoadMoreHistory(followUps?.pagination, items.length) ? (
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
