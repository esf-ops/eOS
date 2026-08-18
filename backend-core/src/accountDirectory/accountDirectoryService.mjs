import { normalizeAccountDirectorySearch } from "./accountDirectoryMemoryStore.mjs";
import { ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { isAccountQuickbooksLinked } from "./accountDirectoryQuickbooksLinkage.mjs";
import {
  ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
  isAccountMorawareLinked,
  isInternalMorawareAccountName,
  loadCanonicalMorawareAccount
} from "./accountDirectoryMorawareLinkage.mjs";
import {
  indexSuggestionsByAccountId,
  listAllAdQbLinkSuggestionsForIndex,
  markSuggestionLinked,
  resolveAccountQbEnrichmentLabel
} from "./qbCustomerEnrichment/feedStatus.js";
import {
  evaluateQuickBooksLinkCandidate,
  normalizeQuickBooksListId
} from "./accountDirectoryQbLinkValidation.mjs";
import { resolveActiveQuickBooksAccountsByListIds } from "./accountDirectoryQbLinkResolution.mjs";
import {
  QB_CUSTOMER_SEARCH_MAX_RESULTS,
  assertSafeQbCustomerSearchItem,
  isQbCustomerSearchQueryTooShort,
  normalizeQbCustomerSearchQuery,
  toPublicQuickBooksCustomerSearchItem
} from "./accountDirectoryQbCustomerSearch.mjs";
import { listIntelPublic, loadListFinancialIntel } from "./accountDirectory360.mjs";
import { computeOrganizationYtdWinRate } from "./accountDirectoryInsights.mjs";
import { loadStaffDisplayNames } from "./accountDirectoryNotes.mjs";
import { resolveCurrentMorawarePopulation } from "../moraware/morawareCurrentPopulation.mjs";
import {
  DIRECTORY_ACCOUNT_POPULATION_CAP,
  DIRECTORY_SORT_NEEDS_CONTACTS,
  DIRECTORY_SUMMARY_CACHE_TTL_MS,
  activeMorawareLinksFromRows,
  attachListIntelligence,
  companyOperationalPublic,
  createOrgScopedTtlCache,
  directorySortNeedsFullAr,
  directorySortNeedsFullFollowUps,
  directorySortNeedsFullMwLinks,
  directorySortNeedsFullNotes,
  directorySortNeedsFullQbLinks,
  directorySortNeedsFullYtd,
  linkSetComplete,
  loadCurrentMorawareJobsForOrg,
  loadDirectoryOperationalIntelligence,
  loadOrganizationInternalEstimatesForWinRate,
  morawareSourceIdsFromLinks,
  resolveDirectoryListSort,
  scopedPopulationOverflow,
  sortDirectoryListItems,
  ytdWindowFromNow
} from "./accountDirectoryListIntelligence.mjs";

export const AD_QB_ENRICHMENT_FILTERS = Object.freeze([
  "suggested_match",
  "needs_review",
  "not_linked"
]);

export { AccountDirectoryError };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

function requireCap(role, capability) {
  if (!roleHasCapability(role, capability)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
}

function validateEmailOptional(email) {
  if (email == null || String(email).trim() === "") return null;
  const v = String(email).trim();
  if (!EMAIL_RE.test(v)) {
    throw new AccountDirectoryError("invalid_email", "Email address is not valid.");
  }
  return v;
}

function normalizePhoneForMatch(phone) {
  if (phone == null || String(phone).trim() === "") return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length ? digits : null;
}

function isSuspiciousPhone(phone) {
  if (phone == null || String(phone).trim() === "") return false;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length > 0 && digits.length < 7) return true;
  if (/^0+$/.test(digits)) return true;
  return false;
}

function normalizeAliasValue(value) {
  return normalizeAccountDirectorySearch(value);
}

/**
 * @param {{ store: any, logAction?: Function, getSupabase?: Function }} deps
 */
export function createAccountDirectoryService(deps) {
  const store = deps.store;
  if (!store) throw new Error("createAccountDirectoryService: store required");
  const accountPopulationCap =
    Number(deps.accountPopulationCap) > 0 ? Number(deps.accountPopulationCap) : DIRECTORY_ACCOUNT_POPULATION_CAP;
  const orgReadCache =
    deps.orgReadCache ||
    createOrgScopedTtlCache({
      ttlMs: deps.orgReadCacheTtlMs == null ? DIRECTORY_SUMMARY_CACHE_TTL_MS : deps.orgReadCacheTtlMs
    });

  async function writeAudit({
    organizationId,
    accountId,
    entityType,
    entityId,
    action,
    actorUserId,
    changedFields,
    oldValues,
    newValues,
    requestId,
    role,
    required = false
  }) {
    const safeOld = scrubAuditValues(oldValues);
    const safeNew = scrubAuditValues(newValues);
    const row = await store.insertAuditEvent({
      organizationId,
      accountId,
      entityType,
      entityId,
      action,
      actorUserId: actorUserId ?? null,
      changedFields: changedFields ?? [],
      oldValues: safeOld,
      newValues: safeNew,
      requestId: requestId ?? null
    });
    if (required && !row) {
      throw new AccountDirectoryError(
        "audit_write_failed",
        "The Moraware identity change was recorded but the Account Directory audit event could not be saved. Refresh and confirm the link state before retrying.",
        500
      );
    }
    if (typeof deps.logAction === "function" && deps.getSupabase) {
      try {
        await deps.logAction({
          supabase: deps.getSupabase(),
          user: actorUserId ? { id: actorUserId } : null,
          toolSlug: "account_directory",
          action,
          metadata: {
            entityType,
            entityId,
            accountId,
            changedFields: changedFields ?? [],
            role: role ?? null
          }
        });
      } catch {
        /* platform action log is best-effort */
      }
    }
    return row;
  }

  async function resolveCanonicalMorawareAccount(organizationId, sourceAccountId) {
    if (typeof deps.loadCanonicalMorawareAccount === "function") {
      return deps.loadCanonicalMorawareAccount(organizationId, sourceAccountId);
    }
    if (typeof deps.getSupabase === "function") {
      return loadCanonicalMorawareAccount(deps.getSupabase(), organizationId, sourceAccountId);
    }
    return null;
  }

  async function throwMorawareDuplicate(organizationId, externalId, fallbackExisting) {
    let existingAccountId = fallbackExisting?.accountId || null;
    let linkId = fallbackExisting?.id || null;
    if (!existingAccountId) {
      try {
        const active = await store.listActiveExternalLinksByExternalId(
          organizationId,
          ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
          externalId
        );
        existingAccountId = active[0]?.accountId || null;
        linkId = active[0]?.id || null;
      } catch {
        /* still return a governed 409 */
      }
    }
    throw new AccountDirectoryError(
      "duplicate_external_id",
      "That Moraware Account ID is already linked to another Account Directory account.",
      409,
      existingAccountId ? { existingAccountId, linkId } : {}
    );
  }

  function scrubAuditValues(values) {
    if (!values || typeof values !== "object") return values ?? null;
    const out = { ...values };
    delete out.rawWorkbookRow;
    delete out.raw_payload;
    delete out.financial;
    delete out.lifetimeSales;
    delete out.openAr;
    return out;
  }

  function toListItem(account, contacts, locations, links, aliases = []) {
    const activeContacts = contacts.filter((c) => c.isActive !== false);
    const activeLocations = locations.filter((l) => l.isActive !== false);
    const primaryContact =
      activeContacts.find((c) => c.isPrimaryEstimating) || activeContacts[0] || null;
    const primaryLoc =
      activeLocations.find((l) => l.isPrimaryAccountLocation) || activeLocations[0] || null;
    const qbLinked = isAccountQuickbooksLinked(links);
    const hasAliases = aliases.some((a) => a.isActive !== false);
    return {
      id: account.id,
      name: account.displayName,
      displayName: account.displayName,
      legalName: account.legalName,
      primaryContact: primaryContact?.displayName ?? null,
      primaryEmail: primaryContact?.email ?? null,
      primaryPhone: primaryContact?.phone ?? null,
      city: primaryLoc?.city ?? null,
      state: primaryLoc?.state ?? null,
      postalCode: primaryLoc?.postalCode ?? null,
      status: account.archivedAt ? "archived" : account.status,
      quickbooksLinked: qbLinked,
      updatedAt: account.updatedAt,
      createdAt: account.createdAt ?? null,
      rowVersion: account.rowVersion,
      archivedAt: account.archivedAt ?? null,
      source: account.source,
      hasPrimaryContact: Boolean(primaryContact),
      hasPrimaryLocation: Boolean(primaryLoc),
      hasAliases,
      qbEnrichment: resolveAccountQbEnrichmentLabel({ quickbooksLinked: qbLinked }, null),
      connections: {
        quickbooks: qbLinked,
        moraware: isAccountMorawareLinked(links)
      }
    };
  }

  function attachEnrichment(item, suggestionByAccount) {
    const suggestion = suggestionByAccount?.get(String(item.id)) || null;
    const qbEnrichment = resolveAccountQbEnrichmentLabel(item, suggestion);
    return {
      ...item,
      qbEnrichment,
      qbEnrichmentLabel: qbEnrichment.label,
      qbEnrichmentCode: qbEnrichment.code
    };
  }

  async function loadSuggestionIndex(organizationId) {
    if (typeof deps.loadSuggestionIndex === "function") {
      return deps.loadSuggestionIndex(organizationId);
    }
    if (typeof deps.getSupabase !== "function") return new Map();
    try {
      const supabase = deps.getSupabase();
      const listed = await listAllAdQbLinkSuggestionsForIndex(supabase, organizationId, {
        statuses: ["open", "needs_review", "conflict"]
      });
      if (!listed.ok) return new Map();
      return indexSuggestionsByAccountId(listed.items);
    } catch {
      return new Map();
    }
  }

  /**
   * Filter enriched list rows by qbEnrichment code (after attachEnrichment, before pagination).
   * @param {Array<object>} enrichedItems
   * @param {string|null|undefined} qbEnrichment
   */
  function filterByQbEnrichment(enrichedItems, qbEnrichment) {
    const code = String(qbEnrichment ?? "")
      .trim()
      .toLowerCase();
    if (!code) return enrichedItems;
    if (!AD_QB_ENRICHMENT_FILTERS.includes(code)) return enrichedItems;
    return enrichedItems.filter((item) => {
      const itemCode = String(item.qbEnrichmentCode || item.qbEnrichment?.code || "").trim();
      return itemCode === code;
    });
  }

  function groupByAccountId(rows) {
    /** @type {Map<string, any[]>} */
    const map = new Map();
    for (const row of rows || []) {
      const key = String(row.accountId);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  }

  function parseBoolQuery(value) {
    if (value == null || value === "") return null;
    const s = String(value).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
    return null;
  }

  function resolveTabScope(tab, status) {
    let statusIn = null;
    let includeArchived = false;
    const t = String(tab || "accounts").trim();
    if (t === "prospects") statusIn = ["prospect"];
    else if (t === "needs_review") statusIn = ["needs_review"];
    else if (t === "archived") {
      statusIn = ["archived"];
      includeArchived = true;
    } else {
      statusIn = status ? [String(status)] : ["active", "inactive", "prospect", "needs_review"];
    }
    return { statusIn, includeArchived };
  }

  function matchesDirectorySearch(account, contacts, locations, aliases, query) {
    const q = normalizeAccountDirectorySearch(query);
    if (!q) return true;
    const hay = [
      account.displayName,
      account.legalName,
      ...contacts.map((c) => [c.displayName, c.email, c.phone, c.phoneNormalized].filter(Boolean).join(" ")),
      ...locations.map((l) => [l.city, l.state, l.postalCode, l.addressLine1, l.label].filter(Boolean).join(" ")),
      ...aliases.map((a) => a.aliasValue)
    ]
      .filter(Boolean)
      .join(" ");
    return normalizeAccountDirectorySearch(hay).includes(q);
  }

  function sortDirectoryItems(items, sort, intel = {}) {
    return sortDirectoryListItems(items, resolveDirectoryListSort(sort, intel));
  }

  function paginationResult(items, pageNum, limit) {
    const total = items.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const safePage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
    const offset = (safePage - 1) * limit;
    return {
      items: items.slice(offset, offset + limit),
      total,
      page: safePage,
      pageSize: limit,
      totalPages,
      hasPreviousPage: safePage > 1,
      hasNextPage: totalPages > 0 && safePage < totalPages
    };
  }

  function directoryHealthFromRows(rows) {
    let active = 0;
    let prospects = 0;
    let needsReview = 0;
    for (const row of rows || []) {
      const status = row?.account?.archivedAt ? "archived" : row?.item?.status || row?.account?.status;
      if (status === "archived") continue;
      if (status === "prospect") prospects += 1;
      else if (status === "needs_review") needsReview += 1;
      else if (status === "active" || status === "inactive") active += 1;
    }
    return { total: active + prospects + needsReview, active, prospects, needsReview };
  }

  function parseAccountIds(accountIds) {
    const raw = Array.isArray(accountIds)
      ? accountIds
      : String(accountIds || "")
          .split(/[,\s]+/)
          .filter(Boolean);
    const ids = [];
    const seen = new Set();
    for (const value of raw) {
      const id = String(value || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function attachOpenArForSort(items, intelByAccount) {
    return (items || []).map((item) => ({
      ...item,
      financialIntel: listIntelPublic(intelByAccount.get(item.id) || null)
    }));
  }

  /**
   * Search / missing-contact / missing-location need contacts, locations, or aliases
   * across the org before pagination. Default list pages do not.
   */
  function requiresFullSupportIndex({ search, missingContact, missingLocation, sort }) {
    if (String(search || "").trim()) return true;
    if (parseBoolQuery(missingContact) === true) return true;
    if (parseBoolQuery(missingLocation) === true) return true;
    if (DIRECTORY_SORT_NEEDS_CONTACTS.includes(String(sort || "").trim())) return true;
    return false;
  }

  async function listAccountsScoped(organizationId, { statusIn, includeArchived }) {
    const listed = await store.listAccounts(organizationId, {
      statusIn,
      includeArchived,
      search: null,
      limit: accountPopulationCap + 1,
      offset: 0
    });
    const items = listed.items || [];
    if (scopedPopulationOverflow({ items, total: listed.total, cap: accountPopulationCap })) {
      throw new AccountDirectoryError(
        "directory_population_exceeded",
        "This organization has more accounts than Account Directory can list safely.",
        422,
        { cap: accountPopulationCap }
      );
    }
    return items;
  }

  async function buildAccountsIndex(organizationId, { statusIn, includeArchived }) {
    const accounts = await listAccountsScoped(organizationId, { statusIn, includeArchived });
    return accounts.map((account) => ({
      account,
      contacts: [],
      locations: [],
      aliases: [],
      links: [],
      item: toListItem(account, [], [], [], [])
    }));
  }

  /**
   * Contacts/locations/aliases for search, missing-contact/location, and contact/location sorts.
   * Exact links are attached separately and only when a filter or derived sort needs them.
   */
  async function buildSupportDirectoryIndex(organizationId, { statusIn, includeArchived }) {
    const [accounts, contacts, locations, aliases] = await Promise.all([
      listAccountsScoped(organizationId, { statusIn, includeArchived }),
      store.listContactsForOrganization(organizationId),
      store.listLocationsForOrganization(organizationId),
      store.listAliasesForOrganization(organizationId)
    ]);

    const contactsByAccount = groupByAccountId(contacts);
    const locationsByAccount = groupByAccountId(locations);
    const aliasesByAccount = groupByAccountId(aliases);

    return accounts.map((account) => {
      const c = contactsByAccount.get(account.id) || [];
      const l = locationsByAccount.get(account.id) || [];
      const al = aliasesByAccount.get(account.id) || [];
      return {
        account,
        contacts: c,
        locations: l,
        aliases: al,
        links: [],
        item: toListItem(account, c, l, [], al)
      };
    });
  }

  async function loadActiveLinksComplete(organizationId, externalSystem) {
    if (typeof store.listAllActiveExternalLinks !== "function") return [];
    const links = await store.listAllActiveExternalLinks(organizationId, externalSystem);
    if (typeof store.countActiveExternalLinks === "function") {
      const counted = await store.countActiveExternalLinks(organizationId, externalSystem);
      if (!linkSetComplete(links, counted)) {
        throw new AccountDirectoryError(
          "directory_link_population_incomplete",
          "Account connections could not be loaded completely.",
          422
        );
      }
    }
    return links || [];
  }

  function mergeLinks(existing, extra) {
    const out = [...(existing || [])];
    const seen = new Set(out.map((link) => link.id || `${link.externalSystem}:${link.externalId}`));
    for (const link of extra || []) {
      const key = link.id || `${link.externalSystem}:${link.externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(link);
    }
    return out;
  }

  async function attachCompleteLinksToRows(organizationId, rows, systems) {
    const uniqueSystems = [...new Set((systems || []).filter(Boolean))];
    if (!uniqueSystems.length) return rows;
    const bundles = await Promise.all(uniqueSystems.map((sys) => loadActiveLinksComplete(organizationId, sys)));
    const byAccount = groupByAccountId(bundles.flat());
    return rows.map((row) => {
      const lk = mergeLinks(row.links, byAccount.get(row.account.id) || []);
      return {
        ...row,
        links: lk,
        item: toListItem(row.account, row.contacts || [], row.locations || [], lk, row.aliases || [])
      };
    });
  }

  async function loadCachedOrgJobBundle(organizationId) {
    const hit = orgReadCache.get(organizationId, "current_moraware_jobs");
    if (hit) return hit;
    const supabase = typeof deps.getSupabase === "function" ? deps.getSupabase() : null;
    let population = { available: false };
    if (supabase) {
      try {
        population = await resolveCurrentMorawarePopulation(supabase, organizationId);
      } catch {
        population = { available: false };
      }
    }
    const loaded = await loadCurrentMorawareJobsForOrg(supabase, organizationId, population);
    const value = { ...loaded, population };
    if (!loaded.unavailable && !loaded.truncated) {
      orgReadCache.set(organizationId, "current_moraware_jobs", value);
    }
    return value;
  }

  async function loadCachedOrgWinRate(organizationId, now = new Date()) {
    const hit = orgReadCache.get(organizationId, "ytd_win_rate");
    if (hit) return hit;
    const window = ytdWindowFromNow(now);
    const supabase = typeof deps.getSupabase === "function" ? deps.getSupabase() : null;
    const loaded = await loadOrganizationInternalEstimatesForWinRate(supabase, organizationId);
    const value = loaded.available
      ? computeOrganizationYtdWinRate({
          internalItems: loaded.items,
          year: window.year,
          asOfYmd: window.asOfYmd
        })
      : {
          available: false,
          rate: null,
          year: window.year,
          asOfYmd: window.asOfYmd,
          won: 0,
          lost: 0,
          closed: 0
        };
    orgReadCache.set(organizationId, "ytd_win_rate", value);
    return value;
  }

  async function hydrateDirectoryRowsForAccountIds(organizationId, rows, { includeLinks = false, includeSupport = true } = {}) {
    const accountIds = rows.map((r) => r.account.id);
    if (!accountIds.length) return rows;

    const listContacts =
      typeof store.listContactsForAccountIds === "function"
        ? store.listContactsForAccountIds.bind(store)
        : async (orgId, ids) => {
            const all = await store.listContactsForOrganization(orgId);
            const idSet = new Set(ids.map(String));
            return all.filter((c) => idSet.has(String(c.accountId)));
          };
    const listLocations =
      typeof store.listLocationsForAccountIds === "function"
        ? store.listLocationsForAccountIds.bind(store)
        : async (orgId, ids) => {
            const all = await store.listLocationsForOrganization(orgId);
            const idSet = new Set(ids.map(String));
            return all.filter((l) => idSet.has(String(l.accountId)));
          };
    const listAliases =
      typeof store.listAliasesForAccountIds === "function"
        ? store.listAliasesForAccountIds.bind(store)
        : async (orgId, ids) => {
            const all = await store.listAliasesForOrganization(orgId);
            const idSet = new Set(ids.map(String));
            return all.filter((a) => idSet.has(String(a.accountId)));
          };
    const listLinks =
      typeof store.listExternalLinksForAccountIds === "function"
        ? store.listExternalLinksForAccountIds.bind(store)
        : async (orgId, ids) => {
            const all = await store.listExternalLinksForOrganization(orgId);
            const idSet = new Set(ids.map(String));
            return all.filter((l) => idSet.has(String(l.accountId)));
          };

    const [contacts, locations, aliases, links] = await Promise.all([
      includeSupport ? listContacts(organizationId, accountIds) : Promise.resolve(null),
      includeSupport ? listLocations(organizationId, accountIds) : Promise.resolve(null),
      includeSupport ? listAliases(organizationId, accountIds) : Promise.resolve(null),
      includeLinks ? listLinks(organizationId, accountIds) : Promise.resolve(null)
    ]);

    const contactsByAccount = includeSupport ? groupByAccountId(contacts) : null;
    const locationsByAccount = includeSupport ? groupByAccountId(locations) : null;
    const aliasesByAccount = includeSupport ? groupByAccountId(aliases) : null;
    const linksByAccount = includeLinks ? groupByAccountId(links) : null;

    return rows.map((row) => {
      const id = row.account.id;
      const c = includeSupport ? contactsByAccount.get(id) || [] : row.contacts || [];
      const l = includeSupport ? locationsByAccount.get(id) || [] : row.locations || [];
      const al = includeSupport ? aliasesByAccount.get(id) || [] : row.aliases || [];
      const lk = includeLinks ? linksByAccount.get(id) || [] : row.links || [];
      return {
        account: row.account,
        contacts: c,
        locations: l,
        aliases: al,
        links: lk,
        item: toListItem(row.account, c, l, lk, al)
      };
    });
  }

  function filterDirectoryRows(rows, { search, linked, missingContact, missingLocation }) {
    const linkedFilter = parseBoolQuery(linked);
    const missingContactFilter = parseBoolQuery(missingContact);
    const missingLocationFilter = parseBoolQuery(missingLocation);
    return rows.filter((row) => {
      if (search && !matchesDirectorySearch(row.account, row.contacts, row.locations, row.aliases, search)) {
        return false;
      }
      if (linkedFilter === true && !row.item.quickbooksLinked) return false;
      if (linkedFilter === false && row.item.quickbooksLinked) return false;
      if (missingContactFilter === true && row.item.hasPrimaryContact) return false;
      if (missingLocationFilter === true && row.item.hasPrimaryLocation) return false;
      return true;
    });
  }

  async function applyListFinancialIntel(organizationId, filteredRows, workingItems, intelligence) {
    /** @type {Map<string, object>} */
    let intelByAccount = new Map();
    let working = workingItems;
    if (typeof deps.getSupabase !== "function") {
      return { working: attachOpenArForSort(working, intelByAccount), intelByAccount };
    }
    try {
      const loaded = await loadListFinancialIntel(deps.getSupabase(), {
        organizationId,
        directoryRows: filteredRows
      });
      intelByAccount = loaded.byAccount || new Map();
      const intelFilter = String(intelligence || "").trim();
      if (!loaded.unavailable && intelFilter) {
        working = working.filter((item) => {
          const snap = intelByAccount.get(item.id);
          if (intelFilter === "overdue") return snap?.overdue === true;
          if (intelFilter === "collection") {
            return ["watch", "attention", "priority"].includes(String(snap?.collectionAttention || ""));
          }
          if (intelFilter === "financially_active") return snap?.financiallyActive === true;
          return true;
        });
      }
    } catch {
      intelByAccount = new Map();
    }
    return { working: attachOpenArForSort(working, intelByAccount), intelByAccount };
  }

  async function hydrateDetail(organizationId, account, { includeAudit, role }) {
    const [contacts, locations, aliases, links] = await Promise.all([
      store.listContacts(organizationId, account.id),
      store.listLocations(organizationId, account.id),
      store.listAliases(organizationId, account.id),
      store.listExternalLinks(organizationId, account.id)
    ]);
    const qbListIds = links
      .filter((l) => l.externalSystem === "quickbooks_desktop" && l.isActive !== false)
      .map((l) => String(l.externalId || "").trim())
      .filter(Boolean);
    /** @type {Map<string, object>} */
    let qbFactsByListId = new Map();
    if (qbListIds.length && typeof store.listQuickBooksCustomerFactsByListIds === "function") {
      try {
        const facts = await store.listQuickBooksCustomerFactsByListIds(organizationId, qbListIds);
        for (const fact of facts || []) {
          const id = String(fact.qbListId || fact.qb_list_id || "").trim();
          if (id) qbFactsByListId.set(id, fact);
        }
      } catch {
        qbFactsByListId = new Map();
      }
    }
    const item = toListItem(account, contacts, locations, links, aliases);
    /** @type {any} */
    const detail = {
      ...item,
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.displayName,
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        role: c.titleRole,
        contactType: c.contactType || null,
        isPrimary: c.isPrimaryEstimating,
        isActive: c.isActive,
        rowVersion: c.rowVersion
      })),
      locations: locations.map((l) => ({
        id: l.id,
        label: l.label,
        line1: l.addressLine1,
        line2: l.addressLine2,
        city: l.city,
        state: l.state,
        postalCode: l.postalCode,
        sourceAddressRaw: l.sourceAddressRaw,
        locationType: l.locationType || "account",
        isPrimary: l.isPrimaryAccountLocation,
        isActive: l.isActive,
        rowVersion: l.rowVersion
      })),
      aliases: aliases.map((a) => ({
        id: a.id,
        alias: a.aliasValue,
        source: a.aliasSource,
        isActive: a.isActive,
        rowVersion: a.rowVersion
      })),
      externalLinks: links.map((l) => {
        const canSeeExternalId = roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
        const isQb = l.externalSystem === "quickbooks_desktop";
        const fact = isQb ? qbFactsByListId.get(String(l.externalId || "").trim()) : null;
        return {
          id: l.id,
          system:
            l.externalSystem === "quickbooks_desktop"
              ? "QuickBooks Desktop"
              : l.externalSystem === "moraware"
                ? "Moraware"
                : l.externalSystem,
          externalSystem: l.externalSystem,
          externalId: canSeeExternalId ? l.externalId : undefined,
          externalDisplayName: l.externalDisplayName,
          sourceSnapshotDate: l.sourceSnapshotDate ?? null,
          linkedAt: l.linkedAt ?? null,
          linkedBy: l.linkedBy ?? null,
          isActive: l.isActive,
          qbTrusted: isQb
            ? fact
              ? {
                  available: true,
                  displayName: String(fact.fullName || fact.name || "").trim() || null,
                  active: fact.isActive !== false
                }
              : { available: false, displayName: null, active: null }
            : undefined
        };
      })
    };
    if (includeAudit && roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN)) {
      const events = await store.listAuditEvents(organizationId, account.id, { limit: 100 });
      const names = await loadStaffDisplayNames(deps, events.map((e) => e.actorUserId));
      detail.auditHistory = events.map((e) => {
        const actorId = String(e.actorUserId || "").trim();
        return {
          id: e.id,
          at: e.createdAt,
          actor: (actorId && names.get(actorId)) || null,
          action: e.action,
          detail: Array.isArray(e.changedFields) ? e.changedFields.join(", ") : null
        };
      });
    }
    return detail;
  }

  return {
    async listAccounts({
      organizationId,
      role,
      tab,
      status,
      search,
      page,
      pageSize,
      sort,
      linked,
      missingContact,
      missingLocation,
      qbEnrichment,
      intelligence
    }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const limit = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE, 1), MAX_PAGE);
      const pageNum = Math.max(Number(page) || 1, 1);
      const scope = resolveTabScope(tab, status);
      const searchTrimmed = search ? String(search).trim() : null;
      const intelFilter = String(intelligence || "").trim();
      const qbFilter = String(qbEnrichment || "").trim();
      const sortKey = resolveDirectoryListSort(sort, { ytdAvailable: true, followUpAvailable: true });
      const useFullSupport = requiresFullSupportIndex({
        search: searchTrimmed,
        missingContact,
        missingLocation,
        sort: sortKey
      });
      const linkedFilter = parseBoolQuery(linked);
      const needsFullQbLinks =
        linkedFilter != null ||
        Boolean(qbFilter) ||
        Boolean(intelFilter) ||
        directorySortNeedsFullQbLinks(sortKey);
      const needsFullMwLinks = directorySortNeedsFullMwLinks(sortKey);
      const needsFullYtd = directorySortNeedsFullYtd(sortKey);
      const needsFullFollowUps = directorySortNeedsFullFollowUps(sortKey);
      const needsFullNotes = directorySortNeedsFullNotes(sortKey);
      const needsFullAr = directorySortNeedsFullAr(sortKey) || Boolean(intelFilter);

      let rows = useFullSupport
        ? await buildSupportDirectoryIndex(organizationId, scope)
        : await buildAccountsIndex(organizationId, scope);
      const directoryHealth = directoryHealthFromRows(rows);

      const linkSystems = [];
      if (needsFullQbLinks) linkSystems.push("quickbooks_desktop");
      if (needsFullMwLinks) linkSystems.push(ACCOUNT_DIRECTORY_MORAWARE_SYSTEM);
      if (linkSystems.length) {
        rows = await attachCompleteLinksToRows(organizationId, rows, linkSystems);
      }

      const filtered = filterDirectoryRows(rows, {
        search: searchTrimmed,
        linked,
        missingContact,
        missingLocation
      });
      const suggestionByAccount = qbFilter ? await loadSuggestionIndex(organizationId) : new Map();
      let working = filterByQbEnrichment(
        filtered.map((r) => attachEnrichment(r.item, suggestionByAccount)),
        qbEnrichment
      );
      const rowById = new Map(filtered.map((r) => [r.account.id, r]));

      if (needsFullAr) {
        const applied = await applyListFinancialIntel(
          organizationId,
          working.map((item) => rowById.get(item.id)).filter(Boolean),
          working,
          intelFilter
        );
        working = applied.working;
      }

      let operational = null;
      if (needsFullYtd || needsFullFollowUps || needsFullNotes) {
        const filteredWorkingRows = working.map((item) => rowById.get(item.id)).filter(Boolean);
        const morawareLinks = activeMorawareLinksFromRows(filteredWorkingRows);
        let jobBundle = { jobs: null, unavailable: true, truncated: false, population: undefined };
        if (needsFullYtd) {
          jobBundle = await loadCachedOrgJobBundle(organizationId);
        }
        try {
          operational = await loadDirectoryOperationalIntelligence({
            supabase: typeof deps.getSupabase === "function" ? deps.getSupabase() : null,
            store,
            organizationId,
            morawareLinks,
            currentPopulation: jobBundle.population,
            jobs: needsFullYtd ? jobBundle.jobs : undefined,
            jobsTruncated: needsFullYtd ? Boolean(jobBundle.truncated) : false,
            jobScope: needsFullYtd ? "org" : "none",
            followUpScope: needsFullFollowUps ? "org" : "none",
            noteScope: needsFullNotes ? "org" : "none"
          });
        } catch {
          operational = null;
        }
        working = working.map((item) => {
          const row = rowById.get(item.id);
          return attachListIntelligence(item, {
            ytd: needsFullYtd ? operational?.ytd : null,
            followUp: needsFullFollowUps
              ? operational?.followUp
              : { byAccount: new Map(), available: true },
            notes: needsFullNotes ? operational?.notes : new Map(),
            links: row?.links || []
          });
        });
      }

      const sortedItems = sortDirectoryItems(working, sort, {
        ytdAvailable: !needsFullYtd || operational?.ytd?.available === true,
        followUpAvailable: !needsFullFollowUps || operational?.followUp?.available === true
      });
      const paged = paginationResult(sortedItems, pageNum, limit);

      function finishList(items) {
        return {
          ...paged,
          items,
          sort: sortKey,
          intelligencePending: true,
          directoryHealth
        };
      }

      if (!paged.items.length) {
        return finishList([]);
      }

      const pageRows = paged.items.map((item) => rowById.get(item.id)).filter(Boolean);
      const hydrated = await hydrateDirectoryRowsForAccountIds(organizationId, pageRows, {
        includeLinks: true,
        includeSupport: !useFullSupport
      });
      const hydratedById = new Map(hydrated.map((r) => [r.account.id, r]));
      for (const row of hydrated) {
        rowById.set(row.account.id, row);
      }

      paged.items = paged.items.map((item) => {
        const row = hydratedById.get(item.id);
        const base = attachEnrichment(row ? row.item : item, suggestionByAccount);
        return {
          ...base,
          connections: base.connections,
          financialIntel: needsFullAr ? item.financialIntel ?? null : null,
          ytdActivity: needsFullYtd ? item.ytdActivity ?? null : null,
          followUpSummary: needsFullFollowUps ? item.followUpSummary ?? null : null,
          notesCount: needsFullNotes ? item.notesCount ?? null : null,
          lastActivityAt:
            needsFullYtd || needsFullFollowUps || needsFullNotes ? item.lastActivityAt ?? null : null,
          intelligencePending: true
        };
      });

      return finishList(paged.items);
    },

    async listAccountPageIntelligence({ organizationId, role, accountIds }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const ids = parseAccountIds(accountIds);
      if (ids.length > MAX_PAGE) {
        throw new AccountDirectoryError(
          "invalid_account_ids",
          "Too many account ids for page intelligence.",
          400,
          { cap: MAX_PAGE }
        );
      }
      if (!ids.length) return { items: [], byAccount: {} };

      const accounts = await store.getAccountsByIds(organizationId, ids);
      const allowed = new Map((accounts || []).map((account) => [account.id, account]));
      const scopedIds = ids.filter((id) => allowed.has(id));
      if (!scopedIds.length) return { items: [], byAccount: {} };

      const rows = scopedIds.map((id) => ({
        account: allowed.get(id),
        contacts: [],
        locations: [],
        aliases: [],
        links: []
      }));
      const hydrated = await hydrateDirectoryRowsForAccountIds(organizationId, rows, { includeLinks: true });

      const applied = await applyListFinancialIntel(
        organizationId,
        hydrated,
        hydrated.map((row) => row.item),
        ""
      );
      const intelByAccount = applied.intelByAccount;
      const intelById = new Map(applied.working.map((item) => [item.id, item.financialIntel]));

      const pageMwLinks = activeMorawareLinksFromRows(hydrated);
      let pageOperational = null;
      try {
        pageOperational = await loadDirectoryOperationalIntelligence({
          supabase: typeof deps.getSupabase === "function" ? deps.getSupabase() : null,
          store,
          organizationId,
          morawareLinks: pageMwLinks,
          jobScope: "sources",
          sourceAccountIds: morawareSourceIdsFromLinks(pageMwLinks),
          followUpScope: "accounts",
          noteScope: "accounts",
          accountIds: scopedIds
        });
      } catch {
        pageOperational = null;
      }

      const items = hydrated.map((row) => {
        const withIntel = attachListIntelligence(row.item, {
          ytd: pageOperational?.ytd,
          followUp: pageOperational?.followUp,
          notes: pageOperational?.notes,
          links: row.links || []
        });
        return {
          accountId: row.account.id,
          connections: withIntel.connections,
          financialIntel: intelById.get(row.account.id) || listIntelPublic(intelByAccount.get(row.account.id) || null),
          ytdActivity: withIntel.ytdActivity,
          followUpSummary: withIntel.followUpSummary,
          notesCount: withIntel.notesCount,
          lastActivityAt: withIntel.lastActivityAt
        };
      });
      const byAccount = Object.fromEntries(items.map((item) => [item.accountId, item]));
      return { items, byAccount };
    },

    async getSummary({ organizationId, role }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const rows = await attachCompleteLinksToRows(
        organizationId,
        await buildSupportDirectoryIndex(organizationId, {
          statusIn: null,
          includeArchived: true
        }),
        ["quickbooks_desktop", ACCOUNT_DIRECTORY_MORAWARE_SYSTEM]
      );
      const suggestionByAccount = await loadSuggestionIndex(organizationId);
      const summary = {
        total: 0,
        active: 0,
        prospects: 0,
        needsReview: 0,
        archived: 0,
        quickbooksLinked: 0,
        morawareConnected: 0,
        qbSuggestedMatch: 0,
        qbNeedsReview: 0,
        missingPrimaryContact: 0,
        missingPrimaryLocation: 0,
        openFollowUps: 0,
        overdueFollowUps: 0
      };
      const liveRows = [];
      for (const row of rows) {
        const status = row.item.status;
        const isArchived = status === "archived" || Boolean(row.account.archivedAt);
        if (isArchived) summary.archived += 1;
        else if (status === "prospect") summary.prospects += 1;
        else if (status === "needs_review") summary.needsReview += 1;
        else if (status === "active" || status === "inactive") summary.active += 1;

        if (row.item.quickbooksLinked) summary.quickbooksLinked += 1;
        else if (!isArchived) {
          const enr = attachEnrichment(row.item, suggestionByAccount).qbEnrichment;
          if (enr.code === "suggested_match") summary.qbSuggestedMatch += 1;
          if (enr.code === "needs_review") summary.qbNeedsReview += 1;
        }
        if (row.item.connections?.moraware) summary.morawareConnected += 1;
        if (!row.item.hasPrimaryContact) summary.missingPrimaryContact += 1;
        if (!row.item.hasPrimaryLocation) summary.missingPrimaryLocation += 1;
        if (!isArchived) liveRows.push(row);
      }
      // Total matches default Accounts tab scope (non-archived lifecycle rows).
      summary.total = summary.active + summary.prospects + summary.needsReview;

      const morawareLinks = activeMorawareLinksFromRows(liveRows);
      let operational = null;
      try {
        const jobBundle = await loadCachedOrgJobBundle(organizationId);
        operational = await loadDirectoryOperationalIntelligence({
          supabase: typeof deps.getSupabase === "function" ? deps.getSupabase() : null,
          store,
          organizationId,
          morawareLinks,
          currentPopulation: jobBundle.population,
          jobs: jobBundle.jobs,
          jobsTruncated: Boolean(jobBundle.truncated),
          jobScope: "org",
          followUpScope: "org",
          noteScope: "none"
        });
      } catch {
        operational = null;
      }
      summary.openFollowUps =
        operational?.followUp?.available === false ? null : operational?.followUp?.orgOpen || 0;
      summary.overdueFollowUps =
        operational?.followUp?.available === false ? null : operational?.followUp?.orgOverdue || 0;

      const winRate = await loadCachedOrgWinRate(organizationId);
      summary.operational = companyOperationalPublic(operational, { winRate });
      return summary;
    },

    async getAccount({ organizationId, role, accountId }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const detail = await hydrateDetail(organizationId, account, { includeAudit: true, role });
      const suggestionByAccount = await loadSuggestionIndex(organizationId);
      return attachEnrichment(detail, suggestionByAccount);
    },

    /**
     * Read-only trusted QB root-customer search. Name is discovery only.
     * Linking still requires an explicit Phase 0E ListID confirmation.
     */
    async searchQuickBooksCustomers({ organizationId, role, query }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const q = normalizeQbCustomerSearchQuery(query);
      if (isQbCustomerSearchQueryTooShort(q)) {
        return {
          ok: true,
          items: [],
          query: q,
          queryTooShort: true,
          minQueryLength: 2
        };
      }
      if (typeof store.searchQuickBooksRootCustomers !== "function") {
        throw new AccountDirectoryError(
          "qb_facts_unavailable",
          "QuickBooks customer facts are unavailable. Search could not be completed.",
          503
        );
      }
      const rows = await store.searchQuickBooksRootCustomers(organizationId, {
        query: q,
        limit: QB_CUSTOMER_SEARCH_MAX_RESULTS
      });
      const items = (rows || []).slice(0, QB_CUSTOMER_SEARCH_MAX_RESULTS).map((row) => {
        if (row && row.listId != null) {
          return {
            listId: String(row.listId).trim(),
            displayName: String(row.displayName || "").trim() || String(row.listId).trim(),
            active: row.active !== false,
            existingAccountId: null
          };
        }
        return toPublicQuickBooksCustomerSearchItem(row);
      });
      const byListId = await resolveActiveQuickBooksAccountsByListIds(store, {
        organizationId,
        listIds: items.map((item) => item.listId)
      });
      return {
        ok: true,
        items: items.map((item) =>
          assertSafeQbCustomerSearchItem({
            ...item,
            existingAccountId: byListId.get(normalizeQuickBooksListId(item.listId)) || null
          })
        ),
        query: q,
        queryTooShort: false
      };
    },

    async createAccount({ organizationId, role, actorUserId, requestId, payload, asProspect }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const displayName = String(payload?.displayName ?? "").trim();
      if (!displayName) {
        throw new AccountDirectoryError("display_name_required", "Account name is required.");
      }
      const status = asProspect ? "prospect" : String(payload?.status || "active");
      if (!["active", "prospect", "inactive", "needs_review"].includes(status)) {
        throw new AccountDirectoryError("invalid_status", "Invalid account status.");
      }
      const account = await store.insertAccount({
        organizationId,
        displayName,
        legalName: payload?.legalName ? String(payload.legalName).trim() : null,
        status,
        source: payload?.source || "manual",
        createdBy: actorUserId,
        updatedBy: actorUserId
      });

      const email = validateEmailOptional(payload?.primaryEmail);
      const phone = payload?.primaryPhone ? String(payload.primaryPhone).trim() : null;
      if (payload?.primaryContactName || email || phone) {
        await store.insertContact({
          organizationId,
          accountId: account.id,
          displayName: String(payload?.primaryContactName || displayName).trim(),
          email,
          phone,
          phoneNormalized: normalizePhoneForMatch(phone),
          isPrimaryEstimating: true,
          createdBy: actorUserId,
          updatedBy: actorUserId
        });
      }
      if (payload?.city || payload?.state || payload?.postalCode || payload?.line1 || payload?.sourceAddressRaw) {
        await store.insertLocation({
          organizationId,
          accountId: account.id,
          label: "Main",
          addressLine1: payload?.line1 ? String(payload.line1).trim() : null,
          city: payload?.city ? String(payload.city).trim() : null,
          state: payload?.state ? String(payload.state).trim() : null,
          postalCode: payload?.postalCode ? String(payload.postalCode).trim() : null,
          sourceAddressRaw: payload?.sourceAddressRaw
            ? String(payload.sourceAddressRaw).trim()
            : null,
          isPrimaryAccountLocation: true,
          createdBy: actorUserId,
          updatedBy: actorUserId
        });
      }

      await writeAudit({
        organizationId,
        accountId: account.id,
        entityType: "account",
        entityId: account.id,
        action: asProspect ? "create_prospect" : "create_account",
        actorUserId,
        changedFields: ["displayName", "status"],
        newValues: { displayName, status },
        requestId,
        role
      });

      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateAccount({ organizationId, role, actorUserId, requestId, accountId, payload, suppressAudit }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const current = await store.getAccount(organizationId, accountId);
      if (!current) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      if (current.archivedAt) {
        throw new AccountDirectoryError("archived", "Archived accounts cannot be edited. Restore first.", 409);
      }

      const expected = payload?.rowVersion ?? payload?.expectedRowVersion;
      const patch = {};
      const changed = [];
      if (payload?.displayName != null) {
        const displayName = String(payload.displayName ?? "").trim();
        if (!displayName) throw new AccountDirectoryError("display_name_required", "Account name is required.");
        if (displayName.length > 200) {
          throw new AccountDirectoryError(
            "display_name_too_long",
            "Account name must be 200 characters or fewer."
          );
        }
        patch.displayName = displayName;
        changed.push("displayName");
      }
      if (payload?.legalName !== undefined) {
        patch.legalName = payload.legalName ? String(payload.legalName).trim() : null;
        changed.push("legalName");
      }
      if (payload?.status != null) {
        requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN);
        const status = String(payload.status);
        if (!["active", "prospect", "inactive", "needs_review"].includes(status)) {
          throw new AccountDirectoryError("invalid_status", "Invalid account status.");
        }
        if (status === "archived") {
          throw new AccountDirectoryError("use_archive", "Use archive to archive an account.");
        }
        if (status === "active") {
          const links = await store.listExternalLinks(organizationId, accountId);
          if (!isAccountQuickbooksLinked(links)) {
            throw new AccountDirectoryError(
              "fuzzy_active_forbidden",
              "Active requires an exact QuickBooks customer link. Confirm the match in the QuickBooks workflow first.",
              400
            );
          }
        }
        patch.status = status;
        changed.push("status");
      }
      patch.updatedBy = actorUserId;

      const result = await store.updateAccount(organizationId, accountId, patch, expected);
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError(
          "conflict",
          "This account was updated by someone else. Reload and try again.",
          409,
          { rowVersion: result.current?.rowVersion }
        );
      }
      if (!result.ok) throw new AccountDirectoryError("not_found", "Account not found.", 404);

      // Preserve prior displayName as a same-account alias for search/reconciliation evidence.
      // Soft-fail: rename already succeeded; alias is discovery-only and never identity.
      let preservedFormerDisplayNameAlias = false;
      if (
        changed.includes("displayName") &&
        String(current.displayName || "").trim() &&
        normalizeAliasValue(current.displayName) !== normalizeAliasValue(patch.displayName)
      ) {
        try {
          const existingAliases =
            typeof store.listAliases === "function"
              ? await store.listAliases(organizationId, accountId)
              : [];
          const former = String(current.displayName).trim();
          const formerNorm = normalizeAliasValue(former);
          const alreadyPresent = (existingAliases || []).some(
            (a) =>
              a.isActive !== false &&
              (normalizeAliasValue(a.aliasValue ?? a.alias) === formerNorm ||
                normalizeAliasValue(a.normalizedMatchValue) === formerNorm)
          );
          if (!alreadyPresent && typeof store.insertAlias === "function") {
            const aliasRow = await store.insertAlias({
              organizationId,
              accountId,
              aliasValue: former,
              aliasSource: "former_display_name",
              normalizedMatchValue: formerNorm,
              createdBy: actorUserId,
              updatedBy: actorUserId
            });
            preservedFormerDisplayNameAlias = true;
            await writeAudit({
              organizationId,
              accountId,
              entityType: "alias",
              entityId: aliasRow?.id || accountId,
              action: "add_alias",
              actorUserId,
              changedFields: ["aliasValue"],
              newValues: { aliasValue: former, aliasSource: "former_display_name" },
              requestId,
              role
            });
          }
        } catch {
          preservedFormerDisplayNameAlias = false;
        }
      }

      // Internal Status Review option only. Never honor suppressAudit from request JSON payload.
      if (suppressAudit !== true) {
        await writeAudit({
          organizationId,
          accountId,
          entityType: "account",
          entityId: accountId,
          action: "update_account",
          actorUserId,
          changedFields: changed,
          oldValues: { displayName: current.displayName, status: current.status },
          newValues: {
            ...patch,
            ...(preservedFormerDisplayNameAlias ? { preservedFormerDisplayNameAlias: true } : {})
          },
          requestId,
          role
        });
      }

      return hydrateDetail(organizationId, result.account, { includeAudit: true, role });
    },

    async archiveAccount({ organizationId, role, actorUserId, requestId, accountId, rowVersion }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN);
      const current = await store.getAccount(organizationId, accountId);
      if (!current) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const result = await store.updateAccount(
        organizationId,
        accountId,
        {
          status: "archived",
          archivedAt: new Date().toISOString(),
          archivedBy: actorUserId,
          updatedBy: actorUserId
        },
        rowVersion
      );
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError(
          "conflict",
          "This account was updated by someone else. Reload and try again.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "account",
        entityId: accountId,
        action: "archive_account",
        actorUserId,
        changedFields: ["status", "archivedAt"],
        oldValues: { status: current.status },
        newValues: { status: "archived" },
        requestId,
        role
      });
      return hydrateDetail(organizationId, result.account, { includeAudit: true, role });
    },

    async restoreAccount({ organizationId, role, actorUserId, requestId, accountId, rowVersion }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN);
      const current = await store.getAccount(organizationId, accountId);
      if (!current) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const result = await store.updateAccount(
        organizationId,
        accountId,
        {
          status: "active",
          archivedAt: null,
          archivedBy: null,
          updatedBy: actorUserId
        },
        rowVersion
      );
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError(
          "conflict",
          "This account was updated by someone else. Reload and try again.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "account",
        entityId: accountId,
        action: "restore_account",
        actorUserId,
        changedFields: ["status", "archivedAt"],
        oldValues: { status: current.status },
        newValues: { status: "active" },
        requestId,
        role
      });
      return hydrateDetail(organizationId, result.account, { includeAudit: true, role });
    },

    async addContact({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const displayName = String(payload?.name ?? payload?.displayName ?? "").trim();
      if (!displayName) throw new AccountDirectoryError("contact_name_required", "Contact name is required.");
      const email = validateEmailOptional(payload?.email);
      const phone = payload?.phone ? String(payload.phone).trim() : null;
      const contact = await store.insertContact({
        organizationId,
        accountId,
        displayName,
        firstName: payload?.firstName ?? null,
        lastName: payload?.lastName ?? null,
        titleRole: payload?.role ?? payload?.titleRole ?? null,
        email,
        phone,
        phoneNormalized: normalizePhoneForMatch(phone),
        contactType: payload?.contactType ? String(payload.contactType).trim() : null,
        isPrimaryEstimating: Boolean(payload?.isPrimary),
        createdBy: actorUserId,
        updatedBy: actorUserId
      });
      await writeAudit({
        organizationId,
        accountId,
        entityType: "contact",
        entityId: contact.id,
        action: "add_contact",
        actorUserId,
        changedFields: ["displayName"],
        newValues: { displayName },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateContact({ organizationId, role, actorUserId, requestId, accountId, contactId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const patch = {};
      if (payload?.name != null || payload?.displayName != null) {
        patch.displayName = String(payload?.name ?? payload?.displayName).trim();
      }
      if (payload?.email !== undefined) patch.email = validateEmailOptional(payload.email);
      if (payload?.phone !== undefined) {
        patch.phone = payload.phone ? String(payload.phone).trim() : null;
        patch.phoneNormalized = normalizePhoneForMatch(patch.phone);
      }
      if (payload?.role !== undefined || payload?.titleRole !== undefined) {
        patch.titleRole = payload?.role ?? payload?.titleRole ?? null;
      }
      if (payload?.isPrimary !== undefined) patch.isPrimaryEstimating = Boolean(payload.isPrimary);
      if (payload?.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
      if (payload?.contactType !== undefined) {
        patch.contactType = payload.contactType ? String(payload.contactType).trim() : null;
      }
      if (payload?.firstName !== undefined) {
        patch.firstName = payload.firstName ? String(payload.firstName).trim() : null;
      }
      if (payload?.lastName !== undefined) {
        patch.lastName = payload.lastName ? String(payload.lastName).trim() : null;
      }
      patch.updatedBy = actorUserId;

      const result = await store.updateContact(organizationId, contactId, patch, payload?.rowVersion);
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError("conflict", "Contact was updated elsewhere. Reload and try again.", 409);
      }
      if (!result.ok || result.contact.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "Contact not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "contact",
        entityId: contactId,
        action: payload?.isActive === false ? "deactivate_contact" : "update_contact",
        actorUserId,
        changedFields: Object.keys(patch),
        newValues: patch,
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async addLocation({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const location = await store.insertLocation({
        organizationId,
        accountId,
        label: payload?.label ? String(payload.label).trim() : "Main",
        addressLine1: payload?.line1 ? String(payload.line1).trim() : null,
        addressLine2: payload?.line2 ? String(payload.line2).trim() : null,
        city: payload?.city ? String(payload.city).trim() : null,
        state: payload?.state ? String(payload.state).trim() : null,
        postalCode: payload?.postalCode ? String(payload.postalCode).trim() : null,
        sourceAddressRaw: payload?.sourceAddressRaw ?? null,
        locationType: ["account", "billing", "shipping", "other"].includes(String(payload?.locationType || ""))
          ? String(payload.locationType)
          : "account",
        isPrimaryAccountLocation: Boolean(payload?.isPrimary),
        createdBy: actorUserId,
        updatedBy: actorUserId
      });
      await writeAudit({
        organizationId,
        accountId,
        entityType: "location",
        entityId: location.id,
        action: "add_location",
        actorUserId,
        changedFields: ["label"],
        newValues: { label: location.label },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateLocation({ organizationId, role, actorUserId, requestId, accountId, locationId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const patch = {};
      if (payload?.label !== undefined) patch.label = String(payload.label).trim() || "Main";
      if (payload?.line1 !== undefined) patch.addressLine1 = payload.line1 ? String(payload.line1).trim() : null;
      if (payload?.line2 !== undefined) patch.addressLine2 = payload.line2 ? String(payload.line2).trim() : null;
      if (payload?.city !== undefined) patch.city = payload.city ? String(payload.city).trim() : null;
      if (payload?.state !== undefined) patch.state = payload.state ? String(payload.state).trim() : null;
      if (payload?.postalCode !== undefined) {
        patch.postalCode = payload.postalCode ? String(payload.postalCode).trim() : null;
      }
      if (payload?.isPrimary !== undefined) patch.isPrimaryAccountLocation = Boolean(payload.isPrimary);
      if (payload?.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
      if (payload?.locationType !== undefined) {
        const t = String(payload.locationType || "").trim();
        if (!["account", "billing", "shipping", "other"].includes(t)) {
          throw new AccountDirectoryError("invalid_location_type", "Location type is invalid.");
        }
        patch.locationType = t;
      }
      patch.updatedBy = actorUserId;

      const result = await store.updateLocation(organizationId, locationId, patch, payload?.rowVersion);
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError("conflict", "Location was updated elsewhere. Reload and try again.", 409);
      }
      if (!result.ok || result.location.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "Location not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "location",
        entityId: locationId,
        action: payload?.isActive === false ? "deactivate_location" : "update_location",
        actorUserId,
        changedFields: Object.keys(patch),
        newValues: patch,
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async addAlias({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const aliasValue = String(payload?.alias ?? payload?.aliasValue ?? "").trim();
      if (!aliasValue) throw new AccountDirectoryError("alias_required", "Alias is required.");
      const alias = await store.insertAlias({
        organizationId,
        accountId,
        aliasValue,
        aliasSource: payload?.source || "manual",
        normalizedMatchValue: normalizeAliasValue(aliasValue),
        createdBy: actorUserId,
        updatedBy: actorUserId
      });
      await writeAudit({
        organizationId,
        accountId,
        entityType: "alias",
        entityId: alias.id,
        action: "add_alias",
        actorUserId,
        changedFields: ["aliasValue"],
        newValues: { aliasValue },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateAlias({ organizationId, role, actorUserId, requestId, accountId, aliasId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const patch = {};
      if (payload?.alias != null || payload?.aliasValue != null) {
        patch.aliasValue = String(payload?.alias ?? payload?.aliasValue).trim();
        patch.normalizedMatchValue = normalizeAliasValue(patch.aliasValue);
      }
      if (payload?.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
      patch.updatedBy = actorUserId;
      const result = await store.updateAlias(organizationId, aliasId, patch, payload?.rowVersion);
      if (!result.ok || result.alias.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "Alias not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "alias",
        entityId: aliasId,
        action: payload?.isActive === false ? "deactivate_alias" : "update_alias",
        actorUserId,
        changedFields: Object.keys(patch),
        newValues: patch,
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async linkMoraware({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const externalId = String(payload?.externalId ?? payload?.sourceAccountId ?? "").trim();
      if (!externalId) {
        throw new AccountDirectoryError("external_id_required", "Moraware Account ID is required.");
      }

      const canonical = await resolveCanonicalMorawareAccount(organizationId, externalId);
      if (!canonical?.sourceAccountId) {
        throw new AccountDirectoryError(
          "moraware_account_not_found",
          "That Moraware Account ID is not in the canonical Moraware account list for this organization.",
          404
        );
      }
      if (isInternalMorawareAccountName(canonical.accountName)) {
        throw new AccountDirectoryError(
          "internal_identity_policy",
          "This Moraware account is an internal/house bucket and cannot be linked until an identity policy exists.",
          409
        );
      }
      const displayName = canonical.accountName || null;

      const active = await store.listActiveExternalLinksByExternalId(
        organizationId,
        ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        canonical.sourceAccountId
      );
      if (active.length) {
        const existing = active[0];
        if (existing.accountId !== accountId) {
          await throwMorawareDuplicate(organizationId, canonical.sourceAccountId, existing);
        }
        return hydrateDetail(organizationId, account, { includeAudit: true, role });
      }

      const existingRows = await store.listExternalLinks(organizationId, accountId);
      const inactiveSame = existingRows.find(
        (l) =>
          l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM &&
          l.externalId === canonical.sourceAccountId &&
          l.isActive === false
      );
      if (inactiveSame) {
        const result = await store.updateExternalLink(organizationId, inactiveSame.id, {
          isActive: true,
          externalDisplayName: displayName ?? inactiveSame.externalDisplayName
        });
        if (!result.ok && result.code === "duplicate_external_id") {
          await throwMorawareDuplicate(organizationId, canonical.sourceAccountId, result.existing);
        }
        if (!result.ok) {
          throw new AccountDirectoryError("not_found", "External link not found on this account.", 404);
        }
        await writeAudit({
          organizationId,
          accountId,
          entityType: "external_link",
          entityId: inactiveSame.id,
          action: "relink_moraware",
          actorUserId,
          changedFields: ["isActive"],
          newValues: {
            externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
            externalId: canonical.sourceAccountId,
            isActive: true
          },
          requestId,
          role,
          required: true
        });
        return hydrateDetail(organizationId, account, { includeAudit: true, role });
      }

      const result = await store.insertExternalLink({
        organizationId,
        accountId,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: canonical.sourceAccountId,
        externalDisplayName: displayName,
        linkedBy: actorUserId
      });
      if (!result.ok && result.code === "duplicate_external_id") {
        await throwMorawareDuplicate(organizationId, canonical.sourceAccountId, result.existing);
      }
      if (!result.ok || !result.link) {
        throw new AccountDirectoryError(
          "duplicate_external_id",
          "That Moraware Account ID is already linked to another Account Directory account.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "external_link",
        entityId: result.link.id,
        action: "link_moraware",
        actorUserId,
        changedFields: ["externalId"],
        newValues: {
          externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
          externalId: canonical.sourceAccountId
        },
        requestId,
        role,
        required: true
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async resolveMorawareAccount({ organizationId, role, sourceAccountId }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const id = String(sourceAccountId || "").trim();
      if (!id) return { linked: false, accountId: null };
      const active = await store.listActiveExternalLinksByExternalId(
        organizationId,
        ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        id
      );
      if (!active.length) return { linked: false, accountId: null, account: null };
      const account = await store.getAccount(organizationId, active[0].accountId);
      return { linked: true, accountId: active[0].accountId, account, linkId: active[0].id };
    },

    async linkQuickBooks({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const externalId = normalizeQuickBooksListId(payload?.externalId);
      if (!externalId) {
        throw new AccountDirectoryError("external_id_required", "QuickBooks List ID is required.");
      }
      if (typeof store.getQuickBooksCustomerFactByListId !== "function") {
        throw new AccountDirectoryError(
          "qb_facts_unavailable",
          "QuickBooks customer facts are unavailable. The link was not created.",
          503
        );
      }
      const fact = await store.getQuickBooksCustomerFactByListId(organizationId, externalId);
      const verdict = evaluateQuickBooksLinkCandidate(fact, { organizationId, listId: externalId });
      if (!verdict.ok) {
        throw new AccountDirectoryError(verdict.code, verdict.message, verdict.status);
      }
      const result = await store.insertExternalLink({
        organizationId,
        accountId,
        externalSystem: "quickbooks_desktop",
        externalId,
        externalDisplayName: payload?.externalDisplayName
          ? String(payload.externalDisplayName).trim()
          : null,
        sourceSnapshotDate: payload?.sourceSnapshot ?? null,
        linkedBy: actorUserId
      });
      if (!result.ok && result.code === "duplicate_external_id") {
        throw new AccountDirectoryError(
          "duplicate_external_id",
          "That QuickBooks identity is already linked to another account.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "external_link",
        entityId: result.link.id,
        action: "link_quickbooks",
        actorUserId,
        changedFields: ["externalId"],
        newValues: { externalSystem: "quickbooks_desktop", externalId },
        requestId,
        role
      });
      // Suggestion status only — never creates links. Confirmed link already written above.
      if (typeof deps.getSupabase === "function") {
        try {
          await markSuggestionLinked(deps.getSupabase(), {
            organizationId,
            qbListId: externalId,
            accountId,
            actorUserId
          });
        } catch {
          /* fail-soft */
        }
      }
      const detail = await hydrateDetail(organizationId, account, { includeAudit: true, role });
      return attachEnrichment(detail, await loadSuggestionIndex(organizationId));
    },

    /**
     * Just-in-time: create AD UUID from a trusted QB ROOT fact, then exact-link ListID.
     * Never writes to QuickBooks. Never auto-links Moraware.
     * Not transactional — if link fails after create, returns incomplete state.
     */
    async createAccountFromQuickBooks({ organizationId, role, actorUserId, requestId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const externalId = normalizeQuickBooksListId(payload?.qbListId ?? payload?.externalId);
      if (!externalId) {
        throw new AccountDirectoryError("external_id_required", "QuickBooks List ID is required.");
      }
      if (typeof store.getQuickBooksCustomerFactByListId !== "function") {
        throw new AccountDirectoryError(
          "qb_facts_unavailable",
          "QuickBooks customer facts are unavailable. The account was not created.",
          503
        );
      }
      const fact = await store.getQuickBooksCustomerFactByListId(organizationId, externalId);
      const verdict = evaluateQuickBooksLinkCandidate(fact, { organizationId, listId: externalId });
      if (!verdict.ok) {
        throw new AccountDirectoryError(verdict.code, verdict.message, verdict.status);
      }
      const existing = await store.listActiveExternalLinksByExternalId(
        organizationId,
        "quickbooks_desktop",
        externalId
      );
      if (existing?.length) {
        throw new AccountDirectoryError(
          "duplicate_external_id",
          "That QuickBooks identity is already linked to an Account Directory account.",
          409,
          { existingAccountId: existing[0].accountId }
        );
      }

      const displayName =
        String(payload?.displayName || "").trim() ||
        String(fact.fullName || fact.full_name || fact.name || "").trim() ||
        externalId;

      const account = await this.createAccount({
        organizationId,
        role,
        actorUserId,
        requestId,
        payload: {
          displayName,
          status: "active",
          source: "quickbooks_jit"
        },
        asProspect: false
      });

      try {
        const linked = await this.linkQuickBooks({
          organizationId,
          role,
          actorUserId,
          requestId,
          accountId: account.id,
          payload: {
            externalId,
            externalDisplayName: displayName
          }
        });
        return {
          ok: true,
          incomplete: false,
          qbLinked: true,
          morawareAutoLinked: false,
          account: linked,
          qbListId: externalId
        };
      } catch (err) {
        return {
          ok: true,
          incomplete: true,
          qbLinked: false,
          morawareAutoLinked: false,
          account,
          qbListId: externalId,
          linkError: err instanceof AccountDirectoryError ? err.message : String(err?.message || err),
          linkCode: err instanceof AccountDirectoryError ? err.code : "qb_link_failed"
        };
      }
    },

    async deactivateExternalLink({
      organizationId,
      role,
      actorUserId,
      requestId,
      accountId,
      linkId,
      expectedSystem
    }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const current =
        typeof store.getExternalLink === "function"
          ? await store.getExternalLink(organizationId, linkId)
          : null;
      if (!current) throw new AccountDirectoryError("not_found", "External link not found on this account.", 404);
      if (current.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "External link not found on this account.", 404);
      }
      if (expectedSystem && current.externalSystem !== expectedSystem) {
        throw new AccountDirectoryError(
          "external_system_mismatch",
          "That external link does not belong to the requested system.",
          409
        );
      }
      const result = await store.updateExternalLink(organizationId, linkId, { isActive: false });
      if (!result.ok || result.link.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "External link not found on this account.", 404);
      }
      const system = result.link.externalSystem;
      const action =
        system === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM ? "deactivate_moraware_link" : "deactivate_external_link";
      await writeAudit({
        organizationId,
        accountId,
        entityType: "external_link",
        entityId: linkId,
        action,
        actorUserId,
        changedFields: ["isActive"],
        newValues: { isActive: false, externalSystem: system },
        requestId,
        role,
        required: system === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    /** Hard delete is intentionally unavailable. */
    async hardDeleteAccount() {
      throw new AccountDirectoryError(
        "hard_delete_unavailable",
        "Hard delete is not available. Archive the account instead.",
        405
      );
    },

    isSuspiciousPhone,
    validateEmailOptional,
    MAX_PAGE
  };
}
