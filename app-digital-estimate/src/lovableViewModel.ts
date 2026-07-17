/**
 * Thin adapter: eliteOS customer-safe ConfigurationState → Lovable-style view model.
 * Totals come only from Brain calculation DTO — never computed in the browser.
 */

import {
  calcTotals,
  formatCurrency,
  type ConfigurationState,
  type ConfigOption,
  type CustomerMaterial,
  type PublicEstimate,
} from "./publicConfigApi";

export type LovableColor = {
  id: string;
  optionKey: string;
  name: string;
  imageThumb: string | null;
  imageFull: string | null;
  collectionLabel: string;
  includedInBaseline: boolean;
  selectable: boolean;
};

export type LovableRoom = {
  id: string;
  name: string;
  locked: boolean;
  baselineLabel: string | null;
  selectedColorId: string | null;
  selectedOptionKey: string | null;
  colors: LovableColor[];
};

export type LovableAddon = {
  optionKey: string;
  id: string;
  displayLabel: string;
  description: string | null;
  quantity: number;
  minQty: number;
  maxQty: number;
  selectable: boolean;
  includedInBaseline: boolean;
  availabilityState: string;
};

export type LovableEstimateViewModel = {
  customerName: string;
  projectName: string | null;
  documentTitle: string;
  quoteNumber: string | null;
  pricingValidThrough: string | null;
  lockedScopeNotice: string | null;
  rooms: LovableRoom[];
  addons: LovableAddon[];
  originalTotalLabel: string;
  updatedTotalLabel: string;
  changeFromOriginalLabel: string;
  originalTotal: number | null;
  updatedTotal: number | null;
  changeFromOriginal: number | null;
  lineItems: Array<{ label: string; amountLabel: string }>;
};

function materialOptionsForRoom(options: ConfigOption[], roomKey: string): ConfigOption[] {
  return options.filter((o) => o.optionKey.startsWith(`material:${roomKey}:`));
}

function addonOptions(options: ConfigOption[]): ConfigOption[] {
  return options.filter((o) => !o.optionKey.startsWith("material:"));
}

function colorsForRoom(
  roomKey: string,
  options: ConfigOption[],
  materials: CustomerMaterial[] | undefined,
): LovableColor[] {
  const mats = (materials || []).filter((m) => m.roomKey === roomKey);
  if (mats.length) {
    return mats.map((m) => ({
      id: m.materialId,
      optionKey: m.optionKey || `material:${roomKey}:${m.materialId}`,
      name: m.displayName,
      imageThumb: m.imageAssetPath || null,
      imageFull: m.imageFullPath || m.imageAssetPath || null,
      collectionLabel: m.collectionLabel || "Elite 100",
      includedInBaseline: Boolean(m.includedInBaseline),
      selectable: m.selectable !== false,
    }));
  }
  return materialOptionsForRoom(options, roomKey).map((o) => ({
    id: o.materialId || o.optionKey,
    optionKey: o.optionKey,
    name: o.displayLabel,
    imageThumb: o.imageAssetRef || null,
    imageFull: o.imageAssetRef || null,
    collectionLabel: "Elite 100",
    includedInBaseline: Boolean(o.includedInBaseline),
    selectable: o.selectable,
  }));
}

export function mapEliteOsToLovableViewModel(
  state: ConfigurationState,
  qty: Record<string, number>,
  latestCalc?: ConfigurationState["configuration"] extends infer C
    ? C extends { latestCalculation?: infer L }
      ? L
      : null
    : null,
): LovableEstimateViewModel | null {
  const estimate = state.estimate as PublicEstimate | null | undefined;
  const config = state.configuration;
  if (!estimate || !config) return null;

  const totals = calcTotals(latestCalc ?? config.latestCalculation ?? null);
  const baseline =
    totals.baseline ?? config.baselineDisplayTotal ?? estimate.totals?.estimatedProjectTotal ?? null;
  const configured = totals.configured ?? baseline;
  const delta =
    totals.delta ?? (configured != null && baseline != null ? configured - baseline : null);

  const options = config.options || [];
  const rooms: LovableRoom[] = (config.rooms || []).map((r) => {
    const colors = colorsForRoom(r.roomKey, options, config.materials);
    const mats = materialOptionsForRoom(options, r.roomKey);
    const selectedOpt =
      mats.find((m) => (qty[m.optionKey] ?? 0) > 0) ||
      mats.find((m) => m.includedInBaseline || m.defaultQty > 0) ||
      mats[0] ||
      null;
    const selectedColor =
      colors.find((c) => c.optionKey === selectedOpt?.optionKey) ||
      colors.find((c) => c.includedInBaseline) ||
      colors[0] ||
      null;
    return {
      id: r.roomKey,
      name: r.displayName,
      locked: true,
      baselineLabel: r.baselineColorLabel || r.baselineMaterialLabel || null,
      selectedColorId: selectedColor?.id ?? null,
      selectedOptionKey: selectedColor?.optionKey ?? selectedOpt?.optionKey ?? null,
      colors,
    };
  });

  const addons: LovableAddon[] = addonOptions(options).map((o) => ({
    optionKey: o.optionKey,
    id: o.id,
    displayLabel: o.displayLabel,
    description: o.description ?? null,
    quantity: qty[o.optionKey] ?? o.defaultQty ?? 0,
    minQty: o.minQty,
    maxQty: o.maxQty ?? 99,
    selectable: o.selectable,
    includedInBaseline: Boolean(o.includedInBaseline),
    availabilityState: o.availabilityState,
  }));

  return {
    customerName: estimate.project?.customerName || estimate.documentTitle || "Your estimate",
    projectName: estimate.project?.projectName || null,
    documentTitle: estimate.documentTitle,
    quoteNumber: estimate.quoteNumber,
    pricingValidThrough: config.pricingValidThrough || estimate.pricingValidThrough,
    lockedScopeNotice: config.lockedScopeNotice || null,
    rooms,
    addons,
    originalTotal: baseline,
    updatedTotal: configured,
    changeFromOriginal: delta,
    originalTotalLabel: formatCurrency(baseline),
    updatedTotalLabel: formatCurrency(configured),
    changeFromOriginalLabel: formatCurrency(delta),
    lineItems: (estimate.lineItems || []).map((li) => ({
      label: li.label || "Included item",
      amountLabel: formatCurrency(li.amount),
    })),
  };
}

export function buildSelectionItems(
  qty: Record<string, number>,
  rooms: LovableRoom[],
): Array<{ optionKey: string; quantity: number }> {
  const items = Object.entries(qty)
    .filter(([, q]) => Number(q) > 0)
    .map(([optionKey, quantity]) => ({ optionKey, quantity: Number(quantity) }));
  for (const room of rooms) {
    const key = room.selectedOptionKey;
    if (key && !items.some((i) => i.optionKey === key)) {
      items.push({ optionKey: key, quantity: 1 });
    }
  }
  return items;
}
