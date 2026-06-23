/**
 * Quote Library soft-archive helpers — archive entire internal quote families.
 */

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

/**
 * @param {Record<string, unknown>} row
 */
export function resolveQuoteFamilyRootId(row) {
  const root = pickStr(row?.quote_family_root_id);
  const id = pickStr(row?.id);
  return root || id;
}

/**
 * Pure planner for archive outcomes (unit tests).
 *
 * @param {Record<string, unknown>} row
 * @param {{ force?: boolean, elevated?: boolean }} opts
 */
export function planArchiveForRow(row, opts = {}) {
  const force = Boolean(opts.force);
  const elevated = Boolean(opts.elevated);
  const id = pickStr(row?.id);
  if (!id) return { id: "", status: "failed", reason: "missing_id" };
  if (row.archived_at) {
    return { id, quote_number: row.quote_number, status: "skipped", reason: "already_archived" };
  }
  const st = pickStr(row.quote_status);
  if ((st === "sold" || st === "won") && (!force || !elevated)) {
    return {
      id,
      quote_number: row.quote_number,
      status: "skipped",
      reason: "sold_or_won_requires_admin_force"
    };
  }
  return { id, quote_number: row.quote_number, status: "archived" };
}

/**
 * @param {Array<Record<string, unknown>>} results
 */
export function summarizeArchiveResults(results) {
  return {
    results,
    archived_count: results.filter((r) => r.status === "archived").length,
    skipped_count: results.filter((r) => r.status === "skipped").length,
    failed_count: results.filter((r) => r.status === "failed").length
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {Record<string, unknown>} seedRow
 * @param {{
 *   orgId: string|null,
 *   hasQuoteHeadersOrg: boolean,
 *   applyOrgScope: (qb: object) => object,
 *   userRef: string,
 *   force?: boolean,
 *   elevated?: boolean,
 *   source?: string,
 *   safeSelect?: (db: object, fn: () => Promise<unknown>) => Promise<{ data?: unknown, error?: unknown, skipped?: boolean }>
 * }} opts
 */
export async function softArchiveQuoteFamily(db, seedRow, opts) {
  const root = resolveQuoteFamilyRootId(seedRow);
  if (!root) {
    return summarizeArchiveResults([
      { id: pickStr(seedRow?.id), status: "failed", reason: "missing_family_root" }
    ]);
  }

  let qb = db
    .from("quote_headers")
    .select("id,quote_number,quote_status,quote_source,is_current_revision,archived_at,quote_family_root_id")
    .or(`id.eq.${root},quote_family_root_id.eq.${root}`);
  qb = opts.applyOrgScope(qb);
  const { data: familyRows, error: famErr } = await qb;
  if (famErr) throw famErr;

  const rows = Array.isArray(familyRows) ? familyRows : [];
  if (!rows.length) {
    return summarizeArchiveResults([
      { id: pickStr(seedRow?.id), status: "failed", reason: "not_found_or_not_authorized" }
    ]);
  }

  const userRef = pickStr(opts.userRef);
  const force = Boolean(opts.force);
  const elevated = Boolean(opts.elevated);
  const source = pickStr(opts.source) || "quote_library_archive";
  const safeSelect = opts.safeSelect;
  const archivedAt = new Date().toISOString();
  const results = [];

  for (const cur of rows) {
    const planned = planArchiveForRow(cur, { force, elevated });
    const id = pickStr(cur.id);
    if (planned.status !== "archived") {
      results.push(planned);
      continue;
    }

    const st = pickStr(cur.quote_status);
    const { data: updated, error: uErr } = await db
      .from("quote_headers")
      .update({
        archived_at: archivedAt,
        archived_by: userRef,
        quote_status: "archived",
        updated_at: archivedAt
      })
      .eq("id", id)
      .select("id,archived_at");

    if (uErr) {
      results.push({
        id,
        quote_number: cur.quote_number,
        status: "failed",
        reason: uErr.message || String(uErr)
      });
      continue;
    }
    if (!Array.isArray(updated) || !updated.length) {
      results.push({
        id,
        quote_number: cur.quote_number,
        status: "failed",
        reason: "update_matched_no_rows"
      });
      continue;
    }

    if (safeSelect) {
      await safeSelect(db, () =>
        db.from("quote_status_history").insert({
          quote_id: id,
          old_status: st || null,
          new_status: "archived",
          changed_by: userRef,
          metadata: { source, force, family_root_id: root }
        })
      );
    }

    results.push({ id, quote_number: cur.quote_number, status: "archived" });
  }

  return summarizeArchiveResults(results);
}

/**
 * Active library lists should hide archived quote families.
 *
 * @param {Record<string, unknown>} row
 */
export function isQuoteRowArchived(row) {
  return Boolean(row?.archived_at) || pickStr(row?.quote_status) === "archived";
}
