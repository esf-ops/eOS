/**
 * DE.Polish-2 — authoritative room-level customer pricing projection.
 *
 * Pure, read-only decomposition layer. Never recalculates pricing, never
 * changes the frozen publication total or the elite100-config-delta-v2
 * configured total — it only regroups dollars the engine (or the immutable
 * published snapshot) has already produced, into a room-scannable shape:
 *
 *   Countertop + Backsplash + Add-ons = Room total
 *   sum(Room total) + project-level add-ons + governed adjustments = Project total
 *
 * Money is handled in integer cents throughout. Callers convert to dollars
 * only at the public/customer-safe boundary (toPublic*Dto below).
 *
 * IMPORTANT — traced pricing sources (see FEATURE_DECISIONS.md §136):
 *  - Room-owned + fully reconciled today: sink / sink cutout / faucet /
 *    accessories / edge upgrade / side splash / specialty (all carried as
 *    absolute per_each option lines whose optionKey already encodes the
 *    owning roomKey — see parseProductOptionKey / qty-sink / qty-bar / qty-ss).
 *  - Room-owned but NOT separately decomposed anywhere upstream: Countertop.
 *    `baselineExactTotalCents` (the frozen publication total the v2 engine
 *    anchors to) is a single project-level number — the engine never asked
 *    "how much of this was Kitchen vs. Powder Bath." A fresh SF x frozen-rate
 *    reprice of each room (materialSellCents + materialUseTaxCents) is *not*
 *    guaranteed to sum back to that opaque total (rates may have moved,
 *    the original quote may have used a negotiated figure, etc.) — proven
 *    directly by this module's own tests. Rather than silently pretend that
 *    coincidence into an "exact" number, this projection allocates the one
 *    authoritative baseline total across rooms by chargeable-SF weight
 *    (largest-remainder integer-cent method, so the shares always sum back
 *    to the exact total — see allocateProportionally) and then adds each
 *    room's exact, already-computed material delta on top. SF is used only
 *    as an internal allocation weight and is never exposed in any output.
 *    This is a *documented display allocation* of an unchanged, authoritative
 *    total — not a recalculation and not a new price — and every room is
 *    tagged attributionStatus: "proportional_allocation_of_baseline" so no
 *    caller mistakes it for a value read back out of the original invoice.
 *    In standalone/non-anchor mode (no frozen baseline at all) the engine's
 *    own absolute reprice *is* the authoritative figure, so this projection
 *    uses it directly (attributionStatus: "absolute_reprice").
 *  - Room-owned and now fully governed (DE.Polish-3): Backsplash. The
 *    calc engine (elite100ConfigDeltaEngineV2.mjs) prices the room's
 *    `backsplashConfiguredBilledSf` — resolved server-side from estimator-
 *    approved geometry only via backsplashPricingAuthority.mjs — at the
 *    room's own material rate, independently rounded from countertop. When
 *    billedSf cannot be resolved (missing geometry, unauthorized custom/full
 *    height, etc.) the engine reports `backsplashConfiguredAmountCents: null`
 *    and this projection surfaces that as `backsplashAmountCents: null` +
 *    a review-required item, never inventing a number.
 *  - Side splashes remain a distinct Add-ons line (see
 *    categoryForOptionKey / CATEGORY_BY_PARSED_KIND) — never folded into the
 *    Backsplash category, per the section-9 ownership rule confirmed in
 *    FEATURE_DECISIONS.md §137.
 *  - Not currently attributable to a room at all: the *original* (frozen,
 *    pre-Digital-Estimate) absolute countertop/backsplash dollar split.
 *    customer_estimate_print_snapshot only ever stores per-room square
 *    footage text and a flat, non-room-scoped lineItems/summaryRows list
 *    (digitalEstimateSnapshot.mjs) — there is no persisted per-room dollar
 *    figure to read back for the Original view. Legacy flat lines are mapped
 *    to a room only when the room's display name appears unambiguously in
 *    the line label (see mapLegacyLineToRoom); everything else stays
 *    project-level and is reported as unresolved.
 */

import { centsToDollars, dollarsToCents } from "./money.mjs";
import { parseProductOptionKey } from "../catalog/digitalEstimateProductOptions.mjs";
import { BACKSPLASH_REVIEW_CODES } from "./backsplashPricingAuthority.mjs";

/** Legacy/no-op cutout + stock-sink option key prefixes (never matched by parseProductOptionKey). */
const CUTOUT_KEY_PATTERN = /^(qty-sink|qty-bar|qty-ss):(.+)$/;
const UUID_TOKEN_PATTERN =
  /[0-9a-f]{8}[-\s][0-9a-f]{4}[-\s][1-5][0-9a-f]{3}[-\s][89ab][0-9a-f]{3}[-\s][0-9a-f]{12}/gi;

function customerSafeProjectionLabel(value, fallback = "Item") {
  const cleaned = String(value || "")
    .replace(UUID_TOKEN_PATTERN, "")
    .replace(/\brun\s+(?:id\s*)?[-—:]?\s*(?=$|[;—,])/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s—:;,]+|[\s—:;,]+$/g, "")
    .trim();
  return cleaned || fallback;
}

/** Plain-language labels for governed backsplash review codes (section 12). */
const BACKSPLASH_REVIEW_LABEL = Object.freeze({
  [BACKSPLASH_REVIEW_CODES.FULL_HEIGHT_MEASUREMENT_REQUIRED]: "Full-height backsplash",
  [BACKSPLASH_REVIEW_CODES.CUSTOM_HEIGHT_REVIEW]: "Custom-height backsplash",
  [BACKSPLASH_REVIEW_CODES.GEOMETRY_MISSING]: "Backsplash",
  [BACKSPLASH_REVIEW_CODES.REMOVAL_CREDIT_UNRESOLVED]: "Backsplash removal credit",
  [BACKSPLASH_REVIEW_CODES.HEIGHT_OUT_OF_RANGE]: "Custom-height backsplash"
});

