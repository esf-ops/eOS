/**
 * Room-level backsplash scope for Studio Estimate Scope.
 *
 * Takeoff authority for length = sum of approved run lengths where
 * `backsplashEligible === true` (never room/piece name heuristics).
 * Customer later chooses No / 4-inch / custom / full-height; Studio seeds a
 * provisional standard 4" include when any eligible length exists.
 */

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Derive include / height / SF from an approved Takeoff import room.
 * Does not silently default every room to backsplash.
 *
 * @param {object} importRoom
 */
export function deriveRoomBacksplashFromImportRoom(importRoom) {
  const pieces = Array.isArray(importRoom?.pieces) ? importRoom.pieces : [];
  let backsplashSqft = 0;
  let measuredLengthIn = 0;
  let maxHeightIn = 0;
  let heightMode = "none";
  let source = null;
  let sawEligibilityField = false;

  // Prefer room-level aggregate from the import payload when present.
  const roomEligibleLen = Number(importRoom?.eligibleBacksplashLengthIn);
  if (Number.isFinite(roomEligibleLen) && roomEligibleLen > 0) {
    measuredLengthIn = roomEligibleLen;
    heightMode = "standard";
    source = "estimator";
    sawEligibilityField = true;
  }

  for (const p of pieces) {
    const bs = p?.backsplash && typeof p.backsplash === "object" ? p.backsplash : null;
    const pieceType = String(p?.pieceType ?? "").toLowerCase();
    const isBsPiece =
      pieceType.includes("backsplash") ||
      pieceType === "fhb" ||
      pieceType === "splash";

    // New contract: per-run boolean eligibility on counter pieces.
    if (typeof p?.backsplashEligible === "boolean" || typeof bs?.eligible === "boolean") {
      sawEligibilityField = true;
      const eligible =
        typeof p?.backsplashEligible === "boolean"
          ? p.backsplashEligible
          : Boolean(bs?.eligible);
      if (!eligible) continue;
      if (!(Number.isFinite(roomEligibleLen) && roomEligibleLen > 0)) {
        measuredLengthIn += Number(bs?.linearIn) || Number(p.lengthIn) || 0;
      }
      // Optional authoritative vertical height (FHB / custom) — never invent 4" here.
      const explicitH = Number(bs?.heightIn);
      if (Number.isFinite(explicitH) && explicitH > 0) {
        maxHeightIn = Math.max(maxHeightIn, explicitH);
        if (bs?.type === "full_height" || explicitH >= 48) heightMode = "full_height";
        else if (bs?.type === "high" || explicitH > 4.5) {
          if (heightMode !== "full_height") heightMode = "custom";
        } else if (heightMode === "none") heightMode = "standard";
        if (Number(bs?.sqft) > 0) backsplashSqft += Number(bs.sqft);
      } else if (heightMode === "none") {
        heightMode = "standard";
      }
      source = source || "estimator";
      continue;
    }

    if (bs && bs.type && bs.type !== "none") {
      backsplashSqft += Number(bs.sqft) || 0;
      measuredLengthIn += Number(bs.linearIn) || 0;
      maxHeightIn = Math.max(maxHeightIn, Number(bs.heightIn) || 0);
      if (bs.type === "full_height") heightMode = "full_height";
      else if (bs.type === "high" && heightMode !== "full_height") heightMode = "custom";
      else if (heightMode === "none") heightMode = "standard";
      source = "ai";
    } else if (isBsPiece) {
      backsplashSqft += Number(p.sqft) || 0;
      measuredLengthIn += Number(p.lengthIn) || 0;
      maxHeightIn = Math.max(maxHeightIn, Number(p.depthIn) || 0);
      if (pieceType === "fhb" || maxHeightIn >= 48) heightMode = "full_height";
      else if (maxHeightIn > 4.5 && heightMode !== "full_height") heightMode = "custom";
      else if (heightMode === "none") heightMode = "standard";
      source = source || "ai";
    }
  }

  measuredLengthIn = round2(measuredLengthIn);
  const includeBacksplash =
    backsplashSqft > 0 || measuredLengthIn > 0 || maxHeightIn > 0;

  /** @type {number|null} */
  let backsplashHeightIn = null;
  if (includeBacksplash) {
    if (maxHeightIn > 0) {
      backsplashHeightIn = maxHeightIn;
      if (heightMode === "none") {
        heightMode = maxHeightIn >= 48 ? "full_height" : maxHeightIn > 4.5 ? "custom" : "standard";
      }
    } else if (sawEligibilityField || measuredLengthIn > 0) {
      // Eligible length without vertical height → provisional Studio seed at 4".
      // Customer Digital Estimate still chooses the real mode later.
      backsplashHeightIn = 4;
      heightMode = "standard";
      source = source || "calculated";
    } else {
      backsplashHeightIn = 4;
      heightMode = "standard";
      source = source || "calculated";
    }
  }

  if (
    includeBacksplash &&
    backsplashSqft <= 0 &&
    measuredLengthIn > 0 &&
    backsplashHeightIn != null &&
    backsplashHeightIn > 0
  ) {
    backsplashSqft = round2((measuredLengthIn * backsplashHeightIn) / 144);
    source = source || "calculated";
  }

  return {
    includeBacksplash,
    backsplashHeightIn: includeBacksplash ? backsplashHeightIn : null,
    backsplashMeasuredLengthIn: measuredLengthIn > 0 ? round2(measuredLengthIn) : null,
    backsplashSqft: includeBacksplash ? round2(backsplashSqft) : 0,
    backsplashHeightMode: includeBacksplash ? heightMode : "none",
    backsplashSource: includeBacksplash ? source || "calculated" : null,
    eligibleRunCount: Number(importRoom?.eligibleRunCount) || null,
    excludedRunCount: Number(importRoom?.excludedRunCount) || null
  };
}

