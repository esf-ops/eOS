/**
 * Command Center mailbox sync orchestration tests (fake Graph only).
 * Run: node backend-core/src/quoteIntake/quoteIntakeMailboxSyncService.test.mjs
 */
import assert from "node:assert/strict";
import {
  __resetQuoteIntakeMailboxSyncStateForTests,
  getQuoteIntakeMailboxSyncStatus,
  startOrAttachQuoteIntakeMailboxSync
} from "./quoteIntakeMailboxSyncService.mjs";
import { InMemoryQuoteIntakeRepository } from "./quoteIntakeRepository.mjs";
import {
  createFakeGraphTransport,
  sampleGraphMessage,
  samplePdfAttachment
} from "./fakeQuoteIntakeGraph.mjs";
import { createQuoteIntakeGraphClient } from "./quoteIntakeGraphClient.mjs";
import { readQuoteIntakeGraphCredentials, readQuoteIntakeGraphMailbox } from "./quoteIntakeGraphConfig.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "user-sync-1";

const GRAPH_ENV = {
  QUOTE_INTAKE_API_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_TENANT_ID: "tenant-test",
  QUOTE_INTAKE_GRAPH_CLIENT_ID: "client-test",
  QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "secret-test-value",
  QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@elitestonefabrication.com"
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeGraphClient(transport) {
  return createQuoteIntakeGraphClient({
    mailbox: readQuoteIntakeGraphMailbox(GRAPH_ENV),
    credentials: readQuoteIntakeGraphCredentials(GRAPH_ENV),
    fetchImpl: transport.fetchImpl
  });
}

async function waitForIdle(orgId) {
  let done = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(25);
    done = getQuoteIntakeMailboxSyncStatus({ organizationId: orgId, env: GRAPH_ENV });
    if (done.state !== "running") return done;
  }
  return done;
}

console.log("\nquoteIntakeMailboxSyncService.test.mjs\n");

__resetQuoteIntakeMailboxSyncStateForTests();

{
  const status = getQuoteIntakeMailboxSyncStatus({
    organizationId: ORG,
    env: { QUOTE_INTAKE_API_ENABLED: "0" }
  });
  assert.equal(status.state, "not_configured");
  assert.equal(status.configured, false);
  assert.equal(status.result.ignored, null);
  console.log("ok: status is read-only and reports not_configured when Graph off");
}

{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  const msg = sampleGraphMessage({
    id: "msg-sync-1",
    internetMessageId: "<sync-1@example.com>",
    subject: "Kitchen quote request",
    hasAttachments: true
  });
  const transport = createFakeGraphTransport({
    messages: [msg],
    attachmentsByMessageId: {
      [msg.id]: [samplePdfAttachment({ name: "plan.pdf" })]
    }
  });
  const graphClient = makeGraphClient(transport);

  const first = startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient
  });
  assert.equal(first.accepted, true);
  assert.equal(first.attached, false);
  assert.equal(first.status.state, "running");
  assert.ok(first.status.activeRunId);

  const second = startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: "other-user",
    repository: repo,
    graphClient
  });
  assert.equal(second.attached, true);
  assert.equal(second.status.activeRunId, first.status.activeRunId);
  console.log("ok: concurrent sync attaches to active run");

  const done = await waitForIdle(ORG);
  assert.equal(done.state, "completed");
  assert.equal(done.result.created, 1);
  assert.ok(Number.isFinite(done.result.checked));
  assert.equal(Object.prototype.hasOwnProperty.call(done.result, "ignored"), true);

  const body = JSON.stringify(done);
  assert.equal(/client_secret|access_token|Bearer |tenant-test/i.test(body), false);
  assert.equal(/stack|rawGraph|messageBody/i.test(body), false);
  console.log("ok: sync completes via canonical preview+import; no secrets in status");
}

{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  const msg = sampleGraphMessage({
    id: "msg-sync-dup",
    internetMessageId: "<sync-dup@example.com>",
    subject: "Dup quote",
    hasAttachments: true
  });
  const transport = createFakeGraphTransport({
    messages: [msg],
    attachmentsByMessageId: {
      [msg.id]: [samplePdfAttachment({ name: "plan.pdf" })]
    }
  });
  const graphClient = makeGraphClient(transport);

  startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient
  });
  await waitForIdle(ORG);

  startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient
  });
  const secondDone = await waitForIdle(ORG);
  assert.equal(secondDone.state, "completed");
  assert.ok(secondDone.result.duplicates >= 1 || secondDone.result.created === 0);
  const cases = await repo.listCases(ORG, { limit: 20 });
  const matching = (Array.isArray(cases) ? cases : []).filter(
    (c) => c.sourceMessage?.internetMessageId === "<sync-dup@example.com>"
  );
  assert.equal(matching.length, 1);
  console.log("ok: repeated sync does not duplicate queue records");
}

console.log("\nAll quoteIntakeMailboxSyncService tests passed.\n");
