import type {
  CustomerEstimateDocumentDisplay,
  CustomerEstimatePrintSnapshot,
  CustomerEstimatePrintSnapshotHeader,
  CustomerEstimatePrintSnapshotHeaderInput
} from "./displayTypes";
import { CUSTOMER_ESTIMATE_PRINT_SNAPSHOT_VERSION } from "./displayTypes";

export function buildCustomerEstimatePrintSnapshot(params: {
  display: CustomerEstimateDocumentDisplay;
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

export function buildCustomerEstimatePrintSnapshotForSave(params: {
  display: CustomerEstimateDocumentDisplay;
  header: CustomerEstimatePrintSnapshotHeaderInput;
}): CustomerEstimatePrintSnapshot {
  const quoteNumber = String(params.header.quoteNumber ?? "").trim();
  return buildCustomerEstimatePrintSnapshotCore(params.display, {
    ...params.header,
    quoteNumber
  });
}

function buildCustomerEstimatePrintSnapshotCore(
  display: CustomerEstimateDocumentDisplay,
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
    display: JSON.parse(JSON.stringify(display)) as CustomerEstimateDocumentDisplay
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
