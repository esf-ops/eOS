/**
 * Quote Flow Estimate Queue — source/packet identity presenter.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowQueueSourceMeta.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildQuoteFlowTakeoffSourceMeta,
  isOpaquePlanFilename,
  mergeQuoteFlowTakeoffMetadata,
  readQuoteFlowTakeoffSourceMeta
} from "./quoteFlowQueueSourceMeta.mjs";
import {
  presentQuoteFlowQueueItem,
  resolveDefaultEstimateName
} from "./quoteFlowQueuePresenter.mjs";

console.log("\nquoteFlowQueueSourceMeta.test.mjs\n");

{
  assert.equal(isOpaquePlanFilename("20260429163807042"), true);
  assert.equal(isOpaquePlanFilename("20260429163807042.pdf"), true);
  assert.equal(isOpaquePlanFilename("KITCHEN.pdf"), false);
  assert.equal(isOpaquePlanFilename("FW Renewed Mercer.pdf"), false);
  console.log("ok: opaque plan filename detection");
}

{
  const meta = buildQuoteFlowTakeoffSourceMeta({
    requestSubject: "FW: Renewed-Mercer Preliminary Drawings & Estimate 8-5-26",
    senderLabel: "Hunter Robinson",
    selectedPlanFilename: null,
    packetFilename: "Renewed-Mercer-takeoff-packet.pdf",
    packetMerged: true,
    packetFiles: [
      { filename: "Kitchen Countertops.pdf", attachmentKey: "a1" },
      { filename: "Pantry Countertops.pdf", attachmentKey: "a2" },
      { filename: "Bathrooms Countertops.pdf", attachmentKey: "a3" }
    ],
    messageKey: "AAMkExample=="
  });
  assert.equal(meta.packetMerged, true);
  assert.equal(meta.packetFileCount, 3);
  assert.equal(meta.packetFiles[0].filename, "Kitchen Countertops.pdf");
  assert.equal(meta.packetFiles[2].filename, "Bathrooms Countertops.pdf");
  const merged = mergeQuoteFlowTakeoffMetadata({ other: 1 }, meta);
  assert.equal(merged.other, 1);
  assert.equal(merged.quoteFlow.requestSubject, meta.requestSubject);
  console.log("ok: packet metadata build preserves ordered files");
}

{
  const withSubject = presentQuoteFlowQueueItem({
    id: "case-1",
    takeoffJobId: "job-1",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    requestSubject: "FW: Renewed-Mercer Preliminary Drawings & Estimate 8-5-26",
    subject: "FW: Renewed-Mercer Preliminary Drawings & Estimate 8-5-26",
    senderLabel: "Hunter Robinson",
    planFilename: "20260429163807042.pdf",
    selectedPlanFilename: "KITCHEN.pdf",
    receivedAt: "2026-08-06T14:58:00.000Z"
  });
  assert.equal(
    withSubject.requestTitle,
    "FW: Renewed-Mercer Preliminary Drawings & Estimate 8-5-26"
  );
  assert.equal(withSubject.estimateName, withSubject.requestTitle);
  assert.equal(withSubject.senderLabel, "Hunter Robinson");
  assert.equal(withSubject.selectedPlanFilename, "KITCHEN.pdf");
  assert.match(withSubject.packetSummaryLabel || "", /Plan processed: KITCHEN\.pdf/);
  assert.match(withSubject.nextActionHelper || "", /Set Scope/);
  console.log("ok: queue presenter uses email subject as row title when available");
}

{
  const planFallback = presentQuoteFlowQueueItem({
    id: "case-2",
    takeoffJobId: "job-2",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    planFilename: "Kitchen Countertops.pdf",
    selectedPlanFilename: "Kitchen Countertops.pdf",
    senderLabel: "Buyer Co"
  });
  assert.equal(planFallback.requestTitle, "Kitchen Countertops");
  assert.match(planFallback.packetSummaryLabel || "", /Plan processed: Kitchen Countertops\.pdf/);
  console.log("ok: queue presenter falls back to selected plan filename when subject missing");
}

{
  const multi = presentQuoteFlowQueueItem({
    id: "case-3",
    takeoffJobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    requestSubject: "Renewed Mercer",
    packetMerged: true,
    packetFilename: "Renewed-Mercer-takeoff-packet.pdf",
    packetFileCount: 3,
    packetFiles: [
      { filename: "Kitchen Countertops.pdf" },
      { filename: "Pantry Countertops.pdf" },
      { filename: "Bathrooms Countertops.pdf" }
    ]
  });
  assert.equal(multi.packetMerged, true);
  assert.equal(multi.packetFileCount, 3);
  assert.equal(multi.packetFiles[1].filename, "Pantry Countertops.pdf");
  assert.match(multi.packetSummaryLabel || "", /AI Takeoff packet: 3 files/);
  assert.equal(multi.takeoffJobIdShort, "aaaaaaaa…");
  console.log("ok: multi-file queue item exposes packet count and ordered names");
}

{
  const opaqueOnly = presentQuoteFlowQueueItem({
    id: "case-4",
    takeoffJobId: "44444444-4444-4444-8444-444444444444",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    planFilename: "20260429163807042.pdf",
    customerName: "Inbound sender"
  });
  assert.doesNotMatch(opaqueOnly.requestTitle || "", /^20260429163807042/);
  assert.match(opaqueOnly.requestTitle || "", /Quote 44444444|Untitled/i);
  assert.equal(
    resolveDefaultEstimateName({
      planFilename: "20260429163807042.pdf",
      takeoffJobId: "abcd1234-5678"
    }),
    "Quote abcd1234"
  );
  console.log("ok: opaque id fallback only when no better metadata exists");
}

{
  const fromJobMeta = presentQuoteFlowQueueItem({
    id: "case-5",
    takeoffJobId: "job-5",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    metadata: {
      quoteFlow: buildQuoteFlowTakeoffSourceMeta({
        requestSubject: "Subject from job metadata",
        senderLabel: "Meta Sender",
        selectedPlanFilename: "plan-a.pdf",
        packetMerged: false
      })
    }
  });
  // presenter reads via row fields; also verify reader helper
  const read = readQuoteFlowTakeoffSourceMeta({
    metadata: {
      quoteFlow: {
        requestSubject: "Subject from job metadata",
        selectedPlanFilename: "plan-a.pdf"
      }
    }
  });
  assert.equal(read?.requestSubject, "Subject from job metadata");
  assert.equal(fromJobMeta.status.key, "ready_for_review");
  assert.equal(fromJobMeta.actionLabel, "Review Takeoff");
  console.log("ok: existing queue archive/remove/set-scope action labels unchanged for ready rows");
}

console.log("\nquoteFlowQueueSourceMeta.test.mjs: ok\n");
