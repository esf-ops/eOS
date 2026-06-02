/**
 * quoteFileService — unit tests.
 *
 * All tests use mock Supabase clients — no real network/storage calls.
 * Tests cover: validation, path correctness, access control, event payload shape.
 *
 * Run: npm run eos:test:quote-file-service
 */
import assert from "node:assert/strict";
import {
  isUuid,
  validationError,
  quoteSourceToContextType,
  logQuoteFileEvent,
  createQuoteFileUploadIntent,
  createQuoteFileDownloadUrl,
  listQuoteFilesForQuote,
  ALLOWED_FILE_ROLES,
  ALLOWED_VISIBILITIES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  SIGNED_DOWNLOAD_TTL_SECONDS,
} from "./quoteFileService.mjs";
import { QUOTE_FILE_BUCKET } from "./quoteFileStoragePath.mjs";

// ── Test IDs ──────────────────────────────────────────────────────────────────

const ORG_ID    = "89180433-9fab-4024-bec9-a14d870bd0a8";
const QUOTE_ID  = "a1111111-1111-4111-8111-111111111111";
const JOB_ID    = "b2222222-2222-4222-8222-222222222222";
const USER_ID   = "c3333333-3333-4333-8333-333333333333";
const FILE_ID   = "d4444444-4444-4444-8444-444444444444";
const OTHER_ORG = "f5555555-5555-4555-8555-555555555555";

// ── Mock Supabase factory ─────────────────────────────────────────────────────

/**
 * Creates a minimal mock Supabase client.
 * Override individual tables/methods per test as needed.
 */
function makeMockSupabase({
  quoteRow = null,         // { id, organization_id, quote_source }
  takeoffJobRow = null,    // { id, organization_id }
  fileRow = null,          // { id, organization_id, storage_path, status, ... }
  insertError = null,      // error to inject on insert
  capturedEvents = [],     // array to collect logged quote_file_events
  signedUploadUrl = "https://supabase.test/upload?token=abc",
  signedDownloadUrl = "https://supabase.test/download?token=xyz",
  storageError = null,     // error to inject on storage calls
} = {}) {

  // Per-table mock data
  const tableData = {
    quote_headers: quoteRow ? [quoteRow] : [],
    quote_takeoff_jobs: takeoffJobRow ? [takeoffJobRow] : [],
    quote_files: fileRow ? [fileRow] : [],
    quote_file_events: [],
  };

  function makeQueryBuilder(table) {
    let data = tableData[table] ? [...tableData[table]] : [];
    let _limit = data.length;
    let _eqFilters = [];
    let _neqFilters = [];
    let _selectCols = null;

    const builder = {
      select(cols) { _selectCols = cols; return builder; },
      eq(col, val) {
        _eqFilters.push({ col, val: String(val) });
        return builder;
      },
      neq(col, val) {
        _neqFilters.push({ col, val: String(val) });
        return builder;
      },
      order() { return builder; },
      limit(n) { _limit = n; return builder; },
      // Resolve the query
      then(resolve) {
        let filtered = data.filter((row) =>
          _eqFilters.every(({ col, val }) => String(row[col] ?? "") === val) &&
          _neqFilters.every(({ col, val }) => String(row[col] ?? "") !== val)
        );
        filtered = filtered.slice(0, _limit);
        return resolve({ data: filtered, error: null });
      },
    };
    return builder;
  }

  const supabase = {
    from(table) {
      return {
        select(cols) {
          return makeQueryBuilder(table).select(cols);
        },
        insert(row) {
          if (table === "quote_file_events") {
            capturedEvents.push({ ...(Array.isArray(row) ? row[0] : row) });
            return Promise.resolve({ error: null });
          }
          if (table === "quote_files") {
            if (insertError) return Promise.resolve({ error: insertError });
            tableData.quote_files.push(Array.isArray(row) ? row[0] : row);
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null });
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          createSignedUploadUrl(path) {
            if (storageError) return Promise.resolve({ data: null, error: storageError });
            return Promise.resolve({
              data: { signedUrl: signedUploadUrl, token: "tok", path },
              error: null,
            });
          },
          createSignedUrl(path, ttl) {
            if (storageError) return Promise.resolve({ data: null, error: storageError });
            return Promise.resolve({ data: { signedUrl: signedDownloadUrl }, error: null });
          },
        };
      },
    },
  };

  return { supabase, capturedEvents };
}

