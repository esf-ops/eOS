import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { htmlToSafeText } from "./htmlToSafeText.mjs";
import { parseAddressList, parseOneAddress } from "./parseAddresses.mjs";
import { buildDedupeKey } from "./dedupe.mjs";
import { parseEmlUpload } from "./emlInboundAdapter.mjs";
import { parseManualPaste } from "./pasteInboundAdapter.mjs";
import { caseFromInboundMessage } from "./caseFromInbound.mjs";
import { inboundEmailAdapter } from "./inboundEmailAdapter.mjs";
import { MemoryLabStore } from "../repository/memoryLabStore.mjs";
import { LocalQuoteIntakeRepository } from "../repository/LocalQuoteIntakeRepository.mjs";
import { getFixtureCases } from "../fixtures/quoteIntakeCases.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EML_DIR = join(__dirname, "../fixtures/eml");

function readEml(name) {
  return new Uint8Array(readFileSync(join(EML_DIR, name)));
}

describe("htmlToSafeText", () => {
  it("strips scripts and tags without executing", () => {
    const text = htmlToSafeText(
      `<html><script>alert(1)</script><p>Hello <b>world</b></p><img src="https://evil.example/x.png">`
    );
    assert.match(text, /Hello/);
    assert.match(text, /world/);
    assert.equal(text.includes("<script"), false);
    assert.equal(text.includes("alert"), false);
  });
});

describe("recipient parsing", () => {
  it("parses name-address lists", () => {
    const list = parseAddressList(`Jordan Blake <jordan.blake@example.com>, estimates@example.com`);
    assert.equal(list.length, 2);
    assert.equal(list[0].email, "jordan.blake@example.com");
    assert.equal(list[0].name, "Jordan Blake");
    assert.equal(list[1].email, "estimates@example.com");
  });

  it("rejects invalid lone addresses", () => {
    assert.equal(parseOneAddress("Not An Email"), null);
  });
});

describe("EML normalization", () => {
  it("parses plain-text email", async () => {
    const msg = await parseEmlUpload({ bytes: readEml("plain-text.eml"), filename: "plain-text.eml" });
    assert.equal(msg.sourceType, "manual_eml");
    assert.equal(msg.messageId, "plain-text-001@example.com");
    assert.equal(msg.from.email, "avery.nguyen@example.com");
    assert.match(msg.textBody, /Maple Court/);
    assert.equal(msg.htmlPresent, false);
    assert.equal(msg.rawSourcePreserved, true);
  });

  it("converts HTML-only unsafe markup to inert text", async () => {
    const msg = await parseEmlUpload({ bytes: readEml("html-only.eml"), filename: "html-only.eml" });
    assert.equal(msg.htmlPresent, true);
    assert.match(msg.textBody, /Elite 100/);
    assert.equal(msg.textBody.includes("<script"), false);
    assert.ok(msg.parserWarnings.some((w) => /HTML-only/i.test(w)));
  });

  it("prefers plain part in multipart/alternative", async () => {
    const msg = await parseEmlUpload({
      bytes: readEml("multipart-alternative.eml"),
      filename: "multipart-alternative.eml"
    });
    assert.match(msg.textBody, /Plain version/);
    assert.equal(msg.to.length, 2);
    assert.equal(msg.cc[0].email, "casey.morgan@example.com");
    assert.equal(msg.replyTo?.email, "riley.chen@example.com");
  });

  it("captures PDF and image attachment metadata + hashes", async () => {
    const pdf = await parseEmlUpload({
      bytes: readEml("with-pdf-attachment.eml"),
      filename: "with-pdf-attachment.eml"
    });
    assert.equal(pdf.attachments.length, 1);
    assert.equal(pdf.attachments[0].filename, "willow-park-plan.pdf");
    assert.match(pdf.attachments[0].contentType, /pdf/i);
    assert.ok(pdf.attachments[0].contentHash.length === 64);
    assert.ok(pdf.attachments[0].bytes.byteLength > 0);

    const img = await parseEmlUpload({
      bytes: readEml("with-image-attachment.eml"),
      filename: "with-image-attachment.eml"
    });
    assert.equal(img.attachments.length, 1);
    assert.equal(img.attachments[0].filename, "kitchen-photo.png");
    assert.match(img.attachments[0].contentType, /png/i);
  });

  it("captures Message-ID, In-Reply-To, References", async () => {
    const msg = await parseEmlUpload({
      bytes: readEml("multi-recipient-headers.eml"),
      filename: "multi-recipient-headers.eml"
    });
    assert.equal(msg.messageId, "multi-rcpt-006@example.com");
    assert.equal(msg.thread.inReplyTo, "plain-text-001@example.com");
    assert.ok(msg.thread.references.includes("plain-text-001@example.com"));
  });

  it("uses content-hash dedupe when Message-ID missing", async () => {
    const msg = await parseEmlUpload({
      bytes: readEml("missing-message-id.eml"),
      filename: "missing-message-id.eml"
    });
    assert.equal(msg.messageId, null);
    assert.equal(msg.dedupeStrategy, "content_hash");
    assert.match(msg.dedupeKey, /^hash:/);
  });

  it("surfaces warnings for malformed headers", async () => {
    const msg = await parseEmlUpload({
      bytes: readEml("malformed-warnings.eml"),
      filename: "malformed-warnings.eml"
    });
    assert.ok(msg.parserWarnings.length >= 1);
    assert.ok(msg.textBody.includes("messy"));
  });

  it("keeps unsafe HTML inert", async () => {
    const msg = await parseEmlUpload({
      bytes: readEml("unsafe-html-inert.eml"),
      filename: "unsafe-html-inert.eml"
    });
    assert.match(msg.textBody, /Safe visible text/);
    assert.equal(/<svg|<object|javascript:/i.test(msg.textBody), false);
  });
});

