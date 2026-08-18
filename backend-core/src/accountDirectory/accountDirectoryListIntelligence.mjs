/**
 * Account Directory landing-page read-model intelligence.
 * Presentation only. Exact QB/Moraware links. No identity mutations.
 */

import { resolveCurrentMorawarePopulation } from "../moraware/morawareCurrentPopulation.mjs";
import { followUpDueState } from "./accountDirectoryFollowUps.mjs";
import {
  ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
  collectCurrentMorawareJobs,
  filterMorawareJobsForCalendarWindow,
  isAccountMorawareLinked,
  sumTrustedJobWorksheetSqft
} from "./accountDirectoryMorawareLinkage.mjs";
import { isAccountQuickbooksLinked } from "./accountDirectoryQuickbooksLinkage.mjs";

export const DIRECTORY_LIST_SORTS = Object.freeze([
  "name_asc",
  "name_desc",
  "status_asc",
  "status_desc",
  "connections_desc",
  "connections_asc",
  "ar_desc",
  "ar_asc",
  "ytd_sqft_desc",
  "ytd_sqft_asc",
  "followup_attention",
  "followup_attention_asc",
  "contact_asc",
  "contact_desc",
  "location_asc",
  "location_desc",
  "activity_desc",
  "activity_asc",
  "updated_desc",
  "updated_asc"
]);

export const DIRECTORY_SORT_NEEDS_CONTACTS = Object.freeze(["contact_asc", "contact_desc", "location_asc", "location_desc"]);
export const DIRECTORY_YTD_SORTS = Object.freeze(["ytd_sqft_desc", "ytd_sqft_asc"]);
export const DIRECTORY_FOLLOWUP_SORTS = Object.freeze(["followup_attention", "followup_attention_asc"]);

export const DIRECTORY_JOB_PAGE = 1000;
export const DIRECTORY_JOB_CAP = 20000;
export const DIRECTORY_ACCOUNT_POPULATION_CAP = 5000;
export const DIRECTORY_HEAD_CAP = 20000;

const JOB_SELECT =
  "source_job_id,source_account_id,job_name,status_name,salesperson_name,created_at_source,install_at_source,completed_at_source,last_seen_at,raw_payload";

const STATUS_RANK = Object.freeze({
  needs_review: 0,
  active: 1,
  inactive: 2,
  prospect: 3,
  archived: 4
});

export function localYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ytdWindowFromNow(now = new Date()) {
  const asOfYmd = localYmd(now);
  const year = asOfYmd ? Number(asOfYmd.slice(0, 4)) : new Date().getFullYear();
  return { year, asOfYmd };
}

export function connectionsFromLinks(links) {
  return {
    quickbooks: isAccountQuickbooksLinked(links),
    moraware: isAccountMorawareLinked(links)
  };
}

export function connectionSortRank(item) {
  const qb = Boolean(item?.connections?.quickbooks);
  const mw = Boolean(item?.connections?.moraware);
  if (qb && mw) return 0;
  if (qb || mw) return 1;
  const code = String(item?.qbEnrichmentCode || item?.qbEnrichment?.code || "").trim();
  if (code === "needs_review" || code === "suggested_match") return 2;
  return 3;
}

export function followUpSortRank(summary) {
  const overdue = Number(summary?.overdue || 0);
  const dueToday = Number(summary?.dueToday || 0);
  const open = Number(summary?.open || 0);
  if (overdue > 0) return 0;
  if (dueToday > 0) return 1;
  if (open > 0) return 2;
  return 3;
}

export function summarizeOpenFollowUps(rows, now = new Date()) {
  const byAccount = new Map();
  let orgOpen = 0;
  let orgOverdue = 0;
  for (const row of rows || []) {
    if (!row || String(row.status || "open").toLowerCase() !== "open") continue;
    if (row.archivedAt) continue;
    const accountId = String(row.accountId || "").trim();
    if (!accountId) continue;
    const dueState = followUpDueState(row.dueAt, { status: row.status, now });
    let rec = byAccount.get(accountId);
    if (!rec) {
      rec = { open: 0, overdue: 0, dueToday: 0, nextDueAt: null, latestTouchedAt: null };
      byAccount.set(accountId, rec);
    }
    rec.open += 1;
    orgOpen += 1;
    if (dueState === "overdue") {
      rec.overdue += 1;
      orgOverdue += 1;
    }
    if (dueState === "due_today") rec.dueToday += 1;
    const dueAt = row.dueAt || null;
    if (dueAt && (!rec.nextDueAt || String(dueAt) < String(rec.nextDueAt))) rec.nextDueAt = dueAt;
    const touched = row.updatedAt || row.createdAt || null;
    if (touched && (!rec.latestTouchedAt || String(touched) > String(rec.latestTouchedAt))) {
      rec.latestTouchedAt = touched;
    }
  }
  return { byAccount, orgOpen, orgOverdue, available: true };
}

