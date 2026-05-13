/**
 * eliteOS Quote Calculator — testable core (no Express).
 *
 * Rules:
 * - Partner economics use DB `quote_pricing_rules` when provided; otherwise prototype mirror constants
 *   (`PROTOTYPE_TIER_PRICE_PER_SQFT` = legacy prototype $/sf, not used for public consumer material).
 * - Public consumer (`pricing_mode === public_retail`): material $/sf uses ESF **Direct** tiers
 *   (`ESF_DIRECT_PRICE_PER_SQFT`), add-ons/vanities use rule/prototype unit prices as Direct; homeowner total =
 *   Direct subtotal × `(1 + effectiveRetailMarkupPercent/100)` (minimum **25%**, from structure / `resolvePricingStructure`).
 * - Callers must not trust client-supplied totals; use returned numbers only.
 */

const MIN_PUBLIC_RETAIL_MARKUP = 25;

/** 25% public planning markup on top of Direct unit economics (material $/sf, add-ons, vanities). */
const PUBLIC_PLANNING_MARKUP_MULTIPLIER = 1.25;

/**
 * ESF Direct $/sqft by material tier (internal ESF economics).
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 * @see computePublicConsumerEstimatesByGroup, legacyDirectPublic, sumRoomsPublicPlanning
 */
export const ESF_DIRECT_PRICE_PER_SQFT = Object.freeze({
  "Group Promo": 70,
  "Group A": 77,
  "Group B": 85,
  "Group C": 95,
  "Group D": 105,
  "Group E": 120,
  "Group F": 135
});

/** Prototype v1.01 tier $/sf (Group Promo → Group F) — partner/seed mirror; not public consumer material rates. */
export const PROTOTYPE_TIER_PRICE_PER_SQFT = Object.freeze({
  "Group Promo": 45,
  "Group A": 57,
  "Group B": 65,
  "Group C": 75,
  "Group D": 85,
  "Group E": 100,
  "Group F": 115
});

/** Prototype add-on unit prices (legacy global ids). */
export const PROTOTYPE_ADDON_UNIT_PRICES = Object.freeze({
  "qty-sink": { name: "Kitchen Sink Cutouts", price: 200 },
  "qty-bar": { name: "Vanity/Bar Sink Cutouts", price: 100 },
  "qty-cook": { name: "Cooktop Cutouts", price: 150 },
  "qty-outlet": { name: "Electrical Outlet Cutouts", price: 30 },
  "qty-ss": { name: "ESF Stainless Kitchen Sink", price: 160 },
  "qty-blanco": { name: "Stock Blanco Sink", price: 450 },
  "qty-v-rect": { name: "ESF Rectangular Vanity Sink", price: 55 },
  "qty-v-oval": { name: "ESF Oval Vanity Sink", price: 35 },
  tearout: { name: "Tear Out Needed", price: 750 }
});

export const PROTOTYPE_VANITY_TIER_THRESHOLD_SQFT = 35;

/** Future: how quote measurements were produced (AI, layout, manual, …). */
export const QUOTE_INPUT_MODES = Object.freeze([
  "simple_public_preset",
  "manual_dimensions",
  "room_builder",
  "visual_layout",
  "ai_takeoff_from_plans",
  "staff_adjusted",
  "final_template"
]);

/**
 * Normalize loose client / prototype JSON into a canonical calculation input.
 * @param {Record<string, unknown>} input
 */
export function normalizePrototypeQuoteInput(input) {
  const src = input && typeof input === "object" ? input : {};
  const rawMode = String(src.quoteInputMode || src.quote_input_mode || "").trim();
  const quoteSource = String(src.quoteSource || src.quote_source || "partner_portal");
  const defaultMode = quoteSource === "public_retail" ? "simple_public_preset" : "manual_dimensions";
  const quoteInputMode = QUOTE_INPUT_MODES.includes(rawMode) ? rawMode : defaultMode;
  const basisRaw = String(src.internalMaterialBasis ?? src.internal_material_basis ?? "wholesale").toLowerCase();
  const internalMaterialBasis = basisRaw === "direct" ? "direct" : "wholesale";
  const customPassthroughItems = Array.isArray(src.customPassthroughItems)
    ? src.customPassthroughItems
    : Array.isArray(src.custom_pass_through_items)
      ? src.custom_pass_through_items
      : [];
  return {
    engine: String(src.engine || src.calculationEngine || "legacy"),
    quoteSource,
    quoteInputMode,
    estimateMode: String(src.estimateMode || src.estimate_mode || "Partner Wholesale Estimate"),
    materialGroup: String(src.materialGroup || src.selectedGroup || "Group Promo"),
    internalMaterialBasis,
    customPassthroughItems,
    areas: {
      countertopSqft: Number(src.areas?.countertopSqft ?? src.countertopSqft ?? 0) || 0,
      backsplashSqft: Number(src.areas?.backsplashSqft ?? src.backsplashSqft ?? 0) || 0
    },
    addOns: typeof src.addOns === "object" && src.addOns ? { ...src.addOns } : {},
    rooms: Array.isArray(src.rooms) ? src.rooms : [],
    retailMarkupPercent: Number(src.retailMarkupPercent ?? src.markup?.percent ?? 20) || 0,
    retailMethod: String(src.retailMethod || src.markup?.method || "Markup Percent"),
    retailFlatAdd: Number(src.retailFlatAdd ?? src.markup?.flatAdd ?? 0) || 0,
    metadata: typeof src.metadata === "object" && src.metadata ? { ...src.metadata } : {}
  };
}

