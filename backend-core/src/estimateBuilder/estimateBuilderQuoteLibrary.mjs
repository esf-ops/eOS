/**
 * Estimate Builder → Quote Library compatibility serializer.
 *
 * Produces the artifacts `persistQuoteSubmission` / `replaceQuoteLinesAndRooms` already accept, so
 * Estimate Builder quotes land in `quote_headers` (quote_source `estimate_builder`) with no migration:
 *  - `saveBody`        → header columns + `quote_rooms` rows (room-level sqft rollups)
 *  - `calc`            → totals + one `quote_line_items` row per priced estimate item (line amounts already
 *                        include material use tax and the $5 round-up; notes are not line items)
 *  - `snapshotToStore` → `calculation_snapshot` holding the canonical item document, server pricing,
 *                        Quote Library `internal_ui` aliases, a v1 customer print snapshot (same contract as
 *                        `CustomerEstimateDocument` / `customerEstimatePrintSnapshot.js`), and the
 *                        QuickBooks-style proposal snapshot (`internal_ui.estimate_builder_proposal`).
 */

import { ESTIMATE_DOCUMENT_VERSION } from "./estimateBuilderContracts.mjs";
import { buildEstimateProposalSnapshot } from "./estimateBuilderProposal.mjs";

export const ESTIMATE_BUILDER_QUOTE_SOURCE = "estimate_builder";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Customer Estimate Summary rule (app-quote `roundCustomerDisplay`): positive rows ceil to $5; credits exact. */
function roundCustomerDisplay(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n < 0) return n;
  return Math.ceil(n / 5) * 5;
}

/**
 * Largest-remainder allocation of a $5-rounded target across rows (mirrors Internal Estimate's
 * `allocateCustomerDisplayFives`), so room area totals sum exactly to the displayed project total.
 * @param {number[]} exacts
 * @param {number} targetDisplay
 */
function allocateCustomerDisplayFives(exacts, targetDisplay) {
  const cleaned = exacts.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumExact = cleaned.reduce((a, b) => a + b, 0);
  const units = Math.round(Math.max(0, Math.round(targetDisplay)) / 5);
  if (!cleaned.length || sumExact <= 0 || units <= 0) return cleaned.map(() => 0);
  const raw = cleaned.map((e) => (e / sumExact) * units);
  const floors = raw.map((r) => Math.floor(r));
  const deficit = units - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floors[i] })).sort((a, b) => b.rem - a.rem);
  const out = floors.map((f) => f * 5);
  for (let k = 0; k < deficit; k++) out[order[k].i] += 5;
  return out;
}

const SUMMARY_ORDER = [
  "Countertops",
  "Backsplash",
  "Full height backsplash",
  "Vanity tops",
  "Sinks & cutouts",
  "Edge upgrades",
  "Services",
  "Additional items",
  "Credits"
];

const MATERIAL_CATEGORIES = new Set(["Countertops", "Backsplash", "Full height backsplash", "Vanity tops"]);

function roomNameFor(doc, roomId) {
  if (!roomId) return null;
  return doc.rooms.find((r) => r.id === roomId)?.name ?? null;
}

/**
 * Server-authored customer print snapshot (version 1). Internal-only custom items fold into the first
 * material row, matching Internal Estimate's customer PDF behavior.
 */
