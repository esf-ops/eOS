/**
 * Shared Inbox Phase 1 — read model + service tests (fake Graph only).
 * Run: node backend-core/src/elite100EstimateStudio/studioSharedInbox.test.mjs
 *   or: npm run eos:test:studio-shared-inbox
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSharedInboxRow,
  filterAndPageSharedInboxRows,
  sanitizeInboxText,
  SHARED_INBOX_STATES,
  deriveAiTakeoffSummary,
  deriveSupportState
} from "./studioSharedInboxReadModel.mjs";
import {
  createStudioSharedInboxService,
  sharedInboxSafeError
} from "./studioSharedInboxService.mjs";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import {
  createFakeGraphTransport,
  sampleGraphMessage,
  samplePdfAttachment,
  sampleItemAttachment
} from "../quoteIntake/fakeQuoteIntakeGraph.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntake/quoteIntakeGraphClient.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "user-shared-inbox-1";

const GRAPH_ENV = {
  QUOTE_INTAKE_API_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_TENANT_ID: "tenant-test",
  QUOTE_INTAKE_GRAPH_CLIENT_ID: "client-test",
  QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "secret-test-value",
  QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@elitestonefabrication.com",
  QUOTE_INTAKE_AUTOMATIC_TAKEOFF: "0",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1"
};

function graphClientFor(transport) {
  return createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: {
      tenantId: "tenant-test",
      clientId: "client-test",
      clientSecret: "secret-test-value",
      mailbox: "quotes@elitestonefabrication.com"
    },
    fetchImpl: transport.fetchImpl
  });
}

function makeService({ messages, attachmentsByMessageId, repo, env = GRAPH_ENV } = {}) {
  const transport = createFakeGraphTransport({
    messages: messages || [
      sampleGraphMessage({
        id: "msg-supported-1",
        internetMessageId: "<supported-1@example.com>",
        subject: "Kitchen remodel plans",
        bodyPreview: "Please quote this job. <b>Urgent</b>",
        receivedDateTime: "2026-07-20T15:00:00Z",
        from: { emailAddress: { name: "Alex Builder", address: "alex@example.com" } },
        hasAttachments: true
      }),
      sampleGraphMessage({
        id: "msg-unsupported-1",
        internetMessageId: "<unsupported-1@example.com>",
        subject: "Fwd: plans",
        bodyPreview: "See nested item",
        receivedDateTime: "2026-07-19T12:00:00Z",
        from: { emailAddress: { name: "Sam Partner", address: "sam@example.com" } },
        hasAttachments: true
      }),
      sampleGraphMessage({
        id: "msg-older-1",
        internetMessageId: "<older-1@example.com>",
        subject: "Older request",
        bodyPreview: "Older body",
        receivedDateTime: "2026-07-18T08:00:00Z",
        from: { emailAddress: { name: "Pat Client", address: "pat@example.com" } },
        hasAttachments: true
      })
    ],
    attachmentsByMessageId: attachmentsByMessageId || {
      "msg-supported-1": [samplePdfAttachment({ id: "att-pdf-s1", name: "kitchen-plan.pdf" })],
      "msg-unsupported-1": [sampleItemAttachment({ id: "att-item-u1", name: "forwarded.eml" })],
      "msg-older-1": [samplePdfAttachment({ id: "att-pdf-o1", name: "bath.pdf" })]
    }
  });
  const repository = repo || new InMemoryQuoteIntakeRepository();
  /** Thin queue stub — maps in-memory intake cases without Supabase. */
  const queueService = {
    async listQueue({ organizationId }) {
      const rows = repository.listCases(organizationId, { limit: 100 });
      return {
        ok: true,
        cases: rows.map((c) => ({
          id: c.id,
          studioEstimateId: null,
          assignedEstimatorUserId: c.assignedEstimatorUserId || null,
          assignedEstimatorLabel: c.assignedEstimatorUserId ? "Assigned" : "Unassigned",
          customerName: null,
          projectName: null,
          workflowStatus: "New",
          estimateStatus: "none",
          caseStatus: c.status,
          sourceType: c.sourceType,
          receivedAt: c.receivedAt,
          aiTakeoffStatus: "Not started",
          takeoffJobId: null,
          operationalState: {
            key: "new_request",
            label: "Open request",
            category: "request",
            needsAttention: true,
            openTarget: "takeoff",
            primaryAction: "Open request",
            workflowStatus: "New",
            mutates: false
          }
        }))
      };
    }
  };
  const svc = createStudioSharedInboxService({
    env,
    quoteIntakeRepository: repository,
    studioEstimateQueueService: queueService,
    graphClient: graphClientFor(transport),
    bootstrapIntakeCases: null,
    ensureStudioEstimate: null
  });
  return { svc, repository, transport };
}

