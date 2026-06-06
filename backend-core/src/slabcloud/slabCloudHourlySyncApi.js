/**
 * slabCloudHourlySyncApi — POST /api/internal/slabcloud/hourly-sync
 *
 * Protected cron endpoint for the hourly typed SlabCloud inventory cache.
 *
 * SECURITY:
 *   - Requires x-eos-cron-secret header matching EOS_CRON_SECRET env var.
 *   - Uses service-role Supabase injected from server context (never created here).
 *   - Never exposes service-role key or sync controls to the browser.
 *
 * SAFETY (read before extending):
 *   - Always uses SLABCLOUD_INVENTORY_SCOPE=typed (Slab + Remnant lanes).
 *   - Write-gated: writes only when SLABCLOUD_CACHE_WRITE_ENABLED=1 on the backend.
 *   - Never writes back to SlabCloud/Slabsmith (read-only SlabCloud access).
 *   - Never deletes rows or marks inventory inactive.
 *   - Never uses count_for_color as inventory authority.
 *   - Anti-overlap guard: skips if a non-stale running sync exists for this org/source.
 *     Stale threshold is OVERLAP_STALE_THRESHOLD_MS (default 60 min) — old stuck runs
 *     do not block forever.
 *
 * PERFORMANCE:
 *   - Defaults to summary-only fetch (no per-color detail calls) so the sync
 *     completes within serverless function timeouts (~10–15 s on Vercel Pro).
 *   - Set SLABCLOUD_HOURLY_FETCH_DETAILS=1 to enable per-color detail enrichment
 *     (longer, only advisable on a long-lived worker or Vercel Enterprise).
 *
 * ENV VARS (all read at request time, not at module load):
 *   EOS_CRON_SECRET                  required — matched against x-eos-cron-secret header
 *   SLABOS_ORGANIZATION_ID           preferred org id env var
 *   SLABCLOUD_ORGANIZATION_ID        fallback org id env var
 *   SLABCLOUD_CACHE_WRITE_ENABLED    "1" to write; omit/0 for dry-run
 *   SLABCLOUD_BASE_URL               default https://slabcloud.com
 *   SLABCLOUD_API_COMPANY_CODE       default kbyd
 *   SLABCLOUD_ASSET_COMPANY_CODE     default same as API company code
 *   SLABCLOUD_PUBLIC_SLUG            default esf
 *   SLABCLOUD_CONCURRENCY            default 2
 *   SLABCLOUD_HOURLY_FETCH_DETAILS   "1" to enable per-color detail fetches (slower)
 */

import { buildClientConfig } from "./slabCloudClient.js";
import { runSlabCloudInventorySync } from "./slabCloudSync.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * A sync run older than this threshold is considered stale and will not block
 * the next hourly sync. Prevents a crashed/hung run from blocking indefinitely.
 *
 * 60 minutes: generous enough to let a slow run finish, but ensures hourly cadence
 * is not permanently blocked by a single stuck job.
 */
export const OVERLAP_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

export const EXTERNAL_SOURCE_SLABCLOUD = "slabcloud";

// ── Helpers (exported for unit-testing) ──────────────────────────────────────

/**
 * Read the cron secret from env. Returns null if not configured.
 * Read at request time so tests can override process.env safely.
 */
export function readCronSecret() {
  return String(process.env.EOS_CRON_SECRET ?? "").trim() || null;
}

/**
 * Validate the cron secret from the incoming request.
 *
 * Accepted forms (either satisfies the check):
 *   x-eos-cron-secret: <EOS_CRON_SECRET>         — primary (Cloudflare Worker, external callers)
 *   Authorization: Bearer <EOS_CRON_SECRET>        — secondary (Vercel Cron native behavior)
 *
 * Returns:
 *   { ok: true }            — header present and correct
 *   { ok: false, status: 401, error: "..." } — missing or wrong header
 *   { ok: false, status: 500, error: "..." } — env var not configured
 */
