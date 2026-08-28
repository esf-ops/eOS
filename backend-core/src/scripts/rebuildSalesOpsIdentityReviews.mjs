/**
 * Rebuild Sales Ops identity reviews through the same service as the org-admin route.
 * Prints counts only. Does not print account names.
 *
 * Usage (service-role env already present; never print secrets):
 *   node backend-core/src/scripts/rebuildSalesOpsIdentityReviews.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { createSalesOpsSupabaseStore } from "../salesOps/salesOpsSupabaseStore.mjs";
import { rebuildIdentityReviews } from "../salesOps/salesOpsIdentityReviewService.mjs";

const ORG_KEY = "elite_stone_fabrication";

function env(name) {
  return String(process.env[name] || "").trim();
}

async function main() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("MISSING SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: org, error: orgErr } = await db
    .from("organizations")
    .select("id")
    .eq("organization_key", ORG_KEY)
    .maybeSingle();
  if (orgErr || !org?.id) {
    console.error("ORG_NOT_FOUND");
    process.exit(2);
  }
  const { data: admin } = await db
    .from("user_profiles")
    .select("id")
    .eq("organization_id", org.id)
    .in("role", ["admin", "super_admin", "executive"])
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const store = createSalesOpsSupabaseStore(() => db);
  const result = await rebuildIdentityReviews(store, {
    organizationId: org.id,
    actorUserId: admin?.id || null,
    autoCommit: Boolean(admin?.id)
  });
  console.log(
    JSON.stringify({
      ok: true,
      total: result.total,
      exactSourceId: result.exactSourceId,
      reviewRequired: result.reviewRequired,
      noCandidate: result.noCandidate,
      conflict: result.conflict,
      autoLinked: result.autoLinked,
      linkingMethod: result.linkingMethod,
      deterministicBridge: result.deterministicBridge
    })
  );
}

main().catch((e) => {
  console.error("REBUILD_FAILED", e?.code || e?.message || "error");
  process.exit(1);
});
