/**
 * Unit tests for QuoteFilesPanel pure helpers.
 * Run: node app-internal-estimate/src/lib/quoteFilePanelHelpers.test.mjs
 *
 * Tests cover:
 *  1. formatBytes — all size ranges + edge cases
 *  2. roleLabelFor — known role, unknown role
 *  3. validateFileForUpload — valid file, too large, empty name
 *  4. buildBatchSummaryMessage — all outcome cases
 *  5. FILE_ROLES / VISIBILITY_OPTIONS / MAX_FILE_SIZE_BYTES / FILE_ACCEPT constants
 */
import assert from "node:assert/strict";

import {
  MAX_FILE_SIZE_BYTES,
  FILE_ROLES,
  VISIBILITY_OPTIONS,
  FILE_ACCEPT,
  formatBytes,
  roleLabelFor,
  validateFileForUpload,
  buildBatchSummaryMessage,
  mimeTypeToFileTag,
  mimeTypeToCategory,
} from "./quoteFilePanelHelpers.ts";

// ── formatBytes ───────────────────────────────────────────────────────────────

assert.equal(formatBytes(null), "—", "formatBytes: null → —");
assert.equal(formatBytes(undefined), "—", "formatBytes: undefined → —");
assert.equal(formatBytes(-1), "—", "formatBytes: negative → —");
assert.equal(formatBytes(0), "0 B", "formatBytes: 0 → 0 B");
assert.equal(formatBytes(512), "512 B", "formatBytes: < 1 KB → B");
assert.equal(formatBytes(1024), "1.0 KB", "formatBytes: 1024 → 1.0 KB");
assert.equal(formatBytes(1536), "1.5 KB", "formatBytes: 1536 → 1.5 KB");
assert.equal(formatBytes(1024 * 1024), "1.0 MB", "formatBytes: 1 MiB → 1.0 MB");
assert.equal(formatBytes(50 * 1024 * 1024), "50.0 MB", "formatBytes: 50 MB limit displays correctly");

// ── roleLabelFor ──────────────────────────────────────────────────────────────

assert.equal(roleLabelFor("cabinet_plan"), "Cabinet plan", "roleLabelFor: cabinet_plan");
assert.equal(roleLabelFor("measurement_plan"), "Measurement plan", "roleLabelFor: measurement_plan");
assert.equal(roleLabelFor("photo"), "Photo", "roleLabelFor: photo");
assert.equal(roleLabelFor("other"), "Other", "roleLabelFor: other");
assert.equal(roleLabelFor("unknown_role"), "unknown_role", "roleLabelFor: unknown → returns raw value");
assert.equal(roleLabelFor(""), "", "roleLabelFor: empty string → returns empty");

// ── validateFileForUpload ─────────────────────────────────────────────────────

// Valid file — null means no error
assert.equal(
  validateFileForUpload({ name: "cabinet-plan.pdf", size: 1024 * 1024 }),
  null,
  "validateFileForUpload: valid 1 MB file → null"
);
assert.equal(
  validateFileForUpload({ name: "photo.jpg", size: MAX_FILE_SIZE_BYTES }),
  null,
  "validateFileForUpload: exactly 50 MB → null (boundary is inclusive)"
);

// Too large
const tooLargeResult = validateFileForUpload({
  name: "huge.pdf",
  size: MAX_FILE_SIZE_BYTES + 1,
});
assert.ok(tooLargeResult !== null, "validateFileForUpload: over 50 MB → error");
assert.ok(
  /50 MB/i.test(String(tooLargeResult)),
  "validateFileForUpload: error message mentions 50 MB"
);

// Empty name
const emptyNameResult = validateFileForUpload({ name: "", size: 100 });
assert.ok(emptyNameResult !== null, "validateFileForUpload: empty name → error");
assert.ok(
  /name/i.test(String(emptyNameResult)),
  "validateFileForUpload: empty name error mentions 'name'"
);

// ── buildBatchSummaryMessage ──────────────────────────────────────────────────

// Single success
{
  const r = buildBatchSummaryMessage(1, 1, 0);
  assert.equal(r.status, "success", "batch: single success → status success");
  assert.ok(r.msg.toLowerCase().includes("uploaded"), "batch: single success → msg includes 'uploaded'");
}

