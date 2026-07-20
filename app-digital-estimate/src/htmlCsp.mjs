/**
 * Digital Estimate HTML Content-Security-Policy builder.
 * Used by vite.config.ts at build time and by CSP unit tests.
 *
 * img-src allows only 'self', data:, blob:, and the configured Supabase Storage origin.
 * Never allow https: or * wildcards for images.
 */

/**
 * @param {string | null | undefined} raw
 * @returns {string | null} https origin or null
 */
export function supabaseOriginFromUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const origin = new URL(text).origin;
    if (!/^https:\/\//i.test(origin)) return null;
    return origin;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   isProd?: boolean;
 *   backendOrigin: string;
 *   supabaseOrigin?: string | null;
 * }} opts
 * @returns {string}
 */
export function buildDigitalEstimateHtmlCsp(opts) {
  const isProd = Boolean(opts?.isProd);
  const backendOrigin = String(opts?.backendOrigin || "").trim() || "https://api.eliteosfab.com";
  const supabaseOrigin = opts?.supabaseOrigin ? String(opts.supabaseOrigin).trim() : "";
  const styleSrc = isProd ? "'self'" : "'self' 'unsafe-inline'";
  const connectSrc = `'self' ${backendOrigin} http://127.0.0.1:3001 http://localhost:3001`;
  const imgSrc = supabaseOrigin
    ? `img-src 'self' data: blob: ${supabaseOrigin}`
    : "img-src 'self' data: blob:";
  return [
    "default-src 'none'",
    `style-src ${styleSrc}`,
    imgSrc,
    `connect-src ${connectSrc}`,
    "script-src 'self'",
    "font-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * @param {string} csp
 * @returns {string | null}
 */
export function extractImgSrcDirective(csp) {
  const match = String(csp || "").match(/(?:^|;)\s*(img-src\s[^;]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * @param {string} csp
 * @param {string} origin
 * @returns {boolean}
 */
export function imgSrcAllowsOrigin(csp, origin) {
  const dir = extractImgSrcDirective(csp);
  if (!dir || !origin) return false;
  const tokens = dir.replace(/^img-src\s+/i, "").split(/\s+/);
  return tokens.includes(origin);
}

/**
 * @param {string} csp
 * @returns {boolean}
 */
export function imgSrcHasWildcardHttps(csp) {
  const dir = extractImgSrcDirective(csp);
  if (!dir) return false;
  const tokens = dir.replace(/^img-src\s+/i, "").split(/\s+/);
  return tokens.some((t) => t === "*" || t === "https:" || t === "http:" || t === "https://*");
}

/**
 * Whether a concrete image URL would be allowed under img-src (approximate browser rules).
 * @param {string} csp
 * @param {string} imageUrl
 * @param {string} [documentOrigin]
 * @returns {boolean}
 */
export function imgSrcAllowsUrl(csp, imageUrl, documentOrigin = "https://estimate.example") {
  const dir = extractImgSrcDirective(csp);
  if (!dir) return false;
  const tokens = dir.replace(/^img-src\s+/i, "").split(/\s+/);
  let url;
  try {
    url = new URL(imageUrl, documentOrigin);
  } catch {
    return false;
  }
  if (url.protocol === "data:" && tokens.includes("data:")) return true;
  if (url.protocol === "blob:" && tokens.includes("blob:")) return true;
  if (tokens.includes("'self'") && url.origin === new URL(documentOrigin).origin) return true;
  return tokens.includes(url.origin);
}
