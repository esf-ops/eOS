/**
 * Part 1 — real mailbox PDF → Open Estimate handoff.
 *
 * Exercises the full in-process path: mailbox import (metadata-only classification,
 * no eager byte fetch) → Open Estimate (server-side byte retrieval via stored
 * provider identifiers → PDF magic validation → SHA-256 → ingest → Takeoff).
 *
 * Run: node backend-core/src/takeoff/openEstimatePart1.test.mjs
 */
import assert from "node:assert/strict";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntake/quoteIntakeGraphClient.mjs";
import { importQuoteIntakeMailboxMessages } from "../quoteIntake/quoteIntakeMailboxService.mjs";
import {
  createFakeGraphTransport,
  sampleGraphMessage,
  sampleInlineImage,
  sampleItemAttachment,
  samplePdfAttachment
} from "../quoteIntake/fakeQuoteIntakeGraph.mjs";
import {
  openEstimateForIntakeCase,
  rejectCallerOpenEstimateHints,
  selectSupportedPdfAttachment
} from "./intakeOpenEstimateService.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER = "user-pilot-1";

const GRAPH_ENV = {
  QUOTE_INTAKE_API_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_TENANT_ID: "tenant-test",
  QUOTE_INTAKE_GRAPH_CLIENT_ID: "client-test",
  QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "secret-test-value",
  QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@elitestonefabrication.com"
};

function graphClientFor(transport) {
  return createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    fetchImpl: transport.fetchImpl
  });
}

function openDeps(repo, caseId, graphClient, extra = {}) {
  const jobs = new Map();
  return {
    repository: repo,
    organizationId: ORG,
    intakeCaseId: caseId,
    actorUserId: USER,
    body: {},
    env: GRAPH_ENV,
    repositoryMode: "memory",
    getSupabase: () => ({ from: () => ({}) }),
    graphClient,
    ingestFile: async ({ sha256 }) => ({ quoteFileId: `file-${sha256.slice(0, 12)}`, reused: false }),
    createWorkspace: async ({ quoteFileId }) => {
      const existing = jobs.get(quoteFileId);
      if (existing) return { takeoffJobId: existing };
      const id = `job-${jobs.size + 1}`;
      jobs.set(quoteFileId, id);
      return { takeoffJobId: id };
    },
    ...extra
  };
}

async function importOne(repo, transport, messageId = "graph-msg-1") {
  const client = graphClientFor(transport);
  const imported = await importQuoteIntakeMailboxMessages({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient: client,
    body: { confirm: true, messageIds: [messageId] }
  });
  return imported.results[0];
}

console.log("\nopenEstimatePart1.test.mjs\n");

// 1. Normal Graph fileAttachment PDF imports as a supported attachment (metadata only).
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: { "graph-msg-1": [samplePdfAttachment()] }
  });
  const result = await importOne(repo, transport);
  assert.equal(result.status, "created");
  const row = repo.getCase(ORG, result.caseId);
  assert.equal(row.attachments.length, 1);
  assert.equal(row.attachments[0].support, "direct_pdf");
  assert.equal(row.attachments[0].sha256, null); // no bytes fetched at import
  assert.equal(row.attachments[0].retrievalState, "pending");
  console.log("ok: normal fileAttachment PDF imports as supported metadata-only record");
}

// 2. octet-stream MIME + .pdf filename accepted only after magic validation at open.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: {
      "graph-msg-1": [
        samplePdfAttachment({ contentType: "application/octet-stream", name: "plan.pdf" })
      ]
    }
  });
  const result = await importOne(repo, transport);
  const row = repo.getCase(ORG, result.caseId);
  assert.equal(row.attachments[0].support, "direct_pdf"); // filename hint
  const open = await openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport)));
  assert.ok(open.takeoffJobId);
  const after = repo.getCase(ORG, result.caseId);
  assert.equal(after.attachments[0].retrievalState, "retrieved");
  assert.match(after.attachments[0].sha256, /^[a-f0-9]{64}$/);
  console.log("ok: octet-stream + .pdf accepted after server-side magic validation");
}

// 3. Fake .pdf bytes are rejected at open (magic check).
{
  const repo = new InMemoryQuoteIntakeRepository();
  const notPdf = Buffer.from("this is not a pdf").toString("base64");
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: {
      "graph-msg-1": [samplePdfAttachment({ supportPdf: false, contentBytes: notPdf })]
    }
  });
  const result = await importOne(repo, transport);
  await assert.rejects(
    () => openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport))),
    (e) => e.code === "attachment_unsupported"
  );
  const after = repo.getCase(ORG, result.caseId);
  assert.equal(after.attachments[0].retrievalState, "failed");
  console.log("ok: fake .pdf bytes rejected by magic validation; attachment marked failed");
}

