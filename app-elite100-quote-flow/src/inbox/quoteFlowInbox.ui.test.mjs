/**
 * Quote Flow Inbox UI contracts (Slice 1B).
 * Run: node app-elite100-quote-flow/src/inbox/quoteFlowInbox.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");

console.log("\nquoteFlowInbox.ui.test.mjs\n");

const inbox = readFileSync(join(appRoot, "src/inbox/InboxPage.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowInboxApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");

assert.match(inbox, /data-testid="qf-inbox-page"/);
assert.match(inbox, /data-testid="qf-inbox-list"/);
assert.match(inbox, /data-testid="qf-inbox-row"/);
assert.match(inbox, /data-testid="qf-inbox-attachment"/);
assert.match(inbox, /data-testid="qf-inbox-start-takeoff"/);
assert.match(inbox, /Start AI Takeoff|Select for AI Takeoff/);
assert.match(inbox, /Supported plan|Needs mark as plan/);
assert.match(api, /\/api\/elite100-quote-flow\/inbox/);
assert.match(api, /start-takeoff/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.doesNotMatch(inbox, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(inbox, /Approve Estimate|mark sold|auto-publish/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
console.log("ok: Inbox UI shows rows and attachment actions; no V1/V2 copy");

console.log("\nquoteFlowInbox.ui.test.mjs: ok\n");
