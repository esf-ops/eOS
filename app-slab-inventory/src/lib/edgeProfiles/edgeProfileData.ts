/**
 * Standard Elite edge profiles (customer reference, 2026).
 * Cross-sections are drawn in a 160 x 90 box: slab top at y=10, bottom at y=80 (3 cm), finished edge on the right at x=150,
 * the slab running off to the left at x=10. Presentation only: no prices here. `upcharge` mirrors UPGRADED_EDGE_TOKENS in
 * app-digital-estimate/src/edgeGroups.ts (Small Ogee, Crescent, Knife); the Mitered Edge is also tagged upcharge.
 */

export type EdgeProfile = {
  /** Same token the estimate flow uses (see app-digital-estimate edgeGroups). */
  token: string;
  name: string;
  spec: string | null;
  upcharge: boolean;
  /** SVG path of the closed cross-section. */
  path: string;
  /** Small heading shown above this item in the list (the first item of a group carries it). */
  section?: string;
  /** Icon viewBox when the shape is taller than the standard 160 x 90 slab box. */
  viewBox?: string;
  /** How far the shape hangs below the slab bottom, in drawing units; the 3D camera frames it. */
  drop?: number;
  /** Miter joint to draw as a hairline: [x1, y1, x2, y2] in drawing coordinates. */
  seam?: readonly [number, number, number, number];
  /** How far the countertop runs back from the edge, in drawing units (default 200). Longer shows a real countertop. */
  depth?: number;
  /** How long the piece is along the edge, in drawing units (default 240 alone, 150 when comparing). */
  length?: number;
};

export const EDGE_PROFILES: readonly EdgeProfile[] = [
  { token: "edge_eased", name: "Eased", spec: null, upcharge: false, path: "M10 10 H143 Q150 10 150 17 V73 Q150 80 143 80 H10 Z" },
  { token: "edge_large_eased", name: "Large Eased", spec: null, upcharge: false, path: "M10 10 H114 Q150 10 150 46 V76 Q150 80 146 80 H10 Z" },
  { token: "edge_bevel", name: '1/4" Bevel', spec: 'R 1/8" bottom', upcharge: false, path: "M10 10 H128 L150 32 V76 Q150 80 146 80 H10 Z" },
  { token: "edge_full_bullnose", name: "Full Bullnose", spec: null, upcharge: false, path: "M10 10 H115 A35 35 0 0 1 115 80 H10 Z" },
  { token: "edge_large_ogee", name: "Ogee", spec: null, upcharge: false, path: "M10 10 H94 C103.1 32.9 120.1 37.9 142.7 45 C146 46 150 52.8 150 57.2 C150 68.6 142.2 80 130.9 80 H10 Z" },
  { token: "edge_small_ogee", name: "Small Ogee", spec: null, upcharge: true, path: "M10 10 H100 A17 21 0 0 0 117 31 A33 22 0 0 1 150 53 V76 Q150 80 146 80 H10 Z" },
  { token: "edge_crescent", name: "Crescent", spec: null, upcharge: true, path: "M10 10 H128 Q158 45 128 80 H10 Z" },
  { token: "edge_knife", name: "Knife", spec: null, upcharge: true, path: "M10 10 H142 Q151 10 143.5 18 L89 76 Q85.5 80 80 80 H10 Z" },
  // A construction, not a single-slab profile: a second piece is cut at 45 degrees and joined at the corner so the stone's
  // veining wraps over the edge (about a 2" edge). Shown with a longer countertop so the look reads. Not a token in the
  // estimate flow; no price is shown, only the Upcharge tag.
  {
    token: "edge_mitered", name: "Mitered Edge", spec: 'About 2" edge · veining wraps the corner', upcharge: true, section: "Mitered",
    path: "M10 10 H146 Q150 10 150 14 V129 H80 V80 H10 Z", viewBox: "0 0 160 140", drop: 49, seam: [150, 10, 80, 80],
    depth: 600, length: 360,
  },
];

export const CORNER_RADII_NOTES: readonly string[] = [
  '3/4" radius is the standard outside corner.',
  '3/4" inside radius is extra cost.',
  '2.5" radius is the standard inside corner.',
];
