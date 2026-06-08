import { round2 } from "@quote-lib/measurementEngine";
import type { CustomerLineItem } from "../CustomerEstimatePrint";

/**
 * Minimal row shape required by splitInternalEstimateCustomLines.
 * The full CustomLineRow in InternalEstimateApp satisfies this interface.
 */
export interface CustomLineRowInput {
  id: string;
  name: string;
  description: string;
  /** "Discount/Credit" receives special negative-price handling; all other values are treated uniformly. */
  category: string;
  qty: string;
  unitPrice: string;
  customerFacing: boolean;
  roomName: string;
  roomId: string;
}

export interface SplitCustomLinesResult {
  /**
   * Customer-facing custom lines: printed by name on the customer estimate.
   * Mirrors the `visibleCustomerLines` useMemo previously inlined in InternalEstimateApp.
   */
  visibleCustomerLines: CustomerLineItem[];
  /**
   * Dollar amount of custom lines hidden from the customer (internal-only) that fold
   * into the customer material total. Equal to (total of all qualifying rows) minus
   * (total of customer-facing qualifying rows). Mirrors `internalOnlyAdjustDollars`.
   */
  internalOnlyAdjustDollars: number;
}

function parseNum(v: string): number {
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Classify custom line rows into customer-visible and internal-only buckets in one pass.
 *
 * Rules:
 *  - Rows with empty name or qty ≤ 0 are ignored.
 *  - "Discount/Credit" rows are always applied as a reduction (negative amount).
 *    Positive unit price is auto-negated so the estimator can enter "25" and get a $25 credit.
 *    Zero unit price is skipped.
 *  - All other rows only count when unitPrice ≠ 0.
 *  - Customer-facing rows (customerFacing === true) with a qualifying amount appear in
 *    visibleCustomerLines; their amounts also reduce internalOnlyAdjustDollars.
 *  - Non-customer-facing rows with a qualifying amount contribute to internalOnlyAdjustDollars
 *    but do not appear in visibleCustomerLines.
 *  - Room association: resolved by roomId → roomDrafts lookup, falling back to roomName string.
 */
export function splitInternalEstimateCustomLines({
  customLineRows,
  roomDrafts,
}: {
  customLineRows: CustomLineRowInput[];
  roomDrafts: { id: string; name: string }[];
}): SplitCustomLinesResult {
  const visibleCustomerLines: CustomerLineItem[] = [];
  let totalAll = 0;
  let totalVisible = 0;

  for (const r of customLineRows) {
    const q = parseNum(r.qty) || 1;
    const p = parseNum(r.unitPrice);
    if (!r.name.trim() || q <= 0) continue;

    if (r.category === "Discount/Credit") {
      if (p !== 0) {
        // Auto-negate: estimator may enter a positive credit amount (e.g. "25" → applied as -$25).
        const discPrice = -Math.abs(p);
        totalAll += q * discPrice;
        if (r.customerFacing) {
          totalVisible += q * discPrice;
          const linkedRoom = r.roomId ? roomDrafts.find((rd) => rd.id === r.roomId) : null;
          visibleCustomerLines.push({
            lineKey: r.id,
            name: r.name.trim(),
            description: r.description.trim(),
            qty: q,
            unitPrice: discPrice,
            lineTotal: round2(q * discPrice),
            roomName: (linkedRoom?.name || r.roomName).trim(),
          });
        }
      }
      continue;
    }

    if (p === 0) continue;

    totalAll += q * p;
    if (r.customerFacing) {
      totalVisible += q * p;
      const linkedRoom = r.roomId ? roomDrafts.find((rd) => rd.id === r.roomId) : null;
      visibleCustomerLines.push({
        lineKey: r.id,
        name: r.name.trim(),
        description: r.description.trim(),
        qty: q,
        unitPrice: p,
        lineTotal: round2(q * p),
        roomName: (linkedRoom?.name || r.roomName).trim(),
      });
    }
  }

  return {
    visibleCustomerLines,
    // Matches original arithmetic: customLinePreviewTotals was round2(totalAll), so we apply
    // round2 to totalAll before the subtraction to preserve exact floating-point equivalence.
    internalOnlyAdjustDollars: round2(round2(totalAll) - totalVisible),
  };
}
