import assert from "node:assert/strict";
import {
  buildElite100CurrentInventoryImageFields,
  buildElite100ReferenceImageFields,
  catalogReferenceImageSourceLabel,
  chooseCatalogReferenceImageUrl,
  summarizeElite100CurrentInventory,
  toPublicElite100ShowroomCard,
} from "./elite100CardModel.js";

/* ── reference image prefers highest resolution ─────────────────────────── */
{
  const asset = {
    texture_url_600: "https://example.com/600.jpg",
    texture_url_1024: "https://example.com/1024.jpg",
    hero_url: "https://example.com/hero.jpg",
    original_image_url: "https://example.com/original.jpg",
    review_status: "approved",
    asset_kind: "texture",
  };
  assert.equal(chooseCatalogReferenceImageUrl(asset), "https://example.com/1024.jpg");
  assert.equal(catalogReferenceImageSourceLabel(asset), "catalog_texture_1024");

  const fields = buildElite100ReferenceImageFields(asset);
  assert.equal(fields.reference_image_url, "https://example.com/1024.jpg");
  assert.equal(fields.reference_image_url_full, "https://example.com/original.jpg");
  assert.equal(fields.reference_image_source, "catalog_texture_1024");
  assert.equal(fields.reference_image_review_status, "approved");
  console.log("ok: elite100 reference image resolution priority");
}

/* ── reference fields null when no catalog asset ─────────────────────── */
{
  const fields = buildElite100ReferenceImageFields(null);
  assert.equal(fields.reference_image_url, null);
  assert.equal(fields.reference_image_source, null);
  console.log("ok: elite100 reference fields empty without asset");
}

/* ── current inventory summary uses matched row count ──────────────────── */
{
  const summary = summarizeElite100CurrentInventory({
    rows: [{ id: "1" }, { id: "2" }, { id: "3" }],
    slabCount: 1,
    remnantCount: 1,
    verifiedPhotoCount: 2,
  });
  assert.equal(summary.current_inventory_count, 3);
  assert.equal(summary.total_inventory_count, 3);
  assert.equal(summary.has_inventory, true);
  assert.equal(summary.slab_count, 1);
  assert.equal(summary.remnant_count, 1);
  console.log("ok: elite100 current inventory summary");
}

/* ── current inventory image fields separate from reference ──────────── */
{
  const fields = buildElite100CurrentInventoryImageFields({
    representative_image_url: "https://example.com/slab.jpg",
    representative_thumbnail_url: "https://example.com/slab_thumb.jpg",
    representative_image_source_inventory_type: "Slab",
    representative_image_inventory_id: "INV-1",
  });
  assert.equal(fields.current_inventory_image_url, "https://example.com/slab.jpg");
  assert.equal(fields.current_inventory_thumbnail_url, "https://example.com/slab_thumb.jpg");
  console.log("ok: elite100 current inventory image fields");
}

/* ── public showroom card strips inventory counts / live stock fields ── */
{
  const publicCard = toPublicElite100ShowroomCard({
    catalog_item_id: "c1",
    color_key: "calacatta|quartz|A",
    color_name: "Calacatta",
    material_name: "Quartz",
    display_name: "Calacatta",
    price_group: "A",
    current_inventory_count: 4,
    total_inventory_count: 4,
    slab_count: 3,
    remnant_count: 1,
    verified_photo_count: 2,
    has_inventory: true,
    current_inventory_image_url: "https://example.com/inv.jpg",
    current_inventory_thumbnail_url: "https://example.com/inv_t.jpg",
    current_inventory_image_source_inventory_type: "Slab",
    current_inventory_image_inventory_id: "INV-9",
    representative_image_url: "https://example.com/rep.jpg",
    representative_thumbnail_url: "https://example.com/rep_t.jpg",
    representative_image_source_inventory_type: "Slab",
    representative_image_inventory_id: "INV-9",
    reference_image_url: "https://example.com/ref.jpg",
    reference_image_url_full: "https://example.com/ref_full.jpg",
    visual_asset_url_1024: "https://example.com/va.jpg",
    program_status: "elite_100",
    match_debug: { matched: true },
  });
  assert.equal(publicCard.color_name, "Calacatta");
  assert.equal(publicCard.reference_image_url, "https://example.com/ref.jpg");
  assert.equal(publicCard.visual_asset_url_1024, "https://example.com/va.jpg");
  assert.equal(publicCard.current_inventory_count, undefined);
  assert.equal(publicCard.total_inventory_count, undefined);
  assert.equal(publicCard.slab_count, undefined);
  assert.equal(publicCard.remnant_count, undefined);
  assert.equal(publicCard.has_inventory, undefined);
  assert.equal(publicCard.verified_photo_count, undefined);
  assert.equal(publicCard.current_inventory_image_url, undefined);
  assert.equal(publicCard.representative_image_url, undefined);
  assert.equal(publicCard.match_debug, undefined);
  console.log("ok: public elite100 card strips inventory fields");
}
