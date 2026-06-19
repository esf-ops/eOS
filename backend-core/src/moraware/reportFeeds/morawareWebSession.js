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

const DEFAULT_LOGIN_ENTRY_PATHS = ["/sys/login", "/sys/login.aspx", "/login", "/login.aspx", "/d.aspx", "/"];

/** @typedef {Map<string, string>} MorawareCookieJar */

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

export function createMorawareCookieJar() {
  return new Map();
}

export function getMorawareWebLoginEntryPaths() {
  const override = env("MORAWARE_WEB_LOGIN_PATH");
  if (!override) return [...DEFAULT_LOGIN_ENTRY_PATHS];
  return [override.startsWith("/") ? override : `/${override}`];
}

/**
 * @param {MorawareCookieJar} jar
 * @param {string} setCookieHeader
 */
export function ingestSetCookieHeader(jar, setCookieHeader) {
  if (!setCookieHeader || !jar) return;

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
 * @param {MorawareCookieJar} jar
 * @returns {string[]} cookie names set on this response
 */
export function captureResponseCookies(res, jar) {
  /** @type {string[]} */
  const names = [];
  if (!res?.headers || !jar) return names;

  const ingestOne = (sc) => {
    const before = new Set(jar.keys());
    ingestSetCookieHeader(jar, sc);
    for (const name of jar.keys()) {
      if (!before.has(name) || jar.get(name) !== undefined) names.push(name);
    }
  };

  if (typeof res.headers.getSetCookie === "function") {
    for (const sc of res.headers.getSetCookie()) ingestOne(sc);
  } else {
    const raw = res.headers.get("set-cookie");
    if (raw) ingestOne(raw);
  }

  return [...new Set(names)];
}

export function resolveMorawareUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

export function redactMorawareUrl(url) {
  return String(url ?? "")
    .replace(/([?&]sessionId=)[^&]+/gi, "$1REDACTED")
    .replace(/([?&]password=)[^&]+/gi, "$1REDACTED")
    .replace(/([?&]user(name)?=)[^&]+/gi, "$1REDACTED");
}

function parseInputTag(tag) {
  const nameMatch = /name\s*=\s*["']([^"']+)["']/i.exec(tag);
  if (!nameMatch) return null;
  const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(tag);
  const valueMatch = /value\s*=\s*["']([^"']*)["']/i.exec(tag);
  return {
    name: nameMatch[1],
    type: String(typeMatch?.[1] ?? "text").toLowerCase(),
    value: valueMatch?.[1] ?? ""
  };
}

function parseButtonTag(tag) {
  const nameMatch = /name\s*=\s*["']([^"']+)["']/i.exec(tag);
  if (!nameMatch) return null;
  const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(tag);
  const type = String(typeMatch?.[1] ?? "submit").toLowerCase();
  if (type !== "submit" && type !== "button") return null;
  const valueMatch = /value\s*=\s*["']([^"']*)["']/i.exec(tag);
  return { name: nameMatch[1], value: valueMatch?.[1] ?? "" };
}

/**
 * @param {string} html
 * @param {string} pageUrl
 */
export function extractLoginForms(html, pageUrl) {
  const text = String(html ?? "");
  /** @type {Array<ReturnType<typeof buildLoginFormRecord>>} */
  const forms = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = formRe.exec(text))) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    if (!/type\s*=\s*["']password["']/i.test(body)) continue;

    const methodMatch = /method\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const actionMatch = /action\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const method = String(methodMatch?.[1] ?? "post").trim().toLowerCase() || "post";
    const action = resolveMorawareUrl(pageUrl, actionMatch?.[1] || pageUrl);

    /** @type {Record<string, string>} */
    const fields = {};
    /** @type {Array<{ name: string, type: string }>} */
    const fieldMeta = [];
    /** @type {Array<{ name: string, value: string }>} */
    const submitButtons = [];

    const inputRe = /<input\b([^>]*?)>/gi;
    let inputMatch;
    while ((inputMatch = inputRe.exec(body))) {
      const parsed = parseInputTag(inputMatch[1] ?? "");
      if (!parsed) continue;
      fieldMeta.push({ name: parsed.name, type: parsed.type });
      if (parsed.type === "submit" || parsed.type === "image") {
        submitButtons.push({ name: parsed.name, value: parsed.value });
        continue;
      }
      if (parsed.type === "button") continue;
      fields[parsed.name] = parsed.value;
    }

    const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let buttonMatch;
    while ((buttonMatch = buttonRe.exec(body))) {
      const parsed = parseButtonTag(buttonMatch[1] ?? "");
      if (!parsed) continue;
      submitButtons.push(parsed);
      fieldMeta.push({ name: parsed.name, type: "submit" });
    }

    forms.push(
      buildLoginFormRecord({
        action,
        method,
        fields,
        fieldMeta,
        submitButtons,
        pageUrl
      })
    );
  }
  return forms;
}

