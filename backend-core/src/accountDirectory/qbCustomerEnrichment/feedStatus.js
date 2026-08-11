/**
 * Read models for AD QuickBooks customer enrichment feed (fail-soft).
 */

export const AD_QB_ENRICHMENT_STATUSES = Object.freeze({
  DISABLED: "disabled",
  UNAVAILABLE: "unavailable",
  STALE: "stale",
  OK: "ok"
});

export const AD_QB_ACCOUNT_LINK_LABELS = Object.freeze({
  LINKED: "QuickBooks Linked",
  NOT_LINKED: "QuickBooks Not Linked",
  SUGGESTED_MATCH: "Suggested Match",
  NEEDS_REVIEW: "Needs Review"
});

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isAdQbCustomerEnrichmentEnabled(env = process.env) {
  const raw = String(env.AD_QB_CUSTOMER_ENRICHMENT_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getAdQbEnrichmentStaleAfterSeconds(env = process.env) {
  const n = Number(env.AD_QB_CUSTOMER_ENRICHMENT_STALE_AFTER_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 14400;
}

/**
 * @param {{ status: string, lastSuccessAt?: string|null, ageSeconds?: number|null, reason?: string|null, openSuggestions?: number, needsReview?: number, conflict?: number }} partial
 */
export function emptyEnrichmentFeedStatus(partial = {}) {
  return {
    status: partial.status || AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE,
    last_success_at: partial.lastSuccessAt ?? null,
    age_seconds: partial.ageSeconds ?? null,
    stale_after_seconds: partial.staleAfterSeconds ?? getAdQbEnrichmentStaleAfterSeconds(),
    reason: partial.reason ?? null,
    open_suggestions: partial.openSuggestions ?? 0,
    needs_review: partial.needsReview ?? 0,
    conflict: partial.conflict ?? 0,
    customers_count: partial.customersCount ?? null,
    jobs_count: partial.jobsCount ?? null,
    roots_count: partial.rootsCount ?? null,
    source: "quickbooks_desktop_odbc_customers"
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} supabase
 * @param {string} organizationId
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Date} [now]
 */
export async function getAdQbCustomerEnrichmentFeedStatus(
  supabase,
  organizationId,
  env = process.env,
  now = new Date()
) {
  if (!isAdQbCustomerEnrichmentEnabled(env)) {
    return emptyEnrichmentFeedStatus({
      status: AD_QB_ENRICHMENT_STATUSES.DISABLED,
      reason: "AD_QB_CUSTOMER_ENRICHMENT_ENABLED is off",
      staleAfterSeconds: getAdQbEnrichmentStaleAfterSeconds(env)
    });
  }
  if (!supabase || !organizationId) {
    return emptyEnrichmentFeedStatus({
      status: AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE,
      reason: "missing_supabase_or_organization",
      staleAfterSeconds: getAdQbEnrichmentStaleAfterSeconds(env)
    });
  }

  try {
    const { data: run, error } = await supabase
      .from("ad_qb_customer_sync_runs")
      .select(
        "id,status,completed_at,started_at,customers_count,jobs_count,roots_count,suggestions_open_count,error_summary"
      )
      .eq("organization_id", organizationId)
      .in("status", ["success", "partial"])
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        return emptyEnrichmentFeedStatus({
          status: AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE,
          reason: "tables_not_installed",
          staleAfterSeconds: getAdQbEnrichmentStaleAfterSeconds(env)
        });
      }
      throw error;
    }
    if (!run?.completed_at) {
      return emptyEnrichmentFeedStatus({
        status: AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE,
        reason: "no_successful_sync",
        staleAfterSeconds: getAdQbEnrichmentStaleAfterSeconds(env)
      });
    }

    const completedAt = new Date(run.completed_at);
    const ageSeconds = Math.max(0, Math.round((now.getTime() - completedAt.getTime()) / 1000));
    const staleAfter = getAdQbEnrichmentStaleAfterSeconds(env);
    const status =
      ageSeconds > staleAfter ? AD_QB_ENRICHMENT_STATUSES.STALE : AD_QB_ENRICHMENT_STATUSES.OK;

    const counts = await countSuggestionStatuses(supabase, organizationId);

    return emptyEnrichmentFeedStatus({
      status,
      lastSuccessAt: run.completed_at,
      ageSeconds,
      staleAfterSeconds: staleAfter,
      reason: status === AD_QB_ENRICHMENT_STATUSES.STALE ? "sync_stale" : null,
      openSuggestions: counts.open,
      needsReview: counts.needs_review,
      conflict: counts.conflict,
      customersCount: run.customers_count,
      jobsCount: run.jobs_count,
      rootsCount: run.roots_count
    });
  } catch (e) {
    return emptyEnrichmentFeedStatus({
      status: AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE,
      reason: String(e?.message ?? e).slice(0, 200),
      staleAfterSeconds: getAdQbEnrichmentStaleAfterSeconds(env)
    });
  }
}

async function countSuggestionStatuses(supabase, organizationId) {
  const out = { open: 0, needs_review: 0, conflict: 0 };
  for (const status of Object.keys(out)) {
    const { count, error } = await supabase
      .from("ad_qb_link_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", status);
    if (!error && typeof count === "number") out[status] = count;
  }
  return out;
}

/**
 * Map enrichment suggestion onto an AD account list/detail row.
 * @param {{ quickbooksLinked?: boolean }} account
 * @param {object|null|undefined} suggestion
 */
export function resolveAccountQbEnrichmentLabel(account, suggestion) {
  if (account?.quickbooksLinked) {
    return {
      code: "linked",
      label: AD_QB_ACCOUNT_LINK_LABELS.LINKED,
      suggestionId: null,
      suggestionStatus: null
    };
  }
  const status = String(suggestion?.status ?? "").trim();
  if (status === "needs_review" || status === "conflict") {
    return {
      code: "needs_review",
      label: AD_QB_ACCOUNT_LINK_LABELS.NEEDS_REVIEW,
      suggestionId: suggestion?.id ?? null,
      suggestionStatus: status
    };
  }
  if (status === "open") {
    return {
      code: "suggested_match",
      label: AD_QB_ACCOUNT_LINK_LABELS.SUGGESTED_MATCH,
      suggestionId: suggestion?.id ?? null,
      suggestionStatus: status
    };
  }
  return {
    code: "not_linked",
    label: AD_QB_ACCOUNT_LINK_LABELS.NOT_LINKED,
    suggestionId: null,
    suggestionStatus: null
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {{ statuses?: string[], limit?: number }} [opts]
 */
export async function listAdQbLinkSuggestions(supabase, organizationId, opts = {}) {
  const statuses = opts.statuses?.length
    ? opts.statuses
    : ["open", "needs_review", "conflict"];
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  try {
    const { data, error } = await supabase
      .from("ad_qb_link_suggestions")
      .select(
        "id,qb_list_id,qb_full_name,qb_name,status,suggested_account_id,rank_score,rank_method,conflict_reason,candidate_accounts,updated_at"
      )
      .eq("organization_id", organizationId)
      .in("status", statuses)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingRelationError(error)) return { ok: false, unavailable: true, items: [] };
      throw error;
    }
    return {
      ok: true,
      items: (data || []).map((row) => ({
        id: row.id,
        qbListId: row.qb_list_id,
        qbFullName: row.qb_full_name,
        qbName: row.qb_name,
        status: row.status,
        suggestedAccountId: row.suggested_account_id,
        rankScore: row.rank_score,
        rankMethod: row.rank_method,
        conflictReason: row.conflict_reason,
        candidateAccounts: row.candidate_accounts || [],
        updatedAt: row.updated_at
      }))
    };
  } catch (e) {
    return { ok: false, unavailable: true, items: [], error: String(e?.message ?? e).slice(0, 200) };
  }
}

/**
 * Build map accountId → best open suggestion referencing that account.
 * @param {Array<object>} suggestions
 */
export function indexSuggestionsByAccountId(suggestions) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const s of suggestions || []) {
    const ids = new Set();
    if (s.suggestedAccountId) ids.add(String(s.suggestedAccountId));
    for (const c of s.candidateAccounts || []) {
      if (c?.accountId) ids.add(String(c.accountId));
    }
    for (const id of ids) {
      const prev = map.get(id);
      if (!prev) {
        map.set(id, s);
        continue;
      }
      // Prefer needs_review/conflict over open; then higher rank.
      const rank = (x) =>
        x.status === "conflict" ? 3 : x.status === "needs_review" ? 2 : x.status === "open" ? 1 : 0;
      if (rank(s) > rank(prev) || (rank(s) === rank(prev) && (s.rankScore || 0) > (prev.rankScore || 0))) {
        map.set(id, s);
      }
    }
  }
  return map;
}

