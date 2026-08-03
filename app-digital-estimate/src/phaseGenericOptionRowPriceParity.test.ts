/**
 * Digital Estimate priced option rows — one customer-facing rule for every
 * selectable option (sinks, faucets, accessories, specialty, edges): the row
 * shows its name and its backend-provided price, and selection is expressed
 * only by a highlight plus an optional short badge. Selecting an option must
 * never replace or zero its price. No browser pricing math — the client only
 * formats amounts the backend already sent.
 *
 * Run: node app-digital-estimate/src/phaseGenericOptionRowPriceParity.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { customerPriceEffectLabel } from "../../backend-core/src/digitalEstimate/catalog/customerFacingCopy.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const vmSrc = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const choiceRadioBlock = view.match(/function ChoiceRadio\(\{[\s\S]*?\n\}\n/)?.[0] || "";
assert.ok(choiceRadioBlock, "generic option row renderer found");

console.log("\nphaseGenericOptionRowPriceParity.test.ts\n");

/** Priced sink/faucet/accessory options as the backend sends them. */
const PRICED_OPTIONS = [
  { displayLabel: "Sink A", customerPriceTreatment: "absolute", visibleSellPrice: 200, expected: "+$200" },
  { displayLabel: "Sink B", customerPriceTreatment: "absolute", visibleSellPrice: 350, expected: "+$350" },
  { displayLabel: "Faucet A", customerPriceTreatment: "absolute", visibleSellPrice: 125, expected: "+$125" },
  { displayLabel: "Accessory A", customerPriceTreatment: "absolute", visibleSellPrice: 75, expected: "+$75" },
];

// 1. A priced option's label is its own price, whether or not it is the current
// selection: the backend label producer has no notion of "selected", so nothing
// upstream of the row can zero it (the edge-row defect in §234).
{
  for (const opt of PRICED_OPTIONS) {
    assert.equal(
      customerPriceEffectLabel({ ...opt, availabilityState: "active" }),
      opt.expected,
      `1. ${opt.displayLabel} shows ${opt.expected}`,
    );
  }
  const labelFnSrc =
    /export function customerPriceEffectLabel[\s\S]*?\n}/.exec(
      readFileSync(
        join(__dirname, "../../backend-core/src/digitalEstimate/catalog/customerFacingCopy.mjs"),
        "utf8",
      ),
    )?.[0] || "";
  assert.ok(labelFnSrc, "label producer found");
  assert.ok(
    !/\bselected\b/i.test(labelFnSrc),
    "1. the price label never depends on whether the option is selected",
  );
  const frontendFormatter = /function formatPriceEffect\(opt: \{[\s\S]*?\n\}\): string \| null \{/.exec(vmSrc)?.[0] || "";
  assert.ok(frontendFormatter, "frontend price formatter found");
  assert.ok(
    !/\bselected\b/i.test(frontendFormatter),
    "1. the frontend mirror takes no selection input either",
  );
  console.log("ok: 1. selected generic priced option still shows its price");
}

// 2. Selection is visual only — highlight plus badge, never a price swap.
{
  assert.ok(
    /opt\.selected\s*\n?\s*\?\s*"de-option-selected/.test(choiceRadioBlock),
    "2. selected row is visually highlighted",
  );
  assert.ok(
    /de-option-selected-badge[\s\S]{0,200}Selected/.test(choiceRadioBlock),
    "2. selected row carries a short badge",
  );
  assert.ok(
    !/opt\.selected\s*\?\s*\(?\s*<span[^>]*>\s*Selected\s*<\/span>\s*\)?\s*:\s*opt\.priceEffectLabel/.test(
      choiceRadioBlock,
    ),
    "2. the price is not behind a selected/unselected branch",
  );
  assert.ok(
    /data-testid="de-choice-option-price"/.test(choiceRadioBlock),
    "2. every generic option row has a price slot",
  );
  console.log("ok: 2. selected state is highlight/badge only");
}

// 3. Non-selected options still show their price — the row renders the label
// unconditionally, so the same amounts appear either way.
{
  const priceSpan =
    /\{opt\.priceEffectLabel \? \([\s\S]{0,400}?\) : opt\.includedInBaseline \? \([\s\S]{0,400}?\) : null\}/.exec(
      choiceRadioBlock,
    )?.[0] || "";
  assert.ok(priceSpan, "3. price render site found");
  assert.ok(
    !/selected/i.test(priceSpan),
    "3. the price render site does not branch on selection at all",
  );
  for (const opt of PRICED_OPTIONS) {
    assert.equal(customerPriceEffectLabel({ ...opt, availabilityState: "active" }), opt.expected);
  }
  console.log("ok: 3. non-selected options still show price");
}

// 4. No customer-facing option row renders "Selected" in place of a price.
{
  assert.ok(
    !/text-muted-foreground">Selected<\/span>/.test(view),
    "4. no row replaces its price with the word Selected",
  );
  const priceRenderSites = view.match(/opt\.priceEffectLabel \?/g) || [];
  assert.ok(
    priceRenderSites.length >= 4,
    "4. sink/faucet, accessory, plumbing add-on and specialty rows all render a price effect",
  );
  assert.ok(
    !/selected[^\n]*\?[^\n]*priceEffectLabel/i.test(view),
    "4. no price render site is conditioned on selection",
  );
  console.log("ok: 4. no option row replaces its price with only 'Selected'");
}

// 5. Edge rows keep the behavior fixed earlier: gross price plus visual badge.
{
  const edgeBlock = view.match(/de-edge-dropdown[\s\S]{0,3500}/)?.[0] || "";
  assert.ok(edgeBlock.includes("edgeRowPriceLabel(opt)"), "5. edge rows price from the backend gross helper");
  assert.ok(edgeBlock.includes("de-edge-option-selected-badge"), "5. edge selected badge intact");
  assert.ok(edgeBlock.includes("de-edge-option-price"), "5. edge price slot intact");
  assert.ok(
    !/selected \? "Selected"/.test(edgeBlock),
    "5. edge rows still never swap price for status text",
  );
  console.log("ok: 5. existing edge row behavior unchanged");
}

// 6. No browser pricing math — labels only format backend amounts.
{
  assert.ok(
    !/ratePerLf|pricePerSqft|materialRate|linearFeet\s*\*/i.test(vmSrc),
    "6. the view model never derives a price from rates or quantities",
  );
  assert.ok(
    !/priceEffectLabel[^\n]*[*/][^\n]*(qty|quantity)/i.test(choiceRadioBlock),
    "6. option rows do not multiply prices in the browser",
  );
  console.log("ok: 6. browser does not calculate option pricing");
}

console.log("\nAll phaseGenericOptionRowPriceParity tests passed.\n");
