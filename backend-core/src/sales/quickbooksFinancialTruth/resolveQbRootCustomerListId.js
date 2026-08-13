/**
 * Resolve QuickBooks customer ListID → root customer ListID using prepared
 * ad_qb_customer_facts only. Exact ListID hierarchy — never CustomerName.
 */

export const QB_ROOT_RESOLVE_MAX_DEPTH = 16;

/**
 * @typedef {{ qb_list_id: string, parent_list_id?: string|null, is_job?: boolean }} AdQbCustomerFact
 */

/**
 * Pure root walk. Never uses display names.
 *
 * @param {Map<string, AdQbCustomerFact>|Record<string, AdQbCustomerFact>} factsByListId
 * @param {string|null|undefined} customerListId
 * @param {{ maxDepth?: number }} [opts]
 * @returns {{ rootListId: string|null, reason: string|null, depth: number }}
 */
export function resolveQbRootCustomerListId(factsByListId, customerListId, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : QB_ROOT_RESOLVE_MAX_DEPTH;
  const id = String(customerListId ?? "").trim();
  if (!id) {
    return { rootListId: null, reason: "missing_customer_list_id", depth: 0 };
  }

  const getFact = (listId) => {
    if (factsByListId instanceof Map) return factsByListId.get(listId) || null;
    return factsByListId?.[listId] || null;
  };

  let current = id;
  const seen = new Set();
  let depth = 0;

  while (depth <= maxDepth) {
    if (seen.has(current)) {
      return { rootListId: null, reason: "cyclic_parent", depth };
    }
    seen.add(current);

    const fact = getFact(current);
    if (!fact) {
      return {
        rootListId: null,
        reason: depth === 0 ? "missing_customer_fact" : "missing_parent_fact",
        depth
      };
    }

    const parentId = String(fact.parent_list_id ?? "").trim() || null;
    const isJob = Boolean(fact.is_job);

    // Root: no parent. Treat as root even if is_job is mis-flagged when parent is blank.
    if (!parentId) {
      return { rootListId: current, reason: null, depth };
    }

    // Child/job: follow exact ParentId. Never flatten by name.
    if (isJob || parentId) {
      current = parentId;
      depth += 1;
      continue;
    }

    return { rootListId: current, reason: null, depth };
  }

  return { rootListId: null, reason: "max_depth_exceeded", depth };
}

/**
 * @param {Array<{ qb_customer_list_id?: string|null, qb_root_customer_list_id?: string|null, customer_name?: string|null, [k: string]: unknown }>} rows
 * @param {Map<string, AdQbCustomerFact>} factsByListId
 * @param {{ maxDepth?: number, factsUnavailable?: boolean }} [opts]
 * @returns {{
 *   rows: typeof rows,
 *   unresolvedCount: number,
 *   warnings: string[],
 *   coverage: ReturnType<typeof summarizeListIdCoverage>
 * }}
 */
export function applyRootListIdsToRows(rows, factsByListId, opts = {}) {
  const warnings = [];
  let unresolvedCount = 0;
  const reasonCounts = new Map();

  for (const row of rows) {
    const customerId = String(row.qb_customer_list_id ?? "").trim() || null;
    row.qb_customer_list_id = customerId;

    // Server is authoritative for root. Never trust name. Ignore client root when resolving.
    if (!customerId) {
      row.qb_root_customer_list_id = null;
      unresolvedCount += 1;
      reasonCounts.set("missing_customer_list_id", (reasonCounts.get("missing_customer_list_id") || 0) + 1);
      continue;
    }

    if (opts.factsUnavailable) {
      row.qb_root_customer_list_id = null;
      unresolvedCount += 1;
      reasonCounts.set("facts_unavailable", (reasonCounts.get("facts_unavailable") || 0) + 1);
      continue;
    }

    const { rootListId, reason } = resolveQbRootCustomerListId(factsByListId, customerId, opts);
    row.qb_root_customer_list_id = rootListId;
    if (!rootListId) {
      unresolvedCount += 1;
      const key = reason || "unresolved";
      reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
    }
  }

  for (const [reason, count] of reasonCounts.entries()) {
    if (count > 0) {
      warnings.push(`qb_root_unresolved:${reason}:${count}`);
    }
  }

  return {
    rows,
    unresolvedCount,
    warnings,
    coverage: summarizeListIdCoverage(rows)
  };
}

