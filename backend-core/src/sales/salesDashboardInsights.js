/**
 * Natural-language insights for Sales Command Center.
 */

function fmtSqft(n) {
  return `${Math.round(Number(n) || 0).toLocaleString("en-US")} sqft`;
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/**
 * @param {object} ctx
 */
export function buildDashboardInsights(ctx) {
  const insights = [];
  const { kpis, repSummary, accountSummary, colorMix, quotePipeline, forecast, production } = ctx;

  if (repSummary?.length) {
    const top = repSummary[0];
    if (top && top.yoyPct != null && top.yoyPct > 5) {
      const drivers = (top.topAccounts || []).slice(0, 2).map((a) => a.account).join(" and ");
      insights.push({
        id: "rep-growth",
        severity: "positive",
        text: `${top.salesperson} is up ${fmtPct(top.yoyPct)} vs the same period last year${drivers ? `, driven by ${drivers}` : ""}.`
      });
    }
  }

  if (accountSummary?.attentionAccounts?.length) {
    const acct = accountSummary.attentionAccounts.find((a) =>
      (a.focusReasons || []).includes("high_out_of_collection")
    );
    if (acct) {
      insights.push({
        id: "ooc-opportunity",
        severity: "info",
        text: `${acct.account} has high out-of-collection volume and may be an Elite 100 conversion opportunity.`
      });
    }
  }

  const dormant = accountSummary?.dormantAccounts?.length ?? 0;
  if (dormant >= 3) {
    insights.push({
      id: "dormant-accounts",
      severity: "warn",
      text: `${dormant} high-volume accounts produced last year but have no current-year activity.`
    });
  }

  if (forecast?.forecastSqft && production?.producedSqft && forecast.forecastSqft > production.producedSqft) {
    insights.push({
      id: "forecast-vs-production",
      severity: "info",
      text: `Forecasted quote volume (${fmtSqft(forecast.forecastSqft)}) exceeds produced volume (${fmtSqft(production.producedSqft)}) for the selected period.`
    });
  }

  if (colorMix?.eliteGroupBreakdown?.length) {
    const promo = colorMix.eliteGroupBreakdown.find((g) => g.group === "Promo");
    const topGroup = colorMix.eliteGroupBreakdown[0];
    if (promo && topGroup && topGroup.group !== "Promo" && promo.share >= 20) {
      insights.push({
        id: "elite-mix",
        severity: "info",
        text: `${topGroup.group} is growing, but Promo volume still drives ${promo.share.toFixed(1)}% of Elite 100 sqft.`
      });
    }
  }

  if (kpis?.unknownColorShare != null && kpis.unknownColorShare >= 2) {
    insights.push({
      id: "unknown-colors",
      severity: "warn",
      text: `Unmapped colors are affecting ${kpis.unknownColorShare.toFixed(1)}% of current-period sqft.`
    });
  }

  if (kpis?.yoyPct != null) {
    const dir = kpis.yoyPct >= 0 ? "ahead" : "behind";
    insights.push({
      id: "yoy-headline",
      severity: kpis.yoyPct >= 0 ? "positive" : "warn",
      text: `Production is ${dir} last year by ${fmtPct(kpis.yoyPct)} (${fmtSqft(kpis.currentSqft)} vs ${fmtSqft(kpis.priorSqft)}).`
    });
  }

  if (quotePipeline?.openQuoteCount > 0) {
    insights.push({
      id: "pipeline-open",
      severity: "info",
      text: `${quotePipeline.openQuoteCount} open quotes worth $${Math.round(quotePipeline.openPipelineValue || 0).toLocaleString("en-US")} in the pipeline.`
    });
  }

  return insights.slice(0, 12);
}

export function buildInsightSummaryText(insights) {
  return insights.map((i) => i.text).join("\n");
}

/**
 * Executive summary for Command Center — email/Slack-ready narrative.
 * @param {object} ctx
 */
export function buildExecutiveSummary(ctx) {
  const insights = buildDashboardInsights(ctx);
  const { kpis, repSummary, accountSummary, colorMix, quotePipeline, forecast, production } = ctx;

  const highlights = [];
  const risks = [];
  const opportunities = [];
  const caveats = [];
  const suggestedActions = [];

  if (kpis?.yoyPct != null && kpis?.currentSqft != null) {
    const dir = kpis.yoyPct >= 0 ? "up" : "down";
    let line = `YTD production is ${dir} ${Math.abs(kpis.yoyPct).toFixed(1)}% vs the same period last year (${fmtSqft(kpis.currentSqft)} vs ${fmtSqft(kpis.priorSqft)}).`;
    if (repSummary?.length) {
      const topRep = repSummary.find((r) => r.yoyPct != null && r.yoyPct > 0) || repSummary[0];
      if (topRep?.salesperson) {
        line += ` ${topRep.salesperson} is a top contributor${topRep.yoyPct != null ? ` (${fmtPct(topRep.yoyPct)} YoY)` : ""}.`;
      }
    }
    highlights.push(line);
  }

  if (colorMix?.eliteShare != null) {
    highlights.push(`Elite 100 share is ${Number(colorMix.eliteShare).toFixed(0)}% of classified sqft in the selected period.`);
  }

  const oocAccounts = accountSummary?.highOutOfCollection ?? [];
  if (oocAccounts.length) {
    const names = oocAccounts.slice(0, 3).map((a) => a.account).join(", ");
    opportunities.push(
      `${oocAccounts.length} high-volume account${oocAccounts.length === 1 ? "" : "s"} remain heavy out-of-collection${names ? ` (including ${names})` : ""}.`
    );
    suggestedActions.push("Review out-of-collection accounts for Elite 100 conversion conversations.");
  }

  const attention = accountSummary?.attentionAccounts ?? [];
  if (attention.length) {
    risks.push(`${attention.length} account${attention.length === 1 ? "" : "s"} flagged for manager attention (dormant, decline, or mix risk).`);
    suggestedActions.push("Work the accounts attention list — prioritize dormant high-volume relationships.");
  }

  if (forecast?.next60?.forecastSqft > 0) {
    highlights.push(`Forecast volume over the next 60 days is ${fmtSqft(forecast.next60.forecastSqft)}.`);
  } else if (forecast?.forecastSqft > 0) {
    highlights.push(`Open forecast signals total ${fmtSqft(forecast.forecastSqft)} sqft for the selected period.`);
  }

  const qnp = quotePipeline?.quotedNotProducedRows?.length ?? quotePipeline?.quotedNotProducedCount ?? 0;
  if (qnp > 0) {
    risks.push(`${qnp} quoted job${qnp === 1 ? "" : "s"} ${qnp === 1 ? "has" : "have"} not yet appeared in production.`);
    suggestedActions.push("Review quoted-not-produced rows in Quote Pipeline and Forecasting.");
  }

  if (quotePipeline?.openQuoteCount > 0) {
    opportunities.push(
      `${quotePipeline.openQuoteCount} open quotes ($${Math.round(quotePipeline.openPipelineValue || 0).toLocaleString("en-US")}) in the pipeline.`
    );
  }

  if (kpis?.unknownColorShare != null && kpis.unknownColorShare >= 1) {
    caveats.push(`Unmapped colors affect ${kpis.unknownColorShare.toFixed(1)}% of current-period sqft — color analytics may understate Elite 100 mix.`);
    suggestedActions.push("Clear unknown color mappings in Colors / Materials and Data Quality.");
  }

  if (production?.backlogSummary == null && production?.capacitySignal == null) {
    caveats.push("Backlog and capacity signals are not available yet — production flow shows Moraware facts only.");
  }

  const headline =
    highlights[0] ||
    insights[0]?.text ||
    "Sales dashboard summary for the selected filters and date range.";

  const narrativeParts = [];
  if (highlights.length) narrativeParts.push(highlights.slice(0, 2).join(" "));
  if (opportunities.length) narrativeParts.push(opportunities[0]);
  if (risks.length) narrativeParts.push(risks[0]);

  const bulletLines = [
    ...highlights.map((h) => `• ${h}`),
    ...opportunities.map((o) => `• Opportunity: ${o}`),
    ...risks.map((r) => `• Risk: ${r}`),
    ...caveats.map((c) => `• Note: ${c}`),
    ...suggestedActions.map((a) => `→ ${a}`)
  ];

  const copyText = [
    headline,
    "",
    narrativeParts.join(" "),
    "",
    "Key points:",
    ...bulletLines.slice(0, 8)
  ]
    .filter(Boolean)
    .join("\n");

  return {
    headline,
    highlights: highlights.slice(0, 4),
    risks: risks.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
    caveats: caveats.slice(0, 3),
    suggestedActions: suggestedActions.slice(0, 4),
    copyText
  };
}
