/**
 * Candidate governed metric: COMPLETED_INSTALLATION_SF.
 *
 * Production crediting is blocked until prepared facts expose a worksheet-row
 * completed first-install event and date. Job-level install/completed timestamps
 * and created/modified/invoice dates are rejected proxies.
 */

/**
 * Exact writer-contract columns for `sales_moraware_job_worksheet_facts`.
 * Keep in lockstep with WORKSHEET_FACTS_WRITER_COLUMNS. No install/first-install fields.
 */
export const OBSERVED_WORKSHEET_FACT_COLUMNS = Object.freeze([
  "organization_id",
  "import_group_id",
  "sync_run_id",
  "source_account_id",
  "source_job_id",
  "source_form_id",
  "form_name_raw",
  "room_raw",
  "color_raw",
  "color_is_placeholder",
  "sqft",
  "edge_raw",
  "thickness_raw",
  "backsplash_type_raw",
  "backsplash_height_raw",
  "sink_type_raw",
  "faucet_type_raw",
  "stove_type_raw",
  "electrical_cutouts_raw",
  "overhang_raw",
  "braces_raw",
  "dry_treat_raw",
  "stone_care_kit_raw",
  "updated_at"
]);

export const COMPLETED_INSTALLATION_SF = "COMPLETED_INSTALLATION_SF";
export const COMPLETED_FIRST_INSTALL_EVENT = "completed_first_install";

export const REQUIRED_COMPLETED_INSTALLATION_EVIDENCE = Object.freeze({
  jobIdentity: "sales_moraware_job_worksheet_facts.source_job_id",
  formIdentity: "sales_moraware_job_worksheet_facts.source_form_id",
  squareFeet: "sales_moraware_job_worksheet_facts.sqft",
  completedFirstInstallEvent: "worksheet-row completed first-install event/status",
  completedFirstInstallDate: "earliest completed first-install date on the worksheet row"
});

export const REJECTED_SF_PROXIES = Object.freeze([
  "created_at_source",
  "modified_at_source",
  "install_at_source",
  "completed_at_source",
  "invoice_date",
  "sales_dashboard_report_date",
  "job_level_install_or_completed_date"
]);

const WORKSHEET_HAS_JOB = OBSERVED_WORKSHEET_FACT_COLUMNS.includes("source_job_id");
const WORKSHEET_HAS_FORM = OBSERVED_WORKSHEET_FACT_COLUMNS.includes("source_form_id");
const WORKSHEET_HAS_SQFT = OBSERVED_WORKSHEET_FACT_COLUMNS.includes("sqft");

function looksLikeInstallDateColumn(name) {
  const n = String(name || "").toLowerCase();
  return /first.?install|completed.?first.?install|install.?complete/.test(n);
}

function looksLikeInstallEventColumn(name) {
  const n = String(name || "").toLowerCase();
  return /first.?install|install.?complete|completed.?install/.test(n) && /event|status/.test(n);
}

/**
 * Evaluate live/prepared worksheet columns against the candidate definition.
 * Does not infer missing names. Does not treat job-level dates as a substitute.
 */
export function evaluateCompletedInstallationSupport({
  worksheetColumns = OBSERVED_WORKSHEET_FACT_COLUMNS,
  jobColumns = [],
  worksheetFirstInstallDateColumn = null,
  worksheetFirstInstallEventColumn = null
} = {}) {
  const cols = new Set((worksheetColumns || []).map(String));
  const missing = [];
  if (!cols.has("source_job_id")) missing.push(REQUIRED_COMPLETED_INSTALLATION_EVIDENCE.jobIdentity);
  if (!cols.has("source_form_id")) missing.push(REQUIRED_COMPLETED_INSTALLATION_EVIDENCE.formIdentity);
  if (!cols.has("sqft")) missing.push(REQUIRED_COMPLETED_INSTALLATION_EVIDENCE.squareFeet);

  const dateCol = worksheetFirstInstallDateColumn && cols.has(worksheetFirstInstallDateColumn)
    ? worksheetFirstInstallDateColumn
    : [...cols].find(looksLikeInstallDateColumn) || null;
  const eventCol = worksheetFirstInstallEventColumn && cols.has(worksheetFirstInstallEventColumn)
    ? worksheetFirstInstallEventColumn
    : [...cols].find(looksLikeInstallEventColumn) || null;

  if (!dateCol) missing.push(REQUIRED_COMPLETED_INSTALLATION_EVIDENCE.completedFirstInstallDate);
  if (!eventCol) missing.push(REQUIRED_COMPLETED_INSTALLATION_EVIDENCE.completedFirstInstallEvent);

  const jobHasInstallProxy = (jobColumns || []).some((c) =>
    ["install_at_source", "completed_at_source"].includes(String(c))
  );

  return {
    metric: COMPLETED_INSTALLATION_SF,
    supported: missing.length === 0,
    missing,
    observedWorksheetColumns: [...cols],
    observedDateColumn: dateCol,
    observedEventColumn: eventCol,
    jobLevelInstallProxyPresent: jobHasInstallProxy,
    rejectedProxies: REJECTED_SF_PROXIES,
    writerContractHasJobFormSqft: WORKSHEET_HAS_JOB && WORKSHEET_HAS_FORM && WORKSHEET_HAS_SQFT
  };
}

