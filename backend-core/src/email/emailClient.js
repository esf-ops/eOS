/**
 * Email provider abstraction for Quote Delivery.
 * Resend is selected via QUOTE_EMAIL_PROVIDER=resend and RESEND_API_KEY (backend env only).
 */

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * @returns {string|null}
 */
function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (key == null || String(key).trim() === "") return null;
  return String(key).trim();
}

/**
 * @param {{ to: string[], cc?: string[], subject: string, html: string, text: string, from: string }} params
 */
async function sendViaResend(params) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return {
      ok: false,
      skipped: false,
      dryRun: false,
      provider: "resend",
      messageId: null,
      error: "RESEND_API_KEY is not configured on the server"
    };
  }

  const to = (params.to || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  if (!to.length) {
    return {
      ok: false,
      skipped: false,
      dryRun: false,
      provider: "resend",
      messageId: null,
      error: "At least one To recipient is required"
    };
  }

  const cc = (params.cc || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  const from = String(params.from || "").trim() || "estimates@eliteosfab.com";
  const subject = String(params.subject || "").trim();
  if (!subject) {
    return {
      ok: false,
      skipped: false,
      dryRun: false,
      provider: "resend",
      messageId: null,
      error: "Email subject is required"
    };
  }

  const payload = {
    from,
    to,
    subject,
    html: String(params.html || ""),
    ...(params.text ? { text: String(params.text) } : {}),
    ...(cc.length ? { cc } : {})
  };

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (body && (body.message || body.error)) ||
        (typeof body === "string" ? body : null) ||
        `Resend API request failed (${res.status})`;
      return {
        ok: false,
        skipped: false,
        dryRun: false,
        provider: "resend",
        messageId: null,
        error: String(msg)
      };
    }

    return {
      ok: true,
      skipped: false,
      dryRun: false,
      provider: "resend",
      messageId: body?.id ?? null
    };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      dryRun: false,
      provider: "resend",
      messageId: null,
      error: String(e?.message || e)
    };
  }
}

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

  if (provider === "resend") {
    return sendViaResend(params);
  }

  return {
    ok: false,
    skipped: true,
    dryRun: true,
    provider,
    messageId: null,
    error: `Email provider "${provider}" is not supported`
  };
}

/** @returns {boolean} */
export function wasProviderCalled(result) {
  return Boolean(result && result.messageId);
}
