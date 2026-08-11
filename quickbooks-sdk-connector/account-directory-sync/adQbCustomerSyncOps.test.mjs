/**
 * Static contract checks for Account Directory QB customer sync ops scripts.
 * Run: node quickbooks-sdk-connector/account-directory-sync/adQbCustomerSyncOps.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, "run-ad-qb-customer-sync.ps1"), "utf8");
const installer = readFileSync(join(here, "install-ad-qb-customer-sync-task.ps1"), "utf8");
const worker = readFileSync(join(here, "sync-ad-qb-customers.ps1"), "utf8");
const readme = readFileSync(join(here, "README.md"), "utf8");
const envExample = readFileSync(join(here, "ad-qb-customer-sync.env.example"), "utf8");

assert.ok(existsSync(join(here, "run-ad-qb-customer-sync.ps1")));
assert.ok(existsSync(join(here, "install-ad-qb-customer-sync-task.ps1")));
assert.ok(existsSync(join(here, "ad-qb-customer-sync.env.example")));

assert.ok(wrapper.includes("QB_AD_CUSTOMER_"));
assert.ok(wrapper.includes("account-directory-qb-customer-sync"));
assert.ok(wrapper.includes("ad-qb-customer-sync.lock"));
assert.ok(wrapper.includes("Non-overlap") || wrapper.includes("already running"));
assert.ok(wrapper.includes("***REDACTED***"));
assert.ok(wrapper.includes("sync-ad-qb-customers.ps1"));
assert.ok(wrapper.includes("$PSScriptRoot"));
assert.ok(wrapper.includes("C:\\eliteOS\\config\\ad-qb-customer-sync.env"));
assert.ok(wrapper.includes("GitHub\\eOS") || wrapper.includes("Documents\\GitHub\\eOS"));
assert.equal(wrapper.includes("must not equal QB_SALES_SYNC_INGEST_TOKEN"), true);
assert.equal(/SetEnvironmentVariable\([^\)]*QB_SALES/i.test(wrapper), false);
assert.equal(wrapper.toLowerCase().includes("thryve"), false);
assert.equal(wrapper.includes("C:\\eliteOS\\quickbooks-sdk-connector"), false);

assert.ok(installer.includes("slabOS Account Directory QB Customer Sync"));
assert.ok(installer.includes("run-ad-qb-customer-sync.ps1"));
assert.ok(installer.includes("$PSScriptRoot"));
assert.ok(installer.includes("-Apply"));
assert.ok(installer.includes("-Preflight") || installer.includes("Preflight"));
assert.ok(installer.includes("Show-AdQbTaskPreflight") || installer.includes("Read-only Task Scheduler preflight"));
assert.ok(installer.includes("IgnoreNew") || installer.includes("MultipleInstances"));
assert.ok(installer.includes("02:15"));
assert.ok(installer.includes("Dry proposal only") || installer.includes("Preflight only"));
assert.ok(installer.includes("Get-Credential"));
assert.equal(installer.includes("RunAsPassword"), false);
assert.equal(installer.includes("-RunAsPassword"), false);
assert.equal(installer.includes("AsPlainText"), false);
assert.equal(installer.includes("sync-sales-financials"), false);
assert.equal(installer.includes("C:\\eliteOS\\quickbooks-sdk-connector"), false);

assert.ok(envExample.includes("QB_AD_CUSTOMER_DSN=slabOS_QuickBooks_Local_RO"));
assert.ok(envExample.includes("QB_AD_CUSTOMER_SYNC_INGEST_TOKEN="));
assert.ok(envExample.includes("NOT QB_SALES_SYNC_INGEST_TOKEN") || envExample.includes("Never commit"));
assert.ok(envExample.includes("GitHub\\eOS") || envExample.includes("Documents\\GitHub\\eOS"));
assert.equal(envExample.includes("QB_SALES_SYNC_INGEST_TOKEN="), false);

assert.ok(readme.includes("run-ad-qb-customer-sync.ps1"));
assert.ok(readme.includes("C:\\eliteOS\\config\\ad-qb-customer-sync.env"));
assert.ok(readme.includes("C:\\eliteOS\\logs\\account-directory-qb-customer-sync"));
assert.ok(readme.includes("slabOS Account Directory QB Customer Sync"));
assert.ok(readme.includes("install-ad-qb-customer-sync-task.ps1 -Apply"));
assert.ok(readme.includes("-Preflight"));
assert.ok(readme.includes("Documents\\GitHub\\eOS"));
assert.equal(readme.includes("RunAsPassword"), false);
assert.equal(readme.includes("C:\\eliteOS\\quickbooks-sdk-connector"), false);
assert.ok(worker.includes("BillingCity"));
assert.ok(worker.includes("DiagnoseColumns"));

console.log("adQbCustomerSyncOps.test.mjs — all passed");
