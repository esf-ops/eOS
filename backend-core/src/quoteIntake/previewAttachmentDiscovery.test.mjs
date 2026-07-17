/**
 * Preview attachment discovery — focused regression tests.
 * Root cause guarded: $select must not include fileAttachment-only fields
 * (contentId) or Graph returns 400 and preview used to collapse that to
 * "Attachments: none".
 *
 * Run: node backend-core/src/quoteIntake/previewAttachmentDiscovery.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createQuoteIntakeGraphClient,
  GRAPH_PREFER_HEADERS
} from "./quoteIntakeGraphClient.mjs";
import { previewQuoteIntakeMailbox } from "./quoteIntakeMailboxService.mjs";
import { InMemoryQuoteIntakeRepository } from "./quoteIntakeRepository.mjs";
import {
  createFakeGraphTransport,
  sampleGraphMessage,
  samplePdfAttachment
} from "./fakeQuoteIntakeGraph.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";

const GRAPH_ENV = {
  QUOTE_INTAKE_API_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_TENANT_ID: "tenant-test",
  QUOTE_INTAKE_GRAPH_CLIENT_ID: "client-test",
  QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "secret-test-value",
  QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@elitestonefabrication.com"
};

console.log("\npreviewAttachmentDiscovery.test.mjs\n");

// $select must use only base attachment props (no contentId).
{
  const src = readFileSync(join(__dirname, "quoteIntakeGraphClient.mjs"), "utf8");
  const selectMatch = src.match(/listAttachmentMetadata[\s\S]*?const select = "([^"]+)"/);
  assert.ok(selectMatch, "listAttachmentMetadata $select not found");
  assert.equal(selectMatch[1], "id,name,contentType,size,isInline");
  assert.equal(
    selectMatch[1].includes("contentId"),
    false,
    "contentId must not appear in attachment $select"
  );
  console.log("ok: attachment $select uses only base attachment properties");
}

// hasAttachments=true + one fileAttachment PDF → preview shows PDF metadata.
{
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: {
      "graph-msg-1": [samplePdfAttachment({ name: "kitchen-plan.pdf" })]
    }
  });
  const preferHeaders = [];
  const fetchImpl = async (url, init) => {
    if (init?.headers?.Prefer) preferHeaders.push(String(init.headers.Prefer));
    return transport.fetchImpl(url, init);
  };
  const client = createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    fetchImpl
  });
  const preview = await previewQuoteIntakeMailbox({
    env: GRAPH_ENV,
    organizationId: ORG,
    repository: new InMemoryQuoteIntakeRepository(),
    graphClient: client,
    body: {}
  });
  assert.equal(preview.messages.length, 1);
  const m = preview.messages[0];
  assert.equal(m.hasAttachments, true);
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].name, "kitchen-plan.pdf");
  assert.equal(m.attachments[0].support, "direct_pdf");
  assert.equal(m.attachments[0].mimeType, "application/pdf");
  assert.equal(m.attachmentDiscovery?.status, "ok");
  assert.equal(m.attachmentDiscovery?.graphAttachmentCount, 1);
  assert.ok(m.attachmentDiscovery?.kinds.includes("pdf_candidate"));
  // Attachment GET must have been called.
  assert.ok(
    transport.requests.some(
      (r) => r.url.includes("/messages/") && r.url.includes("/attachments") && !r.url.includes("contentBytes")
    )
  );
  // ImmutableId Prefer on both message list and attachment list.
  assert.ok(preferHeaders.length >= 2);
  assert.ok(preferHeaders.every((p) => p.includes('IdType="ImmutableId"')));
  assert.equal(GRAPH_PREFER_HEADERS.includes("ImmutableId"), true);
  console.log("ok: hasAttachments=true returns one fileAttachment PDF in preview");
  console.log("ok: ImmutableId Prefer header consistent on message + attachment requests");
}

// @odata.type fileAttachment preserved through list → classify → preview.
{
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: {
      "graph-msg-1": [
        samplePdfAttachment({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "plan.pdf"
        })
      ]
    }
  });
  const client = createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    fetchImpl: transport.fetchImpl
  });
  const preview = await previewQuoteIntakeMailbox({
    env: GRAPH_ENV,
    organizationId: ORG,
    repository: new InMemoryQuoteIntakeRepository(),
    graphClient: client,
    body: {}
  });
  assert.equal(preview.messages[0].attachments[0].kind, "pdf_candidate");
  assert.equal(preview.messages[0].attachments[0].support, "direct_pdf");
  console.log("ok: @odata.type fileAttachment preserved and classified as direct_pdf");
}

// Attachment endpoint 403/404/5xx must NOT become empty "Attachments: none".
{
  async function previewWithAttachmentStatus(status) {
    const base = createFakeGraphTransport({
      messages: [sampleGraphMessage()],
      attachmentsByMessageId: { "graph-msg-1": [samplePdfAttachment()] }
    });
    const fetchImpl = async (url, init) => {
      const u = String(url);
      if (u.includes("/attachments") && !u.match(/\/attachments\/[^/?]+$/)) {
        return {
          ok: false,
          status,
          json: async () => ({}),
          headers: { get: () => null }
        };
      }
      return base.fetchImpl(url, init);
    };
    const client = createQuoteIntakeGraphClient({
      mailbox: "quotes@elitestonefabrication.com",
      credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
      fetchImpl
    });
    return previewQuoteIntakeMailbox({
      env: GRAPH_ENV,
      organizationId: ORG,
      repository: new InMemoryQuoteIntakeRepository(),
      graphClient: client,
      body: {}
    });
  }

  for (const status of [403, 404, 500]) {
    const preview = await previewWithAttachmentStatus(status);
    const m = preview.messages[0];
    assert.equal(m.hasAttachments, true);
    assert.equal(m.attachments.length, 0);
    assert.equal(m.attachmentDiscovery?.status, "failed");
    assert.ok(m.attachmentDiscovery?.code);
    assert.equal(m.eligibilityHint, "attachment_list_failed");
    assert.equal(m.importable, false);
  }
  console.log("ok: attachment 403/404/5xx surfaces failed discovery, not empty list");
}

// Real Graph `value` array parsing (and empty_mismatch when flag true / list empty).
{
  const base = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: { "graph-msg-1": [] }
  });
  const client = createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    fetchImpl: base.fetchImpl
  });
  const preview = await previewQuoteIntakeMailbox({
    env: GRAPH_ENV,
    organizationId: ORG,
    repository: new InMemoryQuoteIntakeRepository(),
    graphClient: client,
    body: {}
  });
  const m = preview.messages[0];
  assert.equal(m.hasAttachments, true);
  assert.equal(m.attachments.length, 0);
  assert.equal(m.attachmentDiscovery?.status, "empty_mismatch");
  assert.equal(m.attachmentDiscovery?.graphAttachmentCount, 0);
  assert.equal(m.eligibilityHint, "attachment_list_empty");
  assert.equal(m.importable, false);
  console.log("ok: Graph value[] empty with hasAttachments=true → empty_mismatch diagnostic");
}

// Invalid contentId $select would 400 — simulate and ensure we don't collapse quietly
// (regression guard for the live failure mode).
{
  const base = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: { "graph-msg-1": [samplePdfAttachment()] }
  });
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.includes("/attachments") && u.includes("contentId")) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "BadRequest",
            message:
              "Could not find a property named 'contentId' on type 'microsoft.graph.attachment'."
          }
        }),
        headers: { get: () => null }
      };
    }
    return base.fetchImpl(url, init);
  };
  // Current client must NOT put contentId in the URL.
  const client = createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    fetchImpl
  });
  const preview = await previewQuoteIntakeMailbox({
    env: GRAPH_ENV,
    organizationId: ORG,
    repository: new InMemoryQuoteIntakeRepository(),
    graphClient: client,
    body: {}
  });
  assert.equal(preview.messages[0].attachments[0]?.name, "plan.pdf");
  assert.equal(
    base.requests.some((r) => r.url.includes("contentId")),
    false
  );
  console.log("ok: live contentId $select regression cannot recur (select omits it)");
}

console.log("\nAll previewAttachmentDiscovery tests passed.\n");
