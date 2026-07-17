/**
 * PDF size-limit enforcement for Quote Intake → Open Estimate.
 *
 * Guards the regression where envInt treated missing env as 0 and clamped
 * maxAttachmentBytes to 1024 (1 KB), causing real cabinet-plan PDFs to fail
 * with attachment_too_large.
 *
 * Run: node backend-core/src/takeoff/pdfSizeLimit.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEFAULT_MAX_PDF_BYTES,
  HARD_MAX_PDF_BYTES,
  assertPdfMetadataWithinLimit,
  formatPdfSizeMb,
  pdfTooLargeError,
  readQuoteIntakeGraphLimits,
  readQuoteIntakeMaxPdfBytes
} from "../quoteIntake/quoteIntakeGraphConfig.mjs";
import { decodeAndValidatePdfBytes } from "../quoteIntake/quoteIntakeGraphNormalize.mjs";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { openEstimateForIntakeCase } from "./intakeOpenEstimateService.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";

function pdfBuffer(sizeBytes) {
  // Keep %PDF magic; pad to exact length.
  const magic = Buffer.from("%PDF-1.4\n");
  if (sizeBytes <= magic.length) return magic.subarray(0, sizeBytes);
  return Buffer.concat([magic, Buffer.alloc(sizeBytes - magic.length, 0x20)]);
}

console.log("\npdfSizeLimit.test.mjs\n");

// Missing env must use 50 MiB default — never clamp to 1024.
{
  const limits = readQuoteIntakeGraphLimits({});
  assert.equal(limits.maxPdfBytes, DEFAULT_MAX_PDF_BYTES);
  assert.equal(limits.maxAttachmentBytes, DEFAULT_MAX_PDF_BYTES);
  assert.equal(readQuoteIntakeMaxPdfBytes({}), DEFAULT_MAX_PDF_BYTES);
  console.log("ok: missing env uses 50 MiB default (not 1024)");
}

// QUOTE_INTAKE_MAX_PDF_BYTES is authoritative; hard ceiling 100 MiB.
{
  assert.equal(readQuoteIntakeMaxPdfBytes({ QUOTE_INTAKE_MAX_PDF_BYTES: "10485760" }), 10 * 1024 * 1024);
  assert.equal(
    readQuoteIntakeMaxPdfBytes({ QUOTE_INTAKE_MAX_PDF_BYTES: String(200 * 1024 * 1024) }),
    HARD_MAX_PDF_BYTES
  );
  assert.equal(
    readQuoteIntakeMaxPdfBytes({
      QUOTE_INTAKE_MAX_PDF_BYTES: "2097152",
      QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES: "1024"
    }),
    2 * 1024 * 1024
  );
  console.log("ok: QUOTE_INTAKE_MAX_PDF_BYTES authoritative with 100 MiB hard ceiling");
}

// Human-readable error.
{
  const err = pdfTooLargeError(532393, 50 * 1024 * 1024);
  assert.equal(err.code, "attachment_too_large");
  assert.match(err.message, /This PDF is 0\.5 MB\. The current limit is 50 MB\./);
  console.log("ok: human-readable too-large message");
}

const LIMIT = 8 * 1024; // small limit for unit tests

// Just below limit succeeds.
{
  const bytes = pdfBuffer(LIMIT - 1);
  const validated = decodeAndValidatePdfBytes(bytes.toString("base64"), { maxBytes: LIMIT });
  assert.equal(validated.sizeBytes, LIMIT - 1);
  assert.match(validated.sha256, /^[a-f0-9]{64}$/);
  console.log("ok: PDF just below limit succeeds");
}

// Exactly at limit succeeds.
{
  const bytes = pdfBuffer(LIMIT);
  const validated = decodeAndValidatePdfBytes(bytes.toString("base64"), { maxBytes: LIMIT });
  assert.equal(validated.sizeBytes, LIMIT);
  console.log("ok: PDF exactly at limit succeeds");
}

// One byte above limit fails.
{
  const bytes = pdfBuffer(LIMIT + 1);
  assert.throws(
    () => decodeAndValidatePdfBytes(bytes.toString("base64"), { maxBytes: LIMIT }),
    (e) => e.code === "attachment_too_large" && e.actualBytes === LIMIT + 1 && e.limitBytes === LIMIT
  );
  console.log("ok: PDF one byte above limit fails");
}

// Metadata over limit fails before byte retrieval.
{
  assert.throws(
    () => assertPdfMetadataWithinLimit(LIMIT + 1, LIMIT),
    (e) => e.code === "attachment_too_large"
  );
  assert.doesNotThrow(() => assertPdfMetadataWithinLimit(LIMIT, LIMIT));
  assert.doesNotThrow(() => assertPdfMetadataWithinLimit(null, LIMIT));
  console.log("ok: metadata over limit fails before byte retrieval");
}

// Fake PDF still fails magic validation (even under limit).
{
  const fake = Buffer.from("not-a-pdf-but-long-enough!!!!!!");
  assert.throws(
    () => decodeAndValidatePdfBytes(fake.toString("base64"), { maxBytes: LIMIT }),
    (e) => e.code === "attachment_unsupported"
  );
  console.log("ok: fake PDF fails magic validation");
}

// Open Estimate: metadata under limit but downloaded bytes over limit → fail.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const underMeta = LIMIT - 100;
  const overBytes = pdfBuffer(LIMIT + 50);
  const created = repo.createCase({
    organizationId: ORG,
    createdByUserId: "u1",
    sourceMessage: {
      graphImmutableMessageId: "msg-size-1",
      contentHash: "hash-size-1"
    },
    attachments: [
      {
        sha256: null,
        mimeType: "application/pdf",
        sizeBytes: underMeta,
        safeFilename: "plan.pdf",
        sourceAttachmentId: "att-1",
        providerMessageId: "msg-size-1",
        support: "direct_pdf",
        kind: "pdf_candidate",
        retrievalState: "pending"
      }
    ]
  });

  await assert.rejects(
    () =>
      openEstimateForIntakeCase({
        repository: repo,
        organizationId: ORG,
        intakeCaseId: created.id,
        actorUserId: "u1",
        body: {},
        env: { QUOTE_INTAKE_MAX_PDF_BYTES: String(LIMIT), QUOTE_INTAKE_GRAPH_ENABLED: "1" },
        repositoryMode: "memory",
        getSupabase: () => ({}),
        fetchAttachmentBytes: async () => overBytes,
        ingestFile: async () => ({ quoteFileId: "file-x" }),
        createWorkspace: async () => ({ takeoffJobId: "job-x" })
      }),
    (e) => e.code === "attachment_too_large" && e.actualBytes === overBytes.length
  );
  console.log("ok: metadata under limit but downloaded bytes over limit fails");
}

// Open Estimate: metadata over limit fails without calling byte fetch.
{
  const repo = new InMemoryQuoteIntakeRepository();
  let fetched = false;
  const created = repo.createCase({
    organizationId: ORG,
    createdByUserId: "u1",
    sourceMessage: {
      graphImmutableMessageId: "msg-size-2",
      contentHash: "hash-size-2"
    },
    attachments: [
      {
        sha256: null,
        mimeType: "application/pdf",
        sizeBytes: LIMIT + 999,
        safeFilename: "huge.pdf",
        sourceAttachmentId: "att-2",
        providerMessageId: "msg-size-2",
        support: "direct_pdf",
        kind: "pdf_candidate",
        retrievalState: "pending"
      }
    ]
  });

  await assert.rejects(
    () =>
      openEstimateForIntakeCase({
        repository: repo,
        organizationId: ORG,
        intakeCaseId: created.id,
        body: {},
        env: { QUOTE_INTAKE_MAX_PDF_BYTES: String(LIMIT) },
        getSupabase: () => ({}),
        fetchAttachmentBytes: async () => {
          fetched = true;
          return pdfBuffer(100);
        },
        ingestFile: async () => ({ quoteFileId: "f" }),
        createWorkspace: async () => ({ takeoffJobId: "j" })
      }),
    (e) => e.code === "attachment_too_large"
  );
  assert.equal(fetched, false);
  console.log("ok: metadata over limit fails before byte retrieval in Open Estimate");
}

// Open Estimate succeeds for PDF at limit.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const bytes = pdfBuffer(LIMIT);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const created = repo.createCase({
    organizationId: ORG,
    createdByUserId: "u1",
    sourceMessage: {
      graphImmutableMessageId: "msg-size-3",
      contentHash: "hash-size-3"
    },
    attachments: [
      {
        sha256: null,
        mimeType: "application/pdf",
        sizeBytes: LIMIT,
        safeFilename: "ok.pdf",
        sourceAttachmentId: "att-3",
        providerMessageId: "msg-size-3",
        support: "direct_pdf",
        kind: "pdf_candidate",
        retrievalState: "pending"
      }
    ]
  });

  const opened = await openEstimateForIntakeCase({
    repository: repo,
    organizationId: ORG,
    intakeCaseId: created.id,
    body: {},
    env: { QUOTE_INTAKE_MAX_PDF_BYTES: String(LIMIT) },
    repositoryMode: "memory",
    getSupabase: () => ({}),
    fetchAttachmentBytes: async () => bytes,
    ingestFile: async ({ sha256 }) => {
      assert.equal(sha256, sha);
      return { quoteFileId: `file-${sha256.slice(0, 8)}` };
    },
    createWorkspace: async () => ({ takeoffJobId: "job-ok" })
  });
  assert.equal(opened.takeoffJobId, "job-ok");
  console.log("ok: PDF at limit opens Takeoff via Open Estimate");
}

assert.equal(formatPdfSizeMb(DEFAULT_MAX_PDF_BYTES), "50");
console.log("\nAll pdfSizeLimit tests passed.\n");
