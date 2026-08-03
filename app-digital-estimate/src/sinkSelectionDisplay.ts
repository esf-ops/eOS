type SinkChoice = {
  sourceKind?: string | null;
  selected?: boolean;
};

type ProductLike = {
  productId?: string | null;
  optionKey?: string | null;
  variants?: Array<VariantLike> | null;
};

type VariantLike = {
  variantId?: string | null;
  sku?: string | null;
  optionKey?: string | null;
  finish?: string | null;
  color?: string | null;
  displayName?: string | null;
};

export type SinkModalSelection = {
  optionKey?: string | null;
  productId?: string | null;
  variantId?: string | null;
  variantSku?: string | null;
  finish?: string | null;
};

/**
 * A finish-specific saved option key may be more specific than the product-level
 * envelope option. In that case the view model falls back to the baseline
 * "none" / "customer_provided" choice even though the persisted customer draft
 * still identifies the selected ESF product. Preserve that persisted product
 * instead of displaying a false "No sink" or "Customer-provided · …".
 */
export function shouldPreservePersistedSinkDraft(
  selected: SinkChoice | null | undefined,
  persistedSource: string | null | undefined,
): boolean {
  if (!persistedSource || persistedSource === "none") return false;
  if (selected?.selected === true) return false;
  return (
    selected?.sourceKind === "none" ||
    (selected?.sourceKind === "customer_provided" &&
      (persistedSource === "esf" || persistedSource === "stock"))
  );
}

/**
 * Canonical envelope option key for an ESF sink/faucet selection.
 * Finish/variant identity lives in the product draft — never in a longer option key.
 */
export function canonicalEsfPlumbingOptionKey(
  optionKey: string | null | undefined,
  envelopeOptionKeys?: Iterable<string> | null,
): string | null {
  const key = String(optionKey || "").trim();
  if (!key) return null;
  if (!envelopeOptionKeys) return key;
  const set = envelopeOptionKeys instanceof Set ? envelopeOptionKeys : new Set(envelopeOptionKeys);
  if (set.has(key)) return key;
  const parts = key.split(":");
  if (parts.length < 4 || parts[2] !== "esf") return key;
  const role = parts[0];
  if (role !== "sink" && role !== "faucet") return key;
  // Walk off finish/variant suffixes until a seeded family key matches.
  for (let end = parts.length - 1; end >= 4; end -= 1) {
    const candidate = parts.slice(0, end).join(":");
    if (set.has(candidate)) return candidate;
  }
  return key;
}

function norm(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** True when the catalog product card matches the persisted sink/faucet draft. */
export function isPlumbingProductCardSelected(
  product: ProductLike,
  selection: SinkModalSelection | null | undefined,
): boolean {
  if (!selection) return false;
  const selectedProductId = norm(selection.productId);
  const selectedKey = norm(selection.optionKey);
  if (selectedProductId && norm(product.productId) === selectedProductId) return true;
  if (selectedKey && norm(product.optionKey) === selectedKey) return true;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (selectedKey && variants.some((v) => norm(v.optionKey) === selectedKey)) return true;
  if (
    selectedProductId &&
    selectedKey &&
    selectedKey.includes(`esf:${selectedProductId}`) &&
    norm(product.productId) === selectedProductId
  ) {
    return true;
  }
  return false;
}

/** True when a finish/color row matches the persisted draft. */
export function isPlumbingFinishSelected(
  variant: VariantLike,
  selection: SinkModalSelection | null | undefined,
): boolean {
  if (!selection) return false;
  const selectedVariant = norm(selection.variantId || selection.variantSku);
  const selectedKey = norm(selection.optionKey);
  const selectedFinish = norm(selection.finish);
  if (selectedVariant) {
    if (norm(variant.variantId) === selectedVariant) return true;
    if (norm(variant.sku) === selectedVariant) return true;
  }
  if (selectedKey && norm(variant.optionKey) === selectedKey) return true;
  if (selectedFinish) {
    if (norm(variant.finish) === selectedFinish) return true;
    if (norm(variant.color) === selectedFinish) return true;
  }
  return false;
}

/** Product family id to auto-expand so the selected finish row is visible. */
export function openFamilyIdForSelection(
  products: ProductLike[],
  selection: SinkModalSelection | null | undefined,
): string | null {
  if (!selection) return null;
  for (const product of products) {
    if (!isPlumbingProductCardSelected(product, selection)) continue;
    const id = String(product.productId || "").trim();
    if (id) return id;
  }
  return null;
}
