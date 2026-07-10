#!/usr/bin/env node
/**
 * importQuickBooksStaging — Phase 3C real staging import CLI (backend-core only).
 *
 * Thin wrapper that runs the Phase 3A orchestrator against the Phase 3B Supabase-backed
 * repository. It runs INSIDE backend-core, where the service-role client lives — NEVER on
 * the QuickBooks VM (which only produces the local export and holds no Supabase credentials).
 *
 * Usage (from a backend-core environment with service-role env available):
 *   QB_IMPORT_ORGANIZATION_ID=<org-uuid> \
 *   QB_IMPORT_EXPORT_FOLDER=/path/to/export-folder \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/importQuickBooksStaging.mjs
 *
 * SAFETY:
 *   - Prints only safe metadata/counts/status — never raw records, raw_payload, names,
 *     addresses, amounts, memos, raw DB errors, or any env/secret value.
 *   - Constructs the Supabase client lazily (dynamic import) only after env validation, so
 *     this module's static import graph never pulls in @supabase (keeps it out of tests).
 *
 * Exit codes: 0 = success, 1 = partial / failed / usage error.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { importQuickBooksStaging as defaultImportFn } from "../quickbooks/quickBooksStagingImport.js";
import { createQuickBooksStagingSupabaseRepository as defaultCreateRepository } from "../quickbooks/quickBooksStagingSupabaseRepository.js";

const REQUIRED_ENV = Object.freeze([
  "QB_IMPORT_ORGANIZATION_ID",
  "QB_IMPORT_EXPORT_FOLDER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

/**
 * Build safe output lines from an import result. Counts/IDs/reasons only — never raw
 * records, raw_payload, or any secret/env value.
 *
 * @param {object} result
 * @param {{ organizationId: string, exportFolderPath: string }} ctx
 * @returns {string[]}
 */
export function formatImportResultLines(result, ctx) {
  const lines = [
    "EliteOS QuickBooks staging import (backend-core, service-role)",
    `Export folder: ${ctx.exportFolderPath}`,
    `Organization: ${ctx.organizationId}`,
    `Chunk size: ${ctx.chunkSize == null ? "default" : ctx.chunkSize}`,
    `Run ID: ${result.runId ?? "(none)"}`,
    `Sync run ID: ${result.syncRunId ?? "(none)"}`,
    `QBXML version: ${result.qbXmlVersion ?? "(none)"}`,
  ];

  if ((result.blockReasons ?? []).length > 0) {
    lines.push("", "Blocked before writes:");
    for (const reason of result.blockReasons) lines.push(`  - ${reason}`);
  }

  const perEntity = result.perEntity ?? {};
  if (Object.keys(perEntity).length > 0) {
    lines.push("", "Per-entity (source -> staged / failed; inserted/updated):");
    for (const [folder, entity] of Object.entries(perEntity)) {
      const sourceSuffix = entity.source ? ` [${entity.source}]` : "";
      lines.push(
        `  ${folder}: source=${entity.sourceRecordCount} staged=${entity.stagingRowCount} ` +
          `failed=${entity.failureCount} inserted=${entity.inserted ?? 0} updated=${entity.updated ?? 0}${sourceSuffix}`
      );
    }
  }

  if ((result.warnings ?? []).length > 0) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) lines.push(`  - ${warning}`);
  }

  if ((result.failReasons ?? []).length > 0) {
    lines.push("", "Fail reasons:");
    for (const reason of result.failReasons) lines.push(`  - ${reason}`);
  }

  lines.push(
    "",
    `Manifest entity total: ${result.manifestTotal ?? "-"}`,
    `Built primary staging rows: ${result.builtPrimaryTotal ?? "-"}`,
    `Derived invoice-line rows: ${result.derivedInvoiceLineCount ?? "-"}`,
    `Total staging rows: ${result.totalStagingRows ?? 0}`,
    `Total skipped/failed: ${result.totalFailures ?? 0}`,
    "",
    `Result: ${String(result.status ?? "unknown").toUpperCase()}`
  );

  return lines;
}

/**
 * Parse the optional QB_IMPORT_CHUNK_SIZE env value.
 * Absent/blank -> use the orchestrator default (returns chunkSize null). Present must be a
 * positive integer, else it is a usage error.
 *
 * @param {string|undefined} raw
 * @returns {{ ok: true, chunkSize: number|null } | { ok: false }}
 */
export function parseChunkSizeEnv(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: true, chunkSize: null }; // default behavior
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return { ok: false };
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { ok: true, chunkSize: n };
}

/**
 * Run the import CLI logic. Dependency-injectable so tests never construct a real Supabase
 * client. Returns { exitCode, lines, result } and never throws.
 *
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   getSupabase?: () => unknown,
 *   createRepository?: typeof defaultCreateRepository,
 *   importQuickBooksStaging?: typeof defaultImportFn,
 * }} [deps]
 * @returns {Promise<{ exitCode: number, lines: string[], result: object|null }>}
 */
export async function runImportCli(deps = {}) {
  const env = deps.env ?? process.env;
  const getSupabase = deps.getSupabase;
  const createRepository = deps.createRepository ?? defaultCreateRepository;
  const importFn = deps.importQuickBooksStaging ?? defaultImportFn;

  const missing = REQUIRED_ENV.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length > 0) {
    // Names only — never print env values.
    return { exitCode: 1, lines: [`Missing required env: ${missing.join(", ")}`], result: null };
  }

  const chunkParse = parseChunkSizeEnv(env.QB_IMPORT_CHUNK_SIZE);
  if (!chunkParse.ok) {
    return {
      exitCode: 1,
      lines: ["Invalid QB_IMPORT_CHUNK_SIZE: must be a positive integer (e.g. 25 or 50)"],
      result: null,
    };
  }
  const chunkSize = chunkParse.chunkSize; // null => orchestrator default

  if (typeof getSupabase !== "function") {
    return { exitCode: 1, lines: ["Internal error: Supabase client factory unavailable"], result: null };
  }

  const organizationId = String(env.QB_IMPORT_ORGANIZATION_ID).trim();
  const exportFolderPath = path.resolve(String(env.QB_IMPORT_EXPORT_FOLDER).trim());
  const repository = createRepository({ getSupabase });

  const importOptions = { organizationId, repository };
  if (chunkSize != null) importOptions.chunkSize = chunkSize;

  let result;
  try {
    result = await importFn(exportFolderPath, importOptions);
  } catch (err) {
    // The orchestrator is designed not to throw; this is defensive. Never leak raw text.
    return {
      exitCode: 1,
      lines: [`Import failed unexpectedly (${err?.code ?? err?.name ?? "error"})`],
      result: null,
    };
  }

  const lines = formatImportResultLines(result, { organizationId, exportFolderPath, chunkSize });
  const exitCode = result.status === "success" ? 0 : 1;
  return { exitCode, lines, result };
}

async function main() {
  const env = process.env;
  let client = null;

  // Only construct the service-role client after env validation; lazy dynamic import keeps
  // @supabase out of this module's static import graph.
  const missing = REQUIRED_ENV.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length === 0) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(String(env.SUPABASE_URL).trim(), String(env.SUPABASE_SERVICE_ROLE_KEY).trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const getSupabase = () => {
    if (!client) throw new Error("supabase client not initialized");
    return client;
  };

  const { exitCode, lines } = await runImportCli({ env, getSupabase });
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

const isRunAsCliScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isRunAsCliScript) {
  main().catch((err) => {
    // Never leak raw error text.
    console.error(`importQuickBooksStaging failed (${err?.code ?? err?.name ?? "error"})`);
    process.exitCode = 1;
  });
}
