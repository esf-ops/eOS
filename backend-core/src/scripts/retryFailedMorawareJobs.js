import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { MorawareClient } from "../../../src/morawareClient.js";
import { runMorawareDiscovery } from "../../../src/morawareDiscovery.js";

import { acquireSyncLock, releaseSyncLock } from "../brain/supabaseBrainStore.js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function toInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  requiredEnv("SUPABASE_URL");
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  requiredEnv("MORAWARE_API_URL");
  requiredEnv("MORAWARE_USERNAME");
  requiredEnv("MORAWARE_PASSWORD");

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const lockName = "moraware_retry_failed_sync";
  const lockedBy = `${process.env.MORAWARE_USERNAME}@${process.pid}`;
  const lockRes = await acquireSyncLock({ lockName, lockedBy, ttlMs: 2 * 60 * 60 * 1000, metadata: { kind: "retry" } });
  if (!lockRes.acquired) {
    console.log("Moraware retry already running.");
    return;
  }

  const limit = toInt(process.env.EOS_RETRY_LIMIT, 50);
  const client = new MorawareClient();

  let attempted = 0;
  let resolved = 0;
  let stillFailing = 0;

  try {
    const { data: rows, error } = await supabase
      .from("eos_failed_job_syncs")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);

    for (const r of rows ?? []) {
      const jobId = String(r.job_id ?? "").trim();
      if (!jobId) continue;
      attempted += 1;

      const nowIso = new Date().toISOString();
      const nextRetryCount = (Number(r.retry_count ?? 0) || 0) + 1;

      // Update retry bookkeeping first.
      const pre = await supabase
        .from("eos_failed_job_syncs")
        .update({ retry_count: nextRetryCount, last_retry_at: nowIso })
        .eq("id", r.id);
      if (pre.error) console.warn("Failed to update retry_count:", pre.error.message);

      try {
        // Run exact-job ingestion using the proven discovery path.
        process.env.MORAWARE_DISCOVERY = "1";
        process.env.MORAWARE_DISCOVERY_MODE = "exact-job";

        // Do not tie retries to a production sync run row.
        delete process.env.EOS_SYNC_RUN_ID;

        await runMorawareDiscovery({
          client,
          jobId,
          accountId: null,
          entrypointProof: { markerLine: "EOS RETRY FAILED JOB" }
        });

        const ok = await supabase.from("eos_failed_job_syncs").update({ resolved: true }).eq("id", r.id);
        if (ok.error) console.warn("Failed to mark resolved:", ok.error.message);
        resolved += 1;
      } catch (e) {
        stillFailing += 1;
        const msg = String(e?.message || e);
        const up = await supabase
          .from("eos_failed_job_syncs")
          .update({ error_message: msg })
          .eq("id", r.id);
        if (up.error) console.warn("Failed to update error_message:", up.error.message);
        console.warn(`Retry failed jobId=${jobId}:`, msg);
      }
    }
  } finally {
    await releaseSyncLock(lockName).catch(() => {});
  }

  console.log("Retry summary:", { attempted, resolved, stillFailing });
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});

