/**
 * Custom Quote calculator — off-program / non-Elite-100 material quotes.
 *
 * Pricing uses markup/uplift over total cost basis:
 *   sellPrice = totalCostBasis × (1 + pricingUpliftPercent / 100)
 *
 * Multiplier (first-pass, for review warnings):
 *   multiplier = sellPrice / totalCostBasis
 * (Distinct from legacy “2.25×” shop targets — 25% uplift yields multiplier 1.25, not 2.25.)
 */

import {
  CUSTOM_QUOTE_MATERIAL_TYPES,
  MULTIPLIER_WARN_THRESHOLD,
  UTILIZATION_WARN_PERCENT,
  buildCustomQuotePricingConfigSnapshot,
  resolveCustomQuoteUplift,
  resolveFabricationRatePerSqft
} from "./customQuotePricingResolver.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function pickStr(...vals) {
  for (const v of vals) {
    const s = v != null ? String(v).trim() : "";
    if (s) return s;
  }
  return "";
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeCustomQuoteInput(raw) {
  const body = raw && typeof raw === "object" ? raw : {};
  const materialType = pickStr(body.materialType, body.material_type).toLowerCase();
  const pricingModeRaw = pickStr(body.pricingMode, body.pricing_mode, "retail").toLowerCase();

  return {
    colorName: pickStr(body.colorName, body.color_name),
    materialType,
    supplierName: pickStr(body.supplierName, body.supplier_name),
    slabWidth: pickNum(body.slabWidth, body.slab_width),
    slabHeight: pickNum(body.slabHeight, body.slab_height),
    slabSqft: pickNum(body.slabSqft, body.slab_sqft),
    slabQuantity: pickNum(body.slabQuantity, body.slab_quantity, 1),
    costPerSqft: pickNum(body.costPerSqft, body.cost_per_sqft),
    costPerSlab: pickNum(body.costPerSlab, body.cost_per_slab),
    freightCostToEsf: pickNum(body.freightCostToEsf, body.freight_cost_to_esf, 0),
    projectSqft: pickNum(body.projectSqft, body.project_sqft, body.sellableSqft, body.sellable_sqft),
    installCost: pickNum(body.installCost, body.install_cost, 0),
    otherCostBasis: pickNum(body.otherCostBasis, body.other_cost_basis, 0),
    pricingMode: pricingModeRaw === "wholesale" ? "wholesale" : "retail",
    customer_name: pickStr(body.customer_name, body.customerName),
    project_name: pickStr(body.project_name, body.projectName),
    city: pickStr(body.city),
    state: pickStr(body.state),
    zip: pickStr(body.zip),
    project_address: pickStr(body.project_address, body.projectAddress),
    sales_rep: pickStr(body.sales_rep, body.salesRep),
    branch: pickStr(body.branch),
    notes: pickStr(body.notes)
  };
}

/**
 * @param {Record<string, unknown>} input normalized input
 * @returns {string|null}
 */
export function validateCustomQuoteInput(input) {
  const materialType = String(input.materialType || "").toLowerCase();
  if (!materialType || !CUSTOM_QUOTE_MATERIAL_TYPES.includes(materialType)) {
    return `materialType must be one of: ${CUSTOM_QUOTE_MATERIAL_TYPES.join(", ")}`;
  }
  const qty = Number(input.slabQuantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return "slabQuantity must be a positive number";
  }
  const projectSqft = Number(input.projectSqft);
  if (!Number.isFinite(projectSqft) || projectSqft <= 0) {
    return "projectSqft (or sellableSqft) must be a positive number";
  }
  const hasSlabSqft = Number.isFinite(Number(input.slabSqft)) && Number(input.slabSqft) > 0;
  const w = Number(input.slabWidth);
  const h = Number(input.slabHeight);
  const hasDims = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
  if (!hasSlabSqft && !hasDims) {
    return "Provide slabSqft or slabWidth and slabHeight (inches)";
  }
  const costSlab = Number(input.costPerSlab);
  const costSf = Number(input.costPerSqft);
  const hasCostSlab = Number.isFinite(costSlab) && costSlab > 0;
  const hasCostSf = Number.isFinite(costSf) && costSf > 0;
  if (!hasCostSlab && !hasCostSf) {
    return "Provide costPerSlab or costPerSqft";
  }
  const freight = Number(input.freightCostToEsf);
  if (!Number.isFinite(freight) || freight < 0) {
    return "freightCostToEsf must be zero or a positive number";
  }
  return null;
}

