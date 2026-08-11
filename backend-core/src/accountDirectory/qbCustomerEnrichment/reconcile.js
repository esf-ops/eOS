/**
 * Reconcile prepared QB customer facts against Account Directory external links.
 *
 * - Exact ListID match → reconciled (no write to external_links)
 * - Unlinked active root → open / needs_review suggestion (name rank only)
 * - Conflict flags when name matches an account already linked to a different ListID
 * - Jobs never become suggestions or AD links
 * - Never auto-link, never mutate AD identity fields
 * - Human terminal statuses (dismissed, linked) are preserved across syncs;
 *   ranking/context may refresh without reopening those rows. Exact ListID
 *   match may upgrade to reconciled (still terminal).
 */

import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "../accountDirectoryQuickbooksLinkage.mjs";
import { rankAccountCandidates } from "./nameRank.js";

const SUGGESTION_PAGE = 1000;

/** Intentional human/system terminal statuses that must not reopen to open/needs_review/conflict. */
export const AD_QB_HUMAN_TERMINAL_STATUSES = new Set(["dismissed", "linked"]);

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * Preserve human terminal suggestion decisions while allowing ranking/context refresh.
 * Exact ListID match (planned reconciled) may upgrade dismissed/linked → reconciled.
 *
 * @param {object} planned
 * @param {object|null|undefined} existing
 */
export function applySuggestionUpsertPreservation(planned, existing) {
  if (!existing) return planned;
  const existingStatus = String(existing.status ?? "").trim();
  if (!AD_QB_HUMAN_TERMINAL_STATUSES.has(existingStatus)) {
    return planned;
  }
  if (planned.status === "reconciled") {
    return planned;
  }
  return {
    ...planned,
    status: existingStatus,
    resolved_at: existing.resolved_at ?? existing.resolvedAt ?? null,
    resolution_action: existing.resolution_action ?? existing.resolutionAction ?? null
  };
}

/**
 * Pure reconciliation planner (no I/O) — used by tests.
 *
 * @param {{
 *   rootFacts: Array<object>,
 *   linksByListId: Map<string, { accountId: string, externalId: string }>,
 *   accounts: Array<object>,
 *   existingSuggestionsByListId?: Map<string, object>
 * }} input
 */
