/** Measurement + room model ported from ESF Quoting Tool v1.01 (structured for React / tests). */

export type QuoteWorkflowMethod =
  | "manual_sqft"
  | "rapid_linear"
  | "guided_shape"
  | "room_by_room"
  | "upload_plans"
  | "visualize";

export type RoomCalcMode = "Guided Shape" | "Rapid Linear Foot" | "Manual Sq Ft";

export type PieceShape = "rect" | "tri";

export type GuidedPieceType = "counter" | "splash" | "fhb";

export type GuidedPiece = {
  id: string;
  pieceType: GuidedPieceType;
  name: string;
  lengthIn: number;
  depthIn: number;
  shape: PieceShape;
  /** When true on a counter piece, add 4″ backsplash sf = length × 4 / 144 (internal quoting). */
  addSplash?: boolean;
  /** When true, use piece-level material group / color instead of the room default. */
  materialOverride?: boolean;
  materialGroup?: string;
  materialColor?: string;
  materialSupplier?: string;
  materialType?: string;
};

export type EliteProgramColorRow = {
  id: string;
  colorName: string;
  supplier?: string | null;
  materialType?: string | null;
  priceGroupCode: string;
  priceGroupLabel: string;
};

export type FhbMode = "Off" | "Manual Sq Ft" | "Guided Shape";

/** Guided layout preset — drives corner overlap deduction (L = 1 corner, U = 2; Galley/Rectangle do not deduct). */
export type GuidedLayoutPreset =
  | "Rectangle"
  | "L-Shape"
  | "U-Shape"
  | "Galley"
  | "Island"
  | "Backsplash"
  | "Waterfall"
  | null;

/** Shape group type within a guided room — overlap applies inside the group only. */
export type GuidedShapeGroupType =
  | "straight"
  | "manual"
  | "L-Shape"
  | "U-Shape"
  | "Galley"
  | "Island"
  | "Backsplash"
  | "Waterfall";

/** Per-group corner overlap for pricing — `auto` follows shape type (L=1, U=2). */
export type GuidedOverlapMode = "auto" | "none" | "L-Shape" | "U-Shape";

/** Backsplash scope for a shape group — `exclude` omits splash pieces and 4″ add-ons in this group. */
export type GuidedGroupBacksplashMode = "include" | "exclude";

export type GuidedShapeGroup = {
  id: string;
  name: string;
  shapeType: GuidedShapeGroupType;
  /** Corner deduction mode; omitted/`auto` preserves legacy shape-default behavior. */
  overlapMode?: GuidedOverlapMode;
  /** When `exclude`, backsplash/splash SF from this group is not counted. */
  backsplashMode?: GuidedGroupBacksplashMode;
  pieces: GuidedPiece[];
};

export type VanitySource = "Promo / Stock 100 Remnant" | "ESF Non-Stock Remnant";

export type VanityKitchenTier = "kitchen_over_35" | "kitchen_under_35";

export type VanitySinkType =
  | "oval_white"
  | "oval_bisque"
  | "rectangular_white"
  | "rectangular_bisque";

export type RoomUseTaxMode = "inherit_project" | "none" | "percent";

