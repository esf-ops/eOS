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
};

export type FhbMode = "Off" | "Manual Sq Ft" | "Guided Shape";

export type VanitySource = "Promo / Stock 100 Remnant" | "ESF Non-Stock Remnant";

export type RoomDraft = {
  id: string;
  name: string;
  roomType: string;
  materialGroup: string;
  calcMode: RoomCalcMode;
  linear: { wallFt: number; splashIn: number; islandL: number; islandW: number };
  direct: { counter: number; splash: number };
  guidedPieces: GuidedPiece[];
  fhbMode: FhbMode;
  fhbDirectSf: number;
  fhbOutlets: number;
  fhbPieces: GuidedPiece[];
  addons: Record<string, number>;
  tear: boolean;
  raised: "Yes" | "No";
  notes: string;
  vanity: {
    size: string;
    source: VanitySource;
    depth: number;
    qty: number;
    programSink: number;
    bowl: number;
  };
};

export type MeasuredRoom = {
  id: string;
  name: string;
  type: string;
  group: string;
  rate: number;
  counter: number;
  splash: number;
  fhb: number;
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
  vanityTier?: "t1" | "t2";
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
  countertopSf: number;
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
