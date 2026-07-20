/**
 * Envelope fingerprint + choice hydration + edge authority regression tests.
 */
import assert from "node:assert/strict";
import { hashConfigurationEnvelope } from "./studioEstimatePublicationAdapter.mjs";
import {
  FRIENDLY_CUSTOMER_CHOICES,
  buildCustomerChoiceConfiguration,
  inferCustomerChoiceGroupsFromEnvelopeOptions,
  inferFriendlyChoiceFlags
} from "./studioCustomerChoiceOptions.mjs";
import {
  buildAuthoritativeEdgeOptionDefinitions,
  normalizeStudioEdgeMode,
  studioEdgeDisplayLabel
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";

{
  const a = hashConfigurationEnvelope({
    customerChoiceGroups: ["materialColor", "sink"],
    allowedOptionKeys: ["qty-sink"]
  });
  const b = hashConfigurationEnvelope({
    customerChoiceGroups: ["materialColor", "sink", "faucet"],
    allowedOptionKeys: ["qty-sink"]
  });
  assert.notEqual(a, b, "faucet permission must change fingerprint (empty catalogKeys)");
  const c = hashConfigurationEnvelope({
    customerChoiceGroups: ["materialColor", "sink", "edge", "backsplash"],
    allowedOptionKeys: ["qty-sink"]
  });
  const d = hashConfigurationEnvelope({
    customerChoiceGroups: ["materialColor", "sink", "edge", "backsplash", "sideSplash"],
    allowedOptionKeys: ["qty-sink"]
  });
  assert.notEqual(c, d, "sideSplash must change fingerprint");
  const same = hashConfigurationEnvelope({
    customerChoiceGroups: ["sink", "materialColor"],
    allowedOptionKeys: ["qty-sink"]
  });
  assert.equal(a, same, "group order must not change fingerprint");
  console.log("ok: fingerprint includes customerChoiceGroups");
}

{
  const allOn = Object.fromEntries(FRIENDLY_CUSTOMER_CHOICES.map((d) => [d.id, true]));
  const cfg = buildCustomerChoiceConfiguration(allOn);
  assert.equal(cfg.customerChoiceGroups.length, 9);
  const fp = hashConfigurationEnvelope(cfg);
  assert.equal(fp.length, 32);
  const toggled = { ...allOn, accessories: false };
  assert.notEqual(
    fp,
    hashConfigurationEnvelope(buildCustomerChoiceConfiguration(toggled)),
    "each permission flag must affect fingerprint"
  );
  console.log("ok: all nine permissions affect fingerprint");
}

{
  const inferred = inferCustomerChoiceGroupsFromEnvelopeOptions([
    { option_key: "material:kitchen:e100-carrara-classic" },
    { optionKey: "sink:kitchen:none" },
    { option_key: "edge:kitchen:included" },
    { option_key: "faucet:kitchen:none" },
    { option_key: "accessory:kitchen:esf:x" },
    { option_key: "specialty:kitchen:esf:y" },
    { option_key: "backsplash:kitchen:standard_4in" },
    { option_key: "sidesplash:kitchen:p1:none" },
    { option_key: "qty-cook" }
  ]);
  assert.deepEqual(inferred.sort(), [
    "accessories",
    "backsplash",
    "cooktop",
    "edge",
    "faucet",
    "materialColor",
    "sideSplash",
    "sink",
    "specialty"
  ].sort());
  const flags = inferFriendlyChoiceFlags({ customerChoiceGroups: inferred });
  assert.equal(flags.materialColor, true);
  assert.equal(flags.faucet, true);
  assert.equal(flags.accessories, true);
  console.log("ok: envelope options hydrate all nine friendly flags");
}

{
  assert.equal(normalizeStudioEdgeMode("eased"), "included");
  assert.equal(normalizeStudioEdgeMode("included"), "included");
  assert.equal(studioEdgeDisplayLabel("included"), "Included edges (eased)");
  assert.equal(studioEdgeDisplayLabel("w_edge"), "W edge");
  const onlyOriginal = buildAuthoritativeEdgeOptionDefinitions({
    roomKey: "kitchen",
    originalEdgeMode: "w_edge",
    approvedEdgeModes: [],
    baseOption: (row) => row
  });
  assert.equal(onlyOriginal.length, 1);
  assert.equal(onlyOriginal[0].optionKey, "edge:kitchen:w_edge");
  assert.equal(onlyOriginal[0].includedInBaseline, true);
  assert.ok(!onlyOriginal.some((o) => /eased/.test(o.optionKey)));
  const full = buildAuthoritativeEdgeOptionDefinitions({
    roomKey: "kitchen",
    originalEdgeMode: "included",
    approvedEdgeModes: ["included", "w_edge", "d_edge"],
    baseOption: (row) => row
  });
  assert.equal(full.length, 3);
  assert.ok(full.every((o) => o.displayLabel !== "Eased edge"));
  console.log("ok: edge authority — original only when no alternatives; Studio labels");
}

{
  const a = hashConfigurationEnvelope({ customerChoiceGroups: ["edge"] });
  const b = hashConfigurationEnvelope({ customerChoiceGroups: ["edge"] });
  assert.equal(a, b);
  assert.equal(a.length, 32);
  console.log("ok: fingerprint shape is stable 32-char hash");
}

console.log("\nAll studio envelope permissions + edge authority tests passed.\n");
