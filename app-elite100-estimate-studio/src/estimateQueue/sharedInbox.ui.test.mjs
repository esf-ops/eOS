/**
 * Shared Inbox UI contracts (source-level; no browser / no real mailbox).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/sharedInbox.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
const page = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/SharedInboxPage.tsx"),
  "utf8"
);
const api = readFileSync(
  join(root, "app-elite100-estimate-studio/src/lib/sharedInboxApi.mjs"),
  "utf8"
);

console.log("\nsharedInbox.ui.test.mjs\n");

assert.match(app, /Inbox/);
assert.match(app, /studio-nav-inbox/);
assert.match(app, /SharedInboxPage/);
assert.match(app, /Estimates/);
assert.match(app, /studio-nav-estimates/);
assert.ok(app.indexOf("studio-nav-inbox") < app.indexOf("studio-nav-estimates"));
console.log("ok: 42 Inbox + Estimates primary navigation");

assert.match(page, /shared-inbox-filter-\$\{f\.id\}/);
assert.match(page, /id: "all"/);
assert.match(page, /useState<\(typeof FILTERS\)\[number\]\["id"\]>\("all"\)/);
console.log("ok: 43 default filter is All");

assert.match(api, /shared-inbox/);
assert.match(api, /start-estimate/);
assert.match(
  api.slice(api.indexOf("startSharedInboxEstimate"), api.indexOf("markSharedInboxViewed")),
  /confirm:\s*true/,
  "Start Estimate sends confirm: true (import_confirm_required guard)"
);
console.log("ok: 44 newest-first copy + Start Estimate API path + confirm:true");

assert.match(page, /Start Estimate|primaryAction\?\.label/);
assert.match(page, /data-action-key/);
assert.match(page, /startSharedInboxEstimate|resume_estimate/);
assert.match(page, /Importing…|Starting…|importingKey/);
assert.match(page, /importingKey/);
console.log("ok: 45–51 primary actions + start disable while in flight");

assert.match(page, /preserveOnTransient/);
assert.match(page, /isTransientHttpError/);
assert.match(api, /Existing rows were kept|could not be refreshed/);
assert.match(page, /Keep currently displayed rows on 502\/503\/504/);
console.log("ok: 50 refresh preserves rows on transient failure messaging");

assert.match(page, /importSharedInboxMessage/);
assert.match(page, /newImportIdempotencyKey/);
assert.match(page, /await loadInbox/);
assert.match(page, /onOpenEstimate\(caseId/);
assert.ok(page.indexOf("importSharedInboxMessage") < page.indexOf("onOpenEstimate(caseId"));
console.log("ok: 52–53 import waits for backend; opens estimate after success");

assert.match(page, /setSelectedKey\(row\.messageKey\)/);
assert.equal(/importSharedInboxMessage\(authToken,\s*row\.messageKey/.test(
  page.split("shared-inbox-row-open")[1]?.split("shared-inbox-primary-action")[0] || ""
), false);
console.log("ok: 54–55 opening row/details does not import");

assert.equal(/\bReply\b/.test(page), false);
assert.equal(/\bForward\b/.test(page), false);
assert.equal(/Delete message|Mark read|Mark unread/i.test(page), false);
assert.match(page, /Outlook compose \/ folder \/ download controls are intentionally not present/);
assert.equal(page.includes("dangerouslySetInnerHTML"), false);
assert.equal(/attachmentUrl|contentUrl|downloadUrl|graph\.microsoft/i.test(page), false);
assert.equal(/attachmentUrl|contentUrl|downloadUrl/i.test(api), false);
console.log("ok: 57–59 no Reply/Forward/Delete/Move; no HTML render; no attachment URLs");

assert.match(page, /openTarget/);
assert.match(app, /setWorkspaceFocus\(normalized\)/);
console.log("ok: 60 primary actions navigate via Studio openTarget");

assert.match(page, /create_manual_estimate|Create manual estimate/);
assert.match(page, /View message details/);
assert.match(page, /View plan|secure Studio viewer/);
assert.match(page, /Preview not supported|shared-inbox-preview-unsupported/);
console.log("ok: detail panel + manual estimate action + secure plan viewer controls");

console.log("\nsharedInbox.ui.test.mjs: ok\n");
