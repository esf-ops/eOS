/**
 * takeoffBetaService — unit tests (v6.4).
 *
 * Run: npm run eos:test:takeoff-beta
 */
import assert from "node:assert/strict";
import {
  TAKEOFF_BETA_LABEL,
  TAKEOFF_BETA_IMPORT_CONFIRMATION_TEXT,
  assertBetaImportConfirmed,
  computeTakeoffBetaDurations,
  formatTakeoffBetaQaRow,
  normalizeTakeoffBetaBlock,
} from "./takeoffBetaService.mjs";

console.log("\ntakeoffBetaService — tests\n");

// T1 — beta import confirmation required
{
  assert.throws(() => assertBetaImportConfirmed({}), /confirmation required/i);
  assert.throws(() => assertBetaImportConfirmed({ betaImportConfirmed: false }), /confirmation required/i);
  assert.doesNotThrow(() => assertBetaImportConfirmed({ betaImportConfirmed: true }));
  assert.doesNotThrow(() => assertBetaImportConfirmed({ beta_import_confirmed: true }));
  console.log("ok: T1 beta confirmation required before import");
}

// T2 — feedback/issue storage shape (normalize block)
{
  const block = normalizeTakeoffBetaBlock({
    takeoff_beta: {
      feedback: [{ quoteId: "q1", sourceTakeoffJobId: "j1", helpful: true }],
      issueReports: [{ category: "wrong_dimension", note: "bad run" }],
    },
  });
  assert.equal(block.feedback.length, 1);
  assert.equal(block.feedback[0].quoteId, "q1");
  assert.equal(block.issueReports[0].category, "wrong_dimension");
  console.log("ok: T2 feedback and issue report blocks normalize");
}

// T3 — durations calculated when timestamps exist
{
  const durations = computeTakeoffBetaDurations({
    workspaceCreatedAt: "2026-06-01T10:00:00.000Z",
    draftGeneratedAt: "2026-06-01T10:05:00.000Z",
    approvedAt: "2026-06-01T10:20:00.000Z",
    importConfirmedAt: "2026-06-01T10:25:00.000Z",
    quoteSavedAt: "2026-06-01T11:00:00.000Z",
  });
  assert.equal(durations.uploadToDraftGeneratedMs, 5 * 60 * 1000);
  assert.equal(durations.draftGeneratedToApprovalMs, 15 * 60 * 1000);
  assert.equal(durations.approvalToImportMs, 5 * 60 * 1000);
  assert.equal(durations.importToQuoteSaveMs, 35 * 60 * 1000);
  console.log("ok: T3 durations calculated from timestamps");
}

// T4 — QA row formatting with deltas
{
  const row = formatTakeoffBetaQaRow({
    quoteId: "q-abc",
    takeoffJobId: "job-abc",
    estimator: "est@example.com",
    importedTotals: { countertopSqft: 50, standardBacksplashSqft: 10 },
    currentTotals: { countertopSqft: 52.5, standardBacksplashSqft: 9 },
    feedbackCount: 1,
    issueCount: 2,
  });
  assert.equal(row.deltaCountertopSf, 2.5);
  assert.equal(row.deltaBacksplashSf, -1);
  assert.equal(row.feedbackStatus, "submitted");
  assert.equal(row.issueCount, 2);
  console.log("ok: T4 beta QA panel row formatting");
}

// T5 — beta label copy present
{
  assert.match(TAKEOFF_BETA_LABEL, /beta/i);
  assert.match(TAKEOFF_BETA_LABEL, /verification required/i);
  assert.match(TAKEOFF_BETA_IMPORT_CONFIRMATION_TEXT, /Internal Estimate draft/i);
  console.log("ok: T5 beta label and confirmation copy");
}

// T6 — unapproved import gate unchanged (approval is enforced elsewhere; confirmation is additive)
{
  try {
    assertBetaImportConfirmed({ betaImportConfirmed: true });
  } catch {
    assert.fail("approved path with confirmation should not throw");
  }
  console.log("ok: T6 beta confirmation is additive gate only");
}

console.log("\nAll takeoffBetaService tests passed.\n");
