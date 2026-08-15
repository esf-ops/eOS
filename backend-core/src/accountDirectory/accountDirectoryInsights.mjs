/**
 * Account 360 Insights — deterministic, staff-safe, evidence-backed.
 * No AI. No customer profitability. No fuzzy joins.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  roleHasCapability
} from "./accountDirectoryAuth.mjs";
import { getAccountDirectoryFinancials } from "./accountDirectoryFinancialIntelligence.mjs";
import { getAccountDirectoryRelationship } from "./accountDirectory360.mjs";
import { scrubAccount360Payload } from "./accountDirectoryStaffSafeFinancials.mjs";

export const INSIGHT_IDS = Object.freeze([
  "estimate_win_rate",
  "quote_to_order_ratio",
  "account_momentum",
  "payment_pattern",
  "open_opportunity",
  "relationship_activity",
  "account_outlook"
]);

const INTERNAL_OPEN = new Set([
  "draft",
  "testing_review",
  "sent",
  "follow_up",
  "revised",
  "submitted",
  "lead_submitted",
  "reviewing",
  "contacted",
  "quoted"
]);
const INTERNAL_WON = new Set(["sold", "won"]);
const INTERNAL_LOST = new Set(["lost"]);
const STUDIO_OPEN = new Set([
  "draft",
  "needs_takeoff_approval",
  "ready_to_price",
  "priced",
  "approved"
]);

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function pct(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}

function statusOf(row) {
  return String(row?.quote_status || row?.status || "")
    .trim()
    .toLowerCase();
}

function card(partial) {
  return {
    id: partial.id,
    title: partial.title,
    state: partial.state || "ok",
    value: partial.value ?? null,
    valueType: partial.valueType || "text",
    interpretation: partial.interpretation || "",
    period: partial.period || null,
    evidenceSummary: partial.evidenceSummary || [],
    evidenceAvailable: Boolean(partial.evidenceAvailable),
    limitations: partial.limitations || []
  };
}

/**
 * True cross-system Estimate Win Rate is not supportable: Studio/DE lack lost.
 * Internal sold/(sold+lost) is returned only when both dispositions exist.
 */
export function computeEstimateWinRate({ internalItems = [] } = {}) {
  const closedWon = [];
  const closedLost = [];
  const open = [];
  const excluded = [];
  for (const row of internalItems) {
    const st = statusOf(row);
    if (INTERNAL_WON.has(st)) closedWon.push(row);
    else if (INTERNAL_LOST.has(st)) closedLost.push(row);
    else if (INTERNAL_OPEN.has(st)) open.push(row);
    else excluded.push(row);
  }
  const closed = closedWon.length + closedLost.length;
  const limitations = [
    "Studio and Digital Estimate do not store an authoritative lost/declined close.",
    "Sales Orders are not Sold.",
    "Open, draft, and unpublished estimates are excluded from the denominator.",
    "Quote Flow and Moraware are not UUID-linked to Account Directory."
  ];
  if (!closed || closedLost.length === 0) {
    return {
      card: card({
        id: "estimate_win_rate",
        title: "eliteOS estimate win rate",
        state: "unavailable",
        value: null,
        valueType: "percent",
        interpretation: "Win rate unavailable. Final disposition coverage is incomplete.",
        evidenceAvailable: true,
        limitations
      }),
      evidence: {
        definition:
          "Won eligible estimates ÷ all closed eligible estimates. Closed = sold/won + lost only.",
        formula: "unavailable — lost/declined coverage is incomplete across eliteOS estimate systems",
        included: {
          internalWon: closedWon.length,
          internalLost: closedLost.length,
          closedEligible: closed
        },
        excluded: {
          openInternal: open.length,
          otherInternal: excluded.length
        },
        records: [...closedWon, ...closedLost].slice(0, 25).map(publicEstimate),
        limitations
      }
    };
  }
  const rate = pct(closedWon.length, closed);
  return {
    card: card({
      id: "estimate_win_rate",
      title: "eliteOS estimate win rate",
      state: "ok",
      value: rate,
      valueType: "percent",
      interpretation: `${closedWon.length} won of ${closed} deterministically closed Internal Estimates. Studio/DE lost outcomes are not in this denominator.`,
      evidenceAvailable: true,
      limitations
    }),
    evidence: {
      definition: "Internal Estimate sold/won ÷ (sold/won + lost) for this Account Directory UUID.",
      formula: `${closedWon.length} / ${closed} = ${rate}%`,
      included: {
        internalWon: closedWon.length,
        internalLost: closedLost.length,
        closedEligible: closed
      },
      excluded: { openInternal: open.length, otherInternal: excluded.length },
      records: [...closedWon, ...closedLost].slice(0, 25).map(publicEstimate),
      limitations
    }
  };
}

