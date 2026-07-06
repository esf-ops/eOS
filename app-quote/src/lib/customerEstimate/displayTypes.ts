export type CustomerEstimateSummaryRow = {
  key: string;
  label: string;
  displayAmount: number;
};

export type CustomerPrintDisplayAddonLine = {
  label: string;
};

export type CustomerPrintDisplayCustomLine = {
  lineKey?: string;
  name: string;
  amountExact: number;
};

export type CustomerPrintDisplayRoomRow = {
  roomId: string;
  displayName: string;
  isVanity: boolean;
  vanityProgramLabel?: string;
  materialGroup: string;
  colorLabel?: string;
  displayedMaterial: number;
  displayedAddOns: number;
  displayedAreaTotal: number;
  addonLines: CustomerPrintDisplayAddonLine[];
  customerCustomLines: CustomerPrintDisplayCustomLine[];
  customerNoteLines: string[];
};

export type CustomerPrintComparisonExtraLine = {
  key: string;
  label: string;
  displayAmount: number;
};

export type CustomerPrintComparisonGroupBlock = {
  group: string;
  colorLabel?: string;
  countertopDisplay: number;
  backsplashDisplay: number;
  fhbDisplay: number;
  addonsDisplay: number;
  extraLines?: CustomerPrintComparisonExtraLine[];
  roomTotalDisplay: number;
};

export type CustomerPrintComparisonRoomBlock = {
  roomId: string;
  roomDisplayName: string;
  isVanity: boolean;
  groupBlocks: CustomerPrintComparisonGroupBlock[];
};

export type CustomerPrintComparisonTable = {
  roomBlocks: CustomerPrintComparisonRoomBlock[];
  roomRows: unknown[];
  projectDisplayTotals: Record<string, number>;
  selectedGroups: Array<{ group: string; colorLabel?: string }>;
  isPerRoomMode: boolean;
};

/** Frozen display payload consumed by CustomerEstimateDocument (print snapshot subset). */
export type CustomerEstimateDocumentDisplay = {
  estimateSummaryRows: CustomerEstimateSummaryRow[];
  finalRounded: number;
  showRoomBreakdown: boolean;
  roomAreaPrintRows: CustomerPrintDisplayRoomRow[];
  unassignedExact: number;
  unassignedDisplayTotal: number;
  roomComparisonTable: CustomerPrintComparisonTable | null;
  customerFacingNoteLines: string[];
  preparedByDisplayName: string;
};

export type CustomerEstimatePrintSnapshotHeader = {
  estimateDate: string;
  quoteNumber: string;
  accountName?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  city?: string | null;
  state?: string | null;
  branch?: string | null;
  salesRep?: string | null;
  primaryGroup?: string | null;
  primaryColorLabel?: string | null;
  colorTbd?: boolean;
};

export const CUSTOMER_ESTIMATE_PRINT_SNAPSHOT_VERSION = 1;

export type CustomerEstimatePrintSnapshot = {
  version: typeof CUSTOMER_ESTIMATE_PRINT_SNAPSHOT_VERSION;
  finalRounded: number;
  header: CustomerEstimatePrintSnapshotHeader;
  display: CustomerEstimateDocumentDisplay;
};

export type CustomerEstimatePrintSnapshotHeaderInput = Omit<
  CustomerEstimatePrintSnapshotHeader,
  "quoteNumber"
> & {
  quoteNumber?: string | null;
};