function resolveSlabSqft(input) {
  const direct = Number(input.slabSqft);
  if (Number.isFinite(direct) && direct > 0) return round2(direct);
  const w = Number(input.slabWidth);
  const h = Number(input.slabHeight);
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
    return round2((w * h) / 144);
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} rawInput
 * @returns {Promise<Record<string, unknown>>}
 */
export async function calculateCustomQuote(rawInput) {
  const input = normalizeCustomQuoteInput(rawInput);
  const validationError = validateCustomQuoteInput(input);
  if (validationError) {
    const err = new Error(validationError);
    err.statusCode = 400;
    err.code = "custom_quote_validation";
    throw err;
  }

  const slabSqftPerSlab = resolveSlabSqft(input);
  const slabQuantity = Number(input.slabQuantity) || 1;
  const slabSqftAvailable = round2(slabSqftPerSlab * slabQuantity);
  const projectSqft = round2(Number(input.projectSqft));

  let materialCost = 0;
  const costPerSlab = Number(input.costPerSlab);
  const costPerSqft = Number(input.costPerSqft);
  if (Number.isFinite(costPerSlab) && costPerSlab > 0) {
    materialCost = round2(costPerSlab * slabQuantity);
  } else {
    materialCost = round2(costPerSqft * slabSqftAvailable);
  }

  const freightCost = round2(Math.max(0, Number(input.freightCostToEsf) || 0));
  const fabricationRatePerSqft = resolveFabricationRatePerSqft(input.materialType);
  const fabricationCost = round2(fabricationRatePerSqft * projectSqft);
  const installCost = round2(Math.max(0, Number(input.installCost) || 0));
  const otherCostBasis = round2(Math.max(0, Number(input.otherCostBasis) || 0));

  const totalCostBasis = round2(
    materialCost + freightCost + fabricationCost + installCost + otherCostBasis
  );

  const { pricingMode, pricingUpliftPercent } = resolveCustomQuoteUplift(input.pricingMode);
  const upliftFactor = 1 + pricingUpliftPercent / 100;
  const sellPrice = round2(totalCostBasis * upliftFactor);
  const profitDollars = round2(sellPrice - totalCostBasis);
  const actualGrossMarginPercent =
    sellPrice > 0 ? round2((profitDollars / sellPrice) * 100) : 0;

  /** @see docs/quote-platform/custom-quote-tool-plan.md — sellPrice / totalCostBasis */
  const multiplier = totalCostBasis > 0 ? round2(sellPrice / totalCostBasis) : 0;

  const utilizationPercent =
    slabSqftAvailable > 0 ? round2((projectSqft / slabSqftAvailable) * 100) : 0;

  /** @type {string[]} */
  const warnings = [];
  if (utilizationPercent > UTILIZATION_WARN_PERCENT) {
    warnings.push(
      `Slab utilization ${utilizationPercent}% exceeds ${UTILIZATION_WARN_PERCENT}% — review material yield before sending.`
    );
  }
  if (multiplier > 0 && multiplier < MULTIPLIER_WARN_THRESHOLD) {
    warnings.push(
      `Multiplier ${multiplier} is below ${MULTIPLIER_WARN_THRESHOLD} — review pricing before sending.`
    );
  }

  const pricingInputsSnapshot = {
    ...input,
    slabSqftPerSlab,
    slabSqftAvailable,
    fabricationRatePerSqft,
    pricingUpliftPercent,
    pricingConfig: buildCustomQuotePricingConfigSnapshot()
  };

  const calculationSnapshot = {
    materialCost,
    freightCost,
    fabricationCost,
    installCost,
    otherCostBasis,
    totalCostBasis,
    pricingMode,
    pricingUpliftPercent,
    sellPrice,
    profitDollars,
    actualGrossMarginPercent,
    multiplier,
    slabSqftAvailable,
    slabSqftPerSlab,
    projectSqft,
    utilizationPercent,
    warnings
  };

  const lineItems = buildCustomQuoteLineItems(input, calculationSnapshot, fabricationRatePerSqft);

  return {
    ok: true,
    quote_source: "custom_quote",
    input,
    ...calculationSnapshot,
    pricingInputsSnapshot,
    calculationSnapshot,
    totals: {
      retail: sellPrice,
      wholesale: totalCostBasis,
      estimated_sqft: projectSqft,
      sell_price: sellPrice,
      total_cost_basis: totalCostBasis
    },
    lineItems,
    warnings,
    snapshot: {
      quote_source: "custom_quote",
      custom_quote: {
        pricingInputsSnapshot,
        calculationSnapshot,
        pricingConfig: buildCustomQuotePricingConfigSnapshot()
      },
      totals: calculationSnapshot,
      material_breakdown: [
        {
          materialType: input.materialType,
          colorName: input.colorName,
          supplierName: input.supplierName,
          materialCost,
          slabQuantity,
          slabSqftPerSlab,
          slabSqftAvailable
        }
      ]
    }
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {Record<string, unknown>} calc
 * @param {number} fabricationRatePerSqft
 */
function buildCustomQuoteLineItems(input, calc, fabricationRatePerSqft) {
  const color = pickStr(input.colorName) || "Material";
  const supplier = pickStr(input.supplierName);
  const materialLabel = supplier ? `${color} (${supplier})` : color;

  /** @type {Record<string, unknown>[]} */
  const lines = [
    {
      line_type: "line",
      category: "material",
      item_code: "custom_material",
      item_name: materialLabel,
      quantity: Number(input.slabQuantity) || 1,
      unit_type: "slab",
      unit_price: round2(Number(calc.materialCost) / (Number(input.slabQuantity) || 1)),
      line_subtotal: calc.materialCost,
      sort_order: 0
    },
    {
      line_type: "line",
      category: "freight",
      item_code: "freight_to_esf",
      item_name: "Freight to ESF",
      quantity: 1,
      unit_type: "each",
      unit_price: calc.freightCost,
      line_subtotal: calc.freightCost,
      sort_order: 1
    },
    {
      line_type: "line",
      category: "fabrication",
      item_code: "fabrication_shop",
      item_name: `Fabrication / shop (${String(input.materialType)})`,
      quantity: calc.projectSqft,
      unit_type: "per_sqft",
      unit_price: fabricationRatePerSqft,
      line_subtotal: calc.fabricationCost,
      sort_order: 2
    }
  ];

  if (Number(calc.installCost) > 0) {
    lines.push({
      line_type: "line",
      category: "install",
      item_code: "install_labor",
      item_name: "Install / labor",
      quantity: 1,
      unit_type: "each",
      unit_price: calc.installCost,
      line_subtotal: calc.installCost,
      sort_order: 3
    });
  }
  if (Number(calc.otherCostBasis) > 0) {
    lines.push({
      line_type: "line",
      category: "other",
      item_code: "other_cost",
      item_name: "Other cost basis",
      quantity: 1,
      unit_type: "each",
      unit_price: calc.otherCostBasis,
      line_subtotal: calc.otherCostBasis,
      sort_order: 4
    });
  }

  lines.push({
    line_type: "summary",
    category: "total",
    item_code: "custom_quote_total",
    item_name: `Custom quote total (${calc.pricingMode})`,
    quantity: 1,
    unit_type: "each",
    unit_price: calc.sellPrice,
    line_subtotal: calc.sellPrice,
    sort_order: 99
  });

  return lines;
}
