/**
 * Static contract checks for Sales QB Financial Truth sync ops scripts.
 * Run: node quickbooks-sdk-connector/sales-sync/salesQbSyncOps.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, "run-sales-qb-sync.ps1"), "utf8");
const installer = readFileSync(join(here, "install-sales-qb-sync-task.ps1"), "utf8");
const worker = readFileSync(join(here, "sync-sales-financials.ps1"), "utf8");
const readme = readFileSync(join(here, "README.md"), "utf8");
const envExample = readFileSync(join(here, "sales-qb-sync.env.example"), "utf8");

assert.ok(existsSync(join(here, "run-sales-qb-sync.ps1")));
assert.ok(existsSync(join(here, "install-sales-qb-sync-task.ps1")));
assert.ok(existsSync(join(here, "sales-qb-sync.env.example")));

assert.ok(wrapper.includes("QB_SALES_"));
assert.ok(wrapper.includes("sales-qb-sync"));
assert.ok(wrapper.includes("sales-qb-sync.lock"));
assert.ok(wrapper.includes("Non-overlap") || wrapper.includes("already running"));
assert.ok(wrapper.includes("***REDACTED***"));
assert.ok(wrapper.includes("sync-sales-financials.ps1"));
assert.ok(wrapper.includes("$PSScriptRoot"));
assert.ok(wrapper.includes("C:\\eliteOS\\config\\sales-qb-sync.env"));
assert.ok(wrapper.includes("LookbackDays") || wrapper.includes("LOOKBACK"));
assert.ok(wrapper.includes("-Backfill"));
assert.equal(wrapper.includes("must not equal QB_AD_CUSTOMER_SYNC_INGEST_TOKEN"), true);
assert.equal(/SetEnvironmentVariable\([^\)]*QB_AD_CUSTOMER/i.test(wrapper), false);
assert.equal(wrapper.toLowerCase().includes("thryve"), false);
assert.equal(wrapper.includes("C:\\eliteOS\\quickbooks-sdk-connector"), false);
assert.ok(wrapper.includes("if ($Backfill)"));
assert.ok(wrapper.includes('"-Backfill"') || wrapper.includes("'-Backfill'"));
assert.ok(wrapper.includes("Mode=incremental"));

assert.ok(installer.includes("eliteOS QuickBooks Sales Sync"));
assert.ok(installer.includes("run-sales-qb-sync.ps1"));
assert.ok(installer.includes("$PSScriptRoot"));
assert.ok(installer.includes("-Apply"));
assert.ok(installer.includes("Preflight"));
assert.ok(installer.includes("IgnoreNew") || installer.includes("MultipleInstances"));
assert.ok(installer.includes("EveryHours") || installer.includes("every 2 hour"));
assert.ok(installer.includes("slabOS Account Directory QB Customer Sync"));
assert.ok(installer.includes("Get-Credential"));
assert.equal(installer.includes("RunAsPassword"), false);
assert.equal(installer.includes("AsPlainText"), false);
assert.equal(installer.includes("EveryMinutes"), false);
assert.equal(installer.includes("C:\\eliteOS\\quickbooks-sdk-connector"), false);
assert.ok(installer.includes("Do not schedule") || installer.includes("not schedule"));
assert.ok(!/\$arg\s*=.*Backfill/i.test(installer), "scheduled action must not pass -Backfill");
assert.ok(!/New-ScheduledTaskAction[\s\S]{0,200}-Backfill/i.test(installer));
// Trigger: construct Once with -RepetitionInterval; omit Duration; never mutate .RepetitionInterval.
assert.ok(/New-ScheduledTaskTrigger[\s\S]*?-RepetitionInterval/.test(installer));
assert.equal(installer.includes("[TimeSpan]::MaxValue"), false);
assert.equal(installer.includes("TimeSpan]::MaxValue"), false);
assert.equal(/RepetitionDuration\s*=/.test(installer), false);
assert.equal(/-RepetitionDuration\b/.test(installer), false);
assert.equal(/\$taskTrigger\.RepetitionInterval\s*=/.test(installer), false);
assert.ok(installer.includes("New-ScheduledTaskTrigger"));
assert.ok(installer.includes("-Once"));
assert.ok(installer.includes("ExecutionTimeLimit") || installer.includes("New-TimeSpan -Hours 2"));
assert.equal(installer.includes("P99999999DT23H59M59S"), false);

assert.ok(envExample.includes("QB_SALES_DSN=slabOS_QuickBooks_Local_RO"));
assert.ok(envExample.includes("QB_SALES_SYNC_INGEST_TOKEN="));
assert.ok(envExample.includes("QB_AD_CUSTOMER_SYNC_INGEST_TOKEN") === false || envExample.includes("Do NOT set or reuse"));
assert.equal(envExample.includes("QB_AD_CUSTOMER_SYNC_INGEST_TOKEN="), false);

assert.ok(readme.includes("run-sales-qb-sync.ps1"));
assert.ok(readme.includes("C:\\eliteOS\\config\\sales-qb-sync.env"));
assert.ok(readme.includes("C:\\eliteOS\\logs\\sales-qb-sync"));
assert.ok(readme.includes("eliteOS QuickBooks Sales Sync"));
assert.ok(readme.includes("every **2 hours**") || readme.includes("every 2 hours"));
assert.ok(readme.includes("-Preflight"));
assert.ok(readme.includes("Documents\\GitHub\\eOS") || readme.includes("GitHub\\eOS"));
assert.equal(readme.includes("RunAsPassword"), false);
assert.equal(readme.includes("every 15 minutes"), false);

assert.ok(worker.includes("QB_SALES_SYNC_LOOKBACK_DAYS"));
assert.ok(worker.includes("Assert-SelectOnlySql") || worker.includes("SELECT"));
assert.ok(worker.includes("CustomerId"));
assert.ok(worker.includes("qb_customer_list_id"));
assert.ok(worker.includes("DueDate"));
assert.ok(worker.includes("Terms"));
assert.ok(worker.includes("due_date"));
assert.ok(worker.includes("terms_name"));
assert.ok(/Open A\/R DueDate coverage/.test(worker));
assert.ok(/SELECT Id, ReferenceNumber, Date, CustomerId, CustomerName/.test(worker));
assert.equal(worker.toLowerCase().includes("thryve"), false);
assert.equal(/fuzzy|auto-link|CustomerName.*join/i.test(worker), false);

console.log("salesQbSyncOps.test.mjs — all passed");
