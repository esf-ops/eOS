/**
 * Estimate Builder — canonical estimate document + smart item contracts.
 *
 * A quote is a collection of smart estimate items, optionally organized into rooms.
 * Items carry typed `inputs` per `itemType`; pricing is resolved server-side by
 * `estimateBuilderPricing.mjs` through existing eliteOS pricing engines. Nothing in this
 * module holds a price.
 *
 * Mirrors the TypeScript contracts in `app-estimate-builder/src/lib/estimateTypes.ts`.
 * @see docs/eliteos/FEATURE_DECISIONS.md — Estimate Builder head
 */

export const ESTIMATE_DOCUMENT_VERSION = 1;

export const PRICING_CHANNELS = Object.freeze(["direct", "wholesale"]);

/** Item provenance — aligns with AI Takeoff import states for future proposed-item review. */
export const ITEM_PROVENANCE = Object.freeze([
  "manually_added",
  "imported_unmodified",
  "imported_edited",
  "imported_excluded",
  "template",
  "duplicated"
]);

export const ITEM_SOURCE_KINDS = Object.freeze(["manual", "template", "ai_takeoff", "digital_estimate", "duplicate"]);

/**
 * Item type registry. Pricing strategies are explicit per type; a single estimate may mix any of them.
 * `accountingItem` is the future QuickBooks item-name mapping (eliteOS stays the pricing brain).
 */
export const ESTIMATE_ITEM_TYPES = Object.freeze({
  countertop: {
    label: "Countertop",
    strategies: ["elite_100", "out_of_collection"],
    defaultStrategy: "elite_100",
    accountingItem: "Countertops"
  },
  backsplash: {
    label: "Backsplash",
    strategies: ["standard", "full_height"],
    defaultStrategy: "standard",
    accountingItem: "Backsplash"
  },
  vanity: {
    label: "Vanity",
    strategies: ["vanity_program_2026"],
    defaultStrategy: "vanity_program_2026",
    accountingItem: "Vanity Tops"
  },
  cutout: {
    label: "Sink / Cutout",
    strategies: ["addon_catalog"],
    defaultStrategy: "addon_catalog",
    accountingItem: "Cutouts & Sinks"
  },
  outlet: {
    label: "Electrical Outlet Cutout",
    strategies: ["addon_catalog"],
    defaultStrategy: "addon_catalog",
    accountingItem: "Cutouts & Sinks"
  },
  edge: {
    label: "Edge / Fabrication Upgrade",
    strategies: ["edge_v2"],
    defaultStrategy: "edge_v2",
    accountingItem: "Fabrication Upgrades"
  },
  service: {
    label: "Trip / Service",
    strategies: ["service_catalog"],
    defaultStrategy: "service_catalog",
    accountingItem: "Services"
  },
  /** ESF plumbing / specialty catalog product (sink, faucet, accessory, installed specialty item). */
  product: {
    label: "Sink / Faucet / Accessory",
    strategies: ["esf_catalog"],
    defaultStrategy: "esf_catalog",
    accountingItem: "Sinks & Fixtures"
  },
  custom: {
    label: "Custom Item",
    strategies: ["custom_line"],
    defaultStrategy: "custom_line",
    accountingItem: "Custom"
  },
  /** Description-only line (QuickBooks-style note): prints on the proposal, never priced. */
  note: {
    label: "Note",
    strategies: ["text"],
    defaultStrategy: "text",
    accountingItem: null
  }
});

/** Cutout codes are production add-on ids (`PROTOTYPE_ADDON_UNIT_PRICES`); prices stay in quoteCalculator. */
export const CUTOUT_CODES = Object.freeze(["qty-sink", "qty-bar", "qty-cook", "qty-v-oval", "qty-v-rect", "qty-ss", "qty-blanco"]);
export const OUTLET_CODE = "qty-outlet";
export const VANITY_BOWL_CODES = Object.freeze(["qty-bar", "qty-v-oval", "qty-v-rect"]);

export const SERVICE_CODES = Object.freeze(["additional_trip", "tear_out"]);

/** Option names validated by quoteCalculator's v2 edge engine (rates live there). */
export const EDGE_MODES = Object.freeze(["upgraded", "mitered", "manual"]);
export const EDGE_UPGRADED_PROFILES = Object.freeze(["Small Ogee", "Crescent", "Knife"]);
export const EDGE_MITER_HEIGHTS = Object.freeze(["2-3in", "4in", "5in", "6in"]);

export const VANITY_SINK_TYPES = Object.freeze(["oval_white", "oval_bisque", "rectangular_white", "rectangular_bisque"]);
export const VANITY_TIERS = Object.freeze(["kitchen_over_35", "kitchen_under_35"]);

export const CUSTOM_ITEM_CATEGORIES = Object.freeze(["other", "labor", "fee", "sink", "faucet", "accessory", "credit"]);

