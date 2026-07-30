/**
 * Compact Estimate header model.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/estimateRecord/estimateWorkspaceHeader.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildEstimateWorkspaceHeader,
  ESTIMATE_HEADER_CUSTOMER_FALLBACK,
  ESTIMATE_HEADER_NO_PUBLICATION
} from "./estimateWorkspaceHeader.mjs";

console.log("\nestimateWorkspaceHeader.test.mjs\n");

{
  const h = buildEstimateWorkspaceHeader({
    customerLabel: "Acme Homes",
    planFilename: "kitchen.pdf",
    workingRevision: 1,
    approved: false
  });
  assert.equal(h.customer, "Acme Homes");
  assert.equal(h.planFilename, "kitchen.pdf");
  assert.equal(h.workingRevisionLabel, "Draft R1");
  assert.equal(h.publicationLabel, ESTIMATE_HEADER_NO_PUBLICATION);
  console.log("ok: Draft R1 / No published estimate");
}

{
  const h = buildEstimateWorkspaceHeader({
    customerLabel: "Acme Homes",
    workingRevision: 2,
    publishedRevision: 1,
    approved: false
  });
  assert.equal(h.workingRevisionLabel, "Draft R2 based on published R1");
  assert.equal(h.publicationLabel, "Published R1 remains active");
  console.log("ok: Draft R2 based on published R1");
}

{
  const h = buildEstimateWorkspaceHeader({
    customerLabel: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    acquiringDraft: true
  });
  assert.equal(h.customer, ESTIMATE_HEADER_CUSTOMER_FALLBACK);
  assert.equal(h.saveState, "Starting editable revision…");
  assert.equal(h.workingRevisionLabel.includes("aaaaaaaa"), false);
  console.log("ok: UUID customer rejected; acquisition status shown");
}

console.log("\nestimateWorkspaceHeader.test.mjs — passed\n");
