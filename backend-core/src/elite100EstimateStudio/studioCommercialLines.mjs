/**
 * Studio commercial estimating — canonical commercial line model.
 *
 * One discriminated model feeds draft → calculate → approve → revise → DE → print.
 *
 * Roles:
 * - customer_charge — named customer charge; in customer total; public
 * - customer_charge_hidden_detail — customer sees description+amount; internalNote/cost private
 * - discount — customer-visible negative adjustment (fixed or % of pre-adjustment commercial base)
 * - credit — customer-visible negative adjustment (fixed)
 * - internal_only — internal economics only; never customer total or public payload
 * - absorbed — recorded for margin; never customer total or public payload
 * - legacy_hidden_customer_charge — pre-parity customerFacing:false: dollars stay in
 *   customer total; name hidden and absorbed into stone at publish (unchanged behavior)
 *
 * Financial rule (FEATURE_DECISIONS §185): new internal_only / absorbed roles do NOT
 * increase customerDisplayTotal. Legacy hidden charges continue to charge the customer
 * without naming the line (existing publication absorption policy).
 */

import { randomUUID } from "node:crypto";
import { MATERIAL_GROUPS } from "./studioEstimateTypes.mjs";

export const STUDIO_COMMERCIAL_ROLES = Object.freeze({
  CUSTOMER_CHARGE: "customer_charge",
  CUSTOMER_CHARGE_HIDDEN_DETAIL: "customer_charge_hidden_detail",
  DISCOUNT: "discount",
  CREDIT: "credit",
  INTERNAL_ONLY: "internal_only",
  ABSORBED: "absorbed",
  LEGACY_HIDDEN_CUSTOMER_CHARGE: "legacy_hidden_customer_charge"
});

