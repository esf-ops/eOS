/**
 * Read-only Moraware reconciliation review queue.
 * Does not persist candidates. Does not create links.
 *
 * QB-first spine: search AD + trusted QB ROOT facts. Never mass-imports QB.
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
  buildQbDisplayNameIndex,
  finalizeMorawareJobStatsMap,
  rankMorawareDirectoryCandidates,
  resolveMorawareJobStats
} from "./accountDirectoryMorawareMatching.mjs";
import { buildMorawareEvidenceIndexes } from "./accountDirectoryMorawareCandidateDiscovery.mjs";
import {
  SPINE_REVIEW_STATES,
  buildExclusiveMorawareReviewSummary,
  buildQbRootFactIndexes,
  discoverMorawareSpineCandidates,
  enrichWithQbSpine,
  resolvePrimaryMorawareReviewState
} from "./accountDirectoryMorawareQbSpine.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";
import { isAdQbRootCustomerFact } from "./accountDirectoryQbLinkValidation.mjs";
import {
  buildFinalActionQueueSummary,
  buildFinalActionReadiness,
  finalActionRowToReviewItem,
  paginateFinalActionItems,
  toFastFinalActionQueue
} from "./accountDirectoryMorawareFinalActionQueue.mjs";
import { loadFinalActionPlan } from "./accountDirectoryMorawareFinalActionPlanLoad.mjs";

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
  const queueMode = String(params.query?.queue || params.query?.finalAction || "").trim().toLowerCase();
  if (queueMode === "final-action" || queueMode === "final_action" || queueMode === "1") {
    return listFinalActionReconciliationQueue(params, dataset);
  }

  const nameIndex = buildDirectoryNameIndex(dataset.directoryAccounts);
  const qbLinksByAccountId = dataset.qbLinksByAccountId;
  const qbNameIndex = buildQbDisplayNameIndex(qbLinksByAccountId);
  const evidenceIndexes = buildMorawareEvidenceIndexes({
    directoryAccounts: dataset.directoryAccounts,
    aliases: dataset.aliases || [],
    contacts: dataset.contacts || [],
    locations: dataset.locations || [],
    qbLinksByAccountId
  });
  // Attach status onto byId for prospect classification
  for (const a of dataset.directoryAccounts || []) {
    const meta = evidenceIndexes.byId.get(String(a.id));
    if (meta) meta.status = a.status || null;
  }
  const qbRootIndexes = buildQbRootFactIndexes(dataset.qbRootFacts || [], qbLinksByAccountId);
  const jobsByMw = dataset.jobsByMorawareId || new Map();
  const jobStatsByMw = dataset.jobStatsByMorawareId || new Map();
  const mwLinksById = dataset.morawareLinksBySourceId;
  const mwLinksByAd = dataset.morawareLinksByAccountId;
  const reviewStateFilter = String(params.query?.reviewState || "").trim().toUpperCase();

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
      nameIndex,
      qbNameIndex
    });
    const spine = discoverMorawareSpineCandidates({
      morawareAccount: mw,
      indexes: evidenceIndexes,
      qbRootIndexes,
      directoryById: evidenceIndexes.byId
    });
    const enriched = enrichWithQbSpine(ranked, spine);
    const current = mwLinksById.get(mw.sourceAccountId) || null;
    const proposedId = current?.accountId || enriched.proposedAccountId;
    const siblings = proposedId ? mwLinksByAd.get(proposedId) || [] : [];
    const siblingIds = siblings
      .map((l) => l.externalId)
      .filter((id) => id && id !== mw.sourceAccountId);
    const topCandidate = (enriched.candidates || [])[0] || null;
    const row = {
      ...enriched,
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
        enriched.proposedAccountName,
      siblingMorawareIds: siblingIds,
      confirmAllowed:
        !enriched.internalBucket &&
        !current &&
        Boolean(enriched.proposedAccountId) &&
        Boolean(topCandidate?.confirmMorawareAllowed ?? topCandidate?.confirmAllowed),
      confirmQbLinkAllowed:
        !enriched.internalBucket && !current && Boolean(topCandidate?.confirmQbLinkAllowed),
      createFromQuickBooksAllowed:
        !enriched.internalBucket && !current && Boolean(topCandidate?.createFromQuickBooksAllowed),
      primaryQbListId: topCandidate?.qbListId || enriched.primaryQbListId || null,
      multipleMorawareIdsExpected: siblingIds.length > 0 || Boolean(current)
    };
    if (current) {
      row.reviewState = SPINE_REVIEW_STATES.LINKED;
      row.createFromQuickBooksAllowed = false;
      row.confirmQbLinkAllowed = false;
      row.confirmAllowed = false;
      // Supporting metadata only: do not change primary state to CONFLICT when already linked.
      if (enriched.proposedAccountId && current.accountId !== enriched.proposedAccountId) {
        row.classification = "CONFLICT";
        row.reason = "active_link_differs_from_name_candidate";
        row.contradictions = [...(row.contradictions || []), "linked_account_differs_from_proposed"];
      }
    }
    // Mutually exclusive primary operational state (Review Mode + dry-run authority).
    row.reviewState = resolvePrimaryMorawareReviewState(row);
    row.candidates = (row.candidates || []).slice(0, 3).map((c) => ({
      accountId: c.accountId || null,
      displayName: c.displayName,
      confidence: c.confidence,
      identityKind: c.identityKind || null,
      evidence: Array.isArray(c.evidence)
        ? c.evidence.map((e) =>
            typeof e === "string"
              ? { type: e, label: e.replace(/_/g, " "), strength: "supporting" }
              : { type: e.type, label: e.label, strength: e.strength || "supporting" }
          )
        : [],
      confirmAllowed:
        Boolean(c.confirmMorawareAllowed ?? c.confirmAllowed) &&
        !current &&
        !row.internalBucket &&
        row.reviewState !== SPINE_REVIEW_STATES.LINKED,
      confirmQbLinkAllowed:
        Boolean(c.confirmQbLinkAllowed) &&
        !current &&
        !row.internalBucket &&
        row.reviewState !== SPINE_REVIEW_STATES.LINKED,
      createFromQuickBooksAllowed:
        Boolean(c.createFromQuickBooksAllowed) &&
        !current &&
        !row.internalBucket &&
        row.reviewState !== SPINE_REVIEW_STATES.LINKED,
      city: c.city || null,
      state: c.state || null,
      primaryContact: c.primaryContact || null,
      qbLinked: Boolean(c.qbLinked),
      qbListId: c.qbListId || null,
      qbDisplayName: c.qbDisplayName || null,
      qbActive: c.qbActive == null ? null : Boolean(c.qbActive),
      status: c.status || null
    }));
    items.push(row);
  }

  let filtered = items;
  if (classificationFilter && ["HIGH_CONFIDENCE_CANDIDATE", "REVIEW_REQUIRED", "UNMATCHED", "CONFLICT"].includes(classificationFilter)) {
    if (classificationFilter === "CONFLICT") {
      // Primary CONFLICT only — linked rows with supporting classification CONFLICT stay in LINKED.
      filtered = filtered.filter((r) => r.reviewState === SPINE_REVIEW_STATES.CONFLICT);
    } else {
      filtered = filtered.filter((r) => r.classification === classificationFilter);
    }
  }
  if (reviewStateFilter && Object.values(SPINE_REVIEW_STATES).includes(reviewStateFilter)) {
    filtered = filtered.filter((r) => r.reviewState === reviewStateFilter);
  }
  if (linkedFilter === "true") filtered = filtered.filter((r) => r.currentLink.linked);
  if (linkedFilter === "false") filtered = filtered.filter((r) => !r.currentLink.linked);
  if (search) {
    filtered = filtered.filter(
      (r) =>
        String(r.morawareName || "").toLowerCase().includes(search) ||
        String(r.morawareAccountId || "").includes(search) ||
        String(r.proposedAccountName || "").toLowerCase().includes(search) ||
        String(r.primaryQbListId || "").includes(search)
    );
  }
  if (proposedAccountId) {
    filtered = filtered.filter((r) => String(r.proposedAccountId || "") === proposedAccountId);
  }

  const unlinked = (r) => !r.currentLink?.linked;
  const exclusive = buildExclusiveMorawareReviewSummary(items);
  const summary = {
    ...exclusive,
    // Legacy classification tallies (may overlap; not used for Review Mode primary totals)
    highConfidenceUnlinked: items.filter(
      (r) => r.classification === "HIGH_CONFIDENCE_CANDIDATE" && unlinked(r)
    ).length,
    reviewRequired: items.filter((r) => r.classification === "REVIEW_REQUIRED" && unlinked(r)).length,
    unmatched: items.filter((r) => r.classification === "UNMATCHED" && unlinked(r)).length
  };

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

function linksFromDataset(dataset) {
  const morawareLinks = [];
  for (const [externalId, link] of dataset.morawareLinksBySourceId || []) {
    morawareLinks.push({
      externalId: link?.externalId || externalId,
      accountId: link?.accountId,
      isActive: link?.isActive !== false,
      externalSystem: "moraware"
    });
  }
  const qbLinks = [];
  for (const [accountId, rec] of dataset.qbLinksByAccountId || []) {
    const listId = rec?.listId || rec?.externalId;
    if (!listId) continue;
    qbLinks.push({
      externalId: listId,
      accountId,
      isActive: true,
      externalSystem: "quickbooks_desktop",
      externalDisplayName: rec?.displayName || null
    });
  }
  return { morawareLinks, qbLinks };
}

async function listFinalActionReconciliationQueue(params, dataset) {
  const plan =
    params.finalActionPlan && typeof params.finalActionPlan === "object"
      ? params.finalActionPlan
      : loadFinalActionPlan();
  if (!plan?.available || !plan.actions?.length) {
    return {
      ok: true,
      finalActionAvailable: false,
      summary: {
        totalMorawareAccounts: 0,
        alreadyLinked: 0,
        unresolved: 0,
        unresolvedBucketSum: 0,
        highConfidenceUnlinked: 0,
        reviewRequired: 0,
        unmatched: 0,
        conflicts: 0,
        finalActionAvailable: false
      },
      page: 1,
      pageSize: 50,
      total: 0,
      showingFrom: 0,
      showingTo: 0,
      items: []
    };
  }

  const { morawareLinks, qbLinks } = linksFromDataset(dataset);
  const readiness = buildFinalActionReadiness({
    actions: plan.actions,
    sourceAccounts: dataset.morawareAccounts || [],
    morawareLinks,
    qbLinks,
    directoryAccounts: dataset.directoryAccounts || []
  });
  const ready = toFastFinalActionQueue(readiness).map((row) => finalActionRowToReviewItem(row));
  const page = paginateFinalActionItems(ready, params.query?.page, params.query?.pageSize);
  return {
    ok: true,
    finalActionAvailable: true,
    summary: buildFinalActionQueueSummary(readiness, page.items),
    ...page
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
  mwJobs.length = 0;

  const listed = await store.listAccounts(organizationId, { includeArchived: true, limit: 5000, offset: 0 });
  const directoryAccounts = (listed.items || []).map((a) => ({
    id: a.id,
    displayName: a.displayName,
    legalName: a.legalName,
    status: a.status || null
  }));

  const [qbRows, allLinks, qbRootFacts] = await Promise.all([
    store.listAllActiveExternalLinks(organizationId, ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM),
    store.listExternalLinksForOrganization(organizationId),
    loadQbRootFacts(supabase, store, organizationId)
  ]);

  const qbLinksByAccountId = new Map();
  for (const l of qbRows || []) {
    qbLinksByAccountId.set(l.accountId, {
      listId: String(l.externalId || "").trim(),
      displayName: l.externalDisplayName || null
    });
  }
  const morawareLinksBySourceId = new Map();
  const morawareLinksByAccountId = new Map();
  for (const l of allLinks || []) {
    if (l.externalSystem !== ACCOUNT_DIRECTORY_MORAWARE_SYSTEM || l.isActive === false) continue;
    morawareLinksBySourceId.set(l.externalId, l);
    if (!morawareLinksByAccountId.has(l.accountId)) morawareLinksByAccountId.set(l.accountId, []);
    morawareLinksByAccountId.get(l.accountId).push(l);
  }

  // Support rows: scoped to provisional candidate IDs only (never org-wide ForOrganization).
  const supportAccountIds = collectProvisionalSupportAccountIds({
    morawareAccounts: accounts,
    directoryAccounts,
    qbLinksByAccountId,
    morawareLinksBySourceId
  });
  const [aliases, contacts, locations] = await Promise.all([
    supportAccountIds.length && typeof store.listAliasesForAccountIds === "function"
      ? store.listAliasesForAccountIds(organizationId, supportAccountIds)
      : Promise.resolve([]),
    supportAccountIds.length && typeof store.listContactsForAccountIds === "function"
      ? store.listContactsForAccountIds(organizationId, supportAccountIds)
      : Promise.resolve([]),
    supportAccountIds.length && typeof store.listLocationsForAccountIds === "function"
      ? store.listLocationsForAccountIds(organizationId, supportAccountIds)
      : Promise.resolve([])
  ]);

  return {
    morawareAccounts: accounts,
    jobStatsByMorawareId,
    jobsByMorawareId: new Map(),
    directoryAccounts,
    aliases: aliases || [],
    contacts: contacts || [],
    locations: locations || [],
    qbRootFacts: qbRootFacts || [],
    qbLinksByAccountId,
    morawareLinksBySourceId,
    morawareLinksByAccountId,
    supportAccountIds
  };
}

/**
 * Bound alias/contact/location hydration to AD IDs that are name-plausible
 * for the Moraware set, plus already-linked QB/Moraware accounts.
 */