function publicEstimate(row) {
  return {
    id: row.id || null,
    number: row.quote_number || row.display_name || null,
    status: statusOf(row) || null,
    amount: money(row.grand_total),
    updatedAt: row.updated_at || row.created_at || null
  };
}

export function computeQuoteToOrderRatio({ estimates, salesOrders, period } = {}) {
  const quoteAmt = money(estimates?.amount);
  const soAmt = money(salesOrders?.amount) ?? 0;
  const quoteCount = Number(estimates?.count || 0);
  const soCount = Number(salesOrders?.count || 0);
  const limitations = [
    "Aggregate dollar activity during the selected period.",
    "Quotes and Sales Orders are not linked one-to-one, so this is not a job-level win rate.",
    "Sales Orders are not Sold."
  ];
  if (quoteAmt == null) {
    return {
      card: card({
        id: "quote_to_order_ratio",
        title: "Quote-to-Order activity ratio",
        state: "unavailable",
        value: null,
        valueType: "percent",
        interpretation: "Unavailable — quoted dollars for this period are missing.",
        period,
        evidenceAvailable: true,
        limitations
      }),
      evidence: {
        definition: "Sales Order dollars ÷ Estimate dollars in the selected period.",
        formula: "unavailable — quoted dollars are missing",
        quoted: { count: quoteCount, amount: quoteAmt },
        salesOrders: { count: soCount, amount: soAmt },
        period,
        limitations
      }
    };
  }
  if (!quoteAmt) {
    return {
      card: card({
        id: "quote_to_order_ratio",
        title: "Quote-to-Order activity ratio",
        state: "unavailable",
        value: null,
        valueType: "percent",
        interpretation: "Unavailable — quoted dollars in this period are zero or missing.",
        period,
        evidenceAvailable: true,
        limitations
      }),
      evidence: {
        definition: "Sales Order dollars ÷ Estimate dollars in the selected period.",
        formula: "unavailable — denominator is zero",
        quoted: { count: quoteCount, amount: quoteAmt },
        salesOrders: { count: soCount, amount: soAmt },
        period,
        limitations
      }
    };
  }
  const rate = pct(soAmt, quoteAmt);
  return {
    card: card({
      id: "quote_to_order_ratio",
      title: "Quote-to-Order activity ratio",
      state: "ok",
      value: rate,
      valueType: "percent",
      interpretation: `$${soAmt.toLocaleString("en-US")} Sales Orders ÷ $${quoteAmt.toLocaleString("en-US")} quotes in this period. Not a close rate.`,
      period,
      evidenceSummary: [
        `${quoteCount} quotes · $${quoteAmt.toLocaleString("en-US")}`,
        `${soCount} sales orders · $${soAmt.toLocaleString("en-US")}`
      ],
      evidenceAvailable: true,
      limitations
    }),
    evidence: {
      definition: "Sales Order dollars ÷ Estimate dollars in the selected period.",
      formula: `${soAmt} / ${quoteAmt} = ${rate}%`,
      quoted: { count: quoteCount, amount: quoteAmt },
      salesOrders: { count: soCount, amount: soAmt },
      period,
      limitations
    }
  };
}

