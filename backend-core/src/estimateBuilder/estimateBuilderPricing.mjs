/**
 * Estimate Builder pricing adapter.
 *
 * Estimate Item → Pricing Strategy → existing eliteOS pricing engine → Priced Item.
 *
 * Every Elite-program item is priced by sending a minimal single-item `internal_quote` probe through
 * the production `calculateQuote` engine (the same engine `POST /api/internal-quotes/calculate|save`
 * uses). Out-of-Collection countertops run through the production Custom Quote calculator.
 * This module never defines a $/sf, add-on, vanity, or tax constant.
 *
 * Line amounts (owner rule, 2026-10-06): material use tax (Internal Estimate policy percent) is added to
 * each Elite countertop / backsplash line — e.g. (60 sf × $45) × 1.02 — and every engine-priced line is
 * rounded UP to the next $5 (credits stay exact). The estimate total is the sum of those line amounts.
 * Vanity side splash already carries its use tax inside the vanity line, as `calculateVanities` does.
 * Exact engine amounts stay on each line (`exactAmount`) for audit.
 */

import { calculateQuote } from "../quotes/quoteCalculator.js";
import { calculateCustomQuote, normalizeCustomQuoteInput, validateCustomQuoteInput } from "../quotes/customQuoteCalculator.js";
import { MULTIPLIER_WARN_THRESHOLD, UTILIZATION_WARN_PERCENT } from "../quotes/customQuotePricingResolver.js";
import { resolveInternalEstimateMaterialTaxPolicy } from "../quotes/internalEstimateMaterialTaxPolicy.js";
import {
  VANITY_PROGRAM_2026_BY_CODE,
  VANITY_PROGRAM_YEAR,
  defaultVanityKitchenTier,
  priceVanityProgram2026FromPayload
} from "../quotes/vanityProgram2026.js";
import { STANDARD_VANITY_DEPTH_IN, vanitySideSplashSfPerPiece } from "../quotes/vanitySideSplash.js";
import { ESTIMATE_ITEM_TYPES, VANITY_BOWL_CODES } from "./estimateBuilderContracts.mjs";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Round a positive dollar amount up to the next $5 (cent-safe). */
export function ceilToFive(n) {
  const cents = Math.round((Number(n) || 0) * 100);
  if (cents <= 0) return round2(cents / 100);
  return Math.ceil(cents / 500) * 5;
}

/** Largest-remainder split of a $5-multiple target across rows in $5 units; rows sum exactly to the target. */
function allocateFives(exacts, target) {
  const units = Math.round(target / 5);
  const sum = exacts.reduce((a, b) => a + Math.max(0, b), 0);
  if (!exacts.length || sum <= 0 || units <= 0) return exacts.map(() => 0);
  const raw = exacts.map((e) => (Math.max(0, e) / sum) * units);
  const floors = raw.map((r) => Math.floor(r));
  let deficit = units - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  const out = floors.map((f) => f * 5);
  for (let k = 0; deficit > 0; k++, deficit--) out[order[k % order.length].i] += 5;
  return out;
}