// ── isUuid ────────────────────────────────────────────────────────────────────

{
  assert.ok(isUuid(ORG_ID), "valid uuid accepted");
  assert.ok(!isUuid("not-a-uuid"), "non-uuid rejected");
  assert.ok(!isUuid(""), "empty rejected");
  assert.ok(!isUuid(null), "null rejected");
  console.log("ok: isUuid");
}

// ── validationError ───────────────────────────────────────────────────────────

{
  const e = validationError("bad input", 422);
  assert.equal(e.message, "bad input");
  assert.equal(e.statusCode, 422);
  assert.equal(e.isValidationError, true);
  console.log("ok: validationError");
}

// ── quoteSourceToContextType ──────────────────────────────────────────────────

{
  assert.equal(quoteSourceToContextType("internal_quote"),   "internal-quotes");
  assert.equal(quoteSourceToContextType("partner_quote"),    "partner-quotes");
  assert.equal(quoteSourceToContextType("public_consumer"),  "quotes");
  assert.equal(quoteSourceToContextType(null),               "quotes");
  assert.equal(quoteSourceToContextType(""),                 "quotes");
  console.log("ok: quoteSourceToContextType");
}

// ── Constants ─────────────────────────────────────────────────────────────────

{
  assert.equal(QUOTE_FILE_BUCKET, "eliteos-quote-files", "bucket constant matches path helper and is correct");
  assert.ok(MAX_FILE_SIZE_BYTES === 50 * 1024 * 1024, "50MB limit");
  assert.ok(SIGNED_DOWNLOAD_TTL_SECONDS === 3600, "1hr download TTL");
  assert.ok(ALLOWED_FILE_ROLES.has("cabinet_plan"), "cabinet_plan allowed");
  assert.ok(ALLOWED_FILE_ROLES.has("other"), "other allowed");
  assert.ok(!ALLOWED_FILE_ROLES.has("virus.exe"), "invalid role rejected");
  assert.ok(ALLOWED_VISIBILITIES.has("internal"), "internal visibility allowed");
  assert.ok(!ALLOWED_VISIBILITIES.has("public"), "public visibility not allowed");
  assert.ok(ALLOWED_MIME_TYPES.has("application/pdf"), "pdf allowed");
  assert.ok(!ALLOWED_MIME_TYPES.has("application/x-executable"), "exe not allowed");
  console.log("ok: constants");
}

// ── logQuoteFileEvent ─────────────────────────────────────────────────────────

{
  const events = [];
  const { supabase } = makeMockSupabase({ capturedEvents: events });

  await logQuoteFileEvent({
    supabase,
    organizationId: ORG_ID,
    quoteFileId: FILE_ID,
    actorUserId: USER_ID,
    action: "downloaded",
    metadata: { file_role: "cabinet_plan" },
  });

  assert.equal(events.length, 1, "one event captured");
  assert.equal(events[0].organization_id, ORG_ID);
  assert.equal(events[0].quote_file_id, FILE_ID);
  assert.equal(events[0].actor_user_id, USER_ID);
  assert.equal(events[0].action, "downloaded");
  assert.deepEqual(events[0].metadata, { file_role: "cabinet_plan" });
  assert.ok(typeof events[0].created_at === "string", "has created_at");
  console.log("ok: logQuoteFileEvent payload shape");
}

// ── createQuoteFileUploadIntent — validation rejections ──────────────────────

