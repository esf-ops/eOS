/**
 * Quote Intake Phase 6P.1 — repository unit tests.
 * Run: node backend-core/src/quoteIntake/quoteIntakeRepository.test.mjs
 */

import assert from "node:assert/strict";
import { InMemoryQuoteIntakeRepository } from "./quoteIntakeRepository.mjs";
import {
  AUTOMATION_PATH,
  AUTOMATION_REASON_CODE,
  QUOTE_INTAKE_CASE_STATUS
} from "./quoteIntakeTypes.mjs";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const SHA =
  "0833ca1afd77665f24590158535e90b60b6e78d3e176de6a34a336d97deae9cb";

console.log("\nquoteIntakeRepository.test.mjs\n");

{
  const repo = new InMemoryQuoteIntakeRepository();
  const c = repo.createCase({
    organizationId: ORG_A,
    createdByUserId: "user-1",
    sourceMessage: { internetMessageId: "<msg-1@example.com>", contentHash: "hash-aaa" },
    attachments: [{ sha256: SHA, mimeType: "application/pdf", sizeBytes: 100, safeFilename: "plan.pdf" }]
  });
  assert.equal(c.status, QUOTE_INTAKE_CASE_STATUS.RECEIVED);
  assert.equal(c.attachments.length, 1);
  assert.equal(c.organizationId, ORG_A);

  assert.throws(
    () =>
      repo.createCase({
        organizationId: ORG_A,
        sourceMessage: { internetMessageId: "<msg-1@example.com>" }
      }),
    /Duplicate internetMessageId/
  );

  // Same internetMessageId in other org is allowed
  const other = repo.createCase({
    organizationId: ORG_B,
    sourceMessage: { internetMessageId: "<msg-1@example.com>" }
  });
  assert.ok(other.id !== c.id);

  assert.equal(repo.listCases(ORG_A).length, 1);
  assert.equal(repo.listCases(ORG_B).length, 1);
  assert.equal(repo.getCase(ORG_B, c.id), null);
  assert.ok(repo.getCase(ORG_A, c.id));

  console.log("ok: create + dedupe + org isolation");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const c = repo.createCase({
    organizationId: ORG_A,
    sourceMessage: { contentHash: "shared-hash" }
  });
  assert.throws(
    () => repo.createCase({ organizationId: ORG_A, sourceMessage: { contentHash: "shared-hash" } }),
    /Duplicate contentHash/
  );
  // Distinct Message-IDs with same content hash must not merge.
  const other = repo.createCase({
    organizationId: ORG_A,
    sourceMessage: {
      internetMessageId: "<m1@example.com>",
      contentHash: "shared-hash"
    }
  });
  assert.notEqual(other.id, c.id);
  const other2 = repo.createCase({
    organizationId: ORG_A,
    sourceMessage: {
      internetMessageId: "<m2@example.com>",
      contentHash: "shared-hash"
    }
  });
  assert.notEqual(other2.id, other.id);
  console.log("ok: contentHash fallback dedupe (Message-ID absent only)");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const c = repo.createCase({ organizationId: ORG_A });
  const d = repo.recordAutomationDecision({
    organizationId: ORG_A,
    intakeCaseId: c.id,
    path: AUTOMATION_PATH.MANUAL_REVIEW,
    reasonCodes: [AUTOMATION_REASON_CODE.SUBJECT_MARKER_MISSING],
    actorUserId: "estimator-1"
  });
  assert.equal(d.path, AUTOMATION_PATH.MANUAL_REVIEW);
  assert.equal(d.wouldStartTakeoff, false);
  assert.equal(repo.getCase(ORG_A, c.id).status, QUOTE_INTAKE_CASE_STATUS.MANUAL_REVIEW);

  const events = repo.listAuditEvents(ORG_A, c.id);
  assert.ok(events.some((e) => e.eventType === "case_created"));
  assert.ok(events.some((e) => e.eventType === "automation_decision_recorded"));
  assert.equal(repo.listAuditEvents(ORG_B, c.id), null);
  console.log("ok: automation decision + audit");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const c = repo.createCase({ organizationId: ORG_A });
  const pathA = repo.recordAutomationDecision({
    organizationId: ORG_A,
    intakeCaseId: c.id,
    path: AUTOMATION_PATH.TRUSTED_AUTOMATIC_TAKEOFF,
    reasonCodes: [AUTOMATION_REASON_CODE.ALL_GATES_PASSED],
    wouldStartTakeoff: true
  });
  assert.equal(pathA.wouldStartTakeoff, true);
  assert.equal(repo.getCase(ORG_A, c.id).status, QUOTE_INTAKE_CASE_STATUS.READY_FOR_TAKEOFF);
  // Still no takeoff links / jobs unless explicitly created as structure-only
  assert.equal(repo.listTakeoffLinks(ORG_A, c.id).length, 0);
  console.log("ok: Path A records intent without takeoff link");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const c = repo.createCase({
    organizationId: ORG_A,
    attachments: [{ sha256: SHA }]
  });
  const link1 = repo.createTakeoffLink({
    organizationId: ORG_A,
    intakeCaseId: c.id,
    idempotencyKey: `${c.id}|${SHA}|r1`,
    attachmentSha256: SHA,
    takeoffJobId: null
  });
  const link2 = repo.createTakeoffLink({
    organizationId: ORG_A,
    intakeCaseId: c.id,
    idempotencyKey: `${c.id}|${SHA}|r1`,
    attachmentSha256: SHA
  });
  assert.equal(link1.id, link2.id);
  assert.equal(link1.takeoffJobId, null);
  console.log("ok: takeoff link idempotency (structure only)");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  assert.throws(() => repo.createCase({ organizationId: "" }), /organizationId/);
  assert.throws(
    () =>
      repo.createCase({
        organizationId: ORG_A,
        attachments: [{ sha256: "not-a-hash" }]
      }),
    /sha256/
  );
  console.log("ok: validation errors");
}

console.log("\nAll quoteIntakeRepository tests passed.\n");
