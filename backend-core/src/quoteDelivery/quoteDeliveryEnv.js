/**
 * Quote Delivery environment configuration (backend-only).
 */

function envStr(name, fallback = "") {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

function envBool(name, defaultFalse = false) {
  const v = envStr(name, defaultFalse ? "1" : "0");
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

const DEFAULT_QUOTE_EMAIL_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

/** @returns {{ sendEnabled: boolean, pdfEnabled: boolean, provider: string, fromAddress: string, allowedDomains: string[], forceRecipient: string|null, logoUrl: string }} */
export function getQuoteDeliveryEnv() {
  const allowedRaw = envStr("QUOTE_EMAIL_ALLOWED_DOMAINS", "");
  const allowedDomains = allowedRaw
    ? allowedRaw
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const logoRaw =
    envStr("QUOTE_EMAIL_LOGO_URL", "") ||
    envStr("ELITEOS_EMAIL_LOGO_URL", "") ||
    envStr("ESF_LOGO_URL", "");

  return {
    sendEnabled: envBool("QUOTE_EMAIL_SEND_ENABLED", false),
    pdfEnabled: envBool("QUOTE_EMAIL_PDF_ENABLED", false),
    provider: envStr("QUOTE_EMAIL_PROVIDER", "none").toLowerCase(),
    fromAddress: envStr("QUOTE_EMAIL_FROM", "estimates@eliteosfab.com"),
    allowedDomains,
    forceRecipient: envStr("QUOTE_EMAIL_FORCE_RECIPIENT", "") || null,
    logoUrl: resolveQuoteEmailLogoUrl(logoRaw)
  };
}

/**
 * Public HTTPS logo URL for transactional estimate email HTML (Gmail-safe).
 * @param {string} [rawUrl]
 */
export function resolveQuoteEmailLogoUrl(rawUrl = "") {
  const url = String(rawUrl ?? "").trim();
  if (/^https:\/\//i.test(url)) return url;
  return DEFAULT_QUOTE_EMAIL_LOGO_URL;
}

/**
 * @param {string} email
 * @param {{ allowedDomains?: string[] }} env
 */
export function isRecipientDomainAllowed(email, env) {
  const domains = env.allowedDomains || [];
  if (!domains.length) return true;
  const at = String(email || "").lastIndexOf("@");
  if (at < 0) return false;
  const domain = String(email).slice(at + 1).trim().toLowerCase();
  return domains.includes(domain);
}
