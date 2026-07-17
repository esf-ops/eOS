/**
 * Regression: production serializer returns { ok, estimate, access }.
 * v2 session mistakenly nested that wrapper under state.estimate, crashing
 * ReadOnlyEstimateView on estimate.project / estimate.rooms.
 *
 * Run: node --experimental-strip-types src/phaseDe2g.baselineDtoShape.test.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EstimateRenderError,
  normalizePublicEstimate,
  unwrapEstimatePayload
} from "./normalizePublicEstimate.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { buildPublicDigitalEstimateDto } = await import(
  pathToFileURL(
    join(__dirname, "../../backend-core/src/digitalEstimate/digitalEstimatePublicSerializer.mjs")
  ).href
);

console.log("\nphaseDe2g.baselineDtoShape.test.mjs\n");

const snap = {
  documentTitle: "Digital Estimate",
  quoteNumber: "ESF-EXAMPLE-000100",
  revisionLabel: "R1",
  revisionNumber: 1,
  publishedAt: "2026-07-16T00:00:00.000Z",
  pricingValidThrough: "2026-10-16",
  project: {
    customerName: "Example Homes LLC",
    projectName: "Kitchen",
    projectAddress: null
  },
  rooms: [{ name: "Kitchen", summaryLines: ["Quartz"], materialLabel: "Elite 100", colorLabel: null }],
  lineItems: [{ label: "Fabrication", amount: 10000 }],
  totals: { estimatedProjectTotal: 10000, currency: "USD", rounding: "integer_usd" },
  notes: [],
  disclosures: { version: "v1", text: "Estimate only." }
};

const wrapped = buildPublicDigitalEstimateDto(snap, { accessExpiresAt: "2026-12-01T00:00:00.000Z" });

assert.equal(wrapped.ok, true);
assert.ok(wrapped.estimate);
assert.ok(wrapped.access);
assert.equal(typeof wrapped.estimate.documentTitle, "string");
assert.ok(Array.isArray(wrapped.estimate.rooms));
assert.ok(Array.isArray(wrapped.estimate.lineItems));
assert.ok(wrapped.estimate.project);
assert.ok(wrapped.estimate.totals);
console.log("ok: serializer returns { ok, estimate, access } wrapper");

// Bug shape that crashed production
const buggyStateEstimate = wrapped;
assert.equal(buggyStateEstimate.project, undefined);
assert.equal(buggyStateEstimate.rooms, undefined);
assert.equal(buggyStateEstimate.totals, undefined);
console.log("ok: buggy nested assignment lacks project/rooms/totals at top level");

const fixed = normalizePublicEstimate(buggyStateEstimate);
assert.equal(fixed.project.customerName, "Example Homes LLC");
assert.equal(fixed.rooms.length, 1);
assert.equal(fixed.totals.estimatedProjectTotal, 10000);
assert.equal(unwrapEstimatePayload(buggyStateEstimate), wrapped.estimate);

const direct = normalizePublicEstimate(wrapped.estimate);
assert.equal(direct.totals.estimatedProjectTotal, 10000);

const sparse = normalizePublicEstimate({
  documentTitle: "Digital Estimate",
  totals: { estimatedProjectTotal: 5000, currency: "USD" }
});
assert.deepEqual(sparse.rooms, []);
assert.deepEqual(sparse.lineItems, []);
assert.deepEqual(sparse.notes, []);

assert.throws(
  () =>
    normalizePublicEstimate({
      documentTitle: "X",
      totals: { estimatedProjectTotal: "not-a-number" }
    }),
  (e) => e instanceof EstimateRenderError && e.diagnosticCode === "DE-RENDER-BASELINE"
);
assert.throws(
  () => normalizePublicEstimate({ documentTitle: "X" }),
  (e) => e instanceof EstimateRenderError
);
console.log("ok: normalize unwraps buggy wrapper; sparse arrays safe; bad totals fail closed");

console.log("\nAll baseline DTO shape tests passed.\n");
