/**
 * Estimate Builder plans & files — links `quote_files` rows (uploaded through `/api/quote-files/*`) to the
 * estimate's quote. Files dropped before the first save are uploaded unattached and linked here on save;
 * files always follow the current revision, so Quote Library and a future QuickBooks hand-off see them on the
 * live quote. No bytes are copied; storage and audit stay in the shared quote file service.
 */

import { isUuid, logQuoteFileEvent } from "../files/quoteFileService.mjs";

export const MAX_ESTIMATE_FILES = 50;

/** @param {unknown} raw */
export function normalizeFileIds(raw) {
  const out = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const id = String(v ?? "").trim().toLowerCase();
    if (isUuid(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_ESTIMATE_FILES) break;
  }
  return out;
}

async function logLinked(db, orgId, userId, ids, metadata) {
  await Promise.all(
    ids.map((quoteFileId) =>
      logQuoteFileEvent({ supabase: db, organizationId: orgId, quoteFileId, actorUserId: userId, action: "linked_to_quote", metadata })
    )
  );
}

/**
 * Attach the caller's own unattached uploads to a quote. Files owned by another user, another organization,
 * or already attached to a quote are ignored.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ orgId: string|null, userId: string|null, quoteId: string, fileIds: string[] }} p
 * @returns {Promise<string[]>} linked file ids
 */
export async function linkPendingQuoteFiles(db, { orgId, userId, quoteId, fileIds }) {
  if (!orgId || !userId || !quoteId || !fileIds.length) return [];
  const { data, error } = await db
    .from("quote_files")
    .update({ quote_id: quoteId, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("uploaded_by_user_id", userId)
    .eq("status", "active")
    .is("quote_id", null)
    .in("id", fileIds)
    .select("id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => String(r.id));
  await logLinked(db, orgId, userId, ids, { quote_id: quoteId, source: "estimate_builder" });
  return ids;
}

/**
 * Move a revision's files (active and archived) to the new current revision.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ orgId: string|null, userId: string|null, fromQuoteId: string, toQuoteId: string }} p
 * @returns {Promise<string[]>} moved file ids
 */
export async function moveQuoteFilesToRevision(db, { orgId, userId, fromQuoteId, toQuoteId }) {
  if (!orgId || !fromQuoteId || !toQuoteId) return [];
  const { data, error } = await db
    .from("quote_files")
    .update({ quote_id: toQuoteId, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("quote_id", fromQuoteId)
    .neq("status", "deleted")
    .select("id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => String(r.id));
  await logLinked(db, orgId, userId, ids, { quote_id: toQuoteId, from_quote_id: fromQuoteId, source: "estimate_builder_revision" });
  return ids;
}
