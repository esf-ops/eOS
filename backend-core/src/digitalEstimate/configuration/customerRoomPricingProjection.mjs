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
 *  - Not currently priced anywhere in the system: Backsplash. `chargeableBacksplashSf`
 *    is computed in publicConfigurationService.mjs but elite100-config-delta-v2
 *    never reads it — backsplash contributes $0 to every configured total
 *    today. Full-height / custom-height selections are flagged review-required
 *    (existing reviewFlags) rather than priced. This is a genuine pricing gap,
 *    not something this projection may invent a number for.
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

/** Legacy/no-op cutout + stock-sink option key prefixes (never matched by parseProductOptionKey). */
const CUTOUT_KEY_PATTERN = /^(qty-sink|qty-bar|qty-ss):(.+)$/;

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
 *   reviewFlags?: string[]
 * }} args
 */
export function buildUpdatedRoomPricingProjection(args) {
  const internal = args?.internal;
  if (!internal || typeof internal !== "object") {
    throw new Error("buildUpdatedRoomPricingProjection requires internal calculation result");
  }
  const reviewFlags = Array.isArray(args.reviewFlags) ? args.reviewFlags : [];

  const internalRooms = Array.isArray(internal.rooms) ? internal.rooms : [];
  const frozenBaselineAnchor = Boolean(internal.frozenBaselineAnchor);
  const baselineExactTotalCents =
    internal.baselineExactTotalCents != null ? Math.trunc(Number(internal.baselineExactTotalCents)) : null;

  // Countertop allocation:
  //  - anchor mode: split the one authoritative baseline total by chargeable-SF weight
  //    (never exposed), then add each room's exact material delta on top.
  //  - standalone mode: the engine's own absolute per-room reprice already *is* the
  //    authoritative figure — use it directly, no allocation needed.
  const useProportionalAllocation = frozenBaselineAnchor && baselineExactTotalCents != null;
  const baselineShares = useProportionalAllocation
    ? allocateProportionally(baselineExactTotalCents, internalRooms.map((r) => Number(r.chargeableCounterSf) || 0))
    : [];

  const order = [];
  const roomsByKey = new Map();
  internalRooms.forEach((r, idx) => {
    const roomKey = String(r.roomKey);
    order.push(roomKey);
    const absoluteReprice = Math.trunc(Number(r.materialSellCents || 0) + Number(r.materialUseTaxCents || 0));
    roomsByKey.set(roomKey, {
      roomId: roomKey,
      roomName: r.displayName || roomKey,
      countertopAmountCents: useProportionalAllocation ? baselineShares[idx] : absoluteReprice,
      backsplashAmountCents: 0,
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
      reviewRequiredItems: [],
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

  for (const flag of reviewFlags) {
    const parts = String(flag || "").split(":");
    const kind = parts[0];
    const roomKey = parts[1];
    const room = roomsByKey.get(roomKey);
    if (!room) continue;
    if (kind === "full_height_backsplash" || kind === "custom_height_backsplash") {
      room.backsplashAmountCents = null;
      room.reviewRequiredItems.push({
        category: "backsplash",
        label: kind === "full_height_backsplash" ? "Full-height backsplash" : "Custom-height backsplash",
        reason: "requires_estimator_review"
      });
    } else if (kind === "specialty_review") {
      room.reviewRequiredItems.push({ category: "specialty", label: "Specialty item", reason: "requires_estimator_review" });
    } else if (kind === "sidesplash_review") {
      room.reviewRequiredItems.push({ category: "side_splash", label: "Side splash", reason: "requires_estimator_review" });
    } else if (kind === "edge_length_review") {
      room.reviewRequiredItems.push({ category: "edge", label: "Edge upgrade", reason: "requires_estimator_review" });
    }
  }

  let projectLevelOptionsCents = 0;
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
    }
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

  const projectAddOns = allCustomLines
    .filter((l) => l.customerFacing !== false)
    .map((l) => ({ label: l.label, amountCents: Math.trunc(Number(l.amountCents || 0)) }));

  const roomSubtotalCents = rooms.reduce((s, r) => s + r.roomTotalCents, 0);
  const projectAddOnsTotalCents = customLinesCents;
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
    diagnostics
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
 * Build the Original room pricing projection from the immutable published
 * customer snapshot. Never recalculates anything — reads only what was
 * frozen at publish time. Per-room absolute countertop/backsplash dollars are
 * NOT available in the current snapshot schema (see module doc); rooms are
 * returned with those fields null and attributionStatus
 * "not_currently_attributable" until a future publish-time schema change
 * captures them. Legacy flat lineItems are attributed to a room only when
 * unambiguous.
 *
 * @param {{
 *   rooms?: Array<{ name?: string, materialLabel?: string|null, colorLabel?: string|null }>,
 *   lineItems?: Array<{ label?: string, amount?: number|null }>,
 *   totals?: { estimatedProjectTotal?: number|null }
 * }} customerSnapshot
 */
export function buildOriginalRoomPricingProjection(customerSnapshot) {
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
    reconciliationStatus: "not_attributable"
  };
}

const CHANGES_CATEGORY_LABEL = Object.freeze({
  material: "Material",
  sink: "Sink",
  sink_cutout: "Sink cutout",
  faucet: "Faucet",
  accessories: "Accessories",
  edge: "Edge",
  side_splash: "Side splash",
  specialty: "Specialty",
  custom: "Item"
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
        originalLabel: room.materialFromGroup || "Original material",
        updatedLabel: room.materialToGroup || room.selectedMaterial || "Updated material",
        amountDeltaCents: room.materialDeltaCents,
        status: "changed"
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
    roomName: room.roomName,
    countertopAmount: room.countertopAmountCents != null ? centsToDollars(room.countertopAmountCents) : null,
    backsplashAmount: room.backsplashAmountCents != null ? centsToDollars(room.backsplashAmountCents) : null,
    addOnsAmount: room.addOnsAmountCents != null ? centsToDollars(room.addOnsAmountCents) : null,
    roomTotal: room.roomTotalCents != null ? centsToDollars(room.roomTotalCents) : null,
    selectedMaterial: room.selectedMaterial || null,
    selectedSink: room.selectedSink || null,
    selectedSinkFinish: room.selectedSinkFinish || null,
    selectedFaucet: room.selectedFaucet || null,
    selectedFaucetFinish: room.selectedFaucetFinish || null,
    selectedAccessories: room.selectedAccessories || [],
    selectedEdge: room.selectedEdge || null,
    selectedSpecialtyItems: room.selectedSpecialtyItems || [],
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
    label: l.label,
    amount: l.amountCents != null ? centsToDollars(l.amountCents) : null
  }));
  return {
    kind: projection?.kind || "updated",
    rooms,
    projectAddOns,
    reconciliationStatus: projection?.reconciliationStatus || "not_attributable"
  };
}

/** Customer-safe public DTO for a Changes projection — labels only, no option keys. */
export function toPublicChangesPricingDto(changes) {
  return {
    kind: "changes",
    rows: (changes?.rows || []).map((r) => ({
      roomName: r.roomName,
      category: r.category,
      categoryLabel: r.categoryLabel,
      originalLabel: r.originalLabel,
      updatedLabel: r.updatedLabel,
      amountDelta: r.amountDeltaCents != null ? centsToDollars(r.amountDeltaCents) : null,
      status: r.status
    }))
  };
}

/**
 * Small internal-only summary reusable by Queue / Workspace / Studio
 * customer-activity surfaces in a later phase. Deliberately does not include
 * per-room detail or option keys — just the top-line facts those surfaces
 * need (section 10).
 */
export function toInternalQueueWorkspaceSummary(updated, meta = {}) {
  const rooms = updated?.rooms || [];
  return {
    originalTotal: updated?.originalTotalCents != null ? centsToDollars(updated.originalTotalCents) : null,
    configuredTotal: updated?.configuredExactTotalCents != null ? centsToDollars(updated.configuredExactTotalCents) : null,
    delta: updated?.deltaFromOriginalCents != null ? centsToDollars(updated.deltaFromOriginalCents) : null,
    roomCount: rooms.length,
    changedRoomCount: rooms.filter(
      (r) => r.materialDeltaCents !== 0 || r.addOnsAmountCents !== 0
    ).length,
    lastSavedAt: meta.lastSavedAt ?? null,
    reviewRequiredCount: updated?.reviewRequiredCount ?? 0,
    missingInformationCount: Number(meta.missingInformationCount) || 0,
    reconciliationStatus: updated?.reconciliationStatus || "not_attributable"
  };
}
