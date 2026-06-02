/**
 * quoteFileStoragePath — unit tests.
 *
 * Pure functions; no I/O, no Supabase, no network.
 * Run: npm run eos:test:quote-file-storage
 */
import assert from "node:assert/strict";
import { buildQuoteFileStoragePath, sanitizeStorageFilename, QUOTE_FILE_BUCKET } from "./quoteFileStoragePath.mjs";

const ORG_ID    = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID   = "f1230000-0000-0000-0000-000000000001";
const QUOTE_ID  = "a0000000-0000-0000-0000-000000000002";
const JOB_ID    = "b0000000-0000-0000-0000-000000000003";

// ── sanitizeStorageFilename ──────────────────────────────────────────────────

{
  // Basic passthrough
  assert.equal(sanitizeStorageFilename("kitchen_plan.pdf"), "kitchen_plan.pdf", "passthrough ok");

  // Spaces → underscore
  assert.equal(sanitizeStorageFilename("kitchen plan.pdf"), "kitchen_plan.pdf", "spaces → _");

  // Multiple spaces collapsed
  assert.equal(sanitizeStorageFilename("spec  73  plan.pdf"), "spec_73_plan.pdf", "multi-space");

  // Special chars
  assert.equal(sanitizeStorageFilename("plan (v2) final!.pdf"), "plan_v2_final.pdf", "special chars");

  // Path traversal — strips directory components
  assert.equal(sanitizeStorageFilename("../../etc/passwd"), "passwd", "path traversal 1");
  assert.equal(sanitizeStorageFilename("foo/bar/baz.pdf"), "baz.pdf", "path traversal 2");
  assert.equal(sanitizeStorageFilename("foo\\bar.pdf"), "bar.pdf", "path traversal backslash");

  // Leading/trailing dots and dashes
  assert.equal(sanitizeStorageFilename("...plan.pdf"), "plan.pdf", "leading dots");
  assert.equal(sanitizeStorageFilename("plan.pdf..."), "plan.pdf", "trailing dots");

  // Unicode/non-ASCII → underscore
  const uResult = sanitizeStorageFilename("küchenplan.pdf");
  assert.match(uResult, /^[a-zA-Z0-9._-]+$/, "unicode sanitized");

  // Max length enforcement
  const longName = "a".repeat(250) + ".pdf";
  const truncated = sanitizeStorageFilename(longName);
  assert.ok(truncated.length <= 200, `max length: got ${truncated.length}`);
  assert.ok(truncated.endsWith(".pdf"), "extension preserved after truncation");

  // Empty / whitespace → throws
  assert.throws(() => sanitizeStorageFilename(""),    /non-empty string/, "empty throws");
  assert.throws(() => sanitizeStorageFilename("   "), /non-empty string/, "whitespace throws");
  assert.throws(() => sanitizeStorageFilename(null),  /non-empty string/, "null throws");

  console.log("ok: sanitizeStorageFilename tests");
}

// ── buildQuoteFileStoragePath — bucket constant ──────────────────────────────

{
  assert.equal(QUOTE_FILE_BUCKET, "eliteos-quote-files", "bucket name constant");
  console.log("ok: QUOTE_FILE_BUCKET constant");
}

// ── buildQuoteFileStoragePath — internal quote path ─────────────────────────

{
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "kitchen plan.pdf",
    quoteId:        QUOTE_ID,
    contextType:    "internal-quotes",
  });

  assert.equal(result.bucket, QUOTE_FILE_BUCKET, "internal-quotes: bucket");
  assert.equal(
    result.path,
    `org/${ORG_ID}/internal-quotes/${QUOTE_ID}/files/${FILE_ID}/kitchen_plan.pdf`,
    "internal-quotes: path"
  );
  assert.equal(result.safeFilename, "kitchen_plan.pdf", "internal-quotes: safeFilename");
  console.log("ok: internal-quotes path");
}

// ── buildQuoteFileStoragePath — generic quote path (no contextType given) ───

{
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "signed approval.pdf",
    quoteId:        QUOTE_ID,
    // no contextType → defaults to "quotes"
  });

  assert.equal(
    result.path,
    `org/${ORG_ID}/quotes/${QUOTE_ID}/files/${FILE_ID}/signed_approval.pdf`,
    "default quote path"
  );
  console.log("ok: default quotes path (quoteId provided, no contextType)");
}

// ── buildQuoteFileStoragePath — partner quote path ───────────────────────────

{
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "cabinet-drawing.pdf",
    quoteId:        QUOTE_ID,
    contextType:    "partner-quotes",
  });

  assert.equal(
    result.path,
    `org/${ORG_ID}/partner-quotes/${QUOTE_ID}/files/${FILE_ID}/cabinet-drawing.pdf`,
    "partner-quotes: path"
  );
  console.log("ok: partner-quotes path");
}