/**
 * @param {Record<string, unknown>} room
 */
export function calculateRoomAreas(room) {
  const lengthIn = Number(room.lengthIn ?? room.l ?? 0) || 0;
  const depthIn = Number(room.depthIn ?? room.d ?? 0) || 0;
  const shape = String(room.shape || "rect").toLowerCase() === "tri" ? "tri" : "rect";
  let sf = (lengthIn * depthIn) / 144;
  if (shape === "tri") sf /= 2;
  return { sf, lengthIn, depthIn, shape };
}

function rulePriceForMaterialGroup(groupName, rules) {
  const g = String(groupName || "Group Promo").trim();
  const fromRules = (rules || []).find(
    (r) => String(r.category) === "material_group" && String(r.item_name || "").trim() === g
  );
  if (fromRules != null && Number(fromRules.price) >= 0) return Number(fromRules.price);
  return PROTOTYPE_TIER_PRICE_PER_SQFT[g] ?? PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"];
}

/**
 * Internal quotes: material $/sf follows Direct vs Wholesale basis (no public 25% here).
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 * @param {string} groupName
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function materialRateForQuote(input, groupName, rules) {
  if (String(input.quoteSource) === "internal_quote" && input.internalMaterialBasis === "direct") {
    return directPricePerSqftForGroup(groupName);
  }
  return rulePriceForMaterialGroup(groupName, rules);
}

/**
 * ESF Direct $/sqft for a material group (public consumer material base before × 1.25).
 * @param {string} groupName
 * @returns {number}
 */
export function directPricePerSqftForGroup(groupName) {
  const g = String(groupName || "Group Promo").trim();
  return ESF_DIRECT_PRICE_PER_SQFT[g] ?? ESF_DIRECT_PRICE_PER_SQFT["Group Promo"];
}

/**
 * Legacy-area public planning: Direct material $/sf + Direct add-ons/vanities (from rules), then × 1.25 at total via applyRetailProtection.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function legacyDirectPublic(input, rules, markupMult = PUBLIC_PLANNING_MARKUP_MULTIPLIER) {
  const g = String(input.materialGroup || "Group Promo");
  const directRate = directPricePerSqftForGroup(g);
  const mult = Number(markupMult) > 0 ? Number(markupMult) : PUBLIC_PLANNING_MARKUP_MULTIPLIER;
  const ct = Number(input.areas?.countertopSqft) || 0;
  const bs = Number(input.areas?.backsplashSqft) || 0;
  const baseMat = ct * directRate + bs * directRate;
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const vanityPart = calculateVanities(input, rules);
  const directTotal = baseMat + addOnPart.total + vanityPart.total;
  return {
    directTotal,
    /** ESF Direct subtotal before public planning % (stored as `totals.wholesale` for snapshots). */
    wholesale: directTotal,
    materialGroup: g,
    directRatePerSqft: directRate,
    /** Public planning $/sf for homeowner-facing line items (Direct × markup multiplier). */
    rate: round2(directRate * mult),
    areas: { countertopSqft: ct, backsplashSqft: bs },
    addOnPart,
    vanityPart
  };
}

