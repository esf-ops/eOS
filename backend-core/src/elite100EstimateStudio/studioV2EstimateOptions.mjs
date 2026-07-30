/**
 * Studio V2 Slice D — estimator-owned estimate options / commercial lines.
 * Persists to scope.customLineItems via the canonical studioCommercialLines model.
 * Does not invent pricing formulas; does not edit calculator math.
 */

import { randomUUID } from "node:crypto";
import {
  STUDIO_COMMERCIAL_ROLES,
  normalizeStudioCommercialLine,
  normalizeStudioCommercialLines
} from "./studioCommercialLines.mjs";
import { normalizeEstimateWideAdjustment } from "./studioEstimateWideAdjustment.mjs";

function str(v, max = 240) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function stableId(prefix, raw) {
  const id = str(raw, 80);
  if (id) return id;
  try {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}

function parseAmountDollars(raw, field) {
  if (raw == null || raw === "") {
    return { ok: false, error: `${field} is required` };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    return { ok: false, error: `${field} must be a finite number` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/**
 * Editor projection from persisted estimate scope + calc.
 * @param {object|null|undefined} estimate
 */
export function buildStudioV2EditableOptions(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  // Prefer full snapshot so accountAdjustment.amountExact matches calculate totals.
  const calc = estimate?.calculationSnapshot || estimate?.calculation || {};
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const lines = normalizeStudioCommercialLines(scope);

  const customerLines = [];
  const discounts = [];
  const internalLines = [];
  const hiddenCustomerImpactingLines = [];

  for (const line of lines) {
    const role = line.commercialRole;
    const base = {
      id: line.id,
      label: line.customerDescription || line.name,
      amount: Number(line.unitPrice) || 0,
      quantity: Number(line.quantity) || 1,
      commercialRole: role,
      internalReason: line.internalNotes || line.internalDescription || "",
      customerSafeLabel: line.customerDescription || line.name || "",
      percentageEligible: line.percentageEligible !== false,
      category: line.category || "Other"
    };

    if (role === STUDIO_COMMERCIAL_ROLES.DISCOUNT || role === STUDIO_COMMERCIAL_ROLES.CREDIT) {
      customerLines.push({
        ...base,
        kind: "credit",
        amount: Math.abs(Number(line.unitPrice) || 0),
        percentOfBase: line.percentOfBase
      });
      continue;
    }
    if (role === STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY || role === STUDIO_COMMERCIAL_ROLES.ABSORBED) {
      internalLines.push({
        ...base,
        label: line.internalDescription || line.internalNotes || line.name,
        amount: Number(line.unitPrice) || 0
      });
      continue;
    }
    if (
      role === STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE ||
      role === STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE_HIDDEN_DETAIL
    ) {
      hiddenCustomerImpactingLines.push({
        ...base,
        amount: Number(line.unitPrice) || 0
      });
      continue;
    }
    customerLines.push({
      ...base,
      kind: "charge",
      amount: Number(line.unitPrice) || 0
    });
  }

  const adj = normalizeEstimateWideAdjustment(scope.estimateWideAdjustment);
  const ewaDetail =
    totals.estimateWideAdjustment && typeof totals.estimateWideAdjustment === "object"
      ? totals.estimateWideAdjustment
      : null;
  const accountAdjAmount =
    ewaDetail?.exactAdjustment != null && Number.isFinite(Number(ewaDetail.exactAdjustment))
      ? Number(ewaDetail.exactAdjustment)
      : Number(totals.accountAdjustment);
  const amountKnown =
    (ewaDetail?.exactAdjustment != null && Number.isFinite(Number(ewaDetail.exactAdjustment))) ||
    (totals.accountAdjustment != null && Number.isFinite(Number(totals.accountAdjustment)));
  const isTrustedAccount =
    adj.source === "trusted_account_rule" || adj.spahnTrusted === true;
  // Keep legacy `accountAdjustment` key for API stability, but mark kind so UI
  // does not label manual estimate-wide adjustments as account rules.
  const accountAdjustment = {
    active: adj.active === true,
    percentage: adj.percentage || 0,
    reason: adj.reason || "",
    source: adj.source || "manual",
    kind: isTrustedAccount ? "account_pricing_rule" : "estimate_wide_adjustment",
    amountExact: amountKnown ? accountAdjAmount : null,
    amountKnown,
    readOnly: true,
    available: true
  };

  return {
    customerLines,
    discounts,
    internalLines,
    hiddenCustomerImpactingLines,
    accountAdjustment,
    waterfalls: {
      available: false,
      message: "Not yet available in V2",
      items: []
    },
    vanityProgram: {
      available: false,
      message: "Not yet available in V2",
      selected: null
    },
    customLineItems: lines
  };
}

/**
 * Flatten conceptual options buckets (or raw customLineItems) into draft rows.
 * @param {object} options
 * @returns {{ ok: true, rows: object[] } | { ok: false, issues: object[] }}
 */
export function flattenStudioV2OptionsPayload(options) {
  const issues = [];
  if (!options || typeof options !== "object") {
    return { ok: false, issues: [{ field: "options", message: "options object is required" }] };
  }

  if (Array.isArray(options.customLineItems)) {
    return { ok: true, rows: options.customLineItems };
  }

  /** @type {object[]} */
  const rows = [];

  const customerLines = Array.isArray(options.customerLines) ? options.customerLines : [];
  for (let i = 0; i < customerLines.length; i += 1) {
    const line = customerLines[i] || {};
    const kind = str(line.kind || line.type, 40).toLowerCase();
    const isCredit = kind === "credit" || kind === "discount";
    const label = str(line.label || line.name || line.customerDescription);
    const amountField = `options.customerLines[${i}].amount`;
    const amount = parseAmountDollars(
      line.amount ?? line.unitPrice ?? line.unit_price,
      amountField
    );
    if (!label) {
      issues.push({
        field: `options.customerLines[${i}].label`,
        message: "Label is required for customer-facing lines"
      });
    }
    if (!amount.ok) issues.push({ field: amountField, message: amount.error });
    rows.push({
      id: stableId("cli", line.id),
      commercialRole: isCredit
        ? kind === "credit"
          ? STUDIO_COMMERCIAL_ROLES.CREDIT
          : STUDIO_COMMERCIAL_ROLES.DISCOUNT
        : STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE,
      name: label || `Line ${i + 1}`,
      customerDescription: label || `Line ${i + 1}`,
      quantity: 1,
      unitPrice: amount.ok ? amount.value : 0,
      pricingMode: "fixed",
      category: isCredit ? "Discount/Credit" : str(line.category, 40) || "Fee",
      percentageEligible: line.percentageEligible !== false,
      internalNotes: str(line.internalReason || line.internalNotes, 500)
    });
  }

  const discounts = Array.isArray(options.discounts) ? options.discounts : [];
  for (let i = 0; i < discounts.length; i += 1) {
    const line = discounts[i] || {};
    const kind = str(line.kind || line.type, 40).toLowerCase();
    const label = str(line.label || line.name || line.customerDescription);
    const amountField = `options.discounts[${i}].amount`;
    const amount = parseAmountDollars(
      line.amount ?? line.unitPrice ?? line.unit_price,
      amountField
    );
    if (!label) {
      issues.push({
        field: `options.discounts[${i}].label`,
        message: "Label is required for discounts/credits"
      });
    }
    if (!amount.ok) issues.push({ field: amountField, message: amount.error });
    rows.push({
      id: stableId("disc", line.id),
      commercialRole:
        kind === "credit" ? STUDIO_COMMERCIAL_ROLES.CREDIT : STUDIO_COMMERCIAL_ROLES.DISCOUNT,
      name: label || `Discount ${i + 1}`,
      customerDescription: label || `Discount ${i + 1}`,
      quantity: 1,
      unitPrice: amount.ok ? Math.abs(amount.value) : 0,
      pricingMode: "fixed",
      category: "Discount/Credit",
      percentOfBase:
        line.percentOfBase != null && Number.isFinite(Number(line.percentOfBase))
          ? Number(line.percentOfBase)
          : null,
      percentageEligible: false,
      internalNotes: str(line.internalReason || line.internalNotes, 500)
    });
  }

  const internalLines = Array.isArray(options.internalLines) ? options.internalLines : [];
  for (let i = 0; i < internalLines.length; i += 1) {
    const line = internalLines[i] || {};
    const reason = str(
      line.internalReason || line.reason || line.internalNotes || line.internalDescription || line.label,
      500
    );
    const amountField = `options.internalLines[${i}].amount`;
    const amount = parseAmountDollars(
      line.amount ?? line.unitPrice ?? line.unit_price,
      amountField
    );
    if (!reason) {
      issues.push({
        field: `options.internalLines[${i}].internalReason`,
        message: "Internal reason is required for internal-only lines"
      });
    }
    if (!amount.ok) issues.push({ field: amountField, message: amount.error });
    rows.push({
      id: stableId("int", line.id),
      commercialRole: STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY,
      name: reason || `Internal ${i + 1}`,
      customerDescription: reason || `Internal ${i + 1}`,
      internalDescription: reason,
      internalNotes: reason,
      quantity: 1,
      unitPrice: amount.ok ? amount.value : 0,
      pricingMode: "fixed",
      category: "Other",
      customerFacing: false,
      percentageEligible: false
    });
  }

  const hidden = Array.isArray(options.hiddenCustomerImpactingLines)
    ? options.hiddenCustomerImpactingLines
    : [];
  for (let i = 0; i < hidden.length; i += 1) {
    const line = hidden[i] || {};
    const reason = str(
      line.internalReason || line.reason || line.internalNotes || line.internalDescription,
      500
    );
    const safeLabel = str(line.customerSafeLabel || line.customerDescription || line.label || line.name);
    const amountField = `options.hiddenCustomerImpactingLines[${i}].amount`;
    const amount = parseAmountDollars(
      line.amount ?? line.unitPrice ?? line.unit_price,
      amountField
    );
    if (!reason) {
      issues.push({
        field: `options.hiddenCustomerImpactingLines[${i}].internalReason`,
        message: "Internal reason is required for hidden customer-impacting lines"
      });
    }
    if (!amount.ok) issues.push({ field: amountField, message: amount.error });
    // Canonical: legacy_hidden_customer_charge affects customer total without public naming.
    rows.push({
      id: stableId("hid", line.id),
      commercialRole: STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE,
      name: safeLabel || reason || `Hidden ${i + 1}`,
      customerDescription: safeLabel || reason || `Hidden ${i + 1}`,
      internalDescription: reason,
      internalNotes: reason,
      quantity: 1,
      unitPrice: amount.ok ? amount.value : 0,
      pricingMode: "fixed",
      category: str(line.category, 40) || "Fee",
      customerFacing: false,
      percentageEligible: false
    });
  }

  // Reject unsupported waterfall/vanity writes (read-only placeholders in V2).
  if (options.waterfalls != null && options.waterfalls?.available !== false) {
    const wf = options.waterfalls;
    if (Array.isArray(wf) ? wf.length : Array.isArray(wf?.items) && wf.items.length) {
      issues.push({
        field: "options.waterfalls",
        message: "Waterfall option editing is not yet available in Studio V2"
      });
    }
  }
  if (options.vanityProgram != null && options.vanityProgram?.available !== false) {
    const vp = options.vanityProgram;
    if (vp && typeof vp === "object" && (vp.selected != null || vp.programId != null || vp.enabled === true)) {
      issues.push({
        field: "options.vanityProgram",
        message: "Vanity Program editing is not yet available in Studio V2"
      });
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, rows };
}

/**
 * Normalize + validate options patch into scope.customLineItems merge.
 * Preserves non-commercial scope fields from existingScope.
 *
 * @param {{
 *   existingScope?: object,
 *   options?: object
 * }} args
 */
export function normalizeStudioV2OptionsPatch(args = {}) {
  const existingScope =
    args.existingScope && typeof args.existingScope === "object" ? args.existingScope : {};
  const options = args.options && typeof args.options === "object" ? args.options : args;

  const flat = flattenStudioV2OptionsPayload(options);
  if (!flat.ok) {
    return { ok: false, issues: flat.issues, scope: null, warnings: [] };
  }

  /** @type {object[]} */
  const issues = [];
  /** @type {object[]} */
  const customLineItems = [];

  for (let i = 0; i < flat.rows.length; i += 1) {
    const raw = flat.rows[i];
    const amountRaw = raw?.unitPrice ?? raw?.unit_price ?? raw?.amount;
    if (amountRaw != null && amountRaw !== "") {
      const n = Number(amountRaw);
      if (!Number.isFinite(n) || Number.isNaN(n)) {
        issues.push({
          field: `customLineItems[${i}].unitPrice`,
          message: "Amount must be a finite number"
        });
        continue;
      }
    }

    const normalized = normalizeStudioCommercialLine(
      {
        ...raw,
        id: stableId("cli", raw?.id || raw?.lineKey)
      },
      i
    );
    if (!normalized) {
      issues.push({
        field: `customLineItems[${i}]`,
        message: "Line could not be normalized"
      });
      continue;
    }

    const role = normalized.commercialRole;
    const reason = str(normalized.internalNotes || normalized.internalDescription, 500);

    if (
      role === STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY ||
      role === STUDIO_COMMERCIAL_ROLES.ABSORBED
    ) {
      if (!reason) {
        issues.push({
          field: `customLineItems[${i}].internalNotes`,
          message: "Internal reason is required for internal-only lines"
        });
      }
    }
    if (
      role === STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE ||
      role === STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE_HIDDEN_DETAIL
    ) {
      if (!reason) {
        issues.push({
          field: `customLineItems[${i}].internalNotes`,
          message: "Internal reason is required for hidden customer-impacting lines"
        });
      }
    }
    if (
      role === STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE ||
      role === STUDIO_COMMERCIAL_ROLES.DISCOUNT ||
      role === STUDIO_COMMERCIAL_ROLES.CREDIT
    ) {
      if (!str(normalized.customerDescription || normalized.name)) {
        issues.push({
          field: `customLineItems[${i}].name`,
          message: "Label is required for customer-facing lines"
        });
      }
    }

    customLineItems.push(normalized);
  }

  if (issues.length) {
    return { ok: false, issues, scope: null, warnings: [] };
  }

  const nextScope = {
    ...existingScope,
    customLineItems
  };

  return {
    ok: true,
    issues: [],
    warnings: [],
    scope: nextScope,
    customLineItems
  };
}
