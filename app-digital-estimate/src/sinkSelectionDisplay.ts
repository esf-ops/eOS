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
 * "none" choice even though the persisted customer draft still identifies the
 * selected product. Preserve that persisted product instead of displaying a
 * false "No sink".
 */
export function shouldPreservePersistedSinkDraft(
  selected: SinkChoice | null | undefined,
  persistedSource: string | null | undefined,
): boolean {
  return (
    selected?.sourceKind === "none" &&
    selected.selected !== true &&
    Boolean(persistedSource) &&
    persistedSource !== "none"
  );
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
