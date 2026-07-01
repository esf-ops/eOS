import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import {
  computeInternalEstimateMaterialUseTaxAmounts,
  resolveInternalEstimateMaterialTaxPolicy
} from "@quote-lib/internalEstimateMaterialTaxPolicy";
import { round2 } from "@quote-lib/measurementEngine";
import type {
  CustomerRoomAreaCostBreakdown,
  InternalEstimateGroupComparisonRow,
  SelectedMaterialBreakdown,
  SelectedMaterialScopeLine
} from "@quote-lib/prototypeQuoteMath";
import { roundCustomerDisplayVanity } from "@quote-lib/vanityProgram2026";
import type { MeasuredRoom } from "@quote-lib/quoteTypes";
import {
  prepareCustomerPrintDisplayRows,
  type CustomerPrintDisplayRoomRow
} from "./customerPrintDisplayRows";
import { parseCustomerFacingNoteLines } from "./customerFacingNotes";
import { formatPreparedByDisplayName } from "./formatPreparedByName";

export type CustomerEstimateDisplayLineItem = {
  /** Stable id for summary rows (custom line row id). */
  lineKey?: string;
  name: string;
  description?: string;
  qty?: number;
  roomName?: string;
  lineTotal: number;
};

/** One row in the customer PDF Add-ons / Fixtures detail table. */
export type CustomerAddonDetailLine = {
  label: string;
  roomName: string;
  amountExact: number;
  /** Customer-facing line amount (exact catalog/extra dollars on detail section). */
  displayAmount: number;
};

export type CustomerEstimateSummaryRow = {
  key: string;
  label: string;
  displayAmount: number;
};

export type CustomerMaterialScopeRoomRow = {
  roomName: string;
  countertopSf: number;
  backsplashSf: number;
};

/** Scope-only material group block — square footage reference, no customer dollar amounts. */
export type CustomerMaterialScopeGroup = {
  group: string;
  colorLabel?: string;
  roomRows: CustomerMaterialScopeRoomRow[];
  countertopSf: number;
  backsplashFhbSf: number;
};

export type CustomerVanityScopeNote = {
  roomId: string;
  roomName: string;
  materialGroup: string;
  programLabel?: string;
  note: string;
};

/** Per-room material option with itemized customer-safe comparison lines. */
export type CustomerPrintComparisonGroupBlock = {
  group: string;
  colorLabel?: string;
  countertopDisplay: number;
  backsplashDisplay: number;
  fhbDisplay: number;
  addonsDisplay: number;
  roomTotalDisplay: number;
};

export type CustomerPrintComparisonRoomBlock = {
  roomId: string;
  roomDisplayName: string;
  isVanity: boolean;
  groupBlocks: CustomerPrintComparisonGroupBlock[];
};

/** Per-room row in the optional material group comparison table (legacy matrix footer). */
export type CustomerPrintComparisonRoomRow = {
  roomId: string;
  roomDisplayName: string;
  isVanity: boolean;
  /**
   * Displayed area total per selected comparison group. Key = group name.
   * In per-room mode, only groups selected for this room are present; absent keys render as em dash.
   */
  groupDisplayTotals: Record<string, number>;
  /**
   * In per-room mode: which groups this room participates in. Used to suppress cells for other columns.
   * Absent = this room participates in all selectedGroups (legacy global mode).
   */
  activeGroups?: string[];
};

/** Full optional material group comparison table for the customer PDF. */
export type CustomerPrintComparisonTable = {
  /** Itemized comparison blocks per room and material option (customer PDF). */
  roomBlocks: CustomerPrintComparisonRoomBlock[];
  roomRows: CustomerPrintComparisonRoomRow[];
  /** Estimated project total per selected group (sum of room totals + unassigned). */
  projectDisplayTotals: Record<string, number>;
  /** Selected groups in display order, with optional color labels. */
  selectedGroups: Array<{ group: string; colorLabel?: string }>;
  /**
   * True when comparison was built from per-room customerComparisonGroups rather than global selection.
   * Controls whether cells for non-selected groups show em dash instead of a dollar amount.
   */
  isPerRoomMode: boolean;
};

const FHB_ELECTRICAL_DETAIL_RE = /full-height backsplash electrical cutouts/i;

const VANITY_ROLLUP_NOTE =
  "Vanity program pricing rolls into Countertop material in Estimate summary.";

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
 * Split a customer-facing rounded total across positive exact weights using proportional $5 buckets
 * + largest remainder so displayed amounts sum exactly to `targetDisplay` (always a multiple of $5).
 */