export function computeAccountMomentum({ comparable } = {}) {
  if (comparable && comparable.available === false) {
    return {
      card: card({
        id: "account_momentum",
        title: "Account momentum",
        state: "unavailable",
        value: "Insufficient history",
        interpretation: comparable.reason || "Comparable prior-period coverage is not available yet.",
        evidenceAvailable: true,
        limitations: ["Equivalent-period comparison only. Partial years are not compared to full years."]
      }),
      evidence: {
        definition: "Quoted, Sales Order, and invoiced dollars vs equivalent prior period.",
        changes: [],
        reason: comparable.reason || null
      }
    };
  }
  const change = comparable?.change || comparable || {};
  const series = [
    ["quoted", change.quoted || change.quotes],
    ["salesOrders", change.salesOrders],
    ["invoiced", change.invoiced]
  ];
  const changes = series
    .map(([key, row]) => {
      const percent = row?.percent;
      const status = String(row?.status || "");
      if (percent == null || !Number.isFinite(Number(percent))) return null;
      if (status === "unavailable" || status === "unavailable_rate") return null;
      return { key, percent: Number(percent), status };
    })
    .filter(Boolean);
  if (changes.length < 2) {
    return {
      card: card({
        id: "account_momentum",
        title: "Account momentum",
        state: "unavailable",
        value: "Insufficient history",
        interpretation: "Comparable prior-period coverage is not available yet.",
        evidenceAvailable: true,
        limitations: ["Equivalent-period comparison only. Partial years are not compared to full years."]
      }),
      evidence: { definition: "Quoted, Sales Order, and invoiced dollars vs equivalent prior period.", changes: [] }
    };
  }
  const up = changes.filter((c) => c.percent > 5).length;
  const down = changes.filter((c) => c.percent < -5).length;
  let value = "Stable";
  if (up && down) value = "Mixed";
  else if (up >= 2) value = "Growing";
  else if (down >= 2) value = "Slowing";
  else if (up === 1 && !down) value = "Growing";
  else if (down === 1 && !up) value = "Slowing";
  return {
    card: card({
      id: "account_momentum",
      title: "Account momentum",
      state: "ok",
      value,
      interpretation: "Based on quoted, Sales Order, and invoiced dollars vs the equivalent prior period.",
      evidenceSummary: changes.map((c) => `${c.key} ${c.percent > 0 ? "+" : ""}${c.percent}%`),
      evidenceAvailable: true,
      limitations: ["Not a profitability or customer-value score."]
    }),
    evidence: {
      definition: "Direction of quoted / Sales Order / invoiced dollars vs equivalent prior YTD.",
      changes,
      limitations: ["Threshold ±5% for Growing/Slowing. Conflicting directions become Mixed."]
    }
  };
}

export function computePaymentPattern({ financials } = {}) {
  if (!financials?.linked) {
    return {
      card: card({
        id: "payment_pattern",
        title: "Payment status",
        state: "unavailable",
        value: null,
        interpretation: "Unavailable until this account has an exact QuickBooks customer link.",
        evidenceAvailable: false,
        limitations: ["Invoice-to-payment application days are not computed; applications are not deterministically linked."]
      }),
      evidence: { definition: "Current A/R collection attention for this customer only." }
    };
  }
  const att = financials.collectionAttention || {};
  return {
    card: card({
      id: "payment_pattern",
      title: "Payment status",
      state: "ok",
      value: att.label || att.code || "Current",
      interpretation: att.reason || "Current open receivables for this customer.",
      evidenceSummary: [
        financials.overdueInvoiceCount != null ? `${financials.overdueInvoiceCount} invoices overdue` : null,
        financials.overdueBalance != null
          ? `$${Number(financials.overdueBalance).toLocaleString("en-US")} overdue`
          : null,
        financials.oldestOverdueInvoice?.daysOverdue != null
          ? `oldest ${financials.oldestOverdueInvoice.daysOverdue} days`
          : null,
        financials.daysSinceLastPayment != null
          ? `${financials.daysSinceLastPayment} days since last payment`
          : null
      ].filter(Boolean),
      evidenceAvailable: true,
      limitations: [
        "Not a credit score.",
        "Days from invoice to payment are not calculated because applications are not linked."
      ]
    }),
    evidence: {
      definition: "Deterministic collection attention from open A/R due dates.",
      collectionAttention: att,
      overdueInvoiceCount: financials.overdueInvoiceCount ?? 0,
      overdueBalance: financials.overdueBalance ?? 0,
      oldestOverdue: financials.oldestOverdueInvoice || null,
      daysSinceLastPayment: financials.daysSinceLastPayment ?? null,
      terms: financials.paymentTerms || null
    }
  };
}

