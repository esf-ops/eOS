/**
 * Org-scoped partner account search for Elite 100 Studio estimate scope.
 * Returns safe display fields only — never addresses, invoices, or raw payloads.
 * Watts/Spahn pricing still depends solely on trusted partner_account_id allowlists.
 */
import { tableHasOrganizationId } from "../organizations/organizationContext.js";
import { loadPartnerAccountForOrg } from "../quotes/partnerSetupHelpers.js";

function toSafeAccount(r) {
  const displayName =
    String(r.display_name || "").trim() ||
    String(r.account_name || "").trim() ||
    String(r.account_slug || "").trim() ||
    "Partner account";
  return {
    partnerAccountId: String(r.id),
    displayName,
    accountSlug: r.account_slug ? String(r.account_slug) : null
  };
}

/**
 * @param {{
 *   db: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   q?: string,
 *   limit?: number
 * }} params
 */
export async function searchStudioPartnerAccounts(params) {
  const organizationId = String(params.organizationId ?? "").trim();
  if (!organizationId) {
    const err = new Error("Organization context unavailable");
    err.statusCode = 403;
    err.code = "organization_required";
    throw err;
  }
  const q = String(params.q ?? "").trim().slice(0, 80).toLowerCase();
  const limit = Math.min(40, Math.max(1, Number(params.limit) || 20));
  const db = params.db;
  if (!db) {
    const err = new Error("Account search unavailable");
    err.statusCode = 503;
    err.code = "account_search_unavailable";
    throw err;
  }

  const hasOrg = await tableHasOrganizationId(db, "quote_partner_accounts");
  let query = db
    .from("quote_partner_accounts")
    .select("id,account_name,display_name,account_slug,status")
    .order("account_name")
    .limit(Math.min(200, limit * 5));

  if (hasOrg) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) {
    const err = new Error("Unable to search partner accounts");
    err.statusCode = 503;
    err.code = "account_search_failed";
    err.cause = error;
    throw err;
  }

  const rows = (data || [])
    .filter((r) => {
      const status = String(r.status ?? "active").toLowerCase();
      return status === "active" || status === "" || status === "null";
    })
    .map(toSafeAccount)
    .filter((r) => {
      if (!q) return true;
      const hay = `${r.displayName} ${r.accountSlug || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);

  return { accounts: rows };
}

/**
 * Reload a partner account by id within org scope. Returns null if not found/out of scope.
 * @param {{
 *   db: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   partnerAccountId: string
 * }} params
 */
export async function loadStudioPartnerAccount(params) {
  const organizationId = String(params.organizationId ?? "").trim();
  const partnerAccountId = String(params.partnerAccountId ?? "").trim();
  if (!organizationId || !partnerAccountId) return null;
  const db = params.db;
  if (!db) return null;

  const { row } = await loadPartnerAccountForOrg(db, partnerAccountId, organizationId);
  if (!row) return null;
  return toSafeAccount(row);
}