export function allocateCustomerDisplayFives(exacts: number[], targetDisplay: number): number[] {
  const n = exacts.length;
  if (n === 0) return [];
  const cleaned = exacts.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumExact = cleaned.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.round(targetDisplay));
  if (sumExact <= 0 || target <= 0) return cleaned.map(() => 0);

  const units = Math.round(target / 5);
  if (units <= 0) return cleaned.map(() => 0);

  const rawUnits = cleaned.map((e) => (e / sumExact) * units);
  const floorUnits = rawUnits.map((r) => Math.floor(r));
  const assigned = floorUnits.reduce((a, b) => a + b, 0);
  let deficit = units - assigned;
  const order = rawUnits
    .map((r, i) => ({ i, rem: r - floorUnits[i] }))
    .sort((a, b) => b.rem - a.rem);
  const out = floorUnits.map((f) => f * 5);
  for (let k = 0; k < deficit; k++) {
    out[order[k].i] += 5;
  }
  return out;
}

function aggregateScopeLinesByRoom(lines: SelectedMaterialScopeLine[]): CustomerMaterialScopeRoomRow[] {
  const byRoom = new Map<string, CustomerMaterialScopeRoomRow>();
  for (const ln of lines) {
    const key = ln.roomName.trim() || "Room";
    const row = byRoom.get(key) ?? { roomName: key, countertopSf: 0, backsplashSf: 0 };
    row.countertopSf += ln.countertopSf;
    row.backsplashSf += ln.backsplashSf + ln.fhbSf;
    byRoom.set(key, row);
  }
  return [...byRoom.values()].map((r) => ({
    roomName: r.roomName,
    countertopSf: round2(r.countertopSf),
    backsplashSf: round2(r.backsplashSf)
  }));
}

/**
 * Customer-facing add-on detail lines for PDF — catalog add-ons plus room extras not in addons[]
 * (e.g. FHB electrical cutouts).
 */
export function buildCustomerAddonDetailLines(measuredRooms: MeasuredRoom[]): CustomerAddonDetailLine[] {
  const lines: CustomerAddonDetailLine[] = [];

  for (const room of measuredRooms) {
    const roomName = room.name?.trim() || "";
    for (const a of room.addons) {
      const amountExact = round2(Number(a.total) || 0);
      if (amountExact > 0) {
        lines.push({ label: a.label, roomName, amountExact, displayAmount: amountExact });
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
        amountExact,
        displayAmount: amountExact
      });
      otherExtras = round2(otherExtras - amountExact);
    }

    if (otherExtras > 0) {
      lines.push({
        label: "Additional room extras",
        roomName,
        amountExact: otherExtras,
        displayAmount: otherExtras
      });
    }
  }

  return lines;
}

function buildEstimateSummaryRows(params: {
  summaryCounterDisplay: number;
  summaryBacksplashDisplay: number;
  summaryFhbDisplay: number;
  summaryAddonsDisplay: number;
  summaryEdgeDisplay: number;
  hasAddons: boolean;
  addonDetailLines: CustomerAddonDetailLine[];
  customerFixtureDetailLines: CustomerAddonDetailLine[];
  visibleCustomerLines: CustomerEstimateDisplayLineItem[];
}): CustomerEstimateSummaryRow[] {
  const rows: CustomerEstimateSummaryRow[] = [
    { key: "countertop", label: "Countertop material", displayAmount: params.summaryCounterDisplay }
  ];
  if (params.summaryBacksplashDisplay > 0) {
    rows.push({
      key: "backsplash",
      label: "4-inch backsplash material",
      displayAmount: params.summaryBacksplashDisplay
    });
  }
  if (params.summaryFhbDisplay > 0) {
    rows.push({
      key: "fhb",
      label: "Full-height backsplash material",
      displayAmount: params.summaryFhbDisplay
    });
  }

  // Specific catalog add-on lines instead of a single generic "Add-ons / fixtures" row.
  // Customer fixture lines (visibleCustomerLines) are rendered unconditionally below — they must
  // NOT also be rendered here via customerFixtureDetailLines to avoid printing each line twice.
  if (params.hasAddons) {
    const addonLinesSeen = new Set<string>();
    params.addonDetailLines.forEach((a, idx) => {
      if (a.displayAmount <= 0) return;
      const key = `addon-${idx}-${a.label}-${a.roomName}`;
      if (addonLinesSeen.has(key)) return;
      addonLinesSeen.add(key);
      const label = a.roomName ? `${a.label} · ${a.roomName}` : a.label;
      rows.push({ key, label, displayAmount: a.displayAmount });
    });
    // Fallback: only when no catalog add-on lines resolved — generic row preserves the add-ons total.
    // Customer fixture lines are not counted here; they appear unconditionally below.
    const specificCount = params.addonDetailLines.filter((a) => a.displayAmount > 0).length;
    if (specificCount === 0 && params.summaryAddonsDisplay > 0) {
      rows.push({ key: "addons", label: "Add-ons / fixtures", displayAmount: params.summaryAddonsDisplay });
    }
  }

  if (params.summaryEdgeDisplay > 0) {
    rows.push({ key: "edge_upgrades", label: "Edge upgrades", displayAmount: params.summaryEdgeDisplay });
  }
  // Old instructional text that was the preset default — must not print as a customer-facing note.
  const PLACEHOLDER_DESCRIPTIONS = new Set([
    "Enter the credit amount — always applied as a reduction.",
    "Uses negative unit price (required for this category)."
  ]);
  params.visibleCustomerLines.forEach((ln, index) => {
    const displayAmount = roundCustomerDisplay(Number(ln.lineTotal) || 0);
    if (displayAmount === 0) return; // skip zero; allow negative discount rows
    let label = ln.name.trim() || "Custom item";
    const descText = ln.description?.trim() || "";
    if (descText && !PLACEHOLDER_DESCRIPTIONS.has(descText)) label += ` — ${descText}`;
    if (ln.roomName?.trim()) label += ` · ${ln.roomName.trim()}`;
    if (ln.qty != null && ln.qty !== 1) label += ` × ${ln.qty}`;
    const lineKey = String(ln.lineKey ?? "").trim() || `custom-line-${index}`;
    rows.push({
      key: lineKey,
      label,
      displayAmount
    });
  });
  return rows;
}

