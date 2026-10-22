#!/usr/bin/env node
/**
 * Phase 1 operator CLI — QuickBooks EstimateAdd DRY RUN.
 *
 * Validates env, optionally uses SDK query results passed via flags/env,
 * loads mappings from Supabase, upserts one queue row, builds EstimateAdd qbXML,
 * prints sanitized preview, and STOPS. Never transmits EstimateAdd.
 *
 * Usage (from repo root, with service-role env):
 *   QB_WRITE_ENABLED=true \
 *   QB_WRITE_ENV=test \
 *   QB_WRITE_DRY_RUN=true \
 *   QB_WRITE_ORGANIZATION_ID=<org-uuid> \
 *   QB_WRITE_TEST_COMPANY_ALLOWLIST='EliteOS QuickBooks TEST' \
 *   QB_WRITE_FORBIDDEN_COMPANY_IDENTITIES='Elite Stone Fabrications' \
 *   QB_WRITE_COMPANY_IDENTITY='EliteOS QuickBooks TEST' \
 *   QB_WRITE_CUSTOMER_LIST_ID=<list-id-from-CustomerQuery> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/qbEstimateDryRun.mjs
 *
 * Prefer the Windows wrapper:
 *   quickbooks-sdk-connector/estimate-write/dry-run-estimate-write.ps1
 */

import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import { runQbEstimateDryRun } from "../quotes/quoteQbCatalog/quoteQbEstimateDryRun.js";

function printLines(lines) {
  for (const line of lines) console.log(line);
}

async function main() {
  const env = process.env;
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    printLines(["Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (names only — values not printed)."]);
    process.exitCode = 1;
    return;
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const companyIdentity = String(env.QB_WRITE_COMPANY_IDENTITY || "").trim() || null;
  const customerListId = String(env.QB_WRITE_CUSTOMER_LIST_ID || "").trim() || null;

  const result = await runQbEstimateDryRun({
    env,
    db,
    transport: null,
    skipSdkQueries: true,
    companyIdentityOverride: companyIdentity,
    customerListIdOverride: customerListId,
    persistQueue: true,
    // Phase 1.1: dry-run never claims — claimQueue is ignored by orchestrator.
    claimQueue: false
  });

  const lines = [
    "eliteOS QuickBooks EstimateAdd — Phase 1 DRY RUN",
    `ok=${result.ok} stage=${result.stage}`,
    result.dryRunBanner,
    ""
  ];

  if (result.errors?.length) {
    lines.push("Errors:");
    for (const e of result.errors) lines.push(`  - ${e.code}: ${e.message}`);
    lines.push("");
  }

  if (result.companyIdentity) lines.push(`Company identity: ${result.companyIdentity}`);
  if (result.customerListId) lines.push(`Customer ListID: ${result.customerListId}`);
  if (result.customerFullName) lines.push(`Customer FullName: ${result.customerFullName}`);
  if (result.idempotencyKey) lines.push(`Idempotency key: ${result.idempotencyKey}`);
  if (result.queueRow?.id) {
    lines.push(`Queue row: id=${result.queueRow.id} status=${result.queueRow.status}`);
  }
  if (result.mappingsUsed?.length) {
    lines.push("", "Mappings used:");
    for (const m of result.mappingsUsed) {
      lines.push(`  - ${m.eliteos_concept_key} → ${m.qb_list_id} (${m.qb_full_name || "no FullName"}) [${m.pricing_source}]`);
    }
  }
  if (result.itemValidation?.results?.length) {
    lines.push("", "Item validation:");
    for (const r of result.itemValidation.results) {
      lines.push(
        `  - ${r.listId} | ${r.observedFullName || r.expectedFullName} | active=${r.isActive} | ${r.ok ? "PASS" : "FAIL"}`
      );
    }
  }
  if (result.transmitBlocked) {
    lines.push("", `Transmit guard: ${result.transmitBlocked}`);
  }
  if (result.addGuard) {
    lines.push(
      `ProcessRequest Add guard: blocked=${result.addGuard.blocked} transmitted=${result.addGuard.transmitted}`
    );
  }
  if (result.estimateAddQbXml) {
    const hasAmount = /<Amount>/i.test(result.estimateAddQbXml);
    lines.push("", `EstimateLineAdd Amount tags present: ${hasAmount ? "YES (UNEXPECTED)" : "no"}`);
    lines.push("", "----- EstimateAdd qbXML that WOULD be sent (NOT SENT) -----");
    lines.push(result.estimateAddQbXml);
    lines.push("----- end qbXML -----");
  }
  lines.push("", result.dryRunBanner);

  printLines(lines);

  // Optional operator artifact (paths only; no secrets).
  const outPath = String(env.QB_WRITE_DRY_RUN_REPORT_PATH || "").trim();
  if (outPath) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          ok: result.ok,
          stage: result.stage,
          dryRunBanner: result.dryRunBanner,
          companyIdentity: result.companyIdentity,
          customerListId: result.customerListId,
          customerFullName: result.customerFullName,
          idempotencyKey: result.idempotencyKey,
          queueRow: result.queueRow
            ? {
                id: result.queueRow.id,
                status: result.queueRow.status,
                environment: result.queueRow.environment,
                operation_type: result.queueRow.operation_type,
                idempotency_key: result.queueRow.idempotency_key
              }
            : null,
          itemValidation: result.itemValidation,
          estimateAddQbXml: result.estimateAddQbXml,
          transmitBlocked: result.transmitBlocked,
          addGuard: result.addGuard,
          errors: result.errors
        },
        null,
        2
      ),
      "utf8"
    );
    console.log(`\nNode dry-run report: ${outPath}`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
