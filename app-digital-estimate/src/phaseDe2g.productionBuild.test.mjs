/**
 * Phase DE.2G — production build artifact checks (CSP + API host + build marker).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const distHtml = join(appRoot, "dist", "index.html");

// Always rebuild with known env so CSP + inlined API host assertions are deterministic.
execSync("npm run build", {
  cwd: appRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_BACKEND_URL: "https://api.eliteosfab.com",
    VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED: "true",
    VITE_DE_PUBLIC_BUILD_ID: "test-build"
  }
});

assert.ok(existsSync(distHtml), "dist/index.html required");

const html = readFileSync(distHtml, "utf8");
assert.ok(
  html.includes("connect-src 'self' https://api.eliteosfab.com"),
  "built CSP must allow Brain API origin in connect-src"
);
assert.ok(/style-src 'self'/.test(html), "built CSP must allow same-origin stylesheets");
assert.equal(
  /style-src[^;]*'unsafe-inline'/.test(html),
  false,
  "production CSP must not rely on unsafe-inline for styles"
);
assert.ok(html.includes('rel="stylesheet"'), "production build must emit external stylesheet link");
assert.ok(html.includes('name="eliteos-de-build"'), "build marker meta required");
assert.ok(html.includes('content="test-build"'), "build marker value present");

const assetDir = join(appRoot, "dist", "assets");
const jsName = html.match(/\/assets\/(index-[^"]+\.js)/)?.[1];
assert.ok(jsName, "production JS asset required");
const js = readFileSync(join(assetDir, jsName), "utf8");
assert.ok(js.includes("https://api.eliteosfab.com"), "bundle must inline production API host");
assert.ok(js.includes("/api/public-digital-estimate/v2/session"), "bundle must include v2 session exchange");
assert.ok(js.includes("EstimateErrorBoundary") || js.includes("could not be displayed"), "error boundary shipped");
assert.equal(/localStorage\./.test(js), false);

console.log("\nphaseDe2g.productionBuild.test.mjs\n");
console.log("ok: production build CSP, API host, build marker, v2 exchange");
console.log("\nAll production build tests passed.\n");
