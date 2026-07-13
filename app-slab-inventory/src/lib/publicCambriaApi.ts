import { joinBackendUrl, ApiError } from "@quote-lib/api";
import type { Elite100ShowroomGroup } from "./elite100ShowroomTypes";

export type PublicCambriaInventoryCard = {
  color_key: string | null;
  color_name: string | null;
  material_name: string | null;
  total_inventory_count: number;
  slab_count: number;
  remnant_count: number;
  thickness_nominal: string | null;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
  /** Aliases matching protected live-inventory card fields. */
  image_url?: string | null;
  thumbnail_url?: string | null;
};

export type PublicCambriaShowroomPayload = {
  ok?: boolean;
  title?: string;
  subtitle?: string;
  note?: string;
  collection: {
    collection_key: string | null;
    display_name: string | null;
    collection_year: number | null;
    is_active: boolean;
  } | null;
  designs: {
    label: string;
    groups: Elite100ShowroomGroup[];
    total: number;
  };
  inventory: {
    label: string;
    items: PublicCambriaInventoryCard[];
    total_colors: number;
    total_pieces: number;
  };
  price_group_order: string[];
};

/** Public Cambria showcase payload (no auth). */
export async function fetchPublicCambriaShowroom(): Promise<PublicCambriaShowroomPayload> {
  const url = joinBackendUrl("/api/public/cambria-showroom");
  const res = await fetch(url, { method: "GET", credentials: "omit" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new ApiError(msg || `HTTP ${res.status}`, res.status, json ?? text);
  }
  return json as PublicCambriaShowroomPayload;
}
