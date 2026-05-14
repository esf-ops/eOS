/** Whole dollars for command-center tables and metrics. */
export function formatMoneyWhole(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Standard currency for detail / precision contexts. */
export function formatMoneyStandard(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatSqft(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft`;
}

export function formatShortDate(iso: unknown): string {
  const s = iso == null ? "" : String(iso).trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: unknown): string {
  const s = iso == null ? "" : String(iso).trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
