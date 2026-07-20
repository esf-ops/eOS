/**
 * Customer configuration drafts (session selection meta).
 * Run: node backend-core/src/digitalEstimate/configuration/customerConfigurationDraft.test.mjs
 */
import assert from "node:assert/strict";
import {
  mergeSelectionPayloadMeta,
  sanitizeCustomerInfoDraft,
  splitSelectionPayloadMeta
} from "./customerConfigurationDraft.mjs";
import { toCustomerSafeMaterialRecord } from "./elite100CustomerMaterialCatalog.mjs";

console.log("\ncustomerConfigurationDraft.test.mjs\n");

{
  const draft = sanitizeCustomerInfoDraft({
    customerName: "  Pat <b>Lee</b> ",
    projectName: "Kitchen",
    phone: "555-0100",
    email: "pat@example.com",
    projectAddress: "9 Oak"
  });
  assert.equal(draft.customerName, "Pat Lee");
  assert.equal(draft.phone, "555-0100");
  console.log("ok: customer info draft sanitized; not CRM mutation");
}

{
  const merged = mergeSelectionPayloadMeta(
    { "material:kitchen:e100-carrara-classic": 1 },
    {
      customerInfoDraft: { customerName: "Pat", projectName: "", phone: "", email: "", projectAddress: "" },
      roomLabelDrafts: { kitchen: "Main Kitchen" }
    }
  );
  const split = splitSelectionPayloadMeta(merged);
  assert.equal(split.quantities["material:kitchen:e100-carrara-classic"], 1);
  assert.equal(split.customerInfoDraft.customerName, "Pat");
  assert.equal(split.roomLabelDrafts.kitchen, "Main Kitchen");
  assert.equal(Object.keys(split.quantities).some((k) => k.startsWith("__")), false);
  console.log("ok: draft meta survives save/resume without polluting option quantities");
}

{
  const merged = mergeSelectionPayloadMeta(
    { "sink:kitchen:customer_provided": 1, "backsplash:kitchen:custom_height": 1 },
    {
      customerProductDrafts: {
        kitchen: {
          sink: { source: "customer_provided", manufacturer: "Kohler", model: "" },
          faucet: { source: "none" }
        }
      },
      backsplashDrafts: {
        kitchen: { mode: "custom_height", requestedHeightInches: 9.5, note: "Tile to hood" }
      }
    }
  );
  const split = splitSelectionPayloadMeta(merged);
  assert.equal(split.customerProductDrafts.kitchen.sink.manufacturer, "Kohler");
  assert.equal(split.backsplashDrafts.kitchen.requestedHeightInches, 9.5);
  assert.equal(split.quantities["sink:kitchen:customer_provided"], 1);
  console.log("ok: product + backsplash drafts sanitize and split cleanly");
}

{
  const safe = toCustomerSafeMaterialRecord({
    materialId: "e100-carrara-classic",
    displayName: "Carrara Classic",
    pricingGroupCode: "promo",
    imageThumbPath: "/materials/elite100/thumb/carrara-classic.jpg",
    imageFullPath: "/materials/elite100/full/carrara-classic.jpg",
    customerVisible: true,
    collectionLabel: "Elite 100",
    colorFamily: "White",
    patternType: "veined"
  });
  assert.equal(safe.pricingGroupLabel, "Group Promo");
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "pricingGroupCode"), false);
  assert.ok(!JSON.stringify(safe).toLowerCase().includes("wholesale"));
  console.log("ok: customer-safe materials expose group label without internal code or basis");
}

console.log("\nAll customerConfigurationDraft tests passed.\n");
