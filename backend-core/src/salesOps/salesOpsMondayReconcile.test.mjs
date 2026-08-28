/**
 * Reconciliation performance, observability, and exact person-mapping tests.
 * Call counts are bounded by batch/page, not account cardinality.
 */

import assert from "node:assert/strict";
import express from "express";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService } from "./salesOpsService.mjs";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import { reprojectAccountsFromMirror } from "./salesOpsMondayBatch.mjs";
import { createReconcileProgress, deriveActivityState, sanitizeProgress } from "./salesOpsMondayProgress.mjs";
import { previewExactPersonMappings } from "./salesOpsMondayPersonMap.mjs";
import { attachSalesOpsRoutes } from "./salesOpsApi.js";
import { SALES_OPS_ACCOUNT_UPSERT_BATCH, SALES_OPS_EAV_ITEM_ID_BATCH, SALES_OPS_RECONCILE_STALL_MS } from "./salesOpsConstants.js";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const ORG_B = "00000000-0000-4000-8000-bbbbbbbbbbbb";
const REP_A = "00000000-0000-4000-8000-0000000000aa";
const REP_B = "00000000-0000-4000-8000-0000000000bb";
const MGR = "00000000-0000-4000-8000-0000000000cc";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const BOARD = "18397092941";

function user(id, role, org = ORG, email = `${id.slice(-4)}@example.test`) {
  return { id, email, full_name: "Sentinel", role, organization_id: org, isActive: true };
}

function instrument(store) {
  const counts = {};
  const names = [
    "getRepMappingByMondayUser",
    "listRepMappings",
    "listMondayColumnValues",
    "listMondayColumnValuesForItems",
    "upsertAccount",
    "upsertAccountsBatch",
    "getMondayAccountDirectoryLink",
    "listMondayAccountDirectoryLinks",
    "inspectBoard"
  ];
  for (const name of names) {
    if (typeof store[name] !== "function") continue;
    const orig = store[name].bind(store);
    store[name] = async (...args) => {
      counts[name] = (counts[name] || 0) + 1;
      return orig(...args);
    };
  }
  return counts;
}

function parentItem(id, name, personId, extras = {}) {
  const cols = [
    {
      id: "person",
      title: "Sales Executive",
      type: "people",
      text: personId ? "rep" : "",
      value: personId
        ? JSON.stringify({ personsAndTeams: [{ id: personId, kind: "person" }] })
        : null
    },
    {
      id: "status",
      title: "Status",
      type: "status",
      text: extras.status || "Lead",
      value: extras.status == null ? null : JSON.stringify({ label: extras.status })
    },
    {
      id: "future_col",
      title: "Unknown Future",
      type: "text",
      text: extras.unknown || "",
      value: extras.unknown || null
    }
  ];
  return {
    id,
    name,
    url: `https://monday.example/${id}`,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: extras.updated_at || "2026-08-20T00:00:00Z",
    board: { id: BOARD },
    group: { id: "g1", title: "West" },
    column_values: cols,
    assets: [],
    subitems: extras.subitems || [],
    updates: extras.updates || []
  };
}

function makeMonday(items, extras = {}) {
  const inspectCounts = { inspectBoard: 0, listUsers: 0 };
  return createSalesOpsMondayClient({
    token: "sentinel-token",
    inspectBoard: async (id) => {
      inspectCounts.inspectBoard += 1;
      return {
        id,
        name: "Account Master List",
        columns: [{ id: "person", title: "Sales Executive", type: "people" }],
        groups: [{ id: "g1", title: "West" }]
      };
    },
    listBoardItems: async () => [...items.values()],
    getItem: async (id) => items.get(String(id)) || null,
    listItemUpdates: extras.listItemUpdates || (async (id) => items.get(String(id))?.updates || []),
    listItemsUpdates: extras.listItemsUpdates,
    getDoc: async () => ({ accessibility: "unsupported" }),
    listUsers: extras.listUsers || (async () => extras.users || []),
    changeColumnValues: async () => {
      throw new Error("write should not run");
    },
    createUpdate: async () => {
      throw new Error("write should not run");
    },
    ...extras.overrides
  });
}