const CATEGORY_BY_PARSED_KIND = Object.freeze({
  sink: "sink",
  faucet: "faucet",
  accessory: "accessories",
  specialty: "specialty",
  edge: "edge",
  sidesplash: "side_splash"
});

function categoryForOptionKey(optionKey) {
  const key = String(optionKey || "");
  const parsed = parseProductOptionKey(key);
  if (parsed?.roomKey) {
    return { roomKey: parsed.roomKey, category: CATEGORY_BY_PARSED_KIND[parsed.kind] || "custom" };
  }
  const cutoutMatch = key.match(CUTOUT_KEY_PATTERN);
  if (cutoutMatch) {
    return {
      roomKey: cutoutMatch[2],
      category: cutoutMatch[1] === "qty-ss" ? "sink" : "sink_cutout"
    };
  }
  return { roomKey: null, category: "custom" };
}

/**
 * Largest-remainder integer-cent allocation: splits `totalCents` across
 * `weights` proportionally, guaranteeing the shares sum back to exactly
 * `totalCents` (never a rounding-plug — the remainder is distributed one
 * cent at a time to the largest fractional remainders). Falls back to an
 * even split when every weight is zero/non-finite.
 * @param {number} totalCents
 * @param {number[]} weights
 * @returns {number[]}
 */
export function allocateProportionally(totalCents, weights) {
  const n = weights.length;
  if (n === 0) return [];
  const total = Math.trunc(Number(totalCents) || 0);
  const sumWeights = weights.reduce((s, w) => s + (Number.isFinite(w) && w > 0 ? w : 0), 0);

  if (!(sumWeights > 0)) {
    const base = Math.trunc(total / n);
    const shares = new Array(n).fill(base);
    let remainder = total - base * n;
    for (let i = 0; i < n && remainder !== 0; i++) {
      shares[i] += remainder > 0 ? 1 : -1;
      remainder += remainder > 0 ? -1 : 1;
    }
    return shares;
  }

  const raw = weights.map((w) => (total * (Number.isFinite(w) && w > 0 ? w : 0)) / sumWeights);
  const floors = raw.map((x) => Math.floor(x));
  const allocated = floors.reduce((s, x) => s + x, 0);
  let remainder = total - allocated;
  const byFrac = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const shares = [...floors];
  for (let k = 0; k < remainder && byFrac.length; k++) {
    shares[byFrac[k % byFrac.length].i] += 1;
  }
  return shares;
}

function applySelectedLabel(room, category, opt) {
  const label = opt.displayLabel || opt.optionKey;
  switch (category) {
    case "sink":
      if (!room.selectedSink) room.selectedSink = label;
      break;
    case "faucet":
      if (!room.selectedFaucet) room.selectedFaucet = label;
      break;
    case "accessories":
      room.selectedAccessories.push(label);
      break;
    case "edge":
      room.selectedEdge = label;
      break;
    case "specialty":
      room.selectedSpecialtyItems.push(label);
      break;
    default:
      break;
  }
}

/**
 * Build the Updated room pricing projection from an already-computed,
 * trusted elite100-config-delta-v2 result. Never invokes the calc engine —
 * the caller must have already called calculateElite100ConfigDeltaV2 (or
 * equivalent) and pass its `internal` object through unmodified.
 *
 * @param {{
 *   internal: Record<string, unknown>,
 *   reviewFlags?: string[],
 *   publishedRoomPricing?: Record<string, unknown>|null
 * }} args
 *   publishedRoomPricing — the immutable publish-time room pricing snapshot
 *   (roomPricingPublishSnapshot v2). When present, the Updated projection
 *   preserves the frozen custom-line treatment: explicit customer-facing
 *   lines stay explicit and internal-only allocations stay absorbed into the
 *   same room stone categories under the same frozen policy version — never
 *   re-derived under current pricing.
 */
