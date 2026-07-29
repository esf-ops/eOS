/**
 * Canonical customer-visible cutout labels (display only — amounts come from
 * the authoritative calculator / frozen snapshot, never re-derived here).
 */

export const CUSTOMER_SAFE_CUTOUT_LABELS = Object.freeze({
  kitchenSink: "Kitchen sink cutout",
  vanityBarSink: "Vanity/bar sink cutout",
  cooktop: "Cooktop cutout",
  outlet: "Electrical outlet cutout"
});

/** Alias patterns that must collapse to one customer-visible line per charge family. */
const CUTOUT_ALIAS_FAMILIES = Object.freeze([
  {
    key: "kitchenSink",
    label: CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink,
    match: /kitchen\s*(—|-)?\s*sink\s*cutouts?|^sink\s*cutouts?$|^cutouts$/i
  },
  {
    key: "vanityBarSink",
    label: CUSTOMER_SAFE_CUTOUT_LABELS.vanityBarSink,
    match: /vanity\s*\/?\s*bar\s*sink\s*cutouts?|vanity\s*sink\s*cutouts?|bar\s*\/?\s*prep\s*sink\s*cutouts?/i
  },
  {
    key: "cooktop",
    label: CUSTOMER_SAFE_CUTOUT_LABELS.cooktop,
    match: /cooktop\s*cutouts?/i
  },
  {
    key: "outlet",
    label: CUSTOMER_SAFE_CUTOUT_LABELS.outlet,
    match: /electrical\s*outlet\s*cutouts?|outlet\s*cutouts?/i
  }
]);

/**
 * @param {string|null|undefined} label
 * @returns {{ key: string, label: string }|null}
 */
export function classifyCutoutDisplayLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return null;
  // Prefer specific families before the generic "Cutouts" / "Sink cutout" catch-alls.
  for (const family of CUTOUT_ALIAS_FAMILIES) {
    if (family.key === "kitchenSink") continue;
    if (family.match.test(raw)) return { key: family.key, label: family.label };
  }
  const kitchen = CUTOUT_ALIAS_FAMILIES.find((f) => f.key === "kitchenSink");
  if (kitchen && kitchen.match.test(raw)) return { key: kitchen.key, label: kitchen.label };
  return null;
}

/**
 * Collapse alias cutout lines into one canonical line per family.
 * Preserves non-cutout lines. Amounts are summed per family (so a true
 * double-display of the same $200 charge collapses to one $200 when both
 * lines carry $200 and a later total check asserts equality — callers that
 * know the authoritative single charge should pass `authoritativeByKey`).
 *
 * @param {Array<{ label?: string, amount?: number, amountCents?: number, category?: string, [k: string]: unknown }>} lines
 * @param {{ authoritativeByKey?: Record<string, number>, amountUnit?: 'dollars'|'cents' }} [opts]
 */
export function dedupeCustomerSafeCutoutLines(lines, opts = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const amountUnit = opts.amountUnit === "cents" ? "cents" : "dollars";
  const amountKey = amountUnit === "cents" ? "amountCents" : "amount";
  const authoritative = opts.authoritativeByKey || null;
  /** @type {Map<string, { line: object, amount: number }>} */
  const byFamily = new Map();
  /** @type {object[]} */
  const kept = [];

  for (const line of list) {
    const classified = classifyCutoutDisplayLabel(line?.label);
    if (!classified) {
      kept.push(line);
      continue;
    }
    const amount = Number(line?.[amountKey] ?? line?.amount ?? line?.amountCents) || 0;
    const prev = byFamily.get(classified.key);
    if (!prev) {
      byFamily.set(classified.key, {
        line: { ...line, label: classified.label, [amountKey]: amount },
        amount
      });
    } else {
      // Same governed charge shown twice at the full rate → keep one full rate.
      // Partial split (rare) → sum. Prefer authoritative when provided.
      const nextAmount =
        authoritative && authoritative[classified.key] != null
          ? Number(authoritative[classified.key]) || 0
          : Math.abs(prev.amount - amount) < 0.001 && amount !== 0
            ? amount
            : prev.amount + amount;
      byFamily.set(classified.key, {
        line: { ...prev.line, label: classified.label, [amountKey]: nextAmount },
        amount: nextAmount
      });
    }
  }

  for (const { line } of byFamily.values()) {
    if ((Number(line[amountKey]) || 0) === 0 && !line.keepZero) continue;
    kept.push(line);
  }
  return kept;
}

/**
 * Build typed customer-safe cutout lines from calculator cutouts object.
 * @param {{ kitchenSinkCharge?: number, vanitySinkCharge?: number, cooktopCharge?: number, electricalOutletCharge?: number }|null|undefined} cutouts
 */
export function customerSafeCutoutLinesFromCharges(cutouts) {
  const c = cutouts && typeof cutouts === "object" ? cutouts : {};
  /** @type {Array<{ label: string, amount: number }>} */
  const lines = [];
  const push = (label, amount) => {
    const a = Math.round((Number(amount) || 0) * 100) / 100;
    if (a > 0) lines.push({ label, amount: a });
  };
  push(CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink, c.kitchenSinkCharge);
  push(CUSTOMER_SAFE_CUTOUT_LABELS.vanityBarSink, c.vanitySinkCharge);
  push(CUSTOMER_SAFE_CUTOUT_LABELS.cooktop, c.cooktopCharge);
  push(CUSTOMER_SAFE_CUTOUT_LABELS.outlet, c.electricalOutletCharge);
  return lines;
}
