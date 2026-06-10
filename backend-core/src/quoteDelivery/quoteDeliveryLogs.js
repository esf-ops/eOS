/**
 * Persist quote delivery audit rows (graceful when table not installed).
 */

import { mergeRowOrganizationId, tableHasOrganizationId } from "../organizations/organizationContext.js";
import { isMissingRelationError } from "../quotes/quotePersist.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 */
export async function quoteDeliveryLogsTableAvailable(db) {
  try {
    const { error } = await db.from("quote_delivery_logs").select("id").limit(1);
    return !error || !isMissingRelationError(error);
  } catch (e) {
    return !isMissingRelationError(e);
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {Record<string, unknown>} row
 */
export async function insertQuoteDeliveryLog(db, row) {
  const available = await quoteDeliveryLogsTableAvailable(db);
  if (!available) {
    return {
      ok: false,
      skipped: true,
      setupWarning:
        "quote_delivery_logs table not installed. Apply backend-core/supabase/eliteos_quote_delivery_foundation.sql."
    };
  }

  const hasOrgCol = row.organization_id
    ? await tableHasOrganizationId(db, "quote_delivery_logs")
    : false;

  const insertRow = mergeRowOrganizationId({ ...row }, row.organization_id, hasOrgCol);
  const { data, error } = await db.from("quote_delivery_logs").insert(insertRow).select("id").limit(1);

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        ok: false,
        skipped: true,
        setupWarning:
          "quote_delivery_logs table not installed. Apply backend-core/supabase/eliteos_quote_delivery_foundation.sql."
      };
    }
    console.warn("[quote-delivery] log insert failed:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, deliveryLogId: data?.[0]?.id ?? null };
}

/**
 * @param {Record<string, unknown>} params
 */
export function buildDeliveryLogRow(params) {
  return {
    organization_id: params.organizationId ?? null,
    quote_id: params.quoteId,
    quote_number: params.quoteNumber ?? null,
    revision_number: params.revisionNumber ?? null,
    revision_label: params.revisionLabel ?? null,
    snapshot_hash: params.snapshotHash ?? null,
    delivery_mode: params.deliveryMode ?? "email",
    status: params.status,
    sent_by: params.sentBy ?? null,
    sent_by_email: params.sentByEmail ?? null,
    recipients: params.recipients ?? [],
    subject: params.subject ?? null,
    provider: params.provider ?? null,
    provider_message_id: params.providerMessageId ?? null,
    error: params.error ?? null,
    metadata: params.metadata ?? {},
    sent_at: params.sentAt ?? null
  };
}
