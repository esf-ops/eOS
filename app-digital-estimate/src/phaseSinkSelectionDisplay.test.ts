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
  canonicalEsfPlumbingOptionKey,
  dedupePlumbingFinishVariants,
  isPlumbingFinishSelected,
  isPlumbingProductCardSelected,
  normalizePlumbingFinishKey,
  openFamilyIdForSelection,
  shouldPreservePersistedSinkDraft,
} from "./sinkSelectionDisplay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const viewSource = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");
const viewModelSource = readFileSync(join(here, "lovableViewModel.ts"), "utf8");
const apiSource = readFileSync(join(here, "publicConfigApi.ts"), "utf8");

const PRODUCT_ID = "blanco:precis-24";
const VARIANT_ID = "coal-black";
const PRODUCT_KEY = `sink:kitchen:esf:${PRODUCT_ID}`;
const FINISH_KEY = `${PRODUCT_KEY}:coal-black`;
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
  assert.equal(
    shouldPreservePersistedSinkDraft(
      {
        optionKey: "sink:kitchen:customer_provided",
        sourceKind: "customer_provided",
        selected: false,
      },
      "esf",
    ),
    true,
  );
  assert.equal(
    shouldPreservePersistedSinkDraft(
      {
        optionKey: "sink:kitchen:customer_provided",
        sourceKind: "customer_provided",
        selected: true,
      },
      "esf",
    ),
    false,
  );
  assert.match(
    viewModelSource,
    /role === "sink"[\s\S]{0,120}shouldPreservePersistedSinkDraft\(selected, base\.source\)[\s\S]{0,80}return base/,
  );
  assert.match(
    viewModelSource,
    /sinkSummary: summarizeSinkDraft\(sinkDraft, summarizeChoice\(sinkSelected/,
  );
  assert.match(
    viewModelSource,
    /ESF Sink — \$\{label\}|ESF Sink — \$\{draft\.displayLabel/,
  );
  console.log("ok: room card preserves ESF draft over stale none/customer_provided fallback");
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
  const keys = new Set([PRODUCT_KEY, "sink:kitchen:customer_provided"]);
  assert.equal(canonicalEsfPlumbingOptionKey(PRODUCT_KEY, keys), PRODUCT_KEY);
  assert.equal(canonicalEsfPlumbingOptionKey(FINISH_KEY, keys), PRODUCT_KEY);
  assert.match(viewModelSource, /canonicalEsfPlumbingOptionKey/);
  assert.match(viewSource, /buildSelectionItems\(effectiveQty, roomsForItems, envelopeKeys\)/);
  assert.match(viewSource, /resolveProductOptionKey\(product, resolvedVariantId, envelopeKeys\)/);
  console.log("ok: UI save payload canonicalizes finish key to envelope family key");
}

{
  assert.match(
    viewModelSource,
    /if \(draft\.source === "esf" \|\| draft\.source === "stock"\)/,
  );
  assert.match(viewModelSource, /return `ESF Sink — \$\{label\}`/);
  console.log("ok: room card shows ESF Sink label, not Customer-provided · Blanco …");
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
  assert.match(viewSource, /source === "esf" && Boolean\(draft\.productId/);
  assert.match(viewSource, /customerProductDrafts/);
  assert.match(apiSource, /code === "selection_unavailable"/);
  assert.match(apiSource, /DE-OPTION-NOT-ALLOWED/);
  console.log("ok: modal reopens ESF catalog with product/finish selected; errors map cleanly");
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
  assert.equal(
    breakdown.lines.some((line) => /customer-provided/i.test(line.label)),
    false,
  );
  console.log("ok: sidebar shows one ESF sink line; included cutout is not a $200 difference");
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

{
  assert.equal(normalizePlumbingFinishKey("Café Brown"), "cafe brown");
  assert.equal(normalizePlumbingFinishKey("Cafe Brown"), "cafe brown");
  assert.notEqual(normalizePlumbingFinishKey("Cafe"), normalizePlumbingFinishKey("Café Brown"));

  const diamondLikeVariants = [
    { variantId: "blanco:diamond:sku:a1", finish: "Coal Black", color: "Coal Black", sku: "a1" },
    { variantId: "blanco:diamond:sku:a2", finish: "Coal Black", color: "Coal Black", sku: "a2" },
    { variantId: "blanco:diamond:sku:b1", finish: "Café Brown", color: "Café Brown", sku: "b1" },
    { variantId: "blanco:diamond:sku:b2", finish: "Cafe Brown", color: "Cafe Brown", sku: "b2" },
    { variantId: "blanco:diamond:sku:c1", finish: "Anthracite", color: "Anthracite", sku: "c1" },
    { variantId: "blanco:diamond:sku:c2", finish: "Anthracite", color: "Anthracite", sku: "c2" },
    { variantId: "blanco:diamond:sku:c3", finish: "Anthracite", color: "Anthracite", sku: "c3" },
  ];
  const selected = {
    optionKey: PRODUCT_KEY,
    productId: "blanco:diamond-50-50",
    variantId: "blanco:diamond:sku:a2",
    finish: "Coal Black",
  };
  const deduped = dedupePlumbingFinishVariants(diamondLikeVariants, selected);
  assert.equal(deduped.length, 3);
  assert.equal(deduped.filter((v) => normalizePlumbingFinishKey(v.finish) === "coal black").length, 1);
  assert.equal(deduped.filter((v) => normalizePlumbingFinishKey(v.finish) === "cafe brown").length, 1);
  assert.equal(deduped.filter((v) => normalizePlumbingFinishKey(v.finish) === "anthracite").length, 1);
  assert.equal(deduped.find((v) => v.finish === "Coal Black")?.variantId, "blanco:diamond:sku:a2");
  assert.equal(
    deduped.filter((v) => isPlumbingFinishSelected(v, selected)).length,
    1,
  );
  assert.equal(
    canonicalEsfPlumbingOptionKey(
      PRODUCT_KEY,
      new Set([PRODUCT_KEY, "sink:kitchen:customer_provided"]),
    ),
    PRODUCT_KEY,
  );
  assert.match(viewSource, /dedupePlumbingFinishVariants\(variants, selection\)/);
  console.log(
    "ok: sink modal finish dedupe keeps one row per finish, preserves selected variant, envelope key intact",
  );
}

console.log("\nphaseSinkSelectionDisplay.test.ts: ok\n");