export function buildCustomerPrintSnapshot(doc, pricing, opts = {}) {
  const items = pricing.items.filter((r) => r.status === "priced");
  const docItems = new Map(doc.items.map((it) => [it.id, it]));
  const customerAmount = (r) => round2(r.amount);
  const isInternalOnly = (r) => r.itemType === "custom" && docItems.get(r.itemId)?.inputs?.customerFacing === false;

  const byCategory = new Map();
  let internalOnly = 0;
  for (const r of items) {
    if (isInternalOnly(r)) {
      internalOnly = round2(internalOnly + customerAmount(r));
      continue;
    }
    byCategory.set(r.customerCategory, round2((byCategory.get(r.customerCategory) ?? 0) + customerAmount(r)));
  }
  if (internalOnly !== 0) {
    const target = SUMMARY_ORDER.find((c) => MATERIAL_CATEGORIES.has(c) && byCategory.has(c)) ?? "Additional items";
    byCategory.set(target, round2((byCategory.get(target) ?? 0) + internalOnly));
  }
  const estimateSummaryRows = SUMMARY_ORDER.filter((c) => byCategory.has(c) && byCategory.get(c) !== 0).map((c) => ({
    key: c.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    label: c,
    displayAmount: roundCustomerDisplay(byCategory.get(c))
  }));
  const finalRounded = round2(estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0));

  const unassigned = items.filter((r) => !r.roomId && !isInternalOnly(r));
  const unassignedExact = round2(unassigned.reduce((s, r) => s + customerAmount(r), 0));
  const unassignedDisplay = roundCustomerDisplay(unassignedExact);

  const roomGroups = doc.rooms
    .map((room) => ({ room, roomItems: items.filter((r) => r.roomId === room.id && !isInternalOnly(r)) }))
    .filter((g) => g.roomItems.length);
  // Area totals are the customer-facing authority and must reconcile with the summary total (same
  // largest-remainder $5 allocation Internal Estimate uses); material is derived as area − add-ons.
  const areaTotals = allocateCustomerDisplayFives(
    roomGroups.map((g) => g.roomItems.reduce((s, r) => s + customerAmount(r), 0)),
    Math.max(0, finalRounded - unassignedDisplay)
  );
  const roomAreaPrintRows = roomGroups.map(({ room, roomItems }, idx) => {
    const material = roomItems.filter((r) => MATERIAL_CATEGORIES.has(r.customerCategory));
    const addOns = roomItems.filter((r) => !MATERIAL_CATEGORIES.has(r.customerCategory) && r.itemType !== "custom");
    const customs = roomItems.filter((r) => r.itemType === "custom");
    const displayedAreaTotal = areaTotals[idx] ?? 0;
    const displayedAddOns =
      addOns.reduce((s, r) => s + roundCustomerDisplay(customerAmount(r)), 0) +
      customs.reduce((s, r) => s + roundCustomerDisplay(customerAmount(r)), 0);
    let displayedMaterial = displayedAreaTotal - displayedAddOns;
    if (displayedMaterial < 0) displayedMaterial = roundCustomerDisplay(material.reduce((s, r) => s + customerAmount(r), 0));
    const firstTop = material.find((r) => r.itemType === "countertop" || r.itemType === "vanity");
    const vanity = roomItems.find((r) => r.itemType === "vanity");
    return {
      roomId: room.id,
      displayName: room.name,
      isVanity: Boolean(vanity),
      vanityProgramLabel: vanity ? vanity.description : undefined,
      materialGroup: firstTop?.details?.find((d) => d.label === "Price group")?.value ?? "",
      colorLabel: firstTop ? firstTop.description.replace(/ countertop$/, "").replace(/^.* — /, "") : undefined,
      displayedMaterial,
      displayedAddOns,
      displayedAreaTotal,
      addonLines: addOns.map((r) => ({ label: r.quantity > 1 ? `${r.description} × ${r.quantity}` : r.description })),
      customerCustomLines: customs.map((r) => ({ lineKey: r.itemId, name: r.description, amountExact: customerAmount(r) })),
      customerNoteLines: customs
        .map((r) => String(docItems.get(r.itemId)?.inputs?.customerNote || "").trim())
        .filter(Boolean)
    };
  });

  const firstTop = items.find((r) => r.itemType === "countertop");
  const h = doc.header;
  return {
    version: 1,
    finalRounded,
    header: {
      estimateDate: opts.estimateDate ?? new Date().toISOString().slice(0, 10),
      quoteNumber: opts.quoteNumber ?? "",
      accountName: h.accountName || null,
      customerName: h.customerName || null,
      projectName: h.projectName || null,
      projectAddress: h.projectAddress || null,
      city: h.city || null,
      state: h.state || null,
      branch: h.branch || null,
      salesRep: h.salesRep || null,
      primaryGroup: firstTop?.details?.find((d) => d.label === "Price group")?.value ?? null,
      primaryColorLabel: firstTop ? firstTop.description.replace(/ countertop$/, "") : null,
      colorTbd: false
    },
    display: {
      estimateSummaryRows,
      finalRounded,
      showRoomBreakdown: roomAreaPrintRows.length > 1,
      roomAreaPrintRows,
      unassignedExact,
      unassignedDisplayTotal: unassignedDisplay,
      roomComparisonTable: null,
      customerFacingNoteLines: String(h.customerNotes || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      preparedByDisplayName: h.preparedBy || ""
    }
  };
}

/**
 * @param {ReturnType<import("./estimateBuilderContracts.mjs").normalizeEstimateDocument>} doc
 * @param {Awaited<ReturnType<import("./estimateBuilderPricing.mjs").priceEstimateDocument>>} pricing
 * @param {{ quoteNumber?: string, estimateDate?: string, pricedAt?: string }} [opts]
 */
