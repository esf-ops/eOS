/**
 * Quote Flow Pricing — custom line items (customer-facing vs internal-only).
 * Persists structured draft under scope.quoteFlowPricing.customLineItems and
 * maps billable charge/credit lines into Studio scope.customLineItems so
 * calculateStudioEstimateV4 applies them via studioCommercialLines.
 * Notes stay in Quote Flow draft only (do not affect calculator totals).
 */

import { randomUUID } from "node:crypto";
import {
  STUDIO_COMMERCIAL_ROLES,
  normalizeStudioCommercialLine
} from "../elite100EstimateStudio/studioCommercialLines.mjs";

export const QUOTE_FLOW_LINE_TYPES = Object.freeze(["charge", "credit", "note"]);
export const QUOTE_FLOW_LINE_VISIBILITIES = Object.freeze(["customer", "internal"]);
export const QUOTE_FLOW_LINE_CATEGORIES = Object.freeze([
  "material",
  "labor",
  "install",
  "sink/cutout",
  "edge",
  "adjustment",
  "other"
]);

/** Map QF category → Studio commercial category vocabulary. */
const CATEGORY_TO_STUDIO = Object.freeze({
  material: "Countertop",
  labor: "Labor",
  install: "Service",
  "sink/cutout": "Sink",
  edge: "Other",
  adjustment: "Fee",
  other: "Other"
});

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function str(v, max = 240) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function stableId(raw) {
  const id = str(raw, 80);
  if (id) return id;
  try {
    return `qf-cli-${randomUUID().slice(0, 8)}`;
  } catch {
    return `qf-cli-${Date.now().toString(36)}`;
  }
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeQuoteFlowLineType(raw) {
  const v = str(raw, 40).toLowerCase();
  if (QUOTE_FLOW_LINE_TYPES.includes(v)) return v;
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeQuoteFlowLineVisibility(raw) {
  const v = str(raw, 40).toLowerCase();
  if (v === "customer" || v === "customer-facing" || v === "customer_facing") return "customer";
  if (v === "internal" || v === "internal-only" || v === "internal_only") return "internal";
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeQuoteFlowLineCategory(raw) {
  const v = str(raw, 40).toLowerCase();
  if (QUOTE_FLOW_LINE_CATEGORIES.includes(v)) return v;
  return "other";
}

/**
 * Normalize one Quote Flow custom line item.
 * @param {object} row
 * @param {number} index
 * @returns {{ ok: true, line: object } | { ok: false, issues: object[] }}
 */
export function normalizeQuoteFlowCustomLineItem(row, index = 0) {
  /** @type {Array<{ field: string, message: string }>} */
  const issues = [];
  if (!row || typeof row !== "object") {
    return {
      ok: false,
      issues: [{ field: `customLineItems[${index}]`, message: "Line item must be an object." }]
    };
  }

  const label = str(row.label || row.description || row.name);
  if (!label) {
    issues.push({
      field: `customLineItems[${index}].label`,
      message: "Label is required for each line item."
    });
  }

  const type = normalizeQuoteFlowLineType(row.type);
  if (!type) {
    issues.push({
      field: `customLineItems[${index}].type`,
      message: "Type must be charge, credit, or note."
    });
  }

  const visibility = normalizeQuoteFlowLineVisibility(row.visibility);
  if (!visibility) {
    issues.push({
      field: `customLineItems[${index}].visibility`,
      message: "Visibility must be customer or internal."
    });
  }

  let quantity = row.quantity != null && row.quantity !== "" ? Number(row.quantity) : 1;
  if (!Number.isFinite(quantity) || quantity < 0) {
    issues.push({
      field: `customLineItems[${index}].quantity`,
      message: "Quantity must be a non-negative number."
    });
    quantity = 1;
  }

  let unitAmount =
    row.unitAmount != null && row.unitAmount !== ""
      ? Number(row.unitAmount)
      : row.unitPrice != null && row.unitPrice !== ""
        ? Number(row.unitPrice)
        : null;
  let amount =
    row.amount != null && row.amount !== ""
      ? Number(row.amount)
      : row.lineTotal != null && row.lineTotal !== ""
        ? Number(row.lineTotal)
        : null;

  if (type === "note") {
    unitAmount = 0;
    amount = 0;
    quantity = 1;
  } else {
    if (unitAmount == null && amount == null) {
      issues.push({
        field: `customLineItems[${index}].amount`,
        message: "Charge and credit lines require an amount."
      });
    }
    if (unitAmount != null && !Number.isFinite(unitAmount)) {
      issues.push({
        field: `customLineItems[${index}].unitAmount`,
        message: "Unit amount must be a finite number."
      });
      unitAmount = 0;
    }
    if (amount != null && !Number.isFinite(amount)) {
      issues.push({
        field: `customLineItems[${index}].amount`,
        message: "Amount must be a finite number."
      });
      amount = 0;
    }
    // Prefer unit×qty; fall back to total amount as unit when qty is 1.
    if (unitAmount == null && amount != null) {
      unitAmount = quantity > 0 ? round2(Math.abs(amount) / quantity) : Math.abs(amount);
    }
    if (amount == null && unitAmount != null) {
      amount = round2(Math.abs(unitAmount) * quantity);
    }
    unitAmount = round2(Math.abs(Number(unitAmount) || 0));
    amount = round2(Math.abs(Number(amount) || 0));
  }

  const category = normalizeQuoteFlowLineCategory(row.category);
  const now = new Date().toISOString();

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    line: {
      id: stableId(row.id),
      label,
      type,
      visibility,
      quantity: round2(quantity),
      unitAmount,
      amount,
      taxable: row.taxable === true,
      category,
      note: str(row.note || row.internalNote || row.internalNotes, 500),
      sortOrder:
        row.sortOrder != null && Number.isFinite(Number(row.sortOrder))
          ? Number(row.sortOrder)
          : index,
      createdAt: str(row.createdAt, 40) || now,
      updatedAt: now
    }
  };
}

/**
 * Normalize an array of Quote Flow custom line items.
 * @param {unknown} raw
 * @returns {{ ok: true, lines: object[] } | { ok: false, issues: object[] }}
 */
export function normalizeQuoteFlowCustomLineItems(raw) {
  if (raw == null) return { ok: true, lines: [] };
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ field: "customLineItems", message: "customLineItems must be an array." }]
    };
  }
  /** @type {object[]} */
  const lines = [];
  /** @type {Array<{ field: string, message: string }>} */
  const issues = [];
  for (let i = 0; i < raw.length; i += 1) {
    const result = normalizeQuoteFlowCustomLineItem(raw[i], i);
    if (!result.ok) {
      issues.push(...result.issues);
      continue;
    }
    lines.push(result.line);
  }
  if (issues.length) return { ok: false, issues };
  lines.sort((a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id)));
  return { ok: true, lines };
}

