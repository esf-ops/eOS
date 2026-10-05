const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(n: number | null | undefined): string {
  return Number.isFinite(Number(n)) ? money.format(Number(n)) : "—";
}

export function formatQty(n: number | null | undefined, unit?: string): string {
  if (!Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${s} ${unit}` : s;
}

/** Parse a numeric input; empty string → null so the Brain reports the item as incomplete. */
export function parseNum(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function numValue(v: unknown): string {
  return v == null || v === "" ? "" : String(v);
}
