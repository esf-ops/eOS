/**
 * Customer catalog permission enforcement — backend save rejection.
 * Run: node backend-core/src/digitalEstimate/configuration/customerCatalogPermissions.test.mjs
 */
import assert from "node:assert/strict";
import {
  collectForbiddenCatalogSelections,
  isCatalogCategoryAllowed,
  normalizeCustomerCatalogPermissions,
  permissionCategoryForOption
} from "./customerCatalogPermissions.mjs";

console.log("\ncustomerCatalogPermissions.test.mjs\n");

{
  const all = normalizeCustomerCatalogPermissions(null);
  assert.equal(all.sink, true);
  assert.equal(all.material, true);
  assert.equal(all.side_splash, true);
  const disabled = normalizeCustomerCatalogPermissions({ sink: false, edge: false });
  assert.equal(disabled.sink, false);
  assert.equal(disabled.edge, false);
  assert.equal(disabled.faucet, true);
  console.log("ok: normalize defaults missing keys to allowed");
}

{
  assert.equal(permissionCategoryForOption("sink:kitchen:esf:blanco"), "sink");
  assert.equal(permissionCategoryForOption("faucet:kitchen:esf:x"), "faucet");
  assert.equal(permissionCategoryForOption("accessory:kitchen:x"), "accessories");
  assert.equal(permissionCategoryForOption("edge:kitchen:edge_ogee"), "edge");
  assert.equal(permissionCategoryForOption("backsplash:kitchen:none"), "backsplash");
  assert.equal(permissionCategoryForOption("sidesplash:kitchen:p1:left"), "side_splash");
  assert.equal(permissionCategoryForOption("material:kitchen:group_f"), "material");
  assert.equal(permissionCategoryForOption("qty-sink"), null);
  console.log("ok: option keys map to permission categories");
}

{
  const options = [
    {
      optionKey: "sink:kitchen:none",
      includedInBaseline: true,
      compatibilityJson: { role: "sink" }
    },
    {
      optionKey: "sink:kitchen:esf:blanco",
      includedInBaseline: false,
      compatibilityJson: { role: "sink" }
    },
    {
      optionKey: "faucet:kitchen:esf:x",
      includedInBaseline: false,
      compatibilityJson: { role: "faucet" }
    }
  ];
  // Disabled sink: non-baseline sink selection is forbidden.
  const forbidden = collectForbiddenCatalogSelections({
    selections: {
      "sink:kitchen:esf:blanco": 1,
      "faucet:kitchen:esf:x": 1
    },
    options,
    permissions: { sink: false }
  });
  assert.equal(forbidden.length, 1);
  assert.equal(forbidden[0].category, "sink");
  assert.equal(forbidden[0].optionKey, "sink:kitchen:esf:blanco");

  // Baseline sink remains allowed when category disabled.
  const baselineOk = collectForbiddenCatalogSelections({
    selections: { "sink:kitchen:none": 1 },
    options,
    permissions: { sink: false }
  });
  assert.equal(baselineOk.length, 0);

  // Enabled categories remain functional.
  const allOk = collectForbiddenCatalogSelections({
    selections: {
      "sink:kitchen:esf:blanco": 1,
      "faucet:kitchen:esf:x": 1
    },
    options,
    permissions: {}
  });
  assert.equal(allOk.length, 0);
  console.log("ok: forbidden selections collected; baseline allowed; enabled remain open");
}

{
  assert.equal(isCatalogCategoryAllowed({ sink: false }, "sink"), false);
  assert.equal(isCatalogCategoryAllowed({ sink: false }, "faucet"), true);
  assert.equal(isCatalogCategoryAllowed(null, "edge"), true);
  console.log("ok: isCatalogCategoryAllowed");
}

console.log("\nAll customerCatalogPermissions tests passed.\n");
