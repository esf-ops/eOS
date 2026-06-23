/**
 * Print snapshot save contract — create-save patching and reconciliation.
 *
 * Run: node backend-core/src/quoteDelivery/customerEstimatePrintSnapshotSave.test.mjs
 */
import assert from "node:assert/strict";

import {
  patchPrintSnapshotQuoteNumber,
  parseCustomerEstimatePrintSnapshot,
  printSnapshotMatchesCustomerDisplayTotal
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

testPreSaveSnapshotReconcilesWithCustomerDisplayTotal();
testPatchQuoteNumberMakesSnapshotDeliverable();
console.log("customerEstimatePrintSnapshotSave: all tests passed");
