export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return String(Math.round(Number(value)));
}

/** Trusted Moraware worksheet SqFt for Account 360 (e.g. 1,283.5 SF). */
export function formatSqft(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const text = n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 1
  });
  return `${text} SF`;
}

/** Job count label: "13 Jobs" / "1 Job" / "0 Jobs". Null when unavailable. */
export function formatJobsLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Math.round(Number(value));
  return `${n.toLocaleString("en-US")} ${n === 1 ? "Job" : "Jobs"}`;
}
