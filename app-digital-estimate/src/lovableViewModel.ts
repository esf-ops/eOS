/**
 * Thin adapter: eliteOS customer-safe ConfigurationState → Lovable-style view model.
 * Totals come only from Brain calculation DTO — never computed in the browser.
 * Product lists come only from ConfigurationState options / products — never hard-coded.
 */

import {
  calcTotals,
  formatCurrency,
  type BacksplashDraft,
  type ConfigurationState,
  type ConfigOption,
  type ConfigProduct,
  type CustomerMaterial,
  type MissingInformationRequirement,
  type ProductDraft,
  type PublicEstimate,
  type RoomProductDrafts,
} from "./publicConfigApi";

export type ChoiceRole =
  | "backsplash"
  | "sink"
  | "faucet"
  | "accessory"
  | "edge"
  | "specialty"
  | "sidesplash"
  | "cooktop"
  | "material"
  | "choice";

export const ROOM_CHOICE_ROLES: ChoiceRole[] = [
  "backsplash",
  "sink",
  "faucet",
  "accessory",
  "edge",
  "specialty",
  "sidesplash",
  "cooktop",
];

export type SourceKind = "none" | "customer_provided" | "esf" | "stock" | "other";

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

export type LovableChoiceOption = {
  optionKey: string;
  displayLabel: string;
  role: ChoiceRole | string;
  selected: boolean;
  includedInBaseline: boolean;
  description: string | null;
  imageAssetRef: string | null;
  availabilityState: string;
  availabilityText: string | null;
  productId: string | null;
  variantId: string | null;
  sourceKind: SourceKind;
  pieceKey: string | null;
  pieceLabel: string | null;
  selectable: boolean;
};

export type SideSplashPieceSummary = {
  pieceKey: string;
  pieceLabel: string;
  summary: string | null;
  options: LovableChoiceOption[];
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
  sinkSummary: string | null;
  faucetSummary: string | null;
  accessoriesSummary: string | null;
  cooktopSummary: string | null;
  edgeSummary: string | null;
  specialtySummary: string | null;
  sideSplashPieces: SideSplashPieceSummary[];
  measurementStatus: string | null;
  baselineLabel: string | null;
  selectedColorId: string | null;
  selectedOptionKey: string | null;
  selectedColorName: string | null;
  colors: LovableColor[];
  choiceOptions: LovableChoiceOption[];
  roomNote: string;
  sinkDraft: ProductDraft | null;
  faucetDraft: ProductDraft | null;
  backsplashDraft: BacksplashDraft | null;
  sinkProducts: ConfigProduct[];
  faucetProducts: ConfigProduct[];
  accessoryProducts: ConfigProduct[];
  specialtyProducts: ConfigProduct[];
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
  missingInformationRequirements: MissingInformationRequirement[];
};

function materialOptionsForRoom(options: ConfigOption[], roomKey: string): ConfigOption[] {
  return options.filter((o) => o.optionKey.startsWith(`material:${roomKey}:`));
}

