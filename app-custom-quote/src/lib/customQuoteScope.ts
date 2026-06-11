import { round2 } from "@quote-lib/measurementEngine";
import {
  aggregateComparisonScope,
  getInternalEstimateScopeTotals,
  INTERNAL_ESTIMATE_MEASURE_OPTIONS
} from "@quote-lib/prototypeQuoteMath";
import type { RoomDraft } from "@quote-lib/quoteTypes";

/** Fabrication quantity = chargeable counter + backsplash/FHB sf (IE measurement engine, no Elite tier $). */
export function customQuoteProjectSqftFromRooms(roomDrafts: RoomDraft[], projectType: string): number {
  if (!roomDrafts.length) return 0;
  const scope = getInternalEstimateScopeTotals(
    roomDrafts,
    projectType,
    "wholesale",
    0,
    INTERNAL_ESTIMATE_MEASURE_OPTIONS
  );
  return round2(scope.chargeableCounterSqft + scope.backsplashFhbSqft);
}

export function customQuoteScopeSummary(roomDrafts: RoomDraft[], projectType: string) {
  const scope = getInternalEstimateScopeTotals(
    roomDrafts,
    projectType,
    "wholesale",
    0,
    INTERNAL_ESTIMATE_MEASURE_OPTIONS
  );
  const agg = aggregateComparisonScope(roomDrafts, projectType, {
    materialBasis: "wholesale",
    projectUseTaxPercent: 0,
    measureOptions: INTERNAL_ESTIMATE_MEASURE_OPTIONS
  });
  return {
    projectSqft: round2(scope.chargeableCounterSqft + scope.backsplashFhbSqft),
    chargeableCounterSqft: scope.chargeableCounterSqft,
    backsplashFhbSqft: scope.backsplashFhbSqft,
    exactCounterSqft: scope.exactCounterSqft,
    roomCount: roomDrafts.length,
    mixedGroupNote: agg.mixedGroupNote
  };
}

function parseNum(v: string): number {
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type CustomLineRowInput = {
  id: string;
  name: string;
  category: string;
  qty: string;
  unitPrice: string;
};

/** Passthrough dollars from structured custom lines (not Elite add-on catalog). */
export function sumCustomQuoteAddonCosts(rows: CustomLineRowInput[]): {
  installCost: number;
  otherCostBasis: number;
} {
  let installCost = 0;
  let otherCostBasis = 0;
  for (const r of rows) {
    if (!r.name.trim()) continue;
    const q = parseNum(r.qty) || 1;
    if (q <= 0) continue;
    let p = parseNum(r.unitPrice);
    if (r.category === "Discount/Credit") {
      p = -Math.abs(p);
    }
    if (!p) continue;
    const amt = round2(q * p);
    const cat = r.category.toLowerCase();
    if (cat === "labor" || cat.includes("install")) {
      installCost += amt;
    } else {
      otherCostBasis += amt;
    }
  }
  return { installCost: round2(installCost), otherCostBasis: round2(otherCostBasis) };
}
