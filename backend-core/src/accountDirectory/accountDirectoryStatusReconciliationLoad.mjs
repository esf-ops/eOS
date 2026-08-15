/**
 * Read-only evidence loader for Account Directory status reconciliation.
 * Never inserts, updates, deletes, archives, or writes external links.
 */

import { collectActiveQuickbooksRootListIds } from "./accountDirectoryFinancialIntelligence.mjs";
import {
  classifyAccountStatus,
  isEstablishedEstimateStatus,
  resolveEnrichmentState
} from "./accountDirectoryStatusReconciliation.mjs";

const PAGE = 1000;

function isMissingRelation(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || /does not exist|relation/i.test(msg);
}

async function pageAll(fetcher) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { items, total } = await fetcher(offset, PAGE);
    all.push(...(items || []));
    if (!items?.length || all.length >= (total ?? Infinity) || items.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function pageSupabase(supabase, table, select, organizationId) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("organization_id", organizationId)
      .range(from, from + PAGE - 1);
    if (error) {
      if (isMissingRelation(error)) return { rows: [], unavailable: true };
      throw error;
    }
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return { rows: all, unavailable: false };
}

/**
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} [args.supabase]
 * @param {object} args.store
 * @param {string} args.organizationId
 */
export async function loadStatusReconciliationEvidence(args) {
  const { store, supabase, organizationId } = args;
  if (!organizationId) throw new Error("organizationId is required");

  const accounts = await pageAll(async (offset, limit) =>
    store.listAccounts(organizationId, { includeArchived: true, limit, offset })
  );

  const [links, contacts, locations, aliases] = await Promise.all([
    store.listExternalLinksForOrganization(organizationId),
    store.listContactsForOrganization(organizationId),
    store.listLocationsForOrganization(organizationId),
    store.listAliasesForOrganization(organizationId)
  ]);

  const linksByAccount = new Map();
  const accountsByRoot = new Map();
  for (const link of links || []) {
    const list = linksByAccount.get(link.accountId) || [];
    list.push(link);
    linksByAccount.set(link.accountId, list);
  }
  for (const account of accounts) {
    const roots = collectActiveQuickbooksRootListIds(linksByAccount.get(account.id) || []);
    for (const root of roots) {
      const ids = accountsByRoot.get(root) || [];
      ids.push(account.id);
      accountsByRoot.set(root, ids);
    }
  }

  let facts = [];
  let suggestions = [];
  let quotes = [];
  let studio = [];
  const warnings = [];

  if (supabase) {
    const factPage = await pageSupabase(
      supabase,
      "ad_qb_customer_facts",
      "qb_list_id,is_active,is_job,parent_list_id",
      organizationId
    );
    if (factPage.unavailable) warnings.push("ad_qb_customer_facts unavailable");
    facts = factPage.rows;

    const sugPage = await pageSupabase(
      supabase,
      "ad_qb_link_suggestions",
      "suggested_account_id,status,rank_score",
      organizationId
    );
    if (sugPage.unavailable) warnings.push("ad_qb_link_suggestions unavailable");
    suggestions = sugPage.rows;

    const quotePage = await pageSupabase(
      supabase,
      "quote_headers",
      "id,account_directory_account_id,quote_status,archived_at",
      organizationId
    );
    if (quotePage.unavailable) warnings.push("quote_headers unavailable");
    quotes = quotePage.rows.filter((row) => !row.archived_at);

    try {
      let studioPage = await pageSupabase(
        supabase,
        "studio_estimates",
        "id,account_directory_account_id,status",
        organizationId
      );
      if (studioPage.unavailable) warnings.push("studio_estimates unavailable");
      studio = studioPage.rows;
    } catch (err) {
      warnings.push(`studio_estimates skipped: ${String(err?.message || err).slice(0, 120)}`);
      studio = [];
    }
  } else {
    warnings.push("supabase client omitted; QB facts, suggestions, and estimates not loaded");
  }

  const factsByListId = new Map();
  for (const fact of facts) {
    const id = String(fact.qb_list_id || "").trim();
    if (id) factsByListId.set(id, fact);
  }

  const suggestionByAccount = new Map();
  const rank = (status) =>
    status === "conflict" ? 3 : status === "needs_review" ? 2 : status === "open" ? 1 : 0;
  for (const row of suggestions) {
    const accountId = String(row.suggested_account_id || "").trim();
    if (!accountId) continue;
    const status = String(row.status || "").trim();
    if (!["open", "needs_review", "conflict"].includes(status)) continue;
    const prev = suggestionByAccount.get(accountId);
    if (!prev || rank(status) > rank(prev.status)) suggestionByAccount.set(accountId, row);
  }

  const estimateByAccount = new Map();
  function addEstimate(accountId, status) {
    if (!accountId) return;
    const cur = estimateByAccount.get(accountId) || { count: 0, acceptedOrSold: false };
    cur.count += 1;
    if (isEstablishedEstimateStatus(status)) cur.acceptedOrSold = true;
    estimateByAccount.set(accountId, cur);
  }
  for (const row of quotes) {
    addEstimate(String(row.account_directory_account_id || "").trim(), row.quote_status);
  }
  for (const row of studio) {
    addEstimate(
      String(row.account_directory_account_id || "").trim(),
      row.lifecycle_status || row.status
    );
  }

  const contactCount = new Map();
  for (const row of contacts || []) {
    contactCount.set(row.accountId, (contactCount.get(row.accountId) || 0) + 1);
  }
  const locationCount = new Map();
  for (const row of locations || []) {
    locationCount.set(row.accountId, (locationCount.get(row.accountId) || 0) + 1);
  }
  const aliasCount = new Map();
  const aliasesByNorm = new Map();
  for (const row of aliases || []) {
    aliasCount.set(row.accountId, (aliasCount.get(row.accountId) || 0) + 1);
    const norm = String(row.normalizedMatchValue || row.aliasValue || "")
      .trim()
      .toLowerCase();
    if (!norm) continue;
    const ids = aliasesByNorm.get(norm) || new Set();
    ids.add(row.accountId);
    aliasesByNorm.set(norm, ids);
  }

  const namesByNorm = new Map();
  for (const account of accounts) {
    const norm = String(account.displayName || "").trim().toLowerCase();
    if (!norm) continue;
    const ids = namesByNorm.get(norm) || [];
    ids.push(account.id);
    namesByNorm.set(norm, ids);
  }

  const records = accounts.map((account) => {
    const accountLinks = linksByAccount.get(account.id) || [];
    const roots = collectActiveQuickbooksRootListIds(accountLinks);
    const primaryRoot = roots[0] || null;
    const fact = primaryRoot ? factsByListId.get(primaryRoot) : null;
    const shared = primaryRoot ? accountsByRoot.get(primaryRoot) || [] : [];
    const suggestion = suggestionByAccount.get(account.id);
    const exactLinked = roots.length > 0;
    const estimates = estimateByAccount.get(account.id) || { count: 0, acceptedOrSold: false };
    const nameNorm = String(account.displayName || "").trim().toLowerCase();
    const sameNameIds = namesByNorm.get(nameNorm) || [];
    const aliasHits = aliasesByNorm.get(nameNorm);
    const possibleNameDup =
      sameNameIds.filter((id) => id !== account.id).length > 0 ||
      Boolean(aliasHits && [...aliasHits].some((id) => id !== account.id));

    const reviewFlags = [];
    if (possibleNameDup) reviewFlags.push("possible_duplicate");

    return {
      accountId: account.id,
      displayName: account.displayName,
      status: account.status,
      archivedAt: account.archivedAt,
      source: account.source,
      contactCount: contactCount.get(account.id) || 0,
      locationCount: locationCount.get(account.id) || 0,
      aliasCount: aliasCount.get(account.id) || 0,
      nameSimilarityToUnlinkedQb: Boolean(suggestion) && !exactLinked,
      reviewFlags,
      qb: {
        exactLinked,
        rootExists: Boolean(fact),
        qbActive: fact ? fact.is_active !== false : null,
        isJob: Boolean(fact?.is_job),
        suggestionStatus: suggestion?.status || null,
        enrichmentState: resolveEnrichmentState({
          exactLinked,
          suggestionStatus: suggestion?.status || null
        }),
        sharedRootAccountCount: shared.length
      },
      eliteos: {
        quoteOrEstimateCount: estimates.count,
        acceptedOrSoldEvidence: estimates.acceptedOrSold,
        otherDeterministicEvidence: []
      }
    };
  });

  return {
    organizationId,
    warnings,
    records,
    databaseWrites: 0
  };
}

/**
 * Classify a loaded evidence set. Pure after load.
 *
 * @param {object} loaded
 */
export function classifyLoadedEvidence(loaded) {
  const classified = (loaded.records || []).map((row) => classifyAccountStatus(row));
  return {
    organizationId: loaded.organizationId,
    warnings: loaded.warnings || [],
    classified,
    databaseWrites: 0
  };
}
