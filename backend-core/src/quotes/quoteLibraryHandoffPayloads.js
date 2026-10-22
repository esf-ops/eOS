/**
 * Structured handoff payloads for Quote Library (no Moraware/QuickBooks API calls).
 * Stored in `quote_handoff_documents.payload` when that table exists.
 */

import { createHash } from "node:crypto";

import {
  QUOTE_QB_STRONG_MATCH_SEEDS,
  inferConceptKeyFromLineItem,
  listStrongMatchSeedsForOrganization,
  resolveQbItemMapping
} from "./quoteQbCatalog/quoteQbItemMappingCatalog.js";

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
 * Stable hash of calculation_snapshot for handoff traceability (not a content-addressed store).
 * @param {unknown} snapshot
 */
export function hashCalculationSnapshot(snapshot) {
  try {
    const body = JSON.stringify(snapshot ?? null);
    return createHash("sha256").update(body).digest("hex");
  } catch {
    return null;
  }
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
  const materialBreakdown = Array.isArray(snap.material_breakdown) ? snap.material_breakdown : [];
  const estimateRooms = Array.isArray(iu.estimate_rooms) ? iu.estimate_rooms : [];
  const customLineItems = Array.isArray(iu.custom_line_items) ? iu.custom_line_items : [];
  const readiness = snap.readiness && typeof snap.readiness === "object" ? snap.readiness : null;
  const fileChecklist = snap.file_checklist && typeof snap.file_checklist === "object" ? snap.file_checklist : null;
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
        material_group: str(r.material_group),
        material_name: str(r.material_name)
      })),
      estimate_room_model: estimateRooms.slice(0, 40),
      material_color_breakdown: materialBreakdown.slice(0, 80)
    },
    materials_and_addons: {
      estimated_material_group: str(header?.estimated_material_group),
      sinks: str(iu?.sinks),
      cooktops: str(iu?.cooktops),
      cutouts: str(iu?.cutouts),
      backsplash: str(iu?.backsplash),
      tear_out: str(iu?.tear_out),
      custom_items: Array.isArray(iu?.custom_passthrough_items) ? iu.custom_passthrough_items : [],
      custom_line_items: customLineItems
    },
    readiness,
    file_references: fileChecklist,
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
 * @param {Record<string, unknown>} customLine
 * @param {ReadonlyArray<object>} mappings
 */
function enrichCustomLineForQb(customLine, mappings) {
  const conceptKey =
    inferConceptKeyFromLineItem({
      item_code: customLine?.lineKey || customLine?.category,
      item_name: customLine?.name,
      category: customLine?.category
    }) || null;
  const mapping = conceptKey ? resolveQbItemMapping(conceptKey, mappings) : null;
  const qty = n(customLine?.quantity);
  const rate = n(customLine?.unitPrice);
  const amount = qty != null && rate != null ? Math.round(qty * rate * 100) / 100 : null;
  return {
    name: str(customLine?.name),
    description: str(customLine?.description),
    category: str(customLine?.category),
    quantity: qty,
    rate,
    amount,
    customerFacing: customLine?.customerFacing !== false,
    internal_only: customLine?.customerFacing === false,
    eliteos_concept_key: conceptKey,
    mapped_qb_list_id: mapping?.qb_list_id ?? null,
    mapped_qb_full_name: mapping?.qb_full_name ?? null,
    pricing_source: mapping?.pricing_source ?? null
  };
}

/**
 * @param {Record<string, unknown>} line
 * @param {ReadonlyArray<object>} mappings
 */
function enrichPricedLineForQb(line, mappings) {
  const conceptKey = inferConceptKeyFromLineItem(line);
  const mapping = conceptKey ? resolveQbItemMapping(conceptKey, mappings) : null;
  return {
    name: str(line.item_name),
    category: str(line.category),
    item_code: str(line.item_code),
    quantity: n(line.quantity),
    unit_price: n(line.unit_price),
    rate: n(line.unit_price),
    amount: n(line.line_subtotal),
    line_total: n(line.line_subtotal),
    description: str(line.item_name),
    customerFacing: true,
    internal_only: false,
    eliteos_concept_key: conceptKey,
    mapped_qb_list_id: mapping?.qb_list_id ?? null,
    mapped_qb_full_name: mapping?.qb_full_name ?? null,
    pricing_source: mapping?.pricing_source ?? null
  };
}

