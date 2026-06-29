/**
 * Customer output gate regression checks (Internal Estimate + backend delivery).
 *
 * Run: npm run eos:test:customer-output-gate
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname ?? __dirname, "../../..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf-8");
}

const ieApp = read("app-internal-estimate/src/InternalEstimateApp.tsx");
const iePrint = read("app-internal-estimate/src/CustomerEstimatePrint.tsx");
const ieDocument = read("app-quote/src/lib/customerEstimate/CustomerEstimateDocument.tsx");
const ieGate = read("app-internal-estimate/src/lib/quoteOutputGate.ts");
const deliveryLoader = read("backend-core/src/quoteDelivery/estimateSnapshotLoader.js");
const emailBuilder = read("backend-core/src/quoteDelivery/estimateEmailBuilder.js");

assert.match(ieGate, /Save this quote before printing, emailing, or sending it/);
assert.match(ieApp, /requestCustomerOutput/);
assert.match(ieApp, /customerOutputAfterSaveRef/);
assert.match(ieApp, /effectiveQuoteNumber \? \(/);
assert.match(ieDocument, /if \(!quoteRef\) return null/);
assert.doesNotMatch(ieDocument, /quoteNumber\?\.trim\(\) \|\| "—"/);
assert.match(iePrint, /CustomerEstimateDocument/);
assert.match(deliveryLoader, /validateQuoteReadyForCustomerOutput/);
assert.match(emailBuilder, /requires a saved quote number/);

console.log("customer output gate source checks OK");
