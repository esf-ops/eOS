export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return String(Math.round(Number(value)));
}
