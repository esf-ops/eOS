#!/usr/bin/env node
/**
 * Controlled Account Directory seed import (admin CLI only).
 *
 * Dry-run (zero writes):
 *   npm run account-directory:seed:import -- \
 *     --input local-imports/account-directory/output/account-directory-seed.json \
 *     --dry-run \
 *     --expected-count 362
 *
 * Apply (production — requires explicit flags; never defaults to write):
 *   ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID=<org-uuid> \
 *   ACCOUNT_DIRECTORY_SEED_ACTOR_USER_ID=<user-uuid> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   ACCOUNT_DIRECTORY_STORE=supabase \
 *   npm run account-directory:seed:import -- \
 *     --input local-imports/account-directory/output/account-directory-seed.json \
 *     --apply \
 *     --expected-count 362 \
 *     --confirm-count 362 \
 *     --environment production \
 *     --confirm-production
 *
 * Env loading: use ignored local env files (never commit secrets). Example:
 *   cd backend-core && vercel env pull .env.vercel.production.local --environment production
 * Then export or `set -a; source .env.vercel.production.local; set +a` before running.
 *
 * Never prints service-role keys or full customer rows.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import { createAccountDirectorySupabaseStore } from "../accountDirectory/accountDirectorySupabaseStore.mjs";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import { AccountDirectoryError } from "../accountDirectory/accountDirectoryErrors.mjs";
import {
  formatImportConsoleSummary,
  loadSeedCandidates,
  runControlledSeedImport,
  supabaseHostFromUrl
} from "../accountDirectory/accountDirectoryControlledSeed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

export const REQUIRED_APPLY_ENV = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID",
  "ACCOUNT_DIRECTORY_SEED_ACTOR_USER_ID"
]);

/**
 * @param {string[]} argv
 */
export function parseImportArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {
    dryRun: false,
    apply: false,
    confirmProduction: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--output-dir" || a === "-o") out.outputDir = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--expected-count") out.expectedCount = argv[++i];
    else if (a === "--confirm-count") out.confirmCount = argv[++i];
    else if (a === "--environment") out.environment = argv[++i];
    else if (a === "--confirm-production") out.confirmProduction = true;
    else if (a === "--organization-id") out.organizationId = argv[++i];
    else if (a === "--actor-user-id") out.actorUserId = argv[++i];
    else if (a === "--allow-test-input") out.allowTestInput = true;
  }
  return out;
}

/**
 * @param {Record<string, string|boolean>} args
 * @param {NodeJS.ProcessEnv} env
 */
export function assertApplySafety(args, env) {
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

  if (String(args.expectedCount) !== String(args.confirmCount)) {
    throw new AccountDirectoryError(
      "confirm_count_mismatch",
      "--confirm-count must equal --expected-count for apply.",
      400
    );
  }
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

  for (const key of REQUIRED_APPLY_ENV) {
    if (!String(env[key] ?? "").trim()) {
      throw new AccountDirectoryError(
        "missing_env",
        `Missing required env for apply: ${key}`,
        400
      );
    }
  }

  const storeMode = String(env.ACCOUNT_DIRECTORY_STORE ?? "").trim().toLowerCase();
  if (storeMode && storeMode !== "supabase") {
    throw new AccountDirectoryError(
      "store_mode_invalid",
      "Apply requires ACCOUNT_DIRECTORY_STORE=supabase (or unset to default supabase for this CLI).",
      400
    );
  }
}

/**
 * @param {{
 *   args: ReturnType<typeof parseImportArgs>,
 *   env?: NodeJS.ProcessEnv,
 *   store?: any,
 *   service?: any,
 *   fsWrite?: typeof fs.writeFileSync,
 *   createClientFn?: typeof createClient
 * }} deps
 */
