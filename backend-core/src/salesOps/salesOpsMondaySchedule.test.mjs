/**
 * Monday READ-ONLY schedule: light ownership sync, lock, cadence, and cron auth.
 * Sentinel/fake data only. Does not call production Monday.
 */

import assert from "node:assert/strict";
import express from "express";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService } from "./salesOpsService.mjs";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import { attachSalesOpsMondayScheduleRoutes } from "./salesOpsMondayScheduleApi.mjs";
import { runLightMondayAccountSync } from "./salesOpsMondayLightSync.mjs";
import {
  nextExpectedRunAt,
  runScheduledMondayJob,
  withMondayScheduleLock
} from "./salesOpsMondaySchedule.mjs";
import { mondayScheduleLockName } from "./salesOpsMondayScheduleLock.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const REP_A = "00000000-0000-4000-8000-0000000000aa";
const REP_B = "00000000-0000-4000-8000-0000000000bb";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const BOARD = "18397092941";

function user(id, role, org = ORG) {
  return { id, email: `${id.slice(-4)}@example.test`, full_name: "Sentinel", role, organization_id: org, isActive: true };
}

function parentItem(id, name, personId, extras = {}) {
  return {
    id,
    name,
    url: `https://monday.example/${id}`,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: extras.updated_at || "2026-08-20T00:00:00Z",
    board: { id: BOARD },
    group: { id: "g1", title: "West" },
    column_values: [
      {
        id: "person",
        title: "Sales Executive",
        type: "people",
        text: personId ? "rep" : "",
        value: personId ? JSON.stringify({ personsAndTeams: [{ id: personId, kind: "person" }] }) : null
      },
      {
        id: "status",
        title: "Status",
        type: "status",
        text: extras.status || "Lead",
        value: extras.status ? JSON.stringify({ label: extras.status }) : null
      },
      {
        id: "market",
        title: "Market",
        type: "text",
        text: extras.market || "Iowa",
        value: extras.market || "Iowa"
      }
    ],
    assets: extras.assets || [],
    subitems: extras.subitems || [],
    updates: extras.updates || []
  };
}

async function seededStore() {
  const store = createSalesOpsMemoryStore();
  await store.upsertMondayConfig({
    organizationId: ORG,
    enabled: false,
    readEnabled: true,
    writeEnabled: false,
    accountMasterBoardId: BOARD,
    webhookIds: [],
    columnMap: { salesExecutive: { columnId: "person", title: "Sales Executive", type: "people" } }
  });
  await store.upsertRepMapping({
    organizationId: ORG,
    userId: REP_A,
    mondayUserId: "1001",
    active: true
  });
  await store.upsertRepMapping({
    organizationId: ORG,
    userId: REP_B,
    mondayUserId: "1002",
    active: true
  });
  return store;
}

function makeMonday(items, extras = {}) {
  const counts = { listItemUpdates: 0, getDoc: 0, listBoardItemsPageLight: 0, getItemsLight: 0 };
  const monday = createSalesOpsMondayClient({
    token: "sentinel-token",
    inspectBoard: async (id) => ({
      id,
      name: "Account Master List",
      columns: [{ id: "person", title: "Sales Executive", type: "people" }],
      groups: [{ id: "g1", title: "West" }]
    }),
    listBoardItems: async () => [...items.values()],
    listBoardItemsPageLight: extras.listBoardItemsPageLight || (async () => {
      counts.listBoardItemsPageLight += 1;
      return { items: [...items.values()], cursor: null };
    }),
    getItemsLight: extras.getItemsLight || (async (ids) => {
      counts.getItemsLight += 1;
      return ids.map((id) => items.get(String(id))).filter(Boolean);
    }),
    getItem: async (id) => items.get(String(id)) || null,
    listItemUpdates: extras.listItemUpdates || (async () => {
      counts.listItemUpdates += 1;
      return [];
    }),
    getDoc: extras.getDoc || (async () => {
      counts.getDoc += 1;
      return { accessibility: "unsupported" };
    }),
    listUsers: async () => [],
    changeColumnValues: async () => {
      throw new Error("write should not run");
    },
    createUpdate: async () => {
      throw new Error("write should not run");
    },
    ...extras.overrides
  });
  monday._counts = counts;
  return monday;
}