export function buildUpdatedRoomPricingProjection(args) {
  const internal = args?.internal;
  if (!internal || typeof internal !== "object") {
    throw new Error("buildUpdatedRoomPricingProjection requires internal calculation result");
  }
  const reviewFlags = Array.isArray(args.reviewFlags) ? args.reviewFlags : [];
  const published =
    args?.publishedRoomPricing && typeof args.publishedRoomPricing === "object"
      ? args.publishedRoomPricing
      : null;

  const internalRooms = Array.isArray(internal.rooms) ? internal.rooms : [];
  const frozenBaselineAnchor = Boolean(internal.frozenBaselineAnchor);
  const baselineExactTotalCents =
    internal.baselineExactTotalCents != null ? Math.trunc(Number(internal.baselineExactTotalCents)) : null;

  // Countertop allocation:
  //  - anchor mode: split the one authoritative baseline total by chargeable-SF weight
  //    (never exposed), then add each room's exact material delta on top.
  //  - standalone mode: the engine's own absolute per-room reprice already *is* the
  //    authoritative figure — use it directly, no allocation needed.
  //
  // IMPORTANT (DE.Polish-3 fix): the frozen baseline total is a single opaque
  // project-level number produced by the legacy calculator, which already implicitly
  // included whatever backsplash dollars existed originally — this projection has no
  // way to know that decomposition on its own. Now that backsplash is *separately,
  // explicitly* priced via backsplashBaselineAmountCents/backsplashConfiguredAmountCents
  // (see elite100ConfigDeltaEngineV2.mjs), allocating the FULL baseline total to
  // "Countertop" and then ALSO adding the real backsplash line would double-count every
  // room's backsplash dollars. So the known baseline backsplash amount (when resolvable)
  // is subtracted out of the pool that gets SF-allocated to Countertop *before* the
  // backsplash line is added back separately — the two together still sum to exactly the
  // frozen baseline total, and the reconciliation invariant (room = countertop + backsplash
  // + add-ons) is never violated.
  const useProportionalAllocation = frozenBaselineAnchor && baselineExactTotalCents != null;
  const knownBaselineBacksplashCents = internalRooms.reduce(
    (s, r) => s + (r.backsplashBaselineAmountCents != null ? Math.trunc(Number(r.backsplashBaselineAmountCents)) : 0),
    0
  );

  // Frozen custom-line treatment (publish-time snapshot v2, anchor mode only):
  // both explicit customer-facing lines and absorbed internal-only allocations
  // are carved OUT of the SF-allocated countertop pool and re-attached to the
  // same rooms/categories they were frozen to — the total is unchanged, but
  // the policy (and the customer-visible line names) are preserved exactly.
  const engineRoomKeySet = new Set(internalRooms.map((r) => String(r.roomKey)));
  const engineRoomNameByKey = new Map(
    internalRooms.map((r) => [String(r.displayName || r.roomKey).toLowerCase(), String(r.roomKey)])
  );
  const resolveFrozenRoomKey = (roomId, roomName) => {
    if (roomId != null && engineRoomKeySet.has(String(roomId))) return String(roomId);
    const byName = roomName != null ? engineRoomNameByKey.get(String(roomName).toLowerCase()) : null;
    return byName || null;
  };
  /** @type {Array<{ roomKey: string|null, category: string, label: string, amountCents: number }>} */
  const frozenRoomCustomLines = [];
  /** @type {Array<{ label: string, amountCents: number }>} */
  const frozenProjectAddOnLines = [];
  /** @type {Array<{ roomKey: string, category: "countertop"|"backsplash", amountCents: number }>} */
  const frozenInternalTargets = [];
  if (useProportionalAllocation && published) {
    for (const snapRoom of Array.isArray(published.rooms) ? published.rooms : []) {
      for (const line of Array.isArray(snapRoom?.customerFacingLines) ? snapRoom.customerFacingLines : []) {
        const roomKey = resolveFrozenRoomKey(snapRoom.roomId, snapRoom.roomName);
        const frozen = {
          roomKey,
          category: String(line.category || "custom"),
          label: String(line.label || "Item"),
          amountCents: Math.trunc(Number(line.amountCents) || 0)
        };
        // Room disappeared from the engine result — keep the frozen line
        // explicit at project level rather than dropping dollars.
        if (roomKey == null) frozenProjectAddOnLines.push({ label: frozen.label, amountCents: frozen.amountCents });
        else frozenRoomCustomLines.push(frozen);
      }
    }
    for (const line of Array.isArray(published.projectAddOnLines) ? published.projectAddOnLines : []) {
      frozenProjectAddOnLines.push({
        label: String(line.label || "Item"),
        amountCents: Math.trunc(Number(line.amountCents) || 0)
      });
    }
    for (const alloc of Array.isArray(published.customLineAllocations) ? published.customLineAllocations : []) {
      const snapRooms = Array.isArray(published.rooms) ? published.rooms : [];
      for (const target of Array.isArray(alloc?.targets) ? alloc.targets : []) {
        const snapRoom = snapRooms.find((r) => String(r.roomId) === String(target.roomId)) || null;
        const roomKey = resolveFrozenRoomKey(target.roomId, snapRoom?.roomName);
        if (!roomKey) continue; // room disappeared — cents stay in the pool
        frozenInternalTargets.push({
          roomKey,
          category: target.category === "backsplash" ? "backsplash" : "countertop",
          amountCents: Math.trunc(Number(target.allocatedCents) || 0)
        });
      }
    }
  }
  const frozenRoomCustomLinesCents = frozenRoomCustomLines.reduce((s, l) => s + l.amountCents, 0);
  const frozenProjectAddOnCents = frozenProjectAddOnLines.reduce((s, l) => s + l.amountCents, 0);
  const frozenInternalCents = frozenInternalTargets.reduce((s, t) => s + t.amountCents, 0);
  const frozenInternalByRoomCategory = new Map();
  for (const target of frozenInternalTargets) {
    const key = `${target.roomKey}:${target.category}`;
    frozenInternalByRoomCategory.set(
      key,
      (frozenInternalByRoomCategory.get(key) || 0) + target.amountCents
    );
  }
  const frozenCountertopByRoom = new Map();
  const frozenBacksplashByRoom = new Map();
  if (useProportionalAllocation && published) {
    for (const snapRoom of Array.isArray(published.rooms) ? published.rooms : []) {
      const roomKey = resolveFrozenRoomKey(snapRoom?.roomId, snapRoom?.roomName);
      if (!roomKey) continue;
      if (snapRoom?.countertopAmountCents != null) {
        frozenCountertopByRoom.set(
          roomKey,
          Math.trunc(Number(snapRoom.countertopAmountCents) || 0) -
            (frozenInternalByRoomCategory.get(`${roomKey}:countertop`) || 0)
        );
      }
      if (snapRoom?.backsplashAmountCents != null) {
        frozenBacksplashByRoom.set(
          roomKey,
          Math.trunc(Number(snapRoom.backsplashAmountCents) || 0) -
            (frozenInternalByRoomCategory.get(`${roomKey}:backsplash`) || 0)
        );
      }
    }
  }
  const hasCompleteFrozenCategoryOwnership =
    internalRooms.length > 0 &&
    internalRooms.every(
      (r) =>
        frozenCountertopByRoom.has(String(r.roomKey)) &&
        frozenBacksplashByRoom.has(String(r.roomKey))
    );
  const effectiveBaselineBacksplashCents = hasCompleteFrozenCategoryOwnership
    ? [...frozenBacksplashByRoom.values()].reduce((sum, cents) => sum + cents, 0)
    : knownBaselineBacksplashCents;

  const countertopOnlyBaselineCents = useProportionalAllocation
    ? baselineExactTotalCents -
      effectiveBaselineBacksplashCents -
      frozenRoomCustomLinesCents -
      frozenProjectAddOnCents -
      frozenInternalCents
    : null;
  const baselineShares = useProportionalAllocation
    ? hasCompleteFrozenCategoryOwnership
      ? internalRooms.map((r) => frozenCountertopByRoom.get(String(r.roomKey)) || 0)
      : allocateProportionally(
          countertopOnlyBaselineCents,
          internalRooms.map((r) => Number(r.chargeableCounterSf) || 0)
        )
    : [];

  const order = [];
  const roomsByKey = new Map();
  internalRooms.forEach((r, idx) => {
    const roomKey = String(r.roomKey);
    order.push(roomKey);
    const absoluteReprice = Math.trunc(Number(r.materialSellCents || 0) + Number(r.materialUseTaxCents || 0));
    // When the configured backsplash amount cannot be resolved (review-required), the
    // engine keeps that room's contribution to the total unchanged from baseline (delta
    // stays 0 rather than inventing a new number) — mirror that here so the displayed
    // room total always matches the authoritative configured total exactly.
    const frozenBaselineBacksplash = frozenBacksplashByRoom.get(roomKey);
    const configuredBacksplash =
      r.backsplashConfiguredAmountCents != null
        ? Math.trunc(Number(r.backsplashConfiguredAmountCents))
        : null;
    const backsplashAmountCents =
      r.backsplashMode === "none"
        ? 0
        : configuredBacksplash != null
          ? configuredBacksplash
          : frozenBaselineBacksplash ??
            (r.backsplashBaselineAmountCents != null
              ? Math.trunc(Number(r.backsplashBaselineAmountCents))
              : null);
    const reviewRequiredItems = [];
    for (const code of Array.isArray(r.backsplashReviewCodes) ? r.backsplashReviewCodes : []) {
      reviewRequiredItems.push({
        category: "backsplash",
        label: BACKSPLASH_REVIEW_LABEL[code] || "Backsplash",
        reason: "requires_estimator_review",
        code
      });
    }
    roomsByKey.set(roomKey, {
      roomId: roomKey,
      roomName: r.displayName || roomKey,
      countertopAmountCents: useProportionalAllocation ? baselineShares[idx] : absoluteReprice,
      backsplashAmountCents,
      backsplashMode: r.backsplashMode || "none",
      backsplashFromMode: r.baselineBacksplashMode || "none",
      addOnsAmountCents: 0,
      materialDeltaCents: 0,
      materialFromGroup: r.baselineMaterialGroup || null,
      materialToGroup: r.selectedMaterialGroup || null,
      selectedMaterial: r.selectedMaterialLabel || null,
      selectedSink: null,
      selectedSinkFinish: null,
      selectedFaucet: null,
      selectedFaucetFinish: null,
      selectedAccessories: [],
      selectedEdge: null,
      selectedSpecialtyItems: [],
      reviewRequiredItems,
      customerFacingLines: [],
      attributionStatus: useProportionalAllocation ? "proportional_allocation_of_baseline" : "absolute_reprice"
    });
  });

  for (const d of Array.isArray(internal.materialGroupDeltas) ? internal.materialGroupDeltas : []) {
    const room = roomsByKey.get(String(d.roomKey));
    if (!room) continue;
    const deltaCents = Math.trunc(Number(d.exactMaterialDeltaCents || 0));
    room.materialDeltaCents = deltaCents;
    room.materialFromGroup = d.fromGroup || room.materialFromGroup;
    room.materialToGroup = d.toGroup || room.materialToGroup;
    if (useProportionalAllocation) room.countertopAmountCents += deltaCents;
  }

  // Backsplash review items are sourced directly from each room's
  // backsplashReviewCodes (see loop above) — those codes are already
  // room-attributed and structured. This flat reviewFlags list only carries
  // specialty/side-splash/edge review markers that have no equivalent
  // per-room structured field yet.
  for (const flag of reviewFlags) {
    const parts = String(flag || "").split(":");
    const kind = parts[0];
    const roomKey = parts[1];
    const room = roomsByKey.get(roomKey);
    if (!room) continue;
    if (kind === "specialty_review") {
      room.reviewRequiredItems.push({ category: "specialty", label: "Specialty item", reason: "requires_estimator_review" });
    } else if (kind === "sidesplash_review") {
      room.reviewRequiredItems.push({ category: "side_splash", label: "Side splash", reason: "requires_estimator_review" });
    } else if (kind === "edge_length_review") {
      room.reviewRequiredItems.push({ category: "edge", label: "Edge upgrade", reason: "requires_estimator_review" });
    }
  }

  let projectLevelOptionsCents = 0;
  const projectOptionLines = [];
  for (const opt of Array.isArray(internal.options) ? internal.options : []) {
    const amountCents = Math.trunc(Number(opt.amountCents || 0));
    const { roomKey, category } = categoryForOptionKey(opt.optionKey);
    const room = roomKey ? roomsByKey.get(roomKey) : null;
    if (room) {
      room.addOnsAmountCents += amountCents;
      if (amountCents !== 0 || Number(opt.qty || 0) > 0) {
        room.customerFacingLines.push({
          category,
          label: opt.displayLabel || opt.optionKey,
          amountCents
        });
      }
      applySelectedLabel(room, category, opt);
    } else {
      projectLevelOptionsCents += amountCents;
      if (amountCents !== 0 || Number(opt.qty || 0) > 0) {
        projectOptionLines.push({
          label: opt.displayLabel || "Project add-on",
          amountCents
        });
      }
    }
  }

  // Re-attach frozen custom-line dollars (carved out of the pool above):
  // internal-only allocations absorb silently into stone categories; explicit
  // customer-facing lines stay named on their room.
  //
  // Configured-state eligibility rule (Updated only — the frozen Original
  // snapshot and its customLineAllocations audit are NEVER rewritten):
  //  - Backsplash is eligible only while the room's configured mode is not
  //    "none" and the configured amount is resolvable. Mode "none" writes an
  //    explicit $0; re-adding frozen hidden cents into that zero would invent
  //    a positive Backsplash amount after removal.
  //  - When a frozen Backsplash target becomes ineligible, its integer cents
  //    redistribute to the room's remaining eligible stone target under the
  //    same governed hierarchy (internal_custom_line_allocation_v1 rule 5:
  //    no eligible backsplash → Countertop absorbs). With one eligible target
  //    the largest-remainder distribution is the full amount — deterministic
  //    by construction, no balancing plug, exact reconciliation preserved.
  //  - Each redirect is recorded as an internal derived-reattachment audit
  //    row (never exposed in public DTOs; hidden line names stay hidden).
  /** @type {Array<{ roomId: string, fromCategory: string, toCategory: string, amountCents: number, reason: string }>} */
  const internalReattachments = [];
  for (const target of frozenInternalTargets) {
    const room = roomsByKey.get(target.roomKey);
    if (!room) continue;
    const backsplashEligible =
      room.backsplashAmountCents != null && room.backsplashMode !== "none";
    if (target.category === "backsplash" && backsplashEligible) {
      room.backsplashAmountCents += target.amountCents;
    } else {
      room.countertopAmountCents += target.amountCents;
      if (target.category === "backsplash") {
        internalReattachments.push({
          roomId: String(target.roomKey),
          fromCategory: "backsplash",
          toCategory: "countertop",
          amountCents: target.amountCents,
          reason:
            room.backsplashMode === "none"
              ? "configured_backsplash_removed"
              : "configured_backsplash_unresolved"
        });
      }
    }
  }
  for (const line of frozenRoomCustomLines) {
    const room = roomsByKey.get(line.roomKey);
    if (!room) continue;
    room.addOnsAmountCents += line.amountCents;
    room.customerFacingLines.push({
      category: "custom",
      label: line.label,
      amountCents: line.amountCents
    });
  }

  const rooms = order.map((key) => {
    const room = roomsByKey.get(key);
    const backsplashForTotal = room.backsplashAmountCents ?? 0;
    const roomTotalCents = room.countertopAmountCents + backsplashForTotal + room.addOnsAmountCents;
    return { ...room, roomTotalCents };
  });

  const allCustomLines = Array.isArray(internal.customLines) ? internal.customLines : [];
  const allCredits = Array.isArray(internal.credits) ? internal.credits : [];
  const customLinesCents = allCustomLines.reduce((s, l) => s + Math.trunc(Number(l.amountCents || 0)), 0);
  const creditsCents = allCredits.reduce((s, c) => s + Math.trunc(Number(c.amountCents || 0)), 0);
  const spahnAdjustmentCents = internal.spahnAndRose ? Math.trunc(Number(internal.spahnAndRose.amountCents || 0)) : 0;

  const projectAddOns = [
    ...allCustomLines
      .filter((l) => l.customerFacing !== false)
      .map((l) => ({ label: l.label, amountCents: Math.trunc(Number(l.amountCents || 0)) })),
    ...projectOptionLines,
    ...frozenProjectAddOnLines
  ];

  const roomSubtotalCents = rooms.reduce((s, r) => s + r.roomTotalCents, 0);
  const projectAddOnsTotalCents = customLinesCents + frozenProjectAddOnCents;
  const governedAdjustmentsCents = creditsCents + spahnAdjustmentCents + projectLevelOptionsCents;
  const reconciledSumCents = roomSubtotalCents + projectAddOnsTotalCents + governedAdjustmentsCents;
  const configuredExactTotalCents = Math.trunc(Number(internal.configuredExactTotalCents));

  const reviewRequiredCount = rooms.reduce((s, r) => s + r.reviewRequiredItems.length, 0);
  const matchesExactly = reconciledSumCents === configuredExactTotalCents;

  let reconciliationStatus;
  let diagnostics = null;
  if (!matchesExactly) {
    reconciliationStatus = "failed";
    diagnostics = {
      reconciledSumCents,
      configuredExactTotalCents,
      diffCents: reconciledSumCents - configuredExactTotalCents
    };
  } else if (reviewRequiredCount > 0) {
    reconciliationStatus = "review_required";
  } else {
    reconciliationStatus = "reconciled";
  }

  return {
    kind: "updated",
    rooms,
    projectAddOns,
    projectLevelOptionsCents,
    roomSubtotalCents,
    projectAddOnsTotalCents,
    governedAdjustmentsCents,
    configuredSubtotalCents: reconciledSumCents,
    configuredExactTotalCents,
    configuredDisplayTotalCents: Math.trunc(Number(internal.configuredDisplayTotalCents ?? internal.configuredExactTotalCents)),
    originalTotalCents: internal.baselineExactTotalCents != null ? Math.trunc(Number(internal.baselineExactTotalCents)) : null,
    deltaFromOriginalCents: internal.exactConfigurationDeltaCents != null ? Math.trunc(Number(internal.exactConfigurationDeltaCents)) : null,
    reviewRequiredCount,
    reconciliationStatus,
    diagnostics,
    // Internal-only derived reattachment audit (configured-state eligibility
    // redirects of frozen hidden allocations). Never mapped into public DTOs.
    internalReattachments
  };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministic legacy-line → room mapping: only maps when the room's display
 * name appears as a whole-word match in the line label AND exactly one room
 * matches. Ambiguous or unmatched lines are left project-level.
 * @param {string} label
 * @param {string[]} roomNames
 * @returns {string|null}
 */
export function mapLegacyLineToRoom(label, roomNames) {
  const text = String(label || "");
  if (!text) return null;
  const matches = (roomNames || []).filter((name) => {
    const n = String(name || "").trim();
    if (!n) return false;
    return new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(text);
  });
  return matches.length === 1 ? matches[0] : null;
}

function slugRoomId(name, index) {
  const base = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || `room-${index}`;
}

/**
 * Build the Original room pricing projection FROM the immutable
 * publish-time room pricing snapshot (section 20/13). Preferred path — used
 * whenever `customerSnapshot.roomPricing` exists (all publications created
 * after DE.Polish-3). Never recalculates anything; every dollar here was
 * frozen once, at publish time, by roomPricingPublishSnapshot.mjs.
 *
 * @param {ReturnType<typeof import("./roomPricingPublishSnapshot.mjs").buildRoomPricingPublishSnapshot>} snapshot
 */
export function buildOriginalRoomPricingProjectionFromSnapshot(snapshot) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const rooms = (Array.isArray(snap.rooms) ? snap.rooms : []).map((r, i) => ({
    roomId: r?.roomId || `room-${i + 1}`,
    roomName: r?.roomName || `Room ${i + 1}`,
    countertopAmountCents: r?.countertopAmountCents != null ? Math.trunc(Number(r.countertopAmountCents)) : null,
    backsplashAmountCents: r?.backsplashAmountCents != null ? Math.trunc(Number(r.backsplashAmountCents)) : null,
    backsplashMode: r?.originalBacksplashMode || "none",
    addOnsAmountCents: Math.trunc(Number(r?.addOnsAmountCents) || 0),
    roomTotalCents: r?.roomTotalCents != null ? Math.trunc(Number(r.roomTotalCents)) : null,
    selectedMaterial: r?.selectedMaterialLabel || null,
    // Frozen explicit customer-facing custom lines (v2 snapshots). Internal-only
    // allocations are already absorbed inside the frozen stone amounts and are
    // never re-exposed here.
    customerFacingLines: (Array.isArray(r?.customerFacingLines) ? r.customerFacingLines : [])
      .filter((l) => l && l.customerVisible !== false)
      .map((l) => ({
        category: String(l.category || "custom"),
        label: String(l.label || "Item"),
        amountCents: Math.trunc(Number(l.amountCents) || 0)
      })),
    reviewRequiredItems: [],
    attributionStatus: r?.pricingSourceVersion || "published_allocation_v1"
  }));

  const projectAddOns = (Array.isArray(snap.projectAddOnLines) ? snap.projectAddOnLines : [])
    .filter((l) => l && l.customerVisible !== false)
    .map((l) => ({
      label: String(l.label || "Item"),
      amountCents: Math.trunc(Number(l.amountCents) || 0)
    }));
  const projectAddOnsTotalCents = Math.trunc(Number(snap.projectAddOnsCents) || 0);
  const projectTotalCents = snap.totalCents != null ? Math.trunc(Number(snap.totalCents)) : null;

  return {
    kind: "original",
    rooms,
    projectAddOns,
    projectAddOnsTotalCents,
    projectTotalCents,
    unresolvedLegacyLines: [],
    reconciliationStatus: snap.reconciliationStatus || "reconciled",
    snapshotAvailability: "available"
  };
}

