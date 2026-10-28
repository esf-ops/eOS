/**
 * Jobs Command Center read model.
 *
 * One row = QuickBooks Customer:Job (ad_qb_customer_facts where is_job).
 * Money from QB mirrors; production from Moraware via exact Account Directory links only.
 * No name matching. No ListIDs / TxnIDs in browser DTOs.
 */

import { scrubAccount360Payload } from "../accountDirectory/accountDirectoryStaffSafeFinancials.mjs";
import { buildOpenArAging } from "../accountDirectory/accountDirectoryFinancialIntelligence.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "../accountDirectory/accountDirectoryQuickbooksLinkage.mjs";
import { ACCOUNT_DIRECTORY_MORAWARE_SYSTEM } from "../accountDirectory/accountDirectoryMorawareLinkage.mjs";
import {
  JOBS_COMMAND_CENTER_PAGE_DEFAULT,
  JOBS_COMMAND_CENTER_PAGE_MAX,
  PROJECT_REF_RE
} from "./jobsCommandCenterConstants.js";

const PARENT_DEPTH_MAX = 8;
const ID_CHUNK = 100;
const TXN_TYPES = Object.freeze(["Estimate", "SalesOrder", "Invoice", "ReceivePayment"]);

function pickStr(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function toMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function toYmd(v) {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function isMissingRelation(err) {
  const msg = String(err?.message ?? err ?? "");
  return /relation .* does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(msg);
}

function uniq(ids) {
  return [...new Set((ids || []).map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clampPage(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(JOBS_COMMAND_CENTER_PAGE_MAX, n);
}

function splitCustomerJob(fullName) {
  const raw = pickStr(fullName) || "";
  const idx = raw.indexOf(":");
  if (idx < 0) return { customerName: raw || null, jobName: null };
  return {
    customerName: raw.slice(0, idx).trim() || null,
    jobName: raw.slice(idx + 1).trim() || null
  };
}

function emptyFamily() {
  return { count: 0, amount: 0 };
}

function mapTxnType(type) {
  const t = String(type || "");
  if (t === "Estimate") return "estimate";
  if (t === "SalesOrder") return "sales_order";
  if (t === "Invoice") return "invoice";
  if (t === "ReceivePayment") return "payment";
  return null;
}

/**
 * Walk parent_list_id until root for each ListID.
 * @returns {Promise<Map<string, string>>} entityId → rootListId
 */
async function resolveRoots(supabase, organizationId, listIds) {
  /** @type {Map<string, string | null>} */
  const parentOf = new Map();
  let frontier = uniq(listIds);
  for (let depth = 0; frontier.length && depth < PARENT_DEPTH_MAX; depth += 1) {
    const next = [];
    for (const slice of chunks(frontier, ID_CHUNK)) {
      const { data, error } = await supabase
        .from("ad_qb_customer_facts")
        .select("qb_list_id, parent_list_id")
        .eq("organization_id", organizationId)
        .in("qb_list_id", slice);
      if (error) throw error;
      for (const r of data || []) {
        const id = pickStr(r.qb_list_id);
        if (!id) continue;
        const parent = pickStr(r.parent_list_id);
        parentOf.set(id, parent);
        if (parent && !parentOf.has(parent)) next.push(parent);
      }
    }
    frontier = uniq(next);
  }
  /** @type {Map<string, string>} */
  const rootById = new Map();
  for (const id of uniq(listIds)) {
    let cur = id;
    for (let i = 0; i < PARENT_DEPTH_MAX; i += 1) {
      const parent = parentOf.get(cur);
      if (!parent) break;
      cur = parent;
    }
    rootById.set(id, cur);
  }
  return rootById;
}

async function loadDirectoryByRoots(supabase, organizationId, rootListIds) {
  /** @type {Map<string, { id: string, name: string | null }>} */
  const byRoot = new Map();
  const roots = uniq(rootListIds);
  if (!roots.length) return byRoot;
  /** @type {Map<string, string>} */
  const accountByRoot = new Map();
  for (const slice of chunks(roots, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("account_directory_external_links")
      .select("account_id, external_id")
      .eq("organization_id", organizationId)
      .eq("external_system", ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM)
      .eq("is_active", true)
      .in("external_id", slice);
    if (error) throw error;
    for (const r of data || []) {
      const root = pickStr(r.external_id);
      const accountId = pickStr(r.account_id);
      if (root && accountId) accountByRoot.set(root, accountId);
    }
  }
  const accountIds = uniq([...accountByRoot.values()]);
  /** @type {Map<string, string | null>} */
  const nameById = new Map();
  for (const slice of chunks(accountIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("account_directory_accounts")
      .select("id, display_name")
      .eq("organization_id", organizationId)
      .in("id", slice);
    if (error) throw error;
    for (const r of data || []) nameById.set(pickStr(r.id), pickStr(r.display_name));
  }
  for (const [root, accountId] of accountByRoot) {
    byRoot.set(root, { id: accountId, name: nameById.get(accountId) ?? null });
  }
  return byRoot;
}

async function loadMorawareLinkFlags(supabase, organizationId, accountIds) {
  /** @type {Map<string, { linked: boolean, sourceAccountIds: string[] }>} */
  const out = new Map();
  const ids = uniq(accountIds);
  for (const id of ids) out.set(id, { linked: false, sourceAccountIds: [] });
  if (!ids.length) return out;
  for (const slice of chunks(ids, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("account_directory_external_links")
      .select("account_id, external_id")
      .eq("organization_id", organizationId)
      .eq("external_system", ACCOUNT_DIRECTORY_MORAWARE_SYSTEM)
      .eq("is_active", true)
      .in("account_id", slice);
    if (error) {
      if (isMissingRelation(error)) return out;
      throw error;
    }
    for (const r of data || []) {
      const accountId = pickStr(r.account_id);
      const sourceId = pickStr(r.external_id);
      if (!accountId || !sourceId) continue;
      const row = out.get(accountId) || { linked: false, sourceAccountIds: [] };
      row.linked = true;
      row.sourceAccountIds.push(sourceId);
      out.set(accountId, row);
    }
  }
  return out;
}

async function loadOpenArByListId(supabase, organizationId, listIds) {
  /** @type {Map<string, { balance: number, count: number }>} */
  const out = new Map();
  const ids = uniq(listIds);
  if (!ids.length) return out;
  try {
    for (const slice of chunks(ids, ID_CHUNK)) {
      const { data, error } = await supabase
        .from("sales_quickbooks_open_ar_current")
        .select("qb_customer_list_id, balance")
        .eq("organization_id", organizationId)
        .in("qb_customer_list_id", slice);
      if (error) throw error;
      for (const r of data || []) {
        const id = pickStr(r.qb_customer_list_id);
        const bal = toMoney(r.balance);
        if (!id || bal == null || bal <= 0) continue;
        const prev = out.get(id) || { balance: 0, count: 0 };
        prev.balance = Math.round((prev.balance + bal) * 100) / 100;
        prev.count += 1;
        out.set(id, prev);
      }
    }
  } catch (err) {
    if (isMissingRelation(err)) return out;
    throw err;
  }
  return out;
}

async function loadTxnSummariesByEntity(supabase, organizationId, listIds) {
  /** @type {Map<string, { estimates: ReturnType<typeof emptyFamily>, salesOrders: ReturnType<typeof emptyFamily>, invoices: ReturnType<typeof emptyFamily>, payments: ReturnType<typeof emptyFamily> }>} */
  const out = new Map();
  const ids = uniq(listIds);
  for (const id of ids) {
    out.set(id, {
      estimates: emptyFamily(),
      salesOrders: emptyFamily(),
      invoices: emptyFamily(),
      payments: emptyFamily()
    });
  }
  if (!ids.length) return out;
  try {
    for (const slice of chunks(ids, ID_CHUNK)) {
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("qb_finance_transaction_index")
          .select("entity_id, type, amount")
          .eq("organization_id", organizationId)
          .in("entity_id", slice)
          .in("type", TXN_TYPES)
          .range(from, from + 999);
        if (error) throw error;
        const batch = data || [];
        for (const r of batch) {
          const entityId = pickStr(r.entity_id);
          const bucket = out.get(entityId);
          if (!bucket) continue;
          const kind = mapTxnType(r.type);
          const amount = toMoney(r.amount);
          if (kind === "estimate") {
            bucket.estimates.count += 1;
            if (amount != null) bucket.estimates.amount = Math.round((bucket.estimates.amount + amount) * 100) / 100;
          } else if (kind === "sales_order") {
            bucket.salesOrders.count += 1;
            if (amount != null) bucket.salesOrders.amount = Math.round((bucket.salesOrders.amount + amount) * 100) / 100;
          } else if (kind === "invoice") {
            bucket.invoices.count += 1;
            if (amount != null) bucket.invoices.amount = Math.round((bucket.invoices.amount + amount) * 100) / 100;
          } else if (kind === "payment") {
            bucket.payments.count += 1;
            if (amount != null) bucket.payments.amount = Math.round((bucket.payments.amount + amount) * 100) / 100;
          }
        }
        if (batch.length < 1000) break;
        from += 1000;
      }
    }
  } catch (err) {
    if (isMissingRelation(err)) return out;
    throw err;
  }
  return out;
}

async function loadMorawareJobsForSourceAccounts(supabase, organizationId, sourceAccountIds) {
  const ids = uniq(sourceAccountIds);
  if (!ids.length) return { state: "empty", jobs: [] };
  const jobs = [];
  try {
    for (const slice of chunks(ids, ID_CHUNK)) {
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("brain_moraware_jobs")
          .select(
            "source_job_id, source_account_id, job_name, status_name, salesperson_name, created_at_source, install_at_source, completed_at_source, last_seen_at"
          )
          .eq("organization_id", organizationId)
          .in("source_account_id", slice)
          .order("last_seen_at", { ascending: false })
          .range(from, from + 199);
        if (error) throw error;
        const batch = data || [];
        for (const r of batch) {
          jobs.push({
            sourceJobId: pickStr(r.source_job_id),
            jobName: pickStr(r.job_name),
            statusName: pickStr(r.status_name),
            salespersonName: pickStr(r.salesperson_name),
            createdAt: pickStr(r.created_at_source),
            installAt: pickStr(r.install_at_source),
            completedAt: pickStr(r.completed_at_source),
            lastSeenAt: pickStr(r.last_seen_at)
          });
        }
        if (batch.length < 200) break;
        from += 200;
        if (from >= 400) break; // hard cap per detail response
      }
    }
    return { state: "available", jobs };
  } catch (err) {
    if (isMissingRelation(err)) return { state: "unavailable", jobs: [] };
    throw err;
  }
}

function deriveBadges({ estimates, salesOrders, invoices, openAr, morawareLinked }) {
  const badges = [];
  if (estimates.count > 0) badges.push({ code: "has_estimates", label: "Estimates" });
  if (salesOrders.count > 0) badges.push({ code: "has_sales_orders", label: "Sales orders" });
  if (invoices.count > 0) badges.push({ code: "has_invoices", label: "Invoices" });
  if (openAr > 0) badges.push({ code: "open_ar", label: "Open A/R" });
  if (morawareLinked) badges.push({ code: "moraware_account_linked", label: "Moraware account linked" });
  else badges.push({ code: "no_moraware_link", label: "No Moraware link" });
  return badges;
}

/**
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   page?: number|string,
 *   pageSize?: number|string,
 *   q?: string,
 *   bucket?: string
 * }} params
 */
export async function listJobsCommandCenterProjects(params) {
  const organizationId = pickStr(params.organizationId);
  if (!organizationId) {
    const err = new Error("organization_required");
    err.status = 403;
    err.code = "organization_required";
    throw err;
  }
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const pageSize = clampPage(params.pageSize, JOBS_COMMAND_CENTER_PAGE_DEFAULT);
  const q = pickStr(params.q);
  const bucket = pickStr(params.bucket);

  let query = params.supabase
    .from("ad_qb_customer_facts")
    .select("id, qb_list_id, parent_list_id, full_name, name, is_active, is_job, updated_at_source, synced_at", {
      count: "exact"
    })
    .eq("organization_id", organizationId)
    .eq("is_job", true)
    .order("full_name", { ascending: true });

  if (q) {
    query = query.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) {
    if (isMissingRelation(error)) {
      return scrubAccount360Payload({
        ok: true,
        projects: [],
        page,
        pageSize,
        total: 0,
        meta: { source: "ad_qb_customer_facts", unavailable: true }
      });
    }
    throw error;
  }

  const rows = data || [];
  const listIds = rows.map((r) => pickStr(r.qb_list_id)).filter(Boolean);
  const rootById = await resolveRoots(params.supabase, organizationId, listIds);
  const directoryByRoot = await loadDirectoryByRoots(params.supabase, organizationId, [...rootById.values()]);
  const accountIds = [...directoryByRoot.values()].map((a) => a.id);
  const morawareByAccount = await loadMorawareLinkFlags(params.supabase, organizationId, accountIds);
  const openArByListId = await loadOpenArByListId(params.supabase, organizationId, listIds);
  const txnByEntity = await loadTxnSummariesByEntity(params.supabase, organizationId, listIds);

  let projects = rows.map((r) => {
    const listId = pickStr(r.qb_list_id);
    const rootId = listId ? rootById.get(listId) : null;
    const account = rootId ? directoryByRoot.get(rootId) || null : null;
    const moraware = account ? morawareByAccount.get(account.id) : null;
    const txn = (listId && txnByEntity.get(listId)) || {
      estimates: emptyFamily(),
      salesOrders: emptyFamily(),
      invoices: emptyFamily(),
      payments: emptyFamily()
    };
    const openAr = (listId && openArByListId.get(listId)?.balance) || 0;
    const names = splitCustomerJob(r.full_name || r.name);
    const morawareLinked = Boolean(moraware?.linked);
    return {
      projectRef: pickStr(r.id),
      fullName: pickStr(r.full_name) || pickStr(r.name),
      customerName: names.customerName,
      jobName: names.jobName,
      isActive: r.is_active !== false,
      account: account ? { id: account.id, name: account.name } : null,
      directoryLinked: Boolean(account),
      morawareAccountLinked: morawareLinked,
      morawareJobLinked: false, // job-level handoff not shipped yet
      openAr,
      estimates: txn.estimates,
      salesOrders: txn.salesOrders,
      invoices: txn.invoices,
      payments: txn.payments,
      badges: deriveBadges({
        estimates: txn.estimates,
        salesOrders: txn.salesOrders,
        invoices: txn.invoices,
        openAr,
        morawareLinked
      }),
      syncedAt: pickStr(r.synced_at),
      updatedAtSource: pickStr(r.updated_at_source)
    };
  });

  if (bucket === "not_in_directory") {
    projects = projects.filter((p) => !p.directoryLinked);
  } else if (bucket === "in_directory") {
    projects = projects.filter((p) => p.directoryLinked);
  } else if (bucket === "moraware_related") {
    projects = projects.filter((p) => p.morawareAccountLinked);
  } else if (bucket === "no_moraware") {
    projects = projects.filter((p) => !p.morawareAccountLinked);
  }

  return scrubAccount360Payload({
    ok: true,
    projects,
    page,
    pageSize,
    total: typeof count === "number" ? count : projects.length,
    meta: {
      source: "ad_qb_customer_facts",
      note: "One row per QuickBooks Customer:Job. Moraware shows account-level link only until sold-job handoff ships.",
      filtersApplied: { q: q || null, bucket: bucket || null }
    }
  });
}

/**
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   projectRef: string
 * }} params
 */
export async function getJobsCommandCenterProject(params) {
  const organizationId = pickStr(params.organizationId);
  const projectRef = pickStr(params.projectRef);
  if (!organizationId) {
    const err = new Error("organization_required");
    err.status = 403;
    err.code = "organization_required";
    throw err;
  }
  if (!projectRef || !PROJECT_REF_RE.test(projectRef)) {
    const err = new Error("invalid_project_ref");
    err.status = 400;
    err.code = "invalid_project_ref";
    throw err;
  }

  const { data: fact, error } = await params.supabase
    .from("ad_qb_customer_facts")
    .select("id, qb_list_id, parent_list_id, full_name, name, is_active, is_job, updated_at_source, synced_at")
    .eq("organization_id", organizationId)
    .eq("id", projectRef)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) {
      const err = new Error("not_found");
      err.status = 404;
      err.code = "not_found";
      throw err;
    }
    throw error;
  }
  if (!fact || fact.is_job !== true) {
    const err = new Error("not_found");
    err.status = 404;
    err.code = "not_found";
    throw err;
  }

  const listId = pickStr(fact.qb_list_id);
  const rootById = await resolveRoots(params.supabase, organizationId, listId ? [listId] : []);
  const rootId = listId ? rootById.get(listId) : null;
  const directoryByRoot = await loadDirectoryByRoots(params.supabase, organizationId, rootId ? [rootId] : []);
  const account = rootId ? directoryByRoot.get(rootId) || null : null;
  const morawareFlags = account
    ? await loadMorawareLinkFlags(params.supabase, organizationId, [account.id])
    : new Map();
  const morawareMeta = account ? morawareFlags.get(account.id) : null;

  /** @type {Array<{ id: string, type: string, referenceNumber: string|null, date: string|null, amount: number|null }>} */
  const transactions = [];
  if (listId) {
    try {
      let from = 0;
      for (;;) {
        const { data, error: txnErr } = await params.supabase
          .from("qb_finance_transaction_index")
          .select("id, type, reference_number, txn_date, amount")
          .eq("organization_id", organizationId)
          .eq("entity_id", listId)
          .in("type", TXN_TYPES)
          .order("txn_date", { ascending: false })
          .range(from, from + 199);
        if (txnErr) throw txnErr;
        const batch = data || [];
        for (const r of batch) {
          const kind = mapTxnType(r.type);
          if (!kind) continue;
          transactions.push({
            id: pickStr(r.id),
            type: kind,
            referenceNumber: pickStr(r.reference_number),
            date: toYmd(r.txn_date),
            amount: toMoney(r.amount)
          });
        }
        if (batch.length < 200) break;
        from += 200;
        if (from >= 600) break;
      }
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
    }
  }

  const summaries = {
    estimates: emptyFamily(),
    salesOrders: emptyFamily(),
    invoices: emptyFamily(),
    payments: emptyFamily()
  };
  for (const t of transactions) {
    const fam =
      t.type === "estimate"
        ? summaries.estimates
        : t.type === "sales_order"
          ? summaries.salesOrders
          : t.type === "invoice"
            ? summaries.invoices
            : summaries.payments;
    fam.count += 1;
    if (t.amount != null) fam.amount = Math.round((fam.amount + t.amount) * 100) / 100;
  }

  /** @type {Array<{ balance: number, dueDate: string|null, referenceNumber: string|null }>} */
  let openArRows = [];
  if (listId) {
    try {
      const { data, error: arErr } = await params.supabase
        .from("sales_quickbooks_open_ar_current")
        .select("balance, due_date, reference_number")
        .eq("organization_id", organizationId)
        .eq("qb_customer_list_id", listId);
      if (arErr) throw arErr;
      openArRows = (data || [])
        .map((r) => ({
          balance: toMoney(r.balance) || 0,
          dueDate: toYmd(r.due_date),
          referenceNumber: pickStr(r.reference_number)
        }))
        .filter((r) => r.balance > 0);
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
    }
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const agingBuilt = buildOpenArAging(
    openArRows.map((r) => ({ balance: r.balance, due_date: r.dueDate })),
    asOf
  );

  const moraware = morawareMeta?.linked
    ? await loadMorawareJobsForSourceAccounts(params.supabase, organizationId, morawareMeta.sourceAccountIds)
    : { state: "not_linked", jobs: [] };

  const names = splitCustomerJob(fact.full_name || fact.name);
  const openAr = openArRows.reduce((s, r) => s + r.balance, 0);

  return scrubAccount360Payload({
    ok: true,
    project: {
      projectRef: pickStr(fact.id),
      fullName: pickStr(fact.full_name) || pickStr(fact.name),
      customerName: names.customerName,
      jobName: names.jobName,
      isActive: fact.is_active !== false,
      account: account ? { id: account.id, name: account.name } : null,
      directoryLinked: Boolean(account),
      morawareAccountLinked: Boolean(morawareMeta?.linked),
      morawareJobLinked: false,
      syncedAt: pickStr(fact.synced_at),
      updatedAtSource: pickStr(fact.updated_at_source),
      ownership: {
        money: "quickbooks",
        production: "moraware",
        identity: "account_directory"
      },
      badges: deriveBadges({
        estimates: summaries.estimates,
        salesOrders: summaries.salesOrders,
        invoices: summaries.invoices,
        openAr,
        morawareLinked: Boolean(morawareMeta?.linked)
      }),
      quickbooks: {
        summaries,
        transactions,
        openAr: {
          total: Math.round(openAr * 100) / 100,
          invoiceCount: openArRows.length,
          aging: {
            collectionAttention: agingBuilt.collectionAttention,
            buckets: agingBuilt.aging,
            overdueBalance: agingBuilt.overdueBalance,
            overdueInvoiceCount: agingBuilt.overdueInvoiceCount
          },
          rows: openArRows
        }
      },
      moraware: {
        linkState: moraware.state,
        note:
          moraware.state === "not_linked"
            ? "No Moraware account linked on this customer in Account Directory."
            : moraware.state === "unavailable"
              ? "Moraware job history is temporarily unavailable."
              : "Related Moraware jobs on the linked account (not a proven 1:1 job handoff yet).",
        jobs: moraware.jobs
      }
    }
  });
}