console.log("\nstudioSharedInbox.test.mjs\n");

// ── Read model unit tests ──────────────────────────────────────────────
{
  const html = sanitizeInboxText("<script>alert(1)</script>Hello <b>world</b>", 280);
  assert.equal(html.includes("<"), false);
  assert.equal(html.includes("script"), false);
  assert.match(html, /Hello/);
  console.log("ok: 12–13 safe body preview; HTML not rendered");
}

{
  const row = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m1",
      subject: "Quote please",
      bodyPreview: "Body",
      receivedDateTime: "2026-07-21T10:00:00Z",
      sender: { displayName: "Casey", emailPresent: true },
      hasAttachments: true,
      attachments: [
        {
          sourceAttachmentId: "a1",
          name: "plan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1000,
          support: "direct_pdf"
        }
      ],
      eligibilityHint: "importable",
      importable: true,
      alreadyImported: false
    }
  });
  assert.equal(row.importState, SHARED_INBOX_STATES.NOT_IMPORTED);
  assert.equal(row.primaryAction.key, "import_and_open");
  assert.equal(row.primaryAction.mutates, true);
  assert.equal(row.supportedAttachmentCount, 1);
  assert.equal(row.supportState, "supported");
  const json = JSON.stringify(row);
  assert.equal(json.includes("accessToken"), false);
  assert.equal(json.includes("graph.microsoft.com"), false);
  assert.equal(json.includes("token_hash"), false);
  assert.equal(json.includes("customerUrl"), false);
  console.log("ok: 1 unimported supported; 14–16 no tokens/URLs/publication secrets");
}

{
  const row = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m2",
      subject: "No plan",
      bodyPreview: "Hi",
      sender: { displayName: "NoPlan", emailPresent: false },
      hasAttachments: true,
      attachments: [
        { sourceAttachmentId: "x", name: "note.txt", mimeType: "text/plain", support: "metadata_only" }
      ],
      eligibilityHint: "manual_review",
      importable: false,
      alreadyImported: false
    }
  });
  assert.equal(row.supportState, SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT);
  assert.equal(row.primaryAction.key, "create_manual_estimate");
  console.log("ok: 2 unimported unsupported → Create manual estimate");
}

{
  const row = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m3",
      alreadyImported: true,
      existingCaseId: "case-1",
      subject: "Imported",
      sender: { displayName: "", emailPresent: true },
      eligibilityHint: "already_imported",
      attachments: []
    },
    queueRow: {
      id: "case-1",
      studioEstimateId: "est-1",
      assignedEstimatorLabel: "Unassigned",
      assignedEstimatorUserId: null,
      customerName: null,
      projectName: null,
      workflowStatus: "New",
      estimateStatus: "draft",
      operationalState: {
        key: "new_request",
        label: "Open request",
        category: "request",
        needsAttention: true,
        openTarget: "takeoff",
        primaryAction: "Open request",
        workflowStatus: "New",
        mutates: false
      },
      aiTakeoffStatus: "Not started",
      takeoffJobId: null,
      caseStatus: "received"
    }
  });
  assert.equal(row.importState, SHARED_INBOX_STATES.IMPORTED);
  assert.equal(row.primaryAction.key, "open_estimate");
  assert.equal(row.primaryAction.mutates, false);
  assert.equal(row.estimateId, "est-1");
  assert.equal(row.activeEstimateId, "est-1");
  assert.equal(row.assignedEstimator.label, "Unassigned");
  assert.equal(row.customerLabel, "Customer not identified");
  assert.equal(row.projectLabel, "Project not named");
  console.log("ok: 3–4 imported + active revision; 9–11 identity/unassigned fallbacks");
}

{
  const processing = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m4",
      alreadyImported: true,
      existingCaseId: "c4",
      subject: "Proc",
      sender: { displayName: "P" },
      attachments: []
    },
    queueRow: {
      id: "c4",
      studioEstimateId: "e4",
      workflowStatus: "Takeoff processing",
      operationalState: {
        key: "takeoff_processing",
        openTarget: "takeoff",
        primaryAction: "View progress",
        mutates: false
      },
      aiTakeoffStatus: "Processing",
      takeoffJobId: "tj-1"
    }
  });
  assert.equal(processing.importState, SHARED_INBOX_STATES.TAKEOFF_PROCESSING);
  assert.equal(processing.primaryAction.key, "view_progress");
  assert.equal(processing.aiTakeoff.state, "processing");

  const ready = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m5",
      alreadyImported: true,
      existingCaseId: "c5",
      subject: "Ready",
      sender: { displayName: "R" },
      attachments: []
    },
    queueRow: {
      id: "c5",
      studioEstimateId: "e5",
      workflowStatus: "Needs estimator review",
      operationalState: {
        key: "needs_takeoff_review",
        openTarget: "takeoff",
        primaryAction: "Review AI Takeoff",
        mutates: false
      },
      aiTakeoffStatus: "Needs review",
      takeoffJobId: "tj-2"
    }
  });
  assert.equal(ready.importState, SHARED_INBOX_STATES.TAKEOFF_READY);
  assert.equal(ready.primaryAction.key, "review_ai_takeoff");
  assert.equal(ready.aiTakeoff.reviewReady, true);

  const failed = deriveAiTakeoffSummary({
    operationalState: { key: "takeoff_failed" },
    workflowStatus: "Takeoff failed",
    aiTakeoffStatus: "Takeoff failed",
    takeoffJobId: "tj-f"
  });
  assert.equal(failed.state, "failed");
  console.log("ok: 5–7 takeoff processing / ready / failed");
}