/**
 * Legacy fallback Original projection, built directly from the frozen
 * customer-facing summary (name / lineItems / totals only) when a
 * publication predates the DE.Polish-3 room pricing snapshot (section 19).
 * Per-room absolute countertop/backsplash dollars are NOT available in this
 * legacy shape; rooms are returned with those fields null and
 * attributionStatus "not_currently_attributable" — never invented. Legacy
 * flat lineItems are attributed to a room only when unambiguous.
 *
 * @param {{
 *   rooms?: Array<{ name?: string, materialLabel?: string|null, colorLabel?: string|null }>,
 *   lineItems?: Array<{ label?: string, amount?: number|null }>,
 *   totals?: { estimatedProjectTotal?: number|null }
 * }} customerSnapshot
 */
export function buildLegacyOriginalRoomPricingProjection(customerSnapshot) {
  const snap = customerSnapshot && typeof customerSnapshot === "object" ? customerSnapshot : {};
  const snapRooms = Array.isArray(snap.rooms) ? snap.rooms : [];
  const lineItems = Array.isArray(snap.lineItems) ? snap.lineItems : [];
  const roomNames = snapRooms.map((r) => r?.name).filter(Boolean);

  const rooms = snapRooms.map((r, i) => ({
    roomId: slugRoomId(r?.name, i),
    roomName: r?.name || `Room ${i + 1}`,
    countertopAmountCents: null,
    backsplashAmountCents: null,
    addOnsAmountCents: 0,
    roomTotalCents: null,
    selectedMaterial: r?.materialLabel || r?.colorLabel || null,
    customerFacingLines: [],
    attributionStatus: "not_currently_attributable"
  }));
  const roomById = new Map(rooms.map((r) => [r.roomName, r]));

  const projectAddOns = [];
  const unresolvedLegacyLines = [];
  for (const li of lineItems) {
    const amount = li?.amount != null ? Number(li.amount) : null;
    const amountCents = amount != null && Number.isFinite(amount) ? dollarsToCents(amount) : null;
    const roomName = mapLegacyLineToRoom(li?.label, roomNames);
    if (roomName && amountCents != null) {
      const room = roomById.get(roomName);
      room.addOnsAmountCents += amountCents;
      room.customerFacingLines.push({ category: "custom", label: li.label, amountCents });
    } else {
      projectAddOns.push({ label: li?.label || "Item", amountCents });
      if (!roomName) unresolvedLegacyLines.push(li?.label || "Item");
    }
  }

  const projectTotalCents =
    snap.totals?.estimatedProjectTotal != null ? dollarsToCents(Number(snap.totals.estimatedProjectTotal)) : null;
  const projectAddOnsTotalCents = projectAddOns.reduce((s, l) => s + Math.trunc(Number(l.amountCents || 0)), 0);

  return {
    kind: "original",
    rooms,
    projectAddOns,
    projectAddOnsTotalCents,
    projectTotalCents,
    unresolvedLegacyLines,
    reconciliationStatus: "not_attributable",
    snapshotAvailability: "legacy_room_pricing_snapshot_unavailable"
  };
}

