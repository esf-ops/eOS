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

function dateKey(dateLike) {
  const s = String(dateLike ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
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
      branch: row.branch || null
    };
  }
  return {
    attributionStatus: "raw_unattributed",
    canonicalAccountName: null,
    assignedSalesperson: null,
    branch: "Unmapped / Needs Review"
  };
}

export function buildCompanyWideSqftActuals(jobs, { attributionCoverage = null } = {}) {
  const coverageMaps = coverageByAccount(attributionCoverage);
  const monthly = new Map();
  const accounts = new Map();
  const extractionSources = new Map();
  let totalSyncedSqft = 0;
  let jobsWithSqft = 0;
  let oldest = "";
  let newest = "";

  for (const job of jobs) {
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

    const month = monthKey(job.created_at_source || job.modified_at_source);
    const m = monthly.get(month) || { month, total_sqft: 0, job_count: 0, jobs_with_sqft: 0 };
    m.total_sqft += extracted.totalSqft;
    m.job_count += 1;
    m.jobs_with_sqft += 1;
    monthly.set(month, m);

    const key = accountKey(job);
    const attr = approvedAttributionForJob(job, coverageMaps);
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
        branch: attr.branch
      });
    a.total_sqft += extracted.totalSqft;
    a.job_count += 1;
    a.jobs_with_sqft += 1;
    accounts.set(key, a);
  }

  const totalJobsEvaluated = jobs.length;
  const jobsMissingSqft = Math.max(0, totalJobsEvaluated - jobsWithSqft);
  const extractionStatus = jobsWithSqft > 0 ? "available" : "pending";

  return {
    source: "brain_moraware_jobs.raw_payload.forms[].fields[]",
    extraction_status: extractionStatus,
    total_synced_sqft: Math.round(totalSyncedSqft * 100) / 100,
    total_jobs_evaluated: totalJobsEvaluated,
    jobs_with_sqft: jobsWithSqft,
    jobs_missing_sqft: jobsMissingSqft,
    sqft_coverage_pct: totalJobsEvaluated > 0 ? (jobsWithSqft / totalJobsEvaluated) * 100 : null,
    average_sqft_per_job: jobsWithSqft > 0 ? totalSyncedSqft / jobsWithSqft : null,
    date_coverage: { oldest_job_created_at: oldest || null, newest_job_created_at: newest || null },
    monthly_sqft_trend: [...monthly.values()]
      .map((r) => ({ ...r, total_sqft: Math.round(r.total_sqft * 100) / 100 }))
      .sort((a, b) => String(a.month).localeCompare(String(b.month))),
    top_raw_accounts_by_sqft: [...accounts.values()]
      .map((r) => ({ ...r, total_sqft: Math.round(r.total_sqft * 100) / 100 }))
      .sort((a, b) => b.total_sqft - a.total_sqft || b.job_count - a.job_count)
      .slice(0, 12),
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
