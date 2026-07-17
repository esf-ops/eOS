/**
 * Production-build browser bootstrap test for /e#token → v2 session exchange.
 * Uses Playwright against the Vite production build with an intercepted API.
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
const FAKE_TOKEN = "synthetic-test-token-aaaaaaaaaaaaaaaa";

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
      VITE_DE_PUBLIC_BUILD_ID: "boot-test"
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

async function runScenario({ contextOptions = {} } = {}) {
  ensureProductionBuild();
  const html = readFileSync(join(distRoot, "index.html"), "utf8");
  assert.ok(html.includes("connect-src 'self' https://api.eliteosfab.com"));
  assert.ok(/style-src 'self'/.test(html), "production CSP must allow same-origin CSS");
  assert.ok(html.includes('name="eliteos-de-build"'));
  assert.equal(html.includes('content="local"'), false);

  const { server, origin } = await startStaticServer();
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...contextOptions
  });
  const page = await context.newPage();

  /** @type {Array<{url:string, method:string, auth:string|null, credentials:string|null}>} */
  const posts = [];

  await page.route("**/api/public-digital-estimate/v2/session", async (route) => {
    const request = route.request();
    posts.push({
      url: request.url(),
      method: request.method(),
      auth: request.headers()["authorization"] || null,
      credentials: request.headers()["cookie"] ? "present" : "none"
    });
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

  await page.route("**/api/public-digital-estimate/**", async (route) => {
    if (route.request().url().includes("/v2/session")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      }
    });
  });

  // Handle CORS preflight if Playwright doesn't auto-short-circuit
  await page.route("https://api.eliteosfab.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers": "authorization,content-type",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        }
      });
      return;
    }
    if (request.url().includes("/api/public-digital-estimate/v2/session") && request.method() === "POST") {
      posts.push({
        url: request.url(),
        method: request.method(),
        auth: request.headers()["authorization"] || null,
        credentials: "include-mode"
      });
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

  await page.goto(`${origin}/e#${FAKE_TOKEN}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Example Homes LLC", { timeout: 10000 });

  const hash = await page.evaluate(() => window.location.hash);
  const unavailable = await page.locator(".unavailable").count();
  const bodyText = await page.locator("body").innerText();

  assert.equal(hash, "", "fragment must be cleared after capture");
  assert.equal(unavailable, 0, "must not show generic unavailable");
  assert.ok(bodyText.includes("Example Homes LLC"));
  assert.ok(bodyText.includes("10000") || bodyText.includes("$10,000") || bodyText.includes("10,000"));

  const postCalls = posts.filter((p) => p.method === "POST");
  assert.equal(postCalls.length, 1, "exactly one POST exchange");
  assert.ok(postCalls[0].url.includes("/api/public-digital-estimate/v2/session"));
  assert.equal(postCalls[0].auth, `Bearer ${FAKE_TOKEN}`);

  await browser.close();
  await new Promise((r) => server.close(r));
}

console.log("\nphaseDe2g.fragmentBootstrap.browser.test.mjs\n");

await runScenario();
console.log("ok: production build bootstrap (default storage)");

await runScenario({
  contextOptions: {
    // Incognito-equivalent: fresh context with no storage state
    storageState: undefined
  }
});
console.log("ok: production build bootstrap (fresh storage)");

console.log("\nAll fragment bootstrap browser tests passed.\n");
