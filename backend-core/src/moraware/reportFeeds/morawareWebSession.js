/**
 * Moraware JobTracker web session (form login + in-memory cookie jar).
 *
 * Report CSV/HTML exports under /sys/report/ require browser-style session cookies.
 * The XML API sessionId from MorawareClient.ensureSession() does NOT authorize those URLs.
 *
 * Backend/worker only — never import from frontend code.
 */

const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (compatible; eliteOS-report-feed/1.0; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const LOGIN_ENTRY_PATHS = ["/sys/login", "/sys/login.aspx", "/login", "/login.aspx", "/d.aspx", "/"];

/** @typedef {Map<string, string>} MorawareCookieJar */

export function createMorawareCookieJar() {
  return new Map();
}

/**
 * @param {MorawareCookieJar} jar
 * @param {string} setCookieHeader
 * @param {string} [requestUrl]
 */
export function ingestSetCookieHeader(jar, setCookieHeader, requestUrl = "") {
  if (!setCookieHeader || !jar) return;
  let defaultDomain = "";
  try {
    defaultDomain = new URL(requestUrl).hostname;
  } catch {
    /* ignore */
  }

  for (const part of String(setCookieHeader).split(/,(?=[^;]+=)/)) {
    const segment = part.trim();
    if (!segment) continue;
    const eq = segment.indexOf("=");
    if (eq <= 0) continue;
    const name = segment.slice(0, eq).trim();
    const rest = segment.slice(eq + 1);
    const value = rest.split(";")[0]?.trim() ?? "";
    if (!name) continue;

    const lower = segment.toLowerCase();
    if (lower.includes("max-age=0") || lower.includes("expires=Thu, 01 Jan 1970")) {
      jar.delete(name);
      continue;
    }
    jar.set(name, value);
  }

  if (defaultDomain && jar.size === 0) {
    /* no-op — placeholder for future domain-scoped jars */
  }
}

/**
 * @param {MorawareCookieJar} jar
 */
export function buildCookieHeader(jar) {
  if (!jar || jar.size === 0) return "";
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * @param {Response} res
 * @param {string} requestUrl
 * @param {MorawareCookieJar} jar
 */
export function captureResponseCookies(res, requestUrl, jar) {
  if (!res?.headers || !jar) return;
  if (typeof res.headers.getSetCookie === "function") {
    for (const sc of res.headers.getSetCookie()) {
      ingestSetCookieHeader(jar, sc, requestUrl);
    }
    return;
  }
  const raw = res.headers.get("set-cookie");
  if (raw) ingestSetCookieHeader(jar, raw, requestUrl);
}

function resolveUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

/**
 * Very small HTML form extractor for Moraware login pages (ASP.NET WebForms friendly).
 * @param {string} html
 * @param {string} pageUrl
 */
export function extractLoginForm(html, pageUrl) {
  const text = String(html ?? "");
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = formRe.exec(text))) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    if (!/type\s*=\s*["']password["']/i.test(body)) continue;

    const methodMatch = /method\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const actionMatch = /action\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const method = String(methodMatch?.[1] ?? "post").trim().toLowerCase() || "post";
    const action = resolveUrl(pageUrl, actionMatch?.[1] || pageUrl);

    /** @type {Record<string, string>} */
    const fields = {};
    const inputRe = /<input\b([^>]*?)>/gi;
    let inputMatch;
    while ((inputMatch = inputRe.exec(body))) {
      const tag = inputMatch[1] ?? "";
      const nameMatch = /name\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(tag);
      const type = String(typeMatch?.[1] ?? "text").toLowerCase();
      const valueMatch = /value\s*=\s*["']([^"']*)["']/i.exec(tag);
      if (type === "submit" || type === "button" || type === "image") continue;
      fields[name] = valueMatch?.[1] ?? "";
    }

    return { action, method, fields };
  }
  return null;
}

function pickUsernameField(fields) {
  const entries = Object.entries(fields);
  const ranked = entries
    .map(([name, value]) => {
      const lower = name.toLowerCase();
      let score = 0;
      if (/user|login|email|account/.test(lower)) score += 5;
      if (lower === "username" || lower === "userid") score += 8;
      if (lower.includes("txtuser")) score += 6;
      if (value) score -= 1;
      return { name, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].name : entries.find(([n]) => !/password|viewstate|eventvalidation|__/.test(n))?.[0] ?? null;
}

function pickPasswordField(fields) {
  return Object.keys(fields).find((n) => /password/i.test(n)) ?? null;
}

function pickAccountIdField(fields) {
  return (
    Object.keys(fields).find((n) => /accountid|account_id|account\b/i.test(n) && !/name/i.test(n)) ?? null
  );
}

export function looksLikeMorawareLoginHtml(text) {
  const sample = String(text ?? "").slice(0, 8000).toLowerCase();
  if (!sample) return false;
  const hasPasswordField = /type\s*=\s*["']password["']/.test(sample);
  const hasLoginCue = sample.includes("log in") || sample.includes("login") || sample.includes("sign in");
  if (hasPasswordField && hasLoginCue) return true;
  if (sample.startsWith("<!doctype") || sample.startsWith("<html")) {
    if (hasLoginCue && (sample.includes("password") || sample.includes("username"))) return true;
  }
  return false;
}

function redactCookieHeader(cookieHeader) {
  return String(cookieHeader ?? "")
    .split(";")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq <= 0) return part.trim();
      const name = part.slice(0, eq).trim();
      return `${name}=REDACTED`;
    })
    .filter(Boolean)
    .join("; ");
}

export function redactResponseSnippet(text, maxLen = 120) {
  return String(text ?? "")
    .replace(/([?&]sessionId=)[^&\s"']+/gi, "$1REDACTED")
    .replace(/\b(password|username|userName|accountId)\s*[:=]\s*["']?[^\s"'&]+/gi, "$1=REDACTED")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * @param {string} url
 * @param {{
 *   method?: string,
 *   jar?: MorawareCookieJar,
 *   headers?: Record<string, string>,
 *   body?: string,
 *   timeoutMs?: number,
 *   fetchFn?: typeof fetch
 * }} opts
 */
export async function morawareWebFetch(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const fetchFn = opts.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const jar = opts.jar ?? createMorawareCookieJar();
  const cookieHeader = buildCookieHeader(jar);

  /** @type {Record<string, string>} */
  const headers = {
    accept: "text/html,application/xhtml+xml,text/csv,application/csv,*/*",
    "user-agent": DEFAULT_BROWSER_UA,
    ...(opts.headers ?? {})
  };
  if (cookieHeader) headers.cookie = cookieHeader;

  try {
    const res = await fetchFn(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      signal: controller.signal,
      redirect: "follow"
    });
    captureResponseCookies(res, url, jar);
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type") ?? "",
      text,
      finalUrl: res.url,
      jar
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {{
 *   webBase: string,
 *   userName: string,
 *   password: string,
 *   accountId?: string,
 *   fetchFn?: typeof fetch,
 *   timeoutMs?: number
 * }} params
 */
export async function establishMorawareWebSession(params) {
  const webBase = String(params.webBase ?? "").replace(/\/$/, "");
  const userName = String(params.userName ?? "").trim();
  const password = String(params.password ?? "").trim();
  const accountId = String(params.accountId ?? "").trim();
  if (!webBase || !userName || !password) {
    return { ok: false, error: "web_login_config_missing", stage: "web_login" };
  }

  const jar = createMorawareCookieJar();
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? 120_000;
  /** @type {Array<{ path: string, status: number, looksLikeLogin: boolean }>} */
  const attempts = [];

  for (const path of LOGIN_ENTRY_PATHS) {
    const loginPageUrl = `${webBase}${path.startsWith("/") ? path : `/${path}`}`;
    let page;
    try {
      page = await morawareWebFetch(loginPageUrl, { jar, fetchFn, timeoutMs });
    } catch (err) {
      attempts.push({ path, status: 0, looksLikeLogin: false, error: String(err?.message || err) });
      continue;
    }

    attempts.push({
      path,
      status: page.status,
      looksLikeLogin: looksLikeMorawareLoginHtml(page.text)
    });

    const form = extractLoginForm(page.text, page.finalUrl || loginPageUrl);
    if (!form) continue;

    const userField = pickUsernameField(form.fields);
    const passField = pickPasswordField(form.fields);
    if (!userField || !passField) continue;

    const payload = { ...form.fields };
    payload[userField] = userName;
    payload[passField] = password;
    const accountField = pickAccountIdField(form.fields);
    if (accountField && accountId) payload[accountField] = accountId;

    const body = new URLSearchParams(payload).toString();
    let postResult;
    try {
      postResult = await morawareWebFetch(form.action || loginPageUrl, {
        method: form.method === "get" ? "GET" : "POST",
        jar,
        fetchFn,
        timeoutMs,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: webBase,
          referer: page.finalUrl || loginPageUrl
        },
        body: form.method === "get" ? undefined : body
      });
    } catch (err) {
      return {
        ok: false,
        error: "web_login_post_failed",
        stage: "web_login",
        detail: String(err?.message || err),
        attempts
      };
    }

    const cookieNames = [...jar.keys()];
    const stillLogin = looksLikeMorawareLoginHtml(postResult.text);
    if (cookieNames.length > 0 && !stillLogin) {
      return {
        ok: true,
        jar,
        cookieNames,
        loginPath: path,
        authMode: "web_cookie"
      };
    }

    // Some tenants redirect to app shell with minimal HTML — verify with report probe.
    const probeUrl = `${webBase}/sys/report/?view=1`;
    let probe;
    try {
      probe = await morawareWebFetch(probeUrl, { jar, fetchFn, timeoutMs });
    } catch {
      probe = null;
    }
    if (probe && !looksLikeMorawareLoginHtml(probe.text) && probe.status !== 401 && probe.status !== 403) {
      return {
        ok: true,
        jar,
        cookieNames,
        loginPath: path,
        authMode: "web_cookie"
      };
    }
  }

  return {
    ok: false,
    error: "web_login_failed",
    stage: "web_login",
    attempts,
    cookieHeaderRedacted: redactCookieHeader(buildCookieHeader(jar))
  };
}

export { DEFAULT_BROWSER_UA, redactCookieHeader };
