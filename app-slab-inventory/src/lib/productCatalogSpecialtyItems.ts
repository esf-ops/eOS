/**
 * Product Catalog — Specialty Items (curated showroom layer)
 * ==========================================================
 *
 * Workbook rows live in productCatalogData.ts (Specialty Items sheet).
 * This file applies customer-facing names, group labels, notes, websites,
 * and InvisaCook configuration options by stable product id.
 *
 * Customer-facing language: Countertop Power / Pop-Up Outlets.
 * No installed prices or internal cost.
 */
import type { ProductCatalogItem } from "./productCatalog";

export type SpecialtyGroupId =
  | "countertop_power"
  | "wireless_charging"
  | "backlighting"
  | "hidden_cooking";

export const SPECIALTY_GROUP_LABELS: Record<SpecialtyGroupId, string> = {
  countertop_power: "Countertop Power",
  wireless_charging: "Wireless Charging",
  backlighting: "Backlighting",
  hidden_cooking: "Hidden Cooking",
};

/** Display order for Specialty Items sections. */
export const SPECIALTY_GROUP_ORDER: readonly SpecialtyGroupId[] = [
  "countertop_power",
  "wireless_charging",
  "backlighting",
  "hidden_cooking",
];

type SpecialtyCuratedFields = {
  name: string;
  brand?: string;
  series?: string;
  type?: string;
  specialtyGroup: SpecialtyGroupId;
  specSummary?: string;
  description?: string;
  notes?: string;
  websiteUrl: string;
  configurationOptions?: string[];
  /** Sort within a specialty group (lower first). */
  sortOrder: number;
};

const POINT_POD_15W_NOTES =
  "Four outlets, two USB-C and one USB-A making it ideal for charging phones and smaller devices.";

const POINT_POD_65W_NOTES =
  "Four outlets, 2 USB-C ports, the 65-watt version is better suited for charging laptops and tablets at normal speed, as well as charging phones more quickly.";

const INVISACOOK_OPTIONS = [
  "5 burner",
  "4 burner straight",
  "4 burner square",
  "3 burner",
  "2 burner",
  "1 burner",
  "5 pc cookware",
  "10 pc cookware",
] as const;

/**
 * Curated specialty catalog by workbook product id.
 * Only these ids are shown as catalog-ready Specialty Items.
 */
const SPECIALTY_BY_PRODUCT_ID: Readonly<Record<string, SpecialtyCuratedFields>> = {
  "specialty-point-pod-connect-silver-kitchen-counter-pop-up-outlet-15-w": {
    name: "Point Pod Connect Silver Kitchen Counter Pop Up Outlet",
    brand: "Point Pod",
    series: "Countertop Power",
    type: "Pop-Up Outlet",
    specialtyGroup: "countertop_power",
    specSummary: "15 W",
    description: POINT_POD_15W_NOTES,
    notes: POINT_POD_15W_NOTES,
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 10,
  },
  "specialty-point-pod-connect-silver-kitchen-counter-pop-up-outlet-65w": {
    name: "Point Pod Connect Silver Kitchen Counter Pop Up Outlet",
    brand: "Point Pod",
    series: "Countertop Power",
    type: "Pop-Up Outlet",
    specialtyGroup: "countertop_power",
    specSummary: "65 W",
    description: POINT_POD_65W_NOTES,
    notes: POINT_POD_65W_NOTES,
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 20,
  },
  "specialty-point-pod-connect-black-kitchen-counter-pop-up-outlet-15-w": {
    name: "Point Pod Connect Black Kitchen Counter Pop Up Outlet",
    brand: "Point Pod",
    series: "Countertop Power",
    type: "Pop-Up Outlet",
    specialtyGroup: "countertop_power",
    specSummary: "15 W",
    description: POINT_POD_15W_NOTES,
    notes: POINT_POD_15W_NOTES,
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 30,
  },
  "specialty-point-pod-connect-black-kitchen-counter-pop-up-outlet-65w": {
    name: "Point Pod Connect Black Kitchen Counter Pop Up Outlet",
    brand: "Point Pod",
    series: "Countertop Power",
    type: "Pop-Up Outlet",
    specialtyGroup: "countertop_power",
    specSummary: "65 W",
    description: POINT_POD_65W_NOTES,
    notes: POINT_POD_65W_NOTES,
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 40,
  },
  "specialty-hubbell-dual-sided-countertop-pop-up-receptacle-15amp": {
    name: "Hubbell Dual-Sided Countertop Pop Up Receptacle",
    brand: "Hubbell",
    series: "Countertop Power",
    type: "Pop-Up Receptacle",
    specialtyGroup: "countertop_power",
    specSummary: "15 Amp",
    description: "Multiple top finish options, 2 outlets, no USB, no wireless charging.",
    notes: "Multiple top finish options, 2 outlets, no USB, no wireless charging.",
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 50,
  },
  "specialty-hubbell-tri-power-countertop-pop-up-receptacle-15-amp": {
    name: "Hubbell Tri-Power Countertop Pop Up Receptacle",
    brand: "Hubbell",
    series: "Countertop Power",
    type: "Pop-Up Receptacle",
    specialtyGroup: "countertop_power",
    specSummary: "15 Amp",
    description: "1 outlet, 1 USB, 1 Type C, wireless top charging, multiple finish options.",
    notes: "1 outlet, 1 USB, 1 Type C, wireless top charging, multiple finish options.",
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 60,
  },
  "specialty-hubbell-tri-power-countertop-pop-up-receptacle-20-amp": {
    name: "Hubbell Tri-Power Countertop Pop Up Receptacle",
    brand: "Hubbell",
    series: "Countertop Power",
    type: "Pop-Up Receptacle",
    specialtyGroup: "countertop_power",
    specSummary: "20 Amp",
    description: "1 outlet, 1 USB, 1 Type C, wireless top charging, multiple finish options.",
    notes: "1 outlet, 1 USB, 1 Type C, wireless top charging, multiple finish options.",
    websiteUrl: "https://www.modernpower.solutions",
    sortOrder: 70,
  },
  "specialty-free-power-3-device-charging-station-wholesale-and-partner-15-w": {
    name: "FreePower 3 Device Charging Station",
    brand: "FreePower",
    series: "Wireless Charging",
    type: "Charging Station",
    specialtyGroup: "wireless_charging",
    specSummary: "15 W",
    description: "Residential and commercial use, color-changing LED ring.",
    notes: "Residential and commercial use, color-changing LED ring.",
    websiteUrl: "https://www.freepower.io",
    sortOrder: 10,
  },
  "specialty-glowback-led-panels-are-custom-made-for-each-project-to-fit-the-dimens": {
    name: "Glowback LED Panels",
    brand: "Glowback LED",
    series: "Backlighting",
    type: "Custom LED Panels",
    specialtyGroup: "backlighting",
    specSummary: "Custom cut to size",
    description:
      "Glowback LED panels are custom made for each project to fit the dimensions of each piece. Projects are bid upon request and provided dimensions. Preferred provider to prevent lighting gaps and ensure full backlighting coverage.",
    notes:
      "Custom quoted and custom cut to size for each project. Provide dimensions for a bid — not a fixed SKU product.",
    websiteUrl: "https://www.glowbackledstore.com",
    sortOrder: 10,
  },
  "specialty-invisacook-places-induction-technology-beneath-the-countertop-allowing": {
    name: "InvisaCook Hidden Induction Cooking",
    brand: "InvisaCook",
    series: "Hidden Cooking",
    type: "Induction Cooking",
    specialtyGroup: "hidden_cooking",
    specSummary: "Custom quoted",
    description:
      "InvisaCook places induction technology beneath the countertop, allowing compatible surfaces to remain visually clean while creating a true cooking zone directly on the slab. Visit the product website, select a configuration, and ESF will custom quote.",
    notes:
      "Visit the product website, select a product, and ESF will custom quote.",
    websiteUrl: "https://www.invisacook.com",
    configurationOptions: [...INVISACOOK_OPTIONS],
    sortOrder: 10,
  },
};