{
  const { supabase } = makeMockSupabase();

  // Missing organizationId
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: "", originalFilename: "x.pdf", fileRole: "other" }),
    /organizationId must be a valid UUID/,
    "empty organizationId rejected"
  );

  // Invalid organizationId (not a UUID)
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: "not-uuid", originalFilename: "x.pdf", fileRole: "other" }),
    /organizationId must be a valid UUID/,
    "non-UUID organizationId rejected"
  );

  // Missing filename
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: ORG_ID, originalFilename: "", fileRole: "other" }),
    /originalFilename is required/,
    "empty filename rejected"
  );

  // Unsupported fileRole
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: ORG_ID, originalFilename: "x.pdf", fileRole: "virus" }),
    /fileRole 'virus' is not allowed/,
    "invalid fileRole rejected"
  );

  // Unsupported visibility
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: ORG_ID, originalFilename: "x.pdf", fileRole: "other", visibility: "public" }),
    /visibility 'public' is not allowed/,
    "invalid visibility rejected"
  );

  // Unsupported MIME type
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: ORG_ID, originalFilename: "x.exe", fileRole: "other", mimeType: "application/x-executable" }),
    /not accepted/,
    "invalid mimeType rejected"
  );

  // File too large
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: ORG_ID, originalFilename: "x.pdf", fileRole: "other", fileSizeBytes: MAX_FILE_SIZE_BYTES + 1 }),
    /File too large/,
    "oversized file rejected"
  );

  // Invalid quoteId format
  await assert.rejects(
    () => createQuoteFileUploadIntent({ supabase, organizationId: ORG_ID, originalFilename: "x.pdf", fileRole: "other", quoteId: "bad-id" }),
    /quoteId must be a valid UUID/,
    "non-UUID quoteId rejected"
  );

  console.log("ok: createQuoteFileUploadIntent validation rejections");
}

// ── createQuoteFileUploadIntent — quote org mismatch ─────────────────────────

{
  const { supabase } = makeMockSupabase({
    quoteRow: { id: QUOTE_ID, organization_id: OTHER_ORG, quote_source: "internal_quote" },
  });

  await assert.rejects(
    () => createQuoteFileUploadIntent({
      supabase,
      organizationId: ORG_ID,
      originalFilename: "plan.pdf",
      fileRole: "cabinet_plan",
      quoteId: QUOTE_ID,
    }),
    /does not belong to this organization/,
    "quote org mismatch → 403"
  );

  console.log("ok: createQuoteFileUploadIntent — quote org mismatch rejected");
}

// ── createQuoteFileUploadIntent — success + path shape ───────────────────────

{
  const events = [];
  const { supabase } = makeMockSupabase({
    quoteRow: { id: QUOTE_ID, organization_id: ORG_ID, quote_source: "internal_quote" },
    capturedEvents: events,
  });

  const result = await createQuoteFileUploadIntent({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    originalFilename: "kitchen plan.pdf",
    fileRole: "cabinet_plan",
    quoteId: QUOTE_ID,
    visibility: "internal",
  });

  assert.ok(isUuid(result.quoteFileId), "returned quoteFileId is a UUID");
  assert.ok(result.storagePath.startsWith(`org/${ORG_ID}/internal-quotes/${QUOTE_ID}/files/`), "path has correct prefix");
  assert.ok(result.storagePath.endsWith("kitchen_plan.pdf"), "path has sanitized filename");
  assert.ok(result.storagePath.includes(`/files/${result.quoteFileId}/`), "path includes quoteFileId");
  assert.ok(typeof result.signedUploadUrl === "string" && result.signedUploadUrl.length > 0, "signedUploadUrl returned");
  assert.ok(result.expiresAt, "expiresAt returned");

  // Event logged
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "uploaded");
  assert.equal(events[0].organization_id, ORG_ID);

  console.log("ok: createQuoteFileUploadIntent — success + path shape + event logged");
}

// ── createQuoteFileUploadIntent — unlinked (no quoteId, no jobId) ─────────────

{
  const { supabase } = makeMockSupabase();

  const result = await createQuoteFileUploadIntent({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    originalFilename: "spec73.pdf",
    fileRole: "measurement_plan",
  });

  assert.ok(result.storagePath.startsWith(`org/${ORG_ID}/unlinked/files/`), "unlinked path correct");
  console.log("ok: createQuoteFileUploadIntent — unlinked path");
}

