/**
 * Customer document identity prefers frozen snapshot (no live Account Directory).
 */
import assert from "node:assert/strict";
import { buildCustomerEstimateDisplayFromSnapshot } from "../quoteDelivery/estimateDisplayFromSnapshot.js";
import { buildCustomerIdentitySnapshot } from "./customerIdentitySnapshot.mjs";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

const snap = buildCustomerIdentitySnapshot({
  account: {
    id: ACCOUNT_ID,
    displayName: "Frozen Account Name",
    status: "active",
    quickbooksLinked: false
  },
  contact: {
    id: "22222222-2222-4222-8222-222222222222",
    displayName: "Frozen Contact",
    email: "frozen@example.test",
    phone: "555-0001"
  },
  location: {
    id: "33333333-3333-4333-8333-333333333333",
    city: "Dubuque",
    state: "IA"
  },
  snapshotAt: "2026-07-23T12:00:00.000Z"
});

const display = buildCustomerEstimateDisplayFromSnapshot({
  quote_number: "ESF-TEST-000001",
  account_name: "LIVE ACCOUNT SHOULD NOT WIN",
  customer_name: "LIVE CUSTOMER SHOULD NOT WIN",
  customer_email: "live@example.test",
  customer_phone: "555-9999",
  project_name: "Kitchen Remodel",
  project_address: "1 Jobsite Rd",
  city: "Dyersville",
  state: "IA",
  grand_total: 1000,
  customer_identity_snapshot: snap,
  calculation_snapshot: {
    internal_ui: {
      customer_display_total: 1000
    }
  }
});

assert.equal(display.header.identityFromFrozenSnapshot, true);
assert.equal(display.header.accountName, "Frozen Account Name");
assert.equal(display.header.customerName, "Frozen Contact");
assert.equal(display.header.customerEmail, "frozen@example.test");
assert.equal(display.header.customerPhone, "555-0001");
assert.equal(display.header.projectAddress, "1 Jobsite Rd");

const legacy = buildCustomerEstimateDisplayFromSnapshot({
  quote_number: "ESF-TEST-000002",
  account_name: "Legacy FreeText",
  customer_name: "Legacy Person",
  customer_email: "legacy@example.test",
  grand_total: 500,
  calculation_snapshot: { internal_ui: { customer_display_total: 500 } }
});
assert.equal(legacy.header.identityFromFrozenSnapshot, false);
assert.equal(legacy.header.accountName, "Legacy FreeText");
assert.equal(legacy.header.customerName, "Legacy Person");

console.log("estimateDocumentIdentity.test.mjs: ok");