export const DEFAULT_ROOM_SUGGESTIONS = Object.freeze([
  "Kitchen",
  "Island",
  "Primary Bath",
  "Bath 2",
  "Laundry",
  "Fireplace",
  "Bar",
  "Other"
]);

const MAX_ITEMS = 250;
const MAX_ROOMS = 60;

function str(v, max = 500) {
  if (v == null) return "";
  return String(v).trim().slice(0, max);
}

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nonNeg(v) {
  const n = num(v);
  return n == null ? null : Math.max(0, n);
}

function intQty(v, fallback = 1) {
  const n = num(v);
  if (n == null) return fallback;
  return Math.max(0, Math.floor(n));
}

function oneOf(v, allowed, fallback) {
  const s = str(v, 80);
  return allowed.includes(s) ? s : fallback;
}

function normalizeSource(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    kind: oneOf(src.kind, ITEM_SOURCE_KINDS, "manual"),
    provenance: oneOf(src.provenance, ITEM_PROVENANCE, "manually_added"),
    reference: src.reference != null ? str(src.reference, 200) || null : null
  };
}

/**
 * @param {string} itemType
 * @param {string} strategy
 * @param {Record<string, unknown>} raw
 */
function normalizeInputs(itemType, strategy, raw) {
  const i = raw && typeof raw === "object" ? raw : {};
  switch (itemType) {
    case "countertop":
      if (strategy === "out_of_collection") {
        // Documents saved before the slab-package calculator carried Custom Quote fields (slabWidthIn × slabHeightIn).
        const legacy = !("slabLengthIn" in i) && i.slabHeightIn != null;
        const override = nonNeg(i.slabQuantityOverride);
        const waste = nonNeg(i.wastePercent);
        return {
          sqft: nonNeg(i.sqft),
          materialName: str(i.materialName, 160),
          supplier: str(i.supplier, 160),
          slabLengthIn: legacy ? nonNeg(i.slabWidthIn) : nonNeg(i.slabLengthIn),
          slabWidthIn: legacy ? nonNeg(i.slabHeightIn) : nonNeg(i.slabWidthIn),
          costPerSlab: nonNeg(i.costPerSlab),
          wastePercent: waste == null ? null : Math.min(100, waste),
          slabQuantityOverride: override != null && override > 0 ? Math.floor(override) : null,
          overrideReason: str(i.overrideReason, 500)
        };
      }
      return {
        sqft: nonNeg(i.sqft),
        materialColorId: str(i.materialColorId, 120) || null,
        materialColorName: str(i.materialColorName, 160)
      };
    case "backsplash":
      return {
        sqft: nonNeg(i.sqft),
        materialSource: oneOf(i.materialSource, ["room_countertop", "explicit"], "room_countertop"),
        materialColorId: str(i.materialColorId, 120) || null,
        materialColorName: str(i.materialColorName, 160)
      };
    case "vanity":
      return {
        sizeCode: str(i.sizeCode, 20),
        qty: Math.max(1, intQty(i.qty, 1)),
        sinkType: oneOf(i.sinkType, VANITY_SINK_TYPES, "oval_white"),
        sideSplashQty: Math.min(2, intQty(i.sideSplashQty, 0)),
        extraTrips: intQty(i.extraTrips, 0),
        depthIn: nonNeg(i.depthIn),
        materialColorId: str(i.materialColorId, 120) || null,
        materialColorName: str(i.materialColorName, 160),
        tierOverride: i.tierOverride ? oneOf(i.tierOverride, VANITY_TIERS, null) : null,
        tierOverrideReason: str(i.tierOverrideReason, 500)
      };
    case "cutout":
      return { cutoutCode: oneOf(i.cutoutCode, CUTOUT_CODES, "qty-sink"), qty: intQty(i.qty, 1) };
    case "outlet":
      return { qty: intQty(i.qty, 1) };
    case "edge":
      return {
        edgeMode: oneOf(i.edgeMode, EDGE_MODES, "upgraded"),
        profile: str(i.profile, 80),
        linearFeet: nonNeg(i.linearFeet),
        miterHeight: str(i.miterHeight, 20),
        buildUpSqft: nonNeg(i.buildUpSqft),
        manualAmount: nonNeg(i.manualAmount),
        manualReason: str(i.manualReason, 500),
        customerLabel: str(i.customerLabel, 160)
      };
    case "service":
      return { serviceCode: oneOf(i.serviceCode, SERVICE_CODES, "additional_trip"), qty: intQty(i.qty, 1) };
    case "product":
      return { productId: str(i.productId, 200) || null, variantId: str(i.variantId, 200) || null, qty: Math.max(1, intQty(i.qty, 1)) };
    case "custom":
      return {
        description: str(i.description, 300),
        qty: num(i.qty) ?? 1,
        unit: str(i.unit, 20) || "ea",
        unitPrice: num(i.unitPrice),
        category: oneOf(i.category, CUSTOM_ITEM_CATEGORIES, "other"),
        customerFacing: i.customerFacing !== false,
        customerNote: str(i.customerNote, 1000),
        internalNote: str(i.internalNote, 2000)
      };
    case "note":
      return { text: str(i.text, 1000) };
    default:
      return {};
  }
}