/**
 * Original view dispatcher (section 20). Uses the immutable publish-time
 * room pricing snapshot whenever the publication has one; falls back to the
 * legacy flat-summary reconstruction for publications frozen before
 * DE.Polish-3 (section 19). Never mixes the two, never uses live customer
 * selections or current catalog prices.
 *
 * @param {{
 *   roomPricing?: ReturnType<typeof import("./roomPricingPublishSnapshot.mjs").buildRoomPricingPublishSnapshot>|null,
 *   rooms?: Array<object>,
 *   lineItems?: Array<object>,
 *   totals?: object
 * }} customerSnapshot
 */
export function buildOriginalRoomPricingProjection(customerSnapshot) {
  const snap = customerSnapshot && typeof customerSnapshot === "object" ? customerSnapshot : {};
  if (snap.roomPricing && typeof snap.roomPricing === "object" && Array.isArray(snap.roomPricing.rooms)) {
    return buildOriginalRoomPricingProjectionFromSnapshot(snap.roomPricing);
  }
  return buildLegacyOriginalRoomPricingProjection(snap);
}

const CHANGES_CATEGORY_LABEL = Object.freeze({
  material: "Material",
  backsplash: "Backsplash",
  sink: "Sink",
  sink_cutout: "Sink cutout",
  faucet: "Faucet",
  accessories: "Accessories",
  edge: "Edge",
  side_splash: "Side splash",
  specialty: "Specialty",
  custom: "Item"
});

