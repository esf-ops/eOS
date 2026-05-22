/**
 * Partner-safe DTO shaping — no wholesale/direct economics, raw rules, or internal diagnostics.
 */

const PARTNER_FORBIDDEN_SNAPSHOT_KEYS = [
  "inputSummary",
  "measurement_source",
  "quoteInputMode",
  "lineItems",
  "internal_ui",
  "internal_estimate_math",
  "ruleCount"
];

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
 * @param {Record<string, unknown>} calcResult
 */
export function sanitizePartnerCalculateResponse(calcResult) {
  const snap = calcResult?.snapshot && typeof calcResult.snapshot === "object" ? { ...calcResult.snapshot } : {};
  for (const k of PARTNER_FORBIDDEN_SNAPSHOT_KEYS) delete snap[k];
  if (snap.totals && typeof snap.totals === "object") {
    const t = { ...snap.totals };
    delete t.wholesale;
    delete t.profit;
    snap.totals = t;
  }
  if (snap.pricingStructure && typeof snap.pricingStructure === "object") {
    const ps = snap.pricingStructure;
    snap.pricingStructure = {
      code: ps.code ?? null,
      name: ps.name ?? null
    };
  }
  delete snap.retailMarkupPercent;

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

  return {
    ok: true,
    display: "partner_quote_safe",
    totals: {
      estimate_total: calcResult?.totals?.retail ?? null,
      estimated_sqft: calcResult?.totals?.estimated_sqft ?? null
    },
    lineItems,
    snapshot: snap,
    warnings: calcResult?.warnings || [],
    pricing: {
      structure_label: calcResult?.pricing?.structureCode ?? snap.pricingStructure?.code ?? null
    }
  };
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