/**
 * Room-engine public planning: per-room Direct $/sf, global add-ons at Direct units; total × 1.25 applied in calculateQuote.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
function sumRoomsPublicPlanning(input, rules, markupMult = PUBLIC_PLANNING_MARKUP_MULTIPLIER) {
  const mult = Number(markupMult) > 0 ? Number(markupMult) : PUBLIC_PLANNING_MARKUP_MULTIPLIER;
  let counter = 0;
  let splash = 0;
  let directMaterial = 0;
  const roomLines = [];
  for (const room of input.rooms || []) {
    const g = String(room.materialGroup || room.group || input.materialGroup || "Group Promo");
    const directR = directPricePerSqftForGroup(g);
    const publicR = round2(directR * mult);
    let roomCounter = 0;
    let roomSplash = 0;
    if (Array.isArray(room.pieces)) {
      for (const piece of room.pieces) {
        const { sf } = calculateRoomAreas(piece);
        const t = String(piece.type || "counter");
        if (t === "splash") roomSplash += sf;
        else roomCounter += sf;
      }
    } else {
      roomCounter = Number(room.countertopSqft) || 0;
      roomSplash = Number(room.backsplashSqft) || 0;
    }
    const sf = roomCounter + roomSplash;
    const dSub = sf * directR;
    const pSub = sf * publicR;
    directMaterial += dSub;
    counter += roomCounter;
    splash += roomSplash;
    roomLines.push({
      room: room.name || "Room",
      group: g,
      rate: publicR,
      directRate: directR,
      roomCounter,
      roomSplash,
      subtotal: round2(pSub),
      directSubtotal: round2(dSub)
    });
  }
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const directTotal = directMaterial + addOnPart.total;
  return {
    counter,
    splash,
    roomLines,
    addOnPart,
    directTotal,
    /** ESF Direct subtotal before public planning % (stored as `totals.wholesale` for snapshots). */
    wholesale: directTotal
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
export function calculateAddOns(input, rules) {
  const add = input?.addOns && typeof input.addOns === "object" ? input.addOns : {};
  const lines = [];
  let total = 0;
  for (const [code, qtyRaw] of Object.entries(add)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const rule = (rules || []).find((r) => String(r.item_code) === code && String(r.category) !== "material_group");
    const unit =
      rule != null && Number(rule.price) >= 0
        ? Number(rule.price)
        : code === "tearout"
          ? PROTOTYPE_ADDON_UNIT_PRICES.tearout.price
          : PROTOTYPE_ADDON_UNIT_PRICES[code]?.price ?? 0;
    const name =
      rule?.item_name ||
      (code === "tearout" ? PROTOTYPE_ADDON_UNIT_PRICES.tearout.name : PROTOTYPE_ADDON_UNIT_PRICES[code]?.name) ||
      code;
    const lineSubtotal = qty * unit;
    total += lineSubtotal;
    lines.push({ item_code: code, item_name: String(name), quantity: qty, unit_price: unit, line_subtotal: lineSubtotal });
  }
  return { total, lines };
}

/**
 * @param {Record<string, unknown>} input
 * @param {ReadonlyArray<Record<string, unknown>>} rules
 */
export function calculateVanities(input, rules) {
  const vanities = Array.isArray(input.vanities) ? input.vanities : [];
  const lines = [];
  let total = 0;
  for (const v of vanities) {
    const code = String(v.code || v.sizeCode || "").trim();
    const qty = Number(v.qty) || 0;
    if (!code || qty <= 0) continue;
    const rule = (rules || []).find((r) => String(r.category) === "vanity" && String(r.item_code) === code);
    const tier1 = Boolean(v.tier1Eligible ?? v.lowerTier);
    const unit = rule != null ? Number(tier1 ? rule.base_cost ?? rule.price : rule.price) || 0 : 0;
    const lineSubtotal = unit * qty;
    total += lineSubtotal;
    lines.push({ item_code: code, item_name: String(rule?.item_name || code), quantity: qty, unit_price: unit, line_subtotal: lineSubtotal });
  }
  return { total, lines };
}

/**
 * For `public_retail`, `wholesale` is the ESF Direct subtotal; retail = that × (1 + effectiveMarkup/100), min 25%.
 * For other modes, `wholesale` is partner wholesale economics.
 * @param {{ wholesale: number, retailMarkupPercent?: number, pricingMode?: string }} params
 */
export function applyRetailProtection({ wholesale, retailMarkupPercent = 0, pricingMode = "" }) {
  const w = Number(wholesale) || 0;
  const m = Number(retailMarkupPercent) || 0;
  if (String(pricingMode).trim() === "public_retail") {
    const eff = Math.max(m, MIN_PUBLIC_RETAIL_MARKUP);
    const retail = w * (1 + eff / 100);
    return { wholesale: w, retail, appliedMarkupPercent: eff, enforcedMin: m < MIN_PUBLIC_RETAIL_MARKUP };
  }
  const retail = w * (1 + m / 100);
  return { wholesale: w, retail, appliedMarkupPercent: m, enforcedMin: false };
}

