#!/usr/bin/env node
/**
 * LIVE incremental Moraware population — governed production path.
 *
 * REFUSES unless ALL gates are present:
 *   --live
 *   --allow-live-incremental
 *   MORAWARE_INCREMENTAL_LIVE=1
 *   MORAWARE_INCREMENTAL_EXECUTE=I_UNDERSTAND_PRODUCTION_WRITES
 *
 * Merely running `npm run eos:moraware:incremental` is NOT enough.
 * Dry-run remains a separate command and cannot mutate.
 *
 * DO NOT execute against production without an explicit approved run task.
 */

import { createClient } from "@supabase/supabase-js";
import { hostname as osHostname } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSupabaseIncrementalCursorStore
} from "../../moraware/morawareIncrementalCursor.mjs";
import {
  runMorawareIncrementalPopulation,
  MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING_DEFAULT,
  resolveLiveIncrementalCandidateCeiling
} from "../../moraware/morawareIncrementalPopulation.mjs";
import { describeMorawareIncrementalStrategy } from "../../moraware/morawareIncrementalStrategy.mjs";
import { resolveCurrentMorawarePopulation } from "../../moraware/morawareCurrentPopulation.mjs";
import {
  assertMorawarePopulationLockOwner,
  MORAWARE_POPULATION_LOCK_NAME,
  MORAWARE_POPULATION_LOCK_LEASE_MS,
  MORAWARE_POPULATION_LOCK_HEARTBEAT_MS
} from "../../moraware/morawarePopulationLock.mjs";
import { refreshSalesMorawareJobFactsForExactJobs } from "../../moraware/morawareIncrementalPreparedFacts.mjs";
import { refreshMorawareJobWorksheetFactsForExactJobs } from "../../moraware/morawareJobWorksheetPreparedFacts.mjs";
import { importIncrementalMorawareBrainJobs } from "../../moraware/morawareIncrementalBrainImport.mjs";
import {
  evaluateMorawareIncrementalLiveGates,
  formatLiveIncrementalGateRefusal
} from "../../moraware/morawareIncrementalLiveGates.mjs";
import {
  createMorawareIncrementalReadClient,
  listCandidateRowsViaCanonicalProcessPagedQuery,
  fetchExactJobsViaCanonicalReads,
  withIncrementalMorawareQuietLogs
} from "../../moraware/morawareIncrementalReadAdapter.mjs";
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

async function loadCurrentSourceJobIds(db, org, population) {
  const started = population?.full_census_started_at;
  if (!started) return [];
  const ids = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("brain_moraware_jobs")
      .select("source_job_id")
      .eq("organization_id", org)
      .gte("last_seen_at", started)
      .order("source_job_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || String(error));
    if (!data?.length) break;
    ids.push(...data.map((r) => String(r.source_job_id)));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function loadExistingWorksheetRowsByJobId(db, { organizationId, importGroupId, sourceJobIds }) {
  const map = new Map();
  const ids = (sourceJobIds || []).map(String).filter(Boolean);
  if (!ids.length) return map;
  const { data, error } = await db
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
  const gates = evaluateMorawareIncrementalLiveGates({
    argv: process.argv.slice(2),
    env: process.env
  });
  if (!gates.ok) {
    console.error(formatLiveIncrementalGateRefusal(gates));
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: gates.status,
          missing: gates.missing,
          strategy: describeMorawareIncrementalStrategy().strategy,
          lock: MORAWARE_POPULATION_LOCK_NAME,
          lease_ms: MORAWARE_POPULATION_LOCK_LEASE_MS,
          heartbeat_ms: MORAWARE_POPULATION_LOCK_HEARTBEAT_MS
        },
        null,
        2
      )
    );
    process.exitCode = 2;
    return;
  }

  const organizationId =
    argValue("--organization-id=") ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) ||
    "89180433-9fab-4024-bec9-a14d870bd0a8";

  const rollingBatchSize =
    argValue("--rolling-batch-size=") || process.env.MORAWARE_INCREMENTAL_ROLLING_BATCH_SIZE || "25";
  const liveCeiling = resolveLiveIncrementalCandidateCeiling(
    argValue("--live-candidate-ceiling=") || process.env.MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING,
    MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING_DEFAULT
  );
  const extraJobIds = String(argValue("--extra-job-ids=") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const cursorStore = createSupabaseIncrementalCursorStore(supabase);

  const result = await withIncrementalMorawareQuietLogs(async () => {
    const client = createMorawareIncrementalReadClient();
    return runMorawareIncrementalPopulation({
      dryRun: false,
      liveWrite: true,
      allowLivePopulation: true,
      organizationId,
      lockedBy: `incremental-live@${pickStr(process.env.HOSTNAME) || osHostname() || "worker"}`,
      hostname: osHostname(),
      rollingBatchSize,
      liveCandidateCeiling: liveCeiling,
      extraSourceJobIds: extraJobIds,
      deps: {
        db: supabase,
        cursorStore,
        resolvePopulation: async (org) => {
          const pop = await resolveCurrentMorawarePopulation(supabase, org);
          const currentIds = await loadCurrentSourceJobIds(supabase, org, pop);
          return {
            ...pop,
            organization_id: org,
            current_source_job_ids: currentIds
          };
        },
        listCandidateRows: async ({ window }) => {
          const startMs = window?.cursor_start ? Date.parse(window.cursor_start) : null;
          const endMs = window?.cursor_end ? Date.parse(window.cursor_end) : null;
          return listCandidateRowsViaCanonicalProcessPagedQuery({
            client,
            creationWindowStartMs: Number.isFinite(startMs) ? startMs : null,
            creationWindowEndMs: Number.isFinite(endMs) ? endMs : null
          });
        },
        fetchExactJobs: async ({ sourceJobIds }) =>
          fetchExactJobsViaCanonicalReads({ client, sourceJobIds }),
        importBrain: async ({ jobs, metadata, ownerToken, parentFullEpochId }) =>
          importIncrementalMorawareBrainJobs(supabase, {
            organizationId,
            parentFullEpochId,
            jobs,
            metadata,
            ownerToken,
            liveWrite: true,
            allowLivePopulation: true
          }),
        refreshPreparedJobFacts: async ({ organizationId: org, importGroupId, jobs, ownerToken }) =>
          refreshSalesMorawareJobFactsForExactJobs(supabase, {
            organizationId: org,
            importGroupId,
            jobs,
            ownerToken,
            liveWrite: true,
            allowLivePopulation: true,
            assertOwner: ({ ownerToken: t }) =>
              assertMorawarePopulationLockOwner(supabase, { ownerToken: t, renew: true })
          }),
        refreshWorksheetFacts: async ({ organizationId: org, importGroupId, jobs, ownerToken }) =>
          refreshMorawareJobWorksheetFactsForExactJobs(supabase, {
            organizationId: org,
            importGroupId,
            jobs,
            outerOwnerToken: ownerToken,
            liveWrite: true,
            allowLivePopulation: true,
            loadExistingRows: (args) => loadExistingWorksheetRowsByJobId(supabase, args)
          })
      }
    });
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
