/**
 * AI Takeoff import estimator workflow helpers (v6.3).
 *
 * Pure functions — no pricing math changes.
 *
 * @module takeoffImportWorkflow
 */

import { computeTakeoffMeasurementDeltas, roomTakeoffVerificationComplete } from "./takeoffImportMeasurements.mjs";

export const SUGGESTED_ADDON_STATUSES = ["pending", "accepted", "ignored", "needs_follow_up"];

export function suggestedAddOnKey(addon) {
  const type = String(addon?.type ?? "note");
  const label = String(addon?.label ?? "").trim().toLowerCase();
  return `${type}:${label}`;
}

export function mapSuggestedAddOnToCatalogKey(type) {
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

/**
 * @param {Array<{ type?: string, label?: string, quantity?: number }>} suggestedAddOns
 * @param {Array<{ key: string, type: string, label: string, status: string, mappedAddOnKey?: string|null, note?: string }>|undefined} existing
 */
export function initSuggestedAddOnReviews(suggestedAddOns, existing) {
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

export function allSuggestedAddOnsReviewed(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return true;
  return reviews.every((r) => r.status && r.status !== "pending");
}

export function importedRoomMaterialSelected(room, colorTbd, quoteDefaultCatalogId) {
  const group = String(room?.materialGroup ?? "").trim();
  const catalog = String(room?.materialCatalogId ?? "").trim();
  if (group && !colorTbd) return true;
  if (catalog) return true;
  return Boolean(quoteDefaultCatalogId) && !colorTbd;
}

export function importedRoomsMissingMaterial(roomDrafts, colorTbd, quoteDefaultCatalogId) {
  return (roomDrafts ?? []).filter(
    (r) => r?.takeoffImportSource?.importedFromTakeoff && !importedRoomMaterialSelected(r, colorTbd, quoteDefaultCatalogId)
  );
}

export function markRoomFullyVerified(room) {
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

export function canMarkAllImportedRoomsVerified(rooms, exceedsThreshold) {
  if (exceedsThreshold) return false;
  const imported = (rooms ?? []).filter((r) => r?.takeoffImportSource?.importedFromTakeoff);
  return imported.length > 0;
}

export function markAllImportedRoomsVerified(rooms) {
  return (rooms ?? []).map((r) =>
    r?.takeoffImportSource?.importedFromTakeoff ? markRoomFullyVerified(r) : r
  );
}

/**
 * @param {object} params
 */
export function evaluateTakeoffQuoteReadiness(params) {
  const {
    hasActiveImport = false,
    roomDrafts = [],
    measurementDeltas = null,
    colorTbd = true,
    quoteDefaultCatalogId = null,
    accountComplete = false,
    projectComplete = false,
    materialComplete = false,
    addonsReviewed = false,
    notesReviewed = false,
    readyToCalculate = false,
    suggestedAddOnReviews = [],
  } = params;

  const importedRooms = roomDrafts.filter((r) => r?.takeoffImportSource?.importedFromTakeoff);
  const roomsVerified =
    importedRooms.length === 0 || importedRooms.every((r) => roomTakeoffVerificationComplete(r));
  const deltasPresent = Boolean(measurementDeltas?.exceedsThreshold);
  const missingMaterialRooms = importedRoomsMissingMaterial(roomDrafts, colorTbd, quoteDefaultCatalogId);

  const items = [
    { key: "measurements_imported", label: "Measurements imported", complete: hasActiveImport && importedRooms.length > 0 },
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
      detail: importedRooms.length ? `${importedRooms.filter((r) => roomTakeoffVerificationComplete(r)).length}/${importedRooms.length}` : undefined,
    },
    { key: "account_project", label: "Account / project info complete", complete: accountComplete && projectComplete },
    {
      key: "material_color",
      label: "Material / color selected",
      complete: materialComplete,
      detail: missingMaterialRooms.length ? `${missingMaterialRooms.length} imported room(s) need selection` : colorTbd ? "Color TBD" : undefined,
    },
    {
      key: "addons_reviewed",
      label: "Suggested add-ons reviewed",
      complete: addonsReviewed && allSuggestedAddOnsReviewed(suggestedAddOnReviews),
    },
    { key: "notes_reviewed", label: "Notes reviewed", complete: notesReviewed },
    { key: "ready", label: "Ready to calculate / save", complete: readyToCalculate },
  ];

  return {
    items,
    readyToCalculate,
    missingMaterialRoomIds: missingMaterialRooms.map((r) => r.id),
  };
}
