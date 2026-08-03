/**
 * Published sink-cutout baseline parity for Digital Estimate live pricing.
 *
 * Run:
 * node backend-core/src/digitalEstimate/configuration/sinkCutoutBaseline.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  publishedScopeIncludesSinkCutout,
  sinkCutoutBaselineFlags
} from "./sinkCutoutBaseline.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, "publicConfigurationService.mjs"), "utf8");

/** Mirror of delta-engine chargeable math for cutout baseline flags (no engine export). */
function chargeableCutoutCents(opt) {
  const qty = Number(opt.quantity) || 0;
  const includedInBaseline = Boolean(opt.includedInBaseline);
  const rawBaselineQty = Number(opt.baselineQuantity ?? opt.defaultQty ?? 0);
  const effectiveBaselineQty = includedInBaseline
    ? Number.isFinite(rawBaselineQty) && rawBaselineQty > 0
      ? rawBaselineQty
      : 1
    : 0;
  const chargeableQty = includedInBaseline ? Math.max(0, qty - effectiveBaselineQty) : qty;
  const treatment = String(opt.customerPriceTreatment || "absolute");
  if (treatment === "included" || treatment === "no_change" || chargeableQty === 0) return 0;
  return Math.round(Number(opt.sellPrice) * 100) * chargeableQty;
}

console.log("\nsinkCutoutBaseline.test.mjs\n");

{
  assert.equal(
    publishedScopeIncludesSinkCutout({
      roomKey: "kitchen",
      envelopeOptions: [
        {
          optionKey: "sink:kitchen:customer_provided",
          includedInBaseline: true,
          defaultQty: 1
        }
      ]
    }),
    true
  );
  assert.equal(
    publishedScopeIncludesSinkCutout({
      roomKey: "kitchen",
      envelopeOptions: [
        {
          optionKey: "sink:kitchen:none",
          includedInBaseline: true,
          defaultQty: 1
        }
      ]
    }),
    false
  );
  console.log("ok: envelope customer_provided baseline detects published cutout scope");
}

{
  assert.equal(
    publishedScopeIncludesSinkCutout({
      roomKey: "kitchen",
      roomName: "Kitchen",
      publishedRoomPricing: {
        rooms: [
          {
            roomId: "kitchen",
            roomName: "Kitchen",
            customerFacingLines: [
              { category: "sink_cutout", label: "Kitchen sink cutout", amountCents: 20000 }
            ]
          }
        ]
      }
    }),
    true
  );
  assert.equal(
    publishedScopeIncludesSinkCutout({
      roomKey: "kitchen",
      roomName: "Kitchen",
      customerSnapshot: {
        roomPricing: {
          rooms: [
            {
              roomId: "kitchen",
              roomName: "Kitchen",
              customerFacingLines: [
                { category: "sink", label: "Customer-provided sink", amountCents: 0 }
              ]
            }
          ]
        }
      }
    }),
    true
  );
  assert.equal(
    publishedScopeIncludesSinkCutout({
      roomKey: "kitchen",
      roomName: "Kitchen",
      publishedRoomPricing: {
        rooms: [
          {
            roomId: "kitchen",
            roomName: "Kitchen",
            customerFacingLines: [{ category: "edge", label: "Eased", amountCents: 0 }]
          }
        ]
      }
    }),
    false
  );
  console.log("ok: published room pricing / customer-provided sink lines detect cutout scope");
}

{
  const inBaseline = sinkCutoutBaselineFlags(true);
  assert.equal(inBaseline.includedInBaseline, true);
  assert.equal(inBaseline.baselineQuantity, 1);
  assert.equal(inBaseline.customerPriceTreatment, "included");

  const fresh = sinkCutoutBaselineFlags(false);
  assert.equal(fresh.includedInBaseline, false);
  assert.equal(fresh.baselineQuantity, 0);
  assert.equal(fresh.customerPriceTreatment, undefined);
  console.log("ok: cutout baseline flags");
}

{
  assert.equal(
    chargeableCutoutCents({
      quantity: 1,
      sellPrice: 200,
      ...sinkCutoutBaselineFlags(true)
    }),
    0
  );
  assert.equal(
    chargeableCutoutCents({
      quantity: 1,
      sellPrice: 200,
      customerPriceTreatment: "absolute",
      ...sinkCutoutBaselineFlags(false)
    }),
    20000
  );
  assert.equal(
    chargeableCutoutCents({
      quantity: 1,
      sellPrice: 575,
      customerPriceTreatment: "absolute",
      includedInBaseline: false
    }),
    57500
  );
  console.log("ok: ESF sink product adds price; published cutout does not add $200");
}

{
  assert.match(serviceSource, /publishedScopeIncludesSinkCutout/);
  assert.match(serviceSource, /sinkCutoutBaselineFlags/);
  assert.match(serviceSource, /\.\.\.cutoutBaseline/);
  console.log("ok: publicConfigurationService wires cutout baseline parity");
}

console.log("\nsinkCutoutBaseline.test.mjs: ok\n");