export function planAdQbCustomerReconciliation(input) {
  const { rootFacts, linksByListId, accounts, existingSuggestionsByListId } = input;
  const existingMap = existingSuggestionsByListId || new Map();
  /** @type {Array<object>} */
  const upserts = [];
  let reconciled = 0;
  let open = 0;
  let needsReview = 0;
  let conflict = 0;
  let preservedTerminal = 0;
  let skippedInactive = 0;
  let skippedJobs = 0;

  for (const fact of rootFacts || []) {
    if (fact.is_job) {
      skippedJobs += 1;
      continue;
    }
    const listId = String(fact.qb_list_id ?? "").trim();
    if (!listId) continue;

    const existing = existingMap.get(listId) || null;
    const existingLink = linksByListId.get(listId);
    /** @type {object} */
    let planned;
    if (existingLink) {
      planned = {
        qb_list_id: listId,
        qb_full_name: fact.full_name ?? null,
        qb_name: fact.name ?? null,
        status: "reconciled",
        suggested_account_id: existingLink.accountId,
        rank_score: 1,
        rank_method: "exact_list_id",
        conflict_reason: null,
        candidate_accounts: [
          {
            accountId: existingLink.accountId,
            score: 1,
            method: "exact_list_id"
          }
        ],
        resolved_at: new Date().toISOString(),
        resolution_action: "exact_list_id_match"
      };
    } else if (fact.is_active === false) {
      // Inactive unlinked roots: if a human terminal row exists, refresh context only.
      if (existing && AD_QB_HUMAN_TERMINAL_STATUSES.has(String(existing.status ?? ""))) {
        planned = {
          qb_list_id: listId,
          qb_full_name: fact.full_name ?? null,
          qb_name: fact.name ?? null,
          status: "open",
          suggested_account_id: existing.suggested_account_id ?? existing.suggestedAccountId ?? null,
          rank_score: existing.rank_score ?? existing.rankScore ?? null,
          rank_method: existing.rank_method ?? existing.rankMethod ?? null,
          conflict_reason: null,
          candidate_accounts: existing.candidate_accounts ?? existing.candidateAccounts ?? [],
          resolved_at: null,
          resolution_action: null
        };
      } else {
        skippedInactive += 1;
        continue;
      }
    } else {
      const ranked = rankAccountCandidates(
        { fullName: fact.full_name, name: fact.name },
        accounts
      );
      const top = ranked[0] || null;
      const conflictHit = ranked.find(
        (c) => c.accountAlreadyQbLinked && c.accountLinkedListId && c.accountLinkedListId !== listId
      );

      let status = "open";
      let conflictReason = null;
      if (conflictHit) {
        status = "conflict";
        conflictReason = "name_matches_account_linked_to_different_list_id";
      } else if (!top) {
        status = "open";
      } else if (ranked.filter((c) => c.score >= 0.85).length > 1) {
        status = "needs_review";
      } else if (top.score < 0.85) {
        status = "needs_review";
      } else {
        status = "open";
      }

      planned = {
        qb_list_id: listId,
        qb_full_name: fact.full_name ?? null,
        qb_name: fact.name ?? null,
        status,
        suggested_account_id: top?.accountId ?? null,
        rank_score: top?.score ?? null,
        rank_method: top?.method ?? null,
        conflict_reason: conflictReason,
        candidate_accounts: ranked,
        resolved_at: null,
        resolution_action: null
      };
    }

    const finalRow = applySuggestionUpsertPreservation(planned, existing);
    if (
      existing &&
      AD_QB_HUMAN_TERMINAL_STATUSES.has(String(existing.status ?? "")) &&
      finalRow.status !== "reconciled" &&
      finalRow.status === String(existing.status ?? "")
    ) {
      preservedTerminal += 1;
    }

    if (finalRow.status === "reconciled") reconciled += 1;
    else if (finalRow.status === "conflict") conflict += 1;
    else if (finalRow.status === "needs_review") needsReview += 1;
    else if (finalRow.status === "open") open += 1;
    // dismissed / linked do not count toward open inbox

    upserts.push(finalRow);
  }

  return {
    upserts,
    stats: {
      reconciled,
      open,
      needsReview,
      conflict,
      preservedTerminal,
      skippedInactive,
      skippedJobs,
      openCount: open + needsReview + conflict
    }
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 */
async function loadRootFacts(supabase, organizationId) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ad_qb_customer_facts")
      .select("qb_list_id,parent_list_id,is_job,name,full_name,is_active")
      .eq("organization_id", organizationId)
      .eq("is_job", false)
      .order("qb_list_id", { ascending: true })
      .range(from, from + SUGGESTION_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < SUGGESTION_PAGE) break;
    from += SUGGESTION_PAGE;
  }
  return rows;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @returns {Promise<Map<string, object>>}
 */
async function loadExistingSuggestionsByListId(supabase, organizationId) {
  /** @type {Map<string, object>} */
  const map = new Map();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ad_qb_link_suggestions")
      .select(
        "qb_list_id,status,suggested_account_id,rank_score,rank_method,conflict_reason,candidate_accounts,resolved_at,resolution_action"
      )
      .eq("organization_id", organizationId)
      .order("qb_list_id", { ascending: true })
      .range(from, from + SUGGESTION_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const listId = String(row.qb_list_id ?? "").trim();
      if (listId) map.set(listId, row);
    }
    if (data.length < SUGGESTION_PAGE) break;
    from += SUGGESTION_PAGE;
  }
  return map;
}

/**
 * Load active quickbooks_desktop links via AD store when provided; else fail soft empty.
 * @param {any} accountDirectoryStore
 * @param {string} organizationId
 */
async function loadLinksAndAccounts(accountDirectoryStore, organizationId) {
  if (!accountDirectoryStore?.listAccounts || !accountDirectoryStore?.listExternalLinksForAccounts) {
    // Minimal path: store may expose listAccounts + batch links differently.
    if (typeof accountDirectoryStore?.listAllExternalLinks === "function") {
      const links = await accountDirectoryStore.listAllExternalLinks(organizationId, {
        externalSystem: ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM,
        activeOnly: true
      });
      const accounts = await accountDirectoryStore.listAccounts?.(organizationId, {
        includeArchived: false
      });
      return { links: links || [], accounts: accounts || [] };
    }
  }

  // Preferred: use directory index helpers if present on store.
  if (typeof accountDirectoryStore?.listAccounts === "function") {
    const accountRows = await accountDirectoryStore.listAccounts(organizationId, {
      statusIn: ["active", "inactive", "prospect", "needs_review"],
      includeArchived: false,
      limit: 20000
    });
    const accounts = Array.isArray(accountRows) ? accountRows : accountRows?.items || [];
    const ids = accounts.map((a) => a.id).filter(Boolean);
    let links = [];
    if (typeof accountDirectoryStore.listExternalLinksForAccounts === "function") {
      links = await accountDirectoryStore.listExternalLinksForAccounts(organizationId, ids);
    } else if (typeof accountDirectoryStore.listExternalLinks === "function") {
      for (const id of ids) {
        const part = await accountDirectoryStore.listExternalLinks(organizationId, id);
        if (part?.length) links.push(...part);
      }
    }
    return { links, accounts };
  }

  return { links: [], accounts: [] };
}