export function computeOpenOpportunity({ internalItems = [], studioItems = [] } = {}) {
  const internalOpen = internalItems.filter((row) => {
    if (row?.is_current_revision === false) return false;
    return INTERNAL_OPEN.has(statusOf(row));
  });
  const studioOpen = studioItems.filter((row) => STUDIO_OPEN.has(statusOf(row)));
  const items = [...internalOpen, ...studioOpen];
  const amounts = items.map((row) => money(row.grand_total)).filter((n) => n != null);
  const amount = amounts.length ? amounts.reduce((a, b) => a + b, 0) : null;
  return {
    card: card({
      id: "open_opportunity",
      title: "Open opportunities",
      state: "ok",
      value: items.length,
      valueType: "count",
      interpretation:
        amount != null
          ? `${items.length} open UUID-linked estimates · $${amount.toLocaleString("en-US")}`
          : `${items.length} open UUID-linked estimates. Some amounts are unavailable.`,
      evidenceSummary: [`${internalOpen.length} Internal`, `${studioOpen.length} Studio`],
      evidenceAvailable: true,
      limitations: [
        "Exact Account Directory UUID only. Quote Flow and Moraware are not included.",
        "Superseded, sold, lost, and archived estimates are excluded.",
        "Studio commercial status is used; Mark Sold snapshots are not inferred as open."
      ]
    }),
    evidence: {
      definition: "Open Internal Estimate statuses plus open Studio commercial statuses on this UUID.",
      count: items.length,
      amount,
      records: items.slice(0, 25).map(publicEstimate)
    }
  };
}

