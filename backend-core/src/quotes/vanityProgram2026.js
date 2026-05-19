/**
 * 2026 Elite Vanity Program — backend parity with app-quote vanityProgram2026.ts
 */
export const VANITY_PROGRAM_YEAR = 2026;

/** @type {Record<string, { label: string; widthIn: number; bowlCount: number; over35: number; under35: number }>} */
export const VANITY_PROGRAM_2026_BY_CODE = {
  "25_S": { label: '25" Single Bowl Vanity', widthIn: 25, bowlCount: 1, over35: 190, under35: 370 },
  "31_S": { label: '31" Single Bowl Vanity', widthIn: 31, bowlCount: 1, over35: 210, under35: 425 },
  "37_S": { label: '37" Single Bowl Vanity', widthIn: 37, bowlCount: 1, over35: 240, under35: 475 },
  "43_S": { label: '43" Single Bowl Vanity', widthIn: 43, bowlCount: 1, over35: 270, under35: 535 },
  "49_S": { label: '49" Single Bowl Vanity', widthIn: 49, bowlCount: 1, over35: 310, under35: 590 },
  "55_S": { label: '55" Single Bowl Vanity', widthIn: 55, bowlCount: 1, over35: 360, under35: 650 },
  "61_S": { label: '61" Single Bowl Vanity', widthIn: 61, bowlCount: 1, over35: 385, under35: 675 },
  "61_D": { label: '61" Double Bowl Vanity', widthIn: 61, bowlCount: 2, over35: 410, under35: 700 },
  "73_D": { label: '73" Double Bowl Vanity', widthIn: 73, bowlCount: 2, over35: 490, under35: 810 },
  "84_D": { label: '84" Double Bowl Vanity', widthIn: 84, bowlCount: 2, over35: 570, under35: 950 },
  "93_D": { label: '93" Double Bowl Vanity', widthIn: 93, bowlCount: 2, over35: 650, under35: 1000 },
  "96_D": { label: '96" Double Bowl Vanity', widthIn: 96, bowlCount: 2, over35: 685, under35: 1050 },
  "105_D": { label: '105" Double Bowl Vanity', widthIn: 105, bowlCount: 2, over35: 760, under35: 1100 },
  "120_D": { label: '120" Double Bowl Vanity', widthIn: 120, bowlCount: 2, over35: 800, under35: 1150 }
};

export const VANITY_TIER_THRESHOLD_SQFT = 35;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function roundCustomerDisplayVanity(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 5) * 5;
}

export function defaultVanityKitchenTier(qualifyingKitchenCounterSf) {
  return Number(qualifyingKitchenCounterSf) >= VANITY_TIER_THRESHOLD_SQFT ? "kitchen_over_35" : "kitchen_under_35";
}

function sinkUpgradePerSink(sinkType) {
  switch (String(sinkType || "oval_white")) {
    case "oval_bisque":
      return 10;
    case "rectangular_white":
    case "rectangular_bisque":
      return 25;
    default:
      return 0;
  }
}

/**
 * @param {Record<string, unknown>} v
 * @param {number} qualifyingKitchenCounterSf
 */
export function priceVanityProgram2026FromPayload(v, qualifyingKitchenCounterSf = 0) {
  const code = String(v.code || v.sizeCode || "").trim();
  const row = VANITY_PROGRAM_2026_BY_CODE[code];
  if (!row) return null;
  if (Boolean(v.outsideProgram)) {
    return {
      programYear: VANITY_PROGRAM_YEAR,
      code,
      exactTotal: 0,
      displayTotal: 0,
      tier: defaultVanityKitchenTier(qualifyingKitchenCounterSf)
    };
  }
  const qty = Math.max(1, Math.floor(Number(v.qty) || 1));
  const tierRaw = String(v.tier || "");
  const tier =
    tierRaw === "kitchen_over_35" || tierRaw === "kitchen_under_35"
      ? tierRaw
      : Boolean(v.tier1Eligible ?? v.lowerTier)
        ? "kitchen_over_35"
        : defaultVanityKitchenTier(qualifyingKitchenCounterSf);
  const sinkType = String(v.sinkType || "oval_white");
  const perSink = sinkUpgradePerSink(sinkType);
  const sinkUpgradeTotal = round2(perSink * row.bowlCount);
  const baseUnit = tier === "kitchen_over_35" ? row.over35 : row.under35;
  const extraTrips = Math.max(0, Math.floor(Number(v.extraTrips) || 0));
  const extraTripsTotal = round2(extraTrips * 150);
  const exactTotal = round2((baseUnit + sinkUpgradeTotal) * qty + extraTripsTotal);
  return {
    programYear: VANITY_PROGRAM_YEAR,
    code,
    label: row.label,
    tier,
    baseUnit,
    sinkUpgradeTotal,
    extraTripsTotal,
    exactTotal,
    displayTotal: roundCustomerDisplayVanity(exactTotal)
  };
}
