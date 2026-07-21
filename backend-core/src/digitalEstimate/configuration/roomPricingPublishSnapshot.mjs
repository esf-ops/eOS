/**
 * DE.Polish-3 — immutable publish-time room pricing snapshot (sections 13-18).
 *
 * Captures a frozen, customer-facing room-level dollar breakdown
 * (Countertop / Backsplash / Add-ons / Room total) at the exact moment a
 * Digital Estimate is published, so the "Original" view never has to guess
 * at a per-room split from the (single, project-level) frozen total again.
 *
 * ---------------------------------------------------------------------------
 * STORAGE (section 18 — smallest safe design)
 * ---------------------------------------------------------------------------
 * This snapshot is stored as a new field (`roomPricing`) *inside* the
 * existing `customerSnapshot` object built by buildPublicationFreezePayloads
 * (digitalEstimateSnapshot.mjs), which is written verbatim into the existing
 * `customer_snapshot_json` column of `quote_publication_snapshots`. That
 * column is already:
 *   - immutable after insert (trg_quote_publication_snapshots_immutable
 *     blocks any UPDATE that changes customer_snapshot_json as a whole),
 *   - versioned per publication_id (1:1, unique),
 *   - hashed (customerSnapshotHash covers the whole object, including this
 *     field, since the hash is computed after this field is added).
 * No new table, no new column, and NO SQL MIGRATION is required — adding a
 * dedicated table/column would duplicate immutability/versioning guarantees
 * the existing table already provides for free.
 *
 * publicationId is intentionally omitted from the frozen payload: the
 * Postgres publish RPC (digital_estimate_publish_atomic) generates the
 * publication id with gen_random_uuid() *inside* the same transaction that
 * inserts this JSON, so the id does not exist yet when this payload is
 * built. It is never lost — callers already have it from the enclosing
 * `quote_publications` row — it is just not duplicated inside the immutable
 * blob. Changing the RPC to accept a pre-generated id was judged out of
 * scope / unnecessary risk to the publish transaction for this phase.
 *
 * ---------------------------------------------------------------------------
 * SOURCE AUTHORITY (sections 15-17)
 * ---------------------------------------------------------------------------
 * Countertop + Backsplash: tracing buildStudioEstimateRoomsForPublication
 * (Studio) and the legacy quote-platform estimate_rooms builder
 * (quoteCalculator.js) confirms neither ever stores a per-room DOLLAR
 * figure — only per-room square footage plus a single, project-level,
 * Brain-authoritative `customerDisplayTotal`. There is no "exact_room_pricing"
 * source available (section 15 option A). This module therefore always uses
 * the documented `published_allocation_v1` fallback (section 15 option B):
 * a two-stage, deterministic, integer-cent largest-remainder allocation
 * (see allocateProportionally) that is guaranteed to reconcile exactly to
 * `customerDisplayTotal` and is computed exactly once, at publish time, then
 * frozen forever — never recomputed on read, never silently redone.
 *   Stage 1: split the total across rooms by each room's combined
 *            (countertop + backsplash) SF weight.
 *   Stage 2: split each room's share between Countertop and Backsplash by
 *            that room's own countertop-SF vs. backsplash-SF weight.
 *
 * Add-ons (sink/faucet/accessories/edge/side-splash/specialty): the same
 * trace confirms there is no per-room original product dollar figure
 * anywhere upstream of this freeze boundary either — Studio/quote-platform
 * rooms carry SF + material + color only. Add-ons are therefore captured as
 * $0 at this baseline, explicitly marked `addOnsAttributionStatus:
 * "not_currently_attributable"` — never invented. This mirrors the exact
 * gap already documented for the Updated/Original projection in
 * FEATURE_DECISIONS.md §136 and is flagged again here as an open business
 * decision (capturing per-room original product prices would require a
 * Studio/Takeoff data model change, out of scope for this phase).
 */

import { allocateProportionally } from "./customerRoomPricingProjection.mjs";
import { resolveOriginalBacksplashMode } from "./backsplashPricingAuthority.mjs";
import {
  allocateInternalOnlyCustomLines,
  normalizeSnapshotCustomLines,
  INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION
} from "./internalCustomLineAllocation.mjs";
import { PROTOTYPE_ADDON_UNIT_PRICES } from "../../quotes/quoteCalculator.js";
import { dollarsToCents } from "./money.mjs";