/** Customer-facing label for a governed backsplash mode (section 22). */
const BACKSPLASH_MODE_LABEL = Object.freeze({
  none: "No backsplash",
  standard_4in: "4-inch backsplash",
  custom_height: "Custom-height backsplash",
  full_height: "Full-height backsplash"
});

/**
 * Structured Original → Updated difference projection, room by room.
 * Only emits rows with a customer-facing category label and dollar delta —
 * never raw option keys or internal quantity keys.
 *
 * @param {{ original: ReturnType<typeof buildOriginalRoomPricingProjection>, updated: ReturnType<typeof buildUpdatedRoomPricingProjection> }} args
 */
export function buildChangesRoomPricingProjection(args) {
  const original = args?.original || { rooms: [] };
  const updated = args?.updated || { rooms: [] };
  const originalByRoomName = new Map((original.rooms || []).map((r) => [r.roomName, r]));

  const rows = [];
  for (const room of updated.rooms || []) {
    const origRoom = originalByRoomName.get(room.roomName) || null;

    if (room.materialDeltaCents !== 0) {
      rows.push({
        roomId: room.roomId,
        roomName: room.roomName,
        category: "material",
        categoryLabel: CHANGES_CATEGORY_LABEL.material,
        originalLabel: origRoom?.selectedMaterial || "Original material",
        updatedLabel: room.selectedMaterial || "Updated material",
        amountDeltaCents: room.materialDeltaCents,
        status: "changed"
      });
    }

    const originalBacksplashMode = origRoom?.backsplashMode || "none";
    const updatedBacksplashMode = room.backsplashMode || "none";
    const originalBacksplashAmountCents = origRoom?.backsplashAmountCents ?? null;
    const updatedBacksplashAmountCents = room.backsplashAmountCents ?? null;
    const backsplashReviewItems = (room.reviewRequiredItems || []).filter((i) => i.category === "backsplash");
    if (
      updatedBacksplashMode !== originalBacksplashMode ||
      updatedBacksplashAmountCents !== originalBacksplashAmountCents ||
      backsplashReviewItems.length
    ) {
      const amountDeltaCents =
        originalBacksplashAmountCents != null && updatedBacksplashAmountCents != null
          ? updatedBacksplashAmountCents - originalBacksplashAmountCents
          : null;
      let status = "changed";
      if (originalBacksplashMode === "none" && updatedBacksplashMode !== "none") status = "new_selection";
      else if (originalBacksplashMode !== "none" && updatedBacksplashMode === "none") status = "removed";
      if (backsplashReviewItems.length) status = "review_required";
      rows.push({
        roomId: room.roomId,
        roomName: room.roomName,
        category: "backsplash",
        categoryLabel: CHANGES_CATEGORY_LABEL.backsplash,
        originalLabel: BACKSPLASH_MODE_LABEL[originalBacksplashMode] || "No backsplash",
        updatedLabel: BACKSPLASH_MODE_LABEL[updatedBacksplashMode] || "No backsplash",
        amountDeltaCents,
        status
      });
    }

    const origLinesByCategory = new Map();
    for (const l of origRoom?.customerFacingLines || []) {
      const list = origLinesByCategory.get(l.category) || [];
      list.push(l);
      origLinesByCategory.set(l.category, list);
    }
    const seenCategories = new Set();
    for (const line of room.customerFacingLines) {
      seenCategories.add(line.category);
      const origList = origLinesByCategory.get(line.category) || [];
      const origAmountCents = origList.reduce((s, l) => s + Math.trunc(Number(l.amountCents || 0)), 0);
      const origLabel = origList.length ? origList.map((l) => l.label).join(", ") : "Not selected";
      const delta = line.amountCents - origAmountCents;
      if (delta === 0 && origList.length) continue; // unchanged selection, no dollar effect
      rows.push({
        roomId: room.roomId,
        roomName: room.roomName,
        category: line.category,
        categoryLabel: CHANGES_CATEGORY_LABEL[line.category] || "Item",
        originalLabel: origLabel,
        updatedLabel: line.label,
        amountDeltaCents: delta,
        status: origList.length ? "changed" : "new_selection"
      });
    }
    for (const [category, list] of origLinesByCategory) {
      if (seenCategories.has(category)) continue;
      const amountCents = list.reduce((s, l) => s + Math.trunc(Number(l.amountCents || 0)), 0);
      rows.push({
        roomId: room.roomId,
        roomName: room.roomName,
        category,
        categoryLabel: CHANGES_CATEGORY_LABEL[category] || "Item",
        originalLabel: list.map((l) => l.label).join(", "),
        updatedLabel: "Removed",
        amountDeltaCents: -amountCents,
        status: "removed"
      });
    }

    for (const item of room.reviewRequiredItems || []) {
      if (item.category === "backsplash") continue; // already folded into the backsplash row above
      rows.push({
        roomId: room.roomId,
        roomName: room.roomName,
        category: item.category,
        categoryLabel: CHANGES_CATEGORY_LABEL[item.category] || "Item",
        originalLabel: "Not selected",
        updatedLabel: item.label,
        amountDeltaCents: null,
        status: "review_required"
      });
    }
  }

  return {
    kind: "changes",
    rows,
    totalDeltaCents: updated.deltaFromOriginalCents ?? null
  };
}

