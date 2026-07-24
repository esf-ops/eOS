/**
 * Live Digital Estimates UI smoke (source-level).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/liveDigitalEstimates.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
const page = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/LiveDigitalEstimatesPage.tsx"),
  "utf8"
);
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");

console.log("\nliveDigitalEstimates.ui.test.mjs\n");

assert.match(app, /Live Digital Estimates/);
assert.match(app, /LiveDigitalEstimatesPage/);
assert.match(app, /data-testid="studio-nav-publications"/);
assert.match(page, /data-testid="live-digital-estimates-page"/);
assert.match(page, /live-de-metrics/);
assert.match(page, /live-de-loading/);
assert.match(page, /live-de-empty/);
assert.match(page, /live-de-error/);
assert.match(page, /live-de-copy-link/);
assert.match(page, /window\.confirm/);
assert.match(page, /sessionStorage/);
assert.match(page, /Opening this drawer does not copy a link/);
assert.doesNotMatch(page, /useEffect\([\s\S]{0,300}copyCustomerLink/);
assert.match(css, /\.live-de-metrics/);
console.log("ok: Live Digital Estimates nav + portfolio UI contracts");
console.log("\nliveDigitalEstimates.ui.test.mjs: ok\n");
