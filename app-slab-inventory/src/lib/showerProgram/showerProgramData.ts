/**
 * ESF Shower Program — structured customer-facing content (V1).
 * Source: Customer Presentation + Sales Flyer (approved program list).
 *
 * Does not duplicate Elite 100 color records — see showerProgramWallColors.ts.
 *
 * ## Shower Program price groups vs Elite 100 price groups
 *
 * These are **intentionally independent** business classifications:
 *
 * - Elite 100 is the authority for color identity, supplier/material identity,
 *   textures, and imagery (via elite100ColorName + elite100MaterialName refs).
 * - The Shower Program maintains its own Promo / A / B / C grouping in `group`.
 * - A color may belong to one Elite 100 price group and a different Shower
 *   Program group (e.g. Cirrus/Cirrus Oro are Shower Group A but Elite 100
 *   Group B). **Do not "correct" Shower Program groups from Elite 100 data.**
 *
 * ## Customer-facing base naming
 *
 * - The 42" × 36" base is the approved customer name.
 * - Manufacturer/spec drawings may label the same nominal base as 36 × 42.
 * - `dimensionalDrawingUrl` may point at an asset labeled 36×42 in the archive.
 *
 * ## Stocked customer base configurations only
 *
 * Only the four entries in SHOWER_PROGRAM_BASES are customer-facing. Additional
 * curb heights, drain layouts, and archive drawings are reference-only unless
 * separately approved.
 */

export type ShowerBaseId = "base-36x36" | "base-42x36" | "base-42x42" | "base-60x32";

export type ShowerWallGroup = "Promo" | "A" | "B" | "C";

export interface ShowerProgramBase {
  id: ShowerBaseId;
  name: string;
  widthIn: number;
  depthIn: number;
  heightLabel: string;
  curbConfiguration: string;
  drainPositions: string[];
  stockColors: string[];
  imageUrl: string;
  dimensionalDrawingUrl: string | null;
  /**
   * Internal: manufacturer/spec archive label for the dimensional drawing when
   * it differs from the customer-facing width × depth name (e.g. 36×42 for 42×36).
   * Not shown in customer UI.
   */
  manufacturerDrawingLabel?: string;
  availability: "stocked";
}

export interface ShowerWallColorRef {
  id: string;
  colorName: string;
  /** Supplier / brand label shown to customers */
  supplierLabel: string;
  group: ShowerWallGroup;
  /** Keys used to resolve Elite 100 texture at runtime */
  elite100ColorName: string;
  elite100MaterialName: string;
}

export interface ShowerInspirationPhoto {
  id: string;
  label: string;
  imageUrl: string;
}

export interface ShowerProgramOptionGroup {
  id: string;
  title: string;
  description: string;
  items: string[];
}

export interface ShowerProcessStep {
  step: number;
  title: string;
  body: string;
}

export interface ShowerBenefit {
  title: string;
  body: string;
}

export const SHOWER_PROGRAM_STOCK_BASE_COLORS = [
  "White",
  "Glacier",
  "Tiramisu",
  "Alabaster",
] as const;

