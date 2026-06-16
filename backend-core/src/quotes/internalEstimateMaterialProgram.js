/**
 * Internal Estimate material program resolution (backend parity with app-quote).
 */

import {
  outOfCollectionPremiumPercentForPricingMode,
  resolveOutOfCollectionPricingPolicy
} from "./internalEstimateOutOfCollectionPolicy.js";

export const COMPARABLE_OUT_OF_COLLECTION_PRICE_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F"
];

const COMPARABLE_GROUP_SET = new Set(COMPARABLE_OUT_OF_COLLECTION_PRICE_GROUPS);

export function normalizeMaterialProgramDefault(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "out_of_collection" ? "out_of_collection" : "elite_100";
}

export function normalizeMaterialProgramOverride(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "elite_100") return "elite_100";
  if (v === "out_of_collection") return "out_of_collection";
  return "inherit";
}

export function isVanityProgramRoomForMaterialProgram(room) {
  if (!room || typeof room !== "object") return false;
  const roomType = String(room.roomType ?? room.room_type ?? "");
  const vanity = room.vanity && typeof room.vanity === "object" ? room.vanity : {};
  const isProgram = vanity.isVanityProgram ?? vanity.is_vanity_program;
  return roomType === "Vanity" && isProgram !== false;
}

/**
 * @param {Record<string, unknown>} room
 * @param {"elite_100"|"out_of_collection"} [materialProgramDefault]
 */
export function resolveRoomMaterialProgram(room, materialProgramDefault = "elite_100") {
  if (isVanityProgramRoomForMaterialProgram(room)) return "elite_100";
  const override = normalizeMaterialProgramOverride(room.materialProgramOverride ?? room.material_program_override);
  if (override === "elite_100") return "elite_100";
  if (override === "out_of_collection") return "out_of_collection";
  return normalizeMaterialProgramDefault(materialProgramDefault);
}

export function isValidOutOfCollectionPriceGroup(materialGroup) {
  return COMPARABLE_GROUP_SET.has(String(materialGroup || "").trim());
}

/**
 * @param {ReadonlyArray<Record<string, unknown>>} rooms
 * @param {"elite_100"|"out_of_collection"} [materialProgramDefault]
 */
export function validateOutOfCollectionRooms(rooms, materialProgramDefault = "elite_100") {
  const roomNames = [];
  for (const room of rooms || []) {
    if (resolveRoomMaterialProgram(room, materialProgramDefault) !== "out_of_collection") continue;
    const mg = String(room.materialGroup ?? room.group ?? "").trim();
    if (!isValidOutOfCollectionPriceGroup(mg)) {
      roomNames.push(String(room.name ?? room.room_name ?? room.room ?? "Room").trim() || "Room");
    }
  }
  if (!roomNames.length) {
    return { valid: true, roomNames: [], message: null };
  }
  return {
    valid: false,
    roomNames,
    message: "Out-of-Collection rooms require a comparable price group."
  };
}

/**
 * @param {number} eligibleMaterialWithTax
 * @param {number} premiumPercent
 */
export function computeOutOfCollectionPremiumAmounts(eligibleMaterialWithTax, premiumPercent) {
  const base = round2(eligibleMaterialWithTax);
  const pct = Math.max(0, Number(premiumPercent) || 0);
  if (pct <= 0 || base <= 0) {
    return {
      eligibleMaterialWithTax: base,
      premiumPercent: pct,
      premiumAmount: 0,
      applied: false
    };
  }
  const premiumAmount = round2(base * (pct / 100));
  return {
    eligibleMaterialWithTax: base,
    premiumPercent: pct,
    premiumAmount,
    applied: premiumAmount > 0
  };
}

/**
 * @param {"wholesale"|"direct"} materialBasis
 */
export function resolveOutOfCollectionPremiumPercent(materialBasis) {
  return outOfCollectionPremiumPercentForPricingMode(materialBasis, resolveOutOfCollectionPricingPolicy());
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
