/**
 * Static contract checks for Full Finance Foundation ops scripts.
 * Run: node quickbooks-sdk-connector/finance-sync/financeQbSyncOps.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, "run-finance-qb-sync.ps1"), "utf8");
const worker = readFileSync(join(here, "sync-finance.ps1"), "utf8");
const readme = readFileSync(join(here, "README.md"), "utf8");
const envExample = readFileSync(join(here, "finance-qb-sync.env.example"), "utf8");

assert.ok(existsSync(join(here, "run-finance-qb-sync.ps1")));
assert.ok(existsSync(join(here, "sync-finance.ps1")));
assert.ok(existsSync(join(here, "finance-qb-sync.env.example")));

assert.ok(wrapper.includes("QB_FINANCE_"));
assert.ok(wrapper.includes("qb-cdata-odbc.lock"));
assert.ok(wrapper.includes("sales-qb-sync.lock"));
assert.ok(wrapper.includes("ad-qb-customer-sync.lock"));
assert.ok(wrapper.includes("***REDACTED***"));
assert.ok(wrapper.includes("sync-finance.ps1"));
assert.ok(wrapper.includes("$PSScriptRoot"));
assert.ok(wrapper.includes("must not equal QB_SALES_SYNC_INGEST_TOKEN"));
assert.ok(wrapper.includes("HistoricalBackfill not passed"));
assert.equal(wrapper.includes("-HistoricalBackfill"), false);
assert.equal(wrapper.toLowerCase().includes("thryve"), false);
assert.equal(/SetEnvironmentVariable\([^\)]*QB_SALES_/i.test(wrapper), false);

assert.ok(worker.includes("Assert-SelectOnlySql"));
assert.ok(worker.includes("ReceivePaymentsAppliedTo"));
assert.ok(worker.includes("BillPaymentChecksAppliedTo"));
assert.ok(worker.includes("DepositLineItems"));
assert.ok(worker.includes("ItemTxnType"));
assert.ok(worker.includes("ItemRefId"));
assert.ok(worker.includes("ProfitAndLossStandard"));
assert.ok(worker.includes("BalanceSheetStandard"));
assert.ok(worker.includes("ReportBasis = 'Accrual'") || worker.includes('ReportBasis = "Accrual"') || worker.includes("ReportBasis = 'Accrual'"));
assert.ok(worker.includes("2024-12-31"));
assert.ok(worker.includes("Phase 1 refuses historical backfill"));
assert.ok(worker.includes("Transactions stored as activity index"));
assert.ok(worker.includes("Do not use ReturnRows") || worker.includes("no ReturnRows"));
assert.equal(worker.toLowerCase().includes("thryve"), false);
assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/i.test(worker.replace(/Assert-SelectOnlySql[\s\S]*?throw/g, "")));

assert.ok(
  worker.includes("SELECT ID, Name, Company, Type, IsActive, AccountNumber, TimeModified FROM Vendors"),
  "Vendors SELECT must use live CData columns Company and Type"
);
assert.ok(worker.includes("company_name = $r.Company"), "map Company -> company_name");
assert.ok(worker.includes("vendor_type_name = $r.Type"), "map Type -> vendor_type_name");
assert.equal(worker.includes("CompanyName"), false, "do not SELECT/map CData CompanyName");
assert.equal(worker.includes("VendorType"), false, "do not SELECT/map CData VendorType");

assert.ok(worker.includes("TransferFromAccountRef_ListID"), "Transfers SELECT must use live from-account ListID");
assert.ok(worker.includes("TransferFromAccountRef_FullName"), "Transfers SELECT must use live from-account name");
assert.ok(worker.includes("TransferToAccountRef_ListID"), "Transfers SELECT must use live to-account ListID");
assert.ok(worker.includes("TransferToAccountRef_FullName"), "Transfers SELECT must use live to-account name");
assert.ok(worker.includes("WHERE TxnDate >="), "Transfers must filter TxnDate");
assert.ok(worker.includes("Convert-ToYmd $r.TxnDate"), "map TxnDate -> txn_date");
assert.ok(worker.includes("from_account_id = $r.TransferFromAccountRef_ListID"));
assert.ok(worker.includes("from_account_name = $r.TransferFromAccountRef_FullName"));
assert.ok(worker.includes("to_account_id = $r.TransferToAccountRef_ListID"));
assert.ok(worker.includes("to_account_name = $r.TransferToAccountRef_FullName"));
assert.equal(worker.includes("TransferFromAccountId"), false, "do not query invalid TransferFromAccountId");
assert.equal(worker.includes("TransferToAccountId"), false, "do not query invalid TransferToAccountId");
assert.equal(worker.includes("FromAccountName"), false, "do not use invalid Transfers fallback FromAccountName");
assert.equal(worker.includes("ToAccountName"), false, "do not use invalid Transfers fallback ToAccountName");
assert.equal(worker.includes("retrying with From/To column names"), false, "do not keep invalid Transfers fallback query");

assert.ok(
  /SELECT ID, ReferenceNumber, Date, CustomerId, CustomerName,\s*Amount, CreditRemaining, Memo, TimeModified\s*FROM CreditMemos/.test(worker),
  "CreditMemos SELECT must use live Amount and CreditRemaining"
);
assert.ok(worker.includes("open_amount = (Convert-ToNumber $r.CreditRemaining)"), "map CreditRemaining -> open_amount");
assert.equal(
  /TotalAmount[\s\S]{0,120}FROM CreditMemos/.test(worker),
  false,
  "do not SELECT CreditMemos TotalAmount"
);
assert.equal(
  /OpenAmount[\s\S]{0,120}FROM CreditMemos/.test(worker),
  false,
  "do not SELECT CreditMemos OpenAmount"
);

assert.ok(
  /SELECT ID, ReferenceNumber, Date, CustomerId, CustomerName,\s*TotalAmount, DepositAccount, DepositAccountId, Memo, TimeModified\s*FROM SalesReceipts/.test(worker),
  "SalesReceipts SELECT must use live DepositAccount / DepositAccountId"
);
assert.ok(worker.includes("deposit_to_account_name = $r.DepositAccount"));
assert.ok(worker.includes("deposit_to_account_id = $r.DepositAccountId"));
assert.equal(
  /DepositToAccount, DepositToAccountId[\s\S]{0,80}FROM SalesReceipts/.test(worker),
  false,
  "do not SELECT SalesReceipts DepositToAccount / DepositToAccountId"
);
assert.equal(
  /DepositToAccountId[\s\S]{0,80}FROM SalesReceipts/.test(worker),
  false,
  "do not SELECT SalesReceipts DepositToAccountId"
);

assert.ok(envExample.includes("QB_FINANCE_DSN=slabOS_QuickBooks_Local_RO"));
assert.ok(envExample.includes("QB_FINANCE_SYNC_INGEST_TOKEN="));
assert.equal(envExample.includes("QB_SALES_SYNC_INGEST_TOKEN="), false);
assert.ok(envExample.includes("must not run 2025") || envExample.includes("must not run 2025 historical") || envExample.includes("not run 2025 historical"));

assert.ok(readme.includes("run-finance-qb-sync.ps1"));
assert.ok(readme.includes("CaptureOpening"));
assert.ok(readme.includes("qb-cdata-odbc.lock"));
assert.ok(readme.includes("14-day") || readme.includes("14-day lookback"));
assert.equal(readme.includes("RunAsPassword"), false);

console.log("financeQbSyncOps.test.mjs — all passed");
