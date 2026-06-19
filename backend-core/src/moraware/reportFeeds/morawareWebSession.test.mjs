/**
 * morawareWebSession unit tests (no live Moraware).
 */
import assert from "node:assert/strict";

import {
  buildCookieHeader,
  buildLoginPostPayload,
  createMorawareCookieJar,
  describeLoginForm,
  describeLoginPostResult,
  establishMorawareWebSession,
  extractLoginForm,
  extractLoginForms,
  getMorawareWebLoginEntryPaths,
  ingestSetCookieHeader,
  looksLikeMorawareLoginHtml,
  morawareWebFetch,
  redactMorawareUrl,
  redactResponseSnippet,
  resolveMorawareUrl,
  selectBestLoginForm
} from "./morawareWebSession.js";

const LOGIN_HTML = `
  <html><body>
    <form action="/sys/login.aspx" method="post">
      <input type="hidden" name="__VIEWSTATE" value="vs1" />
      <input type="hidden" name="__EVENTVALIDATION" value="ev1" />
      <input type="text" name="UserName" value="" />
      <input type="password" name="Password" value="" />
      <input type="submit" name="btnLogin" value="Log In" />
    </form>
  </body></html>`;

function testCookieJar() {
  const jar = createMorawareCookieJar();
  ingestSetCookieHeader(jar, "ASP.NET_SessionId=abc123; Path=/; HttpOnly");
  assert.equal(buildCookieHeader(jar), "ASP.NET_SessionId=abc123");
}

function testExtractLoginFormUsesAction() {
  const form = extractLoginForm(LOGIN_HTML, "https://demo.moraware.net/sys/login");
  assert.equal(form?.action, "https://demo.moraware.net/sys/login.aspx");
  assert.equal(form?.fields.__VIEWSTATE, "vs1");
  assert.equal(form?.fields.__EVENTVALIDATION, "ev1");
  assert.equal(form?.submitButtons[0]?.name, "btnLogin");
}

function testBuildLoginPostPayloadIncludesSubmit() {
  const form = extractLoginForm(LOGIN_HTML, "https://demo.moraware.net/sys/login");
  const built = buildLoginPostPayload(form, { userName: "user", password: "pass" });
  assert.equal(built.ok, true);
  assert.equal(built.payload.UserName, "user");
  assert.equal(built.payload.Password, "pass");
  assert.equal(built.payload.btnLogin, "Log In");
}

function testCustomFieldOverrides() {
  const prevUser = process.env.MORAWARE_WEB_USERNAME_FIELD;
  const prevPass = process.env.MORAWARE_WEB_PASSWORD_FIELD;
  process.env.MORAWARE_WEB_USERNAME_FIELD = "Email";
  process.env.MORAWARE_WEB_PASSWORD_FIELD = "Secret";
  try {
    const html = `<form method="post"><input name="Email" /><input type="password" name="Secret" /></form>`;
    const form = extractLoginForm(html, "https://demo.moraware.net/sys/login");
    const built = buildLoginPostPayload(form, { userName: "a@b.com", password: "pw" });
    assert.equal(built.payload.Email, "a@b.com");
    assert.equal(built.payload.Secret, "pw");
  } finally {
    if (prevUser == null) delete process.env.MORAWARE_WEB_USERNAME_FIELD;
    else process.env.MORAWARE_WEB_USERNAME_FIELD = prevUser;
    if (prevPass == null) delete process.env.MORAWARE_WEB_PASSWORD_FIELD;
    else process.env.MORAWARE_WEB_PASSWORD_FIELD = prevPass;
  }
}

function testSelectBestLoginForm() {
  const forms = extractLoginForms(
    `${LOGIN_HTML}<form method="post"><input type="search" name="q" /></form>`,
    "https://demo.moraware.net/sys/login"
  );
  assert.equal(forms.length, 1);
  assert.equal(selectBestLoginForm(forms)?.action.includes("login.aspx"), true);
}

