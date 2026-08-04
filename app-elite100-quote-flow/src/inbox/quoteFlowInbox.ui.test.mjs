/**
 * Quote Flow Inbox UI — polish / operations contracts.
 * Run: node app-elite100-quote-flow/src/inbox/quoteFlowInbox.ui.test.mjs
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPersonLabel, normalizeInboxItemLabels } from "../lib/formatPersonLabel.mjs";
import {
  groupInboxItems,
  resolveCustomerDisplay,
  resolveInboxProgress,
  resolveRequestTitle
} from "../lib/inboxGrouping.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const repoRoot = join(appRoot, "..");

console.log("\nquoteFlowInbox.ui.test.mjs\n");

const inbox = readFileSync(join(appRoot, "src/inbox/InboxPage.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowInboxApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");
const helper = readFileSync(join(appRoot, "src/lib/formatPersonLabel.mjs"), "utf8");
const grouping = readFileSync(join(appRoot, "src/lib/inboxGrouping.mjs"), "utf8");

assert.match(inbox, /data-testid="qf-inbox-page"/);
assert.match(inbox, /data-testid="qf-inbox-list"/);
assert.match(inbox, /data-testid="qf-inbox-row"/);
assert.match(inbox, /data-testid="qf-inbox-attachment"/);
assert.match(inbox, /data-testid="qf-inbox-start-takeoff"/);
assert.match(inbox, /data-testid="qf-inbox-start-selected"/);
assert.match(inbox, /qf-inbox-group-needs-action/);
assert.match(inbox, /qf-inbox-group-active/);
assert.match(inbox, /qf-inbox-group-completed/);
assert.match(inbox, /data-testid="qf-inbox-stats"/);
assert.match(inbox, /data-testid="qf-inbox-progress"/);
assert.match(inbox, /data-testid="qf-inbox-view-queue"/);
assert.match(inbox, /data-testid="qf-inbox-view-estimates"/);
assert.match(inbox, /data-testid="qf-inbox-batch-check"/);
assert.match(inbox, /selectedAttachmentByMessage/);
assert.match(inbox, /Start selected AI Takeoffs/);
assert.match(inbox, /Start AI Takeoff|Select for AI Takeoff/);
assert.match(inbox, /Supported plan|Needs mark as plan/);
assert.match(inbox, /formatPersonLabel/);
assert.match(inbox, /normalizeInboxItemLabels/);
assert.match(api, /\/api\/elite100-quote-flow\/inbox/);
assert.match(api, /start-takeoff/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.match(app, /onOpenEstimates/);
assert.doesNotMatch(inbox, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(inbox, /Approve Estimate|mark sold|auto-publish/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
assert.match(helper, /safeAddressLabel/);
assert.match(grouping, /resolveInboxProgress/);
console.log("ok: Inbox UI polish contracts; no V1/V2 copy");

{
  const { presentQuoteFlowInboxItem, sortQuoteFlowInboxItems, mapQuoteFlowTakeoffProgress } =
    await import(join(repoRoot, "backend-core/src/elite100QuoteFlow/quoteFlowInboxPresenter.mjs"));

  const needs = presentQuoteFlowInboxItem({
    messageKey: "m-new",
    receivedAt: "2026-08-04T12:00:00.000Z",
    sender: { displayName: "Buyer Co", safeAddressLabel: "b***@x.com", emailPresent: true },
    subject: "Kitchen quote",
    attachments: [
      {
        attachmentKey: "a1",
        filename: "plan.pdf",
        contentType: "application/pdf",
        supportedForTakeoff: true,
        supportLabel: "Direct PDF plan",
        canMarkAsPlan: false
      }
    ],
    aiTakeoff: { state: "not_started" }
  });
  const active = presentQuoteFlowInboxItem({
    messageKey: "m-active",
    receivedAt: "2026-08-04T11:00:00.000Z",
    sender: "Active Co",
    subject: "Bath",
    attachments: [],
    aiTakeoff: { state: "processing", takeoffJobId: "job-1", label: "Processing" }
  });
  const scoped = presentQuoteFlowInboxItem(
    {
      messageKey: "m-scoped",
      receivedAt: "2026-08-04T10:00:00.000Z",
      sender: "Done Co",
      subject: "Done",
      estimateId: "est-9",
      attachments: [],
      aiTakeoff: { state: "needs_review", takeoffJobId: "job-2" }
    },
    { alreadyScoped: true }
  );
  const sorted = sortQuoteFlowInboxItems([scoped, active, needs]);
  assert.equal(sorted[0].messageKey, "m-new");
  assert.equal(sorted[1].messageKey, "m-active");
  assert.equal(sorted[2].messageKey, "m-scoped");
  assert.equal(needs.group.key, "needs_action");
  assert.equal(typeof needs.sender, "string");
  assert.equal(needs.customerDisplay, "Buyer Co");
  assert.doesNotMatch(needs.requestTitle, /not identified|not named/i);
  assert.equal(needs.bestPlanCandidate.filename, "plan.pdf");

  const queued = mapQuoteFlowTakeoffProgress({ statusKey: "takeoff_queued" });
  const processing = mapQuoteFlowTakeoffProgress({ statusKey: "takeoff_processing" });
  const returned = mapQuoteFlowTakeoffProgress({ statusKey: "takeoff_returned" });
  const failed = mapQuoteFlowTakeoffProgress({ statusKey: "takeoff_failed" });
  const scopeSet = mapQuoteFlowTakeoffProgress({ alreadyScoped: true });
  assert.equal(queued.percent, 10);
  assert.equal(processing.percent, 55);
  assert.equal(returned.percent, 100);
  assert.equal(failed.isError, true);
  assert.equal(scopeSet.stageKey, "scope_set");
  console.log("ok: Inbox groups needs-action above completed; progress mapping");
}

{
  const rows = [
    {
      messageKey: "a",
      takeoffStatus: { key: "already_scoped", label: "Scope already set" },
      alreadyScoped: true,
      group: { key: "completed" }
    },
    {
      messageKey: "b",
      takeoffStatus: { key: "ready_to_start", label: "Ready to start" },
      group: { key: "needs_action" }
    },
    {
      messageKey: "c",
      takeoffStatus: { key: "takeoff_processing", label: "Takeoff processing" },
      group: { key: "active" },
      progress: {
        percent: 55,
        stageKey: "processing",
        stageLabel: "Processing takeoff",
        isError: false,
        isComplete: false
      }
    }
  ];
  const grouped = groupInboxItems(rows);
  assert.equal(grouped.needs_action[0].messageKey, "b");
  assert.equal(grouped.active[0].messageKey, "c");
  assert.equal(grouped.completed[0].messageKey, "a");
  assert.equal(resolveInboxProgress(rows[2]).percent, 55);
  assert.equal(resolveInboxProgress({ takeoffStatus: { key: "takeoff_returned" } }).percent, 100);
  assert.equal(resolveInboxProgress({ alreadyScoped: true }).stageKey, "scope_set");
  console.log("ok: client grouping + progress stage mapping");
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
    bestPlanCandidate: { filename: "kitchen.pdf", attachmentKey: "att-1" },
    takeoffStatus: { key: "ready_to_start", label: "Ready to start" },
    attachments: []
  };
  const normalized = normalizeInboxItemLabels(productionItem);
  assert.equal(typeof normalized.sender, "string");
  assert.equal(resolveCustomerDisplay(normalized, formatPersonLabel), "Dave Untiedt");
  assert.equal(resolveRequestTitle(normalized), "Kitchen quote");
  assert.equal(formatPersonLabel(null), "Unknown contact");
  assert.equal(
    resolveRequestTitle({
      subject: "",
      projectLabel: "Project not named",
      bestPlanCandidate: { filename: "plan.pdf" }
    }),
    "plan.pdf"
  );

  const markup = renderToStaticMarkup(
    createElement(
      "span",
      null,
      resolveCustomerDisplay(normalized, formatPersonLabel),
      " · ",
      resolveRequestTitle(normalized)
    )
  );
  assert.match(markup, /Dave Untiedt/);
  assert.doesNotMatch(markup, /\[object Object\]/);
  assert.doesNotMatch(markup, /Customer not identified/);
  console.log("ok: labels fall back to sender/subject/attachment; no raw objects");
}

{
  assert.match(inbox, /qf-inbox-select-attachment|Select/);
  assert.match(inbox, /planSelectionRequired/);
  assert.match(inbox, /Multiple plan candidates|Choose the plan|Choose plan/);
  console.log("ok: attachment selection contracts");
}

{
  assert.match(inbox, /runBatchStart|Start selected AI Takeoffs/);
  assert.match(inbox, /Promise\.all/);
  assert.match(inbox, /alreadyScoped/);
  assert.match(inbox, /qf-inbox-batch-results/);
  assert.match(inbox, /reused/);
  console.log("ok: bulk start contracts (per-item success/failure, reuse, scoped block)");
}

{
  assert.match(inbox, /View in Estimate Queue/);
  assert.match(inbox, /View in Estimates/);
  assert.match(inbox, /takeoff_returned|viewQueue/);
  assert.match(inbox, /alreadyScoped|viewEstimates/);
  console.log("ok: View in Estimate Queue / Estimates affordances");
}

{
  assert.match(app, /EstimateQueuePage/);
  assert.match(app, /EstimatesListPage/);
  console.log("ok: other tabs still wired in shell");
}

console.log("\nquoteFlowInbox.ui.test.mjs: ok\n");
