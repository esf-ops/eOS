/** In-memory PostgREST stand-in and fixtures shared by the QuickBooks estimate tests. Test-only. */

export const ORG = "11111111-1111-4111-8111-111111111111";
export const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
export const ACCT = "33333333-3333-4333-8333-333333333333";
export const ID_LEAK = /qb_txn_id|entity_id|TxnLineID|ListID|TxnID|raw_payload|80000[0-9A-F]+-\d+|TXN-|memo-secret/;

/** Minimal PostgREST-like builder over in-memory tables (filters used by the module only). */
export function fakeSupabase(tables) {
  const from = (name) => {
    const filters = [];
    let orders = [];
    let range = null;
    let limit = null;
    let wantCount = false;
    const b = {
      select(_cols, opts) {
        wantCount = opts?.count === "exact";
        return b;
      },
      eq(c, v) { filters.push((r) => String(r[c] ?? "") === String(v)); return b; },
      in(c, vs) { const s = new Set(vs.map(String)); filters.push((r) => s.has(String(r[c]))); return b; },
      gte(c, v) { filters.push((r) => r[c] != null && (typeof v === "number" ? Number(r[c]) >= v : String(r[c]) >= v)); return b; },
      lte(c, v) { filters.push((r) => r[c] != null && (typeof v === "number" ? Number(r[c]) <= v : String(r[c]) <= v)); return b; },
      not(c, _op, _v) { filters.push((r) => r[c] != null); return b; },
      or(expr) {
        const parts = expr.split(/,(?=\w+\.ilike\.)/).map((p) => {
          const [col, , ...rest] = p.split(".");
          const needle = rest.join(".").replace(/^"|"$/g, "").replace(/\*/g, "").toLowerCase();
          return (r) => String(r[col] ?? "").toLowerCase().includes(needle);
        });
        filters.push((r) => parts.some((f) => f(r)));
        return b;
      },
      order(c, { ascending }) { orders.push([c, ascending]); return b; },
      range(a, z) { range = [a, z]; return b; },
      limit(n) { limit = n; return b; },
      maybeSingle() {
        return new Promise((res, rej) => b.then(({ data, error }) => res({ data: data?.[0] ?? null, error }), rej));
      },
      async then(resolve, reject) {
        if (tables.__delayMs) await new Promise((r) => setTimeout(r, tables.__delayMs));
        try {
          let rows = (tables[name] || []).filter((r) => filters.every((f) => f(r)));
          const count = rows.length;
          rows = [...rows].sort((x, y) => {
            for (const [c, asc] of orders) {
              if (x[c] === y[c]) continue;
              const cmp = String(x[c]) < String(y[c]) ? -1 : 1;
              return asc ? cmp : -cmp;
            }
            return 0;
          });
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (limit != null) rows = rows.slice(0, limit);
          resolve({ data: rows, error: null, count: wantCount ? count : null });
        } catch (e) {
          reject(e);
        }
      }
    };
    return b;
  };
  return { from };
}

/** SDK snapshot payloads store scalars as XML text nodes. */
const w = (tag, value) => ({ "@elementName": tag, "#text": value });

export function fixtureTables() {
  const hdr = (id, ref, date, entity, name, amount, type = "Estimate", org = ORG) => ({
    id, organization_id: org, qb_txn_id: `TXN-${id}`, txn_line_id: "", txn_type: type, txn_date: date,
    entity_id: entity, entity_name: name, reference_number: ref, amount, memo: "memo-secret", synced_at: "2026-09-09T06:00:00Z"
  });
  return {
    qb_finance_transaction_index: [
      hdr("aaaaaaaa-0000-4000-8000-000000000001", "26-100", "2026-03-01", "80000A-1", "Acme Homes:Lot 1", 1000),
      hdr("aaaaaaaa-0000-4000-8000-000000000002", "26-101", "2026-04-01", "80000A-1", "Acme Homes:Lot 1", 1200),
      hdr("aaaaaaaa-0000-4000-8000-000000000003", "SO-9", "2026-04-02", "80000A-1", "Acme Homes:Lot 1", 1150, "SalesOrder"),
      { ...hdr("aaaaaaaa-0000-4000-8000-000000000004", "26-200", "2026-05-01", "80000B-2", "Walk In:Smith", 500), synced_at: "2026-08-14T03:00:00Z" },
      hdr("aaaaaaaa-0000-4000-8000-000000000005", "26-300", "2026-05-02", "80000C-3", "Other Org:Job", 9999, "Estimate", OTHER_ORG)
    ],
    ad_qb_customer_facts: [
      { organization_id: ORG, qb_list_id: "80000A-1", parent_list_id: "80000A-0" },
      { organization_id: ORG, qb_list_id: "80000A-0", parent_list_id: null },
      { organization_id: ORG, qb_list_id: "80000B-2", parent_list_id: "80000B-0" },
      { organization_id: ORG, qb_list_id: "80000B-0", parent_list_id: null }
    ],
    account_directory_external_links: [
      { organization_id: ORG, account_id: ACCT, external_system: "quickbooks_desktop", external_id: "80000A-0", is_active: true }
    ],
    account_directory_accounts: [{ organization_id: ORG, id: ACCT, display_name: "Acme Homes" }],
    brain_quickbooks_estimates: [
      {
        organization_id: ORG,
        qb_txn_id: "TXN-aaaaaaaa-0000-4000-8000-000000000001",
        last_seen_at: "2026-07-10T21:00:00Z",
        txn_date: "2026-03-01",
        raw_payload: {
          TxnID: w("TxnID", "TXN-aaaaaaaa-0000-4000-8000-000000000001"),
          TotalAmount: w("TotalAmount", "1000.00"),
          TimeModified: w("TimeModified", "2026-03-02T09:15:00-06:00"),
          Subtotal: w("Subtotal", "1000.00"),
          SalesTaxTotal: w("SalesTaxTotal", "0.00"),
          CustomerRef: { ListID: w("ListID", "80000A-1"), FullName: w("FullName", "Acme Homes:Lot 1") },
          EstimateLineRet: [
            {
              TxnLineID: w("TxnLineID", "L1"),
              ItemRef: { ListID: w("ListID", "80000I-1"), FullName: w("FullName", "Quartz Install") },
              Desc: w("Desc", "Kitchen tops"),
              Quantity: w("Quantity", "40"),
              Rate: w("Rate", "25"),
              Amount: w("Amount", "1,000.00")
            }
          ]
        }
      },
      {
        organization_id: ORG,
        qb_txn_id: "TXN-aaaaaaaa-0000-4000-8000-000000000004",
        last_seen_at: "2026-07-10T21:00:00Z",
        txn_date: "2026-03-01",
        raw_payload: { TotalAmount: w("TotalAmount", "450.00"), EstimateLineRet: { Amount: w("Amount", "450.00") } }
      }
    ],
    sales_quickbooks_sync_runs: [],
    ad_qb_customer_sync_runs: [{ organization_id: ORG, status: "success", completed_at: "2026-09-09T07:00:00Z" }],
    qb_finance_sync_runs: [
      { organization_id: ORG, domain: "accounting", status: "success", started_at: "2026-09-10T01:00:00Z", coverage_start_date: "2026-07-11" },
      { organization_id: ORG, domain: "accounting", status: "success", started_at: "2026-08-14T01:00:00Z", coverage_start_date: "2025-01-01" },
      { organization_id: OTHER_ORG, domain: "accounting", status: "success", started_at: "2026-09-11T01:00:00Z", coverage_start_date: "2026-09-01" }
    ],
    organization_integration_configs: []
  };
}
