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

export const ROOM_PRICING_SNAPSHOT_VERSION = "v1";
export const COUNTERTOP_BACKSPLASH_PRICING_SOURCE = "published_allocation_v1";
export const ADD_ONS_NOT_ATTRIBUTABLE = "not_currently_attributable";

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
 *   customerDisplayTotalCents: number,
 *   createdAt?: string|null
 * }} args
 */
export function buildRoomPricingPublishSnapshot(args) {
  const rooms = Array.isArray(args?.rooms) ? args.rooms : [];
  const totalCents = Math.round(Number(args?.customerDisplayTotalCents));
  if (!Number.isFinite(totalCents)) {
    throw new Error("buildRoomPricingPublishSnapshot requires a finite customerDisplayTotalCents");
  }

  const geometries = rooms.map(normalizeGeometry);
  const roomWeights = geometries.map((g) => g.countertopSf + g.backsplashSf);
  const roomShares = rooms.length ? allocateProportionally(totalCents, roomWeights) : [];

  const roomSnapshots = rooms.map((room, idx) => {
    const geometry = geometries[idx];
    const roomTotalCents = roomShares[idx] ?? 0;
    const [countertopAmountCents, backsplashAmountCentsRaw] = allocateProportionally(roomTotalCents, [
      geometry.countertopSf,
      geometry.backsplashSf
    ]);
    const originalBacksplashMode = resolveOriginalBacksplashMode({
      backsplashHeightMode: room?.backsplashHeightMode,
      backsplashSf: geometry.backsplashSf
    });
    const backsplashAmountCents = geometry.backsplashSf > 0 ? backsplashAmountCentsRaw : 0;
    const addOnsAmountCents = 0;

    return {
      roomId: String(room?.id || room?.roomKey || slugRoomId(room?.name, idx)),
      roomName: String(room?.name || room?.roomName || `Room ${idx + 1}`),
      countertopAmountCents,
      backsplashAmountCents,
      addOnsAmountCents,
      roomTotalCents: countertopAmountCents + backsplashAmountCents + addOnsAmountCents,
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

  const roomSubtotalCents = roomSnapshots.reduce((s, r) => s + r.roomTotalCents, 0);
  const projectAddOnsCents = 0;
  const governedProjectAdjustmentsCents = 0;
  const subtotalCents = roomSubtotalCents + projectAddOnsCents + governedProjectAdjustmentsCents;

  return {
    snapshotVersion: ROOM_PRICING_SNAPSHOT_VERSION,
    // publicationId intentionally omitted — see module doc.
    estimateId: args?.estimateId ?? null,
    quoteNumber: args?.quoteNumber ?? null,
    revision: args?.revision ?? null,
    currency: "USD",
    rooms: roomSnapshots,
    roomSubtotalCents,
    projectAddOnsCents,
    governedProjectAdjustmentsCents,
    subtotalCents,
    taxCents: null,
    totalCents,
    reconciliationStatus: subtotalCents === totalCents ? "reconciled" : "failed",
    createdAt: args?.createdAt ?? null
  };
}
