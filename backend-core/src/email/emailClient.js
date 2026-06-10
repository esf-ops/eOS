/**
 * Email provider abstraction — no-op placeholder for Quote Delivery Phase 1.
 */

/**
 * @param {{ to: string[], cc?: string[], subject: string, html: string, text: string, from: string, provider: string }} params
 */
export async function sendEstimateEmail(params) {
  const provider = String(params.provider || "none").toLowerCase();
  if (provider === "none") {
    return {
      ok: true,
      skipped: true,
      dryRun: true,
      provider: "none",
      messageId: null
    };
  }

  // Phase 5: wire Resend/SendGrid/SES here. Never call from Phase 1 dry-run paths.
  return {
    ok: false,
    skipped: true,
    dryRun: true,
    provider,
    error: `Email provider "${provider}" is not configured in Phase 1`
  };
}

/** @returns {boolean} */
export function wasProviderCalled(result) {
  return Boolean(result && result.messageId);
}
