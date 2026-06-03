import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
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

/** Per-room row in the optional material group comparison table. */
export type CustomerPrintComparisonRoomRow = {
  roomId: string;
  roomDisplayName: string;
  isVanity: boolean;
  /** Displayed area total per selected comparison group. Key = group name. */
  groupDisplayTotals: Record<string, number>;
};

/** Full optional material group comparison table for the customer PDF. */
export type CustomerPrintComparisonTable = {
  roomRows: CustomerPrintComparisonRoomRow[];
  /** Estimated project total per selected group (sum of room totals + unassigned). */
  projectDisplayTotals: Record<string, number>;
  /** Selected groups in display order, with optional color labels. */
  selectedGroups: Array<{ group: string; colorLabel?: string }>;
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

/** @deprecated Use allocateCustomerDisplayFives — rounding is now nearest $5. */
export const allocateCustomerDisplayTens = allocateCustomerDisplayFives;

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
  summaryAddonsDisplay: number;
  summaryEdgeDisplay: number;
  hasAddons: boolean;
  addonDetailLines: CustomerAddonDetailLine[];
  customerFixtureDetailLines: CustomerAddonDetailLine[];
  visibleCustomerLines: CustomerEstimateDisplayLineItem[];
}): CustomerEstimateSummaryRow[] {
  const rows: CustomerEstimateSummaryRow[] = [
    { key: "countertop", label: "Countertop material", displayAmount: params.summaryCounterDisplay },
    { key: "backsplash", label: "Backsplash material", displayAmount: params.summaryBacksplashDisplay }
  ];

  // Specific add-on lines instead of a single generic "Add-ons / fixtures" row.
  // Catalog add-ons and customer fixture lines are expanded individually.
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
    params.customerFixtureDetailLines.forEach((a, idx) => {
      if (a.displayAmount <= 0) return;
      const key = `fixture-${idx}-${a.label}-${a.roomName}`;
      const label = a.roomName ? `${a.label} · ${a.roomName}` : a.label;
      rows.push({ key, label, displayAmount: a.displayAmount });
    });
    // Fallback: if no individual lines resolved (e.g. all zero), keep generic row to preserve total
    const specificCount = params.addonDetailLines.filter((a) => a.displayAmount > 0).length +
      params.customerFixtureDetailLines.filter((a) => a.displayAmount > 0).length;
    if (specificCount === 0 && params.summaryAddonsDisplay > 0) {
      rows.push({ key: "addons", label: "Add-ons / fixtures", displayAmount: params.summaryAddonsDisplay });
    }
  }

  if (params.summaryEdgeDisplay > 0) {
    rows.push({ key: "edge_upgrades", label: "Edge upgrades", displayAmount: params.summaryEdgeDisplay });
  }
  params.visibleCustomerLines.forEach((ln, index) => {
    const displayAmount = roundCustomerDisplay(Number(ln.lineTotal) || 0);
    if (displayAmount <= 0) return;
    let label = ln.name.trim() || "Custom item";
    if (ln.description?.trim()) label += ` — ${ln.description.trim()}`;
    if (ln.roomName?.trim()) label += ` (${ln.roomName.trim()})`;
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

  const unassignedDisplay = unassignedExact > 0 ? roundCustomerDisplay(unassignedExact) : 0;

  // Separate vanity rooms (fixed display total, immune to fold/rounding inflation) from
  // proportional rooms. The fixed sum is subtracted from targetRoomDisplay before proportional
  // allocation, ensuring the vanity program customer price is never inflated by internal adjustments.
  const fixedTotal = roomRows.reduce((s, r) => s + (r.fixedDisplayTotal ?? 0), 0);
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

/**
 * Build the per-room optional material group comparison table.
 * For vanity program rooms the display total is fixed across all groups.
 * For other rooms, material is re-priced at each group's rate using the rate from comparisonRows.
 * Room add-ons are fixed (unchanged across groups).
 */
function buildRoomComparisonTable(params: {
  roomAreaBreakdown: CustomerRoomAreaCostBreakdown | null;
  comparisonRows: InternalEstimateGroupComparisonRow[];
  projectUseTaxPercent: number;
  unassignedDisplayTotal: number;
}): CustomerPrintComparisonTable | null {
  const { comparisonRows, roomAreaBreakdown } = params;
  if (!comparisonRows.length || !roomAreaBreakdown?.rooms.length) return null;

  const selectedGroups = comparisonRows.map((r) => ({
    group: r.group,
    colorLabel: r.comparisonColorLabel
  }));
  const taxPct = Math.max(0, Number(params.projectUseTaxPercent) || 0);

  const roomRows: CustomerPrintComparisonRoomRow[] = [];

  for (const room of roomAreaBreakdown.rooms) {
    const addonSum = round2(room.addons.reduce((s, a) => s + a.amountExact, 0));
    const customSum = round2(room.customerCustomLines.reduce((s, c) => s + c.amountExact, 0));
    const fixedExtrasExact = round2(addonSum + customSum);

    const groupDisplayTotals: Record<string, number> = {};
    for (const compRow of comparisonRows) {
      if (room.isVanity) {
        // Vanity program price is fixed regardless of material group
        groupDisplayTotals[compRow.group] = room.fixedDisplayTotal ?? roundCustomerDisplay(room.roomTotalExact);
      } else {
        const rate = compRow.ratePerSqft;
        const counterMat = round2(room.countertopSf * rate);
        const useTax = taxPct > 0 ? round2(counterMat * (taxPct / 100)) : 0;
        const backsplashMat = round2(room.backsplashFhbSf * rate);
        const totalExact = round2(counterMat + useTax + backsplashMat + fixedExtrasExact);
        groupDisplayTotals[compRow.group] = roundCustomerDisplay(totalExact);
      }
    }

    roomRows.push({
      roomId: room.roomId,
      roomDisplayName: room.displayName,
      isVanity: room.isVanity,
      groupDisplayTotals
    });
  }

  const projectDisplayTotals: Record<string, number> = {};
  for (const compRow of comparisonRows) {
    const roomSum = roomRows.reduce((s, r) => s + (r.groupDisplayTotals[compRow.group] ?? 0), 0);
    projectDisplayTotals[compRow.group] = round2(roomSum + params.unassignedDisplayTotal);
  }

  return { roomRows, projectDisplayTotals, selectedGroups };
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
   * customerDisplayGroups). When non-empty, roomComparisonTable is built in the display model.
   */
  comparisonRows?: InternalEstimateGroupComparisonRow[];
  /** Project use tax percent — required for per-room comparison pricing. */
  projectUseTaxPercent?: number;
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

  const upgradedEdgeExact = round2(Math.max(0, Number(params.upgradedEdgeTotalExact) || 0));
  const summaryCounterDisplay = roundCustomerDisplay(countertopMaterialExact);
  const summaryBacksplashDisplay = roundCustomerDisplay(backsplashMaterialExact);
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
    projectUseTaxPercent: Math.max(0, Number(params.projectUseTaxPercent) || 0),
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
