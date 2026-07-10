#!/usr/bin/env node
/**
 * backfillQuickBooksIntelligence — Phase 4G.3/4G.4 chunked intel_* backfill.
 *
 * Calls qb_intelligence_backfill_* RPCs in loops until remaining=0.
 * Prints safe counts only — never raw_payload, PII, or secrets.
 *
 * Phase 4G.4: stops early if updated>0 but remaining does not decrease
 * (stuck v3 eligibility loop) and recommends applying the v4 marker migration.
 *
 * Usage:
 *   QB_IMPORT_ORGANIZATION_ID=<org-uuid> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/backfillQuickBooksIntelligence.mjs
 *
 * Optional:
 *   QB_INTEL_BACKFILL_LIMIT=5000   (default 5000, max 20000)
 *   QB_INTEL_BACKFILL_MAX_ROUNDS=200  (safety cap per entity)
 *   QB_INTEL_BACKFILL_NO_PROGRESS_ROUNDS=3  (stop if remaining stuck)
 *
 * Exit codes: 0 = done, 1 = missing env / failure.
 */

import process from "node:process";
import { pathToFileURL } from "node:url";

import { QB_INTELLIGENCE_BACKFILL_RPCS } from "../quickbooks/quickBooksIntelligenceAggregateRepository.js";

export const REQUIRED_ENV = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "QB_IMPORT_ORGANIZATION_ID",
]);

export const BACKFILL_DEFAULT_LIMIT = 5000;
export const BACKFILL_LIMIT_CEILING = 20000;
export const BACKFILL_DEFAULT_MAX_ROUNDS = 200;
export const BACKFILL_DEFAULT_NO_PROGRESS_ROUNDS = 3;

export const V4_MIGRATION_HINT =
  "Apply backend-core/supabase/eliteos_quickbooks_intelligence_aggregates_v4_backfill_progress.sql then re-run backfill.";

const ENTITIES = Object.freeze([
  { key: "invoices", rpc: QB_INTELLIGENCE_BACKFILL_RPCS.invoices },
  { key: "payments", rpc: QB_INTELLIGENCE_BACKFILL_RPCS.payments },
  { key: "estimates", rpc: QB_INTELLIGENCE_BACKFILL_RPCS.estimates },
  { key: "sales_orders", rpc: QB_INTELLIGENCE_BACKFILL_RPCS.sales_orders },
]);

/**
 * @param {string|undefined} raw
 * @param {number} fallback
 * @param {number} ceiling
 */
export function parsePositiveIntEnv(raw, fallback, ceiling) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(ceiling, n);
}

/**
 * @param {object|null|undefined} result
 * @returns {{ ok: boolean, entity: string|null, updated: number, remaining: number, limit: number|null, backfill_version: string|null }}
 */
export function normalizeBackfillResult(result) {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      entity: null,
      updated: 0,
      remaining: 0,
      limit: null,
      backfill_version: null,
    };
  }
  const updated =
    Number(result.updated_count ?? result.updated) || 0;
  return {
    ok: result.ok !== false,
    entity: typeof result.entity === "string" ? result.entity : null,
    updated,
    remaining: Number(result.remaining) || 0,
    limit: result.limit == null ? null : Number(result.limit) || null,
    backfill_version:
      typeof result.backfill_version === "string" ? result.backfill_version : null,
  };
}

/**
 * @param {{ entity: string, rounds: number, totalUpdated: number, remaining: number }} summary
 */
export function formatEntitySummaryLine(summary) {
  return `  ${summary.entity}: rounds=${summary.rounds} updated=${summary.totalUpdated} remaining=${summary.remaining}`;
}

/**
 * Detect stuck backfill where rows are updated but remaining never drops
 * (classic v3 null-amount reselect loop).
 *
 * @param {{
 *   updated: number,
 *   remaining: number,
 *   previousRemaining: number|null,
 *   stuckRounds: number,
 *   threshold: number,
 * }} input
 * @returns {{ stuckRounds: number, isStuck: boolean }}
 */
export function trackBackfillProgress(input) {
  const { updated, remaining, previousRemaining, stuckRounds, threshold } = input;
  if (updated > 0 && previousRemaining != null && remaining === previousRemaining) {
    const next = stuckRounds + 1;
    return { stuckRounds: next, isStuck: next >= threshold };
  }
  return { stuckRounds: 0, isStuck: false };
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   getSupabase?: () => { rpc: Function },
 *   createClient?: (url: string, key: string, opts?: object) => { rpc: Function },
 *   log?: (line: string) => void,
 * }} [deps]
 */