/**
 * Partner retail display (non–public-retail): prototype-style markup methods.
 * @param {number} wholesale
 * @param {{ method?: string, percent?: number, flatAdd?: number }} settings
 */
export function applyPartnerRetailDisplay(wholesale, settings = {}) {
  const w = Number(wholesale) || 0;
  const method = String(settings.method || "Pass Through");
  const percent = Number(settings.percent) || 0;
  const flatAdd = Number(settings.flatAdd) || 0;
  let retail = w;
  if (method === "Markup Percent") retail = w * (1 + percent / 100);
  else if (method === "Margin Percent") retail = percent >= 100 ? w : w / (1 - percent / 100);
  else if (method === "Flat Dollar Add") retail = w + flatAdd;
  return { wholesale: w, retail, profit: retail - w, method, percent, flatAdd };
}

/**
 * Build measurement provenance for snapshots and audit (AI takeoff / visual layout ready).
 * @param {ReturnType<typeof normalizePrototypeQuoteInput>} input
 */
export function buildMeasurementSourceSummary(input) {
  const rooms = Array.isArray(input.rooms) ? input.rooms : [];
  return {
    quote_input_mode: input.quoteInputMode,
    engine: input.engine,
    legacy_areas:
      input.engine !== "rooms"
        ? {
            countertopSqft: input.areas.countertopSqft,
            backsplashSqft: input.areas.backsplashSqft
          }
        : null,
    rooms: rooms.map((r, idx) => ({
      index: idx,
      room_name: String(r.name || r.room_name || r.room || `Room ${idx + 1}`),
      measurement_source: r.measurementSource ?? r.measurement_source ?? null,
      takeoff_result_id: r.takeoffResultId ?? r.takeoff_result_id ?? null,
      visual_layout_id: r.visualLayoutId ?? r.visual_layout_id ?? null,
      takeoff_job_id: r.takeoffJobId ?? r.takeoff_job_id ?? null
    }))
  };
}

/**
 * Build immutable snapshot blob for `quote_headers.calculation_snapshot` / audit.
 */
export function buildCalculationSnapshot(input, resolved, totals, extras = {}) {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    quoteSource: input.quoteSource,
    quoteInputMode: input.quoteInputMode,
    estimateMode: input.estimateMode,
    pricingStructure: resolved?.structure
      ? { id: resolved.structure.id, code: resolved.structure.code, name: resolved.structure.name, pricing_mode: resolved.structure.pricing_mode }
      : { code: resolved?.fallbackCode || "PROTOTYPE", name: "Prototype mirror", pricing_mode: resolved?.fallbackMode || "partner" },
    retailMarkupPercent: resolved?.effectiveRetailMarkupPercent ?? null,
    measurement_source: extras.measurement_source ?? buildMeasurementSourceSummary(input),
    inputSummary: {
      engine: input.engine,
      materialGroup: input.materialGroup,
      internalMaterialBasis: input.internalMaterialBasis ?? null,
      customPassthroughCount: Array.isArray(input.customPassthroughItems) ? input.customPassthroughItems.length : 0,
      areas: input.areas,
      roomCount: Array.isArray(input.rooms) ? input.rooms.length : 0
    },
    totals,
    warnings: extras.warnings || [],
    ruleCount: Array.isArray(resolved?.rules) ? resolved.rules.length : 0
  };
}

function sumRoomsWholesale(input, rules) {
  let counter = 0;
  let splash = 0;
  const roomLines = [];
  for (const room of input.rooms || []) {
    const g = String(room.materialGroup || room.group || input.materialGroup || "Group Promo");
    const rate = materialRateForQuote(input, g, rules);
    let roomCounter = 0;
    let roomSplash = 0;
    if (Array.isArray(room.pieces)) {
      for (const piece of room.pieces) {
        const { sf } = calculateRoomAreas(piece);
        const t = String(piece.type || "counter");
        if (t === "splash") roomSplash += sf;
        else roomCounter += sf;
      }
    } else {
      roomCounter = Number(room.countertopSqft) || 0;
      roomSplash = Number(room.backsplashSqft) || 0;
    }
    const sub = (roomCounter + roomSplash) * rate;
    counter += roomCounter;
    splash += roomSplash;
    roomLines.push({ room: room.name || "Room", group: g, rate, roomCounter, roomSplash, subtotal: sub });
  }
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  return { counter, splash, roomLines, addOnPart, wholesale: roomLines.reduce((s, r) => s + r.subtotal, 0) + addOnPart.total };
}

