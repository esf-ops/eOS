import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { ACTIVE_SALES_REPS } from "../sales/salesAttribution.js";
import { loadSalesAttributionCoverage } from "../sales/salesAttributionCoverage.js";
import { normalizeAccountNameWithoutLocationPrefix, normalizeAccountName } from "../sales/salesAccountNameNormalizer.js";

const REQUIRED_TABLES = Object.freeze([
  "sales_reps",
  "sales_branches",
  "sales_account_master",
  "sales_account_aliases",
  "sales_account_assignments",
  "sales_account_assignment_history",
  "sales_moraware_report_audit",
  "sales_account_attribution_audit"
]);

const DEFAULT_BRANCHES = Object.freeze(["Lisbon", "Dyersville", "Iowa City", "Unmapped"]);
const HOUSE_OPTIONS = Object.freeze(["House Account - Lisbon", "House Account - Dyersville", "Direct", "Unmapped"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// backend-core/src/admin/salesAccountMappingAdmin.js -> repo root
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SUGGESTIONS_JSON_REPO = path.join(
  REPO_ROOT,
  "debug",
  "sales",
  "latest",
  "sales-account-crosswalk-suggestions.json"
);
const SUGGESTIONS_JSON_CWD = path.join(
  process.cwd(),
  "debug",
  "sales",
  "latest",
  "sales-account-crosswalk-suggestions.json"
);

function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function resolveAdminOrganizationId(req) {
  const queryOrg = String(req.query?.organization_id ?? "").trim();
  if (isUuid(queryOrg)) return queryOrg;
  const userOrg = String(req.user?.organization_id ?? "").trim();
  if (isUuid(userOrg)) return userOrg;
  const defaultOrg = String(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID ?? "").trim();
  if (isUuid(defaultOrg)) return defaultOrg;
  return "";
}

async function tableExists(supabase, table) {
  try {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) throw error;
    return { exists: true };
  } catch (e) {
    if (isMissingRelationError(e)) return { exists: false };
    return { exists: false, error: String(e?.message || e) };
  }
}

async function tableCount(supabase, table) {
  try {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    return { ok: true, count: count ?? null };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: false, missing: true };
    return { ok: false, error: String(e?.message || e) };
  }
}

function mustBeAdminRepOrHouseOrUnmapped(rep) {
  const r = normalizeSpaces(rep);
  if (!r) return { ok: false, error: "assignedSalesperson required" };
  if (ACTIVE_SALES_REPS.includes(r)) return { ok: true, kind: "active_rep", value: r };
  if (HOUSE_OPTIONS.includes(r)) return { ok: true, kind: "house_or_unmapped", value: r };
  return {
    ok: false,
    error: `Invalid assignedSalesperson "${r}". Must be one of ${[...ACTIVE_SALES_REPS, ...HOUSE_OPTIONS].join(", ")}.`
  };
}

async function readLatestSuggestionsJson() {
  const pathsChecked = [SUGGESTIONS_JSON_REPO, SUGGESTIONS_JSON_CWD];
  let picked = null;
  for (const p of pathsChecked) {
    try {
      await fs.access(p);
      picked = p;
      break;
    } catch {
      // keep checking
    }
  }
  if (!picked) {
    const err = new Error("Suggestions file not found");
    // @ts-ignore attach debug fields
    err.pathsChecked = pathsChecked;
    throw err;
  }

  const raw = await fs.readFile(picked, "utf8");
  const json = JSON.parse(raw);
  if (!json || typeof json !== "object" || !Array.isArray(json.suggestions)) {
    throw new Error("Invalid suggestions JSON shape (expected { suggestions: [...] }).");
  }
  return { path: picked, payload: json };
}

async function tryReadLatestSuggestionsJson() {
  try {
    return await readLatestSuggestionsJson();
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === "Suggestions file not found" || msg.toLowerCase().includes("enoent")) {
      return { path: null, payload: { suggestions: [], generatedAt: null }, missing: true };
    }
    throw e;
  }
}

