/** Shared Elite 100 carousel card shape (internal API + public showroom). */
export type Elite100ShowroomItem = {
  catalog_item_id: string;
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  display_name: string | null;
  price_group: string;
  current_inventory_count?: number;
  total_inventory_count: number;
  slab_count: number;
  remnant_count: number;
  verified_photo_count: number;
  reference_image_url?: string | null;
  reference_image_url_full?: string | null;
  reference_image_url_1024?: string | null;
  reference_image_url_600?: string | null;
  reference_image_source?: string | null;
  current_inventory_image_url?: string | null;
  current_inventory_thumbnail_url?: string | null;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
  representative_image_source_inventory_type: string | null;
  representative_image_inventory_id: string | null;
  visual_asset_url: string | null;
  visual_asset_url_600: string | null;
  visual_asset_url_1024: string | null;
  visual_asset_source: string | null;
  visual_asset_kind: string | null;
  visual_asset_review_status: string | null;
  has_inventory: boolean;
  program_status: "elite_100";
};

export type Elite100ShowroomGroup = {
  price_group: string;
  items: Elite100ShowroomItem[];
};

export type Elite100ShowroomData = {
  collection: {
    collection_key: string;
    display_name: string;
    collection_year: number | null;
    is_active: boolean;
  } | null;
  groups: Elite100ShowroomGroup[];
  price_group_order: string[];
};

export function colorInitials(name: string | null): string {
  const n = String(name || "").trim();
  if (!n) return "—";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

export function elite100CardImageSrc(item: Elite100ShowroomItem): string | null {
  return (
    item.reference_image_url
    || item.reference_image_url_1024
    || item.reference_image_url_600
    || item.visual_asset_url_1024
    || item.visual_asset_url_600
    || null
  );
}

export function elite100CardImageSrcFull(item: Elite100ShowroomItem): string | null {
  return (
    item.reference_image_url_full
    || item.reference_image_url
    || item.reference_image_url_1024
    || item.reference_image_url_600
    || item.visual_asset_url_1024
    || item.visual_asset_url_600
    || null
  );
}
