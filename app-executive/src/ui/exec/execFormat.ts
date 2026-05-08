/** Shared formatting helpers for Executive Head. */

export function nf(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, opts).format(n);
}

export function fmtDate(dt: unknown) {
  if (!dt) return "—";
  try {
    return new Date(String(dt)).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return String(dt);
  }
}

export function fmtYmd(dt: unknown) {
  if (!dt) return "—";
  const s = String(dt);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Professional label for blank Moraware salesperson values. */
export function displaySalesperson(raw: unknown) {
  const t = String(raw ?? "").trim();
  if (!t || t === "(blank)") return "Unassigned / Missing";
  return t;
}

export function isUnassignedSalesperson(raw: unknown) {
  const t = String(raw ?? "").trim();
  return !t || t === "(blank)";
}

/** Blank / unknown accounts from Brain / Moraware aggregates. */
export function displayAccountName(raw: unknown) {
  const t = String(raw ?? "").trim();
  if (!t || t === "(blank)") return "Unknown account";
  return t;
}