export function buildQuoteLibraryArtifacts(doc, pricing, opts = {}) {
  const h = doc.header;
  const priced = pricing.items.filter((r) => r.status === "priced");
  const total = pricing.totals.total;

  const sortIndex = new Map(doc.items.map((it, idx) => [it.id, idx]));
  const lineItems = priced
    .slice()
    .sort((a, b) => (sortIndex.get(a.itemId) ?? 0) - (sortIndex.get(b.itemId) ?? 0))
    .map((r, idx) => ({
      line_type: "estimate_item",
      category: r.itemType,
      item_code: r.itemCode ?? `${r.itemType}:${r.pricingStrategy}`,
      item_name: r.description,
      room_name: roomNameFor(doc, r.roomId),
      quantity: r.quantity,
      unit_type: r.unit,
      unit_price: r.quantity > 0 ? round2(r.amount / r.quantity) : r.amount,
      line_subtotal: r.amount,
      sort_order: idx
    }));

  const rooms = doc.rooms
    .map((room) => {
      const rs = priced.filter((r) => r.roomId === room.id);
      if (!rs.length) return null;
      const top = rs.find((r) => r.itemType === "countertop");
      return {
        name: room.name,
        materialColor: top ? top.description.replace(/ countertop$/, "") : null,
        materialGroup: top?.details?.find((d) => d.label === "Price group")?.value ?? null,
        countertopSqft: round2(rs.filter((r) => r.itemType === "countertop").reduce((s, r) => s + r.quantity, 0)),
        backsplashSqft: round2(rs.filter((r) => r.itemType === "backsplash").reduce((s, r) => s + r.quantity, 0)),
        measurementSource: "estimate_builder",
        metadata: { estimate_builder_room_id: room.id }
      };
    })
    .filter(Boolean);

  const materialBreakdown = priced
    .filter((r) => r.itemType === "countertop" || r.itemType === "backsplash")
    .map((r) => ({
      room: roomNameFor(doc, r.roomId) ?? "Project",
      piece: r.description,
      materialGroup: r.details.find((d) => d.label === "Price group")?.value ?? (r.pricingStrategy === "out_of_collection" ? "Out of Collection" : null),
      materialColor: r.description.replace(/ countertop$/, "").replace(/^.* — /, ""),
      sqft: r.quantity,
      ratePerSqft: r.rate,
      wholesaleSubtotal: r.exactAmount
    }));

  const estimatedSqft = round2(
    priced.filter((r) => r.itemType === "countertop" || r.itemType === "backsplash").reduce((s, r) => s + r.quantity, 0)
  );

  const printSnapshot = buildCustomerPrintSnapshot(doc, pricing, opts);
  const proposal = buildEstimateProposalSnapshot(doc, pricing, opts);

  const calc = {
    totals: { wholesale: total, retail: total, profit: 0, estimated_sqft: estimatedSqft },
    lineItems,
    snapshot: { material_breakdown: materialBreakdown, pricingStructure: null }
  };

  const snapshotToStore = {
    quote_source: ESTIMATE_BUILDER_QUOTE_SOURCE,
    lineItems,
    material_breakdown: materialBreakdown,
    totals: calc.totals,
    estimate_builder: {
      version: ESTIMATE_DOCUMENT_VERSION,
      document: doc,
      pricing: { items: pricing.items, totals: pricing.totals, readiness: pricing.readiness },
      priced_at: opts.pricedAt ?? new Date().toISOString()
    },
    internal_ui: {
      saved_via: "estimate_builder",
      internal_material_basis: doc.pricingChannel,
      customer_display_total: printSnapshot.finalRounded,
      customer_estimate_print_snapshot: printSnapshot,
      estimate_builder_proposal: proposal,
      customer_facing_notes: h.customerNotes || null,
      internal_notes: h.internalNotes || null,
      entered_by: h.preparedBy || null,
      job_info: {
        account: h.accountName || null,
        account_contact_email: h.customerEmail || null,
        account_contact_phone: h.customerPhone || null
      }
    }
  };

  const saveBody = {
    customer_name: h.customerName || null,
    customer_email: h.customerEmail || null,
    customer_phone: h.customerPhone || null,
    account_name: h.accountName || null,
    project_name: h.projectName || null,
    project_address: h.projectAddress || null,
    city: h.city || null,
    state: h.state || null,
    zip: h.zip || null,
    sales_rep: h.salesRep || null,
    branch: h.branch || null,
    entered_by: h.preparedBy || null,
    prepared_by: h.preparedBy || null,
    notes: h.customerNotes || null,
    rooms
  };

  return { saveBody, calc, snapshotToStore, printSnapshot, proposal };
}
