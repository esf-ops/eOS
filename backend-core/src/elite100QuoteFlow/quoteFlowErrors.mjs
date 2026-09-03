/**
 * Safe Quote Flow API errors (no secrets).
 */

const MESSAGES = {
  mailbox_not_configured: "Mailbox preview is not configured for this organization.",
  mailbox_unavailable: "Inbox could not be refreshed.",
  message_not_found: "The message is no longer available.",
  attachment_required: "Select a plan attachment to start AI Takeoff.",
  attachment_not_supported:
    "That attachment is not a supported plan PDF or image for AI Takeoff.",
  packet_build_failed: "AI Takeoff could not start for the selected plan packet.",
  packet_unsupported:
    "Multi-file takeoff packets are not supported yet. Select one file or merge plans before upload.",
  takeoff_unavailable: "AI Takeoff is temporarily unavailable.",
  import_failed:
    "AI Takeoff could not import this file. Try another plan attachment.",
  import_confirm_required: "Confirm Start AI Takeoff to continue.",
  quote_name_required:
    "Enter a meaningful Quote Name before setting scope. Plan filenames cannot be used as the quote identity.",
  set_scope_confirm_required: "Confirm Set Scope to continue.",
  already_scoped: "Scope is already set. Open in Estimates.",
  takeoff_not_allowed: "Scope is already set. Open in Estimates.",
  takeoff_not_found: "That takeoff job could not be found.",
  takeoff_not_ready: "Review measurements before setting scope.",
  estimate_not_found: "Estimate not found.",
  estimate_not_scoped: "Official scope is not set for this estimate yet.",
  scope_invalid: "Official scope is invalid.",
  pricing_invalid: "Pricing settings are invalid.",
  pricing_calculate_failed: "Unable to calculate pricing.",
  review_not_ready: "Estimate is not ready for approval.",
  review_confirm_required: "Confirm to continue.",
  publish_not_ready: "Estimate is not ready to publish.",
  publish_confirm_required: "Confirm Publish Digital Estimate to continue.",
  publish_unavailable: "Digital Estimate publish is unavailable.",
  organization_required: "Organization context unavailable.",
  forbidden: "Forbidden"
};

/**
 * @param {string} code
 * @param {string} [fallbackMessage]
 */
export function quoteFlowSafeError(code, fallbackMessage) {
  const c = String(code || "mailbox_unavailable");
  const normalized =
    c === "graph_disabled" || c === "graph_not_configured"
      ? "mailbox_not_configured"
      : c === "already_scoped"
        ? "already_scoped"
        : c;
  return {
    ok: false,
    error: MESSAGES[normalized] || fallbackMessage || MESSAGES.mailbox_unavailable,
    code: normalized
  };
}

/**
 * @param {string} code
 * @param {{ message?: string, statusCode?: number, diagnostic?: object }} [opts]
 */
export function createQuoteFlowError(code, opts = {}) {
  const safe = quoteFlowSafeError(code, opts.message);
  const err = new Error(safe.error);
  err.statusCode =
    opts.statusCode ??
    (safe.code === "already_scoped" || safe.code === "takeoff_not_allowed"
      ? 409
      : safe.code === "message_not_found" ||
          safe.code === "mailbox_not_configured" ||
          safe.code === "takeoff_not_found" ||
          safe.code === "estimate_not_found" ||
          safe.code === "estimate_not_scoped"
        ? 404
        : safe.code === "mailbox_unavailable" || safe.code === "takeoff_unavailable"
          ? 503
          : safe.code === "takeoff_not_ready" ||
              safe.code === "scope_invalid" ||
              safe.code === "quote_name_required" ||
              safe.code === "pricing_invalid" ||
              safe.code === "pricing_calculate_failed" ||
              safe.code === "review_not_ready" ||
              safe.code === "publish_not_ready"
            ? 422
            : safe.code === "publish_unavailable"
              ? 503
              : 400);
  err.code = safe.code;
  if (opts.diagnostic && typeof opts.diagnostic === "object") {
    err.diagnostic = opts.diagnostic;
  }
  return err;
}