function buildSuggestionRow(s) {
  const morawareAccountName = String(s.moraware_account_name ?? "");
  const normalizedMorawareName =
    String(s.normalized_moraware_name_no_prefix ?? "") ||
    String(s.normalized_moraware_name ?? "") ||
    normalizeAccountNameWithoutLocationPrefix(morawareAccountName);

  return {
    morawareAccountName,
    normalizedMorawareName,
    reportTotalSqft: Number(s.report_total_sqft ?? 0) || 0,
    reportJobCount: Number(s.report_job_count ?? 0) || 0,
    morawareJobSalespeople: String(s.moraware_job_salespeople_observed ?? ""),
    suggestedMondayAccountName: s.best_monday_account_name ?? null,
    suggestedSalesperson: s.monday_sales_executive ?? null,
    suggestedBranch: s.monday_branch ?? null,
    matchType: String(s.match_type ?? ""),
    confidence: String(s.confidence ?? ""),
    approvedSuggested: Boolean(s.approved),
    rationale: String(s.rationale ?? ""),
    alternateMatches: Array.isArray(s.alternate_matches) ? s.alternate_matches : [],
    manualRuleHits: Array.isArray(s.manual_rule_hits) ? s.manual_rule_hits : [],
    existingApprovedAlias: null,
    currentAssignment: null,
    reviewStatus: "needs_review"
  };
}

function computeReviewStatus({ suggestion, existingAlias }) {
  if (existingAlias) {
    const mt = String(existingAlias.match_type ?? "").toLowerCase();
    const approved = existingAlias.approved === true;
    if (approved && mt === "intentional_unmapped") return "unmapped";
    if (mt === "rejected") return "rejected";
    if (approved) return "approved";
    return "needs_review";
  }
  if (suggestion.matchType === "no_match") return "unmatched";
  if (suggestion.matchType === "fuzzy_suggested") return "fuzzy";
  return "needs_review";
}

function reviewStatusFromCoverageStatus(status, row) {
  const s = String(status ?? "");
  const mt = String(row?.matchType ?? "").toLowerCase();
  if (s === "approved_mapped") return "approved";
  if (s === "rejected_ignored" && mt === "intentional_unmapped") return "unmapped";
  if (s === "rejected_ignored") return "rejected";
  return "needs_review";
}

function buildBrainCoverageSuggestionRow(row) {
  const morawareAccountName = String(row.accountName ?? "");
  const normalizedMorawareName =
    String(row.normalizedMorawareName ?? "") || normalizeAccountNameWithoutLocationPrefix(morawareAccountName);
  const approved = row.reviewStatus === "approved_mapped";
  const existingApprovedAlias =
    approved || row.reviewStatus === "rejected_ignored"
      ? {
          id: row.aliasId ?? null,
          approved: row.approved === true,
          moraware_account_name: morawareAccountName,
          normalized_moraware_name: normalizedMorawareName,
          monday_account_name: row.mondayAccountName ?? null,
          assigned_salesperson: row.assignedSalesperson ?? null,
          branch: row.branch ?? null,
          match_type: row.matchType ?? null,
          confidence: row.confidence ?? null,
          notes: row.notes ?? null
        }
      : null;

  return {
    morawareAccountName,
    sourceAccountId: row.sourceAccountId ?? null,
    normalizedMorawareName,
    reportTotalSqft: Number(row.totalSqft ?? 0) || 0,
    reportJobCount: Number(row.jobCount ?? 0) || 0,
    jobsWithSqft: Number(row.jobsWithSqft ?? 0) || 0,
    jobsMissingSqft: Number(row.jobsMissingSqft ?? 0) || 0,
    sqftSource: row.sqftSource ?? "Brain-derived Moraware Job Worksheet Sq.Ft. fields",
    morawareJobSalespeople: "",
    suggestedMondayAccountName: row.mondayAccountName ?? null,
    suggestedSalesperson: row.assignedSalesperson ?? null,
    suggestedBranch: row.branch ?? null,
    matchType: row.matchType ?? "brain_latest_sync",
    confidence: row.confidence ?? "none",
    approvedSuggested: approved,
    rationale: "Brain-derived latest Moraware sync account coverage.",
    alternateMatches: [],
    manualRuleHits: [],
    existingApprovedAlias,
    currentAssignment: null,
    reviewStatus: reviewStatusFromCoverageStatus(row.reviewStatus, row),
    source: "brain_latest_sync"
  };
}

