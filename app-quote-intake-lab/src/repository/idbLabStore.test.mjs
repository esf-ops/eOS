import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import "fake-indexeddb/auto";
import { IdbLabStore } from "./idbLabStore.mjs";

describe("IdbLabStore", () => {
  /** @type {IdbLabStore} */
  let store;

  before(async () => {
    store = new IdbLabStore();
    await store.ready();
    await store.clearImported();
  });

  it("saves, dedupes, reads attachment bytes, and clears", async () => {
    const caseRow = {
      id: "qil-imp-test-1",
      status: "qil_received",
      dataSource: "imported",
      receivedAt: "2026-07-14T16:00:00.000Z",
      attachments: [{ id: "att-1", filename: "a.txt", contentType: "text/plain", sizeBytes: 4 }],
      importMeta: { dedupeKey: "mid:test-idb-1@example.com" }
    };
    const bytes = new TextEncoder().encode("test");
    const saved = await store.saveImportedCase({
      caseRow,
      attachmentBlobs: [{ attachmentId: "att-1", bytes, contentType: "text/plain", filename: "a.txt" }]
    });
    assert.equal(saved.duplicate, false);
    assert.equal(await store.countImported(), 1);
    assert.equal(await store.findCaseIdByDedupeKey("mid:test-idb-1@example.com"), "qil-imp-test-1");

    const dup = await store.saveImportedCase({
      caseRow: { ...caseRow, id: "qil-imp-test-2" },
      attachmentBlobs: []
    });
    assert.equal(dup.duplicate, true);
    assert.equal(dup.caseId, "qil-imp-test-1");

    const out = await store.getAttachmentBytes("qil-imp-test-1", "att-1");
    assert.ok(out);
    assert.equal(new TextDecoder().decode(out), "test");

    await store.clearImported();
    assert.equal(await store.countImported(), 0);
    assert.equal(await store.getCase("qil-imp-test-1"), null);
  });

  it("migrates to v2/v3/v4 stores and keeps fixture overlays/takeoff on clear", async () => {
    const fixtureCaseId = "qil-case-fixture-overlay";
    await store.setCaseOverlay(fixtureCaseId, { status: "qil_intake_review", nextAction: "test" });
    await store.saveClassificationRun({
      id: "qil-run-fixture-1",
      caseId: fixtureCaseId,
      providerMode: "simulated",
      startedAt: "2026-07-14T16:00:00.000Z",
      humanReviewState: "unreviewed",
      result: { intent: "new_quote_request" }
    });
    await store.saveTakeoffRun({
      id: "qil-toff-fixture-keep",
      caseId: fixtureCaseId,
      startedAt: "2026-07-14T16:02:00.000Z",
      labTakeoffStatus: "qil_takeoff_review",
      rooms: [],
      warnings: [],
      calculation: {}
    });
    await store.setTakeoffOverlay(fixtureCaseId, { latestTakeoffRunId: "qil-toff-fixture-keep" });
    await store.saveTakeoffCorrectionDraft({
      id: "qil-toff-draft-fixture",
      caseId: fixtureCaseId,
      sourceRunId: "qil-toff-fixture-keep",
      updatedAt: "2026-07-14T16:04:00.000Z",
      operations: []
    });

    const caseRow = {
      id: "qil-imp-test-cls",
      status: "qil_received",
      dataSource: "imported",
      receivedAt: "2026-07-14T16:00:00.000Z",
      attachments: [],
      importMeta: { dedupeKey: "mid:test-idb-cls@example.com" },
      events: []
    };
    await store.saveImportedCase({ caseRow, attachmentBlobs: [] });
    await store.saveClassificationRun({
      id: "qil-run-imp-1",
      caseId: "qil-imp-test-cls",
      providerMode: "simulated",
      startedAt: "2026-07-14T16:01:00.000Z",
      humanReviewState: "unreviewed",
      result: { intent: "not_quote_related" }
    });
    await store.setCaseOverlay("qil-imp-test-cls", { status: "qil_not_quote" });
    await store.saveTakeoffRun({
      id: "qil-toff-imp-1",
      caseId: "qil-imp-test-cls",
      startedAt: "2026-07-14T16:03:00.000Z",
      labTakeoffStatus: "qil_takeoff_failed",
      rooms: [],
      warnings: [],
      calculation: {}
    });

    await store.clearImported();
    assert.equal(await store.countImported(), 0);
    assert.equal((await store.listClassificationRuns("qil-imp-test-cls")).length, 0);
    assert.equal((await store.listClassificationRuns(fixtureCaseId)).length, 1);
    assert.equal((await store.getOverlay(fixtureCaseId))?.status, "qil_intake_review");
    assert.equal((await store.listTakeoffRuns("qil-imp-test-cls")).length, 0);
    assert.equal((await store.listTakeoffRuns(fixtureCaseId)).length, 1);
    assert.equal((await store.getTakeoffOverlay(fixtureCaseId))?.latestTakeoffRunId, "qil-toff-fixture-keep");
    assert.equal((await store.listTakeoffCorrectionDrafts(fixtureCaseId)).length, 1);
  });
});
