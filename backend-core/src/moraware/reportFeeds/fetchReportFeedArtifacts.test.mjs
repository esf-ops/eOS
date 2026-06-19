/**
 * fetchReportFeedArtifacts unit tests (no live Moraware).
 */
import assert from "node:assert/strict";

import {
  buildReportFeedUrls,
  deriveMorawareWebBaseFromApiUrl,
  estimateCsvDataRowCount,
  fetchReportFeedArtifacts,
  looksLikeCsvExport,
  looksLikeMorawareLoginPage,
  redactMorawareSessionId
} from "./fetchReportFeedArtifacts.js";
import { createMorawareCookieJar, ingestSetCookieHeader } from "./morawareWebSession.js";

function testDeriveWebBaseFromApiUrl() {
  assert.equal(
    deriveMorawareWebBaseFromApiUrl("https://elite.example.com/api"),
    "https://elite.example.com"
  );
  assert.equal(
    deriveMorawareWebBaseFromApiUrl("https://elite.example.com/api.aspx"),
    "https://elite.example.com"
  );
  assert.equal(
    deriveMorawareWebBaseFromApiUrl("https://host/custom/api.aspx"),
    "https://host/custom"
  );
  assert.equal(deriveMorawareWebBaseFromApiUrl("", "https://custom.example.com/sys"), "https://custom.example.com/sys");
}

function testBuildReportFeedUrls() {
  const urls = buildReportFeedUrls({
    webBase: "https://elite.example.com",
    viewId: 222,
    csvExportPath: "/sys/report/?view=222&spreadsheet=1&exportType=AllPages&table=Report",
    htmlReportPath: "/sys/report/?view=222",
    sessionId: "abc123"
  });
  assert.match(urls.csvUrl, /view=222/);
  assert.match(urls.csvUrl, /sessionId=abc123/);
  assert.match(urls.htmlUrl, /view=222/);
}

function testRedactSessionId() {
  const redacted = redactMorawareSessionId(
    "https://x.example.com/sys/report/?view=222&sessionId=secret-value"
  );
  assert.equal(redacted.includes("secret-value"), false);
  assert.match(redacted, /sessionId=REDACTED/);
}

function testLooksLikeLoginPage() {
  assert.equal(looksLikeMorawareLoginPage("<html><body>Login</body><input name=password></html>"), true);
  assert.equal(looksLikeCsvExport("Job Name,Activity Date\nA,2026-06-22"), true);
}

function testEstimateCsvDataRowCount() {
  assert.equal(estimateCsvDataRowCount("h1,h2\na,b\nc,d"), 2);
}

function buildMockWebSession() {
  const jar = createMorawareCookieJar();
  ingestSetCookieHeader(jar, "ASP.NET_SessionId=loggedin; Path=/");
  return { ok: true, jar, cookieNames: ["ASP.NET_SessionId"], authMode: "web_cookie" };
}

async function testFetchReportFeedArtifactsSuccess() {
  const csv = "Job Name,Activity Date\nSample,2026-06-22\n";
  const html = `<html><body>${"<p>job link</p>".repeat(30)}<a href='/sys/job/1'>job</a></body></html>`;
  const captured = [];
  const result = await fetchReportFeedArtifacts({
    morawareViewId: 222,
    morawareClient: {
      baseUrl: "https://elite.example.com/api.aspx",
      userName: "user",
      password: "pass",
      accountId: "",
      ensureSession: async () => "api-sess-1"
    },
    webSession: buildMockWebSession(),
    fetchImpl: async (url, opts) => {
      captured.push({ url: String(url), cookie: opts?.jar ? "jar-present" : "missing" });
      if (String(url).includes("spreadsheet=1")) {
        return { ok: true, status: 200, statusText: "OK", contentType: "text/csv", text: csv, jar: opts.jar };
      }
      return { ok: true, status: 200, statusText: "OK", contentType: "text/html", text: html, jar: opts.jar };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.metadata.csvRowCount, 1);
  assert.equal(result.metadata.authMode, "web_cookie");
  assert.equal(captured.length, 2);
  assert.equal(captured.every((c) => c.cookie === "jar-present"), true);
}

async function testFetchReportFeedArtifactsAuthFailure() {
  const result = await fetchReportFeedArtifacts({
    morawareViewId: 222,
    morawareClient: {
      baseUrl: "https://elite.example.com/api.aspx",
      userName: "user",
      password: "pass",
      accountId: "",
      ensureSession: async () => "sess-1"
    },
    webSession: buildMockWebSession(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      text: "<html>Login password</html>"
    })
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "auth_failed");
  assert.equal(result.stage, "csv");
  assert.match(result.bodyPreview ?? "", /Login/i);
}

async function testFetchReportFeedArtifactsWebLoginFailure() {
  const result = await fetchReportFeedArtifacts({
    morawareViewId: 222,
    morawareClient: {
      baseUrl: "https://elite.example.com/api.aspx",
      userName: "user",
      password: "pass",
      accountId: ""
    },
    webSession: { ok: false, error: "web_login_failed", stage: "web_login" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "web_login");
}

const tests = [
  ["derive web base from api url", testDeriveWebBaseFromApiUrl],
  ["build report feed urls", testBuildReportFeedUrls],
  ["redact session id", testRedactSessionId],
  ["detect login/csv shapes", testLooksLikeLoginPage],
  ["estimate csv row count", testEstimateCsvDataRowCount],
  ["fetch success path", testFetchReportFeedArtifactsSuccess],
  ["fetch auth failure", testFetchReportFeedArtifactsAuthFailure],
  ["web login failure", testFetchReportFeedArtifactsWebLoginFailure]
];

let failed = 0;
(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${name}:`, e?.message || e);
    }
  }
  if (failed) process.exit(1);
  console.log(`fetchReportFeedArtifacts: all ${tests.length} tests passed`);
})();