// Multiple success
{
  const r = buildBatchSummaryMessage(3, 3, 0);
  assert.equal(r.status, "success", "batch: all 3 success → success");
  assert.ok(r.msg.includes("3"), "batch: 3 success → msg includes count");
}

// Single failure
{
  const r = buildBatchSummaryMessage(1, 0, 1);
  assert.equal(r.status, "error", "batch: single failure → error");
  assert.ok(r.msg.toLowerCase().includes("failed"), "batch: single failure → msg includes 'failed'");
}

// All multiple failed
{
  const r = buildBatchSummaryMessage(3, 0, 3);
  assert.equal(r.status, "error", "batch: all 3 failed → error");
  assert.ok(r.msg.includes("3"), "batch: all 3 failed → msg includes count");
}

// Partial success: some fail
{
  const r = buildBatchSummaryMessage(3, 2, 1);
  assert.equal(r.status, "error", "batch: partial failure → error status");
  assert.ok(r.msg.includes("2"), "batch: partial → msg includes success count");
  assert.ok(r.msg.includes("1"), "batch: partial → msg includes fail count");
  assert.ok(r.msg.toLowerCase().includes("failed"), "batch: partial → msg includes 'failed'");
}

// ── Constants ─────────────────────────────────────────────────────────────────

assert.equal(MAX_FILE_SIZE_BYTES, 50 * 1024 * 1024, "MAX_FILE_SIZE_BYTES is exactly 50 MiB");
assert.ok(FILE_ROLES.some((r) => r.value === "cabinet_plan"), "FILE_ROLES includes cabinet_plan");
assert.ok(FILE_ROLES.some((r) => r.value === "other"), "FILE_ROLES includes other");
assert.ok(VISIBILITY_OPTIONS.some((v) => v.value === "internal"), "VISIBILITY_OPTIONS includes internal");
assert.ok(VISIBILITY_OPTIONS.some((v) => v.value === "customer"), "VISIBILITY_OPTIONS includes customer");
assert.ok(FILE_ACCEPT.includes("application/pdf"), "FILE_ACCEPT includes PDF");
assert.ok(FILE_ACCEPT.includes("image/*"), "FILE_ACCEPT includes images");
assert.ok(FILE_ACCEPT.includes(".docx"), "FILE_ACCEPT includes .docx");

// ── mimeTypeToFileTag ─────────────────────────────────────────────────────────

assert.equal(mimeTypeToFileTag("application/pdf"), "PDF", "mimeTypeToFileTag: pdf");
assert.equal(mimeTypeToFileTag("image/jpeg"), "IMG", "mimeTypeToFileTag: jpeg");
assert.equal(mimeTypeToFileTag("image/png"), "IMG", "mimeTypeToFileTag: png");
assert.equal(
  mimeTypeToFileTag("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  "DOC",
  "mimeTypeToFileTag: docx"
);
assert.equal(mimeTypeToFileTag("application/msword"), "DOC", "mimeTypeToFileTag: doc");
assert.equal(mimeTypeToFileTag("text/plain"), "TXT", "mimeTypeToFileTag: txt");
assert.equal(mimeTypeToFileTag(null), "FILE", "mimeTypeToFileTag: null");
assert.equal(mimeTypeToFileTag("application/octet-stream"), "FILE", "mimeTypeToFileTag: unknown");

// ── mimeTypeToCategory ────────────────────────────────────────────────────────

assert.equal(mimeTypeToCategory("application/pdf"), "pdf", "mimeTypeToCategory: pdf");
assert.equal(mimeTypeToCategory("image/webp"), "image", "mimeTypeToCategory: image");
assert.equal(mimeTypeToCategory("application/msword"), "doc", "mimeTypeToCategory: doc");
assert.equal(mimeTypeToCategory("text/plain"), "text", "mimeTypeToCategory: text");
assert.equal(mimeTypeToCategory(null), "other", "mimeTypeToCategory: null");
assert.equal(mimeTypeToCategory("video/mp4"), "other", "mimeTypeToCategory: video → other");

console.log("quoteFilePanelHelpers: all tests passed");
