/**
 * Read-only Moraware reconciliation review queue.
 * Does not persist candidates. Does not create links.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import {
  ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
  isInternalMorawareAccountName
} from "./accountDirectoryMorawareLinkage.mjs";
import {
  accumulateMorawareJobStats,
  buildDirectoryNameIndex,
  finalizeMorawareJobStatsMap,
  rankMorawareDirectoryCandidates,
  resolveMorawareJobStats
} from "./accountDirectoryMorawareMatching.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";

const PAGE = 1000;
const CANONICAL_ID_RE = /^\d+$/;

async function fetchAll(supabase, table, columns, apply) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function isMissingRelation(error) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

/**
 * Build the admin review queue from live Brain + Account Directory (SELECT only).
 * Tests inject `dataset` to avoid Supabase.
 */
export async function listMorawareReconciliationQueue(params) {
  if (!roleHasCapability(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
  const organizationId = params.organizationId;
  const classificationFilter = String(params.query?.classification || "").trim().toUpperCase();
  const linkedFilter = String(params.query?.linked || "").trim().toLowerCase();
  const search = String(params.query?.search || "").trim().toLowerCase();
  const proposedAccountId = String(params.query?.proposedAccountId || params.query?.accountId || "").trim();
  const page = Math.max(1, Number(params.query?.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(params.query?.pageSize) || 50));

  const dataset = params.dataset || (await loadLiveDataset(params.supabase, params.store, organizationId));
  const nameIndex = buildDirectoryNameIndex(dataset.directoryAccounts);
  const qbLinksByAccountId = dataset.qbLinksByAccountId;
  const jobsByMw = dataset.jobsByMorawareId || new Map();
  const jobStatsByMw = dataset.jobStatsByMorawareId || new Map();
  const mwLinksById = dataset.morawareLinksBySourceId;
  const mwLinksByAd = dataset.morawareLinksByAccountId;

  const items = [];
  for (const mw of dataset.morawareAccounts) {
    const jobs = jobsByMw.get(mw.sourceAccountId);
    const jobStats =
      jobStatsByMw.get(mw.sourceAccountId) ||
      (jobs ? resolveMorawareJobStats({ jobs }) : null);
    const ranked = rankMorawareDirectoryCandidates({
      morawareAccount: mw,
      jobStats: jobStats || undefined,
      jobs: jobStats ? undefined : jobs || [],
      directoryAccounts: dataset.directoryAccounts,
      qbLinksByAccountId,
      nameIndex
    });
    const current = mwLinksById.get(mw.sourceAccountId) || null;
    const proposedId = current?.accountId || ranked.proposedAccountId;
    const siblings = proposedId ? mwLinksByAd.get(proposedId) || [] : [];
    const siblingIds = siblings
      .map((l) => l.externalId)
      .filter((id) => id && id !== mw.sourceAccountId);
    const row = {
      ...ranked,
      currentLink: current
        ? {
            linked: true,
            accountId: current.accountId,
            accountName: dataset.directoryAccounts.find((a) => a.id === current.accountId)?.displayName || null,
            linkId: current.id
          }
        : { linked: false, accountId: null, accountName: null, linkId: null },
      proposedAccountId: proposedId,
      proposedAccountName:
        (proposedId && dataset.directoryAccounts.find((a) => a.id === proposedId)?.displayName) ||
        ranked.proposedAccountName,
      siblingMorawareIds: siblingIds,
      confirmAllowed:
        !ranked.internalBucket &&
        !current &&
        Boolean(ranked.proposedAccountId) &&
        (ranked.classification === "HIGH_CONFIDENCE_CANDIDATE" ||
          ranked.classification === "REVIEW_REQUIRED"),
      multipleMorawareIdsExpected: siblingIds.length > 0 || Boolean(current)
    };
    if (current && ranked.proposedAccountId && current.accountId !== ranked.proposedAccountId) {
      row.classification = "CONFLICT";
      row.reason = "active_link_differs_from_name_candidate";
      row.contradictions = [...(row.contradictions || []), "linked_account_differs_from_proposed"];
      row.confirmAllowed = false;
    }
    items.push(row);
  }

  let filtered = items;
  if (classificationFilter && ["HIGH_CONFIDENCE_CANDIDATE", "REVIEW_REQUIRED", "UNMATCHED", "CONFLICT"].includes(classificationFilter)) {
    filtered = filtered.filter((r) => r.classification === classificationFilter);
  }
  if (linkedFilter === "true") filtered = filtered.filter((r) => r.currentLink.linked);
  if (linkedFilter === "false") filtered = filtered.filter((r) => !r.currentLink.linked);
  if (search) {
    filtered = filtered.filter(
      (r) =>
        String(r.morawareName || "").toLowerCase().includes(search) ||
        String(r.morawareAccountId || "").includes(search) ||
        String(r.proposedAccountName || "").toLowerCase().includes(search)
    );
  }
  if (proposedAccountId) {
    filtered = filtered.filter((r) => String(r.proposedAccountId || "") === proposedAccountId);
  }

  const summary = {
    totalMorawareAccounts: items.length,
    alreadyLinked: items.filter((r) => r.currentLink.linked).length,
    highConfidenceUnlinked: items.filter(
      (r) => r.classification === "HIGH_CONFIDENCE_CANDIDATE" && !r.currentLink.linked
    ).length,
    reviewRequired: items.filter((r) => r.classification === "REVIEW_REQUIRED").length,
    unmatched: items.filter((r) => r.classification === "UNMATCHED").length,
    conflicts: items.filter((r) => r.classification === "CONFLICT").length,
    internalBuckets: items.filter((r) => r.internalBucket).length
  };

  const start = (page - 1) * pageSize;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const safeStart = (safePage - 1) * pageSize;
  return {
    ok: true,
    summary,
    page: safePage,
    pageSize,
    total,
    showingFrom: total === 0 ? 0 : safeStart + 1,
    showingTo: Math.min(safeStart + pageSize, total),
    items: filtered.slice(safeStart, safeStart + pageSize)
  };
}

async function loadLiveDataset(supabase, store, organizationId) {
  if (!supabase) {
    return emptyDataset();
  }
  let mwAccounts = [];
  let mwJobs = [];
  try {
    mwAccounts = await fetchAll(
      supabase,
      "brain_moraware_accounts",
      "source_account_id,account_name,last_seen_at",
      (q) => q.eq("organization_id", organizationId)
    );
    mwJobs = await fetchAll(
      supabase,
      "brain_moraware_jobs",
      "source_account_id,created_at_source,install_at_source,completed_at_source,last_seen_at",
      (q) => q.eq("organization_id", organizationId)
    );
  } catch (error) {
    if (isMissingRelation(error)) return emptyDataset();
    throw error;
  }

  const dates = mwAccounts
    .filter((a) => CANONICAL_ID_RE.test(String(a.source_account_id || "")))
    .map((a) => String(a.last_seen_at || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const canonicalDay = dates[dates.length - 1] || "";
  const accounts = mwAccounts
    .filter(
      (a) =>
        CANONICAL_ID_RE.test(String(a.source_account_id || "")) &&
        (!canonicalDay || String(a.last_seen_at || "").slice(0, 10) === canonicalDay)
    )
    .map((a) => ({
      sourceAccountId: String(a.source_account_id),
      accountName: a.account_name || ""
    }));
  const accountSet = new Set(accounts.map((a) => a.sourceAccountId));
  const jobStatsAcc = new Map();
  for (const j of mwJobs) {
    const id = String(j.source_account_id || "");
    if (!accountSet.has(id)) continue;
    if (canonicalDay && String(j.last_seen_at || "").slice(0, 10) !== canonicalDay) continue;
    accumulateMorawareJobStats(jobStatsAcc, id, j);
  }
  const jobStatsByMorawareId = finalizeMorawareJobStatsMap(jobStatsAcc);
  // Drop full job payload; ranking uses compact stats only.
  mwJobs.length = 0;

  const listed = await store.listAccounts(organizationId, { includeArchived: true, limit: 5000, offset: 0 });
  const directoryAccounts = (listed.items || []).map((a) => ({
    id: a.id,
    displayName: a.displayName,
    legalName: a.legalName
  }));
  const qbRows = await store.listAllActiveExternalLinks(organizationId, ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM);
  const qbLinksByAccountId = new Map();
  for (const l of qbRows || []) {
    qbLinksByAccountId.set(l.accountId, {
      listId: l.externalId,
      displayName: l.externalDisplayName || null
    });
  }
  const allLinks = await store.listExternalLinksForOrganization(organizationId);
  const morawareLinksBySourceId = new Map();
  const morawareLinksByAccountId = new Map();
  for (const l of allLinks || []) {
    if (l.externalSystem !== ACCOUNT_DIRECTORY_MORAWARE_SYSTEM || l.isActive === false) continue;
    morawareLinksBySourceId.set(l.externalId, l);
    if (!morawareLinksByAccountId.has(l.accountId)) morawareLinksByAccountId.set(l.accountId, []);
    morawareLinksByAccountId.get(l.accountId).push(l);
  }

  return {
    morawareAccounts: accounts,
    jobStatsByMorawareId,
    jobsByMorawareId: new Map(),
    directoryAccounts,
    qbLinksByAccountId,
    morawareLinksBySourceId,
    morawareLinksByAccountId
  };
}

function emptyDataset() {
  return {
    morawareAccounts: [],
    jobStatsByMorawareId: new Map(),
    jobsByMorawareId: new Map(),
    directoryAccounts: [],
    qbLinksByAccountId: new Map(),
    morawareLinksBySourceId: new Map(),
    morawareLinksByAccountId: new Map()
  };
}

export { isInternalMorawareAccountName };
