#!/usr/bin/env node
/**
 * Smoke-test ESF quote number helpers (no DB).
 */
import assert from "node:assert/strict";
import {
  branchPrefixFromBranchLabel,
  deriveQuoteNumberBaseFromRow,
  formatEsfQuoteNumberBase,
  quoteNumberForRevision,
  revisionLabelFromNumber
} from "../quotes/quoteEsfNumber.js";

assert.equal(branchPrefixFromBranchLabel("Dyersville"), "DYER");
assert.equal(branchPrefixFromBranchLabel("Iowa City"), "IC");
assert.equal(branchPrefixFromBranchLabel("Lisbon"), "LIS");

const base = formatEsfQuoteNumberBase("DYER", 1);
assert.equal(base, "ESF-DYER-000001");
assert.equal(quoteNumberForRevision(base, 1), base);
assert.equal(quoteNumberForRevision(base, 2), "ESF-DYER-000001-R2");
assert.equal(revisionLabelFromNumber(3), "R3");

assert.equal(deriveQuoteNumberBaseFromRow({ quote_number_base: "ESF-IC-000010" }), "ESF-IC-000010");
assert.equal(deriveQuoteNumberBaseFromRow({ quote_number: "ESF-LIS-000003-R2" }), "ESF-LIS-000003");

console.log("quoteEsfNumber smoke OK");
