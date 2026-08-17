#!/usr/bin/env node
/**
 * LIVE governed population — Moraware Job Worksheet prepared facts.
 *
 * Requires ALL of:
 *   --live
 *   --allow-live-population
 *   MORAWARE_WORKSHEET_FACTS_LIVE=1
 *
 * Acquires moraware_population (standalone) unless --outer-owner-token= is passed.
 *
 * Usage:
 *   npm run eos:moraware:worksheet-facts:populate -- --live --allow-live-population
 *   MORAWARE_WORKSHEET_FACTS_LIVE=1 node .../worksheetFactsPopulate.mjs --live --allow-live-population
 *
 * Outer pipeline:
 *   ... --live --allow-live-population --outer-owner-token=<token>
 *
 * This command is intentionally separate from dry-run.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  populateMorawareJobWorksheetPreparedFacts,
  WORKSHEET_FACTS_TABLE,
  WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
  MORAWARE_POPULATION_LOCK_NAME
} from "../../moraware/morawareJobWorksheetPreparedFacts.mjs";

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnv(join(process.cwd(), ".env"));
loadEnv(join(process.cwd(), "backend-core/.env"));

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function argValue(prefix) {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length).trim();
  }
  return "";
}

function requiredEnv(name) {
  const v = pickStr(process.env[name]);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const live = hasFlag("--live");
  const allow = hasFlag("--allow-live-population");
  const envAllow = pickStr(process.env.MORAWARE_WORKSHEET_FACTS_LIVE) === "1";
  const outerOwnerToken = argValue("--outer-owner-token=");
  const organizationId =
    argValue("--organization-id=") ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) ||
    "89180433-9fab-4024-bec9-a14d870bd0a8";

  if (!live || !allow || !envAllow) {
    console.error(
      [
        "REFUSED: live population requires all of:",
        "  --live",
        "  --allow-live-population",
        "  MORAWARE_WORKSHEET_FACTS_LIVE=1",
        "",
        "Use dry-run instead:",
        "  npm run eos:moraware:worksheet-facts:dry-run"
      ].join("\n")
    );
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log("LIVE populate Moraware Job Worksheet prepared facts");
  console.log(`organization_id=${organizationId}`);
  console.log(`table=${WORKSHEET_FACTS_TABLE}`);
  console.log(`lock=${MORAWARE_POPULATION_LOCK_NAME}`);
  console.log(`mode=${outerOwnerToken ? "outer" : "standalone"}`);
  console.log(`upsert_on_conflict=${WORKSHEET_FACTS_UPSERT_ON_CONFLICT}`);

  const result = await populateMorawareJobWorksheetPreparedFacts(supabase, organizationId, {
    liveWrite: true,
    allowLivePopulation: true,
    outerOwnerToken: outerOwnerToken || null,
    lockedBy: "worksheet-facts-populate-cli"
  });

  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    lock_mode: result.lock_mode,
    released_standalone_lock: result.released_standalone_lock,
    writes: result.writes,
    summary: result.summary
      ? {
          import_group_id: result.summary.import_group_id,
          current_job_count: result.summary.current_job_count,
          worksheet_fact_count: result.summary.worksheet_fact_count,
          unique_key_count: result.summary.unique_key_count,
          duplicate_key_count: result.summary.duplicate_key_count,
          sqft: result.summary.sqft,
          jobs_without_worksheet: result.summary.jobs_without_worksheet
        }
      : null,
    verification: result.verification
      ? {
          ok: result.verification.ok,
          row_count: result.verification.row_count,
          unique_key_count: result.verification.unique_key_count,
          duplicate_key_count: result.verification.duplicate_key_count,
          sqft: result.verification.sqft,
          broihahn: result.verification.broihahn
        }
      : null,
    event_log: result.event_log,
    error: result.error || null,
    code: result.code || null,
    compute_ms: result.compute_ms
  }, null, 2));

  if (!result.ok) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
