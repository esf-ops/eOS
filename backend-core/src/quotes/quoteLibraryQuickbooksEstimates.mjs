/**
 * Quote Library — QuickBooks estimates (read-only).
 *
 * List / summary / export: qb_finance_transaction_index Estimate header rows
 * (txn_line_id = ''), the finance ODBC lane with the widest current coverage.
 * Line items: brain_quickbooks_estimates.raw_payload (SDK snapshot) — read
 * server-side only and projected into a line DTO.
 * Customer links: entity_id → ad_qb_customer_facts parent chain → exact
 * active quickbooks_desktop root link in account_directory_external_links.
 * Never joins by name.
 *
 * DTOs never carry QuickBooks TxnIDs, ListIDs, TxnLineIDs, memos or raw
 * payloads. The browser-facing id is the finance index row uuid.
 * A Customer:Job is a container: rows sharing one are listed, never treated
 * as revisions of each other or as proof of a sold job.
 */

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { loadExactLinkedCustomerListIds } from "../accountDirectory/accountDirectoryCustomerHistory.mjs";
import { evaluateOrganizationFeeds } from "../integrationHealth/integrationFeedFreshness.mjs";
import { unwrapQbScalar } from "../quickbooks/quickBooksStaging.js";
import { parseQbMoney } from "../quickbooks/quickBooksIntelligenceFacts.js";

export const QB_ESTIMATE_PAGE_DEFAULT = 50;
export const QB_ESTIMATE_PAGE_MAX = 100;
export const QB_ESTIMATE_EXPORT_MAX = 10000;
export const QB_ESTIMATE_SUMMARY_SCAN_MAX = 25000;
export const QB_ESTIMATE_ACCOUNT_ROW_MAX = 5000;
export const QB_ESTIMATE_CONTAINER_MAX = 50;
export const QB_FRESHNESS_FEED_KEYS = Object.freeze(["qb_finance_sync", "qb_customer_sync"]);

const FETCH_PAGE = 1000;
const ID_CHUNK = 150;
const PARENT_DEPTH_MAX = 8;
const HEADER_COLS = "id, txn_date, reference_number, entity_name, entity_id, amount, synced_at";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const QB_ESTIMATE_SORTS = Object.freeze({
  date_desc: [["txn_date", false], ["reference_number", false]],
  date_asc: [["txn_date", true], ["reference_number", true]],
  amount_desc: [["amount", false], ["txn_date", false]],
  amount_asc: [["amount", true], ["txn_date", false]],
  number_desc: [["reference_number", false], ["txn_date", false]],
  number_asc: [["reference_number", true], ["txn_date", false]]
});

function pickStr(v) {
  return v == null ? "" : String(v).trim();
}

function toMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function toYmd(value) {
  const s = pickStr(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function uniq(values) {
  return [...new Set((values || []).map((v) => pickStr(v)).filter(Boolean))];
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function isMissingRelation(err) {
  return /relation .* does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(
    String(err?.message ?? err ?? "")
  );
}

/** PostgREST `or()` reserved characters and LIKE wildcards are stripped; the value is quoted when applied. */
export function sanitizeSearch(raw) {
  return pickStr(raw)
    .replace(/["\\,()*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * @param {Record<string, unknown>} query
 * @returns {{ filters: { q: string, from: string|null, to: string|null, minAmount: number|null, maxAmount: number|null, accountId: string|null, sort: string } | null, error: string | null }}
 */
export function parseEstimateFilters(query = {}) {
  const from = pickStr(query.from);
  const to = pickStr(query.to);
  const account = pickStr(query.account);
  const sort = pickStr(query.sort) || "date_desc";
  const amount = (v) => {
    const s = pickStr(v);
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };
  const minAmount = amount(query.min_amount);
  const maxAmount = amount(query.max_amount);
  if (from && !YMD.test(from)) return { filters: null, error: "from must be YYYY-MM-DD" };
  if (to && !YMD.test(to)) return { filters: null, error: "to must be YYYY-MM-DD" };
  if (Number.isNaN(minAmount) || Number.isNaN(maxAmount)) return { filters: null, error: "amount filters must be numbers" };
  if (account && !UUID.test(account)) return { filters: null, error: "account must be an Account Directory id" };
  if (!QB_ESTIMATE_SORTS[sort]) return { filters: null, error: "unsupported sort" };
  return {
    filters: {
      q: sanitizeSearch(query.q),
      from: from || null,
      to: to || null,
      minAmount,
      maxAmount,
      accountId: account || null,
      sort
    },
    error: null
  };
}

function applyHeaderFilters(q, organizationId, f) {
  let out = q.eq("organization_id", organizationId).eq("txn_type", "Estimate").eq("txn_line_id", "");
  if (f.from) out = out.gte("txn_date", f.from);
  if (f.to) out = out.lte("txn_date", f.to);
  if (f.minAmount != null) out = out.gte("amount", f.minAmount);
  if (f.maxAmount != null) out = out.lte("amount", f.maxAmount);
  if (f.q) {
    const v = `"*${f.q}*"`;
    out = out.or(`reference_number.ilike.${v},entity_name.ilike.${v}`);
  }
  return out;
}

function applySort(q, sort) {
  let out = q;
  for (const [col, ascending] of QB_ESTIMATE_SORTS[sort] || QB_ESTIMATE_SORTS.date_desc) {
    out = out.order(col, { ascending, nullsFirst: false });
  }
  return out.order("id", { ascending: true });
}

function compareRows(sort) {
  const keys = QB_ESTIMATE_SORTS[sort] || QB_ESTIMATE_SORTS.date_desc;
  return (a, b) => {
    for (const [col, ascending] of keys) {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = col === "amount" ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
      if (cmp !== 0) return ascending ? cmp : -cmp;
    }
    return String(a.id).localeCompare(String(b.id));
  };
}

/** QuickBooks FullName "Customer:Job[:Sub]" → container parts. Display only; links never use names. */
export function splitCustomerJob(fullName) {
  const full = pickStr(fullName);
  const idx = full.indexOf(":");
  return idx >= 0
    ? { customerName: full.slice(0, idx), jobName: full.slice(idx + 1) || null }
    : { customerName: full || null, jobName: null };
}

/**
 * @param {Record<string, unknown>} row finance index header row
 * @param {Map<string, { id: string, name: string | null }>} links entity_id → account
 */
export function toEstimateHeaderDto(row, links) {
  const { customerName, jobName } = splitCustomerJob(row.entity_name);
  const account = links.get(pickStr(row.entity_id)) ?? null;
  return {
    id: pickStr(row.id),
    estimateNumber: pickStr(row.reference_number) || null,
    date: toYmd(row.txn_date),
    customerJob: pickStr(row.entity_name) || null,
    customerName,
    jobName,
    amount: toMoney(row.amount),
    account: account ? { id: account.id, name: account.name } : null,
    syncedAt: pickStr(row.synced_at) || null
  };
}

/**
 * Exact links only: walk ad_qb_customer_facts parents to the root ListID, then match an active
 * quickbooks_desktop external link. Unknown ListIDs are treated as their own root.
 * @returns {Promise<{ links: Map<string, { id: string, name: string | null }>, linksUnavailable: boolean }>}
 */
export async function resolveAccountLinks(supabase, organizationId, entityIds) {
  const ids = uniq(entityIds);
  const links = new Map();
  if (!ids.length) return { links, linksUnavailable: false };
  /** @type {Map<string, string | null>} */
  const parentOf = new Map();
  try {
    let frontier = ids;
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
          const parent = pickStr(r.parent_list_id) || null;
          parentOf.set(id, parent);
          if (parent && !parentOf.has(parent)) next.push(parent);
        }
      }
      frontier = uniq(next);
    }
  } catch (err) {
    if (isMissingRelation(err)) return { links, linksUnavailable: true };
    throw err;
  }
  const rootOf = (id) => {
    let cur = id;
    for (let i = 0; i < PARENT_DEPTH_MAX; i += 1) {
      const parent = parentOf.get(cur);
      if (!parent) return cur;
      cur = parent;
    }
    return cur;
  };
  const rootByEntity = new Map(ids.map((id) => [id, rootOf(id)]));
  const roots = uniq([...rootByEntity.values()]);
  /** @type {Map<string, string>} */
  const accountByRoot = new Map();
  for (const slice of chunks(roots, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("account_directory_external_links")
      .select("account_id, external_id")
      .eq("organization_id", organizationId)
      .eq("external_system", "quickbooks_desktop")
      .eq("is_active", true)
      .in("external_id", slice);
    if (error) throw error;
    for (const r of data || []) accountByRoot.set(pickStr(r.external_id), pickStr(r.account_id));
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
    for (const r of data || []) nameById.set(pickStr(r.id), pickStr(r.display_name) || null);
  }
  for (const [entityId, root] of rootByEntity) {
    const accountId = accountByRoot.get(root);
    if (accountId && nameById.has(accountId)) links.set(entityId, { id: accountId, name: nameById.get(accountId) ?? null });
  }
  return { links, linksUnavailable: false };
}

/** Descendant ListIDs for an Account Directory account's exact QuickBooks root links. */
export async function loadAccountEntityIds(supabase, organizationId, accountId) {
  const { data, error } = await supabase
    .from("account_directory_external_links")
    .select("external_id")
    .eq("organization_id", organizationId)
    .eq("account_id", accountId)
    .eq("external_system", "quickbooks_desktop")
    .eq("is_active", true);
  if (error) throw error;
  const roots = uniq((data || []).map((r) => r.external_id));
  if (!roots.length) return { entityIds: [], linked: false };
  const { listIds } = await loadExactLinkedCustomerListIds(supabase, organizationId, roots);
  return { entityIds: uniq(listIds), linked: true };
}

async function loadAccountRows(supabase, organizationId, filters, entityIds) {
  const rows = [];
  for (const slice of chunks(entityIds, ID_CHUNK)) {
    for (let from = 0; ; from += FETCH_PAGE) {
      const q = applyHeaderFilters(supabase.from("qb_finance_transaction_index").select(HEADER_COLS), organizationId, filters)
        .in("entity_id", slice)
        .order("id", { ascending: true })
        .range(from, from + FETCH_PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...(data || []));
      if (rows.length > QB_ESTIMATE_ACCOUNT_ROW_MAX) return { rows: rows.slice(0, QB_ESTIMATE_ACCOUNT_ROW_MAX), truncated: true };
      if (!data || data.length < FETCH_PAGE) break;
    }
  }
  rows.sort(compareRows(filters.sort));
  return { rows, truncated: false };
}

/** Oldest/newest sync time across the selected rows: totals are only as current as the oldest row. */
function syncedRange(rows, range = { syncedFrom: null, syncedThrough: null }) {
  for (const r of rows) {
    const s = pickStr(r.synced_at);
    if (!s) continue;
    if (!range.syncedFrom || s < range.syncedFrom) range.syncedFrom = s;
    if (!range.syncedThrough || s > range.syncedThrough) range.syncedThrough = s;
  }
  return range;
}

async function scanValue(supabase, organizationId, filters, expectedCount) {
  let value = 0;
  let scanned = 0;
  const range = { syncedFrom: null, syncedThrough: null };
  for (let from = 0; from < QB_ESTIMATE_SUMMARY_SCAN_MAX; from += FETCH_PAGE) {
    const { data, error } = await applyHeaderFilters(
      supabase.from("qb_finance_transaction_index").select("amount, synced_at"),
      organizationId,
      filters
    )
      .order("id", { ascending: true })
      .range(from, Math.min(from + FETCH_PAGE, QB_ESTIMATE_SUMMARY_SCAN_MAX) - 1);
    if (error) throw error;
    for (const r of data || []) value += Number(r.amount) || 0;
    syncedRange(data || [], range);
    scanned += (data || []).length;
    if (!data || data.length < FETCH_PAGE) break;
  }
  return { value: Math.round(value * 100) / 100, complete: expectedCount == null || scanned >= expectedCount, ...range };
}

function summarize(rows) {
  const value = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { count: rows.length, value: Math.round(value * 100) / 100, valueComplete: true, ...syncedRange(rows) };
}

/**
 * @returns {Promise<{ rows: object[], total: number, summary: { count: number, value: number | null, valueComplete: boolean, syncedFrom: string | null, syncedThrough: string | null }, accountLinked: boolean | null, truncated: boolean, linksUnavailable: boolean }>}
 */
export async function listQuickbooksEstimates(supabase, organizationId, filters, { limit = QB_ESTIMATE_PAGE_DEFAULT, offset = 0 } = {}) {
  const pageLimit = Math.min(QB_ESTIMATE_PAGE_MAX, Math.max(1, limit));
  const pageOffset = Math.max(0, offset);
  if (filters.accountId) {
    const { entityIds, linked } = await loadAccountEntityIds(supabase, organizationId, filters.accountId);
    if (!entityIds.length) {
      return {
        rows: [],
        total: 0,
        summary: { count: 0, value: 0, valueComplete: true, syncedFrom: null, syncedThrough: null },
        accountLinked: linked,
        truncated: false,
        linksUnavailable: false
      };
    }
    const { rows, truncated } = await loadAccountRows(supabase, organizationId, filters, entityIds);
    const page = rows.slice(pageOffset, pageOffset + pageLimit);
    const { links, linksUnavailable } = await resolveAccountLinks(supabase, organizationId, page.map((r) => r.entity_id));
    return {
      rows: page.map((r) => toEstimateHeaderDto(r, links)),
      total: rows.length,
      summary: { ...summarize(rows), valueComplete: !truncated },
      accountLinked: true,
      truncated,
      linksUnavailable
    };
  }

  const { data, error, count } = await applySort(
    applyHeaderFilters(
      supabase.from("qb_finance_transaction_index").select(HEADER_COLS, { count: "exact" }),
      organizationId,
      filters
    ),
    filters.sort
  ).range(pageOffset, pageOffset + pageLimit - 1);
  if (error) throw error;
  const total = Number(count) || 0;
  const { value, complete, syncedFrom, syncedThrough } = await scanValue(supabase, organizationId, filters, total);
  const page = data || [];
  const { links, linksUnavailable } = await resolveAccountLinks(supabase, organizationId, page.map((r) => r.entity_id));
  return {
    rows: page.map((r) => toEstimateHeaderDto(r, links)),
    total,
    summary: { count: total, value: complete ? value : null, valueComplete: complete, syncedFrom, syncedThrough },
    accountLinked: null,
    truncated: false,
    linksUnavailable
  };
}

function qbText(v) {
  const s = unwrapQbScalar(v);
  return typeof s === "string" || typeof s === "number" ? pickStr(s) || null : null;
}

function qbNumber(v) {
  const n = parseQbMoney(v);
  return n == null ? null : Math.round(n * 10000) / 10000;
}

function qbMoney(v) {
  return toMoney(parseQbMoney(v));
}

function lineDto(l, inGroup) {
  return {
    kind: "item",
    item: qbText(l?.ItemRef?.FullName),
    description: qbText(l?.Desc),
    quantity: qbNumber(l?.Quantity),
    rate: qbMoney(l?.Rate ?? l?.RatePercent),
    amount: qbMoney(l?.Amount),
    className: qbText(l?.ClassRef?.FullName),
    inGroup: Boolean(inGroup)
  };
}

/** SDK EstimateRet → line DTOs. Groups precede their member lines; ids and tax-code refs are dropped. */
export function extractEstimateLines(payload) {
  const lines = asArray(payload?.EstimateLineRet).map((l) => lineDto(l, false));
  for (const g of asArray(payload?.EstimateLineGroupRet)) {
    lines.push({
      kind: "group",
      item: qbText(g?.ItemGroupRef?.FullName),
      description: qbText(g?.Desc),
      quantity: qbNumber(g?.Quantity),
      rate: null,
      amount: qbMoney(g?.TotalAmount),
      className: null,
      inGroup: false
    });
    for (const l of asArray(g?.EstimateLineRet)) lines.push(lineDto(l, true));
  }
  return lines.filter((l) => l.item || l.description || l.amount != null || l.quantity != null);
}

export const QB_CONTAINER_TYPES = Object.freeze({ Estimate: "estimate", SalesOrder: "sales_order" });

/**
 * Other transactions in the same Customer:Job container. Sums cover listed rows only.
 * @param {Record<string, unknown>[]} rows finance index headers (Estimate / SalesOrder)
 * @param {string} excludeId
 */
export function buildContainerSummary(rows, excludeId, max = QB_ESTIMATE_CONTAINER_MAX) {
  const others = rows.filter((r) => pickStr(r.id) !== excludeId);
  const listed = others.slice(0, max).map((r) => {
    const type = QB_CONTAINER_TYPES[pickStr(r.txn_type)] || null;
    return {
      id: type === "estimate" ? pickStr(r.id) : null,
      type,
      number: pickStr(r.reference_number) || null,
      date: toYmd(r.txn_date),
      amount: toMoney(r.amount)
    };
  });
  const sum = (t) => Math.round(listed.filter((r) => r.type === t).reduce((s, r) => s + (r.amount || 0), 0) * 100) / 100;
  return {
    rows: listed,
    truncated: others.length > max,
    estimates: { count: listed.filter((r) => r.type === "estimate").length, value: sum("estimate") },
    salesOrders: { count: listed.filter((r) => r.type === "sales_order").length, value: sum("sales_order") }
  };
}

/**
 * Snapshot lines are never reported as current. A matching total does not confirm the details, and the
 * finance index TimeModified is not the estimate's TimeModified (it lags it for most rows), so it
 * cannot prove "unchanged since snapshot" either.
 * @returns {"not_in_snapshot" | "snapshot_total_differs" | "snapshot_total_matches"}
 */
export function classifySnapshotLines({ snapshotPresent, headerAmount, snapshotTotal }) {
  if (!snapshotPresent) return "not_in_snapshot";
  if (headerAmount == null || snapshotTotal == null || Math.abs(headerAmount - snapshotTotal) > 0.005) {
    return "snapshot_total_differs";
  }
  return "snapshot_total_matches";
}

export async function getQuickbooksEstimateDetail(supabase, organizationId, id) {
  if (!UUID.test(pickStr(id))) return null;
  const { data: hdrRows, error } = await supabase
    .from("qb_finance_transaction_index")
    .select(`${HEADER_COLS}, qb_txn_id`)
    .eq("organization_id", organizationId)
    .eq("txn_type", "Estimate")
    .eq("txn_line_id", "")
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  const header = (hdrRows || [])[0];
  if (!header) return null;

  const { links, linksUnavailable } = await resolveAccountLinks(supabase, organizationId, [header.entity_id]);

  let snapshot = null;
  const snap = await supabase
    .from("brain_quickbooks_estimates")
    .select("raw_payload, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("qb_txn_id", header.qb_txn_id)
    .limit(1);
  if (snap.error && !isMissingRelation(snap.error)) throw snap.error;
  const snapRow = (snap.data || [])[0];
  if (snapRow) {
    const p = snapRow.raw_payload || {};
    snapshot = {
      capturedAt: snapRow.last_seen_at || null,
      qbModifiedAt: qbText(p.TimeModified),
      subtotal: qbMoney(p.Subtotal),
      salesTaxTotal: qbMoney(p.SalesTaxTotal),
      total: qbMoney(p.TotalAmount),
      lines: extractEstimateLines(p)
    };
  }
  const linesStatus = classifySnapshotLines({
    snapshotPresent: Boolean(snapshot),
    headerAmount: toMoney(header.amount),
    snapshotTotal: snapshot?.total ?? null
  });

  let container = null;
  if (pickStr(header.entity_id)) {
    const c = await supabase
      .from("qb_finance_transaction_index")
      .select("id, txn_type, txn_date, reference_number, amount")
      .eq("organization_id", organizationId)
      .eq("entity_id", header.entity_id)
      .in("txn_type", Object.keys(QB_CONTAINER_TYPES))
      .eq("txn_line_id", "")
      .order("txn_date", { ascending: false })
      .order("id", { ascending: true })
      .limit(QB_ESTIMATE_CONTAINER_MAX + 2);
    if (c.error) throw c.error;
    container = buildContainerSummary(c.data || [], pickStr(header.id));
  }

  return {
    estimate: toEstimateHeaderDto(header, links),
    linesStatus,
    snapshot,
    container,
    linksUnavailable
  };
}

/**
 * Flipped only by a reviewed change once CData is activated, the QuickBooks feeds have caught up and
 * selected-period totals reconcile with QuickBooks reports. Until then the library is never "current".
 */
export const QB_ESTIMATES_REPORTING_SIGNED_OFF = false;

function utcStamp(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function buildReportingStatus({ feeds, signedOff = QB_ESTIMATES_REPORTING_SIGNED_OFF, refreshWindowStart = null, olderRowsLastRefreshedAt = null }) {
  const reasons = [];
  for (const f of feeds) {
    if (f.state !== "fresh") {
      reasons.push(
        f.lastSuccessAt
          ? `${f.label} has not succeeded since ${utcStamp(f.lastSuccessAt)}.`
          : `${f.label} has no successful run.`
      );
    }
  }
  if (refreshWindowStart) {
    reasons.push(
      `Estimates dated before ${refreshWindowStart} are outside the sync's rolling refresh window${
        olderRowsLastRefreshedAt ? ` (some last refreshed ${utcStamp(olderRowsLastRefreshedAt)})` : ""
      }; later edits to them are not reflected.`
    );
  }
  if (!signedOff) {
    reasons.push("CData activation, feed catch-up and selected-period reconciliation with QuickBooks reports have not been signed off.");
  }
  const current = signedOff && feeds.length > 0 && feeds.every((f) => f.state === "fresh");
  return { current, label: current ? "Current" : "Not current reporting", reasons };
}

export async function getQuickbooksEstimateFreshness(supabase, organizationId, { now = new Date(), env = process.env } = {}) {
  const evaluation = await evaluateOrganizationFeeds(supabase, organizationId, { now, env });
  const feeds = evaluation.feeds
    .filter((f) => QB_FRESHNESS_FEED_KEYS.includes(f.key))
    .map((f) => ({
      key: f.key,
      label: f.label,
      state: f.state,
      lastSuccessAt: f.last_success_at,
      ageHours: f.age_hours,
      thresholdHours: f.threshold_hours
    }));
  const edge = async (table, col, ascending, extra) => {
    let q = supabase.from(table).select(col).eq("organization_id", organizationId).not(col, "is", null);
    q = extra ? extra(q) : q;
    const { data, error } = await q.order(col, { ascending }).limit(1);
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    return (data || [])[0]?.[col] ?? null;
  };
  const estimateOnly = (q) => q.eq("txn_type", "Estimate").eq("txn_line_id", "");
  const latestAccountingRun = async () => {
    const { data, error } = await supabase
      .from("qb_finance_sync_runs")
      .select("coverage_start_date")
      .eq("organization_id", organizationId)
      .eq("domain", "accounting")
      .eq("status", "success")
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    return toYmd((data || [])[0]?.coverage_start_date);
  };
  const [from, through, lastSynced, oldestSynced, snapshotAt, snapshotThrough, refreshWindowStart] = await Promise.all([
    edge("qb_finance_transaction_index", "txn_date", true, estimateOnly),
    edge("qb_finance_transaction_index", "txn_date", false, estimateOnly),
    edge("qb_finance_transaction_index", "synced_at", false, estimateOnly),
    edge("qb_finance_transaction_index", "synced_at", true, estimateOnly),
    edge("brain_quickbooks_estimates", "last_seen_at", false),
    edge("brain_quickbooks_estimates", "txn_date", false),
    latestAccountingRun()
  ]);
  return {
    checkedAt: now.toISOString(),
    feeds,
    estimates: {
      from: toYmd(from),
      through: toYmd(through),
      lastSyncedAt: lastSynced,
      refreshWindowStart,
      olderRowsLastRefreshedAt: oldestSynced
    },
    lineItems: { snapshotAt, through: toYmd(snapshotThrough) },
    reporting: buildReportingStatus({ feeds, refreshWindowStart, olderRowsLastRefreshedAt: oldestSynced })
  };
}

const CSV_COLUMNS = Object.freeze([
  ["Estimate #", (r) => r.estimateNumber],
  ["Date", (r) => r.date],
  ["Customer", (r) => r.customerName],
  ["Job", (r) => r.jobName],
  ["Customer:Job", (r) => r.customerJob],
  ["Amount", (r) => (r.amount == null ? "" : r.amount.toFixed(2))],
  ["Account Directory account", (r) => r.account?.name ?? ""],
  ["Last synced from QuickBooks", (r) => r.syncedAt ?? ""]
]);

/** RFC 4180 quoting plus a leading apostrophe on spreadsheet formula prefixes. */
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function estimatesToCsv(rows) {
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export async function exportQuickbooksEstimates(supabase, organizationId, filters) {
  let raw = [];
  let truncated = false;
  if (filters.accountId) {
    const { entityIds } = await loadAccountEntityIds(supabase, organizationId, filters.accountId);
    if (entityIds.length) {
      const res = await loadAccountRows(supabase, organizationId, filters, entityIds);
      raw = res.rows;
      truncated = res.truncated;
    }
  } else {
    for (let from = 0; from < QB_ESTIMATE_EXPORT_MAX; from += FETCH_PAGE) {
      const { data, error } = await applySort(
        applyHeaderFilters(supabase.from("qb_finance_transaction_index").select(HEADER_COLS), organizationId, filters),
        filters.sort
      ).range(from, Math.min(from + FETCH_PAGE, QB_ESTIMATE_EXPORT_MAX) - 1);
      if (error) throw error;
      raw.push(...(data || []));
      if (!data || data.length < FETCH_PAGE) break;
      if (raw.length >= QB_ESTIMATE_EXPORT_MAX) truncated = true;
    }
  }
  const rows = [];
  for (const slice of chunks(raw, FETCH_PAGE)) {
    const { links } = await resolveAccountLinks(supabase, organizationId, slice.map((r) => r.entity_id));
    rows.push(...slice.map((r) => toEstimateHeaderDto(r, links)));
  }
  const { syncedFrom, syncedThrough } = syncedRange(raw);
  return { csv: estimatesToCsv(rows), rowCount: rows.length, truncated, syncedFrom, syncedThrough };
}

/** QuickBooks financial rows require the caller's own resolvable profile organization; the default-organization fallback is not accepted. */
export async function defaultResolveOrganizationId(req, supabase) {
  const ctx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
  if (ctx?.source !== "user_profile") return null;
  return ctx.organizationId || null;
}

/**
 * @param {import("express").Express} app
 * @param {{ stack: Function[], getSupabase: () => any, logAction?: Function, resolveOrganizationId?: (req: any, supabase: any) => Promise<string | null>, now?: () => Date }} deps
 */
export function attachQuoteLibraryQuickbooksRoutes(app, deps) {
  const { stack, getSupabase, logAction, resolveOrganizationId = defaultResolveOrganizationId, now = () => new Date() } = deps;
  if (!Array.isArray(stack) || stack.length === 0) throw new Error("QuickBooks estimate routes require the Quote Library auth stack");

  /** Per-instance guard against repeated export clicks; the browser also blocks resubmission. */
  const exportsInFlight = new Set();

  async function withOrg(req, res) {
    const db = getSupabase();
    const orgId = await resolveOrganizationId(req, db);
    if (!orgId) {
      res.status(403).json({ ok: false, error: "No organization context", code: "organization_required" });
      return null;
    }
    return { db, orgId };
  }

  function fail(res, route, err) {
    console.error(JSON.stringify({ quote_library_qb_estimates_error: true, route, message: String(err?.message || err) }));
    res.status(500).json({ ok: false, error: "QuickBooks estimates are unavailable right now.", code: "qb_estimates_unavailable" });
  }

  app.get("/api/quote-library/quickbooks/estimates", ...stack, async (req, res) => {
    try {
      const { filters, error } = parseEstimateFilters(req.query);
      if (error) return res.status(400).json({ ok: false, error, code: "invalid_filter" });
      const ctx = await withOrg(req, res);
      if (!ctx) return;
      const limit = Number.parseInt(pickStr(req.query.limit), 10) || QB_ESTIMATE_PAGE_DEFAULT;
      const offset = Number.parseInt(pickStr(req.query.offset), 10) || 0;
      const result = await listQuickbooksEstimates(ctx.db, ctx.orgId, filters, { limit, offset });
      res.json({ ok: true, source: "quickbooks_finance_index", filters, ...result });
    } catch (err) {
      fail(res, "list", err);
    }
  });

  app.get("/api/quote-library/quickbooks/estimates/export", ...stack, async (req, res) => {
    const guardKey = pickStr(req.user?.id);
    if (guardKey && exportsInFlight.has(guardKey)) {
      return res.status(409).json({ ok: false, error: "An export is already running for you. Wait for it to finish.", code: "export_in_progress" });
    }
    if (guardKey) exportsInFlight.add(guardKey);
    try {
      const { filters, error } = parseEstimateFilters(req.query);
      if (error) return res.status(400).json({ ok: false, error, code: "invalid_filter" });
      const ctx = await withOrg(req, res);
      if (!ctx) return;
      const { csv, rowCount, truncated, syncedFrom, syncedThrough } = await exportQuickbooksEstimates(ctx.db, ctx.orgId, filters);
      if (logAction) {
        await logAction({
          user: req.user,
          head: "quote_library",
          actionType: "quickbooks_estimates_export",
          entityType: "quickbooks_estimate",
          entityId: null,
          metadata: { row_count: rowCount, truncated, filters },
          req
        }).catch(() => {});
      }
      const exported = now().toISOString().slice(0, 10);
      const day = (iso) => (iso ? iso.slice(0, 10) : "unknown");
      const syncedLabel = day(syncedFrom) === day(syncedThrough) ? day(syncedThrough) : `${day(syncedFrom)}-to-${day(syncedThrough)}`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="quickbooks-estimates-synced-${syncedLabel}-exported-${exported}.csv"`);
      res.setHeader("X-Export-Row-Count", String(rowCount));
      res.setHeader("X-Export-Truncated", truncated ? "1" : "0");
      res.setHeader("X-Data-Synced-From", syncedFrom || "");
      res.setHeader("X-Data-Synced-Through", syncedThrough || "");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, X-Export-Row-Count, X-Export-Truncated, X-Data-Synced-From, X-Data-Synced-Through"
      );
      res.send(csv);
    } catch (err) {
      fail(res, "export", err);
    } finally {
      if (guardKey) exportsInFlight.delete(guardKey);
    }
  });

  app.get("/api/quote-library/quickbooks/freshness", ...stack, async (req, res) => {
    try {
      const ctx = await withOrg(req, res);
      if (!ctx) return;
      res.json({ ok: true, ...(await getQuickbooksEstimateFreshness(ctx.db, ctx.orgId, { now: now() })) });
    } catch (err) {
      fail(res, "freshness", err);
    }
  });

  app.get("/api/quote-library/quickbooks/estimates/:id", ...stack, async (req, res) => {
    try {
      const ctx = await withOrg(req, res);
      if (!ctx) return;
      const detail = await getQuickbooksEstimateDetail(ctx.db, ctx.orgId, pickStr(req.params.id));
      if (!detail) return res.status(404).json({ ok: false, error: "Estimate not found", code: "not_found" });
      res.json({ ok: true, ...detail });
    } catch (err) {
      fail(res, "detail", err);
    }
  });
}