function mergeSuggestionEnrichment(rows, suggestions) {
  const byNorm = new Map();
  for (const s of suggestions) {
    const r = buildSuggestionRow(s);
    const k = String(r.normalizedMorawareName ?? "").trim();
    if (k && !byNorm.has(k)) byNorm.set(k, r);
  }
  if (!byNorm.size) return rows;
  return rows.map((row) => {
    const hit = byNorm.get(row.normalizedMorawareName);
    if (!hit) return row;
    return {
      ...row,
      reportTotalSqft: row.reportTotalSqft || hit.reportTotalSqft,
      morawareJobSalespeople: hit.morawareJobSalespeople || row.morawareJobSalespeople,
      suggestedMondayAccountName: row.suggestedMondayAccountName || hit.suggestedMondayAccountName,
      suggestedSalesperson: row.suggestedSalesperson || hit.suggestedSalesperson,
      suggestedBranch: row.suggestedBranch || hit.suggestedBranch,
      matchType: row.matchType === "brain_latest_sync" ? hit.matchType || row.matchType : row.matchType,
      confidence: row.confidence === "none" ? hit.confidence || row.confidence : row.confidence,
      rationale: hit.rationale || row.rationale,
      alternateMatches: hit.alternateMatches || [],
      manualRuleHits: hit.manualRuleHits || [],
      source: "brain_latest_sync_with_optional_suggestion"
    };
  });
}