function legacyWholesale(input, rules) {
  const g = String(input.materialGroup || "Group Promo");
  const rate = materialRateForQuote(input, g, rules);
  const ct = Number(input.areas?.countertopSqft) || 0;
  const bs = Number(input.areas?.backsplashSqft) || 0;
  const base = ct * rate + bs * rate;
  const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
  const vanityPart = calculateVanities(input, rules);
  return {
    wholesale: base + addOnPart.total + vanityPart.total,
    materialGroup: g,
    rate,
    areas: { countertopSqft: ct, backsplashSqft: bs },
    addOnPart,
    vanityPart
  };
}

/**
 * Resolve pricing structure + rules from Supabase-like client or use prototype mirror.
 * @param {{ quoteSource?: string, partnerAccountId?: string|null, requestedPricingStructureId?: string|null, db?: { from: Function } }} params
 */
export async function resolvePricingStructure(params) {
  const db = params?.db;
  const quoteSource = String(params?.quoteSource || "partner_portal");
  if (!db || typeof db.from !== "function") {
    const rules = prototypeMirrorRules();
    return {
      structure: {
        id: null,
        code: "PROTOTYPE_V101",
        name: "Prototype v1.01 mirror",
        pricing_mode: quoteSource === "public_retail" ? "public_retail" : "partner",
        retail_markup_percent: quoteSource === "public_retail" ? MIN_PUBLIC_RETAIL_MARKUP : 20
      },
      rules,
      effectiveRetailMarkupPercent: quoteSource === "public_retail" ? MIN_PUBLIC_RETAIL_MARKUP : 20,
      fallbackCode: "PROTOTYPE_V101",
      fallbackMode: quoteSource === "public_retail" ? "public_retail" : "partner"
    };
  }
  try {
    let structure = null;
    if (params.requestedPricingStructureId) {
      const { data, error } = await db
        .from("quote_pricing_structures")
        .select("*")
        .eq("id", params.requestedPricingStructureId)
        .limit(1);
      if (!error && data?.[0]) structure = data[0];
    }
    if (!structure && params.partnerAccountId) {
      const { data: asn } = await db
        .from("quote_partner_pricing_assignments")
        .select("pricing_structure_id")
        .eq("partner_account_id", params.partnerAccountId)
        .eq("is_active", true)
        .order("starts_at", { ascending: false })
        .limit(1);
      const sid = asn?.[0]?.pricing_structure_id;
      if (sid) {
        const { data } = await db.from("quote_pricing_structures").select("*").eq("id", sid).limit(1);
        structure = data?.[0] || null;
      }
    }
    if (!structure && quoteSource === "public_retail") {
      const { data } = await db
        .from("quote_pricing_structures")
        .select("*")
        .eq("pricing_mode", "public_retail")
        .eq("is_active", true)
        .limit(1);
      structure = data?.[0] || null;
    }
    if (!structure) {
      const rules = prototypeMirrorRules();
      return {
        structure: {
          id: null,
          code: "PROTOTYPE_V101",
          name: "Prototype v1.01 mirror (DB miss)",
          pricing_mode: quoteSource === "public_retail" ? "public_retail" : "partner",
          retail_markup_percent: MIN_PUBLIC_RETAIL_MARKUP
        },
        rules,
        effectiveRetailMarkupPercent: MIN_PUBLIC_RETAIL_MARKUP,
        fallbackCode: "PROTOTYPE_V101"
      };
    }
    const { data: rulesRows, error: rErr } = await db
      .from("quote_pricing_rules")
      .select("*")
      .eq("pricing_structure_id", structure.id)
      .eq("is_active", true);
    const rules = !rErr && Array.isArray(rulesRows) && rulesRows.length ? rulesRows : prototypeMirrorRules();
    const m = Number(structure.retail_markup_percent) || 0;
    const eff = structure.pricing_mode === "public_retail" ? Math.max(m, MIN_PUBLIC_RETAIL_MARKUP) : m;
    return { structure, rules, effectiveRetailMarkupPercent: eff };
  } catch {
    const rules = prototypeMirrorRules();
    return {
      structure: {
        id: null,
        code: "PROTOTYPE_V101",
        name: "Prototype mirror (error)",
        pricing_mode: "partner",
        retail_markup_percent: 20
      },
      rules,
      effectiveRetailMarkupPercent: 20,
      fallbackCode: "PROTOTYPE_V101"
    };
  }
}