/** Strip an internal room object down to the section-9 customer-safe public shape. */
function toPublicRoom(room) {
  return {
    roomName: customerSafeProjectionLabel(room.roomName, "Room"),
    countertopAmount: room.countertopAmountCents != null ? centsToDollars(room.countertopAmountCents) : null,
    backsplashAmount: room.backsplashAmountCents != null ? centsToDollars(room.backsplashAmountCents) : null,
    addOnsAmount: room.addOnsAmountCents != null ? centsToDollars(room.addOnsAmountCents) : null,
    roomTotal: room.roomTotalCents != null ? centsToDollars(room.roomTotalCents) : null,
    selectedMaterial: room.selectedMaterial || null,
    selectedBacksplash: room.backsplashMode != null ? BACKSPLASH_MODE_LABEL[room.backsplashMode] || null : null,
    selectedSink: room.selectedSink || null,
    selectedSinkFinish: room.selectedSinkFinish || null,
    selectedFaucet: room.selectedFaucet || null,
    selectedFaucetFinish: room.selectedFaucetFinish || null,
    selectedAccessories: room.selectedAccessories || [],
    selectedEdge: room.selectedEdge || null,
    selectedSpecialtyItems: room.selectedSpecialtyItems || [],
    addOnLines: (room.customerFacingLines || []).map((line) => ({
      category: CHANGES_CATEGORY_LABEL[line.category] || "Add-on",
      label: customerSafeProjectionLabel(line.label),
      amount: line.amountCents != null ? centsToDollars(line.amountCents) : null
    })),
    reviewRequired: (room.reviewRequiredItems || []).length > 0,
    reviewRequiredCategories: (room.reviewRequiredItems || []).map((i) => i.category)
  };
}

