/**
 * QuickBooks SALES ORDER plan from a Studio sold snapshot + its immutable acceptance.
 *
 * Source of truth: the room breakdown frozen at customer acceptance
 * (`customer_safe_snapshot_json.acceptedRoomPricing`) — the exact amounts the customer
 * saw and accepted. Nothing is recalculated here; lines must sum to the accepted
 * total in cents or the plan is blocked.
 *
 * Item / class / sales-tax-code / terms references come from the organization's
 * central QuickBooks mapping (never per quote). Sales-tax policy is an open business
 * decision: a line without an explicitly configured sales tax code blocks the plan
 * instead of guessing.
 *
 * Pure — no I/O.
 */

import { createHash } from "node:crypto";

export const STUDIO_SALES_ORDER_PLAN_VERSION = "studio-sales-order-plan-v1";

function str(v) {
  return v == null ? "" : String(v).trim();
}

function cents(v) {
  return Math.round((Number(v) || 0) * 100);
}

/** Deterministic idempotency key: one sales order per org + acceptance + QB company. */
export function studioSalesOrderIdempotencyKey({ organizationId, publicationId, acceptanceId, companyIdentity }) {
  return ["so", str(organizationId), str(publicationId), str(acceptanceId), str(companyIdentity).toLowerCase()].join(":");
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
 * @param {Record<string, any>} items central mapping items
 * @param {string[]} keys lookup order
 */
function resolveItem(items, keys) {
  for (const k of keys) {
    if (!k) continue;
    const m = items?.[k];
    if (m && (str(m.listId) || str(m.itemFullName))) return { key: k, ...m };
  }
  return null;
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
      faucet_hole: "faucet_hole"
    }[c] || null
  );
}

/**
 * @param {{
 *   organizationId: string,
 *   soldSnapshot: { id: string, studio_estimate_id: string, acceptance_id: string, publication_id: string, estimate_revision?: number, sold_snapshot_json?: any },
 *   acceptance: { id: string, publication_id: string, customer_display_total: number|string, customer_safe_snapshot_json?: any },
 *   mapping: {
 *     companyIdentity: string,
 *     termsFullName?: string|null,
 *     classFullName?: string|null,
 *     items: Record<string, { itemFullName: string, salesTaxCodeFullName?: string|null, classFullName?: string|null }>
 *   }|null,
 *   customerJob: { fullName?: string|null, listId?: string|null }|null,
 *   quoteNumber?: string|null
 * }} input
 */