export function countNotesByAccount(noteHeads) {
  const byAccount = new Map();
  for (const row of noteHeads || []) {
    if (!row || row.archivedAt) continue;
    const accountId = String(row.accountId || "").trim();
    if (!accountId) continue;
    const rec = byAccount.get(accountId) || { count: 0, latestAt: null };
    rec.count += 1;
    const at = row.createdAt || row.updatedAt || null;
    if (at && (!rec.latestAt || String(at) > String(rec.latestAt))) rec.latestAt = at;
    byAccount.set(accountId, rec);
  }
  return byAccount;
}

function indexMorawareLinks(links) {
  const sourceToAccount = new Map();
  const accountSources = new Map();
  for (const link of links || []) {
    if (!link || link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "").trim();
    if (system !== ACCOUNT_DIRECTORY_MORAWARE_SYSTEM) continue;
    const sourceId = String(link.externalId || link.external_id || "").trim();
    const accountId = String(link.accountId || link.account_id || "").trim();
    if (!sourceId || !accountId) continue;
    sourceToAccount.set(sourceId, accountId);
    if (!accountSources.has(accountId)) accountSources.set(accountId, new Set());
    accountSources.get(accountId).add(sourceId);
  }
  return { sourceToAccount, accountSources };
}

/**
 * Company YTD from the full governed CURRENT job population.
 * Per-account YTD uses exact Moraware links only (multi-ID union, source_job_id once).
 */
export function buildYtdActivityReadModel({
  jobs,
  morawareLinks,
  currentPopulation,
  year,
  asOfYmd,
  available = true
} = {}) {
  const { sourceToAccount, accountSources } = indexMorawareLinks(morawareLinks);
  const emptyAccount = () => ({
    available: Boolean(available),
    jobs: available ? 0 : null,
    sqft: available ? 0 : null,
    latestJobDate: null
  });

  if (!available || jobs == null) {
    const byAccount = new Map();
    for (const accountId of accountSources.keys()) byAccount.set(accountId, emptyAccount());
    return {
      available: false,
      year,
      asOfYmd,
      company: { jobs: null, sqft: null, customersWithActivity: 0 },
      byAccount
    };
  }

  const unique = collectCurrentMorawareJobs(jobs, currentPopulation);
  const inWindow = filterMorawareJobsForCalendarWindow(unique, { year, asOfYmd });
  const companySqft = sumTrustedJobWorksheetSqft(inWindow);
  const byAccount = new Map();
  for (const accountId of accountSources.keys()) byAccount.set(accountId, emptyAccount());

  const customers = new Set();
  for (const row of inWindow) {
    const accountId = sourceToAccount.get(row.safe.source_account_id);
    if (!accountId) continue;
    customers.add(accountId);
    const rec = byAccount.get(accountId) || emptyAccount();
    rec.jobs += 1;
    rec.sqft = Math.round(((rec.sqft || 0) + (sumTrustedJobWorksheetSqft([row]) || 0)) * 10) / 10;
    if (row.safe.job_date && (!rec.latestJobDate || row.safe.job_date > rec.latestJobDate)) {
      rec.latestJobDate = row.safe.job_date;
    }
    byAccount.set(accountId, rec);
  }

  const latestByAccountFromAllCurrent = new Map();
  for (const row of unique) {
    const accountId = sourceToAccount.get(row.safe.source_account_id);
    if (!accountId || !row.safe.job_date) continue;
    const prev = latestByAccountFromAllCurrent.get(accountId);
    if (!prev || row.safe.job_date > prev) latestByAccountFromAllCurrent.set(accountId, row.safe.job_date);
  }

  return {
    available: true,
    year,
    asOfYmd,
    company: {
      jobs: inWindow.length,
      sqft: companySqft,
      customersWithActivity: customers.size
    },
    byAccount,
    latestJobDateByAccount: latestByAccountFromAllCurrent
  };
}

