import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import { round2 } from "@quote-lib/measurementEngine";
import type { SelectedMaterialBreakdown } from "@quote-lib/prototypeQuoteMath";
import type { MeasuredRoom } from "@quote-lib/quoteTypes";

export type CustomerEstimateDisplayLineItem = {
  lineTotal: number;
};

/** One row in the customer PDF Add-ons / Fixtures detail table. */
export type CustomerAddonDetailLine = {
  label: string;
  roomName: string;
  amountExact: number;
};

const FHB_ELECTRICAL_DETAIL_RE = /full-height backsplash electrical cutouts/i;

function labelFromMeasuredRoomDetail(detail: string): string {
  const trimmed = detail.trim();
  const timesIdx = trimmed.indexOf(" × ");
  if (timesIdx > 0) return trimmed.slice(0, timesIdx).trim();
  const atIdx = trimmed.indexOf(" @ ");
  if (atIdx > 0) return trimmed.slice(0, atIdx).trim();
  return trimmed;
}

function amountFromMeasuredRoomDetail(detail: string): number | null {
  const match = detail.match(/×\s*(\d+(?:\.\d+)?)\s*@\s*\$?([\d.]+)/i);
  if (!match) return null;
  return round2(Number(match[1]) * Number(match[2]));
}

/**
 * Customer-facing add-on detail lines for PDF — catalog add-ons plus room extras not in addons[]
 * (e.g. FHB electrical cutouts). Line amounts are exact; subtotal uses roundCustomerDisplay on total extras.
 */
export function buildCustomerAddonDetailLines(measuredRooms: MeasuredRoom[]): CustomerAddonDetailLine[] {
  const lines: CustomerAddonDetailLine[] = [];

  for (const room of measuredRooms) {
    const roomName = room.name?.trim() || "";
    for (const a of room.addons) {
      const amountExact = round2(Number(a.total) || 0);
      if (amountExact > 0) {
        lines.push({ label: a.label, roomName, amountExact });
      }
    }

    const catalogSum = round2(room.addons.reduce((s, a) => s + (Number(a.total) || 0), 0));
    let otherExtras = round2(Math.max(0, (Number(room.extras) || 0) - catalogSum));
    if (otherExtras <= 0) continue;

    const details = room.details ?? [];
    for (const detail of details) {
      if (otherExtras <= 0) break;
      if (!FHB_ELECTRICAL_DETAIL_RE.test(detail) && !/×\s*\d+.*@\s*\$/.test(detail)) continue;
      const parsed = amountFromMeasuredRoomDetail(detail);
      const amountExact = round2(Math.min(otherExtras, parsed != null && parsed > 0 ? parsed : otherExtras));
      if (amountExact <= 0) continue;
      lines.push({
        label: labelFromMeasuredRoomDetail(detail),
        roomName,
        amountExact
      });
      otherExtras = round2(otherExtras - amountExact);
    }

    if (otherExtras > 0) {
      lines.push({
        label: "Additional room extras",
        roomName,
        amountExact: otherExtras
      });
    }
  }

  return lines;
}

/** Customer-facing summary + rounding — matches Live Quote Panel (stickyLiveRollup) basis. */
export type CustomerEstimateDisplayModel = {
  countertopMaterialExact: number;
  backsplashMaterialExact: number;
  /** Sum of measuredRooms[].extras — includes catalog add-ons, tear-out, FHB outlets, etc. */
  addonsExact: number;
  summaryCounterDisplay: number;
  summaryBacksplashDisplay: number;
  summaryAddonsDisplay: number;
  summaryVisibleLinesDisplay: number;
  finalRounded: number;
  /** Per-room extras exact (same source as Live Quote Panel add-ons row). */
  roomExtrasExactByRoomId: Record<string, number>;
  /** Add-ons / Fixtures detail rows — must sum to addonsExact. */
  addonDetailLines: CustomerAddonDetailLine[];
};

export type BuildCustomerEstimateDisplayModelParams = {
  selectedBreakdown: SelectedMaterialBreakdown;
  measuredRooms: MeasuredRoom[];
  visibleCustomerLines: CustomerEstimateDisplayLineItem[];
  internalMaterialFoldDollars: number;
};

/**
 * Single customer-facing display model for Internal Estimate live panel, customerDisplayTotal,
 * and CustomerEstimatePrint. Uses measuredRooms[].extras for add-ons (not addons[] alone).
 */
export function buildCustomerEstimateDisplayModel(
  params: BuildCustomerEstimateDisplayModelParams
): CustomerEstimateDisplayModel {
  const vanityMaterialExact = params.measuredRooms
    .filter((r) => r.type === "Vanity")
    .reduce((s, v) => s + (Number(v.selected) || 0), 0);
  const countertopMaterialExact = round2(
    params.selectedBreakdown.totals.countertopMaterial +
      vanityMaterialExact +
      (Number(params.internalMaterialFoldDollars) || 0)
  );
  const backsplashMaterialExact = round2(params.selectedBreakdown.totals.backsplashMaterial);
  const addonsExact = round2(params.measuredRooms.reduce((s, r) => s + (Number(r.extras) || 0), 0));
  const hasAddons = addonsExact !== 0;

  const summaryCounterDisplay = roundCustomerDisplay(countertopMaterialExact);
  const summaryBacksplashDisplay = roundCustomerDisplay(backsplashMaterialExact);
  const summaryAddonsDisplay = hasAddons ? roundCustomerDisplay(addonsExact) : 0;
  const summaryVisibleLinesDisplay = params.visibleCustomerLines.reduce(
    (s, ln) => s + roundCustomerDisplay(Number(ln.lineTotal) || 0),
    0
  );
  const finalRounded =
    summaryCounterDisplay + summaryBacksplashDisplay + summaryAddonsDisplay + summaryVisibleLinesDisplay;

  const roomExtrasExactByRoomId: Record<string, number> = {};
  for (const r of params.measuredRooms) {
    roomExtrasExactByRoomId[r.id] = round2(Number(r.extras) || 0);
  }

  const addonDetailLines = buildCustomerAddonDetailLines(params.measuredRooms);

  return {
    countertopMaterialExact,
    backsplashMaterialExact,
    addonsExact,
    summaryCounterDisplay,
    summaryBacksplashDisplay,
    summaryAddonsDisplay,
    summaryVisibleLinesDisplay,
    finalRounded,
    roomExtrasExactByRoomId,
    addonDetailLines
  };
}