export function validateCronSecret(req) {
  const expected = readCronSecret();
  if (!expected) {
    return { ok: false, status: 500, error: "EOS_CRON_SECRET not configured on backend" };
  }

  // Primary: custom header (Cloudflare Worker, any HTTP client).
  const customHeader = String(req?.headers?.["x-eos-cron-secret"] ?? "").trim();
  if (customHeader && customHeader === expected) {
    return { ok: true };
  }

  // Secondary: Vercel Cron sends Authorization: Bearer <secret>.
  const authHeader = String(req?.headers?.["authorization"] ?? "").trim();
  const bearerPrefix = "bearer ";
  if (authHeader.toLowerCase().startsWith(bearerPrefix)) {
    const bearerToken = authHeader.slice(bearerPrefix.length).trim();
    if (bearerToken && bearerToken === expected) {
      return { ok: true };
    }
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

/**
 * Resolve organization ID from env.
 * Prefers SLABOS_ORGANIZATION_ID; falls back to SLABCLOUD_ORGANIZATION_ID.
 * Returns null if neither is set.
 */
export function resolveOrgId() {
  return (
    String(process.env.SLABOS_ORGANIZATION_ID ?? "").trim() ||
    String(process.env.SLABCLOUD_ORGANIZATION_ID ?? "").trim() ||
    null
  );
}

/**
 * Check for an active, non-stale running sync for this org + source in
 * slabcloud_sync_runs. Returns the running row if found, or null.
 *
 * "Active" means: status='running' AND started_at > (now - staleThresholdMs).
 * Stale runs (status=running but started_at older than the threshold) are ignored
 * so a crashed run does not permanently block future syncs.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} [externalSource="slabcloud"]
 * @param {number} [staleThresholdMs=OVERLAP_STALE_THRESHOLD_MS]
 * @returns {Promise<object|null>}
 */
export async function findActiveRunningSync(
  db,
  organizationId,
  externalSource = EXTERNAL_SOURCE_SLABCLOUD,
  staleThresholdMs = OVERLAP_STALE_THRESHOLD_MS
) {
  const staleThreshold = new Date(Date.now() - staleThresholdMs).toISOString();
  const { data, error } = await db
    .from("slabcloud_sync_runs")
    .select("id, started_at, status, organization_id, external_source")
    .eq("organization_id", organizationId)
    .eq("external_source", externalSource)
    .eq("status", "running")
    .gt("started_at", staleThreshold)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Anti-overlap query failed: ${error.message}`);
  return data?.[0] ?? null;
}

/**
 * Build the SlabCloud client config for the hourly sync (typed scope, always).
 * Reads env vars at call time so tests can override process.env.
 */
export function buildHourlySyncConfig() {
  const apiCompanyCode =
    String(process.env.SLABCLOUD_API_COMPANY_CODE ?? "").trim() ||
    String(process.env.SLABCLOUD_COMPANY_CODE ?? "").trim() ||
    "kbyd";
  const assetCompanyCode =
    String(process.env.SLABCLOUD_ASSET_COMPANY_CODE ?? "").trim() || apiCompanyCode;
  const publicSlug = String(process.env.SLABCLOUD_PUBLIC_SLUG ?? "").trim() || "esf";
  return buildClientConfig({
    baseUrl: String(process.env.SLABCLOUD_BASE_URL ?? "").trim() || "https://slabcloud.com",
    companyCode: apiCompanyCode,
    apiCompanyCode,
    assetCompanyCode,
    publicSlug,
    inventoryScope: "typed",
  });
}

/**
 * Build the hourly sync response payload from the runSlabCloudInventorySync result.
 * Safe to call in both write and dry-run mode.
 */
export function buildHourlySyncResponse({ result, organizationId, startedAt, finishedAt }) {
  const p = result?.persistence ?? {};
  const tb = result?.typeBreakdown ?? {};
  const writeEnabled = p.writeEnabled ?? false;
  const written = p.written ?? null;
  const wouldWrite = p.wouldWrite ?? {};

  return {
    ok: true,
    mode: p.mode ?? (writeEnabled ? "write" : "dry_run"),
    organization_id: organizationId,
    sync_run_id: p.syncRunId ?? null,
    inventory_scope: "typed",
    normalized_records: result?.normalizedCount ?? 0,
    slab_count: tb.Slab ?? 0,
    remnant_count: tb.Remnant ?? 0,
    raw_written: written?.rawRecords ?? wouldWrite?.rawRecords ?? 0,
    inventory_upserted: written?.slabInventory ?? wouldWrite?.slabInventory ?? 0,
    materials_upserted: written?.slabMaterials ?? wouldWrite?.slabMaterials ?? 0,
    images_upserted: written?.slabImages ?? wouldWrite?.slabImages ?? 0,
    warnings: result?.warnings ?? [],
    started_at: startedAt,
    finished_at: finishedAt,
  };
}

// ── Route attachment ──────────────────────────────────────────────────────────

/**
 * Attach POST /api/internal/slabcloud/hourly-sync to the Express app.
 *
 * The route:
 *   1. Validates x-eos-cron-secret against EOS_CRON_SECRET (401/500 if invalid).
 *   2. Resolves organization ID from SLABOS_ORGANIZATION_ID / SLABCLOUD_ORGANIZATION_ID.
 *   3. Runs anti-overlap guard against slabcloud_sync_runs (409 if active run found).
 *   4. Calls runSlabCloudInventorySync directly (no subprocess spawn).
 *   5. Returns JSON sync summary.
 *
 * @param {import("express").Application} app
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} opts
 */
export function attachSlabCloudHourlySyncRoutes(app, { getSupabase }) {
  app.post("/api/internal/slabcloud/hourly-sync", async (req, res) => {
    // 1. Cron secret gate
    const secretCheck = validateCronSecret(req);
    if (!secretCheck.ok) {
      return res.status(secretCheck.status).json({ ok: false, error: secretCheck.error });
    }

    // 2. Org ID required
    const organizationId = resolveOrgId();
    if (!organizationId) {
      return res.status(500).json({
        ok: false,
        error: "SLABOS_ORGANIZATION_ID (or SLABCLOUD_ORGANIZATION_ID) not configured",
      });
    }

    const startedAt = new Date().toISOString();
    const db = getSupabase();

    // 3. Anti-overlap guard
    //    Non-fatal: a check failure logs a warning and allows the sync to proceed.
    //    A 409 is only returned when a genuinely active non-stale run is found.
    try {
      const existing = await findActiveRunningSync(db, organizationId);
      if (existing) {
        return res.status(409).json({
          ok: false,
          skipped: true,
          reason: "sync_already_running",
          existing_sync_run_id: existing.id,
          existing_started_at: existing.started_at,
          message:
            "A SlabCloud inventory sync is already running for this organization. " +
            "Skipping to prevent overlap. Stale runs (>60 min) are not blocked.",
        });
      }
    } catch (overlapErr) {
      // Log but continue — a transient DB hiccup should not block the sync.
      console.warn(
        "[hourly-sync] Anti-overlap check failed (continuing):",
        overlapErr?.message || String(overlapErr)
      );
    }

    // 4. Build client config (typed scope is always used here)
    const config = buildHourlySyncConfig();

    // 5. Summary-only by default for hourly (keeps runtime inside serverless timeout).
    //    Set SLABCLOUD_HOURLY_FETCH_DETAILS=1 to enable per-color detail enrichment.
    const fetchDetails =
      String(process.env.SLABCLOUD_HOURLY_FETCH_DETAILS ?? "").trim() === "1";
    const concurrency = Math.max(
      1,
      parseInt(String(process.env.SLABCLOUD_CONCURRENCY ?? "2"), 10) || 2
    );
    const writeEnabled =
      String(process.env.SLABCLOUD_CACHE_WRITE_ENABLED ?? "").trim() === "1";

    // 6. Run sync inline (imports module directly; no subprocess spawn).
    let result;
    try {
      result = await runSlabCloudInventorySync({
        config,
        fetchDetails,
        maxDetails: 0,
        concurrency,
        organizationId,
        db,
        writeEnabled,
        // triggered_by is set via runMeta inside runSlabCloudInventorySync.
        // We pass a custom triggeredBy via the config object is not possible;
        // instead, slabCloudSync.js sets triggeredBy="script" internally.
        // The route adds triggered_by to the response for observability.
        fetchers: {},
      });
    } catch (syncErr) {
      const finishedAt = new Date().toISOString();
      console.error("[hourly-sync] Sync failed:", syncErr?.message || String(syncErr));
      return res.status(500).json({
        ok: false,
        error: String(syncErr?.message || syncErr),
        organization_id: organizationId,
        inventory_scope: "typed",
        started_at: startedAt,
        finished_at: finishedAt,
      });
    }

    const finishedAt = new Date().toISOString();
    return res.json(
      buildHourlySyncResponse({ result, organizationId, startedAt, finishedAt })
    );
  });
}