export function ytdPublic(snapshot, available) {
  if (!available) return { available: false, jobs: null, sqft: null };
  if (!snapshot) return { available: true, jobs: 0, sqft: 0 };
  return {
    available: true,
    jobs: Number(snapshot.jobs || 0),
    sqft: snapshot.sqft == null ? 0 : Number(snapshot.sqft)
  };
}

export function followUpPublic(summary, available = true) {
  if (available === false) {
    return { available: false, open: null, overdue: null, dueToday: null, nextDueAt: null };
  }
  return {
    available: true,
    open: Number(summary?.open || 0),
    overdue: Number(summary?.overdue || 0),
    dueToday: Number(summary?.dueToday || 0),
    nextDueAt: summary?.nextDueAt || null
  };
}

function comparableIso(value) {
  const s = value ? String(value).trim() : "";
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  return s;
}

function maxIso(values) {
  let best = null;
  let bestKey = "";
  for (const value of values) {
    const raw = value ? String(value).trim() : "";
    if (!raw) continue;
    const key = comparableIso(raw);
    if (!best || key > bestKey) {
      best = raw;
      bestKey = key;
    }
  }
  return best;
}

export function lastActivityAtForAccount({ ytdLatestJobDate, currentJobDate, noteLatestAt, followUpTouchedAt } = {}) {
  return maxIso([ytdLatestJobDate, currentJobDate, noteLatestAt, followUpTouchedAt]);
}

