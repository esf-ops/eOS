/**
 * Production-build browser test: /e#token → successful baseline render under CSP.
 * Stubs v2 session with frozen baseline + no envelope. Never uses a real token.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const distRoot = join(appRoot, "dist");
const FAKE_TOKEN = "disposable-test-token-bbbbbbbbbbbbbbbb";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function ensureProductionBuild() {
  execSync("npm run build", {
    cwd: appRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      VITE_BACKEND_URL: "https://api.eliteosfab.com",
      VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED: "false",
      VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED: "false",
      VITE_DE_PUBLIC_BUILD_ID: "csp-baseline"
    }
  });
  assert.ok(existsSync(join(distRoot, "index.html")));
}

function startStaticServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let pathname = url.pathname;
    if (pathname === "/" || pathname === "/e" || pathname === "/e/") pathname = "/index.html";
    const filePath = join(distRoot, pathname.replace(/^\//, ""));
    if (!filePath.startsWith(distRoot) || !existsSync(filePath)) {
      res.writeHead(404).end("not found");
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    execSync("npm install --no-save playwright@1.55.0", {
      cwd: appRoot,
      stdio: "pipe"
    });
    return require("playwright");
  }
}

const BASELINE_RESPONSE = {
  ok: true,
  lifecycle: "blocked",
  readMode: "baseline",
  message: null,
  // Correct v2 contract: inner estimate only (not the v1 { ok, estimate, access } wrapper)
  estimate: {
    documentTitle: "Digital Estimate",
    quoteNumber: "ESF-EXAMPLE-000100",
    revisionLabel: "R1",
    revisionNumber: 1,
    publishedAt: "2026-07-16T00:00:00.000Z",
    pricingValidThrough: "2026-10-16",
    project: {
      customerName: "Example Homes LLC",
      projectName: "Kitchen",
      projectAddress: null
    },
    rooms: [{ name: "Kitchen", summaryLines: ["Quartz"], materialLabel: "Elite 100", colorLabel: null }],
    lineItems: [{ label: "Estimated project total", amount: 10000 }],
    totals: { estimatedProjectTotal: 10000, currency: "USD", rounding: "nearest" },
    notes: [],
    disclosures: { version: "v1", text: "Estimate only." }
  },
  configuration: null,
  session: { id: "sess-test", status: "blocked", rowVersion: 1, expiresAt: null }
};

/** Historical buggy production shape — nested serializer wrapper under estimate */
const BUGGY_NESTED_RESPONSE = {
  ok: true,
  lifecycle: "blocked",
  readMode: "baseline",
  message: null,
  estimate: {
    ok: true,
    estimate: BASELINE_RESPONSE.estimate,
    access: { expiresAt: "2026-12-01T00:00:00.000Z" }
  },
  configuration: null,
  session: { id: "sess-test", status: "blocked", rowVersion: 1, expiresAt: null }
};

console.log("\nphaseDe2g.baselineRender.browser.test.mjs\n");

ensureProductionBuild();
const html = readFileSync(join(distRoot, "index.html"), "utf8");
assert.ok(/style-src 'self'/.test(html), "production CSP must allow style-src 'self'");
assert.equal(/style-src[^;]*'unsafe-inline'/.test(html), false, "production must omit unsafe-inline styles");
assert.ok(html.includes("connect-src 'self' https://api.eliteosfab.com"));
assert.ok(html.includes('rel="stylesheet"'));
assert.ok(html.includes('content="csp-baseline"'));

const { server, origin } = await startStaticServer();
const playwright = await loadPlaywright();
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();

/** @type {string[]} */
const pageErrors = [];
/** @type {string[]} */
const cspViolations = [];

page.on("pageerror", (err) => {
  pageErrors.push(String(err?.message || err));
});
page.on("console", (msg) => {
  const text = msg.text();
  // Ignore known meta-CSP note about frame-ancestors; fail only on blocked assets/styles.
  if (/frame-ancestors' is ignored/i.test(text)) return;
  if (
    /Refused to apply inline style|Refused to load the stylesheet|Refused to (apply|load).*style|blocked:csp/i.test(
      text
    )
  ) {
    cspViolations.push(text.slice(0, 200));
  }
});
page.on("crash", () => {
  pageErrors.push("page_crash");
});

await page.addInitScript(() => {
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev?.reason;
    const msg =
      reason && typeof reason === "object" && "message" in reason
        ? String(reason.message)
        : String(reason || "unhandledrejection");
    window.__deUnhandled = window.__deUnhandled || [];
    window.__deUnhandled.push(msg.slice(0, 120));
  });
});

await page.route("**/api/public-digital-estimate/v2/session", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "authorization,content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      }
    });
    return;
  }
  if (request.method() === "POST") {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify(BASELINE_RESPONSE)
    });
    return;
  }
  if (request.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify(BASELINE_RESPONSE)
    });
    return;
  }
  await route.fulfill({
    status: 404,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify({ ok: false, error: "Estimate unavailable" })
  });
});

