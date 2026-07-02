/**
 * Account focus / attention scoring for Sales Command Center.
 */

function pct(cur, pri) {
  if (!Number.isFinite(pri) || pri === 0) return null;
  return ((cur - pri) / pri) * 100;
}

/**
 * @param {object} account — { account, currentSqft, priorSqft, eliteShare, outShare, attributionStatus, lastJobDate, quoteCount }
 */
export function scoreAccountFocus(account) {
  const reasons = [];
  let score = 0;

  const currentSqft = Number(account.currentSqft ?? 0) || 0;
  const priorSqft = Number(account.priorSqft ?? 0) || 0;
  const yoySqft = currentSqft - priorSqft;
  const yoyPct = pct(currentSqft, priorSqft);

  if (priorSqft >= 100 && currentSqft === 0) {
    reasons.push("dormant_vs_prior_year");
    score += 40;
  }
  if (priorSqft >= 50 && yoySqft < 0) {
    reasons.push("behind_prior_year");
    score += Math.min(30, Math.abs(yoyPct ?? 0) / 3);
  }
  if (Number(account.outShare ?? 0) >= 40 && currentSqft >= 50) {
    reasons.push("high_out_of_collection");
    score += 20;
  }
  if (Number(account.eliteShare ?? 100) < 20 && currentSqft >= 80) {
    reasons.push("low_elite100_adoption");
    score += 15;
  }
  if (priorSqft >= 200 && currentSqft < priorSqft * 0.5) {
    reasons.push("high_prior_low_current");
    score += 25;
  }
  if (account.attributionStatus === "needs_review_unmapped") {
    reasons.push("unmapped_account");
    score += 10;
  }
  if (Number(account.unknownColorShare ?? 0) >= 10) {
    reasons.push("unknown_color_issues");
    score += 8;
  }
  if (Number(account.quoteCount ?? 0) >= 3 && currentSqft === 0) {
    reasons.push("quoted_not_produced");
    score += 18;
  }

  return {
    focusScore: Math.round(Math.min(100, score)),
    focusReasons: reasons,
    isDormant: priorSqft >= 100 && currentSqft === 0,
    isBehindPriorYear: priorSqft >= 50 && yoySqft < 0,
    yoySqft,
    yoyPct
  };
}

/**
 * @param {Array<object>} accounts
 * @param {number} limit
 */
export function rankAttentionAccounts(accounts, limit = 25) {
  return accounts
    .map((a) => {
      const focus = scoreAccountFocus(a);
      return { ...a, ...focus };
    })
    .filter((a) => a.focusScore > 0)
    .sort((a, b) => b.focusScore - a.focusScore || a.yoySqft - b.yoySqft)
    .slice(0, limit);
}

/**
 * @param {Array<object>} accounts
 */
export function detectDormantAccounts(accounts) {
  return accounts
    .filter((a) => Number(a.priorSqft ?? 0) >= 100 && Number(a.currentSqft ?? 0) === 0)
    .sort((a, b) => (Number(b.priorSqft) || 0) - (Number(a.priorSqft) || 0));
}