function buildCustomerFixtureDetailLines(
  visibleCustomerLines: CustomerEstimateDisplayLineItem[]
): CustomerAddonDetailLine[] {
  return visibleCustomerLines
    .map((ln, index) => {
      const amountExact = round2(Number(ln.lineTotal) || 0);
      if (amountExact <= 0) return null;
      let label = ln.name.trim() || "Custom fixture";
      if (ln.description?.trim()) label += ` — ${ln.description.trim()}`;
      return {
        label,
        roomName: ln.roomName?.trim() || "",
        amountExact,
        displayAmount: amountExact
      };
    })
    .filter((ln): ln is CustomerAddonDetailLine => ln != null);
}

function buildRoomAreaPrintRows(params: {
  finalRounded: number;
  roomAreaBreakdown: CustomerRoomAreaCostBreakdown | null;
  roomExtrasExactByRoomId: Record<string, number>;
}): {
  rows: CustomerPrintDisplayRoomRow[];
  unassignedDisplayTotal: number;
  unassignedExact: number;
  showRoomBreakdown: boolean;
} {
  const roomRows = params.roomAreaBreakdown?.rooms ?? [];
  const unassignedExact = round2(Number(params.roomAreaBreakdown?.unassignedCustomerCustomExact) || 0);
  if (!roomRows.length) {
    return { rows: [], unassignedDisplayTotal: 0, unassignedExact, showRoomBreakdown: false };
  }

  // Allow negative unassigned (global Discount / Credit not assigned to a room) — it shows as a
  // "Project discount / credit" footer row in the room breakdown. Room proportional allocation uses
  // the positive room subtotal (finalRounded minus the discount) so per-room amounts are natural.
  const unassignedDisplay = unassignedExact !== 0 ? roundCustomerDisplay(unassignedExact) : 0;

  // Separate vanity rooms (fixed display total, immune to fold/rounding inflation) from
  // proportional rooms. The fixed sum is subtracted from targetRoomDisplay before proportional
  // allocation, ensuring the vanity program customer price is never inflated by internal adjustments.
  const fixedTotal = roomRows.reduce((s, r) => s + (r.fixedDisplayTotal ?? 0), 0);
  // Subtract the unassigned display (which may be negative for global discount) so room proportional
  // allocation targets the positive room-area portion of the total.
  const targetRoomDisplay = Math.max(0, params.finalRounded - unassignedDisplay);
  const targetProportionalDisplay = Math.max(0, targetRoomDisplay - fixedTotal);

  // Build allocations array: fixed rooms get fixedDisplayTotal, proportional rooms get allocated share.
  const proportionalExacts = roomRows.map((r) => (r.fixedDisplayTotal != null ? 0 : r.roomTotalExact));
  const proportionalAllocated = allocateCustomerDisplayFives(
    proportionalExacts.filter((_, i) => roomRows[i].fixedDisplayTotal == null),
    targetProportionalDisplay
  );
  let propIdx = 0;
  const roomAreaDisplayTotals = roomRows.map((r) => {
    if (r.fixedDisplayTotal != null) return r.fixedDisplayTotal;
    return proportionalAllocated[propIdx++] ?? 0;
  });

  const prepared = prepareCustomerPrintDisplayRows({
    roomRows,
    roomAreaDisplayTotals,
    roomExtrasExact: roomRows.map((r) => params.roomExtrasExactByRoomId[r.roomId] ?? 0),
    unassignedDisplayTotal: unassignedDisplay,
    roomCustomerNotes: roomRows.map((r) => r.customerNote ?? "")
  });

  return {
    rows: prepared.rows,
    unassignedDisplayTotal: unassignedDisplay,
    unassignedExact,
    showRoomBreakdown: true
  };
}

const MATERIAL_GROUP_ORDER = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant"
];

function splitExactBySfWeights(totalExact: number, weights: number[]): number[] {
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (totalExact <= 0 || sum <= 0) return w.map(() => 0);
  return w.map((wei) => round2(totalExact * (wei / sum)));
}

