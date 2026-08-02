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
const head = readFileSync(
  join(root, "app-elite100-estimate-studio/src/digitalEstimates/DigitalEstimatesPage.tsx"),
  "utf8"
);
const page = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/LiveDigitalEstimatesPage.tsx"),
  "utf8"
);
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");

console.log("\nliveDigitalEstimates.ui.test.mjs\n");

assert.match(app, /Digital Estimates/);
assert.match(app, /DigitalEstimatesPage/);
assert.match(app, /data-testid="studio-nav-digital-estimates"/);
assert.match(app, /mainNav === "digital-estimates"/);
assert.match(
  app,
  /<DigitalEstimatesPage[\s\S]{0,900}applyStudioV2WorkspaceUrl\(\{ caseId, mode: "push" \}\)/
);
assert.match(head, /data-testid="digital-estimates-head"/);
assert.match(head, /readOnlyHead/);
assert.match(page, /data-testid="live-digital-estimates-page"/);
assert.match(page, /data-testid="live-de-title">Digital Estimates/);
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
assert.match(page, /Published: \{money\(row\.publishedValue\)\}/);
assert.match(page, /Current: \{money\(row\.configuredValue\)\}/);
assert.match(page, /Difference:/);
assert.match(page, /Viewed: \{row\.viewed \? "Yes" : "No"\}/);
assert.match(page, /Saved selections:/);
assert.match(page, /Review requested:/);
assert.match(page, /Accepted:/);
assert.match(page, /data-testid="digital-estimate-open-studio"/);
assert.match(page, /data-testid="digital-estimate-open-customer-link"/);
assert.match(page, /data-testid="digital-estimate-copy-customer-link"/);
assert.match(page, /Open Studio V2/);
assert.match(page, /No customer activity yet/);
assert.match(page, /1 item needs attention/);
assert.match(page, /extractStaffCustomerUrl/);
assert.match(page, /Link available/);
assert.match(page, /No recoverable customer link is stored/);
assert.match(page, /live-de-link-state/);
assert.match(page, /disabled=\{busy \|\| !customerUrl\}/);
assert.doesNotMatch(page, /Link ready \(not opened automatically\)/);
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
