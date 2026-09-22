/**
 * AI-safe Account Directory adapters for slabOS AI Studio.
 * Reuses Account Directory service + Account 360 relationship — no parallel joins.
 */
import { resolveAccountDirectoryStore } from "../accountDirectory/accountDirectoryApi.js";
import { createAccountDirectoryService, AccountDirectoryError } from "../accountDirectory/accountDirectoryService.mjs";
import { getAccountDirectoryRelationship } from "../accountDirectory/accountDirectory360.mjs";
import { requireDomainHead } from "./slabAiPermissionIntersection.mjs";

const DOMAIN_HEAD = "account_directory";
const MIN_QUERY = 2;
const MAX_RESULTS = 10;

function pickStr(v) {
  return String(v ?? "").trim();
}

function adService(getSupabase) {
  const store = resolveAccountDirectoryStore({ getSupabase });
  return { store, service: createAccountDirectoryService({ store, getSupabase }) };
}

/**
 * Minimized account card for AI search — presentation labels only.
 */
export function toAiAccountListItem(row) {
  const id = String(row.id || row.accountId || "");
  const name = pickStr(row.displayName || row.display_name || row.name) || "Untitled account";
  const branch = pickStr(row.primaryBranch || row.branch || row.homeBranch) || null;
  const salesperson = pickStr(row.salespersonName || row.salesperson || row.ownerName) || null;
  const status = pickStr(row.status) || null;
  const city = pickStr(row.city || row.primaryCity) || null;
  const state = pickStr(row.state || row.primaryState) || null;
  const locationHint = [city, state].filter(Boolean).join(", ") || null;
  return {
    accountId: id,
    accountName: name,
    status,
    branch,
    salesperson,
    locationHint,
    label: locationHint ? `${name} — ${locationHint}` : name,
  };
}

/**
 * AI-safe account summary for briefings / Quote Scope context.
 */
export function toAiAccountSummary({ account, relationship, retrievedAt }) {
  const base = toAiAccountListItem(account);
  const health = relationship?.health || null;
  const estimates = relationship?.estimates?.internal?.items || [];
  const recentJobs = relationship?.moraware?.recent_jobs || [];
  const jobState = relationship?.moraware?.jobs_state || relationship?.jobs?.state || "unavailable";

  return {
    ...base,
    accountType: pickStr(account.accountType || account.account_type) || null,
    summaryFacts: [
      statusFact("Status", base.status),
      statusFact("Branch", base.branch),
      statusFact("Salesperson", base.salesperson),
      statusFact("Moraware jobs", jobState === "available" ? String(relationship?.moraware?.job_count_2026 ?? recentJobs.length) : "unavailable"),
      statusFact("Recent estimates", String(estimates.length)),
    ].filter(Boolean),
    recentQuotes: estimates.slice(0, 8).map((q) => ({
      quoteNumber: pickStr(q.quote_number) || null,
      status: pickStr(q.status || q.quote_status) || null,
      updatedAt: q.updated_at || null,
      recordedTotal: q.grand_total != null || q.amount != null ? Number(q.grand_total ?? q.amount) : null,
    })),
    recentJobs: recentJobs.slice(0, 8).map((j) => ({
      jobId: pickStr(j.source_job_id) || null,
      jobName: pickStr(j.job_name) || null,
      status: pickStr(j.status_name) || null,
      jobDate: j.job_date || null,
      salesperson: pickStr(j.salesperson_name) || null,
    })),
    relationshipNotes: pickStr(relationship?.jobs?.notes) || null,
    healthSignals: Array.isArray(health?.signals)
      ? health.signals.slice(0, 6).map((s) => ({
          code: pickStr(s.code) || null,
          label: pickStr(s.label) || null,
          severity: pickStr(s.severity) || null,
        }))
      : [],
    retrievedAt,
    sourceSystem: "account_directory",
    authority: "Read-only Account Directory / Account 360 summary. AI must not invent account facts.",
  };
}

function statusFact(label, value) {
  if (value == null || value === "") return null;
  return { label, value };
}

/**
 * @param {{ db: any, getSupabase: Function, user: object, organizationId: string, query: string, limit?: number }} args
 */
export async function searchAccountsForAi(args) {
  const { db, getSupabase, user, organizationId, query, limit = MAX_RESULTS } = args;
  const gate = await requireDomainHead({ db, user, domainHead: DOMAIN_HEAD });
  if (!gate.ok) return gate;

  const q = pickStr(query).slice(0, 80);
  if (q.length < MIN_QUERY) {
    return {
      ok: true,
      items: [],
      totalMatches: 0,
      returned: 0,
      truncated: false,
      ambiguous: false,
      minQueryLength: MIN_QUERY,
      queryTooShort: true,
      retrievedAt: new Date().toISOString(),
    };
  }

  const lim = Math.min(MAX_RESULTS, Math.max(1, Number(limit) || MAX_RESULTS));
  const { service } = adService(getSupabase);
  try {
    const result = await service.listAccounts({
      organizationId,
      role: user.role || "viewer",
      search: q,
      page: 1,
      pageSize: lim,
      tab: "all",
    });
    const rows = (result?.items || []).map((item) => toAiAccountListItem(item));
    const totalMatches = Number(result?.total ?? rows.length) || rows.length;
    const ambiguous = rows.length > 1;
    return {
      ok: true,
      items: rows,
      totalMatches,
      returned: rows.length,
      truncated: totalMatches > rows.length,
      ambiguous,
      retrievedAt: new Date().toISOString(),
      sourceSystem: "account_directory",
    };
  } catch (e) {
    if (e instanceof AccountDirectoryError) {
      return { ok: false, status: e.status || 400, error: e.message, code: e.code };
    }
    throw e;
  }
}

/**
 * @param {{ db: any, getSupabase: Function, user: object, organizationId: string, accountId: string }} args
 */
export async function retrieveAccountForAi(args) {
  const { db, getSupabase, user, organizationId, accountId } = args;
  const gate = await requireDomainHead({ db, user, domainHead: DOMAIN_HEAD });
  if (!gate.ok) return gate;

  if (!/^[0-9a-f-]{36}$/i.test(String(accountId || ""))) {
    return { ok: false, status: 400, error: "Invalid account id" };
  }

  const { store, service } = adService(getSupabase);
  const retrievedAt = new Date().toISOString();
  try {
    const detail = await service.getAccount({
      organizationId,
      role: user.role || "viewer",
      accountId,
    });
    const relationship = await getAccountDirectoryRelationship({
      supabase: getSupabase(),
      store,
      organizationId,
      accountId,
      role: user.role || "viewer",
      embedFinancials: false,
    });

    // getAccount returns hydrated detail card (id, displayName, …) — not { account }
    const account = {
      id: detail.id || accountId,
      displayName: detail.displayName || detail.name,
      status: detail.status,
      accountType: detail.accountType || detail.account_type,
      branch: detail.branch,
      salesperson: detail.salespersonName || detail.salesperson,
      city: detail.city,
      state: detail.state,
    };
    return {
      ok: true,
      account: toAiAccountSummary({ account, relationship, retrievedAt }),
      retrievedAt,
    };
  } catch (e) {
    if (e instanceof AccountDirectoryError) {
      return { ok: false, status: e.status || 404, error: e.message, code: e.code };
    }
    throw e;
  }
}

export { DOMAIN_HEAD as ACCOUNT_DOMAIN_HEAD, MIN_QUERY as ACCOUNT_SEARCH_MIN_QUERY };
