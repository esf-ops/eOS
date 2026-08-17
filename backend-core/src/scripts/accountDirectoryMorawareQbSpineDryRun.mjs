#!/usr/bin/env node
/**
 * Read-only Moraware × QB-first spine dry-run.
 *
 *   npm run account-directory:moraware:qb-spine:dry-run -- --dry-run
 *
 * SELECT-only. Stdout is a concise mutually exclusive summary.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createAccountDirectorySupabaseStore } from "../accountDirectory/accountDirectorySupabaseStore.mjs";
import { listMorawareReconciliationQueue } from "../accountDirectory/accountDirectoryMorawareReconciliation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(REPO_ROOT, "backend-core/.env") });

function parseArgs(argv) {
  const out = { dryRun: false, organizationId: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--organization-id") out.organizationId = argv[++i];
    else if (a === "--output-dir" || a === "-o") out.outputDir = argv[++i];
    else if (a === "--apply") throw new Error("Apply forbidden. Dry-run only.");
  }
  return out;
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
  const ids = [...new Set((data || []).map((r) => String(r.organization_id || "").trim()).filter(Boolean))];
  if (ids.length === 1) return ids[0];
  throw new Error(ids.length ? `Multiple orgs. Pass --organization-id.` : "Provide --organization-id.");
}

function printSummary(report) {
  const s = report.summary;
  console.log("Moraware × QB-first spine dry-run (read-only)");
  console.log(`organizationId: ${report.organizationId}`);
  console.log(`total Moraware:              ${s.totalMoraware}`);
  console.log(`already linked:              ${s.alreadyLinked}`);
  console.log(`unresolved:                  ${s.unresolved}`);
  console.log(`  existing QB-backed AD:     ${s.existingAdQbBacked}`);
  console.log(`  existing AD needing QB:    ${s.existingAdNeedsQbLink}`);
  console.log(`  QB root not in AD:         ${s.qbRootNotInDirectory}`);
  console.log(`  Prospect candidate:        ${s.existingAdProspect}`);
  console.log(`  possible:                  ${s.possibleCandidate}`);
  console.log(`  conflict:                  ${s.conflict}`);
  console.log(`  no candidate:              ${s.noCandidate}`);
  console.log(`  internal:                  ${s.internal}`);
  console.log(`invariant linked+unresolved: ${s.alreadyLinked + s.unresolved} (expect ${s.totalMoraware})`);
  console.log(`invariant unresolved buckets: ${s.unresolvedBucketSum} (expect ${s.unresolved})`);
  console.log(`output file: ${report.outputPath}`);
  console.log("databaseWrites: 0");
  console.log("QuickBooksWrites: 0");
  console.log("MorawareWrites: 0");
  console.log("AccountDirectoryMutations: 0");
  if (s.alreadyLinked + s.unresolved !== s.totalMoraware || s.unresolvedBucketSum !== s.unresolved) {
    throw new Error("COUNT_INVARIANT_FAILURE");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun) {
    console.error("Read-only only. Pass --dry-run.");
    process.exit(1);
  }
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const organizationId = await resolveOrganizationId(args, supabase);
  const store = createAccountDirectorySupabaseStore(() => supabase);

  const queue = await listMorawareReconciliationQueue({
    organizationId,
    role: "admin",
    store,
    supabase,
    query: { page: 1, pageSize: 10 }
  });

  const s = queue.summary || {};
  const summary = {
    totalMoraware: s.totalMorawareAccounts ?? null,
    alreadyLinked: s.alreadyLinked ?? null,
    unresolved: s.unresolved ?? null,
    unresolvedBucketSum: s.unresolvedBucketSum ?? null,
    existingAdQbBacked: s.existingAdQbBacked ?? null,
    existingAdNeedsQbLink: s.existingAdQbLinkCandidate ?? null,
    qbRootNotInDirectory: s.qbRootNotInDirectory ?? null,
    existingAdProspect: s.existingAdProspect ?? null,
    possibleCandidate: s.possibleCandidates ?? null,
    conflict: s.conflicts ?? null,
    noCandidate: s.noCandidate ?? null,
    internal: s.internalBuckets ?? null
  };

  const outDir = args.outputDir || path.join(REPO_ROOT, "local-imports", "moraware-qb-spine-dry-run");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `moraware-qb-spine-${Date.now()}.json`);

  const report = {
    ok: true,
    mode: "dry-run-read-only",
    organizationId,
    generatedAt: new Date().toISOString(),
    databaseWrites: 0,
    QuickBooksWrites: 0,
    MorawareWrites: 0,
    AccountDirectoryMutations: 0,
    summary,
    summaryFromQueue: s,
    outputPath: outPath
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  printSummary(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
