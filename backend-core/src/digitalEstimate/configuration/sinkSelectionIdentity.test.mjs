/**
 * Exclusive room-role baseline defaults must not resurrect customer_provided
 * sink (or other exclusive baselines) when the customer already selected ESF.
 *
 * Run:
 * node backend-core/src/digitalEstimate/configuration/sinkSelectionIdentity.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import { parseProductOptionKey } from "../catalog/digitalEstimateProductOptions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, "publicConfigurationService.mjs"), "utf8");

const FAMILY_KEY = "sink:kitchen:esf:blanco:precis-24";
const FINISH_KEY = "sink:kitchen:esf:blanco:precis-24:coal-black";
const CP_KEY = "sink:kitchen:customer_provided";
const NONE_KEY = "sink:kitchen:none";

function sinkOptions() {
  return [
    {
      optionKey: NONE_KEY,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: CP_KEY,
      includedInBaseline: true,
      defaultQty: 1,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    },
    {
      optionKey: FAMILY_KEY,
      includedInBaseline: false,
      defaultQty: 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    }
  ];
}

console.log("\nsinkSelectionIdentity.test.mjs\n");

{
  const result = normalizeSelectionPayload(
    { selections: { [FAMILY_KEY]: 1 } },
    sinkOptions(),
    { priorSelections: { [CP_KEY]: 1 } }
  );
  assert.equal(result.selections[FAMILY_KEY], 1);
  assert.equal(
    result.selections[CP_KEY],
    undefined,
    "must not re-add published customer_provided when ESF sink is selected"
  );
  assert.equal(result.selections[NONE_KEY], undefined);
  console.log("ok: ESF sink selection does not resurrect customer_provided baseline");
}

{
  const result = normalizeSelectionPayload(
    { selections: {} },
    sinkOptions(),
    { priorSelections: {} }
  );
  assert.equal(result.selections[CP_KEY], 1);
  assert.equal(result.selections[FAMILY_KEY], undefined);
  console.log("ok: untouched estimate still seeds published customer_provided baseline");
}

{
  const result = normalizeSelectionPayload(
    { selections: { [NONE_KEY]: 1 } },
    sinkOptions(),
    { priorSelections: { [CP_KEY]: 1 } }
  );
  assert.equal(result.selections[NONE_KEY], 1);
  assert.equal(result.selections[CP_KEY], undefined);
  console.log("ok: No sink replaces customer_provided without re-adding baseline");
}

{
  const parsedFamily = parseProductOptionKey(FAMILY_KEY);
  const parsedFinish = parseProductOptionKey(FINISH_KEY);
  assert.equal(parsedFamily?.productId, "blanco:precis-24");
  assert.equal(parsedFinish?.productId, "blanco:precis-24:coal-black");
  assert.match(serviceSource, /findEnvelopeEsfFamilyOption/);
  assert.match(serviceSource, /rawKey\.startsWith\(`\$\{optionKey\}:`\)/);
  console.log("ok: finish-specific keys remap to family envelope option via prefix match");
}

{
  // Unsupported off-envelope product must stay unknown.
  const resultKeys = Object.keys(
    normalizeSelectionPayload(
      { selections: { [FAMILY_KEY]: 1 } },
      sinkOptions(),
      { priorSelections: {} }
    ).selections
  );
  assert.ok(resultKeys.includes(FAMILY_KEY));
  assert.throws(
    () =>
      normalizeSelectionPayload(
        { selections: { "sink:kitchen:esf:not-a-real-product": 1 } },
        sinkOptions(),
        { priorSelections: {} }
      ),
    (e) => e?.code === "invalid_selection"
  );
  console.log("ok: off-envelope ESF sink still returns invalid_selection / unavailable");
}

console.log("\nsinkSelectionIdentity.test.mjs: ok\n");
