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
  /** Customer-facing room notes to print under this room row. Empty array when none. */
  customerNoteLines: string[];
  reconciliationWarning?: string;
};

export type PrepareCustomerPrintDisplayRowsParams = {
  roomRows: CustomerRoomAreaCostRow[];
  /** One displayed area total per room row (same order as `roomRows`). */
  roomAreaDisplayTotals: number[];
  /**
   * Full measured room extras per row (same order as `roomRows`).
   * When omitted, falls back to catalog add-ons on the breakdown row only.
   */
  roomExtrasExact?: number[];
  unassignedDisplayTotal?: number;
  /**
   * Customer-facing note text per row (same order as `roomRows`).
   * Each entry is split on newlines, trimmed, and filtered; empty string → no note lines.
   */
  roomCustomerNotes?: string[];
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
 * Area total is the customer-facing authority (from proportional $5 allocation in print).
 * Material is derived; exact/internal math is unchanged.
 */
export function prepareCustomerPrintDisplayRows(
  params: PrepareCustomerPrintDisplayRowsParams
): PrepareCustomerPrintDisplayRowsResult {
  const warnings: string[] = [];
  const rows: CustomerPrintDisplayRoomRow[] = [];

  params.roomRows.forEach((row, idx) => {
    const displayedAreaTotal = Math.max(0, Math.round(params.roomAreaDisplayTotals[idx] ?? 0));
    const catalogAddonSum = row.addons.reduce((s, a) => s + a.amountExact, 0);
    const roomExtrasExact = round2(
      params.roomExtrasExact?.[idx] != null ? Number(params.roomExtrasExact[idx]) : catalogAddonSum
    );
    const otherExtras = round2(Math.max(0, roomExtrasExact - catalogAddonSum));

    const addonLines: CustomerPrintDisplayAddonLine[] = row.addons.map((a) => ({
      label: a.label,
      amountExact: a.amountExact,
      displayedAmount: roundCustomerDisplayAddonLine(a.amountExact)
    }));
    if (otherExtras > 0) {
      addonLines.push({
        label: "Additional room extras",
        amountExact: otherExtras,
        displayedAmount: roundCustomerDisplayAddonLine(otherExtras)
      });
    }

    let displayedAddOns = addonLines.reduce((s, a) => s + a.displayedAmount, 0);
    if (displayedAddOns === 0 && roomExtrasExact > 0) {
      displayedAddOns = roundCustomerDisplay(roomExtrasExact);
    }

    let displayedMaterial = displayedAreaTotal - displayedAddOns;
    let reconciliationWarning: string | undefined;

    if (displayedMaterial < 0) {
      displayedMaterial = fallbackMaterialDisplay(row);
      reconciliationWarning = `Room "${row.displayName}": displayed area total ($${displayedAreaTotal.toLocaleString()}) is less than displayed add-ons ($${displayedAddOns.toLocaleString()}); kept prior material display ($${displayedMaterial.toLocaleString()}).`;
      warnings.push(reconciliationWarning);
    }

    const rawNote = params.roomCustomerNotes?.[idx] ?? row.customerNote ?? "";
    const customerNoteLines = String(rawNote)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

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
      customerNoteLines,
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