/**
 * @param {Array<{ qb_customer_list_id?: string|null, qb_root_customer_list_id?: string|null, transaction_type?: string|null }>} rows
 * @param {{ typeField?: string }} [opts]
 */
export function summarizeListIdCoverage(rows, opts = {}) {
  const typeField = opts.typeField || "transaction_type";
  const total = rows.length;
  let withCustomer = 0;
  let withRoot = 0;
  /** @type {Record<string, { total: number, with_customer_list_id: number, with_root_customer_list_id: number }>} */
  const byType = {};

  for (const row of rows) {
    const type = String(row[typeField] ?? "unknown");
    if (!byType[type]) {
      byType[type] = { total: 0, with_customer_list_id: 0, with_root_customer_list_id: 0 };
    }
    byType[type].total += 1;
    const hasCustomer = Boolean(String(row.qb_customer_list_id ?? "").trim());
    const hasRoot = Boolean(String(row.qb_root_customer_list_id ?? "").trim());
    if (hasCustomer) {
      withCustomer += 1;
      byType[type].with_customer_list_id += 1;
    }
    if (hasRoot) {
      withRoot += 1;
      byType[type].with_root_customer_list_id += 1;
    }
  }

  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 10000) / 100);

  return {
    total_rows: total,
    rows_with_qb_customer_list_id: withCustomer,
    rows_with_qb_root_customer_list_id: withRoot,
    unresolved_root_count: total - withRoot,
    customer_list_id_coverage_pct: pct(withCustomer),
    root_customer_list_id_coverage_pct: pct(withRoot),
    by_transaction_type: byType
  };
}

/**
 * Batch-load ad_qb_customer_facts for seed ListIDs and walk parents.
 * SELECT-only against enrichment facts — never writes AD identity.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {string[]} seedListIds
 * @param {{ maxDepth?: number }} [opts]
 * @returns {Promise<{ map: Map<string, AdQbCustomerFact>, unavailable: boolean, error?: string }>}
 */
export async function buildAdQbCustomerFactsMapForResolution(
  supabase,
  organizationId,
  seedListIds,
  opts = {}
) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : QB_ROOT_RESOLVE_MAX_DEPTH;
  /** @type {Map<string, AdQbCustomerFact>} */
  const map = new Map();
  let frontier = [...new Set(seedListIds.map((id) => String(id ?? "").trim()).filter(Boolean))];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const missing = frontier.filter((id) => !map.has(id));
    if (missing.length === 0) break;

    /** @type {string[]} */
    const nextParents = [];
    for (let i = 0; i < missing.length; i += 200) {
      const slice = missing.slice(i, i + 200);
      const { data, error } = await supabase
        .from("ad_qb_customer_facts")
        .select("qb_list_id, parent_list_id, is_job")
        .eq("organization_id", organizationId)
        .in("qb_list_id", slice);

      if (error) {
        const msg = String(error.message || error);
        if (/does not exist|42P01|Could not find the table|schema cache/i.test(msg)) {
          return { map, unavailable: true, error: msg.slice(0, 200) };
        }
        throw new Error(msg);
      }

      for (const row of data || []) {
        const listId = String(row.qb_list_id ?? "").trim();
        if (!listId) continue;
        const parent = String(row.parent_list_id ?? "").trim() || null;
        map.set(listId, {
          qb_list_id: listId,
          parent_list_id: parent,
          is_job: Boolean(row.is_job)
        });
        if (parent && !map.has(parent)) nextParents.push(parent);
      }
    }

    frontier = nextParents;
  }

  return { map, unavailable: false };
}

/**
 * Enrich financial rows with qb_root_customer_list_id (server-side).
 * Does not read or write Account Directory identity / external links.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {Array<object>} rows
 */
export async function enrichFinancialRowsWithRootListIds(supabase, organizationId, rows) {
  const seeds = rows.map((r) => r.qb_customer_list_id).filter(Boolean);
  const loaded = await buildAdQbCustomerFactsMapForResolution(supabase, organizationId, seeds);
  return applyRootListIdsToRows(rows, loaded.map, {
    factsUnavailable: loaded.unavailable
  });
}