function cmpText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function cmpId(a, b) {
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function locationKey(item) {
  return [item?.city, item?.state].map((x) => String(x || "").trim()).filter(Boolean).join(", ");
}

function nullLastNumber(value, dir) {
  if (value == null || !Number.isFinite(Number(value))) return dir === "desc" ? -Infinity : Infinity;
  return Number(value);
}

/**
 * Sort the full filtered list (not the current page).
 */
export function sortDirectoryListItems(items, sort) {
  const key = DIRECTORY_LIST_SORTS.includes(String(sort || "").trim()) ? String(sort).trim() : "name_asc";
  const sorted = [...(items || [])];
  sorted.sort((a, b) => {
    if (key === "name_desc") return cmpText(b.displayName || b.name, a.displayName || a.name) || cmpId(a, b);
    if (key === "status_asc" || key === "status_desc") {
      const ra = STATUS_RANK[String(a.status || "")] ?? 50;
      const rb = STATUS_RANK[String(b.status || "")] ?? 50;
      const by = key === "status_desc" ? rb - ra : ra - rb;
      return by || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "connections_desc" || key === "connections_asc") {
      const by = connectionSortRank(a) - connectionSortRank(b);
      const ordered = key === "connections_asc" ? -by : by;
      return ordered || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "ar_desc" || key === "ar_asc") {
      const va = nullLastNumber(a.financialIntel?.openAr, key === "ar_desc" ? "desc" : "asc");
      const vb = nullLastNumber(b.financialIntel?.openAr, key === "ar_desc" ? "desc" : "asc");
      const by = key === "ar_desc" ? vb - va : va - vb;
      return by || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "ytd_sqft_desc" || key === "ytd_sqft_asc") {
      const dir = key === "ytd_sqft_desc" ? "desc" : "asc";
      const va = a.ytdActivity?.available === false ? null : a.ytdActivity?.sqft;
      const vb = b.ytdActivity?.available === false ? null : b.ytdActivity?.sqft;
      const by = dir === "desc" ? nullLastNumber(vb, dir) - nullLastNumber(va, dir) : nullLastNumber(va, dir) - nullLastNumber(vb, dir);
      return by || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "followup_attention" || key === "followup_attention_asc") {
      const ra = followUpSortRank(a.followUpSummary);
      const rb = followUpSortRank(b.followUpSummary);
      const by = key === "followup_attention_asc" ? rb - ra : ra - rb;
      if (by) return by;
      const oa = Number(a.followUpSummary?.overdue || 0);
      const ob = Number(b.followUpSummary?.overdue || 0);
      if (oa !== ob) return ob - oa;
      return cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "contact_asc" || key === "contact_desc") {
      const by = cmpText(a.primaryContact, b.primaryContact);
      return (key === "contact_desc" ? -by : by) || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "location_asc" || key === "location_desc") {
      const by = cmpText(locationKey(a), locationKey(b));
      return (key === "location_desc" ? -by : by) || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "activity_desc" || key === "activity_asc") {
      const va = a.lastActivityAt || "";
      const vb = b.lastActivityAt || "";
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      const by = String(vb).localeCompare(String(va));
      return (key === "activity_asc" ? -by : by) || cmpText(a.displayName, b.displayName) || cmpId(a, b);
    }
    if (key === "updated_desc") {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || cmpText(a.displayName, b.displayName);
    }
    if (key === "updated_asc") {
      return String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")) || cmpText(a.displayName, b.displayName);
    }
    return cmpText(a.displayName || a.name, b.displayName || b.name) || cmpId(a, b);
  });
  return sorted;
}

function isMissingRelation(error) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

/**
 * Page until exhausted or past cap. Collecting cap+1 means truncated.
 * Never returns a partial row set as complete.
 */
export async function readRowsUntilCap({ fetchRange, pageSize, cap }) {
  const size = Math.max(1, Number(pageSize) || 1);
  const limit = Math.max(1, Number(cap) || 1);
  const rows = [];
  let from = 0;
  for (;;) {
    const batch = (await fetchRange(from, from + size - 1)) || [];
    rows.push(...batch);
    if (rows.length > limit) {
      return { rows: null, complete: false, truncated: true, unavailable: true };
    }
    if (batch.length < size) {
      return { rows, complete: true, truncated: false, unavailable: false };
    }
    from += size;
  }
}

export function scopedPopulationOverflow({ items, total, cap }) {
  const loaded = Array.isArray(items) ? items.length : 0;
  const limit = Math.max(1, Number(cap) || 1);
  if (loaded > limit) return true;
  if (total == null || total === "") return false;
  const reported = Number(total);
  return Number.isFinite(reported) && reported > limit;
}

export function linkSetComplete(links, counted) {
  if (counted == null || counted === "") return true;
  const n = Number(counted);
  if (!Number.isFinite(n)) return true;
  return (links || []).length === n;
}

export function normalizeHeadList(listed) {
  if (Array.isArray(listed)) return { items: listed, complete: true, truncated: false };
  const items = listed?.items;
  if (listed?.truncated === true || listed?.complete === false) {
    return { items: [], complete: false, truncated: true };
  }
  return { items: Array.isArray(items) ? items : [], complete: true, truncated: false };
}

export function resolveDirectoryListSort(sort, { ytdAvailable = true, followUpAvailable = true } = {}) {
  const key = DIRECTORY_LIST_SORTS.includes(String(sort || "").trim()) ? String(sort).trim() : "name_asc";
  if (DIRECTORY_YTD_SORTS.includes(key) && ytdAvailable === false) return "name_asc";
  if (DIRECTORY_FOLLOWUP_SORTS.includes(key) && followUpAvailable === false) return "name_asc";
  return key;
}

export async function loadCurrentMorawareJobsForOrg(
  supabase,
  organizationId,
  currentPopulation,
  { pageSize = DIRECTORY_JOB_PAGE, cap = DIRECTORY_JOB_CAP } = {}
) {
  if (!supabase || !organizationId || !currentPopulation?.available || !currentPopulation.full_census_started_at) {
    return { jobs: null, unavailable: true, complete: false, truncated: false };
  }
  try {
    const fetched = await readRowsUntilCap({
      pageSize,
      cap,
      fetchRange: async (from, to) => {
        const { data, error } = await supabase
          .from("brain_moraware_jobs")
          .select(JOB_SELECT)
          .eq("organization_id", organizationId)
          .gte("last_seen_at", currentPopulation.full_census_started_at)
          .range(from, to);
        if (error) throw error;
        return data || [];
      }
    });
    if (fetched.truncated) {
      return { jobs: null, unavailable: true, complete: false, truncated: true };
    }
    return { jobs: fetched.rows, unavailable: false, complete: true, truncated: false };
  } catch (error) {
    if (isMissingRelation(error)) {
      return { jobs: null, unavailable: true, complete: false, truncated: false };
    }
    return { jobs: null, unavailable: true, complete: false, truncated: false };
  }
}

/**
 * One org-scoped batch bundle for list + summary. No N+1.
 */
export async function loadDirectoryOperationalIntelligence({
  supabase,
  store,
  organizationId,
  now = new Date(),
  morawareLinks = [],
  currentPopulation,
  jobs,
  jobsTruncated = false,
  jobPageSize,
  jobCap,
  headCap
} = {}) {
  const window = ytdWindowFromNow(now);

  let population = currentPopulation;
  if (population === undefined && supabase && organizationId) {
    try {
      population = await resolveCurrentMorawarePopulation(supabase, organizationId);
    } catch {
      population = { available: false };
    }
  }

  let jobBundle = { jobs: jobs ?? null, unavailable: jobs == null, complete: jobs != null, truncated: false };
  if (jobs === undefined && supabase) {
    jobBundle = await loadCurrentMorawareJobsForOrg(supabase, organizationId, population, {
      pageSize: jobPageSize,
      cap: jobCap
    });
  } else if (jobsTruncated === true) {
    jobBundle = { jobs: null, unavailable: true, complete: false, truncated: true };
  } else if (jobs != null) {
    jobBundle = { jobs, unavailable: false, complete: true, truncated: false };
  }

  const ytd = buildYtdActivityReadModel({
    jobs: jobBundle.unavailable || jobBundle.truncated ? null : jobBundle.jobs,
    morawareLinks,
    currentPopulation: population,
    year: window.year,
    asOfYmd: window.asOfYmd,
    available: !jobBundle.unavailable && !jobBundle.truncated
  });

  const resolvedHeadCap = Number(headCap) > 0 ? Number(headCap) : DIRECTORY_HEAD_CAP;
  let followUp = { byAccount: new Map(), orgOpen: 0, orgOverdue: 0, available: true };
  if (store && typeof store.listOpenFollowUpHeadsForOrganization === "function") {
    try {
      const listed = normalizeHeadList(
        await store.listOpenFollowUpHeadsForOrganization(organizationId, { cap: resolvedHeadCap })
      );
      if (listed.truncated) {
        followUp = { byAccount: new Map(), orgOpen: null, orgOverdue: null, available: false };
      } else {
        followUp = summarizeOpenFollowUps(listed.items, now);
      }
    } catch {
      followUp = { byAccount: new Map(), orgOpen: null, orgOverdue: null, available: false };
    }
  }

  let notes = new Map();
  let notesComplete = true;
  if (store && typeof store.listNoteHeadsForOrganization === "function") {
    try {
      const listed = normalizeHeadList(await store.listNoteHeadsForOrganization(organizationId, { cap: resolvedHeadCap }));
      if (listed.truncated) {
        notes = null;
        notesComplete = false;
      } else {
        notes = countNotesByAccount(listed.items);
      }
    } catch {
      notes = null;
      notesComplete = false;
    }
  }

  return {
    available: ytd.available,
    year: window.year,
    asOfYmd: window.asOfYmd,
    ytd,
    followUp,
    notes,
    notesComplete,
    truncated: Boolean(jobBundle.truncated)
  };
}

export function attachListIntelligence(item, { ytd, followUp, notes, links } = {}) {
  const accountId = String(item?.id || "");
  const ytdSnap = ytd?.byAccount?.get(accountId);
  const followUpAvailable = followUp?.available !== false;
  const fu = followUpAvailable ? followUp?.byAccount?.get(accountId) : null;
  const note = notes?.get?.(accountId);
  const ytdAvailable = Boolean(ytd) && ytd.available !== false;
  const lastActivityAt = lastActivityAtForAccount({
    currentJobDate: ytdAvailable ? ytd?.latestJobDateByAccount?.get(accountId) || ytdSnap?.latestJobDate || null : null,
    noteLatestAt: notes ? note?.latestAt || null : null,
    followUpTouchedAt: followUpAvailable ? fu?.latestTouchedAt || null : null
  });
  return {
    ...item,
    connections: item.connections || connectionsFromLinks(links || []),
    ytdActivity: ytdPublic(ytdSnap, ytdAvailable),
    followUpSummary: followUpPublic(fu, followUpAvailable),
    notesCount: notes ? note?.count || 0 : null,
    lastActivityAt
  };
}

export function companyOperationalPublic(intel, { openAr = null, openArAvailable = true } = {}) {
  const ytd = intel?.ytd;
  return {
    year: intel?.year || ytd?.year || null,
    asOfYmd: intel?.asOfYmd || ytd?.asOfYmd || null,
    ytdJobs: ytd?.available ? ytd.company.jobs : null,
    ytdSqft: ytd?.available ? ytd.company.sqft : null,
    customersWithYtdActivity: ytd?.available ? ytd.company.customersWithActivity : null,
    ytdAvailable: Boolean(ytd?.available),
    openAr: openArAvailable ? openAr : null,
    openArAvailable: Boolean(openArAvailable)
  };
}
