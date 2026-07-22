/**
 * DE.2B — structural validation + selection normalization (no production pricing).
 */

import { createHash } from "node:crypto";

export function canonicalJson(value) {
  return JSON.stringify(value, (_, v) => v);
}

export function hashCanonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * @param {{ groups: Array<Record<string, unknown>>, options: Array<Record<string, unknown>> }} envelopeGraph
 */
export function validateEnvelopeStructure(envelopeGraph) {
  const errors = [];
  const groups = Array.isArray(envelopeGraph.groups) ? envelopeGraph.groups : [];
  const options = Array.isArray(envelopeGraph.options) ? envelopeGraph.options : [];
  if (!groups.length) errors.push({ code: "missing_groups", message: "At least one group required" });
  if (!options.length) {
    errors.push({ code: "missing_options", message: "At least one option required" });
  }

  const groupIds = new Set(groups.map((g) => String(g.id || g.group_key || g.groupKey)));
  const optionKeys = new Set();
  for (const opt of options) {
    const key = String(opt.option_key || opt.optionKey || "");
    if (!key) errors.push({ code: "option_key_required", message: "option_key required" });
    if (optionKeys.has(key)) {
      errors.push({ code: "duplicate_option_key", message: `Duplicate option_key ${key}` });
    }
    optionKeys.add(key);
    const min = Number(opt.min_qty ?? opt.minQty ?? 0);
    const max = opt.max_qty ?? opt.maxQty;
    const def = Number(opt.default_qty ?? opt.defaultQty ?? 0);
    if (max != null && Number(max) < min) {
      errors.push({ code: "qty_bounds", message: `max_qty < min_qty for ${key}` });
    }
    if (def < min || (max != null && def > Number(max))) {
      errors.push({ code: "default_qty", message: `default_qty out of bounds for ${key}` });
    }
    if (opt.sell_price == null && opt.sellPrice == null && String(opt.customer_price_treatment || opt.customerPriceTreatment) === "absolute") {
      errors.push({ code: "sell_price_required", message: `sell_price required for absolute option ${key}` });
    }
  }

  const activeOptions = options.filter((o) => o.is_active_in_envelope !== false && o.isActiveInEnvelope !== false);
  if (groups.length && activeOptions.length < 1) {
    errors.push({ code: "no_active_options", message: "At least one active option required" });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Normalize client selection to allowlisted option_key → qty.
 * Rejects spoofed prices/rates/org/account fields.
 *
 * Unchanged frozen baseline / previously saved selections may remain even when
 * the envelope marks them review_required or the option row is temporarily
 * missing (canonical backsplash modes / prior saved keys only).
 *
 * @param {unknown} raw
 * @param {Array<Record<string, unknown>>} options
 * @param {{
 *   priorSelections?: Record<string, number>|null,
 *   allowCanonicalBacksplashOrphans?: boolean
 * }} [ctx]
 */
export function normalizeSelectionPayload(raw, options, ctx = {}) {
  const forbiddenCallerFields = [
    "organizationId",
    "organization_id",
    "sellPrice",
    "sell_price",
    "wholesale",
    "direct",
    "markup",
    "cost",
    "margin",
    "accountGroupId",
    "account_group_id",
    "partnerAccountId",
    "taxRate",
    "configuredTotal",
    "baselineTotal",
    "pricingPolicyVersion",
    "engineVersion"
  ];

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const f of forbiddenCallerFields) {
      if (Object.prototype.hasOwnProperty.call(raw, f)) {
        const err = new Error(`Caller must not supply authoritative field: ${f}`);
        err.code = "forbidden_caller_authority";
        err.statusCode = 400;
        throw err;
      }
    }
  }

  /** @type {Record<string, number>} */
  const selections =
    raw && typeof raw === "object" && raw.selections && typeof raw.selections === "object"
      ? raw.selections
      : raw && typeof raw === "object"
        ? raw
        : {};

  const priorSelections =
    ctx.priorSelections && typeof ctx.priorSelections === "object" ? ctx.priorSelections : {};
  const allowCanonicalBacksplashOrphans = ctx.allowCanonicalBacksplashOrphans !== false;

  const byKey = new Map(
    options.map((o) => [String(o.option_key || o.optionKey), o])
  );
  /** @type {Record<string, number>} */
  const normalized = {};
  for (const [key, qtyRaw] of Object.entries(selections)) {
    const opt = byKey.get(String(key));
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty)) {
      const err = new Error(`Invalid qty for ${key}`);
      err.code = "invalid_qty";
      err.statusCode = 400;
      throw err;
    }
    if (!opt) {
      if (!(qty > 0)) continue;
      const priorQty = Number(priorSelections[key] || 0);
      const mode = String(key).startsWith("backsplash:")
        ? String(key).split(":").slice(2).join(":")
        : "";
      const canonicalBs =
        allowCanonicalBacksplashOrphans &&
        String(key).startsWith("backsplash:") &&
        ["none", "standard_4in", "custom_height", "full_height"].includes(mode);
      if ((priorQty > 0 && qty === priorQty) || canonicalBs) {
        normalized[String(key)] = qty;
        continue;
      }
      const err = new Error(`Unknown option_key: ${key}`);
      err.code = "invalid_selection";
      err.statusCode = 422;
      err.selectionKey = String(key).slice(0, 160);
      err.restoreSavedState = true;
      throw err;
    }
    const min = Number(opt.min_qty ?? opt.minQty ?? 0);
    const max = opt.max_qty ?? opt.maxQty;
    if (qty < min || (max != null && qty > Number(max))) {
      const err = new Error(`Qty out of bounds for ${key}`);
      err.code = "qty_out_of_bounds";
      err.statusCode = 400;
      throw err;
    }
    const avail = String(opt.availability_state || opt.availabilityState || "active");
    if ((avail === "review_required" || avail === "unavailable") && qty > 0) {
      const included = Boolean(opt.included_in_baseline ?? opt.includedInBaseline);
      const defaultQty = Number(opt.default_qty ?? opt.defaultQty ?? 0) || 0;
      const priorQty = Number(priorSelections[key] || 0);
      const unchangedBaseline = included && defaultQty > 0 && qty === defaultQty;
      const unchangedSaved = priorQty > 0 && qty === priorQty;
      if (!unchangedBaseline && !unchangedSaved) {
        const err = new Error(`Option requires estimator review: ${key}`);
        err.code = "selection_unavailable";
        err.statusCode = 422;
        err.reason = "pricing_unavailable";
        err.restoreSavedState = true;
        throw err;
      }
    }
    normalized[String(key)] = qty;
  }

  /** Room already has a positive material selection (mutually exclusive per room). */
  function roomHasMaterialSelection(roomKey) {
    const prefix = `material:${roomKey}:`;
    return Object.entries(normalized).some(([k, q]) => k.startsWith(prefix) && Number(q) > 0);
  }

  function materialRoomKey(optionKey) {
    if (!String(optionKey).startsWith("material:")) return null;
    const parts = String(optionKey).split(":");
    return parts.length >= 3 ? parts[1] : null;
  }

  // Apply defaults for required / included when missing.
  // Never re-add a baseline material color when the customer already picked another
  // material for that room (canonical envelope option ID wins).
  for (const opt of options) {
    const key = String(opt.option_key || opt.optionKey);
    if (normalized[key] != null) continue;
    const def = Number(opt.default_qty ?? opt.defaultQty ?? 0);
    if (!(opt.required_selection || opt.requiredSelection || opt.included_in_baseline || opt.includedInBaseline)) {
      continue;
    }
    const roomKey = materialRoomKey(key);
    if (roomKey && roomHasMaterialSelection(roomKey)) continue;
    normalized[key] = def;
  }

  for (const opt of options) {
    const key = String(opt.option_key || opt.optionKey);
    if (!(opt.required_selection || opt.requiredSelection)) continue;
    if (Number(normalized[key]) > 0) continue;
    const roomKey = materialRoomKey(key);
    // Room-level material requirement satisfied by any positive material option.
    if (roomKey && roomHasMaterialSelection(roomKey)) continue;
    const err = new Error(`Required option missing: ${key}`);
    err.code = "required_option_missing";
    err.statusCode = 400;
    throw err;
  }

  const selectionHash = hashCanonical(normalized);
  return { selections: normalized, selectionHash };
}

