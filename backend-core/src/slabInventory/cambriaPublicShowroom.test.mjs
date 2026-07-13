import assert from "node:assert/strict";
import {
  buildPublicCambriaShowroomPayload,
  groupCambriaLiveInventoryCards,
  isCambriaCatalogItem,
  isCambriaInventoryItem,
  textMentionsCambria,
  toPublicCambriaDesignCard,
  toPublicCambriaInventoryCard,
} from "./cambriaPublicShowroom.js";

{
  assert.equal(textMentionsCambria("Cambria"), true);
  assert.equal(textMentionsCambria("Cambria Quartz"), true);
  assert.equal(textMentionsCambria("  CAMBRIA  "), true);
  assert.equal(textMentionsCambria("ESF"), false);
  assert.equal(textMentionsCambria("Escambria Stone"), false);
  assert.equal(textMentionsCambria(null), false);
  console.log("ok: textMentionsCambria");
}

{
  assert.equal(isCambriaCatalogItem({ material_name: "Cambria" }), true);
  assert.equal(isCambriaCatalogItem({ normalized_material_name: "cambria" }), true);
  assert.equal(isCambriaCatalogItem({ material_name: "ESF" }), false);
  console.log("ok: isCambriaCatalogItem");
}

{
  assert.equal(isCambriaInventoryItem({ material_name: "Cambria" }), true);
  assert.equal(isCambriaInventoryItem({ distributor: "Cambria" }), true);
  assert.equal(isCambriaInventoryItem({ manufacturer: "Cambria Quartz" }), true);
  assert.equal(isCambriaInventoryItem({ material_name: "ESF", distributor: "ABC" }), false);
  console.log("ok: isCambriaInventoryItem");
}

{
  const publicCard = toPublicCambriaDesignCard({
    color_name: "Axbridge",
    material_name: "Cambria",
    current_inventory_count: 3,
    has_inventory: true,
    slab_count: 2,
    remnant_count: 1,
    reference_image_url: "https://example.com/ref.jpg",
    representative_image_inventory_id: "INV-SECRET",
    match_debug: { matched: true },
    rack: "R1",
    lot: "L9",
    cost: 999,
  });
  assert.equal(publicCard.color_name, "Axbridge");
  assert.equal(publicCard.current_inventory_count, 3);
  assert.equal(publicCard.has_inventory, true);
  assert.equal(publicCard.reference_image_url, "https://example.com/ref.jpg");
  assert.equal(publicCard.representative_image_inventory_id, undefined);
  assert.equal(publicCard.match_debug, undefined);
  assert.equal(publicCard.rack, undefined);
  assert.equal(publicCard.cost, undefined);
  console.log("ok: toPublicCambriaDesignCard keeps counts, strips internals");
}

{
  const card = toPublicCambriaInventoryCard({
    color_key: "cambria--axbridge",
    color_name: "Axbridge",
    material_name: "Cambria",
    total_inventory_count: 4,
    slab_count: 3,
    remnant_count: 1,
    thickness_nominal: "3cm",
    representative_image_url: "https://example.com/slab.jpg",
    representative_thumbnail_url: "https://example.com/slab_t.jpg",
    rack: "should-not-appear",
    cost: 123,
    sample_inventory_ids: ["x"],
  });
  assert.equal(card.color_name, "Axbridge");
  assert.equal(card.total_inventory_count, 4);
  assert.equal(card.thickness_nominal, "3cm");
  assert.equal(card.rack, undefined);
  assert.equal(card.cost, undefined);
  assert.equal(card.sample_inventory_ids, undefined);
  assert.equal(card.image_url, "https://example.com/slab.jpg");
  assert.equal(card.thumbnail_url, "https://example.com/slab_t.jpg");
  console.log("ok: toPublicCambriaInventoryCard sanitizes");
}

{
  const imageMap = new Map([
    [
      "slab-1",
      {
        image_status: "ok",
        image_url: "https://example.com/a.jpg",
        thumbnail_url: "https://example.com/a_t.jpg",
      },
    ],
  ]);
  // Same signature as lookupInventoryImage(imageMap, inventoryRow, sourceFilter)
  const lookupImage = (map, row) => {
    const id = String(row?.external_slab_id ?? "");
    return map.get(id) ?? null;
  };
  const cards = groupCambriaLiveInventoryCards(
    [
      { id: "1", external_slab_id: "slab-1", color_name: "Axbridge", material_name: "Cambria", source_inventory_type: "Slab", thickness_nominal: "3cm", is_active: true },
      { id: "2", external_slab_id: "slab-2", color_name: "Axbridge", material_name: "Cambria", source_inventory_type: "Remnant", thickness_nominal: "3cm", is_active: true },
      { id: "3", external_slab_id: "slab-3", color_name: "Other", material_name: "ESF", source_inventory_type: "Slab", is_active: true },
      { id: "4", external_slab_id: "slab-4", color_name: "Sold", material_name: "Cambria", source_inventory_type: "Slab", is_active: false },
    ],
    imageMap,
    lookupImage,
    null
  );
  assert.equal(cards.length, 1);
  assert.equal(cards[0].color_name, "Axbridge");
  assert.equal(cards[0].total_inventory_count, 2);
  assert.equal(cards[0].slab_count, 1);
  assert.equal(cards[0].remnant_count, 1);
  assert.equal(cards[0].representative_image_url, "https://example.com/a.jpg");
  assert.equal(cards[0].thumbnail_url, "https://example.com/a_t.jpg");
  assert.equal(cards[0].image_url, "https://example.com/a.jpg");
  console.log("ok: groupCambriaLiveInventoryCards filters + groups + images");
}

{
  const payload = buildPublicCambriaShowroomPayload({
    collection: { collection_key: "elite100-2026", display_name: "Elite 100", collection_year: 2026, is_active: true },
    designGroups: [{ price_group: "A", items: [{ color_name: "Axbridge" }] }],
    inventoryCards: [{ color_name: "Axbridge", total_inventory_count: 2 }],
    price_group_order: ["A"],
  });
  assert.equal(payload.title, "Cambria Showcase");
  assert.equal(payload.designs.label, "Cambria Designs");
  assert.equal(payload.inventory.label, "Cambria Live Inventory");
  assert.equal(payload.designs.total, 1);
  assert.equal(payload.inventory.total_pieces, 2);
  assert.ok(!("cost" in payload));
  console.log("ok: buildPublicCambriaShowroomPayload");
}