function buildLoginFormRecord(parts) {
  const hidden = parts.fields ?? {};
  return {
    action: parts.action,
    method: parts.method,
    fields: parts.fields,
    fieldMeta: parts.fieldMeta,
    submitButtons: parts.submitButtons,
    hiddenFlags: {
      __VIEWSTATE: Object.prototype.hasOwnProperty.call(hidden, "__VIEWSTATE"),
      __EVENTVALIDATION: Object.prototype.hasOwnProperty.call(hidden, "__EVENTVALIDATION"),
      __VIEWSTATEGENERATOR: Object.prototype.hasOwnProperty.call(hidden, "__VIEWSTATEGENERATOR"),
      __RequestVerificationToken: Object.prototype.hasOwnProperty.call(hidden, "__RequestVerificationToken")
    },
    score: scoreLoginForm(parts)
  };
}

function scoreLoginForm(form) {
  let score = 0;
  if (form.hiddenFlags?.__VIEWSTATE) score += 5;
  if (form.hiddenFlags?.__EVENTVALIDATION) score += 3;
  if (form.submitButtons?.length) score += 4;
  if (form.fieldMeta?.some((f) => f.type === "password")) score += 5;
  if (String(form.action ?? "").includes("/login")) score += 2;
  return score;
}

export function selectBestLoginForm(forms) {
  if (!Array.isArray(forms) || forms.length === 0) return null;
  return [...forms].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
}

export function extractLoginForm(html, pageUrl) {
  return selectBestLoginForm(extractLoginForms(html, pageUrl));
}

function pickUsernameField(fields) {
  const override = env("MORAWARE_WEB_USERNAME_FIELD");
  if (override && Object.prototype.hasOwnProperty.call(fields, override)) return override;

  const entries = Object.entries(fields).filter(
    ([name]) =>
      !/password|viewstate|eventvalidation|__/.test(name) &&
      !/^account(id)?$/i.test(name) &&
      !/account.*name|accountname|accountsalesperson/i.test(name)
  );

  const ranked = entries
    .map(([name]) => {
      const lower = name.toLowerCase();
      let score = 0;
      if (lower === "username") score += 20;
      if (lower === "txtusername") score += 18;
      if (/^user(name)?$/i.test(name)) score += 15;
      if (/login.*user|user.*login/.test(lower)) score += 10;
      if (/email/.test(lower)) score += 4;
      if (/account/.test(lower)) score -= 10;
      return { name, score };
    })
    .sort((a, b) => b.score - a.score);

  if (ranked[0]?.score > 0) return ranked[0].name;
  return entries[0]?.[0] ?? null;
}

function pickPasswordField(fields) {
  const override = env("MORAWARE_WEB_PASSWORD_FIELD");
  if (override && Object.prototype.hasOwnProperty.call(fields, override)) return override;
  return Object.keys(fields).find((n) => /password/i.test(n)) ?? null;
}

function pickAccountIdField(fields) {
  const override = env("MORAWARE_WEB_ACCOUNT_FIELD");
  if (override && Object.prototype.hasOwnProperty.call(fields, override)) return override;
  return (
    Object.keys(fields).find(
      (n) =>
        /^account(id)?$/i.test(n) ||
        /^txtaccount(id)?$/i.test(n) ||
        (/^account$/i.test(n) && !/name/i.test(n))
    ) ?? null
  );
}

