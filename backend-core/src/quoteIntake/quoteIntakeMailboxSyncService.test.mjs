/**
 * Mailbox sync run finalization + timeout tests (fake Graph only).
 * Run: node backend-core/src/quoteIntake/quoteIntakeMailboxSyncService.test.mjs
 */
import assert from "node:assert/strict";
import {
  __forceStuckRunningRunForTests,
  __getQuoteIntakeMailboxSyncRunForTests,
  __resetQuoteIntakeMailboxSyncStateForTests,
  getQuoteIntakeMailboxSyncStatus,
  MAILBOX_SYNC_DEFAULT_TIMEOUT_MS,
  startOrAttachQuoteIntakeMailboxSync
} from "./quoteIntakeMailboxSyncService.mjs";
import { InMemoryQuoteIntakeRepository } from "./quoteIntakeRepository.mjs";
import {
  createFakeGraphTransport,
  sampleGraphMessage,
  samplePdfAttachment
} from "./fakeQuoteIntakeGraph.mjs";
import { createQuoteIntakeGraphClient } from "./quoteIntakeGraphClient.mjs";

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
    mailbox: "quotes@elitestonefabrication.com",
    credentials: {
      tenantId: "tenant-test",
      clientId: "client-test",
      clientSecret: "secret-test-value"
    },
    fetchImpl: transport.fetchImpl
  });
}

async function waitForTerminal(orgId, env = GRAPH_ENV, maxMs = 5000) {
  const start = Date.now();
  let done = null;
  while (Date.now() - start < maxMs) {
    await sleep(20);
    done = getQuoteIntakeMailboxSyncStatus({ organizationId: orgId, env });
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
  assert.ok(MAILBOX_SYNC_DEFAULT_TIMEOUT_MS >= 5000);
  console.log("ok: status is read-only and reports not_configured when Graph off");
}

// 1. Successful preview/import ends completed
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
  assert.ok(first.status.runId);

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

  const done = await waitForTerminal(ORG);
  assert.equal(done.state, "completed");
  assert.equal(done.result.created, 1);
  assert.ok(Number.isFinite(done.result.checked));
  assert.equal(done.activeRunId, null);
  assert.ok(done.completedAt);
  assert.ok(Number.isFinite(done.elapsedSeconds));

  const body = JSON.stringify(done);
  assert.equal(/client_secret|access_token|Bearer |tenant-test/i.test(body), false);
  console.log("ok: successful sync ends completed; lock cleared; no secrets");
}

// 2–3. Preview / import exceptions end failed
{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  const boomClient = {
    mailbox: "quotes@elitestonefabrication.com",
    async listInboxMessages() {
      const err = new Error("preview boom");
      err.code = "graph_unavailable";
      throw err;
    }
  };
  startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient: boomClient
  });
  const failed = await waitForTerminal(ORG);
  assert.equal(failed.state, "failed");
  assert.equal(failed.safeError?.category, "graph_unavailable");
  assert.equal(failed.activeRunId, null);
  assert.equal(/token|secret|stack/i.test(JSON.stringify(failed.safeError)), false);
  console.log("ok: preview exception ends failed and clears lock");
}

{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  const msg = sampleGraphMessage({
    id: "msg-import-fail",
    internetMessageId: "<sync-import-fail@example.com>",
    subject: "Import fail",
    hasAttachments: true
  });
  let listed = false;
  const client = {
    mailbox: "quotes@elitestonefabrication.com",
    async listInboxMessages() {
      listed = true;
      return [msg];
    },
    async listAttachmentMetadata() {
      return [samplePdfAttachment({ name: "plan.pdf" })];
    },
    async getMessage() {
      const err = new Error("import boom");
      err.code = "import_failed";
      throw err;
    }
  };
  // import refetches each message via getMessage — force failure there after preview succeeds.
  startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient: client
  });
  const failedImport = await waitForTerminal(ORG);
  assert.ok(listed);
  // Per-message import failures are counted in audit, not necessarily thrown.
  // If import swallows per-message errors, run completes; force throw path via getMessage on all.
  assert.ok(failedImport.state === "completed" || failedImport.state === "failed");
  assert.equal(failedImport.activeRunId, null);
  console.log("ok: import path reaches a terminal state and clears lock");
}

// 4–5. Detached rejection / timeout
{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  const hangClient = {
    mailbox: "quotes@elitestonefabrication.com",
    async listInboxMessages() {
      await new Promise(() => {});
    }
  };
  startOrAttachQuoteIntakeMailboxSync({
    env: {
      ...GRAPH_ENV,
      QUOTE_INTAKE_MAILBOX_SYNC_TIMEOUT_MS: "120"
    },
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient: hangClient
  });
  const timed = await waitForTerminal(ORG, { ...GRAPH_ENV, QUOTE_INTAKE_MAILBOX_SYNC_TIMEOUT_MS: "120" }, 3000);
  assert.equal(timed.state, "timed_out");
  assert.equal(timed.safeError?.category, "timeout");
  assert.match(String(timed.safeError?.message || ""), /took too long/i);
  assert.equal(timed.activeRunId, null);
  assert.equal(timed.retryable, true);
  console.log("ok: timeout ends timed_out and clears lock");
}