// 4. Inline image attachments are ignored (never a supported PDF).
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage({ internetMessageId: "<inline@example.com>" })],
    attachmentsByMessageId: { "graph-msg-1": [sampleInlineImage()] }
  });
  const result = await importOne(repo, transport);
  const row = repo.getCase(ORG, result.caseId);
  assert.equal(row.attachments[0].support, "inline_ignored");
  await assert.rejects(
    () => openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport))),
    (e) => e.code === "no_supported_pdf" && e.reason === "only_inline_images"
  );
  console.log("ok: inline images ignored; open estimate reports only_inline_images");
}

// 5. Non-PDF file attachment recorded but unsupported; forwarded item nested → precise reason.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage({ internetMessageId: "<item@example.com>" })],
    attachmentsByMessageId: { "graph-msg-1": [sampleItemAttachment()] }
  });
  const result = await importOne(repo, transport);
  assert.equal(result.status, "manual_review");
  const row = repo.getCase(ORG, result.caseId);
  assert.equal(row.attachments.length, 1);
  assert.equal(row.attachments[0].support, "unsupported_item");
  await assert.rejects(
    () => openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport))),
    (e) => e.code === "no_supported_pdf" && e.reason === "pdf_nested_in_forwarded_item"
  );
  console.log("ok: forwarded itemAttachment recorded, unsupported, precise reason");
}

// 6. Multiple PDFs require deterministic selection; selecting by record id opens.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: {
      "graph-msg-1": [
        samplePdfAttachment({ id: "att-a", name: "a.pdf" }),
        samplePdfAttachment({ id: "att-b", name: "b.pdf" })
      ]
    }
  });
  const result = await importOne(repo, transport);
  assert.equal(result.status, "manual_review");
  const row = repo.getCase(ORG, result.caseId);
  assert.equal(row.attachments.length, 2);

  await assert.rejects(
    () => openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport))),
    (e) => e.code === "multi_pdf_ambiguous" && e.selectionRequired === true && e.options.length === 2
  );

  const chosen = row.attachments[0];
  const open = await openEstimateForIntakeCase(
    openDeps(repo, result.caseId, graphClientFor(transport), {
      body: { attachmentId: chosen.id }
    })
  );
  assert.ok(open.takeoffJobId);
  console.log("ok: multiple PDFs need selection; attachmentId record selects deterministically");
}

// 7. Open Estimate retrieves bytes using server-stored provider identifiers only.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: { "graph-msg-1": [samplePdfAttachment()] }
  });
  const result = await importOne(repo, transport);
  const row = repo.getCase(ORG, result.caseId);
  // The stored record carries providerMessageId + sourceAttachmentId; the client
  // never supplies them.
  assert.equal(row.attachments[0].providerMessageId, "graph-msg-1");
  assert.equal(row.attachments[0].sourceAttachmentId, "att-pdf-1");
  const open = await openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport)));
  assert.ok(open.takeoffJobId);
  // Confirm a real Graph attachment GET happened for the stored id.
  assert.ok(
    transport.requests.some((r) => r.url.includes("/attachments/att-pdf-1"))
  );
  console.log("ok: bytes retrieved via server-stored provider ids (message + attachment)");
}

// 8. Client-supplied Graph IDs/URLs/mailbox/tenant/token/attachment URL are rejected.
{
  for (const body of [
    { attachmentUrl: "https://evil.example/x.pdf" },
    { mailbox: "attacker@evil.example" },
    { token: "abc" },
    { graphUrl: "https://graph.microsoft.com/..." },
    { takeoffJobId: "spoof" }
  ]) {
    assert.throws(() => rejectCallerOpenEstimateHints(body), /Caller-controlled/);
  }
  console.log("ok: caller-controlled graph/identity/file fields rejected");
}

// 9. Reopening the same case reuses the same Takeoff job.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: { "graph-msg-1": [samplePdfAttachment()] }
  });
  const result = await importOne(repo, transport);
  const first = await openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport)));
  const second = await openEstimateForIntakeCase(openDeps(repo, result.caseId, graphClientFor(transport)));
  assert.equal(first.takeoffJobId, second.takeoffJobId);
  assert.equal(second.reused, true);
  console.log("ok: reopening the same case reuses the same takeoff job");
}

// 10. Cross-org access blocked for a valid case id belonging to another org.
{
  const repo = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage()],
    attachmentsByMessageId: { "graph-msg-1": [samplePdfAttachment()] }
  });
  const result = await importOne(repo, transport);
  await assert.rejects(
    () =>
      openEstimateForIntakeCase({
        ...openDeps(repo, result.caseId, graphClientFor(transport)),
        organizationId: ORG_B
      }),
    (e) => e.code === "case_not_found"
  );
  console.log("ok: cross-org open estimate blocked");
}

// 11. selectSupportedPdfAttachment handles legacy sha256-only rows (backward compat).
{
  const legacy = {
    id: "case-legacy",
    attachments: [
      {
        id: "att-legacy",
        sha256: "a".repeat(64),
        mimeType: "application/pdf",
        safeFilename: "old.pdf"
      }
    ]
  };
  const att = selectSupportedPdfAttachment(legacy);
  assert.equal(att.id, "att-legacy");
  console.log("ok: legacy sha256-only attachment rows remain selectable");
}

console.log("\nAll openEstimatePart1 tests passed.\n");
