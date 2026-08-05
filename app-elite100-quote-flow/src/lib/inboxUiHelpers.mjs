/**
 * Inbox UI helpers — human labels + short job ids (no raw Graph keys in success copy).
 */

/**
 * @param {string|null|undefined} jobId
 * @returns {string|null}
 */
export function shortJobLabel(jobId) {
  const s = String(jobId || "").trim();
  if (!s) return null;
  if (s.length <= 12) return `Job ${s}`;
  return `Job ${s.slice(0, 8)}…`;
}

/**
 * Prefer customer / subject / plan filename — never surface Graph message keys.
 * @param {object|null|undefined} item
 * @param {{
 *   resolveCustomerDisplay: Function,
 *   resolveRequestTitle: Function,
 *   formatPersonLabel: Function
 * }} helpers
 */
export function humanInboxLabel(item, helpers) {
  if (!item || typeof item !== "object") return "Request";
  const customer = String(
    helpers.resolveCustomerDisplay(item, helpers.formatPersonLabel) || ""
  ).trim();
  if (customer && customer !== "Unknown contact" && !looksLikeGraphKey(customer)) {
    return customer;
  }
  const title = String(helpers.resolveRequestTitle(item) || "").trim();
  if (title && title !== "Quote request" && !looksLikeGraphKey(title)) return title;
  const plan = String(item?.bestPlanCandidate?.filename || "").trim();
  if (plan) return plan;
  return "Request";
}

/**
 * @param {string} value
 */
export function looksLikeGraphKey(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  if (/^AAMk/i.test(s)) return true;
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(s) && !/\s/.test(s)) return true;
  return false;
}

/**
 * @param {{
 *   ok: boolean,
 *   reused?: boolean,
 *   label: string,
 *   error?: string,
 *   kind?: string
 * }} result
 */
export function formatBatchResultLine(result) {
  const label = String(result?.label || "Request").trim() || "Request";
  const err = String(result?.error || "");
  if (
    result?.kind === "blocked" ||
    (!result?.ok && /scope already set|already_scoped|Open in Estimates/i.test(err))
  ) {
    return "Blocked: scope already set";
  }
  if (!result?.ok) {
    return `Failed: ${label}`;
  }
  if (result.reused || result.kind === "already_running") {
    return `Already running: ${label}`;
  }
  return `Started: ${label}`;
}
