/**
 * Adapt Cambria public showroom designs into Photo Visualizer texture groups.
 * Only Cambria designs with usable display textures are included.
 */

import {
  buildElite100VisualizerTexture,
  type Elite100VisualizerGroup,
} from "./elite100VisualizerTextures";
import type { Elite100ShowroomGroup } from "./elite100ShowroomTypes";

/**
 * Convert Cambria public design groups into the shape MaterialPhotoVisualizer expects.
 * Drops items without a usable thumb/full display texture so the picker never
 * falls back to the full Elite 100 catalog.
 */
export function toCambriaVisualizerGroups(
  groups: Elite100ShowroomGroup[] | null | undefined,
): Elite100VisualizerGroup[] {
  const list = Array.isArray(groups) ? groups : [];
  const out: Elite100VisualizerGroup[] = [];

  for (const group of list) {
    const items = (group.items ?? []).filter((item) => {
      const material = String(item.material_name ?? "").toLowerCase();
      if (material && !material.includes("cambria")) return false;
      return buildElite100VisualizerTexture(item).hasImage;
    });
    if (items.length === 0) continue;
    out.push({
      price_group: group.price_group,
      items,
    });
  }

  return out;
}

export function countCambriaVisualizerTextures(
  groups: Elite100VisualizerGroup[] | null | undefined,
): number {
  return (groups ?? []).reduce((sum, g) => sum + (g.items?.length ?? 0), 0);
}