/**
 * Read persisted QF custom lines from scope (preferred) or recover from Studio customLineItems.
 * @param {object|null|undefined} scope
 */
export function readQuoteFlowCustomLineItems(scope) {
  const qfp =
    scope?.quoteFlowPricing && typeof scope.quoteFlowPricing === "object"
      ? scope.quoteFlowPricing
      : {};
  if (Array.isArray(qfp.customLineItems)) {
    const normalized = normalizeQuoteFlowCustomLineItems(qfp.customLineItems);
    return normalized.ok ? normalized.lines : [];
  }
  // Recover billable Studio lines only (no notes) for older drafts.
  const studio = Array.isArray(scope?.customLineItems) ? scope.customLineItems : [];
  /** @type {object[]} */
  const recovered = [];
  for (let i = 0; i < studio.length; i += 1) {
    const s = studio[i];
    if (!s || typeof s !== "object") continue;
    const role = str(s.commercialRole);
    const isInternal = role === STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY || role === "absorbed";
    const isCredit = role === STUDIO_COMMERCIAL_ROLES.CREDIT || role === STUDIO_COMMERCIAL_ROLES.DISCOUNT;
    const unit = Math.abs(Number(s.unitPrice) || 0);
    const qty = Number(s.quantity) || 1;
    recovered.push({
      id: str(s.id) || `recovered-${i + 1}`,
      label: str(s.customerDescription || s.name || s.internalDescription) || `Line ${i + 1}`,
      type: isCredit ? "credit" : "charge",
      visibility: isInternal ? "internal" : "customer",
      quantity: qty,
      unitAmount: unit,
      amount: round2(unit * qty),
      taxable: s.taxable === true,
      category: "other",
      note: str(s.internalNotes || s.internalDescription),
      sortOrder: i,
      createdAt: null,
      updatedAt: null
    });
  }
  return recovered;
}