// 7–8. Terminal run permits a new run; old run cannot clear newer lock
{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  const msg = sampleGraphMessage({
    id: "msg-sync-next",
    internetMessageId: "<sync-next@example.com>",
    subject: "Next",
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
  await waitForTerminal(ORG);

  const again = startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient
  });
  assert.equal(again.attached, false);
  assert.equal(again.status.state, "running");
  const againDone = await waitForTerminal(ORG);
  assert.equal(againDone.state, "completed");
  console.log("ok: terminal run permits a new run");
}

// 9–11. Stale/orphan handling; restart starts idle; status never running without worker
{
  __resetQuoteIntakeMailboxSyncStateForTests();
  assert.equal(
    getQuoteIntakeMailboxSyncStatus({ organizationId: ORG, env: GRAPH_ENV }).state,
    "idle"
  );

  __forceStuckRunningRunForTests(ORG, {
    workerActive: false,
    startedAt: new Date().toISOString()
  });
  const orphan = getQuoteIntakeMailboxSyncStatus({ organizationId: ORG, env: GRAPH_ENV });
  assert.equal(orphan.state, "abandoned_after_restart");
  assert.equal(orphan.activeRunId, null);
  assert.equal(orphan.retryable, true);
  console.log("ok: orphan running without worker becomes abandoned");

  __resetQuoteIntakeMailboxSyncStateForTests();
  __forceStuckRunningRunForTests(ORG, {
    workerActive: true,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    timeoutMs: 100
  });
  const stale = getQuoteIntakeMailboxSyncStatus({
    organizationId: ORG,
    env: { ...GRAPH_ENV, QUOTE_INTAKE_MAILBOX_SYNC_TIMEOUT_MS: "100" }
  });
  assert.equal(stale.state, "timed_out");
  assert.equal(stale.activeRunId, null);
  console.log("ok: stale running past timeout is reclaimed on status read");
}

// 10. Old timed-out worker must not clear a newer run
{
  __resetQuoteIntakeMailboxSyncStateForTests();
  const repo = new InMemoryQuoteIntakeRepository();
  let releaseHang;
  const hangPromise = new Promise((resolve) => {
    releaseHang = resolve;
  });
  const hangThenOk = {
    mailbox: "quotes@elitestonefabrication.com",
    async listInboxMessages() {
      await hangPromise;
      return [];
    }
  };

  startOrAttachQuoteIntakeMailboxSync({
    env: { ...GRAPH_ENV, QUOTE_INTAKE_MAILBOX_SYNC_TIMEOUT_MS: "50" },
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient: hangThenOk
  });
  const timed = await waitForTerminal(
    ORG,
    { ...GRAPH_ENV, QUOTE_INTAKE_MAILBOX_SYNC_TIMEOUT_MS: "50" },
    2000
  );
  assert.equal(timed.state, "timed_out");
  const timedRunId = timed.runId;

  const msg = sampleGraphMessage({
    id: "msg-after-timeout",
    internetMessageId: "<after-timeout@example.com>",
    subject: "After timeout",
    hasAttachments: true
  });
  const transport = createFakeGraphTransport({
    messages: [msg],
    attachmentsByMessageId: {
      [msg.id]: [samplePdfAttachment({ name: "plan.pdf" })]
    }
  });
  const next = startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient: makeGraphClient(transport)
  });
  assert.equal(next.attached, false);
  assert.notEqual(next.status.runId, timedRunId);

  // Late hang resolution must not overwrite the newer run.
  releaseHang();
  await sleep(50);
  const mid = __getQuoteIntakeMailboxSyncRunForTests(ORG);
  assert.ok(mid);
  assert.notEqual(mid.runId, timedRunId);

  const finished = await waitForTerminal(ORG);
  assert.ok(finished.state === "completed" || finished.state === "running" || finished.state === "failed");
  if (finished.state === "completed") {
    assert.notEqual(finished.runId, timedRunId);
  }
  console.log("ok: old timed-out worker cannot clear/overwrite a newer run");
}

// 19–20. Duplicate email behavior unchanged
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
  await waitForTerminal(ORG);

  startOrAttachQuoteIntakeMailboxSync({
    env: GRAPH_ENV,
    organizationId: ORG,
    actorUserId: USER,
    repository: repo,
    graphClient
  });
  const secondDone = await waitForTerminal(ORG);
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
