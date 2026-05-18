import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";

const PAGE_SIZE = 1000;

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

async function latestSuccessfulSyncRunIds(supabase, organizationId) {
  try {
    let q = supabase
      .from("moraware_sync_runs")
      .select("id,metadata,finished_at,started_at")
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
      .select("id")
      .filter("metadata->>import_group_id", "eq", importGroupId)
      .eq("status", "success")
      .limit(100);
    if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
    const group = await groupQ;
    if (group.error) throw group.error;
    return { importGroupId, runIds: (group.data ?? []).map((r) => String(r.id)).filter(Boolean) };
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

/**
 * Brain-derived attribution coverage. This intentionally counts only approved
 * Sales Account Mapping rows as trusted; local fallback rules do not improve coverage.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ organizationId?: string }} options
 */
export async function loadSalesAttributionCoverage(supabase, { organizationId = "" } = {}) {
  const warnings = [];
  const latest = await latestSuccessfulSyncRunIds(supabase, organizationId);
  if (latest.warning) warnings.push(latest.warning);
  const runIds = latest.runIds;

  let accounts = [];
  let jobs = [];
  try {
    accounts = await fetchAll(() => {
      let q = supabase
        .from("brain_moraware_accounts")
        .select("source_account_id,account_name,sync_run_id,last_seen_at,updated_at")
        .order("account_name", { ascending: true });
      if (organizationId) q = q.eq("organization_id", organizationId);
      if (runIds.length) q = q.in("sync_run_id", runIds);
      return q;
    });
  } catch (e) {
    if (isMissingRelationError(e)) warnings.push("brain_moraware_accounts table missing");
    else throw e;
  }

  try {
    jobs = await fetchAll(() => {
      let q = supabase
        .from("brain_moraware_jobs")
        .select("source_job_id,source_account_id,account_name,sync_run_id")
        .order("source_account_id", { ascending: true });
      if (organizationId) q = q.eq("organization_id", organizationId);
      if (runIds.length) q = q.in("sync_run_id", runIds);
      return q;
    });
  } catch (e) {
    if (isMissingRelationError(e)) warnings.push("brain_moraware_jobs table missing");
    else throw e;
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
      jobCount: 0
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
        jobCount: 0
      };
    slot.jobCount += 1;
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
    blackstoneUnapprovedAccounts: 0
  };
  const examples = { needsReviewUnmapped: [], rejectedIgnored: [], approvedMapped: [], blackstoneUnapproved: [] };

  for (const account of accountsByKey.values()) {
    counts.totalAccountsSeen += 1;
    const alias = aliasesByNorm.get(account.normalizedMorawareName) || null;
    const status = statusForAlias(alias);
    const jobCount = Number(account.jobCount) || 0;
    const example = {
      accountName: account.accountName,
      sourceAccountId: account.sourceAccountId || null,
      normalizedMorawareName: account.normalizedMorawareName || null,
      jobCount,
      status,
      mondayAccountName: alias?.monday_account_name ?? null,
      assignedSalesperson: alias?.assigned_salesperson ?? null,
      branch: alias?.branch ?? null,
      matchType: alias?.match_type ?? null
    };

    if (status === "approved_mapped") {
      counts.approvedMappedAccounts += 1;
      counts.approvedMappedJobs += jobCount;
      examples.approvedMapped.push(example);
    } else if (status === "rejected_ignored") {
      counts.rejectedIgnoredAccounts += 1;
      counts.rejectedIgnoredJobs += jobCount;
      examples.rejectedIgnored.push(example);
    } else {
      counts.needsReviewUnmappedAccounts += 1;
      counts.needsReviewUnmappedJobs += jobCount;
      examples.needsReviewUnmapped.push(example);
    }

    if (account.normalizedMorawareName.includes("blackstone") && status !== "approved_mapped") {
      counts.blackstoneUnapprovedAccounts += 1;
      examples.blackstoneUnapproved.push(example);
    }
  }

  for (const list of Object.values(examples)) {
    list.sort((a, b) => b.jobCount - a.jobCount || String(a.accountName).localeCompare(String(b.accountName)));
  }

  return {
    source: "brain_moraware_latest_successful_sync_plus_sales_account_aliases",
    latest_import_group_id: latest.importGroupId,
    latest_sync_run_ids: runIds,
    ...counts,
    approvedAccountCoveragePct: pct(counts.approvedMappedAccounts, counts.totalAccountsSeen),
    approvedJobCoveragePct: pct(counts.approvedMappedJobs, counts.totalJobsSeen),
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
    warnings
  };
}
