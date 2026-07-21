/**
 * Structured per-run cutout scope for Takeoff Review → Pricing Setup.
 *
 * Takeoff authority: which physical openings exist on each run (sink opening,
 * cooktop opening, outlet opening…). Pricing Setup later chooses the products
 * that fill those openings — a sink opening and a sink product are separate
 * concepts, each charged exactly once by the Brain.
 *
 * Canonical contract (stored on run.cutouts):
 *   [{ type: "kitchen_sink", quantity: 1, source: "estimator_confirmed", note?: string }]
 *
 * Legacy shapes normalized here (never parsed downstream):
 *   - freeform string "sink:1, cooktop:1"
 *   - object map { sink: 1, cooktop: 1 }
 */

/** Physical cutout types an estimator can confirm on a run. */
export const TAKEOFF_CUTOUT_TYPES = Object.freeze([
  Object.freeze({ type: "kitchen_sink", label: "Kitchen sink", addOnKey: "qty-sink", governed: true }),
  Object.freeze({ type: "vanity_bar_sink", label: "Vanity/bar sink", addOnKey: "qty-bar", governed: true }),
  Object.freeze({ type: "cooktop", label: "Cooktop", addOnKey: "qty-cook", governed: true }),
  Object.freeze({ type: "electrical_outlet", label: "Electrical outlet", addOnKey: "qty-outlet", governed: true }),
  // Pop-up outlet pricing is an unresolved commercial item (qty-popup-outlet) —
  // surfaced for estimator review, never auto-priced.
  Object.freeze({ type: "pop_up_outlet", label: "Pop-up outlet", addOnKey: null, governed: false }),
  Object.freeze({ type: "other", label: "Other", addOnKey: null, governed: false })
]);

const TYPE_SET = new Set(TAKEOFF_CUTOUT_TYPES.map((t) => t.type));
const LABEL_BY_TYPE = new Map(TAKEOFF_CUTOUT_TYPES.map((t) => [t.type, t.label]));
const ADDON_KEY_BY_TYPE = new Map(
  TAKEOFF_CUTOUT_TYPES.filter((t) => t.addOnKey).map((t) => [t.type, t.addOnKey])
);

/** Legacy freeform/object key → canonical cutout type. */
const LEGACY_KEY_MAP = new Map([
  ["sink", "kitchen_sink"],
  ["kitchen_sink", "kitchen_sink"],
  ["kitchensink", "kitchen_sink"],
  ["ksink", "kitchen_sink"],
  ["vanity", "vanity_bar_sink"],
  ["vanity_sink", "vanity_bar_sink"],
  ["vanitysink", "vanity_bar_sink"],
  ["bar", "vanity_bar_sink"],
  ["bar_sink", "vanity_bar_sink"],
  ["barsink", "vanity_bar_sink"],
  ["vanity_bar_sink", "vanity_bar_sink"],
  ["cooktop", "cooktop"],
  ["cook_top", "cooktop"],
  ["cook", "cooktop"],
  ["range", "cooktop"],
  ["stove", "cooktop"],
  ["outlet", "electrical_outlet"],
  ["outlets", "electrical_outlet"],
  ["electrical", "electrical_outlet"],
  ["electrical_outlet", "electrical_outlet"],
  ["popup", "pop_up_outlet"],
  ["pop_up", "pop_up_outlet"],
  ["pop-up", "pop_up_outlet"],
  ["popup_outlet", "pop_up_outlet"],
  ["pop_up_outlet", "pop_up_outlet"]
]);

export function cutoutTypeLabel(type) {
  return LABEL_BY_TYPE.get(String(type)) ?? String(type);
}

function intQty(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function legacyKeyToEntry(key, qty) {
  const canonical = LEGACY_KEY_MAP.get(String(key).trim().toLowerCase());
  const quantity = intQty(qty);
  if (quantity <= 0) return null;
  if (canonical) {
    return { type: canonical, quantity, source: "legacy" };
  }
  // Unknown legacy key: keep it as reviewable "other" — never dropped silently.
  return { type: "other", quantity, source: "legacy", note: String(key).trim() };
}

/** True when value is already the canonical structured array. */
export function isStructuredCutoutArray(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.type === "string" &&
        Number.isFinite(Number(e.quantity))
    )
  );
}

/**
 * Normalize any legacy cutouts value (string / object map / structured array)
 * to the canonical structured array. Entries merge by (type, note).
 *
 * @param {unknown} value
 * @returns {{ cutouts: Array<{type:string,quantity:number,source:string,note?:string}>, changed: boolean }}
 */