/**
 * Mark suggestion linked after explicit linkQuickBooks confirmation.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, qbListId: string, accountId: string, actorUserId?: string|null }} params
 */
export async function markSuggestionLinked(supabase, params) {
  if (!supabase) return { ok: false, skipped: true };
  const organizationId = String(params.organizationId ?? "").trim();
  const qbListId = String(params.qbListId ?? "").trim();
  if (!organizationId || !qbListId) return { ok: false, skipped: true };
  try {
    const { error } = await supabase
      .from("ad_qb_link_suggestions")
      .update({
        status: "linked",
        suggested_account_id: params.accountId || null,
        resolved_at: new Date().toISOString(),
        resolved_by: params.actorUserId || null,
        resolution_action: "link_quickbooks",
        updated_at: new Date().toISOString()
      })
      .eq("organization_id", organizationId)
      .eq("qb_list_id", qbListId);
    if (error) {
      if (isMissingRelationError(error)) return { ok: false, unavailable: true };
      throw error;
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, suggestionId: string, actorUserId?: string|null }} params
 */
export async function dismissSuggestion(supabase, params) {
  const { data, error } = await supabase
    .from("ad_qb_link_suggestions")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by: params.actorUserId || null,
      resolution_action: "dismissed",
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.suggestionId)
    .select("id,status")
    .maybeSingle();
  if (error) throw error;
  return data;
}
