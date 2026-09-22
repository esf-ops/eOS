/**
 * Knowledge Hub lifecycle contract tests (Phase 3+4).
 * Full browser E2E is not wired in this head (no Playwright).
 * These tests lock the Brain-side authorization + OCR/approval gates that the UI depends on.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAdministerKnowledge, RETRIEVABLE_STATUSES } from "./knowledgeConstants.mjs";
import { isRetrievableDocument } from "./knowledgeRepository.mjs";
import { shouldInvokeOcr } from "./ocrProvider.mjs";

describe("knowledge lifecycle contracts (browser E2E substitute)", () => {
  it("admin can administer knowledge; normal slab_ai user cannot", () => {
    assert.equal(canAdministerKnowledge({ role: "admin" }), true);
    assert.equal(canAdministerKnowledge({ role: "executive" }), true);
    assert.equal(canAdministerKnowledge({ role: "sales" }), false);
    assert.equal(canAdministerKnowledge({ role: "viewer" }), false);
  });

  it("uploaded / review_required / OCR-complete-but-unapproved are not retrievable", () => {
    for (const status of ["uploaded", "processing", "review_required", "rejected", "processing_failed"]) {
      assert.equal(
        isRetrievableDocument({ status, is_current: true, is_active: true }),
        false,
        status
      );
    }
    assert.equal(isRetrievableDocument({ status: "approved", is_current: true, is_active: true }), true);
  });

  it("archived approved source disappears from retrieval", () => {
    assert.equal(isRetrievableDocument({ status: "archived", is_current: false, is_active: false }), false);
    assert.ok(!RETRIEVABLE_STATUSES.has("archived"));
  });

  it("OCR path still requires approval after extraction", () => {
    // OCR success → review_required; approval is a separate gate
    const afterOcr = { status: "review_required", is_current: true, is_active: true, extraction_method: "ocr" };
    assert.equal(isRetrievableDocument(afterOcr), false);
    const afterApprove = { status: "approved", is_current: true, is_active: true, extraction_method: "ocr" };
    assert.equal(isRetrievableDocument(afterApprove), true);
  });

  it("digital PDF with adequate text does not require OCR", () => {
    const d = shouldInvokeOcr({ nativeText: "Manufacturer manual text ".repeat(20), pageCount: 5 });
    assert.equal(d.ocr, false);
  });
});
