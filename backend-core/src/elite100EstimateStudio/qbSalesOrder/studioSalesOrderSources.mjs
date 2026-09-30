/**
 * Database-backed inputs for the Studio QuickBooks sales order queue.
 *
 * Authority:
 *   - Item identity: `quote_qb_item_mappings` (organization-scoped concept → QuickBooks
 *     ListID). One mapping table for estimates and sales orders.
 *   - Company-level settings: `organization_integration_configs` row with
 *     integration_key `quickbooks_sales_order` (companyIdentity, termsFullName,
 *     classFullName, per-concept salesTaxCodeByConcept / classByConcept). Non-secret.
 *     No row, or is_enabled = false → sales orders are not configured for the org.
 *   - Customer:job: staff selection on the job, else Account Directory's single active
 *     `quickbooks_desktop` link resolved against the QuickBooks customer mirror
 *     (`ad_qb_customer_facts`). Names never select a customer.
 *
 * Sales tax: only explicitly configured per-concept tax codes are used. Nothing is
 * inferred from QuickBooks item defaults.
 */

import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "../../accountDirectory/accountDirectoryQuickbooksLinkage.mjs";

export const SALES_ORDER_INTEGRATION_KEY = "quickbooks_sales_order";
const MAX_CANDIDATES = 50;

function str(v) {
  return v == null ? "" : String(v).trim();
}

