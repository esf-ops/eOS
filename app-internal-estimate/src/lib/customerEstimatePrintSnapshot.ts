import type { CustomerEstimateDisplayModel } from "./customerEstimateDisplayModel";

export const CUSTOMER_ESTIMATE_PRINT_SNAPSHOT_VERSION = 1;

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

/** Frozen customer-safe print payload stored on save for email PDF attachment generation. */
export type CustomerEstimatePrintSnapshot = {
  version: typeof CUSTOMER_ESTIMATE_PRINT_SNAPSHOT_VERSION;
  /** Must equal internal_ui.customer_display_total at save time. */
  finalRounded: number;
  header: CustomerEstimatePrintSnapshotHeader;
  display: CustomerEstimateDisplayModel;
};

/** Header fields for a print snapshot — quote number may be filled server-side on first create save. */
export type CustomerEstimatePrintSnapshotHeaderInput = Omit<
  CustomerEstimatePrintSnapshotHeader,
  "quoteNumber"
> & {
  quoteNumber?: string | null;
};

export function buildCustomerEstimatePrintSnapshot(params: {
  display: CustomerEstimateDisplayModel;
  header: CustomerEstimatePrintSnapshotHeader;
}): CustomerEstimatePrintSnapshot {
  const quoteNumber = String(params.header.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer print snapshot requires a saved quote number");
  }
  return buildCustomerEstimatePrintSnapshotCore(params.display, {
    ...params.header,
    quoteNumber
  });
}

/**
 * Build a print snapshot for save payloads before a quote number exists (create flow).
 * Server patches header.quoteNumber after ESF allocation.
 */
export function buildCustomerEstimatePrintSnapshotForSave(params: {
  display: CustomerEstimateDisplayModel;
  header: CustomerEstimatePrintSnapshotHeaderInput;
}): CustomerEstimatePrintSnapshot {
  const quoteNumber = String(params.header.quoteNumber ?? "").trim();
  return buildCustomerEstimatePrintSnapshotCore(params.display, {
    ...params.header,
    quoteNumber
  });
}

function buildCustomerEstimatePrintSnapshotCore(
  display: CustomerEstimateDisplayModel,
  header: CustomerEstimatePrintSnapshotHeader
): CustomerEstimatePrintSnapshot {
  const finalRounded = Math.round(Number(display.finalRounded) || 0);
  return {
    version: CUSTOMER_ESTIMATE_PRINT_SNAPSHOT_VERSION,
    finalRounded,
    header: {
      ...header,
      quoteNumber: String(header.quoteNumber ?? "").trim()
    },
    display: JSON.parse(JSON.stringify(display)) as CustomerEstimateDisplayModel
  };
}

export function assertPrintSnapshotMatchesCustomerDisplayTotal(
  snapshot: CustomerEstimatePrintSnapshot,
  customerDisplayTotal: number
): void {
  const cdt = Math.round(Number(customerDisplayTotal) || 0);
  if (!Number.isFinite(cdt) || cdt <= 0) return;
  if (snapshot.finalRounded !== cdt) {
    throw new Error(
      `customer_estimate_print_snapshot.finalRounded (${snapshot.finalRounded}) must equal customer_display_total (${cdt})`
    );
  }
}
