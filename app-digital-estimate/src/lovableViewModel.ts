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
  pricingGroupLabel: string;
  includedInBaseline: boolean;
  selectable: boolean;
  /** Optional upgrade amount from latest calculation, dollars */
  upgradeAmount: number | null;
};

export type LovableRoom = {
  id: string;
  name: string;
  sourceName: string;
  customerMayEditLabel: boolean;
  locked: boolean;
  countertopIncluded: boolean;
  backsplashIncluded: boolean;
  backsplashSummary: string | null;
  measurementStatus: string | null;
  baselineLabel: string | null;
  selectedColorId: string | null;
  selectedOptionKey: string | null;
  selectedColorName: string | null;
  colors: LovableColor[];
  choiceOptions: Array<{
    optionKey: string;
    displayLabel: string;
    role: string;
    selected: boolean;
    includedInBaseline: boolean;
  }>;
  roomNote: string;
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

export type CustomerInfoDraft = {
  customerName: string;
  projectName: string;
  phone: string;
  email: string;
  projectAddress: string;
};

export type SourceProject = {
  customerName: string | null;
  projectName: string | null;
  projectAddress: string | null;
  phone: string | null;
  email: string | null;
};

export type LovableEstimateViewModel = {
  customerName: string;
  projectName: string | null;
  projectAddress: string | null;
  documentTitle: string;
  quoteNumber: string | null;
  pricingValidThrough: string | null;
  lockedScopeNotice: string | null;
  sourceProject: SourceProject;
  customerInfoDraft: CustomerInfoDraft;
  rooms: LovableRoom[];
  addons: LovableAddon[];
  originalTotalLabel: string;
  updatedTotalLabel: string;
  changeFromOriginalLabel: string;
  originalTotal: number | null;
  updatedTotal: number | null;
  changeFromOriginal: number | null;
  lineItems: Array<{ label: string; amountLabel: string }>;
  materialUpgradeLabel: string | null;
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
      pricingGroupLabel: m.pricingGroupLabel || m.collectionLabel || "Elite 100",
      includedInBaseline: Boolean(m.includedInBaseline),
      selectable: m.selectable !== false,
      upgradeAmount: null,
    }));
  }
  return materialOptionsForRoom(options, roomKey).map((o) => ({
    id: o.materialId || o.optionKey,
    optionKey: o.optionKey,
    name: o.displayLabel,
    imageThumb: o.imageAssetRef || null,
    imageFull: o.imageAssetRef || null,
    collectionLabel: "Elite 100",
    pricingGroupLabel: "Elite 100",
    includedInBaseline: Boolean(o.includedInBaseline),
    selectable: o.selectable,
    upgradeAmount: null,
  }));
}

function emptyDraft(source: SourceProject): CustomerInfoDraft {
  return {
    customerName: source.customerName || "",
    projectName: source.projectName || "",
    phone: source.phone || "",
    email: source.email || "",
    projectAddress: source.projectAddress || "",
  };
}

