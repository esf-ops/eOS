/**
 * Elite 100 Quote Flow shell UI contracts (Slice 1A).
 * Run: node app-elite100-quote-flow/src/shell/quoteFlowShell.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");

function readAllSrc(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "shell") continue; // exclude this contract test from copy scan
      readAllSrc(p, acc);
    } else if (/\.(tsx|ts|css|html)$/.test(name) && !name.endsWith(".test.mjs")) {
      acc.push(readFileSync(p, "utf8"));
    }
  }
  return acc;
}

console.log("\nquoteFlowShell.ui.test.mjs\n");

const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");
const inbox = readFileSync(join(appRoot, "src/inbox/InboxPage.tsx"), "utf8");
const queue = readFileSync(join(appRoot, "src/queue/EstimateQueuePage.tsx"), "utf8");
const estimates = readFileSync(join(appRoot, "src/estimates/EstimatesListPage.tsx"), "utf8");

assert.match(app, /data-testid="qf-nav-inbox"/);
assert.match(app, /data-testid="qf-nav-queue"/);
assert.match(app, /data-testid="qf-nav-estimates"/);
assert.match(app, />\s*Inbox\s*</);
assert.match(app, />\s*Estimate Queue\s*</);
assert.match(app, />\s*Estimates\s*</);
assert.match(app, /EliteosTopbar/);
assert.match(app, /appName="Elite 100 Quote Flow"/);
console.log("ok: UI renders Inbox / Estimate Queue / Estimates nav");

assert.match(inbox, /data-testid="qf-inbox-page"/);
assert.match(queue, /data-testid="qf-queue-page"/);
assert.match(estimates, /data-testid="qf-estimates-page"/);
assert.match(queue, /Set Scope/);
assert.match(inbox, /AI Takeoff/);
assert.match(inbox, /data-testid="qf-inbox-list"/);
console.log("ok: Inbox wired; Queue/Estimates remain placeholder until later slices");

const allSrc = readAllSrc(join(appRoot, "src")).join("\n");
assert.doesNotMatch(allSrc, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(allSrc, /Approve Estimate|mark sold|auto-publish|Digital Estimate publish/);
assert.doesNotMatch(app, /StudioV2|AiEstimatorWorkspace|takeoff-finish|working-draft/);
console.log("ok: no V1/V2 language; no pricing/publish/sold behavior in shell");

console.log("\nquoteFlowShell.ui.test.mjs: ok\n");
