/**
 * Identity-gated COMPLETED_INSTALLATION_SF attribution planner.
 * Writes are never implied. Current Monday ownership does not update existing facts.
 * Moraware salesperson fields are not used.
 */

import {
  COMPLETED_FIRST_INSTALL_EVENT,
  COMPLETED_INSTALLATION_SF,
  buildCompletedInstallationFacts,
  performanceMonthFromQualifyingDate
} from "./salesOpsCompletedInstallationSf.mjs";
import {
  COMPLETED_SF_BASELINE_ACCEPTANCE,
  baselineMonthTotals,
  compareCompletedSfBaseline
} from "./salesOpsIdentityReview.mjs";

export const ATTRIBUTION_OWNERSHIP_EVIDENCE_INITIAL = "approved_identity_current_assignment_snapshot";

function factKey(row) {
  return `${String(row.organizationId)}|${String(row.morawareJobId)}|${String(row.morawareFormId)}|${String(row.qualifyingEvent)}`;
}

function existingKeySet(existingFacts) {
  const keys = new Set();
  for (const row of existingFacts || []) {
    if (String(row.status || "credited") !== "credited") continue;
    if (!row.morawareJobId || !row.morawareFormId) continue;
    keys.add(factKey(row));
  }
  return keys;
}

function morawareIdsByDirectoryAccount(links) {
  const map = new Map();
  for (const link of links || []) {
    const ad = String(link.accountId || "").trim();
    const ext = String(link.externalId || "").trim();
    if (!ad || !ext) continue;
    if (!map.has(ad)) map.set(ad, new Set());
    map.get(ad).add(ext);
  }
  return map;
}

function isCreditableFormFact(row) {
  if (!row) return false;
  if (row.isActive === false) return false;
  if (row.supersededBy) return false;
  if (String(row.formIdentityStatus || "") !== "MATCHED") return false;
  if (row.creditable === false) return false;
  return true;
}

/**
 * Build prospective COMPLETED_INSTALLATION_SF facts from approved identity only.
 * Unresolved identities and unmatched form facts are skipped, never zeroed.
 * Existing credited facts are left untouched (no owner-change rewrite).
 */
export function planCompletedInstallAttribution({
  organizationId,
  approvedAccounts = [],
  morawareLinks = [],
  formFacts = [],
  existingFacts = [],
  asOf = null
} = {}) {
  const mwByAd = morawareIdsByDirectoryAccount(morawareLinks);
  const accountByMw = new Map();
  const skipped = [];
  for (const account of approvedAccounts || []) {
    const ad = String(account.accountDirectoryAccountId || "").trim();
    const salespersonUserId = String(account.assignedUserId || "").trim();
    if (!ad) {
      skipped.push({ reason: "identity_not_approved", salesOpsAccountId: account.id || null });
      continue;
    }
    if (!salespersonUserId) {
      skipped.push({ reason: "salesperson_unassigned", salesOpsAccountId: account.id || null });
      continue;
    }
    const ids = mwByAd.get(ad);
    if (!ids || !ids.size) {
      skipped.push({ reason: "moraware_identity_missing", salesOpsAccountId: account.id || null, accountDirectoryAccountId: ad });
      continue;
    }
    for (const ext of ids) {
      if (!accountByMw.has(ext)) accountByMw.set(ext, []);
      accountByMw.get(ext).push({ account, ad, salespersonUserId });
    }
  }

  const rows = [];
  for (const fact of formFacts || []) {
    if (!isCreditableFormFact(fact)) continue;
    const sourceAccountId = String(fact.sourceAccountId || fact.source_account_id || "").trim();
    const owners = accountByMw.get(sourceAccountId) || [];
    if (!owners.length) continue;
    if (owners.length > 1) {
      skipped.push({ reason: "moraware_account_maps_to_multiple_approved_books", sourceAccountId });
      continue;
    }
    const { account, ad, salespersonUserId } = owners[0];
    const date = String(fact.completedInstallDate || fact.completed_install_date || "").slice(0, 10);
    const plannedRow = {
      organizationId: organizationId || account.organizationId,
      salespersonUserId,
      accountDirectoryAccountId: ad,
      salesOpsAccountId: account.id,
      morawareAccountId: sourceAccountId,
      morawareJobId: fact.sourceJobId || fact.source_job_id,
      morawareFormId: fact.sourceFormId || fact.source_form_id,
      qualifyingEvent: COMPLETED_FIRST_INSTALL_EVENT,
      qualifyingDate: date,
      creditedSf: fact.sqft,
      attributionBasis: COMPLETED_INSTALLATION_SF,
      commissionEligible: false,
      sourceObservedAt: fact.sourceUpdatedAt || fact.source_updated_at || asOf,
      status: "credited",
      sourceLineage: {
        preparedFactId: fact.id || null,
        reportFeedId: fact.reportFeedId || fact.report_feed_id || null,
        reportRunId: fact.reportRunId || fact.report_run_id || null,
        observationKey: fact.observationKey || fact.observation_key || null,
        formIdentityStatus: "MATCHED"
      },
      ownershipEvidence: {
        kind: ATTRIBUTION_OWNERSHIP_EVIDENCE_INITIAL,
        salesOpsAccountId: account.id,
        assignedUserId: salespersonUserId,
        note: "Initial credit snapshot from approved identity plus current assignment. Later Monday owner changes do not rewrite this fact."
      },
      attributionEffectiveStart: date,
      attributionEffectiveEnd: null
    };
    rows.push(plannedRow);
  }

  const extrasByKey = new Map(rows.map((row) => [factKey(row), row]));
  const built = buildCompletedInstallationFacts(rows, { existingKeys: existingKeySet(existingFacts) });
  const planned = built.facts.map((fact) => {
    const extra = extrasByKey.get(factKey(fact)) || {};
    return {
      ...fact,
      sourceLineage: extra.sourceLineage || null,
      ownershipEvidence: extra.ownershipEvidence || null,
      attributionEffectiveStart: extra.attributionEffectiveStart || fact.qualifyingDate,
      attributionEffectiveEnd: extra.attributionEffectiveEnd ?? null
    };
  });
  const totals = baselineMonthTotals(planned);
  const baseline = compareCompletedSfBaseline(totals);
  return {
    metric: COMPLETED_INSTALLATION_SF,
    plannedCount: planned.length,
    skippedCount: skipped.length + built.skipped.length,
    skipped: [...skipped, ...built.skipped],
    facts: planned,
    monthTotals: totals,
    baseline,
    wouldRewriteHistory: false
  };
}

export function assertAttributionDoesNotRewriteHistory(existingFacts, plannedFacts) {
  const prior = new Map((existingFacts || []).filter((f) => f.id).map((f) => [String(f.id), f]));
  for (const fact of plannedFacts || []) {
    if (fact.id && prior.has(String(fact.id))) {
      const before = prior.get(String(fact.id));
      if (String(before.salespersonUserId) !== String(fact.salespersonUserId)) {
        return false;
      }
    }
  }
  return true;
}

export { COMPLETED_SF_BASELINE_ACCEPTANCE, baselineMonthTotals, compareCompletedSfBaseline, performanceMonthFromQualifyingDate };
