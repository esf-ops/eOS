/**
 * Customer print display aggregation — room material vs add-ons/custom lines.
 *
 * Run: node backend-core/src/scripts/customerPrintDisplayAggregation.test.mjs
 */
import assert from "node:assert/strict";

function roundCustomerDisplay(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n < 0) return n;
  return Math.ceil(n / 5) * 5;
}

function roundCustomerDisplayAddonLine(amount) {
  return roundCustomerDisplay(amount);
}

function prepareRoomPrintRow({ displayedAreaTotal, materialAmountExact, addons = [], customerCustomLines = [], roomExtrasExact = 0 }) {
  const catalogAddonSum = addons.reduce((s, a) => s + a.amountExact, 0);
  const addonLines = addons.map((a) => ({
    displayedAmount: roundCustomerDisplayAddonLine(a.amountExact)
  }));
  let displayedAddOns =
    addonLines.reduce((s, a) => s + a.displayedAmount, 0) +
    customerCustomLines.reduce((s, c) => s + roundCustomerDisplay(c.amountExact), 0);
  if (displayedAddOns === 0 && roomExtrasExact > 0 && addons.length === 0 && customerCustomLines.length === 0) {
    displayedAddOns = roundCustomerDisplay(roomExtrasExact);
  }
  let displayedMaterial = displayedAreaTotal - displayedAddOns;
  if (displayedMaterial < 0) {
    displayedMaterial = roundCustomerDisplay(materialAmountExact);
  }
  return { displayedMaterial, displayedAddOns, displayedAreaTotal };
}

function testRoomCustomLineSplitsMaterialAndAddOns() {
  const row = prepareRoomPrintRow({
    displayedAreaTotal: 3120,
    materialAmountExact: 2220,
    customerCustomLines: [{ name: "Waterfall Labor", amountExact: 900 }],
    roomExtrasExact: 200
  });
  assert.equal(row.displayedMaterial, 2220);
  assert.equal(row.displayedAddOns, 900);
  assert.equal(row.displayedMaterial + row.displayedAddOns, row.displayedAreaTotal);
}

function testCatalogAddonsPlusCustomLine() {
  const row = prepareRoomPrintRow({
    displayedAreaTotal: 3500,
    materialAmountExact: 2500,
    addons: [{ amountExact: 100 }],
    customerCustomLines: [{ name: "Custom fixture", amountExact: 900 }],
    roomExtrasExact: 100
  });
  assert.equal(row.displayedMaterial + row.displayedAddOns, row.displayedAreaTotal);
  assert.ok(row.displayedAddOns >= 1000);
  assert.ok(row.displayedMaterial < row.displayedAreaTotal);
}

function testOtherExtrasStayInMaterialNotAddOns() {
  const row = prepareRoomPrintRow({
    displayedAreaTotal: 3120,
    materialAmountExact: 2220,
    customerCustomLines: [{ name: "Waterfall Labor", amountExact: 900 }],
    roomExtrasExact: 200
  });
  assert.equal(row.displayedMaterial, 2220);
  assert.equal(row.displayedAddOns, 900);
}

testRoomCustomLineSplitsMaterialAndAddOns();
testCatalogAddonsPlusCustomLine();
testOtherExtrasStayInMaterialNotAddOns();
console.log("customerPrintDisplayAggregation: all tests passed");
