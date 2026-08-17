/**
 * Account Directory internal notes — service, store, API, audit.
 * Run: node backend-core/src/accountDirectory/accountDirectoryNotes.test.mjs
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
  AD_NOTE_AUTHOR_FALLBACK,
  AD_NOTE_BODY_MAX,
  AD_NOTES_PAGE_MAX,
  archiveAccountNote,
  createAccountNote,
  listAccountNotes,
  toPublicNote,
  updateAccountNote,
  validateNoteBody
} from "./accountDirectoryNotes.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { createAccountDirectorySupabaseStore } from "./accountDirectorySupabaseStore.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

function ctx(store, extra = {}) {
  return {
    store,
    organizationId: ORG,
    role: "sales",
    actorUserId: ACTOR,
    actorDisplayName: "Chris Henely",
    requestId: "req-notes-1",
    resolveStaffDisplayNames: async () => new Map([[ACTOR, "Chris Henely"]]),
    ...extra
  };
}

async function seedAccount(store, organizationId = ORG, displayName = "Notes Co") {
  const service = createAccountDirectoryService({ store });
  return service.createAccount({
    organizationId,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName }
  });
}

console.log("\naccountDirectoryNotes.test.mjs\n");

{
  const body = validateNoteBody("  hello  ");
  assert.equal(body, "hello");
  assert.throws(() => validateNoteBody("   "), (err) => err instanceof AccountDirectoryError && err.code === "note_body_required");
  assert.throws(() => validateNoteBody(""), (err) => err.code === "note_body_required");
  assert.throws(() => validateNoteBody(null), (err) => err.code === "note_body_required");
  assert.throws(
    () => validateNoteBody("x".repeat(AD_NOTE_BODY_MAX + 1)),
    (err) => err instanceof AccountDirectoryError && err.code === "note_body_too_long"
  );
  assert.equal(validateNoteBody("x".repeat(AD_NOTE_BODY_MAX)).length, AD_NOTE_BODY_MAX);
  console.log("ok: note body trim / empty / max length");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const created = await createAccountNote({
    ...ctx(store),
    accountId: account.id,
    payload: { body: "  Kickoff call completed.  " }
  });
  assert.equal(created.body, "Kickoff call completed.");
  assert.equal(created.author.displayName, "Chris Henely");
  assert.equal(created.edited, false);
  assert.equal(created.rowVersion, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(created, "createdBy"), false);
  const json = JSON.stringify(created);
  assert.equal(/@|token|service.role|createdBy/i.test(json), false);
  assert.equal(json.includes("Kickoff call completed."), true);

  const listed = await listAccountNotes({ ...ctx(store), accountId: account.id });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].id, created.id);
  assert.equal(listed.items[0].author.displayName, "Chris Henely");
  console.log("ok: create note + safe author payload");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  await assert.rejects(
    () => createAccountNote({ ...ctx(store), accountId: account.id, payload: { body: "   " } }),
    (err) => err.code === "note_body_required"
  );
  await assert.rejects(
    () =>
      createAccountNote({
        ...ctx(store),
        accountId: account.id,
        payload: { body: "y".repeat(AD_NOTE_BODY_MAX + 1) }
      }),
    (err) => err.code === "note_body_too_long"
  );
  assert.equal(store.__stats().notes, 0);
  console.log("ok: empty and over-max notes rejected without insert");
}

{
  const store = createAccountDirectoryMemoryStore();
  const a = await seedAccount(store, ORG, "Account A");
  const b = await seedAccount(store, ORG, "Account B");
  await createAccountNote({ ...ctx(store), accountId: a.id, payload: { body: "Only on A" } });
  const listedB = await listAccountNotes({ ...ctx(store), accountId: b.id });
  assert.equal(listedB.items.length, 0);
  const listedA = await listAccountNotes({ ...ctx(store), accountId: a.id });
  assert.equal(listedA.items.length, 1);
  await assert.rejects(
    () => createAccountNote({ ...ctx(store), accountId: "not-a-uuid", payload: { body: "nope" } }),
    (err) => err.code === "invalid_id"
  );
  console.log("ok: notes scoped to exact account UUID; malformed ids rejected");
}

{
  const store = createAccountDirectoryMemoryStore();
  const a = await seedAccount(store, ORG, "Org A Notes");
  const b = await seedAccount(store, ORG_B, "Org B Notes");
  await createAccountNote({ ...ctx(store), accountId: a.id, payload: { body: "secret A" } });
  await assert.rejects(
    () => listAccountNotes({ ...ctx(store, { organizationId: ORG_B }), accountId: a.id }),
    (err) => err.status === 404
  );
  const listedB = await listAccountNotes({ ...ctx(store, { organizationId: ORG_B }), accountId: b.id });
  assert.equal(listedB.items.length, 0);
  const leaked = await store.listAccountNotes(ORG_B, a.id, { page: 1, limit: 25 });
  assert.equal(leaked.items.length, 0);
  console.log("ok: organization isolation");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  await store.insertAccountNote({
    organizationId: ORG,
    accountId: account.id,
    body: "oldest",
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  await store.insertAccountNote({
    organizationId: ORG,
    accountId: account.id,
    body: "middle",
    createdAt: "2026-01-02T00:00:00.000Z"
  });
  await store.insertAccountNote({
    organizationId: ORG,
    accountId: account.id,
    body: "newest",
    createdAt: "2026-01-03T00:00:00.000Z"
  });
  const page1 = await listAccountNotes({ ...ctx(store), accountId: account.id, page: 1, pageSize: 2 });
  assert.deepEqual(
    page1.items.map((n) => n.body),
    ["newest", "middle"]
  );
  assert.equal(page1.pagination.has_more, true);
  assert.equal(page1.pagination.limit, 2);
  const page2 = await listAccountNotes({ ...ctx(store), accountId: account.id, page: 2, pageSize: 2 });
  assert.deepEqual(
    page2.items.map((n) => n.body),
    ["oldest"]
  );
  const bounded = await listAccountNotes({
    ...ctx(store),
    accountId: account.id,
    page: 1,
    pageSize: 999
  });
  assert.equal(bounded.pagination.limit, AD_NOTES_PAGE_MAX);
  console.log("ok: pagination newest-first + bounded page size");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  await assert.rejects(
    () =>
      createAccountNote({
        ...ctx(store, { role: "viewer" }),
        accountId: account.id,
        payload: { body: "should fail" }
      }),
    (err) => err.status === 403 && err.code === "forbidden"
  );
  const listed = await listAccountNotes({ ...ctx(store, { role: "viewer" }), accountId: account.id });
  assert.equal(listed.items.length, 0);
  await assert.rejects(
    () => listAccountNotes({ ...ctx(store), accountId: "99999999-9999-4999-8999-999999999999" }),
    (err) => err.status === 404
  );
  console.log("ok: unauthorized create rejected; viewers may list; missing account 404");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const secret = "INTERNAL_NOTE_BODY_MUST_NOT_AUDIT";
  const created = await createAccountNote({
    ...ctx(store),
    accountId: account.id,
    payload: { body: secret }
  });
  const events = await store.listAuditEvents(ORG, account.id, { limit: 20 });
  const add = events.find((e) => e.action === "add_note");
  assert.ok(add);
  assert.equal(add.entityType, "note");
  assert.equal(add.entityId, created.id);
  assert.equal(add.newValues?.noteId, created.id);
  assert.equal(add.newValues?.bodyLength, secret.length);
  assert.equal(JSON.stringify(add).includes(secret), false);

  const auditBeforeFail = store.__stats().auditEvents;
  const origInsert = store.insertAccountNote.bind(store);
  store.insertAccountNote = async () => {
    throw new AccountDirectoryError("write_failed", "boom", 500);
  };
  await assert.rejects(() =>
    createAccountNote({ ...ctx(store), accountId: account.id, payload: { body: "will fail" } })
  );
  store.insertAccountNote = origInsert;
  assert.equal(store.__stats().auditEvents, auditBeforeFail);
  console.log("ok: audit metadata only; failed mutation does not audit");
}

{
  const store = createAccountDirectoryMemoryStore();
  const account = await seedAccount(store);
  const created = await createAccountNote({
    ...ctx(store),
    accountId: account.id,
    payload: { body: "v1 body" }
  });
  await assert.rejects(
    () =>
      updateAccountNote({
        ...ctx(store),
        accountId: account.id,
        noteId: created.id,
        payload: { body: "stale", rowVersion: 99 }
      }),
    (err) => err.status === 409
  );
  const updated = await updateAccountNote({
    ...ctx(store),
    accountId: account.id,
    noteId: created.id,
    payload: { body: "v2 body", rowVersion: created.rowVersion }
  });
  assert.equal(updated.body, "v2 body");
  assert.equal(updated.edited, true);
  assert.ok(updated.rowVersion > created.rowVersion);

  const archived = await archiveAccountNote({
    ...ctx(store),
    accountId: account.id,
    noteId: created.id,
    payload: { rowVersion: updated.rowVersion }
  });
  assert.equal(archived.archived, true);
  const listed = await listAccountNotes({ ...ctx(store), accountId: account.id });
  assert.equal(listed.items.length, 0);
  const hidden = await store.listAccountNotes(ORG, account.id, { includeArchived: true, page: 1, limit: 10 });
  assert.equal(hidden.items.length, 1);
  assert.ok(hidden.items[0].archivedAt);
  await assert.rejects(
    () =>
      archiveAccountNote({
        ...ctx(store),
        accountId: account.id,
        noteId: created.id,
        payload: { rowVersion: hidden.items[0].rowVersion }
      }),
    (err) => err.status === 404
  );
  const other = await seedAccount(store, ORG, "Other");
  await assert.rejects(
    () =>
      updateAccountNote({
        ...ctx(store),
        accountId: other.id,
        noteId: created.id,
        payload: { body: "cross account" }
      }),
    (err) => err.status === 404
  );
  console.log("ok: edit row-version, archive hides from list, cross-account blocked");
}

{
  const unnamed = toPublicNote(
    {
      id: "44444444-4444-4444-8444-444444444444",
      body: "hi",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdBy: "55555555-5555-4555-8555-555555555555",
      rowVersion: 1
    },
    new Map()
  );
  assert.equal(unnamed.author.displayName, AD_NOTE_AUTHOR_FALLBACK);
  assert.equal(Object.prototype.hasOwnProperty.call(unnamed.author, "email"), false);
  console.log("ok: missing author name falls back to Staff");
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
  await supabaseStore.listAccountNotes(ORG, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { page: 1, limit: 25 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "account_directory_notes");
  assert.deepEqual(calls[0].eqs, [
    ["organization_id", ORG],
    ["account_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]
  ]);
  assert.deepEqual(calls[0].is, [["archived_at", null]]);
  console.log("ok: Supabase list is org+account scoped in query");
}

{
  const memory = createAccountDirectoryMemoryStore();
  const account = await seedAccount(memory);
  const inserted = await memory.insertAccountNote({
    organizationId: ORG,
    accountId: account.id,
    body: "parity",
    createdBy: ACTOR
  });
  const listed = await memory.listAccountNotes(ORG, account.id, { page: 1, limit: 10 });
  assert.equal(listed.items[0].id, inserted.id);
  assert.equal(listed.items[0].body, "parity");
  assert.equal(listed.items[0].organizationId, ORG);
  const patched = await memory.updateAccountNote(ORG, inserted.id, { body: "parity2" }, 1);
  assert.equal(patched.ok, true);
  assert.equal(patched.note.rowVersion, 2);
  console.log("ok: memory store note helpers");
}

{
  const src = readFileSync(join(here, "accountDirectoryNotes.mjs"), "utf8");
  assert.equal(src.includes("linkQuickBooks"), false);
  assert.equal(src.includes("linkMoraware"), false);
  assert.equal(src.includes("insertExternalLink"), false);
  assert.equal(src.includes("quickbooks-desktop"), false);
  const apiSrc = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
  assert.ok(apiSrc.includes("/api/account-directory/accounts/:accountId/notes"));
  assert.ok(apiSrc.includes("/api/account-directory/accounts/:accountId/notes/:noteId/archive"));
  assert.equal(apiSrc.includes("/api/account-directory/notes\""), false);
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
  assert.ok(routes.has("GET /api/account-directory/accounts/:accountId/notes"));
  assert.ok(routes.has("POST /api/account-directory/accounts/:accountId/notes"));
  assert.ok(routes.has("PATCH /api/account-directory/accounts/:accountId/notes/:noteId"));
  assert.ok(routes.has("POST /api/account-directory/accounts/:accountId/notes/:noteId/archive"));
  assert.ok(routes.has("DELETE /api/account-directory/accounts/:accountId/notes/:noteId"));
  assert.equal(routes.has("GET /api/account-directory/notes"), false);
  console.log("ok: notes routes registered; no org dump; no QB/Moraware writes in notes module");
}

console.log("accountDirectoryNotes.test.mjs — all passed");
