import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";
import { extractSqftFromMorawareJob } from "./morawareSqftActuals.js";

const PAGE_SIZE = 500;

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function pct(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  return d > 0 ? (n / d) * 100 : null;
}

function accountKeyFromParts(sourceAccountId, accountName) {
  const n = normalizeAccountNameWithoutLocationPrefix(accountName);
  if (n) return `name:${n}`;
  const id = String(sourceAccountId ?? "").trim();
  return id ? `id:${id}` : "";
}

function displayAccountName(row) {
  return String(row?.account_name ?? row?.moraware_account_name ?? row?.source_account_id ?? "").trim() || "(unknown)";
}

async function fetchAll(queryFactory) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function chunkArray(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchAllByRunIds(queryFactory, runIds, { chunkSize = 20, label = "rows", diagnostics = null } = {}) {
  if (!runIds.length) return fetchAll(() => queryFactory(null));
  const rows = [];
  for (const runIdChunk of chunkArray(runIds, chunkSize)) {
    let from = 0;
    while (true) {
      const { data, error } = await queryFactory(runIdChunk).range(from, from + PAGE_SIZE - 1);
      if (diagnostics) diagnostics.query_page_count += 1;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  if (diagnostics) diagnostics[`${label}Scanned`] = rows.length;
  return rows;
}

function addRowCounts(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const key of keys) out[key] = (Number(a?.[key]) || 0) + (Number(b?.[key]) || 0);
  return out;
}

function summarizeImportGroupRows(groupRows, latestRun) {
  const expectedChunkCount = Math.max(
    0,
    ...groupRows.map((r) => Number(r?.metadata?.chunk_count) || 0),
    Number(latestRun?.metadata?.chunk_count) || 0
  ) || null;
  const byChunkIndex = new Map();
  for (const row of groupRows) {
    const idx = Number(row?.metadata?.chunk_index) || null;
    if (!idx) continue;
    const prev = byChunkIndex.get(idx);
    if (!prev || String(row.started_at || "") >= String(prev.started_at || "")) byChunkIndex.set(idx, row);
  }
  const latestRows = [...byChunkIndex.entries()].sort((a, b) => a[0] - b[0]);
  const missingChunkIndices = [];
  if (expectedChunkCount) {
    for (let i = 1; i <= expectedChunkCount; i += 1) {
      if (!byChunkIndex.has(i)) missingChunkIndices.push(i);
    }
  }
  const successfulRows = latestRows.filter(([, row]) => row.status === "success").map(([, row]) => row);
  const failedChunks = latestRows.filter(([, row]) => row.status === "failed").length;
  const complete = Boolean(expectedChunkCount) && successfulRows.length === expectedChunkCount && failedChunks === 0 && missingChunkIndices.length === 0;
  return {
    complete,
    expectedChunkCount,
    successfulChunks: successfulRows.length,
    failedChunks,
    missingChunkIndices,
    runIds: successfulRows.map((row) => String(row.id)).filter(Boolean),
    totalRowCounts: successfulRows.reduce((acc, row) => addRowCounts(acc, row.row_counts || {}), {})
  };
}

async function latestSuccessfulSyncRunIds(supabase, organizationId) {
  try {
    let q = supabase
      .from("moraware_sync_runs")
      .select("id,metadata,finished_at,started_at,status,row_counts")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw error;
    const latest = data?.[0] ?? null;
    const importGroupId = String(latest?.metadata?.import_group_id ?? "").trim();
    if (!importGroupId) return latest?.id ? { importGroupId: null, runIds: [String(latest.id)] } : { importGroupId: null, runIds: [] };

    let groupQ = supabase
      .from("moraware_sync_runs")
      .select("id,status,started_at,finished_at,row_counts,metadata")
      .filter("metadata->>import_group_id", "eq", importGroupId)
      .limit(1000);
    if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
    const group = await groupQ;
    if (group.error) throw group.error;
    const summary = summarizeImportGroupRows(group.data ?? [], latest);
    if (!summary.complete) {
      return {
        importGroupId,
        runIds: [],
        groupComplete: false,
        warning: `Latest Moraware import group ${importGroupId} is incomplete; refusing to use partial group for mapping coverage.`
      };
    }
    return { importGroupId, runIds: summary.runIds, groupComplete: true, groupSummary: summary };
  } catch (e) {
    if (isMissingRelationError(e)) return { importGroupId: null, runIds: [], warning: "moraware_sync_runs table missing" };
    return { importGroupId: null, runIds: [], warning: String(e?.message ?? e) };
  }
}

function latestAliasDecisionByNorm(aliases) {
  const byNorm = new Map();
  for (const a of aliases) {
    const k = String(a.normalized_moraware_name ?? "").trim();
    if (!k) continue;
    const prev = byNorm.get(k);
    if (!prev) {
      byNorm.set(k, a);
      continue;
    }
    const prevApproved = prev.approved === true;
    const curApproved = a.approved === true;
    if (curApproved && !prevApproved) {
      byNorm.set(k, a);
      continue;
    }
    const pu = String(prev.updated_at ?? prev.created_at ?? "");
    const cu = String(a.updated_at ?? a.created_at ?? "");
    if (cu > pu) byNorm.set(k, a);
  }
  return byNorm;
}

function statusForAlias(alias) {
  if (!alias) return "needs_review_unmapped";
  const matchType = String(alias.match_type ?? "").toLowerCase();
  const assigned = String(alias.assigned_salesperson ?? "").toLowerCase();
  const branch = String(alias.branch ?? "").toLowerCase();
  if (matchType === "rejected") return "rejected_ignored";
  if (alias.approved === true && (matchType === "intentional_unmapped" || assigned === "unmapped" || branch === "unmapped")) {
    return "rejected_ignored";
  }
  if (alias.approved === true) return "approved_mapped";
  return "needs_review_unmapped";
}

function isStatementTimeout(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "57014" || msg.includes("canceling statement due to statement timeout") || msg.includes("statement timeout");
}

/**
 * Brain-derived attribution coverage. This intentionally counts only approved
 * Sales Account Mapping rows as trusted; local fallback rules do not improve coverage.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ organizationId?: string }} options
 */
export async function loadSalesAttributionCoverage(supabase, { organizationId = "" } = {}) {
  const warnings = [];
  const diagnostics = {
    latest_complete_import_group_id: null,
    latest_group_complete: null,
    jobs_scanned: 0,
    accounts_scanned: 0,
    account_rollups_computed: 0,
    query_page_count: 0,
    coverage_summary_complete: true,
    partial_warning: null
  };
  const latest = await latestSuccessfulSyncRunIds(supabase, organizationId);
  if (latest.warning) warnings.push(latest.warning);
  const runIds = latest.runIds;
  diagnostics.latest_complete_import_group_id = latest.importGroupId ?? null;
  diagnostics.latest_group_complete = latest.groupComplete ?? null;

  let accounts = [];
  let jobs = [];
  if (latest.importGroupId && latest.groupComplete === false) {
    accounts = [];
    jobs = [];
  } else {
    try {
      accounts = await fetchAllByRunIds((runIdChunk) => {
        let q = supabase
          .from("brain_moraware_accounts")
          .select("id,source_account_id,account_name,sync_run_id,last_seen_at,updated_at")
          .order("id", { ascending: true });
        if (organizationId) q = q.eq("organization_id", organizationId);
        if (runIdChunk?.length) q = q.in("sync_run_id", runIdChunk);
        return q;
      }, runIds, { chunkSize: 20, label: "accounts", diagnostics });
    } catch (e) {
      if (isMissingRelationError(e)) warnings.push("brain_moraware_accounts table missing");
      else if (isStatementTimeout(e)) {
        diagnostics.coverage_summary_complete = false;
        diagnostics.partial_warning = "Account coverage query timed out; using job-derived rows only for this response.";
        warnings.push(diagnostics.partial_warning);
      } else throw e;
    }

    try {
      jobs = await fetchAllByRunIds((runIdChunk) => {
        let q = supabase
          .from("brain_moraware_jobs")
          .select("id,source_job_id,source_account_id,account_name,sync_run_id,raw_payload")
          .order("id", { ascending: true });
        if (organizationId) q = q.eq("organization_id", organizationId);
        if (runIdChunk?.length) q = q.in("sync_run_id", runIdChunk);
        return q;
      }, runIds, { chunkSize: 1, label: "jobs", diagnostics });
    } catch (e) {
      if (isMissingRelationError(e)) warnings.push("brain_moraware_jobs table missing");
      else if (isStatementTimeout(e)) {
        diagnostics.coverage_summary_complete = false;
        diagnostics.partial_warning = "Job Sq.Ft. rollup query timed out; returning account coverage without complete Sq.Ft. summary.";
        warnings.push(diagnostics.partial_warning);
      } else throw e;
    }
  }

  let aliases = [];
  try {
    aliases = await fetchAll(() =>
      supabase
        .from("sales_account_aliases")
        .select(
          "id,approved,moraware_account_name,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at"
        )
        .order("updated_at", { ascending: false })
    );
  } catch (e) {
    if (isMissingRelationError(e)) warnings.push("sales_account_aliases table missing; all seen accounts need review");
    else throw e;
  }
  const aliasesByNorm = latestAliasDecisionByNorm(aliases);

  const accountsByKey = new Map();
  for (const row of accounts) {
    const key = accountKeyFromParts(row.source_account_id, row.account_name);
    if (!key) continue;
    accountsByKey.set(key, {
      sourceAccountId: String(row.source_account_id ?? "").trim(),
      accountName: displayAccountName(row),
      normalizedMorawareName: normalizeAccountNameWithoutLocationPrefix(row.account_name),
      jobCount: 0,
      jobsWithSqft: 0,
      totalSqft: 0
    });
  }
  for (const job of jobs) {
    const key = accountKeyFromParts(job.source_account_id, job.account_name);
    if (!key) continue;
    const slot =
      accountsByKey.get(key) ||
      {
        sourceAccountId: String(job.source_account_id ?? "").trim(),
        accountName: displayAccountName(job),
        normalizedMorawareName: normalizeAccountNameWithoutLocationPrefix(job.account_name),
        jobCount: 0,
        jobsWithSqft: 0,
        totalSqft: 0
      };
    slot.jobCount += 1;
    const extracted = extractSqftFromMorawareJob(job);
    if (extracted.hasSqft) {
      slot.jobsWithSqft += 1;
      slot.totalSqft += extracted.totalSqft;
    }
    accountsByKey.set(key, slot);
  }

  const counts = {
    totalAccountsSeen: 0,
    approvedMappedAccounts: 0,
    needsReviewUnmappedAccounts: 0,
    rejectedIgnoredAccounts: 0,
    totalJobsSeen: jobs.length,
    approvedMappedJobs: 0,
    needsReviewUnmappedJobs: 0,
    rejectedIgnoredJobs: 0,
    totalSqftSeen: 0,
    approvedMappedSqft: 0,
    needsReviewUnmappedSqft: 0,
    rejectedIgnoredSqft: 0,
    jobsWithSqft: 0,
    jobsMissingSqft: 0,
    blackstoneUnapprovedAccounts: 0
  };
  const examples = { needsReviewUnmapped: [], rejectedIgnored: [], approvedMapped: [], blackstoneUnapproved: [] };

  for (const account of accountsByKey.values()) {
    counts.totalAccountsSeen += 1;
    const alias = aliasesByNorm.get(account.normalizedMorawareName) || null;
    const status = statusForAlias(alias);
    const jobCount = Number(account.jobCount) || 0;
    const jobsWithSqft = Number(account.jobsWithSqft) || 0;
    const totalSqft = Math.round((Number(account.totalSqft) || 0) * 100) / 100;
    counts.totalSqftSeen += totalSqft;
    counts.jobsWithSqft += jobsWithSqft;
    const example = {
      accountName: account.accountName,
      sourceAccountId: account.sourceAccountId || null,
      normalizedMorawareName: account.normalizedMorawareName || null,
      jobCount,
      jobsWithSqft,
      jobsMissingSqft: Math.max(0, jobCount - jobsWithSqft),
      totalSqft,
      status,
      mondayAccountName: alias?.monday_account_name ?? null,
      assignedSalesperson: alias?.assigned_salesperson ?? null,
      branch: alias?.branch ?? null,
      matchType: alias?.match_type ?? null
    };
    const reviewRow = {
      ...example,
      approved: alias?.approved ?? false,
      confidence: alias?.confidence ?? null,
      notes: alias?.notes ?? null,
      aliasId: alias?.id ?? null,
      reviewStatus: status
    };

    if (status === "approved_mapped") {
      counts.approvedMappedAccounts += 1;
      counts.approvedMappedJobs += jobCount;
      counts.approvedMappedSqft += totalSqft;
      examples.approvedMapped.push(example);
    } else if (status === "rejected_ignored") {
      counts.rejectedIgnoredAccounts += 1;
      counts.rejectedIgnoredJobs += jobCount;
      counts.rejectedIgnoredSqft += totalSqft;
      examples.rejectedIgnored.push(example);
    } else {
      counts.needsReviewUnmappedAccounts += 1;
      counts.needsReviewUnmappedJobs += jobCount;
      counts.needsReviewUnmappedSqft += totalSqft;
      examples.needsReviewUnmapped.push(example);
    }

    if (account.normalizedMorawareName.includes("blackstone") && status !== "approved_mapped") {
      counts.blackstoneUnapprovedAccounts += 1;
      examples.blackstoneUnapproved.push(example);
    }

    if (!examples.reviewRows) examples.reviewRows = [];
    examples.reviewRows.push(reviewRow);
  }

  for (const list of Object.values(examples)) {
    list.sort((a, b) => (Number(b.totalSqft) || 0) - (Number(a.totalSqft) || 0) || b.jobCount - a.jobCount || String(a.accountName).localeCompare(String(b.accountName)));
  }
  counts.jobsMissingSqft = Math.max(0, counts.totalJobsSeen - counts.jobsWithSqft);
  diagnostics.jobs_scanned = jobs.length;
  diagnostics.accounts_scanned = accounts.length;
  diagnostics.account_rollups_computed = accountsByKey.size;

  return {
    source: "brain_moraware_latest_successful_sync_plus_sales_account_aliases",
    latest_import_group_id: latest.importGroupId,
    latest_group_complete: latest.groupComplete ?? null,
    latest_sync_run_ids: runIds,
    ...counts,
    approvedAccountCoveragePct: pct(counts.approvedMappedAccounts, counts.totalAccountsSeen),
    approvedJobCoveragePct: pct(counts.approvedMappedJobs, counts.totalJobsSeen),
    approvedSqftCoveragePct: pct(counts.approvedMappedSqft, counts.totalSqftSeen),
    sqft_source: "Brain-derived Moraware Job Worksheet Sq.Ft. fields",
    warning:
      "Revenue/sqft by branch remains preview until approved Sales Account Mapping coverage is high; local fallback rules do not count as trusted coverage.",
    blackstone_guardrail:
      "Blackstone remains unmapped/Moraware fallback unless an approved Sales Account Mapping row explicitly maps it.",
    examples: {
      needsReviewUnmapped: examples.needsReviewUnmapped.slice(0, 20),
      rejectedIgnored: examples.rejectedIgnored.slice(0, 10),
      approvedMapped: examples.approvedMapped.slice(0, 10),
      blackstoneUnapproved: examples.blackstoneUnapproved.slice(0, 10)
    },
    reviewRows: (examples.reviewRows || []).slice(0, 5000),
    diagnostics,
    warnings
  };
}
