/**
 * Partner quote security context — org + partner_account_id from quote_partner_user_access.
 * Internal admins do not bypass; partner routes require explicit partner user access rows.
 */

import { isMissingRelationError } from "./quotePersist.js";
import { resolveOrganizationContext, tableHasOrganizationId } from "../organizations/organizationContext.js";
import { pickPartnerAccountFromAccesses } from "./partnerQuoteSanitize.js";

export class PartnerContextError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode]
   * @param {string} [code]
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, statusCode = 403, code = "partner_context_denied", details = null) {
    super(message);
    this.name = "PartnerContextError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} table
 */
async function tableExists(db, table) {
  try {
    const { error } = await db.from(table).select("id").limit(1);
    return !error || !isMissingRelationError(error);
  } catch (e) {
    return !isMissingRelationError(e);
  }
}

/**
 * Strict org filter for partner-owned rows (no legacy null org leakage on partner paths).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
async function partnerAccountBelongsToOrg(db, organizationId, partnerAccountId) {
  const hasOrgCol = await tableHasOrganizationId(db, "quote_partner_accounts");
  let q = db.from("quote_partner_accounts").select("*").eq("id", partnerAccountId).limit(1);
  if (hasOrgCol) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) {
    if (isMissingRelationError(error)) throw new PartnerContextError("Quote partner tables not installed.", 503, "partner_foundation_missing");
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new PartnerContextError("Partner account not found for this organization.", 404, "partner_account_not_found");
  if (row.is_active === false || String(row.status || "active") === "inactive") {
    throw new PartnerContextError("Partner account is inactive.", 403, "partner_account_inactive");
  }
  return row;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} partnerAccountId
 */
async function loadActivePricingAssignment(db, organizationId, partnerAccountId) {
  const { data, error } = await db
    .from("quote_partner_pricing_assignments")
    .select("id,pricing_structure_id,is_active,starts_at,ends_at")
    .eq("partner_account_id", partnerAccountId)
    .eq("is_active", true)
    .order("starts_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  const asn = data?.[0];
  if (!asn?.pricing_structure_id) return null;
  const { data: structs, error: sErr } = await db
    .from("quote_pricing_structures")
    .select("id,code,name,is_active")
    .eq("id", asn.pricing_structure_id)
    .limit(1);
  if (sErr) throw sErr;
  const structure = structs?.[0];
  return {
    assignment_id: asn.id,
    pricing_structure_id: asn.pricing_structure_id,
    structure_code: structure?.code ?? null,
    structure_name: structure?.name ?? null,
    structure_active: structure?.is_active !== false
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} partnerAccountId
 */
async function loadPartnerBranding(db, organizationId, partnerAccountId) {
  if (!(await tableExists(db, "quote_partner_branding_settings"))) return null;
  const { data, error } = await db
    .from("quote_partner_branding_settings")
    .select(
      "logo_url,primary_color,secondary_color,display_name_override,footer_text,terms_text,is_active"
    )
    .eq("organization_id", organizationId)
    .eq("partner_account_id", partnerAccountId)
    .eq("is_active", true)
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    logo_url: row.logo_url ?? null,
    primary_color: row.primary_color ?? null,
    secondary_color: row.secondary_color ?? null,
    display_name_override: row.display_name_override ?? null,
    footer_text: row.footer_text ?? null,
    terms_text: row.terms_text ?? null
  };
}

/**
 * @param {import("express").Request} req
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, partnerAccountId?: string|null, partnerAccountSlug?: string|null }} options
 */
export async function resolvePartnerContext(req, options = {}) {
  const db = options.supabase;
  const userId = String(req?.user?.id || "").trim();
  if (!userId) throw new PartnerContextError("Authentication required.", 401, "auth_required");

  const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  const organizationId = orgCtx.organizationId ? String(orgCtx.organizationId) : null;
  if (!organizationId) {
    throw new PartnerContextError("Organization context unavailable.", 503, "organization_context_missing");
  }

  if (!(await tableExists(db, "quote_partner_user_access"))) {
    throw new PartnerContextError(
      "Partner user access not configured. Apply backend-core/supabase/partner_quote_foundation_v1_additive.sql.",
      503,
      "partner_foundation_missing"
    );
  }

  const { data: accessRows, error: aErr } = await db
    .from("quote_partner_user_access")
    .select("partner_account_id,role,is_active")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true);
  if (aErr) {
    if (isMissingRelationError(aErr)) {
      throw new PartnerContextError("Partner user access table missing.", 503, "partner_foundation_missing");
    }
    throw aErr;
  }

  const accesses = accessRows || [];
  const partnerIds = [...new Set(accesses.map((a) => String(a.partner_account_id)).filter(Boolean))];
  /** @type {Map<string, { id: string, account_slug?: string|null }>} */
  const partnersById = new Map();
  if (partnerIds.length) {
    const hasOrgCol = await tableHasOrganizationId(db, "quote_partner_accounts");
    let pq = db.from("quote_partner_accounts").select("id,account_slug,account_name,display_name").in("id", partnerIds);
    if (hasOrgCol) pq = pq.eq("organization_id", organizationId);
    const { data: partners, error: pErr } = await pq;
    if (pErr && !isMissingRelationError(pErr)) throw pErr;
    for (const p of partners || []) {
      partnersById.set(String(p.id), p);
    }
  }

  const selection = pickPartnerAccountFromAccesses(accesses, {
    partnerAccountId: options.partnerAccountId ?? req.query?.partnerAccountId ?? req.body?.partnerAccountId ?? null,
    partnerAccountSlug:
      options.partnerAccountSlug ??
      req.query?.partnerAccountSlug ??
      req.body?.partnerAccountSlug ??
      req.body?.partner_account_slug ??
      null,
    partnersById
  });

  if ("error" in selection) {
    throw new PartnerContextError(selection.error, 403, selection.code, {
      allowedPartners: selection.allowedPartners ?? undefined
    });
  }

  const partnerAccountId = selection.partnerAccountId;
  const partnerRow = await partnerAccountBelongsToOrg(db, organizationId, partnerAccountId);
  const pricingAssignment = await loadActivePricingAssignment(db, organizationId, partnerAccountId);
  const branding = await loadPartnerBranding(db, organizationId, partnerAccountId);

  const displayName =
    branding?.display_name_override ||
    partnerRow.display_name ||
    partnerRow.account_name ||
    "Partner";

  return {
    organizationId,
    organizationKey: orgCtx.organizationKey ?? null,
    organizationDisplayName: orgCtx.displayName ?? null,
    partnerAccountId,
    partnerRole: selection.role,
    partnerAccount: {
      id: partnerRow.id,
      account_slug: partnerRow.account_slug ?? null,
      display_name: displayName,
      account_name: partnerRow.account_name,
      account_type: partnerRow.account_type,
      status: partnerRow.status ?? (partnerRow.is_active === false ? "inactive" : "active")
    },
    pricingAssignment,
    branding
  };
}

/**
 * Partner-only users (dealer_partner) must not use internal/generic quote APIs.
 *
 * Hardened fail-closed behavior:
 * - Missing userId → 403 (no anonymous pass-through on internal routes).
 * - DB query fails because partner foundation tables are not yet installed → 503 (documented environment gap).
 * - Any other DB/network error → re-throw so the caller's error handler returns 500; never silently pass.
 * - user_kind null/empty on the profile row → treated as "internal" (non-partner) and allowed through.
 *   This is the safe default because the bootstrap path defaults to user_kind "internal".
 *   A new account that has not yet had user_kind set will be treated as internal, not as a partner bypass.
 * - user_kind "dealer_partner" → always 403 with code partner_use_partner_routes.
 *
 * @param {import("express").Request} req
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function assertInternalQuoteOperator(req, supabase) {
  const userId = String(req?.user?.id || "").trim();
  if (!userId) {
    const err = new Error("Authentication required for internal quote operations.");
    err.statusCode = 403;
    err.code = "partner_use_partner_routes";
    throw err;
  }
  const { data, error } = await supabase.from("user_profiles").select("user_kind").eq("id", userId).limit(1);
  if (error) {
    if (isMissingRelationError(error)) {
      throw new PartnerContextError(
        "User profiles table not available. Cannot verify internal quote operator status.",
        503,
        "partner_foundation_missing"
      );
    }
    // All other DB errors: re-throw so the middleware returns 500 rather than silently passing.
    throw error;
  }
  if (String(data?.[0]?.user_kind || "") === "dealer_partner") {
    const err = new Error("Partner users must use /api/partner-quote routes.");
    err.statusCode = 403;
    err.code = "partner_use_partner_routes";
    throw err;
  }
  // user_kind null/empty or any non-dealer_partner value → internal operator, allowed through.
}
