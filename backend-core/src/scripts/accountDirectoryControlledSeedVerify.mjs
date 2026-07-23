#!/usr/bin/env node
/**
 * Read-only verification of controlled Account Directory seed import.
 *
 *   ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID=<org> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run account-directory:seed:verify -- \
 *     --input local-imports/account-directory/output/account-directory-seed.json \
 *     --expected-count 362 \
 *     --environment production
 *
 * Zero writes. Never prints secrets or full customer rows.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { createAccountDirectorySupabaseStore } from "../accountDirectory/accountDirectorySupabaseStore.mjs";
import { AccountDirectoryError } from "../accountDirectory/accountDirectoryErrors.mjs";
import {
  loadSeedCandidates,
  runControlledSeedVerify,
  supabaseHostFromUrl
} from "../accountDirectory/accountDirectoryControlledSeed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * @param {string[]} argv
 */
export function parseVerifyArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--expected-count") out.expectedCount = argv[++i];
    else if (a === "--environment") out.environment = argv[++i];
    else if (a === "--receipt") out.receipt = argv[++i];
    else if (a === "--organization-id") out.organizationId = argv[++i];
    else if (a === "--allow-test-input") out.allowTestInput = true;
  }
  return out;
}

/**
 * @param {{
 *   args: ReturnType<typeof parseVerifyArgs>,
 *   env?: NodeJS.ProcessEnv,
 *   store?: any,
 *   createClientFn?: typeof createClient
 * }} deps
 */
export async function runVerifyCli(deps) {
  const env = deps.env || process.env;
  const args = deps.args;
  const expectedCount = Number(args.expectedCount);
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw new AccountDirectoryError("expected_count_required", "--expected-count is required.", 400);
  }
  if (String(args.environment || "").toLowerCase() !== "production") {
    throw new AccountDirectoryError(
      "environment_required",
      "Verify against production requires --environment production.",
      400
    );
  }

  const organizationId = String(
    args.organizationId || env.ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID || ""
  ).trim();
  if (!organizationId) {
    throw new AccountDirectoryError("organization_required", "Organization ID is required.", 400);
  }

  const input =
    args.input ||
    path.join(REPO_ROOT, "local-imports/account-directory/output/account-directory-seed.json");
  const { resolved, candidates } = loadSeedCandidates(String(input), {
    allowTestPaths: Boolean(args.allowTestInput),
    repoRoot: REPO_ROOT
  });

  let receipt = null;
  const receiptPath =
    args.receipt ||
    path.join(REPO_ROOT, "local-imports/account-directory/output/account-directory-import-receipt.json");
  if (fs.existsSync(String(receiptPath))) {
    receipt = JSON.parse(fs.readFileSync(String(receiptPath), "utf8"));
  }

  /** @type {any} */
  let store = deps.store;
  if (!store) {
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (!String(env[key] ?? "").trim()) {
        throw new AccountDirectoryError("missing_env", `Missing required env: ${key}`, 400);
      }
    }
    const url = String(env.SUPABASE_URL).trim();
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
    const create = deps.createClientFn || createClient;
    const client = create(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    store = createAccountDirectorySupabaseStore(() => client);
    console.log(`Supabase host: ${supabaseHostFromUrl(url)}`);
  }

  console.log(`Organization ID: ${organizationId}`);
  console.log(`input: ${resolved}`);

  const result = await runControlledSeedVerify({
    store,
    organizationId,
    candidates,
    expectedCount,
    receipt
  });

  console.log(`databaseWrites: ${result.databaseWrites}`);
  console.log(`seedCandidateCount: ${result.seedCandidateCount}`);
  console.log(`accountCount: ${result.accountCount}`);
  console.log(`contactCount: ${result.contactCount}`);
  console.log(`locationCount: ${result.locationCount}`);
  console.log(`activeQuickBooksLinks: ${result.activeQuickBooksLinks}`);
  console.log(`missingLinks: ${result.missingLinks}`);
  console.log(`duplicateLinks: ${result.duplicateLinks}`);
  console.log(`ok: ${result.ok}`);
  if (result.issues.length) {
    console.log(`issues: ${result.issues.map((i) => i.code).join(", ")}`);
  }
  return result;
}

async function main() {
  try {
    const result = await runVerifyCli({ args: parseVerifyArgs(process.argv.slice(2)) });
    if (!result.ok) process.exitCode = 1;
  } catch (e) {
    console.error(e instanceof AccountDirectoryError ? `${e.code}: ${e.message}` : String(e?.message || e));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