export const PRODUCTION_COMPLETED_INSTALLATION_SUPPORT = evaluateCompletedInstallationSupport({
  worksheetColumns: OBSERVED_WORKSHEET_FACT_COLUMNS,
  jobColumns: ["install_at_source", "completed_at_source", "created_at_source", "modified_at_source"]
});

export function performanceMonthFromQualifyingDate(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return null;
}

function factKey(row) {
  return `${String(row.organizationId)}|${String(row.morawareJobId)}|${String(row.morawareFormId)}|${String(row.qualifyingEvent)}`;
}

/**
 * Build attribution facts from worksheet rows that already carry the required
 * qualifying evidence. Missing event/date/SF yields no fact (unavailable), not 0.
 * Duplicate job+form+event rows are dropped. Overlapping source rows do not double-count.
 */
export function buildCompletedInstallationFacts(rows, { existingKeys = new Set() } = {}) {
  const seen = new Set(existingKeys);
  const facts = [];
  const skipped = [];
  for (const row of rows || []) {
    const jobId = String(row.morawareJobId || row.sourceJobId || "").trim();
    const formId = String(row.morawareFormId || row.sourceFormId || "").trim();
    const event = String(row.qualifyingEvent || "").trim();
    const date = String(row.qualifyingDate || "").trim();
    const month = performanceMonthFromQualifyingDate(date);
    const sf = Number(row.creditedSf ?? row.sqft);
    const accountId = String(row.accountDirectoryAccountId || "").trim();
    if (!jobId || !formId || event !== COMPLETED_FIRST_INSTALL_EVENT || !month || !accountId) {
      skipped.push({ reason: "missing_qualifying_evidence", jobId, formId });
      continue;
    }
    if (!Number.isFinite(sf)) {
      skipped.push({ reason: "missing_qualifying_evidence", jobId, formId });
      continue;
    }
    const key = factKey({
      organizationId: row.organizationId,
      morawareJobId: jobId,
      morawareFormId: formId,
      qualifyingEvent: event
    });
    if (seen.has(key)) {
      skipped.push({ reason: "duplicate_worksheet_event", jobId, formId });
      continue;
    }
    seen.add(key);
    facts.push({
      organizationId: row.organizationId,
      salespersonUserId: row.salespersonUserId,
      accountDirectoryAccountId: accountId,
      salesOpsAccountId: row.salesOpsAccountId ?? null,
      morawareAccountId: row.morawareAccountId ?? null,
      morawareJobId: jobId,
      morawareFormId: formId,
      qualifyingEvent: event,
      qualifyingDate: date.slice(0, 10),
      performanceMonth: month,
      creditedSf: Math.round(sf * 100) / 100,
      attributionBasis: row.attributionBasis || COMPLETED_INSTALLATION_SF,
      commissionEligible: row.commissionEligible === true,
      sourceObservedAt: row.sourceObservedAt ?? null,
      status: row.status || "credited",
      reversalOfId: row.reversalOfId ?? null
    });
  }
  return { facts, skipped };
}

export function reverseAttributionFact(original, { creditedSf = null, sourceObservedAt = null } = {}) {
  if (!original?.id) {
    const err = new Error("Reversal requires the original fact id.");
    err.code = "reversal_target_required";
    throw err;
  }
  const n = creditedSf == null ? -Number(original.creditedSf) : Number(creditedSf);
  return {
    ...original,
    id: undefined,
    status: "reversed",
    creditedSf: Number.isFinite(n) ? Math.round(n * 100) / 100 : -Number(original.creditedSf || 0),
    reversalOfId: original.id,
    sourceObservedAt: sourceObservedAt || new Date().toISOString()
  };
}
