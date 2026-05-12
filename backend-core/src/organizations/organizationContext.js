/**
 * Multi-tenant organization context (SaaS foundation).
 * Defaults to Elite Stone Fabrication until tenant routing is fully enforced.
 */

export const DEFAULT_ORGANIZATION_KEY = "elite_stone_fabrication";

/** @type {Map<string, boolean>} */
const organizationIdColumnCache = new Map();

function isMissingOrganizationsTable(error) {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  if (code === "42P01") return true;
  if (msg.includes("relation") && msg.includes("does not exist")) return true;
  if (msg.includes("schema cache") && msg.includes("organizations")) return true;
  return false;
}

function isMissingOrganizationIdColumn(error) {
  const msg = String(error?.message ?? error ?? "");
  const code = String(error?.code ?? "");
  if (code === "PGRST204") return true;
  if (/could not find.*organization_id/i.test(msg)) return true;
  return false;
}

/**
 * Whether `tableName` has a writable `organization_id` column (cached per process).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} tableName
 */
export async function tableHasOrganizationId(supabase, tableName) {
  const key = String(tableName || "").trim();
  if (!key || !supabase?.from) return false;
  if (organizationIdColumnCache.has(key)) return organizationIdColumnCache.get(key);
  try {
    const { error } = await supabase.from(key).select("organization_id").limit(1);
    if (!error) {
      organizationIdColumnCache.set(key, true);
      return true;
    }
    if (isMissingOrganizationIdColumn(error) || isMissingOrganizationsTable(error)) {
      organizationIdColumnCache.set(key, false);
      return false;
    }
    organizationIdColumnCache.set(key, false);
    return false;
  } catch (e) {
    if (isMissingOrganizationIdColumn(e) || isMissingOrganizationsTable(e)) {
      organizationIdColumnCache.set(key, false);
      return false;
    }
    organizationIdColumnCache.set(key, false);
    return false;
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {string|null|undefined} organizationId
 * @param {boolean} hasColumn
 */
export function mergeRowOrganizationId(row, organizationId, hasColumn) {
  if (!hasColumn || !organizationId) return row;
  return { ...row, organization_id: organizationId };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function getDefaultOrganization(supabase) {
  return getOrganizationByKey(supabase, DEFAULT_ORGANIZATION_KEY);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} organizationKey
 */
export async function getOrganizationByKey(supabase, organizationKey) {
  if (!supabase?.from) return null;
  const k = String(organizationKey || "").trim();
  if (!k) return null;
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,organization_key,display_name")
      .eq("organization_key", k)
      .limit(1);
    if (error) {
      if (isMissingOrganizationsTable(error)) return null;
      throw error;
    }
    return data?.[0] ?? null;
  } catch (e) {
    if (isMissingOrganizationsTable(e)) return null;
    throw e;
  }
}

/**
 * @typedef {Object} OrganizationContext
 * @property {string|null} organizationId
 * @property {string|null} organizationKey
 * @property {string|null} displayName
 * @property {string[]} warnings
 * @property {string} source
 */

/**
 * @param {{ req: import("express").Request, supabase: import("@supabase/supabase-js").SupabaseClient, mode?: "public" | "authenticated" }} params
 * @returns {Promise<OrganizationContext>}
 */
export async function resolveOrganizationContext({ req, supabase, mode = "authenticated" }) {
  /** @type {string[]} */
  const warnings = [];

  if (!supabase?.from) {
    warnings.push("supabase_client_missing");
    return {
      organizationId: null,
      organizationKey: null,
      displayName: null,
      warnings,
      source: "none"
    };
  }

  const defaultOrg = await getDefaultOrganization(supabase);
  if (!defaultOrg) {
    warnings.push("organizations_table_missing_or_unseeded");
    return {
      organizationId: null,
      organizationKey: DEFAULT_ORGANIZATION_KEY,
      displayName: "Elite Stone Fabrication",
      warnings,
      source: "placeholder_no_db_table"
    };
  }

  if (mode === "public") {
    return {
      organizationId: defaultOrg.id,
      organizationKey: defaultOrg.organization_key,
      displayName: defaultOrg.display_name,
      warnings,
      source: "default_public"
    };
  }

  const user = req?.user;
  if (user?.id) {
    try {
      const { data: prof, error: pe } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .limit(1);
      if (!pe && prof?.[0]?.organization_id) {
        const oid = prof[0].organization_id;
        const { data: orgRow, error: oe } = await supabase
          .from("organizations")
          .select("id,organization_key,display_name")
          .eq("id", oid)
          .limit(1);
        if (!oe && orgRow?.[0]) {
          return {
            organizationId: orgRow[0].id,
            organizationKey: orgRow[0].organization_key,
            displayName: orgRow[0].display_name,
            warnings,
            source: "user_profile"
          };
        }
        warnings.push("user_profile_organization_id_not_resolvable");
      }
    } catch {
      warnings.push("user_profile_organization_lookup_failed");
    }
  }

  const headerKey = String(req?.headers?.["x-organization-key"] ?? req?.headers?.["X-Organization-Key"] ?? "").trim();
  const queryKey = String(req?.query?.organization_key ?? "").trim();
  const requested = headerKey || queryKey;
  if (requested && requested === DEFAULT_ORGANIZATION_KEY) {
    return {
      organizationId: defaultOrg.id,
      organizationKey: defaultOrg.organization_key,
      displayName: defaultOrg.display_name,
      warnings,
      source: "header_or_query_default_key_only"
    };
  }
  if (requested && requested !== DEFAULT_ORGANIZATION_KEY) {
    warnings.push("non_default_organization_key_ignored_until_tenant_validation");
  }

  return {
    organizationId: defaultOrg.id,
    organizationKey: defaultOrg.organization_key,
    displayName: defaultOrg.display_name,
    warnings,
    source: "default_authenticated"
  };
}

/**
 * @param {{ req: import("express").Request, supabase: import("@supabase/supabase-js").SupabaseClient, mode?: "public" | "authenticated" }} params
 * @returns {Promise<string>}
 */
export async function requireOrganizationId({ req, supabase, mode = "authenticated" }) {
  const ctx = await resolveOrganizationContext({ req, supabase, mode });
  if (!ctx.organizationId) {
    const err = new Error("Organization context required but organizations table is missing or not seeded.");
    err.statusCode = 503;
    throw err;
  }
  return ctx.organizationId;
}

/**
 * PostgREST filter: current org rows plus legacy null org_id rows (migration-safe).
 * @param {string} organizationId
 */
export function organizationScopeOrFilter(organizationId) {
  const id = String(organizationId || "").trim();
  if (!id) return null;
  return `organization_id.eq.${id},organization_id.is.null`;
}
