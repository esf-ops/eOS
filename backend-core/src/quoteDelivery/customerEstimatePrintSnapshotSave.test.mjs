/**
 * Print snapshot save contract — create-save patching and reconciliation.
 *
 * Run: node backend-core/src/quoteDelivery/customerEstimatePrintSnapshotSave.test.mjs
 */
import assert from "node:assert/strict";

import {
  patchPrintSnapshotQuoteNumber,
  parseCustomerEstimatePrintSnapshot,
  printSnapshotMatchesCustomerDisplayTotal,
  printSnapshotSummaryRowsReconcile
} from "./customerEstimatePrintSnapshot.js";

function makePreSaveSnapshot() {
  return {
    version: 1,
    finalRounded: 12450,
    header: {
      estimateDate: "June 23, 2026",
      quoteNumber: "",
      customerName: "Jane Customer",
      projectName: "Kitchen Remodel"
    },
    display: {
      finalRounded: 12450,
      estimateSummaryRows: [{ key: "t", label: "Total", displayAmount: 12450 }],
      preparedByDisplayName: "Peg Reid",
      showRoomBreakdown: false,
      customerFacingNoteLines: [],
      roomComparisonTable: null
    }
  };
}

function testPreSaveSnapshotReconcilesWithCustomerDisplayTotal() {
  const snap = makePreSaveSnapshot();
  assert.equal(printSnapshotMatchesCustomerDisplayTotal(snap, 12450), true);
  assert.equal(printSnapshotMatchesCustomerDisplayTotal(snap, 9999), false);
}

function testPatchQuoteNumberMakesSnapshotDeliverable() {
  const store = {
    internal_ui: {
      customer_display_total: 12450,
      customer_estimate_print_snapshot: makePreSaveSnapshot()
    }
  };
  assert.equal(parseCustomerEstimatePrintSnapshot(store.internal_ui.customer_estimate_print_snapshot), null);
  patchPrintSnapshotQuoteNumber(store, "ESF-LIS-000123");
  assert.ok(parseCustomerEstimatePrintSnapshot(store.internal_ui.customer_estimate_print_snapshot));
}

function testFhbSnapshotSummaryRowsReconcile() {
  const snap = {
    version: 1,
    finalRounded: 6155,
    header: {
      estimateDate: "June 10, 2026",
      quoteNumber: "ESF-LIS-000053-R2",
      customerName: "Customer",
      projectName: "Kitchen"
    },
    display: {
      finalRounded: 6155,
      estimateSummaryRows: [
        { key: "countertop", label: "Countertop material", displayAmount: 2950 },
        { key: "fhb", label: "Full-height backsplash material", displayAmount: 2605 },
        { key: "addon-0", label: "Kitchen Sink Cutouts · Kitchen", displayAmount: 200 },
        { key: "addon-1", label: "Electrical Outlet Cutouts · Kitchen", displayAmount: 150 },
        { key: "window-sill", label: "Window Sill Labor — Miscellaneous", displayAmount: 100 },
        { key: "edge-polish", label: "Flat Polished appliance edge — Miscellaneous", displayAmount: 150 }
      ],
      preparedByDisplayName: "Rep",
      showRoomBreakdown: true,
      customerFacingNoteLines: [],
      roomComparisonTable: null
    }
  };
  assert.equal(printSnapshotSummaryRowsReconcile(snap), true);
  assert.equal(printSnapshotMatchesCustomerDisplayTotal(snap, 6155), true);
}

function testStaleFhbSnapshotFailsSummaryReconciliation() {
  const snap = {
    version: 1,
    finalRounded: 3550,
    header: {
      estimateDate: "June 10, 2026",
      quoteNumber: "ESF-LIS-000053-R2",
      customerName: "Customer",
      projectName: "Kitchen"
    },
    display: {
      finalRounded: 3550,
      estimateSummaryRows: [
        { key: "countertop", label: "Countertop material", displayAmount: 2950 },
        { key: "fhb", label: "Full-height backsplash material", displayAmount: 2605 },
        { key: "addon-0", label: "Kitchen Sink Cutouts · Kitchen", displayAmount: 200 },
        { key: "addon-1", label: "Electrical Outlet Cutouts · Kitchen", displayAmount: 150 },
        { key: "window-sill", label: "Window Sill Labor — Miscellaneous", displayAmount: 100 },
        { key: "edge-polish", label: "Flat Polished appliance edge — Miscellaneous", displayAmount: 150 }
      ],
      preparedByDisplayName: "Rep",
      showRoomBreakdown: true,
      customerFacingNoteLines: [],
      roomComparisonTable: null
    }
  };
  assert.equal(printSnapshotSummaryRowsReconcile(snap), false);
  assert.equal(printSnapshotMatchesCustomerDisplayTotal(snap, 3550), true);
}

testPreSaveSnapshotReconcilesWithCustomerDisplayTotal();
testPatchQuoteNumberMakesSnapshotDeliverable();
testFhbSnapshotSummaryRowsReconcile();
testStaleFhbSnapshotFailsSummaryReconciliation();
console.log("customerEstimatePrintSnapshotSave: all tests passed");
