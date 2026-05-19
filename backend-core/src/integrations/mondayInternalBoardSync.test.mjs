/**
 * Run: node backend-core/src/integrations/mondayInternalBoardSync.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildInternalEstimateLinkValue,
  buildInternalEstimateSummaryForMonday,
  buildInternalMondayItemName,
  buildMondayInternalColumnValuesFromMap,
  classifyMondayColumnApplyResult,
  formatUseTaxSummaryFragment,
  formatValueForMondayColumn,
  internalMondayColumnMappingConfigured,
  mapInternalStatusToMondayLabel,
  resolveEstimatorDisplayName,
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

function testStatusMapping() {
  assert.equal(mapInternalStatusToMondayLabel("draft"), "Pending");
  assert.equal(mapInternalStatusToMondayLabel("testing_review"), "Pending");
  assert.equal(mapInternalStatusToMondayLabel("sent"), "In Negotiation");
  assert.equal(mapInternalStatusToMondayLabel("sold"), "Accepted");
  assert.equal(mapInternalStatusToMondayLabel("lost"), "Rejected");
  assert.equal(mapInternalStatusToMondayLabel("unknown_xyz"), "Pending");
  assert.equal(
    mapInternalStatusToMondayLabel("sent", {
      MONDAY_INTERNAL_STATUS_SENT_LABEL: "Custom Negotiation"
    }),
    "Custom Negotiation"
  );
}

function testEstimateLinkPayload() {
  const link = buildInternalEstimateLinkValue("https://internal.example/?quoteId=abc");
  assert.deepEqual(link, { url: "https://internal.example/?quoteId=abc", text: "Open Internal Estimate" });
  const map = resolveInternalMondayColumnMap({
    env: { MONDAY_INTERNAL_COL_ESTIMATE_LINK: "link_mm3grp5s" },
    allowTitleMatch: false
  });
  const { columnValues } = buildMondayInternalColumnValuesFromMap({
    payload: {
      internal_estimate_deep_link: "https://internal.example/?quoteId=abc"
    },
    columnMap: map
  });
  assert.deepEqual(columnValues.link_mm3grp5s, link);
}

function testEstimatorDisplayName() {
  assert.equal(
    resolveEstimatorDisplayName({
      user: { email: "chris@example.com", full_name: "Chris Henely" },
      preparedBy: "chris@example.com"
    }),
    "Chris Henely"
  );
  assert.equal(
    resolveEstimatorDisplayName({
      user: { email: "chris@example.com" },
      profile: { full_name: "Chris H." },
      preparedBy: "chris@example.com"
    }),
    "Chris H."
  );
  assert.equal(
    resolveEstimatorDisplayName({
      user: { email: "chris@example.com" },
      preparedBy: "chris@example.com"
    }),
    "chris@example.com"
  );
}

function testPartialSyncClassification() {
  assert.equal(
    classifyMondayColumnApplyResult({
      attemptedColumnIds: ["a", "b"],
      appliedColumnIds: ["a"],
      failedColumnIds: ["b"]
    }),
    "success_partial_columns"
  );
  assert.equal(
    classifyMondayColumnApplyResult({
      attemptedColumnIds: ["a"],
      appliedColumnIds: [],
      failedColumnIds: ["a"]
    }),
    "failed_internal_column_update"
  );
}

function testEstimateSummarySkipsInternalLines() {
  const summary = buildInternalEstimateSummaryForMonday({
    calc: { totals: { retail: 8450, estimated_sqft: 52.5 } },
    body: {
      customLineItems: [
        { name: "Secret fee", customerFacing: false },
        { name: "Trip", customerFacing: true }
      ]
    },
    snapshot: {
      internal_ui: {
        estimate_room_drafts: [
          { name: "Kitchen", useTaxMode: "inherit_project", vanityProgram2026: true },
          { name: "Primary Bath", useTaxMode: "none" }
        ],
        use_tax_percent: 5
      }
    }
  });
  assert.ok(summary.includes("Kitchen"));
  assert.ok(!summary.includes("Secret fee"));
  assert.ok(!summary.includes("inherit_project"));
  assert.ok(summary.includes("Use tax: project default 5%"));
  assert.ok(summary.includes("Trip"));
  assert.ok(summary.includes("Vanity program"));
}

function testUseTaxRoomPercent() {
  const frag = formatUseTaxSummaryFragment(
    { name: "Kitchen", useTaxMode: "percent", useTaxPercent: 5 },
    0
  );
  assert.equal(frag, "Use tax: Kitchen 5%");
  assert.equal(formatUseTaxSummaryFragment({ name: "Bath", useTaxMode: "none" }, 5), null);
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
  const { columnValues } = buildMondayInternalColumnValuesFromMap({
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
  assert.deepEqual(columnValues.status_col, { label: "Pending" });
}

function testMappingConfigured() {
  assert.equal(internalMondayColumnMappingConfigured({}), false);
  assert.equal(internalMondayColumnMappingConfigured({ MONDAY_INTERNAL_COL_CITY: "abc" }), true);
}

testItemName();
testStatusMapping();
testEstimateLinkPayload();
testEstimatorDisplayName();
testPartialSyncClassification();
testEstimateSummarySkipsInternalLines();
testUseTaxRoomPercent();
testUnsupportedTypeSkipped();
testEnvColumnMapping();
testMappingConfigured();
console.log("mondayInternalBoardSync.test.mjs: ok");
