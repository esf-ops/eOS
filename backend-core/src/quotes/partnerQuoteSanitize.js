/**
 * Partner-safe DTO shaping — no wholesale/direct economics, raw rules, or internal diagnostics.
 *
 * Design: partner calculate response uses an ALLOWLIST for the snapshot field rather than a denylist.
 * Only explicitly listed fields are forwarded; new calculator fields are safe-by-default (excluded).
 *
 * Fields stripped from partner calculate response (non-exhaustive, allowlist enforces completeness):
 *   material_breakdown   — contains wholesaleSubtotal per room
 *   roomLines            — contains internal rate/wholesale per piece
 *   lineItemDetails      — raw per-line internal economics
 *   roomMeasurementSummaries — internal measurement diagnostics
 *   inputSummary         — internal input echo
 *   measurement_source   — internal source tag
 *   quoteInputMode       — internal UI mode
 *   lineItems            — raw line items (separate safe list returned at top level)
 *   internal_ui          — internal estimate UI state
 *   internal_estimate_math — internal economics detail
 *   ruleCount            — internal rule count
 *   totals.wholesale     — ESF wholesale subtotal
 *   totals.profit        — margin / profit value
 *   retailMarkupPercent  — internal markup config
 *   pricingStructure.*   — all fields except code and name
 */

/**
 * Partner-safe snapshot fields — ONLY these keys are forwarded to the partner calculate response.
 * pricingStructure is further reduced to {code, name} only.
 */
const PARTNER_SNAPSHOT_ALLOWLIST = new Set([
  "pricingStructure",
  "quote_source",
  "version"
]);

/**
 * @param {ReadonlyArray<{ partner_account_id: string, role: string, is_active?: boolean }>} accesses
 * @param {{ partnerAccountId?: string|null, partnerAccountSlug?: string|null, partnersById?: Map<string, { id: string, account_slug?: string|null }> }} selection
 * @returns {{ partnerAccountId: string, role: string }|{ error: string, code: string, allowedPartners?: Array<{ id: string, account_slug: string|null }> }}
 */
export function pickPartnerAccountFromAccesses(accesses, selection = {}) {
  const active = (accesses || []).filter((a) => a.is_active !== false);
  if (!active.length) {
    return { error: "No active partner account access for this organization.", code: "partner_access_denied" };
  }

  const partnersById = selection.partnersById || new Map();
  const requestedId = String(selection.partnerAccountId || "").trim() || null;
  const requestedSlug = String(selection.partnerAccountSlug || "").trim().toLowerCase() || null;

  if (active.length === 1 && !requestedId && !requestedSlug) {
    const row = active[0];
    return { partnerAccountId: String(row.partner_account_id), role: String(row.role || "partner_user") };
  }

  if (requestedId) {
    const match = active.find((a) => String(a.partner_account_id) === requestedId);
    if (!match) {
      return { error: "Partner account not in your access list.", code: "partner_account_forbidden" };
    }
    return { partnerAccountId: requestedId, role: String(match.role || "partner_user") };
  }

  if (requestedSlug) {
    for (const a of active) {
      const p = partnersById.get(String(a.partner_account_id));
      const slug = String(p?.account_slug || "").trim().toLowerCase();
      if (slug && slug === requestedSlug) {
        return { partnerAccountId: String(a.partner_account_id), role: String(a.role || "partner_user") };
      }
    }
    return { error: "Partner account slug not in your access list.", code: "partner_account_forbidden" };
  }

  const allowedPartners = active.map((a) => {
    const p = partnersById.get(String(a.partner_account_id));
    return { id: String(a.partner_account_id), account_slug: p?.account_slug ? String(p.account_slug) : null };
  });
  return {
    error: "Multiple partner accounts available; specify partnerAccountId or partnerAccountSlug.",
    code: "partner_account_selection_required",
    allowedPartners
  };
}

/**
 * @param {string} role
 */
export function partnerRoleAllowsCalculate(role) {
  return role === "partner_admin" || role === "partner_user";
}

/**
 * @param {string} role
 */
export function partnerRoleAllowsSubmit(role) {
  return role === "partner_admin" || role === "partner_user";
}

/**
 * Build the partner-safe snapshot using an allowlist — only PARTNER_SNAPSHOT_ALLOWLIST keys are kept.
 * pricingStructure is further reduced to {code, name}.
 * @param {Record<string, unknown>} calcSnapshot
 * @returns {Record<string, unknown>}
 */
