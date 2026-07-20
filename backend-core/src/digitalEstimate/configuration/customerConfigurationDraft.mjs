/**
 * Customer review drafts stored alongside configuration selections.
 * Never mutates CRM/source records — session selection payload only.
 */

export const CUSTOMER_INFO_DRAFT_KEY = "__customerInfoDraft";
export const ROOM_LABEL_DRAFT_KEY = "__roomLabelDrafts";
export const ROOM_NOTES_DRAFT_KEY = "__roomNotes";
export const PROJECT_NOTE_DRAFT_KEY = "__projectNote";
export const CUSTOMER_PRODUCT_DRAFTS_KEY = "__customerProductDrafts";
export const BACKSPLASH_DRAFTS_KEY = "__backsplashDrafts";
export const SIDE_SPLASH_DRAFTS_KEY = "__sideSplashDrafts";

const INFO_FIELDS = ["customerName", "projectName", "phone", "email", "projectAddress"];
const NOTE_MAX = 2000;
const PRODUCT_TEXT_MAX = 200;

const META_KEYS = new Set([
  CUSTOMER_INFO_DRAFT_KEY,
  ROOM_LABEL_DRAFT_KEY,
  ROOM_NOTES_DRAFT_KEY,
  PROJECT_NOTE_DRAFT_KEY,
  CUSTOMER_PRODUCT_DRAFTS_KEY,
  BACKSPLASH_DRAFTS_KEY,
  SIDE_SPLASH_DRAFTS_KEY
]);

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
 * @param {unknown} raw
 */
function sanitizeProductDraftFields(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  const source = sanitizePlainText(raw.source ?? raw.mode ?? "", 40);
  if (source) out.source = source;
  for (const field of ["manufacturer", "model", "finish", "notes", "productId", "variantSku"]) {
    if (raw[field] == null) continue;
    const s = sanitizePlainText(raw[field], PRODUCT_TEXT_MAX);
    if (s) out[field] = s;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, { sink?: object, faucet?: object, accessories?: object[] }>}
 */
export function sanitizeCustomerProductDrafts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const [roomKey, roomDraft] of Object.entries(raw)) {
    const key = String(roomKey || "").trim();
    if (!key || key.startsWith("__")) continue;
    if (!roomDraft || typeof roomDraft !== "object" || Array.isArray(roomDraft)) continue;
    /** @type {Record<string, unknown>} */
    const roomOut = {};
    const sink = sanitizeProductDraftFields(roomDraft.sink);
    if (sink) roomOut.sink = sink;
    const faucet = sanitizeProductDraftFields(roomDraft.faucet);
    if (faucet) roomOut.faucet = faucet;
    if (Array.isArray(roomDraft.accessories)) {
      const accessories = roomDraft.accessories
        .map((a) => sanitizeProductDraftFields(a))
        .filter(Boolean)
        .slice(0, 20);
      if (accessories.length) roomOut.accessories = accessories;
    }
    if (Object.keys(roomOut).length) out[key] = roomOut;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, { mode?: string, requestedHeightInches?: number|null, note?: string }>}
 */
export function sanitizeBacksplashDrafts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const [roomKey, draft] of Object.entries(raw)) {
    const key = String(roomKey || "").trim();
    if (!key || key.startsWith("__")) continue;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) continue;
    /** @type {Record<string, unknown>} */
    const row = {};
    const mode = sanitizePlainText(draft.mode ?? draft.heightMode ?? "", 40);
    if (mode) row.mode = mode;
    const h = Number(draft.requestedHeightInches ?? draft.requestedHeightIn ?? draft.heightInches);
    if (Number.isFinite(h) && h > 0 && h <= 120) row.requestedHeightInches = Math.round(h * 100) / 100;
    else row.requestedHeightInches = null;
    const note = sanitizePlainText(draft.note ?? "", NOTE_MAX);
    if (note) row.note = note;
    if (Object.keys(row).length) out[key] = row;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, Record<string, { mode?: string, note?: string }>>}
 */
export function sanitizeSideSplashDrafts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const [roomKey, pieces] of Object.entries(raw)) {
    const rk = String(roomKey || "").trim();
    if (!rk || rk.startsWith("__")) continue;
    if (!pieces || typeof pieces !== "object" || Array.isArray(pieces)) continue;
    /** @type {Record<string, any>} */
    const roomOut = {};
    for (const [pieceKey, draft] of Object.entries(pieces)) {
      const pk = String(pieceKey || "").trim();
      if (!pk || pk.startsWith("__")) continue;
      if (!draft || typeof draft !== "object" || Array.isArray(draft)) continue;
      const mode = sanitizePlainText(draft.mode ?? "", 20);
      const note = sanitizePlainText(draft.note ?? "", NOTE_MAX);
      if (!mode && !note) continue;
      roomOut[pk] = {
        ...(mode ? { mode } : {}),
        ...(note ? { note } : {})
      };
    }
    if (Object.keys(roomOut).length) out[rk] = roomOut;
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
    if (META_KEYS.has(key) || String(key).startsWith("__")) continue;
    quantities[key] = Number(value) || 0;
  }
  return {
    quantities,
    customerInfoDraft: sanitizeCustomerInfoDraft(src[CUSTOMER_INFO_DRAFT_KEY]),
    roomLabelDrafts: sanitizeRoomLabelDrafts(src[ROOM_LABEL_DRAFT_KEY]),
    roomNotes: sanitizeRoomNotesDraft(src[ROOM_NOTES_DRAFT_KEY]),
    projectNote: sanitizeProjectNoteDraft(src[PROJECT_NOTE_DRAFT_KEY]) || null,
    customerProductDrafts: sanitizeCustomerProductDrafts(src[CUSTOMER_PRODUCT_DRAFTS_KEY]),
    backsplashDrafts: sanitizeBacksplashDrafts(src[BACKSPLASH_DRAFTS_KEY]),
    sideSplashDrafts: sanitizeSideSplashDrafts(src[SIDE_SPLASH_DRAFTS_KEY])
  };
}

