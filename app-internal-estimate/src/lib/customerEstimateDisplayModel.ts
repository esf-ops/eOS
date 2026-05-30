import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import { round2 } from "@quote-lib/measurementEngine";
import type {
  CustomerRoomAreaCostBreakdown,
  SelectedMaterialBreakdown,
  SelectedMaterialScopeLine
} from "@quote-lib/prototypeQuoteMath";
import type { MeasuredRoom } from "@quote-lib/quoteTypes";
import {
  prepareCustomerPrintDisplayRows,
  type CustomerPrintDisplayRoomRow
} from "./customerPrintDisplayRows";

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
 * Split a customer-facing rounded total across positive exact weights using proportional $10 buckets
 * + largest remainder so displayed amounts sum exactly to `targetDisplay` (always a multiple of $10).
 */
export function allocateCustomerDisplayTens(exacts: number[], targetDisplay: number): number[] {
  const n = exacts.length;
  if (n === 0) return [];
  const cleaned = exacts.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumExact = cleaned.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.round(targetDisplay));
  if (sumExact <= 0 || target <= 0) return cleaned.map(() => 0);

  const units = Math.round(target / 10);
  if (units <= 0) return cleaned.map(() => 0);

  const rawUnits = cleaned.map((e) => (e / sumExact) * units);
  const floorUnits = rawUnits.map((r) => Math.floor(r));
  const assigned = floorUnits.reduce((a, b) => a + b, 0);
  let deficit = units - assigned;
  const order = rawUnits
    .map((r, i) => ({ i, rem: r - floorUnits[i] }))
    .sort((a, b) => b.rem - a.rem);
  const out = floorUnits.map((f) => f * 10);
  for (let k = 0; k < deficit; k++) {
    out[order[k].i] += 10;
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
  summaryAddonsDisplay: number;
  hasAddons: boolean;
  visibleCustomerLines: CustomerEstimateDisplayLineItem[];
}): CustomerEstimateSummaryRow[] {
  const rows: CustomerEstimateSummaryRow[] = [
    { key: "countertop", label: "Countertop material", displayAmount: params.summaryCounterDisplay },
    { key: "backsplash", label: "Backsplash material", displayAmount: params.summaryBacksplashDisplay }
  ];
  if (params.hasAddons) {
    rows.push({ key: "addons", label: "Add-ons / fixtures", displayAmount: params.summaryAddonsDisplay });
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
  const targetRoomDisplay = Math.max(0, params.finalRounded - unassignedDisplay);
  const roomAreaDisplayTotals = allocateCustomerDisplayTens(
    roomRows.map((r) => r.roomTotalExact),
    targetRoomDisplay
  );

  const prepared = prepareCustomerPrintDisplayRows({
    roomRows,
    roomAreaDisplayTotals,
    roomExtrasExact: roomRows.map((r) => params.roomExtrasExactByRoomId[r.roomId] ?? 0),
    unassignedDisplayTotal: unassignedDisplay
  });

  return {
    rows: prepared.rows,
    unassignedDisplayTotal: unassignedDisplay,
    unassignedExact,
    showRoomBreakdown: true
  };
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
    .filter((r) => r.type === "Vanity" && (Number(r.selected) || 0) > 0)
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
};

export type BuildCustomerEstimateDisplayModelParams = {
  selectedBreakdown: SelectedMaterialBreakdown;
  measuredRooms: MeasuredRoom[];
  visibleCustomerLines: CustomerEstimateDisplayLineItem[];
  internalMaterialFoldDollars: number;
  roomAreaBreakdown: CustomerRoomAreaCostBreakdown | null;
};

/**
 * Single customer-facing display model for Internal Estimate customerDisplayTotal and CustomerEstimatePrint.
 * Uses measuredRooms[].extras for add-ons (not addons[] alone). All PDF dollar rows are prepared here.
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
  const customerFixtureDetailLines = buildCustomerFixtureDetailLines(params.visibleCustomerLines);
  const estimateSummaryRows = buildEstimateSummaryRows({
    summaryCounterDisplay,
    summaryBacksplashDisplay,
    summaryAddonsDisplay,
    hasAddons,
    visibleCustomerLines: params.visibleCustomerLines
  });

  const roomArea = buildRoomAreaPrintRows({
    finalRounded,
    roomAreaBreakdown: params.roomAreaBreakdown,
    roomExtrasExactByRoomId
  });

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
    vanityScopeNotes: buildVanityScopeNotes(params.measuredRooms)
  };
}