/**
 * Map billable QF lines → Studio commercial customLineItems for the calculator.
 * Notes are excluded (amount 0, informational only).
 * @param {object[]} qfLines
 */
export function mapQuoteFlowLinesToStudioCustomLineItems(qfLines) {
  const raw = Array.isArray(qfLines) ? qfLines : [];
  /** @type {object[]} */
  const studioRows = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (!line || line.type === "note") continue;
    const isCredit = line.type === "credit";
    const isInternal = line.visibility === "internal";
    let commercialRole = STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE;
    if (isInternal) commercialRole = STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY;
    else if (isCredit) commercialRole = STUDIO_COMMERCIAL_ROLES.CREDIT;

    const unitMagnitude = Math.abs(Number(line.unitAmount) || 0);
    const unitPrice = isCredit && !isInternal ? unitMagnitude : isCredit ? -unitMagnitude : unitMagnitude;
    // Internal credits: negative internal_only amount.
    const internalUnitPrice = isInternal && isCredit ? -unitMagnitude : unitPrice;

    const studioCategory =
      isCredit && !isInternal
        ? "Discount/Credit"
        : CATEGORY_TO_STUDIO[line.category] || "Other";

    const draft = {
      id: line.id,
      lineKey: line.id,
      commercialRole,
      name: line.label,
      customerDescription: line.visibility === "customer" ? line.label : line.label,
      internalDescription: line.visibility === "internal" ? line.label : "",
      description: line.label,
      quantity: Number(line.quantity) || 1,
      unitPrice: isInternal ? internalUnitPrice : unitPrice,
      pricingMode: "unit",
      category: studioCategory,
      taxable: line.taxable === true,
      customerFacing: line.visibility === "customer",
      internalNotes: line.note || "",
      sortOrder: line.sortOrder != null ? line.sortOrder : i,
      quoteFlowManaged: true
    };
    const normalized = normalizeStudioCommercialLine(draft, i);
    if (normalized) studioRows.push({ ...normalized, quoteFlowManaged: true });
  }
  return studioRows;
}

/**
 * Summarize custom line items for UI / calculation result metadata.
 * @param {object[]} qfLines
 */
export function summarizeQuoteFlowCustomLineItems(qfLines) {
  const lines = Array.isArray(qfLines) ? qfLines : [];
  let customerCharges = 0;
  let customerCredits = 0;
  let internalCharges = 0;
  let internalCredits = 0;
  let noteCount = 0;
  let billableNet = 0;

  for (const line of lines) {
    if (!line) continue;
    if (line.type === "note") {
      noteCount += 1;
      continue;
    }
    const amt = Math.abs(Number(line.amount) || 0);
    if (line.visibility === "customer") {
      if (line.type === "credit") {
        customerCredits = round2(customerCredits + amt);
        billableNet = round2(billableNet - amt);
      } else {
        customerCharges = round2(customerCharges + amt);
        billableNet = round2(billableNet + amt);
      }
    } else {
      if (line.type === "credit") {
        internalCredits = round2(internalCredits + amt);
        billableNet = round2(billableNet - amt);
      } else {
        internalCharges = round2(internalCharges + amt);
        billableNet = round2(billableNet + amt);
      }
    }
  }

  return {
    customerFacingChargesTotal: customerCharges,
    customerFacingCreditsTotal: customerCredits,
    internalOnlyChargesTotal: internalCharges,
    internalOnlyCreditsTotal: internalCredits,
    noteOnlyCount: noteCount,
    netCustomAdjustment: billableNet,
    customerFacing: lines.filter((l) => l && l.visibility === "customer"),
    internalOnly: lines.filter((l) => l && l.visibility === "internal")
  };
}

/**
 * Apply custom line items onto an existing scope (pricing draft merge).
 * @param {object} existingScope
 * @param {unknown} customLineItemsRaw
 * @returns {{ ok: true, scope: object, lines: object[], summary: object } | { ok: false, issues: object[] }}
 */
