/**
 * Contaminated exclusive-room selection sanitation for Digital Estimate.
 *
 * Run:
 * node backend-core/src/digitalEstimate/configuration/sanitizeExclusiveRoomSelections.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import {
  sanitizeExclusiveRoomSelectionQuantities,
  sanitizeProductDraftsForExclusiveSelections,
  sanitizeSelectionPayloadMeta,
  sanitizePublicRoomPricingForExclusiveSelections
} from "./sanitizeExclusiveRoomSelections.mjs";
import { buildPublicCustomerConfigurationReadModel } from "./customerConfigurationFoundation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, "publicConfigurationService.mjs"), "utf8");

const ROOM = "kitchen";
const ESF = `sink:${ROOM}:esf:blanco:precis-24`;
const ESF_FINISH = `sink:${ROOM}:esf:blanco:precis-24:coal-black`;
const CP = `sink:${ROOM}:customer_provided`;
const NONE = `sink:${ROOM}:none`;
const BS_NONE = `backsplash:${ROOM}:none`;
const BS_4 = `backsplash:${ROOM}:standard_4in`;

function sinkOptions() {
  return [
    {
      optionKey: NONE,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: CP,
      includedInBaseline: true,
      defaultQty: 1,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: ESF,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: BS_NONE,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: BS_4,
      includedInBaseline: true,
      defaultQty: 1,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    }
  ];
}

console.log("\nsanitizeExclusiveRoomSelections.test.mjs\n");

{
  assert.match(serviceSource, /sanitizeCustomerCalculationForExclusiveSelections/);
  assert.match(serviceSource, /sanitizeExclusiveRoomSelectionQuantities/);
  assert.match(serviceSource, /sanitizeSelectionPayloadMeta/);
  assert.match(
    serviceSource,
    /Availability only for survivors of exclusive sanitation/
  );
  console.log("ok: publicConfigurationService wires exclusive sanitation");
}

{
  const result = sanitizeExclusiveRoomSelectionQuantities(
    { [ESF]: 1, [CP]: 1 },
    sinkOptions()
  );
  assert.equal(result.quantities[ESF], 1);
  assert.equal(result.quantities[CP], 0);
  assert.ok(result.removedKeys.includes(CP));
  assert.equal(result.changed, true);
  console.log("ok: contaminated ESF + customer_provided → ESF only");
}

{
  const contaminated = {
    rooms: [
      {
        roomName: "Kitchen",
        addOnsAmount: 575,
        roomTotal: 8575,
        addOnLines: [
          { category: "Sink", label: 'Sink — ESF Sink — Precis 24" Sink · Coal Black', amount: 575 },
          { category: "Sink", label: "Sink — Customer-provided sink", amount: 0 },
          { category: "Sink", label: "Customer-provided sink", amount: 0 },
          { category: "Sink cutout", label: "Kitchen sink cutout", amount: 0 }
        ]
      }
    ],
    projectTotal: 8575
  };
  const cleaned = sanitizePublicRoomPricingForExclusiveSelections(
    contaminated,
    { [ESF]: 1, [CP]: 1 },
    [{ roomKey: ROOM, displayName: "Kitchen" }]
  );
  const labels = (cleaned.rooms[0].addOnLines || []).map((l) => l.label);
  assert.ok(labels.some((l) => /Precis 24/i.test(l)));
  assert.ok(!labels.some((l) => /customer-provided/i.test(l)));
  assert.ok(labels.some((l) => /Kitchen sink cutout/i.test(l)));
  assert.equal(
    labels.filter((l) => /^Sink\b/i.test(l) && !/cutout/i.test(l)).length,
    1
  );
  console.log("ok: roomPricing sidebar projection drops customer-provided after ESF win");
}


{
  const result = sanitizeExclusiveRoomSelectionQuantities(
    { [ESF_FINISH]: 1, [CP]: 1 },
    sinkOptions()
  );
  assert.equal(result.quantities[ESF], 1);
  assert.equal(result.quantities[ESF_FINISH], undefined);
  assert.equal(result.quantities[CP], 0);
  assert.ok(result.remappedKeys.some((r) => r.from === ESF_FINISH && r.to === ESF));
  console.log("ok: finish-specific ESF remaps to family and beats customer_provided");
}

{
  const meta = sanitizeSelectionPayloadMeta(
    {
      quantities: { [ESF]: 1, [CP]: 1, [BS_4]: 1 },
      customerProductDrafts: {
        [ROOM]: {
          sink: {
            source: "customer_provided",
            optionKey: CP,
            displayLabel: "Customer-provided sink"
          }
        }
      }
    },
    sinkOptions()
  );
  assert.equal(meta.quantities[ESF], 1);
  assert.equal(meta.quantities[CP], 0);
  assert.equal(meta.customerProductDrafts?.[ROOM]?.sink, undefined);
  console.log("ok: read-model meta drops customer_provided draft when ESF qty wins");
}

{
  const model = buildPublicCustomerConfigurationReadModel(null, {
    quantities: sanitizeExclusiveRoomSelectionQuantities(
      { [ESF]: 1, [CP]: 1 },
      sinkOptions()
    ).quantities,
    productDrafts: {
      [ROOM]: {
        sink: {
          optionKey: ESF,
          displayLabel: 'ESF Sink — Precis 24" Sink · Coal Black'
        }
      }
    }
  });
  const labels = (model.selectionChanges?.items || []).map((i) => i.label);
  assert.ok(labels.some((l) => /Precis 24/i.test(l)));
  assert.ok(!labels.some((l) => /customer-provided/i.test(l)));
  console.log("ok: public read model shows one ESF sink label only");
}

{
  // Contaminated prior + backsplash change → normalize succeeds, CP stripped.
  const normalized = normalizeSelectionPayload(
    {
      selections: {
        [ESF]: 1,
        [CP]: 1,
        [BS_NONE]: 1
      }
    },
    sinkOptions(),
    {
      priorSelections: { [ESF]: 1, [CP]: 1, [BS_4]: 1 },
      allowCanonicalBacksplashOrphans: true
    }
  );
  assert.equal(normalized.selections[ESF], 1);
  assert.equal(normalized.selections[CP], undefined);
  assert.equal(normalized.selections[BS_NONE], 1);
  assert.equal(
    normalized.selections[BS_4],
    undefined,
    "must not resurrect standard_4in when none is selected"
  );
  console.log("ok: contaminated sink + backsplash none save sanitizes cleanly");
}

{
  const result = sanitizeExclusiveRoomSelectionQuantities(
    { [BS_NONE]: 1, [BS_4]: 1 },
    sinkOptions()
  );
  assert.equal(result.quantities[BS_NONE], 1);
  assert.equal(result.quantities[BS_4], 0);
  console.log("ok: backsplash none wins over baseline standard_4in");
}

{
  const matA = `material:${ROOM}:e100-antique-gray`;
  const matB = `material:${ROOM}:e100-aurataj`;
  const opts = [
    {
      optionKey: matA,
      includedInBaseline: true,
      defaultQty: 1,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: matB,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    }
  ];
  const normalized = normalizeSelectionPayload(
    { selections: { [matB]: 1, [matA]: 1 } },
    opts,
    { priorSelections: { [matA]: 1 } }
  );
  assert.equal(normalized.selections[matB], 1);
  assert.equal(normalized.selections[matA], undefined);
  console.log("ok: selected material prevents baseline material coexistence");
}

{
  assert.throws(
    () =>
      normalizeSelectionPayload(
        { selections: { [`sink:${ROOM}:esf:not-real`]: 1 } },
        sinkOptions(),
        { priorSelections: {} }
      ),
    (e) => e?.code === "invalid_selection" || e?.code === "selection_unavailable"
  );
  console.log("ok: off-envelope sink still rejected");
}

{
  const drafts = sanitizeProductDraftsForExclusiveSelections(
    {
      [ROOM]: {
        sink: {
          source: "customer_provided",
          optionKey: CP,
          displayLabel: "Customer-provided sink"
        }
      }
    },
    { [ESF]: 1, [CP]: 0 }
  );
  assert.equal(drafts[ROOM], undefined);
  console.log("ok: incompatible customer_provided draft removed for ESF winner");
}

{
  // Ambiguous: two different non-baseline ESF products
  const other = `sink:${ROOM}:esf:other:model`;
  const opts = [
    ...sinkOptions(),
    {
      optionKey: other,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    }
  ];
  assert.throws(
    () =>
      sanitizeExclusiveRoomSelectionQuantities(
        { [ESF]: 1, [other]: 1 },
        opts,
        { throwOnAmbiguous: true }
      ),
    (e) => e?.code === "selection_unavailable" && e?.reason === "ambiguous_exclusive_selection"
  );
  console.log("ok: ambiguous dual ESF products fail closed");
}

console.log("\nsanitizeExclusiveRoomSelections.test.mjs — all passed\n");