describe("manual paste normalization", () => {
  it("requires core fields and builds content-hash dedupe", async () => {
    const msg = await parseManualPaste({
      senderName: "Avery Nguyen",
      senderEmail: "avery.nguyen@example.com",
      to: "sales@example.com",
      cc: "",
      subject: "Paste import fixture",
      dateReceived: "2026-07-14T16:00:00.000Z",
      bodyText: "Please quote Elite 100.",
      mailbox: "sales@example.com",
      attachments: []
    });
    assert.equal(msg.sourceType, "manual_paste");
    assert.equal(msg.dedupeStrategy, "content_hash");
    assert.equal(msg.from.email, "avery.nguyen@example.com");
  });
});

describe("dedupe + case creation + local store", () => {
  it("message-id dedupe is deterministic", async () => {
    const a = await parseEmlUpload({ bytes: readEml("plain-text.eml"), filename: "plain-text.eml" });
    const b = await parseEmlUpload({ bytes: readEml("plain-text.eml"), filename: "plain-text.eml" });
    assert.equal(a.dedupeKey, b.dedupeKey);
    const rebuilt = await buildDedupeKey(a);
    assert.equal(rebuilt.dedupeKey, a.dedupeKey);
  });

  it("creates qil_received case with unknown business fields", async () => {
    const msg = await parseEmlUpload({ bytes: readEml("plain-text.eml"), filename: "plain-text.eml" });
    const c = await caseFromInboundMessage(msg);
    assert.equal(c.status, "qil_received");
    assert.equal(c.dataSource, "imported");
    assert.equal(c.requestedColor, null);
    assert.equal(c.resolvedPriceGroup, null);
    assert.equal(c.proposedSquareFootage, null);
    assert.equal(c.sinkCutoutCount, null);
    assert.equal(c.edgeProfile, null);
    assert.equal(c.aiConfidence, null);
    assert.equal(c.customerAccount, "—");
  });

  it("persists import, blocks duplicates, clears imports without fixtures", async () => {
    const store = new MemoryLabStore();
    const repo = new LocalQuoteIntakeRepository({
      store,
      fixtureCases: getFixtureCases(),
      asOfMode: "fixture"
    });

    const fixtureCount = getFixtureCases().length;
    const preview = await repo.previewImport({
      kind: "eml_upload",
      bytes: readEml("plain-text.eml"),
      filename: "plain-text.eml"
    });
    assert.equal(preview.canConfirm, true);
    const first = await repo.confirmImport(preview.message);
    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);

    const secondPreview = await repo.previewImport({
      kind: "eml_upload",
      bytes: readEml("plain-text.eml"),
      filename: "plain-text.eml"
    });
    assert.equal(secondPreview.canConfirm, false);
    assert.equal(secondPreview.duplicateOfCaseId, first.caseId);

    const second = await repo.confirmImport(preview.message);
    assert.equal(second.duplicate, true);
    assert.equal(second.caseId, first.caseId);

    const listed = await repo.listCases();
    assert.equal(listed.length, fixtureCount + 1);
    assert.equal(await repo.countImported(), 1);

    const bytes = await repo.getAttachmentBytes(first.caseId, "nope");
    assert.equal(bytes, null);

    await repo.clearImported();
    assert.equal(await repo.countImported(), 0);
    assert.equal((await repo.listCases()).length, fixtureCount);
    assert.ok((await repo.listCases()).every((c) => c.dataSource === "fixture"));
  });

  it("adapter pollMailbox remains unsupported", async () => {
    await assert.rejects(() => inboundEmailAdapter.pollMailbox(), /not available/);
  });

  it("fixture identities remain synthetic example.com", () => {
    for (const c of getFixtureCases()) {
      assert.match(c.senderEmail, /@example\.com$/i);
    }
  });
});

describe("no network during import units", () => {
  it("parse path does not touch fetch", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network should not be called");
    };
    try {
      await parseEmlUpload({ bytes: readEml("plain-text.eml"), filename: "plain-text.eml" });
      await parseManualPaste({
        senderName: "A",
        senderEmail: "a@example.com",
        to: "sales@example.com",
        cc: "",
        subject: "x",
        dateReceived: "2026-07-14T16:00:00.000Z",
        bodyText: "body",
        mailbox: "sales@example.com",
        attachments: []
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});
