/**
 * 2026 Elite Vanity Program — isolated pricing (22.5" standard depth, PROMO / Elite 100 remnants).
 * Internal Estimate customer display rounds vanity program totals to nearest $5.
 */
import { round2 } from "./measurementEngine";

export const VANITY_PROGRAM_YEAR = 2026;

export type VanityKitchenTier = "kitchen_over_35" | "kitchen_under_35";

export type VanitySinkType =
  | "oval_white"
  | "oval_bisque"
  | "rectangular_white"
  | "rectangular_bisque";

export type VanityProgramSizeCode =
  | "25_S"
  | "31_S"
  | "37_S"
  | "43_S"
  | "49_S"
  | "55_S"
  | "61_S"
  | "61_D"
  | "73_D"
  | "84_D"
  | "93_D"
  | "96_D"
  | "105_D"
  | "120_D";

export type VanityProgram2026RateRow = {
  code: VanityProgramSizeCode;
  label: string;
  widthIn: number;
  bowlCount: 1 | 2;
  over35: number;
  under35: number;
};

/** 2026 Vanity Program sheet — standard 22.5" depth vanity tops. */
export const VANITY_PROGRAM_2026_RATES: VanityProgram2026RateRow[] = [
  { code: "25_S", label: '25" Single Bowl Vanity', widthIn: 25, bowlCount: 1, over35: 190, under35: 370 },
  { code: "31_S", label: '31" Single Bowl Vanity', widthIn: 31, bowlCount: 1, over35: 210, under35: 425 },
  { code: "37_S", label: '37" Single Bowl Vanity', widthIn: 37, bowlCount: 1, over35: 240, under35: 475 },
  { code: "43_S", label: '43" Single Bowl Vanity', widthIn: 43, bowlCount: 1, over35: 270, under35: 535 },
  { code: "49_S", label: '49" Single Bowl Vanity', widthIn: 49, bowlCount: 1, over35: 310, under35: 590 },
  { code: "55_S", label: '55" Single Bowl Vanity', widthIn: 55, bowlCount: 1, over35: 360, under35: 650 },
  { code: "61_S", label: '61" Single Bowl Vanity', widthIn: 61, bowlCount: 1, over35: 385, under35: 675 },
  { code: "61_D", label: '61" Double Bowl Vanity', widthIn: 61, bowlCount: 2, over35: 410, under35: 700 },
  { code: "73_D", label: '73" Double Bowl Vanity', widthIn: 73, bowlCount: 2, over35: 490, under35: 810 },
  { code: "84_D", label: '84" Double Bowl Vanity', widthIn: 84, bowlCount: 2, over35: 570, under35: 950 },
  { code: "93_D", label: '93" Double Bowl Vanity', widthIn: 93, bowlCount: 2, over35: 650, under35: 1000 },
  { code: "96_D", label: '96" Double Bowl Vanity', widthIn: 96, bowlCount: 2, over35: 685, under35: 1050 },
  { code: "105_D", label: '105" Double Bowl Vanity', widthIn: 105, bowlCount: 2, over35: 760, under35: 1100 },
  { code: "120_D", label: '120" Double Bowl Vanity', widthIn: 120, bowlCount: 2, over35: 800, under35: 1150 }
];

const RATE_BY_CODE = new Map(VANITY_PROGRAM_2026_RATES.map((r) => [r.code, r]));

export const VANITY_TIER_THRESHOLD_SQFT = 35;

/** Customer-facing vanity program $ — nearest $5 (internal exact math unchanged). */
export function roundCustomerDisplayVanity(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 5) * 5;
}

export function vanityProgramRateRow(code: string): VanityProgram2026RateRow | undefined {
  return RATE_BY_CODE.get(String(code || "").trim() as VanityProgramSizeCode);
}

export function defaultVanityKitchenTier(qualifyingKitchenCounterSf: number): VanityKitchenTier {
  return qualifyingKitchenCounterSf >= VANITY_TIER_THRESHOLD_SQFT ? "kitchen_over_35" : "kitchen_under_35";
}

export function vanityTierLabel(tier: VanityKitchenTier): string {
  return tier === "kitchen_over_35" ? "Kitchen tops ≥ 35 sf" : "Kitchen tops < 35 sf";
}

