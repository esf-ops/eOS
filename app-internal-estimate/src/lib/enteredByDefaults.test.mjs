/**
 * Run: npm run eos:test:entered-by-defaults
 */
import assert from "node:assert/strict";

import {
  deriveDisplayNameFromEmail,
  resolveDefaultEnteredBy,
  shouldAutoApplyEnteredBy
} from "./enteredByDefaults.ts";

assert.equal(resolveDefaultEnteredBy("Chris Henely", "chris@eliteosfab.com"), "Chris Henely");
assert.equal(resolveDefaultEnteredBy("", "chris.henely@eliteosfab.com"), "Chris Henely");
assert.notEqual(resolveDefaultEnteredBy("Chris Henely", "chris@eliteosfab.com"), "Peg Reid");
assert.equal(resolveDefaultEnteredBy("", "peg.reid@eliteosfab.com"), "Peg Reid");

assert.equal(deriveDisplayNameFromEmail("peg.reid@eliteosfab.com"), "Peg Reid");
assert.equal(deriveDisplayNameFromEmail("chris.henely@eliteosfab.com"), "Chris Henely");

assert.equal(shouldAutoApplyEnteredBy(null, false), true);
assert.equal(shouldAutoApplyEnteredBy("a1111111-1111-4111-8111-111111111111", false), false);
assert.equal(shouldAutoApplyEnteredBy(null, true), false);

console.log("enteredByDefaults: all tests passed");
