/**
 * Out-of-collection (custom) slab package pricing — Brain-side, server-only.
 *
 * Installed selling price = confirmed slab quantity × supplier cost per slab × 2.25.
 * The 2.25 cost multiplier already includes fabrication and installation; nothing
 * else is added for stone, fabrication, installation or material use tax. Explicit
 * extras (cutouts, sinks, products, upgraded edge, waterfall labor, custom lines)
 * keep their existing charges in the room calculator.
 *
 * Slab quantity suggestion (decided 2026-09-29): add the waste percentage to the
 * required area and divide by the FULL nominal slab area — no separate edge-trim
 * deduction, because the waste allowance covers trim. This is an area-based
 * suggestion, not a cutting layout; the estimator must confirm the quantity, and a
 * confirmed quantity that differs from the suggestion needs a documented reason.
 *
 * Costs, the multiplier, slab counts and areas are internal. Customer projections
 * carry only the package label and installed amounts.
 */

export const SLAB_PACKAGE_COST_MULTIPLIER = 2.25;
export const SLAB_PACKAGE_DEFAULT_WASTE_PERCENT = 20;
export const SLAB_PACKAGE_WASTE_METHOD = "add_percent_to_required_area_full_slab_area";
export const SLAB_PACKAGE_MATERIAL_GROUP = "Custom Slab";

const MULTIPLIER_BASIS_POINTS = 22500;

function str(v) {
  return v == null ? "" : String(v).trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function dollarsToCents(n) {
  return Math.round(num(n) * 100);
}

function centsToDollars(c) {
  return Math.round(c) / 100;
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeSlabPackage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id);
  if (!id) return null;
  const wasteRaw = raw.wastePercent;
  const wastePercent =
    wasteRaw == null || wasteRaw === "" || !Number.isFinite(Number(wasteRaw))
      ? SLAB_PACKAGE_DEFAULT_WASTE_PERCENT
      : Math.max(0, Math.min(100, Number(wasteRaw)));
  const confirmedRaw = raw.confirmedSlabQuantity;
  const confirmedSlabQuantity =
    confirmedRaw == null || confirmedRaw === "" || !(Number(confirmedRaw) > 0)
      ? null
      : Math.floor(Number(confirmedRaw));
  const colorName = str(raw.colorName);
  const supplier = str(raw.supplier);
  return {
    id,
    colorName,
    supplier,
    thickness: str(raw.thickness),
    // Customer-visible; supplier stays internal unless staff type it into the label.
    label: str(raw.label) || colorName || "Custom slab",
    slabLengthIn: Math.max(0, num(raw.slabLengthIn)),
    slabWidthIn: Math.max(0, num(raw.slabWidthIn)),
    costPerSlab: Math.max(0, num(raw.costPerSlab)),
    wastePercent,
    confirmedSlabQuantity,
    quantityOverrideReason: str(raw.quantityOverrideReason)
  };
}

/**
 * Area-based slab quantity suggestion (not a nesting/cutting layout).
 * @param {{ requiredSf: number, slabLengthIn: number, slabWidthIn: number, wastePercent?: number }} input
 */
export function suggestSlabQuantity(input) {
  const requiredSf = Math.max(0, num(input.requiredSf));
  const wastePercent =
    input.wastePercent == null ? SLAB_PACKAGE_DEFAULT_WASTE_PERCENT : Math.max(0, num(input.wastePercent));
  const slabAreaSf = round3((num(input.slabLengthIn) * num(input.slabWidthIn)) / 144);
  const requiredWithWasteSf = round3(requiredSf * (1 + wastePercent / 100));
  const suggestedQuantity =
    slabAreaSf > 0 && requiredSf > 0 ? Math.ceil(requiredWithWasteSf / slabAreaSf - 1e-9) : 0;
  return {
    requiredSf: round3(requiredSf),
    wastePercent,
    wasteMethod: SLAB_PACKAGE_WASTE_METHOD,
    slabAreaSf,
    requiredWithWasteSf,
    suggestedQuantity
  };
}

/**
 * Installed package price in integer cents: quantity × cost × 2.25, rounded half-up once.
 * @param {number} quantity
 * @param {number} costPerSlab dollars
 */
export function slabPackageTotalCents(quantity, costPerSlab) {
  const q = Math.max(0, Math.floor(num(quantity)));
  const costCents = dollarsToCents(costPerSlab);
  return Math.round((q * costCents * MULTIPLIER_BASIS_POINTS) / 10000);
}

/**
 * Split package cents across rooms by required area (largest remainder), so room
 * amounts always sum exactly to the package total and each slab is charged once.
 * @param {number} totalCents
 * @param {Array<{ roomId: string, requiredSf: number }>} rooms
 */
export function allocateSlabPackageCents(totalCents, rooms) {
  if (!rooms.length) return [];
  const weights = rooms.map((r) => Math.max(0, num(r.requiredSf)));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const shares = weightSum > 0 ? weights.map((w) => (totalCents * w) / weightSum) : rooms.map((_, i) => (i === 0 ? totalCents : 0));
  const floors = shares.map((s) => Math.floor(s));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) {
    floors[order[k].i] += 1;
  }
  return rooms.map((r, i) => ({ roomId: r.roomId, amountCents: floors[i], amount: centsToDollars(floors[i]) }));
}

