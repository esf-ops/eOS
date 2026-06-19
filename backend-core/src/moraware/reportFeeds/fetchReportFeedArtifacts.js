/**
 * Governed Moraware report-feed download (server-side HTTP + web session cookies).
 *
 * Moraware saved-report CSV/HTML under /sys/report/ require browser-style session cookies
 * from a web form login. XML API sessionId alone is insufficient for those URLs.
 *
 * Pipeline:
 *   establishMorawareWebSession (form POST + cookie jar)
 *   → GET report CSV + HTML with Cookie header
 *
 * Backend/worker only — never import from frontend code.
 */

import { MorawareClient } from "../../../../src/morawareClient.js";
import {
  buildCookieHeader,
  establishMorawareWebSession,
  looksLikeMorawareLoginHtml,
  morawareWebFetch,
  redactResponseSnippet
} from "./morawareWebSession.js";

const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

export function deriveMorawareWebBaseFromApiUrl(apiUrl, webBaseOverride = "") {
  const envBase = String(webBaseOverride || process.env.MORAWARE_WEB_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");
  try {
    const u = new URL(String(apiUrl ?? "").trim());
    let pathname = u.pathname || "";
    if (/api\.aspx$/i.test(pathname)) {
      pathname = pathname.replace(/\/api\.aspx$/i, "");
    } else if (/\/api\/?$/i.test(pathname)) {
      pathname = pathname.replace(/\/api\/?$/i, "");
    }
    pathname = pathname.replace(/\/$/, "");
    return `${u.origin}${pathname}` || u.origin;
  } catch {
    return "";
  }
}

export function appendMorawareSessionId(url, sessionId) {
  const base = String(url ?? "").trim();
  const sid = String(sessionId ?? "").trim();
  if (!base || !sid) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}sessionId=${encodeURIComponent(sid)}`;
}

/**
 * @param {{ webBase: string, viewId: number|string, csvExportPath?: string, htmlReportPath?: string, sessionId?: string }} params
 */
export function buildReportFeedUrls(params) {
  const base = String(params.webBase ?? "").replace(/\/$/, "");
  const viewId = params.viewId;
  const csvPath =
    params.csvExportPath ||
    `/sys/report/?view=${viewId}&spreadsheet=1&exportType=AllPages&table=Report`;
  const htmlPath = params.htmlReportPath || `/sys/report/?view=${viewId}`;
  const csvUrl = appendMorawareSessionId(
    `${base}${csvPath.startsWith("/") ? csvPath : `/${csvPath}`}`,
    params.sessionId ?? ""
  );
  const htmlUrl = appendMorawareSessionId(
    `${base}${htmlPath.startsWith("/") ? htmlPath : `/${htmlPath}`}`,
    params.sessionId ?? ""
  );
  return { csvUrl, htmlUrl };
}

export function redactMorawareSessionId(url) {
  return String(url ?? "").replace(/([?&]sessionId=)[^&]+/gi, "$1REDACTED");
}

export function looksLikeMorawareLoginPage(text) {
  return looksLikeMorawareLoginHtml(text);
}

export function looksLikeCsvExport(text, contentType = "") {
  const ct = String(contentType ?? "").toLowerCase();
  if (ct.includes("text/csv") || ct.includes("application/csv") || ct.includes("spreadsheet")) {
    return true;
  }
  const head = String(text ?? "").trimStart().slice(0, 800);
  if (!head || head.toLowerCase().startsWith("<!doctype") || head.toLowerCase().startsWith("<html")) {
    return false;
  }
  const firstLine = head.split(/\r?\n/)[0] ?? "";
  return firstLine.includes(",") && firstLine.length > 10;
}

export function estimateCsvDataRowCount(csvText) {
  const lines = String(csvText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return Math.max(0, lines.length - 1);
}

function logFetchDiagnostic(stage, httpResult, url, authMode) {
  const redactedUrl = redactMorawareSessionId(url);
  console.log(`Moraware report fetch diagnostic [${stage}]`);
  console.log(`  auth mode: ${authMode ?? "unknown"}`);
  console.log(`  url: ${redactedUrl}`);
  console.log(`  http status: ${httpResult?.status ?? "—"}`);
  console.log(`  content-type: ${httpResult?.contentType || "—"}`);
  if (httpResult?.text && (looksLikeMorawareLoginPage(httpResult.text) || httpResult.status === 401 || httpResult.status === 403)) {
    console.log(`  body preview: ${redactResponseSnippet(httpResult.text, 120)}`);
  }
}

/**
 * @param {string} url
 * @param {{
 *   timeoutMs?: number,
 *   jar?: import("./morawareWebSession.js").MorawareCookieJar,
 *   referer?: string,
 *   fetchFn?: typeof morawareWebFetch
 * }} [opts]
 */
export async function fetchMorawareReportHttpGet(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = opts.fetchFn ?? morawareWebFetch;
  return fetchImpl(url, {
    timeoutMs,
    jar: opts.jar,
    headers: opts.referer ? { referer: opts.referer } : undefined
  });
}

function classifyFetchFailure(stage, httpResult) {
  if (httpResult.status === 404) return "report_not_found";
  if (httpResult.status === 401 || httpResult.status === 403) return "auth_failed";
  if (looksLikeMorawareLoginPage(httpResult.text)) return "auth_failed";
  if (!httpResult.ok) return "fetch_failed";
  if (stage === "csv" && !looksLikeCsvExport(httpResult.text, httpResult.contentType)) {
    return looksLikeMorawareLoginPage(httpResult.text) ? "auth_failed" : "empty_export";
  }
  if (stage === "html" && looksLikeMorawareLoginPage(httpResult.text)) return "auth_failed";
  if (stage === "html" && String(httpResult.text ?? "").trim().length < 200) return "empty_export";
  return null;
}

/**
 * @param {{
 *   morawareViewId: number,
 *   csvExportPath?: string,
 *   htmlReportPath?: string,
 *   morawareClient?: MorawareClient,
 *   fetchImpl?: typeof fetchMorawareReportHttpGet,
 *   webSession?: Awaited<ReturnType<typeof establishMorawareWebSession>>,
 *   timeoutMs?: number
 * }} params
 */
export async function fetchReportFeedArtifacts(params) {
  const viewId = Number(params.morawareViewId);
  if (!Number.isFinite(viewId) || viewId <= 0) {
    return { ok: false, error: "invalid_view_id", stage: "init" };
  }

  const client = params.morawareClient ?? new MorawareClient();
  const webBase = deriveMorawareWebBaseFromApiUrl(client.baseUrl);
  if (!webBase) {
    return { ok: false, error: "web_base_missing", stage: "init" };
  }

  let webSession = params.webSession;
  if (!webSession) {
    webSession = await establishMorawareWebSession({
      webBase,
      userName: client.userName,
      password: client.password,
      accountId: client.accountId,
      timeoutMs: params.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    });
  }

  if (!webSession.ok) {
    console.log("Moraware web login failed before report export fetch.");
    if (webSession.lastAttempt) {
      console.log("Last login attempt diagnostics (safe/redacted):");
      console.log(JSON.stringify(webSession.lastAttempt, null, 2));
    } else if (webSession.attempts?.length) {
      console.log(`  login attempts: ${JSON.stringify(webSession.attempts)}`);
    }
    return {
      ok: false,
      error: webSession.error ?? "auth_failed",
      stage: webSession.stage ?? "web_login",
      detail: webSession.detail,
      webBase,
      lastAttempt: webSession.lastAttempt ?? null
    };
  }

  // Optional: also attach XML API sessionId when available (some tenants accept both).
  let apiSessionId = "";
  try {
    apiSessionId = await client.ensureSession();
  } catch {
    apiSessionId = "";
  }

  const { csvUrl, htmlUrl } = buildReportFeedUrls({
    webBase,
    viewId,
    csvExportPath: params.csvExportPath,
    htmlReportPath: params.htmlReportPath,
    sessionId: apiSessionId
  });

  const fetchImpl = params.fetchImpl ?? fetchMorawareReportHttpGet;
  const timeoutMs = params.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const authMode = webSession.authMode ?? "web_cookie";
  const jar = webSession.jar;
  const htmlReferer = `${webBase}/sys/report/?view=${viewId}`;

  let csvResult;
  try {
    csvResult = await fetchImpl(csvUrl, {
      timeoutMs,
      jar,
      referer: htmlReferer
    });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "timeout" : "fetch_failed",
      stage: "csv",
      detail: String(err?.message || err),
      authMode,
      cookieNames: [...(jar?.keys?.() ?? [])],
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  logFetchDiagnostic("csv", csvResult, csvUrl, authMode);

  const csvFailure = classifyFetchFailure("csv", csvResult);
  if (csvFailure) {
    return {
      ok: false,
      error: csvFailure,
      stage: "csv",
      status: csvResult.status,
      contentType: csvResult.contentType,
      bodyPreview: redactResponseSnippet(csvResult.text, 120),
      detail: csvResult.statusText || undefined,
      authMode,
      cookieNames: [...(jar?.keys?.() ?? [])],
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  const csvRowCount = estimateCsvDataRowCount(csvResult.text);
  if (csvRowCount === 0) {
    return {
      ok: false,
      error: "empty_export",
      stage: "csv",
      authMode,
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  let htmlResult;
  try {
    htmlResult = await fetchImpl(htmlUrl, {
      timeoutMs,
      jar,
      referer: htmlReferer
    });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "timeout" : "fetch_failed",
      stage: "html",
      detail: String(err?.message || err),
      authMode,
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  logFetchDiagnostic("html", htmlResult, htmlUrl, authMode);

  const htmlFailure = classifyFetchFailure("html", htmlResult);
  if (htmlFailure) {
    return {
      ok: false,
      error: htmlFailure,
      stage: "html",
      status: htmlResult.status,
      contentType: htmlResult.contentType,
      bodyPreview: redactResponseSnippet(htmlResult.text, 120),
      detail: htmlResult.statusText || undefined,
      authMode,
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  let sourceHost = webBase;
  try {
    sourceHost = new URL(webBase).host;
  } catch {
    /* keep raw base */
  }

  return {
    ok: true,
    csvText: csvResult.text,
    htmlText: htmlResult.text,
    metadata: {
      morawareViewId: viewId,
      fetchedAt: new Date().toISOString(),
      sourceHost,
      authMode,
      cookieNames: [...(jar?.keys?.() ?? [])],
      csvByteLength: csvResult.text.length,
      htmlByteLength: htmlResult.text.length,
      csvRowCount
    },
    urls: {
      csvUrl: redactMorawareSessionId(csvUrl),
      htmlUrl: redactMorawareSessionId(htmlUrl)
    }
  };
}

export { buildCookieHeader };
