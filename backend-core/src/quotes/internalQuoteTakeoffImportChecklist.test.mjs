/**
 * internalQuoteTakeoffImportChecklist — unit tests (v6.1).
 *
 * Run: npm run eos:test:internal-quote-takeoff-checklist
 */
import assert from "node:assert/strict";
import {
  evaluateTakeoffImportCompletionChecklist,
  isActiveTakeoffImport,
} from "./internalQuoteTakeoffImportChecklist.mjs";

console.log("\ninternalQuoteTakeoffImportChecklist — tests\n");

// T1 — active vs detached import
{
  assert.equal(isActiveTakeoffImport({ takeoffJobId: "abc", status: "active" }), true);
  assert.equal(isActiveTakeoffImport({ takeoffJobId: "abc", status: "detached" }), false);
  assert.equal(isActiveTakeoffImport(null), false);
  console.log("ok: T1 isActiveTakeoffImport");
}

// T2 — required fields block readyToCalculate
{
  const partial = evaluateTakeoffImportCompletionChecklist({
    accountName: "Acme",
    accountPhone: "555-0100",
    projectName: "Kitchen",
    projectAddress: "1 Main",
    branch: "HQ",
    salesRep: "Pat",
    internalPricingMode: "wholesale",
    roomDrafts: [{ materialGroup: "Group 1", takeoffImportSource: { importedFromTakeoff: true } }],
    colorTbd: false,
    totalSf: 40,
    addonsReviewed: true,
    notesReviewed: true,
  });
  assert.equal(partial.readyToCalculate, true, "T2 all fields complete");
  console.log("ok: T2 ready when all checklist items complete");
}

// T3 — missing pricing mode blocks calculate
{
  const blocked = evaluateTakeoffImportCompletionChecklist({
    accountName: "Acme",
    accountPhone: "555",
    projectName: "Job",
    city: "Austin",
    state: "TX",
    branch: "HQ",
    salesRep: "Pat",
    internalPricingMode: null,
    roomDrafts: [{ materialGroup: "G1", takeoffImportSource: { importedFromTakeoff: true } }],
    colorTbd: false,
    totalSf: 10,
    addonsReviewed: true,
    notesReviewed: true,
  });
  assert.equal(blocked.readyToCalculate, false);
  assert.equal(blocked.items.find((i) => i.key === "pricing_mode")?.complete, false);
  console.log("ok: T3 pricing mode required");
}

// T4 — suggested add-ons require explicit review
{
  const needsAck = evaluateTakeoffImportCompletionChecklist({
    accountName: "A",
    accountPhone: "1",
    projectName: "P",
    projectAddress: "X",
    branch: "B",
    salesRep: "S",
    internalPricingMode: "direct",
    roomDrafts: [{ materialGroup: "G1" }],
    colorTbd: false,
    totalSf: 5,
    suggestedAddOnCount: 2,
    addonsReviewed: false,
    notesReviewed: true,
  });
  assert.equal(needsAck.readyToCalculate, false);
  console.log("ok: T4 add-ons review required when suggestions present");
}

console.log("\nAll internalQuoteTakeoffImportChecklist tests passed.\n");
