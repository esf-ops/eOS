/**
 * Run: node backend-core/src/integrations/mondayInternalBoardSync.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildInternalEstimateSummaryForMonday,
  buildInternalMondayItemName,
  buildMondayInternalColumnValuesFromMap,
  formatValueForMondayColumn,
  internalMondayColumnMappingConfigured,
  resolveInternalMondayColumnMap
} from "./mondayInternalBoardSync.js";

function testItemName() {
  const name = buildInternalMondayItemName({
    quote_number: "ESF-1001",
    customer_name: "Acme",
    city: "Dubuque",
    state: "IA"
  });
  assert.ok(name.includes("ESF-1001"));
  assert.ok(name.includes("Acme"));
  assert.ok(name.includes("Dubuque, IA"));
}

function testEstimateSummarySkipsInternalLines() {
  const summary = buildInternalEstimateSummaryForMonday({
    calc: { totals: { retail: 8450, estimated_sqft: 52.5 } },
    body: {
      customLineItems: [
        { name: "Secret fee", customerFacing: false },
        { name: "Trip", customerFacing: true }
      ],
      estimateRoomDrafts: [{ name: "Kitchen" }, { name: "Primary Bath" }]
    },
    snapshot: {
      internal_ui: {
        estimate_room_drafts: [
          { name: "Kitchen", vanityProgram2026: true },
          { name: "Primary Bath" }
        ]
      }
    }
  });
  assert.ok(summary.includes("Kitchen"));
  assert.ok(!summary.includes("Secret fee"));
  assert.ok(summary.includes("Trip"));
  assert.ok(summary.includes("Vanity program"));
}

function testUnsupportedTypeSkipped() {
  const r = formatValueForMondayColumn({
    fieldKey: "salesperson",
    rawValue: "Pat",
    valueKind: "text",
    columnType: "people",
    columnId: "people_col"
  });
  assert.equal(r.value, null);
  assert.ok(String(r.skipReason || "").includes("unsupported"));
}

function testEnvColumnMapping() {
  const map = resolveInternalMondayColumnMap({
    env: {
      MONDAY_INTERNAL_COL_QUOTE_ID: "text_qid",
      MONDAY_INTERNAL_COL_STATUS: "status_col"
    },
    allowTitleMatch: false
  });
  assert.equal(map.quote_id.columnId, "text_qid");
  const { columnValues, skippedColumns } = buildMondayInternalColumnValuesFromMap({
    payload: {
      quote_number: "ESF-9",
      quote_status: "draft",
      quote_total: 1000,
      customer_name: "X"
    },
    estimateSummary: "Rooms: Bath.",
    columnMap: map
  });
  assert.equal(columnValues.text_qid, "ESF-9");
  assert.ok(columnValues.status_col);
  assert.ok(skippedColumns.some((s) => s.detail === "MONDAY_INTERNAL_COL_QUOTE_AMOUNT" || s.reason === "no_column_id"));
}

function testMappingConfigured() {
  assert.equal(internalMondayColumnMappingConfigured({}), false);
  assert.equal(internalMondayColumnMappingConfigured({ MONDAY_INTERNAL_COL_CITY: "abc" }), true);
}

testItemName();
testEstimateSummarySkipsInternalLines();
testUnsupportedTypeSkipped();
testEnvColumnMapping();
testMappingConfigured();
console.log("mondayInternalBoardSync.test.mjs: ok");