function testLooksLikeLoginHtml() {
  assert.equal(looksLikeMorawareLoginHtml("<html><body>Login<input type='password' name='Password'></body></html>"), true);
  assert.equal(looksLikeMorawareLoginHtml("<html><body>Report data</body></html>"), false);
}

function testRedactResponseSnippet() {
  const snippet = redactResponseSnippet("Login password=secret&sessionId=abc123 body", 120);
  assert.equal(snippet.includes("secret"), false);
  assert.match(snippet, /sessionId=REDACTED/);
}

function testDescribeLoginFormRedactsUrls() {
  const form = extractLoginForm(LOGIN_HTML, "https://demo.moraware.net/sys/login?sessionId=abc");
  const diag = describeLoginForm(form, "https://demo.moraware.net/sys/login?sessionId=abc");
  assert.match(diag.loginUrl, /sessionId=REDACTED/);
  assert.equal(diag.formAction, "https://demo.moraware.net/sys/login.aspx");
  assert.equal(diag.hiddenFields.__VIEWSTATE, true);
  assert.equal(diag.submitButtons[0]?.name, "btnLogin");
}

function testDescribeLoginPostResultRedacted() {
  const diag = describeLoginPostResult(
    {
      status: 302,
      redirectLocation: "https://demo.moraware.net/sys/home?sessionId=abc",
      contentType: "text/html",
      finalUrl: "https://demo.moraware.net/sys/home",
      text: "<html>Login password</html>"
    },
    ["ASP.NET_SessionId"]
  );
  assert.deepEqual(diag.setCookieNames, ["ASP.NET_SessionId"]);
  assert.match(diag.postRedirectLocation, /REDACTED/);
  assert.equal(diag.bodyPreview.includes("password=secret"), false);
}

async function testMorawareWebFetchFollowsRedirectCookies() {
  const jar = createMorawareCookieJar();
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method ?? "GET" });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 302,
        statusText: "Found",
        headers: {
          get: (name) => (name.toLowerCase() === "location" ? "/done" : null),
          getSetCookie: () => ["ASP.NET_SessionId=redirect; Path=/"]
        },
        text: async () => ""
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (name) => (name === "content-type" ? "text/html" : null),
        getSetCookie: () => []
      },
      text: async () => "<html>done</html>",
      url: "https://demo.moraware.net/done"
    };
  };

  const result = await morawareWebFetch("https://demo.moraware.net/start", { jar, fetchFn });
  assert.equal(result.status, 200);
  assert.equal(buildCookieHeader(jar).includes("redirect"), true);
  assert.equal(calls.length, 2);
  assert.equal(resolveMorawareUrl("https://demo.moraware.net/start", "/done"), "https://demo.moraware.net/done");
}

async function testEstablishWebSessionSuccess() {
  const fetchFn = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/sys/login") && (opts.method ?? "GET") === "GET") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name) => (name === "content-type" ? "text/html" : null),
          getSetCookie: () => ["ASP.NET_SessionId=prelogin; Path=/"]
        },
        text: async () => LOGIN_HTML,
        url: u
      };
    }
    if ((opts.method ?? "GET") === "POST") {
      return {
        ok: false,
        status: 302,
        statusText: "Found",
        headers: {
          get: (name) => {
            if (name.toLowerCase() === "location") return "/sys/home";
            return name === "content-type" ? "text/html" : null;
          },
          getSetCookie: () => ["ASP.NET_SessionId=loggedin; Path=/; HttpOnly"]
        },
        text: async () => "",
        url: u
      };
    }
    if (u.includes("/sys/home")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name) => (name === "content-type" ? "text/html" : null),
          getSetCookie: () => []
        },
        text: async () => "<html><body>Dashboard</body></html>",
        url: u
      };
    }
    if (u.includes("/sys/report/?view=222")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name) => (name === "content-type" ? "text/html" : null),
          getSetCookie: () => []
        },
        text: async () => `<html><body>${"<a href='/sys/job/1'>x</a>".repeat(40)}</body></html>`,
        url: u
      };
    }
    throw new Error(`unexpected fetch ${u} ${opts.method ?? "GET"}`);
  };

  const result = await establishMorawareWebSession({
    webBase: "https://demo.moraware.net",
    userName: "user",
    password: "pass",
    fetchFn
  });
  assert.equal(result.ok, true);
  assert.equal(result.authMode, "web_cookie");
  assert.equal(buildCookieHeader(result.jar).includes("loggedin"), true);
  assert.match(result.verifyUrl, /view=222/);
}