function scaleExactPartsToTarget(parts: number[], target: number): number[] {
  const cleaned = parts.map((p) => round2(Math.max(0, Number(p) || 0)));
  const sum = round2(cleaned.reduce((a, b) => a + b, 0));
  const goal = round2(Math.max(0, Number(target) || 0));
  if (goal <= 0) return cleaned.map(() => 0);
  if (sum <= 0) {
    const out = cleaned.map(() => 0);
    out[0] = goal;
    return out;
  }
  if (Math.abs(sum - goal) <= 0.005) return cleaned;
  const factor = goal / sum;
  return cleaned.map((p) => round2(p * factor));
}

function resolveRoomSplashAndFhbSf(room: CustomerRoomAreaCostBreakdown["rooms"][number]): {
  backsplashSf: number;
  fhbSf: number;
} {
  const combined = round2(Number(room.backsplashFhbSf) || 0);
  const backsplashSf = round2(Number(room.backsplashSf) || (room.fhbSf == null ? combined : 0));
  const fhbSf = round2(Number(room.fhbSf) || 0);
  if (room.backsplashSf == null && room.fhbSf == null && combined > 0) {
    return { backsplashSf: combined, fhbSf: 0 };
  }
  return { backsplashSf, fhbSf };
}

type ComparisonComponentsExact = {
  countertop: number;
  backsplash: number;
  fhb: number;
  addons: number;
  roomTotal: number;
};

function computeComparisonGroupComponentsExact(
  room: CustomerRoomAreaCostBreakdown["rooms"][number],
  group: string,
  ratePerSqft: number,
  fixedExtrasExact: number,
  internalMaterialUseTax: boolean
): ComparisonComponentsExact {
  const addons = round2(fixedExtrasExact);
  if (room.isVanity) {
    return { countertop: 0, backsplash: 0, fhb: 0, addons, roomTotal: round2(room.roomTotalExact) };
  }

  const { backsplashSf, fhbSf } = resolveRoomSplashAndFhbSf(room);
  const counterMat = round2(room.countertopSf * ratePerSqft);
  const backsplashMat = round2(backsplashSf * ratePerSqft);
  const fhbMat = round2(fhbSf * ratePerSqft);
  const splashFhbMat = round2(backsplashMat + fhbMat);

  let counterTotal = counterMat;
  let backsplashTotal = backsplashMat;
  let fhbTotal = fhbMat;

  if (internalMaterialUseTax) {
    const policy = resolveInternalEstimateMaterialTaxPolicy();
    const amounts = computeInternalEstimateMaterialUseTaxAmounts(counterMat, splashFhbMat, policy);
    counterTotal = round2(counterMat + amounts.countertopMaterialUseTaxAmount);
    const splashFhbWithTax = round2(splashFhbMat + amounts.backsplashMaterialUseTaxAmount);
    if (splashFhbMat > 0) {
      const parts = splitExactBySfWeights(splashFhbWithTax, [backsplashMat, fhbMat]);
      backsplashTotal = parts[0];
      fhbTotal = parts[1];
    } else {
      backsplashTotal = 0;
      fhbTotal = 0;
    }
  }

  // Selected material group: mirror saved room material (fold/other extras/internal absorb rules).
  if (group === room.materialGroup) {
    const materialExact = round2(room.materialAmountExact);
    const rateMaterialSum = round2(counterTotal + backsplashTotal + fhbTotal);
    if (rateMaterialSum > 0 && Math.abs(rateMaterialSum - materialExact) > 0.005) {
      [counterTotal, backsplashTotal, fhbTotal] = scaleExactPartsToTarget(
        [counterTotal, backsplashTotal, fhbTotal],
        materialExact
      );
    } else if (rateMaterialSum <= 0 && materialExact > 0) {
      counterTotal = materialExact;
      backsplashTotal = 0;
      fhbTotal = 0;
    }
  }

  return {
    countertop: counterTotal,
    backsplash: backsplashTotal,
    fhb: fhbTotal,
    addons,
    roomTotal: round2(counterTotal + backsplashTotal + fhbTotal + addons)
  };
}

function comparisonGroupDisplayAmounts(components: ComparisonComponentsExact): {
  countertopDisplay: number;
  backsplashDisplay: number;
  fhbDisplay: number;
  addonsDisplay: number;
  roomTotalDisplay: number;
} {
  const roomTotalDisplay = roundCustomerDisplay(components.roomTotal);
  const displays = allocateCustomerDisplayFives(
    [components.countertop, components.backsplash, components.fhb, components.addons],
    roomTotalDisplay
  );
  return {
    countertopDisplay: displays[0] ?? 0,
    backsplashDisplay: displays[1] ?? 0,
    fhbDisplay: displays[2] ?? 0,
    addonsDisplay: displays[3] ?? 0,
    roomTotalDisplay
  };
}

