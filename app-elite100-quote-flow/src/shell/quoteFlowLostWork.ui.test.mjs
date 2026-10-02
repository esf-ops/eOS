/**
 * Quote Flow — unsaved work survives tab switches and session token refreshes.
 * Run: node app-elite100-quote-flow/src/shell/quoteFlowLostWork.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const read = (p) => readFileSync(join(src, p), "utf8");

console.log("\nquoteFlowLostWork.ui.test.mjs\n");

const app = read("QuoteFlowApp.tsx");
assert.doesNotMatch(app, /mainNav === "(inbox|queue|estimates)" \? \(\s*<(InboxPage|EstimateQueuePage|EstimatesListPage)/);
assert.match(app, /visitedNav\.has\("inbox"\)/);
assert.match(app, /visitedNav\.has\("queue"\)/);
assert.match(app, /visitedNav\.has\("estimates"\)/);
assert.match(app, /hidden=\{!active\}/);
assert.match(app, /isActive=\{mainNav === "inbox"\}/);
assert.match(app, /isActive=\{mainNav === "queue"\}/);
assert.match(app, /isActive=\{mainNav === "estimates"\}/);
assert.match(app, /openRequestSeq=\{openEstimateSeq\}/);
assert.match(app, /openRequestSeq=\{openInboxSeq\}/);
assert.doesNotMatch(app, /\}, \[sessionToken\]\);/);
assert.match(app, /\}, \[hasSession\]\);/);
console.log("ok: visited tabs stay mounted (hidden), cross-tab opens carry a request sequence");

const tokenKeyedEffect = /\}, \[[^\]]*\bauthToken\b[^\]]*\]\)/;
for (const file of [
  "estimates/EstimatesListPage.tsx",
  "estimates/OfficialPricingPanel.tsx",
  "estimates/OfficialReviewPanel.tsx",
  "estimates/OfficialActivityPanel.tsx",
  "estimates/OfficialDigitalEstimatePanel.tsx",
  "estimates/OfficialSoldAccountingPanel.tsx",
  "inbox/InboxPage.tsx"
]) {
  assert.doesNotMatch(read(file), tokenKeyedEffect, `${file}: an effect/callback re-runs on token refresh`);
}
const queue = read("queue/EstimateQueuePage.tsx");
assert.match(queue, /void loadList\("initial"\);\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\}, \[\]\);/);
console.log("ok: no list/panel load is keyed on the session token");

const sold = read("estimates/OfficialSoldAccountingPanel.tsx");
assert.match(sold, /fetchQuoteFlowSoldWorkspace\(authTokenRef\.current, estimateId\)/);
assert.match(sold, /\}, \[estimateId\]\);/);
console.log("ok: sold checklist is not reset by a token refresh");

const inbox = read("inbox/InboxPage.tsx");
assert.match(inbox, /fetchQuoteFlowInbox\(authTokenRef\.current/);
assert.match(inbox, /if \(!isActive\) return;/);
assert.match(inbox, /document\.visibilityState === "hidden"/);
assert.match(inbox, /if \(isActive && !wasActiveRef\.current\) void loadList\("poll"\)/);
console.log("ok: inbox polling uses the current token and pauses while hidden");

const page = read("estimates/EstimatesListPage.tsx");
assert.match(page, /function closeModal\(\) \{\s*if \(!confirmDiscardUnsaved\(\)\) return;/);
assert.match(page, /if \(modalOpen && selectedId === initialEstimateId\) return;\s*if \(!confirmDiscardUnsaved\(\)\) return;/);
assert.match(page, /onClick=\{\(\) => requestSection\(s\.key\)\}/);
assert.match(page, /section === "pricing" && next !== "pricing" && pricingDirty/);
assert.match(page, /onDirtyChange=\{setPricingDirty\}/);
assert.match(page, /addEventListener\("beforeunload"/);
const pricing = read("estimates/OfficialPricingPanel.tsx");
assert.match(pricing, /onDirtyChange\?: \(dirty: boolean\) => void;/);
assert.match(pricing, /onDirtyChangeRef\.current\?\.\(dirty && !loading\)/);
console.log("ok: closing, switching sections or opening another estimate asks before discarding edits");

console.log("\nquoteFlowLostWork.ui.test.mjs: all passed\n");
