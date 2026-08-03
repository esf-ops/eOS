/**
 * Elite 100 command-center layout contracts (presentation pass).
 * Run: node app-elite100-estimate-studio/src/shell/elite100CommandCenterLayout.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
const shell = readFileSync(join(here, "Elite100CommandShell.tsx"), "utf8");
const estimates = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/AllEstimatesPage.tsx"),
  "utf8",
);
const liveDe = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/LiveDigitalEstimatesPage.tsx"),
  "utf8",
);
const inbox = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/SharedInboxPage.tsx"),
  "utf8",
);
const wizard = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/ManualEstimateWizard.tsx"),
  "utf8",
);
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");

console.log("\nelite100CommandCenterLayout.ui.test.mjs\n");

assert.match(app, /Elite100CommandShell/);
assert.match(app, /data-testid="studio-primary-nav"/);
assert.match(shell, /Elite 100 Estimate Studio/);
assert.match(shell, /Quote request → estimate → Digital Estimate/);
assert.match(shell, /Elite Stone Fabrication/);
assert.match(shell, /data-testid="elite100-command-hero"/);
assert.match(css, /\.e100-hero/);
assert.match(css, /\.e100-status-pill/);
console.log("ok: 1 command-center shell + primary nav present");

assert.match(app, /useState<MainNav>\(\(\) =>[\s\S]{0,120}"shared-inbox"/);
assert.match(app, /data-testid="studio-nav-inbox"/);
assert.match(inbox, /data-testid="shared-inbox-primary-action"/);
assert.match(inbox, /data-testid="shared-inbox-view-details"/);
assert.match(inbox, /Step 1 · Quote request queue/);
console.log("ok: 2 default Inbox landing stays safe with Start/Resume/details actions");

assert.match(estimates, /data-testid="studio-all-estimates"/);
assert.match(estimates, /e100-table-card/);
assert.match(estimates, /e100-table-row/);
assert.match(estimates, /Elite100StatusPill/);
assert.doesNotMatch(estimates, /divide-y divide-border/);
assert.match(estimates, /accepted_awaiting_sold_review/);
assert.match(estimates, /data-testid=\{`all-estimates-filter-\$\{f\.key\}`\}/);
assert.match(estimates, /data-testid="all-estimates-open"/);
console.log("ok: 3 Estimates tab uses production rows/cards, not raw bullet list");

assert.match(app, /data-testid="studio-nav-digital-estimates"/);
assert.match(liveDe, /data-testid="live-digital-estimates-page"/);
assert.match(liveDe, /Open details/);
assert.match(liveDe, /Open Studio V2/);
assert.match(liveDe, /Open customer link/);
assert.match(liveDe, /Copy customer link/);
assert.match(liveDe, /data-testid="digital-estimate-open-studio"/);
assert.match(liveDe, /Submitted selections:/);
console.log("ok: 4 Digital Estimates remains first-class with row actions");

assert.match(app, /data-testid="studio-v2-landing"/);
assert.match(
  app,
  /Open an estimate from Inbox, Estimates, or Digital Estimates to begin\./,
);
assert.match(app, /studio-v2-landing-inbox/);
console.log("ok: 5 Studio V2 empty state polished and actionable");

assert.match(app, /data-testid="studio-nav-new-estimate"/);
assert.match(app, /setNewEstimateOpen\(true\)/);
assert.match(wizard, /data-testid="new-estimate-launcher"/);
assert.match(wizard, /data-testid="new-estimate-close"/);
assert.match(wizard, /e100-form-group/);
assert.match(wizard, /never publishes or notifies a customer/);
console.log("ok: 6 New Estimate drawer still opens/closes with grouped fields");

const moreStart = app.indexOf('data-testid="studio-nav-more-menu"');
const moreEnd = app.indexOf("</ul>", moreStart);
const more = app.slice(moreStart, moreEnd);
assert.match(more, /Legacy \/ compatibility/);
assert.match(more, /Support tools/);
assert.match(more, /Command Center \(Compatibility\)/);
assert.match(more, /Legacy Publish Digital Estimate/);
assert.match(more, /Review Requests \(Compatibility\)/);
assert.match(more, /Open Legacy Queue/);
console.log("ok: 7 More dropdown keeps legacy/compatibility + support tools");

for (const forbidden of [
  "autoApprove: true",
  "autoCalculate: true",
  "pricingFormula",
  "markSold(true)",
]) {
  assert.equal(shell.includes(forbidden), false);
  assert.equal(estimates.includes(forbidden), false);
}
console.log("ok: 8 presentation pass does not introduce workflow mutations");

console.log("\nelite100CommandCenterLayout.ui.test.mjs: ok\n");
