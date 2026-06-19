/**
 * Governed Moraware report-feed download (server-side HTTP + API session).
 *
 * Uses MorawareClient sessionCreate (XML API) then GETs saved-report CSV + HTML
 * URLs with sessionId query param. Returns text for processReportFeedLocal().
 *
 * Backend/worker only — never import from frontend code.
 */

import { MorawareClient } from "../../../../src/morawareClient.js";

const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

export function deriveMorawareWebBaseFromApiUrl(apiUrl, webBaseOverride = "") {
  const envBase = String(webBaseOverride || process.env.MORAWARE_WEB_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");
  try {
    const u = new URL(String(apiUrl ?? "").trim());
    const pathname = u.pathname || "";
    if (/\/api\/?$/i.test(pathname)) {
      const trimmed = pathname.replace(/\/api\/?$/i, "").replace(/\/$/, "");
      return `${u.origin}${trimmed}` || u.origin;
    }
    return u.origin;
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
 * @param {{ webBase: string, viewId: number|string, csvExportPath?: string, htmlReportPath?: string, sessionId: string }} params
 */
export function buildReportFeedUrls(params) {
  const base = String(params.webBase ?? "").replace(/\/$/, "");
  const viewId = params.viewId;
  const csvPath =
    params.csvExportPath ||
    `/sys/report/?view=${viewId}&spreadsheet=1&exportType=AllPages&table=Report`;
  const htmlPath = params.htmlReportPath || `/sys/report/?view=${viewId}`;
  const csvUrl = appendMorawareSessionId(`${base}${csvPath.startsWith("/") ? csvPath : `/${csvPath}`}`, params.sessionId);
  const htmlUrl = appendMorawareSessionId(
    `${base}${htmlPath.startsWith("/") ? htmlPath : `/${htmlPath}`}`,
    params.sessionId
  );
  return { csvUrl, htmlUrl };
}

export function redactMorawareSessionId(url) {
  return String(url ?? "").replace(/([?&]sessionId=)[^&]+/gi, "$1REDACTED");
}

export function looksLikeMorawareLoginPage(text) {
  const sample = String(text ?? "").slice(0, 6000).toLowerCase();
  if (!sample.includes("login") && !sample.includes("sign in")) return false;
  return sample.includes("password") || sample.includes("username") || sample.includes("log in");
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

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, fetchFn?: typeof fetch }} [opts]
 */
export async function fetchMorawareReportHttpGet(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchFn = opts.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,text/csv,application/csv,*/*",
        "user-agent": "eliteOS-report-feed/1.0"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type") ?? "",
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyFetchFailure(stage, httpResult) {
  if (httpResult.status === 404) return "report_not_found";
  if (httpResult.status === 401 || httpResult.status === 403) return "auth_failed";
  if (looksLikeMorawareLoginPage(httpResult.text)) return "auth_failed";
  if (!httpResult.ok) return "fetch_failed";
  if (stage === "csv" && !looksLikeCsvExport(httpResult.text, httpResult.contentType)) {
    return "empty_export";
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
 *   timeoutMs?: number
 * }} params
 */
export async function fetchReportFeedArtifacts(params) {
  const viewId = Number(params.morawareViewId);
  if (!Number.isFinite(viewId) || viewId <= 0) {
    return { ok: false, error: "invalid_view_id", stage: "init" };
  }

  const client = params.morawareClient ?? new MorawareClient();
  let sessionId = "";
  try {
    sessionId = await client.ensureSession();
  } catch (err) {
    return {
      ok: false,
      error: "auth_failed",
      stage: "session",
      detail: String(err?.message || err)
    };
  }

  const webBase = deriveMorawareWebBaseFromApiUrl(client.baseUrl);
  if (!webBase) {
    return { ok: false, error: "web_base_missing", stage: "init" };
  }

  const { csvUrl, htmlUrl } = buildReportFeedUrls({
    webBase,
    viewId,
    csvExportPath: params.csvExportPath,
    htmlReportPath: params.htmlReportPath,
    sessionId
  });

  const fetchImpl = params.fetchImpl ?? fetchMorawareReportHttpGet;
  const timeoutMs = params.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  let csvResult;
  let htmlResult;
  try {
    csvResult = await fetchImpl(csvUrl, { timeoutMs });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "timeout" : "fetch_failed",
      stage: "csv",
      detail: String(err?.message || err),
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  const csvFailure = classifyFetchFailure("csv", csvResult);
  if (csvFailure) {
    return {
      ok: false,
      error: csvFailure,
      stage: "csv",
      status: csvResult.status,
      detail: csvResult.statusText || undefined,
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  const csvRowCount = estimateCsvDataRowCount(csvResult.text);
  if (csvRowCount === 0) {
    return {
      ok: false,
      error: "empty_export",
      stage: "csv",
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  try {
    htmlResult = await fetchImpl(htmlUrl, { timeoutMs });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "timeout" : "fetch_failed",
      stage: "html",
      detail: String(err?.message || err),
      urls: { csvUrl: redactMorawareSessionId(csvUrl), htmlUrl: redactMorawareSessionId(htmlUrl) }
    };
  }

  const htmlFailure = classifyFetchFailure("html", htmlResult);
  if (htmlFailure) {
    return {
      ok: false,
      error: htmlFailure,
      stage: "html",
      status: htmlResult.status,
      detail: htmlResult.statusText || undefined,
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
