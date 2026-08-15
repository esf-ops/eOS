/**
 * Account 360 — relationship health, timeline, estimate summaries, list intel.
 * Exact Account Directory identity and exact QuickBooks root links only.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  roleHasCapability
} from "./accountDirectoryAuth.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";
import {
  AD_FINANCIALS_PAGE_SIZE,
  buildOpenArAging,
  classifyArAgingBucket,
  collectActiveQuickbooksRootListIds,
  emptyFinancialsProfile,
  getAccountDirectoryFinancials,
  scrubFinancialIds,
  sumLinkedOpenAr
} from "./accountDirectoryFinancialIntelligence.mjs";
import {
  buildCustomerMonthlyPoints,
  mapOpenInvoiceRow,
  monthKeysInclusive,
  resolveCustomerTrendWindow
} from "./accountDirectoryCustomerTrend.mjs";
import { loadLatestSuccessfulQbSyncRun } from "../sales/quickbooksFinancialTruth/preparedFactsProvider.js";
import {
  AD_HISTORY_TIMELINE_CAP,
  AD_HISTORY_TXN_PAGE_DEFAULT,
  AD_HISTORY_TXN_PAGE_MAX,
  loadStaffSafeCustomerTransactions
} from "./accountDirectoryCustomerHistory.mjs";
import { resolveAccountQbEnrichmentLabel } from "./qbCustomerEnrichment/feedStatus.js";

export const AD_360_PAGE_DEFAULT = 25;
export const AD_360_PAGE_MAX = 50;
export const AD_INVOICE_PAGE_DEFAULT = 50;
export const AD_INVOICE_PAGE_MAX = 100;

function toYmd(value) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function boundedPage(rawPage, rawLimit, fallback, max) {
  const page = Math.max(1, Number.parseInt(String(rawPage ?? "1"), 10) || 1);
  const parsed = Number.parseInt(String(rawLimit ?? ""), 10);
  const limit = Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
  return { page, limit, offset: (page - 1) * limit };
}

function isMissingRelation(err) {
  const msg = String(err?.message ?? err ?? "");
  return /relation .* does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(msg);
}

export function buildRelationshipHealth({ account, financials, qbEnrichment }) {
  const signals = [];
  const status = String(account?.status || "");
  const completeness = [];

  if (!account?.hasPrimaryContact) {
    signals.push({
      code: "missing_primary_contact",
      severity: "watch",
      label: "Missing primary contact",
      detail: "No primary estimating contact is on file.",
      target: "Contacts"
    });
    completeness.push("contact");
  }
  if (!account?.hasPrimaryLocation) {
    signals.push({
      code: "missing_primary_location",
      severity: "watch",
      label: "Missing primary location",
      detail: "No primary account location is on file.",
      target: "Locations"
    });
    completeness.push("location");
  }

  const qbCode = String(qbEnrichment?.code || (account?.quickbooksLinked ? "linked" : "not_linked"));
  if (qbCode === "needs_review") {
    signals.push({
      code: "qb_needs_review",
      severity: "attention",
      label: "QuickBooks needs review",
      detail: "A QuickBooks match still needs confirmation, so invoices and A/R are not connected yet.",
      target: "Connections"
    });
  } else if (qbCode === "suggested_match") {
    signals.push({
      code: "qb_suggested",
      severity: "watch",
      label: "QuickBooks suggested match",
      detail: "A possible QuickBooks customer was suggested. Confirm the link before treating invoices as this account.",
      target: "Connections"
    });
  } else if (qbCode === "not_linked" || financials?.linked === false) {
    signals.push({
      code: "qb_unlinked",
      severity: "watch",
      label: "QuickBooks not linked",
      detail: "This account is not linked to QuickBooks yet, so invoices and A/R are not connected.",
      target: "Connections"
    });
  }

  if (status === "needs_review") {
    signals.push({
      code: "account_needs_review",
      severity: "attention",
      label: "Account needs review",
      detail: "Directory status is needs review.",
      target: "Overview"
    });
  }

  const collection = financials?.collectionAttention || null;
  if (collection?.code === "priority") {
    signals.push({
      code: "collection_priority",
      severity: "priority",
      label: "Collection priority",
      detail: collection.reason,
      target: "Financials"
    });
  } else if (collection?.code === "attention") {
    signals.push({
      code: "collection_attention",
      severity: "attention",
      label: "Overdue receivables",
      detail: collection.reason,
      target: "Financials"
    });
  } else if (collection?.code === "watch") {
    signals.push({
      code: "collection_watch",
      severity: "watch",
      label: "Overdue receivables",
      detail: collection.reason,
      target: "Financials"
    });
  } else if (collection?.code === "unknown" && Number(financials?.summary?.openAr) > 0) {
    signals.push({
      code: "aging_unknown",
      severity: "watch",
      label: "A/R due dates incomplete",
      detail: collection.reason,
      target: "Financials"
    });
  }

  const daysSince = financials?.daysSinceLastPayment;
  if (financials?.linked && daysSince != null && daysSince >= 90 && Number(financials?.summary?.openAr) > 0) {
    signals.push({
      code: "no_recent_payment",
      severity: daysSince >= 180 ? "attention" : "watch",
      label: "No recent payment",
      detail: `${daysSince} day(s) since last recorded payment.`,
      target: "Financials"
    });
  }

  if (financials?.linked && (financials.status === "ok" || financials.status === "stale") && financials.recentActivity?.length) {
    signals.push({
      code: "recent_activity",
      severity: "healthy",
      label: "Recent financial activity",
      detail: "Recent invoices, payments, or quotes are on file.",
      target: "Relationship"
    });
  }

  const rank = { priority: 4, attention: 3, watch: 2, healthy: 1 };
  let state = "healthy";
  let label = "Healthy";
  for (const signal of signals) {
    if ((rank[signal.severity] || 0) > (rank[state] || 0)) {
      state = signal.severity;
      if (state === "priority") label = "Priority";
      else if (state === "attention") label = "Attention";
      else if (state === "watch") label = "Watch";
      else label = "Healthy";
    }
  }
  if (!signals.length) {
    signals.push({
      code: "complete",
      severity: "healthy",
      label: "No outstanding directory signals",
      detail: "Primary contact, location, and QuickBooks linkage checks passed.",
      target: "Overview"
    });
  }

  return {
    state,
    label,
    reason: signals.find((s) => s.severity === state)?.detail || null,
    completeness_gaps: completeness,
    signals
  };
}

async function loadLinkedTransactions(supabase, { organizationId, rootListIds, startDate, endDate, limit }) {
  const loaded = await loadStaffSafeCustomerTransactions({
    supabase,
    organizationId,
    rootListIds,
    startDate,
    endDate,
    limit: limit || null
  });
  return (loaded.rows || []).map((row) => ({
    transaction_type: row.type,
    transaction_date: row.date,
    reference_number: row.referenceNumber,
    amount: row.amount,
    customer_name: row.customerName
  }));
}

export async function getAccountDirectoryTrend(params) {
  const financials = await getAccountDirectoryFinancials(params);
  if (financials.status === "unlinked" || financials.linked === false) {
    return scrubFinancialIds({
      status: "unlinked",
      period: String(params.period || "trailing_12"),
      points: [],
      notes: "Customer trend is unavailable until this account has an exact QuickBooks root link."
    });
  }
  if (financials.status === "unavailable") {
    return scrubFinancialIds({
      status: "unavailable",
      period: String(params.period || "trailing_12"),
      points: [],
      notes: (financials.warnings || [])[0] || "Customer trend is unavailable."
    });
  }

  const links = await params.store.listExternalLinks(params.organizationId, params.accountId);
  const rootListIds = collectActiveQuickbooksRootListIds(links);
  const window = resolveCustomerTrendWindow(
    params.period,
    financials.asOfDate,
    financials.coverage?.workerCoverageStartDate,
    financials.coverage?.workerCoverageEndDate
  );
  if (!window.ok) {
    return scrubFinancialIds({
      status: "unavailable",
      period: window.period,
      start: window.start,
      end: window.end,
      points: [],
      notes: window.notes,
      coverage: financials.coverage
    });
  }

  try {
    const rows = await loadLinkedTransactions(params.supabase, {
      organizationId: params.organizationId,
      rootListIds,
      startDate: window.start,
      endDate: window.end
    });
    const keys = monthKeysInclusive(window.start, window.end);
    return scrubFinancialIds({
      status: financials.status,
      linked: true,
      period: window.period,
      start: window.start,
      end: window.end,
      notes: window.notes,
      points: buildCustomerMonthlyPoints(rows, keys),
      coverage: financials.coverage,
      definition:
        "Monthly invoiced, collected, sales-order, and quoted amounts from prepared QuickBooks transactions for this account's exact root link. Current open A/R is not plotted as history."
    });
  } catch (err) {
    return scrubFinancialIds({
      status: "unavailable",
      period: window.period,
      points: [],
      notes: isMissingRelation(err)
        ? "Prepared QuickBooks transactions are not available yet."
        : "Customer trend could not be loaded.",
      coverage: financials.coverage
    });
  }
}

export async function getAccountDirectoryOpenInvoices(params) {
  const { page, limit, offset } = boundedPage(
    params.page,
    params.limit,
    AD_INVOICE_PAGE_DEFAULT,
    AD_INVOICE_PAGE_MAX
  );
  if (!roleHasCapability(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
  const account = await params.store.getAccount(params.organizationId, params.accountId);
  if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
  const links = await params.store.listExternalLinks(params.organizationId, params.accountId);
  const rootListIds = collectActiveQuickbooksRootListIds(links);
  if (!rootListIds.length) {
    return scrubFinancialIds({
      status: "unlinked",
      items: [],
      pagination: { page, limit, has_more: false }
    });
  }
  try {
    const openAr = await sumLinkedOpenAr(params.supabase, {
      organizationId: params.organizationId,
      rootListIds
    });
    const latest = await loadLatestSuccessfulQbSyncRun(params.supabase, params.organizationId);
    const asOf = toYmd(latest?.coverage_end_date) || toYmd(latest?.completed_at);
    const sorted = [...(openAr.rows || [])].sort((a, b) =>
      String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""))
    );
    const slice = sorted.slice(offset, offset + limit);
    return scrubFinancialIds({
      status: "ok",
      as_of: asOf,
      pagination: { page, limit, has_more: sorted.length > offset + limit },
      items: slice.map((row) => mapOpenInvoiceRow(row, asOf))
    });
  } catch (err) {
    return scrubFinancialIds({
      status: "unavailable",
      items: [],
      pagination: { page, limit, has_more: false },
      notes: isMissingRelation(err)
        ? "Open invoice facts are not available yet."
        : "Open invoices could not be loaded."
    });
  }
}

function mapAuditTimelineEvent(event) {
  return {
    id: `audit:${event.id}`,
    at: event.createdAt || event.created_at,
    family: "directory",
    type: event.action,
    source: "Account Directory",
    title: String(event.action || "Account event").replace(/_/g, " "),
    detail: Array.isArray(event.changedFields) ? event.changedFields.join(", ") : null,
    amount: null
  };
}

function mapFinancialTimelineEvent(row, index) {
  return {
    id: `qb:${row.transaction_type}:${row.transaction_date}:${index}`,
    at: toYmd(row.transaction_date),
    family: "quickbooks",
    type: row.transaction_type,
    source: "QuickBooks",
    title:
      row.transaction_type === "invoice"
        ? "Invoice"
        : row.transaction_type === "payment"
          ? "Payment"
          : row.transaction_type === "sales_order"
            ? "Sales order"
            : "Quoted",
    detail: [row.reference_number, row.customer_name].filter(Boolean).join(" · ") || null,
    amount: toMoney(row.amount)
  };
}

function mapEstimateTimelineEvent(row, source) {
  return {
    id: `${source}:${row.id}`,
    at: row.updated_at || row.created_at,
    family: "estimate",
    type: source,
    source: source === "internal_estimate" ? "Internal estimate" : "Studio estimate",
    title: row.quote_number || row.display_name || row.project_name || "Estimate",
    detail: [row.quote_status || row.status, row.customer_name].filter(Boolean).join(" · ") || null,
    amount: toMoney(row.grand_total)
  };
}

export async function getAccountDirectoryTimeline(params) {
  if (!roleHasCapability(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
  const { page, limit, offset } = boundedPage(params.page, params.limit, AD_360_PAGE_DEFAULT, AD_360_PAGE_MAX);
  const family = String(params.family || "all").trim() || "all";
  const account = await params.store.getAccount(params.organizationId, params.accountId);
  if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);

  const events = [];
  try {
    const audit = await params.store.listAuditEvents(params.organizationId, params.accountId, { limit: 100 });
    for (const row of audit || []) events.push(mapAuditTimelineEvent(row));
  } catch {
    /* fail-soft */
  }

  try {
    const links = await params.store.listExternalLinks(params.organizationId, params.accountId);
    const rootListIds = collectActiveQuickbooksRootListIds(links);
    if (rootListIds.length) {
      const txns = await loadLinkedTransactions(params.supabase, {
        organizationId: params.organizationId,
        rootListIds,
        startDate: null,
        endDate: null,
        limit: AD_HISTORY_TIMELINE_CAP
      });
      txns.forEach((row, i) => events.push(mapFinancialTimelineEvent(row, i)));
    }
  } catch {
    /* fail-soft: financial timeline omitted */
  }

  try {
    const estimates = await loadExactAccountEstimates(params.supabase, params.organizationId, params.accountId);
    for (const row of estimates.internal.items) events.push(mapEstimateTimelineEvent(row, "internal_estimate"));
    for (const row of estimates.studio.items) events.push(mapEstimateTimelineEvent(row, "studio_estimate"));
  } catch {
    /* fail-soft */
  }

  const filtered =
    family === "all" ? events : events.filter((event) => event.family === family || event.type === family);
  filtered.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const slice = filtered.slice(offset, offset + limit);
  return scrubFinancialIds({
    status: "ok",
    filter: { family },
    pagination: { page, limit, has_more: filtered.length > offset + limit },
    items: slice
  });
}

