/**
 * The single alias boundary for Additional Lines (charges and credits).
 *
 * The estimator's local buffer uses one vocabulary; the Studio scope uses
 * another. Both directions are normalized here exactly once, so read/write
 * drift (customerFacing vs customerVisible, percentageEligible vs
 * adjustmentEligible, price vs unitPrice, lost room ids, flipped credit signs)
 * cannot happen anywhere else.
 */

const DEFAULT_CATEGORY = "Other";

/**
 * The server's canonical category vocabulary
 * (studioCommercialLines.STUDIO_COMMERCIAL_CATEGORIES). Anything else is
 * coerced to "Other" on write, so the editor must not offer other values.
 */
export const ADDITIONAL_LINE_CATEGORIES = Object.freeze([
  "Countertop",
  "Backsplash",
  "Sink",
  "Faucet",
  "Plumbing fixture",
  "Accessory",
  "Labor",
  "Service",
  "Fee",
  "Discount/Credit",
  "Other"
]);

function str(v) {
  return v == null ? "" : String(v).trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(...candidates) {
  for (const c of candidates) {
    if (c === true) return true;
    if (c === false) return false;
  }
  return null;
}

export const TEAR_OUT_DEFAULT = Object.freeze({
  description: "Tear Out",
  quantity: 1,
  unitPrice: 750,
  role: "charge",
  customerVisible: true,
  percentageEligible: true,
  category: "Service"
});

let localSeq = 0;
export function nextLocalLineId(prefix = "line") {
  localSeq += 1;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${localSeq}`;
}

/** Server/scope line → local editor row. */
export function readAdditionalLine(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const role = str(src.commercialRole || src.commercial_role);
  const internalOnly =
    bool(src.internalOnly) ?? (role === "internal_only" || role === "absorbed");
  const amountExact =
    src.amountExact != null
      ? num(src.amountExact)
      : src.lineTotal != null
        ? num(src.lineTotal)
        : null;
  const unitPrice =
    src.unitPriceExact != null
      ? num(src.unitPriceExact)
      : src.unitPrice != null
        ? num(src.unitPrice)
        : num(src.price);
  // A negative stored amount means a credit; the editor shows a positive
  // magnitude plus an explicit Charge/Credit role.
  const isCredit =
    str(src.role).toLowerCase() === "credit" ||
    role === "credit" ||
    role === "discount" ||
    unitPrice < 0 ||
    (amountExact != null && amountExact < 0);
  // "Customer visible: No" keeps the charge but hides the line's name, which is
  // the server's legacy_hidden_customer_charge role.
  const customerVisible =
    bool(src.customerVisible, src.customerFacing) ??
    (role === "legacy_hidden_customer_charge" ? false : true);
  const category = str(src.category);
  return {
    id: str(src.id) || nextLocalLineId(),
    description: str(src.description || src.customerDescription || src.name),
    quantity: src.quantity != null ? num(src.quantity) : 1,
    unitPrice: Math.abs(unitPrice),
    role: isCredit ? "credit" : "charge",
    customerVisible: internalOnly === true ? false : customerVisible,
    percentageEligible: bool(src.percentageEligible, src.adjustmentEligible) ?? true,
    internalOnly: internalOnly === true,
    roomId: str(src.roomId || src.room_id) || "",
    category: ADDITIONAL_LINE_CATEGORIES.includes(category) ? category : DEFAULT_CATEGORY,
    reason: str(src.reason || src.internalNotes || src.internal_notes)
  };
}

export function readAdditionalLines(list) {
  return (Array.isArray(list) ? list : []).map(readAdditionalLine);
}

/** Signed amount the estimator sees for one row. Credits are negative. */
export function additionalLineAmount(line) {
  const magnitude = Math.abs(num(line?.quantity)) * Math.abs(num(line?.unitPrice));
  const signed = str(line?.role).toLowerCase() === "credit" ? -magnitude : magnitude;
  return Math.round(signed * 100) / 100;
}

/** Canonical server role for one editor row. */
export function commercialRoleFor(line) {
  if (line?.internalOnly === true) return "internal_only";
  if (str(line?.role).toLowerCase() === "credit") return "credit";
  if (line?.customerVisible === false) return "legacy_hidden_customer_charge";
  return "customer_charge";
}

/** Local editor row → Studio scope line. */
export function writeAdditionalLine(line, index = 0) {
  const credit = str(line?.role).toLowerCase() === "credit";
  const description = str(line?.description);
  const unitPrice = Math.abs(num(line?.unitPrice));
  const category = str(line?.category);
  return {
    id: str(line?.id) || nextLocalLineId(),
    name: description,
    customerDescription: description,
    category: credit
      ? "Discount/Credit"
      : ADDITIONAL_LINE_CATEGORIES.includes(category)
        ? category
        : DEFAULT_CATEGORY,
    quantity: num(line?.quantity),
    // Sign lives on unitPrice so quantity stays a plain count. The server
    // re-applies the sign from the role, so this stays stable across saves.
    unitPrice: credit ? -unitPrice : unitPrice,
    customerFacing: line?.customerVisible !== false && line?.internalOnly !== true,
    commercialRole: commercialRoleFor(line),
    percentageEligible: line?.percentageEligible !== false,
    internalNotes: str(line?.reason),
    roomId: str(line?.roomId) || null,
    // Explicit order so reordering round-trips.
    sortOrder: index
  };
}

export function writeAdditionalLines(list) {
  return (Array.isArray(list) ? list : []).map((line, i) => writeAdditionalLine(line, i));
}

/** Round-trip helper used by contract tests. */
export function roundTripAdditionalLine(line) {
  return readAdditionalLine(writeAdditionalLine(line));
}
