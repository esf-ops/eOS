/**
 * Digital Estimate product option helpers + selection pricing behaviors.
 * Run: node backend-core/src/digitalEstimate/catalog/digitalEstimateProductOptions.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildBacksplashOptionDefinitions,
  buildDefaultRoomProductOptions,
  buildFaucetOptionDefinitions,
  buildSinkOptionDefinitions,
  buildSpecialtyOptionDefinitions,
  cutoutKeyForSinkSelection,
  inferRoomEligibilityType,
  parseProductOptionKey,
  resolveCatalogProductSelection,
  resolveOptionSellPriceFromCatalog,
  sideSplashBillableSf,
  toCustomerSafeOptionFields
} from "./digitalEstimateProductOptions.mjs";
import {
  buildMissingInformationRequirements,
  MISSING_INFO_REQUIREMENT_CODES
} from "./customerDraftRequirements.mjs";
import { buildQuoteLibraryCustomerConfigProjection } from "./quoteLibraryCustomerConfigProjection.mjs";
import { getProductById, listProducts, resolveBlancoVariant } from "./esfPlumbingCatalog.mjs";
import { CUSTOMER_UNSAFE_PRODUCT_KEYS } from "./esfPlumbingCatalogContract.mjs";
import {
  mergeSelectionPayloadMeta,
  splitSelectionPayloadMeta
} from "../configuration/customerConfigurationDraft.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "../configuration/configurationPublicSerializer.mjs";

console.log("\ndigitalEstimateProductOptions.test.mjs\n");

{
  assert.equal(inferRoomEligibilityType({ displayName: "Master Bath Vanity" }), "vanity");
  assert.equal(inferRoomEligibilityType({ name: "Bar / Prep" }), "bar_prep");
  assert.equal(inferRoomEligibilityType({ roomKey: "kitchen" }), "kitchen");
  console.log("ok: room eligibility inference");
}

{
  const parsed = parseProductOptionKey("sink:kitchen:esf:blanco:diamond-50-50");
  assert.equal(parsed.kind, "sink");
  assert.equal(parsed.roomKey, "kitchen");
  assert.equal(parsed.mode, "esf");
  assert.equal(parsed.productId, "blanco:diamond-50-50");

  const side = parseProductOptionKey("sidesplash:vanity:piece-a:both");
  assert.equal(side.kind, "sidesplash");
  assert.equal(side.pieceKey, "piece-a");
  assert.equal(side.sideMode, "both");
  console.log("ok: option key parsing (colon-safe product ids)");
}

{
  const sinks = buildSinkOptionDefinitions({
    roomKey: "kitchen",
    roomType: "kitchen",
    defaultMode: "none"
  });
  assert.ok(sinks.some((o) => o.optionKey === "sink:kitchen:none"));
  assert.ok(sinks.some((o) => o.optionKey === "sink:kitchen:customer_provided"));
  assert.ok(sinks.some((o) => o.optionKey.startsWith("sink:kitchen:esf:")));
  // Blanco families seeded once — not every color SKU
  const blancoFamily = sinks.filter((o) => o.optionKey.includes("blanco:diamond-50-50"));
  assert.equal(blancoFamily.length, 1);
  const colorSkuOpts = sinks.filter((o) => /sink:kitchen:esf:blanco:.*:sku:/.test(o.optionKey));
  assert.equal(colorSkuOpts.length, 0, "do not seed Blanco color SKUs as top-level options");
  console.log("ok: sink none / customer_provided / esf family seeding");
}

{
  const faucets = buildFaucetOptionDefinitions({
    roomKey: "kitchen",
    roomType: "kitchen"
  });
  assert.ok(faucets.some((o) => o.optionKey === "faucet:kitchen:none"));
  assert.ok(faucets.some((o) => o.optionKey === "faucet:kitchen:customer_provided"));
  assert.ok(faucets.some((o) => o.optionKey.startsWith("faucet:kitchen:esf:")));
  console.log("ok: faucet option seeding");
}

{
  const splash = buildBacksplashOptionDefinitions({
    roomKey: "kitchen",
    defaultMode: "standard_4in"
  });
  const labels = splash.map((o) => o.displayLabel);
  assert.ok(labels.includes("4-inch backsplash"));
  assert.ok(splash.some((o) => o.optionKey === "backsplash:kitchen:custom_height"));
  console.log("ok: backsplash modes include friendly 4-inch label + custom_height");
}

{
  const specialty = buildSpecialtyOptionDefinitions({
    roomKey: "kitchen",
    roomType: "kitchen"
  });
  const reviewOnly = specialty.find((o) =>
    String(o.optionKey).includes("glowback")
  );
  assert.ok(reviewOnly);
  assert.equal(reviewOnly.sellPrice, 0);
  assert.equal(reviewOnly.compatibilityJson.pricingTreatment, "review_only");
  console.log("ok: specialty review_only has $0 sellPrice");
}

{
  const kansas = getProductById("kansas:3018UM18");
  assert.ok(kansas);
  assert.equal(cutoutKeyForSinkSelection("kitchen", kansas), "qty-sink");
  assert.equal(cutoutKeyForSinkSelection("vanity", null), "qty-bar");
  assert.equal(cutoutKeyForSinkSelection("bar_prep", null), "qty-bar");
  console.log("ok: cutout key rules by product + room");
}

{
  const family = listProducts({ category: "sink" }).find(
    (p) => p.productId === "blanco:diamond-50-50"
  );
  assert.ok(family?.variants?.length);
  const ok = resolveBlancoVariant(family.productId, "440182");
  assert.ok(ok);
  assert.throws(
    () => resolveCatalogProductSelection(family.productId, { variantSku: "not-a-real-finish-zzz" }),
    (e) => e.code === "invalid_blanco_variant"
  );
  console.log("ok: Blanco variant reject on invalid finish/SKU");
}

{
  const priced = resolveOptionSellPriceFromCatalog("sink:kitchen:esf:kansas:3018UM18");
  assert.ok(priced.sellPrice > 0);
  const none = resolveOptionSellPriceFromCatalog("sink:kitchen:none");
  assert.equal(none.sellPrice, 0);
  console.log("ok: catalog sellPrice mapping for esf products");
}

{
  assert.equal(sideSplashBillableSf(22.5), 1); // 22.5*4/144 = 0.625 → ceil 1
  assert.equal(sideSplashBillableSf(36), 1); // 1.0 exact → 1
  assert.equal(sideSplashBillableSf(null), null);
  console.log("ok: side splash independent SF ceiling");
}

{
  const safe = toCustomerSafeOptionFields(getProductById("kansas:3018UM18"));
  for (const bad of CUSTOMER_UNSAFE_PRODUCT_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(safe, bad), false);
  }
  const blob = JSON.stringify(safe).toLowerCase();
  assert.ok(!blob.includes("wholesale"));
  assert.ok(!blob.includes("\"margin\""));
  assert.ok(!blob.includes("itemcost"));
  console.log("ok: customer-safe option projection has no cost/margin");
}

{
  const reqs = buildMissingInformationRequirements({
    rooms: [
      {
        roomKey: "kitchen",
        sink: { source: "customer_provided" },
        faucet: { source: "customer_provided", holeCount: "unknown" },
        backsplash: { mode: "custom_height", requestedHeightInches: 8 },
        specialtyItems: [
          {
            productId: "specialty:glowback-led-panels-are-custom-made-for-each-project-to-fit-the-dimensions-of-each-piece-project",
            pricingTreatment: "review_only"
          }
        ]
      }
    ]
  });
  const codes = new Set(reqs.map((r) => r.code));
  assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.customer_sink_model_required));
  assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.custom_backsplash_height_review));
  assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.specialty_item_quote_required));
  assert.ok(reqs.every((r) => r.blocksSave === false));
  console.log("ok: missing model does not block; requirements present");
}

{
  const merged = mergeSelectionPayloadMeta(
    {
      "sink:kitchen:customer_provided": 1,
      "backsplash:kitchen:custom_height": 1
    },
    {
      customerProductDrafts: {
        kitchen: { sink: { source: "customer_provided", manufacturer: "Kohler" } }
      },
      backsplashDrafts: { kitchen: { mode: "custom_height", requestedHeightInches: 10 } }
    }
  );
  const split = splitSelectionPayloadMeta(merged);
  assert.equal(split.quantities["sink:kitchen:customer_provided"], 1);
  assert.equal(split.customerProductDrafts.kitchen.sink.manufacturer, "Kohler");
  assert.equal(split.backsplashDrafts.kitchen.requestedHeightInches, 10);
  const reqs = buildMissingInformationRequirements(merged);
  // Manufacturer present but model missing → still require model
  assert.ok(
    reqs.some((r) => r.code === MISSING_INFO_REQUIREMENT_CODES.customer_sink_model_required)
  );
  assert.ok(
    reqs.some((r) => r.code === MISSING_INFO_REQUIREMENT_CODES.custom_backsplash_height_review)
  );
  console.log("ok: product/backsplash drafts round-trip + missing-info from selection payload");
}

{
  const seeded = buildDefaultRoomProductOptions({
    rooms: [{ roomKey: "kitchen", displayName: "Kitchen" }],
    choiceGroups: ["sink", "faucet", "backsplash", "specialty", "edge"]
  });
  assert.ok(seeded.some((o) => o.optionKey.startsWith("sink:kitchen:")));
  assert.ok(seeded.some((o) => o.optionKey.startsWith("faucet:kitchen:")));
  assert.ok(seeded.some((o) => o.optionKey === "backsplash:kitchen:standard_4in"));
  assert.ok(seeded.some((o) => o.optionKey.startsWith("specialty:kitchen:esf:")));
  assert.ok(seeded.some((o) => o.optionKey === "edge:kitchen:edge_eased"));
  assert.ok(
    seeded.some(
      (o) =>
        o.optionKey === "edge:kitchen:edge_eased" &&
        o.displayLabel === "Eased" &&
        o.includedInBaseline === true
    )
  );
  assert.ok(seeded.some((o) => o.optionKey === "edge:kitchen:edge_small_ogee"));
  assert.ok(seeded.some((o) => o.displayLabel === "Knife"));
  assert.ok(!seeded.some((o) => /W edge|D edge|Included edges/i.test(o.displayLabel)));
  assert.equal(
    seeded.filter((o) => o.optionKey.startsWith("edge:")).length,
    8,
    "Internal Estimate free+premium edge set"
  );
  console.log("ok: default room product option bundle");
}

{
  const wBaseline = buildDefaultRoomProductOptions({
    rooms: [{ roomKey: "kitchen", displayName: "Kitchen", edgeMode: "w_edge" }],
    choiceGroups: ["edge"],
    estimateEdgeMode: "w_edge"
  });
  const wOpt = wBaseline.find((o) => o.optionKey === "edge:kitchen:edge_small_ogee");
  assert.ok(wOpt?.includedInBaseline, "legacy w_edge maps to Small Ogee as original");
  assert.equal(wOpt?.displayLabel, "Small Ogee");
  assert.ok(!wBaseline.some((o) => o.optionKey === "edge:kitchen:eased"));
  assert.ok(!wBaseline.some((o) => o.displayLabel === "W edge"));
  console.log("ok: edge authority uses Internal Estimate profiles");
}

{
  const projection = buildQuoteLibraryCustomerConfigProjection({
    configuredTotal: 5200,
    baselineTotal: 5000,
    selectionQuantities: {
      "material:kitchen:e100-alabaster": 1,
      "sink:kitchen:esf:kansas:3018UM18": 1,
      "sink:kitchen:none": 0,
      "edge:kitchen:edge_eased": 1
    },
    missingInformationRequirements: [{ code: "customer_sink_model_required" }],
    selectedMaterialGroup: "group_b"
  });
  assert.equal(projection.status, "Customer configuring");
  assert.equal(projection.configuredTotal, 5200);
  assert.equal(projection.deltaFromPublished, 200);
  assert.equal(projection.missingInformationCount, 1);
  assert.ok(projection.meaningfulOptionChanges.some((c) => c.optionKey.includes("kansas")));
  assert.ok(!projection.meaningfulOptionChanges.some((c) => c.optionKey.endsWith(":none")));
  console.log("ok: quote library customer config projection contract");
}

{
  const dto = {
    baselineDisplayTotal: 1000,
    configuredDisplayTotal: 1200,
    displayTotalDelta: 200,
    missingInformationRequirements: [
      {
        code: "custom_backsplash_height_review",
        customerCopy: "Final measurements and pricing require estimator review.",
        severity: "review",
        blocksSave: false
      }
    ],
    options: [
      {
        optionKey: "sink:kitchen:esf:kansas:3018UM18",
        displayLabel: "3018UM18",
        visibleSellPrice: 160
      }
    ]
  };
  assertPublicConfigurationHasNoForbiddenContent(dto);
  const blob = JSON.stringify(dto).toLowerCase();
  assert.ok(!blob.includes("wholesale"));
  assert.ok(!blob.includes("margin"));
  assert.ok(!blob.includes("itemcost"));
  console.log("ok: public DTO shape has no cost/margin leakage");
}

{
  // Specialty review_only must not invent a priced total contribution via sellPrice
  const glow = getProductById(
    "specialty:glowback-led-panels-are-custom-made-for-each-project-to-fit-the-dimensions-of-each-piece-project"
  );
  assert.ok(glow);
  assert.equal(glow.pricingTreatment, "review_only");
  const priced = resolveOptionSellPriceFromCatalog(
    `specialty:kitchen:esf:${glow.productId}`
  );
  assert.equal(priced.sellPrice, 0);
  assert.equal(priced.pricingTreatment, "review_only");
  console.log("ok: specialty review_only resolves to $0 (no invented total)");
}

console.log("\nAll digitalEstimateProductOptions tests passed.\n");
