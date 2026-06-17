/**
 * eliteOS Quote Library Head — read/update quotes across shared `quote_headers` (no silo).
 * @see docs/quote-platform/quote-library-head-plan.md
 */

import express from "express";

import { logAction } from "../auth/auditLog.js";
import { assertInternalQuoteOperator } from "./partnerContext.js";
import {
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  resolveOrganizationContext,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import * as esf from "./quoteEsfNumber.js";
import { isMissingRelationError, generateQuoteNumber } from "./quotePersist.js";
import {
  buildInternalEstimateSummaryForMonday,
  resolveEstimatorDisplayNameFromDb
} from "../integrations/mondayQuoteSync.js";
import { restoreInternalQuoteAsNewRevision } from "./internalQuoteRestore.js";
import { buildMorawareEntryDocPayload, buildQuickBooksEntryDocPayload } from "./quoteLibraryHandoffPayloads.js";
import {
  applyQuoteLibrarySearch,
  quoteAccountFilterOrClause,
  deriveQuoteAccountName,
  QUOTE_LIBRARY_LIST_SELECT
} from "./quoteLibrarySearch.js";

const jsonParser = express.json({ limit: "2mb" });

const INTERNAL_STATUSES = new Set([
  "draft",
  "testing_review",
  "sent",
  "follow_up",
  "revised",
  "sold",
  "lost",
  "archived",
  "submitted"
]);
const PUBLIC_STATUSES = new Set(["lead_submitted", "reviewing", "contacted", "quoted", "won", "lost", "archived"]);

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function pricingModeLabel(body) {
  const m = String(body.internalMaterialBasis || body.internal_material_basis || "wholesale").toLowerCase();
  return m === "direct" ? "Direct" : "Wholesale";
}

function buildInternalEstimateSummary(calc, body, snapshotToStore) {
  return buildInternalEstimateSummaryForMonday({ calc, body, snapshot: snapshotToStore });
}

function deriveAccountName(row) {
  return deriveQuoteAccountName(row);
}

function displayStatus(raw) {
  const s = String(raw ?? "").trim();
  const map = {
    lead_submitted: "Lead submitted",
    testing_review: "Testing review",
    reviewing: "Reviewing",
    contacted: "Contacted",
    quoted: "Quoted",
    won: "Sold",
    sold: "Sold",
    lost: "Lost",
    archived: "Archived",
    draft: "Draft",
    sent: "Sent",
    follow_up: "Follow up",
    revised: "Revised",
    submitted: "Submitted"
  };
  return map[s] || s || "—";
}

function isAllowedStatus(s) {
  return INTERNAL_STATUSES.has(s) || PUBLIC_STATUSES.has(s);
}

function soldStatusForSource(quoteSource) {
  return quoteSource === "public_consumer" ? "won" : "sold";
}

function handoffRollupFromRows(rows) {
  let moraware = "none";
  let quickbooks = "none";
  for (const r of rows || []) {
    const t = pickStr(r.doc_type);
    const st = pickStr(r.status) || "generated";
    if (t === "moraware_entry") moraware = st;
    if (t === "quickbooks_entry") quickbooks = st;
  }
  if (moraware !== "none" || quickbooks !== "none") return "in_progress";
  return "none";
}

async function safeSelect(db, fn) {
  try {
    const r = await fn();
    if (r && r.error) return { data: null, error: r.error };
    return r;
  } catch (e) {
    return { data: null, error: e, skipped: true };
  }
}

async function loadOrgScope(db, req) {
  const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  const orgId = orgCtx.organizationId;
  const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;
  return { orgCtx, orgId, hasQuoteHeadersOrg };
}

function applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg) {
  if (!orgId || !hasQuoteHeadersOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

/**
 * Apply the standard quote list filter params to a Supabase query builder.
 * Used by both the list endpoint and the metrics endpoint so they operate on
 * the same row set. Does NOT apply sort, pagination, or handoff_status
 * (handoff_status is a post-fetch computed field, not a DB column).
 *
 * @param {object} qb  Supabase query builder
 * @param {object} query  req.query or equivalent
 * @param {{ userEmail?: string, userName?: string }} [opts]
 */
function applyQuoteListFilters(qb, query, opts = {}) {
  const { userEmail = "", userName = "" } = opts;

  const view = pickStr(query.view);
  if (view === "internal_estimates") qb = qb.eq("quote_source", "internal_quote");
  else if (view === "public_leads") qb = qb.eq("quote_source", "public_consumer");
  else if (view === "sold_jobs" || view === "needs_handoff") {
    try { qb = qb.or("quote_status.eq.sold,quote_status.eq.won"); } catch { /* ignore */ }
  }

  const my = pickStr(query.my);
  if (my === "1" || my === "true") {
    if (userEmail || userName) {
      const parts = [];
      if (userEmail) parts.push(`sales_rep.ilike.%${userEmail.slice(0, 48)}%`);
      if (userName) parts.push(`sales_rep.ilike.%${userName.slice(0, 48)}%`);
      if (parts.length) {
        try { qb = qb.or(parts.join(",")); } catch { /* ignore */ }
      }
    }
  }

  const search = pickStr(query.search);
  if (search) {
    qb = applyQuoteLibrarySearch(qb, search);
  }

  const account = pickStr(query.account);
  if (account) {
    const clause = quoteAccountFilterOrClause(account);
    if (clause) {
      try {
        qb = qb.or(clause);
      } catch {
        /* ignore */
      }
    }
  }

  const status = pickStr(query.status);
  if (status) qb = qb.eq("quote_status", status);

  const branch = pickStr(query.branch);
  if (branch) {
    try { qb = qb.ilike("branch", `%${branch.slice(0, 40)}%`); } catch { /* ignore */ }
  }

  const salesRep = pickStr(query.sales_rep);
  if (salesRep) {
    try { qb = qb.ilike("sales_rep", `%${salesRep.slice(0, 40)}%`); } catch { /* ignore */ }
  }

  const quoteSource = pickStr(query.quote_source);
  if (quoteSource) qb = qb.eq("quote_source", quoteSource);

  const cf = pickStr(query.created_from);
  if (cf) qb = qb.gte("created_at", cf);
  const ct = pickStr(query.created_to);
  if (ct) qb = qb.lte("created_at", ct);

  return qb;
}

/**
 * Extract the customer-facing Estimated project total from the saved calculation snapshot,
 * if present. Returns null for older quotes that were saved before this field was introduced.
 * @param {Record<string, unknown>} r
 * @returns {number|null}
 */
function pickSnapshotCustomerDisplayTotal(r) {
  const fromAlias = Number(r.snapshot_customer_display_total);
  if (Number.isFinite(fromAlias) && fromAlias > 0) return fromAlias;
  const snap = r.calculation_snapshot;
  if (!snap || typeof snap !== "object") return null;
  const iu = snap.internal_ui;
  if (!iu || typeof iu !== "object") return null;
  const cdt = Number(iu.customer_display_total);
  return Number.isFinite(cdt) && cdt > 0 ? cdt : null;
}

function pickListRowPricingMode(r) {
  const fromAlias = pickStr(r.snapshot_pricing_mode);
  if (fromAlias) return fromAlias;
  const snap = r.calculation_snapshot;
  if (!snap || typeof snap !== "object") return null;
  const iu = snap.internal_ui;
  if (!iu || typeof iu !== "object") return null;
  return pickStr(iu.internal_material_basis) || null;
}

function mapListRow(r, handoffDocsByQuote) {
  const hid = String(r.id);
  const docs = handoffDocsByQuote.get(hid) || [];
  const morDoc = docs.find((d) => d.doc_type === "moraware_entry");
  const qbDoc = docs.find((d) => d.doc_type === "quickbooks_entry");
  const revLab = pickStr(r.revision_label);
  const base = pickStr(r.quote_number_base);
  const qn = pickStr(r.quote_number);
  const revSummary =
    base && revLab
      ? `${base} · ${revLab}${r.is_current_revision ? " · latest" : ""}`
      : revLab && qn
        ? `${qn} · ${revLab}`
        : qn || revLab;
  return {
    id: r.id,
    quote_number: r.quote_number,
    revision_number: r.revision_number ?? null,
    revision_label: r.revision_label ?? null,
    quote_number_revision_summary: revSummary || null,
    quote_family_root_id: r.quote_family_root_id ?? null,
    is_current_revision: r.is_current_revision ?? null,
    archived_at: r.archived_at ?? null,
    account_name: deriveAccountName(r),
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    customer_phone: r.customer_phone,
    project_name: r.project_name,
    project_address: r.project_address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    quote_source: r.quote_source,
    quote_status: r.quote_status,
    pricing_mode: pickListRowPricingMode(r),
    sales_rep: r.sales_rep,
    branch: r.branch,
    grand_total: r.grand_total,
    customer_display_total: pickSnapshotCustomerDisplayTotal(r),
    estimated_sqft: r.estimated_sqft,
    created_at: r.created_at,
    updated_at: r.updated_at,
    prepared_by: r.prepared_by ?? null,
    latest_monday_sync_status: r._monday_status ?? null,
    handoff_status: handoffRollupFromRows(docs),
    moraware_doc_status: morDoc?.status ?? "none",
    quickbooks_doc_status: qbDoc?.status ?? "none"
  };
}

async function fetchMondayLatestMap(db, quoteIds) {
  const map = new Map();
  if (!quoteIds.length) return map;
  const { data, error } = await safeSelect(db, () =>
    db.from("quote_monday_sync_log").select("quote_id,status,created_at").in("quote_id", quoteIds).order("created_at", { ascending: false })
  );
  if (error || !data) return map;
  for (const row of data) {
    const qid = String(row.quote_id);
    if (!map.has(qid)) map.set(qid, row.status);
  }
  return map;
}

async function fetchHandoffDocsByQuote(db, quoteIds) {
  const map = new Map();
  if (!quoteIds.length) return map;
  const { data, error } = await safeSelect(db, () =>
    db.from("quote_handoff_documents").select("quote_id,doc_type,status,generated_at").in("quote_id", quoteIds)
  );
  if (error || !data) return map;
  for (const row of data) {
    const qid = String(row.quote_id);
    if (!map.has(qid)) map.set(qid, []);
    map.get(qid).push(row);
  }
  return map;
}

function aggregateQuoteMetrics(rows, startMs, endMs) {
  let total = 0;
  let n = 0;
  /** @type {Record<string, { count: number, value: number }>} */
  const statusBreakdown = {};
  for (const r of rows || []) {
    const u = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    if (u < startMs || u > endMs) continue;
    const gt = Number(r.grand_total) || 0;
    total += gt;
    n += 1;
    const st = String(r.quote_status || "unknown");
    if (!statusBreakdown[st]) statusBreakdown[st] = { count: 0, value: 0 };
    statusBreakdown[st].count += 1;
    statusBreakdown[st].value += gt;
  }
  const roundedTotal = Math.round(total * 100) / 100;
  return {
    total_quote_value: roundedTotal,
    quote_count: n,
    avg_quote_value: n ? Math.round((total / n) * 100) / 100 : 0,
    status_breakdown: statusBreakdown
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuoteLibraryRoutes(app, deps) {
  const { requireAuth, requireHeadAccess, getSupabase } = deps;
  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: String(e?.message || e),
        code: e?.code || "forbidden"
      });
    }
  };
  /** Partner users blocked before head check so 403 always uses partner_use_partner_routes. */
  const stack = [requireAuth(), rejectPartnerOnlyUser, requireHeadAccess("quote_library", { getSupabase })];

  app.get("/api/quote-library/quotes", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);

      const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || "80"), 10) || 80));
      const offset = Math.max(0, Number.parseInt(String(req.query.offset || "0"), 10) || 0);
      const view = pickStr(req.query.view);

      let qb = db.from("quote_headers").select(QUOTE_LIBRARY_LIST_SELECT, { count: "exact" });
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);

      const includeArchived =
        pickStr(req.query.include_archived) === "1" ||
        pickStr(req.query.show_archived).toLowerCase() === "true";
      if (!includeArchived) {
        try {
          qb = qb.is("archived_at", null);
        } catch {
          /* schema without archived_at */
        }
      }

      const latestRaw = pickStr(req.query.latest_revision_only);
      const latestOnly = latestRaw !== "0" && latestRaw !== "false";
      if (latestOnly) {
        try {
          qb = qb.or("is_current_revision.eq.true,is_current_revision.is.null");
        } catch {
          /* ignore */
        }
      }

      qb = applyQuoteListFilters(qb, req.query, {
        userEmail: pickStr(req.user?.email),
        userName: pickStr(req.user?.full_name)
      });

      const pricingMode = pickStr(req.query.pricing_mode);
      if (pricingMode) {
        try {
          qb = qb.filter("calculation_snapshot->internal_ui->>internal_material_basis", "eq", pricingMode);
        } catch {
          /* ignore if PostgREST filter unsupported */
        }
      }

      const uf = pickStr(req.query.updated_from);
      if (uf) qb = qb.gte("updated_at", uf);
      const ut = pickStr(req.query.updated_to);
      if (ut) qb = qb.lte("updated_at", ut);

      const minV = pickStr(req.query.min_value);
      if (minV && Number.isFinite(Number(minV))) qb = qb.gte("grand_total", Number(minV));
      const maxV = pickStr(req.query.max_value);
      if (maxV && Number.isFinite(Number(maxV))) qb = qb.lte("grand_total", Number(maxV));

      const sortRaw = pickStr(req.query.sort) || "updated_at";
      const dir = pickStr(req.query.direction).toLowerCase() === "asc";
      const sortCol =
        sortRaw === "account"
          ? "customer_name"
          : ["created_at", "updated_at", "grand_total", "quote_status", "sales_rep", "branch", "customer_name"].includes(sortRaw)
            ? sortRaw
            : "updated_at";
      qb = qb.order(sortCol, { ascending: dir });
      qb = qb.range(offset, offset + limit - 1);

      const { data: rows, error, count } = await qb;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], total_count: 0, warnings: ["quote_headers missing"] });
        }
        throw error;
      }

      const ids = (rows || []).map((r) => r.id);
      const monMap = await fetchMondayLatestMap(db, ids);
      const handoffMap = await fetchHandoffDocsByQuote(db, ids);

      let mapped = (rows || []).map((r) => {
        const copy = { ...r, _monday_status: monMap.get(String(r.id)) };
        return mapListRow(copy, handoffMap);
      });

      const hs = pickStr(req.query.handoff_status);
      if (hs) mapped = mapped.filter((r) => r.handoff_status === hs || r.moraware_doc_status === hs || r.quickbooks_doc_status === hs);

      if (view === "needs_handoff") {
        mapped = mapped.filter(
          (r) =>
            (r.quote_status === "sold" || r.quote_status === "won") &&
            (r.moraware_doc_status === "none" || r.quickbooks_doc_status === "none")
        );
      }

      const totalCount = Number(count ?? 0);
      const showingFrom = totalCount > 0 && mapped.length > 0 ? offset + 1 : 0;
      const showingTo = mapped.length > 0 ? offset + mapped.length : 0;
      res.json({
        ok: true,
        rows: mapped,
        quotes: mapped,
        limit,
        offset,
        page_size: limit,
        total_count: totalCount,
        has_more: offset + limit < totalCount,
        showing_from: showingFrom,
        showing_to: showingTo,
        latest_revision_only: latestOnly,
        include_archived: includeArchived,
        warnings:
          hs || view === "needs_handoff"
            ? [
                "Handoff filters are applied after the current page is fetched; narrow by status/date/account for best results until handoff indexes are expanded."
              ]
            : []
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-library/quotes/batch/archive", ...stack, jsonParser, async (req, res) => {
    try {
      const rawIds = Array.isArray(req.body?.quote_ids) ? req.body.quote_ids : [];
      const ids = [...new Set(rawIds.map((x) => pickStr(x)).filter(isUuid))].slice(0, 100);
      if (!ids.length) return res.status(400).json({ ok: false, error: "quote_ids required" });
      if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: "confirm: true required" });
      const force = req.body?.force === true;
      const elevated = ["admin", "super_admin"].includes(String(req.user?.role || "").toLowerCase());
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db
        .from("quote_headers")
        .select("id,quote_number,quote_status,quote_source,is_current_revision,archived_at")
        .in("id", ids);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: rows, error } = await qb;
      if (error) throw error;
      const byId = new Map((rows || []).map((r) => [String(r.id), r]));
      const userRef = pickStr(req.user?.email) || pickStr(req.user?.id);
      const results = [];
      for (const id of ids) {
        const cur = byId.get(id);
        if (!cur) {
          results.push({ id, status: "failed", reason: "not_found_or_not_authorized" });
          continue;
        }
        if (cur.archived_at) {
          results.push({ id, quote_number: cur.quote_number, status: "skipped", reason: "already_archived" });
          continue;
        }
        if (cur.is_current_revision === false) {
          results.push({ id, quote_number: cur.quote_number, status: "skipped", reason: "historical_revision" });
          continue;
        }
        const st = String(cur.quote_status || "");
        if ((st === "sold" || st === "won") && (!force || !elevated)) {
          results.push({
            id,
            quote_number: cur.quote_number,
            status: "skipped",
            reason: "sold_or_won_requires_admin_force"
          });
          continue;
        }
        const archivedAt = new Date().toISOString();
        const { error: uErr } = await db
          .from("quote_headers")
          .update({
            archived_at: archivedAt,
            archived_by: userRef,
            quote_status: "archived",
            updated_at: archivedAt
          })
          .eq("id", id);
        if (uErr) {
          results.push({ id, quote_number: cur.quote_number, status: "failed", reason: uErr.message });
          continue;
        }
        await safeSelect(db, () =>
          db.from("quote_status_history").insert({
            quote_id: id,
            old_status: st,
            new_status: "archived",
            changed_by: userRef,
            metadata: { source: "quote_library_batch_archive", force }
          })
        );
        results.push({ id, quote_number: cur.quote_number, status: "archived" });
      }
      await logAction({
        user: req.user,
        head: "quote_library",
        actionType: "quote_batch_archive",
        entityType: "quote_header",
        entityId: null,
        metadata: {
          requested_count: ids.length,
          archived_count: results.filter((r) => r.status === "archived").length,
          skipped_count: results.filter((r) => r.status === "skipped").length,
          failed_count: results.filter((r) => r.status === "failed").length,
          force
        },
        req
      });
      res.json({
        ok: true,
        results,
        archived_count: results.filter((r) => r.status === "archived").length,
        skipped_count: results.filter((r) => r.status === "skipped").length,
        failed_count: results.filter((r) => r.status === "failed").length
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quote-library/metrics", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);

      const includeArchived =
        pickStr(req.query.include_archived) === "1" ||
        pickStr(req.query.show_archived).toLowerCase() === "true";

      let qb = db
        .from("quote_headers")
        .select(
          "id,quote_status,quote_source,grand_total,created_at,updated_at,is_current_revision,archived_at"
        );
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      if (!includeArchived) {
        try {
          qb = qb.is("archived_at", null);
        } catch {
          /* ignore */
        }
      }
      try {
        qb = qb.or("is_current_revision.eq.true,is_current_revision.is.null");
      } catch {
        /* ignore */
      }

      // Apply all standard list filters (same as list endpoint, minus sort/pagination).
      const userEmail = pickStr(req.user?.email);
      const userName = pickStr(req.user?.full_name);
      qb = applyQuoteListFilters(qb, req.query, { userEmail, userName });

      const { data: rows, error } = await qb.limit(6000);
      if (error) {
        if (isMissingRelationError(error)) return res.json({ ok: true, installed: false, metrics: {} });
        throw error;
      }

      const OPEN_STATUSES = new Set([
        "draft",
        "testing_review",
        "sent",
        "follow_up",
        "revised",
        "lead_submitted",
        "reviewing",
        "contacted",
        "quoted",
        "submitted"
      ]);

      const now = new Date();
      const nowMs = now.getTime();
      const weekStartMs = nowMs - 7 * 86400000;
      const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStartMs = new Date(now.getFullYear(), quarterMonth, 1).getTime();
      const ytdStartMs = new Date(now.getFullYear(), 0, 1).getTime();
      const priorYtdStartMs = new Date(now.getFullYear() - 1, 0, 1).getTime();
      const priorYtdEndMs = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

      const weekAgg = aggregateQuoteMetrics(rows, weekStartMs, nowMs);
      const monthAgg = aggregateQuoteMetrics(rows, monthStartMs, nowMs);
      const quarterAgg = aggregateQuoteMetrics(rows, quarterStartMs, nowMs);
      const ytdAgg = aggregateQuoteMetrics(rows, ytdStartMs, nowMs);
      const yoyPriorAgg = aggregateQuoteMetrics(rows, priorYtdStartMs, priorYtdEndMs);

      let openValue = 0;
      let openCount = 0;
      let newWeek = 0;
      let publicLeads = 0;
      let internalEst = 0;
      let soldMonth = 0;
      const monthStartForSold = new Date(now.getFullYear(), now.getMonth(), 1);
      for (const r of rows || []) {
        const st = String(r.quote_status || "");
        const src = String(r.quote_source || "");
        const gt = Number(r.grand_total) || 0;
        const cr = r.created_at ? new Date(r.created_at).getTime() : 0;
        if (OPEN_STATUSES.has(st)) {
          openValue += gt;
          openCount += 1;
        }
        if (cr >= weekStartMs) newWeek += 1;
        if (src === "public_consumer") publicLeads += 1;
        if (src === "internal_quote") internalEst += 1;
        if ((st === "sold" || st === "won") && r.updated_at && new Date(r.updated_at) >= monthStartForSold) soldMonth += 1;
      }

      const ids = (rows || []).map((r) => r.id).filter(Boolean);
      const handoffMap = await fetchHandoffDocsByQuote(db, ids);
      let needsMw = 0;
      let needsQb = 0;
      for (const r of rows || []) {
        const st = String(r.quote_status || "");
        if (st !== "sold" && st !== "won") continue;
        const docs = handoffMap.get(String(r.id)) || [];
        const mor = docs.find((d) => d.doc_type === "moraware_entry");
        const qbdoc = docs.find((d) => d.doc_type === "quickbooks_entry");
        if (!mor) needsMw += 1;
        if (!qbdoc) needsQb += 1;
      }

      const internalRows = (rows || []).filter((r) => String(r.quote_source || "") === "internal_quote");

      // Detect whether any client filters were applied so the frontend can show
      // "Metrics reflect current filters" when the cards are not global.
      const isFiltered = !!(
        req.query.view ||
        req.query.my ||
        req.query.search ||
        req.query.account ||
        req.query.status ||
        req.query.quote_source ||
        req.query.branch ||
        req.query.sales_rep ||
        req.query.created_from ||
        req.query.created_to ||
        includeArchived
      );

      res.json({
        ok: true,
        is_filtered: isFiltered,
        total_row_sample: (rows || []).length,
        metrics_note:
          "Headline cards use latest revision rows only (is_current_revision). Period buckets filter by updated_at. Filters from the active list view are forwarded.",
        metrics: {
          total_open_quote_value: Math.round(openValue * 100) / 100,
          open_quotes: openCount,
          new_this_week: newWeek,
          public_leads: publicLeads,
          internal_estimates: internalEst,
          sold_this_month: soldMonth,
          needs_moraware_entry_doc: needsMw,
          needs_quickbooks_entry_doc: needsQb,
          scoped_quote_source: pickStr(req.query.quote_source) || null,
          periods: {
            week: weekAgg,
            month: monthAgg,
            quarter: quarterAgg,
            ytd: ytdAgg,
            yoy_prior_ytd: {
              ...yoyPriorAgg,
              note: `Prior-year window ${new Date(priorYtdStartMs).toISOString().slice(0, 10)} → ${new Date(priorYtdEndMs).toISOString().slice(0, 10)} (calendar-aligned stub)`
            }
          },
          internal_quote_periods: {
            week: aggregateQuoteMetrics(internalRows, weekStartMs, nowMs),
            month: aggregateQuoteMetrics(internalRows, monthStartMs, nowMs),
            quarter: aggregateQuoteMetrics(internalRows, quarterStartMs, nowMs),
            ytd: aggregateQuoteMetrics(internalRows, ytdStartMs, nowMs),
            yoy_prior_ytd: aggregateQuoteMetrics(internalRows, priorYtdStartMs, priorYtdEndMs)
          },
          yoy_compare_ytd: {
            current_ytd_value: ytdAgg.total_quote_value,
            prior_ytd_value: yoyPriorAgg.total_quote_value,
            delta_value: Math.round((ytdAgg.total_quote_value - yoyPriorAgg.total_quote_value) * 100) / 100
          }
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quote-library/accounts", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db
        .from("quote_headers")
        .select(
          "id,quote_number,quote_source,quote_status,customer_name,project_name,branch,sales_rep,grand_total,created_at,updated_at,calculation_snapshot"
        )
        .order("updated_at", { ascending: false })
        .limit(1500);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      try {
        qb = qb.is("archived_at", null);
      } catch {
        /* ignore */
      }
      try {
        qb = qb.or("is_current_revision.eq.true,is_current_revision.is.null");
      } catch {
        /* ignore */
      }
      const search = pickStr(req.query.search);
      const { data: rows, error } = await qb;
      if (error) {
        if (isMissingRelationError(error)) return res.json({ ok: true, installed: false, groups: [] });
        throw error;
      }
      return finishAccounts(res, rows || [], search);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  function finishAccounts(res, rows, search) {
    const map = new Map();
    for (const r of rows) {
      const key = deriveAccountName(r);
      if (search && !key.toLowerCase().includes(search.toLowerCase())) continue;
      if (!map.has(key)) {
        map.set(key, {
          account_key: key,
          quote_count: 0,
          open_value: 0,
          last_quote_at: null
        });
      }
      const g = map.get(key);
      g.quote_count += 1;
      const st = String(r.quote_status || "");
      if (!["sold", "won", "lost", "archived"].includes(st)) {
        g.open_value += Number(r.grand_total) || 0;
      }
      const u = r.updated_at || r.created_at;
      if (!g.last_quote_at || (u && u > g.last_quote_at)) g.last_quote_at = u;
    }
    res.json({ ok: true, groups: [...map.values()].sort((a, b) => String(b.last_quote_at).localeCompare(String(a.last_quote_at))) });
  }

  async function loadQuoteDetail(db, id, orgId, hasQuoteHeadersOrg) {
    const warnings = [];
    let qb = db.from("quote_headers").select("*").eq("id", id).limit(1);
    qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
    const { data: hrows, error: hErr } = await qb;
    if (hErr) {
      if (isMissingRelationError(hErr)) return { ok: false, installed: false };
      throw hErr;
    }
    const header = hrows?.[0];
    if (!header) return { ok: false, notFound: true };

    const payloadRes = await safeSelect(db, () =>
      db
        .from("quote_submission_payloads")
        .select("submitted_payload, normalized_payload, quote_source, created_at")
        .eq("quote_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
    );
    if (payloadRes.error || payloadRes.skipped) warnings.push("quote_submission_payloads unavailable");
    const payloadRow = payloadRes.data?.[0] ?? null;

    const lines = await safeSelect(db, () => db.from("quote_line_items").select("*").eq("quote_id", id));
    if (lines.error || lines.skipped) warnings.push("quote_line_items unavailable");

    const rooms = await safeSelect(db, () => db.from("quote_rooms").select("*").eq("quote_id", id).order("sort_order", { ascending: true }));
    if (rooms.error || rooms.skipped) warnings.push("quote_rooms unavailable");

    const forecast = await safeSelect(db, () => db.from("quote_forecast_events").select("*").eq("quote_id", id).order("event_at", { ascending: false }).limit(50));
    if (forecast.error || forecast.skipped) warnings.push("quote_forecast_events unavailable");

    const lead = await safeSelect(db, () => db.from("quote_lead_assignments").select("*").eq("quote_id", id).limit(1));
    if (lead.error || lead.skipped) warnings.push("quote_lead_assignments unavailable");

    const monday = await safeSelect(db, () =>
      db.from("quote_monday_sync_log").select("*").eq("quote_id", id).order("created_at", { ascending: false }).limit(40)
    );
    if (monday.error || monday.skipped) warnings.push("quote_monday_sync_log unavailable");

    const statusHist = await safeSelect(db, () =>
      db.from("quote_status_history").select("*").eq("quote_id", id).order("changed_at", { ascending: false }).limit(80)
    );
    if (statusHist.error || statusHist.skipped) warnings.push("quote_status_history unavailable");

    const handoff = await safeSelect(db, () =>
      db.from("quote_handoff_documents").select("*").eq("quote_id", id).order("generated_at", { ascending: false })
    );
    if (handoff.error || handoff.skipped) warnings.push("quote_handoff_documents unavailable — apply eliteos_quote_library_foundation.sql");

    const timeline = [];
    for (const ev of statusHist.data || []) {
      timeline.push({
        type: "status",
        at: ev.changed_at || ev.created_at,
        old_status: ev.old_status,
        new_status: ev.new_status,
        by: ev.changed_by
      });
    }
    for (const ev of monday.data || []) {
      timeline.push({ type: "monday", at: ev.created_at, status: ev.status, action: ev.action });
    }
    timeline.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

    return {
      ok: true,
      header: {
        ...header,
        account_name: deriveAccountName(header),
        quote_status_display: displayStatus(header.quote_status),
        customer_display_total: pickSnapshotCustomerDisplayTotal(header)
      },
      submitted_payload: payloadRow?.submitted_payload ?? null,
      normalized_payload: payloadRow?.normalized_payload ?? null,
      calculation_snapshot: header.calculation_snapshot,
      line_items: lines.data ?? [],
      rooms: rooms.data ?? [],
      forecast_events: forecast.data ?? [],
      lead_assignment: lead.data?.[0] ?? null,
      monday_sync_log: monday.data ?? [],
      status_timeline: timeline,
      handoff_documents: handoff.data ?? [],
      warnings
    };
  }

  app.get("/api/quote-library/quotes/:id/revisions", ...stack, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb0 = db
        .from("quote_headers")
        .select("id,quote_source,quote_family_root_id,quote_number_base")
        .eq("id", id)
        .limit(1);
      qb0 = applyQuoteHeaderOrgScope(qb0, orgId, hasQuoteHeadersOrg);
      const { data: seedRows, error: seedErr } = await qb0;
      if (seedErr) throw seedErr;
      const seed = seedRows?.[0];
      if (!seed) return res.status(404).json({ ok: false, error: "Not found" });
      if (String(seed.quote_source || "") !== "internal_quote") {
        return res.status(400).json({ ok: false, error: "Revision history is only available for internal estimates." });
      }
      const root = String(seed.quote_family_root_id || seed.id);
      let qb = db
        .from("quote_headers")
        .select(
          "id,quote_number,revision_number,revision_label,is_current_revision,grand_total,quote_status,created_at,updated_at,quote_family_root_id"
        )
        .eq("quote_source", "internal_quote")
        .or(`id.eq.${root},quote_family_root_id.eq.${root}`)
        .order("revision_number", { ascending: true });
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data, error } = await qb;
      if (error) throw error;
      await logAction({
        user: req.user,
        head: "quote_library",
        actionType: "quote_revisions_viewed",
        entityType: "quote_header",
        entityId: id,
        metadata: { quote_family_root_id: root, revision_count: (data || []).length },
        req
      });
      res.json({
        ok: true,
        quote_family_root_id: root,
        quote_number_base: seed.quote_number_base ?? null,
        revisions: (data || []).map((r) => ({
          id: r.id,
          quote_number: r.quote_number,
          revision_number: r.revision_number,
          revision_label: r.revision_label,
          is_current_revision: r.is_current_revision,
          grand_total: r.grand_total,
          quote_status: r.quote_status,
          created_at: r.created_at,
          updated_at: r.updated_at
        }))
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-library/quotes/:id/restore-as-revision", ...stack, jsonParser, async (req, res) => {
    try {
      const restoreFromId = pickStr(req.params.id);
      if (!isUuid(restoreFromId)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const revisionNote = body.revision_note ?? body.revisionNote ?? null;
      const estimatorDisplayName = await resolveEstimatorDisplayNameFromDb(db, req, body);
      const result = await restoreInternalQuoteAsNewRevision({
        db,
        restoreFromId,
        organizationContext,
        userEmail,
        revisionNote,
        internalStatuses: INTERNAL_STATUSES,
        buildInternalEstimateSummary,
        pricingModeLabel,
        estimatorDisplayName
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({ ok: false, error: result.error });
      }
      await logAction({
        user: req.user,
        head: "quote_library",
        actionType: "quote_revision_restored",
        entityType: "quote_header",
        entityId: result.quoteId,
        entityLabel: result.quote_number,
        metadata: {
          restored_from_quote_id: restoreFromId,
          revision_number: result.revision_number,
          revision_label: result.revision_label
        },
        req
      });
      res.json({
        ok: true,
        quoteId: result.quoteId,
        quote_id: result.quoteId,
        quote_number: result.quote_number,
        revision_number: result.revision_number,
        revision_label: result.revision_label,
        quote_family_root_id: result.quote_family_root_id,
        is_current_revision: result.is_current_revision,
        save_mode: result.save_mode,
        monday_sync_status: result.monday_sync_status ?? null
      });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({
          ok: false,
          installed: false,
          message: "Quote platform tables not installed. Apply backend-core/supabase migrations."
        });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quote-library/quotes/:id", ...stack, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      const detail = await loadQuoteDetail(db, id, orgId, hasQuoteHeadersOrg);
      if (detail.notFound) return res.status(404).json({ ok: false, error: "Not found" });
      if (detail.installed === false) return res.status(503).json({ ok: false, installed: false });
      await logAction({
        user: req.user,
        head: "quote_library",
        actionType: "quote_opened",
        entityType: "quote_header",
        entityId: id,
        entityLabel: detail?.header?.quote_number ?? null,
        metadata: { quote_source: detail?.header?.quote_source ?? null },
        req
      });
      res.json(detail);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quote-library/quotes/:id/timeline", ...stack, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      const detail = await loadQuoteDetail(db, id, orgId, hasQuoteHeadersOrg);
      if (detail.notFound) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, timeline: detail.status_timeline || [], warnings: detail.warnings || [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-library/quotes/:id/archive", ...stack, jsonParser, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const confirm = Boolean(req.body?.confirm);
      if (!confirm) return res.status(400).json({ ok: false, error: "confirm: true required" });
      const force = Boolean(req.body?.force);
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db.from("quote_headers").select("id,quote_status,quote_source").eq("id", id).limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: rows, error: e0 } = await qb;
      if (e0) throw e0;
      const cur = rows?.[0];
      if (!cur) return res.status(404).json({ ok: false, error: "Not found" });
      const st = String(cur.quote_status || "");
      if ((st === "sold" || st === "won") && !force) {
        return res.status(409).json({
          ok: false,
          error: "Quote is marked sold/won. Pass force:true after confirming this archive is intentional.",
          quote_status: st
        });
      }
      const userRef = pickStr(req.user?.email) || pickStr(req.user?.id);
      const { error: uErr } = await db
        .from("quote_headers")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: userRef,
          quote_status: "archived",
          updated_at: new Date().toISOString()
        })
        .eq("id", id);
      if (uErr) throw uErr;
      await safeSelect(db, () =>
        db.from("quote_status_history").insert({
          quote_id: id,
          old_status: st,
          new_status: "archived",
          changed_by: userRef,
          metadata: { source: "quote_library_archive", force }
        })
      );
      try {
        await logAction({
          user: req.user,
          head: "quote_library",
          actionType: "quote_archive",
          entityType: "quote_header",
          entityId: id,
          metadata: { force },
          req
        });
      } catch {
        /* optional */
      }
      res.json({ ok: true, id, archived: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/quote-library/quotes/:id", ...stack, jsonParser, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db.from("quote_headers").select("id").eq("id", id).limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: ex, error: e0 } = await qb;
      if (e0) throw e0;
      if (!ex?.[0]) return res.status(404).json({ ok: false, error: "Not found" });

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const patch = {};
      for (const k of ["customer_name", "project_name", "branch", "sales_rep", "project_address", "city", "state", "zip", "customer_email", "customer_phone"]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: "No allowed fields" });
      patch.updated_at = new Date().toISOString();
      const { error: uErr } = await db.from("quote_headers").update(patch).eq("id", id);
      if (uErr) throw uErr;
      try {
        await logAction({
          user: req.user,
          head: "quote_library",
          actionType: "quote_library_patch",
          entityType: "quote_header",
          entityId: id,
          metadata: { fields: Object.keys(patch) },
          req
        });
      } catch {
        /* optional */
      }
      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/quote-library/quotes/:id/status", ...stack, jsonParser, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const next = pickStr(req.body?.status);
      if (!isAllowedStatus(next)) return res.status(400).json({ ok: false, error: "Invalid status" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db.from("quote_headers").select("id,quote_status,quote_source").eq("id", id).limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: rows, error: e0 } = await qb;
      if (e0) throw e0;
      const cur = rows?.[0];
      if (!cur) return res.status(404).json({ ok: false, error: "Not found" });
      const old = cur.quote_status;
      const { error: uErr } = await db
        .from("quote_headers")
        .update({ quote_status: next, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (uErr) throw uErr;
      const userRef = pickStr(req.user?.email) || pickStr(req.user?.id);
      const hist = await safeSelect(db, () =>
        db.from("quote_status_history").insert({
          quote_id: id,
          old_status: old,
          new_status: next,
          changed_by: userRef,
          metadata: { source: "quote_library", note: pickStr(req.body?.note) || null }
        })
      );
      try {
        await logAction({
          user: req.user,
          head: "quote_library",
          actionType: "quote_status_change",
          entityType: "quote_header",
          entityId: id,
          metadata: { old_status: old, new_status: next },
          req
        });
      } catch {
        /* optional */
      }
      res.json({
        ok: true,
        id,
        quote_status: next,
        warnings: hist.error ? ["quote_status_history insert skipped"] : []
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/quote-library/quotes/:id/assign", ...stack, jsonParser, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db.from("quote_headers").select("id").eq("id", id).limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: ex } = await qb;
      if (!ex?.[0]) return res.status(404).json({ ok: false, error: "Not found" });
      const patch = {
        updated_at: new Date().toISOString()
      };
      if (req.body?.sales_rep !== undefined) patch.sales_rep = req.body.sales_rep;
      if (req.body?.branch !== undefined) patch.branch = req.body.branch;
      const { error: uErr } = await db.from("quote_headers").update(patch).eq("id", id);
      if (uErr) throw uErr;
      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-library/quotes/:id/duplicate", ...stack, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db.from("quote_headers").select("*").eq("id", id).limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: srcRows, error: sErr } = await qb;
      if (sErr) throw sErr;
      const src = srcRows?.[0];
      if (!src) return res.status(404).json({ ok: false, error: "Not found" });
      const source = src.quote_source === "public_consumer" ? "internal_quote" : src.quote_source;

      let quoteNumber;
      /** @type {Record<string, unknown>|null} */
      let revExtras = null;
      if (source === "internal_quote") {
        const orgKey = esf.organizationKeyForQuotes(orgId);
        const bp = esf.branchPrefixFromBranchLabel(String(src.branch ?? ""));
        try {
          const seq = await esf.allocateEsfSequence(db, orgKey, bp);
          const quote_number_base = esf.formatEsfQuoteNumberBase(bp, seq);
          quoteNumber = esf.quoteNumberForRevision(quote_number_base, 1);
          revExtras = {
            revision_number: 1,
            revision_label: "R1",
            quote_number_base,
            quote_family_root_id: null,
            is_current_revision: true,
            revised_from_quote_id: id,
            monday_item_id: null,
            monday_board_id: null,
            archived_at: null,
            archived_by: null
          };
        } catch {
          quoteNumber = generateQuoteNumber();
          revExtras = {
            revision_number: 1,
            revision_label: "R1",
            quote_number_base: null,
            quote_family_root_id: null,
            is_current_revision: true,
            revised_from_quote_id: id,
            monday_item_id: null,
            monday_board_id: null,
            archived_at: null,
            archived_by: null
          };
        }
      } else {
        quoteNumber = generateQuoteNumber();
      }

      const userEmail = pickStr(req.user?.email || req.user?.id);
      const snap = src.calculation_snapshot && typeof src.calculation_snapshot === "object" ? { ...src.calculation_snapshot } : {};
      snap.internal_ui = { ...(snap.internal_ui || {}), duplicated_from_quote_id: id, duplicated_via: "quote_library" };
      const orgTables = new Set();
      if (orgId && (await tableHasOrganizationId(db, "quote_headers"))) orgTables.add("quote_headers");
      const insRow = {
        quote_number: quoteNumber,
        quote_source: source,
        quote_status: source === "internal_quote" ? "draft" : "draft",
        partner_account_id: src.partner_account_id,
        pricing_structure_id: src.pricing_structure_id,
        customer_name: src.customer_name,
        customer_email: src.customer_email,
        customer_phone: src.customer_phone,
        project_name: src.project_name ? `${src.project_name} (copy)` : "Copy",
        project_address: src.project_address,
        city: src.city,
        state: src.state,
        zip: src.zip,
        sales_rep: src.sales_rep,
        branch: src.branch,
        project_type: src.project_type,
        estimate_confidence: src.estimate_confidence,
        prepared_by: src.prepared_by,
        valid_days: src.valid_days ?? 30,
        notes_length: src.notes_length,
        subtotal: src.subtotal,
        markup_total: src.markup_total,
        discount_total: src.discount_total,
        tax_total: src.tax_total,
        grand_total: src.grand_total,
        estimated_sqft: src.estimated_sqft,
        estimated_material_group: src.estimated_material_group,
        calculation_snapshot: snap,
        created_by: userEmail,
        ...(revExtras || {})
      };
      const merged = mergeRowOrganizationId(insRow, orgId, orgTables.has("quote_headers"));
      const { data: ins, error: hErr } = await db.from("quote_headers").insert(merged).select("id").limit(1);
      if (hErr) throw hErr;
      const newId = ins?.[0]?.id;
      if (newId && revExtras) {
        await db
          .from("quote_headers")
          .update({ quote_family_root_id: newId, updated_at: new Date().toISOString() })
          .eq("id", newId)
          .eq("quote_source", "internal_quote");
      }
      res.json({ ok: true, quoteId: newId, quote_number: quoteNumber });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-library/quotes/:id/mark-sold", ...stack, jsonParser, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      let qb = db.from("quote_headers").select("id,quote_source,quote_status").eq("id", id).limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: rows, error: e0 } = await qb;
      if (e0) throw e0;
      const cur = rows?.[0];
      if (!cur) return res.status(404).json({ ok: false, error: "Not found" });
      const next = soldStatusForSource(cur.quote_source);
      const old = cur.quote_status;
      const { error: uErr } = await db
        .from("quote_headers")
        .update({ quote_status: next, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (uErr) throw uErr;
      const userRef = pickStr(req.user?.email) || pickStr(req.user?.id);
      await safeSelect(db, () =>
        db.from("quote_status_history").insert({
          quote_id: id,
          old_status: old,
          new_status: next,
          changed_by: userRef,
          metadata: { source: "quote_library_mark_sold" }
        })
      );
      try {
        await logAction({
          user: req.user,
          head: "quote_library",
          actionType: "quote_mark_sold",
          entityType: "quote_header",
          entityId: id,
          metadata: { new_status: next },
          req
        });
      } catch {
        /* optional */
      }
      res.json({ ok: true, id, quote_status: next });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  async function insertHandoffDoc(db, orgId, req, quoteId, docType, payload) {
    const orgTables = new Set();
    if (orgId && (await tableHasOrganizationId(db, "quote_handoff_documents"))) orgTables.add("quote_handoff_documents");
    const row = mergeRowOrganizationId(
      {
        quote_id: quoteId,
        doc_type: docType,
        status: "generated",
        payload,
        generated_by: pickStr(req.user?.id) || null,
        generated_at: new Date().toISOString()
      },
      orgId,
      orgTables.has("quote_handoff_documents")
    );
    const { data, error } = await db.from("quote_handoff_documents").insert(row).select("id").limit(1);
    if (error) throw error;
    return data?.[0]?.id;
  }

  app.post("/api/quote-library/quotes/:id/generate-moraware-entry-doc", ...stack, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      const detail = await loadQuoteDetail(db, id, orgId, hasQuoteHeadersOrg);
      if (detail.notFound) return res.status(404).json({ ok: false, error: "Not found" });
      const payload = buildMorawareEntryDocPayload(detail.header, detail.calculation_snapshot, detail.rooms, detail.line_items);
      const docId = await insertHandoffDoc(db, orgId, req, id, "moraware_entry", payload);
      res.json({ ok: true, doc_id: docId, payload });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({ ok: false, installed: false, message: "Apply eliteos_quote_library_foundation.sql for quote_handoff_documents." });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-library/quotes/:id/generate-quickbooks-entry-doc", ...stack, async (req, res) => {
    try {
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadOrgScope(db, req);
      const detail = await loadQuoteDetail(db, id, orgId, hasQuoteHeadersOrg);
      if (detail.notFound) return res.status(404).json({ ok: false, error: "Not found" });
      const payload = buildQuickBooksEntryDocPayload(detail.header, detail.calculation_snapshot, detail.line_items);
      const docId = await insertHandoffDoc(db, orgId, req, id, "quickbooks_entry", payload);
      res.json({ ok: true, doc_id: docId, payload });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({ ok: false, installed: false, message: "Apply eliteos_quote_library_foundation.sql for quote_handoff_documents." });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log("[quote-library] mounted /api/quote-library/*");
}