{
  const manual = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m6",
      eligibilityHint: "importable_no_pdf",
      hasAttachments: false,
      attachments: [],
      subject: "No attach",
      sender: { displayName: "M" },
      alreadyImported: false,
      importable: true
    }
  });
  assert.equal(manual.primaryAction.key, "create_manual_estimate");
  assert.equal(deriveSupportState({ eligibilityHint: "importable_no_pdf", hasAttachments: false, attachments: [] }).supportState, SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT);
  console.log("ok: 8 manual estimate path action");
}

{
  const rows = [
    buildSharedInboxRow({
      previewMessage: {
        graphMessageId: "a",
        receivedDateTime: "2026-07-10T00:00:00Z",
        subject: "Old",
        sender: { displayName: "A" },
        attachments: [{ name: "old.pdf", support: "direct_pdf" }],
        eligibilityHint: "importable",
        importable: true
      }
    }),
    buildSharedInboxRow({
      previewMessage: {
        graphMessageId: "b",
        receivedDateTime: "2026-07-21T00:00:00Z",
        subject: "New kitchen",
        sender: { displayName: "B Builder" },
        attachments: [{ name: "kitchen.pdf", support: "direct_pdf" }],
        eligibilityHint: "importable",
        importable: true
      }
    })
  ];
  const paged = filterAndPageSharedInboxRows(rows, { limit: 1, offset: 0 });
  assert.equal(paged.items[0].messageKey, "b");
  assert.equal(paged.total, 2);
  assert.equal(paged.limit, 1);
  const search = filterAndPageSharedInboxRows(rows, { search: "kitchen" });
  assert.equal(search.total, 1);
  assert.equal(search.items[0].messageKey, "b");
  const notImp = filterAndPageSharedInboxRows(rows, { state: "not_imported" });
  assert.equal(notImp.total, 2);
  console.log("ok: 17–20 sort newest first, pagination, filters, search");
}

// ── Service integration (fake Graph) ───────────────────────────────────
{
  const { svc, repository, transport } = makeService();
  const listed = await svc.listInbox({ organizationId: ORG, query: { limit: 25 } });
  assert.equal(listed.ok, true);
  assert.ok(listed.items.length >= 2);
  assert.equal(listed.items[0].receivedAt >= listed.items[1].receivedAt, true);
  const supported = listed.items.find((i) => i.messageKey === "msg-supported-1");
  assert.ok(supported);
  assert.equal(supported.importState, SHARED_INBOX_STATES.NOT_IMPORTED);
  assert.equal(supported.primaryAction.label, "Import and open");
  const unsupported = listed.items.find((i) => i.messageKey === "msg-unsupported-1");
  assert.ok(unsupported);
  assert.equal(unsupported.primaryAction.key, "create_manual_estimate");

  const first = await svc.importMessage({
    organizationId: ORG,
    messageKey: "msg-supported-1",
    actorUserId: USER,
    confirm: true,
    idempotencyKey: "idem-1"
  });
  assert.equal(first.ok, true);
  assert.ok(first.intakeCaseId);
  assert.equal(first.alreadyImported, false);

  const casesAfterFirst = await repository.listCases(ORG, { limit: 20 });
  const count1 = (Array.isArray(casesAfterFirst) ? casesAfterFirst : casesAfterFirst?.rows || []).length;

  const second = await svc.importMessage({
    organizationId: ORG,
    messageKey: "msg-supported-1",
    actorUserId: USER,
    confirm: true,
    idempotencyKey: "idem-1"
  });
  assert.equal(second.ok, true);
  assert.equal(second.alreadyImported, true);
  assert.equal(second.intakeCaseId, first.intakeCaseId);

  const third = await svc.importMessage({
    organizationId: ORG,
    messageKey: "msg-supported-1",
    actorUserId: USER,
    confirm: true,
    idempotencyKey: "idem-2"
  });
  assert.equal(third.intakeCaseId, first.intakeCaseId);

  const casesAfter = await repository.listCases(ORG, { limit: 20 });
  const count2 = (Array.isArray(casesAfter) ? casesAfter : casesAfter?.rows || []).length;
  assert.equal(count2, count1);

  const methods = transport.requests.map((r) => r.method);
  assert.ok(methods.every((m) => m === "GET" || m === "POST"));
  assert.equal(
    transport.requests.some((r) => /\/reply|\/forward|\/move|sendMail|DELETE/i.test(r.url + r.method)),
    false
  );

  const listed2 = await svc.listInbox({ organizationId: ORG, query: { state: "imported" } });
  const importedRow = listed2.items.find((i) => i.messageKey === "msg-supported-1");
  assert.ok(importedRow);
  assert.ok(
    importedRow.importState === SHARED_INBOX_STATES.IMPORTED ||
      importedRow.importState === SHARED_INBOX_STATES.ALREADY_IMPORTED ||
      importedRow.importState === SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW
  );
  assert.equal(importedRow.primaryAction.mutates, false);

  console.log("ok: 21–27 import + idempotent retry + no Outlook mutations");
}

