/** Shared prompt text for countertop concept visualization renders. */

export const VISUALIZER_DISCLAIMER =
  "Concept visualization only. Not an estimate, measurement, layout, inventory reservation, or production drawing.";

export const VISUALIZER_CORE_INSTRUCTION =
  "Replace only the countertops with the selected material/texture. Preserve cabinets, walls, floors, sink, faucet, appliances, lighting, shadows, camera angle, and room layout. Do not change anything except the countertop surfaces. Return a concept visualization only.";

/**
 * @param {{ materialName?: string|null, userInstruction?: string|null }} input
 * @returns {string}
 */
export function buildVisualizerPrompt(input = {}) {
  const materialName = String(input.materialName ?? "").trim();
  const userInstruction = String(input.userInstruction ?? "").trim();

  const parts = [
    VISUALIZER_CORE_INSTRUCTION,
    materialName ? `Selected countertop material: ${materialName}.` : null,
    "The first image is the customer's kitchen or bath photo. The second image is the slab/material texture reference — apply its color and pattern to countertop surfaces only.",
    userInstruction ? `Additional instruction: ${userInstruction}` : null,
  ].filter(Boolean);

  return parts.join("\n\n");
}
