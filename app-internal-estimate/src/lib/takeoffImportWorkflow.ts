/**
 * Client mirror of backend-core/src/takeoff/takeoffImportWorkflow.mjs
 */

import type { RoomDraft } from "@quote-lib/quoteTypes";
import type { TakeoffMeasurementDeltaResult } from "@quote-lib/takeoffImportMeasurements";
import { roomTakeoffVerificationComplete } from "@quote-lib/takeoffImportMeasurements";

export type TakeoffSuggestedAddOnReviewStatus = "pending" | "accepted" | "ignored" | "needs_follow_up";

export type TakeoffSuggestedAddOnReview = {
  key: string;
  type: string;
  label: string;
  status: TakeoffSuggestedAddOnReviewStatus;
  mappedAddOnKey?: string | null;
  note?: string;
};

export function suggestedAddOnKey(addon: { type?: string; label?: string }): string {
  return `${String(addon.type ?? "note")}:${String(addon.label ?? "").trim().toLowerCase()}`;
}

export function mapSuggestedAddOnToCatalogKey(type?: string): string | null {
  switch (String(type ?? "")) {
    case "sink_cutout":
      return "qty-sink";
    case "cooktop_cutout":
      return "qty-cook";
    case "cord_hole":
      return "qty-outlet";
    default:
      return null;
  }
}

export function initSuggestedAddOnReviews(
  suggestedAddOns: Array<{ type?: string; label?: string; quantity?: number }> | undefined,
  existing?: TakeoffSuggestedAddOnReview[]
): TakeoffSuggestedAddOnReview[] {
  const byKey = new Map((existing ?? []).map((r) => [r.key, r]));
  return (suggestedAddOns ?? []).map((addon) => {
    const key = suggestedAddOnKey(addon);
    const prev = byKey.get(key);
    if (prev) return prev;
    return {
      key,
      type: String(addon.type ?? "fabrication_note"),
      label: String(addon.label ?? ""),
      status: "pending",
      mappedAddOnKey: mapSuggestedAddOnToCatalogKey(addon.type),
      note: "",
    };
  });
}

export function allSuggestedAddOnsReviewed(reviews: TakeoffSuggestedAddOnReview[]): boolean {
  if (!reviews.length) return true;
  return reviews.every((r) => r.status !== "pending");
}

export function importedRoomMaterialSelected(
  room: RoomDraft,
  colorTbd: boolean,
  quoteDefaultCatalogId: string | null
): boolean {
  const group = String(room.materialGroup ?? "").trim();
  const catalog = String(room.materialCatalogId ?? "").trim();
  if (group && !colorTbd) return true;
  if (catalog) return true;
  return Boolean(quoteDefaultCatalogId) && !colorTbd;
}

export function importedRoomsMissingMaterial(
  roomDrafts: RoomDraft[],
  colorTbd: boolean,
  quoteDefaultCatalogId: string | null
): RoomDraft[] {
  return roomDrafts.filter(
    (r) => r.takeoffImportSource?.importedFromTakeoff && !importedRoomMaterialSelected(r, colorTbd, quoteDefaultCatalogId)
  );
}

export function markRoomFullyVerified(room: RoomDraft): RoomDraft {
  return {
    ...room,
    takeoffImportVerification: {
      ...(room.takeoffImportVerification ?? {}),
      measurementsVerified: true,
      addonsReviewed: true,
      notesReviewed: true,
    },
  };
}

export function canMarkAllImportedRoomsVerified(rooms: RoomDraft[], exceedsThreshold: boolean): boolean {
  if (exceedsThreshold) return false;
  return rooms.some((r) => r.takeoffImportSource?.importedFromTakeoff);
}

export function markAllImportedRoomsVerified(rooms: RoomDraft[]): RoomDraft[] {
  return rooms.map((r) => (r.takeoffImportSource?.importedFromTakeoff ? markRoomFullyVerified(r) : r));
}

export type TakeoffQuoteReadinessItem = {
  key: string;
  label: string;
  complete: boolean;
  detail?: string;
};

export function evaluateTakeoffQuoteReadiness(params: {
  hasActiveImport: boolean;
  roomDrafts: RoomDraft[];
  measurementDeltas: TakeoffMeasurementDeltaResult | null;
  colorTbd: boolean;
  quoteDefaultCatalogId: string | null;
  accountComplete: boolean;
  projectComplete: boolean;
  materialComplete: boolean;
  addonsReviewed: boolean;
  notesReviewed: boolean;
  readyToCalculate: boolean;
  suggestedAddOnReviews: TakeoffSuggestedAddOnReview[];
}) {
  const importedRooms = params.roomDrafts.filter((r) => r.takeoffImportSource?.importedFromTakeoff);
  const roomsVerified =
    importedRooms.length === 0 || importedRooms.every((r) => roomTakeoffVerificationComplete(r));
  const deltasPresent = Boolean(params.measurementDeltas?.exceedsThreshold);
  const missingMaterialRooms = importedRoomsMissingMaterial(
    params.roomDrafts,
    params.colorTbd,
    params.quoteDefaultCatalogId
  );

  const items: TakeoffQuoteReadinessItem[] = [
    {
      key: "measurements_imported",
      label: "Measurements imported",
      complete: params.hasActiveImport && importedRooms.length > 0,
    },
    {
      key: "measurement_deltas",
      label: "Measurement deltas within threshold",
      complete: !deltasPresent,
      detail: deltasPresent ? "Review edited measurements (>2 sf)" : undefined,
    },
    {
      key: "rooms_verified",
      label: "Imported rooms verified",
      complete: roomsVerified,
      detail: importedRooms.length
        ? `${importedRooms.filter((r) => roomTakeoffVerificationComplete(r)).length}/${importedRooms.length}`
        : undefined,
    },
    {
      key: "account_project",
      label: "Account / project info complete",
      complete: params.accountComplete && params.projectComplete,
    },
    {
      key: "material_color",
      label: "Material / color selected",
      complete: params.materialComplete,
      detail: missingMaterialRooms.length
        ? `${missingMaterialRooms.length} imported room(s) need selection`
        : params.colorTbd
          ? "Color TBD"
          : undefined,
    },
    {
      key: "addons_reviewed",
      label: "Suggested add-ons reviewed",
      complete: params.addonsReviewed && allSuggestedAddOnsReviewed(params.suggestedAddOnReviews),
    },
    { key: "notes_reviewed", label: "Notes reviewed", complete: params.notesReviewed },
    {
      key: "ready",
      label: "Ready to calculate / save",
      complete: params.readyToCalculate,
    },
  ];

  return {
    items,
    readyToCalculate: params.readyToCalculate,
    missingMaterialRoomIds: missingMaterialRooms.map((r) => r.id),
  };
}
