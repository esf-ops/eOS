import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";

const SQFT_LABEL_RE = /^(sq\.?\s*ft\.?|square\s*(feet|foot|ft)|total\s*sq\.?\s*ft\.?|worksheet\s*sq\.?\s*ft\.?)$/i;

function parseSqftNumber(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const cleaned = String(raw)
    .replace(/,/g, "")
    .replace(/\b(sq\.?\s*ft\.?|square\s*(feet|foot|ft))\b/gi, "")
    .trim();
  if (!cleaned) return null;
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function pickFieldValue(field) {
  if (!field || typeof field !== "object") return null;
  return (
    parseSqftNumber(field.numericValue) ??
    parseSqftNumber(field.value) ??
    parseSqftNumber(field.answer) ??
    parseSqftNumber(field.text) ??
    parseSqftNumber(field.numberValue)
  );
}

function isSqftField(field) {
  if (!field || typeof field !== "object") return false;
  const labels = [field.normalizedLabel, field.label, field.name, field.fieldName]
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean);
  return labels.some((label) => SQFT_LABEL_RE.test(label));
}

function isWorksheetForm(form) {
  const text = [form?.formTemplateName, form?.templateName, form?.formName, form?.name].join(" ").toLowerCase();
  return text.includes("worksheet");
}

function fieldsForForm(form) {
  if (!form || typeof form !== "object") return [];
  if (Array.isArray(form.fields)) return form.fields;
  if (form.fieldsByLabel && typeof form.fieldsByLabel === "object") return Object.values(form.fieldsByLabel);
  return [];
}

export function extractSqftFromMorawareJob(job) {
  const raw = job?.raw_payload && typeof job.raw_payload === "object" ? job.raw_payload : {};
  const forms = Array.isArray(raw.forms) ? raw.forms : [];
  const matches = [];

  for (const form of forms) {
    const worksheet = isWorksheetForm(form);
    for (const field of fieldsForForm(form)) {
      if (!isSqftField(field)) continue;
      const value = pickFieldValue(field);
      if (value == null) continue;
      matches.push({
        sqft: value,
        confidence: worksheet ? "high" : "medium",
        source: "brain_moraware_jobs.raw_payload.forms[].fields[]",
        label: String(field.normalizedLabel || field.label || "Sq.Ft."),
        formName: String(form.formName || form.name || ""),
        formTemplateName: String(form.formTemplateName || form.templateName || ""),
        formId: String(form.id || field.formId || "")
      });
    }
  }

  const totalSqft = matches.reduce((sum, m) => sum + m.sqft, 0);
  return {
    totalSqft,
    hasSqft: totalSqft > 0,
    confidence: matches.some((m) => m.confidence === "high") ? "high" : matches.length ? "medium" : "none",
    fieldCount: matches.length,
    sources: matches
  };
}

