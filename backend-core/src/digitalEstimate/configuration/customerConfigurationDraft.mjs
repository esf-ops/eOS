/**
 * Customer review drafts stored alongside configuration selections.
 * Never mutates CRM/source records — session selection payload only.
 */

export const CUSTOMER_INFO_DRAFT_KEY = "__customerInfoDraft";
export const ROOM_LABEL_DRAFT_KEY = "__roomLabelDrafts";
export const ROOM_NOTES_DRAFT_KEY = "__roomNotes";
export const PROJECT_NOTE_DRAFT_KEY = "__projectNote";

const INFO_FIELDS = ["customerName", "projectName", "phone", "email", "projectAddress"];
const NOTE_MAX = 2000;

function sanitizePlainText(raw, maxLen) {
  let s = String(raw ?? "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/**
 * @param {unknown} raw
 */
export function sanitizeCustomerInfoDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const out = {};
  let any = false;
  for (const field of INFO_FIELDS) {
    const v = raw[field];
    if (v == null) {
      out[field] = "";
      continue;
    }
    const s = sanitizePlainText(v, 200);
    out[field] = s;
    if (s) any = true;
  }
  return any ? /** @type {any} */ (out) : null;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeRoomLabelDrafts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [roomKey, label] of Object.entries(raw)) {
    const key = String(roomKey || "").trim();
    if (!key || key.startsWith("__")) continue;
    const s = sanitizePlainText(label, 80);
    if (s) out[key] = s;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeRoomNotesDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [roomKey, note] of Object.entries(raw)) {
    const key = String(roomKey || "").trim();
    if (!key || key.startsWith("__")) continue;
    const s = sanitizePlainText(note, NOTE_MAX);
    if (s) out[key] = s;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeProjectNoteDraft(raw) {
  return sanitizePlainText(raw, NOTE_MAX);
}

/**
 * Split quantity selections from draft metadata in a persisted payload.
 * @param {unknown} payload
 */
export function splitSelectionPayloadMeta(payload) {
  const src = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  /** @type {Record<string, number>} */
  const quantities = {};
  for (const [key, value] of Object.entries(src)) {
    if (
      key === CUSTOMER_INFO_DRAFT_KEY ||
      key === ROOM_LABEL_DRAFT_KEY ||
      key === ROOM_NOTES_DRAFT_KEY ||
      key === PROJECT_NOTE_DRAFT_KEY
    ) {
      continue;
    }
    if (String(key).startsWith("__")) continue;
    quantities[key] = Number(value) || 0;
  }
  return {
    quantities,
    customerInfoDraft: sanitizeCustomerInfoDraft(src[CUSTOMER_INFO_DRAFT_KEY]),
    roomLabelDrafts: sanitizeRoomLabelDrafts(src[ROOM_LABEL_DRAFT_KEY]),
    roomNotes: sanitizeRoomNotesDraft(src[ROOM_NOTES_DRAFT_KEY]),
    projectNote: sanitizeProjectNoteDraft(src[PROJECT_NOTE_DRAFT_KEY]) || null
  };
}

/**
 * @param {Record<string, number>} quantities
 * @param {{
 *   customerInfoDraft?: object|null,
 *   roomLabelDrafts?: Record<string, string>|null,
 *   roomNotes?: Record<string, string>|null,
 *   projectNote?: string|null
 * }} [meta]
 */
export function mergeSelectionPayloadMeta(quantities, meta = {}) {
  /** @type {Record<string, unknown>} */
  const out = { ...(quantities || {}) };
  const info = sanitizeCustomerInfoDraft(meta.customerInfoDraft);
  if (info) out[CUSTOMER_INFO_DRAFT_KEY] = info;
  const labels = sanitizeRoomLabelDrafts(meta.roomLabelDrafts);
  if (Object.keys(labels).length) out[ROOM_LABEL_DRAFT_KEY] = labels;
  const notes = sanitizeRoomNotesDraft(meta.roomNotes);
  if (Object.keys(notes).length) out[ROOM_NOTES_DRAFT_KEY] = notes;
  const projectNote = sanitizeProjectNoteDraft(meta.projectNote);
  if (projectNote) out[PROJECT_NOTE_DRAFT_KEY] = projectNote;
  return out;
}
