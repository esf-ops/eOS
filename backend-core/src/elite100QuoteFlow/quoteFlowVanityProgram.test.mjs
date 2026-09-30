/**
 * Elite 100 Quote Flow — governed Vanity Program add/remove on the Pricing tab.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowVanityProgram.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowPricingService } from "./quoteFlowPricing.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowVanityProgram.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "77777777-7777-4777-8777-777777777777";

function makeStore(initialRows) {
  const byId = new Map(initialRows.map((r) => [r.id, structuredClone(r)]));
  return {
    async getById(_org, id) {
      const row = byId.get(id);
      return row ? structuredClone(row) : null;
    },
    async update(_org, id, patch) {
      const prev = byId.get(id);
      if (!prev) throw new Error("missing");
      const next = {
        ...prev,
        ...patch,
        scope: patch.scope != null ? patch.scope : prev.scope,
        revision: (Number(prev.revision) || 1) + 1,
        updatedAt: new Date().toISOString()
      };
      byId.set(id, next);
      return structuredClone(next);
    },
    peek(id) {
      return byId.get(id);
    }
  };
}

function scope() {
  return {
    rooms: [
      {
        id: "bath",
        name: "Bathroom Vanity",
        roomType: "vanity",
        included: true,
        pieces: [
          {
            id: "vanity-top",
            name: "Vanity",
            included: true,
            lengthIn: 37,
            depthIn: 22.5,
            quantity: 1,
            cutouts: [{ type: "vanity_bar_sink", quantity: 1 }]
          }
        ]
      },
      {
        id: "powder",
        name: "Powder Bath",
        roomType: "Bathroom",
        included: true,
        pieces: [
          { id: "powder-top", name: "Vanity", included: true, lengthIn: 31, depthIn: 22.5, quantity: 1 }
        ]
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          { id: "island", name: "Kitchen Island", included: true, lengthIn: 96, depthIn: 36, quantity: 1 }
        ]
      }
    ],
    roomConfigurations: {},
    materialGroup: "Group Promo",
    pricingBasis: "wholesale"
  };
}

const repo = makeStore([
  { id: EST, status: "ready_to_price", revision: 1, scope: scope(), calculationSnapshot: null, staleReason: null }
]);
const svc = createQuoteFlowPricingService({
  estimateRepository: repo,
  calculateStudioEstimate: (args) => calculateStudioEstimateV4(args),
  env: {}
});

function bathRow(res) {
  return (res.vanityPrograms || []).find((v) => v.roomId === "bath");
}

{
  const loaded = await svc.getPricing({ organizationId: ORG, estimateId: EST });
  const bath = bathRow(loaded);
  assert.ok(bath, "governed vanity row listed on GET");
  assert.equal(bath.eligible, true);
  assert.equal(bath.applied, false);
  const powder = loaded.vanityPrograms.find((v) => v.roomId === "powder");
  assert.equal(powder.eligible, false, "non-vanity room type is listed but not eligible");
  assert.equal(loaded.vanityPrograms.some((v) => v.roomId === "kitchen"), false);
  console.log("ok: GET pricing lists governed vanity rows with eligibility");
}

{
  const before = structuredClone(repo.peek(EST).scope);
  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        body: { pricing: { vanityPrograms: [{ roomId: "powder", apply: true }] } }
      }),
    (e) => e.code === "pricing_invalid"
  );
  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        body: { pricing: { vanityPrograms: [{ roomId: "kitchen", apply: true }] } }
      }),
    (e) => e.code === "pricing_invalid"
  );
  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        body: { pricing: { vanityPrograms: { roomId: "bath", apply: true } } }
      }),
    (e) => e.code === "pricing_invalid"
  );
  assert.deepEqual(repo.peek(EST).scope, before, "rejected elections do not write scope");
  console.log("ok: ineligible, non-vanity, and malformed elections are rejected without writes");
}

{
  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        body: { pricing: { materialGroup: "Group C", vanityPrograms: [{ roomId: "bath", apply: true }] } }
      }),
    (e) => e.code === "pricing_invalid"
  );
  console.log("ok: election is validated against the material group in the same patch");
}

let standardTotal;
{
  const standard = await svc.calculatePricing({ organizationId: ORG, estimateId: EST });
  standardTotal = Number(standard.lastCalculation.exactInternalTotal ?? standard.lastCalculation.estimatedTotal);
  assert.ok(standardTotal > 0);
  assert.equal(bathRow(standard).programPrice, null, "no program price before election");

  const saved = await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    body: { pricing: { vanityPrograms: [{ roomId: "bath", apply: true }] } }
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.pricingStale, true);
  assert.deepEqual(repo.peek(EST).scope.roomConfigurations.bath.vanityProgram, {
    applyProgram: true,
    useStandardPricing: false
  });
  assert.equal(bathRow(saved).applied, true);

  const priced = await svc.calculatePricing({ organizationId: ORG, estimateId: EST });
  const room = repo.peek(EST).calculationSnapshot.elite100.rooms.find((r) => r.roomId === "bath");
  assert.equal(room.vanityProgram?.qualifies, true, "calculator priced the governed program");
  const programPrice = bathRow(priced).programPrice;
  assert.ok(Number(programPrice) > 0, "server program price returned to Quote Flow");
  const programTotal = Number(priced.lastCalculation.exactInternalTotal ?? priced.lastCalculation.estimatedTotal);
  assert.notEqual(programTotal, standardTotal, "program election changes the trusted total");
  console.log("ok: add Vanity Program writes the Studio election and the v4 calculator prices it");
}

{
  await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    body: { pricing: { vanityPrograms: [{ roomId: "bath", apply: false }] } }
  });
  assert.deepEqual(repo.peek(EST).scope.roomConfigurations.bath.vanityProgram, {
    applyProgram: false,
    useStandardPricing: true
  });
  const reverted = await svc.calculatePricing({ organizationId: ORG, estimateId: EST });
  assert.equal(bathRow(reverted).applied, false);
  assert.equal(bathRow(reverted).programPrice, null);
  const total = Number(reverted.lastCalculation.exactInternalTotal ?? reverted.lastCalculation.estimatedTotal);
  assert.equal(total, standardTotal, "remove restores standard pricing");
  console.log("ok: remove Vanity Program restores standard pricing");
}

{
  const ui = readFileSync(
    join(root, "app-elite100-quote-flow/src/estimates/OfficialPricingPanel.tsx"),
    "utf8"
  );
  assert.ok(ui.includes("Add Vanity Program"));
  assert.ok(ui.includes("Remove Vanity Program"));
  assert.ok(ui.includes("vanityPrograms"));
  console.log("ok: Quote Flow pricing panel exposes add/remove Vanity Program");
}

console.log("\nquoteFlowVanityProgram.test.mjs — passed\n");
