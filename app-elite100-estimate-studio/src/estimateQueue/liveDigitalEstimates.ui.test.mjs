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
assert.match(page, /Publish an estimate/);
assert.match(page, /live-de-metrics/);
assert.match(page, /live-de-metrics-secondary/);
assert.match(page, /live-de-loading/);
assert.match(page, /live-de-empty/);
assert.match(page, /live-de-error/);
assert.match(page, /live-de-copy-link/);
assert.match(page, /live-de-action--\$\{tone\}/);
assert.match(page, /ActionTone = "neutral" \| "secondary" \| "warning" \| "destructive"/);
assert.match(page, /return "warning"/);
assert.match(page, /return "neutral"/);
assert.match(page, /role="dialog"/);
assert.match(page, /aria-modal="true"/);
assert.match(page, /Escape/);
assert.match(page, /live-de-drawer-close/);
assert.match(page, /window\.confirm/);
assert.match(page, /sessionStorage/);
assert.match(page, /Opening this drawer does not copy a link/);
assert.match(page, /Open details/);
assert.match(page, /No customer activity yet/);
assert.match(page, /1 item needs attention/);
assert.doesNotMatch(page, /eq-btn-primary live-de-next/);
assert.doesNotMatch(page, /Find estimate to publish/);
assert.doesNotMatch(page, /useEffect\([\s\S]{0,300}copyCustomerLink/);
assert.doesNotMatch(page, /useEffect\([\s\S]{0,300}link-copied/);
assert.match(css, /\.live-de-metrics/);
assert.match(css, /\.live-de-drawer/);
assert.match(css, /\.live-de-action--neutral/);
assert.match(css, /\.live-de-action--warning/);
assert.match(css, /\.live-de-action--destructive/);
console.log("ok: Live Digital Estimates nav + portfolio UI contracts");
console.log("\nliveDigitalEstimates.ui.test.mjs: ok\n");
