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
 * Collapse exclusive-role duplicates in a qty map (ESF sink beats customer_provided).
 * Frontend defense so room cards never show dual selected states if a stale
 * payload still contains both keys.
 */
export function collapseExclusiveRoomQuantities(
  quantities: Record<string, number> | null | undefined,
): Record<string, number> {
  const EXCLUSIVE = new Set(["material", "sink", "faucet", "backsplash", "edge", "cooktop"]);
  const working: Record<string, number> = { ...(quantities || {}) };

  const priority = (key: string): number => {
    const parts = key.split(":");
    if (parts.length < 3) return 0;
    const role = parts[0];
    const token = parts.slice(2).join(":").toLowerCase();
    if (role === "sink" || role === "faucet") {
      if (token.startsWith("esf:") || token === "esf") return 100;
      if (token.startsWith("customer")) return 50;
      if (token === "none") return 40;
      return 60;
    }
    if (role === "backsplash") {
      if (token === "none") return 90;
      if (token === "standard_4in") return 70;
      return 60;
    }
    return 100;
  };

  const groups = new Map<string, string[]>();
  for (const [key, qty] of Object.entries(working)) {
    if (!(Number(qty) > 0)) continue;
    const parts = key.split(":");
    if (parts.length < 3 || !EXCLUSIVE.has(parts[0])) continue;
    const id = `${parts[0]}:${parts[1]}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(key);
  }
  for (const keys of groups.values()) {
    if (keys.length < 2) continue;
    keys.sort((a, b) => priority(b) - priority(a) || a.localeCompare(b));
    for (const loser of keys.slice(1)) working[loser] = 0;
  }
  return working;
}

/**
 * Drop customer-provided sink/faucet add-on lines when ESF (or none) won.
 */
export function filterAddOnLinesForExclusiveSelections(
  addOnLines: Array<{ label?: string; amount?: number | null; category?: string | null }> | null | undefined,
  quantities: Record<string, number>,
): Array<{ label?: string; amount?: number | null; category?: string | null }> {
  const lines = Array.isArray(addOnLines) ? addOnLines : [];
  const collapsed = collapseExclusiveRoomQuantities(quantities);
  let esfSink = false;
  let noneSink = false;
  for (const [key, qty] of Object.entries(collapsed)) {
    if (!(Number(qty) > 0) || !key.startsWith("sink:")) continue;
    const token = key.split(":").slice(2).join(":");
    if (token.startsWith("esf:") || token === "esf") esfSink = true;
    if (token === "none") noneSink = true;
  }
  if (!esfSink && !noneSink) return lines;
  const seen = new Set<string>();
  const out: typeof lines = [];
  for (const line of lines) {
    const label = String(line?.label || "");
    const lower = label.toLowerCase();
    if (/cutout/.test(lower)) {
      out.push(line);
      continue;
    }
    if (/customer-provided|customer provided/.test(lower)) continue;
    if (noneSink && (/^sink\b/i.test(label) || String(line?.category || "").toLowerCase() === "sink")) {
      continue;
    }
    const key = lower.trim();
    if (esfSink && (/^sink\b/i.test(label) || String(line?.category || "").toLowerCase() === "sink")) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(line);
  }
  return out;
}

/**
 * When a room's add-on list already contains an ESF sink line, drop
 * customer-provided sink duplicates (stale calc projections).
 */
export function dedupeExclusiveSinkAddOnLines<
  T extends { label?: string; amount?: number | null; category?: string | null },
>(addOnLines: T[] | null | undefined): T[] {
  const lines = Array.isArray(addOnLines) ? addOnLines : [];
  const hasEsfSink = lines.some((line) => {
    const label = String(line.label || "");
    const category = String(line.category || "").toLowerCase();
    if (/cutout|customer-provided|customer provided/i.test(label)) return false;
    return category === "sink" || /^sink\b/i.test(label) || /esf sink/i.test(label);
  });
  if (!hasEsfSink) return lines;
  const seen = new Set<string>();
  return lines.filter((line) => {
    const label = String(line.label || "");
    const lower = label.toLowerCase();
    if (/cutout/.test(lower)) return true;
    if (/customer-provided|customer provided/.test(lower)) return false;
    const category = String(line.category || "").toLowerCase();
    if (category === "sink" || /^sink\b/i.test(label)) {
      if (seen.has(lower)) return false;
      seen.add(lower);
    }
    return true;
  });
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
