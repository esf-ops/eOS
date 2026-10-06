/**
 * Estimate Builder document contracts — mirrors `backend-core/src/estimateBuilder/estimateBuilderContracts.mjs`.
 * Documents never carry a price; every line amount comes back from `POST /api/estimate-builder/price`.
 */

export type PricingChannel = "direct" | "wholesale";

export type ItemProvenance =
  | "manually_added"
  | "imported_unmodified"
  | "imported_edited"
  | "imported_excluded"
  | "template"
  | "duplicated";

export type ItemSourceKind = "manual" | "template" | "ai_takeoff" | "digital_estimate" | "duplicate";

export type ItemSource = {
  kind: ItemSourceKind;
  provenance: ItemProvenance;
  reference: string | null;
};

export type EliteCountertopInputs = {
  sqft: number | null;
  materialColorId: string | null;
  materialColorName: string;
};

/** Custom slab package: slabs = ceil(sf × (1 + waste) ÷ slab area); price = slabs × cost × 2.25 (Brain). */
export type OutOfCollectionInputs = {
  sqft: number | null;
  materialName: string;
  supplier: string;
  slabLengthIn: number | null;
  slabWidthIn: number | null;
  costPerSlab: number | null;
  /** Null = the default waste allowance (catalog `outOfCollection.defaultWastePercent`). */
  wastePercent: number | null;
  /** Null = use the calculated slab count. */
  slabQuantityOverride: number | null;
  overrideReason: string;
};

export type BacksplashInputs = {
  sqft: number | null;
  materialSource: "room_countertop" | "explicit";
  materialColorId: string | null;
  materialColorName: string;
};

export type VanitySinkType = "oval_white" | "oval_bisque" | "rectangular_white" | "rectangular_bisque";
export type VanityTier = "kitchen_over_35" | "kitchen_under_35";

export type VanityInputs = {
  sizeCode: string;
  qty: number;
  sinkType: VanitySinkType;
  sideSplashQty: number;
  extraTrips: number;
  depthIn: number | null;
  materialColorId: string | null;
  materialColorName: string;
  tierOverride: VanityTier | null;
  tierOverrideReason: string;
};

export type CutoutInputs = { cutoutCode: string; qty: number };
export type OutletInputs = { qty: number };

export type EdgeMode = "upgraded" | "mitered" | "manual";
export type EdgeInputs = {
  edgeMode: EdgeMode;
  profile: string;
  linearFeet: number | null;
  miterHeight: string;
  buildUpSqft: number | null;
  manualAmount: number | null;
  manualReason: string;
  customerLabel: string;
};

export type ServiceCode = "additional_trip" | "tear_out";
export type ServiceInputs = { serviceCode: ServiceCode; qty: number };

export type CustomCategory = "other" | "labor" | "fee" | "sink" | "faucet" | "accessory" | "credit";
export type CustomInputs = {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  category: CustomCategory;
  customerFacing: boolean;
  customerNote: string;
  internalNote: string;
};

/** QuickBooks-style description-only line (no amount). */
export type NoteInputs = { text: string };

/** ESF plumbing catalog product (sink, faucet, accessory, specialty). `variantId` is the Blanco finish/SKU. */
export type ProductInputs = { productId: string | null; variantId: string | null; qty: number };

