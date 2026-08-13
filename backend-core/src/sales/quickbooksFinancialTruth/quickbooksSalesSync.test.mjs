/**
 * QuickBooks Sales ODBC sync ingest + prepared-facts tests (synthetic only).
 * Run: node backend-core/src/sales/quickbooksFinancialTruth/quickbooksSalesSync.test.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  constantTimeEqualString,
  validateBeginPayload,
  validateTransactionChunk,
  validateOpenArReplacePayload,
  validateCompletePayload,
  QB_FINANCIAL_TRUTH_STATUSES,
  getPreparedQuickBooksFinancialTruth,
  emptyQuickBooksFinancialTruth
} from "./index.js";
import { requireQuickBooksSalesSyncToken } from "./syncAuth.js";

const org = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

// Auth rejects invalid token
{
  const env = { QB_SALES_SYNC_INGEST_TOKEN: "expected-token-value-32chars!!" };
  const res = mockRes();
  const ok = requireQuickBooksSalesSyncToken(
    { header: (n) => (String(n).toLowerCase() === "authorization" ? "Bearer wrong-token-value-32chars!!!!" : "") },
    res,
    env
  );
  assert.equal(ok, false);
  assert.equal(res.statusCode, 401);
  console.log("ok: ingest auth rejects invalid token");
}

{
  const env = { QB_SALES_SYNC_INGEST_TOKEN: "expected-token-value-32chars!!" };
  const res = mockRes();
  const ok = requireQuickBooksSalesSyncToken(
    { header: (n) => (String(n).toLowerCase() === "authorization" ? "Bearer expected-token-value-32chars!!" : "") },
    res,
    env
  );
  assert.equal(ok, true);
  assert.equal(constantTimeEqualString("abc", "abc"), true);
  assert.equal(constantTimeEqualString("abc", "abd"), false);
  console.log("ok: ingest auth accepts matching bearer token");
}

// Malformed / empty open AR cannot wipe
{
  const empty = validateOpenArReplacePayload({
    organization_id: org,
    sync_run_id: runId,
    open_ar: [],
    allow_empty_open_ar: false
  });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(" "), /refusing to wipe/i);
  console.log("ok: empty open_ar without allow flag rejected");
}

{
  const bad = validateOpenArReplacePayload({
    organization_id: org,
    sync_run_id: runId,
    open_ar: [{ source_invoice_id: "I1", balance: 0 }]
  });
  assert.equal(bad.ok, false);
  console.log("ok: non-positive open_ar balance rejected");
}

// Transaction field mapping validation (synthetic)
{
  const parsed = validateTransactionChunk({
    organization_id: org,
    sync_run_id: runId,
    transactions: [
      { transaction_type: "estimate", source_id: "E1", transaction_date: "2026-08-01", amount: 100.5 },
      { transaction_type: "sales_order", source_id: "S1", transaction_date: "2026-08-02", amount: 200 },
      { transaction_type: "invoice", source_id: "I1", transaction_date: "2026-08-03", amount: 300 },
      { transaction_type: "payment", source_id: "P1", transaction_date: "2026-08-04", amount: 150 }
    ]
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.transactions[0].amount, 100.5);
  assert.equal(parsed.value.transactions[1].transaction_type, "sales_order");
  assert.equal(parsed.value.transactions[2].transaction_type, "invoice");
  assert.equal(parsed.value.transactions[3].transaction_type, "payment");
  const json = JSON.stringify(parsed.value);
  assert.equal(/\bBooked\b/i.test(json), false);
  console.log("ok: estimate/sales_order/invoice/payment amount mapping validated");
}

{
  const ar = validateOpenArReplacePayload({
    organization_id: org,
    sync_run_id: runId,
    open_ar: [{ source_invoice_id: "I9", balance: 55.25, original_amount: 100, invoice_date: "2026-07-01" }]
  });
  assert.equal(ar.ok, true);
  assert.equal(ar.value.openAr[0].balance, 55.25);
  console.log("ok: open A/R maps from Balance");
}

// Idempotent upsert semantics via unique key fields present
{
  const a = validateTransactionChunk({
    organization_id: org,
    sync_run_id: runId,
    transactions: [
      { transaction_type: "estimate", source_id: "E1", transaction_date: "2026-08-01", amount: 10 },
      { transaction_type: "estimate", source_id: "E1", transaction_date: "2026-08-01", amount: 11 }
    ]
  });
  assert.equal(a.ok, true);
  assert.equal(a.value.transactions.length, 2);
  assert.equal(a.value.transactions[0].source_id, a.value.transactions[1].source_id);
  console.log("ok: duplicate source_id rows accepted for idempotent upsert conflict key");
}

// Begin / complete payload basics
{
  assert.equal(validateBeginPayload({ organization_id: org, worker_version: "1.0.0" }).ok, true);
  assert.equal(
    validateCompletePayload({ organization_id: org, sync_run_id: runId, status: "success" }).ok,
    true
  );
  console.log("ok: begin/complete payload validation");
}

// Prepared facts: stale shows amounts, not null zeros
{
  const now = new Date("2026-08-11T12:00:00.000Z");
  const supabase = {
    from(table) {
      if (table === "sales_quickbooks_sync_runs") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          async maybeSingle() {
            return {
              data: {
                id: runId,
                status: "success",
                completed_at: "2026-08-11T01:00:00.000Z",
                worker_version: "1.0.0",
                company_name: "Elite Stone Fabrications",
                coverage_start_date: "2026-01-01",
                coverage_end_date: "2026-08-11",
                warnings: []
              },
              error: null
            };
          }
        };
      }
      // transactions / open_ar
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte() {
          return this;
        },
        lte() {
          return this;
        },
        then(resolve) {
          // not used
          return resolve({ data: [], error: null });
        },
        async maybeSingle() {
          return { data: null, error: null };
        }
      };
    }
  };

  // Patch: supabase query builder needs awaitable thenable for select chains
  const makeTxnClient = (rows) => {
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
      order() {
        return api;
      },
      range() {
        return api;
      },
      then(onFulfilled) {
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      }
    };
    return api;
  };

  const supabase2 = {
    from(table) {
      if (table === "sales_quickbooks_sync_runs") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          async maybeSingle() {
            return {
              data: {
                id: runId,
                status: "success",
                completed_at: "2026-08-11T01:00:00.000Z",
                worker_version: "1.0.0",
                company_name: "Synthetic Co",
                coverage_start_date: "2026-01-01",
                coverage_end_date: "2026-08-11",
                warnings: []
              },
              error: null
            };
          }
        };
      }
      if (table === "sales_quickbooks_financial_transactions") {
        return makeTxnClient([{ amount: 100 }, { amount: 50 }]);
      }
      if (table === "sales_quickbooks_open_ar_current") {
        return makeTxnClient([{ balance: 25 }]);
      }
      throw new Error(`unexpected table ${table}`);
    }
  };

  const row = await getPreparedQuickBooksFinancialTruth({
    supabase: supabase2,
    organizationId: org,
    startDate: "2026-08-01",
    endDate: "2026-08-11",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "3600" },
    now
  });
  assert.equal(row.status, QB_FINANCIAL_TRUTH_STATUSES.STALE);
  assert.ok(row.estimates.amount != null);
  assert.notEqual(row.estimates.amount, null);
  assert.match(String(row.warnings[0] || ""), /stale/i);
  assert.equal(row.source, "quickbooks_desktop_odbc");
  assert.equal(row.diagnostics.label_sales_orders, "Sales Orders $");
  assert.equal(/\bBooked\b/i.test(JSON.stringify(row)), false);
  assert.equal(/token|password|secret/i.test(JSON.stringify(row.diagnostics)), false);
  console.log("ok: stale sync returns amounts + stale warning (not fake null/$0 wipe)");
}

// replaceOpenArSnapshot deletes ids no longer present (unit with mock supabase)
{
  const { replaceOpenArSnapshot } = await import("./syncIngest.js");
  const deleted = [];
  const upserted = [];
  const supabase = {
    from(table) {
      assert.equal(table, "sales_quickbooks_open_ar_current");
      return {
        upsert(rows) {
          upserted.push(...rows);
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq() {
              return Promise.resolve({
                data: [{ source_invoice_id: "OLD" }, { source_invoice_id: "KEEP" }],
                error: null
              });
            }
          };
        },
        delete() {
          return {
            eq() {
              return {
                in(_col, ids) {
                  deleted.push(...ids);
                  return Promise.resolve({ error: null, count: ids.length });
                }
              };
            }
          };
        }
      };
    }
  };
  const result = await replaceOpenArSnapshot(supabase, org, [
    {
      organization_id: org,
      source_invoice_id: "KEEP",
      balance: 10,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]);
  assert.equal(result.upserted, 1);
  assert.deepEqual(deleted, ["OLD"]);
  console.log("ok: open A/R replacement removes invoices no longer open");
}

// Worker SELECT-only static safety
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const workerPath = path.join(repoRoot, "quickbooks-sdk-connector", "sales-sync", "sync-sales-financials.ps1");
  const ps1 = await fs.readFile(workerPath, "utf8");
  const bytes = await fs.readFile(workerPath);
  assert.equal(bytes.some((b) => b > 0x7f), false, "worker must be ASCII-only");
  assert.match(ps1, /Assert-SelectOnlySql/);
  assert.match(ps1, /slabOS_QuickBooks_Local_RO/);
  assert.match(ps1, /Elite Stone Fabrications/);
  assert.match(ps1, /FROM Estimates/);
  assert.match(ps1, /FROM SalesOrders/);
  assert.match(ps1, /FROM Invoices/);
  assert.match(ps1, /FROM ReceivePayments/);
  assert.match(ps1, /IsPaid = false/);
  assert.match(ps1, /TotalAmount/);
  assert.match(ps1, /SELECT Id, ReferenceNumber, Date, CustomerId, CustomerName, Amount\s+FROM Invoices/s);
  assert.match(ps1, /SELECT Id, ReferenceNumber, Date, CustomerId, CustomerName, TotalAmount\s+FROM Estimates/s);
  assert.match(ps1, /SELECT Id, ReferenceNumber, Date, CustomerId, CustomerName, TotalAmount\s+FROM SalesOrders/s);
  assert.match(ps1, /SELECT Id, ReferenceNumber, Date, CustomerId, CustomerName, Amount, UnusedPayment\s+FROM ReceivePayments/s);
  assert.match(ps1, /qb_customer_list_id/);
  assert.match(ps1, /CustomerId/);
  assert.equal(/SELECT Id, ReferenceNumber, Date, CustomerName, TotalAmount\s+FROM Invoices/s.test(ps1), false);
  assert.equal(/\bINSERT INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE FROM\b/i.test(ps1), false);
  assert.equal(/QBXMLRP2|Remote Connector|8166|Thryve/i.test(ps1), false);
  assert.match(ps1, /Assert-SelectOnlySql/);
  assert.match(ps1, /\(\?i\)SELECT\\b/);
  // Windows PowerShell 5.1: must set ConnectionString after New-Object (not ctor arg).
  assert.match(ps1, /New-Object System\.Data\.Odbc\.OdbcConnection\s*$/m);
  assert.match(ps1, /\$conn\.ConnectionString\s*=\s*"DSN=\$Dsn"/);
  assert.equal(/New-Object System\.Data\.Odbc\.OdbcConnection\s*\(\s*"DSN=/i.test(ps1), false);
  // PS 5.1: never wrap Generic.List vars with @($list) — use .ToArray() / [array].
  assert.match(ps1, /\$rows\.ToArray\(\)/);
  assert.match(ps1, /\$windows\.ToArray\(\)/);
  const listVars = [
    ...ps1.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*New-Object\s+System\.Collections\.Generic\.List/g)
  ].map((m) => m[1]);
  assert.ok(listVars.length >= 5, `expected Generic.List locals, got ${listVars.join(",")}`);
  for (const name of listVars) {
    assert.equal(
      new RegExp(`@\\(\\$${name}\\)`).test(ps1),
      false,
      `must not wrap $${name} with @() (PS 5.1 Generic.List bug)`
    );
  }
  assert.equal(/return\s+@\(\$/m.test(ps1), false);
  console.log("ok: worker is ASCII + SELECT-only + CustomerId ListID enrichment + correct invoice Amount mapping");
  console.log("ok: ODBC connection uses PS 5.1 ConnectionString property form");
  console.log("ok: no @($Generic.List) wrapping; uses ToArray/[array]");
}

{
  const empty = emptyQuickBooksFinancialTruth({ status: "unavailable" });
  assert.equal(empty.sales_orders.amount, null);
  assert.match(empty.open_ar.basis_note, /as of refresh|latest/i);
  console.log("ok: unavailable template keeps null amounts + as-of-refresh A/R note");
}

console.log("All QuickBooks Sales ODBC sync tests passed.");