// ── createQuoteFileUploadIntent — takeoff-jobs path ──────────────────────────

{
  const { supabase } = makeMockSupabase({
    takeoffJobRow: { id: JOB_ID, organization_id: ORG_ID },
  });

  const result = await createQuoteFileUploadIntent({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    originalFilename: "spec73.pdf",
    fileRole: "measurement_plan",
    takeoffJobId: JOB_ID,
  });

  assert.ok(result.storagePath.startsWith(`org/${ORG_ID}/takeoff-jobs/${JOB_ID}/files/`), "takeoff-jobs path correct");
  console.log("ok: createQuoteFileUploadIntent — takeoff-jobs path");
}

// ── createQuoteFileUploadIntent — private bucket ──────────────────────────────

{
  const { supabase } = makeMockSupabase();

  const result = await createQuoteFileUploadIntent({
    supabase,
    organizationId: ORG_ID,
    originalFilename: "plan.pdf",
    fileRole: "other",
  });

  assert.ok(result.storagePath.startsWith("org/"), "path scoped under org/");
  // The bucket constant is always used (no client-provided bucket)
  assert.equal(QUOTE_FILE_BUCKET, "eliteos-quote-files", "private bucket name correct");
  console.log("ok: createQuoteFileUploadIntent — uses private bucket constant");
}

// ── createQuoteFileDownloadUrl — rejects deleted file ─────────────────────────

