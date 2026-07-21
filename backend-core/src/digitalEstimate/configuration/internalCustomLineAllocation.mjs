/**
 * Deterministic customer-facing allocation of INTERNAL-ONLY custom lines.
 *
 * Internal-only custom lines must never appear by name in the customer
 * Digital Estimate, but the customer-facing total must still reconcile to the
 * authoritative internal total. This module absorbs each internal-only line
 * into the customer-facing stone categories (Countertop / Backsplash)
 * according to a fixed, versioned policy hierarchy:
 *
 *   1. Room-owned + stone-category-owned  → that room's category.
 *   2. Room-owned, no stone category      → proportional across that room's
 *      governed Countertop and Backsplash amounts.
 *   3. Project-owned + stone category     → proportional across eligible rooms
 *      within that category.
 *   4. Project-owned, no category         → proportional across all governed
 *      room Countertop and Backsplash amounts.
 *   5. No backsplash exists               → never allocate to Backsplash;
 *      eligible Countertop absorbs instead.
 *   6. No eligible stone category at all  → the line stays UNRESOLVED internal
 *      pricing (never fabricate a customer breakdown; estimator review).
 *
 * All money is integer cents; every split uses the shared largest-remainder
 * allocator (allocateProportionally) so shares always sum back exactly.
 * No arbitrary balancing plug, ever.
 *
 * The result is frozen into the publish-time room pricing snapshot
 * (roomPricingPublishSnapshot.mjs) with this policy version so historical
 * Original views never re-derive allocations under newer policy or pricing.
 */

import { allocateProportionally } from "./customerRoomPricingProjection.mjs";

export const INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION =
  "internal_custom_line_allocation_v1";

