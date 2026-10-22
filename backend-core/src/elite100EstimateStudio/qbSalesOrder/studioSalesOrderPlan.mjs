/**
 * QuickBooks SALES ORDER plan from a Studio sold snapshot + its immutable acceptance.
 *
 * Source of truth: the room breakdown frozen at customer acceptance
 * (`customer_safe_snapshot_json.acceptedRoomPricing`) — the exact amounts the customer
 * saw and accepted. Nothing is recalculated; item lines must sum to the accepted total
 * in cents or the plan is blocked.
 *
 * Order shape (one order per acceptance):
 *   - per room: material item line for the room's accepted color (catalog material line,
 *     never inferred from the price group alone), a separate backsplash line when priced,
 *     a description-only note line (edge / backsplash / cutout), then each accepted add-on.
 *     Included $0 add-ons stay item lines at $0.
 *   - project lines; negative lines use the configured credit item.
 *   - an uncategorized $0 project line that repeats a priced room line is reported in
 *     `excludedLines` (never sent, never silently dropped).
 *
 * Every QuickBooks reference (item, class, template, terms, tax) comes from the
 * organization's central mapping by ListID. Anything the business has not decided is a
 * named blocker; nothing is defaulted by frequency or name similarity. Values marked
 * `source: "test_only_selection"` are allowed only when the caller says the target is a
 * TEST company (`allowTestOnlySelections`).
 *
 * Accepted-total reconciliation: an accepted-quote sync never adds sales tax on top of the
 * accepted total. If the configured tax policy would compute tax > 0, the plan is blocked.
 * A `synthetic_tax_scenario` plan is a separately keyed and labeled test artifact; it is
 * never sync-eligible.
 *
 * Pure — no I/O.
 */

import { createHash } from "node:crypto";

import { resolveRoomMaterialGroup } from "../studioMaterialInheritance.mjs";
import { resolvePublishedRoomColorName } from "../studioEstimatePublicationAdapter.mjs";
import {
  getElite100CustomerMaterial,
  slugifyElite100ColorName
} from "../../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";

export const STUDIO_SALES_ORDER_PLAN_VERSION = "studio-sales-order-plan-v2";

export const SALES_ORDER_PLAN_KIND = Object.freeze({
  ACCEPTED_SYNC: "accepted_sync",
  SYNTHETIC_TAX_SCENARIO: "synthetic_tax_scenario"
});

export const TEST_ONLY_SELECTION = "test_only_selection";

export const SALES_ORDER_LINE_ROLES = Object.freeze([
  "material",
  "backsplash",
  "fabrication",
  "plumbing_product",
  "credit",
  "project_service"
]);

const PRICE_GROUP_LABEL_BY_CODE = Object.freeze({
  promo: "Group Promo",
  group_a: "Group A",
  group_b: "Group B",
  group_c: "Group C",
  group_d: "Group D",
  group_e: "Group E",
  group_f: "Group F"
});

function str(v) {
  return v == null ? "" : String(v).trim();
}

function cents(v) {
  return Math.round((Number(v) || 0) * 100);
}

function sameText(a, b) {
  return str(a).toLowerCase().replace(/\s+/g, " ") === str(b).toLowerCase().replace(/\s+/g, " ");
}

/**
 * QuickBooks Desktop stores text in a Windows code page: typographic punctuation becomes ASCII,
 * other characters outside Latin-1 are dropped, so read-back compares exactly.
 */
export function qbDescription(text) {
  return str(text)
    .replace(/[\u2012-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00D7/g, "x")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4095);
}

function lineCents(add) {
  return add?.amountCents != null ? Math.round(Number(add.amountCents) || 0) : cents(add?.amount);
}

