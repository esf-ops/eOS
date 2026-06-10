/**
 * Load internal quote rows for delivery with org scoping.
 */

import { createHash } from "node:crypto";

import {
  organizationScopeOrFilter,
  resolveOrganizationContext,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import { isMissingRelationError } from "../quotes/quotePersist.js";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg) {
  if (!orgId || !hasQuoteHeadersOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {import("express").Request} req
 * @param {string} quoteId
 */
export async function loadInternalQuoteForDelivery(db, req, quoteId) {
  if (!isUuid(quoteId)) {
    return { ok: false, httpStatus: 400, error: "Invalid quote id" };
  }

  const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  const orgId = orgCtx.organizationId;
  const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;

  let q = db.from("quote_headers").select("*").eq("id", quoteId).limit(1);
  q = applyQuoteHeaderOrgScope(q, orgId, hasQuoteHeadersOrg);
  const { data, error } = await q;

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        ok: false,
        httpStatus: 503,
        error: "Quote platform tables not installed. Apply backend-core/supabase/eos_quote_platform.sql."
      };
    }
    throw error;
  }

  const row = data?.[0];
  if (!row) {
    return { ok: false, httpStatus: 404, error: "Quote not found" };
  }

  if (String(row.quote_source || "") !== "internal_quote") {
    return {
      ok: false,
      httpStatus: 422,
      error: "Quote delivery is only supported for internal estimates in Phase 1",
      code: "unsupported_quote_source"
    };
  }

  return { ok: true, row, orgId, orgCtx };
}

/**
 * @param {Record<string, unknown>} snapshot
 */
export function computeSnapshotHash(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
