/**
 * Quote Library search helpers — tokenized multi-word AND, broad field coverage.
 */

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

/**
 * Split a user search string into safe tokens (max 6 words, 40 chars each).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function tokenizeQuoteSearchQuery(raw) {
  return pickStr(raw)
    .split(/\s+/)
    .map((t) => t.replace(/%/g, "").replace(/,/g, "").slice(0, 40))
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * PostgREST .or() clause: one token must match at least one searchable column.
 *
 * @param {string} term
 * @returns {string}
 */
export function quoteSearchOrClauseForTerm(term) {
  const t = pickStr(term).replace(/%/g, "").slice(0, 40);
  if (!t) return "";
  const pat = `%${t}%`;
  return [
    `customer_name.ilike.${pat}`,
    `account_name.ilike.${pat}`,
    `project_name.ilike.${pat}`,
    `project_address.ilike.${pat}`,
    `quote_number.ilike.${pat}`,
    `quote_number_base.ilike.${pat}`,
    `quote_source.ilike.${pat}`,
    `quote_status.ilike.${pat}`,
    `city.ilike.${pat}`,
    `state.ilike.${pat}`,
    `zip.ilike.${pat}`,
    `sales_rep.ilike.${pat}`,
    `prepared_by.ilike.${pat}`,
    `created_by.ilike.${pat}`,
    `branch.ilike.${pat}`,
    `calculation_snapshot->internal_ui->>account.ilike.${pat}`,
    `calculation_snapshot->internal_ui->>project_name.ilike.${pat}`
  ].join(",");
}

/**
 * Apply global search filters to a Supabase query builder.
 * Each token is ANDed; within a token, columns are ORed.
 *
 * @param {object} qb
 * @param {unknown} rawSearch
 * @returns {object}
 */
export function applyQuoteLibrarySearch(qb, rawSearch) {
  const tokens = tokenizeQuoteSearchQuery(rawSearch);
  if (!tokens.length) return qb;

  let next = qb;
  for (const term of tokens) {
    const clause = quoteSearchOrClauseForTerm(term);
    if (!clause) continue;
    try {
      next = next.or(clause);
    } catch {
      /* ignore unsupported filter syntax in older PostgREST */
    }
  }
  return next;
}

/**
 * PostgREST .or() clause for account filter param.
 *
 * @param {string} account
 * @returns {string}
 */
export function quoteAccountFilterOrClause(account) {
  const a = pickStr(account).replace(/%/g, "").slice(0, 80);
  if (!a) return "";
  const pat = `%${a}%`;
  return [
    `customer_name.ilike.${pat}`,
    `account_name.ilike.${pat}`,
    `project_name.ilike.${pat}`,
    `quote_number.ilike.${pat}`,
    `quote_number_base.ilike.${pat}`,
    `calculation_snapshot->internal_ui->>account.ilike.${pat}`
  ].join(",");
}

/** Lightweight list select — no full calculation_snapshot blob. */
export const QUOTE_LIBRARY_LIST_SELECT =
  "id,quote_number,quote_number_base,revision_number,revision_label,quote_family_root_id,is_current_revision," +
  "archived_at,quote_source,quote_status,customer_name,customer_email,customer_phone,account_name," +
  "project_name,project_address,city,state,zip,sales_rep,branch,grand_total,estimated_sqft," +
  "created_at,updated_at,prepared_by,created_by," +
  "snapshot_pricing_mode:calculation_snapshot->internal_ui->>internal_material_basis," +
  "snapshot_account:calculation_snapshot->internal_ui->>account," +
  "snapshot_customer_display_total:calculation_snapshot->internal_ui->>customer_display_total";