function pickSubmitButton(submitButtons) {
  if (!Array.isArray(submitButtons) || submitButtons.length === 0) return null;
  const ranked = submitButtons
    .map((btn) => {
      const lower = `${btn.name} ${btn.value}`.toLowerCase();
      let score = 0;
      if (/login|log.?in|sign.?in|submit/.test(lower)) score += 5;
      return { btn, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.btn ?? submitButtons[0];
}

export function buildLoginPostPayload(form, credentials) {
  const userField = pickUsernameField(form.fields);
  const passField = pickPasswordField(form.fields);
  if (!userField || !passField) {
    return { ok: false, error: "login_fields_not_found", userField, passField };
  }

  /** @type {Record<string, string>} */
  const payload = { ...form.fields };
  payload[userField] = credentials.userName;
  payload[passField] = credentials.password;

  const accountField = pickAccountIdField(form.fields);
  if (accountField && credentials.accountId) payload[accountField] = credentials.accountId;

  const submit = pickSubmitButton(form.submitButtons);
  if (submit?.name) payload[submit.name] = submit.value ?? "Log In";

  return {
    ok: true,
    payload,
    userField,
    passField,
    accountField: accountField ?? null,
    submitButton: submit?.name ?? null
  };
}

export function describeLoginForm(form, loginPageUrl) {
  if (!form) {
    return { loginUrl: redactMorawareUrl(loginPageUrl), formFound: false };
  }
  return {
    loginUrl: redactMorawareUrl(loginPageUrl),
    formFound: true,
    formAction: redactMorawareUrl(form.action),
    formMethod: form.method,
    inputFields: (form.fieldMeta ?? []).map(({ name, type }) => ({ name, type })),
    submitButtons: (form.submitButtons ?? []).map(({ name }) => ({ name })),
    hiddenFields: form.hiddenFlags ?? {}
  };
}

export function describeLoginPostResult(postResult, setCookieNames = []) {
  return {
    postStatus: postResult?.status ?? null,
    postRedirectLocation: postResult?.redirectLocation
      ? redactMorawareUrl(postResult.redirectLocation)
      : null,
    setCookieNames: [...new Set(setCookieNames)],
    finalContentType: postResult?.contentType ?? null,
    finalUrl: postResult?.finalUrl ? redactMorawareUrl(postResult.finalUrl) : null,
    stillLooksLikeLogin: looksLikeMorawareLoginHtml(postResult?.text ?? ""),
    bodyPreview: redactResponseSnippet(postResult?.text ?? "", 120)
  };
}

export function looksLikeMorawareLoginHtml(text) {
  const sample = String(text ?? "").slice(0, 8000).toLowerCase();
  if (!sample) return false;
  const hasPasswordField = /type\s*=\s*["']password["']/i.test(sample);
  const hasLoginCue = sample.includes("log in") || sample.includes("login") || sample.includes("sign in");
  if (hasPasswordField && hasLoginCue) return true;
  if (sample.startsWith("<!doctype") || sample.startsWith("<html")) {
    if (hasLoginCue && (sample.includes("password") || sample.includes("username"))) return true;
  }
  return false;
}

export function redactCookieHeader(cookieHeader) {
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
 *   fetchFn?: typeof fetch,
 *   maxRedirects?: number
 * }} opts
 */
export async function morawareWebFetch(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const fetchFn = opts.fetchFn ?? fetch;
  const maxRedirects = opts.maxRedirects ?? 10;
  const jar = opts.jar ?? createMorawareCookieJar();
  let currentUrl = url;
  let method = opts.method ?? "GET";
  let body = opts.body;
  let redirectCount = 0;
  /** @type {string|null} */
  let redirectLocation = null;
  /** @type {string[]} */
  const setCookieNames = [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (redirectCount <= maxRedirects) {
      const cookieHeader = buildCookieHeader(jar);
      /** @type {Record<string, string>} */
      const headers = {
        accept: "text/html,application/xhtml+xml,text/csv,application/csv,*/*",
        "user-agent": DEFAULT_BROWSER_UA,
        ...(opts.headers ?? {})
      };
      if (cookieHeader) headers.cookie = cookieHeader;

      const res = await fetchFn(currentUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: "manual"
      });

      const responseCookieNames = captureResponseCookies(res, jar);
      for (const name of responseCookieNames) setCookieNames.push(name);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        redirectLocation = location ? resolveMorawareUrl(currentUrl, location) : null;
        if (!redirectLocation) break;
        currentUrl = redirectLocation;
        method = "GET";
        body = undefined;
        redirectCount += 1;
        continue;
      }

      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get("content-type") ?? "",
        text,
        finalUrl: currentUrl,
        redirectLocation,
        jar,
        setCookieNames: [...new Set(setCookieNames)]
      };
    }

    return {
      ok: false,
      status: 0,
      statusText: "Too many redirects",
      contentType: "",
      text: "",
      finalUrl: currentUrl,
      redirectLocation,
      jar,
      setCookieNames: [...new Set(setCookieNames)]
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyMorawareWebSession({ webBase, jar, fetchFn, timeoutMs, verifyPath }) {
  const path =
    env("MORAWARE_WEB_LOGIN_SUCCESS_PATH") ||
    verifyPath ||
    "/sys/report/?view=222";
  const url = `${webBase}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const probe = await morawareWebFetch(url, { jar, fetchFn, timeoutMs });
    const authenticated =
      probe.status !== 401 &&
      probe.status !== 403 &&
      !looksLikeMorawareLoginHtml(probe.text);
    return { authenticated, probeUrl: redactMorawareUrl(url), probe };
  } catch (err) {
    return { authenticated: false, probeUrl: redactMorawareUrl(url), error: String(err?.message || err) };
  }
}

/**
 * @param {{
 *   webBase: string,
 *   userName: string,
 *   password: string,
 *   accountId?: string,
 *   fetchFn?: typeof fetch,
 *   timeoutMs?: number,
 *   verifyPath?: string
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
  /** @type {Array<Record<string, unknown>>} */
  const attempts = [];
  /** @type {Record<string, unknown>|null} */
  let lastDetailedFailure = null;

  for (const path of getMorawareWebLoginEntryPaths()) {
    const loginPageUrl = `${webBase}${path.startsWith("/") ? path : `/${path}`}`;
    let page;
    try {
      page = await morawareWebFetch(loginPageUrl, { jar, fetchFn, timeoutMs });
    } catch (err) {
      attempts.push({
        path,
        status: 0,
        looksLikeLogin: false,
        error: String(err?.message || err)
      });
      continue;
    }

    const form = extractLoginForm(page.text, page.finalUrl || loginPageUrl);
    const formDiagnostics = describeLoginForm(form, page.finalUrl || loginPageUrl);

    if (!form) {
      attempts.push({
        path,
        status: page.status,
        looksLikeLogin: looksLikeMorawareLoginHtml(page.text),
        formFound: false
      });
      continue;
    }

    const built = buildLoginPostPayload(form, { userName, password, accountId });
    if (!built.ok) {
      const detail = {
        path,
        status: page.status,
        looksLikeLogin: looksLikeMorawareLoginHtml(page.text),
        ...formDiagnostics,
        error: built.error,
        resolvedUserField: built.userField ?? null,
        resolvedPasswordField: built.passField ?? null
      };
      attempts.push(detail);
      lastDetailedFailure = detail;
      continue;
    }

    const body = new URLSearchParams(built.payload).toString();
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
      const detail = {
        path,
        ...formDiagnostics,
        resolvedUserField: built.userField,
        resolvedPasswordField: built.passField,
        resolvedSubmitButton: built.submitButton,
        error: "web_login_post_failed",
        detail: String(err?.message || err)
      };
      attempts.push(detail);
      lastDetailedFailure = detail;
      continue;
    }

    const postDiagnostics = describeLoginPostResult(postResult, postResult.setCookieNames);
    const verify = await verifyMorawareWebSession({
      webBase,
      jar,
      fetchFn,
      timeoutMs,
      verifyPath: params.verifyPath
    });

    if (verify.authenticated) {
      return {
        ok: true,
        jar,
        cookieNames: [...jar.keys()],
        loginPath: path,
        authMode: "web_cookie",
        verifyUrl: verify.probeUrl
      };
    }

    const detail = {
      path,
      ...formDiagnostics,
      resolvedUserField: built.userField,
      resolvedPasswordField: built.passField,
      resolvedSubmitButton: built.submitButton,
      resolvedAccountField: built.accountField,
      ...postDiagnostics,
      verifyUrl: verify.probeUrl,
      verifyStatus: verify.probe?.status ?? null,
      verifyStillLooksLikeLogin: verify.probe ? looksLikeMorawareLoginHtml(verify.probe.text) : null
    };
    attempts.push(detail);
    lastDetailedFailure = detail;
  }

  const failurePayload = {
    ok: false,
    error: "web_login_failed",
    stage: "web_login",
    attempts,
    lastAttempt: lastDetailedFailure,
    cookieNames: [...jar.keys()]
  };

  console.log("Moraware web login diagnostics (safe/redacted):");
  console.log(JSON.stringify(lastDetailedFailure ?? attempts[attempts.length - 1] ?? {}, null, 2));

  return failurePayload;
}

export { DEFAULT_BROWSER_UA };
