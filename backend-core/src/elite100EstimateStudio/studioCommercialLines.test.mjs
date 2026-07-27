/**
 * Unit tests for studioCommercialLines.mjs
 * Run via eos:test:studio-estimating-parity
 */
import assert from "node:assert/strict";
import {
  STUDIO_COMMERCIAL_ROLES,
  calculateCommercialLineTotals,
  inferCommercialRole,
  normalizeStudioCommercialLine,
  normalizeStudioCommercialLines
} from "./studioCommercialLines.mjs";

console.log("\nstudioCommercialLines.test.mjs\n");

{
  assert.equal(
    inferCommercialRole({ customerFacing: false }),
    STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE
  );
  assert.equal(
    inferCommercialRole({ commercialRole: "absorbed" }),
    STUDIO_COMMERCIAL_ROLES.ABSORBED
  );
  console.log("ok: role inference");
}

{
  const disc = normalizeStudioCommercialLine({
    name: "Off",
    commercialRole: "discount",
    unitPrice: 50,
    quantity: 1
  });
  assert.equal(disc.unitPrice, -50);
  assert.equal(disc.category, "Discount/Credit");
  const fixed = normalizeStudioCommercialLine({
    name: "Fee",
    pricingMode: "fixed",
    quantity: 9,
    unitPrice: 40
  });
  assert.equal(fixed.quantity, 1);
  console.log("ok: normalize discount sign + fixed qty");
}

{
  const lines = normalizeStudioCommercialLines({
    customLineItems: [
      { id: "a", name: "Charge", commercialRole: "customer_charge", quantity: 2, unitPrice: 10 },
      { id: "b", name: "IO", commercialRole: "internal_only", quantity: 1, unitPrice: 100 },
      { id: "c", name: "AB", commercialRole: "absorbed", quantity: 1, unitPrice: 20 },
      {
        id: "d",
        name: "Pct",
        commercialRole: "discount",
        percentOfBase: 10,
        quantity: 1,
        unitPrice: 0
      }
    ]
  });
  const totals = calculateCommercialLineTotals(lines, 200);
  assert.equal(totals.customerVisibleTotal, 20 - 20); // 20 charge + (-20) percent of 200
  assert.equal(totals.internalOnlyTotal, 100);
  assert.equal(totals.absorbedTotal, 20);
  assert.equal(totals.customerTotalContribution, 0); // 20 - 20
  console.log("ok: commercial totals + percent discount");
}

console.log("\nAll studioCommercialLines tests passed.\n");