function applyFilters(rows, q) {
  const status = String(q.status ?? "all").trim();
  const search = String(q.search ?? "").trim().toLowerCase();
  const minSqft = q.minSqft != null ? Number(q.minSqft) : null;
  const matchType = String(q.matchType ?? "").trim();
  const confidence = String(q.confidence ?? "").trim();
  const salesperson = String(q.salesperson ?? "").trim();
  const branch = String(q.branch ?? "").trim();

  return rows.filter((r) => {
    if (status && status !== "all" && r.reviewStatus !== status) return false;
    if (minSqft != null && Number.isFinite(minSqft) && r.reportTotalSqft < minSqft) return false;
    if (matchType && r.matchType !== matchType) return false;
    if (confidence && r.confidence !== confidence) return false;
    if (salesperson) {
      const sp = String(r.suggestedSalesperson ?? "").trim();
      const sp2 = String(r.existingApprovedAlias?.assigned_salesperson ?? "").trim();
      if (sp !== salesperson && sp2 !== salesperson) return false;
    }
    if (branch) {
      const b = String(r.suggestedBranch ?? "").trim();
      const b2 = String(r.existingApprovedAlias?.branch ?? "").trim();
      if (b !== branch && b2 !== branch) return false;
    }
    if (search) {
      const blob = [
        r.morawareAccountName,
        r.sourceAccountId,
        r.suggestedMondayAccountName,
        r.suggestedSalesperson,
        r.suggestedBranch,
        r.matchType,
        r.confidence,
        r.rationale
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

function sortRows(rows, sortBy, sortDir) {
  const dir = String(sortDir ?? "desc").toLowerCase() === "asc" ? 1 : -1;
  const key = String(sortBy ?? "sqft");
  const cmp = (a, b) => {
    if (key === "account") return a.morawareAccountName.localeCompare(b.morawareAccountName) * dir;
    if (key === "account_name") return a.morawareAccountName.localeCompare(b.morawareAccountName) * dir;
    if (key === "confidence") return String(a.confidence).localeCompare(String(b.confidence)) * dir;
    if (key === "matchType") return String(a.matchType).localeCompare(String(b.matchType)) * dir;
    if (key === "salesperson") return String(a.suggestedSalesperson ?? "").localeCompare(String(b.suggestedSalesperson ?? "")) * dir;
    if (key === "branch") return String(a.suggestedBranch ?? "").localeCompare(String(b.suggestedBranch ?? "")) * dir;
    if (key === "jobs") return (a.reportJobCount - b.reportJobCount) * dir;
    if (key === "jobs_desc") return b.reportJobCount - a.reportJobCount;
    if (key === "sqft_asc") return ((a.reportTotalSqft || 0) - (b.reportTotalSqft || 0)) || a.morawareAccountName.localeCompare(b.morawareAccountName);
    if (key === "sqft_desc") return ((b.reportTotalSqft || 0) - (a.reportTotalSqft || 0)) || a.morawareAccountName.localeCompare(b.morawareAccountName);
    // sqft default
    return ((a.reportTotalSqft || 0) - (b.reportTotalSqft || 0)) * dir || (a.reportJobCount - b.reportJobCount) * dir;
  };
  return rows.slice().sort(cmp);
}

export function attachSalesAccountMappingAdminRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessSystemAdmin = requireHeadAccess("system_admin", { getSupabase });
  const supabaseGetter = () => getSupabase();
  const jsonParser = express.json();

  app.get(
    "/api/admin/sales-account-mapping/schema-health",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (_req, res) => {
      try {
        const supabase = supabaseGetter();
        const checks = {};
        const missing = [];
        const counts = {};
        for (const t of REQUIRED_TABLES) {
          const ex = await tableExists(supabase, t);
          checks[t] = ex;
          if (!ex.exists) missing.push(t);
          const c = await tableCount(supabase, t);
          if (c.ok) counts[t] = c.count;
        }
        const ok = missing.length === 0;
        res.json({
          ok,
          requiredTables: REQUIRED_TABLES,
          missingTables: missing,
          tableCounts: counts,
          message: ok
            ? "Sales attribution schema is installed."
            : "Sales attribution schema is not installed (one or more tables missing).",
          checks
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/sales-account-mapping/reps-branches",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (_req, res) => {
      try {
        const supabase = supabaseGetter();
        let reps = [...ACTIVE_SALES_REPS];
        let branches = [...DEFAULT_BRANCHES];

        const repsEx = await tableExists(supabase, "sales_reps");
        if (repsEx.exists) {
          const { data } = await supabase.from("sales_reps").select("rep_name,active").eq("active", true).order("rep_name");
          const names = (data ?? []).map((r) => String(r.rep_name ?? "").trim()).filter(Boolean);
          if (names.length) reps = names;
        }

        const brEx = await tableExists(supabase, "sales_branches");
        if (brEx.exists) {
          const { data } = await supabase.from("sales_branches").select("branch_name,active").eq("active", true).order("branch_name");
          const names = (data ?? []).map((r) => String(r.branch_name ?? "").trim()).filter(Boolean);
          if (names.length) branches = names;
        }

        res.json({
          ok: true,
          reps,
          branches,
          houseOptions: HOUSE_OPTIONS
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/sales-account-mapping/coverage",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const organizationId = resolveAdminOrganizationId(req);
        const coverage = await loadSalesAttributionCoverage(supabase, { organizationId });
        res.json({ ok: true, organization_id: organizationId || null, coverage });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/sales-account-mapping/suggestions",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const limitRaw = Number(req.query.limit ?? 100);
        const offsetRaw = Number(req.query.offset ?? 0);
        const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));
        const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
        const sortBy = String(req.query.sortBy ?? "sqft");
        const sortDir = String(req.query.sortDir ?? "desc");

        const supabase = supabaseGetter();
        const organizationId = resolveAdminOrganizationId(req);
        const coverage = await loadSalesAttributionCoverage(supabase, { organizationId });
        const suggestions = await tryReadLatestSuggestionsJson();
        let rows = (coverage.reviewRows ?? []).map(buildBrainCoverageSuggestionRow);
        rows = mergeSuggestionEnrichment(rows, suggestions.payload?.suggestions ?? []);

        rows = applyFilters(rows, req.query);
        rows = sortRows(rows, sortBy, sortDir);

        const total = rows.length;
        const page = rows.slice(offset, offset + limit);

        res.json({
          ok: true,
          source: {
            primary: "brain_latest_moraware_sync_coverage",
            optionalSuggestionsPath: suggestions.path,
            optionalSuggestionsMissing: Boolean(suggestions.missing),
            generatedAt: suggestions.payload?.generatedAt ?? null,
            latestImportGroupId: coverage.latest_import_group_id ?? null
          },
          total,
          limit,
          offset,
          rows: page
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/sales-account-mapping/master-accounts",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const exists = await tableExists(supabase, "sales_account_master");
        const limitRaw = Number(req.query.limit ?? 100);
        const offsetRaw = Number(req.query.offset ?? 0);
        const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));
        const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
        const search = String(req.query.search ?? "").trim().toLowerCase();
        const salesperson = String(req.query.salesperson ?? "").trim();
        const branch = String(req.query.branch ?? "").trim();

        if (!exists.exists) {
          return res.json({
            ok: true,
            source: "missing_table_fallback",
            total: 0,
            limit,
            offset,
            rows: [],
            message: "sales_account_master table missing. Install schema to search master accounts."
          });
        }

        let q = supabase
          .from("sales_account_master")
          .select("id,monday_account_name,normalized_account_name,sales_executive,branch,account_status,account_type,source,source_account_id,imported_at,updated_at", {
            count: "exact"
          });
        if (search) {
          // Use ilike on monday_account_name (safe default).
          q = q.ilike("monday_account_name", `%${search}%`);
        }
        if (salesperson) q = q.eq("sales_executive", salesperson);
        if (branch) q = q.eq("branch", branch);

        q = q.order("monday_account_name", { ascending: true }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        res.json({ ok: true, source: "sales_account_master", total: count ?? (data?.length ?? 0), limit, offset, rows: data ?? [] });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/sales-account-mapping/audit-history",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const morawareAccountName = normalizeSpaces(req.query.morawareAccountName);
        const salesAccountMasterId = normalizeSpaces(req.query.salesAccountMasterId);
        const out = { ok: true, aliases: [], assignments: [], history: [] };

        const aliasEx = await tableExists(supabase, "sales_account_aliases");
        if (aliasEx.exists) {
          let q = supabase
            .from("sales_account_aliases")
            .select("id,approved,moraware_account_name,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at,raw_suggestion,sales_account_master_id")
            .order("updated_at", { ascending: false })
            .limit(50);
          if (morawareAccountName) {
            const norm = normalizeAccountNameWithoutLocationPrefix(morawareAccountName);
            q = q.eq("normalized_moraware_name", norm);
          }
          if (salesAccountMasterId) q = q.eq("sales_account_master_id", salesAccountMasterId);
          const { data, error } = await q;
          if (!error) out.aliases = data ?? [];
        }

        const asgEx = await tableExists(supabase, "sales_account_assignments");
        if (asgEx.exists && salesAccountMasterId) {
          const { data } = await supabase
            .from("sales_account_assignments")
            .select("id,sales_account_master_id,assigned_salesperson,branch,assignment_type,active,approved,effective_start_date,effective_end_date,approved_at,notes,created_at,updated_at")
            .eq("sales_account_master_id", salesAccountMasterId)
            .order("created_at", { ascending: false })
            .limit(50);
          out.assignments = data ?? [];
        }

        const histEx = await tableExists(supabase, "sales_account_assignment_history");
        if (histEx.exists && salesAccountMasterId) {
          const { data } = await supabase
            .from("sales_account_assignment_history")
            .select("id,sales_account_master_id,old_salesperson,new_salesperson,old_branch,new_branch,changed_by,changed_at,reason,raw_json")
            .eq("sales_account_master_id", salesAccountMasterId)
            .order("changed_at", { ascending: false })
            .limit(100);
          out.history = data ?? [];
        }

        res.json(out);
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  async function ensureSchemaOr412(res, supabase, neededTables) {
    const missing = [];
    for (const t of neededTables) {
      const ex = await tableExists(supabase, t);
      if (!ex.exists) missing.push(t);
    }
    if (missing.length) {
      res.status(412).json({
        ok: false,
        error: "Sales attribution schema is not installed.",
        missingTables: missing,
        sqlPath: "backend-core/supabase/sales_account_attribution.sql"
      });
      return false;
    }
    return true;
  }

  app.post(
    "/api/admin/sales-account-mapping/approve",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    jsonParser,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const okSchema = await ensureSchemaOr412(res, supabase, ["sales_account_aliases", "sales_account_master", "sales_account_assignments", "sales_account_assignment_history"]);
        if (!okSchema) return;

        const morawareAccountName = normalizeSpaces(req.body?.morawareAccountName);
        const mondayAccountName = normalizeSpaces(req.body?.mondayAccountName);
        const salesAccountMasterId = normalizeSpaces(req.body?.salesAccountMasterId);
        const assignedSalespersonRaw = normalizeSpaces(req.body?.assignedSalesperson);
        const branch = normalizeSpaces(req.body?.branch);
        const matchType = normalizeSpaces(req.body?.matchType) || "manual";
        const confidence = normalizeSpaces(req.body?.confidence) || "high";
        const notes = normalizeSpaces(req.body?.notes);

        if (!morawareAccountName) return res.status(400).json({ ok: false, error: "morawareAccountName required" });
        if (!mondayAccountName && !salesAccountMasterId) {
          return res.status(400).json({ ok: false, error: "mondayAccountName or salesAccountMasterId required" });
        }
        const repCheck = mustBeAdminRepOrHouseOrUnmapped(assignedSalespersonRaw);
        if (!repCheck.ok) return res.status(400).json({ ok: false, error: repCheck.error });
        if (!branch) return res.status(400).json({ ok: false, error: "branch required" });

        const normMoraware = normalizeAccountNameWithoutLocationPrefix(morawareAccountName);

        // Resolve master id if not provided.
        let masterId = salesAccountMasterId || null;
        let resolvedMaster = null;
        if (!masterId) {
          const normMonday = normalizeAccountName(mondayAccountName);
          const { data, error } = await supabase
            .from("sales_account_master")
            .select("id,monday_account_name,normalized_account_name")
            .eq("normalized_account_name", normMonday)
            .limit(2);
          if (error) throw error;
          if (data?.length === 1) {
            masterId = String(data[0].id);
            resolvedMaster = data[0];
          }
        }

        // Check existing approved alias for this moraware key.
        const { data: existingAliasRows, error: aliasErr } = await supabase
          .from("sales_account_aliases")
          .select("id,approved,monday_account_name,assigned_salesperson,branch,match_type,notes,sales_account_master_id,normalized_moraware_name")
          .eq("normalized_moraware_name", normMoraware)
          .order("updated_at", { ascending: false })
          .limit(5);
        if (aliasErr) throw aliasErr;
        const existingApproved = (existingAliasRows ?? []).find((r) => r.approved === true) || null;

        const changingApproved =
          existingApproved &&
          (String(existingApproved.monday_account_name ?? "") !== mondayAccountName ||
            String(existingApproved.assigned_salesperson ?? "") !== repCheck.value ||
            String(existingApproved.branch ?? "") !== branch ||
            String(existingApproved.sales_account_master_id ?? "") !== String(masterId ?? ""));

        if (changingApproved && !notes) {
          return res.status(400).json({ ok: false, error: "notes/reason required when changing an existing approved mapping" });
        }

        // Upsert alias: we insert a new row (append) to preserve history, but keep approved uniqueness by normalized key.
        // If overwriteApproved is needed later, enforce via a separate explicit control — v1 uses append + updated data selection.
        const aliasRow = {
          moraware_account_name: morawareAccountName,
          normalized_moraware_name: normMoraware,
          sales_account_master_id: masterId,
          monday_account_name: mondayAccountName || resolvedMaster?.monday_account_name || null,
          normalized_monday_name: mondayAccountName ? normalizeAccountName(mondayAccountName) : null,
          assigned_salesperson: repCheck.value,
          branch,
          match_type: matchType,
          confidence,
          approved: true,
          notes: notes || "Approved via Sales Account Mapping Admin"
        };

        const { data: aliasInserted, error: insErr } = await supabase
          .from("sales_account_aliases")
          .insert(aliasRow)
          .select(
            "id,approved,moraware_account_name,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at,sales_account_master_id"
          )
          .limit(1);
        if (insErr) throw insErr;

        // Create/update assignment for master id if available.
        let assignmentOut = null;
        if (masterId) {
          const { data: activeAsg, error: asgErr } = await supabase
            .from("sales_account_assignments")
            .select("id,sales_account_master_id,assigned_salesperson,branch,assignment_type,active,approved,effective_start_date,effective_end_date")
            .eq("sales_account_master_id", masterId)
            .eq("assignment_type", "current_owner")
            .eq("active", true)
            .eq("approved", true)
            .order("created_at", { ascending: false })
            .limit(1);
          if (asgErr) throw asgErr;
          const current = activeAsg?.[0] ?? null;

          const needsNew =
            !current || String(current.assigned_salesperson ?? "") !== repCheck.value || String(current.branch ?? "") !== branch;

          if (needsNew) {
            const now = todayYmd();
            if (current) {
              const { error: closeErr } = await supabase
                .from("sales_account_assignments")
                .update({ active: false, effective_end_date: now, updated_at: new Date().toISOString() })
                .eq("id", current.id);
              if (closeErr) throw closeErr;
            }

            const { data: newAsg, error: newErr } = await supabase
              .from("sales_account_assignments")
              .insert({
                sales_account_master_id: masterId,
                assigned_salesperson: repCheck.value,
                branch,
                assignment_type: "current_owner",
                effective_start_date: now,
                active: true,
                approved: true,
                approved_at: new Date().toISOString(),
                notes: notes || "Approved via Sales Account Mapping Admin"
              })
              .select(
                "id,sales_account_master_id,assigned_salesperson,branch,assignment_type,active,approved,effective_start_date,effective_end_date,approved_at,notes,created_at"
              )
              .limit(1);
            if (newErr) throw newErr;
            assignmentOut = newAsg?.[0] ?? null;

            await supabase.from("sales_account_assignment_history").insert({
              sales_account_master_id: masterId,
              old_salesperson: current ? String(current.assigned_salesperson ?? "") : null,
              new_salesperson: repCheck.value,
              old_branch: current ? String(current.branch ?? "") : null,
              new_branch: branch,
              changed_by: req.user?.id ?? null,
              reason: notes || "Approved via Sales Account Mapping Admin",
              raw_json: { current, next: assignmentOut, alias: aliasInserted?.[0] ?? null }
            });
          } else {
            assignmentOut = current;
          }
        }

        res.json({ ok: true, alias: aliasInserted?.[0] ?? null, assignment: assignmentOut });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.post(
    "/api/admin/sales-account-mapping/reject",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    jsonParser,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const okSchema = await ensureSchemaOr412(res, supabase, ["sales_account_aliases"]);
        if (!okSchema) return;

        const morawareAccountName = normalizeSpaces(req.body?.morawareAccountName);
        const reason = normalizeSpaces(req.body?.reason);
        if (!morawareAccountName) return res.status(400).json({ ok: false, error: "morawareAccountName required" });
        if (!reason) return res.status(400).json({ ok: false, error: "reason required" });
        const normMoraware = normalizeAccountNameWithoutLocationPrefix(morawareAccountName);

        const { data, error } = await supabase
          .from("sales_account_aliases")
          .insert({
            moraware_account_name: morawareAccountName,
            normalized_moraware_name: normMoraware,
            match_type: "rejected",
            confidence: "high",
            approved: false,
            notes: reason
          })
          .select(
            "id,approved,moraware_account_name,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at"
          )
          .limit(1);
        if (error) throw error;
        res.json({ ok: true, alias: data?.[0] ?? null });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.post(
    "/api/admin/sales-account-mapping/mark-unmapped",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    jsonParser,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const okSchema = await ensureSchemaOr412(res, supabase, ["sales_account_aliases"]);
        if (!okSchema) return;

        const morawareAccountName = normalizeSpaces(req.body?.morawareAccountName);
        const reason = normalizeSpaces(req.body?.reason);
        if (!morawareAccountName) return res.status(400).json({ ok: false, error: "morawareAccountName required" });
        if (!reason) return res.status(400).json({ ok: false, error: "reason required" });
        const normMoraware = normalizeAccountNameWithoutLocationPrefix(morawareAccountName);

        const { data, error } = await supabase
          .from("sales_account_aliases")
          .insert({
            moraware_account_name: morawareAccountName,
            normalized_moraware_name: normMoraware,
            assigned_salesperson: "Unmapped",
            branch: "Unmapped",
            match_type: "intentional_unmapped",
            confidence: "high",
            approved: true,
            notes: reason
          })
          .select(
            "id,approved,moraware_account_name,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at"
          )
          .limit(1);
        if (error) throw error;
        res.json({ ok: true, alias: data?.[0] ?? null });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.post(
    "/api/admin/sales-account-mapping/assign-house",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    jsonParser,
    async (req, res) => {
      try {
        const supabase = supabaseGetter();
        const okSchema = await ensureSchemaOr412(res, supabase, ["sales_account_aliases", "sales_account_assignments", "sales_account_assignment_history"]);
        if (!okSchema) return;

        const morawareAccountName = normalizeSpaces(req.body?.morawareAccountName);
        const houseAccountName = normalizeSpaces(req.body?.houseAccountName);
        const branch = normalizeSpaces(req.body?.branch);
        const notes = normalizeSpaces(req.body?.notes);
        const salesAccountMasterId = normalizeSpaces(req.body?.salesAccountMasterId);

        if (!morawareAccountName) return res.status(400).json({ ok: false, error: "morawareAccountName required" });
        if (!houseAccountName) return res.status(400).json({ ok: false, error: "houseAccountName required" });
        if (!HOUSE_OPTIONS.includes(houseAccountName) || ACTIVE_SALES_REPS.includes(houseAccountName)) {
          return res.status(400).json({ ok: false, error: `houseAccountName must be one of: ${HOUSE_OPTIONS.join(", ")}` });
        }
        if (!branch) return res.status(400).json({ ok: false, error: "branch required" });
        if (!notes) return res.status(400).json({ ok: false, error: "notes required" });

        const normMoraware = normalizeAccountNameWithoutLocationPrefix(morawareAccountName);
        const aliasRow = {
          moraware_account_name: morawareAccountName,
          normalized_moraware_name: normMoraware,
          sales_account_master_id: salesAccountMasterId || null,
          assigned_salesperson: houseAccountName,
          branch,
          match_type: "house_assignment",
          confidence: "high",
          approved: true,
          notes
        };

        const { data, error } = await supabase
          .from("sales_account_aliases")
          .insert(aliasRow)
          .select(
            "id,approved,moraware_account_name,normalized_moraware_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at"
          )
          .limit(1);
        if (error) throw error;

        // Optional assignment if master id provided.
        if (salesAccountMasterId) {
          const now = todayYmd();
          const { data: activeAsg } = await supabase
            .from("sales_account_assignments")
            .select("id,assigned_salesperson,branch")
            .eq("sales_account_master_id", salesAccountMasterId)
            .eq("assignment_type", "current_owner")
            .eq("active", true)
            .eq("approved", true)
            .order("created_at", { ascending: false })
            .limit(1);
          const current = activeAsg?.[0] ?? null;
          if (current) {
            await supabase
              .from("sales_account_assignments")
              .update({ active: false, effective_end_date: now, updated_at: new Date().toISOString() })
              .eq("id", current.id);
          }
          const { data: newAsg } = await supabase
            .from("sales_account_assignments")
            .insert({
              sales_account_master_id: salesAccountMasterId,
              assigned_salesperson: houseAccountName,
              branch,
              assignment_type: "current_owner",
              effective_start_date: now,
              active: true,
              approved: true,
              approved_at: new Date().toISOString(),
              notes
            })
            .select("id,sales_account_master_id,assigned_salesperson,branch,assignment_type,active,approved,effective_start_date,effective_end_date,approved_at,notes")
            .limit(1);
          await supabase.from("sales_account_assignment_history").insert({
            sales_account_master_id: salesAccountMasterId,
            old_salesperson: current ? String(current.assigned_salesperson ?? "") : null,
            new_salesperson: houseAccountName,
            old_branch: current ? String(current.branch ?? "") : null,
            new_branch: branch,
            changed_by: req.user?.id ?? null,
            reason: notes,
            raw_json: { current, next: newAsg?.[0] ?? null, alias: data?.[0] ?? null }
          });
          return res.json({ ok: true, alias: data?.[0] ?? null, assignment: newAsg?.[0] ?? null });
        }

        res.json({ ok: true, alias: data?.[0] ?? null, assignment: null });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );
}

