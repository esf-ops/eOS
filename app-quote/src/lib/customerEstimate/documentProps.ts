import type { CustomerEstimateDocumentDisplay, CustomerEstimatePrintSnapshot } from "./displayTypes";

export type CustomerEstimateDocumentProps = {
  accountName: string;
  customerName: string;
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  branch: string;
  salesRep: string;
  /** @deprecated Use customerDisplay.preparedByDisplayName instead. Kept for backward compat. */
  preparedBy: string;
  quoteNumber: string;
  primaryGroup: string;
  primaryColorLabel: string;
  colorTbd: boolean;
  estimateTotalExact: number;
  customerDisplay: CustomerEstimateDocumentDisplay;
  estimateDate: string;
};

export type CustomerLineItem = {
  lineKey?: string;
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  roomName: string;
};

export type CustomerRoomAddonLine = {
  label: string;
  total: number;
  roomName: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ""): string {
  return String(value ?? "").trim() || fallback;
}

function asBool(value: unknown): boolean {
  return Boolean(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Map a frozen print snapshot to document props for SSR / PDF. */
export function snapshotToDocumentProps(
  printSnapshot: unknown
): CustomerEstimateDocumentProps | null {
  const snap = asRecord(printSnapshot);
  if (!snap) return null;

  const header = asRecord(snap.header);
  const display = asRecord(snap.display);
  if (!header || !display) return null;

  const quoteNumber = asString(header.quoteNumber);
  if (!quoteNumber) return null;

  const estimateSummaryRows = Array.isArray(display.estimateSummaryRows)
    ? display.estimateSummaryRows.map((row) => {
        const r = asRecord(row);
        return {
          key: asString(r?.key, "row"),
          label: asString(r?.label),
          displayAmount: asNumber(r?.displayAmount)
        };
      })
    : [];

  const roomAreaPrintRows = Array.isArray(display.roomAreaPrintRows)
    ? display.roomAreaPrintRows.map((row) => {
        const r = asRecord(row);
        const addonLines = Array.isArray(r?.addonLines)
          ? r.addonLines.map((a) => ({ label: asString(asRecord(a)?.label) }))
          : [];
        const customerCustomLines = Array.isArray(r?.customerCustomLines)
          ? r.customerCustomLines.map((c) => {
              const line = asRecord(c);
              return {
                lineKey: asString(line?.lineKey) || undefined,
                name: asString(line?.name),
                amountExact: asNumber(line?.amountExact)
              };
            })
          : [];
        const customerNoteLines = Array.isArray(r?.customerNoteLines)
          ? r.customerNoteLines.map((n) => asString(n)).filter(Boolean)
          : [];
        return {
          roomId: asString(r?.roomId, "room"),
          displayName: asString(r?.displayName),
          isVanity: asBool(r?.isVanity),
          vanityProgramLabel: asString(r?.vanityProgramLabel) || undefined,
          materialGroup: asString(r?.materialGroup),
          colorLabel: asString(r?.colorLabel) || undefined,
          displayedMaterial: asNumber(r?.displayedMaterial),
          displayedAddOns: asNumber(r?.displayedAddOns),
          displayedAreaTotal: asNumber(r?.displayedAreaTotal),
          addonLines,
          customerCustomLines,
          customerNoteLines
        };
      })
    : [];

  let roomComparisonTable: CustomerEstimateDocumentDisplay["roomComparisonTable"] = null;
  const comparison = asRecord(display.roomComparisonTable);
  if (comparison && Array.isArray(comparison.roomBlocks)) {
    const roomBlocks = comparison.roomBlocks.map((roomBlock) => {
      const rb = asRecord(roomBlock);
      const groupBlocks = Array.isArray(rb?.groupBlocks)
        ? rb.groupBlocks.map((gb) => {
            const g = asRecord(gb);
            return {
              group: asString(g?.group),
              colorLabel: asString(g?.colorLabel) || undefined,
              countertopDisplay: asNumber(g?.countertopDisplay),
              backsplashDisplay: asNumber(g?.backsplashDisplay),
              fhbDisplay: asNumber(g?.fhbDisplay),
              addonsDisplay: asNumber(g?.addonsDisplay),
              extraLines: Array.isArray(g?.extraLines)
                ? g.extraLines.map((line) => {
                    const row = asRecord(line);
                    return {
                      key: asString(row?.key, "extra"),
                      label: asString(row?.label),
                      displayAmount: asNumber(row?.displayAmount)
                    };
                  })
                : undefined,
              roomTotalDisplay: asNumber(g?.roomTotalDisplay)
            };
          })
        : [];
      return {
        roomId: asString(rb?.roomId, "room"),
        roomDisplayName: asString(rb?.roomDisplayName),
        isVanity: asBool(rb?.isVanity),
        groupBlocks
      };
    });
    const projectDisplayTotals =
      asRecord(comparison.projectDisplayTotals) != null
        ? Object.fromEntries(
            Object.entries(asRecord(comparison.projectDisplayTotals)!).map(([k, v]) => [k, asNumber(v)])
          )
        : {};
    const selectedGroups = Array.isArray(comparison.selectedGroups)
      ? comparison.selectedGroups.map((g) => {
          const group = asRecord(g);
          return {
            group: asString(group?.group),
            colorLabel: asString(group?.colorLabel) || undefined
          };
        })
      : [];
    roomComparisonTable = {
      roomBlocks,
      roomRows: Array.isArray(comparison.roomRows) ? comparison.roomRows : [],
      projectDisplayTotals,
      selectedGroups,
      isPerRoomMode: asBool(comparison.isPerRoomMode)
    };
  }

  const customerFacingNoteLines = Array.isArray(display.customerFacingNoteLines)
    ? display.customerFacingNoteLines.map((n) => asString(n)).filter(Boolean)
    : [];

  const customerDisplay: CustomerEstimateDocumentDisplay = {
    estimateSummaryRows,
    finalRounded: asNumber(display.finalRounded),
    showRoomBreakdown: asBool(display.showRoomBreakdown),
    roomAreaPrintRows,
    unassignedExact: asNumber(display.unassignedExact),
    unassignedDisplayTotal: asNumber(display.unassignedDisplayTotal),
    roomComparisonTable,
    customerFacingNoteLines,
    preparedByDisplayName: asString(display.preparedByDisplayName)
  };

  return {
    accountName: asString(header.accountName),
    customerName: asString(header.customerName),
    projectName: asString(header.projectName),
    projectAddress: asString(header.projectAddress),
    city: asString(header.city),
    state: asString(header.state),
    branch: asString(header.branch),
    salesRep: asString(header.salesRep),
    preparedBy: customerDisplay.preparedByDisplayName,
    quoteNumber,
    primaryGroup: asString(header.primaryGroup),
    primaryColorLabel: asString(header.primaryColorLabel),
    colorTbd: asBool(header.colorTbd),
    estimateTotalExact: asNumber(snap.finalRounded),
    customerDisplay,
    estimateDate: asString(header.estimateDate)
  };
}

/** Typed snapshot → document props (frontend save path). */
export function printSnapshotToDocumentProps(
  snapshot: CustomerEstimatePrintSnapshot
): CustomerEstimateDocumentProps | null {
  return snapshotToDocumentProps(snapshot);
}
