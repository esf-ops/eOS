import assert from "node:assert/strict";
import {
  buildElite100CurrentInventoryImageFields,
  buildElite100ReferenceImageFields,
  catalogReferenceImageSourceLabel,
  chooseCatalogReferenceImageUrl,
  summarizeElite100CurrentInventory,
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