export type RoomDraft = {
  id: string;
  name: string;
  roomType: string;
  materialGroup: string;
  /** Selected Elite Program color display name (informational + snapshot). */
  materialColor?: string;
  materialSupplier?: string;
  materialType?: string;
  materialCatalogId?: string | null;
  calcMode: RoomCalcMode;
  /** Legacy single-preset flag; kept in sync when exactly one L/U layout group exists. */
  guidedLayoutPreset?: GuidedLayoutPreset;
  /** Additive guided shape groups (Internal Estimate v1). */
  guidedShapeGroups?: GuidedShapeGroup[];
  linear: { wallFt: number; splashIn: number; islandL: number; islandW: number; counterDepthIn?: number };
  direct: { counter: number; splash: number };
  /** Flattened pieces from all groups — API, canvas, backward compatibility. */
  guidedPieces: GuidedPiece[];
  fhbMode: FhbMode;
  fhbDirectSf: number;
  fhbOutlets: number;
  fhbPieces: GuidedPiece[];
  addons: Record<string, number>;
  tear: boolean;
  raised: "Yes" | "No";
  notes: string;
  /** Customer-facing note for this room — prints under the room row on the customer estimate PDF. Internal notes are never printed. */
  customerNote?: string;
  /**
   * Per-room customer PDF comparison groups (e.g. ["Group Promo", "Group F"]).
   * When non-empty, only this room's rows appear in the comparison section for these groups.
   * Rooms with an empty or absent array are excluded from the comparison section.
   */
  customerComparisonGroups?: string[];
  /** Optional color labels per comparison group for this room (e.g. { "Group F": "Aura Taj" }). */
  customerComparisonColorLabels?: Record<string, string>;
  /** Per-room use tax (countertop material only). `inherit_project` uses project default %. */
  useTaxMode?: RoomUseTaxMode;
  useTaxPercent?: number;
  useTaxBase?: "countertop_material";
  /**
   * Edge profile selection for this room/area. Standard edges are included in fabrication;
   * upgraded edges are charged per linear foot by the backend calculator.
   */
  edgeProfile?: string;
  /**
   * Linear feet of upgraded edge for this room. Required (> 0) when edgeProfile is an upgraded
   * profile; ignored for standard edges. The backend calculator applies the $/LF rate.
   */
  upgradedEdgeLf?: number;
  vanity: {
    size: string;
    source: VanitySource;
    depth: number;
    qty: number;
    programSink: number;
    bowl: number;
    isVanityProgram?: boolean;
    vanityWidth?: number;
    vanityBowlType?: "single" | "double";
    vanityTier?: VanityKitchenTier;
    vanityTierOverrideReason?: string;
    vanitySinkType?: VanitySinkType;
    vanityExtraTrips?: number;
    vanityEligibilityNote?: string;
    vanityProgramYear?: number;
    outsideProgram?: boolean;
  };
};

export type MeasuredRoom = {
  id: string;
  name: string;
  type: string;
  group: string;
  rate: number;
  counter: number;
  /** Priced/chargeable countertop SF (may round up from exact when internal Elite rule applies). */
  chargeableCounter?: number;
  /** SF added by rounding exact counter up to next whole foot (internal diagnostics). */
  counterRoundingAdjustment?: number;
  splash: number;
  fhb: number;
  /** Priced/chargeable backsplash+FHB SF (may round up from exact when internal Elite rule applies). */
  chargeableSplash?: number;
  /** SF added by rounding exact backsplash/FHB up to next whole foot (internal diagnostics). */
  splashRoundingAdjustment?: number;
  totalSf: number;
  extras: number;
  selected: number;
  vanityTotal: number;
  details: string[];
  notes: string[];
  addons: Array<{ label: string; qty: number; price: number; total: number }>;
  priceableCounter: number;
  priceableSplash: number;
  fixedTotal: number;
  /** @deprecated use vanityProgram.tier */
  vanityTier?: "t1" | "t2";
  vanityProgram?: {
    programYear: number;
    tier: VanityKitchenTier;
    tierLabel: string;
    tierOverrideReason?: string;
    exactTotal: number;
    displayTotal: number;
    roundingMode: "nearest_5";
    outsideProgram: boolean;
    customerNote: string;
    label?: string;
  };
  useTax?: {
    percent: number;
    baseCountertopMaterial: number;
    taxAmount: number;
    applied: boolean;
  };
  /** True when this room is priced via Vanity Program (fixed program pricing). False/undefined = countertop pricing. */
  isVanityProgram?: boolean;
};

export type RoomEngineTotals = {
  counter: number;
  splash: number;
  fhb: number;
  extras: number;
  selected: number;
  vanity: number;
  priceableCounter: number;
  priceableSplash: number;
  fixed: number;
  qualifyingSf: number;
};

export type MathCheckSnapshot = {
  workflowLabel: string;
  qualifyingSf: number;
  vanityTierThreshold: number;
  vanityTierLabel: string;
  measurementLines: string[];
  /** Priced/chargeable counter SF (internal may round up from exact). */
  countertopSf: number;
  /** Exact measured counter SF before chargeable round-up (internal diagnostics). */
  exactCountertopSf?: number;
  backsplashSf: number;
  fullHeightSf: number;
  totalScopeSf: number;
  primaryGroup: string;
  groupRatePerSf: number;
  roomBreakdown: Array<{ name: string; wholesale: string; detailCount: number }>;
  addOnLines: string[];
  wholesale: number;
  retailOrPublic: number;
  partnerProfit?: number;
  warnings: string[];
};
