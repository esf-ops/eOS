/**
 * Client-side demo fallback when POST /api/quote/calculate is unavailable.
 * Mirrors prototype v1.01 tier rates and add-ons from backend-core/src/quotes/quoteCalculator.js
 */

export const TIER_RATES: Record<string, number> = {
  "Group Promo": 45,
  "Group A": 57,
  "Group B": 65,
  "Group C": 75,
  "Group D": 85,
  "Group E": 100,
  "Group F": 115
};

const ADDONS: Record<string, { name: string; price: number }> = {
  "qty-sink": { name: "Kitchen Sink Cutouts", price: 200 },
  "qty-bar": { name: "Vanity/Bar Sink Cutouts", price: 100 },
  "qty-cook": { name: "Cooktop Cutouts", price: 150 },
  "qty-outlet": { name: "Electrical Outlet Cutouts", price: 30 },
  "qty-ss": { name: "ESF Stainless Kitchen Sink", price: 160 },
  "qty-blanco": { name: "Stock Blanco Sink", price: 450 },
  tearout: { name: "Tear Out Needed", price: 750 }
};

const MIN_PUBLIC_MARKUP = 25;

function rateForGroup(name: string): number {
  const g = String(name || "Group Promo").trim();
  return TIER_RATES[g] ?? TIER_RATES["Group Promo"];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type DemoMode = "public" | "partner";

export type DemoRoomInput = {
  name: string;
  materialGroup: string;
  countertopSqft: number;
  backsplashSqft: number;
};

export type DemoFormInput = {
  mode: DemoMode;
  materialGroup: string;
  countertopSqft: number;
  backsplashSqft: number;
  addOns: Record<string, number>;
  useRooms: boolean;
  rooms: DemoRoomInput[];
  partnerRetailPercent: number;
};

export type DemoLineItem = {
  line_type: string;
  category: string;
  item_code: string;
  item_name: string;
  room_name: string | null;
  quantity: number;
  unit_type: string;
  unit_price: number;
  line_subtotal: number;
};

export type DemoCalculateResult = {
  usedFallback: true;
  fallbackLabel: string;
  materialGroup: string;
  estimated_sqft: number;
  retail: number;
  wholesale?: number;
  profit?: number;
  lineItems: DemoLineItem[];
  addOnsSummary: string[];
  warnings: string[];
  confidence: string;
  reviewNeeded: boolean;
};

function sumAddOns(add: Record<string, number>): { total: number; lines: DemoLineItem[]; summary: string[] } {
  const lines: DemoLineItem[] = [];
  const summary: string[] = [];
  let total = 0;
  for (const [code, qtyRaw] of Object.entries(add)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const spec = ADDONS[code];
    if (!spec) continue;
    const sub = qty * spec.price;
    total += sub;
    lines.push({
      line_type: "addon",
      category: code === "tearout" ? "tearout" : "cutout",
      item_code: code,
      item_name: spec.name,
      room_name: null,
      quantity: qty,
      unit_type: "each",
      unit_price: spec.price,
      line_subtotal: round2(sub)
    });
    summary.push(`${spec.name} × ${qty} = $${round2(sub).toFixed(2)}`);
  }
  return { total, lines, summary };
}

export function demoCalculate(input: DemoFormInput): DemoCalculateResult {
  const warnings: string[] = [];
  let wholesale = 0;
  const materialLines: DemoLineItem[] = [];

  if (input.useRooms && input.rooms.length > 0) {
    let sq = 0;
    for (const r of input.rooms) {
      const g = String(r.materialGroup || input.materialGroup || "Group Promo").trim();
      const rate = rateForGroup(g);
      const ct = Number(r.countertopSqft) || 0;
      const bs = Number(r.backsplashSqft) || 0;
      const q = ct + bs;
      sq += q;
      const sub = q * rate;
      wholesale += sub;
      if (q > 0) {
        materialLines.push({
          line_type: "material",
          category: "material_group",
          item_code: g.replace(/\s+/g, "_").toUpperCase(),
          item_name: String(r.name || "Room"),
          room_name: r.name || null,
          quantity: round2(q),
          unit_type: "per_sqft",
          unit_price: rate,
          line_subtotal: round2(sub)
        });
      }
    }
    if (sq === 0) warnings.push("Room mode selected but total square footage is zero.");
  } else {
    const g = String(input.materialGroup || "Group Promo").trim();
    const rate = rateForGroup(g);
    const ct = Number(input.countertopSqft) || 0;
    const bs = Number(input.backsplashSqft) || 0;
    const q = ct + bs;
    wholesale += q * rate;
    if (q > 0) {
      materialLines.push({
        line_type: "material",
        category: "material_group",
        item_code: g.replace(/\s+/g, "_").toUpperCase(),
        item_name: g,
        room_name: null,
        quantity: round2(q),
        unit_type: "per_sqft",
        unit_price: rate,
        line_subtotal: round2(q * rate)
      });
    }
    if (q === 0) warnings.push("Enter countertop and/or backsplash square feet, or use room mode.");
  }

  const addPart = sumAddOns(input.addOns);
  wholesale += addPart.total;

  const lineItems = [...materialLines, ...addPart.lines];
  const estimated_sqft = lineItems
    .filter((l) => l.line_type === "material")
    .reduce((s, l) => s + l.quantity, 0);

  let retail: number;
  let profit: number | undefined;
  if (input.mode === "public") {
    retail = round2(wholesale * (1 + MIN_PUBLIC_MARKUP / 100));
  } else {
    const p = Number(input.partnerRetailPercent) || 20;
    retail = round2(wholesale * (1 + p / 100));
    profit = round2(retail - wholesale);
  }

  const reviewNeeded = warnings.length > 0 || estimated_sqft <= 0;
  const confidence = reviewNeeded ? "Review needed — check inputs" : "High for demo purposes";

  return {
    usedFallback: true,
    fallbackLabel: "Demo calculation fallback — backend not connected.",
    materialGroup: input.materialGroup || "Group Promo",
    estimated_sqft: round2(estimated_sqft),
    retail,
    wholesale: input.mode === "partner" ? round2(wholesale) : undefined,
    profit,
    lineItems,
    addOnsSummary: addPart.summary.length ? addPart.summary : ["No add-ons selected"],
    warnings,
    confidence,
    reviewNeeded
  };
}
