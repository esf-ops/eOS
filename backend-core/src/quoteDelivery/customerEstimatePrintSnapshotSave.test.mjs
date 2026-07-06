/**
 * Print snapshot save contract — create-save patching and reconciliation.
 *
 * Run: node backend-core/src/quoteDelivery/customerEstimatePrintSnapshotSave.test.mjs
 */
import assert from "node:assert/strict";

import {
  patchPrintSnapshotQuoteNumber,
  parseCustomerEstimatePrintSnapshot,
  printSnapshotComparisonReconciles,
  printSnapshotComparisonHasExtraLineMetadata,
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

function testComparisonSnapshotIncludesProjectMiscLines() {
  const snap = {
    version: 1,
    finalRounded: 4095,
    header: {
      estimateDate: "July 6, 2026",
      quoteNumber: "ESF-LIS-000099",
      customerName: "Customer",
      projectName: "Kitchen"
    },
    display: {
      finalRounded: 4095,
      estimateSummaryRows: [
        { key: "countertop", label: "Countertop material", displayAmount: 3745 },
        { key: "addon-0", label: "Kitchen Sink Cutouts · Kitchen", displayAmount: 200 },
        { key: "popup-outlet", label: "Pop Up Outlet — Miscellaneous", displayAmount: 150 }
      ],
      preparedByDisplayName: "Rep",
      showRoomBreakdown: true,
      customerFacingNoteLines: [],
      roomComparisonTable: {
        roomBlocks: [
          {
            roomId: "kitchen",
            roomDisplayName: "Kitchen",
            isVanity: false,
            groupBlocks: [
              {
                group: "Group A",
                countertopDisplay: 4365,
                backsplashDisplay: 0,
                fhbDisplay: 0,
                addonsDisplay: 350,
                extraLines: [
                  { key: "addon-0", label: "Kitchen Sink Cutouts", displayAmount: 200 },
                  { key: "popup-outlet", label: "Pop Up Outlet — Miscellaneous", displayAmount: 150 }
                ],
                roomTotalDisplay: 4715
              }
            ]
          }
        ],
        roomRows: [],
        projectDisplayTotals: { "Group A": 4715 },
        selectedGroups: [{ group: "Group A" }],
        isPerRoomMode: true
      }
    }
  };
  assert.equal(printSnapshotComparisonReconciles(snap), true);
}

function testStaleComparisonSnapshotMissingExtraLineMetadata() {
  const snap = {
    version: 1,
    finalRounded: 4095,
    header: {
      estimateDate: "July 6, 2026",
      quoteNumber: "ESF-LIS-000099",
      customerName: "Customer",
      projectName: "Kitchen"
    },
    display: {
      finalRounded: 4095,
      estimateSummaryRows: [
        { key: "countertop", label: "Countertop material", displayAmount: 3745 },
        { key: "addon-0", label: "Kitchen Sink Cutouts · Kitchen", displayAmount: 200 },
        { key: "popup-outlet", label: "Pop Up Outlet — Miscellaneous", displayAmount: 150 }
      ],
      preparedByDisplayName: "Rep",
      showRoomBreakdown: true,
      customerFacingNoteLines: [],
      roomComparisonTable: {
        roomBlocks: [
          {
            roomId: "kitchen",
            roomDisplayName: "Kitchen",
            isVanity: false,
            groupBlocks: [
              {
                group: "Group A",
                countertopDisplay: 4365,
                backsplashDisplay: 0,
                fhbDisplay: 0,
                addonsDisplay: 200,
                roomTotalDisplay: 4565
              }
            ]
          }
        ],
        roomRows: [],
        projectDisplayTotals: { "Group A": 4565 },
        selectedGroups: [{ group: "Group A" }],
        isPerRoomMode: true
      }
    }
  };
  assert.equal(printSnapshotComparisonReconciles(snap), true);
  assert.equal(printSnapshotComparisonHasExtraLineMetadata(snap), false);
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
testComparisonSnapshotIncludesProjectMiscLines();
testStaleComparisonSnapshotMissingExtraLineMetadata();
testStaleFhbSnapshotFailsSummaryReconciliation();
console.log("customerEstimatePrintSnapshotSave: all tests passed");