function collectProvisionalSupportAccountIds({
  morawareAccounts,
  directoryAccounts,
  qbLinksByAccountId,
  morawareLinksBySourceId
}) {
  const ids = new Set();
  for (const id of qbLinksByAccountId.keys()) ids.add(String(id));
  for (const link of morawareLinksBySourceId.values()) {
    if (link?.accountId) ids.add(String(link.accountId));
  }

  const nameIndex = buildDirectoryNameIndex(directoryAccounts);
  const byToken = new Map();
  for (const a of directoryAccounts || []) {
    const nn = String(a.displayName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    for (const t of nn.split(/\s+/).filter((x) => x.length >= 3)) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(String(a.id));
    }
  }

  for (const mw of morawareAccounts || []) {
    const ranked = rankMorawareDirectoryCandidates({
      morawareAccount: mw,
      directoryAccounts,
      qbLinksByAccountId,
      nameIndex,
      qbNameIndex: buildQbDisplayNameIndex(qbLinksByAccountId)
    });
    for (const c of ranked.candidates || []) {
      if (c.accountId) ids.add(String(c.accountId));
    }
    if (ranked.proposedAccountId) ids.add(String(ranked.proposedAccountId));
    // Token overlap seed so alias/contact enrichment can promote weak name hits
    const raw = String(mw.accountName || "").toLowerCase();
    for (const t of raw.split(/[^a-z0-9]+/).filter((x) => x.length >= 4)) {
      for (const id of byToken.get(t) || []) ids.add(id);
    }
  }

  return [...ids];
}

async function loadQbRootFacts(supabase, store, organizationId) {
  if (typeof store.listQuickBooksRootCustomerFacts === "function") {
    return store.listQuickBooksRootCustomerFacts(organizationId);
  }
  try {
    const rows = await fetchAll(
      supabase,
      "ad_qb_customer_facts",
      "organization_id,qb_list_id,parent_list_id,is_job,name,full_name,is_active",
      (q) => q.eq("organization_id", organizationId).eq("is_job", false)
    );
    return (rows || []).filter((r) => isAdQbRootCustomerFact(r));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

function emptyDataset() {
  return {
    morawareAccounts: [],
    jobStatsByMorawareId: new Map(),
    jobsByMorawareId: new Map(),
    directoryAccounts: [],
    aliases: [],
    contacts: [],
    locations: [],
    qbRootFacts: [],
    qbLinksByAccountId: new Map(),
    morawareLinksBySourceId: new Map(),
    morawareLinksByAccountId: new Map(),
    supportAccountIds: []
  };
}

export { isInternalMorawareAccountName, SPINE_REVIEW_STATES };