function str(v) {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

function cents(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Stone category ownership from a custom line's category label.
 * @param {unknown} category
 * @returns {"countertop"|"backsplash"|null}
 */
export function stoneTargetForCategory(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("countertop") || c.includes("counter top")) return "countertop";
  if (c.includes("backsplash") || c.includes("splash")) return "backsplash";
  return null;
}

/**
 * Normalize snapshot-bound custom lines from Studio scope / calc shapes.
 * amountCents = quantity × unitPrice when lineTotal absent.
 *
 * @param {Array<object>|null|undefined} rawLines
 * @returns {Array<{
 *   lineKey: string, label: string, amountCents: number,
 *   customerFacing: boolean, roomId: string|null, roomName: string|null,
 *   category: string|null, quantity: number|null, unit: string|null
 * }>}
 */
export function normalizeSnapshotCustomLines(rawLines) {
  const out = [];
  for (const [i, row] of (Array.isArray(rawLines) ? rawLines : []).entries()) {
    if (!row || typeof row !== "object") continue;
    const label = str(row.label) || str(row.name) || str(row.item_name);
    if (!label) continue;
    let amountCents;
    if (row.amountCents != null) amountCents = cents(row.amountCents);
    else if (row.lineTotal != null || row.line_total != null) {
      amountCents = Math.round(Number(row.lineTotal ?? row.line_total) * 100) || 0;
    } else {
      const qty = Number(row.quantity ?? row.qty ?? 1) || 0;
      const unitPrice = Number(row.unitPrice ?? row.unit_price ?? 0) || 0;
      amountCents = Math.round(qty * unitPrice * 100);
    }
    out.push({
      lineKey: str(row.lineKey ?? row.line_key) || str(row.id) || `line-${i + 1}`,
      label,
      amountCents,
      customerFacing: Boolean(row.customerFacing ?? row.customer_facing ?? true),
      roomId: str(row.roomId ?? row.room_id),
      roomName: str(row.roomName ?? row.room_name),
      category: str(row.category),
      quantity: row.quantity != null ? Number(row.quantity) : null,
      unit: str(row.unit)
    });
  }
  return out;
}

/**
 * @param {{ roomId: string, countertopAmountCents: number, backsplashAmountCents: number }} room
 * @param {"countertop"|"backsplash"} category
 */
function roomEligibleFor(room, category) {
  if (category === "backsplash") return cents(room.backsplashAmountCents) > 0;
  return true; // every governed stone room has a countertop category
}

/**
 * Allocate one internal-only line into stone-category targets.
 * @returns {{ rule: string, targets: Array<{ roomId: string, category: string, allocatedCents: number }> }|null}
 *   null = unresolved (rule 6)
 */
function allocateLine(line, rooms) {
  const total = line.amountCents;
  const stoneCategory = stoneTargetForCategory(line.category);
  const anyBacksplash = rooms.some((r) => cents(r.backsplashAmountCents) > 0);

  const ownRoom = line.roomId
    ? rooms.find((r) => String(r.roomId) === String(line.roomId)) || null
    : line.roomName
      ? rooms.find(
          (r) => String(r.roomName || "").toLowerCase() === String(line.roomName).toLowerCase()
        ) || null
      : null;

  // Rule 5 overlay: a backsplash-owned line with no backsplash anywhere falls
  // through to Countertop allocation instead.
  const effectiveCategory =
    stoneCategory === "backsplash" && !anyBacksplash ? "countertop" : stoneCategory;

  if (ownRoom) {
    if (effectiveCategory) {
      const category =
        effectiveCategory === "backsplash" && !roomEligibleFor(ownRoom, "backsplash")
          ? "countertop"
          : effectiveCategory;
      return {
        rule: "room_category",
        targets: [{ roomId: String(ownRoom.roomId), category, allocatedCents: total }]
      };
    }
    // Rule 2 — proportional across the room's own stone amounts.
    const weights = [
      Math.max(0, cents(ownRoom.countertopAmountCents)),
      Math.max(0, cents(ownRoom.backsplashAmountCents))
    ];
    const hasBacksplash = weights[1] > 0;
    if (!hasBacksplash) {
      return {
        rule: "room_countertop_only",
        targets: [{ roomId: String(ownRoom.roomId), category: "countertop", allocatedCents: total }]
      };
    }
    const [ct, bs] = allocateProportionally(total, weights);
    const targets = [];
    if (ct !== 0) targets.push({ roomId: String(ownRoom.roomId), category: "countertop", allocatedCents: ct });
    if (bs !== 0) targets.push({ roomId: String(ownRoom.roomId), category: "backsplash", allocatedCents: bs });
    if (!targets.length) {
      targets.push({ roomId: String(ownRoom.roomId), category: "countertop", allocatedCents: total });
    }
    return { rule: "room_proportional", targets };
  }

  if (!rooms.length) return null; // rule 6 — nothing to absorb into

  if (effectiveCategory) {
    // Rule 3 — across eligible rooms within the category.
    const eligible = rooms.filter((r) => roomEligibleFor(r, effectiveCategory));
    if (!eligible.length) return null;
    const weights = eligible.map((r) =>
      Math.max(
        0,
        cents(
          effectiveCategory === "backsplash" ? r.backsplashAmountCents : r.countertopAmountCents
        )
      )
    );
    const shares = allocateProportionally(total, weights);
    return {
      rule: "project_category_proportional",
      targets: eligible
        .map((r, i) => ({
          roomId: String(r.roomId),
          category: effectiveCategory,
          allocatedCents: shares[i]
        }))
        .filter((t) => t.allocatedCents !== 0 || total === 0)
    };
  }

  // Rule 4 — across all governed room Countertop and Backsplash amounts.
  const cells = [];
  for (const r of rooms) {
    cells.push({ roomId: String(r.roomId), category: "countertop", weight: Math.max(0, cents(r.countertopAmountCents)) });
    if (cents(r.backsplashAmountCents) > 0) {
      cells.push({ roomId: String(r.roomId), category: "backsplash", weight: Math.max(0, cents(r.backsplashAmountCents)) });
    }
  }
  if (!cells.length) return null;
  const shares = allocateProportionally(total, cells.map((c) => c.weight));
  return {
    rule: "project_proportional",
    targets: cells
      .map((c, i) => ({ roomId: c.roomId, category: c.category, allocatedCents: shares[i] }))
      .filter((t) => t.allocatedCents !== 0 || total === 0)
  };
}

/**
 * Allocate every internal-only custom line into stone-category targets.
 * Pure and deterministic: identical inputs always produce identical output.
 *
 * @param {{
 *   lines: ReturnType<typeof normalizeSnapshotCustomLines>,
 *   rooms: Array<{ roomId: string, roomName?: string|null, countertopAmountCents: number, backsplashAmountCents: number }>,
 *   author?: string|null,
 *   timestamp?: string|null
 * }} args
 */
export function allocateInternalOnlyCustomLines(args) {
  const rooms = Array.isArray(args?.rooms) ? args.rooms : [];
  const internalLines = (Array.isArray(args?.lines) ? args.lines : []).filter(
    (l) => l && l.customerFacing === false
  );

  const allocations = [];
  const unresolved = [];
  let totalAllocatedCents = 0;

  for (const line of internalLines) {
    const result = allocateLine(line, rooms);
    if (!result) {
      unresolved.push({
        lineKey: line.lineKey,
        label: line.label,
        amountCents: line.amountCents,
        reason: "no_eligible_stone_category"
      });
      continue;
    }
    const allocatedSum = result.targets.reduce((s, t) => s + t.allocatedCents, 0);
    // Invariant: largest-remainder shares always reconcile to the line amount.
    if (allocatedSum !== line.amountCents) {
      unresolved.push({
        lineKey: line.lineKey,
        label: line.label,
        amountCents: line.amountCents,
        reason: "allocation_mismatch"
      });
      continue;
    }
    totalAllocatedCents += line.amountCents;
    allocations.push({
      lineKey: line.lineKey,
      label: line.label,
      originalAmountCents: line.amountCents,
      customerVisible: false,
      policyVersion: INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION,
      allocationRule: result.rule,
      targets: result.targets,
      author: args?.author ?? null,
      timestamp: args?.timestamp ?? null
    });
  }

  return {
    policyVersion: INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION,
    allocations,
    unresolved,
    totalAllocatedCents,
    unresolvedCents: unresolved.reduce((s, u) => s + u.amountCents, 0)
  };
}
