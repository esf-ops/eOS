import assert from "node:assert/strict";
import {
  normalizeAccountWritePayload,
  resolveDisplayNameFromBody
} from "./accountDirectoryPayload.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { resolveAccountDirectoryStore } from "./accountDirectoryApi.js";

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000099";

async function main() {
  {
    const r = resolveDisplayNameFromBody({ displayName: "A", name: "B" });
    assert.equal(r.displayName, "A");
    assert.equal(r.usedDeprecatedNameAlias, false);
  }

  {
    const r = resolveDisplayNameFromBody({ name: " Legacy Name " });
    assert.equal(r.displayName, "Legacy Name");
    assert.equal(r.usedDeprecatedNameAlias, true);
  }

  {
    const n = normalizeAccountWritePayload({ displayName: "   " }, { requireDisplayName: true });
    assert.equal(n.ok, false);
    assert.equal(n.code, "display_name_required");
  }

  {
    const n = normalizeAccountWritePayload({}, { requireDisplayName: true });
    assert.equal(n.ok, false);
    assert.equal(n.code, "display_name_required");
  }

  {
    const n = normalizeAccountWritePayload(
      {
        displayName: "TEST ACCOUNT",
        primaryEmail: "test-account-directory@example.com",
        primaryPhone: "555-0100",
        city: "Test City",
        state: "ID",
        notes: "should be dropped"
      },
      { requireDisplayName: true }
    );
    assert.equal(n.ok, true);
    assert.equal(n.payload.displayName, "TEST ACCOUNT");
    assert.equal(n.payload.primaryEmail, "test-account-directory@example.com");
    assert.equal(n.payload.primaryPhone, "555-0100");
    assert.equal(n.payload.city, "Test City");
    assert.equal(n.payload.state, "ID");
    assert.equal("notes" in n.payload, false);
    assert.equal("name" in n.payload, false);
  }

  {
    const n = normalizeAccountWritePayload({ name: "Compat Co" }, { requireDisplayName: true });
    assert.equal(n.ok, true);
    assert.equal(n.payload.displayName, "Compat Co");
    assert.equal(n.usedDeprecatedNameAlias, true);
    assert.equal("name" in n.payload, false);
  }

  {
    const n = normalizeAccountWritePayload({ displayName: { x: 1 } }, { requireDisplayName: true });
    assert.equal(n.ok, false);
    assert.equal(n.code, "invalid_display_name_type");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    await assert.rejects(
      () =>
        service.createAccount({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          payload: { name: "Should Fail" }
        }),
      (e) => e.code === "display_name_required"
    );
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const account = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: {
        displayName: "TEST ACCOUNT",
        primaryEmail: "test-account-directory@example.com",
        primaryPhone: "555-0100",
        city: "Test City",
        state: "ID"
      }
    });
    assert.equal(account.displayName || account.name, "TEST ACCOUNT");
    assert.equal(account.primaryEmail, "test-account-directory@example.com");
    assert.equal(account.city, "Test City");
    assert.equal(account.contacts.length, 1);
    assert.equal(account.locations.length, 1);
    assert.ok(account.auditHistory?.some((e) => e.action === "create_account"));

    const bare = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Bare Account" }
    });
    assert.equal(bare.contacts.length, 0);
    assert.equal(bare.locations.length, 0);

    const prospect = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Prospect X" },
      asProspect: true
    });
    assert.equal(prospect.status, "prospect");

    const updated = await service.updateAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { displayName: "TEST ACCOUNT 2", rowVersion: account.rowVersion }
    });
    assert.equal(updated.name, "TEST ACCOUNT 2");
  }

  {
    const mem = resolveAccountDirectoryStore({
      getSupabase: () => {
        throw new Error("should not use supabase");
      }
    });
    assert.equal(mem.kind, "memory");

    const prev = process.env.ACCOUNT_DIRECTORY_STORE;
    process.env.ACCOUNT_DIRECTORY_STORE = "supabase";
    const sb = resolveAccountDirectoryStore({
      getSupabase: () => ({ from() { throw new Error("no network"); } }),
      _supabaseStore: { kind: "supabase" }
    });
    assert.equal(sb.kind, "supabase");
    if (prev == null) delete process.env.ACCOUNT_DIRECTORY_STORE;
    else process.env.ACCOUNT_DIRECTORY_STORE = prev;
  }

  console.log("accountDirectoryPayload.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