function buildComparisonGroupBlock(
  room: CustomerRoomAreaCostBreakdown["rooms"][number],
  group: string,
  colorLabel: string | undefined,
  ratePerSqft: number,
  fixedExtrasExact: number,
  internalMaterialUseTax: boolean
): CustomerPrintComparisonGroupBlock {
  const exact = computeComparisonGroupComponentsExact(
    room,
    group,
    ratePerSqft,
    fixedExtrasExact,
    internalMaterialUseTax
  );
  const display = comparisonGroupDisplayAmounts(exact);
  return {
    group,
    colorLabel,
    countertopDisplay: display.countertopDisplay,
    backsplashDisplay: display.backsplashDisplay,
    fhbDisplay: display.fhbDisplay,
    addonsDisplay: display.addonsDisplay,
    roomTotalDisplay: display.roomTotalDisplay
  };
}

/**
 * Compute the display total for a single room at a given comparison group rate.
 * For vanity program rooms the display total is fixed regardless of group.
 *
 * TODO(vanity-comparison-pricing): Group A–F columns repeat the same vanity program price because
 * vanity sheet pricing is tier-based (kitchen over/under 35 sf), not material-group $/sqft.
 * A future resolver should read VanityProgramDisplayMeta and optional group-tier matrix — do not
 * multiply vanity sf by countertop group rates.
 */
function computeRoomGroupDisplayTotal(
  room: CustomerRoomAreaCostBreakdown["rooms"][number],
  ratePerSqft: number,
  taxPct: number,
  fixedExtrasExact: number,
  internalMaterialUseTax?: boolean
): number {
  if (room.isVanity) {
    return room.fixedDisplayTotal ?? roundCustomerDisplay(room.roomTotalExact);
  }
  const { backsplashSf, fhbSf } = resolveRoomSplashAndFhbSf(room);
  const counterMat = round2(room.countertopSf * ratePerSqft);
  const backsplashMat = round2(backsplashSf * ratePerSqft);
  const fhbMat = round2(fhbSf * ratePerSqft);
  const splashFhbMat = round2(backsplashMat + fhbMat);
  if (internalMaterialUseTax) {
    const amounts = computeInternalEstimateMaterialUseTaxAmounts(
      counterMat,
      splashFhbMat,
      resolveInternalEstimateMaterialTaxPolicy()
    );
    return roundCustomerDisplay(
      round2(counterMat + splashFhbMat + amounts.totalMaterialUseTaxAmount + fixedExtrasExact)
    );
  }
  const useTax = taxPct > 0 ? round2(counterMat * (taxPct / 100)) : 0;
  return roundCustomerDisplay(round2(counterMat + useTax + splashFhbMat + fixedExtrasExact));
}

/**
 * Build the per-room optional material group comparison table.
 *
 * Per-room mode (preferred): when any room in roomAreaBreakdown has customerComparisonGroups set,
 * each room only shows values for its selected groups. Rooms with no selection are excluded.
 * Rate lookup uses allGroupComparisonRates for any group combination.
 *
 * Legacy global mode: all rooms show the globally-selected comparisonRows groups.
 */