/**
 * Customer-safe public DTO for either an Original or Updated room pricing
 * projection. Exposes only section-9 allowlisted fields — no option keys, no
 * SF/LF, no cost/margin/tax/adjustment internals.
 */
export function toPublicRoomPricingDto(projection) {
  const rooms = (projection?.rooms || []).map(toPublicRoom);
  const projectAddOns = (projection?.projectAddOns || []).map((l) => ({
    label: customerSafeProjectionLabel(l.label, "Project item"),
    amount: l.amountCents != null ? centsToDollars(l.amountCents) : null
  }));
  return {
    kind: projection?.kind || "updated",
    rooms,
    projectAddOns,
    projectTotal:
      projection?.configuredExactTotalCents != null
        ? centsToDollars(projection.configuredExactTotalCents)
        : projection?.projectTotalCents != null
          ? centsToDollars(projection.projectTotalCents)
          : null,
    reconciliationStatus: projection?.reconciliationStatus || "not_attributable"
  };
}

/** Customer-safe public DTO for a Changes projection — labels only, no option keys. */
export function toPublicChangesPricingDto(changes) {
  return {
    kind: "changes",
    rows: (changes?.rows || []).map((r) => ({
      roomName: customerSafeProjectionLabel(r.roomName, "Room"),
      category: r.category,
      categoryLabel: r.categoryLabel,
      originalLabel: customerSafeProjectionLabel(r.originalLabel, "Not selected"),
      updatedLabel: customerSafeProjectionLabel(r.updatedLabel, "Not selected"),
      amountDelta: r.amountDeltaCents != null ? centsToDollars(r.amountDeltaCents) : null,
      status: r.status
    })),
    totalDelta:
      changes?.totalDeltaCents != null ? centsToDollars(changes.totalDeltaCents) : null
  };
}

/**
 * Small internal-only summary reusable by Queue / Workspace / Studio
 * customer-activity surfaces in a later phase. Deliberately does not include
 * per-room detail or option keys — just the top-line facts those surfaces
 * need (section 10/25).
 *
 * @param {ReturnType<typeof buildUpdatedRoomPricingProjection>} updated
 * @param {{
 *   lastSavedAt?: string|null,
 *   missingInformationCount?: number,
 *   pricingValidThrough?: string|null,
 *   snapshotVersion?: string|null,
 *   snapshotAvailability?: string|null
 * }} [meta]
 */
export function toInternalQueueWorkspaceSummary(updated, meta = {}) {
  const rooms = updated?.rooms || [];
  const unresolvedPricingCount = rooms.filter(
    (r) => (r.backsplashMode || "none") !== "none" && r.backsplashAmountCents == null
  ).length;
  return {
    snapshotVersion: meta.snapshotVersion ?? null,
    snapshotAvailability: meta.snapshotAvailability ?? null,
    originalTotal: updated?.originalTotalCents != null ? centsToDollars(updated.originalTotalCents) : null,
    configuredTotal: updated?.configuredExactTotalCents != null ? centsToDollars(updated.configuredExactTotalCents) : null,
    delta: updated?.deltaFromOriginalCents != null ? centsToDollars(updated.deltaFromOriginalCents) : null,
    roomCount: rooms.length,
    changedRoomCount: rooms.filter(
      (r) => r.materialDeltaCents !== 0 || r.addOnsAmountCents !== 0
    ).length,
    reviewRequiredCount: updated?.reviewRequiredCount ?? 0,
    unresolvedPricingCount,
    reconciliationStatus: updated?.reconciliationStatus || "not_attributable",
    lastSavedAt: meta.lastSavedAt ?? null,
    pricingValidThrough: meta.pricingValidThrough ?? null,
    backsplashPricingStatus: unresolvedPricingCount > 0 ? "review_required" : "priced",
    missingInformationCount: Number(meta.missingInformationCount) || 0
  };
}