async function seededStore() {
  const store = createSalesOpsMemoryStore();
  await store.upsertMondayConfig({
    organizationId: ORG,
    enabled: false,
    readEnabled: true,
    writeEnabled: false,
    accountMasterBoardId: BOARD,
    subitemBoardId: "18397319923",
    columnMap: { salesExecutive: { columnId: "person", title: "Sales Executive", type: "people" } }
  });
  return store;
}

async function main() {
  // Before-state shape (instrumented old loop against 50 sentinel accounts)
  const beforeStore = await seededStore();
  const beforeCounts = instrument(beforeStore);
  for (let i = 0; i < 50; i += 1) {
    const item = parentItem(`old-${i}`, `Old ${i}`, i % 2 === 0 ? "1001" : null, {
      status: i % 3 === 0 ? null : "Lead",
      unknown: i === 1 ? "keep-me" : ""
    });
    await beforeStore.upsertMondayItem({
      organizationId: ORG,
      mondayBoardId: BOARD,
      mondayItemId: item.id,
      itemKind: "item",
      itemName: item.name,
      sourceState: "active"
    });
    for (const c of item.column_values) {
      await beforeStore.upsertMondayColumnValue({
        organizationId: ORG,
        mondayBoardId: BOARD,
        mondayItemId: item.id,
        columnId: c.id,
        displayText: c.text,
        value: c.value,
        columnType: c.type,
        columnTitle: c.title
      });
    }
  }
  for (let i = 0; i < 50; i += 1) {
    await beforeStore.listMondayColumnValues(ORG, BOARD, `old-${i}`);
    await beforeStore.getRepMappingByMondayUser(ORG, "1001");
    await beforeStore.upsertAccount({
      organizationId: ORG,
      mondayBoardId: BOARD,
      mondayItemId: `old-${i}`,
      accountName: `Old ${i}`,
      assignedUserId: null
    });
  }
  assert.equal(beforeCounts.listMondayColumnValues, 50);
  assert.equal(beforeCounts.getRepMappingByMondayUser, 50);
  assert.equal(beforeCounts.upsertAccount, 50);

  // After-state: 1000 accounts, batched reproject
  const store = await seededStore();
  await store.upsertRepMapping({ organizationId: ORG, userId: REP_A, mondayUserId: "1001" });
  const items = new Map();
  for (let i = 0; i < 1000; i += 1) {
    const person = i % 10 === 0 ? null : i % 7 === 0 ? "9999" : "1001";
    const item = parentItem(`n1-${i}`, `Acct ${String(i).padStart(4, "0")}`, person, {
      status: i % 11 === 0 ? null : "Lead",
      unknown: "future"
    });
    items.set(item.id, item);
    await store.upsertMondayItem({
      organizationId: ORG,
      mondayBoardId: BOARD,
      mondayItemId: item.id,
      itemKind: "item",
      itemName: item.name,
      groupId: "g1",
      groupTitle: "West",
      sourceState: "active",
      mondayUrl: item.url
    });
    for (const c of item.column_values) {
      await store.upsertMondayColumnValue({
        organizationId: ORG,
        mondayBoardId: BOARD,
        mondayItemId: item.id,
        columnId: c.id,
        displayText: c.text,
        value: c.value,
        columnType: c.type,
        columnTitle: c.title
      });
    }
  }
  const counts = instrument(store);
  store.metrics.eavSelectChunks = 0;
  store.metrics.accountUpsertChunks = 0;
  const cfg = await store.getMondayConfig(ORG);
  const result = await reprojectAccountsFromMirror(store, { organizationId: ORG, cfg });
  assert.equal(result.parents, 1000);
  assert.equal(counts.getRepMappingByMondayUser || 0, 0);
  assert.equal(counts.listRepMappings, 1);
  assert.equal(counts.listMondayColumnValues || 0, 0);
  assert.equal(counts.listMondayColumnValuesForItems, 1);
  assert.equal(counts.upsertAccount || 0, 0);
  assert.ok(counts.upsertAccountsBatch <= Math.ceil(1000 / SALES_OPS_ACCOUNT_UPSERT_BATCH));
  assert.equal(store.metrics.eavSelectChunks, Math.ceil(1000 / SALES_OPS_EAV_ITEM_ID_BATCH));
  assert.ok(store.metrics.accountUpsertChunks <= Math.ceil(1000 / SALES_OPS_ACCOUNT_UPSERT_BATCH));
  const mapped = await store.getAccountByMondayItem(ORG, "n1-1");
  assert.equal(mapped.assignedUserId, REP_A);
  const unmappedPerson = await store.getAccountByMondayItem(ORG, "n1-7");
  assert.equal(unmappedPerson.mondayAssignedUserId, "9999");
  assert.equal(unmappedPerson.assignedUserId, null);
  const noOwner = await store.getAccountByMondayItem(ORG, "n1-0");
  assert.equal(noOwner.mondayAssignedUserId, null);
  const unknownCol = (await store.listMondayColumnValues(ORG, BOARD, "n1-1")).find((c) => c.columnId === "future_col");
  assert.equal(unknownCol.displayText, "future");

  // PostgREST default page is 1000 rows: EAV for 100 items * 23 columns must all round-trip
  const dense = await seededStore();
  const denseIds = [];
  for (let i = 0; i < 80; i += 1) {
    const id = `dense-${i}`;
    denseIds.push(id);
    await dense.upsertMondayItem({
      organizationId: ORG,
      mondayBoardId: BOARD,
      mondayItemId: id,
      itemKind: "item",
      itemName: id,
      sourceState: "active"
    });
    for (let c = 0; c < 23; c += 1) {
      await dense.upsertMondayColumnValue({
        organizationId: ORG,
        mondayBoardId: BOARD,
        mondayItemId: id,
        columnId: `col_${c}`,
        displayText: c === 0 ? "x" : "",
        value: c === 0 ? { personsAndTeams: [{ id: "1001", kind: "person" }] } : null,
        columnType: c === 0 ? "people" : "text"
      });
    }
  }
  const denseEav = await dense.listMondayColumnValuesForItems(ORG, denseIds, { chunkSize: 100 });
  assert.equal(denseEav.length, 80 * 23);

  // Full reconcile: schema once per board, updates batched, progress persisted
  const censusItems = new Map();
  for (let i = 0; i < 120; i += 1) {
    censusItems.set(
      `c-${i}`,
      parentItem(`c-${i}`, `C ${i}`, "1001", {
        updates: i === 0 ? [{ id: "u1", text_body: "hello", created_at: "2026-08-02T00:00:00Z", replies: [{ id: "r1", text_body: "re" }] }] : []
      })
    );
  }
  let updateBatches = 0;
  let inspectBoardCalls = 0;
  const monday = makeMonday(censusItems, {
    listItemsUpdates: async (ids) => {
      updateBatches += 1;
      const map = new Map();
      for (const id of ids) map.set(String(id), censusItems.get(String(id))?.updates || []);
      return map;
    },
    overrides: {
      inspectBoard: async (id) => {
        inspectBoardCalls += 1;
        return {
          id,
          name: "Account Master List",
          columns: [{ id: "person", title: "Sales Executive", type: "people" }],
          groups: [{ id: "g1", title: "West" }]
        };
      }
    }
  });
  const censusStore = await seededStore();
  await censusStore.upsertRepMapping({ organizationId: ORG, userId: REP_A, mondayUserId: "1001" });
  const svc = createSalesOpsService({ store: censusStore, monday, audit: async () => {} });
  const census = await svc.syncMonday(user(ADMIN, "admin"));
  assert.equal(census.count, 120);
  assert.equal(census.progress.status, "completed");
  assert.equal(census.progress.activityState, "COMPLETE");
  assert.ok(census.progress.parentProcessed === 120);
  assert.ok(inspectBoardCalls <= 2);
  assert.ok(updateBatches <= Math.ceil(120 / 5));
  assert.ok(updateBatches < 120);
  const st = await censusStore.getMondaySyncState(ORG, BOARD, "full");
  assert.equal(st.metadata.status, "completed");
  assert.equal(String(JSON.stringify(st.metadata)).includes("@example"), false);

  // Partial failed census does not mark unseen
  let boom = 0;
  const failMonday = makeMonday(censusItems, {
    listItemsUpdates: async () => {
      boom += 1;
      if (boom > 1) throw new Error("census exploded");
      return new Map();
    }
  });
  const failSvc = createSalesOpsService({ store: censusStore, monday: failMonday, audit: async () => {} });
  await failSvc.syncMonday(user(ADMIN, "admin")).then(
    () => {
      throw new Error("expected census failure");
    },
    () => {}
  );
  assert.equal((await censusStore.getAccountByMondayItem(ORG, "c-3")).sourceState, "active");
  const failedState = await censusStore.getMondaySyncState(ORG, BOARD, "full");
  assert.equal(failedState.metadata.status, "failed");
  assert.equal(failedState.metadata.activityState, "FAILED");

  // Rate-limit progress + stall detection
  const progress = createReconcileProgress({
    store: censusStore,
    organizationId: ORG,
    mondayBoardId: BOARD,
    syncMode: "full",
    now: () => "2026-08-27T00:00:00.000Z"
  });
  await progress.start();
  await progress.noteRateLimit({ waitMs: 2100, attempt: 1 });
  assert.equal(progress.snapshot.activityState, "RATE_LIMITED");
  progress.clearRateLimit();
  const stalled = deriveActivityState(
    { status: "running", lastProgressAt: new Date(Date.now() - SALES_OPS_RECONCILE_STALL_MS - 1000).toISOString(), rateLimitActive: false },
    Date.now()
  );
  assert.equal(stalled, "STALLED");
  const safe = sanitizeProgress({
    runId: "run-1",
    status: "running",
    stage: "parent_items",
    parentProcessed: 500,
    parentTotal: 836,
    lastSafeError: "timeout"
  });
  assert.equal(safe.parentProcessed, 500);
  assert.equal(JSON.stringify(safe).includes("Acct"), false);

  // Exact mapping preview / apply / fail-closed
  const mapStore = await seededStore();
  mapStore.seedUser({ id: REP_A, organizationId: ORG, email: "alex@elite.test", isActive: true });
  mapStore.seedUser({ id: REP_B, organizationId: ORG, email: "blake@elite.test", isActive: true });
  await mapStore.upsertMondayUser({ organizationId: ORG, mondayUserId: "1001", kind: "person", email: "alex@elite.test" });
  await mapStore.upsertMondayUser({ organizationId: ORG, mondayUserId: "1002", kind: "person", email: "blake@elite.test" });
  await mapStore.upsertMondayUser({ organizationId: ORG, mondayUserId: "1003", kind: "person", email: null });
  await mapStore.upsertMondayUser({
    organizationId: ORG,
    mondayUserId: "1004",
    kind: "person",
    email: "shared@elite.test"
  });
  await mapStore.upsertMondayUser({
    organizationId: ORG,
    mondayUserId: "1005",
    kind: "person",
    email: "shared@elite.test"
  });
  mapStore.seedUser({ id: "dup-1", organizationId: ORG, email: "dup@elite.test", isActive: true });
  mapStore.seedUser({ id: "dup-2", organizationId: ORG, email: "dup@elite.test", isActive: true });
  await mapStore.upsertMondayUser({ organizationId: ORG, mondayUserId: "1006", kind: "person", email: "dup@elite.test" });
  await mapStore.upsertAccount({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "own-a",
    accountName: "A",
    mondayAssignedUserId: "1001",
    assignedUserId: null,
    sourceState: "active"
  });
  await mapStore.upsertMondayItem({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "own-a",
    itemKind: "item",
    itemName: "A",
    sourceState: "active"
  });
  await mapStore.upsertMondayColumnValue({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "own-a",
    columnId: "person",
    columnType: "people",
    displayText: "Alex",
    value: { personsAndTeams: [{ id: "1001", kind: "person" }] }
  });
  await mapStore.upsertAccount({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "own-u",
    accountName: "U",
    mondayAssignedUserId: "1003",
    assignedUserId: null,
    sourceState: "active"
  });
  const preview = previewExactPersonMappings({
    mondayPeople: await mapStore.listMondayUsers(ORG),
    eliteOsUsers: await mapStore.listActiveOrganizationUsers(ORG),
    existingMappings: [],
    assignedMondayPersonIds: ["1001", "1002", "1003", "1004", "1006"]
  });
  const byId = Object.fromEntries(preview.results.map((r) => [r.mondayPersonId, r]));
  assert.equal(byId["1001"].status, "EXACT");
  assert.equal(byId["1001"].matchBasis, "exact_unique_email");
  assert.equal(byId["1003"].status, "UNMATCHED");
  assert.equal(byId["1004"].status, "AMBIGUOUS");
  assert.equal(byId["1006"].status, "AMBIGUOUS");

  const mapMonday = makeMonday(new Map(), {
    listUsers: async () => [
      { id: "1001", email: "alex@elite.test", name: "Alex", enabled: true },
      { id: "1002", email: "blake@elite.test", name: "Blake", enabled: true },
      { id: "1003", email: null, name: "No Mail", enabled: true }
    ]
  });
  const mapSvc = createSalesOpsService({ store: mapStore, monday: mapMonday, audit: async () => {} });
  const applied = await mapSvc.applyMondayPersonMappings(user(ADMIN, "admin"));
  assert.equal(applied.applied.some((r) => r.mondayPersonId === "1001"), true);
  assert.equal(applied.skippedUnmatched.some((r) => r.mondayPersonId === "1003"), true);
  const after = await mapStore.getAccountByMondayItem(ORG, "own-a");
  assert.equal(after.assignedUserId, REP_A);

  // Authorization after mapping
  await mapStore.upsertRepMapping({ organizationId: ORG, userId: REP_B, mondayUserId: "1002" });
  await mapStore.upsertAccount({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "own-b",
    accountName: "B",
    mondayAssignedUserId: "1002",
    assignedUserId: REP_B,
    sourceState: "active"
  });
  await mapStore.upsertAccount({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "own-x",
    accountName: "X",
    mondayAssignedUserId: "1003",
    assignedUserId: null,
    sourceState: "active"
  });
  await mapStore.insertManagerAssignment({
    organizationId: ORG,
    managerUserId: MGR,
    reportUserId: REP_A,
    canMutateAccounts: false
  });
  const aList = await mapSvc.getMyAccounts(user(REP_A, "sales"));
  const bList = await mapSvc.getMyAccounts(user(REP_B, "sales"));
  const mgrList = await mapSvc.getMyAccounts(user(MGR, "sales_manager"));
  const otherOrg = await mapSvc.getMyAccounts(user(REP_A, "sales", ORG_B));
  assert.equal(aList.accounts.some((a) => a.mondayItemId === "own-a"), true);
  assert.equal(aList.accounts.some((a) => a.mondayItemId === "own-b"), false);
  assert.equal(aList.accounts.some((a) => a.mondayItemId === "own-x"), false);
  assert.equal(bList.accounts.some((a) => a.mondayItemId === "own-a"), false);
  assert.equal(mgrList.accounts.some((a) => a.mondayItemId === "own-a"), true);
  assert.equal(otherOrg.accounts.length, 0);
  await assert.rejects(() => mapSvc.getAccountWorkspace(user(REP_A, "sales"), bList.accounts[0].id), (e) => e.status === 404);

  const health = await mapSvc.integrationHealth(user(ADMIN, "admin"));
  assert.equal(health.writeEnabled, false);
  assert.ok(health.reconcile);

  // Status endpoint authorization
  const app = express();
  attachSalesOpsRoutes(app, {
    service: mapSvc,
    store: mapStore,
    monday: mapMonday,
    requireAuth: () => (req, res, next) => {
      const token = String(req.header("authorization") || "").replace(/^Bearer\s+/i, "");
      const users = { a: user(REP_A, "sales"), admin: user(ADMIN, "admin") };
      if (!users[token]) return res.status(401).json({ ok: false, error: "Unauthorized" });
      req.user = users[token];
      next();
    },
    requireHeadAccess: () => (_req, _res, next) => next(),
    getSupabase: () => null
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const denied = await fetch(`http://127.0.0.1:${port}/api/sales-ops/admin/sync/status`, {
    headers: { Authorization: "Bearer a" }
  });
  assert.equal(denied.status, 403);
  const okStatus = await fetch(`http://127.0.0.1:${port}/api/sales-ops/admin/sync/status`, {
    headers: { Authorization: "Bearer admin" }
  });
  assert.equal(okStatus.status, 200);
  const statusBody = await okStatus.json();
  assert.equal(statusBody.writeEnabled, false);
  assert.ok(statusBody.reconcile);
  await new Promise((r) => server.close(r));

  console.log("salesOpsMondayReconcile.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
