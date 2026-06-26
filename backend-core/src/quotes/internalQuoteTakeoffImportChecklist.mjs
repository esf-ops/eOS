/**
 * Takeoff import completion checklist for Internal Estimate (v6.1).
 *
 * Pure function — no pricing math changes.
 *
 * @module internalQuoteTakeoffImportChecklist
 */

import { roomTakeoffVerificationComplete } from "../takeoff/takeoffImportMeasurements.mjs";

/**
 * @param {{
 *   accountName?: string,
 *   accountPhone?: string,
 *   accountEmail?: string,
 *   customerName?: string,
 *   projectName?: string,
 *   projectAddress?: string,
 *   city?: string,
 *   state?: string,
 *   branch?: string,
 *   salesRep?: string,
 *   internalPricingMode?: string|null,
 *   roomDrafts?: Array<{ materialGroup?: string, materialCatalogId?: string|null, takeoffImportSource?: { importedFromTakeoff?: boolean } }>,
 *   colorTbd?: boolean,
 *   quoteDefaultCatalogId?: string|null,
 *   suggestedAddOnCount?: number,
 *   addonsReviewed?: boolean,
 *   customerFacingNotes?: string,
 *   notesReviewed?: boolean,
 *   totalSf?: number,
 * }} params
 */
export function evaluateTakeoffImportCompletionChecklist(params) {
  const {
    accountName = "",
    accountPhone = "",
    accountEmail = "",
    customerName = "",
    projectName = "",
    projectAddress = "",
    city = "",
    state = "",
    branch = "",
    salesRep = "",
    internalPricingMode = null,
    roomDrafts = [],
    colorTbd = true,
    quoteDefaultCatalogId = null,
    suggestedAddOnCount = 0,
    addonsReviewed = false,
    customerFacingNotes = "",
    notesReviewed = false,
    totalSf = 0,
  } = params;

  const importedRooms = roomDrafts.filter((r) => r?.takeoffImportSource?.importedFromTakeoff);
  const roomsNeedingMaterial = importedRooms.length ? importedRooms : roomDrafts;

  const hasAccount =
    Boolean(String(accountName).trim()) &&
    (Boolean(String(accountPhone).trim()) || Boolean(String(accountEmail).trim()) || Boolean(String(customerName).trim()));

  const hasProject =
    Boolean(String(projectName).trim()) &&
    (Boolean(String(projectAddress).trim()) || (Boolean(String(city).trim()) && Boolean(String(state).trim())));

  const hasBranchSales = Boolean(String(branch).trim()) && Boolean(String(salesRep).trim());
  const hasPricingMode = internalPricingMode === "direct" || internalPricingMode === "wholesale";

  const materialComplete = roomsNeedingMaterial.every((r) => {
    const group = String(r.materialGroup ?? "").trim();
    const catalog = String(r.materialCatalogId ?? "").trim();
    if (group && !colorTbd) return true;
    if (catalog) return true;
    return Boolean(quoteDefaultCatalogId) && !colorTbd;
  });

  const addonsComplete = suggestedAddOnCount === 0 || addonsReviewed;
  const notesComplete = notesReviewed || Boolean(String(customerFacingNotes).trim());
  const hasMeasurements = totalSf > 0;

  const importedRoomsForVerify = roomDrafts.filter((r) => r?.takeoffImportSource?.importedFromTakeoff);
  const roomsVerified =
    importedRoomsForVerify.length === 0 ||
    importedRoomsForVerify.every((r) => roomTakeoffVerificationComplete(r));

  /** @type {Array<{ key: string, label: string, complete: boolean, detail?: string }>} */
  const items = [
    { key: "account", label: "Account / contact", complete: hasAccount },
    { key: "project", label: "Project info", complete: hasProject },
    { key: "branch", label: "Branch & salesperson", complete: hasBranchSales },
    { key: "pricing_mode", label: "Pricing mode", complete: hasPricingMode },
    {
      key: "material",
      label: "Material group / color per imported room",
      complete: materialComplete,
      detail: colorTbd ? "Color still TBD" : undefined,
    },
    {
      key: "addons",
      label: "Add-ons / cutouts reviewed",
      complete: addonsComplete,
      detail: suggestedAddOnCount > 0 ? `${suggestedAddOnCount} suggested from takeoff` : undefined,
    },
    { key: "notes", label: "Customer notes reviewed", complete: notesComplete },
    {
      key: "room_verification",
      label: "Imported rooms verified",
      complete: roomsVerified,
      detail:
        importedRoomsForVerify.length > 0
          ? `${importedRoomsForVerify.filter((r) => roomTakeoffVerificationComplete(r)).length}/${importedRoomsForVerify.length} rooms`
          : undefined,
    },
    { key: "measurements", label: "Measurements present", complete: hasMeasurements },
  ];

  const completeCount = items.filter((i) => i.complete).length;
  const readyToCalculate = items.every((i) => i.complete);

  return {
    items,
    completeCount,
    totalCount: items.length,
    score: items.length ? Math.round((completeCount / items.length) * 100) : 0,
    readyToCalculate,
  };
}

/**
 * @param {unknown} takeoffImport
 */
export function isActiveTakeoffImport(takeoffImport) {
  if (!takeoffImport || typeof takeoffImport !== "object") return false;
  const ti = /** @type {Record<string, unknown>} */ (takeoffImport);
  return ti.status !== "detached" && Boolean(ti.takeoffJobId);
}
