/**
 * Regression: bounded account-ID batching for scoped support hydration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ACCOUNT_ID_IN_BATCH_SIZE,
  chunkAccountIds,
  expectedAccountIdBatchQueryCount,
  fetchAllForAccountIdBatches,
  normalizeAccountIds
} from "./accountDirectoryAccountIdBatch.mjs";
import { createAccountDirectorySupabaseStore } from "./accountDirectorySupabaseStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

function uuid(n) {
  const hex = String(n).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function makeIds(count) {
  return Array.from({ length: count }, (_, i) => uuid(i + 1));
}

function createRecordingClient(opts = {}) {
  /** @type {Array<{ table: string, organizationId: string, accountIds: string[] }>} */
  const calls = [];
  const failOnBatchIndex = opts.failOnBatchIndex;
  const rowsByTable = opts.rowsByTable || {};

  const client = {
    from(table) {
      let organizationId = null;
      /** @type {string[]|null} */
      let accountIds = null;
      const builder = {
        select() {
          return builder;
        },
        eq(col, val) {
          if (col === "organization_id") organizationId = val;
          return builder;
        },
        in(col, vals) {
          if (col === "account_id") accountIds = vals;
          return builder;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(async () => {
              assert.equal(colGuard(accountIds), true);
              calls.push({
                table,
                organizationId,
                accountIds: [...(accountIds || [])]
              });
              if (
                failOnBatchIndex != null &&
                calls.filter((c) => c.table === table).length === failOnBatchIndex + 1
              ) {
                return { data: null, error: { message: "simulated batch failure", code: "FETCH" } };
              }
              const all = rowsByTable[table] || [];
              const idSet = new Set(accountIds || []);
              const data = all.filter(
                (r) => r.organization_id === organizationId && idSet.has(r.account_id)
              );
              return { data, error: null };
            })
            .then(resolve, reject);
        }
      };
      return builder;
    }
  };

  function colGuard(ids) {
    assert.ok(Array.isArray(ids));
    assert.ok(ids.length > 0);
    assert.ok(ids.length <= ACCOUNT_ID_IN_BATCH_SIZE);
    return true;
  }

  return { client, calls };
}