/**
 * @param {Record<string, unknown>} header
 * @param {Record<string, unknown>} snapshot
 * @param {Array<Record<string, unknown>>} lineItems
 * @param {{
 *   organizationId?: string|null,
 *   organizationKey?: string|null,
 *   qbItemMappings?: ReadonlyArray<object>|null,
 *   mappingSource?: string|null
 * }} [opts]
 */
export function buildQuickBooksEntryDocPayload(header, snapshot, lineItems, opts = {}) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  const materialBreakdown = Array.isArray(snap.material_breakdown) ? snap.material_breakdown : [];
  const customLineItems = Array.isArray(iu.custom_line_items) ? iu.custom_line_items : [];

  const organizationKey = str(opts.organizationKey);
  const seedMappings = organizationKey
    ? listStrongMatchSeedsForOrganization(organizationKey, QUOTE_QB_STRONG_MATCH_SEEDS)
    : [];
  const mappings =
    Array.isArray(opts.qbItemMappings) && opts.qbItemMappings.length > 0
      ? opts.qbItemMappings
      : seedMappings;
  const mappingSource =
    str(opts.mappingSource) ||
    (Array.isArray(opts.qbItemMappings) && opts.qbItemMappings.length > 0
      ? "provided_mappings"
      : seedMappings.length > 0
        ? "phase0_strong_match_seeds"
        : "none");

  const enrichedLines = (lineItems || []).slice(0, 120).map((ln) => enrichPricedLineForQb(ln, mappings));
  const enrichedCustom = customLineItems.map((ln) => enrichCustomLineForQb(ln, mappings));

  return {
    doc_version: 2,
    doc_type: "quickbooks_entry",
    title: "QuickBooks entry — accounting checklist",
    // Identity / future EstimateAdd inputs (no write in Phase 0)
    quote_id: str(header?.id),
    quote_number: str(header?.quote_number),
    revision: n(header?.revision_number),
    revision_label: str(header?.revision_label),
    organization_id: str(opts.organizationId) || str(header?.organization_id),
    account_directory_id: str(header?.account_directory_account_id),
    calculation_snapshot_hash: hashCalculationSnapshot(snap),
    qb_mapping_source: mappingSource,
    qb_write_enabled: false,
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
      tax_terms_placeholder: "Tax/terms — confirm with finance when posting.",
      material_color_breakdown: materialBreakdown.slice(0, 120),
      // Backward-compatible: original custom_line_items array retained
      custom_line_items: customLineItems,
      // Phase 0 enrichment for future Estimate lines
      custom_line_items_enriched: enrichedCustom
    },
    operations: {
      branch: str(header?.branch),
      sales_rep: str(header?.sales_rep),
      salesperson: str(header?.sales_rep),
      entered_by: str(header?.prepared_by)
    },
    // Backward-compatible summary (legacy fields preserved)
    line_items_summary: enrichedLines.map((ln) => ({
      name: ln.name,
      category: ln.category,
      qty: ln.quantity,
      unit_price: ln.unit_price,
      line_total: ln.line_total,
      // Additive enrichment (ignored by older consumers)
      eliteos_concept_key: ln.eliteos_concept_key,
      mapped_qb_list_id: ln.mapped_qb_list_id,
      mapped_qb_full_name: ln.mapped_qb_full_name,
      pricing_source: ln.pricing_source,
      rate: ln.rate,
      amount: ln.amount,
      description: ln.description,
      customerFacing: ln.customerFacing,
      internal_only: ln.internal_only
    })),
    // Explicit Estimate-oriented lines (same enrichment, clearer name)
    estimate_candidate_lines: enrichedLines,
    notes:
      "QuickBooks automation is future-only — accounting uses this summary for manual entry. Phase 0 adds ListID mapping metadata; no EstimateAdd is sent.",
    missing_field_warnings: warningsFrom(header, snap)
  };
}
