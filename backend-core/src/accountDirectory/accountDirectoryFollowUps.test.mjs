/**
 * Account Directory internal follow-ups — service, store, API, audit.
 * Run: node backend-core/src/accountDirectory/accountDirectoryFollowUps.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachAccountDirectoryRoutes } from "./accountDirectoryApi.js";
import { ACCOUNT_DIRECTORY_HEAD_SLUG } from "./accountDirectoryAuth.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import {
  AD_FOLLOW_UP_DETAILS_MAX,
  AD_FOLLOW_UP_TITLE_MAX,
  AD_FOLLOW_UPS_PAGE_MAX,
  archiveAccountFollowUp,
  completeAccountFollowUp,
  createAccountFollowUp,
  followUpDueState,
  listAccountFollowUps,
  listAssignableStaff,
  reopenAccountFollowUp,
  updateAccountFollowUp,
  validateFollowUpDueAt,
  validateFollowUpTitle
} from "./accountDirectoryFollowUps.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { createAccountDirectorySupabaseStore } from "./accountDirectorySupabaseStore.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const STAFF_A = "44444444-4444-4444-8444-444444444444";
const STAFF_B = "55555555-5555-4555-8555-555555555555";

function ctx(store, extra = {}) {
  return {
    store,
    organizationId: ORG,
    role: "sales",
    actorUserId: ACTOR,
    actorDisplayName: "Chris Henely",
    requestId: "req-fu-1",
    now: new Date("2026-08-17T15:00:00.000Z"),
    resolveStaffDisplayNames: async () =>
      new Map([
        [ACTOR, "Chris Henely"],
        [STAFF_A, "Pat Sales"]
      ]),
    assertAssigneeInOrg: async (organizationId, userId) =>
      organizationId === ORG && (userId === STAFF_A || userId === ACTOR),
    listOrgStaff: async (organizationId) => {
      if (organizationId !== ORG) return [];
      return [
        { id: ACTOR, displayName: "Chris Henely" },
        { id: STAFF_A, displayName: "Pat Sales" }
      ];
    },
    ...extra
  };
}

async function seedAccount(store, organizationId = ORG, displayName = "Follow-up Co") {
  const service = createAccountDirectoryService({ store });
  return service.createAccount({
    organizationId,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName }
  });
}

console.log("\naccountDirectoryFollowUps.test.mjs\n");

{
  assert.equal(followUpDueState("2026-08-16T12:00:00.000Z", { now: new Date("2026-08-17T15:00:00.000Z") }), "overdue");
  assert.equal(followUpDueState("2026-08-17T18:00:00.000Z", { now: new Date("2026-08-17T15:00:00.000Z") }), "due_today");
  assert.equal(followUpDueState("2026-08-20T12:00:00.000Z", { now: new Date("2026-08-17T15:00:00.000Z") }), "upcoming");
  assert.equal(
    followUpDueState("2026-08-20T12:00:00.000Z", { status: "completed", now: new Date("2026-08-17T15:00:00.000Z") }),
    "completed"
  );
  assert.equal(followUpDueState("2026-08-17T10:00:00.000Z", { now: new Date("2026-08-17T15:00:00.000Z") }), "overdue");
  console.log("ok: derived due state");
}

{
  assert.equal(validateFollowUpTitle("  Call Friday  "), "Call Friday");
  assert.throws(() => validateFollowUpTitle("  "), (err) => err.code === "follow_up_title_required");
  assert.throws(
    () => validateFollowUpTitle("x".repeat(AD_FOLLOW_UP_TITLE_MAX + 1)),
    (err) => err.code === "follow_up_title_too_long"
  );
  assert.throws(() => validateFollowUpDueAt(null), (err) => err.code === "follow_up_due_required");
  assert.throws(() => validateFollowUpDueAt("not-a-date"), (err) => err.code === "follow_up_due_invalid");
  const past = validateFollowUpDueAt("2020-01-01T00:00:00.000Z");
  assert.equal(past, "2020-01-01T00:00:00.000Z");
  console.log("ok: title/due validation; past due allowed");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const created = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: {
      title: "  Call customer Friday  ",
      details: "Quote still open",
      dueAt: "2026-08-21T16:00:00.000Z",
      assignedTo: STAFF_A
    }
  });
  assert.equal(created.title, "Call customer Friday");
  assert.equal(created.details, "Quote still open");
  assert.equal(created.status, "open");
  assert.equal(created.assignedTo, STAFF_A);
  assert.equal(created.assignee.displayName, "Pat Sales");
  assert.equal(created.author.displayName, "Chris Henely");
  assert.equal(created.completedAt, null);
  assert.equal(Object.prototype.hasOwnProperty.call(created, "createdBy"), false);
  const json = JSON.stringify(created);
  assert.equal(/@|token|service.role/i.test(json), false);
  console.log("ok: create follow-up + safe assignee payload");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  await assert.rejects(
    () => createAccountFollowUp({ ...ctx(store), accountId: account.id, payload: { dueAt: "2026-08-21T16:00:00.000Z" } }),
    (err) => err.code === "follow_up_title_required"
  );
  await assert.rejects(
    () => createAccountFollowUp({ ...ctx(store), accountId: account.id, payload: { title: "Call" } }),
    (err) => err.code === "follow_up_due_required"
  );
  await assert.rejects(
    () =>
      createAccountFollowUp({
        ...ctx(store),
        accountId: account.id,
        payload: { title: "Call", dueAt: "nope" }
      }),
    (err) => err.code === "follow_up_due_invalid"
  );
  await assert.rejects(
    () =>
      createAccountFollowUp({
        ...ctx(store),
        accountId: account.id,
        payload: { title: "x".repeat(AD_FOLLOW_UP_TITLE_MAX + 1), dueAt: "2026-08-21T16:00:00.000Z" }
      }),
    (err) => err.code === "follow_up_title_too_long"
  );
  await assert.rejects(
    () =>
      createAccountFollowUp({
        ...ctx(store),
        accountId: account.id,
        payload: {
          title: "Call",
          dueAt: "2026-08-21T16:00:00.000Z",
          details: "y".repeat(AD_FOLLOW_UP_DETAILS_MAX + 1)
        }
      }),
    (err) => err.code === "follow_up_details_too_long"
  );
  assert.equal(store.__stats().followUps, 0);
  console.log("ok: empty title / missing due / max lengths rejected");
}

{
  const store = createAccountDirectoryMemoryStore();
  const a = await seedAccount(store, ORG, "Account A");
  const b = await seedAccount(store, ORG, "Account B");
  await createAccountFollowUp({
    ...ctx(store),
    accountId: a.id,
    payload: { title: "Only on A", dueAt: "2026-08-21T16:00:00.000Z" }
  });
  const listedB = await listAccountFollowUps({ ...ctx(store), accountId: b.id });
  assert.equal(listedB.items.length, 0);
  await assert.rejects(
    () =>
      createAccountFollowUp({
        ...ctx(store),
        accountId: "not-a-uuid",
        payload: { title: "x", dueAt: "2026-08-21T16:00:00.000Z" }
      }),
    (err) => err.code === "invalid_id"
  );
  console.log("ok: account UUID scoping; malformed ids rejected");
}

{
  const store = createAccountDirectoryMemoryStore();
  const a = await seedAccount(store, ORG, "Org A FU");
  const b = await seedAccount(store, ORG_B, "Org B FU");
  await createAccountFollowUp({
    ...ctx(store),
    accountId: a.id,
    payload: { title: "secret A", dueAt: "2026-08-21T16:00:00.000Z" }
  });
  await assert.rejects(
    () => listAccountFollowUps({ ...ctx(store, { organizationId: ORG_B }), accountId: a.id }),
    (err) => err.status === 404
  );
  const listedB = await listAccountFollowUps({ ...ctx(store, { organizationId: ORG_B }), accountId: b.id });
  assert.equal(listedB.items.length, 0);
  console.log("ok: organization isolation");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  await assert.rejects(
    () =>
      createAccountFollowUp({
        ...ctx(store, { role: "viewer" }),
        accountId: account.id,
        payload: { title: "nope", dueAt: "2026-08-21T16:00:00.000Z" }
      }),
    (err) => err.status === 403
  );
  const listed = await listAccountFollowUps({ ...ctx(store, { role: "viewer" }), accountId: account.id });
  assert.equal(listed.items.length, 0);
  await assert.rejects(
    () => listAssignableStaff({ ...ctx(store, { role: "viewer" }), accountId: account.id }),
    (err) => err.status === 403
  );
  console.log("ok: view vs edit permissions");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  await store.insertAccountFollowUp({
    organizationId: ORG,
    accountId: account.id,
    title: "far",
    dueAt: "2026-09-01T12:00:00.000Z"
  });
  await store.insertAccountFollowUp({
    organizationId: ORG,
    accountId: account.id,
    title: "overdue",
    dueAt: "2026-08-01T12:00:00.000Z"
  });
  await store.insertAccountFollowUp({
    organizationId: ORG,
    accountId: account.id,
    title: "soon",
    dueAt: "2026-08-18T12:00:00.000Z"
  });
  const page1 = await listAccountFollowUps({ ...ctx(store), accountId: account.id, page: 1, pageSize: 2 });
  assert.deepEqual(
    page1.items.map((n) => n.title),
    ["overdue", "soon"]
  );
  assert.equal(page1.pagination.has_more, true);
  const page2 = await listAccountFollowUps({ ...ctx(store), accountId: account.id, page: 2, pageSize: 2 });
  assert.deepEqual(
    page2.items.map((n) => n.title),
    ["far"]
  );
  const bounded = await listAccountFollowUps({ ...ctx(store), accountId: account.id, pageSize: 999 });
  assert.equal(bounded.pagination.limit, AD_FOLLOW_UPS_PAGE_MAX);
  console.log("ok: open ordering overdue/nearest + bounded page size");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const first = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "first done", dueAt: "2026-08-10T12:00:00.000Z" }
  });
  const second = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "second done", dueAt: "2026-08-11T12:00:00.000Z" }
  });
  await completeAccountFollowUp({
    ...ctx(store, { now: new Date("2026-08-17T10:00:00.000Z") }),
    accountId: account.id,
    followUpId: first.id,
    payload: { rowVersion: first.rowVersion }
  });
  await completeAccountFollowUp({
    ...ctx(store, { now: new Date("2026-08-17T12:00:00.000Z") }),
    accountId: account.id,
    followUpId: second.id,
    payload: { rowVersion: second.rowVersion }
  });
  const open = await listAccountFollowUps({ ...ctx(store), accountId: account.id, status: "open" });
  assert.equal(open.items.length, 0);
  const done = await listAccountFollowUps({ ...ctx(store), accountId: account.id, status: "completed" });
  assert.deepEqual(
    done.items.map((n) => n.title),
    ["second done", "first done"]
  );
  assert.equal(done.items[0].dueState, "completed");
  assert.ok(done.items[0].completedAt);
  console.log("ok: completed ordering newest-first + completion metadata");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const created = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "reopen me", dueAt: "2026-08-21T16:00:00.000Z" }
  });
  const completed = await completeAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    followUpId: created.id,
    payload: { rowVersion: created.rowVersion }
  });
  assert.equal(completed.status, "completed");
  assert.ok(completed.completedAt);
  const stored = await store.getAccountFollowUp(ORG, created.id);
  assert.equal(stored.completedBy, ACTOR);
  const reopened = await reopenAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    followUpId: created.id,
    payload: { rowVersion: completed.rowVersion }
  });
  assert.equal(reopened.status, "open");
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.dueState, "upcoming");
  const storedOpen = await store.getAccountFollowUp(ORG, created.id);
  assert.equal(storedOpen.completedBy, null);
  console.log("ok: reopen clears completion");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const created = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "v1", dueAt: "2026-08-21T16:00:00.000Z" }
  });
  await assert.rejects(
    () =>
      updateAccountFollowUp({
        ...ctx(store),
        accountId: account.id,
        followUpId: created.id,
        payload: { title: "stale", dueAt: "2026-08-21T16:00:00.000Z", rowVersion: 99 }
      }),
    (err) => err.status === 409
  );
  const updated = await updateAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    followUpId: created.id,
    payload: { title: "v2", dueAt: "2026-08-22T16:00:00.000Z", rowVersion: created.rowVersion }
  });
  assert.equal(updated.title, "v2");
  await archiveAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    followUpId: created.id,
    payload: { rowVersion: updated.rowVersion }
  });
  const listed = await listAccountFollowUps({ ...ctx(store), accountId: account.id, status: "all" });
  assert.equal(listed.items.length, 0);
  console.log("ok: row-version conflict + archive hides item");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const created = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "assign", dueAt: "2026-08-21T16:00:00.000Z", assignedTo: STAFF_A }
  });
  assert.equal(created.assignedTo, STAFF_A);
  await assert.rejects(
    () =>
      createAccountFollowUp({
        ...ctx(store),
        accountId: account.id,
        payload: { title: "bad", dueAt: "2026-08-21T16:00:00.000Z", assignedTo: STAFF_B }
      }),
    (err) => err.code === "assignee_invalid"
  );
  const kept = await updateAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    followUpId: created.id,
    payload: { title: "assign still", dueAt: "2026-08-22T16:00:00.000Z", rowVersion: created.rowVersion }
  });
  assert.equal(kept.assignedTo, STAFF_A);
  const self = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "mine", dueAt: "2026-08-21T16:00:00.000Z", assignedTo: ACTOR }
  });
  assert.equal(self.assignedTo, ACTOR);
  const staff = await listAssignableStaff({ ...ctx(store), accountId: account.id });
  assert.equal(staff.items.some((s) => s.id === STAFF_A && s.displayName === "Pat Sales"), true);
  assert.equal(JSON.stringify(staff).includes("@"), false);
  console.log("ok: same-org assignment accepted; cross-org rejected");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const secret = "INTERNAL_FOLLOW_UP_DETAILS";
  const created = await createAccountFollowUp({
    ...ctx(store),
    accountId: account.id,
    payload: { title: "audit me", details: secret, dueAt: "2026-08-21T16:00:00.000Z" }
  });
  const events = await store.listAuditEvents(ORG, account.id, { limit: 50 });
  const add = events.find((e) => e.action === "add_follow_up");
  assert.ok(add);
  assert.equal(add.newValues?.followUpId, created.id);
  assert.equal(add.newValues?.status, "open");
  assert.equal(JSON.stringify(add).includes(secret), false);

  const auditBeforeFail = store.__stats().auditEvents;
  const origInsert = store.insertAccountFollowUp.bind(store);
  store.insertAccountFollowUp = async () => {
    throw new AccountDirectoryError("write_failed", "boom", 500);
  };
  await assert.rejects(() =>
    createAccountFollowUp({
      ...ctx(store),
      accountId: account.id,
      payload: { title: "will fail", dueAt: "2026-08-21T16:00:00.000Z" }
    })
  );
  store.insertAccountFollowUp = origInsert;
  assert.equal(store.__stats().auditEvents, auditBeforeFail);
  console.log("ok: audit metadata safe; failed mutation does not audit");
}

{
  const calls = [];
  const fake = {
    from(table) {
      const state = { table, eqs: [], is: [] };
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          state.eqs.push([col, val]);
          return api;
        },
        is(col, val) {
          state.is.push([col, val]);
          return api;
        },
        order() {
          return api;
        },
        range(from, to) {
          state.range = [from, to];
          return api;
        },
        then(onFulfilled, onRejected) {
          calls.push({ table: state.table, eqs: [...state.eqs], is: [...state.is], range: state.range });
          return Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled, onRejected);
        }
      };
      return api;
    }
  };
  const supabaseStore = createAccountDirectorySupabaseStore(() => fake);
  await supabaseStore.listAccountFollowUps(ORG, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    page: 1,
    limit: 25,
    status: "open"
  });
  assert.equal(calls[0].table, "account_directory_follow_ups");
  assert.deepEqual(calls[0].eqs, [
    ["organization_id", ORG],
    ["account_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["status", "open"]
  ]);
  console.log("ok: Supabase list is org+account+status scoped in query");
}

{
  const src = readFileSync(join(here, "accountDirectoryFollowUps.mjs"), "utf8");
  assert.equal(src.includes("linkQuickBooks"), false);
  assert.equal(src.includes("linkMoraware"), false);
  assert.equal(src.includes("insertExternalLink"), false);
  const apiSrc = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
  assert.ok(apiSrc.includes("/api/account-directory/accounts/:accountId/follow-ups"));
  assert.ok(apiSrc.includes("/complete"));
  assert.ok(apiSrc.includes("/reopen"));
  assert.ok(apiSrc.includes("Archive the follow-up instead."));
  assert.ok(apiSrc.includes("status(405)"));
  assert.equal(apiSrc.includes("/api/account-directory/follow-ups\""), false);
  const routes = new Map();
  const app = {
    get(path) {
      routes.set(`GET ${path}`, true);
    },
    post(path) {
      routes.set(`POST ${path}`, true);
    },
    patch(path) {
      routes.set(`PATCH ${path}`, true);
    },
    delete(path) {
      routes.set(`DELETE ${path}`, true);
    }
  };
  attachAccountDirectoryRoutes(app, {
    requireAuth: () => (req, res, next) => next(),
    requireHeadAccess: (slug) => {
      assert.equal(slug, ACCOUNT_DIRECTORY_HEAD_SLUG);
      return (req, res, next) => next();
    },
    getSupabase: () => ({}),
    store: createAccountDirectoryMemoryStore()
  });
  assert.ok(routes.has("GET /api/account-directory/accounts/:accountId/follow-ups"));
  assert.ok(routes.has("GET /api/account-directory/accounts/:accountId/follow-ups/assignees"));
  assert.ok(routes.has("POST /api/account-directory/accounts/:accountId/follow-ups"));
  assert.ok(routes.has("PATCH /api/account-directory/accounts/:accountId/follow-ups/:followUpId"));
  assert.ok(routes.has("POST /api/account-directory/accounts/:accountId/follow-ups/:followUpId/complete"));
  assert.ok(routes.has("POST /api/account-directory/accounts/:accountId/follow-ups/:followUpId/reopen"));
  assert.ok(routes.has("POST /api/account-directory/accounts/:accountId/follow-ups/:followUpId/archive"));
  assert.ok(routes.has("DELETE /api/account-directory/accounts/:accountId/follow-ups/:followUpId"));
  assert.equal(routes.has("GET /api/account-directory/follow-ups"), false);
  console.log("ok: follow-up routes registered; no org dump; no QB/Moraware writes");
}

console.log("accountDirectoryFollowUps.test.mjs — all passed");
