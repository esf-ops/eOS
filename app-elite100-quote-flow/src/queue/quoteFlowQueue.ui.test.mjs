/**
 * Quote Flow Estimate Queue UI — Scope Creation Queue contracts.
 * Run: node app-elite100-quote-flow/src/queue/quoteFlowQueue.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  groupQueueItems,
  resolveQueueCustomer,
  resolveQueueTitle
} from "../lib/queueGrouping.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const repoRoot = join(appRoot, "..");

console.log("\nquoteFlowQueue.ui.test.mjs\n");

const queue = readFileSync(join(appRoot, "src/queue/EstimateQueuePage.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowQueueApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");
const grouping = readFileSync(join(appRoot, "src/lib/queueGrouping.mjs"), "utf8");

assert.match(queue, /data-testid="qf-queue-page"/);
assert.match(queue, /data-testid="qf-queue-list"/);
assert.match(queue, /data-testid="qf-queue-row"/);
assert.match(queue, /data-testid="qf-queue-review"/);
assert.match(queue, /data-testid="qf-queue-set-scope"/);
assert.match(queue, /data-testid="qf-queue-takeoff-iframe"/);
assert.match(queue, /data-testid="qf-queue-manual-scope"/);
assert.match(queue, /data-testid="qf-queue-manual-builder"/);
assert.match(queue, /data-testid="qf-queue-goto-estimates"/);
assert.match(queue, /data-testid="qf-queue-choose-plan"/);
assert.match(queue, /qf-queue-group-ready/);
assert.match(queue, /qf-queue-group-failed/);
assert.match(queue, /Review Takeoff/);
assert.match(queue, /Create Manual Scope/);
assert.match(queue, /Set Scope/);
assert.match(queue, /Use these measurements/);
assert.match(queue, /Scope is set for this estimate/);
assert.match(queue, /Open in Estimates/);
assert.match(queue, /filter:\s*["']active["']/);
assert.match(queue, /setQuoteFlowManualScope|OfficialScopeEditor/);
assert.match(queue, /onOpenInbox/);
assert.match(queue, /applyScopeSuccess/);
assert.match(api, /\/api\/elite100-quote-flow\/queue/);
assert.match(api, /set-scope/);
assert.match(api, /set-manual-scope/);
assert.match(app, /EstimateQueuePage/);
assert.match(app, /onOpenInbox/);
assert.match(grouping, /groupQueueItems/);
assert.doesNotMatch(queue, /Approve Estimate/);
assert.doesNotMatch(queue, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(queue, /Returned takeoffs/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
assert.doesNotMatch(queue, /calculate|publish|mark sold|accept/i);
console.log("ok: Scope Creation Queue UI contracts; no V1/V2");

{
  const rows = [
    {
      takeoffJobId: "a",
      status: { key: "already_scoped", label: "Scope set" },
      alreadyScoped: true,
      group: { key: "scoped" }
    },
    {
      takeoffJobId: "b",
      status: { key: "ready_for_review", label: "AI Takeoff ready for review" },
      group: { key: "ready" },
      customerName: "Buyer Co",
      projectName: "Kitchen",
      planFilename: "plan.pdf"
    },
    {
      takeoffJobId: "c",
      status: { key: "takeoff_processing", label: "Waiting on AI Takeoff" },
      group: { key: "processing" }
    },
    {
      takeoffJobId: "d",
      status: { key: "takeoff_failed", label: "Takeoff failed / needs decision" },
      group: { key: "failed" },
      canCreateManualScope: true
    }
  ];
  const grouped = groupQueueItems(rows);
  assert.equal(grouped.ready[0].takeoffJobId, "b");
  assert.equal(grouped.processing[0].takeoffJobId, "c");
  assert.equal(grouped.failed[0].takeoffJobId, "d");
  assert.equal(grouped.stats.total, 3);
  assert.equal(
    grouped.ready.concat(grouped.processing, grouped.failed).some((r) => r.alreadyScoped),
    false
  );
  assert.equal(resolveQueueCustomer(rows[1]), "Buyer Co");
  assert.equal(resolveQueueTitle(rows[1]), "Kitchen");
  assert.equal(
    resolveQueueTitle({
      projectName: "Project not named",
      planFilename: "island.pdf",
      customerName: "X"
    }),
    "island.pdf"
  );
  console.log("ok: client grouping excludes scoped; label fallbacks");
}

{
  const { presentQuoteFlowQueueItem } = await import(
    join(repoRoot, "backend-core/src/elite100QuoteFlow/quoteFlowQueuePresenter.mjs")
  );
  const item = presentQuoteFlowQueueItem({
    id: "case-1",
    takeoffJobId: "job-1",
    customerName: { displayName: "Amanda", safeAddressLabel: "a***@x.com", emailPresent: true },
    projectName: "",
    planFilename: "kitchen.pdf",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    messageKey: "AAMkAGI2ExampleGraphKeyThatIsLong=="
  });
  assert.equal(item.customerDisplay, "Amanda");
  assert.equal(item.planFilename, "kitchen.pdf");
  // messageKey may be stored but must not be used as the visible title/customer.
  assert.doesNotMatch(item.customerDisplay, /AAMk/);
  assert.doesNotMatch(item.requestTitle, /AAMk/);
  assert.doesNotMatch(item.projectDisplay, /AAMk/);
  console.log("ok: no raw Graph keys in queue labels");
}

console.log("\nquoteFlowQueue.ui.test.mjs: ok\n");
