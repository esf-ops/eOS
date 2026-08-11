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
  filterInboxItems,
  groupInboxItems,
  resolveCustomerDisplay,
  resolveInboxProgress,
  resolveRequestTitle,
  sortInboxItemsForDisplay
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
assert.match(inbox, /data-testid="qf-inbox-command-header"/);
assert.match(inbox, /qf-page--command|qf-inbox--command/);
assert.match(inbox, /Quote Flow Inbox/);
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
assert.match(inbox, /data-testid="qf-inbox-remove"/);
assert.match(inbox, /data-testid="qf-inbox-restore"/);
assert.match(inbox, /data-testid="qf-inbox-toggle-removed"/);
assert.match(inbox, /data-testid="qf-inbox-filters"/);
assert.match(inbox, /data-testid="qf-inbox-search"/);
assert.match(inbox, /Remove from Quote Flow/);
assert.match(inbox, /does not delete the original email/);
assert.match(inbox, /selectedAttachmentByMessage/);
assert.match(inbox, /Start selected AI Takeoffs/);
assert.match(inbox, /Start AI Takeoff|Select for AI Takeoff/);
assert.match(inbox, /Supported plan|Needs mark as plan/);
assert.match(inbox, /AI Takeoff started/);
assert.match(inbox, /AI Takeoff is already running/);
assert.match(inbox, /Scope is already set\. Open in Estimates/);
assert.doesNotMatch(inbox, /AI Takeoff job reused/);
assert.match(inbox, /formatPersonLabel/);
assert.match(inbox, /normalizeInboxItemLabels/);
assert.match(inbox, /setInterval|12000/);
assert.match(inbox, /initialLoading/);
assert.match(inbox, /isPolling|isRefreshing/);
assert.match(inbox, /listInFlightRef/);
assert.match(inbox, /qf-inbox-syncing|Syncing…/);
assert.match(inbox, /qf-inbox-initial-loading/);
assert.match(inbox, /showFullLoading/);
assert.match(inbox, /loadList\("poll"\)|mode === "poll"|LoadMode/);
assert.match(inbox, /markQuoteFlowInboxOpened|opened/);
assert.match(api, /\/api\/elite100-quote-flow\/inbox/);
assert.match(api, /start-takeoff/);
assert.match(api, /\/dismiss/);
assert.match(api, /\/restore/);
assert.match(api, /\/opened/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.match(app, /onOpenEstimates/);
assert.match(app, /qf-shell--command/);
assert.doesNotMatch(inbox, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(inbox, /Approve Estimate|mark sold|auto-publish/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
assert.match(helper, /safeAddressLabel/);
assert.match(grouping, /resolveInboxProgress/);
assert.match(grouping, /filterInboxItems/);
console.log("ok: Inbox command-center contracts; no V1/V2 copy");

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
  assert.equal(queued.indeterminate, true);
  assert.equal(queued.percent, null);
  assert.equal(processing.indeterminate, true);
  assert.equal(processing.percent, null);
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
      group: { key: "needs_action" },
      opened: false
    },
    {
      messageKey: "c",
      takeoffStatus: { key: "takeoff_processing", label: "Takeoff processing" },
      group: { key: "active" },
      progress: {
        percent: null,
        stageKey: "processing",
        stageLabel: "AI Takeoff processing",
        isError: false,
        isComplete: false,
        indeterminate: true,
        approximate: true
      }
    },
    {
      messageKey: "d",
      takeoffStatus: { key: "ready_to_start", label: "Ready to start" },
      group: { key: "needs_action" },
      dismissed: true
    }
  ];
  const grouped = groupInboxItems(rows);
  assert.equal(grouped.needs_action[0].messageKey, "b");
  assert.equal(grouped.active[0].messageKey, "c");
  assert.equal(grouped.completed[0].messageKey, "a");
  assert.equal(grouped.dismissed[0].messageKey, "d");
  assert.equal(resolveInboxProgress(rows[2]).indeterminate, true);
  assert.equal(resolveInboxProgress(rows[2]).percent, null);
  assert.equal(resolveInboxProgress({ takeoffStatus: { key: "takeoff_returned" } }).percent, 100);
  assert.equal(resolveInboxProgress({ alreadyScoped: true }).stageKey, "scope_set");

  const activeOnly = filterInboxItems(rows, "all_active");
  assert.equal(activeOnly.some((r) => r.messageKey === "d"), false);
  const removedOnly = filterInboxItems(rows, "removed");
  assert.equal(removedOnly.length, 1);
  assert.equal(removedOnly[0].messageKey, "d");

  const sorted = sortInboxItemsForDisplay([
    { messageKey: "opened", group: { key: "needs_action" }, opened: true, receivedAt: "2026-08-04T12:00:00Z" },
    { messageKey: "new", group: { key: "needs_action" }, opened: false, receivedAt: "2026-08-01T12:00:00Z" },
    { messageKey: "done", group: { key: "completed" }, alreadyScoped: true, receivedAt: "2026-08-04T13:00:00Z" }
  ]);
  assert.equal(sorted[0].messageKey, "new");
  assert.equal(sorted[sorted.length - 1].messageKey, "done");
  console.log("ok: client grouping, dismiss hide, unopened-first sort");
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
assert.match(inbox, /qf-inbox-select-attachment|Select|Add to packet/);
assert.match(inbox, /planSelectionRequired/);
assert.match(inbox, /Select the plan files to include in this takeoff packet/);
assert.match(inbox, /qf-inbox-preview-attachment|Preview/);
assert.match(inbox, /qf-inbox-preview-modal/);
assert.match(inbox, /selectedAttachmentKeys/);
assert.match(api, /attachmentKeys/);
assert.match(api, /attachments\/.*preview/);
console.log("ok: attachment selection contracts");
}