/** Deterministic idempotency key: one sales order per org + acceptance + QB company. */
export function studioSalesOrderIdempotencyKey({ organizationId, publicationId, acceptanceId, companyIdentity, scenarioLabel = null }) {
  const parts = ["so", str(organizationId), str(publicationId), str(acceptanceId), str(companyIdentity).toLowerCase()];
  if (scenarioLabel) parts.push("synthetic", str(scenarioLabel).toLowerCase());
  return parts.join(":");
}

/** RFC 4122-shaped GUID derived from the idempotency key (QuickBooks ExternalGUID). */
export function externalGuidFromKey(key) {
  const h = createHash("sha256").update(String(key)).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}}`.toUpperCase();
}

export function memoMarkerFromKey(key) {
  return `eos:${createHash("sha256").update(String(key)).digest("hex").slice(0, 16)}`;
}

/**
 * Accepted-breakdown category → `quote_qb_item_mappings.eliteos_concept_key`.
 * Room context separates kitchen and vanity cutouts, which are distinct QuickBooks items.
 */
export function salesOrderConceptKey(categoryKey, roomName = "") {
  const c = str(categoryKey).toLowerCase();
  const room = str(roomName).toLowerCase();
  if (c === "sink_cutout") {
    if (/\bbar\b/.test(room)) return "vanity_bar_sink_cutout";
    if (/bath|vanity|powder|lav/.test(room)) return "vanity_sink_cutout";
    return "kitchen_sink_cutout";
  }
  return (
    {
      cooktop: "cooktop_cutout",
      outlet: "electrical_outlet_cutout",
      popup_outlet: "popup_outlet_cutout",
      waterfall: "waterfall",
      tear_out: "tear_out",
      tearout: "tear_out",
      sink: "sink_product",
      faucet: "faucet_product",
      faucet_hole: "faucet_hole"
    }[c] || null
  );
}

const PLUMBING_CATEGORIES = new Set(["sink", "faucet"]);

/** Catalog model code at the start of an accepted sink label ("Sink — 3018UM16 Super Single…"). */
export function sinkModelFromLabel(label) {
  const rest = str(label).replace(/^sink\s*[—–-]\s*/i, "");
  const token = rest.split(/\s+/)[0] || "";
  return /^[A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*$/i.test(token) ? token.toUpperCase() : null;
}

function refOf(v) {
  if (!v || typeof v !== "object") return null;
  const listId = str(v.listId);
  const fullName = str(v.fullName ?? v.name);
  if (!listId && !fullName) return null;
  return { listId: listId || null, fullName: fullName || null, source: str(v.source) || "approved" };
}

function businessDate(iso, timeZone) {
  if (!iso || !timeZone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * @typedef {{ listId: string|null, fullName: string|null, source?: string }} QbRef
 * @typedef {{
 *   companyIdentity: string,
 *   timeZone?: string|null,
 *   memoStyle?: "estimate_prefix"|"eliteos",
 *   template?: QbRef|null,
 *   headerClass?: QbRef|null,
 *   terms?: QbRef|null,
 *   lineClassByRole?: Record<string, QbRef|"header">,
 *   material?: { conceptByMaterialLine?: Record<string,string>, conceptByPriceGroup?: Record<string,string>, customSlabConcept?: string|null },
 *   backsplash?: { conceptByMaterialConcept?: Record<string,string>, concept?: string|null },
 *   sink?: { conceptByModel?: Record<string,string>, fallbackConcept?: string|null },
 *   credit?: { concept?: string|null },
 *   taxPolicy?: {
 *     status: "approved"|"pending"|"test_only",
 *     source?: string,
 *     itemSalesTax?: QbRef & { ratePercent?: number },
 *     customerSalesTaxCode?: QbRef,
 *     lineSalesTaxCodeByRole?: Record<string, QbRef & { taxable?: boolean }>
 *   }|null,
 *   items: Record<string, { listId?: string|null, itemFullName?: string|null, source?: string }>
 * }} SalesOrderMapping
 */

/**
 * @param {{
 *   organizationId: string,
 *   soldSnapshot: { id: string, studio_estimate_id: string, acceptance_id: string, publication_id: string, sold_snapshot_json?: any },
 *   acceptance: { id: string, publication_id: string, accepted_at?: string|null, customer_display_total: number|string, customer_safe_snapshot_json?: any },
 *   mapping: SalesOrderMapping|null,
 *   customerJob: { fullName?: string|null, listId?: string|null }|null,
 *   quoteNumber?: string|null,
 *   allowTestOnlySelections?: boolean,
 *   scenario?: { kind: "synthetic_tax_scenario", label: string }|null
 * }} input
 */
export function buildStudioSalesOrderPlan(input) {
  /** @type {Array<{ code: string, message: string, [k: string]: any }>} */
  const blockers = [];
  /** @type {Array<{ code: string, message: string, [k: string]: any }>} */
  const warnings = [];
  const block = (code, message, extra = {}) => {
    if (!blockers.some((b) => b.code === code && b.message === message)) blockers.push({ code, message, ...extra });
  };

  const acceptance = input.acceptance || {};
  const sold = input.soldSnapshot || {};
  const mapping = input.mapping || null;
  const snap = acceptance.customer_safe_snapshot_json || {};
  const roomPricing = snap.acceptedRoomPricing || null;
  const configuration = snap.configuration || {};
  const scope = sold?.sold_snapshot_json?.scope || null;
  const acceptedTotalCents = cents(acceptance.customer_display_total);

  const synthetic = input.scenario?.kind === SALES_ORDER_PLAN_KIND.SYNTHETIC_TAX_SCENARIO;
  const scenarioLabel = synthetic ? str(input.scenario.label) : null;
  const kind = synthetic ? SALES_ORDER_PLAN_KIND.SYNTHETIC_TAX_SCENARIO : SALES_ORDER_PLAN_KIND.ACCEPTED_SYNC;
  if (synthetic && !scenarioLabel) block("synthetic_scenario_label_missing", "A synthetic tax scenario needs a label.");

  /** @type {Array<{ field: string, value: string }>} */
  const testOnlySelections = [];
  const noteSource = (field, ref) => {
    if (ref && ref.source === TEST_ONLY_SELECTION) {
      const value = ref.fullName || ref.itemFullName || ref.listId || "";
      if (!testOnlySelections.some((t) => t.field === field)) testOnlySelections.push({ field, value: str(value) });
    }
    return ref;
  };

  if (String(sold.acceptance_id || "") !== String(acceptance.id || "")) {
    block("acceptance_mismatch", "Sold snapshot does not belong to this acceptance.");
  }
  if (!mapping || !str(mapping.companyIdentity)) {
    block("qb_mapping_missing", "QuickBooks sales order mapping is not configured for this organization.");
  }
  if (!roomPricing || !Array.isArray(roomPricing.rooms)) {
    block(
      "accepted_breakdown_unavailable",
      "The accepted estimate has no frozen room breakdown (accepted before this was recorded, or it did not reconcile). Create the sales order manually or re-issue the estimate."
    );
  }
  const customerFullName = str(input.customerJob?.fullName);
  const customerListId = str(input.customerJob?.listId);
  if (!customerFullName && !customerListId) {
    block("qb_customer_job_unresolved", "Link this estimate's account to an existing QuickBooks customer:job before syncing.");
  }

  // ---- header references -------------------------------------------------------------
  const template = noteSource("template", refOf(mapping?.template));
  if (mapping && !template) block("template_unmapped", "Choose the QuickBooks sales order template in the central mapping.");
  const headerClass = noteSource("headerClass", refOf(mapping?.headerClass));
  if (mapping && !headerClass) {
    block(
      "branch_class_unresolved",
      "No QuickBooks class (branch) is configured for this sales order. The business must decide how the branch class is chosen."
    );
  }
  const terms = noteSource("terms", refOf(mapping?.terms));
  if (mapping && !terms) block("terms_unresolved", "Payment terms for sales orders are not decided in the central mapping.");

  const items = mapping?.items || {};
  const taxPolicy = mapping?.taxPolicy || null;
  const taxApproved = taxPolicy?.status === "approved";
  const taxTestOnly = taxPolicy?.status === "test_only" && str(taxPolicy?.source) === TEST_ONLY_SELECTION;
  if (mapping && !taxApproved && !taxTestOnly) {
    block("tax_policy_pending", "Sales-tax treatment for sales orders is pending bookkeeper approval.");
  }
  if (taxTestOnly) noteSource("taxPolicy", { fullName: "TEST-ONLY tax treatment (not approved)", source: TEST_ONLY_SELECTION });
  const itemSalesTax = taxPolicy ? refOf(taxPolicy.itemSalesTax) : null;
  const customerSalesTaxCode = taxPolicy ? refOf(taxPolicy.customerSalesTaxCode) : null;
  const taxRatePercent = taxPolicy?.itemSalesTax?.ratePercent != null ? Number(taxPolicy.itemSalesTax.ratePercent) : null;
  if (taxPolicy && (taxApproved || taxTestOnly)) {
    if (!itemSalesTax) block("tax_item_unmapped", "The tax policy has no QuickBooks sales tax item.");
    if (!customerSalesTaxCode) block("customer_tax_code_unmapped", "The tax policy has no customer sales tax code.");
  }

  function lineTaxCode(role) {
    const raw = taxPolicy?.lineSalesTaxCodeByRole?.[role];
    const ref = refOf(raw);
    if (!ref) {
      if (taxPolicy && (taxApproved || taxTestOnly)) {
        block("line_tax_code_unmapped", `The tax policy has no sales tax code for ${role} lines.`, { role });
      }
      return null;
    }
    return { ...ref, taxable: raw.taxable === true };
  }

  function lineClass(role) {
    if (role !== "plumbing_product") return headerClass;
    const configured = mapping?.lineClassByRole?.plumbing;
    if (configured === "header") return headerClass;
    const ref = noteSource("lineClass.plumbing", refOf(configured));
    if (!ref) {
      block(
        "plumbing_class_unresolved",
        "The business has not decided which class plumbing products (sinks, faucets) use on sales orders."
      );
    }
    return ref;
  }

  function resolveItem(concept, blockerCode, message) {
    const m = concept ? items[concept] : null;
    if (!m || (!str(m.listId) && !str(m.itemFullName))) {
      block(blockerCode, message, { concept: concept || null });
      return null;
    }
    const ref = { listId: str(m.listId) || null, itemFullName: str(m.itemFullName) || null, source: str(m.source) || "approved" };
    if (ref.source === TEST_ONLY_SELECTION) noteSource(`item.${concept}`, { fullName: ref.itemFullName, listId: ref.listId, source: ref.source });
    return ref;
  }

  /** @type {Array<any>} */
  const lines = [];
  /** @type {Array<any>} */
  const excludedLines = [];

  function pushItemLine({ role, concept, item, description, amountCents, source, included = false }) {
    const cls = lineClass(role);
    const tax = lineTaxCode(role);
    lines.push({
      lineNo: lines.length + 1,
      kind: "item",
      role,
      concept: concept || null,
      itemListId: item?.listId || null,
      itemFullName: item?.itemFullName || null,
      description: qbDescription(description),
      quantity: 1,
      amountCents,
      included,
      classListId: cls?.listId || null,
      classFullName: cls?.fullName || null,
      salesTaxCodeListId: tax?.listId || null,
      salesTaxCodeFullName: tax?.fullName || null,
      taxable: tax?.taxable === true,
      source
    });
  }

  function pushNoteLine(description, source) {
    lines.push({ lineNo: lines.length + 1, kind: "description_only", role: "note", description: qbDescription(description), source });
  }

  // ---- rooms -------------------------------------------------------------------------
  const scopeRooms = Array.isArray(scope?.rooms) ? scope.rooms.filter((r) => r && r.included !== false) : [];
  const acceptedRooms = roomPricing && Array.isArray(roomPricing.rooms) ? roomPricing.rooms : [];
  if (roomPricing && scopeRooms.length !== acceptedRooms.length) {
    block("room_identity_unresolved", "Accepted rooms do not line up with the sold scope rooms; room colors cannot be resolved.");
  }
  const roomLabels = []; // { roomName, label } for duplicate detection
  const colorsUsed = [];

  acceptedRooms.forEach((room, index) => {
    const roomName = str(room.roomName) || `Room ${index + 1}`;
    const scopeRoom = scopeRooms[index] || null;
    const roomId = scopeRoom && sameText(scopeRoom.name, roomName) ? str(scopeRoom.id) : null;
    if (scopeRoom && !roomId) {
      block("room_identity_unresolved", `Accepted room "${roomName}" does not match sold scope room "${str(scopeRoom.name)}".`);
    }
    const countertopCents = Number(room?.countertop?.amountCents) || 0;
    const backsplashCents = Number(room?.backsplash?.amountCents) || 0;
    const addOnLines = Array.isArray(room?.addOns?.lines) ? room.addOns.lines : [];

    // Color: the customer's accepted selection for this room, else the published color.
    let colorName = null;
    let colorId = null;
    let colorSource = null;
    const sel = configuration?.selectedMaterial;
    const selAppliesHere =
      sel && (str(sel.colorId) || str(sel.colorName)) && roomId && (str(sel.roomId) === roomId || (!str(sel.roomId) && acceptedRooms.length === 1));
    if (selAppliesHere) {
      colorName = str(sel.colorName) || null;
      colorId = str(sel.colorId) || null;
      colorSource = "customer_selection";
    } else if (scopeRoom && roomId) {
      if (str(scopeRoom.slabPackageId)) colorSource = "custom_slab";
      else {
        colorName = resolvePublishedRoomColorName({
          projectColorName: str(scope?.colorName) || null,
          room: scopeRoom,
          roomMaterial: resolveRoomMaterialGroup(scope, scopeRoom),
          slabPackageLabel: null
        });
        colorSource = colorName ? "published" : null;
      }
    }

    let materialConcept = null;
    let materialItem = null;
    let materialDesc = `${roomName} - countertops`;
    if (colorSource === "custom_slab") {
      materialConcept = str(mapping?.material?.customSlabConcept) || null;
      materialItem = resolveItem(
        materialConcept,
        "custom_slab_material_unmapped",
        `"${roomName}" uses a custom slab package; no QuickBooks material item is configured for custom slab rooms.`
      );
      materialDesc = `${roomName} - custom slab countertops`;
    } else if (!colorName && !colorId) {
      block("room_color_unresolved", `"${roomName}" has no accepted or published color; the QuickBooks material item cannot be chosen.`, { roomName });
    } else {
      const mat =
        (colorId && getElite100CustomerMaterial(colorId)) ||
        (colorName && getElite100CustomerMaterial(`e100-${slugifyElite100ColorName(colorName)}`)) ||
        null;
      if (!mat || mat.active === false) {
        block("color_not_in_catalog", `Color "${colorName || colorId}" in "${roomName}" is not an active Elite 100 catalog color.`, { roomName });
      } else {
        colorsUsed.push(mat.displayName);
        materialDesc = `${roomName} - ${mat.displayName} countertops`;
        const catalogGroup = PRICE_GROUP_LABEL_BY_CODE[mat.pricingGroupCode] || null;
        const acceptedGroup = str(room.selectedMaterial) || null;
        if (acceptedGroup && catalogGroup && !sameText(acceptedGroup, catalogGroup)) {
          const exception = scopeRoom?.priceGroupException;
          if (exception && sameText(exception.group, acceptedGroup)) {
            warnings.push({ code: "price_group_exception", message: `"${roomName}" priced at ${acceptedGroup} by documented exception (catalog ${catalogGroup}).`, roomName });
          } else {
            block(
              "color_price_group_conflict",
              `"${roomName}" was accepted at ${acceptedGroup} but ${mat.displayName} is a ${catalogGroup} color, with no documented price-group exception.`,
              { roomName }
            );
          }
        }
        const byGroup = mapping?.material?.conceptByPriceGroup || {};
        const byLine = mapping?.material?.conceptByMaterialLine || {};
        materialConcept = str(byGroup[mat.pricingGroupCode]) || str(byLine[str(mat.manufacturer)]) || null;
        materialItem = resolveItem(
          materialConcept,
          "material_line_unmapped",
          `No QuickBooks material item is configured for material line "${str(mat.manufacturer) || "unknown"}" (${mat.displayName}, ${catalogGroup || mat.pricingGroupCode}).`
        );
      }
    }
    pushItemLine({
      role: "material",
      concept: materialConcept,
      item: materialItem,
      description: materialDesc,
      amountCents: countertopCents,
      source: { kind: "room_material", roomName, roomId, colorSource }
    });

    if (backsplashCents) {
      const bConcept =
        str(mapping?.backsplash?.conceptByMaterialConcept?.[materialConcept || ""]) || str(mapping?.backsplash?.concept) || null;
      const bItem = resolveItem(bConcept, "backsplash_item_unmapped", `No QuickBooks item is configured for the backsplash in "${roomName}".`);
      pushItemLine({
        role: "backsplash",
        concept: bConcept,
        item: bItem,
        description: `${roomName} - ${str(room?.backsplash?.label) || "backsplash"}`,
        amountCents: backsplashCents,
        source: { kind: "room_backsplash", roomName, roomId }
      });
    }

    const edge = configuration?.selectedEdgeProfile;
    const edgeName =
      edge && str(edge.profileName) && (edge.estimateWide === true || (roomId && str(edge.roomId) === roomId)) ? str(edge.profileName) : str(room.selectedEdge);
    const noteParts = [];
    if (edgeName) noteParts.push(`${edgeName} edges`);
    if (!backsplashCents && str(room?.backsplash?.mode) === "none") noteParts.push("No backsplash");
    for (const add of addOnLines) {
      if (str(add.categoryKey) === "sink_cutout") noteParts.push(str(add.label) || "Sink cutout");
    }
    if (noteParts.length) pushNoteLine(`${roomName}: ${noteParts.join(" / ")}`, { kind: "room_note", roomName, roomId });

    for (const add of addOnLines) {
      const key = str(add.categoryKey) || null;
      const amountCents = lineCents(add);
      const label = str(add.label) || str(add.category) || "Add-on";
      roomLabels.push({ roomName, label, amountCents });
      const base = { kind: "room_addon", roomName, roomId, categoryKey: key };
      if (amountCents < 0) {
        const concept = str(mapping?.credit?.concept) || null;
        pushItemLine({ role: "credit", concept, item: resolveItem(concept, "credit_item_unmapped", "No QuickBooks item is configured for customer credits."), description: `${roomName} - ${label}`, amountCents, source: base });
        continue;
      }
      if (key && PLUMBING_CATEGORIES.has(key)) {
        let concept = salesOrderConceptKey(key, roomName);
        let message = `No QuickBooks item is configured for "${label}".`;
        if (key === "sink") {
          const model = sinkModelFromLabel(label);
          concept = (model && str(mapping?.sink?.conceptByModel?.[model])) || str(mapping?.sink?.fallbackConcept) || null;
          message = model
            ? `No QuickBooks item is configured for sink model ${model}; decide between a model-specific item and the parent sink item.`
            : `Sink "${label}" has no recognizable model code; choose its QuickBooks item.`;
        }
        pushItemLine({
          role: "plumbing_product",
          concept,
          item: resolveItem(concept, key === "sink" ? "sink_item_unmapped" : "qb_item_mapping_missing", message),
          description: label.replace(/^sink\s*[—–-]\s*/i, ""),
          amountCents,
          included: amountCents === 0,
          source: base
        });
        continue;
      }
      const concept = (key && (salesOrderConceptKey(key, roomName) || `addon:${key}`)) || null;
      pushItemLine({
        role: "fabrication",
        concept,
        item: resolveItem(concept, "qb_item_mapping_missing", `No QuickBooks item is configured for "${label}"${key ? ` (${key})` : ""}.`),
        description: label,
        amountCents,
        included: amountCents === 0,
        source: base
      });
    }

    const roomTotal = Number(room?.roomTotalDetail?.amountCents ?? cents(room.roomTotal));
    const roomLineSum = countertopCents + backsplashCents + addOnLines.reduce((s, a) => s + lineCents(a), 0);
    if (roomLineSum !== roomTotal) block("room_breakdown_mismatch", `Accepted breakdown for "${roomName}" does not add up to its room total.`);
  });

  // ---- project lines -----------------------------------------------------------------
  for (const add of roomPricing && Array.isArray(roomPricing.projectAddOns) ? roomPricing.projectAddOns : []) {
    const key = str(add.categoryKey) || null;
    const amountCents = lineCents(add);
    const label = str(add.label) || "Project item";
    const base = { kind: "project_addon", categoryKey: key };
    if (amountCents < 0) {
      const concept = str(mapping?.credit?.concept) || null;
      pushItemLine({ role: "credit", concept, item: resolveItem(concept, "credit_item_unmapped", "No QuickBooks item is configured for customer credits."), description: label, amountCents, source: base });
      continue;
    }
    if (amountCents === 0 && !key) {
      const twin = roomLabels.find((r) => r.amountCents !== 0 && sameText(r.label, label));
      if (twin) {
        excludedLines.push({
          description: label,
          amountCents: 0,
          reason: "duplicate_of_room_line",
          duplicateOf: { roomName: twin.roomName, label: twin.label, amountCents: twin.amountCents },
          explanation: `Uncategorized $0 project line repeats the priced "${twin.label}" line in ${twin.roomName}; not sent to QuickBooks.`
        });
        warnings.push({ code: "duplicate_project_line_excluded", message: `Excluded duplicate $0 project line "${label}" (priced in ${twin.roomName}).` });
        continue;
      }
      block("project_line_unclassified", `Project line "${label}" has no category; choose how it appears on the sales order.`);
      continue;
    }
    const concept = key ? salesOrderConceptKey(key) || `project:${key}` : null;
    pushItemLine({
      role: "project_service",
      concept,
      item: resolveItem(concept, key ? "qb_item_mapping_missing" : "project_line_unclassified", key ? `No QuickBooks item is configured for "${label}" (${key}).` : `Project line "${label}" has no category.`),
      description: label,
      amountCents,
      included: amountCents === 0,
      source: base
    });
  }

  // ---- totals and tax ----------------------------------------------------------------
  const itemLines = lines.filter((l) => l.kind === "item");
  const subtotalCents = itemLines.reduce((s, l) => s + l.amountCents, 0);
  if (roomPricing && subtotalCents !== acceptedTotalCents) {
    block(
      "accepted_total_mismatch",
      `Sales order lines total ${(subtotalCents / 100).toFixed(2)} but the accepted total is ${(acceptedTotalCents / 100).toFixed(2)}.`
    );
  }
  const taxableCents = itemLines.filter((l) => l.taxable).reduce((s, l) => s + l.amountCents, 0);
  let expectedSalesTaxCents = 0;
  if (taxableCents !== 0) {
    if (taxRatePercent == null || !Number.isFinite(taxRatePercent)) {
      block("tax_rate_unknown", "Lines are taxable but the sales tax item's rate is not recorded in the tax policy.");
    } else {
      expectedSalesTaxCents = Math.round((taxableCents * taxRatePercent) / 100);
    }
  }
  const expectedTotalCents = subtotalCents + expectedSalesTaxCents;
  if (!synthetic && expectedSalesTaxCents > 0) {
    block(
      "tax_would_increase_accepted_total",
      `The tax policy would add ${(expectedSalesTaxCents / 100).toFixed(2)} sales tax, raising the accepted ${(acceptedTotalCents / 100).toFixed(2)} to ${(expectedTotalCents / 100).toFixed(2)}. An accepted quote is never increased by the sales order.`
    );
  }

  if (testOnlySelections.length && input.allowTestOnlySelections !== true) {
    block(
      "test_only_selection_not_allowed",
      `Test-only mapping choices cannot be used outside a TEST company: ${testOnlySelections.map((t) => t.field).join(", ")}.`
    );
  }

  // ---- identity and memo -------------------------------------------------------------
  const idempotencyKey = studioSalesOrderIdempotencyKey({
    organizationId: input.organizationId,
    publicationId: acceptance.publication_id,
    acceptanceId: acceptance.id,
    companyIdentity: mapping?.companyIdentity || "",
    scenarioLabel
  });
  const quoteNumber = str(input.quoteNumber);
  const memoMarker = memoMarkerFromKey(idempotencyKey);
  const txnDate = businessDate(acceptance.accepted_at, str(mapping?.timeZone));
  const colorText = [...new Set(colorsUsed)].join(", ");
  let memo;
  if (synthetic) {
    memo = `SYNTHETIC TAX SCENARIO ${scenarioLabel} - not an accepted-quote sync${quoteNumber ? ` (${quoteNumber})` : ""} [${memoMarker}]`;
  } else if (mapping?.memoStyle === "estimate_prefix") {
    memo = `Estimate ${quoteNumber || "?"}:${colorText ? ` ${colorText}` : ""} accepted${txnDate ? ` ${txnDate}` : ""} [${memoMarker}]`;
  } else {
    memo = `eliteOS${quoteNumber ? ` ${quoteNumber}` : ""} accepted estimate [${memoMarker}]`;
  }

  const ok = blockers.length === 0;
  return {
    planVersion: STUDIO_SALES_ORDER_PLAN_VERSION,
    kind,
    scenarioLabel,
    ok,
    syncEligible: ok && !synthetic,
    blockers,
    warnings,
    testOnlySelections,
    idempotencyKey,
    externalGuid: externalGuidFromKey(idempotencyKey),
    memo,
    memoMarker,
    companyIdentity: str(mapping?.companyIdentity) || null,
    customer: { fullName: customerFullName || null, listId: customerListId || null },
    txnDate,
    template: template ? { listId: template.listId, fullName: template.fullName } : null,
    headerClass: headerClass ? { listId: headerClass.listId, fullName: headerClass.fullName } : null,
    terms: terms ? { listId: terms.listId, fullName: terms.fullName } : null,
    itemSalesTax: itemSalesTax ? { listId: itemSalesTax.listId, fullName: itemSalesTax.fullName, ratePercent: taxRatePercent } : null,
    customerSalesTaxCode: customerSalesTaxCode ? { listId: customerSalesTaxCode.listId, fullName: customerSalesTaxCode.fullName } : null,
    taxPolicyStatus: taxPolicy?.status || "missing",
    lines,
    excludedLines,
    subtotalCents,
    totalCents: subtotalCents,
    expectedSalesTaxCents,
    expectedTotalCents,
    acceptedTotalCents,
    source: {
      organizationId: input.organizationId,
      soldSnapshotId: sold.id || null,
      studioEstimateId: sold.studio_estimate_id || null,
      acceptanceId: acceptance.id || null,
      publicationId: acceptance.publication_id || null,
      acceptedAsConfigured: snap.acceptedAsConfigured === true
    }
  };
}
