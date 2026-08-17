/**
 * Account 360 internal follow-up helpers. No rich-text, no external identity.
 */

import { applyHistoryPage } from "./account360History.mjs";

export const AD_FOLLOW_UP_TITLE_MAX = 200;
export const AD_FOLLOW_UP_DETAILS_MAX = 4000;
export const AD_FOLLOW_UPS_PAGE_SIZE = 25;
export const AD_FOLLOW_UPS_EMPTY_OPEN = "No open follow-ups.";
export const AD_FOLLOW_UPS_EMPTY_COMPLETED = "No completed follow-ups.";
export const AD_FOLLOW_UPS_EMPTY_HINT = "Add a follow-up to track the next action for this account.";
export const AD_FOLLOW_UP_TITLE_REQUIRED = "Title is required.";
export const AD_FOLLOW_UP_DUE_REQUIRED = "Due date is required.";

export function followUpsCacheKey(status = "open") {
  const s = String(status || "open").toLowerCase();
  if (s === "completed" || s === "all") return `followups:${s}`;
  return "followups:open";
}

export function followUpItemId(item, index = 0) {
  if (item && typeof item === "object" && /** @type {{ id?: unknown }} */ (item).id) {
    return String(/** @type {{ id: unknown }} */ (item).id);
  }
  return `followup-${index}`;
}

function localYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param {string | Date | null | undefined} dueAt
 * @param {{ status?: string, now?: Date }} [opts]
 */
export function followUpDueState(dueAt, opts = {}) {
  if (String(opts.status || "").toLowerCase() === "completed") return "completed";
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  const now = opts.now instanceof Date ? opts.now : new Date();
  if (Number.isNaN(due.getTime()) || Number.isNaN(now.getTime())) return "upcoming";
  if (due.getTime() < now.getTime()) return "overdue";
  if (localYmd(due) === localYmd(now)) return "due_today";
  return "upcoming";
}

export function followUpDueLabel(state) {
  if (state === "overdue") return "Overdue";
  if (state === "due_today") return "Due today";
  if (state === "completed") return "Completed";
  return "Upcoming";
}

export function formatDueWhen(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function datetimeLocalFromIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dueAtFromDatetimeLocal(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: AD_FOLLOW_UP_DUE_REQUIRED };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: "Due date is invalid." };
  return { ok: true, dueAt: parsed.toISOString() };
}

/**
 * @param {unknown} titleRaw
 * @param {unknown} dueLocal
 * @param {unknown} [detailsRaw]
 */
export function validateFollowUpDraft(titleRaw, dueLocal, detailsRaw) {
  const title = String(titleRaw ?? "").trim();
  if (!title) return { ok: false, error: AD_FOLLOW_UP_TITLE_REQUIRED };
  if (title.length > AD_FOLLOW_UP_TITLE_MAX) {
    return { ok: false, error: `Title must be ${AD_FOLLOW_UP_TITLE_MAX} characters or fewer.` };
  }
  const due = dueAtFromDatetimeLocal(dueLocal);
  if (!due.ok) return due;
  const details = String(detailsRaw ?? "").trim();
  if (details.length > AD_FOLLOW_UP_DETAILS_MAX) {
    return { ok: false, error: `Details must be ${AD_FOLLOW_UP_DETAILS_MAX} characters or fewer.` };
  }
  return { ok: true, title, dueAt: due.dueAt, details: details || null };
}

function sortOpenItems(items) {
  return [...items].sort(
    (a, b) =>
      String(a?.dueAt || "").localeCompare(String(b?.dueAt || "")) ||
      String(a?.id || "").localeCompare(String(b?.id || ""))
  );
}

export function insertOpenFollowUp(prevPage, item) {
  const prior = Array.isArray(prevPage?.items) ? prevPage.items : [];
  const merged = sortOpenItems([item, ...prior.filter((row) => followUpItemId(row) !== followUpItemId(item))]);
  return applyHistoryPage(
    null,
    {
      items: merged,
      pagination: {
        ...(prevPage?.pagination || {}),
        page: 1,
        has_more: Boolean(prevPage?.pagination?.has_more ?? prevPage?.pagination?.hasMore)
      }
    },
    1,
    followUpItemId
  );
}

export function prependCompletedFollowUp(prevPage, item) {
  const prior = Array.isArray(prevPage?.items) ? prevPage.items : [];
  return applyHistoryPage(
    null,
    {
      items: [item, ...prior],
      pagination: {
        ...(prevPage?.pagination || {}),
        page: 1,
        has_more: Boolean(prevPage?.pagination?.has_more ?? prevPage?.pagination?.hasMore)
      }
    },
    1,
    followUpItemId
  );
}

export function replaceFollowUpInPage(prevPage, item) {
  const items = (Array.isArray(prevPage?.items) ? prevPage.items : []).map((row) =>
    followUpItemId(row) === followUpItemId(item) ? item : row
  );
  return { ...(prevPage && typeof prevPage === "object" ? prevPage : {}), items };
}

export function removeFollowUpFromPage(prevPage, followUpId) {
  const items = (Array.isArray(prevPage?.items) ? prevPage.items : []).filter(
    (row) => followUpItemId(row) !== String(followUpId)
  );
  return { ...(prevPage && typeof prevPage === "object" ? prevPage : {}), items };
}