/**
 * Price every slab package once and allocate it to the rooms that use it.
 *
 * @param {{
 *   packages: unknown[],
 *   roomAreas: Array<{ roomId: string, roomName: string, packageId: string, requiredSf: number }>
 * }} input
 */
export function priceSlabPackages(input) {
  const packages = (Array.isArray(input.packages) ? input.packages : [])
    .map(normalizeSlabPackage)
    .filter(Boolean);
  const byId = new Map(packages.map((p) => [p.id, p]));
  const roomAreas = Array.isArray(input.roomAreas) ? input.roomAreas : [];
  /** @type {Array<{code:string,message:string,packageId?:string,roomId?:string}>} */
  const unresolved = [];
  /** @type {Array<{code:string,message:string,packageId?:string}>} */
  const warnings = [];

  for (const ra of roomAreas) {
    if (!byId.has(ra.packageId)) {
      unresolved.push({
        code: "slab_package_missing",
        roomId: ra.roomId,
        message: `Room "${ra.roomName}": the selected custom slab package no longer exists. Choose Elite 100 or another slab package.`
      });
    }
  }

  const results = [];
  for (const pkg of packages) {
    const rooms = roomAreas.filter((ra) => ra.packageId === pkg.id);
    if (!rooms.length) {
      warnings.push({
        code: "slab_package_unused",
        packageId: pkg.id,
        message: `Custom slab package "${pkg.label}" is not assigned to any room and is not charged.`
      });
      continue;
    }
    const requiredSf = rooms.reduce((s, r) => s + Math.max(0, num(r.requiredSf)), 0);
    const suggestion = suggestSlabQuantity({
      requiredSf,
      slabLengthIn: pkg.slabLengthIn,
      slabWidthIn: pkg.slabWidthIn,
      wastePercent: pkg.wastePercent
    });
    const complete = pkg.slabLengthIn > 0 && pkg.slabWidthIn > 0 && pkg.costPerSlab > 0;
    if (!complete) {
      unresolved.push({
        code: "slab_package_incomplete",
        packageId: pkg.id,
        message: `Custom slab package "${pkg.label}": enter slab length, width and cost per slab.`
      });
    }
    const confirmed = pkg.confirmedSlabQuantity != null;
    const quantityPriced = confirmed ? pkg.confirmedSlabQuantity : suggestion.suggestedQuantity;
    const overridden = confirmed && pkg.confirmedSlabQuantity !== suggestion.suggestedQuantity;
    if (!confirmed && complete) {
      unresolved.push({
        code: "slab_quantity_unconfirmed",
        packageId: pkg.id,
        message: `Custom slab package "${pkg.label}": confirm the slab quantity (area-based suggestion ${suggestion.suggestedQuantity}; not a cutting layout).`
      });
    }
    if (overridden && !pkg.quantityOverrideReason) {
      unresolved.push({
        code: "slab_quantity_override_reason_missing",
        packageId: pkg.id,
        message: `Custom slab package "${pkg.label}": ${pkg.confirmedSlabQuantity} slab(s) confirmed vs ${suggestion.suggestedQuantity} suggested — document the reason.`
      });
    }
    if (overridden && pkg.confirmedSlabQuantity < suggestion.suggestedQuantity && pkg.quantityOverrideReason) {
      warnings.push({
        code: "slab_quantity_below_suggestion",
        packageId: pkg.id,
        message: `Custom slab package "${pkg.label}": confirmed ${pkg.confirmedSlabQuantity} slab(s) is below the area-based suggestion of ${suggestion.suggestedQuantity}. Reason: ${pkg.quantityOverrideReason}`
      });
    }
    const totalCents = complete ? slabPackageTotalCents(quantityPriced, pkg.costPerSlab) : 0;
    const allocations = allocateSlabPackageCents(
      totalCents,
      rooms.map((r) => ({ roomId: r.roomId, requiredSf: r.requiredSf }))
    );
    results.push({
      packageId: pkg.id,
      label: pkg.label,
      colorName: pkg.colorName,
      supplier: pkg.supplier,
      thickness: pkg.thickness,
      roomIds: rooms.map((r) => r.roomId),
      roomNames: rooms.map((r) => r.roomName),
      shared: rooms.length > 1,
      ...suggestion,
      slabLengthIn: pkg.slabLengthIn,
      slabWidthIn: pkg.slabWidthIn,
      costPerSlab: pkg.costPerSlab,
      costMultiplier: SLAB_PACKAGE_COST_MULTIPLIER,
      confirmedSlabQuantity: pkg.confirmedSlabQuantity,
      quantityConfirmed: confirmed,
      quantityOverridden: overridden,
      quantityOverrideReason: pkg.quantityOverrideReason || null,
      quantityPriced,
      complete,
      totalCents,
      total: centsToDollars(totalCents),
      allocations
    });
  }
  return { packages: results, unresolved, warnings };
}

/** Customer-safe package summary: label, rooms and installed amount only. */
export function toCustomerSafeSlabPackage(pkg) {
  return {
    packageId: pkg.packageId,
    label: pkg.label,
    roomNames: pkg.roomNames,
    shared: pkg.shared,
    total: pkg.total
  };
}