function prototypeMirrorRules() {
  const rows = [];
  for (const [name, price] of Object.entries(PROTOTYPE_TIER_PRICE_PER_SQFT)) {
    rows.push({
      category: "material_group",
      item_code: `GROUP_${name.replace(/\s+/g, "_").toUpperCase()}`,
      item_name: name,
      unit_type: "per_sqft",
      price
    });
  }
  for (const [code, spec] of Object.entries(PROTOTYPE_ADDON_UNIT_PRICES)) {
    if (code === "tearout") {
      rows.push({ category: "tearout", item_code: "tearout", item_name: spec.name, unit_type: "flat", price: spec.price });
    } else {
      rows.push({ category: "cutout", item_code: code, item_name: spec.name, unit_type: "each", price: spec.price });
    }
  }
  return rows;
}

/**
 * Main entry: returns totals + snapshot; ignores any `input.clientTotals` if present.
 * @param {Record<string, unknown>} rawInput
 * @param {{ rules?: unknown[], structure?: Record<string,unknown>, pricing_mode?: string, db?: unknown }} pricingContext
 */
export async function calculateQuote(rawInput, pricingContext = {}) {
  const input = normalizePrototypeQuoteInput(rawInput);
  const warnings = [];
  let resolved = pricingContext;
  if (!resolved?.rules) {
    resolved = await resolvePricingStructure({
      quoteSource: input.quoteSource,
      partnerAccountId: rawInput?.partnerAccountId ?? null,
      requestedPricingStructureId: rawInput?.pricingStructureId ?? null,
      db: pricingContext?.db
    });
  }
  const rules = Array.isArray(resolved.rules) ? resolved.rules : prototypeMirrorRules();
  const mode = String(resolved.structure?.pricing_mode || "partner");
  /** For public_retail line items: `1 + effectiveRetailMarkupPercent/100` (matches `applyRetailProtection`). */
  const publicMarkupMult =
    mode === "public_retail"
      ? 1 +
        Number(resolved.effectiveRetailMarkupPercent ?? resolved.structure?.retail_markup_percent ?? MIN_PUBLIC_RETAIL_MARKUP) /
          100
      : 1;

  let wholesale = 0;
  let detail = {};
  if (mode === "public_retail") {
    if (input.engine === "rooms" && input.rooms.length) {
      const agg = sumRoomsPublicPlanning(input, rules, publicMarkupMult);
      wholesale = round2(agg.directTotal);
      detail = { kind: "rooms", ...agg, isPublicPlanning: true };
    } else {
      const leg = legacyDirectPublic(input, rules, publicMarkupMult);
      wholesale = round2(leg.directTotal);
      detail = { kind: "legacy", ...leg, isPublicPlanning: true };
    }
  } else if (input.engine === "rooms" && input.rooms.length) {
    const agg = sumRoomsWholesale(input, rules);
    wholesale = agg.wholesale;
    detail = { kind: "rooms", ...agg };
  } else {
    const leg = legacyWholesale(input, rules);
    wholesale = leg.wholesale;
    detail = { kind: "legacy", ...leg };
  }

  let retail = wholesale;
  let retailMeta = {};
  if (mode === "public_retail") {
    const m = Number(resolved.effectiveRetailMarkupPercent ?? resolved.structure?.retail_markup_percent ?? 25);
    retailMeta = applyRetailProtection({ wholesale, retailMarkupPercent: m, pricingMode: "public_retail" });
    retail = retailMeta.retail;
    if (retailMeta.enforcedMin) warnings.push(`Retail markup raised to minimum ${MIN_PUBLIC_RETAIL_MARKUP}% for public_retail.`);
  } else {
    retailMeta = applyPartnerRetailDisplay(wholesale, {
      method: input.retailMethod,
      percent: input.retailMarkupPercent,
      flatAdd: input.retailFlatAdd
    });
    retail = retailMeta.retail;
  }

  /** Internal/partner custom lines: entered $ is final for this mode (no public 25%). */
  let customPassTotal = 0;
  /** @type {Array<Record<string, unknown>>} */
  const customPassLines = [];
  if (mode !== "public_retail") {
    for (const row of input.customPassthroughItems || []) {
      const desc = String(row.description ?? row.name ?? "").trim();
      const q = Number(row.qty ?? row.quantity ?? 1) || 0;
      const p = Number(row.price ?? row.unit_price ?? 0) || 0;
      if (!desc || q <= 0 || p <= 0) continue;
      const sub = round2(q * p);
      customPassTotal += sub;
      customPassLines.push({
        line_type: "custom_pass",
        category: "custom_addon",
        item_code: "CUSTOM",
        item_name: desc,
        room_name: null,
        quantity: q,
        unit_type: "each",
        unit_price: p,
        line_subtotal: sub
      });
    }
    customPassTotal = round2(customPassTotal);
  }

  if (customPassTotal > 0) {
    wholesale = round2(wholesale + customPassTotal);
    retail = round2(retail + customPassTotal);
  }

  const totals = {
    wholesale: round2(wholesale),
    retail: round2(retail),
    profit: round2(retail - wholesale),
    estimated_sqft: round2((detail.counter || input.areas.countertopSqft) + (detail.splash || input.areas.backsplashSqft))
  };

  const lineItems = [...buildLineItems(detail, input, totals, mode, publicMarkupMult), ...customPassLines];

  const snapshot = buildCalculationSnapshot(input, resolved, totals, { warnings });
  snapshot.lineItems = lineItems;

  return {
    ok: true,
    totals,
    snapshot,
    lineItems,
    detail,
    warnings,
    pricing: {
      structureCode: resolved.structure?.code,
      pricingMode: mode,
      appliedRetailMarkupPercent: retailMeta.appliedMarkupPercent ?? null
    }
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Public-facing estimate dollars: round UP to the nearest $10 (whole dollars, no cents in homeowner UI).
 * @param {number|unknown} value
 * @returns {number}
 */
export function roundPublicEstimateToNearestTen(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

/**
 * Adds `*_display` fields for homeowner presentation. Exact `countertop` / `total` etc. unchanged.
 * @param {ReadonlyArray<Record<string, unknown>>|null|undefined} estimatesByGroup
 * @returns {Record<string, unknown>[]}
 */
export function enrichPublicConsumerEstimatesForDisplay(estimatesByGroup) {
  if (!Array.isArray(estimatesByGroup)) return [];
  return estimatesByGroup.map((r) => {
    const countertop = Number(r.countertop) || 0;
    const backsplash = Number(r.backsplash) || 0;
    const addons = Number(r.addons) || 0;
    const total = Number(r.total) || 0;
    return {
      ...r,
      countertop_display: roundPublicEstimateToNearestTen(countertop),
      backsplash_display: roundPublicEstimateToNearestTen(backsplash),
      addons_display: roundPublicEstimateToNearestTen(addons),
      total_display: roundPublicEstimateToNearestTen(total)
    };
  });
}

function buildLineItems(detail, input, totals, pricingMode = "", publicMult = 1) {
  const pubMult = pricingMode === "public_retail" ? publicMult : 1;
  const lines = [];
  if (detail.kind === "legacy") {
    const ct = detail.areas.countertopSqft;
    const bs = detail.areas.backsplashSqft;
    const qty = ct + bs;
    if (qty > 0 && detail.rate != null) {
      lines.push({
        line_type: "material",
        category: "material_group",
        item_code: String(detail.materialGroup || "").replace(/\s+/g, "_").toUpperCase(),
        item_name: String(detail.materialGroup || "Material"),
        room_name: null,
        quantity: round2(qty),
        unit_type: "per_sqft",
        unit_price: detail.rate,
        line_subtotal: round2(ct * detail.rate + bs * detail.rate)
      });
    }
    for (const ln of detail.addOnPart?.lines || []) {
      lines.push({
        line_type: "addon",
        category: "cutout",
        item_code: ln.item_code,
        item_name: ln.item_name,
        quantity: ln.quantity,
        unit_type: "each",
        unit_price: round2(ln.unit_price * pubMult),
        line_subtotal: round2(ln.line_subtotal * pubMult)
      });
    }
    for (const ln of detail.vanityPart?.lines || []) {
      lines.push({
        line_type: "vanity",
        category: "vanity",
        item_code: ln.item_code,
        item_name: ln.item_name,
        quantity: ln.quantity,
        unit_type: "each",
        unit_price: round2(ln.unit_price * pubMult),
        line_subtotal: round2(ln.line_subtotal * pubMult)
      });
    }
  } else if (detail.kind === "rooms") {
    let order = 0;
    for (const r of detail.roomLines || []) {
      lines.push({
        line_type: "material",
        category: "material_group",
        item_code: String(r.group || "").replace(/\s+/g, "_").toUpperCase(),
        item_name: String(r.room || "Room"),
        room_name: String(r.room || ""),
        quantity: round2((r.roomCounter || 0) + (r.roomSplash || 0)),
        unit_type: "per_sqft",
        unit_price: r.rate,
        line_subtotal: round2(r.subtotal),
        sort_order: order++
      });
    }
    for (const ln of detail.addOnPart?.lines || []) {
      lines.push({
        line_type: "addon",
        category: "cutout",
        item_code: ln.item_code,
        item_name: ln.item_name,
        quantity: ln.quantity,
        unit_type: "each",
        unit_price: round2(ln.unit_price * pubMult),
        line_subtotal: round2(ln.line_subtotal * pubMult)
      });
    }
  }
  return lines;
}

/** Display order for multi-tier public consumer estimates (ESF Direct tier names). */
export const PUBLIC_CONSUMER_MATERIAL_GROUPS = Object.freeze(Object.keys(ESF_DIRECT_PRICE_PER_SQFT));

/**
 * Public-safe per-group estimates: countertop / backsplash / add-ons / total per tier.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup (or structure's `retail_markup_percent` when higher).
 * Does not return internal ESF Direct-only totals to the client.
 * @param {Record<string, unknown>} rawInput
 * @param {{ db?: unknown, rules?: unknown[], structure?: Record<string,unknown> } | Record<string, unknown>} pricingContext
 */
export async function computePublicConsumerEstimatesByGroup(rawInput, pricingContext = {}) {
  const warnings = [];
  const input = normalizePrototypeQuoteInput({ ...rawInput, quoteSource: "public_retail" });
  if (input.engine === "rooms" && input.rooms?.length) {
    warnings.push(
      "Per-group public comparison for room-by-room engine is not supported yet — use legacy areas for public consumer."
    );
    return { ok: true, quote_source: "public_consumer", estimates_by_group: [], warnings, appliedRetailMarkupPercent: null };
  }

  let resolved = pricingContext;
  if (!resolved?.rules) {
    resolved = await resolvePricingStructure({
      quoteSource: "public_retail",
      partnerAccountId: null,
      requestedPricingStructureId: null,
      db: pricingContext?.db
    });
  }
  const rules = Array.isArray(resolved.rules) ? resolved.rules : prototypeMirrorRules();
  const m = Number(resolved.effectiveRetailMarkupPercent ?? resolved.structure?.retail_markup_percent ?? MIN_PUBLIC_RETAIL_MARKUP);

  const fromRules = [
    ...new Set(
      rules.filter((r) => String(r.category) === "material_group").map((r) => String(r.item_name || "").trim())
    )
  ].filter(Boolean);
  const ordered = fromRules.length
    ? PUBLIC_CONSUMER_MATERIAL_GROUPS.filter((g) => fromRules.includes(g)).concat(
        fromRules.filter((g) => !PUBLIC_CONSUMER_MATERIAL_GROUPS.includes(g))
      )
    : [...PUBLIC_CONSUMER_MATERIAL_GROUPS];

  const estimates = [];
  let appliedRetailMarkupPercent = m;
  const rateMult = 1 + m / 100;
  for (const group of ordered) {
    const directR = directPricePerSqftForGroup(group);
    const publicR = round2(directR * rateMult);
    const ct = Number(input.areas?.countertopSqft) || 0;
    const bs = Number(input.areas?.backsplashSqft) || 0;
    const countertop = round2(ct * publicR);
    const backsplash = round2(bs * publicR);
    const addOnPart = calculateAddOns({ addOns: input.addOns || {} }, rules);
    const vanityPart = calculateVanities(input, rules);
    const addDirect = (addOnPart.total || 0) + (vanityPart.total || 0);
    const addons = round2(addDirect * rateMult);
    const total = round2(countertop + backsplash + addons);
    estimates.push({ group, countertop, backsplash, addons, total });
  }

  return {
    ok: true,
    quote_source: "public_consumer",
    estimates_by_group: enrichPublicConsumerEstimatesForDisplay(estimates),
    warnings,
    appliedRetailMarkupPercent
  };
}

/**
 * Dev/sanity checks for public planning math (Direct × markup). Throws if expectations drift.
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 */
export function verifyPublicPlanningPricingSanity() {
  const rateMult = 1.25;
  const aCt = round2(10 * 77 * rateMult);
  if (aCt !== 962.5) throw new Error(`sanity A: expected countertop 962.5, got ${aCt}`);
  const sinkOnly = round2(200 * rateMult);
  if (sinkOnly !== 250) throw new Error(`sanity B: expected addons 250, got ${sinkOnly}`);
  const promoR = 70 * rateMult;
  const cTotal = round2(45 * promoR + 12 * promoR + (200 + 150) * rateMult);
  if (cTotal !== 5425) throw new Error(`sanity C: expected 5425, got ${cTotal}`);
  const enriched = enrichPublicConsumerEstimatesForDisplay([
    { group: "Group Promo", countertop: 3937.5, backsplash: 1050, addons: 437.5, total: 5425 }
  ]);
  if (enriched[0]?.total_display !== 5430) {
    throw new Error(`sanity display: expected Promo total_display 5430, got ${enriched[0]?.total_display}`);
  }
  return { ok: true };
}
