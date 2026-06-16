/**
 * Internal Estimate material program resolution and Out-of-Collection premium helpers.
 * Gated to internal_quote flows via InternalMeasureOptions — not used by Public/Partner Quote.
 */

import type { MaterialProgram, MaterialProgramOverride, RoomDraft } from "./quoteTypes";
import {
  outOfCollectionPremiumPercentForPricingMode,
  resolveOutOfCollectionPricingPolicy,
  type OutOfCollectionPricingPolicy
} from "./internalEstimateOutOfCollectionPolicy";
import { round2 } from "./measurementEngine";

export const COMPARABLE_OUT_OF_COLLECTION_PRICE_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F"
] as const;

const COMPARABLE_GROUP_SET = new Set<string>(COMPARABLE_OUT_OF_COLLECTION_PRICE_GROUPS);

export function normalizeMaterialProgramDefault(raw: unknown): MaterialProgram {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "out_of_collection" ? "out_of_collection" : "elite_100";
}

export function normalizeMaterialProgramOverride(raw: unknown): MaterialProgramOverride {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "elite_100") return "elite_100";
  if (v === "out_of_collection") return "out_of_collection";
  return "inherit";
}

export function isVanityProgramRoomForMaterialProgram(room: RoomDraft): boolean {
  return room.roomType === "Vanity" && room.vanity.isVanityProgram !== false;
}

/** Resolved material program for pricing — vanity program rooms always elite_100. */
export function resolveRoomMaterialProgram(
  room: RoomDraft,
  materialProgramDefault: MaterialProgram = "elite_100"
): MaterialProgram {
  if (isVanityProgramRoomForMaterialProgram(room)) return "elite_100";
  const override = normalizeMaterialProgramOverride(room.materialProgramOverride);
  if (override === "elite_100") return "elite_100";
  if (override === "out_of_collection") return "out_of_collection";
  return normalizeMaterialProgramDefault(materialProgramDefault);
}

export function isValidOutOfCollectionPriceGroup(materialGroup: string): boolean {
  return COMPARABLE_GROUP_SET.has(String(materialGroup || "").trim());
}

export type OutOfCollectionValidationResult = {
  valid: boolean;
  roomNames: string[];
  message: string | null;
};

export function validateOutOfCollectionRooms(
  rooms: RoomDraft[],
  materialProgramDefault: MaterialProgram = "elite_100"
): OutOfCollectionValidationResult {
  const roomNames: string[] = [];
  for (const room of rooms) {
    if (resolveRoomMaterialProgram(room, materialProgramDefault) !== "out_of_collection") continue;
    if (!isValidOutOfCollectionPriceGroup(room.materialGroup)) {
      roomNames.push(room.name.trim() || room.roomType || "Room");
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

export type OutOfCollectionPremiumAmounts = {
  eligibleMaterialWithTax: number;
  premiumPercent: number;
  premiumAmount: number;
  applied: boolean;
};

/** Apply OOC premium on post-tax eligible countertop + backsplash/FHB material $. */
export function computeOutOfCollectionPremiumAmounts(
  eligibleMaterialWithTax: number,
  premiumPercent: number
): OutOfCollectionPremiumAmounts {
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

export function resolveOutOfCollectionPremiumPercent(
  materialBasis: "wholesale" | "direct",
  policy: OutOfCollectionPricingPolicy = resolveOutOfCollectionPricingPolicy()
): number {
  return outOfCollectionPremiumPercentForPricingMode(materialBasis, policy);
}

export type OutOfCollectionRoomSnapshot = {
  roomId: string;
  roomName: string;
  resolvedMaterialProgram: MaterialProgram;
  eligibleMaterialAmount: number;
  premiumAmount: number;
  assignedPriceGroup: string;
  colorName?: string;
  supplierName?: string;
};

export function buildOutOfCollectionRoomSnapshot(
  room: RoomDraft,
  materialProgramDefault: MaterialProgram,
  eligibleMaterialWithTax: number,
  premiumAmount: number
): OutOfCollectionRoomSnapshot | null {
  const resolved = resolveRoomMaterialProgram(room, materialProgramDefault);
  if (resolved !== "out_of_collection" || premiumAmount <= 0) return null;
  return {
    roomId: room.id,
    roomName: room.name.trim() || room.roomType || "Room",
    resolvedMaterialProgram: resolved,
    eligibleMaterialAmount: round2(eligibleMaterialWithTax),
    premiumAmount: round2(premiumAmount),
    assignedPriceGroup: String(room.materialGroup || "").trim(),
    colorName: room.materialColor?.trim() || undefined,
    supplierName: room.materialSupplier?.trim() || undefined
  };
}
