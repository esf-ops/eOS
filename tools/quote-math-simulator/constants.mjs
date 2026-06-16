/**
 * Internal Estimate quote math constants — must stay aligned with:
 *   app-quote/src/lib/prototypeQuoteMath.ts
 *   app-quote/src/lib/vanityProgram2026.ts
 *   backend-core/src/quotes/quoteCalculator.js
 */

/** Default room rows on Marshal Testing / Room Calculations (change here to reconfigure). */
export const ROOM_COUNT = 12;

/** Internal Estimate material use tax (percent). */
export const MATERIAL_USE_TAX_PERCENT = 2;

/** Out-of-Collection premium by pricing mode (percent). */
export const OOC_WHOLESALE_PERCENT = 10;
export const OOC_DIRECT_PERCENT = 15;

/** Default target multiplier for OOC material cost coverage check. */
export const DEFAULT_TARGET_MATERIAL_MULTIPLIER = 2.25;

/** Vanity kitchen tier threshold (sq ft). */
export const VANITY_TIER_THRESHOLD_SQFT = 35;

/** Extra template/install trip charge (2026 vanity program). */
export const VANITY_EXTRA_TRIP_PRICE = 150;

export const PRICE_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant"
];

/** OOC requires comparable groups Promo–F (not Remnant-only). */
export const OOC_VALID_GROUPS = new Set([
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F"
]);

export const WHOLESALE_RATES = {
  "Group Promo": 45,
  "Group A": 57,
  "Group B": 65,
  "Group C": 75,
  "Group D": 85,
  "Group E": 100,
  "Group F": 115,
  Remnant: 50
};

export const DIRECT_RATES = {
  "Group Promo": 70,
  "Group A": 77,
  "Group B": 85,
  "Group C": 95,
  "Group D": 105,
  "Group E": 120,
  "Group F": 135,
  Remnant: 50
};

export const ADDON_CATALOG = [
  { id: "qty-sink", label: "Kitchen Sink Cutouts", price: 200 },
  { id: "qty-bar", label: "Vanity/Bar Sink Cutouts", price: 100 },
  { id: "qty-cook", label: "Cooktop Cutouts", price: 150 },
  { id: "qty-outlet", label: "Electrical Outlet Cutouts", price: 30 },
  { id: "qty-ss", label: "ESF Stainless Kitchen Sink", price: 160 },
  { id: "qty-blanco", label: "Stock Blanco Sink", price: 450 },
  { id: "qty-v-rect", label: "ESF Rectangular Vanity Sink", price: 55 },
  { id: "qty-v-oval", label: "ESF Oval Vanity Sink", price: 35 }
];

export const TEAROUT_PRICE = 750;

export const DROPDOWN_LISTS = {
  pricingMode: ["Wholesale", "Direct-Retail"],
  materialProgram: ["Elite 100", "Out-of-Collection"],
  programOverride: ["Inherit", "Elite 100", "Out-of-Collection"],
  roomType: ["Kitchen", "Bathroom", "Vanity", "Bar", "Island", "Laundry", "Other"],
  yesNo: ["Yes", "No"],
  vanityTier: ["Auto", "Kitchen ≥35 sf", "Kitchen <35 sf"],
  sinkType: ["Oval White", "Oval Bisque", "Rect White", "Rect Bisque"]
};

/** 2026 vanity program — over35 / under35 unit prices before sink upgrades & trips. */
export const VANITY_PROGRAM_2026 = [
  { code: "25_S", label: '25" Single Bowl', over35: 190, under35: 370, bowls: 1 },
  { code: "31_S", label: '31" Single Bowl', over35: 210, under35: 425, bowls: 1 },
  { code: "37_S", label: '37" Single Bowl', over35: 240, under35: 475, bowls: 1 },
  { code: "43_S", label: '43" Single Bowl', over35: 270, under35: 535, bowls: 1 },
  { code: "49_S", label: '49" Single Bowl', over35: 310, under35: 590, bowls: 1 },
  { code: "55_S", label: '55" Single Bowl', over35: 360, under35: 650, bowls: 1 },
  { code: "61_S", label: '61" Single Bowl', over35: 385, under35: 675, bowls: 1 },
  { code: "61_D", label: '61" Double Bowl', over35: 410, under35: 700, bowls: 2 },
  { code: "73_D", label: '73" Double Bowl', over35: 490, under35: 810, bowls: 2 },
  { code: "84_D", label: '84" Double Bowl', over35: 570, under35: 950, bowls: 2 },
  { code: "93_D", label: '93" Double Bowl', over35: 650, under35: 1000, bowls: 2 },
  { code: "96_D", label: '96" Double Bowl', over35: 685, under35: 1050, bowls: 2 },
  { code: "105_D", label: '105" Double Bowl', over35: 760, under35: 1100, bowls: 2 },
  { code: "120_D", label: '120" Double Bowl', over35: 800, under35: 1150, bowls: 2 }
];

/** Sink upgrade per sink (2026 program). */
export const SINK_UPGRADE = {
  "Oval White": 0,
  "Oval Bisque": 10,
  "Rect White": 25,
  "Rect Bisque": 25
};

export const OUTPUT_PATH = "debug/quote-math-simulator/Internal-Estimate-Quote-Math-Simulator.xlsx";