async function loadExactAccountEstimates(supabase, organizationId, accountId) {
  const empty = { state: "unavailable", items: [], notes: null };
  const internal = { ...empty };
  const studio = { ...empty };
  try {
    const { data, error } = await supabase
      .from("quote_headers")
      .select("id, quote_number, quote_status, customer_name, grand_total, updated_at, created_at, account_directory_account_id, is_current_revision")
      .eq("organization_id", organizationId)
      .eq("account_directory_account_id", accountId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    internal.state = "available";
    internal.items = data || [];
  } catch (err) {
    internal.notes = isMissingRelation(err)
      ? "Internal estimate Account Directory identity is not queryable yet."
      : "Internal estimates could not be loaded.";
  }
  try {
    const { data, error } = await supabase
      .from("studio_estimates")
      .select("id, status, revision, updated_at, created_at, account_directory_account_id")
      .eq("organization_id", organizationId)
      .eq("account_directory_account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    studio.state = "available";
    studio.items = (data || []).map((row) => ({
      ...row,
      display_name: row.revision != null ? `Revision ${row.revision}` : "Studio estimate",
      quote_status: row.status,
      grand_total: null
    }));
  } catch (err) {
    studio.notes = isMissingRelation(err)
      ? "Studio estimates are not connected to this account yet."
      : "Studio estimates could not be loaded.";
  }
  return { internal, studio };
}

async function loadAccountQbEnrichment(supabase, { organizationId, accountId, quickbooksLinked }) {
  if (quickbooksLinked) {
    return resolveAccountQbEnrichmentLabel({ quickbooksLinked: true }, null);
  }
  if (!supabase) {
    return resolveAccountQbEnrichmentLabel({ quickbooksLinked: false }, null);
  }
  try {
    const { data, error } = await supabase
      .from("ad_qb_link_suggestions")
      .select("id,status,suggested_account_id,rank_score")
      .eq("organization_id", organizationId)
      .eq("suggested_account_id", accountId)
      .in("status", ["open", "needs_review", "conflict"])
      .limit(20);
    if (error || !data?.length) {
      return resolveAccountQbEnrichmentLabel({ quickbooksLinked: false }, null);
    }
    const rank = (status) =>
      status === "conflict" ? 3 : status === "needs_review" ? 2 : status === "open" ? 1 : 0;
    const best = [...data].sort(
      (a, b) => rank(b.status) - rank(a.status) || Number(b.rank_score || 0) - Number(a.rank_score || 0)
    )[0];
    return resolveAccountQbEnrichmentLabel(
      { quickbooksLinked: false },
      { id: best.id, status: best.status }
    );
  } catch {
    return resolveAccountQbEnrichmentLabel({ quickbooksLinked: false }, null);
  }
}

export async function getAccountDirectoryRelationship(params) {
  if (!roleHasCapability(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
  const account = await params.store.getAccount(params.organizationId, params.accountId);
  if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
  const [contacts, locations, links, financials] = await Promise.all([
    params.store.listContacts(params.organizationId, params.accountId),
    params.store.listLocations(params.organizationId, params.accountId),
    params.store.listExternalLinks(params.organizationId, params.accountId),
    getAccountDirectoryFinancials(params)
  ]);
  const hasPrimaryContact = (contacts || []).some((c) => c.isPrimaryEstimating && c.isActive !== false);
  const hasPrimaryLocation = (locations || []).some((l) => l.isPrimaryAccountLocation && l.isActive !== false);
  const quickbooksLinked = collectActiveQuickbooksRootListIds(links).length > 0;
  const qbEnrichment =
    params.qbEnrichment ||
    (await loadAccountQbEnrichment(params.supabase, {
      organizationId: params.organizationId,
      accountId: params.accountId,
      quickbooksLinked
    }));
  const health = buildRelationshipHealth({
    account: {
      ...account,
      hasPrimaryContact,
      hasPrimaryLocation,
      quickbooksLinked
    },
    financials,
    qbEnrichment
  });
  const estimates = await loadExactAccountEstimates(params.supabase, params.organizationId, params.accountId);
  return scrubFinancialIds({
    health,
    estimates: {
      internal: {
        state: estimates.internal.state,
        notes: estimates.internal.notes,
        items: estimates.internal.items.map((row) => ({
          quote_number: row.quote_number || null,
          status: row.quote_status || null,
          quote_status: row.quote_status || null,
          customer_name: row.customer_name || null,
          amount: toMoney(row.grand_total),
          grand_total: toMoney(row.grand_total),
          updated_at: row.updated_at || row.created_at || null,
          is_current_revision: row.is_current_revision !== false
        }))
      },
      studio: {
        state: estimates.studio.state,
        notes: estimates.studio.notes,
        items: estimates.studio.items.map((row) => ({
          name: row.display_name || row.project_name || null,
          status: row.quote_status || row.status || null,
          updated_at: row.updated_at || row.created_at || null
        }))
      }
    },
    jobs: {
      state: "unavailable",
      notes: "Moraware job history is not connected to Account Directory yet."
    },
    quoteFlow: {
      state: "unavailable",
      notes: "Quote Flow history is not connected to Account Directory yet."
    }
  });
}

/**
 * One org-scoped open-A/R read for the current list, keyed by exact root ListID.
 */
export async function loadListFinancialIntel(supabase, { organizationId, directoryRows }) {
  const accountRoots = new Map();
  const allRoots = [];
  for (const row of directoryRows || []) {
    const roots = collectActiveQuickbooksRootListIds(row.links || []);
    if (!roots.length) continue;
    accountRoots.set(row.account.id, roots);
    allRoots.push(...roots);
  }
  const uniqueRoots = [...new Set(allRoots)];
  if (!uniqueRoots.length) {
    return { byAccount: new Map(), unavailable: false };
  }

  let asOf = null;
  try {
    const latest = await loadLatestSuccessfulQbSyncRun(supabase, organizationId);
    asOf = toYmd(latest?.coverage_end_date) || toYmd(latest?.completed_at);
  } catch (err) {
    if (isMissingRelation(err)) return { byAccount: new Map(), unavailable: true };
    return { byAccount: new Map(), unavailable: true };
  }

  /** @type {Map<string, Array<object>>} */
  const rowsByRoot = new Map();
  try {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("sales_quickbooks_open_ar_current")
        .select("balance, due_date, qb_root_customer_list_id")
        .eq("organization_id", organizationId)
        .in("qb_root_customer_list_id", uniqueRoots)
        .order("source_invoice_id", { ascending: true })
        .range(from, from + AD_FINANCIALS_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const row of rows) {
        const root = String(row.qb_root_customer_list_id || "");
        if (!rowsByRoot.has(root)) rowsByRoot.set(root, []);
        rowsByRoot.get(root).push(row);
      }
      if (rows.length < AD_FINANCIALS_PAGE_SIZE) break;
      from += AD_FINANCIALS_PAGE_SIZE;
    }
  } catch (err) {
    return { byAccount: new Map(), unavailable: true, error: isMissingRelation(err) };
  }

  const byAccount = new Map();
  for (const [accountId, roots] of accountRoots.entries()) {
    const rows = roots.flatMap((root) => rowsByRoot.get(root) || []);
    const aging = buildOpenArAging(rows, asOf);
    let openAr = 0;
    for (const row of rows) {
      const n = Number(row.balance);
      if (Number.isFinite(n) && n > 0) openAr += n;
    }
    byAccount.set(accountId, {
      openAr: Math.round(openAr * 100) / 100,
      overdue: aging.overdueBalance > 0,
      overdueBalance: aging.overdueBalance,
      collectionAttention: aging.collectionAttention?.code || "current",
      financiallyActive: rows.length > 0
    });
  }
  return { byAccount, unavailable: false };
}

export function listIntelPublic(snapshot) {
  if (!snapshot) {
    return {
      openAr: null,
      overdue: false,
      collectionAttention: null,
      financiallyActive: false
    };
  }
  return {
    openAr: snapshot.openAr,
    overdue: snapshot.overdue === true,
    collectionAttention: snapshot.collectionAttention,
    financiallyActive: snapshot.financiallyActive === true
  };
}

export { emptyFinancialsProfile, classifyArAgingBucket };

export async function getAccountDirectoryHistoryTransactions(params) {
  if (!roleHasCapability(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
  const { page, limit, offset } = boundedPage(
    params.page,
    params.limit,
    AD_HISTORY_TXN_PAGE_DEFAULT,
    AD_HISTORY_TXN_PAGE_MAX
  );
  const type = String(params.type || "all").trim() || "all";
  const account = await params.store.getAccount(params.organizationId, params.accountId);
  if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
  const links = await params.store.listExternalLinks(params.organizationId, params.accountId);
  const rootListIds = collectActiveQuickbooksRootListIds(links);
  if (!rootListIds.length) {
    return scrubFinancialIds({
      status: "unlinked",
      items: [],
      pagination: { page, limit, has_more: false }
    });
  }
  try {
    const loaded = await loadStaffSafeCustomerTransactions({
      supabase: params.supabase,
      organizationId: params.organizationId,
      rootListIds
    });
    const allowed = new Set(["estimate", "sales_order", "invoice", "payment"]);
    let rows = loaded.rows || [];
    if (type !== "all" && allowed.has(type)) {
      rows = rows.filter((row) => row.type === type);
    }
    const slice = rows.slice(offset, offset + limit);
    return scrubFinancialIds({
      status: "ok",
      filter: { type },
      pagination: { page, limit, has_more: rows.length > offset + limit },
      items: slice.map((row) => ({
        type: row.type,
        date: row.date,
        referenceNumber: row.referenceNumber,
        amount: row.amount,
        customerName: row.customerName
      }))
    });
  } catch (err) {
    return scrubFinancialIds({
      status: "unavailable",
      items: [],
      pagination: { page, limit, has_more: false },
      notes: isMissingRelation(err)
        ? "Customer history is not available yet."
        : "Customer history could not be loaded."
    });
  }
}