function sinkUpgradePerSink(sinkType: VanitySinkType): number {
  switch (sinkType) {
    case "oval_white":
      return 0;
    case "oval_bisque":
      return 10;
    case "rectangular_white":
    case "rectangular_bisque":
      return 25;
    default:
      return 0;
  }
}

/** Map legacy programSink / bowl fields to 2026 sink type when needed. */
export function legacySinkTypeFromVanityFields(programSink: number, bowl: number, bowlCount: 1 | 2): VanitySinkType {
  if (bowl === 55 || programSink >= 50) {
    return bowlCount === 2 ? "rectangular_white" : "rectangular_white";
  }
  if (programSink >= 10 || bowl === 35) return "oval_bisque";
  return "oval_white";
}

export type VanityProgram2026Input = {
  sizeCode: string;
  qty?: number;
  depthIn?: number;
  tier?: VanityKitchenTier;
  tierOverrideReason?: string;
  sinkType?: VanitySinkType;
  extraTrips?: number;
  outsideProgram?: boolean;
  qualifyingKitchenCounterSf?: number;
};

export type VanityProgram2026Result = {
  programYear: typeof VANITY_PROGRAM_YEAR;
  sizeCode: string;
  label: string;
  widthIn: number;
  bowlCount: 1 | 2;
  depthIn: number;
  qty: number;
  tier: VanityKitchenTier;
  tierLabel: string;
  tierOverrideReason?: string;
  baseUnitPrice: number;
  sinkUpgradePerSink: number;
  sinkUpgradeTotal: number;
  extraTrips: number;
  extraTripsTotal: number;
  exactTotal: number;
  displayTotal: number;
  roundingMode: "nearest_5";
  outsideProgram: boolean;
  customerNote: string;
};

/**
 * Price one vanity under the 2026 program. Exact $ preserved; `displayTotal` rounds to nearest $5.
 */
export function priceVanityProgram2026(input: VanityProgram2026Input): VanityProgram2026Result | null {
  const code = String(input.sizeCode || "").trim();
  const row = vanityProgramRateRow(code);
  if (!row) return null;

  const depthIn = Number(input.depthIn) > 0 ? Number(input.depthIn) : 22.5;
  const qty = Math.max(1, Math.floor(Number(input.qty) || 1));
  const qualifying = Number(input.qualifyingKitchenCounterSf) || 0;
  const autoTier = defaultVanityKitchenTier(qualifying);
  const tier = input.tier === "kitchen_over_35" || input.tier === "kitchen_under_35" ? input.tier : autoTier;
  const sinkType = input.sinkType ?? "oval_white";
  const bowlCount = row.bowlCount;
  const perSinkUp = sinkUpgradePerSink(sinkType);
  const sinkUpgradeTotal = round2(perSinkUp * bowlCount);
  const baseUnitPrice = tier === "kitchen_over_35" ? row.over35 : row.under35;
  const extraTrips = Math.max(0, Math.floor(Number(input.extraTrips) || 0));
  const extraTripsTotal = round2(extraTrips * 150);
  const outsideProgram = Boolean(input.outsideProgram);

  let exactTotal = round2((baseUnitPrice + sinkUpgradeTotal) * qty + extraTripsTotal);
  if (outsideProgram) {
    exactTotal = 0;
  }

  const customerNote = outsideProgram
    ? "Quoted outside vanity program — material purchase required."
    : "Vanity program includes eased edge, necessary backsplash, sink openings, and standard white oval sinks.";

  return {
    programYear: VANITY_PROGRAM_YEAR,
    sizeCode: code,
    label: row.label,
    widthIn: row.widthIn,
    bowlCount,
    depthIn,
    qty,
    tier,
    tierLabel: vanityTierLabel(tier),
    tierOverrideReason: input.tierOverrideReason?.trim() || undefined,
    baseUnitPrice,
    sinkUpgradePerSink: perSinkUp,
    sinkUpgradeTotal,
    extraTrips,
    extraTripsTotal,
    exactTotal,
    displayTotal: roundCustomerDisplayVanity(exactTotal),
    roundingMode: "nearest_5",
    outsideProgram,
    customerNote
  };
}

export function serializeVanityProgramSnapshot(result: VanityProgram2026Result): Record<string, unknown> {
  return { ...result };
}