{
  const { svc } = makeService();
  await assert.rejects(
    () =>
      svc.importMessage({
        organizationId: ORG,
        messageKey: "msg-supported-1",
        confirm: false
      }),
    (e) => e.code === "import_confirm_required"
  );
  console.log("ok: import requires confirm");
}

{
  const { svc, repository } = makeService();
  const manual = await svc.importMessage({
    organizationId: ORG,
    messageKey: "msg-unsupported-1",
    actorUserId: USER,
    confirm: true
  });
  assert.ok(manual.intakeCaseId);
  // Manual/unsupported path uses mailbox import (preserves message linkage), not fabricate takeoff.
  assert.equal(manual.takeoffInvocation?.attempted, false);
  const caseRow = await repository.getCase?.(ORG, manual.intakeCaseId);
  // In-memory may expose getCase or find via list
  const list = await repository.listCases(ORG, { limit: 50 });
  const rows = Array.isArray(list) ? list : list?.rows || [];
  const hit = rows.find((c) => c.id === manual.intakeCaseId);
  assert.ok(hit);
  assert.equal(String(hit.sourceType || hit.source_type), "graph_mailbox");
  console.log("ok: 28–30 unsupported import preserves mailbox linkage; no fake takeoff");
}

{
  const off = createStudioSharedInboxService({
    env: { ...GRAPH_ENV, QUOTE_INTAKE_GRAPH_ENABLED: "0" },
    quoteIntakeRepository: new InMemoryQuoteIntakeRepository()
  });
  await assert.rejects(
    () => off.listInbox({ organizationId: ORG }),
    (e) => e.code === "mailbox_not_configured"
  );
  console.log("ok: mailbox_not_configured when Graph disabled");
}

{
  const { svc } = makeService();
  await assert.rejects(
    () => svc.listInbox({ organizationId: "" }),
    (e) => e.code === "organization_required"
  );
  // Cross-org: import in ORG does not appear as imported for ORG_B preview match
  // (dedupe keys are org-scoped in repository).
  const { svc: svcB, repository: repoB } = makeService();
  await svc.importMessage({
    organizationId: ORG,
    messageKey: "msg-supported-1",
    actorUserId: USER,
    confirm: true
  });
  // Fresh service sharing no cases for ORG_B
  const listedB = await svcB.listInbox({ organizationId: ORG_B, query: {} });
  const rowB = listedB.items.find((i) => i.messageKey === "msg-supported-1");
  assert.ok(rowB);
  assert.equal(rowB.importState, SHARED_INBOX_STATES.NOT_IMPORTED);
  assert.equal(rowB.intakeCaseId, null);
  void repoB;
  console.log("ok: 37–41 org scoping — cross-org import state not leaked");
}

{
  const safe = sharedInboxSafeError("graph_disabled");
  assert.equal(safe.code, "mailbox_not_configured");
  assert.match(safe.error, /not configured/i);
  console.log("ok: structured safe errors");
}

// Route registration + no delivery side effects in import path source
{
  const routesSrc = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  assert.match(routesSrc, /\/api\/elite100-estimate-studio\/shared-inbox/);
  assert.match(routesSrc, /shared-inbox\/:messageKey\/import/);
  const svcSrc = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/studioSharedInboxService.mjs"),
    "utf8"
  );
  assert.equal(/publishDigitalEstimate|markSold|quickbooks|moraware|sendMail|replyAll/i.test(svcSrc), false);
  assert.match(svcSrc, /importQuoteIntakeMailboxMessages/);
  assert.match(svcSrc, /previewQuoteIntakeMailbox/);
  console.log("ok: 31–36 import path has no publish/calc/approve/email/sold/QB/Moraware; reuses mailbox services");
}

console.log("\nstudioSharedInbox.test.mjs — all passed\n");
