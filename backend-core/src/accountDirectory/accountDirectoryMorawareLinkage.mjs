/**
 * Account Directory ↔ Moraware identity constants and staff-safe relationship shape.
 * Option B: one Moraware Account ID → at most one AD UUID;
 * one AD UUID → many active Moraware Account IDs.
 * Moraware IDs never attach to account_directory_locations.
 */

export const ACCOUNT_DIRECTORY_MORAWARE_SYSTEM = "moraware";

export const INTERNAL_MORAWARE_ACCOUNT_KEYS = Object.freeze([
  "direct",
  "dyersville direct",
  "elite stone fabrication",
  "aceno granite",
  "cambrian granite and stone",
  "cambrian granite stone",
  "retail dyersville"
]);

export function normalizeMorawareAccountKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^(dyersville|lisbon|iowa\s*city)\s*[-–—]\s*/i, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|co|company|corp|corporation)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isInternalMorawareAccountName(name) {
  const key = normalizeMorawareAccountKey(name);
  if (!key) return false;
  if (INTERNAL_MORAWARE_ACCOUNT_KEYS.includes(key)) return true;
  if (key === "direct") return true;
  if (/\belite stone\b/.test(key) && /\bfabrication\b/.test(key)) return true;
  return false;
}

const CANONICAL_MORAWARE_ID_RE = /^\d+$/;

/**
 * Resolve the canonical Brain Moraware account for an exact numeric Account ID.
 * SELECT-only. Never returns raw_payload.
 * @returns {Promise<{ sourceAccountId: string, accountName: string }|null>}
 */
export async function loadCanonicalMorawareAccount(supabase, organizationId, sourceAccountId) {
  const id = String(sourceAccountId || "").trim();
  if (!CANONICAL_MORAWARE_ID_RE.test(id) || !supabase || !organizationId) return null;
  const { data, error } = await supabase
    .from("brain_moraware_accounts")
    .select("source_account_id,account_name,last_seen_at")
    .eq("organization_id", organizationId)
    .eq("source_account_id", id)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (error || !data?.length) return null;
  const latestDay = String(data[0].last_seen_at || "").slice(0, 10);
  const row =
    data.find((r) => !latestDay || String(r.last_seen_at || "").slice(0, 10) === latestDay) || data[0];
  const source = String(row.source_account_id || "").trim();
  if (!CANONICAL_MORAWARE_ID_RE.test(source)) return null;
  return {
    sourceAccountId: source,
    accountName: String(row.account_name || "").trim()
  };
}

/**
 * Staff-safe Moraware relationship. Never includes raw payloads or QuickBooks ListIDs.
 * Pass jobCountsBySourceId only when counts were loaded successfully.
 * Omit/null counts → jobs_state unavailable and job_count null (never a false zero).
 */
export function buildMorawareRelationship(links, jobCountsBySourceId = null, options = {}) {
  const jobsState =
    options.jobsState || (jobCountsBySourceId == null ? "unavailable" : "available");
  const counts =
    jobCountsBySourceId instanceof Map
      ? jobCountsBySourceId
      : jobCountsBySourceId && typeof jobCountsBySourceId === "object"
        ? new Map(Object.entries(jobCountsBySourceId).map(([k, v]) => [String(k), v]))
        : null;
  const available = jobsState === "available" && counts != null;
  const accounts = [];
  for (const link of links || []) {
    if (!link || link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "").trim();
    if (system !== ACCOUNT_DIRECTORY_MORAWARE_SYSTEM) continue;
    const sourceAccountId = String(link.externalId || link.external_id || "").trim();
    if (!sourceAccountId) continue;
    const raw = available ? counts.get(sourceAccountId) : null;
    const jobCount = available ? Number(raw ?? 0) : null;
    accounts.push({
      source_account_id: sourceAccountId,
      display_name: link.externalDisplayName || link.external_display_name || null,
      job_count: jobCount
    });
  }
  accounts.sort((a, b) => a.source_account_id.localeCompare(b.source_account_id));
  const total = available
    ? accounts.reduce((sum, row) => sum + Number(row.job_count || 0), 0)
    : null;
  return {
    linked: accounts.length > 0,
    accounts,
    total_job_count: total,
    jobs_state: available ? "available" : "unavailable"
  };
}