function buildRoomComparisonTable(params: {
  roomAreaBreakdown: CustomerRoomAreaCostBreakdown | null;
  comparisonRows: InternalEstimateGroupComparisonRow[];
  allGroupComparisonRates?: InternalEstimateGroupComparisonRow[];
  projectUseTaxPercent: number;
  internalMaterialUseTax?: boolean;
  unassignedDisplayTotal: number;
}): CustomerPrintComparisonTable | null {
  const { comparisonRows, roomAreaBreakdown } = params;
  if (!roomAreaBreakdown?.rooms.length) return null;

  const internalMaterialUseTax = params.internalMaterialUseTax === true;
  const taxPct = internalMaterialUseTax ? 0 : Math.max(0, Number(params.projectUseTaxPercent) || 0);

  // Detect per-room mode: any room has a non-empty customerComparisonGroups
  const perRoomMode = roomAreaBreakdown.rooms.some((r) => r.customerComparisonGroups?.length);

  if (perRoomMode) {
    // Rate lookup by group name from allGroupComparisonRates (or fall back to comparisonRows)
    const rateSource = params.allGroupComparisonRates?.length ? params.allGroupComparisonRates : comparisonRows;
    const rateByGroup = new Map(rateSource.map((r) => [r.group, r.ratePerSqft]));

    // Union of all groups selected across rooms, in canonical display order
    const unionGroupSet = new Set<string>();
    for (const room of roomAreaBreakdown.rooms) {
      for (const g of room.customerComparisonGroups ?? []) {
        unionGroupSet.add(g);
      }
    }
    if (!unionGroupSet.size) return null;

    const selectedGroups = MATERIAL_GROUP_ORDER
      .filter((g) => unionGroupSet.has(g))
      .map((g) => {
        // Collect color labels for this group across rooms; use label if exactly one distinct value
        const labels = new Set(
          roomAreaBreakdown.rooms
            .filter((r) => r.customerComparisonGroups?.includes(g))
            .map((r) => r.customerComparisonColorLabels?.[g]?.trim())
            .filter(Boolean)
        );
        return { group: g, colorLabel: labels.size === 1 ? [...labels][0] : undefined };
      });

    const roomRows: CustomerPrintComparisonRoomRow[] = [];
    const roomBlocks: CustomerPrintComparisonRoomBlock[] = [];

    for (const room of roomAreaBreakdown.rooms) {
      const roomGroups = room.customerComparisonGroups ?? [];
      if (!roomGroups.length) continue; // excluded from comparison section

      const addonSum = round2(room.addons.reduce((s, a) => s + a.amountExact, 0));
      const customSum = round2(room.customerCustomLines.reduce((s, c) => s + c.amountExact, 0));
      const fixedExtrasExact = round2(addonSum + customSum);

      const groupDisplayTotals: Record<string, number> = {};
      const groupBlocks: CustomerPrintComparisonGroupBlock[] = [];
      for (const g of roomGroups) {
        const rate = rateByGroup.get(g);
        if (rate == null) continue;
        const colorLabel = room.customerComparisonColorLabels?.[g]?.trim() || undefined;
        const block = buildComparisonGroupBlock(
          room,
          g,
          colorLabel,
          rate,
          fixedExtrasExact,
          internalMaterialUseTax
        );
        groupBlocks.push(block);
        groupDisplayTotals[g] = block.roomTotalDisplay;
      }

      roomRows.push({
        roomId: room.roomId,
        roomDisplayName: room.displayName,
        isVanity: room.isVanity,
        groupDisplayTotals,
        activeGroups: roomGroups
      });
      roomBlocks.push({
        roomId: room.roomId,
        roomDisplayName: room.displayName,
        isVanity: room.isVanity,
        groupBlocks
      });
    }

    if (!roomRows.length) return null;

    const projectDisplayTotals: Record<string, number> = {};
    for (const sg of selectedGroups) {
      const roomSum = roomRows.reduce((s, r) => s + (r.groupDisplayTotals[sg.group] ?? 0), 0);
      projectDisplayTotals[sg.group] = round2(roomSum);
    }

    return { roomBlocks, roomRows, projectDisplayTotals, selectedGroups, isPerRoomMode: true };
  }

  // Legacy global mode: all rooms show globally-selected groups
  if (!comparisonRows.length) return null;

  const selectedGroups = comparisonRows.map((r) => ({
    group: r.group,
    colorLabel: r.comparisonColorLabel
  }));

  const roomRows: CustomerPrintComparisonRoomRow[] = [];
  const roomBlocks: CustomerPrintComparisonRoomBlock[] = [];

  for (const room of roomAreaBreakdown.rooms) {
    const addonSum = round2(room.addons.reduce((s, a) => s + a.amountExact, 0));
    const customSum = round2(room.customerCustomLines.reduce((s, c) => s + c.amountExact, 0));
    const fixedExtrasExact = round2(addonSum + customSum);

    const groupDisplayTotals: Record<string, number> = {};
    const groupBlocks: CustomerPrintComparisonGroupBlock[] = [];
    for (const compRow of comparisonRows) {
      const block = buildComparisonGroupBlock(
        room,
        compRow.group,
        compRow.comparisonColorLabel,
        compRow.ratePerSqft,
        fixedExtrasExact,
        internalMaterialUseTax
      );
      groupBlocks.push(block);
      groupDisplayTotals[compRow.group] = block.roomTotalDisplay;
    }

    roomRows.push({
      roomId: room.roomId,
      roomDisplayName: room.displayName,
      isVanity: room.isVanity,
      groupDisplayTotals
    });
    roomBlocks.push({
      roomId: room.roomId,
      roomDisplayName: room.displayName,
      isVanity: room.isVanity,
      groupBlocks
    });
  }

  const projectDisplayTotals: Record<string, number> = {};
  for (const compRow of comparisonRows) {
    const roomSum = roomRows.reduce((s, r) => s + (r.groupDisplayTotals[compRow.group] ?? 0), 0);
    projectDisplayTotals[compRow.group] = round2(roomSum + params.unassignedDisplayTotal);
  }

  return { roomBlocks, roomRows, projectDisplayTotals, selectedGroups, isPerRoomMode: false };
}

function buildMaterialScopeGroups(selectedBreakdown: SelectedMaterialBreakdown): CustomerMaterialScopeGroup[] {
  return selectedBreakdown.groups.map((block) => ({
    group: block.group,
    colorLabel: block.colorLabel,
    roomRows: aggregateScopeLinesByRoom(block.lines),
    countertopSf: block.countertopSf,
    backsplashFhbSf: round2(block.backsplashSf + block.fhbSf)
  }));
}