export function mapEliteOsToLovableViewModel(
  state: ConfigurationState,
  qty: Record<string, number>,
  latestCalc?: ConfigurationState["configuration"] extends infer C
    ? C extends { latestCalculation?: infer L }
      ? L
      : null
    : null,
  customerInfoDraft?: Partial<CustomerInfoDraft> | null,
  roomLabelDrafts?: Record<string, string> | null,
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

  const sourceProject: SourceProject = {
    customerName:
      config.sourceProject?.customerName ?? estimate.project?.customerName ?? null,
    projectName: config.sourceProject?.projectName ?? estimate.project?.projectName ?? null,
    projectAddress:
      config.sourceProject?.projectAddress ?? estimate.project?.projectAddress ?? null,
    phone: config.sourceProject?.phone ?? null,
    email: config.sourceProject?.email ?? null,
  };

  const draft: CustomerInfoDraft = {
    ...emptyDraft(sourceProject),
    ...(config.customerInfoDraft || {}),
    ...(customerInfoDraft || {}),
  };

  const calcRooms = Array.isArray((latestCalc as { rooms?: unknown[] } | null | undefined)?.rooms)
    ? ((latestCalc as { rooms: Array<Record<string, unknown>> }).rooms || [])
    : [];

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
    const calcRoom = calcRooms.find((cr) => String(cr.roomKey) === r.roomKey);
    const labelDraft = roomLabelDrafts?.[r.roomKey] ?? config.roomLabelDrafts?.[r.roomKey];
    const choiceOptions = options
      .filter((o) => {
        const key = o.optionKey || "";
        return (
          key.startsWith(`backsplash:${r.roomKey}:`) ||
          key.startsWith(`sink:${r.roomKey}:`) ||
          key.startsWith(`edge:${r.roomKey}:`)
        );
      })
      .map((o) => {
        const parts = o.optionKey.split(":");
        const role = parts[0] || "choice";
        return {
          optionKey: o.optionKey,
          displayLabel: o.displayLabel,
          role,
          selected: (qty[o.optionKey] ?? o.defaultQty ?? 0) > 0,
          includedInBaseline: Boolean(o.includedInBaseline),
        };
      });
    const splashSelected = choiceOptions.find((c) => c.role === "backsplash" && c.selected);
    return {
      id: r.roomKey,
      name: labelDraft || r.displayName,
      sourceName: r.sourceDisplayName || r.displayName,
      customerMayEditLabel: r.customerMayEditLabel !== false,
      locked: true,
      countertopIncluded: r.countertopIncluded !== false,
      backsplashIncluded: Boolean(r.backsplashIncluded),
      backsplashSummary: splashSelected?.displayLabel || null,
      measurementStatus: r.measurementStatus || "Measurements verified by estimator",
      baselineLabel: r.baselineColorLabel || r.baselineMaterialLabel || null,
      selectedColorId: selectedColor?.id ?? null,
      selectedOptionKey: selectedColor?.optionKey ?? selectedOpt?.optionKey ?? null,
      selectedColorName:
        selectedColor?.name ||
        (calcRoom?.selectedMaterialLabel != null
          ? String(calcRoom.selectedMaterialLabel)
          : null),
      colors,
      choiceOptions,
      roomNote: String((config.roomNotes && config.roomNotes[r.roomKey]) || ""),
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

  const materialUpgrade =
    delta != null && Math.abs(delta) >= 0.005
      ? formatCurrency(delta)
      : null;

  return {
    customerName: draft.customerName || sourceProject.customerName || estimate.documentTitle || "Your estimate",
    projectName: draft.projectName || sourceProject.projectName,
    projectAddress: draft.projectAddress || sourceProject.projectAddress,
    documentTitle: estimate.documentTitle,
    quoteNumber: estimate.quoteNumber,
    pricingValidThrough: config.pricingValidThrough || estimate.pricingValidThrough,
    lockedScopeNotice: config.lockedScopeNotice || null,
    sourceProject,
    customerInfoDraft: draft,
    rooms,
    addons,
    originalTotal: baseline,
    updatedTotal: configured,
    changeFromOriginal: delta,
    originalTotalLabel: formatCurrency(baseline),
    updatedTotalLabel: formatCurrency(configured),
    changeFromOriginalLabel: formatCurrency(delta),
    materialUpgradeLabel: materialUpgrade,
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
    .filter(([key, q]) => !key.startsWith("__") && Number(q) > 0)
    .map(([optionKey, quantity]) => ({ optionKey, quantity: Number(quantity) }));
  for (const room of rooms) {
    const key = room.selectedOptionKey;
    if (key && !items.some((i) => i.optionKey === key)) {
      items.push({ optionKey: key, quantity: 1 });
    }
  }
  return items;
}

/** Group colors for modal tabs — preferred order. */
export const PRICING_GROUP_TAB_ORDER = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant",
  "Elite 100",
];

export function groupColorsByPricingGroup(colors: LovableColor[]): Array<{
  label: string;
  colors: LovableColor[];
}> {
  const map = new Map<string, LovableColor[]>();
  for (const c of colors) {
    const label = c.pricingGroupLabel || "Elite 100";
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(c);
  }
  const ordered: Array<{ label: string; colors: LovableColor[] }> = [];
  for (const label of PRICING_GROUP_TAB_ORDER) {
    if (map.has(label)) {
      ordered.push({ label, colors: map.get(label)! });
      map.delete(label);
    }
  }
  for (const [label, list] of map) {
    ordered.push({ label, colors: list });
  }
  return ordered;
}
