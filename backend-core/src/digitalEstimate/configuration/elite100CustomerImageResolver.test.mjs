/**
 * Elite 100 customer image resolver — maps DE materials to Supabase visual assets.
 */
import assert from "node:assert/strict";
import {
  buildElite100CustomerImageMaps,
  clearElite100CustomerImageCache,
  elite100MaterialMatchKeys,
  normalizeElite100ColorMatchKey,
  resolveElite100CustomerImage
} from "./elite100CustomerImageResolver.mjs";
import { listElite100CustomerMaterials } from "./elite100CustomerMaterialCatalog.mjs";

clearElite100CustomerImageCache();

assert.equal(normalizeElite100ColorMatchKey("Classic Grey"), "classic gray");
assert.equal(normalizeElite100ColorMatchKey("Classic Gray"), "classic gray");
assert.ok(elite100MaterialMatchKeys("Carrara Classic", "e100-carrara-classic").includes("id:e100-carrara-classic"));
assert.ok(elite100MaterialMatchKeys("Carrara Classic", null).includes("name:carrara classic"));

const catalogItems = [
  {
    id: "cat-1",
    color_name: "Carrara Classic",
    display_name: "Carrara Classic",
    color_key: "carrara-classic--quartz--promo",
    price_group: "Promo",
    is_active: true
  },
  {
    id: "cat-2",
    color_name: "Classic Gray",
    display_name: "Classic Gray",
    color_key: "classic-gray--quartz--promo",
    price_group: "Promo",
    is_active: true
  },
  {
    id: "cat-3",
    color_name: "Skara Brae",
    display_name: "Skara Brae",
    color_key: "skara-brae--quartz--f",
    price_group: "F",
    is_active: true
  }
];

const assets = [
  {
    catalog_item_id: "cat-1",
    texture_url_600: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/carrara/thumb-600.jpg",
    texture_url_1024: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/carrara/hero-1024.jpg",
    hero_url: null,
    original_image_url: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/carrara/original.jpg",
    asset_kind: "manual_upload",
    review_status: "approved",
    is_primary: true,
    is_active: true
  },
  {
    catalog_item_id: "cat-2",
    texture_url_600: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/classic-gray/thumb-600.jpg",
    texture_url_1024: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/classic-gray/hero-1024.jpg",
    hero_url: null,
    original_image_url: null,
    asset_kind: "texture",
    review_status: "imported",
    is_primary: true,
    is_active: true
  },
  {
    catalog_item_id: "cat-3",
    texture_url_600: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/skara/thumb-600.jpg",
    texture_url_1024: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/skara/hero-1024.jpg",
    hero_url: null,
    original_image_url: "https://example.supabase.co/storage/v1/object/public/eliteos-slab-images/org/x/elite100-visual/skara/original.jpg",
    asset_kind: "manual_upload",
    review_status: "approved",
    is_primary: true,
    is_active: true
  }
];

const maps = buildElite100CustomerImageMaps(catalogItems, assets);
assert.equal(maps.byMaterialId.size, 3);

const carrara = resolveElite100CustomerImage(
  { materialId: "e100-carrara-classic", displayName: "Carrara Classic" },
  maps
);
assert.equal(carrara.imageStatus, "ready");
assert.equal(carrara.source, "supabase_visual_asset");
assert.ok(carrara.thumbnailUrl.includes("thumb-600"));
assert.ok(carrara.previewUrl.includes("hero-1024"));
assert.equal(carrara.previewUrl.includes("original.jpg"), false, "preview must not prefer 40MB master");

const classicGrey = resolveElite100CustomerImage(
  { materialId: "e100-classic-grey", displayName: "Classic Grey" },
  maps
);
assert.equal(classicGrey.imageStatus, "ready", "Grey/Gray alias must resolve");
assert.ok(classicGrey.thumbnailUrl.includes("classic-gray"));

const skara = resolveElite100CustomerImage(
  { materialId: "e100-skara-brae", displayName: "Skara Brae" },
  maps
);
assert.equal(skara.imageStatus, "ready");
assert.ok(skara.thumbnailUrl);

const missing = resolveElite100CustomerImage(
  { materialId: "e100-moonflakes", displayName: "Moonflakes" },
  maps
);
assert.equal(missing.imageStatus, "missing");

const localFallback = resolveElite100CustomerImage(
  {
    materialId: "e100-moonflakes",
    displayName: "Moonflakes",
    imageThumbPath: "/materials/elite100/thumb/moonflakes.jpg",
    imageFullPath: "/materials/elite100/full/moonflakes.jpg"
  },
  maps
);
assert.equal(localFallback.imageStatus, "fallback_local");
assert.equal(localFallback.source, "local_pilot");

const all = listElite100CustomerMaterials(true);
assert.equal(all.length, 100);

// Reconcile report shape: every DE material gets a resolution row against the map
const reconcile = all.map((m) => {
  const r = resolveElite100CustomerImage(m, maps);
  return {
    materialId: m.materialId,
    displayName: m.displayName,
    pricingGroup: m.pricingGroupCode,
    imageStatus: r.imageStatus,
    thumbnailUrl: r.thumbnailUrl,
    previewUrl: r.previewUrl,
    matchBasis: r.matchBasis,
    source: r.source,
    localPilotPath: m.imageThumbPath || null
  };
});
assert.equal(reconcile.length, 100);
const readyInFixture = reconcile.filter((r) => r.imageStatus === "ready").length;
assert.equal(readyInFixture, 3, "fixture assets map to 3 of 100 in this unit test");
assert.ok(reconcile.some((r) => r.displayName === "Skara Brae" && r.imageStatus === "ready"));

console.log(
  JSON.stringify(
    {
      catalogSize: 100,
      fixtureReady: readyInFixture,
      greyAliasWorks: classicGrey.imageStatus === "ready",
      previewAvoidsOriginalMaster: !carrara.previewUrl.includes("original.jpg")
    },
    null,
    2
  )
);
console.log("ok: elite100CustomerImageResolver");
