/**
 * Digital Estimate edge option row — customer copy simplification.
 *
 * Every edge row must show the option name and its price. The selected
 * option is indicated only by visual highlight/badge, never by swapping the
 * price for history/internal status text ("Included in published estimate",
 * "Original selection", long review sentences). No browser pricing math —
 * amounts always come from backend-provided cents/dollars.
 *
 * Run: node app-digital-estimate/src/phaseEdgeOptionCustomerCopy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { edgeRowPriceLabel } from "./edgeGroups.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const edgeBlock = view.match(/de-edge-dropdown[\s\S]{0,3500}/)?.[0] || "";

console.log("\nphaseEdgeOptionCustomerCopy.test.ts\n");

// 1-2. Forbidden history/internal copy never appears in the public DE view.
assert.ok(
  !view.includes("Included in published estimate"),
  "1. 'Included in published estimate' does not appear anywhere in the public DE view",
);
assert.ok(
  !view.includes("Original selection"),
  "2. 'Original selection' does not appear anywhere in the public DE view",
);
console.log("ok: 1-2 no 'Included in published estimate' / 'Original selection' in view");

// Edge rows must not carry "Included in your estimate" either (that phrasing
// is reserved for other rows, e.g. material selection — not edge options).
assert.ok(
  !edgeBlock.includes("Included in your estimate"),
  "edge rows do not say 'Included in your estimate'",
);
console.log("ok: edge rows avoid 'Included in your estimate'");

// 3. Selected premium edge still shows its real price — selection must never
// replace the price with status text.
{
  const knifeSelectedBaseline = {
    priceEffectLabel: "Included in published estimate",
    visibleDelta: 627,
    priceEffectCents: 62700,
  };
  assert.equal(edgeRowPriceLabel(knifeSelectedBaseline), "+$627");
  console.log("ok: 3. selected premium edge (Knife) still shows +$627");
}

// Legacy label variants must be ignored the same way, in favor of the number.
{
  assert.equal(
    edgeRowPriceLabel({
      priceEffectLabel: "Original selection",
      visibleDelta: 627,
      priceEffectCents: 62700,
    }),
    "+$627",
  );
  assert.equal(
    edgeRowPriceLabel({
      priceEffectLabel: "Included in your estimate",
      visibleDelta: 627,
      priceEffectCents: 62700,
    }),
    "+$627",
  );
  console.log("ok: legacy label variants ignored; price derived from cents");
}

// If Crescent is selected, Knife — still the published baseline — shows its
// price as a normal option, not a status sentence.
{
  const knifeAsOtherOption = {
    priceEffectLabel: "Included in published estimate",
    visibleDelta: 627,
    priceEffectCents: 62700,
  };
  assert.equal(edgeRowPriceLabel(knifeAsOtherOption), "+$627");
  console.log("ok: unselected baseline Knife still shows +$627 as a normal option");
}

// 5. Included/free edges show +$0.
{
  assert.equal(
    edgeRowPriceLabel({ priceEffectLabel: "Included in published estimate", visibleDelta: 0, priceEffectCents: 0 }),
    "+$0",
  );
  assert.equal(edgeRowPriceLabel({ priceEffectLabel: "+$0" }), "+$0");
  assert.equal(edgeRowPriceLabel({ priceEffectLabel: null, visibleDelta: null, priceEffectCents: null }), "+$0");
  console.log("ok: 5. included/free edges show +$0");
}

// 6. Upgraded edges show +$N, passthrough for an already-clean backend label.
{
  assert.equal(edgeRowPriceLabel({ priceEffectLabel: "+$627" }), "+$627");
  assert.equal(
    edgeRowPriceLabel({ priceEffectLabel: null, visibleDelta: 627, priceEffectCents: 62700 }),
    "+$627",
  );
  console.log("ok: 6. upgraded edges show +$N");
}

// 4. Selected state is represented by highlight/badge, not long copy — the
// row markup carries a visual "selected" style and a short badge, never a
// sentence like "Requested change" / "Price updates for this change...".
assert.ok(edgeBlock.includes("de-edge-option-selected-badge"), "4. short selected badge present");
assert.ok(edgeBlock.includes("border-foreground"), "4. selected row is visually highlighted");
assert.ok(
  !/Requested change|Elite will review this before final approval|Price updates for this change require estimator review/.test(
    edgeBlock,
  ),
  "4. no long status sentence swapped in on edge rows",
);
// The price span always renders (no conditional that can hide it away).
assert.ok(edgeBlock.includes("de-edge-option-price"), "every edge row has a price slot");
console.log("ok: 4. selected edge uses highlight/badge, not long copy");

// 7. No browser pricing math for edge rows — only formatting of backend numbers.
assert.ok(
  !/edgeLinearFeet\s*\*|finishedEdgeLf\s*\*|ratePerLf\s*\*|\*\s*rate/.test(edgeBlock),
  "7. no browser-side pricing math in the edge UI",
);
console.log("ok: 7. no browser pricing math");

console.log("\nAll phaseEdgeOptionCustomerCopy tests passed.\n");
