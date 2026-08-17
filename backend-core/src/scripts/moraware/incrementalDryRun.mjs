#!/usr/bin/env node
/**
 * Incremental Moraware population DRY-RUN.
 *
 * Offline (default): fixture / empty list — no Moraware contact.
 *
 * Live Moraware READ-ONLY:
 *   npm run eos:moraware:incremental:dry-run -- --allow-moraware-read
 *
 * --allow-moraware-read authorizes canonical Moraware READS only.
 * It does NOT authorize Brain/cursor/prepared/worksheet/lock writes.
 *
 * Never acquires moraware_population. Never advances cursor.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMemoryIncrementalCursorStore,
  createSupabaseIncrementalCursorStore
} from "../../moraware/morawareIncrementalCursor.mjs";
import { runMorawareIncrementalLiveReadDryRun } from "../../moraware/morawareIncrementalLiveReadDryRun.mjs";
import { planMorawareIncrementalPopulation } from "../../moraware/morawareIncrementalPopulation.mjs";
import { describeMorawareIncrementalStrategy } from "../../moraware/morawareIncrementalStrategy.mjs";
import { resolveCurrentMorawarePopulation } from "../../moraware/morawareCurrentPopulation.mjs";
import { MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP } from "../../moraware/morawareIncrementalReadAdapter.mjs";
import { WORKSHEET_FACTS_TABLE } from "../../moraware/morawareJobWorksheetPreparedFacts.mjs";

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

async function loadExistingWorksheetRowsByJobId(supabase, { organizationId, importGroupId, sourceJobIds }) {
  const map = new Map();
  const ids = (sourceJobIds || []).map(String).filter(Boolean);
  if (!ids.length) return map;
  // READ-ONLY select — never delete/upsert.
  const { data, error } = await supabase
    .from(WORKSHEET_FACTS_TABLE)
    .select("organization_id,import_group_id,source_job_id,source_form_id")
    .eq("organization_id", organizationId)
    .eq("import_group_id", importGroupId)
    .in("source_job_id", ids);
  if (error) throw new Error(error.message || String(error));
  for (const row of data || []) {
    const jid = String(row.source_job_id);
    if (!map.has(jid)) map.set(jid, []);
    map.get(jid).push(row);
  }
  return map;
}

async function main() {
  const organizationId =
    argValue("--organization-id=") ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) ||
    "89180433-9fab-4024-bec9-a14d870bd0a8";

  const allowMorawareRead = hasFlag("--allow-moraware-read");
  const fixturePath = argValue("--fixture=");
  const rollingBatchSize =
    argValue("--rolling-batch-size=") || process.env.MORAWARE_INCREMENTAL_ROLLING_BATCH_SIZE || "25";
  const extraJobIds = String(argValue("--extra-job-ids=") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let listRows = [];
  let exactJobs = [];
  let existingWorksheetRowsByJobId = new Map();
  let cursorSeed = {};
  let fixturePopulation = null;

  if (fixturePath) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    } catch (e) {
      console.error(
        JSON.stringify(
          { ok: false, status: "fixture_invalid", error: String(e?.message || e) },
          null,
          2
        )
      );
      process.exitCode = 2;
      return;
    }
    listRows = raw.listRows || raw.list_rows || [];
    exactJobs = raw.exactJobs || raw.exact_jobs || [];
    cursorSeed = raw.cursor || {};
    fixturePopulation = raw.population || null;
    if (raw.existingWorksheetRowsByJobId) {
      existingWorksheetRowsByJobId = new Map(Object.entries(raw.existingWorksheetRowsByJobId));
    }
  }

  const strategy = describeMorawareIncrementalStrategy();
  console.log("DRY-RUN Moraware incremental population");
  console.log(`strategy=${strategy.strategy}`);
  console.log(`organization_id=${organizationId}`);
  console.log(`allow_moraware_read=${allowMorawareRead}`);
  console.log(`candidate_cap=${MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP}`);
  console.log("lock=not acquired (dry-run)");
  console.log("writes=0");

  if (!allowMorawareRead) {
    // Offline / fixture path — never contact Moraware
    let population = fixturePopulation;
    if (!population) {
      try {
        const db = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        population = await resolveCurrentMorawarePopulation(db, organizationId);
        cursorSeed = await createSupabaseIncrementalCursorStore(db).readCursor(organizationId);
      } catch (e) {
        console.error(`population_resolve_skipped: ${String(e?.message || e)}`);
      }
    }
    if (!population?.available) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            status: "full_census_not_ready",
            note: "Provide --fixture or Supabase read access. For live Moraware reads use --allow-moraware-read."
          },
          null,
          2
        )
      );
      process.exitCode = 2;
      return;
    }

    const cursorStore = createMemoryIncrementalCursorStore({ [organizationId]: cursorSeed });
    // Memory store only — never write back to Supabase
    const plan = planMorawareIncrementalPopulation({
      population: {
        ...population,
        organization_id: organizationId,
        current_source_job_ids: population.current_source_job_ids || []
      },
      cursor: await cursorStore.readCursor(organizationId),
      listRows,
      exactJobs,
      existingWorksheetRowsByJobId,
      extraSourceJobIds: extraJobIds,
      rollingBatchSize
    });

    console.log(
      JSON.stringify(
        {
          ok: plan.ok,
          dry_run: true,
          allow_moraware_read: false,
          moraware_calls: 0,
          strategy: strategy.strategy,
          status: plan.status,
          window: plan.window,
          rolling: plan.rolling,
          counts: plan.counts,
          creation_window_candidates: plan.creation_window_candidates,
          explicit_candidates: plan.explicit_candidates,
          rolling_candidates: plan.rolling_candidates,
          deduplicated_candidates: plan.deduplicated_candidates,
          cursor_before: plan.cursor_before,
          cursor_after: plan.cursor_before,
          actual_writes: 0,
          note: "Offline dry-run. Pass --allow-moraware-read for canonical live Moraware READS."
        },
        null,
        2
      )
    );
    if (!plan.ok) process.exitCode = 2;
    return;
  }

  // --- LIVE READ path ---
  const db = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Read-only population + cursor (never writeCursor)
  const cursorStoreRead = createSupabaseIncrementalCursorStore(db);
  const result = await runMorawareIncrementalLiveReadDryRun({
    allowMorawareRead: true,
    organizationId,
    rollingBatchSize,
    extraSourceJobIds: extraJobIds,
    resolvePopulation: async (org) => {
      const pop = await resolveCurrentMorawarePopulation(db, org);
      // Load CURRENT source ids for rolling (read-only)
      let currentIds = [];
      if (pop?.available && pop.full_census_started_at) {
        const pageSize = 1000;
        let from = 0;
        for (;;) {
          const { data, error } = await db
            .from("brain_moraware_jobs")
            .select("source_job_id")
            .eq("organization_id", org)
            .gte("last_seen_at", pop.full_census_started_at)
            .order("source_job_id", { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw new Error(error.message || String(error));
          if (!data?.length) break;
          currentIds.push(...data.map((r) => String(r.source_job_id)));
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
      return {
        ...pop,
        organization_id: org,
        current_source_job_ids: currentIds
      };
    },
    readCursor: async (org) => cursorStoreRead.readCursor(org),
    loadExistingWorksheetRowsByJobId: async (args) => loadExistingWorksheetRowsByJobId(db, args)
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