/**
 * Fallback loader using service-role Supabase reads of AD tables.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 */
async function loadLinksAndAccountsFromSupabase(supabase, organizationId) {
  const accounts = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("account_directory_accounts")
      .select("id,display_name,legal_name,status,archived_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("id", { ascending: true })
      .range(from, from + SUGGESTION_PAGE - 1);
    if (error) {
      if (isMissingRelationError(error)) return { links: [], accounts: [], missingTables: true };
      throw error;
    }
    if (!data?.length) break;
    for (const row of data) {
      accounts.push({
        id: row.id,
        displayName: row.display_name,
        legalName: row.legal_name,
        status: row.status
      });
    }
    if (data.length < SUGGESTION_PAGE) break;
    from += SUGGESTION_PAGE;
  }

  const links = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("account_directory_external_links")
      .select("id,account_id,external_id,external_system,is_active")
      .eq("organization_id", organizationId)
      .eq("external_system", ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, from + SUGGESTION_PAGE - 1);
    if (error) {
      if (isMissingRelationError(error)) return { links: [], accounts, missingTables: true };
      throw error;
    }
    if (!data?.length) break;
    for (const row of data) {
      links.push({
        accountId: row.account_id,
        externalId: row.external_id,
        externalSystem: row.external_system,
        isActive: row.is_active
      });
    }
    if (data.length < SUGGESTION_PAGE) break;
    from += SUGGESTION_PAGE;
  }

  const linkedByAccount = new Map();
  for (const link of links) {
    linkedByAccount.set(String(link.accountId), String(link.externalId));
  }
  for (const account of accounts) {
    const listId = linkedByAccount.get(String(account.id));
    account.quickbooksLinked = Boolean(listId);
    account.linkedListId = listId || null;
  }

  return { links, accounts, missingTables: false };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   organizationId: string,
 *   syncRunId?: string|null,
 *   accountDirectoryStore?: any
 * }} params
 */
export async function runAdQbCustomerReconciliation(supabase, params) {
  const organizationId = String(params.organizationId ?? "").trim();
  if (!organizationId) {
    return { ok: false, error: "organization_id required", openCount: 0 };
  }

  let rootFacts;
  try {
    rootFacts = await loadRootFacts(supabase, organizationId);
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { ok: false, unavailable: true, error: "ad_qb_customer_facts missing", openCount: 0 };
    }
    throw e;
  }

  let loaded;
  if (params.accountDirectoryStore) {
    loaded = await loadLinksAndAccounts(params.accountDirectoryStore, organizationId);
  } else {
    loaded = await loadLinksAndAccountsFromSupabase(supabase, organizationId);
  }

  let existingSuggestionsByListId;
  try {
    existingSuggestionsByListId = await loadExistingSuggestionsByListId(supabase, organizationId);
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { ok: false, unavailable: true, error: "ad_qb_link_suggestions missing", openCount: 0 };
    }
    throw e;
  }

  /** @type {Map<string, { accountId: string, externalId: string }>} */
  const linksByListId = new Map();
  for (const link of loaded.links || []) {
    if (link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "").trim();
    if (system && system !== ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM) continue;
    const listId = String(link.externalId || link.external_id || "").trim();
    const accountId = String(link.accountId || link.account_id || "").trim();
    if (!listId || !accountId) continue;
    linksByListId.set(listId, { accountId, externalId: listId });
  }

  const plan = planAdQbCustomerReconciliation({
    rootFacts,
    linksByListId,
    accounts: loaded.accounts || [],
    existingSuggestionsByListId
  });

  const now = new Date().toISOString();
  const rows = plan.upserts.map((u) => ({
    organization_id: organizationId,
    qb_list_id: u.qb_list_id,
    qb_full_name: u.qb_full_name,
    qb_name: u.qb_name,
    status: u.status,
    suggested_account_id: u.suggested_account_id,
    rank_score: u.rank_score,
    rank_method: u.rank_method,
    conflict_reason: u.conflict_reason,
    candidate_accounts: u.candidate_accounts,
    sync_run_id: params.syncRunId || null,
    resolved_at: u.resolved_at,
    resolution_action: u.resolution_action,
    updated_at: now
  }));

  if (rows.length) {
    const { error } = await supabase.from("ad_qb_link_suggestions").upsert(rows, {
      onConflict: "organization_id,qb_list_id"
    });
    if (error) {
      if (isMissingRelationError(error)) {
        return { ok: false, unavailable: true, error: "ad_qb_link_suggestions missing", openCount: 0 };
      }
      throw error;
    }
  }

  return {
    ok: true,
    openCount: plan.stats.openCount,
    stats: plan.stats,
    planned: plan.upserts.length
  };
}
