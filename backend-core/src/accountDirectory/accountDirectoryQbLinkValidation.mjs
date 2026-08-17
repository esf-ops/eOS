/**
 * Phase 0E — validate a human-confirmed QuickBooks ListID against trusted
 * staged customer facts (`ad_qb_customer_facts`) before creating a durable
 * Account Directory external link.
 *
 * Root vs job uses the existing enrichment rule: `is_job === true` is a
 * Job/Subcustomer and must not become a permanent customer identity.
 * This module does not walk ParentId to remap a child to its parent.
 * Name similarity must never authorize a durable QuickBooks link.
 *
 * Existing historical links are not revalidated or deactivated here.
 */

/**
 * Existing Account Directory enrichment rule: jobs/subcustomers are `is_job`.
 * @param {object|null|undefined} fact
 */
export function isAdQbRootCustomerFact(fact) {
  if (!fact || typeof fact !== "object") return false;
  return fact.isJob !== true && fact.is_job !== true;
}

/**
 * Exact ListID only — trim transport whitespace, never fuzzy/name match.
 * @param {unknown} value
 */
export function normalizeQuickBooksListId(value) {
  return String(value ?? "").trim();
}

/**
 * @param {object|null|undefined} fact store or supabase-shaped row
 * @param {{ organizationId: string, listId: string }} args
 */
export function evaluateQuickBooksLinkCandidate(fact, { organizationId, listId }) {
  const requested = normalizeQuickBooksListId(listId);
  if (!requested) {
    return {
      ok: false,
      code: "external_id_required",
      status: 400,
      message: "QuickBooks List ID is required."
    };
  }
  if (!fact || typeof fact !== "object") {
    return {
      ok: false,
      code: "qb_customer_not_found",
      status: 400,
      message: "That QuickBooks customer was not found in trusted staged data for this organization."
    };
  }

  const factOrg = String(fact.organizationId ?? fact.organization_id ?? "");
  const factListId = normalizeQuickBooksListId(fact.qbListId ?? fact.qb_list_id);
  if (factOrg !== String(organizationId) || factListId !== requested) {
    return {
      ok: false,
      code: "qb_customer_not_found",
      status: 400,
      message: "That QuickBooks customer was not found in trusted staged data for this organization."
    };
  }

  if (!isAdQbRootCustomerFact(fact)) {
    return {
      ok: false,
      code: "qb_job_not_linkable",
      status: 400,
      message:
        "Account Directory can only link a root QuickBooks customer. Job and subcustomer List IDs cannot be used as permanent identity."
    };
  }

  return { ok: true, fact };
}

/**
 * Test/memory helper — seed a trusted staged QB customer fact. Not used in production.
 * @param {object} store
 * @param {object} row
 */
export async function seedTrustedQuickBooksCustomerFact(store, row) {
  if (typeof store?.upsertQuickBooksCustomerFact !== "function") {
    throw new Error("store.upsertQuickBooksCustomerFact is required to seed trusted QB facts");
  }
  return store.upsertQuickBooksCustomerFact({
    organizationId: row.organizationId,
    qbListId: normalizeQuickBooksListId(row.qbListId ?? row.listId ?? row.externalId),
    parentListId: row.parentListId ?? row.parent_list_id ?? null,
    isJob: row.isJob === true || row.is_job === true,
    name: row.name ?? null,
    fullName: row.fullName ?? row.full_name ?? row.name ?? null,
    isActive: row.isActive !== false && row.is_active !== false
  });
}