export function normalizeRunCutouts(value) {
  if (value == null || value === "") return { cutouts: [], changed: value != null };

  /** @type {Array<{type:string,quantity:number,source:string,note?:string}>} */
  let entries = [];
  let changed = false;

  if (isStructuredCutoutArray(value)) {
    for (const e of value) {
      const quantity = intQty(e.quantity);
      if (quantity <= 0) {
        changed = true;
        continue;
      }
      const type = TYPE_SET.has(e.type) ? e.type : null;
      if (type) {
        entries.push({
          type,
          quantity,
          source: typeof e.source === "string" && e.source ? e.source : "estimator_confirmed",
          ...(e.note ? { note: String(e.note) } : {})
        });
        if (e.quantity !== quantity || !e.source) changed = true;
      } else {
        entries.push({ type: "other", quantity, source: "legacy", note: String(e.type) });
        changed = true;
      }
    }
  } else if (typeof value === "object" && !Array.isArray(value)) {
    changed = true;
    for (const [k, v] of Object.entries(value)) {
      const entry = legacyKeyToEntry(k, v);
      if (entry) entries.push(entry);
    }
  } else if (typeof value === "string") {
    changed = true;
    for (const part of value.split(",")) {
      const [k, v] = part.split(":").map((s) => s.trim());
      if (!k) continue;
      const entry = legacyKeyToEntry(k, v ?? 1);
      if (entry) entries.push(entry);
    }
  } else {
    return { cutouts: [], changed: true };
  }

  // Merge duplicates by type+note so quantities never double.
  const merged = new Map();
  for (const e of entries) {
    const key = `${e.type}::${e.note ?? ""}`;
    const prev = merged.get(key);
    if (prev) {
      prev.quantity += e.quantity;
      changed = true;
    } else {
      merged.set(key, { ...e });
    }
  }
  return { cutouts: [...merged.values()], changed };
}

/**
 * Ensure every run carries canonical structured cutouts. Pure — returns a new
 * takeoff object only when something changed.
 *
 * @param {object|null|undefined} takeoff
 * @returns {{ takeoff: object|null|undefined, changed: boolean }}
 */
export function normalizeTakeoffCutoutScope(takeoff) {
  if (!takeoff || typeof takeoff !== "object" || !Array.isArray(takeoff.rooms)) {
    return { takeoff, changed: false };
  }
  let changed = false;
  const base = structuredClone(takeoff);

  const normalizeRun = (run) => {
    if (!run || typeof run !== "object") return run;
    if (run.cutouts == null) {
      run.cutouts = [];
      changed = true;
      return run;
    }
    const result = normalizeRunCutouts(run.cutouts);
    if (result.changed || !isStructuredCutoutArray(run.cutouts)) {
      run.cutouts = result.cutouts;
      changed = true;
    }
    return run;
  };

  for (const room of base.rooms) {
    if (!room || typeof room !== "object") continue;
    if (Array.isArray(room.runs)) room.runs = room.runs.map(normalizeRun);
    if (Array.isArray(room.pieces)) room.pieces = room.pieces.map(normalizeRun);
    if (Array.isArray(room.areas)) {
      for (const area of room.areas) {
        if (!area || typeof area !== "object") continue;
        if (Array.isArray(area.runs)) area.runs = area.runs.map(normalizeRun);
      }
    }
  }
  return { takeoff: changed ? base : takeoff, changed };
}

/**
 * Compact estimator-facing summary: "Kitchen sink, Cooktop ×2" / "None".
 * @param {unknown} cutouts
 */
export function summarizeRunCutouts(cutouts) {
  const { cutouts: entries } = normalizeRunCutouts(cutouts);
  if (!entries.length) return "None";
  return entries
    .map((e) => {
      const label = e.type === "other" && e.note ? `Other (${e.note})` : cutoutTypeLabel(e.type);
      return e.quantity > 1 ? `${label} ×${e.quantity}` : label;
    })
    .join(", ");
}

/**
 * "Other" cutouts require a short estimator note before approval can rely on them.
 * @param {unknown} cutouts
 */
export function collectCutoutReviewIssues(cutouts) {
  const { cutouts: entries } = normalizeRunCutouts(cutouts);
  const issues = [];
  for (const e of entries) {
    if (e.type === "other" && !(e.note && String(e.note).trim())) {
      issues.push({
        code: "OTHER_CUTOUT_NOTE_REQUIRED",
        message: "Other cutout needs a short note describing the opening."
      });
    }
  }
  return issues;
}

/**
 * Map approved structured cutout scope → governed Studio fabrication add-on
 * quantities, keeping room/run ownership for traceability.
 *
 * Ungoverned types (pop_up_outlet, other) never auto-price — they are returned
 * separately for estimator review.
 *
 * @param {{ rooms?: Array<object> }} importPayload takeoff_import_v1 payload
 */