export function buildStudioSalesOrderPlan(input) {
  /** @type {Array<{ code: string, message: string }>} */
  const blockers = [];
  const acceptance = input.acceptance || {};
  const sold = input.soldSnapshot || {};
  const mapping = input.mapping || null;
  const snap = acceptance.customer_safe_snapshot_json || {};
  const roomPricing = snap.acceptedRoomPricing || null;
  const acceptedTotalCents = cents(acceptance.customer_display_total);

  if (String(sold.acceptance_id || "") !== String(acceptance.id || "")) {
    blockers.push({ code: "acceptance_mismatch", message: "Sold snapshot does not belong to this acceptance." });
  }
  if (!mapping || !str(mapping.companyIdentity)) {
    blockers.push({
      code: "qb_mapping_missing",
      message: "QuickBooks item mapping is not configured for this organization."
    });
  }
  if (!roomPricing || !Array.isArray(roomPricing.rooms)) {
    blockers.push({
      code: "accepted_breakdown_unavailable",
      message:
        "The accepted estimate has no frozen room breakdown (accepted before this was recorded, or it did not reconcile). Create the sales order manually or re-issue the estimate."
    });
  }
  const customerFullName = str(input.customerJob?.fullName);
  const customerListId = str(input.customerJob?.listId);
  if (!customerFullName && !customerListId) {
    blockers.push({
      code: "qb_customer_job_unresolved",
      message: "Link this estimate's account to an existing QuickBooks customer:job before syncing."
    });
  }

  const items = mapping?.items || {};
  /** @type {Array<any>} */
  const lines = [];
  const unmapped = new Set();
  const untaxed = new Set();

  function pushLine({ lookup, description, amountCents, source }) {
    const item = resolveItem(items, lookup);
    if (!item) {
      unmapped.add(lookup.find(Boolean));
      return;
    }
    const salesTaxCodeFullName = str(item.salesTaxCodeFullName);
    if (!salesTaxCodeFullName) untaxed.add(item.key);
    lines.push({
      lineNo: lines.length + 1,
      mappingKey: item.key,
      itemListId: str(item.listId) || null,
      itemFullName: str(item.itemFullName) || null,
      classFullName: str(item.classFullName) || str(mapping?.classFullName) || null,
      salesTaxCodeFullName: salesTaxCodeFullName || null,
      description: description.slice(0, 4095),
      quantity: 1,
      amountCents,
      source
    });
  }

  if (roomPricing && Array.isArray(roomPricing.rooms)) {
    for (const room of roomPricing.rooms) {
      const roomName = str(room.roomName) || "Room";
      const countertopCents = Number(room?.countertop?.amountCents) || 0;
      const backsplashCents = Number(room?.backsplash?.amountCents) || 0;
      const addOnLines = Array.isArray(room?.addOns?.lines) ? room.addOns.lines : [];
      const material = str(room.selectedMaterial);
      const scopeParts = ["countertops"];
      if (backsplashCents) scopeParts.push(str(room?.backsplash?.label) || "backsplash");
      pushLine({
        lookup: ["installed_countertop_package", "room_material"],
        description: `${roomName} — ${material ? `${material} ` : ""}installed ${scopeParts.join(" and ").toLowerCase()}`,
        amountCents: countertopCents + backsplashCents,
        source: { kind: "room_material", roomName }
      });
      for (const add of addOnLines) {
        const key = str(add.categoryKey) || "other";
        const amountCents = Number(add.amountCents ?? cents(add.amount)) || 0;
        const concept = salesOrderConceptKey(key, roomName);
        pushLine({
          lookup:
            amountCents < 0
              ? [concept, `addon:${key}`, "customer_credit", "credit", "addon:*"]
              : [concept, `addon:${key}`, "addon:*"],
          description: `${roomName} — ${str(add.label) || str(add.category) || "Add-on"}`,
          amountCents,
          source: { kind: "room_addon", roomName, categoryKey: key }
        });
      }
      const roomTotal = Number(room?.roomTotalDetail?.amountCents ?? cents(room.roomTotal));
      const roomLineSum = countertopCents + backsplashCents + addOnLines.reduce((s, a) => s + (Number(a.amountCents ?? cents(a.amount)) || 0), 0);
      if (roomLineSum !== roomTotal) {
        blockers.push({
          code: "room_breakdown_mismatch",
          message: `Accepted breakdown for "${roomName}" does not add up to its room total.`
        });
      }
    }
    for (const add of Array.isArray(roomPricing.projectAddOns) ? roomPricing.projectAddOns : []) {
      const key = str(add.categoryKey) || "other";
      const amountCents = cents(add.amount);
      pushLine({
        lookup:
          amountCents < 0
            ? [salesOrderConceptKey(key), `project:${key}`, "customer_credit", "credit", "project:*"]
            : [salesOrderConceptKey(key), `project:${key}`, "project:*"],
        description: str(add.label) || "Project item",
        amountCents,
        source: { kind: "project_addon", categoryKey: key }
      });
    }
  }

  for (const key of unmapped) {
    blockers.push({
      code: "qb_item_mapping_missing",
      message: `No QuickBooks item is mapped for "${key}". Add it to the central QuickBooks mapping.`
    });
  }
  if (untaxed.size) {
    blockers.push({
      code: "sales_tax_code_unmapped",
      message: `Sales-tax treatment is not configured for: ${[...untaxed].join(", ")}. The sales-tax policy must be decided before these lines can sync.`
    });
  }

  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  if (roomPricing && !unmapped.size && totalCents !== acceptedTotalCents) {
    blockers.push({
      code: "accepted_total_mismatch",
      message: `Sales order lines total ${(totalCents / 100).toFixed(2)} but the accepted total is ${(acceptedTotalCents / 100).toFixed(2)}.`
    });
  }

  const idempotencyKey = studioSalesOrderIdempotencyKey({
    organizationId: input.organizationId,
    publicationId: acceptance.publication_id,
    acceptanceId: acceptance.id,
    companyIdentity: mapping?.companyIdentity || ""
  });
  const quoteNumber = str(input.quoteNumber);
  const memoMarker = memoMarkerFromKey(idempotencyKey);

  return {
    planVersion: STUDIO_SALES_ORDER_PLAN_VERSION,
    ok: blockers.length === 0,
    blockers,
    idempotencyKey,
    externalGuid: externalGuidFromKey(idempotencyKey),
    memo: `eliteOS${quoteNumber ? ` ${quoteNumber}` : ""} accepted estimate [${memoMarker}]`,
    memoMarker,
    companyIdentity: str(mapping?.companyIdentity) || null,
    customer: { fullName: customerFullName || null, listId: customerListId || null },
    termsFullName: str(mapping?.termsFullName) || null,
    classFullName: str(mapping?.classFullName) || null,
    lines,
    totalCents,
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