function buildPartnerSafeSnapshot(calcSnapshot) {
  const src = calcSnapshot && typeof calcSnapshot === "object" ? calcSnapshot : {};
  /** @type {Record<string, unknown>} */
  const safe = {};
  for (const key of PARTNER_SNAPSHOT_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      safe[key] = src[key];
    }
  }
  if (safe.pricingStructure && typeof safe.pricingStructure === "object") {
    const ps = safe.pricingStructure;
    safe.pricingStructure = {
      code: (ps.code ?? null),
      name: (ps.name ?? null)
    };
  }
  return safe;
}

/**
 * @param {Record<string, unknown>} calcResult
 */
export function sanitizePartnerCalculateResponse(calcResult) {
  const safeSnap = buildPartnerSafeSnapshot(calcResult?.snapshot);

  const lineItems = Array.isArray(calcResult?.lineItems)
    ? calcResult.lineItems.map((ln) => ({
        item_name: ln.item_name,
        category: ln.category,
        room_name: ln.room_name,
        quantity: ln.quantity,
        unit_type: ln.unit_type,
        unit_price: ln.unit_price,
        line_subtotal: ln.line_subtotal
      }))
    : [];

  const structureLabel =
    calcResult?.pricing?.structureCode ??
    safeSnap.pricingStructure?.code ??
    null;

  return {
    ok: true,
    display: "partner_quote_safe",
    totals: {
      estimate_total: calcResult?.totals?.retail ?? null,
      estimated_sqft: calcResult?.totals?.estimated_sqft ?? null
    },
    lineItems,
    snapshot: safeSnap,
    warnings: calcResult?.warnings || [],
    pricing: {
      structure_label: structureLabel
    }
  };
}

/**
 * Assert that a partner calculate response object contains no internal economics fields.
 * Throws if any forbidden key is found anywhere in the top-level or snapshot.
 * Intended for use in tests and the leakage verification script.
 * @param {Record<string, unknown>} response — parsed JSON body from partner calculate
 */
export function assertNoInternalEconomicsInPartnerCalculate(response) {
  const FORBIDDEN_RESPONSE_KEYS = ["wholesale", "profit", "margin", "retailMarkupPercent", "material_breakdown"];
  const FORBIDDEN_SNAPSHOT_KEYS = [
    "wholesale",
    "profit",
    "margin",
    "retailMarkupPercent",
    "material_breakdown",
    "roomLines",
    "lineItemDetails",
    "roomMeasurementSummaries",
    "inputSummary",
    "measurement_source",
    "quoteInputMode",
    "internal_ui",
    "internal_estimate_math",
    "ruleCount"
  ];

  for (const k of FORBIDDEN_RESPONSE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(response, k)) {
      throw new Error(`Partner calculate response must not contain top-level key "${k}"`);
    }
  }
  const totals = response?.totals;
  if (totals && typeof totals === "object") {
    for (const k of ["wholesale", "profit", "margin"]) {
      if (Object.prototype.hasOwnProperty.call(totals, k)) {
        throw new Error(`Partner calculate response totals must not contain key "${k}"`);
      }
    }
  }
  const snap = response?.snapshot;
  if (snap && typeof snap === "object") {
    for (const k of FORBIDDEN_SNAPSHOT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(snap, k)) {
        throw new Error(`Partner calculate response snapshot must not contain key "${k}"`);
      }
    }
  }
}

/**
 * @param {Record<string, unknown>} row
 */
export function sanitizePartnerQuoteListRow(row) {
  return {
    id: row.id,
    quote_number: row.quote_number,
    quote_status: row.quote_status,
    customer_name: row.customer_name ?? null,
    project_name: row.project_name ?? null,
    grand_total: row.grand_total ?? null,
    estimated_sqft: row.estimated_sqft ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

/**
 * Full calculation snapshot for DB (internal economics allowed); strips client-only internal UI keys.
 * @param {Record<string, unknown>} calcSnapshot
 * @param {{ partnerAccountId: string, organizationId: string, createdByUserId: string }} meta
 */
export function buildPartnerPersistSnapshot(calcSnapshot, meta) {
  const base = calcSnapshot && typeof calcSnapshot === "object" ? { ...calcSnapshot } : {};
  delete base.internal_ui;
  return {
    ...base,
    partner_quote_foundation: { version: 1, ...meta }
  };
}
