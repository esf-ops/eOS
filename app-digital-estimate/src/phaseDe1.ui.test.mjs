/**
 * Phase DE.1 UI boundary tests (no React mount / no network).
 * Run: node app-digital-estimate/src/phaseDe1.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = __dirname;
const appRoot = join(srcRoot, "..");

console.log("\nphaseDe1.ui.test.mjs\n");

const indexHtml = readFileSync(join(appRoot, "index.html"), "utf8");
const appTsx = readFileSync(join(srcRoot, "App.tsx"), "utf8");
const stylesCss = readFileSync(join(srcRoot, "styles.css"), "utf8");
const combined = [indexHtml, appTsx, stylesCss].join("\n");

const forbiddenThirdParty = [
  "googleapis.com",
  "gstatic.com",
  "google-analytics.com",
  "googletagmanager.com",
  "gtag(",
  "analytics.js",
  "segment.com",
  "hotjar.com",
  "facebook.net",
  "doubleclick.net",
  "fonts.googleapis",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cloudflare.com/ajax",
];

for (const needle of forbiddenThirdParty) {
  assert.equal(
    combined.toLowerCase().includes(needle.toLowerCase()),
    false,
    `must not reference third-party host or analytics: ${needle}`,
  );
}

assert.ok(
  indexHtml.includes('name="referrer"') && indexHtml.includes('content="no-referrer"'),
  "index.html must set referrer policy to no-referrer",
);

assert.ok(
  appTsx.includes("/e/") && /\/e\/[^/?#]+/.test(appTsx),
  "App.tsx must parse token from /e/:token path pattern",
);

assert.ok(
  appTsx.includes("/api/public-digital-estimate/v1/"),
  "App.tsx must fetch public digital estimate API",
);

assert.ok(
  appTsx.includes("This estimate is unavailable."),
  "App.tsx must show generic unavailable message",
);

assert.equal(
  combined.includes("supabase"),
  false,
  "public head must not reference Supabase client",
);

assert.equal(
  combined.includes("estimate.eliteosfab.com"),
  false,
  "must not reference estimate.eliteosfab.com as this app's host",
);

console.log("ok: no third-party scripts, fonts, or analytics");
console.log("ok: referrer no-referrer");
console.log("ok: /e/:token path pattern");
console.log("ok: public API + generic error handling");
console.log("ok: no Supabase / wrong host references");

console.log("\nAll phase DE.1 UI tests passed.\n");
