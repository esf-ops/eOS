const finite = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const roundMoney = (value) => {
  const n = finite(value);
  return n == null ? null : Math.round(n * 100) / 100;
};

const roundOne = (value) => {
  const n = finite(value);
  return n == null ? null : Math.round(n * 10) / 10;
};

export function normalizeFinanceLabel(value) {
  return String(value ?? "")
    .replace(/(\s)\uFFFD(?=\s)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function percentagePointChange(current, previous) {
  const a = finite(current);
  const b = finite(previous);
  return a == null || b == null ? null : roundOne(a - b);
}

export function moneyDelta(current, previous) {
  const a = finite(current);
  const b = finite(previous);
  return a == null || b == null ? null : roundMoney(a - b);
}

export function concentrationShare(rows, total, count = 5, amountKey = "open_amount") {
  const denominator = finite(total);
  if (denominator == null || denominator <= 0 || !Array.isArray(rows) || !rows.length) return null;
  const sum = [...rows]
    .map((row) => finite(row?.[amountKey]))
    .filter((value) => value != null)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, Number(count) || 5))
    .reduce((acc, value) => acc + value, 0);
  return roundOne((sum / denominator) * 100);
}

export function agingOver60(buckets) {
  if (!buckets || typeof buckets !== "object") return null;
  const days6190 = finite(buckets.days_61_90);
  const days90Plus = finite(buckets.days_90_plus);
  if (days6190 == null || days90Plus == null) return null;
  return roundMoney(days6190 + days90Plus);
}

export function periodMonthLabel(periodStart) {
  const s = String(periodStart || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const month = Number(s.slice(5, 7));
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels[month - 1] || null;
}

export function buildPnlInsights(current, previous) {
  if (!current?.headline || !previous?.headline) return [];
  const currentLabel = periodMonthLabel(current.period_start);
  const previousLabel = periodMonthLabel(previous.period_start);
  if (!currentLabel || !previousLabel) return [];

  const statements = [];
  const marginDelta = percentagePointChange(
    current.headline.gross_margin_pct,
    previous.headline.gross_margin_pct
  );
  if (marginDelta != null) {
    const direction = marginDelta > 0 ? "increased" : marginDelta < 0 ? "decreased" : "was unchanged";
    const amount = Math.abs(marginDelta).toFixed(1);
    statements.push(
      marginDelta === 0
        ? `${currentLabel} gross margin was unchanged from ${previousLabel}.`
        : `${currentLabel} gross margin ${direction} ${amount} percentage points from ${previousLabel}.`
    );
  }

  const currentNi = finite(current.headline.net_income);
  const previousNi = finite(previous.headline.net_income);
  if (currentNi != null && previousNi != null && currentNi < 0 && previousNi >= 0) {
    statements.push(`${currentLabel} net income is negative while ${previousLabel} was positive.`);
  } else if (currentNi != null && previousNi != null && currentNi >= 0 && previousNi < 0) {
    statements.push(`${currentLabel} net income is positive while ${previousLabel} was negative.`);
  }

  const revenueDelta = moneyDelta(current.headline.revenue, previous.headline.revenue);
  if (revenueDelta != null) {
    const direction = revenueDelta > 0 ? "higher" : revenueDelta < 0 ? "lower" : "unchanged";
    statements.push(
      revenueDelta === 0
        ? `${currentLabel} revenue is unchanged from ${previousLabel}.`
        : `${currentLabel} revenue is ${direction} than ${previousLabel} by ${formatInsightMoney(Math.abs(revenueDelta))}.`
    );
  }
  return statements;
}

export function buildArInsights(ar) {
  if (!ar || ar.aging?.state !== "available") return [];
  const statements = [];
  const total = finite(ar.total?.value);
  const share = concentrationShare(ar.customers, total, 5);
  if (share != null) {
    statements.push(`The five largest receivable balances represent ${share.toFixed(1)}% of open A/R.`);
  }
  const over60 = agingOver60(ar.aging?.buckets);
  if (over60 != null) {
    statements.push(`${formatInsightMoney(over60)} of receivables is more than 60 days overdue.`);
  }
  return statements;
}

export function buildApInsights(ap) {
  if (!ap) return [];
  const statements = [];
  const total = finite(ap.total?.value);
  const share = concentrationShare(ap.vendors, total, 5);
  if (share != null) {
    statements.push(`The five largest vendor balances represent ${share.toFixed(1)}% of open A/P.`);
  }
  const overdue = finite(ap.overdue?.value);
  if (overdue != null && total != null && total > 0) {
    statements.push(`${roundOne((overdue / total) * 100).toFixed(1)}% of open A/P is past due.`);
  }
  return statements;
}

export function formatInsightMoney(value) {
  const n = finite(value);
  if (n == null) return null;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return n < 0 ? `(${formatted})` : formatted;
}
