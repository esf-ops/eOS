/**
 * Sink selection display parity across room card, modal draft, and breakdown.
 *
 * Run:
 * node --experimental-strip-types app-digital-estimate/src/phaseSinkSelectionDisplay.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUpdatedBreakdown } from "./customerEstimateBreakdown.ts";
import {
  isPlumbingFinishSelected,
  isPlumbingProductCardSelected,
  openFamilyIdForSelection,
  shouldPreservePersistedSinkDraft,
} from "./sinkSelectionDisplay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const viewSource = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");
const viewModelSource = readFileSync(join(here, "lovableViewModel.ts"), "utf8");

const PRODUCT_ID = "blanco:precis-24";
const VARIANT_ID = "coal-black";
const PRODUCT_KEY = `sink:kitchen:esf:${PRODUCT_ID}`;
const SINK_LABEL = `Precis 24" Sink · Coal Black`;

const precisProduct = {
  productId: PRODUCT_ID,
  optionKey: PRODUCT_KEY,
  displayName: `Precis 24" Sink`,
  variants: [
    {
      variantId: VARIANT_ID,
      sku: "PREC24-CB",
      finish: "Coal Black",
      color: "Coal Black",
      optionKey: null,
    },
    {
      variantId: "white",
      sku: "PREC24-WH",
      finish: "White",
      color: "White",
      optionKey: null,
    },
  ],
};

const selection = {
  optionKey: PRODUCT_KEY,
  productId: PRODUCT_ID,
  variantId: VARIANT_ID,
  finish: "Coal Black",
};

console.log("\nphaseSinkSelectionDisplay.test.ts\n");

{
  const baselineFallback = {
    optionKey: "sink:kitchen:none",
    sourceKind: "none",
    selected: false,
    includedInBaseline: true,
  };
  assert.equal(shouldPreservePersistedSinkDraft(baselineFallback, "esf"), true);
  assert.equal(
    shouldPreservePersistedSinkDraft(baselineFallback, "customer_provided"),
    true,
  );
  assert.match(
    viewModelSource,
    /role === "sink"[\s\S]{0,120}shouldPreservePersistedSinkDraft\(selected, base\.source\)[\s\S]{0,80}return base/,
  );
  assert.match(
    viewModelSource,
    /sinkSummary: summarizeSinkDraft\(sinkDraft, summarizeChoice\(sinkSelected/,
  );
  console.log("ok: room card preserves authoritative persisted sink draft on variant-key refresh");
}

{
  assert.equal(
    shouldPreservePersistedSinkDraft({ sourceKind: "none", selected: true }, "none"),
    false,
  );
  assert.equal(
    shouldPreservePersistedSinkDraft({ sourceKind: "none", selected: false }, "none"),
    false,
  );
  assert.equal(
    shouldPreservePersistedSinkDraft({ sourceKind: "esf", selected: true }, "esf"),
    false,
  );
  console.log("ok: explicit and untouched No sink states remain authoritative");
}

{
  assert.equal(isPlumbingProductCardSelected(precisProduct, selection), true);
  assert.equal(
    isPlumbingProductCardSelected(precisProduct, {
      optionKey: "sink:kitchen:esf:other",
      productId: "other",
    }),
    false,
  );
  assert.equal(
    isPlumbingFinishSelected(precisProduct.variants[0], selection),
    true,
  );
  assert.equal(
    isPlumbingFinishSelected(precisProduct.variants[1], selection),
    false,
  );
  assert.equal(openFamilyIdForSelection([precisProduct], selection), PRODUCT_ID);
  console.log("ok: Precis 24 · Coal Black selects product card and Coal Black finish");
}

{
  assert.match(
    viewSource,
    /productDrafts\[modalRoom\.id\]\?\.sink \|\| modalRoom\.sinkDraft/,
  );
  assert.match(viewSource, /selectedOptionKey=\{draft\.optionKey \|\| null\}/);
  assert.match(viewSource, /selectedProductId=\{draft\.productId \|\| null\}/);
  assert.match(
    viewSource,
    /selectedVariantId=\{draft\.variantId \|\| draft\.variantSku \|\| null\}/,
  );
  assert.match(viewSource, /selectedFinish=\{draft\.finish \|\| null\}/);
  assert.match(viewSource, /isPlumbingFinishSelected/);
  assert.match(viewSource, /openFamilyIdForSelection/);
  assert.match(viewSource, /customerProductDrafts/);
  console.log("ok: modal selected state uses productId + variantId/finish, not optionKey alone");
}

{
  const breakdown = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 1575,
      options: [
        {
          optionKey: PRODUCT_KEY,
          displayLabel: `ESF Sink — ${SINK_LABEL}`,
          visiblePrice: 575,
          included: false,
        },
        {
          optionKey: "qty-sink:kitchen",
          displayLabel: "Kitchen — Sink cutout",
          visiblePrice: null,
          included: true,
        },
      ],
    },
  });
  assert.ok(
    breakdown.lines.some(
      (line) => line.label === `ESF Sink — ${SINK_LABEL}` && line.amount === 575,
    ),
  );
  assert.equal(
    breakdown.lines.some((line) => /cutout/i.test(line.label) && line.amount === 200),
    false,
  );
  console.log("ok: included published cutout does not create a $200 customer difference line");
}

{
  const noSinkBreakdown = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 1000,
      options: [],
    },
  });
  assert.equal(
    noSinkBreakdown.lines.some((line) => /sink|cutout/i.test(line.label)),
    false,
  );
  console.log("ok: switching back to No sink has no sink or cutout charge line");
}

console.log("\nphaseSinkSelectionDisplay.test.ts: ok\n");
