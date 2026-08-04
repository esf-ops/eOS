/**
 * Elite 100 quote-platform head shell navigation contracts.
 * Run: node app-elite100-estimate-studio/src/shell/headShellNavigation.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const app = readFileSync(
  join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
  "utf8",
);
const shell = readFileSync(
  join(
    root,
    "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx",
  ),
  "utf8",
);
const css = readFileSync(
  join(root, "app-elite100-estimate-studio/src/styles.css"),
  "utf8",
);

console.log("\nheadShellNavigation.ui.test.mjs\n");

const navStart = app.indexOf('<nav className="studio-nav"');
const navEnd = app.indexOf("</nav>", navStart);
assert.ok(navStart >= 0 && navEnd > navStart);
const nav = app.slice(navStart, navEnd);

for (const testId of [
  "studio-nav-inbox",
  "studio-nav-estimates",
  "studio-nav-digital-estimates",
  "studio-nav-studio-v2",
  "studio-nav-new-estimate",
  "studio-nav-more",
]) {
  assert.ok(nav.includes(`data-testid="${testId}"`), `${testId} is first-class navigation`);
}
assert.ok(nav.indexOf("studio-nav-inbox") < nav.indexOf("studio-nav-estimates"));
assert.ok(nav.indexOf("studio-nav-estimates") < nav.indexOf("studio-nav-digital-estimates"));
assert.ok(nav.indexOf("studio-nav-digital-estimates") < nav.indexOf("studio-nav-studio-v2"));
assert.ok(nav.indexOf("studio-nav-studio-v2") < nav.indexOf("studio-nav-new-estimate"));
assert.ok(nav.indexOf("studio-nav-new-estimate") < nav.indexOf("studio-nav-more"));
console.log("ok: primary nav exposes Inbox, Estimates, Digital Estimates, Studio V2, New, More");

assert.match(
  app,
  /data-testid="studio-nav-inbox"[\s\S]{0,300}clearWorkspaceSelectionFromNav\("shared-inbox"\)/,
);
assert.match(
  app,
  /data-testid="studio-nav-estimates"[\s\S]{0,300}clearWorkspaceSelectionFromNav\("all-estimates"\)/,
);
assert.match(
  app,
  /data-testid="studio-nav-digital-estimates"[\s\S]{0,350}clearWorkspaceSelectionFromNav\("digital-estimates"\)/,
);
assert.match(app, /mainNav === "digital-estimates" \? \([\s\S]{0,120}<DigitalEstimatesPage/);
console.log("ok: primary list navigation opens the existing head pages");

assert.match(
  app,
  /data-testid="studio-nav-studio-v2"[\s\S]{0,700}openStudioV2Landing\(\)/,
);
assert.match(app, /data-testid="studio-v2-landing"/);
assert.match(app, /<h1>Studio V2 Workspace<\/h1>/);
assert.match(
  app,
  /Open an estimate from Inbox, Estimates, or Digital Estimates to begin\./,
);
for (const testId of [
  "studio-v2-landing-inbox",
  "studio-v2-landing-estimates",
  "studio-v2-landing-digital-estimates",
]) {
  assert.ok(app.includes(`data-testid="${testId}"`));
}
assert.match(css, /\.studio-v2-landing/);
console.log("ok: Studio V2 direct navigation has a clean no-case landing");

assert.match(
  app,
  /<DigitalEstimatesPage[\s\S]{0,700}returnNav:\s*"digital-estimates"[\s\S]{0,300}applyStudioV2WorkspaceUrl\(\{ caseId, mode: "push" \}\)/,
);
assert.match(
  app,
  /StudioV2EstimatorShell[\s\S]{0,250}onBack=\{\(\) => leaveEstimateWorkspace\(\)\}/,
);
console.log("ok: Digital Estimates opens refresh-safe Studio V2 and Back returns to its list");

const moreStart = app.indexOf('data-testid="studio-nav-more-menu"');
const moreEnd = app.indexOf("</ul>", moreStart);
assert.ok(moreStart >= 0 && moreEnd > moreStart);
const more = app.slice(moreStart, moreEnd);
assert.match(more, /Legacy \/ compatibility/);
assert.match(more, /Support tools/);
assert.match(more, /Legacy Publish Digital Estimate/);
assert.match(more, /Review Requests \(Compatibility\)/);
assert.match(more, /Command Center \(Compatibility\)/);
assert.match(more, /Open Legacy Queue/);
assert.doesNotMatch(more, /studio-nav-digital-estimates/);
console.log("ok: More is explicitly legacy, compatibility, and support");

assert.match(shell, /Open Takeoff Review/);
assert.match(shell, /studio-v2-open-takeoff-review/);
assert.match(shell, /Create Studio V2 Draft/);
assert.doesNotMatch(shell, /Create or open it in V1 first/);
assert.match(shell, /Studio V2 remains where the estimate is finalized|quote authority|does not price, publish/);
assert.doesNotMatch(shell, /Open in V1 \(Legacy fallback\)/);
console.log("ok: Takeoff Review is supporting tool; Studio V2 is authority");

const landingFunction = app.slice(
  app.indexOf("function openStudioV2Landing"),
  app.indexOf("// Browser back/forward"),
);
for (const forbidden of [
  "apiPost",
  "approve",
  "calculate",
  "revision",
  "sold",
  "publish(",
]) {
  assert.equal(
    landingFunction.includes(forbidden),
    false,
    `Studio V2 landing navigation must not trigger ${forbidden}`,
  );
}
console.log("ok: shell navigation has no workflow mutation side effects");

console.log("\nheadShellNavigation.ui.test.mjs: ok\n");