/**
 * Recompute chargeable splash SF when estimator toggles include/height/length.
 * @param {object} room
 * @param {Partial<object>} [patch]
 */
export function applyRoomBacksplashPatch(room, patch = {}) {
  const next = { ...room, ...patch };
  const include =
    next.includeBacksplash === true ||
    (next.includeBacksplash == null && Number(next.backsplashSqft) > 0);

  if (!include) {
    return {
      ...next,
      includeBacksplash: false,
      backsplashSqft: 0,
      backsplashHeightMode: next.backsplashHeightMode === "full_height" ||
        next.backsplashHeightMode === "custom" ||
        next.backsplashHeightMode === "standard"
        ? next.backsplashHeightMode
        : "none",
      backsplashSource: next.backsplashSource || "estimator"
    };
  }

  let heightIn = Number(next.backsplashHeightIn);
  let heightMode = String(next.backsplashHeightMode || "standard");
  if (!Number.isFinite(heightIn) || heightIn <= 0) {
    if (heightMode === "full_height") {
      heightIn = Number(next.backsplashHeightIn) || 0;
    } else {
      heightIn = 4;
      heightMode = heightMode === "none" ? "standard" : heightMode;
    }
  }
  if (heightMode === "none") heightMode = heightIn > 4.5 ? "custom" : "standard";
  if (heightIn >= 48) heightMode = "full_height";
  else if (heightIn > 4.5 && heightMode === "standard") heightMode = "custom";

  const measured = Number(next.backsplashMeasuredLengthIn);
  let sqft = Number(next.backsplashSqft);
  const lengthKnown = Number.isFinite(measured) && measured > 0;
  const heightKnown = Number.isFinite(heightIn) && heightIn > 0;
  // Recalculate when length+height known and SF was not explicitly patched alone.
  if (lengthKnown && heightKnown && patch.backsplashSqft == null) {
    sqft = round2((measured * heightIn) / 144);
  }
  if (!Number.isFinite(sqft) || sqft < 0) sqft = 0;

  return {
    ...next,
    includeBacksplash: true,
    backsplashHeightIn: heightKnown ? heightIn : 4,
    backsplashHeightMode: heightMode,
    backsplashSqft: sqft,
    backsplashSource: "estimator"
  };
}

/**
 * Pricing input: zero splash when not included.
 * @param {object} room
 */
export function chargeableBacksplashForPricing(room) {
  const legacyIncluded =
    room?.includeBacksplash == null && Number(room?.backsplashSqft) > 0;
  const include = room?.includeBacksplash === true || legacyIncluded;
  if (!include) {
    return { backsplashSqft: 0, backsplashHeightIn: 0 };
  }
  const height = Number(room?.backsplashHeightIn);
  return {
    backsplashSqft: Math.max(0, Number(room?.backsplashSqft) || 0),
    backsplashHeightIn: Number.isFinite(height) && height > 0 ? height : 4
  };
}
