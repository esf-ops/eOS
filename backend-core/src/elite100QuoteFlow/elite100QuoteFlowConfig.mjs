/**
 * Elite 100 Quote Flow — server flags (Slice 1A shell).
 * Exact "1" enables the Quote Flow Brain API and Home Launcher tile filter.
 * Access authority: System Admin `user_head_access` (`elite100_quote_flow`) + this flag.
 */

export const ELITE100_QUOTE_FLOW_HEAD_SLUG = "elite100_quote_flow";

export function isElite100QuoteFlowEnabled(env = process.env) {
  return String(env.ELITE100_QUOTE_FLOW_ENABLED ?? "").trim() === "1";
}

/** Safe config for authenticated callers (no secrets). */
export function readSafeElite100QuoteFlowConfig(env = process.env) {
  return {
    quoteFlowEnabled: isElite100QuoteFlowEnabled(env),
    headSlug: ELITE100_QUOTE_FLOW_HEAD_SLUG,
    headUrl: String(env.HEAD_URL_ELITE100_QUOTE_FLOW ?? "").trim() || null,
    shell: "slice-1d"
  };
}