function buildVanityScopeNotes(measuredRooms: MeasuredRoom[]): CustomerVanityScopeNote[] {
  return measuredRooms
    .filter((r) => r.isVanityProgram === true && (Number(r.selected) || 0) > 0)
    .map((v) => ({
      roomId: v.id,
      roomName: v.name,
      materialGroup: v.group,
      programLabel: v.vanityProgram?.label,
      note: VANITY_ROLLUP_NOTE
    }));
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
  /** Rounded upgraded edge display amount — $0 when no upgraded edges. */
  summaryEdgeDisplay: number;
  summaryVisibleLinesDisplay: number;
  finalRounded: number;
  /** Per-room extras exact (same source as Live Quote Panel add-ons row). */
  roomExtrasExactByRoomId: Record<string, number>;
  /** Add-ons / Fixtures detail rows — catalog room extras; exact amounts sum to addonsExact. */
  addonDetailLines: CustomerAddonDetailLine[];
  /** Customer-facing structured custom fixtures (sinks, etc.) — listed in Add-ons / Fixtures detail. */
  customerFixtureDetailLines: CustomerAddonDetailLine[];
  /** Estimate Summary rows — displayAmount values sum to finalRounded. */
  estimateSummaryRows: CustomerEstimateSummaryRow[];
  /** Room / Area Cost Breakdown — area totals sum to finalRounded (plus unassigned row when present). */
  roomAreaPrintRows: CustomerPrintDisplayRoomRow[];
  unassignedDisplayTotal: number;
  unassignedExact: number;
  showRoomBreakdown: boolean;
  hasAddons: boolean;
  /** True when catalog add-ons or customer fixture lines appear on the customer PDF. */
  hasAddonOrFixtureDetail: boolean;
  /** Quoted Material Breakdown — scope / SF only (no customer dollar amounts). */
  materialScopeGroups: CustomerMaterialScopeGroup[];
  vanityScopeNotes: CustomerVanityScopeNote[];
  /** Normalized project notes for customer PDF — one bullet per line. */
  customerFacingNoteLines: string[];
  /** Optional per-room material group comparison table. Null when no groups are selected. */
  roomComparisonTable: CustomerPrintComparisonTable | null;
  /** Formatted "Prepared by" display name for the customer PDF. Full name preferred over email. */
  preparedByDisplayName: string;
};

export type BuildCustomerEstimateDisplayModelParams = {
  selectedBreakdown: SelectedMaterialBreakdown;
  measuredRooms: MeasuredRoom[];
  visibleCustomerLines: CustomerEstimateDisplayLineItem[];
  internalMaterialFoldDollars: number;
  roomAreaBreakdown: CustomerRoomAreaCostBreakdown | null;
  /** Raw project notes from Internal Estimate — normalized to customerFacingNoteLines. */
  customerFacingNotes?: string | null;
  /**
   * Upgraded edge charge total (exact, before customer rounding) from the local preview or
   * backend calculate. Rounded to nearest $10 for display. Missing → treated as $0.
   */
  upgradedEdgeTotalExact?: number;
  /**
   * "Prepared by" raw value (email or name) — formatted to a display name for the customer PDF.
   * Omit or leave blank to show "—".
   */
  preparedBy?: string | null;
  /**
   * Already-filtered comparison group rows (from buildInternalEstimateGroupComparison filtered to
   * customerDisplayGroups). When non-empty AND no per-room groups are set, used as legacy global fallback.
   */
  comparisonRows?: InternalEstimateGroupComparisonRow[];
  /**
   * All group comparison rates (unfiltered buildInternalEstimateGroupComparison output).
   * Required for per-room mode so any group combination can be looked up by rate.
   * When omitted, per-room mode falls back to comparisonRows for rate lookup.
   */
  allGroupComparisonRates?: InternalEstimateGroupComparisonRow[];
  /** @deprecated Legacy — Internal Estimate uses internalMaterialUseTax. */
  projectUseTaxPercent?: number;
  /** Internal Estimate: fixed 2% on countertop + backsplash for comparison table. */
  internalMaterialUseTax?: boolean;
};

/**
 * Single customer-facing display model for Internal Estimate customerDisplayTotal and CustomerEstimatePrint.
 * Uses measuredRooms[].extras for add-ons (not addons[] alone). All PDF dollar rows are prepared here.
 */