function monthKey(dateLike) {
  const s = String(dateLike ?? "");
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : "Undated";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymdLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(raw) {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

function addDays(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function dateKey(dateLike) {
  const s = String(dateLike ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

function startOfWeekMonday(d) {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(d, offset);
}

function quarterNumber(d) {
  return Math.floor(d.getMonth() / 3) + 1;
}

function startOfQuarter(d) {
  return new Date(d.getFullYear(), (quarterNumber(d) - 1) * 3, 1);
}

function endOfQuarter(d) {
  return new Date(d.getFullYear(), quarterNumber(d) * 3, 0);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function clampRange(startDate, endDate) {
  if (startDate <= endDate) return { startDate, endDate };
  return { startDate: endDate, endDate: startDate };
}

function resolveDateRange(raw, today = new Date()) {
  const presetRaw = String(raw?.datePreset ?? "ytd").trim().toLowerCase();
  const datePreset = ["ytd", "quarter", "month", "week", "day", "custom"].includes(presetRaw) ? presetRaw : "ytd";
  const year = Number.parseInt(String(raw?.year ?? today.getFullYear()), 10);
  const safeYear = Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : today.getFullYear();
  const selectedQuarter = Number.parseInt(String(raw?.quarter ?? quarterNumber(today)), 10);
  const safeQuarter = Number.isFinite(selectedQuarter) && selectedQuarter >= 1 && selectedQuarter <= 4 ? selectedQuarter : quarterNumber(today);
  const selectedMonth = Number.parseInt(String(raw?.month ?? today.getMonth() + 1), 10);
  const safeMonth = Number.isFinite(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12 ? selectedMonth : today.getMonth() + 1;

  let start = new Date(today.getFullYear(), 0, 1);
  let end = today;
  if (datePreset === "quarter") {
    const anchor = new Date(safeYear, (safeQuarter - 1) * 3, 1);
    start = startOfQuarter(anchor);
    end = endOfQuarter(anchor);
    if (safeYear === today.getFullYear() && safeQuarter === quarterNumber(today) && end > today) end = today;
  } else if (datePreset === "month") {
    start = new Date(safeYear, safeMonth - 1, 1);
    end = endOfMonth(start);
    if (safeYear === today.getFullYear() && safeMonth === today.getMonth() + 1 && end > today) end = today;
  } else if (datePreset === "week") {
    start = startOfWeekMonday(today);
    end = today;
  } else if (datePreset === "day") {
    const selected = parseYmd(raw?.startDate) || parseYmd(raw?.endDate) || today;
    start = selected;
    end = selected;
  } else if (datePreset === "custom") {
    start = parseYmd(raw?.startDate) || start;
    end = parseYmd(raw?.endDate) || end;
  }
  const clamped = clampRange(ymdLocal(start), ymdLocal(end));
  return { datePreset, startDate: clamped.startDate, endDate: clamped.endDate };
}

function normalizeEnum(raw, allowed, fallback) {
  const s = String(raw ?? "").trim().toLowerCase();
  return allowed.includes(s) ? s : fallback;
}

export function parseSqftActualsFilters(raw = {}) {
  const range = resolveDateRange(raw);
  return {
    ...range,
    timeGrain: normalizeEnum(raw.timeGrain, ["year", "quarter", "month", "week", "day"], "month"),
    account: String(raw.account ?? "").trim(),
    branch: String(raw.branch ?? "").trim(),
    salesperson: String(raw.salesperson ?? "").trim(),
    status: String(raw.status ?? raw.jobStatus ?? "").trim(),
    process: String(raw.process ?? "").trim(),
    attributionStatus: normalizeEnum(raw.attributionStatus, ["approved", "unmapped", "needs_review", "all"], "all"),
    sortBy: normalizeEnum(raw.sortBy, ["sqft", "jobs", "account", "date", "attribution_status"], "sqft"),
    sortDirection: normalizeEnum(raw.sortDirection ?? raw.sortDir, ["asc", "desc"], "desc")
  };
}

function accountKey(job) {
  const sourceId = String(job.source_account_id ?? "").trim();
  const name = String(job.account_name ?? "").trim();
  return sourceId || normalizeAccountNameWithoutLocationPrefix(name) || name || "(unknown)";
}

function coverageByAccount(attributionCoverage) {
  const bySourceId = new Map();
  const byNorm = new Map();
  for (const row of attributionCoverage?.reviewRows ?? []) {
    const sourceId = String(row.sourceAccountId ?? "").trim();
    const norm = String(row.normalizedMorawareName ?? "").trim();
    if (sourceId && !bySourceId.has(sourceId)) bySourceId.set(sourceId, row);
    if (norm && !byNorm.has(norm)) byNorm.set(norm, row);
  }
  return { bySourceId, byNorm };
}

function approvedAttributionForJob(job, coverageMaps) {
  const sourceId = String(job.source_account_id ?? "").trim();
  const norm = normalizeAccountNameWithoutLocationPrefix(job.account_name);
  const row = (sourceId && coverageMaps.bySourceId.get(sourceId)) || (norm && coverageMaps.byNorm.get(norm)) || null;
  if (row?.reviewStatus === "approved_mapped") {
    return {
      attributionStatus: "approved_mapping",
      canonicalAccountName: row.mondayAccountName || row.accountName || null,
      assignedSalesperson: row.assignedSalesperson || null,
      branch: row.branch || null,
      reviewStatus: row.reviewStatus
    };
  }
  return {
    attributionStatus: "raw_unattributed",
    canonicalAccountName: null,
    assignedSalesperson: null,
    branch: "Unmapped / Needs Review",
    reviewStatus: row?.reviewStatus || "needs_review_unmapped"
  };
}

function timeBucket(dateYmd, grain) {
  const d = parseYmd(dateYmd);
  if (!d) return "Undated";
  if (grain === "year") return String(d.getFullYear());
  if (grain === "quarter") return `${d.getFullYear()}-Q${quarterNumber(d)}`;
  if (grain === "week") return ymdLocal(startOfWeekMonday(d));
  if (grain === "day") return dateYmd;
  return monthKey(dateYmd);
}

function jobMatchesFilters(job, attr, filters) {
  const jobDate = dateKey(job.created_at_source || job.modified_at_source);
  if (jobDate && (jobDate < filters.startDate || jobDate > filters.endDate)) return false;
  if (!jobDate) return false;
  const accountNeedle = filters.account.toLowerCase();
  if (accountNeedle) {
    const hay = [job.account_name, job.source_account_id, attr.canonicalAccountName].join(" ").toLowerCase();
    if (!hay.includes(accountNeedle)) return false;
  }
  if (filters.status) {
    const s = String(job.status_name ?? "").toLowerCase();
    if (!s.includes(filters.status.toLowerCase())) return false;
  }
  if (filters.process) {
    const p = String(job.process_name ?? "").toLowerCase();
    if (!p.includes(filters.process.toLowerCase())) return false;
  }
  if (filters.branch) {
    if (attr.attributionStatus !== "approved_mapping") return false;
    if (String(attr.branch ?? "").toLowerCase() !== filters.branch.toLowerCase()) return false;
  }
  if (filters.salesperson) {
    if (attr.attributionStatus !== "approved_mapping") return false;
    if (String(attr.assignedSalesperson ?? "").toLowerCase() !== filters.salesperson.toLowerCase()) return false;
  }
  if (filters.attributionStatus === "approved" && attr.attributionStatus !== "approved_mapping") return false;
  if (filters.attributionStatus === "needs_review" && attr.reviewStatus !== "needs_review_unmapped") return false;
  if (filters.attributionStatus === "unmapped" && attr.reviewStatus !== "rejected_ignored") return false;
  return true;
}

function sortAccountRows(rows, filters) {
  const dir = filters.sortDirection === "asc" ? 1 : -1;
  const cmpText = (a, b) => String(a).localeCompare(String(b)) * dir;
  return rows.sort((a, b) => {
    if (filters.sortBy === "jobs") return (a.job_count - b.job_count) * dir || cmpText(a.account_name, b.account_name);
    if (filters.sortBy === "account") return cmpText(a.account_name, b.account_name);
    if (filters.sortBy === "date") return cmpText(a.last_job_date || "", b.last_job_date || "");
    if (filters.sortBy === "attribution_status") return cmpText(a.attribution_status, b.attribution_status);
    return (a.total_sqft - b.total_sqft) * dir || (a.job_count - b.job_count) * dir;
  });
}

function filteredAttributionCoverage(accountRows, totalJobsWithSqft) {
  const totalAccounts = accountRows.length;
  const approvedAccounts = accountRows.filter((r) => r.attribution_status === "approved_mapping").length;
  const approvedJobs = accountRows
    .filter((r) => r.attribution_status === "approved_mapping")
    .reduce((sum, r) => sum + r.jobs_with_sqft, 0);
  return {
    totalAccountsSeen: totalAccounts,
    approvedMappedAccounts: approvedAccounts,
    needsReviewUnmappedAccounts: Math.max(0, totalAccounts - approvedAccounts),
    totalJobsSeen: totalJobsWithSqft,
    approvedMappedJobs: approvedJobs,
    needsReviewUnmappedJobs: Math.max(0, totalJobsWithSqft - approvedJobs),
    approvedAccountCoveragePct: totalAccounts > 0 ? (approvedAccounts / totalAccounts) * 100 : null,
    approvedJobCoveragePct: totalJobsWithSqft > 0 ? (approvedJobs / totalJobsWithSqft) * 100 : null
  };
}

export function buildCompanyWideSqftActuals(jobs, { attributionCoverage = null, filters: rawFilters = {} } = {}) {
  const filters = parseSqftActualsFilters(rawFilters);
  const coverageMaps = coverageByAccount(attributionCoverage);
  const trend = new Map();
  const accounts = new Map();
  const extractionSources = new Map();
  let totalSyncedSqft = 0;
  let jobsWithSqft = 0;
  let totalJobsEvaluated = 0;
  let oldest = "";
  let newest = "";

  for (const job of jobs) {
    const attr = approvedAttributionForJob(job, coverageMaps);
    if (!jobMatchesFilters(job, attr, filters)) continue;
    totalJobsEvaluated += 1;
    const extracted = extractSqftFromMorawareJob(job);
    const jobDate = dateKey(job.created_at_source || job.modified_at_source);
    if (jobDate) {
      if (!oldest || jobDate < oldest) oldest = jobDate;
      if (!newest || jobDate > newest) newest = jobDate;
    }
    if (!extracted.hasSqft) continue;

    jobsWithSqft += 1;
    totalSyncedSqft += extracted.totalSqft;
    for (const src of extracted.sources) {
      const key = `${src.source}|${src.label}|${src.formTemplateName}`;
      const slot = extractionSources.get(key) || {
        source: src.source,
        label: src.label,
        formTemplateName: src.formTemplateName,
        count: 0,
        confidence: src.confidence
      };
      slot.count += 1;
      extractionSources.set(key, slot);
    }

    const period = timeBucket(jobDate, filters.timeGrain);
    const m = trend.get(period) || { period, total_sqft: 0, job_count: 0, jobs_with_sqft: 0 };
    m.total_sqft += extracted.totalSqft;
    m.job_count += 1;
    m.jobs_with_sqft += 1;
    trend.set(period, m);

    const key = accountKey(job);
    const a =
      accounts.get(key) ||
      ({
        account_name: String(job.account_name ?? "").trim() || "(unknown)",
        source_account_id: String(job.source_account_id ?? "").trim() || null,
        total_sqft: 0,
        job_count: 0,
        jobs_with_sqft: 0,
        attribution_status: attr.attributionStatus,
        canonical_account_name: attr.canonicalAccountName,
        assigned_salesperson: attr.assignedSalesperson,
        branch: attr.branch,
        first_job_date: jobDate || null,
        last_job_date: jobDate || null
      });
    a.total_sqft += extracted.totalSqft;
    a.job_count += 1;
    a.jobs_with_sqft += 1;
    if (jobDate && (!a.first_job_date || jobDate < a.first_job_date)) a.first_job_date = jobDate;
    if (jobDate && (!a.last_job_date || jobDate > a.last_job_date)) a.last_job_date = jobDate;
    accounts.set(key, a);
  }

  const jobsMissingSqft = Math.max(0, totalJobsEvaluated - jobsWithSqft);
  const extractionStatus = jobsWithSqft > 0 ? "available" : "pending";
  const accountRows = [...accounts.values()].map((r) => ({ ...r, total_sqft: Math.round(r.total_sqft * 100) / 100 }));

  return {
    source: "brain_moraware_jobs.raw_payload.forms[].fields[]",
    extraction_status: extractionStatus,
    active_filters: filters,
    total_synced_sqft: Math.round(totalSyncedSqft * 100) / 100,
    total_jobs_evaluated: totalJobsEvaluated,
    jobs_with_sqft: jobsWithSqft,
    jobs_missing_sqft: jobsMissingSqft,
    sqft_coverage_pct: totalJobsEvaluated > 0 ? (jobsWithSqft / totalJobsEvaluated) * 100 : null,
    average_sqft_per_job: jobsWithSqft > 0 ? totalSyncedSqft / jobsWithSqft : null,
    date_coverage: { oldest_job_created_at: oldest || null, newest_job_created_at: newest || null },
    grouped_sqft_trend: [...trend.values()]
      .map((r) => ({ ...r, total_sqft: Math.round(r.total_sqft * 100) / 100 }))
      .sort((a, b) => String(a.period).localeCompare(String(b.period))),
    monthly_sqft_trend: [...trend.values()]
      .map((r) => ({ month: r.period, total_sqft: Math.round(r.total_sqft * 100) / 100, job_count: r.job_count, jobs_with_sqft: r.jobs_with_sqft }))
      .sort((a, b) => String(a.month).localeCompare(String(b.month))),
    top_raw_accounts_by_sqft: sortAccountRows(accountRows, filters).slice(0, 12),
    filtered_attribution_coverage: filteredAttributionCoverage(accountRows, jobsWithSqft),
    gated_filter_warning:
      filters.branch || filters.salesperson
        ? "Branch and salesperson filters use approved Sales Account Mapping rows only; unmapped accounts are excluded from those filtered totals."
        : null,
    extraction_sources: [...extractionSources.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    notes:
      extractionStatus === "available"
        ? [
            "Company-wide sqft totals include every synced job with a valid Job Worksheet Sq.Ft. field.",
            "Branch, salesperson, and account-owner totals remain gated by approved Sales Account Mapping rows."
          ]
        : [
            "Sq.Ft. extraction pending: no valid numeric Job Worksheet Sq.Ft. fields were found in the current synced payloads.",
            "Next parser step: include Job Worksheet form fields with label/normalizedLabel and numericValue in Moraware sync payloads."
          ]
  };
}
