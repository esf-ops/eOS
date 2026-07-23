#!/usr/bin/env node
/**
 * Account Directory master-list reconcile / gated apply CLI.
 *
 * Dry-run (zero writes):
 *   npm run account-directory:master-list:reconcile -- \
 *     --input local-imports/account-directory/master-list/Account_Master_List_1784844180.xlsx \
 *     --dry-run \
 *     --environment production \
 *     --expected-usable-rows 802 \
 *     --expected-unique-names 801 \
 *     --organization-id <org-uuid>
 *
 * Apply (Chris only — never run during agent development):
 *   ... --apply --confirm-production --approved-artifact ... \
 *     --confirm-phrase "APPLY ACCOUNT MASTER LIST RECONCILIATION"
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import { createAccountDirectorySupabaseStore } from "../accountDirectory/accountDirectorySupabaseStore.mjs";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import { AccountDirectoryError } from "../accountDirectory/accountDirectoryErrors.mjs";
import {
  APPLY_CONFIRM_PHRASE,
  formatReconcileConsoleSummary,
  runMasterListApply,
  runMasterListReconcile
} from "../accountDirectory/accountDirectoryMasterList.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

export function parseMasterListArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {
    dryRun: false,
    apply: false,
    confirmProduction: false,
    recheckProduction: true
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--output-dir" || a === "-o") out.outputDir = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--environment") out.environment = argv[++i];
    else if (a === "--confirm-production") out.confirmProduction = true;
    else if (a === "--expected-usable-rows") out.expectedUsableRows = argv[++i];
    else if (a === "--expected-unique-names") out.expectedUniqueNames = argv[++i];
    else if (a === "--organization-id") out.organizationId = argv[++i];
    else if (a === "--actor-user-id") out.actorUserId = argv[++i];
    else if (a === "--approved-artifact") out.approvedArtifact = argv[++i];
    else if (a === "--confirm-phrase") out.confirmPhrase = argv[++i];
    else if (a === "--no-recheck") out.recheckProduction = false;
    else if (a === "--memory-store") out.memoryStore = true;
    else if (a === "--allow-test-input") out.allowTestInput = true;
  }
  return out;
}

export function assertMasterListApplySafety(args, env) {
  if (args.dryRun && args.apply) {
    throw new AccountDirectoryError("mode_conflict", "Pass either --dry-run or --apply, not both.", 400);
  }
  if (!args.dryRun && !args.apply) {
    throw new AccountDirectoryError(
      "mode_required",
      "Pass --dry-run or --apply (apply never defaults on).",
      400
    );
  }
  if (!args.apply) return;

  if (String(args.environment || "").toLowerCase() !== "production") {
    throw new AccountDirectoryError(
      "environment_required",
      "Apply requires --environment production.",
      400
    );
  }
  if (!args.confirmProduction) {
    throw new AccountDirectoryError(
      "confirm_production_required",
      "Apply requires --confirm-production.",
      400
    );
  }
  if (String(args.confirmPhrase || "") !== APPLY_CONFIRM_PHRASE) {
    throw new AccountDirectoryError(
      "confirm_phrase_required",
      `Apply requires --confirm-phrase "${APPLY_CONFIRM_PHRASE}"`,
      400
    );
  }
  if (!args.approvedArtifact) {
    throw new AccountDirectoryError(
      "approved_artifact_required",
      "Apply requires --approved-artifact.",
      400
    );
  }
  const org =
    args.organizationId ||
    env.ACCOUNT_DIRECTORY_MASTER_LIST_ORGANIZATION_ID ||
    env.ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID;
  const actor =
    args.actorUserId ||
    env.ACCOUNT_DIRECTORY_MASTER_LIST_ACTOR_USER_ID ||
    env.ACCOUNT_DIRECTORY_SEED_ACTOR_USER_ID;
  if (!org || !actor) {
    throw new AccountDirectoryError(
      "apply_identity_required",
      "Apply requires organization id and actor user id (flags or env).",
      400
    );
  }
  if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL && !env.VITE_SUPABASE_URL) {
    throw new AccountDirectoryError(
      "supabase_env_required",
      "Apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      400
    );
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_SERVICE_KEY) {
    throw new AccountDirectoryError(
      "supabase_env_required",
      "Apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      400
    );
  }
}

function resolveSupabaseEnv(env) {
  const url = String(
    env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || ""
  ).trim();
  const key = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || ""
  ).trim();
  return { url, key };
}

function buildStore(args, env) {
  if (args.memoryStore) return createAccountDirectoryMemoryStore();
  const { url, key } = resolveSupabaseEnv(env);
  if (!url || !key) {
    throw new AccountDirectoryError(
      "supabase_env_required",
      "Dry-run against production requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (read-only).",
      400
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new AccountDirectoryError(
      "supabase_url_invalid",
      "Supabase URL must be an http(s) URL.",
      400
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  return createAccountDirectorySupabaseStore(() => supabase);
}

async function main() {
  const args = parseMasterListArgs(process.argv.slice(2));
  try {
    assertMasterListApplySafety(args, process.env);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  const orgId =
    args.organizationId ||
    process.env.ACCOUNT_DIRECTORY_MASTER_LIST_ORGANIZATION_ID ||
    process.env.ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID;
  const actorId =
    args.actorUserId ||
    process.env.ACCOUNT_DIRECTORY_MASTER_LIST_ACTOR_USER_ID ||
    process.env.ACCOUNT_DIRECTORY_SEED_ACTOR_USER_ID;

  if (!orgId) {
    console.error("Provide --organization-id (or ACCOUNT_DIRECTORY_MASTER_LIST_ORGANIZATION_ID).");
    process.exit(1);
  }

  const store = buildStore(args, process.env);
  const outputDir =
    args.outputDir ||
    path.resolve(REPO_ROOT, "local-imports/account-directory/master-list/output");

  if (args.dryRun) {
    if (!args.input) {
      console.error("Dry-run requires --input");
      process.exit(1);
    }
    const result = await runMasterListReconcile({
      store,
      organizationId: String(orgId),
      inputPath: String(args.input),
      expectedUsableRows: args.expectedUsableRows ? Number(args.expectedUsableRows) : null,
      expectedUniqueNames: args.expectedUniqueNames ? Number(args.expectedUniqueNames) : null,
      outputDir,
      repoRoot: REPO_ROOT,
      allowTestPaths: Boolean(args.allowTestInput),
      dryRun: true
    });
    console.log(result.consoleSummary || formatReconcileConsoleSummary({ mode: "dry-run", profile: result.profile, summary: result.summary, databaseWrites: 0 }));
    console.log(`artifacts: ${outputDir}`);
    return;
  }

  const service = createAccountDirectoryService({ store });
  const receipt = await runMasterListApply({
    store,
    service,
    organizationId: String(orgId),
    actorUserId: String(actorId),
    approvedArtifactPath: String(args.approvedArtifact),
    confirmPhrase: String(args.confirmPhrase),
    expectedUsableRows: args.expectedUsableRows ? Number(args.expectedUsableRows) : null,
    recheckProduction: args.recheckProduction !== false,
    outputDir,
    repoRoot: REPO_ROOT
  });
  console.log(
    [
      `mode: apply`,
      `created: ${receipt.created}`,
      `skipped: ${receipt.skipped}`,
      `failed: ${receipt.failed}`,
      `databaseWrites: ${receipt.databaseWrites}`,
      `quickbooksLinksChanged: ${receipt.quickbooksLinksChanged}`,
      `receipt: ${receipt.receiptPath}`
    ].join("\n")
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
