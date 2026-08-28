/**
 * Authoritative Sales Ops progress calculations (Brain-owned).
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function closeRatePct(quoted, awarded) {
  const q = num(quoted);
  if (q <= 0) return 0;
  return (num(awarded) / q) * 100;
}

export function attainmentPct(actual, target) {
  const t = num(target);
  if (t <= 0) return 0;
  return (num(actual) / t) * 100;
}

export function pipelineCoverage(pipeline, rollingThreeMonthTarget) {
  const t = num(rollingThreeMonthTarget);
  if (t <= 0) return 0;
  return num(pipeline) / t;
}

/**
 * @param {Array<{ period: string, installedTarget: number, rollingThreeMonthTarget: number, qualifiedPipelineTarget: number }>} ramp
 * @param {Array<{ period: string, installed: number, pipeline: number, quoted: number, awarded: number, touches: number, meetings: number, opportunities: number, followUp: number, repeatShare: number }>} scorecards
 * @param {string|null} period
 */
export function computeProgress(ramp, scorecards, period = null) {
  const cards = [...(scorecards || [])].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const latest = period ? cards.find((c) => c.period === period) ?? cards.at(-1) ?? null : cards.at(-1) ?? null;
  const latestRamp = latest
    ? ramp.find((r) => r.period === latest.period) ?? ramp[0]
    : ramp[0];
  const latestIndex = latest ? ramp.findIndex((r) => r.period === latest.period) : -1;
  const recentActual =
    latestIndex >= 0
      ? ramp.slice(Math.max(0, latestIndex - 2), latestIndex + 1).reduce((sum, item) => {
          const rec = cards.find((c) => c.period === item.period);
          return sum + num(rec?.installed);
        }, 0)
      : 0;
  const closeRate = latest ? closeRatePct(latest.quoted, latest.awarded) : 0;
  const attainment = latest ? attainmentPct(latest.installed, latestRamp.installedTarget) : 0;
  const coverage = latest ? pipelineCoverage(latest.pipeline, latestRamp.rollingThreeMonthTarget) : 0;
  const rollingAttainment = latest ? attainmentPct(recentActual, latestRamp.rollingThreeMonthTarget) : 0;
  const closeRateStandard = latest?.period && latest.period >= "2027-10" ? 40 : 35;
  /** @type {"green"|"yellow"|"red"|"pending"} */
  const status = !latest
    ? "pending"
    : (attainment >= 90 || rollingAttainment >= 90) && coverage >= 1
      ? "green"
      : attainment >= 75 && coverage >= 2 / 3
        ? "yellow"
        : "red";
  return {
    latestPeriod: latest?.period ?? null,
    latest,
    latestRamp,
    recentActual,
    closeRate,
    closeRateStandard,
    attainment,
    pipelineCoverage: coverage,
    rollingAttainment,
    status
  };
}

export function blankScorecard(period) {
  return {
    period,
    installed: 0,
    pipeline: 0,
    quoted: 0,
    awarded: 0,
    touches: 0,
    meetings: 0,
    opportunities: 0,
    followUp: 0,
    repeatShare: 0,
    note: "",
    sources: {}
  };
}
