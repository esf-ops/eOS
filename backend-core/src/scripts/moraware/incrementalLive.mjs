#!/usr/bin/env node
/**
 * LIVE incremental Moraware population — FUTURE command.
 *
 * REFUSES to write unless ALL gates are present:
 *   --live
 *   --allow-live-incremental
 *   MORAWARE_INCREMENTAL_LIVE=1
 *
 * Merely running `npm run eos:moraware:incremental` is NOT enough.
 *
 * This script is intentionally separate from dry-run.
 * DO NOT execute against production in the implementation task.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseIncrementalCursorStore } from "../../moraware/morawareIncrementalCursor.mjs";
import { runMorawareIncrementalPopulation } from "../../moraware/morawareIncrementalPopulation.mjs";
import { describeMorawareIncrementalStrategy } from "../../moraware/morawareIncrementalStrategy.mjs";
import { resolveCurrentMorawarePopulation } from "../../moraware/morawareCurrentPopulation.mjs";
import {
  assertMorawarePopulationLockOwner,
  MORAWARE_POPULATION_LOCK_NAME
} from "../../moraware/morawarePopulationLock.mjs";
import { refreshSalesMorawareJobFactsForExactJobs } from "../../moraware/morawareIncrementalPreparedFacts.mjs";
import { refreshMorawareJobWorksheetFactsForExactJobs } from "../../moraware/morawareJobWorksheetPreparedFacts.mjs";

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
  const allow = hasFlag("--allow-live-incremental");
  const envAllow = pickStr(process.env.MORAWARE_INCREMENTAL_LIVE) === "1";
  const organizationId =
    argValue("--organization-id=") ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) ||
    "89180433-9fab-4024-bec9-a14d870bd0a8";

  if (!live || !allow || !envAllow) {
    console.error(
      [
        "REFUSED: live incremental requires all of:",
        "  --live",
        "  --allow-live-incremental",
        "  MORAWARE_INCREMENTAL_LIVE=1",
        "",
        "Use dry-run instead:",
        "  npm run eos:moraware:incremental:dry-run",
        "",
        `strategy=${describeMorawareIncrementalStrategy().strategy}`,
        `lock=${MORAWARE_POPULATION_LOCK_NAME}`
      ].join("\n")
    );
    process.exitCode = 2;
    return;
  }

  // Extra hard stop for this implementation task / accidental runs:
  if (pickStr(process.env.MORAWARE_INCREMENTAL_EXECUTE) !== "I_UNDERSTAND_PRODUCTION_WRITES") {
    console.error(
      [
        "REFUSED: production authorization phrase missing.",
        "Set MORAWARE_INCREMENTAL_EXECUTE=I_UNDERSTAND_PRODUCTION_WRITES",
        "in addition to the live gates above."
      ].join("\n")
    );
    process.exitCode = 2;
    return;
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        status: "live_incremental_not_executed_in_this_task",
        note:
          "Live incremental wiring is defined but intentionally not executed here. Approve a separate production run."
      },
      null,
      2
    )
  );
  process.exitCode = 2;

  // Below is the future live wiring (reachable only after removing the hard stop above
  // in a deliberate follow-up). Kept for contract clarity; unreachable today.
  /* eslint-disable no-unreachable */
  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const cursorStore = createSupabaseIncrementalCursorStore(supabase);

  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId,
    lockedBy: `incremental-live@${pickStr(process.env.HOSTNAME) || "worker"}`,
    extraSourceJobIds: String(argValue("--extra-job-ids=") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    deps: {
      db: supabase,
      cursorStore,
      resolvePopulation: async (org) => resolveCurrentMorawarePopulation(supabase, org),
      listCandidateRows: async () => {
        throw new Error("Wire process-paged creation-window listing before live execution.");
      },
      fetchExactJobs: async () => {
        throw new Error("Wire exact job refresh before live execution.");
      },
      importBrain: async () => {
        throw new Error("Wire incremental Brain import before live execution.");
      },
      refreshPreparedJobFacts: async ({ organizationId: org, importGroupId, jobs, ownerToken }) =>
        refreshSalesMorawareJobFactsForExactJobs(supabase, {
          organizationId: org,
          importGroupId,
          jobs,
          ownerToken,
          liveWrite: true,
          allowLivePopulation: true,
          assertOwner: ({ ownerToken: t }) => assertMorawarePopulationLockOwner(supabase, { ownerToken: t, renew: true })
        }),
      refreshWorksheetFacts: async ({ organizationId: org, importGroupId, jobs, ownerToken }) =>
        refreshMorawareJobWorksheetFactsForExactJobs(supabase, {
          organizationId: org,
          importGroupId,
          jobs,
          outerOwnerToken: ownerToken,
          liveWrite: true,
          allowLivePopulation: true
        })
    }
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
  /* eslint-enable no-unreachable */
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