/** Fabrication add-ons that freeze as named Original Add-ons / project lines. */
const ROOM_OWNED_FABRICATION_KEYS = Object.freeze({
  "qty-sink": { category: "sink_cutout", roomHint: /kitchen/i },
  "qty-bar": { category: "sink_cutout", roomHint: /bath|vanity|bar/i },
  "qty-ss": { category: "sink", roomHint: /kitchen/i },
  "qty-blanco": { category: "sink", roomHint: /kitchen/i },
  "qty-v-rect": { category: "sink", roomHint: /bath|vanity/i },
  "qty-v-oval": { category: "sink", roomHint: /bath|vanity/i },
  "qty-cook": { category: "cooktop", roomHint: /kitchen/i },
  "qty-outlet": { category: "outlet", roomHint: null }
});

/**
 * Normalize estimator fabrication add-ons into snapshot custom-line rows so
 * Original can render sink product / sink cutout / cooktop / tear-out by name.
 * Amounts use the same Brain unit prices the Studio calculator used at publish.
 *
 * @param {Record<string, number>|null|undefined} addOns
 * @param {Array<{ roomId: string, roomName: string, roomType?: string }>} rooms
 */
export function normalizeFabricationAddOnsForSnapshot(addOns, rooms = []) {
  const src = addOns && typeof addOns === "object" ? addOns : {};
  const out = [];
  let i = 0;
  for (const [key, qtyRaw] of Object.entries(src)) {
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
    if (qty <= 0) continue;
    const unit = PROTOTYPE_ADDON_UNIT_PRICES[key];
    if (!unit) continue;
    const ownership = ROOM_OWNED_FABRICATION_KEYS[key] || null;
    let roomId = null;
    let roomName = null;
    if (ownership) {
      const match =
        (ownership.roomHint &&
          rooms.find((r) => ownership.roomHint.test(String(r.roomName || r.roomType || "")))) ||
        rooms[0] ||
        null;
      if (match) {
        roomId = match.roomId;
        roomName = match.roomName;
      }
    }
    i += 1;
    out.push({
      lineKey: `fab-${key}-${i}`,
      label: unit.name,
      name: unit.name,
      amountCents: dollarsToCents(unit.price) * qty,
      customerFacing: true,
      customer_facing: true,
      roomId,
      roomName,
      category: ownership?.category || "fabrication",
      quantity: qty,
      unit: "ea"
    });
  }
  // When a cutout exists without an ESF sink product, freeze a customer-safe
  // $0 "Customer-provided sink" line so Original shows the sink product row.
  const hasCutout = Number(src["qty-sink"] || 0) > 0 || Number(src["qty-bar"] || 0) > 0;
  const hasEsfSink =
    Number(src["qty-ss"] || 0) > 0 ||
    Number(src["qty-blanco"] || 0) > 0 ||
    Number(src["qty-v-rect"] || 0) > 0 ||
    Number(src["qty-v-oval"] || 0) > 0;
  if (hasCutout && !hasEsfSink) {
    const kitchen =
      rooms.find((r) => /kitchen/i.test(String(r.roomName || r.roomType || ""))) || rooms[0] || null;
    out.push({
      lineKey: "fab-customer-provided-sink",
      label: "Customer-provided sink",
      name: "Customer-provided sink",
      amountCents: 0,
      customerFacing: true,
      customer_facing: true,
      roomId: kitchen?.roomId || null,
      roomName: kitchen?.roomName || null,
      category: "sink",
      quantity: 1,
      unit: "ea"
    });
  }
  return out;
}

/**
 * v2 (pricing-setup-scope-and-commercial-simplification): custom lines are now
 * frozen explicitly — customer-facing lines appear as named room/project
 * add-on lines; internal-only lines are absorbed into room Countertop /
 * Backsplash amounts by the versioned deterministic allocation policy
 * (internal_custom_line_allocation_v1) and the full audit trail is frozen in
 * `customLineAllocations`. v1 snapshots (no custom-line fields) remain valid
 * and are read with unchanged semantics.
 */
export const ROOM_PRICING_SNAPSHOT_VERSION = "v2";
export const COUNTERTOP_BACKSPLASH_PRICING_SOURCE = "published_allocation_v1";
export const ADD_ONS_NOT_ATTRIBUTABLE = "not_currently_attributable";
export { INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION };

function slugRoomId(name, index) {
  const base = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || `room-${index + 1}`;
}

function normalizeGeometry(room) {
  const countertopSf = Math.max(0, Number(room?.countertopSqft ?? room?.countertopSf) || 0);
  const backsplashSf = Math.max(0, Number(room?.backsplashSqft ?? room?.backsplashSf) || 0);
  return { countertopSf, backsplashSf };
}

