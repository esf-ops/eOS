/**
 * Join view 219 report rows to sales_moraware_job_worksheet_facts form IDs.
 * Unique job + form-name only. Ambiguous groups stay FORM_IDENTITY_UNRESOLVED.
 * Pure. No name heuristics, ordering, or sqft tie-breakers.
 */

import {
  extractEarliestQualifyingFirstInstall,
  extractWorksheetFormName,
  extractWorksheetSqft,
  FORM_IDENTITY_MATCHED,
  FORM_IDENTITY_UNRESOLVED,
  JOB_IDENTITY_UNRESOLVED,
  normalizeFormNameKey
} from "./extractFirstInstall.js";
import { normalizeSpaces } from "./parseCsv.js";

export function formLookupKey(sourceJobId, formName) {
  return `${String(sourceJobId || "").trim()}||${normalizeFormNameKey(formName)}`;
}

/**
 * Build job+form-name → source_form_id lookup from API worksheet facts.
 * Ambiguous names (multiple form ids on the same job) are recorded, never guessed.
 */
export function buildFormIdentityLookup(worksheetFacts = []) {
  /** @type {Map<string, Set<string>>} */
  const formIdsByKey = new Map();
  /** @type {Map<string, Set<string>>} */
  const accountIdsByKey = new Map();

  for (const row of worksheetFacts) {
    const jobId = String(row.source_job_id || "").trim();
    const formId = String(row.source_form_id || "").trim();
    const formName = normalizeSpaces(row.form_name_raw || "");
    if (!jobId || !formId || !formName) continue;
    const key = formLookupKey(jobId, formName);
    if (!formIdsByKey.has(key)) formIdsByKey.set(key, new Set());
    formIdsByKey.get(key).add(formId);
    const accountId = String(row.source_account_id || "").trim();
    if (accountId) {
      if (!accountIdsByKey.has(key)) accountIdsByKey.set(key, new Set());
      accountIdsByKey.get(key).add(accountId);
    }
  }

  /** @type {Map<string, { sourceFormId: string|null, sourceAccountId: string|null, status: string }>} */
  const lookup = new Map();
  let uniqueGroups = 0;
  let ambiguousGroups = 0;
  let ambiguousFactCount = 0;
  for (const [key, ids] of formIdsByKey.entries()) {
    const accounts = accountIdsByKey.get(key);
    const sourceAccountId = accounts && accounts.size === 1 ? [...accounts][0] : null;
    if (ids.size === 1) {
      uniqueGroups += 1;
      lookup.set(key, {
        sourceFormId: [...ids][0],
        sourceAccountId,
        status: FORM_IDENTITY_MATCHED
      });
    } else {
      ambiguousGroups += 1;
      ambiguousFactCount += ids.size;
      lookup.set(key, {
        sourceFormId: null,
        sourceAccountId: null,
        status: FORM_IDENTITY_UNRESOLVED
      });
    }
  }

  return {
    lookup,
    summary: {
      uniqueGroups,
      ambiguousGroups,
      ambiguousFactCount
    }
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Collapse report raw rows to form grain and attach unique source_form_id.
 */
export function planCompletedInstallFormFacts({
  rawRows = [],
  formLookup,
  organizationId,
  reportFeedId,
  reportRunId,
  sourceUpdatedAt = null
}) {
  const groups = new Map();
  for (const row of rawRows) {
    const sourceJobId = String(row.job_id || row.source_job_id || "").trim();
    const formName = extractWorksheetFormName(row.raw_row);
    const key = sourceJobId ? formLookupKey(sourceJobId, formName || "\0") : `no-job||${row.id || row.row_hash || ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        sourceJobId: sourceJobId || null,
        formNameRaw: formName || null,
        sourceAccountId: String(row.account_id || "").trim() || null,
        sqftSum: 0,
        sqftKnown: false,
        install: null,
        sourceRowHashes: [],
        sourceRawRowIds: []
      });
    }
    const g = groups.get(key);
    const sf = extractWorksheetSqft(row.raw_row);
    if (sf != null) {
      g.sqftSum = round2(g.sqftSum + sf);
      g.sqftKnown = true;
    }
    const install = extractEarliestQualifyingFirstInstall(row.raw_row);
    if (install && (!g.install || install.date < g.install.date)) {
      g.install = install;
    }
    const hash = String(row.row_hash || "").trim();
    if (hash) g.sourceRowHashes.push(hash);
    if (row.id) g.sourceRawRowIds.push(row.id);
    if (!g.sourceAccountId) {
      g.sourceAccountId = String(row.account_id || "").trim() || null;
    }
  }

  const facts = [];
  const counts = {
    matched: 0,
    formUnresolved: 0,
    jobUnresolved: 0,
    qualifyingMatched: 0
  };

  for (const g of groups.values()) {
    let formIdentityStatus = JOB_IDENTITY_UNRESOLVED;
    let sourceFormId = null;
    let sourceAccountId = g.sourceAccountId;
    if (!g.sourceJobId) {
      counts.jobUnresolved += 1;
    } else if (!g.formNameRaw) {
      formIdentityStatus = FORM_IDENTITY_UNRESOLVED;
      counts.formUnresolved += 1;
    } else {
      const resolved = formLookup?.get(formLookupKey(g.sourceJobId, g.formNameRaw));
      if (!resolved || resolved.status !== FORM_IDENTITY_MATCHED || !resolved.sourceFormId) {
        formIdentityStatus = FORM_IDENTITY_UNRESOLVED;
        counts.formUnresolved += 1;
      } else {
        formIdentityStatus = FORM_IDENTITY_MATCHED;
        sourceFormId = resolved.sourceFormId;
        sourceAccountId = resolved.sourceAccountId || sourceAccountId;
        counts.matched += 1;
        if (g.install && g.sqftKnown) counts.qualifyingMatched += 1;
      }
    }

    facts.push({
      organization_id: organizationId,
      report_feed_id: reportFeedId,
      report_run_id: reportRunId,
      source_job_id: g.sourceJobId,
      source_form_id: sourceFormId,
      source_account_id: sourceAccountId,
      form_name_raw: g.formNameRaw,
      form_identity_status: formIdentityStatus,
      completed_install_status: g.install?.status ?? null,
      completed_install_activity_type: g.install?.activityType ?? null,
      completed_install_date: g.install?.date ?? null,
      sqft: g.sqftKnown ? g.sqftSum : null,
      source_row_hashes: g.sourceRowHashes,
      source_updated_at: sourceUpdatedAt,
      creditable:
        formIdentityStatus === FORM_IDENTITY_MATCHED &&
        Boolean(g.sourceJobId) &&
        Boolean(sourceFormId) &&
        Boolean(g.install?.date) &&
        g.sqftKnown
    });
  }

  return { facts, counts };
}
