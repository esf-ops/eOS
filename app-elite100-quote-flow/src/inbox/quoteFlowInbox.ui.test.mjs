/**
 * Quote Flow Inbox UI contracts + production person-object safety.
 * Run: node app-elite100-quote-flow/src/inbox/quoteFlowInbox.ui.test.mjs
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPersonLabel, normalizeInboxItemLabels } from "../lib/formatPersonLabel.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const repoRoot = join(appRoot, "..");

console.log("\nquoteFlowInbox.ui.test.mjs\n");

const inbox = readFileSync(join(appRoot, "src/inbox/InboxPage.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowInboxApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");
const helper = readFileSync(join(appRoot, "src/lib/formatPersonLabel.mjs"), "utf8");

assert.match(inbox, /data-testid="qf-inbox-page"/);
assert.match(inbox, /data-testid="qf-inbox-list"/);
assert.match(inbox, /data-testid="qf-inbox-row"/);
assert.match(inbox, /data-testid="qf-inbox-attachment"/);
assert.match(inbox, /data-testid="qf-inbox-start-takeoff"/);
assert.match(inbox, /Start AI Takeoff|Select for AI Takeoff/);
assert.match(inbox, /Supported plan|Needs mark as plan/);
assert.match(inbox, /formatPersonLabel/);
assert.match(inbox, /normalizeInboxItemLabels/);
assert.match(api, /\/api\/elite100-quote-flow\/inbox/);
assert.match(api, /start-takeoff/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.doesNotMatch(inbox, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(inbox, /Approve Estimate|mark sold|auto-publish/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
assert.match(helper, /safeAddressLabel/);
assert.match(helper, /Email on file/);
console.log("ok: Inbox UI shows rows and attachment actions; no V1/V2 copy");

{
  const productionSender = {
    displayName: "Buyer Co",
    safeAddressLabel: "b***@example.com",
    emailPresent: true
  };
  assert.equal(formatPersonLabel(productionSender), "Buyer Co");
  assert.equal(
    formatPersonLabel({ displayName: "", safeAddressLabel: "b***@example.com", emailPresent: true }),
    "b***@example.com"
  );
  assert.equal(formatPersonLabel({ displayName: "", safeAddressLabel: "", emailPresent: true }), "Email on file");
  assert.equal(formatPersonLabel(null), "Unknown contact");
  assert.equal(formatPersonLabel(undefined), "Unknown contact");
  assert.equal(formatPersonLabel({}), "Unknown contact");
  assert.equal(formatPersonLabel("  Ada  "), "Ada");
  console.log("ok: formatPersonLabel handles production person object + fallbacks");
}

{
  const productionItem = {
    messageKey: "AAMk-prod-1",
    receivedAt: "2026-08-04T12:00:00.000Z",
    sender: {
      displayName: "Dave Untiedt",
      safeAddressLabel: "d***@builder.com",
      emailPresent: true
    },
    subject: "Kitchen quote",
    bodyPreview: "Please quote",
    takeoffStatus: { key: "needs_attachment_selection", label: "Needs attachment selection" },
    attachments: []
  };
  const normalized = normalizeInboxItemLabels(productionItem);
  assert.equal(typeof normalized.sender, "string");
  assert.equal(normalized.sender, "Dave Untiedt");
  assert.equal(normalized.senderLabel, "Dave Untiedt");
  assert.equal(typeof normalized.customerLabel, "string");

  function InboxRowMeta({ item }) {
    const safe = normalizeInboxItemLabels(item);
    return createElement(
      "span",
      { "data-testid": "qf-inbox-row-meta" },
      formatPersonLabel(safe.senderLabel ?? safe.sender, "Unknown contact")
    );
  }

  const markup = renderToStaticMarkup(createElement(InboxRowMeta, { item: productionItem }));
  assert.match(markup, /Dave Untiedt/);
  assert.doesNotMatch(markup, /\[object Object\]/);
  assert.doesNotMatch(markup, /displayName/);
  console.log("ok: production-shaped inbox row renders without throwing; no raw object");
}

{
  const emptyMarkup = renderToStaticMarkup(
    createElement(
      "span",
      null,
      formatPersonLabel({ displayName: "", safeAddressLabel: "", emailPresent: false }, "Unknown contact")
    )
  );
  assert.match(emptyMarkup, /Unknown contact/);
  console.log("ok: empty/missing contact fields render fallback text");
}

{
  // Other tabs still present in the shell (source contract).
  assert.match(app, /EstimateQueuePage/);
  assert.match(app, /EstimatesListPage/);
  assert.match(app, /data-testid="qf-nav-queue"/);
  assert.match(app, /data-testid="qf-nav-estimates"/);
  console.log("ok: other tabs still wired in shell");
}

{
  const presenter = readFileSync(
    join(repoRoot, "backend-core/src/elite100QuoteFlow/quoteFlowInboxPresenter.mjs"),
    "utf8"
  );
  assert.match(presenter, /formatQuoteFlowPersonLabel/);
  assert.match(presenter, /senderLabel/);
  // Dynamic import exercises presenter against production shape.
  const { presentQuoteFlowInboxItem, formatQuoteFlowPersonLabel } = await import(
    join(repoRoot, "backend-core/src/elite100QuoteFlow/quoteFlowInboxPresenter.mjs")
  );
  const presented = presentQuoteFlowInboxItem({
    messageKey: "m1",
    sender: {
      displayName: "Buyer Co",
      safeAddressLabel: "b***@example.com",
      emailPresent: true
    },
    subject: "Quote",
    attachments: [],
    aiTakeoff: { state: "not_started" }
  });
  assert.equal(typeof presented.sender, "string");
  assert.equal(presented.sender, "Buyer Co");
  assert.equal(presented.senderLabel, "Buyer Co");
  assert.equal(formatQuoteFlowPersonLabel(null), "Unknown contact");
  console.log("ok: Quote Flow inbox presenter normalizes sender object to string");
}

console.log("\nquoteFlowInbox.ui.test.mjs: ok\n");