/**
 * Build the immutable, frozen, room-level pricing snapshot for one
 * publication. Pure function — never reads from the database, never
 * recalculates a live price. Callers must pass the exact frozen geometry
 * (estimate_rooms) and the exact frozen Brain-authoritative total for this
 * publication; the result is deterministic given identical inputs.
 *
 * @param {{
 *   estimateId?: string|null,
 *   quoteNumber?: string|null,
 *   revision?: number|null,
 *   rooms?: Array<{
 *     id?: string, name?: string,
 *     countertopSqft?: number, backsplashSqft?: number,
 *     backsplashHeightMode?: string|null,
 *     materialGroup?: string|null, colorName?: string|null
 *   }>,
 *   customLineItems?: Array<object>|null,
 *   fabricationAddOns?: Record<string, number>|null,
 *   customerDisplayTotalCents: number,
 *   createdAt?: string|null,
 *   author?: string|null
 * }} args
 */
export function buildRoomPricingPublishSnapshot(args) {
  const rooms = Array.isArray(args?.rooms) ? args.rooms : [];
  const totalCents = Math.round(Number(args?.customerDisplayTotalCents));
  if (!Number.isFinite(totalCents)) {
    throw new Error("buildRoomPricingPublishSnapshot requires a finite customerDisplayTotalCents");
  }

  // Custom lines (frozen explicitly at publish, section 13/14/15):
  //  - customer-facing lines are carried by name — room-owned lines land on
  //    their room; project-owned lines become named project add-on lines.
  //  - internal-only lines are absorbed into the stone categories by the
  //    versioned deterministic policy below — never shown by name publicly.
  // customerDisplayTotalCents includes internal-only line dollars (the
  // customer pays them without seeing them named), so both kinds are carved
  // out of the SF-allocated stone pool and re-attached explicitly.
  //
  // Fabrication add-ons (sink cutout, ESF sink product, cooktop, tear-out)
  // are also frozen by name so Original can render the complete room
  // hierarchy the customer expects. Their dollars are carved out of the
  // stone pool the same way customer-facing custom lines are.
  const roomIdentity = rooms.map((room, idx) => ({
    roomId: String(room?.id || room?.roomKey || slugRoomId(room?.name, idx)),
    roomName: String(room?.name || room?.roomName || `Room ${idx + 1}`),
    roomType: String(room?.roomType || room?.type || "")
  }));
  const fabricationLines = normalizeSnapshotCustomLines(
    normalizeFabricationAddOnsForSnapshot(args?.fabricationAddOns, roomIdentity)
  );
  const allCustomLines = [
    ...normalizeSnapshotCustomLines(args?.customLineItems),
    ...fabricationLines
  ];
  const customerFacingLines = allCustomLines.filter((l) => l.customerFacing !== false);
  const customerFacingTotalCents = customerFacingLines.reduce((s, l) => s + l.amountCents, 0);
  const internalOnlyTotalCents = allCustomLines
    .filter((l) => l.customerFacing === false)
    .reduce((s, l) => s + l.amountCents, 0);

  // Stone pool = frozen total minus every custom line. The pool is SF-allocated
  // to rooms and split Countertop/Backsplash per room; custom-line dollars are
  // then re-attached (explicitly or absorbed) so nothing is counted twice.
  const stonePoolCents = totalCents - customerFacingTotalCents - internalOnlyTotalCents;

  const geometries = rooms.map(normalizeGeometry);
  const roomWeights = geometries.map((g) => g.countertopSf + g.backsplashSf);
  const roomShares = rooms.length ? allocateProportionally(stonePoolCents, roomWeights) : [];

  const roomSnapshots = rooms.map((room, idx) => {
    const geometry = geometries[idx];
    const roomStoneCents = roomShares[idx] ?? 0;
    const [countertopAmountCents, backsplashAmountCentsRaw] = allocateProportionally(roomStoneCents, [
      geometry.countertopSf,
      geometry.backsplashSf
    ]);
    const originalBacksplashMode = resolveOriginalBacksplashMode({
      backsplashHeightMode: room?.backsplashHeightMode,
      backsplashSf: geometry.backsplashSf
    });
    const backsplashAmountCents = geometry.backsplashSf > 0 ? backsplashAmountCentsRaw : 0;

    return {
      roomId: String(room?.id || room?.roomKey || slugRoomId(room?.name, idx)),
      roomName: String(room?.name || room?.roomName || `Room ${idx + 1}`),
      countertopAmountCents,
      backsplashAmountCents,
      addOnsAmountCents: 0,
      roomTotalCents: 0, // finalized below after custom-line attachment
      customerFacingLines: [],
      selectedMaterialLabel: room?.materialGroup ? String(room.materialGroup) : null,
      selectedMaterialGroup: room?.materialGroup ? String(room.materialGroup) : null,
      originalSinkLabel: null,
      originalFaucetLabel: null,
      originalEdgeLabel: null,
      originalBacksplashMode,
      reviewRequiredFlags: [],
      pricingSourceVersion: COUNTERTOP_BACKSPLASH_PRICING_SOURCE,
      addOnsAttributionStatus: ADD_ONS_NOT_ATTRIBUTABLE
    };
  });
  const roomsById = new Map(roomSnapshots.map((r) => [r.roomId, r]));
  const roomsByName = new Map(
    roomSnapshots.map((r) => [String(r.roomName).toLowerCase(), r])
  );

  // Customer-facing custom lines + fabrication add-ons: explicit, never hidden
  // inside stone totals.
  const projectAddOnLines = [];
  for (const line of customerFacingLines) {
    const room =
      (line.roomId && roomsById.get(String(line.roomId))) ||
      (line.roomName && roomsByName.get(String(line.roomName).toLowerCase())) ||
      null;
    const isFabrication = String(line.lineKey || "").startsWith("fab-");
    const frozen = {
      lineKey: line.lineKey,
      label: line.label,
      amountCents: line.amountCents,
      category: line.category || "custom",
      quantity: line.quantity,
      unit: line.unit,
      customerVisible: true,
      source: isFabrication ? "estimator_fabrication_addon" : "estimator_custom_line"
    };
    if (room) {
      room.customerFacingLines.push(frozen);
      room.addOnsAmountCents += line.amountCents;
      room.addOnsAttributionStatus = "published_fabrication_and_custom_lines_v1";
    } else {
      projectAddOnLines.push(frozen);
    }
  }

  // Internal-only custom lines: deterministic absorption into stone categories
  // (largest-remainder, integer cents) with a frozen audit trail. The base
  // stone amounts just allocated are the policy weights.
  const internalAllocation = allocateInternalOnlyCustomLines({
    lines: allCustomLines,
    rooms: roomSnapshots.map((r) => ({
      roomId: r.roomId,
      roomName: r.roomName,
      countertopAmountCents: r.countertopAmountCents,
      backsplashAmountCents: r.backsplashAmountCents
    })),
    author: args?.author ?? null,
    timestamp: args?.createdAt ?? null
  });
  for (const alloc of internalAllocation.allocations) {
    for (const target of alloc.targets) {
      const room = roomsById.get(String(target.roomId));
      if (!room) continue;
      if (target.category === "backsplash") room.backsplashAmountCents += target.allocatedCents;
      else room.countertopAmountCents += target.allocatedCents;
    }
  }

  for (const room of roomSnapshots) {
    room.roomTotalCents =
      room.countertopAmountCents + room.backsplashAmountCents + room.addOnsAmountCents;
  }

  const roomSubtotalCents = roomSnapshots.reduce((s, r) => s + r.roomTotalCents, 0);
  const projectAddOnsCents = projectAddOnLines.reduce((s, l) => s + l.amountCents, 0);
  const governedProjectAdjustmentsCents = 0;
  const internalAbsorbedCents = internalAllocation.totalAllocatedCents;
  // rooms (stone pool + absorbed internal) + explicit customer-facing lines +
  // any unresolved internal cents must equal the frozen total exactly.
  const subtotalCents =
    roomSubtotalCents + projectAddOnsCents + governedProjectAdjustmentsCents;
  const reconciled =
    subtotalCents + internalAllocation.unresolvedCents === totalCents;

  return {
    snapshotVersion: ROOM_PRICING_SNAPSHOT_VERSION,
    // publicationId intentionally omitted — see module doc.
    estimateId: args?.estimateId ?? null,
    quoteNumber: args?.quoteNumber ?? null,
    revision: args?.revision ?? null,
    currency: "USD",
    rooms: roomSnapshots,
    roomSubtotalCents,
    projectAddOnLines,
    projectAddOnsCents,
    governedProjectAdjustmentsCents,
    customLineAllocations: internalAllocation.allocations,
    customLineAllocationPolicyVersion: internalAllocation.policyVersion,
    internalAbsorbedCents,
    unresolvedInternalLines: internalAllocation.unresolved,
    unresolvedInternalCents: internalAllocation.unresolvedCents,
    subtotalCents,
    taxCents: null,
    totalCents,
    reconciliationStatus: !reconciled
      ? "failed"
      : internalAllocation.unresolved.length > 0
        ? "review_required"
        : "reconciled",
    createdAt: args?.createdAt ?? null
  };
}
