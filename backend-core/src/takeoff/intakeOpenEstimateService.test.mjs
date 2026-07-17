/**
 * Open Estimate — intake → production Takeoff handoff.
 * Run: node backend-core/src/takeoff/intakeOpenEstimateService.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import {
  buildOpenEstimateIdempotencyKey,
  openEstimateForIntakeCase,
  rejectCallerOpenEstimateHints,
  selectSupportedPdfAttachment
} from "./intakeOpenEstimateService.mjs";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PDF_BYTES = Buffer.from("%PDF-1.4 smoke-plan-bytes-for-open-estimate");
const PDF_SHA = createHash("sha256").update(PDF_BYTES).digest("hex");

console.log("\nintakeOpenEstimateService.test.mjs\n");

{
  assert.throws(
    () =>
      rejectCallerOpenEstimateHints({
        organizationId: ORG_A,
        takeoffJobId: "job",
        attachmentUrl: "https://evil.example/x.pdf"
      }),
    /Caller-controlled/
  );
  assert.throws(() => rejectCallerOpenEstimateHints({ token: "abc" }), /Caller-controlled/);
  rejectCallerOpenEstimateHints({});
  rejectCallerOpenEstimateHints(null);
  console.log("ok: browser cannot supply org/job/mailbox/token/URL fields");
}

{
  assert.throws(() => selectSupportedPdfAttachment({ attachments: [] }), /No supported PDF/);
  const att = selectSupportedPdfAttachment({
    attachments: [
      {
        id: "att-1",
        sha256: PDF_SHA,
        mimeType: "application/pdf",
        safeFilename: "plan.pdf"
      }
    ]
  });
  assert.equal(att.id, "att-1");
  console.log("ok: no supported PDF fails closed; single PDF selected");
}

async function seedCase(repo, org, extras = {}) {
  return repo.createCase({
    organizationId: org,
    createdByUserId: "user-1",
    status: "qil_received",
    sourceMessage: {
      graphImmutableMessageId: extras.messageId || "msg-1",
      contentHash: extras.contentHash || `hash-${org}-${Math.random()}`
    },
    attachments: [
      {
        id: extras.attId || undefined,
        sha256: PDF_SHA,
        mimeType: "application/pdf",
        sizeBytes: PDF_BYTES.length,
        safeFilename: "kitchen-plan.pdf",
        sourceAttachmentId: extras.sourceAttachmentId || "graph-att-1"
      }
    ]
  });
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const created = await seedCase(repo, ORG_A);
  let workspaceCalls = 0;
  const jobs = new Map();

  async function createWorkspace({ organizationId, quoteFileId }) {
    workspaceCalls += 1;
    const existing = [...jobs.values()].find(
      (j) => j.organizationId === organizationId && j.quoteFileId === quoteFileId
    );
    if (existing) return { takeoffJobId: existing.id };
    const id = `job-${workspaceCalls}-${quoteFileId.slice(0, 8)}`;
    jobs.set(id, { id, organizationId, quoteFileId });
    return { takeoffJobId: id };
  }

  async function ingestFile({ organizationId, sha256 }) {
    return { quoteFileId: `file-${organizationId.slice(0, 8)}-${sha256.slice(0, 8)}`, reused: false };
  }

  const common = {
    repository: repo,
    organizationId: ORG_A,
    intakeCaseId: created.id,
    actorUserId: "user-1",
    body: {},
    repositoryMode: "memory",
    getSupabase: () => ({}),
    fetchAttachmentBytes: async () => PDF_BYTES,
    ingestFile,
    createWorkspace
  };

  const first = await openEstimateForIntakeCase(common);
  const second = await openEstimateForIntakeCase(common);
  assert.equal(first.takeoffJobId, second.takeoffJobId);
  assert.equal(first.created, true);
  assert.equal(second.reused, true);
  assert.equal(workspaceCalls, 1);
  assert.ok(first.persistenceWarning);
  console.log("ok: same case opened twice returns same takeoff job");

  const [a, b] = await Promise.all([
    openEstimateForIntakeCase(common),
    openEstimateForIntakeCase(common)
  ]);
  assert.equal(a.takeoffJobId, b.takeoffJobId);
  assert.equal(workspaceCalls, 1);
  console.log("ok: concurrent duplicate opens do not create duplicate jobs");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const caseA = await seedCase(repo, ORG_A, { contentHash: "ca" });
  const caseB = await seedCase(repo, ORG_B, { contentHash: "cb" });
  const jobs = [];

  const makeDeps = (org, caseId) => ({
    repository: repo,
    organizationId: org,
    intakeCaseId: caseId,
    actorUserId: "user-1",
    body: {},
    repositoryMode: "memory",
    getSupabase: () => ({}),
    fetchAttachmentBytes: async () => PDF_BYTES,
    ingestFile: async ({ organizationId, sha256 }) => ({
      quoteFileId: `file-${organizationId}-${sha256.slice(0, 6)}`,
      reused: false
    }),
    createWorkspace: async ({ organizationId, quoteFileId }) => {
      const id = `job-${organizationId.slice(0, 4)}-${jobs.length + 1}`;
      jobs.push({ id, organizationId, quoteFileId });
      return { takeoffJobId: id };
    }
  });

  const openA = await openEstimateForIntakeCase(makeDeps(ORG_A, caseA.id));
  const openB = await openEstimateForIntakeCase(makeDeps(ORG_B, caseB.id));
  assert.notEqual(openA.takeoffJobId, openB.takeoffJobId);

  await assert.rejects(
    () => openEstimateForIntakeCase(makeDeps(ORG_B, caseA.id)),
    (e) => e.code === "case_not_found"
  );
  console.log("ok: different orgs cannot access or reuse each other's cases/links");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const created = await repo.createCase({
    organizationId: ORG_A,
    createdByUserId: "user-1",
    sourceMessage: { contentHash: "no-pdf-case" },
    attachments: []
  });
  await assert.rejects(
    () =>
      openEstimateForIntakeCase({
        repository: repo,
        organizationId: ORG_A,
        intakeCaseId: created.id,
        body: {},
        getSupabase: () => ({}),
        fetchAttachmentBytes: async () => PDF_BYTES,
        ingestFile: async () => ({ quoteFileId: "x" }),
        createWorkspace: async () => ({ takeoffJobId: "y" })
      }),
    (e) => e.code === "no_supported_pdf" && e.statusCode === 422
  );
  console.log("ok: no supported PDF returns clear non-500 response");
}

{
  const caseRow = {
    id: "case-1",
    attachments: [{ sha256: PDF_SHA, mimeType: "application/pdf" }]
  };
  const key = buildOpenEstimateIdempotencyKey(caseRow, caseRow.attachments[0]);
  assert.equal(key, `open-estimate:v1:case-1:${PDF_SHA}`);
  console.log("ok: idempotency key is server-derived from case + sha256");
}

console.log("\nAll intakeOpenEstimateService tests passed.\n");
