import { round2 } from "@quote-lib/measurementEngine";
import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import {
  roundCustomerDisplayAddonLine,
  type CustomerRoomAreaCostCustomLine,
  type CustomerRoomAreaCostRow
} from "@quote-lib/prototypeQuoteMath";

export type CustomerPrintDisplayAddonLine = {
  label: string;
  amountExact: number;
  displayedAmount: number;
};

export type CustomerPrintDisplayRoomRow = {
  roomId: string;
  roomName: string;
  displayName: string;
  materialGroup: string;
  colorLabel?: string;
  isVanity: boolean;
  totalSqft: number;
  /** Customer-facing material $ for the main row (area total minus add-ons). */
  displayedMaterial: number;
  /** Sum of displayed add-on lines for this room. */
  displayedAddOns: number;
  /** Customer-facing area total — authority for this row. */
  displayedAreaTotal: number;
  addonLines: CustomerPrintDisplayAddonLine[];
  customerCustomLines: CustomerRoomAreaCostCustomLine[];
  reconciliationWarning?: string;
};

export type PrepareCustomerPrintDisplayRowsParams = {
  roomRows: CustomerRoomAreaCostRow[];
  /** One displayed area total per room row (same order as `roomRows`). */
  roomAreaDisplayTotals: number[];
  unassignedDisplayTotal?: number;
};

export type PrepareCustomerPrintDisplayRowsResult = {
  rows: CustomerPrintDisplayRoomRow[];
  warnings: string[];
  materialDisplaySum: number;
  addOnsDisplaySum: number;
  areaTotalSum: number;
};

function fallbackMaterialDisplay(row: CustomerRoomAreaCostRow): number {
  const customExact = row.customerCustomLines.reduce((s, c) => s + c.amountExact, 0);
  const materialExact = round2(row.materialAmountExact + customExact);
  return roundCustomerDisplay(materialExact);
}

/**
 * Prepare customer-print Room / Area Cost Breakdown rows so that, for each room:
 *   displayed Material + displayed Add-ons = displayed Area Total.
 *
 * Area total is the customer-facing authority (from proportional $10 allocation in print).
 * Material is derived; exact/internal math is unchanged.
 */
export function prepareCustomerPrintDisplayRows(
  params: PrepareCustomerPrintDisplayRowsParams
): PrepareCustomerPrintDisplayRowsResult {
  const warnings: string[] = [];
  const rows: CustomerPrintDisplayRoomRow[] = [];

  params.roomRows.forEach((row, idx) => {
    const displayedAreaTotal = Math.max(0, Math.round(params.roomAreaDisplayTotals[idx] ?? 0));
    const addonLines: CustomerPrintDisplayAddonLine[] = row.addons.map((a) => ({
      label: a.label,
      amountExact: a.amountExact,
      displayedAmount: roundCustomerDisplayAddonLine(a.amountExact)
    }));
    const displayedAddOns = addonLines.reduce((s, a) => s + a.displayedAmount, 0);

    let displayedMaterial = displayedAreaTotal - displayedAddOns;
    let reconciliationWarning: string | undefined;

    if (displayedMaterial < 0) {
      displayedMaterial = fallbackMaterialDisplay(row);
      reconciliationWarning = `Room "${row.displayName}": displayed area total ($${displayedAreaTotal.toLocaleString()}) is less than displayed add-ons ($${displayedAddOns.toLocaleString()}); kept prior material display ($${displayedMaterial.toLocaleString()}).`;
      warnings.push(reconciliationWarning);
    }

    rows.push({
      roomId: row.roomId,
      roomName: row.roomName,
      displayName: row.displayName,
      materialGroup: row.materialGroup,
      colorLabel: row.colorLabel,
      isVanity: row.isVanity,
      totalSqft: row.totalSqft,
      displayedMaterial,
      displayedAddOns,
      displayedAreaTotal,
      addonLines,
      customerCustomLines: row.customerCustomLines,
      reconciliationWarning
    });
  });

  const unassigned = Math.max(0, Math.round(params.unassignedDisplayTotal ?? 0));
  const materialDisplaySum = rows.reduce((s, r) => s + r.displayedMaterial, 0);
  const addOnsDisplaySum = rows.reduce((s, r) => s + r.displayedAddOns, 0);
  const areaTotalSum = rows.reduce((s, r) => s + r.displayedAreaTotal, 0) + unassigned;

  return {
    rows,
    warnings,
    materialDisplaySum,
    addOnsDisplaySum,
    areaTotalSum
  };
}
