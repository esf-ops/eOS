/**
 * Sales QB Financial Truth — ListID enrichment + root resolution (Phase 1).
 * Run: node backend-core/src/sales/quickbooksFinancialTruth/qbListIdEnrichment.test.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyRootListIdsToRows,
  resolveQbRootCustomerListId,
  summarizeListIdCoverage,
  validateTransactionChunk,
  validateOpenArReplacePayload,
  QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES,
  QB_SALES_SYNC_WRITE_TABLES,
  sumTransactionsInRange,
  sumCurrentOpenAr
} from "./index.js";
import { enrichFinancialRowsWithRootListIds } from "./resolveQbRootCustomerListId.js";
import { upsertFinancialTransactions, replaceOpenArSnapshot } from "./syncIngest.js";

const org = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function factsMap(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.qb_list_id, r);
  return m;
}

// C. Exact CustomerId preserved as qb_customer_list_id
{
  const parsed = validateTransactionChunk({
    organization_id: org,
    sync_run_id: runId,
    transactions: [
      {
        transaction_type: "invoice",
        source_id: "I1",
        transaction_date: "2026-08-01",
        amount: 100,
        customer_name: "Gates, Bryan",
        qb_customer_list_id: "80010327-1759266211"
      }
    ]
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.transactions[0].qb_customer_list_id, "80010327-1759266211");
  assert.equal(parsed.value.transactions[0].customer_name, "Gates, Bryan");
  console.log("ok: C exact CustomerId preserved as qb_customer_list_id");
}

// CustomerId alias field accepted; payloads without ListID still valid (B)
{
  const withAlias = validateTransactionChunk({
    organization_id: org,
    sync_run_id: runId,
    transactions: [
      {
        transaction_type: "payment",
        source_id: "P1",
        transaction_date: "2026-08-01",
        amount: 50,
        CustomerId: "80010E11-1770822810"
      }
    ]
  });
  assert.equal(withAlias.ok, true);
  assert.equal(withAlias.value.transactions[0].qb_customer_list_id, "80010E11-1770822810");

  const nameOnly = validateTransactionChunk({
    organization_id: org,
    sync_run_id: runId,
    transactions: [
      {
        transaction_type: "estimate",
        source_id: "E1",
        transaction_date: "2026-08-01",
        amount: 10,
        customer_name: "Same Display Name Co"
      }
    ]
  });
  assert.equal(nameOnly.ok, true);
  assert.equal(nameOnly.value.transactions[0].qb_customer_list_id, null);
  assert.equal(nameOnly.value.transactions[0].qb_root_customer_list_id, null);
  console.log("ok: B CustomerName-only payloads remain valid; no ListID invented");
}

// D. Root CustomerId resolves to itself
{
  const map = factsMap([
    { qb_list_id: "ROOT-1", parent_list_id: null, is_job: false }
  ]);
  const r = resolveQbRootCustomerListId(map, "ROOT-1");
  assert.equal(r.rootListId, "ROOT-1");
  assert.equal(r.reason, null);
  console.log("ok: D root CustomerId resolves to itself");
}

// E. Child/job resolves through ParentId to root
{
  const map = factsMap([
    { qb_list_id: "ROOT-1", parent_list_id: null, is_job: false },
    { qb_list_id: "JOB-1", parent_list_id: "ROOT-1", is_job: true }
  ]);
  const r = resolveQbRootCustomerListId(map, "JOB-1");
  assert.equal(r.rootListId, "ROOT-1");
  console.log("ok: E job CustomerId resolves through ParentId to root");
}

// F. Multi-level child resolves safely
{
  const map = factsMap([
    { qb_list_id: "ROOT", parent_list_id: null, is_job: false },
    { qb_list_id: "MID", parent_list_id: "ROOT", is_job: true },
    { qb_list_id: "LEAF", parent_list_id: "MID", is_job: true }
  ]);
  const r = resolveQbRootCustomerListId(map, "LEAF");
  assert.equal(r.rootListId, "ROOT");
  assert.ok(r.depth >= 2);
  console.log("ok: F multi-level child resolves to root");
}

// G. Missing customer fact => null root
{
  const map = factsMap([{ qb_list_id: "OTHER", parent_list_id: null, is_job: false }]);
  const r = resolveQbRootCustomerListId(map, "MISSING-ID");
  assert.equal(r.rootListId, null);
  assert.equal(r.reason, "missing_customer_fact");
  console.log("ok: G missing customer fact => qb_root_customer_list_id null");
}

// H. Cyclic parent fails safely
{
  const map = factsMap([
    { qb_list_id: "A", parent_list_id: "B", is_job: true },
    { qb_list_id: "B", parent_list_id: "A", is_job: true }
  ]);
  const r = resolveQbRootCustomerListId(map, "A");
  assert.equal(r.rootListId, null);
  assert.equal(r.reason, "cyclic_parent");
  console.log("ok: H cyclic parent fails safely/null (no infinite loop)");
}

// I. Name equality without ListID produces no identity resolution
{
  const map = factsMap([
    { qb_list_id: "REAL-ROOT", parent_list_id: null, is_job: false, name: "Acme Stone" }
  ]);
  const rows = [
    {
      transaction_type: "invoice",
      customer_name: "Acme Stone",
      qb_customer_list_id: null,
      amount: 99
    }
  ];
  const enriched = applyRootListIdsToRows(rows, map);
  assert.equal(enriched.rows[0].qb_root_customer_list_id, null);
  assert.equal(enriched.rows[0].qb_customer_list_id, null);
  const resolverSrc = await fs.readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "resolveQbRootCustomerListId.js"),
    "utf8"
  );
  assert.match(resolverSrc, /never CustomerName/i);
  assert.equal(/\bfuzzy\b/i.test(resolverSrc), false);
  assert.equal(/row\.customer_name/i.test(resolverSrc), false);
  console.log("ok: I name equality without ListID produces no identity resolution");
}

// A. Financial totals unchanged when ListID columns populated
{
  const amounts = [100, 200, 50.5];
  const withoutIds = amounts.reduce((s, n) => s + n, 0);
  const withIds = amounts.reduce((s, n) => s + n, 0);
  assert.equal(withIds, withoutIds);

  const txnRows = [
    { amount: 100, qb_customer_list_id: "A", qb_root_customer_list_id: "A" },
    { amount: 200, qb_customer_list_id: "B", qb_root_customer_list_id: "ROOT" },
    { amount: 50.5, qb_customer_list_id: null, qb_root_customer_list_id: null }
  ];
  const sum = (rows) =>
    Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  assert.equal(sum(txnRows), sum(txnRows.map(({ amount }) => ({ amount }))));

  const makeClient = (rows) => {
    const api = {
      select() {
        return api;
      },
      eq() {
        return api;
      },
      gte() {
        return api;
      },
      lte() {
        return api;
      },
      then(onFulfilled) {
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      }
    };
    return api;
  };
  const supabase = {
    from(table) {
      if (table === "sales_quickbooks_financial_transactions") {
        return makeClient(txnRows);
      }
      if (table === "sales_quickbooks_open_ar_current") {
        return makeClient([
          { balance: 25, qb_customer_list_id: "A", qb_root_customer_list_id: "A" },
          { balance: 10, qb_customer_list_id: null, qb_root_customer_list_id: null }
        ]);
      }
      throw new Error(table);
    }
  };
  const txnSum = await sumTransactionsInRange(supabase, {
    organizationId: org,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    transactionType: "invoice"
  });
  assert.equal(txnSum.amount, 350.5);
  const arSum = await sumCurrentOpenAr(supabase, org);
  assert.equal(arSum.amount, 35);
  console.log("ok: A Sales totals ignore ListID columns (amount/balance only)");
}

// Coverage diagnostics
{
  const rows = [
    { transaction_type: "invoice", qb_customer_list_id: "A", qb_root_customer_list_id: "A" },
    { transaction_type: "invoice", qb_customer_list_id: "B", qb_root_customer_list_id: null },
    { transaction_type: "payment", qb_customer_list_id: null, qb_root_customer_list_id: null }
  ];
  const cov = summarizeListIdCoverage(rows);
  assert.equal(cov.total_rows, 3);
  assert.equal(cov.rows_with_qb_customer_list_id, 2);
  assert.equal(cov.rows_with_qb_root_customer_list_id, 1);
  assert.equal(cov.unresolved_root_count, 2);
  assert.equal(cov.by_transaction_type.invoice.with_customer_list_id, 2);
  console.log("ok: ListID coverage diagnostics by type");
}

// J. Financial ingest cannot mutate Account Directory identity or external links
{
  const writes = [];
  const facts = factsMap([
    { qb_list_id: "ROOT-1", parent_list_id: null, is_job: false },
    { qb_list_id: "JOB-1", parent_list_id: "ROOT-1", is_job: true }
  ]);

  function guardFrom(table) {
    const api = {
      select() {
        return api;
      },
      eq() {
        return api;
      },
      in() {
        return api;
      },
      upsert(rows) {
        writes.push({ table, op: "upsert", rows });
        if (QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES.includes(table)) {
          throw new Error(`forbidden write to ${table}`);
        }
        return Promise.resolve({ error: null, count: rows.length });
      },
      insert(rows) {
        writes.push({ table, op: "insert", rows });
        if (QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES.includes(table)) {
          throw new Error(`forbidden write to ${table}`);
        }
        return Promise.resolve({ error: null });
      },
      update(payload) {
        writes.push({ table, op: "update", payload });
        if (QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES.includes(table)) {
          throw new Error(`forbidden write to ${table}`);
        }
        return {
          eq() {
            return {
              eq() {
                return {
                  select() {
                    return {
                      single() {
                        return Promise.resolve({ data: { id: runId }, error: null });
                      }
                    };
                  }
                };
              }
            };
          }
        };
      },
      delete() {
        writes.push({ table, op: "delete" });
        if (QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES.includes(table)) {
          throw new Error(`forbidden write to ${table}`);
        }
        return {
          eq() {
            return {
              in() {
                return Promise.resolve({ error: null, count: 0 });
              }
            };
          }
        };
      },
      then(onFulfilled) {
        if (table === "ad_qb_customer_facts") {
          const idsWanted = [...facts.keys()];
          const data = idsWanted.map((id) => facts.get(id));
          return Promise.resolve({ data, error: null }).then(onFulfilled);
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      }
    };
    // Make .in() awaitable for facts load
    api.in = function inFn() {
      return {
        then(onFulfilled) {
          if (table === "ad_qb_customer_facts") {
            return Promise.resolve({
              data: [...facts.values()],
              error: null
            }).then(onFulfilled);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled);
        }
      };
    };
    return api;
  }

  const supabase = {
    from(table) {
      return guardFrom(table);
    }
  };

  const parsed = validateTransactionChunk({
    organization_id: org,
    sync_run_id: runId,
    transactions: [
      {
        transaction_type: "invoice",
        source_id: "I-JOB",
        transaction_date: "2026-08-01",
        amount: 12,
        customer_name: "Root Co:Job",
        qb_customer_list_id: "JOB-1"
      }
    ]
  });
  const enriched = await enrichFinancialRowsWithRootListIds(
    supabase,
    org,
    parsed.value.transactions
  );
  assert.equal(enriched.rows[0].qb_root_customer_list_id, "ROOT-1");
  await upsertFinancialTransactions(supabase, enriched.rows);

  const arParsed = validateOpenArReplacePayload({
    organization_id: org,
    sync_run_id: runId,
    open_ar: [
      {
        source_invoice_id: "AR1",
        balance: 5,
        customer_name: "Root Co",
        qb_customer_list_id: "ROOT-1"
      }
    ]
  });
  const arEnriched = await enrichFinancialRowsWithRootListIds(
    supabase,
    org,
    arParsed.value.openAr.map((r) => ({ ...r, transaction_type: "open_ar" }))
  );
  await replaceOpenArSnapshot(
    supabase,
    org,
    arEnriched.rows.map(({ transaction_type: _t, ...rest }) => rest)
  );

  for (const w of writes) {
    assert.ok(
      QB_SALES_SYNC_WRITE_TABLES.includes(w.table),
      `unexpected write table ${w.table}`
    );
    assert.equal(QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES.includes(w.table), false);
  }
  assert.ok(writes.some((w) => w.table === "sales_quickbooks_financial_transactions"));
  assert.ok(writes.some((w) => w.table === "sales_quickbooks_open_ar_current"));
  console.log("ok: J financial ingest writes only sales_* prepared tables (no AD identity/links)");
}

// Migration file present + additive
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const sqlPath = path.join(
    repoRoot,
    "backend-core",
    "supabase",
    "eliteos_sales_quickbooks_financial_truth_listid_v2.sql"
  );
  const sql = await fs.readFile(sqlPath, "utf8");
  assert.match(sql, /qb_customer_list_id/);
  assert.match(sql, /qb_root_customer_list_id/);
  assert.match(sql, /idx_sales_qb_fin_txn_org_root_list_id/);
  assert.match(sql, /idx_sales_qb_open_ar_org_root_list_id/);
  assert.equal(/\bdrop table\b/i.test(sql), false);
  assert.equal(/account_directory_/i.test(sql), false);
  console.log("ok: additive ListID SQL migration present");
}

console.log("All qbListIdEnrichment tests passed.");
