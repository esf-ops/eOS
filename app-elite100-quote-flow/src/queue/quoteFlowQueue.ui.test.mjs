/**
 * Quote Flow Estimate Queue UI — command-center + estimate name contracts.
 * Run: node app-elite100-quote-flow/src/queue/quoteFlowQueue.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterQueueItems,
  groupQueueItems,
  resolveDefaultEstimateName,
  resolveQueueCustomer,
  resolveQueueSubtitle,
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
assert.match(queue, /data-testid="qf-queue-command-header"/);
assert.match(queue, /qf-page--command|qf-queue--command/);
assert.match(queue, /data-testid="qf-queue-list"/);
assert.match(queue, /data-testid="qf-queue-row"/);
assert.match(queue, /data-testid="qf-queue-review"/);
assert.match(queue, /data-testid="qf-queue-set-scope"/);
assert.match(queue, /data-testid="qf-queue-takeoff-iframe"/);
assert.match(queue, /data-testid="qf-queue-manual-scope"/);
assert.match(queue, /data-testid="qf-queue-manual-builder"/);
assert.match(queue, /data-testid="qf-queue-goto-estimates"/);
assert.match(queue, /data-testid="qf-queue-estimate-name"/);
assert.match(queue, /data-testid="qf-queue-estimate-name-input"/);
assert.match(queue, /data-testid="qf-queue-workspace-actions"/);
assert.match(queue, /Quote name/);
assert.match(queue, /saveQuoteFlowQuoteName|quote-name/);
assert.match(queue, /isMeaningfulQuoteName/);
assert.match(queue, /Review AI Takeoff/);
assert.match(queue, /Create Manual Scope/);
assert.match(queue, /Set Scope/);
assert.match(queue, /requestSetScopePayloadFromIframe/);
assert.match(queue, /Save draft first, then Set Scope/);
assert.match(queue, /Review measurements\. Save draft if needed, then Set Scope from the Quote Flow/);
assert.match(queue, /Scope is set for this estimate/);
assert.match(queue, /Open in Estimates/);
assert.match(queue, /filter:\s*["']active["']/);
assert.match(queue, /archiveView/);
assert.match(queue, /data-testid="qf-queue-archive"/);
assert.match(queue, /data-testid="qf-queue-restore"/);
assert.match(queue, /qf-queue-archive-view-\$\{f\.key\}|qf-queue-archive-view-active/);
assert.match(queue, /data-testid="qf-queue-archived-badge"/);
assert.match(queue, /No active queue items/);
assert.match(queue, /No archived queue items/);
assert.match(queue, /Archive this item from the queue\? This does not cancel the AI job/);
assert.match(queue, /Remove from queue/);
assert.match(api, /queue\/\$\{encodeURIComponent\(queueItemKey\)\}\/archive/);
assert.match(api, /queue\/\$\{encodeURIComponent\(queueItemKey\)\}\/restore/);
assert.match(queue, /projectName:\s*name|estimateName:\s*name/);
assert.match(queue, /takeoffResult:\s*payload\.takeoffResult/);
assert.match(queue, /requestSaveDraftFromIframe|needsPersist/);
assert.match(queue, /if \(!payload\?\.takeoffResult\)/);
assert.doesNotMatch(queue, /payload\?\.takeoffResult \|\| undefined/);
assert.doesNotMatch(queue, /If postMessage times out \/ fails, still call Set Scope/);
assert.match(queue, /rowAction === "review_takeoff"/);

assert.match(queue, /rowAction === "create_manual_scope"/);
assert.match(queue, /Needs decision/);
assert.match(api, /projectName/);
assert.match(api, /estimateName/);
assert.match(api, /quote-name/);
assert.match(api, /saveQuoteFlowQuoteName|quoteName/);
assert.match(api, /takeoffResult/);
assert.match(api, /set-manual-scope/);
assert.match(app, /qf-shell--command/);
assert.match(grouping, /resolveDefaultEstimateName|resolveCanonicalQuoteName/);
assert.match(grouping, /QUOTE_NAME_REQUIRED_LABEL|Quote name required/);
assert.doesNotMatch(queue, /Use these measurements/);
assert.doesNotMatch(queue, /isValidQuoteFlowTriggerSetScope|QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
assert.doesNotMatch(queue, /Approve Estimate/);
assert.doesNotMatch(queue, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(queue, /Unknown contact — Unknown contact/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
assert.doesNotMatch(queue, /calculate|publish|mark sold|accept/i);

{
  const takeoffUi = readFileSync(
    join(repoRoot, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  const origins = readFileSync(
    join(appRoot, "src/lib/takeoffPostMessageOrigins.mjs"),
    "utf8"
  );
  // Footer: Add room | Add piece | Save draft — no footer Set Scope.
  assert.doesNotMatch(takeoffUi, /data-testid="ctr-quote-flow-set-scope"/);
  assert.doesNotMatch(takeoffUi, /QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
  assert.doesNotMatch(origins, /QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
  assert.doesNotMatch(origins, /isValidQuoteFlowTriggerSetScope/);
  assert.match(origins, /QUOTE_FLOW_REQUEST_SET_SCOPE|eliteos-quote-flow-request-set-scope/);
  assert.match(origins, /requestSetScopePayloadFromIframe/);
  assert.match(takeoffUi, /data-testid="ctr-save-draft"/);
  assert.match(takeoffUi, /data-testid="ctr-quote-flow-set-scope-hint"/);
  assert.match(
    takeoffUi,
    /Review measurements\. Save draft if needed, then Set Scope from the Quote Flow/
  );
  // Save Draft always rendered in footer (not gated behind !quoteFlowSetScope).
  const saveDraftStart = takeoffUi.indexOf('data-testid="ctr-save-draft"');
  const saveDraftBtn = takeoffUi.slice(saveDraftStart, saveDraftStart + 900);
  assert.match(saveDraftBtn, /Save draft/);
  assert.doesNotMatch(saveDraftBtn, /!quoteFlowSetScope/);
  // Use these measurements / approve-build hidden in Quote Flow mode.
  assert.match(takeoffUi, /!isReadonly && !quoteFlowSetScope \? \([\s\S]*?ctr-approve-build/);
  assert.doesNotMatch(takeoffUi, /ctr-approve-build[\s\S]{0,300}quoteFlowSetScope \?/);
  console.log("ok: footer Save Draft restored; footer Set Scope removed; Use these measurements hidden");
}

console.log("ok: Queue UX contracts; one Set Scope; estimate name; no V1/V2");

{
  // Ready rows: primary row action is Review Takeoff, not repeated Create Manual Scope.
  const reviewBlock = queue.slice(
    queue.indexOf("function renderRow"),
    queue.indexOf("function renderSection")
  );
  assert.match(reviewBlock, /rowAction === "review_takeoff"/);
  assert.match(reviewBlock, /Review Takeoff/);
  // Create Manual Scope must not be the ready-row primary action.
  assert.doesNotMatch(
    reviewBlock,
    /rowAction === "review_takeoff"[\s\S]{0,400}Create Manual Scope/
  );
  assert.match(queue, /qf-queue-workspace-actions/);
  assert.match(
    queue.slice(queue.indexOf("qf-queue-workspace-actions")),
    /Create Manual Scope/
  );
  console.log("ok: ready rows show Review Takeoff; manual scope is workspace-level");
}

{
  const rows = [
    {
      takeoffJobId: "a",
      status: { key: "already_scoped", label: "Scope set" },
      alreadyScoped: true,
      group: { key: "scoped" },
      customerName: "Should Hide"
    },
    {
      takeoffJobId: "b",
      status: { key: "ready_for_review", label: "AI Takeoff ready for review" },
      group: { key: "ready" },
      action: "review_takeoff",
      rowAction: "review_takeoff",
      subject: "Relihan VanderSchot Finals Plans",
      customerName: "Customer not identified",
      planFilename: "finals.pdf"
    },
    {
      takeoffJobId: "d",
      status: { key: "takeoff_failed", label: "Takeoff failed / needs decision" },
      group: { key: "failed" },
      action: "needs_decision",
      rowAction: "needs_decision",
      canCreateManualScope: true
    }
  ];
  const grouped = groupQueueItems(rows);
  assert.equal(grouped.stats.total, 2);
  assert.equal(filterQueueItems(rows, "all_active").some((r) => r.alreadyScoped), false);

  assert.equal(resolveDefaultEstimateName(rows[1]), "Relihan VanderSchot Finals Plans");
  assert.equal(
    resolveDefaultEstimateName({
      customerName: "Unknown contact",
      projectName: "Project not named",
      planFilename: "NCH-McLain Top Drawing.pdf"
    }),
    "Quote name required"
  );
  assert.equal(resolveQueueTitle(rows[1]), "Relihan VanderSchot Finals Plans");
  const subtitle = resolveQueueSubtitle(rows[1], resolveQueueTitle(rows[1]));
  assert.doesNotMatch(subtitle, /Unknown contact/);
  assert.doesNotMatch(`${resolveQueueTitle(rows[1])} — ${subtitle}`, /Unknown contact — Unknown contact/);
  assert.equal(resolveQueueCustomer({ customerName: "Customer not identified", planFilename: "x.pdf" }), "Plan: x");
  assert.equal(
    resolveQueueTitle({
      planFilename: "20260429163807042.pdf",
      takeoffJobId: "abcd1234-ffff-ffff-ffff-ffffffffffff"
    }),
    "Quote name required"
  );
  assert.equal(
    resolveQueueTitle({
      requestSubject: "FW: Renewed-Mercer Preliminary Drawings",
      planFilename: "20260429163807042.pdf",
      senderLabel: "Hunter Robinson"
    }),
    "FW: Renewed-Mercer Preliminary Drawings"
  );
  console.log("ok: estimate name fallbacks; no Unknown contact — Unknown contact");
}

{
  assert.match(queue, /qf-queue-row-title|qf-queue-row-sender|qf-queue-row-source/);
  assert.match(queue, /Plan processed:/);
  assert.match(queue, /AI Takeoff packet:/);
  assert.match(queue, /ProcessedPlanPacketCard|qf-queue-packet-card/);
  assert.match(queue, /Next action:/);
  assert.match(queue, /nextActionHelper|Review the returned AI measurements/);
  assert.match(queue, /qf-queue-takeoff-iframe/);
  assert.match(api, /packetFiles|packetMerged|requestSubject/);
  assert.match(grouping, /isOpaquePlanFilename/);
  console.log("ok: queue clarity contracts — title/source/packet card");
}

{
  const takeoffStyles = readFileSync(join(repoRoot, "app-ai-takeoff/src/styles.css"), "utf8");
  const styles = readFileSync(join(appRoot, "src/styles.css"), "utf8");
  assert.match(queue, /data-testid="qf-queue-review-modal"/);
  assert.match(queue, /data-testid="qf-queue-review-modal-backdrop"/);
  assert.match(queue, /data-testid="qf-queue-review-workspace"/);
  assert.match(queue, /data-testid="qf-queue-review-modal-title"/);
  assert.match(queue, /data-testid="qf-queue-review-modal-actions"/);
  assert.match(queue, /data-testid="qf-queue-review-save-draft"/);
  assert.match(queue, /data-testid="qf-queue-review-modal-close"/);
  assert.match(queue, /data-testid="qf-queue-takeoff-iframe"/);
  assert.match(queue, /data-testid="qf-queue-set-scope"/);
  assert.match(queue, /Back to Queue/);
  assert.match(queue, /Discard unsaved review changes\?|REVIEW_DISCARD_CONFIRM/);
  assert.match(queue, /closeReviewWorkspace/);
  assert.match(queue, /reviewDirty/);
  assert.match(queue, /QUOTE_FLOW_REQUEST_SAVE_DRAFT/);
  assert.match(queue, /TAKEOFF_REVIEW_DIRTY/);
  assert.match(queue, /data-testid="qf-queue-review-open-hint"/);
  // Iframe lives in the modal workspace, not the squeezed detail pane frame.
  assert.match(queue, /qf-queue__frame-wrap--review-modal/);
  assert.doesNotMatch(queue, /detailMode === "review" && takeoffSrc \? \([\s\S]*?qf-queue__frame-wrap--command/);
  assert.match(styles, /qf-queue-review-modal-backdrop/);
  assert.match(styles, /qf-queue-review-modal\b/);
  assert.match(styles, /@media \(max-width: 860px\)/);
  assert.match(takeoffStyles, /ctr-split-divider/);
  console.log("ok: Review Takeoff full-screen modal workspace contracts");
}

{
  const takeoffUi = readFileSync(
    join(repoRoot, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  const takeoffStyles = readFileSync(join(repoRoot, "app-ai-takeoff/src/styles.css"), "utf8");
  assert.match(takeoffUi, /data-testid="ctr-split-layout"/);
  assert.match(takeoffUi, /data-testid="ctr-plan-preview"/);
  assert.match(takeoffUi, /data-testid="ctr-worksheet-pane"/);
  assert.match(takeoffUi, /data-testid="ctr-split-divider"/);
  assert.match(takeoffUi, /setPointerCapture/);
  assert.match(takeoffUi, /Split view/);
  assert.match(takeoffUi, /Larger plan/);
  assert.match(takeoffUi, /Larger worksheet/);
  assert.match(takeoffUi, /Reset layout/);
  assert.match(takeoffUi, /data-testid="ctr-save-draft"/);
  assert.match(takeoffUi, /ctr-row--focused/);
  assert.match(takeoffUi, /QUOTE_FLOW_REQUEST_SAVE_DRAFT/);
  assert.match(takeoffUi, /TAKEOFF_REVIEW_DIRTY/);
  assert.match(takeoffStyles, /ctr-split-divider/);
  assert.match(takeoffStyles, /--ctr-plan-ratio/);
  assert.doesNotMatch(takeoffStyles, /\.ctr-plan\s*\{[^}]*resize:\s*both/);
  assert.match(takeoffUi, /data-testid="ctr-waterfall-toggle"/);
  assert.match(takeoffUi, /waterfallCollapsedSummary|Waterfall panels · None added/);
  assert.match(takeoffUi, /ctr-col-dim--primary/);
  assert.match(takeoffStyles, /--ctr-col-dim:\s*112px/);
  assert.match(takeoffStyles, /ctr-waterfall-physical--collapsed/);
  console.log("ok: Review Takeoff split plan/worksheet layout contracts");
}

{
  const {
    resolveDefaultEstimateName,
    looksLikeAttachmentFilename,
    QUOTE_NAME_REQUIRED_LABEL,
    isMeaningfulQuoteName
  } = await import(join(appRoot, "src/lib/queueGrouping.mjs"));
  assert.equal(looksLikeAttachmentFilename("Pearson - Zude R 3D1.pdf"), true);
  assert.equal(
    resolveDefaultEstimateName({
      quoteName: "FW: PEARSON - ZUDE",
      requestSubject: "FW: PEARSON - ZUDE",
      subject: "FW: PEARSON - ZUDE",
      estimateName: "Pearson - Zude R 3D1",
      planFilename: "Pearson - Zude R 3D1.pdf",
      selectedPlanFilename: "Pearson - Zude R 3D1.pdf",
      packetFiles: [
        { filename: "Pearson - Zude R 3D1.pdf" },
        { filename: "Pearson Revised Island.pdf" }
      ]
    }),
    "FW: PEARSON - ZUDE"
  );
  assert.equal(
    resolveDefaultEstimateName({
      scope: { projectName: "Pearson Residence - Zude" },
      quoteName: "FW: PEARSON - ZUDE",
      requestSubject: "FW: PEARSON - ZUDE",
      planFilename: "Pearson - Zude R 3D1.pdf"
    }),
    "Pearson Residence - Zude"
  );
  assert.equal(
    resolveDefaultEstimateName({
      planFilename: "Kitchen Countertops.pdf",
      selectedPlanFilename: "Kitchen Countertops.pdf"
    }),
    QUOTE_NAME_REQUIRED_LABEL
  );
  assert.equal(isMeaningfulQuoteName("image001"), false);
  assert.equal(isMeaningfulQuoteName("drawing001.pdf"), false);
  assert.match(queue, /estimateNameUserEditedRef/);
  assert.match(queue, /persistQuoteNameIfNeeded/);
  console.log("ok: canonical Quote Name — subject/durable over PDF; filename-only requires name");
}

{
  const { presentQuoteFlowQueueItem, resolveDefaultEstimateName: backendName, QUOTE_NAME_REQUIRED_LABEL } =
    await import(join(repoRoot, "backend-core/src/elite100QuoteFlow/quoteFlowQueuePresenter.mjs"));
  const ready = presentQuoteFlowQueueItem({
    id: "case-1",
    takeoffJobId: "job-1",
    customerName: "Customer not identified",
    projectName: "Project not named",
    quoteName: "Hoskins Williams Job",
    requestSubject: "Hoskins Williams Job",
    planFilename: "Hoskins Williams Job.pdf",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    messageKey: "AAMkAGI2ExampleGraphKeyThatIsLong=="
  });
  assert.equal(ready.rowAction, "review_takeoff");
  assert.equal(ready.actionLabel, "Review Takeoff");
  assert.equal(ready.defaultEstimateName, "Hoskins Williams Job");
  assert.equal(ready.quoteNameRequired, false);
  assert.doesNotMatch(ready.defaultEstimateName, /AAMk|Unknown contact/);
  assert.equal(
    backendName({
      subject: "Amanda Rushton",
      customerName: "Unknown contact",
      planFilename: "ignored.pdf"
    }),
    "Amanda Rushton"
  );
  const planOnly = presentQuoteFlowQueueItem({
    id: "case-plan-only",
    takeoffJobId: "job-plan",
    planFilename: "image001.png",
    selectedPlanFilename: "image001.png",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review"
  });
  assert.equal(planOnly.quoteNameRequired, true);
  assert.equal(planOnly.defaultEstimateName, QUOTE_NAME_REQUIRED_LABEL);
  console.log("ok: presenter canonical Quote Name + ready rowAction");
}

console.log("\nquoteFlowQueue.ui.test.mjs: ok\n");
