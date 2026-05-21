/**
 * Revision workflow smoke tests (no DB).
 * Run: node backend-core/src/scripts/verifyInternalQuoteRevisions.mjs
 */
import assert from "node:assert/strict";
import {
  buildInternalSavePayloadFromQuoteRow,
  restoreInternalQuoteAsNewRevision
} from "../quotes/internalQuoteRestore.js";
import {
  deriveQuoteNumberBaseFromRow,
  quoteNumberForRevision,
  revisionLabelFromNumber
} from "../quotes/quoteEsfNumber.js";

const sampleRow = {
  id: "11111111-1111-4111-8111-111111111111",
  quote_number: "ESF-DYER-000006-R2",
  quote_number_base: "ESF-DYER-000006",
  quote_family_root_id: "00000000-0000-4000-8000-000000000001",
  revision_number: 2,
  revision_label: "R2",
  is_current_revision: true,
  customer_name: "Spec 73 Customer",
  project_name: "Kitchen",
  city: "Dyersville",
  state: "IA",
  branch: "Dyersville",
  sales_rep: "Chris",
  prepared_by: "chris@test.com",
  quote_status: "testing_review",
  estimated_material_group: "Group Promo",
  calculation_snapshot: {
    inputSummary: { engine: "rooms", materialGroup: "Group Promo", areas: { countertopSqft: 44, backsplashSqft: 9.11 } },
    internal_ui: {
      internal_material_basis: "wholesale",
      estimate_rooms: [{ name: "Kitchen", materialGroup: "Group Promo", calcMode: "Guided Shape", pieces: [] }],
      estimate_room_drafts: [{ name: "Kitchen", calcMode: "Guided Shape", guidedShapeGroups: [] }],
      custom_line_items: [],
      use_tax_percent: 0
    }
  }
};

const payload = buildInternalSavePayloadFromQuoteRow(sampleRow);
assert.equal(payload.engine, "rooms");
assert.equal(payload.materialGroup, "Group Promo");
assert.equal(payload.customer_name, "Spec 73 Customer");
assert.ok(Array.isArray(payload.rooms));
assert.ok(payload.estimateRoomDrafts);

assert.equal(deriveQuoteNumberBaseFromRow(sampleRow), "ESF-DYER-000006");
assert.equal(quoteNumberForRevision("ESF-DYER-000006", 3), "ESF-DYER-000006-R3");
assert.equal(revisionLabelFromNumber(3), "R3");

assert.equal(typeof restoreInternalQuoteAsNewRevision, "function");

console.log("verifyInternalQuoteRevisions: ok");