export const SHOWER_PROGRAM_BASES: ShowerProgramBase[] = [
  {
    id: "base-36x36",
    name: '36" × 36" Shower Base',
    widthIn: 36,
    depthIn: 36,
    heightLabel: "Mid Height",
    curbConfiguration: "Single Curb",
    drainPositions: ["Center"],
    stockColors: [...SHOWER_PROGRAM_STOCK_BASE_COLORS],
    imageUrl: "/shower-program/bases/36x36-mid.webp",
    dimensionalDrawingUrl: "/shower-program/bases/36x36-drawing.webp",
    availability: "stocked",
  },
  {
    id: "base-42x36",
    name: '42" × 36" Shower Base',
    widthIn: 42,
    depthIn: 36,
    heightLabel: "Mid Height",
    curbConfiguration: "Single Curb",
    drainPositions: ["Center"],
    stockColors: [...SHOWER_PROGRAM_STOCK_BASE_COLORS],
    imageUrl: "/shower-program/bases/42x36-mid.webp",
    // Same nominal base; manufacturer/spec archive labels the drawing 36×42.
    dimensionalDrawingUrl: "/shower-program/bases/42x36-drawing.webp",
    manufacturerDrawingLabel: "36×42",
    availability: "stocked",
  },
  {
    id: "base-42x42",
    name: '42" × 42" Shower Base',
    widthIn: 42,
    depthIn: 42,
    heightLabel: "Mid Height",
    curbConfiguration: "Dual Curb",
    drainPositions: ["Center"],
    stockColors: [...SHOWER_PROGRAM_STOCK_BASE_COLORS],
    imageUrl: "/shower-program/bases/42x42-mid.webp",
    dimensionalDrawingUrl: "/shower-program/bases/42x42-drawing.webp",
    availability: "stocked",
  },
  {
    id: "base-60x32",
    name: '60" × 32" Shower Base',
    widthIn: 60,
    depthIn: 32,
    heightLabel: "Mid Height",
    curbConfiguration: "Single Curb",
    drainPositions: ["Left", "Right"],
    stockColors: [...SHOWER_PROGRAM_STOCK_BASE_COLORS],
    imageUrl: "/shower-program/bases/60x32-mid.webp",
    dimensionalDrawingUrl: "/shower-program/bases/60x32-left-drawing.webp",
    availability: "stocked",
  },
];

/** Curated Shower Program wall collection — maps to Elite 100 catalog colors.
 *  `group` is the Shower Program price group (independent from Elite 100). */
export const SHOWER_PROGRAM_WALL_COLORS: ShowerWallColorRef[] = [
  { id: "sp-carrara-classic", colorName: "Carrara Classic", supplierLabel: "ASMI", group: "Promo", elite100ColorName: "Carrara Classic", elite100MaterialName: "ASMI" },
  { id: "sp-carrara-royale", colorName: "Carrara Royale", supplierLabel: "Pacific", group: "Promo", elite100ColorName: "Carrara Royale", elite100MaterialName: "ESF" },
  { id: "sp-classic-grey", colorName: "Classic Grey", supplierLabel: "Pacific", group: "Promo", elite100ColorName: "Classic Grey", elite100MaterialName: "ESF" },
  { id: "sp-white-blizzard", colorName: "White Blizzard", supplierLabel: "Pacific", group: "Promo", elite100ColorName: "White Blizzard", elite100MaterialName: "ESF" },
  { id: "sp-white-dove", colorName: "White Dove", supplierLabel: "Stratus", group: "Promo", elite100ColorName: "White Dove", elite100MaterialName: "Stratus" },
  { id: "sp-cirrus-oro", colorName: "Cirrus Oro", supplierLabel: "ASMI", group: "A", elite100ColorName: "Cirrus Oro", elite100MaterialName: "ASMI" },
  { id: "sp-cirrus", colorName: "Cirrus", supplierLabel: "ASMI", group: "A", elite100ColorName: "Cirrus", elite100MaterialName: "ASMI" },
  { id: "sp-calacatta-gold", colorName: "Calacatta Gold", supplierLabel: "ASMI", group: "B", elite100ColorName: "Calacatta Gold", elite100MaterialName: "ASMI" },
  { id: "sp-statuario-mocha", colorName: "Statuario Mocha", supplierLabel: "ASMI", group: "B", elite100ColorName: "Statuario Mocha", elite100MaterialName: "ASMI" },
  { id: "sp-coastal-tide", colorName: "Coastal Tide", supplierLabel: "Pacific", group: "B", elite100ColorName: "Coastal Tide", elite100MaterialName: "ESF" },
  { id: "sp-lenox-oro", colorName: "Lenox Oro", supplierLabel: "Stratus", group: "B", elite100ColorName: "Lenox Oro", elite100MaterialName: "Stratus" },
  { id: "sp-macavella", colorName: "Macavella", supplierLabel: "ASMI", group: "C", elite100ColorName: "Macavella", elite100MaterialName: "ASMI" },
  { id: "sp-aureate", colorName: "Aureate", supplierLabel: "Pacific", group: "C", elite100ColorName: "Aureate", elite100MaterialName: "ESF" },
  { id: "sp-honeydew", colorName: "Honey Dew", supplierLabel: "Pacific", group: "C", elite100ColorName: "Honeydew", elite100MaterialName: "ESF" },
];

