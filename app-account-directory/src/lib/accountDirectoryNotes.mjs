/**
 * Account 360 internal notes helpers. No rich-text, no external identity.
 */

import { applyHistoryPage } from "./account360History.mjs";

export const AD_NOTE_BODY_MAX = 4000;
export const AD_NOTES_PAGE_SIZE = 25;
export const AD_NOTES_CACHE_KEY = "notes:all";
export const AD_NOTES_EMPTY_COPY = "No internal notes yet.";
export const AD_NOTES_EMPTY_HINT = "Add a note to keep staff context on this account.";
export const AD_NOTE_REQUIRED_COPY = "Note text is required.";
export const AD_NOTE_TOO_LONG_COPY = `Note text must be ${AD_NOTE_BODY_MAX} characters or fewer.`;

/**
 * @param {unknown} item
 * @param {number} [index]
 */
export function noteItemId(item, index = 0) {
  if (item && typeof item === "object" && /** @type {{ id?: unknown }} */ (item).id) {
    return String(/** @type {{ id: unknown }} */ (item).id);
  }
  return `note-${index}`;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, body: string } | { ok: false, error: string }}
 */
export function validateNoteDraft(raw) {
  if (raw == null) return { ok: false, error: AD_NOTE_REQUIRED_COPY };
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: AD_NOTE_REQUIRED_COPY };
  }
  const body = String(raw).trim();
  if (!body) return { ok: false, error: AD_NOTE_REQUIRED_COPY };
  if (body.length > AD_NOTE_BODY_MAX) return { ok: false, error: AD_NOTE_TOO_LONG_COPY };
  return { ok: true, body };
}

/**
 * Newest-first prepend after create, still bounded by the 360 render window.
 * @param {{ items?: unknown[], pagination?: object }|null|undefined} prevPage
 * @param {object} note
 */
export function prependCreatedNote(prevPage, note) {
  const prior = Array.isArray(prevPage?.items) ? prevPage.items : [];
  return applyHistoryPage(
    null,
    {
      items: [note, ...prior],
      pagination: {
        ...(prevPage?.pagination || {}),
        page: 1,
        has_more: Boolean(prevPage?.pagination?.has_more ?? prevPage?.pagination?.hasMore)
      }
    },
    1,
    noteItemId
  );
}

/**
 * Replace one note in the current page (edit).
 * @param {{ items?: unknown[], pagination?: object }|null|undefined} prevPage
 * @param {object} note
 */
export function replaceNoteInPage(prevPage, note) {
  const items = (Array.isArray(prevPage?.items) ? prevPage.items : []).map((item) =>
    noteItemId(item) === noteItemId(note) ? note : item
  );
  return {
    ...(prevPage && typeof prevPage === "object" ? prevPage : {}),
    items
  };
}

/**
 * Drop an archived note from the current page.
 * @param {{ items?: unknown[], pagination?: object }|null|undefined} prevPage
 * @param {string} noteId
 */
export function removeNoteFromPage(prevPage, noteId) {
  const items = (Array.isArray(prevPage?.items) ? prevPage.items : []).filter(
    (item) => noteItemId(item) !== String(noteId)
  );
  return {
    ...(prevPage && typeof prevPage === "object" ? prevPage : {}),
    items
  };
}