export async function runImportCli(deps) {
  const env = deps.env || process.env;
  const args = deps.args;
  assertApplySafety(args, env);

  const expectedCount = Number(args.expectedCount);
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw new AccountDirectoryError("expected_count_required", "--expected-count is required.", 400);
  }

  const input =
    args.input ||
    path.join(REPO_ROOT, "local-imports/account-directory/output/account-directory-seed.json");
  const { resolved, candidates } = loadSeedCandidates(String(input), {
    allowTestPaths: Boolean(args.allowTestInput),
    repoRoot: REPO_ROOT
  });

  const organizationId = String(
    args.organizationId || env.ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID || ""
  ).trim();
  const actorUserId = String(
    args.actorUserId || env.ACCOUNT_DIRECTORY_SEED_ACTOR_USER_ID || ""
  ).trim();

  const mode = args.apply ? "apply" : "dry-run";

  /** @type {any} */
  let store = deps.store;
  /** @type {any} */
  let service = deps.service;

  if (mode === "apply") {
    if (!store) {
      const url = String(env.SUPABASE_URL).trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
      const create = deps.createClientFn || createClient;
      const client = create(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      store = createAccountDirectorySupabaseStore(() => client);
      console.log(`Supabase host: ${supabaseHostFromUrl(url)}`);
      console.log(`Organization ID: ${organizationId}`);
      console.log(`Actor user ID: ${actorUserId}`);
      console.log(`Store: supabase`);
    }
    if (!service) service = createAccountDirectoryService({ store });
  } else {
    // Dry-run: prefer Supabase read-only lookups when configured (still zero writes via mode).
    if (!store) {
      const url = String(env.SUPABASE_URL ?? "").trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
      if (url && key && organizationId) {
        const create = deps.createClientFn || createClient;
        const client = create(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        store = createAccountDirectorySupabaseStore(() => client);
        console.log(`Supabase host (dry-run lookups): ${supabaseHostFromUrl(url)}`);
        console.log(`Organization ID: ${organizationId}`);
        console.log(`Store: supabase (read-only dry-run)`);
      } else {
        store = createAccountDirectoryMemoryStore();
        console.log(`Store: memory (dry-run planning; no Supabase env for lookups)`);
        if (env.SUPABASE_URL) {
          console.log(`Supabase host (reference): ${supabaseHostFromUrl(env.SUPABASE_URL)}`);
        }
        if (organizationId) console.log(`Organization ID: ${organizationId}`);
      }
    }
    if (!service) service = createAccountDirectoryService({ store });
  }

  if (mode === "apply" && (!organizationId || !actorUserId)) {
    throw new AccountDirectoryError(
      "attribution_required",
      "Apply requires organization and actor user IDs.",
      400
    );
  }

  const result = await runControlledSeedImport({
    store,
    service,
    organizationId: organizationId || "00000000-0000-4000-8000-000000000000",
    actorUserId: actorUserId || "00000000-0000-4000-8000-000000000000",
    candidates,
    expectedCount,
    mode
  });

  // Guard: dry-run must never write
  if (mode === "dry-run" && result.summary.databaseWrites !== 0) {
    throw new AccountDirectoryError("dry_run_wrote", "Dry-run attempted database writes.", 500);
  }

  const outputDir = path.resolve(
    String(args.outputDir || path.join(REPO_ROOT, "local-imports/account-directory/output"))
  );
  fs.mkdirSync(outputDir, { recursive: true });
  const write = deps.fsWrite || fs.writeFileSync;

  const reportName =
    mode === "apply"
      ? "account-directory-import-receipt.json"
      : "account-directory-controlled-import-dry-run.json";
  const reportPath = path.join(outputDir, reportName);

  const receipt = {
    ...result.summary,
    inputPath: resolved,
    environment: args.environment || (mode === "dry-run" ? "dry-run" : "production"),
    createdExternalIds: result.results
      .filter((r) => r.outcome === "created")
      .map((r) => r.externalId),
    skippedExternalIds: result.results
      .filter((r) => r.outcome === "skipped_existing")
      .map((r) => r.externalId),
    failureCodes: result.failures.map((f) => ({ index: f.index, code: f.code })),
    // Never include secrets
  };

  const serialized = JSON.stringify(receipt, null, 2);
  if (env.SUPABASE_SERVICE_ROLE_KEY && serialized.includes(String(env.SUPABASE_SERVICE_ROLE_KEY))) {
    throw new AccountDirectoryError("secret_leak", "Refusing to write receipt containing secrets.", 500);
  }
  write(reportPath, `${serialized}\n`, "utf8");

  console.log(formatImportConsoleSummary(result.summary));
  console.log(`input: ${resolved}`);
  console.log(`report: ${reportPath}`);
  return { ...result, reportPath, receipt };
}

async function main() {
  try {
    await runImportCli({ args: parseImportArgs(process.argv.slice(2)) });
  } catch (e) {
    const msg = e instanceof AccountDirectoryError ? `${e.code}: ${e.message}` : String(e?.message || e);
    console.error(msg);
    if (e?.extra?.sampleReasons) {
      console.error(`sampleReasons: ${JSON.stringify(e.extra.sampleReasons)}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