const money = (n) =>
  `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ADDON_ENGINE_LABELS = Object.freeze({
  "qty-sink": "Undermount sink cutout",
  "qty-bar": "Vanity / bar sink cutout",
  "qty-cook": "Cooktop cutout",
  "qty-outlet": "Electrical outlet cutout",
  "qty-v-oval": "Oval vanity bowl",
  "qty-v-rect": "Rectangular vanity bowl",
  "qty-ss": "ESF stainless kitchen sink",
  "qty-blanco": "Stock Blanco sink",
  tearout: "Tear-out"
});

const VANITY_SINK_LABELS = Object.freeze({
  oval_white: "Oval white",
  oval_bisque: "Oval bisque",
  rectangular_white: "Rectangular white",
  rectangular_bisque: "Rectangular bisque"
});

/**
 * @typedef {{ code: string, severity: "block" | "warn" | "review", message: string }} ItemWarning
 * @typedef {{ label: string, value: string }} DetailRow
 */

/**
 * Material catalog index for server-side color → price group resolution (never trust a client group).
 * @param {Array<Record<string, unknown>>} colors rows from `fetchEliteProgramMaterialColors`
 */
export function indexMaterialCatalog(colors) {
  const byId = new Map();
  const byName = new Map();
  for (const c of Array.isArray(colors) ? colors : []) {
    const row = {
      id: String(c.id ?? ""),
      colorName: String(c.colorName ?? "").trim(),
      priceGroupLabel: String(c.priceGroupLabel ?? "").trim(),
      priceGroupCode: String(c.priceGroupCode ?? "").trim(),
      supplier: c.supplier != null ? String(c.supplier) : null,
      materialType: c.materialType != null ? String(c.materialType) : null
    };
    if (!row.colorName || !row.priceGroupLabel) continue;
    if (row.id) byId.set(row.id, row);
    byName.set(row.colorName.toLowerCase(), row);
  }
  return { byId, byName, size: byName.size };
}

function resolveColor(catalog, colorId, colorName) {
  if (colorId && catalog.byId.has(colorId)) return catalog.byId.get(colorId);
  const n = String(colorName || "").trim().toLowerCase();
  if (n && catalog.byName.has(n)) return catalog.byName.get(n);
  return null;
}

/** Single-item `internal_quote` probe through the production engine. */
async function probe(channel, payload) {
  return calculateQuote({
    ...payload,
    quoteSource: "internal_quote",
    internalMaterialBasis: channel
  });
}

function baseResult(item) {
  return {
    itemId: item.id,
    itemType: item.itemType,
    pricingStrategy: item.pricingStrategy,
    roomId: item.roomId,
    status: "priced",
    description: "",
    customerCategory: "",
    quantity: 0,
    unit: "ea",
    rate: 0,
    amount: 0,
    exactAmount: 0,
    useTaxAmount: 0,
    roundingAdjustment: 0,
    taxBase: { countertop: 0, backsplash: 0 },
    /** @type {ItemWarning[]} */
    warnings: [],
    /** @type {DetailRow[]} */
    details: [],
    pricingSource: { engine: "", reference: "" }
  };
}

function incomplete(res, code, message) {
  res.status = "incomplete";
  res.amount = 0;
  res.rate = 0;
  res.warnings.push({ code, severity: "block", message });
  return res;
}

/** Elite 100 material resolution for countertop/backsplash/vanity side splash. */
function eliteMaterialFor(item, ctx) {
  const inputs = item.inputs;
  if (item.itemType === "backsplash" && inputs.materialSource !== "explicit") {
    const roomTop = ctx.roomCountertopColor.get(item.roomId ?? "__project__");
    return roomTop ?? null;
  }
  return resolveColor(ctx.catalog, inputs.materialColorId, inputs.materialColorName);
}

/**
 * Elite countertop and backsplash/FHB items are priced per room and material, like production:
 * Internal Estimate rounds a room's countertop sf up once and its backsplash + FHB sf up once
 * (`chargeableCounterSqftFromExact` / `chargeableSplashSqftFromExact`). Each group is priced with one
 * production probe; the group amount is split across its items to the cent, and the rounding-up
 * remainder is carried on the group's last item.
 */
async function priceEliteAreaGroups(items, ctx) {
  /** @type {Map<string, { kind: "countertop" | "backsplash", color: any, roomKey: string, items: any[] }>} */
  const groups = new Map();
  for (const item of items) {
    const isTop = item.itemType === "countertop" && item.pricingStrategy !== "out_of_collection";
    const isSplash = item.itemType === "backsplash";
    if (!isTop && !isSplash) continue;
    const sqft = Number(item.inputs.sqft) || 0;
    const color = eliteMaterialFor(item, ctx);
    if (!color || !(sqft > 0)) continue;
    const kind = isTop ? "countertop" : "backsplash";
    const roomKey = item.roomId ?? "__project__";
    const key = `${kind}|${roomKey}|${color.id || color.colorName}`;
    if (!groups.has(key)) groups.set(key, { kind, color, roomKey, items: [] });
    groups.get(key).items.push(item);
  }

  const shares = new Map();
  await Promise.all(
    [...groups.entries()].map(async ([key, g]) => {
      const exactSf = round2(g.items.reduce((s, it) => s + Number(it.inputs.sqft), 0));
      const room = { name: "Item", roomType: "Kitchen", materialGroup: g.color.priceGroupLabel, materialColor: g.color.colorName };
      if (g.kind === "countertop") room.countertopSqft = exactSf;
      else room.backsplashSqft = exactSf;
      const calc = await probe(ctx.channel, { engine: "rooms", rooms: [room] });
      const row = calc.detail?.materialBreakdown?.[0];
      const chargeableSf = Number(row?.sqft) || 0;
      const rate = Number(row?.ratePerSqft) || 0;
      const groupAmount = round2(Number(row?.wholesaleSubtotal) || 0);
      let allocated = 0;
      g.items.forEach((it, idx) => {
        const last = idx === g.items.length - 1;
        const sf = Number(it.inputs.sqft);
        const quantity = last ? round2(chargeableSf - (exactSf - sf)) : sf;
        const amount = last ? round2(groupAmount - allocated) : round2(sf * rate);
        allocated = round2(allocated + amount);
        shares.set(it.id, {
          quantity,
          rate,
          amount,
          groupKey: key,
          carriesRounding: last,
          groupExactSf: exactSf,
          groupChargeableSf: chargeableSf,
          groupItemCount: g.items.length
        });
      });
    })
  );
  return shares;
}

function applyAreaShare(res, share) {
  res.quantity = share.quantity;
  res.rate = share.rate;
  res.amount = share.amount;
}

function areaShareDetails(share, what) {
  const roundUp = round2(share.groupChargeableSf - share.groupExactSf);
  const rows = [];
  if (share.groupItemCount > 1) {
    rows.push({
      label: "Room total",
      value: `${share.groupExactSf} sf ${what} in this room and material → ${share.groupChargeableSf} chargeable sf (rounded up once per room)`
    });
  } else {
    rows.push({ label: "Chargeable sf", value: `${share.groupChargeableSf} (rounded up to whole sf per room)` });
  }
  if (share.carriesRounding && roundUp > 0 && share.groupItemCount > 1) {
    rows.push({ label: "Room rounding", value: `+${roundUp} sf carried on this line` });
  }
  return rows;
}

async function priceEliteCountertop(item, ctx, res) {
  const { sqft } = item.inputs;
  const color = eliteMaterialFor(item, ctx);
  res.customerCategory = "Countertops";
  res.unit = "sf";
  res.pricingSource = { engine: "quoteCalculator.calculateQuote", reference: "internal_quote · rooms engine · Elite 100" };
  if (!color) {
    res.description = item.inputs.materialColorName ? `${item.inputs.materialColorName} countertop` : "Countertop";
    return incomplete(res, "missing_material", item.inputs.materialColorName
      ? `“${item.inputs.materialColorName}” is not in the active Elite 100 catalog.`
      : "Choose an Elite 100 material.");
  }
  res.description = `${color.colorName} countertop`;
  if (!(sqft > 0)) return incomplete(res, "missing_sqft", "Enter countertop square footage.");
  const share = ctx.areaShares.get(item.id);
  if (!share) return incomplete(res, "area_unpriced", "Countertop could not be priced.");
  applyAreaShare(res, share);
  res.taxBase.countertop = res.amount;
  res.details.push(
    { label: "Price group", value: color.priceGroupLabel },
    { label: "Pricing channel", value: ctx.channel === "direct" ? "Direct" : "Wholesale" },
    { label: "Rate", value: `${money(res.rate)} / sf` },
    { label: "Entered sf", value: String(sqft) },
    ...areaShareDetails(share, "countertop")
  );
  return res;
}

async function priceOutOfCollectionCountertop(item, ctx, res) {
  const i = item.inputs;
  res.customerCategory = "Countertops";
  res.unit = "sf";
  res.description = i.materialName ? `${i.materialName} countertop` : "Out-of-collection countertop";
  res.pricingSource = { engine: "customQuoteCalculator.calculateCustomQuote", reference: "Custom Quote slab-cost pricing" };
  const pricingMode = ctx.channel === "direct" ? "retail" : "wholesale";
  const raw = {
    materialType: i.materialType,
    colorName: i.materialName,
    supplierName: i.supplier,
    slabWidth: i.slabWidthIn,
    slabHeight: i.slabHeightIn,
    slabSqft: i.slabSqftOverride,
    slabQuantity: i.slabQuantity,
    materialCostInputType: i.materialCostInputType,
    costPerSlab: i.costPerSlab,
    costPerSqft: i.costPerSqft,
    freightCostToEsf: i.freight,
    wasteFactor: i.wasteFactor,
    installCost: i.installCost,
    otherCostBasis: i.otherCost,
    projectSqft: i.sqft,
    pricingMode
  };
  if (!i.materialName) return incomplete(res, "missing_material", "Enter the material name.");
  const validation = validateCustomQuoteInput(normalizeCustomQuoteInput(raw));
  if (validation) return incomplete(res, "custom_quote_validation", validation);
  const calc = await calculateCustomQuote(raw);
  res.quantity = Number(calc.projectSqft) || 0;
  res.amount = round2(calc.sellPrice);
  res.rate = res.quantity > 0 ? round2(res.amount / res.quantity) : 0;
  for (const message of calc.warnings || []) {
    const isMultiplier = /^Multiplier /.test(String(message));
    res.warnings.push({
      code: isMultiplier ? "multiplier_below_threshold" : "slab_yield",
      severity: isMultiplier ? "review" : "warn",
      message: String(message)
    });
  }
  res.details.push(
    { label: "Material type", value: String(calc.input?.materialType || "") },
    { label: "Supplier", value: i.supplier || "—" },
    { label: "Usable sf / slab", value: String(calc.usableSlabSqftPerSlab) },
    { label: "Waste factor", value: String(calc.wasteFactor) },
    { label: "Slabs required / priced", value: `${calc.slabsRequired} / ${calc.pricedSlabQuantity}` },
    { label: "Utilization", value: `${calc.utilizationPercent}% (warn ≥ ${UTILIZATION_WARN_PERCENT}%)` },
    { label: "Material cost", value: money(calc.materialCost) },
    { label: "Freight", value: money(calc.freightCost) },
    { label: "Fabrication", value: `${money(calc.fabricationCost)} (${money(calc.fabricationInstallShopRate)} / sf)` },
    { label: "Total cost basis", value: money(calc.totalCostBasis) },
    { label: "Uplift", value: `${calc.pricingUpliftPercent}% (${pricingMode})` },
    { label: "Multiplier", value: `${calc.multiplier} (review < ${MULTIPLIER_WARN_THRESHOLD})` },
    { label: "Material use tax", value: "Not applied — Custom Quote pricing policy" }
  );
  return res;
}

async function priceBacksplash(item, ctx, res) {
  const { sqft } = item.inputs;
  const isFhb = item.pricingStrategy === "full_height";
  const label = isFhb ? "Full height backsplash" : "Standard backsplash";
  res.customerCategory = isFhb ? "Full height backsplash" : "Backsplash";
  res.unit = "sf";
  res.description = label;
  res.pricingSource = { engine: "quoteCalculator.calculateQuote", reference: `internal_quote · rooms engine · ${isFhb ? "FHB" : "backsplash"} material` };
  const color = eliteMaterialFor(item, ctx);
  if (!color) {
    return incomplete(
      res,
      "missing_material",
      item.inputs.materialSource === "explicit"
        ? "Choose an Elite 100 material for this backsplash."
        : "No Elite 100 countertop in this room to match — pick a material."
    );
  }
  res.description = `${label} — ${color.colorName}`;
  if (!(sqft > 0)) return incomplete(res, "missing_sqft", "Enter backsplash square footage.");
  const share = ctx.areaShares.get(item.id);
  if (!share) return incomplete(res, "area_unpriced", "Backsplash could not be priced.");
  applyAreaShare(res, share);
  res.taxBase.backsplash = res.amount;
  res.details.push(
    { label: "Material", value: `${color.colorName} (${item.inputs.materialSource === "explicit" ? "selected" : "matches room countertop"})` },
    { label: "Price group", value: color.priceGroupLabel },
    { label: "Rate", value: `${money(res.rate)} / sf` },
    { label: "Entered sf", value: String(sqft) },
    ...areaShareDetails(share, "backsplash / full-height backsplash")
  );
  return res;
}

async function priceVanity(item, ctx, res) {
  const i = item.inputs;
  const row = VANITY_PROGRAM_2026_BY_CODE[i.sizeCode];
  res.customerCategory = "Vanity tops";
  res.unit = "ea";
  res.pricingSource = { engine: "quoteCalculator.calculateQuote", reference: `internal_quote · Vanity Program ${VANITY_PROGRAM_YEAR}` };
  if (!row) {
    res.description = "Vanity";
    return incomplete(res, "missing_vanity_size", "Choose a Vanity Program size.");
  }
  const color = resolveColor(ctx.catalog, i.materialColorId, i.materialColorName);
  const materialGroup = color?.priceGroupLabel || "Group Promo";
  const autoTier = defaultVanityKitchenTier(ctx.qualifyingKitchenCounterSf);
  const tier = i.tierOverride || autoTier;
  if (i.tierOverride && i.tierOverride !== autoTier && !i.tierOverrideReason) {
    res.warnings.push({ code: "tier_override_reason", severity: "warn", message: "Tier override needs an internal reason." });
  }
  res.description = color ? `${row.label} — ${color.colorName}` : row.label;
  const depthIn = i.depthIn > 0 ? i.depthIn : STANDARD_VANITY_DEPTH_IN;
  const calc = await probe(ctx.channel, {
    engine: "legacy",
    vanities: [
      {
        code: i.sizeCode,
        qty: i.qty,
        programYear: VANITY_PROGRAM_YEAR,
        tier,
        sinkType: i.sinkType,
        extraTrips: i.extraTrips,
        materialGroup,
        vanity: { sideSplashQty: i.sideSplashQty, depth: depthIn }
      }
    ]
  });
  const lines = calc.detail?.vanityPart?.lines ?? [];
  const programLine = lines.find((l) => l.vanity_program);
  if (!programLine) return incomplete(res, "vanity_unpriced", "Vanity Program could not price this size.");
  const program = programLine.vanity_program;
  const splashLine = lines.find((l) => l.item_code === "SIDE_SPLASH");
  const sideSplashTotal = round2(Number(splashLine?.line_subtotal) || 0);
  const sideSplashSf = i.sideSplashQty > 0 ? round2(vanitySideSplashSfPerPiece(depthIn, true) * i.sideSplashQty) : 0;
  res.quantity = i.qty;
  res.amount = round2(Number(program.exactTotal) + sideSplashTotal);
  res.rate = round2(res.amount / Math.max(1, i.qty));
  res.details.push(
    { label: "Program", value: `Vanity Program ${VANITY_PROGRAM_YEAR} · ${row.bowlCount === 2 ? "double" : "single"} bowl` },
    {
      label: "Tier",
      value: `${tier === "kitchen_over_35" ? "Kitchen ≥ 35 sf" : "Kitchen < 35 sf"}${i.tierOverride ? " (override)" : ` (auto — ${ctx.qualifyingKitchenCounterSf} qualifying countertop sf)`}`
    },
    { label: "Base per vanity", value: money(program.baseUnit) },
    { label: "Sink", value: `${VANITY_SINK_LABELS[i.sinkType] ?? i.sinkType}${program.sinkUpgradeTotal ? ` (+${money(program.sinkUpgradeTotal)} upgrade)` : ""}` },
    { label: "Extra trips", value: program.extraTripsTotal ? `${i.extraTrips} · ${money(program.extraTripsTotal)}` : "None" },
    { label: "Side splash", value: i.sideSplashQty ? `${i.sideSplashQty} · ${sideSplashSf} sf @ ${materialGroup} · ${money(sideSplashTotal)} incl. use tax` : "None" },
    { label: "Material use tax", value: i.sideSplashQty ? "Included in the side splash line, as production prices it (program price is tax-exempt)" : "Not applied (Vanity Program)" }
  );
  if (!color) res.details.push({ label: "Material", value: "Not selected — side splash priced at Group Promo" });
  return res;
}

async function priceAddon(item, ctx, res, code, qty) {
  res.customerCategory = "Sinks & cutouts";
  res.unit = "ea";
  res.description = ADDON_ENGINE_LABELS[code] ?? code;
  res.pricingSource = { engine: "quoteCalculator.calculateQuote", reference: `internal_quote · add-on ${code}` };
  if (!(qty > 0)) return incomplete(res, "missing_qty", "Enter a quantity.");
  const calc = await probe(ctx.channel, { engine: "legacy", addOns: { [code]: qty } });
  const line = calc.detail?.addOnPart?.lines?.[0];
  res.quantity = qty;
  res.rate = Number(line?.unit_price) || 0;
  res.amount = round2(Number(line?.line_subtotal) || 0);
  res.details.push(
    { label: "Production item", value: String(line?.item_name ?? code) },
    { label: "Unit price", value: money(res.rate) },
    { label: "Material use tax", value: "Not applied (add-on)" }
  );
  if (code !== "qty-outlet" && VANITY_BOWL_CODES.includes(code) && ctx.roomsWithVanityProgram.has(item.roomId ?? "__project__")) {
    res.warnings.push({
      code: "vanity_program_includes_bowls",
      severity: "warn",
      message: "This room has a Vanity Program top, which already includes its bowls. Confirm this is an extra charge."
    });
  }
  return res;
}

async function priceEdge(item, ctx, res) {
  const i = item.inputs;
  res.customerCategory = "Edge upgrades";
  res.pricingSource = { engine: "quoteCalculator.calculateQuote", reference: `internal_quote · edge v2 (${i.edgeMode})` };
  const room = { name: "Item", countertopSqft: 0, edgeMode: i.edgeMode };
  if (i.edgeMode === "upgraded") {
    res.description = i.profile ? `${i.profile} edge` : "Upgraded edge";
    res.unit = "lf";
    if (!i.profile) return incomplete(res, "missing_profile", "Choose an edge profile.");
    if (!(i.linearFeet > 0)) return incomplete(res, "missing_lf", "Enter linear feet.");
    Object.assign(room, { edgeProfileV2: i.profile, edgeLinearFeet: i.linearFeet });
  } else if (i.edgeMode === "mitered") {
    res.description = "Mitered edge";
    res.unit = "lf";
    if (!i.miterHeight) return incomplete(res, "missing_miter_height", "Choose a miter height.");
    if (!(i.linearFeet > 0)) return incomplete(res, "missing_lf", "Enter linear feet.");
    Object.assign(room, {
      miterHeight: i.miterHeight,
      edgeLinearFeet: i.linearFeet,
      buildUpRequired: i.buildUpSqft > 0,
      buildUpSqft: i.buildUpSqft || 0
    });
  } else {
    res.description = i.customerLabel || "Custom edge profile";
    res.unit = "ea";
    if (!(i.manualAmount > 0)) return incomplete(res, "missing_amount", "Enter the edge amount.");
    if (!i.manualReason) return incomplete(res, "missing_reason", "Manual edge pricing needs an internal reason.");
    Object.assign(room, { manualEdgeAmount: i.manualAmount, manualEdgeReason: i.manualReason, manualEdgeCustomerLabel: i.customerLabel });
  }
  const calc = await probe(ctx.channel, { engine: "rooms", rooms: [room] });
  const part = calc.detail?.upgradedEdgePart;
  for (const w of part?.warnings ?? []) res.warnings.push({ code: "edge_engine", severity: "block", message: String(w).replace(/^Room "Item": /, "") });
  if (!part?.lines?.length) return incomplete(res, "edge_unpriced", res.warnings[0]?.message || "Edge could not be priced.");
  const main = part.lines[0];
  res.quantity = Number(main.quantity) || 0;
  res.rate = Number(main.unit_price) || 0;
  res.amount = round2(part.total);
  if (main.edge_mode === "mitered") res.description = `${String(main.item_name).replace(/ — Item$/, "")}`;
  for (const ln of part.lines) {
    res.details.push({ label: String(ln.item_name).replace(/ — Item$/, ""), value: `${ln.quantity} × ${money(ln.unit_price)} = ${money(ln.line_subtotal)}` });
  }
  res.details.push({ label: "Pricing channel", value: ctx.channel === "direct" ? "Direct" : "Wholesale" });
  return res;
}

async function priceService(item, ctx, res) {
  const { serviceCode, qty } = item.inputs;
  res.customerCategory = "Services";
  res.unit = "ea";
  if (serviceCode === "tear_out") {
    const r = await priceAddon(item, ctx, res, "tearout", qty);
    r.customerCategory = "Services";
    return r;
  }
  res.description = "Additional trip";
  res.pricingSource = { engine: "vanityProgram2026.priceVanityProgram2026FromPayload", reference: "Vanity Program extra-trip rate" };
  if (!(qty > 0)) return incomplete(res, "missing_qty", "Enter a quantity.");
  const anyCode = Object.keys(VANITY_PROGRAM_2026_BY_CODE)[0];
  const priced = priceVanityProgram2026FromPayload({ code: anyCode, qty: 1, tier: "kitchen_over_35", extraTrips: qty }, 0);
  res.quantity = qty;
  res.amount = round2(priced?.extraTripsTotal);
  res.rate = round2(res.amount / qty);
  res.details.push(
    { label: "Rate source", value: "Vanity Program extra-trip rate (the only production trip rate)" },
    { label: "Unit price", value: money(res.rate) }
  );
  return res;
}

async function priceCustom(item, ctx, res) {
  const i = item.inputs;
  const isCredit = i.category === "credit";
  res.customerCategory = isCredit ? "Credits" : "Additional items";
  res.unit = i.unit || "ea";
  res.description = i.description || "Custom item";
  res.pricingSource = { engine: "quoteCalculator.calculateQuote", reference: "internal_quote · customLineItems" };
  if (!i.description) return incomplete(res, "missing_description", "Enter a description.");
  if (!(Number(i.qty) > 0)) return incomplete(res, "missing_qty", "Enter a quantity.");
  if (i.unitPrice == null || Number(i.unitPrice) === 0) return incomplete(res, "missing_rate", "Enter a rate.");
  const unitPrice = isCredit ? -Math.abs(Number(i.unitPrice)) : Number(i.unitPrice);
  const calc = await probe(ctx.channel, {
    engine: "legacy",
    customLineItems: [
      {
        lineKey: item.id,
        name: i.description,
        category: isCredit ? "Discount/Credit" : "Other",
        quantity: Number(i.qty),
        unitPrice
      }
    ]
  });
  for (const w of calc.warnings ?? []) res.warnings.push({ code: "custom_line", severity: "block", message: String(w) });
  const validated = calc.snapshot?.custom_line_items?.[0];
  if (!validated) return incomplete(res, "custom_unpriced", res.warnings[0]?.message || "Custom item could not be priced.");
  res.quantity = Number(validated.quantity);
  res.rate = Number(validated.unitPrice);
  res.amount = round2(validated.line_total);
  if (!i.customerFacing) res.details.push({ label: "Customer display", value: "Internal only — folded into totals" });
  if (i.internalNote) res.details.push({ label: "Internal note", value: i.internalNote });
  return res;
}

/**
 * Price one item. Returns a priced/incomplete result; never throws for user-input problems.
 * @param {ReturnType<import("./estimateBuilderContracts.mjs").normalizeEstimateItem>} item
 * @param {object} ctx
 */
export async function priceEstimateItem(item, ctx) {
  const res = baseResult(item);
  try {
    switch (item.itemType) {
      case "countertop":
        return item.pricingStrategy === "out_of_collection"
          ? await priceOutOfCollectionCountertop(item, ctx, res)
          : await priceEliteCountertop(item, ctx, res);
      case "backsplash":
        return await priceBacksplash(item, ctx, res);
      case "vanity":
        return await priceVanity(item, ctx, res);
      case "cutout":
        return await priceAddon(item, ctx, res, item.inputs.cutoutCode, item.inputs.qty);
      case "outlet":
        return await priceAddon(item, ctx, res, "qty-outlet", item.inputs.qty);
      case "edge":
        return await priceEdge(item, ctx, res);
      case "service":
        return await priceService(item, ctx, res);
      case "custom":
        return await priceCustom(item, ctx, res);
      case "note":
        res.status = "note";
        res.description = item.inputs.text || "";
        res.unit = "";
        res.pricingSource = { engine: "", reference: "Description-only line" };
        return res;
      default:
        return incomplete(res, "unsupported_item", `Unsupported item type ${item.itemType}.`);
    }
  } catch (e) {
    res.status = "error";
    res.amount = 0;
    res.warnings.push({ code: "pricing_error", severity: "block", message: String(e?.message || e) });
    return res;
  }
}

/**
 * Final line amounts. `amount` on entry is the exact engine amount; on exit it is the quoted line amount:
 * exact + material use tax (Elite countertop/backsplash only), rounded up to the next $5. Several items in
 * one room + material share a single round-up (the group total is rounded once and split in $5 units).
 * Credits (negative lines) stay exact. Mutates `items`.
 */
export function applyLineAmounts(items, areaShares, useTaxPercent) {
  const pct = Number(useTaxPercent) || 0;
  const groups = new Map();
  for (const r of items) {
    r.exactAmount = round2(r.amount);
    r.useTaxAmount = 0;
    r.roundingAdjustment = 0;
    if (r.status !== "priced") continue;
    const taxable = round2(r.taxBase.countertop + r.taxBase.backsplash);
    r.useTaxAmount = taxable > 0 ? round2((taxable * pct) / 100) : 0;
    const withTax = round2(r.exactAmount + r.useTaxAmount);
    const share = areaShares.get(r.itemId);
    if (share && share.groupItemCount > 1) {
      if (!groups.has(share.groupKey)) groups.set(share.groupKey, []);
      groups.get(share.groupKey).push({ r, withTax });
      continue;
    } else {
      r.amount = ceilToFive(withTax);
    }
    r.roundingAdjustment = round2(r.amount - withTax);
  }
  for (const members of groups.values()) {
    const target = ceilToFive(members.reduce((s, m) => s + m.withTax, 0));
    const split = allocateFives(members.map((m) => m.withTax), target);
    members.forEach((m, idx) => {
      m.r.amount = split[idx];
      m.r.roundingAdjustment = round2(m.r.amount - m.withTax);
    });
  }
  for (const r of items) {
    if (r.status !== "priced") continue;
    if (r.useTaxAmount > 0) r.details.push({ label: "Material use tax", value: `${pct}% added to this line · ${money(r.useTaxAmount)}` });
    if (r.amount > 0) r.details.push({ label: "Line amount", value: `${money(r.exactAmount + r.useTaxAmount)} → ${money(r.amount)} (rounded up to the next $5)` });
  }
  return items;
}

/**
 * Price a normalized estimate document.
 * @param {ReturnType<import("./estimateBuilderContracts.mjs").normalizeEstimateDocument>} doc
 * @param {{ materialColors: Array<Record<string, unknown>> }} deps
 */
export async function priceEstimateDocument(doc, deps) {
  const catalog = indexMaterialCatalog(deps.materialColors);
  const channel = doc.pricingChannel === "wholesale" ? "wholesale" : "direct";

  const roomCountertopColor = new Map();
  const roomsWithVanityProgram = new Set();
  for (const it of doc.items) {
    const roomKey = it.roomId ?? "__project__";
    if (it.itemType === "countertop" && it.pricingStrategy === "elite_100" && !roomCountertopColor.has(roomKey)) {
      const c = resolveColor(catalog, it.inputs.materialColorId, it.inputs.materialColorName);
      if (c) roomCountertopColor.set(roomKey, c);
    }
    if (it.itemType === "vanity") roomsWithVanityProgram.add(roomKey);
  }
  // Production (`qualifyingKitchenCounterSfFromInput`): exact countertop sf of every room except Vanity Program rooms.
  let qualifyingKitchenCounterSf = 0;
  for (const it of doc.items) {
    if (it.itemType !== "countertop") continue;
    if (it.roomId && roomsWithVanityProgram.has(it.roomId)) continue;
    qualifyingKitchenCounterSf += Number(it.inputs.sqft) || 0;
  }
  qualifyingKitchenCounterSf = round2(qualifyingKitchenCounterSf);

  const ctx = { catalog, channel, roomCountertopColor, roomsWithVanityProgram, qualifyingKitchenCounterSf, areaShares: new Map() };
  ctx.areaShares = await priceEliteAreaGroups(doc.items, ctx);
  const items = await Promise.all(doc.items.map((it) => priceEstimateItem(it, ctx)));

  const policy = resolveInternalEstimateMaterialTaxPolicy();
  applyLineAmounts(items, ctx.areaShares, policy.materialUseTaxPercent);

  const priced = items.filter((r) => r.status === "priced");
  const subtotal = round2(priced.reduce((s, r) => s + r.exactAmount, 0));
  const sumOf = (pick) => round2(priced.reduce((s, r) => s + pick(r), 0));
  const ctBase = sumOf((r) => r.taxBase.countertop);
  const bsBase = sumOf((r) => r.taxBase.backsplash);
  const ctTax = sumOf((r) => (r.taxBase.countertop > 0 ? r.useTaxAmount : 0));
  const bsTax = sumOf((r) => (r.taxBase.backsplash > 0 ? r.useTaxAmount : 0));
  const useTaxAmount = round2(ctTax + bsTax);
  const exactTotal = round2(subtotal + useTaxAmount);
  const total = sumOf((r) => r.amount);

  const pricedItems = items.filter((r) => r.status !== "note");
  const blockers = [];
  if (!pricedItems.length) blockers.push("Add at least one priced item.");
  const blocked = pricedItems.filter((r) => r.status !== "priced");
  if (blocked.length) blockers.push(`${blocked.length} item${blocked.length === 1 ? "" : "s"} still need${blocked.length === 1 ? "s" : ""} information.`);
  if (!doc.header.customerName && !doc.header.accountName) blockers.push("Add a customer.");

  for (const r of pricedItems) {
    const def = ESTIMATE_ITEM_TYPES[r.itemType];
    r.accounting = {
      item: def?.accountingItem ?? "Custom",
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      rate: r.rate,
      amount: r.amount
    };
  }

  return {
    ok: true,
    pricingChannel: channel,
    items,
    totals: {
      subtotal,
      useTax: {
        percent: policy.materialUseTaxPercent,
        scope: policy.materialUseTaxScope,
        appliedTo: "material_lines",
        countertopBase: ctBase,
        backsplashBase: bsBase,
        countertopAmount: ctTax,
        backsplashAmount: bsTax,
        amount: useTaxAmount
      },
      exactTotal,
      roundingAdjustment: round2(total - exactTotal),
      total,
      qualifyingKitchenCounterSf,
      itemCount: pricedItems.length,
      pricedCount: priced.length,
      noteCount: items.length - pricedItems.length
    },
    readiness: { ready: blockers.length === 0, blockers },
    catalogSize: catalog.size
  };
}