function addonOptions(options: ConfigOption[]): ConfigOption[] {
  return options.filter((o) => {
    const key = o.optionKey || "";
    if (key.startsWith("material:")) return false;
    for (const role of ROOM_CHOICE_ROLES) {
      if (key.startsWith(`${role}:`)) return false;
    }
    return true;
  });
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

/** Normalize backsplash labels so "4-foot" never appears customer-facing. */
export function normalizeBacksplashLabel(label: string): string {
  return String(label || "")
    .replace(/4[- ]?foot/gi, "4-inch")
    .replace(/\b4'\s*backsplash/gi, "4-inch backsplash")
    .replace(/\b4″\b/g, "4-inch");
}

export function optionRoleFromKey(optionKey: string, explicitRole?: string | null): ChoiceRole | string {
  if (explicitRole) {
    const r = String(explicitRole).replace(/_selection$/i, "").toLowerCase();
    if ((ROOM_CHOICE_ROLES as string[]).includes(r) || r === "material") return r;
  }
  const prefix = String(optionKey || "").split(":")[0] || "choice";
  return prefix;
}

/** Token after role:roomKey: … */
export function optionTokenAfterRoom(optionKey: string, roomKey: string): string {
  const prefix = optionKey.split(":")[0];
  const full = `${prefix}:${roomKey}:`;
  if (!optionKey.startsWith(full)) {
    const parts = optionKey.split(":");
    return parts.slice(2).join(":");
  }
  return optionKey.slice(full.length);
}

export function classifySourceKind(role: string, optionKey: string, roomKey: string): SourceKind {
  const token = optionTokenAfterRoom(optionKey, roomKey).toLowerCase();
  if (!token || token === "none" || token.endsWith(":none") || /(^|:)none$/.test(token)) {
    return "none";
  }
  if (
    token === "customer" ||
    token === "customer_provided" ||
    token === "customer-provided" ||
    token === "customer_supplied" ||
    token.startsWith("customer")
  ) {
    return "customer_provided";
  }
  if (token === "stock" || /(^|:)stock($|:)/.test(token)) return "stock";
  if (token.startsWith("esf") || token.includes(":esf:") || /(^|:)esf($|:)/.test(token)) {
    return "esf";
  }
  if (role === "sink" || role === "faucet") return "esf";
  return "other";
}

function parseSideSplashMeta(
  optionKey: string,
  roomKey: string,
): { pieceKey: string | null; pieceLabel: string | null; sideToken: string } {
  const token = optionTokenAfterRoom(optionKey, roomKey);
  const parts = token.split(":").filter(Boolean);
  const sides = new Set(["left", "right", "both", "none"]);
  if (parts.length >= 2 && sides.has(parts[parts.length - 1].toLowerCase())) {
    const sideToken = parts[parts.length - 1];
    const pieceKey = parts.slice(0, -1).join(":") || "default";
    return {
      pieceKey,
      pieceLabel: pieceKey === "default" ? "Piece" : pieceKey.replace(/[-_]/g, " "),
      sideToken,
    };
  }
  return { pieceKey: "default", pieceLabel: "Piece", sideToken: token };
}

function productMatchesRoom(product: ConfigProduct, roomKey: string, roomDisplayName: string): boolean {
  const eligibility = product.roomEligibility;
  if (!Array.isArray(eligibility) || eligibility.length === 0) return true;
  const needles = [roomKey, roomDisplayName].map((s) => String(s || "").toLowerCase());
  return eligibility.some((e) => {
    const v = String(e || "").toLowerCase();
    if (!v) return false;
    return needles.some((n) => n === v || n.includes(v) || v.includes(n.split(/[-_]/)[0] || ""));
  });
}

function productsForRole(
  products: ConfigProduct[] | undefined,
  category: string,
  roomKey: string,
  roomDisplayName: string,
): ConfigProduct[] {
  return (products || []).filter((p) => {
    const cat = String(p.category || "").toLowerCase();
    if (cat !== category && !cat.includes(category)) return false;
    if (p.customerVisible === false) return false;
    if (p.active === false) return false;
    return productMatchesRoom(p, roomKey, roomDisplayName);
  });
}

function emptyProductDraft(source: ProductDraft["source"] = "none"): ProductDraft {
  return {
    source,
    optionKey: null,
    productId: null,
    variantId: null,
    manufacturer: "",
    model: "",
    finish: "",
    notes: "",
    displayLabel: null,
  };
}

function emptyBacksplashDraft(): BacksplashDraft {
  return {
    mode: "none",
    optionKey: null,
    requestedHeightInches: null,
    note: "",
  };
}

function draftFromSelection(
  role: "sink" | "faucet",
  selected: LovableChoiceOption | undefined,
  persisted: ProductDraft | null | undefined,
): ProductDraft {
  const base = emptyProductDraft("none");
  if (persisted && typeof persisted === "object") {
    Object.assign(base, {
      source: persisted.source || base.source,
      optionKey: persisted.optionKey ?? null,
      productId: persisted.productId ?? null,
      variantId: persisted.variantId ?? null,
      manufacturer: persisted.manufacturer || "",
      model: persisted.model || "",
      finish: persisted.finish || "",
      notes: persisted.notes || "",
      displayLabel: persisted.displayLabel ?? null,
    });
  }
  if (!selected) return base;
  const source =
    selected.sourceKind === "customer_provided"
      ? "customer_provided"
      : selected.sourceKind === "none"
        ? "none"
        : "esf";
  return {
    ...base,
    source,
    optionKey: selected.optionKey,
    displayLabel: selected.displayLabel || base.displayLabel,
    productId: selected.productId || base.productId,
    variantId: selected.variantId || base.variantId,
  };
}

function backsplashDraftFromSelection(
  selected: LovableChoiceOption | undefined,
  persisted: BacksplashDraft | null | undefined,
): BacksplashDraft {
  const base = emptyBacksplashDraft();
  if (persisted && typeof persisted === "object") {
    Object.assign(base, {
      mode: persisted.mode || base.mode,
      optionKey: persisted.optionKey ?? null,
      requestedHeightInches:
        persisted.requestedHeightInches ?? persisted.customHeightIn ?? null,
      note: persisted.note || "",
    });
  }
  if (!selected) return base;
  const token = selected.optionKey.split(":").slice(2).join(":").toLowerCase();
  let mode = base.mode;
  if (token.includes("custom")) mode = "custom_height";
  else if (token.includes("full")) mode = "full_height";
  else if (token.includes("4") || token.includes("standard")) mode = "standard_4in";
  else if (token === "none" || selected.sourceKind === "none") mode = "none";
  else mode = token || mode;
  return {
    ...base,
    mode,
    optionKey: selected.optionKey,
  };
}

function summarizeChoice(opt: LovableChoiceOption | undefined, fallback: string | null = null): string | null {
  if (!opt) return fallback;
  if (opt.role === "backsplash") return normalizeBacksplashLabel(opt.displayLabel);
  return opt.displayLabel || fallback;
}

export function summarizeSinkDraft(draft: ProductDraft | null, selectedLabel: string | null): string | null {
  if (!draft) return selectedLabel;
  if (draft.source === "none") return "No sink";
  if (draft.source === "customer_provided") {
    const bits = [draft.manufacturer, draft.model, draft.finish].filter(Boolean);
    return bits.length ? `Customer-provided · ${bits.join(" · ")}` : "Customer-provided sink";
  }
  return draft.displayLabel || selectedLabel || "ESF sink selected";
}

export function summarizeFaucetDraft(draft: ProductDraft | null, selectedLabel: string | null): string | null {
  if (!draft) return selectedLabel;
  if (draft.source === "none") return "No faucet";
  if (draft.source === "customer_provided") {
    const bits = [draft.manufacturer, draft.model, draft.finish].filter(Boolean);
    return bits.length ? `Customer-provided · ${bits.join(" · ")}` : "Customer-provided faucet";
  }
  return draft.displayLabel || selectedLabel || "ESF faucet selected";
}

export function summarizeBacksplashDraft(
  draft: BacksplashDraft | null,
  selectedLabel: string | null,
): string | null {
  if (draft?.mode === "custom_height") {
    const inches = draft.requestedHeightInches ?? draft.customHeightIn;
    const h =
      inches != null && Number(inches) > 0 ? `${inches}" custom height` : "Custom height";
    return h;
  }
  if (selectedLabel) return normalizeBacksplashLabel(selectedLabel);
  if (!draft) return null;
  if (draft.mode === "none") return "No backsplash";
  if (draft.mode === "standard_4in") return "4-inch backsplash";
  if (draft.mode === "full_height") return "Full-height backsplash";
  return normalizeBacksplashLabel(String(draft.mode));
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
  productDraftOverrides?: Record<string, RoomProductDrafts> | null,
  backsplashDraftOverrides?: Record<string, BacksplashDraft> | null,
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
  const products = config.products || [];
  const productDrafts = {
    ...(config.customerProductDrafts || config.productDrafts || {}),
    ...(productDraftOverrides || {}),
  };
  const backsplashDrafts = {
    ...(config.backsplashDrafts || {}),
    ...(backsplashDraftOverrides || {}),
  };
  // Precedence: persisted draft < unsaved browser qty edits. Baseline defaults apply
  // only when neither has a positive material selection for the room.
  const persistedQty = config.currentSelections || {};
  const effectiveQty: Record<string, number> = { ...persistedQty, ...qty };

  function roomHasMaterialSelection(roomKey: string): boolean {
    const prefix = `material:${roomKey}:`;
    return Object.entries(effectiveQty).some(
      ([key, value]) => key.startsWith(prefix) && Number(value) > 0,
    );
  }

  const rooms: LovableRoom[] = (config.rooms || []).map((r) => {
    const colors = colorsForRoom(r.roomKey, options, config.materials);
    const mats = materialOptionsForRoom(options, r.roomKey);
    const selectedOpt =
      mats.find((m) => (effectiveQty[m.optionKey] ?? 0) > 0) ||
      (!roomHasMaterialSelection(r.roomKey)
        ? mats.find((m) => m.includedInBaseline || m.defaultQty > 0)
        : null) ||
      mats[0] ||
      null;
    const selectedColor =
      colors.find((c) => c.optionKey === selectedOpt?.optionKey) ||
      colors.find((c) => (effectiveQty[c.optionKey] ?? 0) > 0) ||
      (!roomHasMaterialSelection(r.roomKey)
        ? colors.find((c) => c.includedInBaseline)
        : null) ||
      colors[0] ||
      null;
    const calcRoom = calcRooms.find((cr) => String(cr.roomKey) === r.roomKey);
    const labelDraft = roomLabelDrafts?.[r.roomKey] ?? config.roomLabelDrafts?.[r.roomKey];

    const choiceOptions: LovableChoiceOption[] = options
      .filter((o) => {
        const key = o.optionKey || "";
        const role = optionRoleFromKey(key, o.role);
        if (!(ROOM_CHOICE_ROLES as string[]).includes(String(role))) return false;
        return key.startsWith(`${role}:${r.roomKey}:`) || o.roomKey === r.roomKey;
      })
      .map((o) => {
        const role = optionRoleFromKey(o.optionKey, o.role);
        const rolePrefix = `${role}:${r.roomKey}:`;
        const roleHasExplicit = Object.entries(effectiveQty).some(
          ([key, value]) => key.startsWith(rolePrefix) && Number(value) > 0,
        );
        const sideMeta =
          role === "sidesplash" ? parseSideSplashMeta(o.optionKey, r.roomKey) : null;
        const displayLabel =
          role === "backsplash" ? normalizeBacksplashLabel(o.displayLabel) : o.displayLabel;
        return {
          optionKey: o.optionKey,
          displayLabel,
          role,
          selected: roleHasExplicit
            ? (effectiveQty[o.optionKey] ?? 0) > 0
            : (effectiveQty[o.optionKey] ?? o.defaultQty ?? 0) > 0,
          includedInBaseline: Boolean(o.includedInBaseline),
          description: o.description ?? null,
          imageAssetRef: o.imageAssetRef ?? null,
          availabilityState: o.availabilityState || "active",
          availabilityText: o.availabilityText ?? null,
          productId:
            o.productId ??
            (String(role) === "sink" || String(role) === "faucet" || String(role) === "accessory" || String(role) === "specialty"
              ? (() => {
                  const token = optionTokenAfterRoom(o.optionKey, r.roomKey);
                  return token.startsWith("esf:") ? token.slice(4) : null;
                })()
              : null),
          variantId: o.variantId ?? null,
          sourceKind: classifySourceKind(String(role), o.optionKey, r.roomKey),
          pieceKey: o.pieceKey ?? sideMeta?.pieceKey ?? null,
          pieceLabel: sideMeta?.pieceLabel ?? null,
          selectable: o.selectable !== false,
        };
      });

    const selectedFor = (role: string) =>
      choiceOptions.find((c) => c.role === role && c.selected) ||
      choiceOptions.find((c) => c.role === role && c.includedInBaseline) ||
      null;

    const splashSelected = selectedFor("backsplash");
    const sinkSelected = selectedFor("sink");
    const faucetSelected = selectedFor("faucet");
    const edgeSelected = selectedFor("edge");
    const cooktopSelected = selectedFor("cooktop");
    const accessorySelected = choiceOptions.filter((c) => c.role === "accessory" && c.selected);
    const specialtySelected = choiceOptions.filter((c) => c.role === "specialty" && c.selected);

    const roomProductDraft = productDrafts[r.roomKey] || {};
    const sinkDraft = draftFromSelection("sink", sinkSelected || undefined, roomProductDraft.sink);
    const faucetDraft = draftFromSelection(
      "faucet",
      faucetSelected || undefined,
      roomProductDraft.faucet,
    );
    const backsplashDraft = backsplashDraftFromSelection(
      splashSelected || undefined,
      backsplashDrafts[r.roomKey],
    );

    const sideSplashMap = new Map<string, SideSplashPieceSummary>();
    for (const opt of choiceOptions.filter((c) => c.role === "sidesplash")) {
      const pk = opt.pieceKey || "default";
      if (!sideSplashMap.has(pk)) {
        sideSplashMap.set(pk, {
          pieceKey: pk,
          pieceLabel: opt.pieceLabel || (pk === "default" ? "Side splash" : pk),
          summary: null,
          options: [],
        });
      }
      sideSplashMap.get(pk)!.options.push(opt);
    }
    const sideSplashPieces = [...sideSplashMap.values()].map((piece) => {
      const sel = piece.options.find((o) => o.selected) || piece.options.find((o) => o.includedInBaseline);
      return {
        ...piece,
        summary: sel?.displayLabel || null,
      };
    });

    return {
      id: r.roomKey,
      name: labelDraft || r.displayName,
      sourceName: r.sourceDisplayName || r.displayName,
      customerMayEditLabel: r.customerMayEditLabel !== false,
      locked: true,
      countertopIncluded: r.countertopIncluded !== false,
      backsplashIncluded: Boolean(r.backsplashIncluded),
      backsplashSummary: summarizeBacksplashDraft(
        backsplashDraft,
        summarizeChoice(splashSelected || undefined),
      ),
      sinkSummary: summarizeSinkDraft(sinkDraft, summarizeChoice(sinkSelected || undefined)),
      faucetSummary: summarizeFaucetDraft(faucetDraft, summarizeChoice(faucetSelected || undefined)),
      accessoriesSummary: accessorySelected.length
        ? accessorySelected.map((a) => a.displayLabel).join(", ")
        : choiceOptions.some((c) => c.role === "accessory")
          ? "None selected"
          : null,
      cooktopSummary: summarizeChoice(cooktopSelected || undefined),
      edgeSummary: summarizeChoice(edgeSelected || undefined),
      specialtySummary: specialtySelected.length
        ? specialtySelected.map((a) => a.displayLabel).join(", ")
        : choiceOptions.some((c) => c.role === "specialty")
          ? "None selected"
          : null,
      sideSplashPieces,
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
      sinkDraft,
      faucetDraft,
      backsplashDraft,
      sinkProducts: productsForRole(products, "sink", r.roomKey, r.displayName),
      faucetProducts: productsForRole(products, "faucet", r.roomKey, r.displayName),
      accessoryProducts: productsForRole(products, "accessory", r.roomKey, r.displayName),
      specialtyProducts: productsForRole(products, "specialty", r.roomKey, r.displayName),
    };
  });

  const addons: LovableAddon[] = addonOptions(options).map((o) => ({
    optionKey: o.optionKey,
    id: o.id,
    displayLabel: o.displayLabel,
    description: o.description ?? null,
    quantity: effectiveQty[o.optionKey] ?? o.defaultQty ?? 0,
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

  const missingInformationRequirements = Array.isArray(config.missingInformationRequirements)
    ? config.missingInformationRequirements
    : [];

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
    missingInformationRequirements,
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

/** Resolve ESF product (+ optional variant) to an envelope option key when present. */
export function resolveProductOptionKey(
  product: ConfigProduct,
  variantId?: string | null,
): string | null {
  if (variantId && Array.isArray(product.variants)) {
    const v = product.variants.find((x) => x.variantId === variantId || x.sku === variantId);
    if (v?.optionKey) return v.optionKey;
  }
  return product.optionKey || null;
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