export function deriveFabricationQuantitiesFromImportPayload(importPayload) {
  /** @type {Record<string, number>} */
  const addOnQuantities = {};
  /** @type {Record<string, number>} */
  const countsByType = {};
  /** @type {Array<{roomName:string,roomId:string|null,runId:string|null,type:string,quantity:number,note:string|null}>} */
  const reviewCutouts = [];
  /** @type {Array<{roomName:string,roomId:string|null,runId:string|null,type:string,quantity:number}>} */
  const ownership = [];

  for (const room of importPayload?.rooms ?? []) {
    for (const piece of room?.pieces ?? []) {
      if (piece?.includedInTakeoff === false) continue;
      const { cutouts } = normalizeRunCutouts(piece?.cutouts);
      for (const e of cutouts) {
        countsByType[e.type] = (countsByType[e.type] ?? 0) + e.quantity;
        ownership.push({
          roomName: String(room?.name ?? ""),
          roomId: piece?.roomId ?? null,
          runId: piece?.runId ?? null,
          type: e.type,
          quantity: e.quantity
        });
        const addOnKey = ADDON_KEY_BY_TYPE.get(e.type);
        if (addOnKey) {
          addOnQuantities[addOnKey] = (addOnQuantities[addOnKey] ?? 0) + e.quantity;
        } else {
          reviewCutouts.push({
            roomName: String(room?.name ?? ""),
            roomId: piece?.roomId ?? null,
            runId: piece?.runId ?? null,
            type: e.type,
            quantity: e.quantity,
            note: e.note ?? null
          });
        }
      }
    }
  }

  return { addOnQuantities, countsByType, reviewCutouts, ownership };
}

/**
 * Toggle one cutout type on a run's structured list (worksheet checkbox).
 * @param {unknown} cutouts current value (any legacy shape accepted)
 * @param {string} type
 * @param {boolean} checked
 */
export function toggleCutoutEntry(cutouts, type, checked) {
  const { cutouts: entries } = normalizeRunCutouts(cutouts);
  const rest = entries.filter((e) => e.type !== type);
  if (!checked) return rest;
  const existing = entries.find((e) => e.type === type);
  return [
    ...rest,
    {
      type,
      quantity: existing?.quantity ?? 1,
      source: "estimator_confirmed",
      ...(existing?.note ? { note: existing.note } : {})
    }
  ];
}

/**
 * Set the quantity for one selected cutout type (min 1).
 * @param {unknown} cutouts
 * @param {string} type
 * @param {number} quantity
 */
export function setCutoutQuantity(cutouts, type, quantity) {
  const { cutouts: entries } = normalizeRunCutouts(cutouts);
  const qty = Math.max(1, intQty(quantity) || 1);
  return entries.map((e) =>
    e.type === type ? { ...e, quantity: qty, source: "estimator_confirmed" } : e
  );
}

/**
 * Set the estimator note on a selected cutout type (required for "other").
 * @param {unknown} cutouts
 * @param {string} type
 * @param {string} note
 */
export function setCutoutNote(cutouts, type, note) {
  const { cutouts: entries } = normalizeRunCutouts(cutouts);
  const text = String(note ?? "");
  return entries.map((e) =>
    e.type === type
      ? { ...e, ...(text.trim() ? { note: text } : { note: undefined }), source: "estimator_confirmed" }
      : e
  );
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Read-only "Approved physical scope" summary for Pricing Setup.
 * @param {{ rooms?: Array<object>, totals?: object }} importPayload
 */
export function buildApprovedScopeSummary(importPayload) {
  const derived = deriveFabricationQuantitiesFromImportPayload(importPayload);
  let pieceCount = 0;
  let backsplashEligibleRunCount = 0;
  let eligibleBacksplashLengthIn = 0;
  let edgeEligibleLengthIn = 0;

  for (const room of importPayload?.rooms ?? []) {
    backsplashEligibleRunCount += Number(room?.eligibleRunCount) || 0;
    eligibleBacksplashLengthIn = round2(
      eligibleBacksplashLengthIn + (Number(room?.eligibleBacksplashLengthIn) || 0)
    );
    for (const piece of room?.pieces ?? []) {
      if (piece?.includedInTakeoff === false) continue;
      pieceCount += 1;
      // Exposed-edge proxy until edge geometry is captured per run: counter run
      // lengths (splash pieces are vertical geometry, not finished edge).
      if (String(piece?.pieceType ?? "counter") === "counter") {
        edgeEligibleLengthIn = round2(edgeEligibleLengthIn + (Number(piece?.lengthIn) || 0));
      }
    }
  }

  return {
    source: "takeoff",
    pieceCount,
    kitchenSinkCutouts: derived.countsByType.kitchen_sink ?? 0,
    vanityBarSinkCutouts: derived.countsByType.vanity_bar_sink ?? 0,
    cooktopCutouts: derived.countsByType.cooktop ?? 0,
    electricalOutletCutouts: derived.countsByType.electrical_outlet ?? 0,
    popUpOutletCutouts: derived.countsByType.pop_up_outlet ?? 0,
    otherCutouts: derived.countsByType.other ?? 0,
    backsplashEligibleRunCount,
    eligibleBacksplashLengthIn,
    edgeEligibleLengthIn,
    edgeEligibleLinearFeet: round2(edgeEligibleLengthIn / 12),
    reviewCutouts: derived.reviewCutouts,
    countertopSqft: Number(importPayload?.totals?.chargeableCountertopSqft) || 0
  };
}
