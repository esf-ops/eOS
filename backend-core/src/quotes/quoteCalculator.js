/**
 * eliteOS Quote Calculator — testable core (no Express).
 *
 * Rules:
 * - Public retail (`pricing_mode === public_retail`) enforces minimum 25% markup over wholesale.
 * - Partner/wholesale economics use DB `quote_pricing_rules` when provided; otherwise prototype mirror constants.
 * - Callers must not trust client-supplied totals; use returned numbers only.
 */

const MIN_PUBLIC_RETAIL_MARKUP = 25;

/** Prototype v1.01 tier $/sf (Group Promo → Group F) — seed into DB in production. */
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
  return {
    engine: String(src.engine || src.calculationEngine || "legacy"),
    quoteSource,
    quoteInputMode,
    estimateMode: String(src.estimateMode || src.estimate_mode || "Partner Wholesale Estimate"),
    materialGroup: String(src.materialGroup || src.selectedGroup || "Group Promo"),
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
 * Apply minimum public retail markup over wholesale partner economics.
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
    const rate = rulePriceForMaterialGroup(g, rules);
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
  const rate = rulePriceForMaterialGroup(g, rules);
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

  let wholesale = 0;
  let detail = {};
  if (input.engine === "rooms" && input.rooms.length) {
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

  const totals = {
    wholesale: round2(wholesale),
    retail: round2(retail),
    profit: round2(retail - wholesale),
    estimated_sqft: round2((detail.counter || input.areas.countertopSqft) + (detail.splash || input.areas.backsplashSqft))
  };

  const lineItems = buildLineItems(detail, input, totals);

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

function buildLineItems(detail, input, totals) {
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
        unit_price: ln.unit_price,
        line_subtotal: ln.line_subtotal
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
        unit_price: ln.unit_price,
        line_subtotal: ln.line_subtotal
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
        unit_price: ln.unit_price,
        line_subtotal: ln.line_subtotal
      });
    }
  }
  return lines;
}
