/**
 * Customer review drafts stored alongside configuration selections.
 * Never mutates CRM/source records — session selection payload only.
 */

export const CUSTOMER_INFO_DRAFT_KEY = "__customerInfoDraft";
export const ROOM_LABEL_DRAFT_KEY = "__roomLabelDrafts";

const INFO_FIELDS = ["customerName", "projectName", "phone", "email", "projectAddress"];

/**
 * @param {unknown} raw
 * @returns {{
 *   customerName: string,
 *   projectName: string,
 *   phone: string,
 *   email: string,
 *   projectAddress: string
 * } | null}
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
    let s = String(v).replace(/\0/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    s = s.replace(/<[^>]*>/g, "").trim();
    if (s.length > 200) s = s.slice(0, 200);
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
    let s = String(label ?? "")
      .replace(/\0/g, "")
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (s.length > 80) s = s.slice(0, 80);
    if (s) out[key] = s;
  }
  return out;
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
    if (key === CUSTOMER_INFO_DRAFT_KEY || key === ROOM_LABEL_DRAFT_KEY) continue;
    if (String(key).startsWith("__")) continue;
    quantities[key] = Number(value) || 0;
  }
  return {
    quantities,
    customerInfoDraft: sanitizeCustomerInfoDraft(src[CUSTOMER_INFO_DRAFT_KEY]),
    roomLabelDrafts: sanitizeRoomLabelDrafts(src[ROOM_LABEL_DRAFT_KEY])
  };
}

/**
 * @param {Record<string, number>} quantities
 * @param {{ customerInfoDraft?: object|null, roomLabelDrafts?: Record<string, string>|null }} [meta]
 */
export function mergeSelectionPayloadMeta(quantities, meta = {}) {
  /** @type {Record<string, unknown>} */
  const out = { ...(quantities || {}) };
  const info = sanitizeCustomerInfoDraft(meta.customerInfoDraft);
  if (info) out[CUSTOMER_INFO_DRAFT_KEY] = info;
  const labels = sanitizeRoomLabelDrafts(meta.roomLabelDrafts);
  if (Object.keys(labels).length) out[ROOM_LABEL_DRAFT_KEY] = labels;
  return out;
}