export const STUDIO_COMMERCIAL_CATEGORIES = Object.freeze([
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

export const STUDIO_COMMERCIAL_LINE_MODEL_VERSION = "studio_commercial_lines_v1";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function str(v) {
  return v != null && String(v).trim() ? String(v).trim() : "";
}

/**
 * Infer commercial role from a saved line (backward compatible).
 * @param {object} row
 */
export function inferCommercialRole(row) {
  const explicit = str(row?.commercialRole || row?.commercial_role);
  if (Object.values(STUDIO_COMMERCIAL_ROLES).includes(explicit)) return explicit;

  const cat = str(row?.category);
  if (cat === "Discount/Credit") {
    const price = Number(row?.unitPrice ?? row?.unit_price ?? 0) || 0;
    if (price > 0) return STUDIO_COMMERCIAL_ROLES.CREDIT;
    return STUDIO_COMMERCIAL_ROLES.DISCOUNT;
  }

  const facing = row?.customerFacing ?? row?.customer_facing;
  if (facing === false) return STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE;
  return STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE;
}

/**
 * Whether the role's dollars are included in customerDisplayTotal.
 * @param {string} role
 */
export function commercialRoleAffectsCustomerTotal(role) {
  switch (role) {
    case STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY:
    case STUDIO_COMMERCIAL_ROLES.ABSORBED:
      return false;
    default:
      return true;
  }
}

/**
 * Whether the line may appear by name on customer DE / print / public API.
 * @param {string} role
 */
export function commercialRoleIsPublicNamed(role) {
  return (
    role === STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE ||
    role === STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE_HIDDEN_DETAIL ||
    role === STUDIO_COMMERCIAL_ROLES.DISCOUNT ||
    role === STUDIO_COMMERCIAL_ROLES.CREDIT
  );
}

/**
 * Whether publication should absorb dollars into stone (legacy path only).
 * @param {string} role
 */
export function commercialRoleUsesStoneAbsorption(role) {
  return role === STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE;
}

/**
 * Normalize one commercial line into the canonical shape.
 * @param {object} row
 * @param {number} index
 */
export function normalizeStudioCommercialLine(row, index = 0) {
  if (!row || typeof row !== "object") return null;
  const customerDescription =
    str(row.customerDescription) ||
    str(row.customer_description) ||
    str(row.name) ||
    str(row.item_name);
  if (!customerDescription && !str(row.internalDescription) && !str(row.name)) return null;

  const role = inferCommercialRole(row);
  let category = str(row.category) || "Other";
  if (!STUDIO_COMMERCIAL_CATEGORIES.includes(category)) category = "Other";
  if (
    role === STUDIO_COMMERCIAL_ROLES.DISCOUNT ||
    role === STUDIO_COMMERCIAL_ROLES.CREDIT
  ) {
    category = "Discount/Credit";
  }

  const pricingMode =
    str(row.pricingMode || row.pricing_mode) === "fixed" ? "fixed" : "unit";
  let quantity = Number(row.quantity ?? row.qty ?? 1);
  if (!Number.isFinite(quantity)) quantity = 1;
  if (pricingMode === "fixed") quantity = 1;

  let unitPrice = Number(row.unitPrice ?? row.unit_price ?? 0);
  if (!Number.isFinite(unitPrice)) unitPrice = 0;

  // Discount/credit: enforce customer-facing negative economics.
  // UI may enter a positive magnitude; server applies the sign.
  if (role === STUDIO_COMMERCIAL_ROLES.DISCOUNT || role === STUDIO_COMMERCIAL_ROLES.CREDIT) {
    const magnitude = Math.abs(unitPrice);
    unitPrice = -magnitude;
  }

  // Percent discount: percentOfBase on pre-line commercial subtotal (material+fab addons+edge)
  // applied later in calculateStudioEstimate; unitPrice holds 0 and percent holds value.
  let percentOfBase = null;
  if (
    role === STUDIO_COMMERCIAL_ROLES.DISCOUNT &&
    row.percentOfBase != null &&
    Number.isFinite(Number(row.percentOfBase))
  ) {
    percentOfBase = Math.min(100, Math.max(0, Number(row.percentOfBase)));
  }

  const lineTotal =
    percentOfBase != null
      ? null // filled during calculation
      : round2(quantity * unitPrice);

  const customerFacing = commercialRoleIsPublicNamed(role)
    ? true
    : role === STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE
      ? false
      : false;

  return {
    id: str(row.id) || str(row.lineKey) || str(row.line_key) || `cli-${index + 1}`,
    lineKey: str(row.lineKey || row.line_key) || str(row.id) || `cli-${index + 1}`,
    commercialRole: role,
    category,
    // Public / customer description
    name: customerDescription || str(row.name) || `Line ${index + 1}`,
    customerDescription: customerDescription || str(row.name) || `Line ${index + 1}`,
    // Internal-only description (never public)
    internalDescription: str(row.internalDescription || row.internal_description || row.description),
    description: str(row.description),
    quantity,
    unit: str(row.unit) || "ea",
    unitPrice,
    pricingMode,
    percentOfBase,
    lineTotal,
    taxable: row.taxable === true,
    customerFacing,
    internalNotes: str(row.internalNotes || row.internal_notes || row.internalNote || row.internal_note),
    /** Optional internal unit cost for margin (never public). */
    internalUnitCost:
      row.internalUnitCost != null || row.internal_unit_cost != null
        ? Number(row.internalUnitCost ?? row.internal_unit_cost)
        : null,
    roomId: str(row.roomId || row.room_id) || null,
    roomName: str(row.roomName || row.room_name) || null,
    sortOrder:
      row.sortOrder != null && Number.isFinite(Number(row.sortOrder))
        ? Number(row.sortOrder)
        : index
  };
}

/**
 * @param {object} scope
 * @returns {Array<object>}
 */
export function normalizeStudioCommercialLines(scope) {
  const raw = Array.isArray(scope?.customLineItems) ? scope.customLineItems : [];
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = normalizeStudioCommercialLine(raw[i], i);
    if (line) out.push(line);
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id)));
}