export function computeRelationshipActivity({ financials, estimates } = {}) {
  const dates = [
    financials?.lastInvoice?.date,
    financials?.lastPayment?.date,
    estimates?.internal?.items?.[0]?.updated_at,
    estimates?.studio?.items?.[0]?.updated_at
  ]
    .map((d) => (d ? String(d).slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  const last = dates.length ? dates[dates.length - 1] : null;
  const asOf = financials?.asOfDate || new Date().toISOString().slice(0, 10);
  let days = null;
  if (last) {
    const a = Date.parse(`${last}T00:00:00Z`);
    const b = Date.parse(`${asOf}T00:00:00Z`);
    if (Number.isFinite(a) && Number.isFinite(b)) days = Math.max(0, Math.round((b - a) / 86400000));
  }
  let value = "No dated activity on file";
  if (days != null) {
    if (days <= 30) value = `Last commercial activity ${days} day${days === 1 ? "" : "s"} ago`;
    else if (days <= 90) value = `Quiet · last activity ${days} days ago`;
    else value = `Dormant · last activity ${days} days ago`;
  }
  return {
    card: card({
      id: "relationship_activity",
      title: "Relationship activity",
      state: last ? "ok" : "unavailable",
      value,
      interpretation: "Recency from last invoice, payment, or UUID-linked estimate update.",
      evidenceSummary: [
        financials?.lastInvoice?.date ? `Last invoice ${financials.lastInvoice.date}` : null,
        financials?.lastPayment?.date ? `Last payment ${financials.lastPayment.date}` : null
      ].filter(Boolean),
      evidenceAvailable: true,
      limitations: ["Recently active ≤30 days. Quiet 31–90. Dormant >90. Not a customer score."]
    }),
    evidence: {
      definition: "Most recent of last invoice, last payment, last Internal/Studio estimate update.",
      lastActivityDate: last,
      daysAgo: days,
      lastInvoice: financials?.lastInvoice?.date || null,
      lastPayment: financials?.lastPayment?.date || null
    }
  };
}

export function computeAccountOutlook({ momentumCard } = {}) {
  const momentum = String(momentumCard?.value || "Insufficient history");
  return {
    card: card({
      id: "account_outlook",
      title: "Account outlook",
      state: momentumCard?.state === "ok" ? "ok" : "unavailable",
      value: momentum,
      interpretation:
        "Numeric next-90-day invoiced forecast is not shipped. History from Jan 2025 is too short for a responsible range, and pipeline dollars would double-count quotes with Sales Orders.",
      evidenceAvailable: true,
      limitations: [
        "No AI forecast.",
        "Outlook follows Account Momentum (Growing / Stable / Slowing / Mixed / Insufficient history)."
      ]
    }),
    evidence: {
      definition: "Deterministic outlook equals Account Momentum. Numeric forecast rejected.",
      momentum,
      rejectedForecast:
        "Need longer comparable history, a single non-overlapping target, and a backtest before shipping a dollar range."
    }
  };
}

function overviewStrip(cards) {
  const pick = [];
  const win = cards.find((c) => c.id === "estimate_win_rate");
  const outlook = cards.find((c) => c.id === "account_outlook") || cards.find((c) => c.id === "account_momentum");
  const open = cards.find((c) => c.id === "open_opportunity");
  const ratio = cards.find((c) => c.id === "quote_to_order_ratio");
  if (win && win.state === "ok") pick.push(win);
  else if (ratio) pick.push(ratio);
  if (outlook) pick.push(outlook);
  if (open) pick.push(open);
  return pick.slice(0, 3);
}

export function buildAccountInsightsPayload({ financials, relationship, period = "ytd" }) {
  const internalItems = relationship?.estimates?.internal?.items || [];
  const studioItems = relationship?.estimates?.studio?.items || [];
  const history = financials?.customerHistory;
  const family = period === "available" ? history?.summary : history?.ytd;
  const periodLabel =
    period === "available"
      ? history?.coverage?.label || "Available history"
      : `YTD ${history?.ytd?.start || ""}–${history?.ytd?.end || financials?.asOfDate || ""}`.trim();

  const win = computeEstimateWinRate({ internalItems });
  const ratio = computeQuoteToOrderRatio({
    estimates: family?.estimates,
    salesOrders: family?.salesOrders,
    period: periodLabel
  });
  const momentum = computeAccountMomentum({ comparable: history?.comparable });
  const payment = computePaymentPattern({ financials });
  const open = computeOpenOpportunity({ internalItems, studioItems });
  const activity = computeRelationshipActivity({
    financials,
    estimates: relationship?.estimates
  });
  const outlook = computeAccountOutlook({ momentumCard: momentum.card });

  const cards = [
    win.card,
    ratio.card,
    momentum.card,
    payment.card,
    open.card,
    activity.card,
    outlook.card
  ];
  const evidenceById = {
    estimate_win_rate: win.evidence,
    quote_to_order_ratio: ratio.evidence,
    account_momentum: momentum.evidence,
    payment_pattern: payment.evidence,
    open_opportunity: open.evidence,
    relationship_activity: activity.evidence,
    account_outlook: outlook.evidence
  };
  return {
    ok: true,
    status: financials?.linked ? financials.status || "ok" : "unlinked",
    coverage: {
      historyLabel: history?.coverage?.label || null,
      asOfDate: financials?.asOfDate || null,
      linked: Boolean(financials?.linked)
    },
    cards,
    overview: overviewStrip(cards),
    evidenceById
  };
}

export async function getAccountDirectoryInsights(args) {
  if (!roleHasCapability(args.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError("forbidden", "Permission denied.", 403);
  }
  const financials = await getAccountDirectoryFinancials(args);
  const relationship = await getAccountDirectoryRelationship(args);
  const period = String(args.period || "ytd").trim() === "available" ? "available" : "ytd";
  const payload = buildAccountInsightsPayload({ financials, relationship, period });
  return scrubAccount360Payload({
    ok: true,
    status: payload.status,
    coverage: payload.coverage,
    cards: payload.cards,
    overview: payload.overview
  });
}

export async function getAccountDirectoryInsightEvidence(args) {
  if (!roleHasCapability(args.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError("forbidden", "Permission denied.", 403);
  }
  const insightId = String(args.insightId || "").trim();
  if (!INSIGHT_IDS.includes(insightId)) {
    throw new AccountDirectoryError("not_found", "Unknown insight.", 404);
  }
  const financials = await getAccountDirectoryFinancials(args);
  const relationship = await getAccountDirectoryRelationship(args);
  const period = String(args.period || "ytd").trim() === "available" ? "available" : "ytd";
  const payload = buildAccountInsightsPayload({ financials, relationship, period });
  const card = payload.cards.find((c) => c.id === insightId);
  return scrubAccount360Payload({
    ok: true,
    insightId,
    card,
    evidence: payload.evidenceById[insightId] || null
  });
}