async function testEstablishWebSessionFailureDiagnostics() {
  const fetchFn = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/sys/login") && (opts.method ?? "GET") === "GET") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null, getSetCookie: () => [] },
        text: async () => LOGIN_HTML,
        url: u
      };
    }
    if ((opts.method ?? "GET") === "POST") {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === "content-type" ? "text/html" : null), getSetCookie: () => [] },
        text: async () => "<html><body>Login<input type='password' name='Password'></body></html>",
        url: u
      };
    }
    if (u.includes("/sys/report/?view=222")) {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === "content-type" ? "text/html" : null), getSetCookie: () => [] },
        text: async () => "<html><body>Login<input type='password' name='Password'></body></html>",
        url: u
      };
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => null, getSetCookie: () => [] },
      text: async () => "missing",
      url: u
    };
  };

  const prev = process.env.MORAWARE_WEB_LOGIN_PATH;
  process.env.MORAWARE_WEB_LOGIN_PATH = "/sys/login";
  try {
    const result = await establishMorawareWebSession({
      webBase: "https://demo.moraware.net",
      userName: "user",
      password: "pass",
      fetchFn
    });
    assert.equal(result.ok, false);
    assert.equal(result.lastAttempt?.resolvedSubmitButton, "btnLogin");
    assert.equal(result.lastAttempt?.hiddenFields?.__VIEWSTATE, true);
    assert.equal(result.lastAttempt?.stillLooksLikeLogin, true);
    assert.equal(String(result.lastAttempt?.bodyPreview ?? "").includes("Password"), true);
    assert.equal(redactMorawareUrl("https://x?sessionId=abc").includes("abc"), false);
  } finally {
    if (prev == null) delete process.env.MORAWARE_WEB_LOGIN_PATH;
    else process.env.MORAWARE_WEB_LOGIN_PATH = prev;
  }
}

function testLoginPathOverride() {
  const prev = process.env.MORAWARE_WEB_LOGIN_PATH;
  process.env.MORAWARE_WEB_LOGIN_PATH = "/d.aspx";
  try {
    assert.deepEqual(getMorawareWebLoginEntryPaths(), ["/d.aspx"]);
  } finally {
    if (prev == null) delete process.env.MORAWARE_WEB_LOGIN_PATH;
    else process.env.MORAWARE_WEB_LOGIN_PATH = prev;
  }
}

const tests = [
  ["cookie jar", testCookieJar],
  ["extract login form action", testExtractLoginFormUsesAction],
  ["login payload includes submit", testBuildLoginPostPayloadIncludesSubmit],
  ["custom field overrides", testCustomFieldOverrides],
  ["select best login form", testSelectBestLoginForm],
  ["looks like login html", testLooksLikeLoginHtml],
  ["redact response snippet", testRedactResponseSnippet],
  ["describe login form", testDescribeLoginFormRedactsUrls],
  ["describe login post result", testDescribeLoginPostResultRedacted],
  ["redirect cookies preserved", testMorawareWebFetchFollowsRedirectCookies],
  ["establish web session success", testEstablishWebSessionSuccess],
  ["establish web session failure diagnostics", testEstablishWebSessionFailureDiagnostics],
  ["login path override", testLoginPathOverride]
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
  console.log(`morawareWebSession: all ${tests.length} tests passed`);
})();
