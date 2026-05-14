/**
 * Structured handoff payloads for Quote Library (no Moraware/QuickBooks API calls).
 * Stored in `quote_handoff_documents.payload` when that table exists.
 */

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function str(v) {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

function warningsFrom(header, snapshot) {
  const w = [];
  if (!str(header?.customer_name)) w.push("Customer name missing");
  if (!str(header?.project_name)) w.push("Project name missing");
  if (!str(header?.city) && !str(header?.state)) w.push("City/state missing");
  if (!str(header?.branch)) w.push("Branch missing");
  if (!str(header?.sales_rep)) w.push("Sales rep missing");
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  if (!snap?.totals && !header?.grand_total) w.push("Totals snapshot thin — verify calculation_snapshot");
  return w;
}

/**
 * @param {Record<string, unknown>} header — quote_headers row
 * @param {Record<string, unknown>} snapshot — calculation_snapshot
 * @param {Array<Record<string, unknown>>} rooms
 * @param {Array<Record<string, unknown>>} lineItems
 */
export function buildMorawareEntryDocPayload(header, snapshot, rooms, lineItems) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  return {
    doc_version: 1,
    doc_type: "moraware_entry",
    title: "Moraware job entry — staff checklist",
    account: str(header?.account_name) || str(header?.customer_name) || str(header?.project_name),
    customer: {
      name: str(header?.customer_name),
      email: str(header?.customer_email),
      phone: str(header?.customer_phone)
    },
    project: {
      name: str(header?.project_name),
      address: str(header?.project_address),
      city: str(header?.city),
      state: str(header?.state),
      zip: str(header?.zip)
    },
    operations: {
      branch: str(header?.branch),
      sales_rep: str(header?.sales_rep),
      entered_by: str(header?.prepared_by),
      quote_number: str(header?.quote_number),
      sold_date: new Date().toISOString().slice(0, 10)
    },
    measurements: {
      estimated_sqft: n(header?.estimated_sqft),
      summary: str(snap?.inputSummary) || null,
      rooms: (rooms || []).map((r) => ({
        name: str(r.room_name),
        countertop_sqft: n(r.countertop_sqft),
        backsplash_sqft: n(r.backsplash_sqft),
        material_group: str(r.material_group)
      }))
    },
    materials_and_addons: {
      estimated_material_group: str(header?.estimated_material_group),
      sinks: str(iu?.sinks),
      cooktops: str(iu?.cooktops),
      cutouts: str(iu?.cutouts),
      backsplash: str(iu?.backsplash),
      tear_out: str(iu?.tear_out),
      custom_items: Array.isArray(iu?.custom_passthrough_items) ? iu.custom_passthrough_items : []
    },
    line_items_summary: (lineItems || []).slice(0, 80).map((ln) => ({
      name: str(ln.item_name),
      category: str(ln.category),
      qty: n(ln.quantity),
      line_total: n(ln.line_subtotal)
    })),
    notes: "Moraware automation is future-only — staff creates the job manually using this checklist.",
    missing_field_warnings: warningsFrom(header, snap)
  };
}

/**
 * @param {Record<string, unknown>} header
 * @param {Record<string, unknown>} snapshot
 * @param {Array<Record<string, unknown>>} lineItems
 */
export function buildQuickBooksEntryDocPayload(header, snapshot, lineItems) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    doc_version: 1,
    doc_type: "quickbooks_entry",
    title: "QuickBooks entry — accounting checklist",
    account: str(header?.account_name) || str(header?.customer_name),
    customer: {
      name: str(header?.customer_name),
      email: str(header?.customer_email)
    },
    project: {
      name: str(header?.project_name),
      city: str(header?.city),
      state: str(header?.state)
    },
    financials: {
      quote_total: n(header?.grand_total),
      pricing_mode: str(snap?.internal_ui?.internal_material_basis),
      subtotal: n(header?.subtotal),
      markup_total: n(header?.markup_total),
      tax_total: n(header?.tax_total),
      tax_terms_placeholder: "Tax/terms — confirm with finance when posting."
    },
    line_items_summary: (lineItems || []).slice(0, 120).map((ln) => ({
      name: str(ln.item_name),
      category: str(ln.category),
      qty: n(ln.quantity),
      unit_price: n(ln.unit_price),
      line_total: n(ln.line_subtotal)
    })),
    notes: "QuickBooks automation is future-only — accounting uses this summary for manual entry.",
    missing_field_warnings: warningsFrom(header, snap)
  };
}
