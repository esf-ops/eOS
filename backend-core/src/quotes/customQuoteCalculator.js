/**
 * Custom Quote calculator — off-program / non-Elite-100 material quotes.
 *
 * Two distinct square footage concepts drive the math:
 *  - projectSqft: actual measured project scope (rooms/shapes or manual fallback).
 *    Drives fabrication/install/shop cost — the labor ESF performs.
 *  - slab/yield sqft: net usable area per slab after edge trim, used to determine
 *    how many slabs ESF must buy to cover the (waste-adjusted) project.
 *
 * Material/freight follow slab coverage; fabrication follows projectSqft. Never
 * multiply every cost by the same sqft.
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
  DEFAULT_WASTE_FACTOR,
  MULTIPLIER_WARN_THRESHOLD,
  SLAB_EDGE_TRIM_INCHES,
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

  const costPerSlabNum = pickNum(body.costPerSlab, body.cost_per_slab);
  const costPerSqftNum = pickNum(body.costPerSqft, body.cost_per_sqft);
  const inputTypeRaw = pickStr(body.materialCostInputType, body.material_cost_input_type).toLowerCase();
  let materialCostInputType;
  if (inputTypeRaw === "per_slab" || inputTypeRaw === "per_sqft") {
    materialCostInputType = inputTypeRaw;
  } else if (Number.isFinite(costPerSlabNum) && costPerSlabNum > 0) {
    materialCostInputType = "per_slab";
  } else {
    materialCostInputType = "per_sqft";
  }

  const wasteFactorNum = pickNum(body.wasteFactor, body.waste_factor);

  return {
    colorName: pickStr(body.colorName, body.color_name),
    materialType,
    supplierName: pickStr(body.supplierName, body.supplier_name),
    slabWidth: pickNum(body.slabWidth, body.slab_width),
    slabHeight: pickNum(body.slabHeight, body.slab_height),
    slabSqft: pickNum(body.slabSqft, body.slab_sqft),
    slabQuantity: pickNum(body.slabQuantity, body.slab_quantity, 1),
    costPerSqft: costPerSqftNum,
    costPerSlab: costPerSlabNum,
    materialCostInputType,
    wasteFactor: Number.isFinite(wasteFactorNum) && wasteFactorNum > 0 ? wasteFactorNum : DEFAULT_WASTE_FACTOR,
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
  // When dimensions (not an override) are used, the net usable slab — after the
  // edge trim deduction — must be a positive area or yield math divides by zero.
  if (!hasSlabSqft && hasDims) {
    const netW = w - SLAB_EDGE_TRIM_INCHES;
    const netH = h - SLAB_EDGE_TRIM_INCHES;
    if (netW <= 0 || netH <= 0) {
      return `Slab width and height must each exceed ${SLAB_EDGE_TRIM_INCHES}" edge trim`;
    }
  }
  const costSlab = Number(input.costPerSlab);
  const costSf = Number(input.costPerSqft);
  const hasCostSlab = Number.isFinite(costSlab) && costSlab > 0;
  const hasCostSf = Number.isFinite(costSf) && costSf > 0;
  if (input.materialCostInputType === "per_slab") {
    if (!hasCostSlab) return "Provide costPerSlab for the per-slab cost input mode";
  } else if (input.materialCostInputType === "per_sqft") {
    if (!hasCostSf) return "Provide costPerSqft for the per-square-foot cost input mode";
  } else if (!hasCostSlab && !hasCostSf) {
    return "Provide costPerSlab or costPerSqft";
  }
  const freight = Number(input.freightCostToEsf);
  if (!Number.isFinite(freight) || freight < 0) {
    return "freightCostToEsf must be zero or a positive number";
  }
  return null;
}

/**
 * Net usable square footage for a single slab.
 *
 * If a `slabSqft` override is supplied it is treated as the usable area directly
 * (the estimator has already accounted for trim). Otherwise the gross dimensions
 * are reduced by the edge trim on each side before converting to square feet.
 *
 * @param {Record<string, unknown>} input normalized input
 * @returns {{ usableSlabSqftPerSlab: number, netSlabWidthInches: number|null, netSlabHeightInches: number|null }}
 */