function persistenceError(what, error) {
  const e = new Error(`${what}: ${error?.message || error}`);
  e.statusCode = 503;
  e.code = "sales_order_source_unavailable";
  e.cause = error;
  return e;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
export async function loadSalesOrderIntegrationConfig(db, organizationId) {
  const { data, error } = await db
    .from("organization_integration_configs")
    .select("is_enabled, config")
    .eq("organization_id", organizationId)
    .eq("integration_key", SALES_ORDER_INTEGRATION_KEY)
    .maybeSingle();
  if (error) throw persistenceError("QuickBooks sales order config", error);
  if (!data || data.is_enabled !== true) return null;
  return data.config && typeof data.config === "object" ? data.config : {};
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
export async function loadStudioSalesOrderMapping(db, organizationId) {
  const config = await loadSalesOrderIntegrationConfig(db, organizationId);
  if (!config) return null;
  const { data, error } = await db
    .from("quote_qb_item_mappings")
    .select("eliteos_concept_key, qb_list_id, qb_full_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(500);
  if (error) throw persistenceError("QuickBooks item mappings", error);
  const taxByConcept = config.salesTaxCodeByConcept && typeof config.salesTaxCodeByConcept === "object" ? config.salesTaxCodeByConcept : {};
  const classByConcept = config.classByConcept && typeof config.classByConcept === "object" ? config.classByConcept : {};
  /** @type {Record<string, any>} */
  const items = {};
  for (const row of data || []) {
    const key = str(row.eliteos_concept_key);
    if (!key) continue;
    items[key] = {
      listId: str(row.qb_list_id) || null,
      itemFullName: str(row.qb_full_name) || null,
      salesTaxCodeFullName: str(taxByConcept[key]) || null,
      classFullName: str(classByConcept[key]) || null
    };
  }
  return {
    companyIdentity: str(config.companyIdentity) || null,
    termsFullName: str(config.termsFullName) || null,
    classFullName: str(config.classFullName) || null,
    items
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {any} soldSnapshot row from studio_estimate_sold_snapshots
 * @param {{ listId?: string|null, fullName?: string|null }|null} override staff selection
 * @returns {Promise<{ listId?: string|null, fullName?: string|null, unresolvedReason?: string, candidates?: any[] }>}
 */
export async function resolveStudioCustomerJob(db, organizationId, soldSnapshot, override = null) {
  if (override && (str(override.listId) || str(override.fullName))) {
    if (str(override.listId)) {
      const { data, error } = await db
        .from("ad_qb_customer_facts")
        .select("qb_list_id, full_name")
        .eq("organization_id", organizationId)
        .eq("qb_list_id", str(override.listId))
        .maybeSingle();
      if (error) throw persistenceError("QuickBooks customer mirror", error);
      return { listId: str(override.listId), fullName: str(data?.full_name) || str(override.fullName) || null };
    }
    return { listId: null, fullName: str(override.fullName) };
  }

  const accountId = str(soldSnapshot?.sold_snapshot_json?.accountDirectoryAccountId);
  if (!accountId) {
    return { unresolvedReason: "This estimate has no Account Directory account. Choose the QuickBooks customer:job for the sales order." };
  }
  const { data: links, error: linkError } = await db
    .from("account_directory_external_links")
    .select("external_id, external_display_name")
    .eq("organization_id", organizationId)
    .eq("account_id", accountId)
    .eq("external_system", ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM)
    .eq("is_active", true)
    .limit(10);
  if (linkError) throw persistenceError("Account Directory QuickBooks links", linkError);
  const active = (links || []).filter((l) => str(l.external_id));
  if (active.length === 0) {
    return { unresolvedReason: "The customer's Account Directory account is not linked to a QuickBooks customer. Link it, or choose the customer:job." };
  }
  if (active.length > 1) {
    return {
      unresolvedReason: "The customer's account is linked to more than one QuickBooks customer. Choose the customer:job for this sales order.",
      candidates: active.map((l) => ({ listId: str(l.external_id), fullName: str(l.external_display_name) || null }))
    };
  }
  const listId = str(active[0].external_id);
  const { data: fact, error: factError } = await db
    .from("ad_qb_customer_facts")
    .select("qb_list_id, full_name, is_job, is_active")
    .eq("organization_id", organizationId)
    .eq("qb_list_id", listId)
    .maybeSingle();
  if (factError) throw persistenceError("QuickBooks customer mirror", factError);
  if (!fact || fact.is_active === false) {
    return { unresolvedReason: "The linked QuickBooks customer is missing or inactive in the QuickBooks mirror. Choose the customer:job." };
  }
  if (fact.is_job) return { listId, fullName: str(fact.full_name) || null };

  const { data: jobs, error: jobsError } = await db
    .from("ad_qb_customer_facts")
    .select("qb_list_id, full_name")
    .eq("organization_id", organizationId)
    .eq("parent_list_id", listId)
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(MAX_CANDIDATES);
  if (jobsError) throw persistenceError("QuickBooks customer mirror", jobsError);
  if (!jobs || jobs.length === 0) return { listId, fullName: str(fact.full_name) || null };
  return {
    unresolvedReason: `"${str(fact.full_name) || "This customer"}" has QuickBooks jobs. Choose the customer or the job this sales order belongs to.`,
    candidates: [
      { listId, fullName: str(fact.full_name) || null, isJob: false },
      ...jobs.map((j) => ({ listId: str(j.qb_list_id), fullName: str(j.full_name) || null, isJob: true }))
    ]
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} soldSnapshotId
 */
export async function loadStudioSalesOrderSource(db, organizationId, soldSnapshotId) {
  const { data: soldSnapshot, error } = await db
    .from("studio_estimate_sold_snapshots")
    .select("id, organization_id, studio_estimate_id, acceptance_id, publication_id, estimate_revision, sold_snapshot_json")
    .eq("organization_id", organizationId)
    .eq("id", soldSnapshotId)
    .maybeSingle();
  if (error) throw persistenceError("Sold snapshot", error);
  if (!soldSnapshot) return null;
  const { data: acceptance, error: accError } = await db
    .from("studio_estimate_acceptances")
    .select("id, organization_id, publication_id, customer_display_total, customer_safe_snapshot_json")
    .eq("organization_id", organizationId)
    .eq("id", soldSnapshot.acceptance_id)
    .maybeSingle();
  if (accError) throw persistenceError("Acceptance", accError);
  if (!acceptance) return null;
  return { soldSnapshot, acceptance };
}
