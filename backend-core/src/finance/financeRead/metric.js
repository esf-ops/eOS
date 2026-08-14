import { FINANCE_METRIC_STATES } from "./constants.js";

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function roundPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

export function metric({
  key,
  label,
  value = null,
  state = FINANCE_METRIC_STATES.UNAVAILABLE,
  source = null,
  as_of = null,
  period_start = null,
  period_end = null,
  is_derived = false,
  notes = null
}) {
  const numeric = value == null ? null : roundMoney(value);
  let resolved = state;
  if (numeric == null) {
    resolved =
      state === FINANCE_METRIC_STATES.STALE || state === FINANCE_METRIC_STATES.WARNING
        ? FINANCE_METRIC_STATES.UNAVAILABLE
        : state === FINANCE_METRIC_STATES.AVAILABLE
          ? FINANCE_METRIC_STATES.UNAVAILABLE
          : state;
  }
  return {
    key,
    label,
    value: numeric,
    state: resolved,
    source,
    as_of,
    period_start,
    period_end,
    is_derived: is_derived === true,
    notes
  };
}

export function unavailable(key, label, notes, extra = {}) {
  return metric({
    key,
    label,
    value: null,
    state: FINANCE_METRIC_STATES.UNAVAILABLE,
    notes,
    ...extra
  });
}

export function available(key, label, value, extra = {}) {
  return metric({
    key,
    label,
    value,
    state: extra.state || FINANCE_METRIC_STATES.AVAILABLE,
    ...extra
  });
}

export function applyFreshness(m, freshness) {
  if (!m || m.value == null) return m;
  if (freshness === "stale" && m.state === FINANCE_METRIC_STATES.AVAILABLE) {
    return { ...m, state: FINANCE_METRIC_STATES.STALE };
  }
  if (freshness === "warning" && m.state === FINANCE_METRIC_STATES.AVAILABLE) {
    return { ...m, state: FINANCE_METRIC_STATES.WARNING };
  }
  return m;
}

export function ratioPct(numerator, denominator) {
  const n = roundMoney(numerator);
  const d = roundMoney(denominator);
  if (n == null || d == null || d === 0) return null;
  return roundPct((n / d) * 100);
}

export function variance(current, prior) {
  const a = roundMoney(current);
  const b = roundMoney(prior);
  if (a == null || b == null) {
    return { dollar: null, percent: null };
  }
  const dollar = roundMoney(a - b);
  const percent = b === 0 ? null : roundPct((a - b) / Math.abs(b) * 100);
  return { dollar, percent };
}