/**
 * Reject body claims that try to set trusted server fields on create/update.
 * @param {Record<string, unknown>} body
 */
export function rejectSpoofedEnvelopeAuthority(body) {
  const forbidden = [
    "organizationId",
    "organization_id",
    "status",
    "activatedAt",
    "activated_at",
    "pricingPolicyFingerprint",
    "catalogFingerprint",
    "sourceCalculationEvidenceFingerprint",
    "baselineCustomerSnapshotHash",
    "baselinePricingEvidenceHash",
    "envelopeVersion",
    "rowVersion"
  ];
  for (const f of forbidden) {
    if (body && Object.prototype.hasOwnProperty.call(body, f) && f !== "publicationId" && f !== "publication_id") {
      // publicationId is an input reference but org/status/fingerprints are server-set
      if (
        [
          "organizationId",
          "organization_id",
          "status",
          "activatedAt",
          "activated_at",
          "pricingPolicyFingerprint",
          "catalogFingerprint",
          "sourceCalculationEvidenceFingerprint",
          "baselineCustomerSnapshotHash",
          "baselinePricingEvidenceHash"
        ].includes(f)
      ) {
        const err = new Error(`Caller must not supply ${f}`);
        err.code = "forbidden_caller_authority";
        err.statusCode = 400;
        throw err;
      }
    }
  }
}
