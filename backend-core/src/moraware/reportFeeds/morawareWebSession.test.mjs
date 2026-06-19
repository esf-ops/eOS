/**
 * morawareWebSession unit tests (no live Moraware).
 */
import assert from "node:assert/strict";

import {
  buildCookieHeader,
  createMorawareCookieJar,
  establishMorawareWebSession,
  extractLoginForm,
  ingestSetCookieHeader,
  looksLikeMorawareLoginHtml,
  redactResponseSnippet
} from "./morawareWebSession.js";

function testCookieJar() {
  const jar = createMorawareCookieJar();
  ingestSetCookieHeader(jar, "ASP.NET_SessionId=abc123; Path=/; HttpOnly", "https://demo.moraware.net/");
  assert.equal(buildCookieHeader(jar), "ASP.NET_SessionId=abc123");
}

function testExtractLoginForm() {
  const html = `
    <html><body>
      <form action="/sys/login" method="post">
        <input type="hidden" name="__VIEWSTATE" value="vs1" />
        <input type="text" name="UserName" value="" />
        <input type="password" name="Password" value="" />
        <input type="submit" value="Log In" />
      </form>
    </body></html>`;
  const form = extractLoginForm(html, "https://demo.moraware.net/sys/login");
  assert.equal(form?.action, "https://demo.moraware.net/sys/login");
  assert.equal(form?.fields.UserName, "");
  assert.equal(form?.fields.__VIEWSTATE, "vs1");
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

async function testEstablishWebSessionSuccess() {
  let step = 0;
  const fetchFn = async (url, opts = {}) => {
    step += 1;
    const u = String(url);
    if (step === 1 && u.includes("/sys/login")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name) => (name === "content-type" ? "text/html" : null),
          getSetCookie: () => ["ASP.NET_SessionId=prelogin; Path=/"]
        },
        text: async () =>
          `<form action="https://demo.moraware.net/sys/login" method="post">
             <input type="hidden" name="__VIEWSTATE" value="vs" />
             <input type="text" name="UserName" />
             <input type="password" name="Password" />
           </form>`,
        url: u
      };
    }
    if (opts.method === "POST") {
      return {
        ok: true,
        status: 302,
        statusText: "Found",
        headers: {
          get: () => null,
          getSetCookie: () => ["ASP.NET_SessionId=loggedin; Path=/; HttpOnly"]
        },
        text: async () => "<html><body>Dashboard</body></html>",
        url: "https://demo.moraware.net/sys/home"
      };
    }
    throw new Error(`unexpected fetch ${u} step ${step}`);
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
}

const tests = [
  ["cookie jar", testCookieJar],
  ["extract login form", testExtractLoginForm],
  ["looks like login html", testLooksLikeLoginHtml],
  ["redact response snippet", testRedactResponseSnippet],
  ["establish web session success", testEstablishWebSessionSuccess]
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