await page.route("https://api.eliteosfab.com/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "authorization,content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      }
    });
    return;
  }
  if (request.url().includes("/v2/session") && request.method() === "POST") {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify(BASELINE_RESPONSE)
    });
    return;
  }
  if (request.url().includes("/v2/session") && request.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify(BASELINE_RESPONSE)
    });
    return;
  }
  if (request.url().includes("/api/public-digital-estimate/v1/") && request.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify({
        ok: true,
        estimate: BASELINE_RESPONSE.estimate,
        access: { status: "active", pricingValidThrough: BASELINE_RESPONSE.estimate.pricingValidThrough }
      })
    });
    return;
  }
  await route.fulfill({
    status: 404,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify({ ok: false, error: "Estimate unavailable" })
  });
});

const cssResponses = [];
page.on("response", (res) => {
  const url = res.url();
  if (/\.css(\?|$)/.test(url)) {
    cssResponses.push({ url, status: res.status(), fromServiceWorker: res.fromServiceWorker() });
  }
});

await page.goto(`${origin}/e#${FAKE_TOKEN}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Example Homes LLC", { timeout: 10000 });

const hash = await page.evaluate(() => window.location.hash);
const unavailable = await page.locator(".unavailable").count();
const bodyText = await page.locator("body").innerText();
const unhandled = await page.evaluate(() => window.__deUnhandled || []);

const styleProbe = await page.evaluate(() => {
  const pageEl = document.querySelector(".page");
  const bodyCs = getComputedStyle(document.body);
  const link = document.querySelector('link[rel="stylesheet"]');
  return {
    hasPage: Boolean(pageEl),
    hasStylesheetLink: Boolean(link),
    stylesheetHref: link?.getAttribute("href") || null,
    bodyBackground: bodyCs.backgroundColor,
    pageMinHeight: pageEl ? getComputedStyle(pageEl).minHeight : null
  };
});

assert.equal(hash, "", "fragment must be cleared after capture");
assert.equal(unavailable, 0, "must not show unavailable after successful baseline exchange");
assert.ok(bodyText.includes("Example Homes LLC"), "baseline customer label must render");
assert.ok(
  bodyText.includes("10000") || bodyText.includes("$10,000") || bodyText.includes("10,000"),
  "baseline total must render"
);
assert.equal(pageErrors.length, 0, `uncaught page errors: ${pageErrors.join(" | ")}`);
assert.equal(cspViolations.length, 0, `CSP violations: ${cspViolations.join(" | ")}`);
assert.equal(unhandled.length, 0, `unhandled rejections: ${unhandled.join(" | ")}`);
assert.ok(styleProbe.hasPage, ".page root must exist");
assert.ok(styleProbe.hasStylesheetLink, "stylesheet link must be present");
assert.ok(
  cssResponses.some((r) => r.status === 200),
  "generated CSS response must be 200 (not CSP-blocked at network)"
);
assert.ok(
  /rgb\(\s*244,\s*246,\s*248\s*\)|#f4f6f8/i.test(String(styleProbe.bodyBackground)),
  `generated stylesheet must be applied (got body background ${styleProbe.bodyBackground})`
);
assert.ok(
  styleProbe.pageMinHeight === "100vh" ||
    styleProbe.pageMinHeight === "100%" ||
    Number.parseFloat(String(styleProbe.pageMinHeight)) > 100,
  `page min-height from stylesheet expected (got ${styleProbe.pageMinHeight})`
);
console.log("ok: fragment exchange → baseline render under style-src 'self'");

// Cookie resume (GET /e without fragment)
pageErrors.length = 0;
await page.goto(`${origin}/e`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Example Homes LLC", { timeout: 10000 });
assert.equal(await page.locator(".unavailable").count(), 0);
assert.ok((await page.locator("body").innerText()).includes("Example Homes LLC"));
assert.equal(pageErrors.length, 0, `resume page errors: ${pageErrors.join(" | ")}`);
console.log("ok: cookie session resume → baseline render");

// Historical buggy nested wrapper must still render via frontend unwrap
await page.unroute("**/api/public-digital-estimate/v2/session");
await page.unroute("https://api.eliteosfab.com/**");
await page.route("**/api/public-digital-estimate/v2/session", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "authorization,content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      }
    });
    return;
  }
  await route.fulfill({
    status: request.method() === "POST" ? 201 : 200,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify(BUGGY_NESTED_RESPONSE)
  });
});
await page.route("https://api.eliteosfab.com/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "authorization,content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      }
    });
    return;
  }
  await route.fulfill({
    status: request.method() === "POST" ? 201 : 200,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify(BUGGY_NESTED_RESPONSE)
  });
});

pageErrors.length = 0;
await page.goto(`${origin}/e#${FAKE_TOKEN}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Example Homes LLC", { timeout: 10000 });
assert.equal(await page.locator(".unavailable").count(), 0, "nested wrapper must not DE-RENDER");
assert.equal(pageErrors.length, 0, `nested wrapper errors: ${pageErrors.join(" | ")}`);
console.log("ok: nested buggy estimate wrapper unwraps and renders");

await browser.close();
await new Promise((r) => server.close(r));

console.log("\nAll baseline render browser tests passed.\n");
