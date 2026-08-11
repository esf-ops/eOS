/**
 * QuickBooks Financial Truth Beta — safety + contract tests.
 * Run: node backend-core/src/sales/quickbooksFinancialTruth/quickbooksFinancialTruth.test.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureQuickBooksFinancialTruthProvider,
  detectSupportedCDataQuickBooksClient,
  getQuickBooksFinancialTruth,
  getQuickBooksFinancialTruthSafe,
  QB_FINANCIAL_TRUTH_STATUSES,
  sanitizeFinancialTruthDiagnostics
} from "./index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Disabled by default — Moraware path must remain independent
{
  const row = await getQuickBooksFinancialTruth({
    startDate: "2026-01-01",
    endDate: "2026-08-10",
    env: { QB_FINANCIAL_TRUTH_ENABLED: "0" }
  });
  assert.equal(row.status, QB_FINANCIAL_TRUTH_STATUSES.DISABLED);
  assert.equal(row.source, "quickbooks_desktop");
  assert.equal(row.estimates.amount, null);
  assert.equal(row.sales_orders.amount, null);
  assert.equal(row.invoices.amount, null);
  assert.equal(row.payments.amount, null);
  assert.equal(row.open_ar.amount, null);
  assert.ok(Array.isArray(row.warnings) && row.warnings.length >= 1);
  assert.equal(row.date_range.start_date, "2026-01-01");
  assert.equal(row.date_range.end_date, "2026-08-10");
  const json = JSON.stringify(row);
  assert.equal(/slabos_ro|Basic\s+[A-Za-z0-9+/=]{8,}/i.test(json), false);
  assert.equal(/"password"\s*:/.test(json), false);
  console.log("ok: QB disabled returns null amounts (not fake $0) + no credentials");
}

// Enabled without supported client → unavailable (not ok, not zeros)
{
  const row = await getQuickBooksFinancialTruth({
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    env: {
      QB_FINANCIAL_TRUTH_ENABLED: "1",
      QB_GATEWAY_URL: "https://qb-host:8166",
      QB_GATEWAY_USER: "slabos_ro",
      QB_GATEWAY_PASSWORD: "super-secret-should-never-leak",
      QB_GATEWAY_SSL_SERVER_CERT: "insecure"
    }
  });
  assert.equal(row.status, QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE);
  assert.equal(row.estimates.amount, null);
  assert.equal(row.sales_orders.amount, null);
  assert.notEqual(row.estimates.amount, 0);
  const json = JSON.stringify(row);
  assert.equal(/super-secret-should-never-leak/.test(json), false);
  assert.equal(/QB_GATEWAY_PASSWORD\s*[:=]/.test(json), false);
  assert.match(String(row.warnings[0] || ""), /unavailable|supported CData/i);
  assert.equal(row.diagnostics?.config?.gateway_password_configured, true);
  assert.equal(row.diagnostics?.config?.gateway_user_configured, true);
  assert.ok(!("password" in (row.diagnostics?.config || {})));
  console.log("ok: enabled without client is unavailable; password never in response");
}

// Fixture maps five financial fields; Sales Orders not Booked
{
  const provider = createFixtureQuickBooksFinancialTruthProvider({
    estimates: { count: 2, amount: 1000 },
    sales_orders: { count: 1, amount: 800 },
    invoices: { count: 1, amount: 750 },
    payments: { count: 1, amount: 500 },
    open_ar: { invoice_count: 1, amount: 250 }
  });
  const row = await getQuickBooksFinancialTruth({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    env: { QB_FINANCIAL_TRUTH_ENABLED: "1" },
    provider
  });
  assert.equal(row.status, "ok");
  assert.equal(row.estimates.amount, 1000);
  assert.equal(row.sales_orders.amount, 800);
  assert.equal(row.invoices.amount, 750);
  assert.equal(row.payments.amount, 500);
  assert.equal(row.open_ar.amount, 250);
  assert.equal(row.diagnostics.label_sales_orders, "Sales Orders $");
  const json = JSON.stringify(row);
  assert.equal(/\bBooked\b|\bSold\b/i.test(json), false);
  console.log("ok: fixture maps five fields; Sales Orders label retained");
}

// Fail-soft: provider throw does not reject
{
  const row = await getQuickBooksFinancialTruthSafe({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    env: { QB_FINANCIAL_TRUTH_ENABLED: "1" },
    provider: {
      async getQuickBooksFinancialTruth() {
        throw new Error("Authorization: Basic dXNlcjpwYXNz and password=boom");
      }
    }
  });
  assert.equal(row.status, "unavailable");
  const json = JSON.stringify(row);
  assert.equal(/dXNlcjpwYXNz|password=boom|Basic\s+dXNl/i.test(json), false);
  console.log("ok: provider exception is fail-soft + redacted");
}

// Sanitize strips secret keys
{
  const cleaned = sanitizeFinancialTruthDiagnostics({
    password: "nope",
    nested: { authorization: "Basic abc", ok: true },
    message: "failed Basic YWJjZGVmZ2hpams= mid"
  });
  assert.equal(cleaned.password, "[redacted]");
  assert.equal(cleaned.nested.authorization, "[redacted]");
  assert.equal(cleaned.nested.ok, true);
  assert.equal(cleaned.message, "[redacted]");
  console.log("ok: diagnostics sanitizer redacts secrets");
}

// Detect no supported client in this repo runtime
{
  const det = detectSupportedCDataQuickBooksClient({
    env: {},
    requireResolve: () => {
      throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
    }
  });
  assert.equal(det.available, false);
  assert.match(det.reason, /No supported CData/);
  console.log("ok: supported CData client detection reports missing");
}

// Source scan: no write provider methods in this package
{
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".js") && !f.endsWith(".mjs")) continue;
    if (f.endsWith(".test.mjs")) continue;
    const src = await fs.readFile(path.join(dir, f), "utf8");
    assert.equal(/EstimateAdd|InvoiceAdd|SalesOrderAdd|ReceivePaymentAdd|TxnDelRq|ListDelRq/.test(src), false, f);
    assert.equal(/\b(EstimateAddRq|InvoiceAddRq|SalesOrderAddRq|ReceivePaymentAddRq)\b/.test(src), false, f);
    assert.equal(/thryve/i.test(src), false, f);
  }
  console.log("ok: financial truth package has no write methods / thryve identity");
}

// Open A/R basis documented as as-of refresh
{
  const row = await getQuickBooksFinancialTruth({
    env: { QB_FINANCIAL_TRUTH_ENABLED: "0" }
  });
  assert.equal(row.open_ar.basis, "as_of_refresh");
  assert.match(row.open_ar.basis_note, /as of refresh/i);
  console.log("ok: Open A/R basis documented as as-of refresh");
}

console.log("All QuickBooks Financial Truth Beta tests passed.");