/**
 * @param {Record<string, number>} quantities
 * @param {{
 *   customerInfoDraft?: object|null,
 *   roomLabelDrafts?: Record<string, string>|null,
 *   roomNotes?: Record<string, string>|null,
 *   projectNote?: string|null,
 *   customerProductDrafts?: object|null,
 *   backsplashDrafts?: object|null,
 *   sideSplashDrafts?: object|null
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
  const productDrafts = sanitizeCustomerProductDrafts(meta.customerProductDrafts);
  if (Object.keys(productDrafts).length) out[CUSTOMER_PRODUCT_DRAFTS_KEY] = productDrafts;
  const backsplashDrafts = sanitizeBacksplashDrafts(meta.backsplashDrafts);
  if (Object.keys(backsplashDrafts).length) out[BACKSPLASH_DRAFTS_KEY] = backsplashDrafts;
  const sideSplashDrafts = sanitizeSideSplashDrafts(meta.sideSplashDrafts);
  if (Object.keys(sideSplashDrafts).length) out[SIDE_SPLASH_DRAFTS_KEY] = sideSplashDrafts;
  return out;
}

/**
 * Build a rooms[] shape for missing-info inspection from selection meta + quantities.
 * @param {{
 *   quantities?: Record<string, number>,
 *   customerProductDrafts?: Record<string, any>,
 *   backsplashDrafts?: Record<string, any>
 * }} meta
 */
export function buildPlumbingRoomsFromSelectionMeta(meta = {}) {
  const quantities = meta.quantities || {};
  const productDrafts = meta.customerProductDrafts || {};
  const backsplashDrafts = meta.backsplashDrafts || {};
  /** @type {Map<string, any>} */
  const rooms = new Map();

  const ensure = (roomKey) => {
    if (!rooms.has(roomKey)) {
      rooms.set(roomKey, {
        roomKey,
        sink: null,
        faucet: null,
        backsplash: null,
        specialtyItems: []
      });
    }
    return rooms.get(roomKey);
  };

  for (const roomKey of new Set([
    ...Object.keys(productDrafts),
    ...Object.keys(backsplashDrafts)
  ])) {
    ensure(roomKey);
  }

  for (const [key, qty] of Object.entries(quantities)) {
    if (Number(qty) <= 0) continue;
    const parts = String(key).split(":");
    const kind = parts[0];
    const roomKey = parts[1];
    if (!roomKey) continue;
    const room = ensure(roomKey);
    const draft = productDrafts[roomKey] || {};

    if (kind === "sink") {
      const mode = parts[2];
      if (mode === "none") {
        room.sink = { source: "none" };
      } else if (mode === "customer_provided" || mode === "customer") {
        room.sink = {
          source: "customer_provided",
          manufacturer: draft.sink?.manufacturer,
          model: draft.sink?.model,
          finish: draft.sink?.finish,
          notes: draft.sink?.notes
        };
      } else if (mode === "esf") {
        const productId = parts.slice(3).join(":");
        room.sink = {
          source: "esf",
          productId,
          variantSku: draft.sink?.variantSku,
          finish: draft.sink?.finish,
          manufacturer: draft.sink?.manufacturer,
          model: draft.sink?.model,
          availability: draft.sink?.availability
        };
      } else if (mode === "stock") {
        room.sink = { source: "esf", productId: "legacy-stock" };
      }
    } else if (kind === "faucet") {
      const mode = parts[2];
      if (mode === "none") {
        room.faucet = { source: "none", requiresHoleCount: false };
      } else if (mode === "customer_provided" || mode === "customer") {
        room.faucet = {
          source: "customer_provided",
          manufacturer: draft.faucet?.manufacturer,
          model: draft.faucet?.model,
          finish: draft.faucet?.finish,
          holeCount: draft.faucet?.holeCount ?? "unknown"
        };
      } else if (mode === "esf") {
        room.faucet = {
          source: "esf",
          productId: parts.slice(3).join(":"),
          holeCount: draft.faucet?.holeCount ?? "unknown"
        };
      }
    } else if (kind === "backsplash") {
      const mode = parts[2];
      const bd = backsplashDrafts[roomKey] || {};
      room.backsplash = {
        mode: mode === "custom_height" ? "custom_height" : mode,
        requestedHeightInches: bd.requestedHeightInches,
        note: bd.note
      };
    } else if (kind === "specialty" && parts[2] === "esf") {
      room.specialtyItems.push({
        productId: parts.slice(3).join(":"),
        // pricingTreatment resolved by missing-info builder via catalog lookup
        estimatorReviewRequired: false
      });
    }
  }

  // Overlay draft-only rooms (customer provided without qty key yet)
  for (const [roomKey, draft] of Object.entries(productDrafts)) {
    const room = ensure(roomKey);
    if (draft.sink && !room.sink) {
      room.sink = {
        source: draft.sink.source || "customer_provided",
        manufacturer: draft.sink.manufacturer,
        model: draft.sink.model
      };
    }
    if (draft.faucet && !room.faucet) {
      room.faucet = {
        source: draft.faucet.source || "customer_provided",
        manufacturer: draft.faucet.manufacturer,
        model: draft.faucet.model,
        holeCount: draft.faucet.holeCount ?? "unknown"
      };
    }
  }

  return [...rooms.values()];
}