export const SHOWER_WALL_GROUP_FILTERS: { value: "all" | ShowerWallGroup; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Promo", label: "Promo" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

export const SHOWER_INSPIRATION_PHOTOS: ShowerInspirationPhoto[] = [
  { id: "insp-1", label: "Completed ESF Shower Installation", imageUrl: "/shower-program/inspiration/pro-veMrdtPQ.jpeg" },
  { id: "insp-2", label: "Stone Wall Panel Shower", imageUrl: "/shower-program/inspiration/pro-u4g8If2c.jpeg" },
  { id: "insp-3", label: "Groutless Panel Detail", imageUrl: "/shower-program/inspiration/2 wall w cap.png" },
  { id: "insp-4", label: "Premium Shower Finish", imageUrl: "/shower-program/inspiration/5908098923939227289.JPG" },
  { id: "insp-5", label: "Showroom Installation", imageUrl: "/shower-program/inspiration/image000003.jpeg" },
];

export const SHOWER_PROGRAM_OPTIONS: ShowerProgramOptionGroup[] = [
  {
    id: "drains",
    title: "Shower Drain Bodies",
    description: "Confirmed program drain body styles. Finish options are selected with Elite Stone during design.",
    items: ["Round Brass", "Round PVC"],
  },
  {
    id: "custom",
    title: "Custom Options",
    description: "Confirmed program add-ons available through Elite Stone Fabrication.",
    items: [
      '12" Corner Shelf',
      "Underside Polish",
      '12" × 10" Recessed Niche',
    ],
  },
];

export const SHOWER_PROGRAM_PROCESS: ShowerProcessStep[] = [
  { step: 1, title: "Consultation", body: "Review the shower program, project requirements, and available options." },
  { step: 2, title: "Design", body: "Choose the shower base, wall surface, and applicable program options." },
  { step: 3, title: "Measure", body: "ESF digitally templates the shower walls when the project is ready." },
  { step: 4, title: "Fabricate", body: "Stone panels are fabricated for the measured shower." },
  { step: 5, title: "Install", body: "ESF installs the fabricated wall panels and applicable finishing/sealant work." },
  { step: 6, title: "Final Walkthrough", body: "The finished installation is reviewed with the customer." },
];

export const SHOWER_PROGRAM_BENEFITS: ShowerBenefit[] = [
  { title: "Fewer Grout Lines", body: "Large-format fabricated panels provide a cleaner, more continuous surface with less grout to maintain." },
  { title: "Premium Appearance", body: "Curated stone surfaces create a clean, high-end shower design." },
  { title: "Precision Fabrication", body: "Digital templating and ESF fabrication allow panels to be made for the individual project." },
  { title: "Simplified Process", body: "Selection, measuring, fabrication, installation, and service are coordinated through Elite Stone." },
  { title: "Local Support", body: "Customers work with the Elite Stone team throughout the project." },
];

export const SHOWER_PROGRAM_FLYER_URL = "/shower-program/docs/esf-shower-program-flyer.pdf";

export const SHOWER_PROGRAM_HERO_IMAGE = "/shower-program/inspiration/pro-veMrdtPQ.jpeg";

export function getShowerBase(id: string): ShowerProgramBase | undefined {
  return SHOWER_PROGRAM_BASES.find((b) => b.id === id);
}
