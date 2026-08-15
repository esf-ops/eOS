#!/usr/bin/env node
/**
 * Read-only Account Directory status reconciliation dry-run.
 *
 *   npm run account-directory:status:reconcile:dry-run -- \
 *     --organization-id <org-uuid>
 *
 * Never mutates Account Directory, QuickBooks facts, suggestions, or links.
 * JSON report writes under gitignored local-imports/ only.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { createAccountDirectorySupabaseStore } from "../accountDirectory/accountDirectorySupabaseStore.mjs";
import {
  assertNoSensitivePayload,
  formatStatusReconcileConsole,
  sampleBuckets,
  summarizeStatusReconciliation
} from "../accountDirectory/accountDirectoryStatusReconciliation.mjs";
import {
  classifyLoadedEvidence,
  loadStatusReconciliationEvidence
} from "../accountDirectory/accountDirectoryStatusReconciliationLoad.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(REPO_ROOT, "backend-core/.env") });

const NAMED = {
  "1SW Design": /1sw design/i,
  "Aaron Murphy Intertiors": /aaron murphy/i,
  "Blackstone Installation": /blackstone installation/i,
  "319 Decor + Design": /319 decor/i,
  "380 Companies": /380 companies/i
};

export function parseStatusReconcileArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--organization-id") out.organizationId = argv[++i];
    else if (a === "--output-dir" || a === "-o") out.outputDir = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") {
      throw new Error("Apply is not allowed in this phase. Dry-run only.");
    }
  }
  return out;
}

function resolveSupabaseEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, key };
}

async function resolveOrganizationId(args, supabase) {
  const fromArgs = String(
    args.organizationId ||
      process.env.ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID ||
      process.env.ACCOUNT_DIRECTORY_MASTER_LIST_ORGANIZATION_ID ||
      ""
  ).trim();
  if (fromArgs) return fromArgs;
  const { data, error } = await supabase.from("account_directory_accounts").select("organization_id");
  if (error) throw error;
  const ids = [...new Set((data || []).map((row) => String(row.organization_id || "").trim()).filter(Boolean))];
  if (ids.length === 1) return ids[0];
  throw new Error(
    ids.length
      ? `Multiple organizations have Account Directory rows (${ids.length}). Pass --organization-id.`
      : "Provide --organization-id (or ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID)."
  );
}

async function main() {
  const args = parseStatusReconcileArgs(process.argv.slice(2));
  if (!args.dryRun) {
    console.error("This command is read-only. Pass --dry-run.");
    process.exit(1);
  }
  const { url, key } = resolveSupabaseEnv();
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (read-only).");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let organizationId;
  try {
    organizationId = await resolveOrganizationId(args, supabase);
  } catch (err) {
    console.error(err?.message || err);
    process.exit(1);
  }
  const store = createAccountDirectorySupabaseStore(() => supabase);

  const loaded = await loadStatusReconciliationEvidence({
    store,
    supabase,
    organizationId
  });
  const result = classifyLoadedEvidence(loaded);
  assertNoSensitivePayload(result.classified);
  const summary = summarizeStatusReconciliation(result.classified);
  const samples = sampleBuckets(result.classified, 20);

  /** @type {Record<string, object|null>} */
  const namedExamples = {};
  for (const [label, re] of Object.entries(NAMED)) {
    namedExamples[label] = result.classified.find((row) => re.test(row.displayName)) || null;
  }

  const outputDir = path.resolve(
    String(args.outputDir || path.join(REPO_ROOT, "local-imports/account-directory/status-reconciliation"))
  );
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputDir, `status-reconciliation-${stamp}.json`);
  const publicRows = result.classified.map((row) => ({
    accountId: row.accountId,
    displayName: row.displayName,
    currentStatus: row.currentStatus,
    proposedStatus: row.proposedStatus,
    confidence: row.confidence,
    reasonCode: row.reasonCode,
    reasons: row.reasons,
    evidence: row.evidence,
    reviewFlags: row.reviewFlags,
    bucket: row.bucket,
    changed: row.changed
  }));
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        mode: "dry-run",
        databaseWrites: 0,
        organizationId,
        warnings: result.warnings,
        summary,
        namedExamples,
        samples,
        rows: publicRows
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(formatStatusReconcileConsole(summary, { namedExamples }));
  for (const w of result.warnings) console.log(`Warning: ${w}`);
  console.log(`report: ${reportPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