{
  const { supabase } = makeMockSupabase({
    fileRow: {
      id: FILE_ID,
      organization_id: ORG_ID,
      storage_bucket: QUOTE_FILE_BUCKET,
      storage_path: `org/${ORG_ID}/unlinked/files/${FILE_ID}/plan.pdf`,
      original_filename: "plan.pdf",
      status: "deleted",
      file_role: "cabinet_plan",
      visibility: "internal",
      mime_type: "application/pdf",
      file_size_bytes: 1000,
    },
  });

  await assert.rejects(
    () => createQuoteFileDownloadUrl({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /deleted/,
    "deleted file → 410"
  );

  console.log("ok: createQuoteFileDownloadUrl — rejects deleted file");
}

// ── createQuoteFileDownloadUrl — rejects archived file ────────────────────────

{
  const { supabase } = makeMockSupabase({
    fileRow: {
      id: FILE_ID,
      organization_id: ORG_ID,
      storage_bucket: QUOTE_FILE_BUCKET,
      storage_path: `org/${ORG_ID}/unlinked/files/${FILE_ID}/plan.pdf`,
      original_filename: "plan.pdf",
      status: "archived",
      file_role: "cabinet_plan",
      visibility: "internal",
      mime_type: "application/pdf",
      file_size_bytes: 1000,
    },
  });

  await assert.rejects(
    () => createQuoteFileDownloadUrl({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /archived/,
    "archived file → 410"
  );

  console.log("ok: createQuoteFileDownloadUrl — rejects archived file");
}

// ── createQuoteFileDownloadUrl — rejects org mismatch ─────────────────────────

{
  const { supabase } = makeMockSupabase({
    fileRow: {
      id: FILE_ID,
      organization_id: OTHER_ORG,   // different org
      storage_bucket: QUOTE_FILE_BUCKET,
      storage_path: `org/${OTHER_ORG}/unlinked/files/${FILE_ID}/plan.pdf`,
      original_filename: "plan.pdf",
      status: "active",
      file_role: "cabinet_plan",
      visibility: "internal",
    },
  });

  await assert.rejects(
    () => createQuoteFileDownloadUrl({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /does not belong/,
    "cross-org download rejected"
  );

  console.log("ok: createQuoteFileDownloadUrl — org mismatch rejected");
}

// ── createQuoteFileDownloadUrl — success + event logged ───────────────────────

{
  const events = [];
  const { supabase } = makeMockSupabase({
    fileRow: {
      id: FILE_ID,
      organization_id: ORG_ID,
      storage_bucket: QUOTE_FILE_BUCKET,
      storage_path: `org/${ORG_ID}/internal-quotes/${QUOTE_ID}/files/${FILE_ID}/plan.pdf`,
      original_filename: "kitchen plan.pdf",
      status: "active",
      file_role: "cabinet_plan",
      visibility: "internal",
      mime_type: "application/pdf",
      file_size_bytes: 204800,
      quote_id: QUOTE_ID,
      takeoff_job_id: null,
    },
    capturedEvents: events,
    signedDownloadUrl: "https://supabase.test/object/sign/eliteos-quote-files/org/...",
  });

  const result = await createQuoteFileDownloadUrl({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    quoteFileId: FILE_ID,
  });

  assert.ok(result.signedUrl.startsWith("https://"), "signedUrl returned");
  assert.ok(result.expiresAt, "expiresAt returned");
  assert.equal(result.filename, "kitchen plan.pdf");
  assert.equal(result.mimeType, "application/pdf");
  assert.equal(result.fileRole, "cabinet_plan");
  assert.ok(!("storagePath" in result), "storage_path NOT in download result");
  assert.ok(!("storage_path" in result), "storage_path NOT in download result");

  assert.equal(events.length, 1, "downloaded event logged");
  assert.equal(events[0].action, "downloaded");

  console.log("ok: createQuoteFileDownloadUrl — success, event logged, storage_path not returned");
}

// ── listQuoteFilesForQuote — validation ───────────────────────────────────────

{
  const { supabase } = makeMockSupabase({ quoteRow: { id: QUOTE_ID, organization_id: ORG_ID } });

  await assert.rejects(
    () => listQuoteFilesForQuote({ supabase, organizationId: "", quoteId: QUOTE_ID }),
    /organizationId must be a valid UUID/,
    "missing org rejected"
  );

  await assert.rejects(
    () => listQuoteFilesForQuote({ supabase, organizationId: ORG_ID, quoteId: "bad-id" }),
    /quoteId must be a valid UUID/,
    "invalid quoteId rejected"
  );

  console.log("ok: listQuoteFilesForQuote — validation rejections");
}

// ── listQuoteFilesForQuote — storage_path not exposed ─────────────────────────

{
  const { supabase } = makeMockSupabase({
    quoteRow: { id: QUOTE_ID, organization_id: ORG_ID, quote_source: "internal_quote" },
  });

  // Add mock file to the table (storage_path is in the row but should not appear in output)
  supabase._mockFiles = [
    {
      id: FILE_ID,
      organization_id: ORG_ID,
      quote_id: QUOTE_ID,
      original_filename: "plan.pdf",
      safe_filename: "plan.pdf",
      file_role: "cabinet_plan",
      visibility: "internal",
      mime_type: "application/pdf",
      file_size_bytes: 1000,
      status: "active",
      takeoff_job_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      storage_path: "SHOULD_NOT_APPEAR",  // must not leak
    },
  ];

  // Override the from() to return the mock file for quote_files
  const origFrom = supabase.from.bind(supabase);
  supabase.from = function (table) {
    if (table === "quote_files") {
      return {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        order() { return this; },
        limit() { return this; },
        then(resolve) {
          return resolve({ data: supabase._mockFiles, error: null });
        },
      };
    }
    return origFrom(table);
  };

  const result = await listQuoteFilesForQuote({
    supabase,
    organizationId: ORG_ID,
    quoteId: QUOTE_ID,
  });

  assert.ok(Array.isArray(result.files), "files is array");
  assert.equal(result.files.length, 1, "one file returned");
  const f = result.files[0];
  assert.ok(!("storagePath" in f), "storagePath not in list response");
  assert.ok(!("storage_path" in f), "storage_path not in list response");
  assert.equal(f.id, FILE_ID);
  assert.equal(f.originalFilename, "plan.pdf");
  assert.equal(f.fileRole, "cabinet_plan");

  console.log("ok: listQuoteFilesForQuote — storage_path not exposed in list response");
}

console.log("\nquoteFileService: all tests passed");