export function applyQuoteFlowCustomLineItemsToScope(existingScope, customLineItemsRaw) {
  const existing =
    existingScope && typeof existingScope === "object" ? { ...existingScope } : {};
  const normalized = normalizeQuoteFlowCustomLineItems(customLineItemsRaw);
  if (!normalized.ok) return normalized;

  const priorQfp =
    existing.quoteFlowPricing && typeof existing.quoteFlowPricing === "object"
      ? { ...existing.quoteFlowPricing }
      : {};
  const studioLines = mapQuoteFlowLinesToStudioCustomLineItems(normalized.lines);
  const summary = summarizeQuoteFlowCustomLineItems(normalized.lines);

  return {
    ok: true,
    lines: normalized.lines,
    summary,
    scope: {
      ...existing,
      quoteFlowPricing: {
        ...priorQfp,
        customLineItems: normalized.lines
      },
      customLineItems: studioLines,
      quoteFlowPricingEdited: true
    }
  };
}

/**
 * Edge status for Pricing tab (pending when LF exists but no profile selected).
 * @param {object|null|undefined} scope
 * @param {{ openEdgeLf?: number, edgeLf?: number|null, openEdgeAmount?: number|null, edgeTier?: string|null, edgeProfileToken?: string|null, edgeProfileLabel?: string|null }} calcEdge
 */
export function presentQuoteFlowEdgeStatus(scope, calcEdge = {}) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  let openEdgeLf = 0;
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    for (const piece of Array.isArray(room.pieces) ? room.pieces : []) {
      if (!piece || piece.excluded === true || piece.included === false) continue;
      const qty = Number(piece.quantity) > 0 ? Number(piece.quantity) : 1;
      const lf = Number(piece.openEdgeLf ?? piece.finishedEdgeLf) || 0;
      if (lf > 0) openEdgeLf += lf * qty;
    }
  }
  openEdgeLf = round2(openEdgeLf);
  if (calcEdge.openEdgeLf != null && Number.isFinite(Number(calcEdge.openEdgeLf))) {
    openEdgeLf = round2(Number(calcEdge.openEdgeLf));
  }

  const explicitToken =
    str(scope?.edgeProfileToken) ||
    str(calcEdge.edgeProfileToken) ||
    rooms
      .flatMap((r) => (Array.isArray(r?.pieces) ? r.pieces : []))
      .map((p) => str(p?.edgeProfileToken || p?.edgeProfile))
      .find(Boolean) ||
    "";

  const profileSelected = Boolean(explicitToken);
  const amount =
    calcEdge.openEdgeAmount != null && Number.isFinite(Number(calcEdge.openEdgeAmount))
      ? Number(calcEdge.openEdgeAmount)
      : null;
  const tier = str(calcEdge.edgeTier).toLowerCase();
  const pricedLf =
    calcEdge.edgeLf != null && Number.isFinite(Number(calcEdge.edgeLf))
      ? Number(calcEdge.edgeLf)
      : null;

  /** @type {'none'|'pending'|'included'|'charged'} */
  let chargeStatus = "none";
  let chargeLabel = "—";
  if (openEdgeLf > 0 && !profileSelected) {
    chargeStatus = "pending";
    chargeLabel = "Pending";
  } else if (profileSelected && (amount === 0 || tier === "free")) {
    chargeStatus = "included";
    chargeLabel = "Included / no charge";
  } else if (profileSelected && amount != null && amount > 0) {
    chargeStatus = "charged";
    chargeLabel = null;
  } else if (!(openEdgeLf > 0)) {
    chargeStatus = "none";
    chargeLabel = "—";
  }

  return {
    openEdgeLf,
    profileSelected,
    profileToken: profileSelected ? explicitToken : null,
    profileLabel: profileSelected
      ? str(calcEdge.edgeProfileLabel) || explicitToken
      : null,
    profileDisplay: profileSelected
      ? str(calcEdge.edgeProfileLabel) || explicitToken
      : "Not selected",
    chargeStatus,
    chargeLabel,
    edgeAmount: amount,
    // Only surface priced LF when a profile is selected — avoid "0.0 LF priced" while pending.
    edgeLfPriced: profileSelected ? pricedLf : null
  };
}