type ItemBase = {
  id: string;
  roomId: string | null;
  sortOrder: number;
  label: string;
  /** Customer option (countertop / backsplash / vanity only): priced and shown, not included in the total. */
  optional?: boolean;
  source: ItemSource;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EstimateItem =
  | (ItemBase & { itemType: "countertop"; pricingStrategy: "elite_100"; inputs: EliteCountertopInputs })
  | (ItemBase & { itemType: "countertop"; pricingStrategy: "out_of_collection"; inputs: OutOfCollectionInputs })
  | (ItemBase & { itemType: "backsplash"; pricingStrategy: "standard" | "full_height"; inputs: BacksplashInputs })
  | (ItemBase & { itemType: "vanity"; pricingStrategy: "vanity_program_2026"; inputs: VanityInputs })
  | (ItemBase & { itemType: "cutout"; pricingStrategy: "addon_catalog"; inputs: CutoutInputs })
  | (ItemBase & { itemType: "outlet"; pricingStrategy: "addon_catalog"; inputs: OutletInputs })
  | (ItemBase & { itemType: "edge"; pricingStrategy: "edge_v2"; inputs: EdgeInputs })
  | (ItemBase & { itemType: "service"; pricingStrategy: "service_catalog"; inputs: ServiceInputs })
  | (ItemBase & { itemType: "product"; pricingStrategy: "esf_catalog"; inputs: ProductInputs })
  | (ItemBase & { itemType: "custom"; pricingStrategy: "custom_line"; inputs: CustomInputs })
  | (ItemBase & { itemType: "note"; pricingStrategy: "text"; inputs: NoteInputs });

export type ItemType = EstimateItem["itemType"];
export type PricingStrategy = EstimateItem["pricingStrategy"];

export type EstimateRoom = { id: string; name: string; sortOrder: number };

export type EstimateHeader = {
  customerName: string;
  accountName: string;
  customerEmail: string;
  customerPhone: string;
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  zip: string;
  /** Display label; the Brain sets it from `branchCode` when the org has a directory. */
  branch: string;
  branchCode: string;
  salesRep: string;
  salesRepCode: string;
  /** QuickBooks customer ListID for the account (Brain-verified at save). */
  qbCustomerListId: string;
  preparedBy: string;
  billToAddress: string;
  county: string;
  poNumber: string;
  customerMessage: string;
  customerNotes: string;
  internalNotes: string;
};

export type EstimateDocument = {
  version: 1;
  pricingChannel: PricingChannel;
  header: EstimateHeader;
  rooms: EstimateRoom[];
  items: EstimateItem[];
};

// --- Pricing response (Brain-authored) ---

export type WarningSeverity = "block" | "warn" | "review";
export type ItemWarning = { code: string; severity: WarningSeverity; message: string };

export type PricedItem = {
  itemId: string;
  itemType: ItemType;
  pricingStrategy: PricingStrategy;
  roomId: string | null;
  optional?: boolean;
  status: "priced" | "incomplete" | "error" | "note";
  description: string;
  customerCategory: string;
  quantity: number | null;
  unit: string;
  rate: number | null;
  /** Final line amount: exact + material use tax, rounded up to the next $5 (credits exact). */
  amount: number;
  exactAmount: number;
  useTaxAmount: number;
  roundingAdjustment: number;
  taxBase: { countertop: number; backsplash: number };
  warnings: ItemWarning[];
  details: Array<{ label: string; value: string }>;
  pricingSource: { engine: string; reference: string };
  /** Out-of-Collection slab math (calculated vs priced slab count). */
  slabs?: { suggested: number; priced: number; slabAreaSf: number; requiredWithWasteSf: number; wastePercent: number };
};

export type EstimateTotals = {
  subtotal: number;
  useTax: {
    percent: number;
    scope: string;
    appliedTo?: string;
    countertopBase: number;
    backsplashBase: number;
    countertopAmount: number;
    backsplashAmount: number;
    amount: number;
  };
  exactTotal: number;
  roundingAdjustment: number;
  total: number;
  qualifyingKitchenCounterSf: number;
  itemCount: number;
  pricedCount: number;
  noteCount: number;
  /** Priced options — shown to the customer, not included in `total`. */
  options?: { count: number; total: number };
};

export type EstimatePricing = {
  ok: boolean;
  pricingChannel: PricingChannel;
  items: PricedItem[];
  totals: EstimateTotals;
  readiness: { ready: boolean; blockers: string[] };
  customerPreview?: unknown;
  pdfFilename?: string;
};

// --- Catalog (labels, plus catalog product sell prices) ---

export type EstimateTemplate = {
  id: string;
  label: string;
  rooms: string[];
  items: Array<{ room: string; itemType: ItemType; pricingStrategy: PricingStrategy; inputs: Record<string, unknown> }>;
};

export type MaterialColor = {
  id: string;
  colorName: string;
  priceGroupLabel: string;
  supplier: string | null;
  materialType: string | null;
};

export type ProductTab = "sinks" | "faucets" | "accessories" | "specialty";
export type RoomEligibility = "kitchen" | "bar_prep" | "vanity" | "laundry_utility";

/** Staff catalog product: sell (customer) price only — never cost or margin. */
export type CatalogProduct = {
  productId: string;
  tab: ProductTab;
  categoryLabel: string;
  manufacturer: string;
  collection: string | null;
  displayName: string;
  sku: string | null;
  /** Null for families priced per finish (see `variants`). */
  price: number | null;
  stock: boolean;
  roomEligibility: RoomEligibility[];
  /** Cutout add-on code this product needs (`qty-sink` / `qty-bar`), or null. */
  cutoutCode: string | null;
  /** `style` is the configuration that tells same-finish variants apart (e.g. "Low Divide"); may be empty. */
  variants: Array<{ variantId: string; finish: string; style: string; sku: string; price: number; stock: boolean }>;
};

export type EstimateCatalog = {
  ok: boolean;
  itemTypes: Array<{ type: ItemType; label: string; strategies: PricingStrategy[]; defaultStrategy: PricingStrategy }>;
  materialColors: MaterialColor[];
  materialCatalogWarnings: string[];
  cutouts: Array<{ code: string; label: string }>;
  services: Array<{ code: ServiceCode; label: string }>;
  edge: { upgradedProfiles: string[]; miterHeights: string[] };
  vanity: {
    programYear: number;
    sizes: Array<{ code: string; label: string; widthIn: number; bowlCount: number }>;
    sinkTypes: Array<{ code: VanitySinkType; label: string }>;
  };
  outOfCollection: { costMultiplier: number; defaultWastePercent: number };
  products: { sourceVersion: string | null; tabs: Array<{ key: ProductTab; label: string }>; products: CatalogProduct[] };
  customCategories: CustomCategory[];
  roomSuggestions: string[];
  templates: EstimateTemplate[];
  directory?: EstimatingDirectory;
};

export type QbLinkStatus = "linked" | "missing" | "inactive" | "unmapped";

/** Org branch / sales rep choices, each tied to a QuickBooks ListID (Brain-resolved). */
export type EstimatingDirectory = {
  configured: boolean;
  unavailable?: boolean;
  branches: Array<{ code: string; label: string; quickbooks: { classListId: string | null; classFullName: string | null; status: QbLinkStatus } }>;
  salesReps: Array<{
    code: string;
    name: string;
    quickbooks: { salesRepListId: string | null; initials: string | null; fullName: string | null; status: QbLinkStatus };
  }>;
};

export type QbCustomer = { listId: string; fullName: string; city: string | null; state: string | null };

export type QuickbooksRefs = {
  customer: { listId: string; fullName: string } | null;
  class: { listId: string; fullName: string } | null;
  salesRep: { listId: string; initials: string; fullName: string } | null;
  ready: boolean;
  issues: Array<{ code: string; message: string }>;
};

export type SaveMode = "create" | "update_existing" | "save_revision";

export type SaveResult = {
  ok: boolean;
  quote_id: string;
  quote_number: string;
  revision_number: number;
  revision_label: string | null;
  save_mode: SaveMode;
  quote_status: string;
  pricing: EstimatePricing;
  /** Document as stored (header labels resolved from the directory by the Brain). */
  document?: EstimateDocument;
  quickbooks: QuickbooksRefs | null;
  /** Plans & files linked on this save (`error` when linking failed; the quote itself saved). */
  files?: { linked: number; moved: number; error: string | null } | null;
};

/** `quote_files` metadata from `/api/quote-files` (never a storage path). */
export type QuoteFile = {
  id: string;
  originalFilename: string;
  fileRole: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
};

export type SavedQuoteSummary = {
  id: string;
  quote_number: string;
  revision_label: string | null;
  quote_status: string | null;
  customer_name: string | null;
  account_name: string | null;
  project_name: string | null;
  grand_total: number | null;
  updated_at: string | null;
};

export type SavedQuoteRef = {
  id: string;
  quote_number: string;
  revision_number: number | null;
  revision_label: string | null;
  quote_status: string | null;
  is_current_revision: boolean;
  archived_at: string | null;
  updated_at: string | null;
};

/** What Brain persisted for a saved estimate: authoritative total, customer PDF total, and the frozen PDF snapshot. */
export type SavedPrint = {
  grand_total: number | null;
  customer_display_total: number | null;
  customer_print_snapshot: unknown;
  pdf_filename: string;
  has_proposal: boolean;
  proposal_total: number | null;
  proposal_filename: string | null;
};

export type ProposalPreview = {
  ok: boolean;
  html: string;
  total: number;
  skippedIncomplete: number;
  filename: string;
};

export type LoadedQuote = {
  ok: boolean;
  quote: SavedQuoteRef;
  document: EstimateDocument;
  pricing: EstimatePricing;
  savedPricing: EstimateTotals | null;
  quickbooks: QuickbooksRefs | null;
  saved: SavedPrint;
};
