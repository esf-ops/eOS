import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import { round2 } from "@quote-lib/measurementEngine";
import type { SelectedMaterialBreakdown } from "@quote-lib/prototypeQuoteMath";
import type { MeasuredRoom } from "@quote-lib/quoteTypes";

export type CustomerEstimateDisplayLineItem = {
  lineTotal: number;
};

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

  return {
    countertopMaterialExact,
    backsplashMaterialExact,
    addonsExact,
    summaryCounterDisplay,
    summaryBacksplashDisplay,
    summaryAddonsDisplay,
    summaryVisibleLinesDisplay,
    finalRounded,
    roomExtrasExactByRoomId
  };
}