export function buildCustomerEstimateDisplayModel(
  params: BuildCustomerEstimateDisplayModelParams
): CustomerEstimateDisplayModel {
  // Only true vanity-program rooms are excluded from selectedBreakdown; standard-mode vanity rooms
  // (isVanityProgram === false/undefined) price as countertop and are already in selectedBreakdown.
  // Only true vanity-program rooms are excluded from selectedBreakdown; standard-mode vanity rooms
  // (isVanityProgram === false/undefined) price as countertop and are already in selectedBreakdown.
  // Using r.type === "Vanity" here would double-count any standard-mode vanity room's material.
  //
  // Use vanityProgram.displayTotal (nearest $5) rather than exactTotal so the customer-facing
  // estimate reflects the program price sheet. This prevents fold adjustments or rounding from
  // inflating the vanity amount beyond its stated program price.
  const vanityDisplayContribution = params.measuredRooms
    .filter((r) => r.isVanityProgram === true)
    .reduce(
      (s, v) => s + (v.vanityProgram?.displayTotal ?? roundCustomerDisplayVanity(Number(v.selected) || 0)),
      0
    );
  const countertopMaterialExact = round2(
    params.selectedBreakdown.totals.countertopMaterial +
      vanityDisplayContribution +
      (Number(params.internalMaterialFoldDollars) || 0)
  );
  const backsplashMaterialExact = round2(params.selectedBreakdown.totals.backsplashMaterial);
  const addonsExact = round2(params.measuredRooms.reduce((s, r) => s + (Number(r.extras) || 0), 0));
  const hasAddons = addonsExact !== 0;

  const backsplashCombinedExact = round2(params.selectedBreakdown.totals.backsplashMaterial);
  const bsSf = params.selectedBreakdown.totals.backsplashSf;
  const fhbSf = params.selectedBreakdown.totals.fhbSf;
  const backsplashCombinedDisplay = roundCustomerDisplay(backsplashCombinedExact);
  let summaryBacksplashDisplay = backsplashCombinedDisplay;
  let summaryFhbDisplay = 0;
  if (fhbSf > 0 && bsSf > 0 && backsplashCombinedExact > 0) {
    const parts = splitExactBySfWeights(backsplashCombinedExact, [bsSf, fhbSf]);
    const displayParts = allocateCustomerDisplayFives(parts, backsplashCombinedDisplay);
    summaryBacksplashDisplay = displayParts[0] ?? 0;
    summaryFhbDisplay = displayParts[1] ?? 0;
  } else if (fhbSf > 0 && bsSf <= 0) {
    summaryBacksplashDisplay = 0;
    summaryFhbDisplay = backsplashCombinedDisplay;
  }

  const upgradedEdgeExact = round2(Math.max(0, Number(params.upgradedEdgeTotalExact) || 0));
  const summaryCounterDisplay = roundCustomerDisplay(countertopMaterialExact);
  const summaryAddonsDisplay = hasAddons ? roundCustomerDisplay(addonsExact) : 0;
  const summaryEdgeDisplay = upgradedEdgeExact > 0 ? roundCustomerDisplay(upgradedEdgeExact) : 0;
  const summaryVisibleLinesDisplay = params.visibleCustomerLines.reduce(
    (s, ln) => s + roundCustomerDisplay(Number(ln.lineTotal) || 0),
    0
  );
  const finalRounded =
    summaryCounterDisplay + summaryBacksplashDisplay + summaryAddonsDisplay + summaryEdgeDisplay + summaryVisibleLinesDisplay;

  const roomExtrasExactByRoomId: Record<string, number> = {};
  for (const r of params.measuredRooms) {
    roomExtrasExactByRoomId[r.id] = round2(Number(r.extras) || 0);
  }

  const addonDetailLines = buildCustomerAddonDetailLines(params.measuredRooms);
  const customerFixtureDetailLines = buildCustomerFixtureDetailLines(params.visibleCustomerLines);
  const estimateSummaryRows = buildEstimateSummaryRows({
    summaryCounterDisplay,
    summaryBacksplashDisplay,
    summaryFhbDisplay,
    summaryAddonsDisplay,
    summaryEdgeDisplay,
    hasAddons,
    addonDetailLines,
    customerFixtureDetailLines,
    visibleCustomerLines: params.visibleCustomerLines
  });

  const roomArea = buildRoomAreaPrintRows({
    finalRounded,
    roomAreaBreakdown: params.roomAreaBreakdown,
    roomExtrasExactByRoomId
  });

  const comparisonRows = params.comparisonRows ?? [];
  const roomComparisonTable = buildRoomComparisonTable({
    roomAreaBreakdown: params.roomAreaBreakdown,
    comparisonRows,
    allGroupComparisonRates: params.allGroupComparisonRates,
    projectUseTaxPercent: Math.max(0, Number(params.projectUseTaxPercent) || 0),
    internalMaterialUseTax: params.internalMaterialUseTax === true,
    unassignedDisplayTotal: roomArea.unassignedDisplayTotal
  });

  return {
    countertopMaterialExact,
    backsplashMaterialExact,
    addonsExact,
    summaryCounterDisplay,
    summaryBacksplashDisplay,
    summaryAddonsDisplay,
    summaryEdgeDisplay,
    summaryVisibleLinesDisplay,
    finalRounded,
    roomExtrasExactByRoomId,
    addonDetailLines,
    customerFixtureDetailLines,
    estimateSummaryRows,
    roomAreaPrintRows: roomArea.rows,
    unassignedDisplayTotal: roomArea.unassignedDisplayTotal,
    unassignedExact: roomArea.unassignedExact,
    showRoomBreakdown: roomArea.showRoomBreakdown,
    hasAddons,
    hasAddonOrFixtureDetail: hasAddons || customerFixtureDetailLines.length > 0,
    materialScopeGroups: buildMaterialScopeGroups(params.selectedBreakdown),
    vanityScopeNotes: buildVanityScopeNotes(params.measuredRooms),
    customerFacingNoteLines: parseCustomerFacingNoteLines(params.customerFacingNotes),
    roomComparisonTable,
    preparedByDisplayName: formatPreparedByDisplayName(params.preparedBy)
  };
}