/**
 * Apply percent discounts against a positive base, then return line totals.
 * Calculation order:
 * 1. Fixed customer charges / credits / discounts (signed unit×qty)
 * 2. Percent discounts of `percentBase` (material + fabrication before commercial lines)
 * 3. Internal-only / absorbed tracked separately
 *
 * @param {Array<object>} lines normalized
 * @param {number} percentBase dollars before commercial lines
 */
export function calculateCommercialLineTotals(lines, percentBase = 0) {
  let customerVisibleTotal = 0;
  let customerTotalContribution = 0;
  let internalOnlyTotal = 0;
  let absorbedTotal = 0;
  let legacyHiddenCustomerTotal = 0;
  /** @type {Array<object>} */
  const priced = [];

  const base = Math.max(0, Number(percentBase) || 0);

  for (const line of lines) {
    let lineTotal;
    if (
      line.commercialRole === STUDIO_COMMERCIAL_ROLES.DISCOUNT &&
      line.percentOfBase != null
    ) {
      lineTotal = round2(-1 * base * (Number(line.percentOfBase) / 100));
    } else {
      lineTotal = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
    }

    const next = { ...line, lineTotal, amountCents: Math.round(lineTotal * 100) };
    priced.push(next);

    const role = line.commercialRole;
    if (role === STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY) {
      internalOnlyTotal = round2(internalOnlyTotal + lineTotal);
    } else if (role === STUDIO_COMMERCIAL_ROLES.ABSORBED) {
      absorbedTotal = round2(absorbedTotal + lineTotal);
    } else if (role === STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE) {
      legacyHiddenCustomerTotal = round2(legacyHiddenCustomerTotal + lineTotal);
      customerTotalContribution = round2(customerTotalContribution + lineTotal);
    } else if (commercialRoleAffectsCustomerTotal(role)) {
      customerVisibleTotal = round2(customerVisibleTotal + lineTotal);
      customerTotalContribution = round2(customerTotalContribution + lineTotal);
    }
  }

  return {
    lines: priced,
    customerVisibleTotal,
    customerTotalContribution,
    internalOnlyTotal,
    absorbedTotal,
    legacyHiddenCustomerTotal,
    /** All dollars that enter fabrication for legacy+customer path (excludes new internal/absorbed). */
    fabricationCustomTotal: customerTotalContribution,
    /** Full internal economics custom-line sum. */
    internalEconomicsCustomTotal: round2(
      customerTotalContribution + internalOnlyTotal + absorbedTotal
    )
  };
}

/**
 * Strip fields that must never leave the Brain toward public/customer surfaces.
 * @param {object} line
 */
export function toPublicCommercialLine(line) {
  if (!line || !commercialRoleIsPublicNamed(line.commercialRole)) return null;
  return {
    lineKey: line.lineKey || line.id,
    id: line.id,
    name: line.customerDescription || line.name,
    customerDescription: line.customerDescription || line.name,
    category: line.category,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    commercialRole: line.commercialRole,
    customerFacing: true,
    roomId: line.roomId,
    roomName: line.roomName,
    sortOrder: line.sortOrder
  };
}

/**
 * Lines eligible for stone-category absorption at publish (legacy only).
 * @param {Array<object>} lines
 */
export function linesForStoneAbsorption(lines) {
  return (Array.isArray(lines) ? lines : []).filter((l) =>
    commercialRoleUsesStoneAbsorption(l.commercialRole)
  );
}

/**
 * Create a new blank commercial line for the UI/API.
 * @param {Partial<object>} [patch]
 */
export function createBlankCommercialLine(patch = {}) {
  const id = randomUUID();
  const role = patch.commercialRole || STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE;
  return normalizeStudioCommercialLine(
    {
      id,
      lineKey: id,
      name: "",
      customerDescription: "",
      category: "Other",
      quantity: 1,
      unit: "ea",
      unitPrice: 0,
      customerFacing: true,
      commercialRole: role,
      ...patch
    },
    0
  );
}

/**
 * Validate material group label.
 * @param {string} group
 */
export function isAllowedMaterialGroup(group) {
  return MATERIAL_GROUPS.includes(String(group || "").trim());
}
