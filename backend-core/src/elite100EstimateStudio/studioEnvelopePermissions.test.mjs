/**
 * Envelope fingerprint + choice hydration + edge authority regression tests.
 */
import assert from "node:assert/strict";
import { hashConfigurationEnvelope } from "./studioEstimatePublicationAdapter.mjs";
import {
  FRIENDLY_CUSTOMER_CHOICES,
  buildCustomerChoiceConfiguration,
  inferCustomerChoiceGroupsFromEnvelopeOptions,
  inferFriendlyChoiceFlags,
  normalizeCustomerChoiceGroups
} from "./studioCustomerChoiceOptions.mjs";
import {
  ALL_EDGE_PROFILES,
  FREE_EDGE_PROFILES,
  PREMIUM_EDGE_PROFILES,
  buildAuthoritativeEdgeOptionDefinitions,
  edgeProfileDisplayLabel,
  isPremiumEdgeProfile,
  normalizeEdgeProfileToken,
  remapLegacyEdgeOptionKey,
  resolvePremiumEdgeRatePerLf
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { mapStudioPublicationPersistenceError } from "./studioEstimatePublicationSource.mjs";

{
  const a = hashConfigurationEnvelope({
    customerChoiceGroups: ["material_color", "sink"]
  });
  const b = hashConfigurationEnvelope({
    customerChoiceGroups: ["material_color", "sink", "faucet"]
  });
  assert.notEqual(a, b, "faucet permission must change fingerprint");
  const legacy = hashConfigurationEnvelope({
    customerChoiceGroups: ["materialColor", "sink"]
  });
  assert.equal(a, legacy, "camelCase aliases must normalize into same fingerprint");
  const c = hashConfigurationEnvelope({
    customerChoiceGroups: ["material_color", "sink", "edge", "backsplash"]
  });
  const d = hashConfigurationEnvelope({
    customerChoiceGroups: ["material_color", "sink", "edge", "backsplash", "side_splash"]
  });
  assert.notEqual(c, d, "side_splash must change fingerprint");
  console.log("ok: fingerprint includes canonical customerChoiceGroups");
}

{
  assert.throws(
    () => normalizeCustomerChoiceGroups(["not_a_real_permission"], { rejectUnknown: true }),
    (e) => e?.code === "DE-CONFIGURATION-CONTRACT-INVALID"
  );
  const nine = normalizeCustomerChoiceGroups(FRIENDLY_CUSTOMER_CHOICES.map((d) => d.id));
  assert.equal(nine.length, 9);
  const cfg = buildCustomerChoiceConfiguration(
    Object.fromEntries(FRIENDLY_CUSTOMER_CHOICES.map((d) => [d.id, true]))
  );
  assert.equal(cfg.customerChoiceGroups.length, 9);
  console.log("ok: unknown permission rejected; nine-key set saves");
}

{
  const inferred = inferCustomerChoiceGroupsFromEnvelopeOptions([
    { option_key: "material:kitchen:e100-carrara-classic" },
    { optionKey: "sink:kitchen:none" },
    { option_key: "edge:kitchen:edge_eased" },
    { option_key: "faucet:kitchen:none" },
    { option_key: "accessory:kitchen:esf:x" },
    { option_key: "specialty:kitchen:esf:y" },
    { option_key: "backsplash:kitchen:standard_4in" },
    { option_key: "sidesplash:kitchen:p1:none" },
    { option_key: "qty-cook" }
  ]);
  assert.deepEqual(inferred, [
    "material_color",
    "sink",
    "faucet",
    "accessories",
    "specialty",
    "cooktop_cutout",
    "edge",
    "backsplash",
    "side_splash"
  ]);
  const flags = inferFriendlyChoiceFlags({ customerChoiceGroups: inferred });
  assert.equal(flags.material_color, true);
  assert.equal(flags.faucet, true);
  console.log("ok: envelope options hydrate all nine friendly flags");
}

{
  assert.equal(FREE_EDGE_PROFILES.length, 5);
  assert.equal(PREMIUM_EDGE_PROFILES.length, 3);
  assert.equal(ALL_EDGE_PROFILES.length, 8);
  assert.equal(normalizeEdgeProfileToken("eased"), "edge_eased");
  assert.equal(normalizeEdgeProfileToken("included"), "edge_eased");
  assert.equal(normalizeEdgeProfileToken("w_edge"), "edge_small_ogee");
  assert.equal(edgeProfileDisplayLabel("edge_eased"), "Eased");
  assert.equal(edgeProfileDisplayLabel("edge_knife"), "Knife");
  assert.ok(!["W edge", "D edge", "Included edges (eased)"].includes(edgeProfileDisplayLabel("included")));
  assert.equal(remapLegacyEdgeOptionKey("edge:kitchen:eased"), "edge:kitchen:edge_eased");
  assert.equal(resolvePremiumEdgeRatePerLf("wholesale"), 15);
  assert.equal(resolvePremiumEdgeRatePerLf("direct"), 25);
  assert.equal(isPremiumEdgeProfile("edge_crescent"), true);
  assert.equal(isPremiumEdgeProfile("edge_eased"), false);

  const opts = buildAuthoritativeEdgeOptionDefinitions({
    roomKey: "kitchen",
    originalProfileToken: "edge_eased",
    approvedProfileTokens: null,
    baseOption: (row) => row
  });
  assert.equal(opts.length, 8);
  assert.ok(opts.every((o) => !/W edge|D edge|Included edges/i.test(o.displayLabel)));
  assert.ok(opts.some((o) => o.optionKey === "edge:kitchen:edge_eased" && o.includedInBaseline));
  assert.ok(opts.some((o) => o.displayLabel === "Small Ogee"));
  console.log("ok: Internal Estimate edge profiles — no W/D/included scope labels");
}

{
  const mapped = mapStudioPublicationPersistenceError({
    code: "23514",
    message: 'new row for relation "quote_publication_events" violates check constraint "quote_publication_events_event_type_check"'
  });
  assert.equal(mapped.code, "DE-CONFIGURATION-CONTRACT-INVALID");
  assert.equal(mapped.statusCode, 422);
  console.log("ok: 23514 maps to DE-CONFIGURATION-CONTRACT-INVALID");
}

console.log("\nAll studio envelope permissions + edge authority tests passed.\n");