{
  assert.match(inbox, /runBatchStart|Start selected AI Takeoffs/);
  assert.match(inbox, /Promise\.all/);
  assert.match(inbox, /alreadyScoped/);
  assert.match(inbox, /qf-inbox-batch-results/);
  assert.match(inbox, /qf-inbox-batch-banner|summarizeBatchStartResults/);
  assert.match(inbox, /formatBatchResultLine|humanInboxLabel/);
  assert.match(inbox, /reused/);
  assert.match(inbox, /qf-inbox-takeoff-timeline|TakeoffTimeline/);
  assert.match(inbox, /qf-inbox-failure-card|FailureCard/);
  assert.match(inbox, /Retry AI Takeoff/);
  assert.match(inbox, /Starting takeoff/);
  assert.match(inbox, /Processing…/);
  assert.match(inbox, /qf-inbox-stale|staleLabel/);
  assert.match(inbox, /Takeoff returned/);
  assert.match(inbox, /View in Estimate Queue/);
  assert.doesNotMatch(inbox, /publish|mark sold|accept quote|QuickBooks/i);
  // Full-page loading copy only for initial empty load — not polled blanking.
  assert.match(inbox, /showFullLoading = initialLoading && items\.length === 0/);
  assert.doesNotMatch(
    inbox,
    /\{loading \? <p className="qf-muted">Loading inbox/
  );
  console.log("ok: bulk start contracts (per-item success/failure, reuse, scoped block)");
}

{
  const {
    formatBatchResultLine,
    humanInboxLabel,
    looksLikeGraphKey,
    shortJobLabel
  } = await import(join(appRoot, "src/lib/inboxUiHelpers.mjs"));

  assert.equal(looksLikeGraphKey("AAMkAGI2ExampleGraphKeyThatIsLong=="), true);
  assert.equal(looksLikeGraphKey("Vanderschot Project"), false);
  assert.equal(shortJobLabel("462abe28-aaaa-bbbb-cccc-dddddddddddd"), "Job 462abe28…");

  const graphRow = {
    messageKey: "AAMkAGI2ExampleGraphKeyThatIsLong==",
    senderLabel: "Amanda Rushton",
    subject: "Kitchen",
    bestPlanCandidate: { filename: "plan.pdf" }
  };
  const label = humanInboxLabel(graphRow, {
    resolveCustomerDisplay,
    resolveRequestTitle,
    formatPersonLabel
  });
  assert.equal(label, "Amanda Rushton");
  assert.doesNotMatch(label, /AAMk/);

  assert.equal(
    formatBatchResultLine({ ok: true, reused: false, label: "Vanderschot Project" }),
    "Started: Vanderschot Project"
  );
  assert.equal(
    formatBatchResultLine({ ok: true, reused: true, label: "Fashion Par Sales" }),
    "Already running: Fashion Par Sales"
  );
  assert.equal(
    formatBatchResultLine({
      ok: false,
      kind: "blocked",
      label: "Done Co",
      error: "Scope is already set. Open in Estimates."
    }),
    "Blocked: scope already set"
  );
  assert.match(
    formatBatchResultLine({
      ok: false,
      kind: "failed",
      label: "Kitchen",
      error: "Plan attachment missing"
    }),
    /Failed to start: Kitchen — Plan attachment missing/
  );
  const batchLine = formatBatchResultLine({
    ok: true,
    reused: false,
    label,
    takeoffJobId: "462abe28-aaaa-bbbb-cccc-dddddddddddd"
  });
  assert.doesNotMatch(batchLine, /AAMk/);
  assert.doesNotMatch(batchLine, /462abe28-aaaa/);
  const {
    summarizeBatchStartResults
  } = await import(join(appRoot, "src/lib/inboxUiHelpers.mjs"));
  const summary = summarizeBatchStartResults([
    { ok: true, reused: false, kind: "started" },
    { ok: true, reused: true, kind: "already_running" },
    { ok: false, kind: "failed" }
  ]);
  assert.equal(summary.selected, 3);
  assert.equal(summary.started, 1);
  assert.equal(summary.alreadyRunning, 1);
  assert.equal(summary.failed, 1);
  assert.match(summary.summaryLine, /3 selected/);
  console.log("ok: batch results are human readable; no raw Graph keys");
}

{
  // Selection / list preservation contracts through polling merge path.
  assert.match(inbox, /applyListRows/);
  assert.match(inbox, /selectedKeyRef/);
  assert.match(inbox, /stillThere/);
  assert.match(inbox, /Soft-merge|soft-merge|setDetail\(\(prev\)/);
  assert.match(inbox, /grouped\.active\.length === 0/);
  console.log("ok: polling preserves selection and avoids full list blanking");
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