async function main() {
  // --- helper unit checks ---
  assert.deepEqual(normalizeAccountIds([]), []);
  assert.deepEqual(normalizeAccountIds([null, "", "  ", "a", "a", " b "]), ["a", "b"]);
  assert.deepEqual(chunkAccountIds([]), []);
  assert.equal(expectedAccountIdBatchQueryCount([]), 0);
  assert.equal(expectedAccountIdBatchQueryCount(makeIds(100)), 1);
  assert.equal(expectedAccountIdBatchQueryCount(makeIds(101)), 2);
  assert.equal(expectedAccountIdBatchQueryCount(makeIds(600)), 6);
  assert.equal(expectedAccountIdBatchQueryCount(makeIds(5000)), 50);
  console.log("ok: 1–2) empty / dedupe / expected query counts (100→1, 600→6, 5000→50)");

  {
    let queries = 0;
    const rows = await fetchAllForAccountIdBatches({
      accountIds: [],
      fetchBatch: async () => {
        queries += 1;
        return [{ id: "x" }];
      }
    });
    assert.equal(queries, 0);
    assert.deepEqual(rows, []);
  }
  console.log("ok: 1) empty ID list performs zero queries");

  {
    const seen = [];
    await fetchAllForAccountIdBatches({
      accountIds: ["a", "a", "b", "b", "a"],
      batchSize: 10,
      fetchBatch: async (chunk) => {
        seen.push(chunk);
        return chunk.map((id) => ({ accountId: id }));
      }
    });
    assert.deepEqual(seen, [["a", "b"]]);
  }
  console.log("ok: 2) duplicate IDs are deduplicated");

  {
    const ids = makeIds(40);
    const seen = [];
    const rows = await fetchAllForAccountIdBatches({
      accountIds: ids,
      fetchBatch: async (chunk) => {
        seen.push(chunk.length);
        return chunk.map((id) => ({ accountId: id }));
      }
    });
    assert.deepEqual(seen, [40]);
    assert.equal(rows.length, 40);
  }
  console.log("ok: 3) small list performs one query");

  {
    const ids = makeIds(ACCOUNT_ID_IN_BATCH_SIZE + 25);
    const seen = [];
    await fetchAllForAccountIdBatches({
      accountIds: ids,
      fetchBatch: async (chunk) => {
        assert.ok(chunk.length <= ACCOUNT_ID_IN_BATCH_SIZE);
        seen.push(chunk.length);
        return [];
      }
    });
    assert.equal(seen.length, 2);
    assert.deepEqual(seen, [ACCOUNT_ID_IN_BATCH_SIZE, 25]);
  }
  console.log("ok: 4–5) oversized list → multiple bounded .in() queries; no oversize batch");

  {
    let calls = 0;
    try {
      await fetchAllForAccountIdBatches({
        accountIds: makeIds(150),
        fetchBatch: async (chunk) => {
          calls += 1;
          if (calls === 2) throw new Error("batch_2_failed");
          return chunk.map((id) => ({ accountId: id }));
        }
      });
      assert.fail("expected throw");
    } catch (err) {
      assert.match(String(err.message), /batch_2_failed/);
      assert.equal(calls, 2);
    }
  }
  console.log("ok: 10) failing batch surfaces error (no silent partial success)");

  // --- store integration with recording client ---
  const org = "org-batch-1";
  const ids = makeIds(230);
  const aliasRows = [
    { id: "al1", organization_id: org, account_id: ids[0], alias_value: "A", alias_source: "manual", normalized_match_value: "a", is_active: true, created_at: "2026-01-01", row_version: 1 },
    { id: "al2", organization_id: org, account_id: ids[150], alias_value: "B", alias_source: "manual", normalized_match_value: "b", is_active: true, created_at: "2026-01-01", row_version: 1 },
    { id: "al-x", organization_id: "other-org", account_id: ids[0], alias_value: "X", alias_source: "manual", normalized_match_value: "x", is_active: true, created_at: "2026-01-01", row_version: 1 }
  ];
  const contactRows = [
    { id: "c1", organization_id: org, account_id: ids[5], display_name: "Pat", is_active: true, created_at: "2026-01-01", row_version: 1 },
    { id: "c2", organization_id: org, account_id: ids[200], display_name: "Sam", is_active: true, created_at: "2026-01-01", row_version: 1 }
  ];
  const locationRows = [
    { id: "l1", organization_id: org, account_id: ids[10], label: "Main", city: "Lisbon", state: "IA", is_active: true, created_at: "2026-01-01", row_version: 1 },
    { id: "l2", organization_id: org, account_id: ids[210], label: "Main", city: "Dyersville", state: "IA", is_active: true, created_at: "2026-01-01", row_version: 1 }
  ];

  {
    const { client, calls } = createRecordingClient({
      rowsByTable: {
        account_directory_aliases: aliasRows,
        account_directory_contacts: contactRows,
        account_directory_locations: locationRows
      }
    });
    const store = createAccountDirectorySupabaseStore(() => client);

    assert.deepEqual(await store.listAliasesForAccountIds(org, []), []);
    assert.equal(calls.length, 0);

    const aliases = await store.listAliasesForAccountIds(org, [...ids, ...ids.slice(0, 10)]);
    const aliasCalls = calls.filter((c) => c.table === "account_directory_aliases");
    assert.equal(aliasCalls.length, 3); // 230 → ceil(230/100)=3
    assert.ok(aliasCalls.every((c) => c.organizationId === org));
    assert.ok(aliasCalls.every((c) => c.accountIds.length <= ACCOUNT_ID_IN_BATCH_SIZE));
    assert.equal(aliases.length, 2);
    assert.deepEqual(
      aliases.map((a) => a.aliasValue).sort(),
      ["A", "B"]
    );

    const contacts = await store.listContactsForAccountIds(org, ids);
    const contactCalls = calls.filter((c) => c.table === "account_directory_contacts");
    assert.equal(contactCalls.length, 3);
    assert.ok(contactCalls.every((c) => c.organizationId === org));
    assert.equal(contacts.length, 2);

    const locations = await store.listLocationsForAccountIds(org, ids);
    const locationCalls = calls.filter((c) => c.table === "account_directory_locations");
    assert.equal(locationCalls.length, 3);
    assert.ok(locationCalls.every((c) => c.organizationId === org));
    assert.equal(locations.length, 2);
    assert.ok(locations.some((l) => l.city === "Lisbon"));
    assert.ok(locations.some((l) => l.city === "Dyersville"));
  }
  console.log("ok: 6–9) aliases/contacts/locations merge across batches; org isolation on every batch");

  {
    const { client } = createRecordingClient({
      failOnBatchIndex: 1,
      rowsByTable: { account_directory_aliases: aliasRows }
    });
    const store = createAccountDirectorySupabaseStore(() => client);
    await assert.rejects(
      () => store.listAliasesForAccountIds(org, ids),
      (err) => {
        assert.match(String(err.message || err), /Could not list aliases for accounts/);
        return true;
      }
    );
  }
  console.log("ok: 10) store surfaces batch failure instead of incomplete support data");

  {
    const recon = readFileSync(
      path.join(ROOT, "backend-core/src/accountDirectory/accountDirectoryMorawareReconciliation.mjs"),
      "utf8"
    );
    const storeSrc = readFileSync(
      path.join(ROOT, "backend-core/src/accountDirectory/accountDirectorySupabaseStore.mjs"),
      "utf8"
    );
    assert.equal(recon.includes("listAliasesForOrganization"), false);
    assert.equal(recon.includes("listContactsForOrganization"), false);
    assert.equal(recon.includes("listLocationsForOrganization"), false);
    assert.ok(recon.includes("listAliasesForAccountIds"));
    assert.ok(recon.includes("listContactsForAccountIds"));
    assert.ok(recon.includes("listLocationsForAccountIds"));
    assert.ok(storeSrc.includes("fetchAllForAccountIdBatches"));
    assert.ok(storeSrc.includes("accountDirectoryAccountIdBatch"));
    // N+1 guard: no per-id loop calling .eq("account_id") inside the ForAccountIds methods
    const aliasFn = storeSrc.split("async listAliasesForAccountIds")[1].split("async insertExternalLink")[0];
    assert.equal(aliasFn.includes("for (const id of"), false);
    assert.equal(aliasFn.includes(".eq(\"account_id\", id)"), false);
    assert.ok(aliasFn.includes(".in(\"account_id\", chunkIds)"));
  }
  console.log("ok: 11–12) Moraware recon stays scoped; no org-wide support; no N+1");

  console.log("\naccountDirectoryAccountIdBatch.test.mjs — all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
