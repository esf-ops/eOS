/**
 * Quote Library search helpers — tokenized multi-word AND, broad field coverage.
 */

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

/**
 * Resolve dealer/account name from a quote row (list or detail).
 * Does not fall back to customer or project — those are separate display fields.
 *
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function deriveQuoteAccountName(row) {
  const r = row && typeof row === "object" ? row : {};
  const explicit = pickStr(r.account_name);
  if (explicit) return explicit;
  const snapAlias = pickStr(r.snapshot_account) || pickStr(r.snapshot_account_legacy);
  if (snapAlias) return snapAlias;
  const snap = r.calculation_snapshot && typeof r.calculation_snapshot === "object" ? r.calculation_snapshot : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  const ji = iu.job_info && typeof iu.job_info === "object" ? iu.job_info : {};
  const fromJobInfo = pickStr(ji.account);
  if (fromJobInfo) return fromJobInfo;
  const legacyRoot = pickStr(iu.account);
  if (legacyRoot) return legacyRoot;
  return "—";
}

/**
 * Account name to persist on quote_headers from an internal estimate save body.
 *
 * @param {Record<string, unknown>} body
 * @returns {string | null}
 */
export function resolveAccountNameForPersist(body) {
  const b = body && typeof body === "object" ? body : {};
  const ji = b.job_info && typeof b.job_info === "object" ? b.job_info : {};
  const v = pickStr(b.account_name) || pickStr(b.account) || pickStr(ji.account);
  return v || null;
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
    `calculation_snapshot->internal_ui->job_info->>account.ilike.${pat}`,
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
 * PostgREST .or() clause for account filter param (narrow — not global search).
 * Matches account_name and snapshot account paths only.
 *
 * @param {string} account
 * @returns {string}
 */
export function quoteAccountFilterOrClause(account) {
  const a = pickStr(account).replace(/%/g, "").slice(0, 80);
  if (!a) return "";
  const pat = `%${a}%`;
  return [
    `account_name.ilike.${pat}`,
    `calculation_snapshot->internal_ui->job_info->>account.ilike.${pat}`,
    `calculation_snapshot->internal_ui->>account.ilike.${pat}`,
    `quote_number.ilike.${pat}`,
    `quote_number_base.ilike.${pat}`
  ].join(",");
}

/** PostgREST JSON paths for snapshot account fallback ordering. */
export const QUOTE_ACCOUNT_SNAPSHOT_SORT_PATHS = [
  "calculation_snapshot->internal_ui->job_info->>account",
  "calculation_snapshot->internal_ui->>account"
];

/**
 * Compare two rows by derived account name for in-memory sort.
 * Missing account ("—") sorts after named accounts.
 *
 * @param {Record<string, unknown>} rowA
 * @param {Record<string, unknown>} rowB
 * @param {boolean} [ascending]
 * @returns {number}
 */
export function compareQuoteAccountNames(rowA, rowB, ascending = true) {
  const a = deriveQuoteAccountName(rowA);
  const b = deriveQuoteAccountName(rowB);
  const aMissing = !a || a === "—";
  const bMissing = !b || b === "—";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return ascending ? cmp : -cmp;
}

/**
 * Sort list rows by derived account (page-level refinement after DB fetch).
 *
 * @param {Record<string, unknown>[]} rows
 * @param {boolean} [ascending]
 * @returns {Record<string, unknown>[]}
 */
export function sortRowsByDerivedAccount(rows, ascending = true) {
  return [...rows].sort((a, b) => {
    const acctCmp = compareQuoteAccountNames(a, b, ascending);
    if (acctCmp !== 0) return acctCmp;
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
}

/**
 * Resolve list sort param — Account is not customer_name.
 *
 * @param {unknown} sortRaw
 * @returns {{ kind: "account" } | { kind: "column", column: string }}
 */
export function resolveQuoteLibrarySortColumn(sortRaw) {
  const sort = pickStr(sortRaw) || "updated_at";
  if (sort === "account") return { kind: "account" };
  const allowed = ["created_at", "updated_at", "grand_total", "quote_status", "sales_rep", "branch", "customer_name"];
  if (allowed.includes(sort)) return { kind: "column", column: sort };
  return { kind: "column", column: "updated_at" };
}

/**
 * Apply account sort: account_name, then snapshot paths; missing values last.
 *
 * @param {object} qb
 * @param {boolean} [ascending]
 * @returns {object}
 */
export function applyQuoteLibraryAccountSort(qb, ascending = true) {
  const opts = { ascending, nullsFirst: false };
  let next = qb;
  try {
    next = next.order("account_name", opts);
  } catch {
    /* ignore */
  }
  for (const path of QUOTE_ACCOUNT_SNAPSHOT_SORT_PATHS) {
    try {
      next = next.order(path, opts);
    } catch {
      /* ignore unsupported PostgREST path order */
    }
  }
  return next;
}

/**
 * Apply list sort to a Supabase query builder.
 *
 * @param {object} qb
 * @param {unknown} sortRaw
 * @param {boolean} ascending
 * @returns {object}
 */
export function applyQuoteLibrarySort(qb, sortRaw, ascending) {
  const resolved = resolveQuoteLibrarySortColumn(sortRaw);
  if (resolved.kind === "account") return applyQuoteLibraryAccountSort(qb, ascending);
  return qb.order(resolved.column, { ascending, nullsFirst: false });
}

/** Lightweight list select — no full calculation_snapshot blob. */
export const QUOTE_LIBRARY_LIST_SELECT =
  "id,quote_number,quote_number_base,revision_number,revision_label,quote_family_root_id,is_current_revision," +
  "archived_at,quote_source,quote_status,customer_name,customer_email,customer_phone,account_name," +
  "project_name,project_address,city,state,zip,sales_rep,branch,grand_total,estimated_sqft," +
  "created_at,updated_at,prepared_by,created_by," +
  "snapshot_pricing_mode:calculation_snapshot->internal_ui->>internal_material_basis," +
  "snapshot_account:calculation_snapshot->internal_ui->job_info->>account," +
  "snapshot_account_legacy:calculation_snapshot->internal_ui->>account," +
  "snapshot_customer_display_total:calculation_snapshot->internal_ui->>customer_display_total";
