/**
 * Quote Flow Estimate Queue — source/packet identity + canonical Quote Name.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowQueueSourceMeta.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildQuoteFlowTakeoffSourceMeta,
  establishInitialQuoteName,
  isMeaningfulQuoteName,
  isOpaquePlanFilename,
  isWeakPlanBasename,
  mergeQuoteFlowTakeoffMetadata,
  pickQuoteRequestSubjectFromInboxItem,
  looksLikeAttachmentFilename,
  readQuoteFlowTakeoffSourceMeta
} from "./quoteFlowQueueSourceMeta.mjs";
import {
  presentQuoteFlowQueueItem,
  QUOTE_NAME_REQUIRED_LABEL,
  resolveCanonicalQuoteName,
  resolveDefaultEstimateName
} from "./quoteFlowQueuePresenter.mjs";

console.log("\nquoteFlowQueueSourceMeta.test.mjs\n");

{
  assert.equal(isOpaquePlanFilename("20260429163807042"), true);
  assert.equal(isOpaquePlanFilename("20260429163807042.pdf"), true);
  assert.equal(isOpaquePlanFilename("KITCHEN.pdf"), false);
  assert.equal(isWeakPlanBasename("image001"), true);
  assert.equal(isWeakPlanBasename("image001.png"), true);
  assert.equal(isWeakPlanBasename("1803_001"), true);
  assert.equal(isWeakPlanBasename("drawing001.pdf"), true);
  assert.equal(isWeakPlanBasename("FW: PEARSON - ZUDE"), false);
  assert.equal(isMeaningfulQuoteName("FW: PEARSON - ZUDE"), true);
  assert.equal(isMeaningfulQuoteName("image001"), false);
  assert.equal(isMeaningfulQuoteName("Pearson - Zude R 3D1.pdf"), false);
  console.log("ok: opaque / weak plan basename detection");
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
  assert.equal(meta.quoteName, "FW: Renewed-Mercer Preliminary Drawings & Estimate 8-5-26");
  assert.equal(meta.quoteNameUserSet, false);
  assert.equal(meta.quoteNameSource, "email_subject");
  assert.equal(meta.packetFiles[0].filename, "Kitchen Countertops.pdf");
  const merged = mergeQuoteFlowTakeoffMetadata({ other: 1 }, meta);
  assert.equal(merged.other, 1);
  assert.equal(merged.quoteFlow.requestSubject, meta.requestSubject);
  assert.equal(merged.quoteFlow.quoteName, meta.quoteName);
  console.log("ok: email subject establishes canonical Quote Name at stamp");
}

{
  const withSubject = presentQuoteFlowQueueItem({
    id: "case-1",
    takeoffJobId: "job-1",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    quoteName: "FW: Renewed-Mercer Preliminary Drawings & Estimate 8-5-26",
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
  assert.equal(withSubject.quoteName, withSubject.requestTitle);
  assert.equal(withSubject.quoteNameRequired, false);
  assert.equal(withSubject.senderLabel, "Hunter Robinson");
  assert.equal(withSubject.selectedPlanFilename, "KITCHEN.pdf");
  assert.match(withSubject.packetSummaryLabel || "", /Plan processed: KITCHEN\.pdf/);
  console.log("ok: Estimate Queue uses canonical Quote Name");
}

{
  const planOnly = presentQuoteFlowQueueItem({
    id: "case-2",
    takeoffJobId: "job-2",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    planFilename: "Kitchen Countertops.pdf",
    selectedPlanFilename: "Kitchen Countertops.pdf",
    senderLabel: "Buyer Co"
  });
  assert.equal(planOnly.quoteNameRequired, true);
  assert.equal(planOnly.estimateName, QUOTE_NAME_REQUIRED_LABEL);
  assert.equal(planOnly.requestTitle, QUOTE_NAME_REQUIRED_LABEL);
  assert.match(planOnly.packetSummaryLabel || "", /Plan processed: Kitchen Countertops\.pdf/);
  assert.doesNotMatch(planOnly.estimateName || "", /Kitchen Countertops/);
  console.log("ok: filename-only request requires Quote Name (no filename as identity)");
}

{
  const weak = presentQuoteFlowQueueItem({
    id: "case-weak",
    takeoffJobId: "job-weak",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    planFilename: "image001.png",
    selectedPlanFilename: "image001.png"
  });
  assert.equal(weak.quoteNameRequired, true);
  assert.equal(weak.estimateName, QUOTE_NAME_REQUIRED_LABEL);
  assert.doesNotMatch(weak.estimateName || "", /image001/i);
  console.log("ok: image001 / weak basenames never become Quote Name");
}

{
  const multi = presentQuoteFlowQueueItem({
    id: "case-3",
    takeoffJobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    quoteName: "Renewed Mercer",
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
  assert.equal(multi.estimateName, "Renewed Mercer");
  assert.equal(multi.packetFiles[1].filename, "Pantry Countertops.pdf");
  console.log("ok: multiple attachments do not change Quote Name");
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
  assert.equal(opaqueOnly.quoteNameRequired, true);
  assert.equal(opaqueOnly.estimateName, QUOTE_NAME_REQUIRED_LABEL);
  console.log("ok: opaque plan-only rows require Quote Name");
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
    },
    quoteName: "Subject from job metadata",
    requestSubject: "Subject from job metadata",
    selectedPlanFilename: "plan-a.pdf"
  });
  const read = readQuoteFlowTakeoffSourceMeta({
    metadata: {
      quoteFlow: {
        requestSubject: "Subject from job metadata",
        selectedPlanFilename: "plan-a.pdf"
      }
    }
  });
  assert.equal(read?.requestSubject, "Subject from job metadata");
  assert.equal(read?.quoteName, "Subject from job metadata");
  assert.equal(fromJobMeta.estimateName, "Subject from job metadata");
  assert.equal(fromJobMeta.status.key, "ready_for_review");
  console.log("ok: stamp metadata seeds Quote Name from subject");
}

{
  const pearson = presentQuoteFlowQueueItem({
    id: "case-pearson",
    takeoffJobId: "job-pearson",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    quoteName: "FW: PEARSON - ZUDE",
    requestSubject: "FW: PEARSON - ZUDE",
    subject: "FW: PEARSON - ZUDE",
    planFilename: "Pearson - Zude R 3D1.pdf",
    selectedPlanFilename: "Pearson - Zude R 3D1.pdf",
    packetFiles: [
      { filename: "Pearson - Zude R 3D1.pdf" },
      { filename: "Pearson Cabinet Elevations.pdf" },
      { filename: "Pearson Revised Island.pdf" }
    ],
    packetMerged: true,
    packetFileCount: 3
  });
  assert.equal(pearson.estimateName, "FW: PEARSON - ZUDE");
  assert.equal(pearson.quoteName, "FW: PEARSON - ZUDE");
  assert.equal(pearson.selectedPlanFilename, "Pearson - Zude R 3D1.pdf");
  assert.equal(
    resolveDefaultEstimateName({
      quoteName: "FW: PEARSON - ZUDE",
      requestSubject: "FW: PEARSON - ZUDE",
      planFilename: "Pearson - Zude R 3D1.pdf"
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
  console.log("ok: attachment filename remains separate; scoped rename wins");
}

{
  assert.equal(
    pickQuoteRequestSubjectFromInboxItem({
      subject: "FW: PEARSON - ZUDE",
      requestTitle: "Pearson - Zude R 3D1.pdf",
      bestPlanCandidate: { filename: "Pearson - Zude R 3D1.pdf" }
    }),
    "FW: PEARSON - ZUDE"
  );
  const revised = mergeQuoteFlowTakeoffMetadata(
    {
      quoteFlow: {
        requestSubject: "FW: PEARSON - ZUDE",
        quoteName: "FW: PEARSON - ZUDE",
        quoteNameUserSet: false,
        selectedPlanFilename: "a.pdf"
      }
    },
    buildQuoteFlowTakeoffSourceMeta({
      requestSubject: "Pearson - Zude R 3D2 Revised.pdf",
      selectedPlanFilename: "Pearson - Zude R 3D2 Revised.pdf"
    })
  );
  assert.equal(revised.quoteFlow.requestSubject, "FW: PEARSON - ZUDE");
  assert.equal(revised.quoteFlow.quoteName, "FW: PEARSON - ZUDE");
  assert.equal(revised.quoteFlow.selectedPlanFilename, "Pearson - Zude R 3D2 Revised.pdf");

  const userRenamed = mergeQuoteFlowTakeoffMetadata(
    {
      quoteFlow: {
        requestSubject: "FW: PEARSON - ZUDE",
        quoteName: "Pearson Residence - Zude",
        quoteNameUserSet: true,
        selectedPlanFilename: "a.pdf"
      }
    },
    buildQuoteFlowTakeoffSourceMeta({
      requestSubject: "FW: PEARSON - ZUDE",
      selectedPlanFilename: "Pearson Revised Island.pdf",
      packetFiles: [{ filename: "Pearson Revised Island.pdf" }]
    })
  );
  assert.equal(userRenamed.quoteFlow.quoteName, "Pearson Residence - Zude");
  assert.equal(userRenamed.quoteFlow.quoteNameUserSet, true);
  assert.equal(userRenamed.quoteFlow.selectedPlanFilename, "Pearson Revised Island.pdf");
  console.log("ok: revised attachment / AI rerun cannot change Quote Name; user rename persists");
}

{
  const initial = establishInitialQuoteName({
    requestSubject: "TEST - SMITH RESIDENCE",
    selectedPlanFilename: "drawing001.pdf"
  });
  assert.equal(initial.quoteName, "TEST - SMITH RESIDENCE");
  assert.equal(initial.quoteNameUserSet, false);

  const manual = establishInitialQuoteName({
    selectedPlanFilename: "drawing001.pdf"
  });
  assert.equal(manual.quoteName, null);

  const backfillSafe = establishInitialQuoteName({
    requestSubject: "FW: Fashion Par Sales",
    quoteName: null
  });
  assert.equal(backfillSafe.quoteName, "FW: Fashion Par Sales");

  const intentional = establishInitialQuoteName({
    requestSubject: "FW: Fashion Par Sales",
    quoteName: "Fashion Par Kitchen",
    quoteNameUserSet: true
  });
  assert.equal(intentional.quoteName, "Fashion Par Kitchen");
  assert.equal(intentional.quoteNameUserSet, true);
  console.log("ok: backfill/establish never overwrites intentional estimator names");
}

{
  const missing = resolveCanonicalQuoteName({
    planFilename: "1803_001.pdf",
    selectedPlanFilename: "1803_001.pdf"
  });
  assert.equal(missing.quoteNameRequired, true);
  assert.equal(missing.displayTitle, QUOTE_NAME_REQUIRED_LABEL);
  console.log("ok: Set Scope path surfaces Quote Name required for filename-only rows");
}

console.log("\nquoteFlowQueueSourceMeta.test.mjs: ok\n");