function resolveUsableSlabSqft(input) {
  const direct = Number(input.slabSqft);
  if (Number.isFinite(direct) && direct > 0) {
    return {
      usableSlabSqftPerSlab: round2(direct),
      netSlabWidthInches: null,
      netSlabHeightInches: null
    };
  }
  const w = Number(input.slabWidth);
  const h = Number(input.slabHeight);
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
    const netW = round2(w - SLAB_EDGE_TRIM_INCHES);
    const netH = round2(h - SLAB_EDGE_TRIM_INCHES);
    if (netW <= 0 || netH <= 0) {
      return { usableSlabSqftPerSlab: 0, netSlabWidthInches: netW, netSlabHeightInches: netH };
    }
    return {
      usableSlabSqftPerSlab: round2((netW * netH) / 144),
      netSlabWidthInches: netW,
      netSlabHeightInches: netH
    };
  }
  return { usableSlabSqftPerSlab: 0, netSlabWidthInches: null, netSlabHeightInches: null };
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

  const { usableSlabSqftPerSlab, netSlabWidthInches, netSlabHeightInches } =
    resolveUsableSlabSqft(input);
  const enteredSlabQuantity = Number(input.slabQuantity) || 1;
  const enteredAvailableSlabSqft = round2(usableSlabSqftPerSlab * enteredSlabQuantity);
  const projectSqft = round2(Number(input.projectSqft));

  // Waste/yield: inflate measured scope, then size the order against net slab area.
  const wasteFactor = Number(input.wasteFactor) || DEFAULT_WASTE_FACTOR;
  const wasteAdjustedProjectSqft = round2(projectSqft * wasteFactor);
  const slabsRequired =
    usableSlabSqftPerSlab > 0 ? Math.ceil(wasteAdjustedProjectSqft / usableSlabSqftPerSlab) : 0;
  // Never undercharge: price at least as many slabs as the project requires.
  const pricedSlabQuantity = Math.max(enteredSlabQuantity, slabsRequired);
  const estimatedAdditionalSlabsNeeded = Math.max(0, slabsRequired - enteredSlabQuantity);

  // Material/freight follow slab coverage (pricedSlabQuantity), not projectSqft.
  const materialCostInputType = input.materialCostInputType;
  const costPerSlab = Number(input.costPerSlab);
  const costPerSqft = Number(input.costPerSqft);
  let materialCost = 0;
  if (materialCostInputType === "per_slab") {
    materialCost = round2(costPerSlab * pricedSlabQuantity);
  } else {
    materialCost = round2(costPerSqft * usableSlabSqftPerSlab * pricedSlabQuantity);
  }

  const freightCost = round2(Math.max(0, Number(input.freightCostToEsf) || 0));
  // Fabrication/install/shop follows the actual measured project sqft — never slab sqft.
  const fabricationRatePerSqft = resolveFabricationRatePerSqft(input.materialType);
  const fabricationCost = round2(fabricationRatePerSqft * projectSqft);
  const installCost = round2(Math.max(0, Number(input.installCost) || 0));
  const otherCostBasis = round2(Math.max(0, Number(input.otherCostBasis) || 0));
  const customCostBasis = round2(installCost + otherCostBasis);

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

  // Utilization compares the waste-adjusted requirement against entered slab availability.
  const utilizationPercent =
    enteredAvailableSlabSqft > 0
      ? round2((wasteAdjustedProjectSqft / enteredAvailableSlabSqft) * 100)
      : 0;

  /** @type {string[]} */
  const warnings = [];
  if (utilizationPercent >= UTILIZATION_WARN_PERCENT) {
    warnings.push(
      `Required square footage uses ${UTILIZATION_WARN_PERCENT}% or more of entered slab availability. Review slab yield, seams, layout, and whether another slab may be needed.`
    );
  }
  if (wasteAdjustedProjectSqft > enteredAvailableSlabSqft) {
    warnings.push(
      "Required square footage exceeds entered slab availability. Review slab quantity before sending."
    );
  }
  if (estimatedAdditionalSlabsNeeded > 0) {
    warnings.push(
      `Estimated slabs required exceeds entered slab quantity. The quote has been priced using ${pricedSlabQuantity} slab(s).`
    );
  }
  if (multiplier > 0 && multiplier < MULTIPLIER_WARN_THRESHOLD) {
    warnings.push(
      `Multiplier ${multiplier} is below ${MULTIPLIER_WARN_THRESHOLD} — review pricing before sending.`
    );
  }

  // Backward-compatible aliases for existing snapshot/line-item consumers.
  const slabSqftPerSlab = usableSlabSqftPerSlab;
  const slabSqftAvailable = enteredAvailableSlabSqft;

  const pricingInputsSnapshot = {
    ...input,
    usableSlabSqftPerSlab,
    netSlabWidthInches,
    netSlabHeightInches,
    enteredSlabQuantity,
    enteredAvailableSlabSqft,
    slabsRequired,
    pricedSlabQuantity,
    materialCostInputType,
    wasteFactor,
    slabSqftPerSlab,
    slabSqftAvailable,
    fabricationRatePerSqft,
    pricingUpliftPercent,
    pricingConfig: buildCustomQuotePricingConfigSnapshot()
  };

  const calculationSnapshot = {
    projectSqft,
    wasteFactor,
    wasteAdjustedProjectSqft,
    slabWidthInches: Number.isFinite(Number(input.slabWidth)) ? round2(Number(input.slabWidth)) : null,
    slabHeightInches: Number.isFinite(Number(input.slabHeight)) ? round2(Number(input.slabHeight)) : null,
    netSlabWidthInches,
    netSlabHeightInches,
    enteredSlabQuantity,
    usableSlabSqftPerSlab,
    enteredAvailableSlabSqft,
    slabsRequired,
    pricedSlabQuantity,
    estimatedAdditionalSlabsNeeded,
    materialCostInputType,
    costPerSlab: Number.isFinite(costPerSlab) ? round2(costPerSlab) : null,
    costPerSqft: Number.isFinite(costPerSqft) ? round2(costPerSqft) : null,
    materialCost,
    freightToEsf: freightCost,
    freightCost,
    fabricationInstallShopRate: fabricationRatePerSqft,
    fabricationInstallShopCostBasis: fabricationCost,
    fabricationCost,
    installCost,
    otherCostBasis,
    customCostBasis,
    totalCostBasis,
    pricingMode,
    pricingUpliftPercent,
    sellPrice,
    profitDollars,
    actualGrossMarginPercent,
    multiplier,
    slabSqftAvailable,
    slabSqftPerSlab,
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
          enteredSlabQuantity,
          pricedSlabQuantity,
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
      quantity: Number(calc.pricedSlabQuantity) || Number(input.slabQuantity) || 1,
      unit_type: "slab",
      unit_price: round2(
        Number(calc.materialCost) / (Number(calc.pricedSlabQuantity) || Number(input.slabQuantity) || 1)
      ),
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