export function isCuratedSpecialtyProductId(productId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPECIALTY_BY_PRODUCT_ID, productId);
}

export function getSpecialtyGroupLabel(groupId?: SpecialtyGroupId): string | undefined {
  if (!groupId) return undefined;
  return SPECIALTY_GROUP_LABELS[groupId];
}

/** Apply curated Specialty Items fields; leave non-specialty and unlisted rows unchanged. */
export function applyProductCatalogSpecialtyItems(items: ProductCatalogItem[]): ProductCatalogItem[] {
  return items.map((item) => {
    if (item.category !== "specialty_add_on") return item;
    const curated = SPECIALTY_BY_PRODUCT_ID[item.id];
    if (!curated) return item;

    return {
      ...item,
      name: curated.name,
      brand: curated.brand ?? item.brand,
      series: curated.series ?? item.series,
      type: curated.type ?? item.type,
      specialtyGroup: curated.specialtyGroup,
      specSummary: curated.specSummary ?? item.specSummary,
      description: curated.description ?? item.description,
      notes: curated.notes,
      websiteUrl: curated.websiteUrl,
      configurationOptions: curated.configurationOptions,
      specialtySortOrder: curated.sortOrder,
      suggestedUse: item.suggestedUse ?? "Kitchen",
    };
  });
}

export type ProductCatalogSpecialtyGroup = {
  groupId: SpecialtyGroupId;
  label: string;
  items: ProductCatalogItem[];
};

/** Group specialty items by curated subcategory, preserving SPECIALTY_GROUP_ORDER. */
export function groupProductCatalogBySpecialtyGroup(
  items: ProductCatalogItem[]
): ProductCatalogSpecialtyGroup[] {
  const byGroup = new Map<SpecialtyGroupId, ProductCatalogItem[]>();

  for (const item of items) {
    if (item.category !== "specialty_add_on") continue;
    const groupId = item.specialtyGroup;
    if (!groupId) continue;
    const list = byGroup.get(groupId) ?? [];
    list.push(item);
    byGroup.set(groupId, list);
  }

  const sortItems = (a: ProductCatalogItem, b: ProductCatalogItem) => {
    const ao = a.specialtySortOrder ?? 999;
    const bo = b.specialtySortOrder ?? 999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  };

  return SPECIALTY_GROUP_ORDER.filter((id) => (byGroup.get(id)?.length ?? 0) > 0).map((groupId) => ({
    groupId,
    label: SPECIALTY_GROUP_LABELS[groupId],
    items: [...(byGroup.get(groupId) ?? [])].sort(sortItems),
  }));
}