async function main() {
  const nextLight = nextExpectedRunAt("light", new Date("2026-08-28T14:00:00.000Z"));
  assert.equal(nextLight, "2026-08-28T14:05:00.000Z");
  const nextDeep = nextExpectedRunAt("deep", new Date("2026-08-28T14:14:00.000Z"));
  assert.equal(nextDeep, "2026-08-28T14:15:00.000Z");
  const nextFull = nextExpectedRunAt("full", new Date("2026-08-28T09:00:00.000Z"));
  assert.equal(nextFull, "2026-08-29T08:00:00.000Z");

  const store = await seededStore();
  const items = new Map([
    ["acct-1", parentItem("acct-1", "Sentinel Cabinets", "1001", { status: "Lead", market: "Iowa" })]
  ]);
  const monday = makeMonday(items);
  const first = await runLightMondayAccountSync(store, monday, {
    organizationId: ORG,
    cfg: await store.getMondayConfig(ORG)
  });
  assert.equal(first.ok, true);
  assert.equal(first.scheduleType, "LIGHT_ACCOUNT");
  assert.equal(first.writeEnabled, false);
  assert.equal(monday._counts.listItemUpdates, 0);
  assert.equal(monday._counts.getDoc, 0);
  let aBook = await store.listAccountsForUser(ORG, REP_A);
  let bBook = await store.listAccountsForUser(ORG, REP_B);
  assert.equal(aBook.length, 1);
  assert.equal(aBook[0].mondayItemId, "acct-1");
  assert.equal(bBook.length, 0);
  const accountId = aBook[0].id;
  await store.insertAttributionFact({
    organizationId: ORG,
    salespersonUserId: REP_A,
    salesOpsAccountId: accountId,
    morawareJobId: "job-sentinel-own",
    morawareFormId: "form-sentinel-own",
    qualifyingEvent: "COMPLETED_INSTALLATION_SF",
    qualifyingDate: "2026-05-01",
    performanceMonth: "2026-05",
    creditedSf: 120,
    attributionBasis: "explicit_fact"
  });

  items.set("acct-1", parentItem("acct-1", "Sentinel Cabinets", "1002", { status: "Active", market: "Iowa" }));
  await runLightMondayAccountSync(store, monday, {
    organizationId: ORG,
    cfg: await store.getMondayConfig(ORG)
  });
  aBook = await store.listAccountsForUser(ORG, REP_A);
  bBook = await store.listAccountsForUser(ORG, REP_B);
  assert.equal(aBook.length, 0, "ownership move must leave Rep A current book");
  assert.equal(bBook.length, 1, "ownership move must enter Rep B current book");
  assert.equal(bBook[0].assignedUserId, REP_B);
  assert.equal(bBook[0].id, accountId);
  const factsA = await store.listAttributionFacts(ORG, { userIds: [REP_A] });
  const factsB = await store.listAttributionFacts(ORG, { userIds: [REP_B] });
  assert.equal(factsA.length, 1);
  assert.equal(factsA[0].creditedSf, 120);
  assert.equal(factsA[0].salespersonUserId, REP_A);
  assert.equal(factsB.length, 0);

  items.set("acct-1", parentItem("acct-1", "Sentinel Cabinets", "9999"));
  await runLightMondayAccountSync(store, monday, {
    organizationId: ORG,
    cfg: await store.getMondayConfig(ORG)
  });
  const unmapped = await store.getAccountByMondayItem(ORG, "acct-1");
  assert.equal(unmapped.mondayAssignedUserId, "9999");
  assert.equal(unmapped.assignedUserId, null);
  assert.equal((await store.listAccountsForUser(ORG, REP_A)).length, 0);
  assert.equal((await store.listAccountsForUser(ORG, REP_B)).length, 0);
  const factsAfterUnmapped = await store.listAttributionFacts(ORG, { userIds: [REP_A] });
  assert.equal(factsAfterUnmapped.length, 1);

  const batchStore = await seededStore();
  const batchItems = new Map();
  for (let i = 0; i < 50; i += 1) {
    batchItems.set(`b-${i}`, parentItem(`b-${i}`, `Batch ${i}`, i % 2 === 0 ? "1001" : "1002"));
  }
  const origLookup = batchStore.getRepMappingByMondayUser.bind(batchStore);
  const origCols = batchStore.listMondayColumnValues.bind(batchStore);
  const origUpsert = batchStore.upsertAccount.bind(batchStore);
  const n1 = { lookup: 0, cols: 0, upsert: 0, pages: 0 };
  batchStore.getRepMappingByMondayUser = async (...args) => {
    n1.lookup += 1;
    return origLookup(...args);
  };
  batchStore.listMondayColumnValues = async (...args) => {
    n1.cols += 1;
    return origCols(...args);
  };
  const origUsersBatch = batchStore.upsertMondayUsersBatch.bind(batchStore);
  batchStore.upsertMondayUsersBatch = async (rows) => {
    const ids = (rows || []).map((r) => String(r.mondayUserId));
    assert.equal(new Set(ids).size, ids.length, "user upsert batch must be unique");
    return origUsersBatch(rows);
  };
  batchStore.upsertAccount = async (...args) => {
    n1.upsert += 1;
    return origUpsert(...args);
  };
  let remaining = [...batchItems.values()];
  const batchMonday = makeMonday(batchItems, {
    listBoardItemsPageLight: async (_id, cursor) => {
      n1.pages += 1;
      if (cursor === "done") return { items: [], cursor: null };
      const page = remaining.slice(0, 25);
      remaining = remaining.slice(25);
      return { items: page, cursor: remaining.length ? "next" : null };
    }
  });
  await runLightMondayAccountSync(batchStore, batchMonday, {
    organizationId: ORG,
    cfg: await batchStore.getMondayConfig(ORG)
  });
  assert.ok(n1.pages >= 2, "light sync must page");
  assert.equal(n1.lookup, 0, "no per-account rep lookup");
  assert.equal(n1.cols, 0, "no per-account EAV round trip");
  assert.equal(n1.upsert, 0, "no per-account upsert");
  assert.ok(batchStore.metrics.accountUpsertChunks >= 1);
  assert.equal((await batchStore.listAccountsForUser(ORG, REP_A)).length, 25);
  assert.equal((await batchStore.listAccountsForUser(ORG, REP_B)).length, 25);

  const retry = await runLightMondayAccountSync(batchStore, makeMonday(batchItems), {
    organizationId: ORG,
    cfg: await batchStore.getMondayConfig(ORG)
  });
  assert.equal(retry.ok, true);
  assert.equal((await batchStore.listAccountsForUser(ORG, REP_A)).length, 25);

  const rateStore = await seededStore();
  const rateMonday = {
    setHooks(next = {}) {
      this.hooks = next;
    },
    async listBoardItemsPageLight() {
      await this.hooks?.onBackoff?.({ waitMs: 400, attempt: 0, reason: "rate_limit" });
      this.hooks?.onRequest?.();
      return { items: [parentItem("rate-1", "Rate Sentinel", "1001")], cursor: null };
    }
  };
  const rateResult = await runLightMondayAccountSync(rateStore, rateMonday, {
    organizationId: ORG,
    cfg: await rateStore.getMondayConfig(ORG)
  });
  assert.equal(rateResult.progress.rateLimitWaitMs, 400);
  assert.equal(rateResult.progress.retries, 1);
  const rateState = await rateStore.getMondaySyncState(ORG, BOARD, "light");
  assert.equal(rateState.metadata.rateLimitWaitMs, 400);

  const failStore = await seededStore();
  await failStore.upsertAccount({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "keep-me",
    accountName: "Keep",
    assignedUserId: REP_A,
    sourceState: "active",
    lastSeenAt: "2026-01-01T00:00:00Z"
  });
  let unseen = 0;
  const origUnseen = failStore.markUnseenMondaySourcesUnavailable.bind(failStore);
  failStore.markUnseenMondaySourcesUnavailable = async (...args) => {
    unseen += 1;
    return origUnseen(...args);
  };
  const failMonday = {
    setHooks() {},
    async listBoardItemsPageLight(_id, cursor) {
      if (!cursor) return { items: [parentItem("page-1", "Page One", "1001")], cursor: "next" };
      throw new Error("page two failed");
    }
  };
  await runLightMondayAccountSync(failStore, failMonday, {
    organizationId: ORG,
    cfg: await failStore.getMondayConfig(ORG)
  }).then(
    () => {
      throw new Error("expected light failure");
    },
    () => {}
  );
  assert.equal(unseen, 0);
  const kept = await failStore.getAccountByMondayItem(ORG, "keep-me");
  assert.equal(kept.sourceState, "active");
  assert.equal(kept.assignedUserId, REP_A);
  const failedLight = await failStore.getMondaySyncState(ORG, BOARD, "light");
  assert.equal(failedLight.metadata.status, "failed");
  const cfgAfterFail = await failStore.getMondayConfig(ORG);
  assert.ok(cfgAfterFail.lastError);

  const overlapStore = await seededStore();
  await overlapStore.acquireMondayScheduleLock({
    organizationId: ORG,
    ownerToken: "full-owner",
    jobType: "full",
    ttlMs: 60_000
  });
  const overlap = await runScheduledMondayJob({
    store: overlapStore,
    monday: makeMonday(items),
    jobType: "light",
    organizationId: ORG
  });
  assert.equal(overlap.results[0].deferred, true);
  assert.equal(overlap.results[0].reason, "DEFERRED_FULL_OR_DEEP");
  assert.equal(overlap.writeEnabled, false);
  await overlapStore.releaseMondayScheduleLock({ organizationId: ORG, ownerToken: "full-owner" });

  const lightHold = await overlapStore.acquireMondayScheduleLock({
    organizationId: ORG,
    ownerToken: "light-owner",
    jobType: "light",
    ttlMs: 60_000
  });
  assert.equal(lightHold.acquired, true);
  const lightOverlap = await runScheduledMondayJob({
    store: overlapStore,
    monday: makeMonday(items),
    jobType: "light",
    organizationId: ORG
  });
  assert.equal(lightOverlap.results[0].reason, "LIGHT_OVERLAP");
  await overlapStore.releaseMondayScheduleLock({ organizationId: ORG, ownerToken: "light-owner" });

  const stale = await overlapStore.acquireMondayScheduleLock({
    organizationId: ORG,
    ownerToken: "stale-owner",
    jobType: "full",
    ttlMs: 1,
    now: new Date(Date.now() - 120_000)
  });
  assert.equal(stale.acquired, true);
  const recovered = await overlapStore.acquireMondayScheduleLock({
    organizationId: ORG,
    ownerToken: "new-owner",
    jobType: "light",
    ttlMs: 60_000
  });
  assert.equal(recovered.acquired, true);
  assert.equal(recovered.recovered_stale, true);
  await overlapStore.releaseMondayScheduleLock({ organizationId: ORG, ownerToken: "new-owner" });
  assert.equal(mondayScheduleLockName(ORG).startsWith("sales_ops_monday:"), true);

  const deepStore = await seededStore();
  const deepItems = new Map([
    ["d1", parentItem("d1", "Deep One", "1001")],
    ["d2", parentItem("d2", "Deep Two", "1001")]
  ]);
  await runScheduledMondayJob({
    store: deepStore,
    monday: makeMonday(deepItems),
    jobType: "full",
    organizationId: ORG
  });
  assert.equal((await deepStore.getAccountByMondayItem(ORG, "d2")).sourceState, "active");
  deepItems.delete("d2");
  await runScheduledMondayJob({
    store: deepStore,
    monday: makeMonday(deepItems),
    jobType: "deep",
    organizationId: ORG
  });
  assert.equal((await deepStore.getAccountByMondayItem(ORG, "d2")).sourceState, "active");
  const deepState = await deepStore.getMondaySyncState(ORG, BOARD, "deep");
  assert.equal(deepState.metadata.status, "completed");
  assert.ok(!deepState.lastCompleteCensusAt);
  await runScheduledMondayJob({
    store: deepStore,
    monday: makeMonday(deepItems),
    jobType: "full",
    organizationId: ORG
  });
  assert.equal((await deepStore.getAccountByMondayItem(ORG, "d2")).sourceState, "unavailable");

  const busyStore = await seededStore();
  await busyStore.acquireMondayScheduleLock({
    organizationId: ORG,
    ownerToken: "cron-light",
    jobType: "light",
    ttlMs: 60_000
  });
  const svc = createSalesOpsService({ store: busyStore, monday: makeMonday(items), audit: async () => {} });
  await svc.syncMonday(user(ADMIN, "admin")).then(
    () => {
      throw new Error("expected busy");
    },
    (e) => {
      assert.equal(e.code, "monday_sync_busy");
      assert.equal(e.status, 409);
    }
  );
  await busyStore.releaseMondayScheduleLock({ organizationId: ORG, ownerToken: "cron-light" });

  const healthSvc = createSalesOpsService({ store, monday: makeMonday(items), audit: async () => {} });
  const health = await healthSvc.integrationHealth(user(ADMIN, "admin"));
  assert.equal(health.writeEnabled, false);
  assert.equal(health.webhookEnabled, false);
  assert.ok(health.schedules.LIGHT_ACCOUNT);
  assert.ok(health.schedules.DEEP_REFRESH);
  assert.ok(health.schedules.FULL_RECONCILE);
  assert.equal(health.schedules.LIGHT_ACCOUNT.scheduleType, "LIGHT_ACCOUNT");
  assert.ok(health.schedules.LIGHT_ACCOUNT.nextExpectedRun);
  const status = await healthSvc.getReconcileStatus(user(ADMIN, "admin"));
  assert.equal(status.writeEnabled, false);
  assert.ok(status.schedules.LIGHT_ACCOUNT.lastCompleted || status.schedules.LIGHT_ACCOUNT.status === "failed");

  const targetedStore = await seededStore();
  const targetedItems = new Map([
    ["only-me", parentItem("only-me", "Targeted", "1001")],
    ["skip-me", parentItem("skip-me", "Skipped", "1002")]
  ]);
  let listed = 0;
  const targetedMonday = makeMonday(targetedItems, {
    listBoardItemsPageLight: async () => {
      listed += 1;
      throw new Error("targeted light must not page the board");
    }
  });
  await runLightMondayAccountSync(targetedStore, targetedMonday, {
    organizationId: ORG,
    cfg: await targetedStore.getMondayConfig(ORG),
    itemIds: ["only-me"]
  });
  assert.equal(listed, 0);
  assert.equal((await targetedStore.listAccountsForUser(ORG, REP_A)).length, 1);
  assert.equal((await targetedStore.listAccountsForUser(ORG, REP_B)).length, 0);

  const app = express();
  attachSalesOpsMondayScheduleRoutes(app, {
    env: { CRON_SECRET: "cron-sentinel" },
    store,
    monday: makeMonday(items)
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const unauth = await fetch(`http://127.0.0.1:${port}/api/internal/sales-ops/monday-sync/light`);
  assert.equal(unauth.status, 401);
  const unauthBody = await unauth.json();
  assert.equal(unauthBody.ok, false);
  assert.equal(unauthBody.writeEnabled, false);
  const missingSecretApp = express();
  attachSalesOpsMondayScheduleRoutes(missingSecretApp, {
    env: {},
    store,
    monday: makeMonday(items)
  });
  const missingServer = await new Promise((resolve) => {
    const s = missingSecretApp.listen(0, () => resolve(s));
  });
  const missingPort = missingServer.address().port;
  const missing = await fetch(`http://127.0.0.1:${missingPort}/api/internal/sales-ops/monday-sync/light`);
  assert.equal(missing.status, 500);
  const okCron = await fetch(`http://127.0.0.1:${port}/api/internal/sales-ops/monday-sync/light?organizationId=${ORG}`, {
    headers: { Authorization: "Bearer cron-sentinel" }
  });
  assert.equal(okCron.status, 200);
  const okBody = await okCron.json();
  assert.equal(okBody.ok, true);
  assert.equal(okBody.writeEnabled, false);
  assert.equal(okBody.webhookEnabled, false);
  assert.equal(okBody.jobType, "light");
  assert.equal(JSON.stringify(okBody).includes("personsAndTeams"), false);
  await new Promise((r) => server.close(r));
  await new Promise((r) => missingServer.close(r));

  const lockedInner = await withMondayScheduleLock(store, { organizationId: ORG, jobType: "light" }, async () => ({ ran: true }));
  assert.equal(lockedInner.deferred, false);
  assert.equal(lockedInner.result.ran, true);

  console.log("salesOpsMondaySchedule.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
