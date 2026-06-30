/**
 * Client mirror of backend-core/src/quotes/internalQuoteTakeoffImportChecklist.mjs
 * for Internal Estimate UI. Keep in sync with backend tests.
 */

import type { RoomDraft } from "@quote-lib/quoteTypes";
import { roomTakeoffVerificationComplete } from "@quote-lib/takeoffImportMeasurements";
import { allSuggestedAddOnsReviewed } from "./takeoffImportWorkflow";

export interface TakeoffImportChecklistItem {
  key: string;
  label: string;
  complete: boolean;
  detail?: string;
}

export function isActiveTakeoffImport(takeoffImport: unknown): boolean {
  if (!takeoffImport || typeof takeoffImport !== "object") return false;
  const ti = takeoffImport as Record<string, unknown>;
  return ti.status !== "detached" && Boolean(ti.takeoffJobId);
}

export function evaluateTakeoffImportCompletionChecklist(params: {
  accountName?: string;
  accountPhone?: string;
  accountEmail?: string;
  customerName?: string;
  projectName?: string;
  projectAddress?: string;
  city?: string;
  state?: string;
  branch?: string;
  salesRep?: string;
  internalPricingMode?: string | null;
  roomDrafts?: RoomDraft[];
  colorTbd?: boolean;
  quoteDefaultCatalogId?: string | null;
  suggestedAddOnCount?: number;
  addonsReviewed?: boolean;
  suggestedAddOnReviews?: Array<{ key: string; status: string }>;
  customerFacingNotes?: string;
  notesReviewed?: boolean;
  totalSf?: number;
}) {
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
    suggestedAddOnReviews = [],
    customerFacingNotes = "",
    notesReviewed = false,
    totalSf = 0,
  } = params;

  const importedRooms = roomDrafts.filter((r) => r?.takeoffImportSource?.importedFromTakeoff);
  const roomsNeedingMaterial = importedRooms.length ? importedRooms : roomDrafts;

  const hasAccount =
    Boolean(String(accountName).trim()) &&
    (Boolean(String(accountPhone).trim()) ||
      Boolean(String(accountEmail).trim()) ||
      Boolean(String(customerName).trim()));

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

  const addonsComplete =
    suggestedAddOnCount === 0 ||
    (addonsReviewed && allSuggestedAddOnsReviewed(suggestedAddOnReviews as { key: string; status: string }[]));
  const notesComplete = notesReviewed || Boolean(String(customerFacingNotes).trim());
  const hasMeasurements = totalSf > 0;

  const importedRoomsForVerify = roomDrafts.filter((r) => r?.takeoffImportSource?.importedFromTakeoff);
  const roomsVerified =
    importedRoomsForVerify.length === 0 ||
    importedRoomsForVerify.every((r) => roomTakeoffVerificationComplete(r));

  const items: TakeoffImportChecklistItem[] = [
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