// ── buildQuoteFileStoragePath — takeoff job path (pre-quote) ─────────────────

{
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "spec73.pdf",
    takeoffJobId:   JOB_ID,
    // no quoteId — pre-quote upload
  });

  assert.equal(
    result.path,
    `org/${ORG_ID}/takeoff-jobs/${JOB_ID}/files/${FILE_ID}/spec73.pdf`,
    "takeoff-jobs: path"
  );
  console.log("ok: takeoff-jobs path (pre-quote)");
}

// ── buildQuoteFileStoragePath — unlinked path ────────────────────────────────

{
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "mystery.jpg",
    // no quoteId, no takeoffJobId → unlinked
  });

  assert.equal(
    result.path,
    `org/${ORG_ID}/unlinked/files/${FILE_ID}/mystery.jpg`,
    "unlinked: path"
  );
  console.log("ok: unlinked path");
}

// ── buildQuoteFileStoragePath — filename sanitization in path ────────────────

{
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "../../evil/../plan (v2) FINAL!.PDF",
    contextType:    "unlinked",
  });

  assert.ok(!result.path.includes(".."), "no path traversal in built path");
  assert.ok(!result.safeFilename.includes(".."), "no path traversal in safeFilename");
  assert.ok(/^[a-zA-Z0-9._/-]+$/.test(result.path), "path is safe characters only");
  console.log("ok: path traversal guard in buildQuoteFileStoragePath");
}

// ── buildQuoteFileStoragePath — validation: missing required fields ───────────

{
  assert.throws(
    () => buildQuoteFileStoragePath({ quoteFileId: FILE_ID, filename: "x.pdf", organizationId: "" }),
    /organizationId is required/,
    "empty organizationId throws"
  );

  assert.throws(
    () => buildQuoteFileStoragePath({ organizationId: ORG_ID, filename: "x.pdf", quoteFileId: "" }),
    /quoteFileId is required/,
    "empty quoteFileId throws"
  );

  assert.throws(
    () => buildQuoteFileStoragePath({ organizationId: ORG_ID, quoteFileId: FILE_ID, filename: "" }),
    /filename is required/,
    "empty filename throws"
  );

  assert.throws(
    () => buildQuoteFileStoragePath({ organizationId: ORG_ID, quoteFileId: FILE_ID, filename: "x.pdf", contextType: "invalid-context" }),
    /invalid contextType/,
    "invalid contextType throws"
  );

  assert.throws(
    () => buildQuoteFileStoragePath({ organizationId: ORG_ID, quoteFileId: FILE_ID, filename: "x.pdf", contextType: "takeoff-jobs" }),
    /takeoffJobId is required/,
    "takeoff-jobs without takeoffJobId throws"
  );

  assert.throws(
    () => buildQuoteFileStoragePath({ organizationId: ORG_ID, quoteFileId: FILE_ID, filename: "x.pdf", contextType: "internal-quotes" }),
    /quoteId is required/,
    "internal-quotes without quoteId throws"
  );

  assert.throws(
    () => buildQuoteFileStoragePath({ organizationId: ORG_ID, quoteFileId: FILE_ID, filename: "x.pdf", contextType: "partner-quotes" }),
    /quoteId is required/,
    "partner-quotes without quoteId throws"
  );

  console.log("ok: validation — missing required fields");
}

// ── buildQuoteFileStoragePath — explicit contextType overrides derivation ─────

{
  // If quoteId is provided but contextType is 'takeoff-jobs', takeoffJobId is required.
  assert.throws(
    () => buildQuoteFileStoragePath({
      organizationId: ORG_ID,
      quoteFileId:    FILE_ID,
      filename:       "x.pdf",
      quoteId:        QUOTE_ID,
      contextType:    "takeoff-jobs",
      // takeoffJobId missing
    }),
    /takeoffJobId is required/,
    "explicit takeoff-jobs without takeoffJobId throws even if quoteId present"
  );

  // takeoffJobId provided + quoteId provided → contextType 'takeoff-jobs' uses takeoffJobId
  const result = buildQuoteFileStoragePath({
    organizationId: ORG_ID,
    quoteFileId:    FILE_ID,
    filename:       "plan.pdf",
    quoteId:        QUOTE_ID,
    takeoffJobId:   JOB_ID,
    contextType:    "takeoff-jobs",
  });
  assert.ok(result.path.includes(`takeoff-jobs/${JOB_ID}`), "takeoff-jobs uses jobId");
  console.log("ok: explicit contextType override");
}

console.log("\nquoteFileStoragePath: all tests passed");