export async function runBackfillCli(deps = {}) {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line) => console.log(line));
  const missing = REQUIRED_ENV.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length > 0) {
    return {
      exitCode: 1,
      lines: [`Missing required env: ${missing.join(", ")}`],
    };
  }

  const limit = parsePositiveIntEnv(
    env.QB_INTEL_BACKFILL_LIMIT,
    BACKFILL_DEFAULT_LIMIT,
    BACKFILL_LIMIT_CEILING,
  );
  const maxRounds = parsePositiveIntEnv(
    env.QB_INTEL_BACKFILL_MAX_ROUNDS,
    BACKFILL_DEFAULT_MAX_ROUNDS,
    10000,
  );
  const noProgressRounds = parsePositiveIntEnv(
    env.QB_INTEL_BACKFILL_NO_PROGRESS_ROUNDS,
    BACKFILL_DEFAULT_NO_PROGRESS_ROUNDS,
    50,
  );
  const organizationId = String(env.QB_IMPORT_ORGANIZATION_ID).trim();

  let client;
  if (typeof deps.getSupabase === "function") {
    client = deps.getSupabase();
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const create = deps.createClient ?? createClient;
    client = create(String(env.SUPABASE_URL).trim(), String(env.SUPABASE_SERVICE_ROLE_KEY).trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** @type {string[]} */
  const lines = [
    "EliteOS QuickBooks intelligence intel_* backfill (Phase 4G.4)",
    `Organization: ${organizationId}`,
    `limit_per_call: ${limit}`,
    `max_rounds_per_entity: ${maxRounds}`,
    `no_progress_rounds: ${noProgressRounds}`,
    "",
  ];

  /** @type {Array<{ entity: string, rounds: number, totalUpdated: number, remaining: number }>} */
  const summaries = [];

  try {
    for (const entity of ENTITIES) {
      let rounds = 0;
      let totalUpdated = 0;
      let remaining = 0;
      /** @type {number|null} */
      let previousRemaining = null;
      let stuckRounds = 0;

      while (rounds < maxRounds) {
        rounds += 1;
        const { data, error } = await client.rpc(entity.rpc, { p_limit: limit });
        if (error) {
          const code = error.code != null ? String(error.code) : "RPC_ERROR";
          throw Object.assign(new Error(`Backfill RPC failed for ${entity.key}`), { code });
        }
        const normalized = normalizeBackfillResult(data);
        totalUpdated += normalized.updated;
        remaining = normalized.remaining;
        lines.push(
          `${entity.key} round ${rounds}: updated=${normalized.updated} remaining=${normalized.remaining}`,
        );

        const progress = trackBackfillProgress({
          updated: normalized.updated,
          remaining: normalized.remaining,
          previousRemaining,
          stuckRounds,
          threshold: noProgressRounds,
        });
        stuckRounds = progress.stuckRounds;
        if (progress.isStuck) {
          throw Object.assign(
            new Error(
              `Backfill made no remaining progress for ${entity.key} (updated>0 but remaining stuck). ${V4_MIGRATION_HINT}`,
            ),
            { code: "QB_BACKFILL_NO_PROGRESS" },
          );
        }
        previousRemaining = remaining;

        if (normalized.updated === 0 || normalized.remaining === 0) break;
      }

      if (remaining > 0 && rounds >= maxRounds) {
        throw Object.assign(
          new Error(
            `Backfill hit max rounds for ${entity.key}. ${V4_MIGRATION_HINT}`,
          ),
          { code: "QB_BACKFILL_MAX_ROUNDS" },
        );
      }

      summaries.push({
        entity: entity.key,
        rounds,
        totalUpdated,
        remaining,
      });
    }
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err && err.code != null
        ? String(err.code)
        : "QB_BACKFILL_ERROR";
    lines.push(`backfill failed code=${code}`);
    if (code === "QB_BACKFILL_NO_PROGRESS" || code === "QB_BACKFILL_MAX_ROUNDS") {
      lines.push(V4_MIGRATION_HINT);
    }
    const joined = lines.join("\n");
    if (joined.includes(String(env.SUPABASE_SERVICE_ROLE_KEY))) {
      return { exitCode: 1, lines: ["backfill failed (sanitized)"] };
    }
    return { exitCode: 1, lines };
  }

  lines.push("");
  lines.push("Summary:");
  for (const s of summaries) {
    lines.push(formatEntitySummaryLine(s));
  }
  lines.push("backfill complete");

  const joined = lines.join("\n");
  if (
    joined.includes(String(env.SUPABASE_SERVICE_ROLE_KEY)) ||
    joined.toLowerCase().includes("raw_payload")
  ) {
    return { exitCode: 1, lines: ["backfill output failed safety check"] };
  }

  for (const line of lines) log(line);
  return { exitCode: 0, lines };
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { exitCode, lines } = await runBackfillCli();
  if (exitCode !== 0) {
    for (const line of lines) console.error(line);
  }
  process.exit(exitCode);
}
