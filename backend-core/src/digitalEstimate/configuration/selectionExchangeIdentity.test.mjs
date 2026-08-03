/**
 * Generic Digital Estimate selection exchange identity:
 * envelope keys, exclusive baseline suppression, backsplash save, customer-safe labels.
 *
 * Run:
 * node backend-core/src/digitalEstimate/configuration/selectionExchangeIdentity.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import {
  applyBacksplashDraftAuthority
} from "./publicConfigurationService.mjs";
import {
  buildPublicCustomerConfigurationReadModel,
  resolveCustomerMaterialLabel,
  resolveCustomerEdgeLabel,
  resolveCustomerBacksplashModeLabel,
  looksLikeRawOptionToken
} from "./customerConfigurationFoundation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const viewSource = readFileSync(
  join(here, "../../../../app-digital-estimate/src/ConfigurationView.tsx"),
  "utf8"
);
const apiSource = readFileSync(
  join(here, "../../../../app-digital-estimate/src/publicConfigApi.ts"),
  "utf8"
);
const vmSource = readFileSync(
  join(here, "../../../../app-digital-estimate/src/lovableViewModel.ts"),
  "utf8"
);

const ROOM = "kitchen";

function roleOptions(role, tokens, baselineToken = null) {
  return tokens.map((token) => {
    const optionKey = `${role}:${ROOM}:${token}`;
    const isBaseline = baselineToken != null && token === baselineToken;
    return {
      optionKey,
      includedInBaseline: isBaseline,
      defaultQty: isBaseline ? 1 : 0,
      minQty: 0,
      maxQty: 1,
      availabilityState: "active"
    };
  });
}

console.log("\nselectionExchangeIdentity.test.mjs\n");

{
  // Envelope key formats vs frontend save keys (contract assertions).
  assert.match(vmSource, /canonicalEsfPlumbingOptionKey/);
  assert.match(vmSource, /buildSelectionItems/);
  assert.match(viewSource, /buildSelectionItems\(effectiveQty, roomsForItems, envelopeKeys\)/);
  assert.match(viewSource, /backsplashDraftsRef\.current = nextDrafts/);
  assert.match(viewSource, /qtyRef\.current = nextQty/);
  assert.match(
    apiSource,
    /selectionIdentityCode[\s\S]*DE-OPTION-NOT-ALLOWED/
  );
  console.log("ok: frontend save path uses envelope keys + syncs draft/qty refs");
}

{
  const materialOpts = roleOptions("material", ["e100-antique-gray", "e100-aurataj"], "e100-antique-gray");
  const selected = `material:${ROOM}:e100-aurataj`;
  const result = normalizeSelectionPayload(
    { selections: { [selected]: 1 } },
    materialOpts,
    { priorSelections: { [`material:${ROOM}:e100-antique-gray`]: 1 } }
  );
  assert.equal(result.selections[selected], 1);
  assert.equal(
    result.selections[`material:${ROOM}:e100-antique-gray`],
    undefined,
    "must not resurrect published material baseline"
  );
  console.log("ok: material exclusive baseline suppression");
}

{
  const edgeOpts = roleOptions("edge", ["edge_eased", "edge_small_ogee"], "edge_eased");
  const selected = `edge:${ROOM}:edge_small_ogee`;
  const result = normalizeSelectionPayload(
    { selections: { [selected]: 1 } },
    edgeOpts,
    { priorSelections: { [`edge:${ROOM}:edge_eased`]: 1 } }
  );
  assert.equal(result.selections[selected], 1);
  assert.equal(result.selections[`edge:${ROOM}:edge_eased`], undefined);
  console.log("ok: edge exclusive baseline suppression");
}

{
  const splashOpts = roleOptions(
    "backsplash",
    ["none", "standard_4in", "full_height"],
    "standard_4in"
  );
  const noneKey = `backsplash:${ROOM}:none`;
  const fourKey = `backsplash:${ROOM}:standard_4in`;
  const result = normalizeSelectionPayload(
    { selections: { [noneKey]: 1 } },
    splashOpts,
    { priorSelections: { [fourKey]: 1 } }
  );
  assert.equal(result.selections[noneKey], 1);
  assert.equal(
    result.selections[fourKey],
    undefined,
    "must not resurrect published 4-inch backsplash"
  );
  console.log("ok: backsplash none save does not resurrect 4-inch baseline");
}

{
  const splashOpts = roleOptions(
    "backsplash",
    ["none", "standard_4in"],
    "standard_4in"
  );
  const noneKey = `backsplash:${ROOM}:none`;
  const fourKey = `backsplash:${ROOM}:standard_4in`;
  const selectionMap = { [noneKey]: 1 };
  applyBacksplashDraftAuthority(
    selectionMap,
    { [ROOM]: { mode: "standard_4in", optionKey: fourKey } },
    splashOpts
  );
  assert.equal(selectionMap[noneKey], 1);
  assert.equal(selectionMap[fourKey], 0);
  console.log("ok: explicit backsplash qty wins over stale draft mode");
}

{
  const splashOpts = roleOptions("backsplash", ["none", "standard_4in"], "standard_4in");
  const fourKey = `backsplash:${ROOM}:standard_4in`;
  const result = normalizeSelectionPayload(
    { selections: { [fourKey]: 1 } },
    splashOpts,
    { priorSelections: { [fourKey]: 1 } }
  );
  assert.equal(result.selections[fourKey], 1);
  console.log("ok: no-op / as-published backsplash selection succeeds");
}

{
  assert.throws(
    () =>
      normalizeSelectionPayload(
        { selections: { [`backsplash:${ROOM}:not_in_envelope`]: 1 } },
        roleOptions("backsplash", ["none", "standard_4in"], "standard_4in"),
        { priorSelections: {} }
      ),
    (e) => e?.code === "invalid_selection" || e?.code === "unknown_option"
  );
  console.log("ok: off-envelope backsplash still rejected");
}

{
  const material = resolveCustomerMaterialLabel("aura_taj", "aura_taj");
  assert.equal(material.colorName, "Aurataj");
  assert.ok(!looksLikeRawOptionToken(material.colorName));
  const antique = resolveCustomerMaterialLabel("e100-antique-gray", null);
  assert.equal(antique.colorName, "Antique Gray");
  assert.equal(resolveCustomerEdgeLabel("edge_eased", "edge_eased"), "Eased");
  assert.equal(resolveCustomerBacksplashModeLabel("none"), "No backsplash");
  assert.equal(resolveCustomerBacksplashModeLabel("standard_4in"), "4-inch backsplash");
  console.log("ok: customer-safe material/edge/backsplash labels");
}

{
  const model = buildPublicCustomerConfigurationReadModel(
    {
      version: 1,
      selectedMaterial: {
        roomId: ROOM,
        colorId: "aura_taj",
        colorName: "aura_taj",
        materialGroup: null,
        pieceId: null
      },
      selectedEdgeProfile: {
        roomId: ROOM,
        profileToken: "edge_eased",
        profileName: "edge_eased",
        pieceId: null,
        estimateWide: false
      },
      canSubmitForFinalReview: false
    },
    {
      quantities: {
        [`material:${ROOM}:e100-aurataj`]: 1,
        [`edge:${ROOM}:edge_eased`]: 1,
        [`backsplash:${ROOM}:none`]: 1,
        [`sink:${ROOM}:esf:blanco:precis-24`]: 1
      },
      productDrafts: {
        [ROOM]: {
          sink: {
            optionKey: `sink:${ROOM}:esf:blanco:precis-24`,
            displayLabel: 'ESF Sink — Precis 24" Sink · Coal Black'
          }
        }
      }
    }
  );
  const labels = (model.selectionChanges?.items || []).map((i) => i.label);
  assert.ok(labels.some((l) => /Aurataj/i.test(l)));
  assert.ok(labels.some((l) => /Eased/i.test(l)));
  assert.ok(labels.some((l) => /No backsplash/i.test(l)));
  assert.ok(labels.some((l) => /Precis 24/i.test(l)));
  assert.ok(!labels.some((l) => looksLikeRawOptionToken(l)));
  assert.ok(!labels.some((l) => /aura_taj|edge_eased|e100-/i.test(l)));
  console.log("ok: Your selections summary uses customer-safe labels");
}

console.log("\nselectionExchangeIdentity.test.mjs — all passed\n");
