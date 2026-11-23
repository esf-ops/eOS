/**
 * Standard Elite edge profiles (customer reference, 2026).
 * Cross-sections are drawn in a 160 x 90 box: slab top at y=10, bottom at y=80 (3 cm), finished edge on the right at x=150,
 * the slab running off to the left at x=10. Presentation only: no prices here. `upcharge` mirrors UPGRADED_EDGE_TOKENS in
 * app-digital-estimate/src/edgeGroups.ts (Small Ogee, Crescent, Knife).
 */

export type EdgeProfile = {
  /** Same token the estimate flow uses (see app-digital-estimate edgeGroups). */
  token: string;
  name: string;
  spec: string | null;
  upcharge: boolean;
  /** SVG path of the closed cross-section. */
  path: string;
};

export const EDGE_PROFILES: readonly EdgeProfile[] = [
  { token: "edge_eased", name: "Eased", spec: null, upcharge: false, path: "M10 10 H143 Q150 10 150 17 V73 Q150 80 143 80 H10 Z" },
  { token: "edge_large_eased", name: "Large Eased", spec: null, upcharge: false, path: "M10 10 H114 Q150 10 150 46 V76 Q150 80 146 80 H10 Z" },
  { token: "edge_bevel", name: '1/4" Bevel', spec: 'R 1/8" bottom', upcharge: false, path: "M10 10 H128 L150 32 V76 Q150 80 146 80 H10 Z" },
  { token: "edge_full_bullnose", name: "Full Bullnose", spec: null, upcharge: false, path: "M10 10 H115 A35 35 0 0 1 115 80 H10 Z" },
  { token: "edge_large_ogee", name: "Ogee", spec: null, upcharge: false, path: "M10 10 H94 A24 19 0 0 0 118 29 A32 30 0 0 1 150 59 A18 21 0 0 1 132 80 H10 Z" },
  { token: "edge_small_ogee", name: "Small Ogee", spec: null, upcharge: true, path: "M10 10 H100 A17 21 0 0 0 117 31 A33 22 0 0 1 150 53 V76 Q150 80 146 80 H10 Z" },
  { token: "edge_crescent", name: "Crescent", spec: null, upcharge: true, path: "M10 10 H128 Q158 45 128 80 H10 Z" },
  { token: "edge_knife", name: "Knife", spec: null, upcharge: true, path: "M10 10 H142 Q151 10 143.5 18 L89 76 Q85.5 80 80 80 H10 Z" },
];

export const CORNER_RADII_NOTES: readonly string[] = [
  '3/4" radius is the standard outside corner.',
  '3/4" inside radius is extra cost.',
  '2.5" radius is the standard inside corner.',
];