/**
 * @param {Record<string, unknown>} raw
 * @param {number} idx
 * @param {Set<string>} roomIds
 */
export function normalizeEstimateItem(raw, idx = 0, roomIds = new Set()) {
  const r = raw && typeof raw === "object" ? raw : {};
  const itemType = str(r.itemType, 40);
  const def = ESTIMATE_ITEM_TYPES[itemType];
  if (!def) return null;
  const pricingStrategy = def.strategies.includes(str(r.pricingStrategy, 40)) ? str(r.pricingStrategy, 40) : def.defaultStrategy;
  const id = str(r.id, 80);
  if (!id) return null;
  const roomId = r.roomId != null && roomIds.has(String(r.roomId)) ? String(r.roomId) : null;
  return {
    id,
    roomId,
    itemType,
    pricingStrategy,
    sortOrder: Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : idx,
    label: str(r.label, 160),
    inputs: normalizeInputs(itemType, pricingStrategy, r.inputs),
    source: normalizeSource(r.source),
    createdAt: str(r.createdAt, 40) || null,
    updatedAt: str(r.updatedAt, 40) || null
  };
}

/**
 * Normalize an untrusted estimate document from the browser. Never trusts client prices.
 * @param {Record<string, unknown>} raw
 */
export function normalizeEstimateDocument(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const h = d.header && typeof d.header === "object" ? d.header : {};
  const rooms = (Array.isArray(d.rooms) ? d.rooms : [])
    .slice(0, MAX_ROOMS)
    .map((room, idx) => ({
      id: str(room?.id, 80),
      name: str(room?.name, 80) || `Room ${idx + 1}`,
      sortOrder: Number.isFinite(Number(room?.sortOrder)) ? Number(room.sortOrder) : idx
    }))
    .filter((room) => room.id);
  const roomIds = new Set(rooms.map((room) => room.id));
  const items = (Array.isArray(d.items) ? d.items : [])
    .slice(0, MAX_ITEMS)
    .map((it, idx) => normalizeEstimateItem(it, idx, roomIds))
    .filter(Boolean);
  return {
    version: ESTIMATE_DOCUMENT_VERSION,
    pricingChannel: oneOf(d.pricingChannel, PRICING_CHANNELS, "direct"),
    header: {
      customerName: str(h.customerName, 200),
      accountName: str(h.accountName, 200),
      customerEmail: str(h.customerEmail, 200),
      customerPhone: str(h.customerPhone, 60),
      projectName: str(h.projectName, 200),
      projectAddress: str(h.projectAddress, 300),
      city: str(h.city, 100),
      state: str(h.state, 40),
      zip: str(h.zip, 20),
      branch: str(h.branch, 60),
      branchCode: str(h.branchCode, 60),
      salesRep: str(h.salesRep, 120),
      salesRepCode: str(h.salesRepCode, 60),
      qbCustomerListId: str(h.qbCustomerListId, 60),
      preparedBy: str(h.preparedBy, 120),
      billToAddress: str(h.billToAddress, 500),
      county: str(h.county, 80),
      poNumber: str(h.poNumber, 60),
      customerMessage: str(h.customerMessage, 500),
      customerNotes: str(h.customerNotes, 4000),
      internalNotes: str(h.internalNotes, 4000)
    },
    rooms: rooms.sort((a, b) => a.sortOrder - b.sortOrder),
    items: items.sort((a, b) => a.sortOrder - b.sortOrder)
  };
}

/**
 * Duplicate-safe copy: new ids, provenance `duplicated`, no source references or production ids.
 * Templates use the same path (a template is just a document with items).
 * @param {ReturnType<typeof normalizeEstimateDocument>} doc
 * @param {() => string} newId
 * @param {{ provenance?: "duplicated" | "template", keepHeader?: boolean }} [opts]
 */
export function cloneEstimateDocument(doc, newId, opts = {}) {
  const provenance = opts.provenance ?? "duplicated";
  const roomMap = new Map();
  const rooms = doc.rooms.map((room) => {
    const id = newId();
    roomMap.set(room.id, id);
    return { ...room, id };
  });
  const items = doc.items.map((it) => ({
    ...it,
    id: newId(),
    roomId: it.roomId ? roomMap.get(it.roomId) ?? null : null,
    inputs: { ...it.inputs },
    source: { kind: provenance === "template" ? "template" : "duplicate", provenance, reference: null },
    createdAt: null,
    updatedAt: null
  }));
  return {
    ...doc,
    header: opts.keepHeader === false ? normalizeEstimateDocument({}).header : { ...doc.header },
    rooms,
    items
  };
}
