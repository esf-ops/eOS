/**
 * Supabase-backed Account Directory store.
 * Domain objects use camelCase; columns use snake_case.
 * Soft-archive only — no hard deletes.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { fetchAllForAccountIdBatches } from "./accountDirectoryAccountIdBatch.mjs";
import {
  QB_CUSTOMER_SEARCH_MAX_RESULTS,
  QB_CUSTOMER_SEARCH_MIN_QUERY,
  assertSafeQbCustomerSearchItem,
  isQbCustomerSearchQueryTooShort,
  normalizeQbCustomerSearchQuery,
  sanitizeQbCustomerSearchNeedle,
  sortQbCustomerSearchItems,
  toPublicQuickBooksCustomerSearchItem
} from "./accountDirectoryQbCustomerSearch.mjs";

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    legalName: row.legal_name ?? null,
    status: row.status,
    source: row.source,
    parentAccountId: row.parent_account_id ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    displayName: row.display_name,
    titleRole: row.title_role ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    phoneNormalized: row.phone_normalized ?? null,
    contactType: row.contact_type ?? null,
    isPrimaryEstimating: Boolean(row.is_primary_estimating),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapLocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    label: row.label || "Main",
    addressLine1: row.address_line1 ?? null,
    addressLine2: row.address_line2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postalCode: row.postal_code ?? null,
    sourceAddressRaw: row.source_address_raw ?? null,
    locationType: row.location_type || "account",
    isPrimaryAccountLocation: Boolean(row.is_primary_account_location),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapAlias(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    aliasValue: row.alias_value,
    aliasSource: row.alias_source || "manual",
    normalizedMatchValue: row.normalized_match_value,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    externalSystem: row.external_system,
    externalId: row.external_id,
    externalDisplayName: row.external_display_name ?? null,
    sourceSnapshotDate: row.source_snapshot_date ?? null,
    linkedAt: row.linked_at,
    linkedBy: row.linked_by ?? null,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapNoteHead(row) {
  return {
    accountId: row.account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  };
}

function mapFollowUpHead(row) {
  return {
    accountId: row.account_id,
    dueAt: row.due_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  };
}

function mapNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    body: row.body,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapFollowUp(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    title: row.title,
    details: row.details ?? null,
    dueAt: row.due_at,
    status: row.status,
    assignedTo: row.assigned_to ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    completedAt: row.completed_at ?? null,
    completedBy: row.completed_by ?? null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    rowVersion: Number(row.row_version ?? 1)
  };
}

function mapAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    accountId: row.account_id,
    action: row.action,
    actorUserId: row.actor_user_id ?? null,
    changedFields: row.changed_fields ?? [],
    oldValues: row.old_values ?? null,
    newValues: row.new_values ?? null,
    requestId: row.request_id ?? null,
    createdAt: row.created_at
  };
}

function dbError(error, fallback = "Account Directory storage failed.") {
  const msg = String(error?.message || error || fallback);
  // Never return raw SQL to callers — service layer wraps into AccountDirectoryError.
  const code = String(error?.code || "");
  if (code === "23505") {
    return new AccountDirectoryError("conflict", "That record conflicts with an existing one.", 409);
  }
  return new AccountDirectoryError("storage_error", fallback, 500, { detail: msg.slice(0, 200) });
}

function isQbFactsRelationMissing(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || /does not exist|relation/i.test(msg);
}

function mapQbCustomerFact(row) {
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    qbListId: row.qb_list_id,
    parentListId: row.parent_list_id ?? null,
    isJob: Boolean(row.is_job),
    name: row.name ?? null,
    fullName: row.full_name ?? null,
    isActive: row.is_active !== false
  };
}

/**
 * @param {() => import("@supabase/supabase-js").SupabaseClient} getSupabase
 */
export function createAccountDirectorySupabaseStore(getSupabase) {
  if (typeof getSupabase !== "function") {
    throw new Error("createAccountDirectorySupabaseStore: getSupabase required");
  }
  const db = () => getSupabase();
  const LINK_PAGE = 1000;

  async function fetchAllMatching(table, apply) {
    const rows = [];
    let from = 0;
    for (;;) {
      let q = db().from(table).select("*").range(from, from + LINK_PAGE - 1);
      if (apply) q = apply(q);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < LINK_PAGE) break;
      from += LINK_PAGE;
    }
    return rows;
  }

  async function fetchMatchingUntilCap(table, apply, { select = "*", cap = 20000 } = {}) {
    const limit = Math.max(1, Number(cap) || 20000);
    const rows = [];
    let from = 0;
    for (;;) {
      let q = db().from(table).select(select).range(from, from + LINK_PAGE - 1);
      if (apply) q = apply(q);
      const { data, error } = await q;
      if (error) throw error;
      const batch = data || [];
      rows.push(...batch);
      if (rows.length > limit) {
        return { rows: null, complete: false, truncated: true };
      }
      if (batch.length < LINK_PAGE) {
        return { rows, complete: true, truncated: false };
      }
      from += LINK_PAGE;
    }
  }

  return {
    kind: "supabase",

    async insertAccount(row) {
      const { data, error } = await db()
        .from("account_directory_accounts")
        .insert({
          organization_id: row.organizationId,
          display_name: row.displayName,
          legal_name: row.legalName ?? null,
          status: row.status,
          source: row.source ?? "manual",
          parent_account_id: row.parentAccountId ?? null,
          created_by: row.createdBy ?? null,
          updated_by: row.updatedBy ?? null
        })
        .select("*")
        .single();
      if (error) throw dbError(error, "Could not create account.");
      return mapAccount(data);
    },

    async getAccount(organizationId, accountId) {
      const { data, error } = await db()
        .from("account_directory_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", accountId)
        .maybeSingle();
      if (error) throw dbError(error, "Could not load account.");
      return mapAccount(data);
    },

    /**
     * Batched account fetch for Live Digital Estimates portfolio (no N+1).
     * @param {string} organizationId
     * @param {string[]} accountIds
     */
    async getAccountsByIds(organizationId, accountIds) {
      const ids = [...new Set((accountIds || []).map(String).filter(Boolean))];
      if (!ids.length) return [];
      const { data, error } = await db()
        .from("account_directory_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .in("id", ids);
      if (error) throw dbError(error, "Could not load accounts.");
      return (data || []).map(mapAccount);
    },

    async updateAccount(organizationId, accountId, patch, expectedRowVersion) {
      const current = await this.getAccount(organizationId, accountId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current };
      }

      /** @type {Record<string, unknown>} */
      const update = { updated_by: patch.updatedBy ?? null };
      if (patch.displayName !== undefined) update.display_name = patch.displayName;
      if (patch.legalName !== undefined) update.legal_name = patch.legalName;
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.source !== undefined) update.source = patch.source;
      if (patch.parentAccountId !== undefined) update.parent_account_id = patch.parentAccountId;
      if (patch.archivedAt !== undefined) update.archived_at = patch.archivedAt;
      if (patch.archivedBy !== undefined) update.archived_by = patch.archivedBy;

      let q = db()
        .from("account_directory_accounts")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", accountId);
      if (expectedRowVersion != null) {
        q = q.eq("row_version", Number(expectedRowVersion));
      }
      const { data, error } = await q.select("*").maybeSingle();
      if (error) throw dbError(error, "Could not update account.");
      if (!data) {
        const again = await this.getAccount(organizationId, accountId);
        if (!again) return { ok: false, code: "not_found" };
        return { ok: false, code: "conflict", current: again };
      }
      return { ok: true, account: mapAccount(data) };
    },

    async listAccounts(organizationId, { statusIn, includeArchived, search, limit, offset } = {}) {
      let q = db()
        .from("account_directory_accounts")
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId)
        .order("display_name", { ascending: true })
        .order("id", { ascending: true });

      if (!includeArchived) {
        q = q.is("archived_at", null).neq("status", "archived");
      }
      if (Array.isArray(statusIn) && statusIn.length) {
        q = q.in("status", statusIn);
      }
      if (search) {
        const term = `%${String(search).trim()}%`;
        q = q.or(
          `display_name.ilike.${term},legal_name.ilike.${term}`
        );
      }

      const from = offset ?? 0;
      const to = from + (limit ?? 50) - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw dbError(error, "Could not list accounts.");
      return { total: count ?? (data || []).length, items: (data || []).map(mapAccount) };
    },

    async insertContact(row) {
      if (row.isPrimaryEstimating && row.isActive !== false) {
        await db()
          .from("account_directory_contacts")
          .update({ is_primary_estimating: false })
          .eq("account_id", row.accountId)
          .eq("organization_id", row.organizationId)
          .eq("is_primary_estimating", true)
          .eq("is_active", true);
      }
      const { data, error } = await db()
        .from("account_directory_contacts")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId,
          first_name: row.firstName ?? null,
          last_name: row.lastName ?? null,
          display_name: row.displayName,
          title_role: row.titleRole ?? null,
          email: row.email ?? null,
          phone: row.phone ?? null,
          phone_normalized: row.phoneNormalized ?? null,
          contact_type: row.contactType ?? null,
          is_primary_estimating: Boolean(row.isPrimaryEstimating),
          is_active: row.isActive !== false,
          created_by: row.createdBy ?? null,
          updated_by: row.updatedBy ?? null
        })
        .select("*")
        .single();
      if (error) throw dbError(error, "Could not create contact.");
      return mapContact(data);
    },

    async updateContact(organizationId, contactId, patch, expectedRowVersion) {
      const { data: currentRow, error: loadErr } = await db()
        .from("account_directory_contacts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", contactId)
        .maybeSingle();
      if (loadErr) throw dbError(loadErr, "Could not load contact.");
      const current = mapContact(currentRow);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current };
      }

      const nextPrimary = patch.isPrimaryEstimating ?? current.isPrimaryEstimating;
      const nextActive = patch.isActive ?? current.isActive;
      if (nextPrimary && nextActive) {
        await db()
          .from("account_directory_contacts")
          .update({ is_primary_estimating: false })
          .eq("account_id", current.accountId)
          .eq("organization_id", organizationId)
          .eq("is_primary_estimating", true)
          .eq("is_active", true)
          .neq("id", contactId);
      }

      /** @type {Record<string, unknown>} */
      const update = { updated_by: patch.updatedBy ?? null };
      if (patch.displayName !== undefined) update.display_name = patch.displayName;
      if (patch.firstName !== undefined) update.first_name = patch.firstName;
      if (patch.lastName !== undefined) update.last_name = patch.lastName;
      if (patch.titleRole !== undefined) update.title_role = patch.titleRole;
      if (patch.email !== undefined) update.email = patch.email;
      if (patch.phone !== undefined) update.phone = patch.phone;
      if (patch.phoneNormalized !== undefined) update.phone_normalized = patch.phoneNormalized;
      if (patch.isPrimaryEstimating !== undefined) update.is_primary_estimating = patch.isPrimaryEstimating;
      if (patch.isActive !== undefined) update.is_active = patch.isActive;
      if (patch.contactType !== undefined) update.contact_type = patch.contactType;

      let q = db()
        .from("account_directory_contacts")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", contactId);
      if (expectedRowVersion != null) q = q.eq("row_version", Number(expectedRowVersion));
      const { data, error } = await q.select("*").maybeSingle();
      if (error) throw dbError(error, "Could not update contact.");
      if (!data) return { ok: false, code: "conflict", current };
      return { ok: true, contact: mapContact(data) };
    },

    async listContacts(organizationId, accountId) {
      const { data, error } = await db()
        .from("account_directory_contacts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw dbError(error, "Could not list contacts.");
      return (data || []).map(mapContact);
    },

    async listContactsForOrganization(organizationId) {
      const { data, error } = await db()
        .from("account_directory_contacts")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not list organization contacts.");
      return (data || []).map(mapContact);
    },

    async listContactsForAccountIds(organizationId, accountIds) {
      return fetchAllForAccountIdBatches({
        accountIds,
        fetchBatch: async (chunkIds) => {
          const { data, error } = await db()
            .from("account_directory_contacts")
            .select("*")
            .eq("organization_id", organizationId)
            .in("account_id", chunkIds);
          if (error) throw dbError(error, "Could not list contacts for accounts.");
          return (data || []).map(mapContact);
        }
      });
    },

    async insertLocation(row) {
      if (row.isPrimaryAccountLocation && row.isActive !== false) {
        await db()
          .from("account_directory_locations")
          .update({ is_primary_account_location: false })
          .eq("account_id", row.accountId)
          .eq("organization_id", row.organizationId)
          .eq("is_primary_account_location", true)
          .eq("is_active", true);
      }
      const { data, error } = await db()
        .from("account_directory_locations")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId,
          label: row.label || "Main",
          address_line1: row.addressLine1 ?? null,
          address_line2: row.addressLine2 ?? null,
          city: row.city ?? null,
          state: row.state ?? null,
          postal_code: row.postalCode ?? null,
          source_address_raw: row.sourceAddressRaw ?? null,
          location_type: row.locationType || "account",
          is_primary_account_location: Boolean(row.isPrimaryAccountLocation),
          is_active: row.isActive !== false,
          created_by: row.createdBy ?? null,
          updated_by: row.updatedBy ?? null
        })
        .select("*")
        .single();
      if (error) throw dbError(error, "Could not create location.");
      return mapLocation(data);
    },

    async updateLocation(organizationId, locationId, patch, expectedRowVersion) {
      const { data: currentRow, error: loadErr } = await db()
        .from("account_directory_locations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", locationId)
        .maybeSingle();
      if (loadErr) throw dbError(loadErr, "Could not load location.");
      const current = mapLocation(currentRow);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current };
      }

      const nextPrimary = patch.isPrimaryAccountLocation ?? current.isPrimaryAccountLocation;
      const nextActive = patch.isActive ?? current.isActive;
      if (nextPrimary && nextActive) {
        await db()
          .from("account_directory_locations")
          .update({ is_primary_account_location: false })
          .eq("account_id", current.accountId)
          .eq("organization_id", organizationId)
          .eq("is_primary_account_location", true)
          .eq("is_active", true)
          .neq("id", locationId);
      }

      /** @type {Record<string, unknown>} */
      const update = { updated_by: patch.updatedBy ?? null };
      if (patch.label !== undefined) update.label = patch.label;
      if (patch.addressLine1 !== undefined) update.address_line1 = patch.addressLine1;
      if (patch.addressLine2 !== undefined) update.address_line2 = patch.addressLine2;
      if (patch.city !== undefined) update.city = patch.city;
      if (patch.state !== undefined) update.state = patch.state;
      if (patch.postalCode !== undefined) update.postal_code = patch.postalCode;
      if (patch.isPrimaryAccountLocation !== undefined) {
        update.is_primary_account_location = patch.isPrimaryAccountLocation;
      }
      if (patch.isActive !== undefined) update.is_active = patch.isActive;
      if (patch.locationType !== undefined) update.location_type = patch.locationType;

      let q = db()
        .from("account_directory_locations")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", locationId);
      if (expectedRowVersion != null) q = q.eq("row_version", Number(expectedRowVersion));
      const { data, error } = await q.select("*").maybeSingle();
      if (error) throw dbError(error, "Could not update location.");
      if (!data) return { ok: false, code: "conflict", current };
      return { ok: true, location: mapLocation(data) };
    },

    async listLocations(organizationId, accountId) {
      const { data, error } = await db()
        .from("account_directory_locations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw dbError(error, "Could not list locations.");
      return (data || []).map(mapLocation);
    },

    async listLocationsForOrganization(organizationId) {
      const { data, error } = await db()
        .from("account_directory_locations")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not list organization locations.");
      return (data || []).map(mapLocation);
    },

    async listLocationsForAccountIds(organizationId, accountIds) {
      return fetchAllForAccountIdBatches({
        accountIds,
        fetchBatch: async (chunkIds) => {
          const { data, error } = await db()
            .from("account_directory_locations")
            .select("*")
            .eq("organization_id", organizationId)
            .in("account_id", chunkIds);
          if (error) throw dbError(error, "Could not list locations for accounts.");
          return (data || []).map(mapLocation);
        }
      });
    },

    async insertAlias(row) {
      const { data, error } = await db()
        .from("account_directory_aliases")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId,
          alias_value: row.aliasValue,
          alias_source: row.aliasSource || "manual",
          normalized_match_value: row.normalizedMatchValue,
          is_active: row.isActive !== false,
          created_by: row.createdBy ?? null,
          updated_by: row.updatedBy ?? null
        })
        .select("*")
        .single();
      if (error) throw dbError(error, "Could not create alias.");
      return mapAlias(data);
    },

    async updateAlias(organizationId, aliasId, patch, expectedRowVersion) {
      const { data: currentRow, error: loadErr } = await db()
        .from("account_directory_aliases")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", aliasId)
        .maybeSingle();
      if (loadErr) throw dbError(loadErr, "Could not load alias.");
      const current = mapAlias(currentRow);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current };
      }
      /** @type {Record<string, unknown>} */
      const update = { updated_by: patch.updatedBy ?? null };
      if (patch.aliasValue !== undefined) update.alias_value = patch.aliasValue;
      if (patch.normalizedMatchValue !== undefined) update.normalized_match_value = patch.normalizedMatchValue;
      if (patch.isActive !== undefined) update.is_active = patch.isActive;
      let q = db()
        .from("account_directory_aliases")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", aliasId);
      if (expectedRowVersion != null) q = q.eq("row_version", Number(expectedRowVersion));
      const { data, error } = await q.select("*").maybeSingle();
      if (error) throw dbError(error, "Could not update alias.");
      if (!data) return { ok: false, code: "conflict", current };
      return { ok: true, alias: mapAlias(data) };
    },

    async listAliases(organizationId, accountId) {
      const { data, error } = await db()
        .from("account_directory_aliases")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw dbError(error, "Could not list aliases.");
      return (data || []).map(mapAlias);
    },

    async listAliasesForOrganization(organizationId) {
      const { data, error } = await db()
        .from("account_directory_aliases")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not list organization aliases.");
      return (data || []).map(mapAlias);
    },

    async listAliasesForAccountIds(organizationId, accountIds) {
      return fetchAllForAccountIdBatches({
        accountIds,
        fetchBatch: async (chunkIds) => {
          const { data, error } = await db()
            .from("account_directory_aliases")
            .select("*")
            .eq("organization_id", organizationId)
            .in("account_id", chunkIds);
          if (error) throw dbError(error, "Could not list aliases for accounts.");
          return (data || []).map(mapAlias);
        }
      });
    },

    async insertExternalLink(row) {
      const { data: dup } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", row.organizationId)
        .eq("external_system", row.externalSystem)
        .eq("external_id", row.externalId)
        .eq("is_active", true)
        .maybeSingle();
      if (dup) return { ok: false, code: "duplicate_external_id", existing: mapLink(dup) };

      const { data, error } = await db()
        .from("account_directory_external_links")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId,
          external_system: row.externalSystem,
          external_id: row.externalId,
          external_display_name: row.externalDisplayName ?? null,
          source_snapshot_date: row.sourceSnapshotDate ?? null,
          linked_by: row.linkedBy ?? null,
          is_active: true
        })
        .select("*")
        .single();
      if (error) {
        if (String(error.code) === "23505") {
          return { ok: false, code: "duplicate_external_id" };
        }
        throw dbError(error, "Could not link external identity.");
      }
      return { ok: true, link: mapLink(data) };
    },

    async listActiveExternalLinksByExternalId(organizationId, externalSystem, externalId) {
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("external_system", externalSystem)
        .eq("external_id", externalId)
        .eq("is_active", true);
      if (error) throw dbError(error, "Could not look up external link.");
      return (data || []).map(mapLink);
    },

    async listActiveExternalLinksByExternalIds(organizationId, externalSystem, externalIds) {
      return fetchAllForAccountIdBatches({
        accountIds: externalIds,
        fetchBatch: async (chunkIds) => {
          let q = db()
            .from("account_directory_external_links")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("is_active", true)
            .in("external_id", chunkIds);
          if (externalSystem) q = q.eq("external_system", externalSystem);
          const { data, error } = await q;
          if (error) throw dbError(error, "Could not look up external links.");
          return (data || []).map(mapLink);
        }
      });
    },

    async countAccounts(organizationId) {
      const { count, error } = await db()
        .from("account_directory_accounts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not count accounts.");
      return count ?? 0;
    },

    async countContacts(organizationId) {
      const { count, error } = await db()
        .from("account_directory_contacts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not count contacts.");
      return count ?? 0;
    },

    async countLocations(organizationId) {
      const { count, error } = await db()
        .from("account_directory_locations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not count locations.");
      return count ?? 0;
    },

    async countActiveExternalLinks(organizationId, externalSystem = null) {
      let q = db()
        .from("account_directory_external_links")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_active", true);
      if (externalSystem) q = q.eq("external_system", externalSystem);
      const { count, error } = await q;
      if (error) throw dbError(error, "Could not count external links.");
      return count ?? 0;
    },

    async listAllActiveExternalLinks(organizationId, externalSystem = "quickbooks_desktop") {
      try {
        const data = await fetchAllMatching("account_directory_external_links", (q) =>
          q.eq("organization_id", organizationId).eq("external_system", externalSystem).eq("is_active", true)
        );
        return (data || []).map(mapLink);
      } catch (error) {
        throw dbError(error, "Could not list external links.");
      }
    },

    async getExternalLink(organizationId, linkId) {
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", linkId)
        .maybeSingle();
      if (error) throw dbError(error, "Could not load external link.");
      return data ? mapLink(data) : null;
    },

    async updateExternalLink(organizationId, linkId, patch) {
      const { data: currentRow, error: loadErr } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", linkId)
        .maybeSingle();
      if (loadErr) throw dbError(loadErr, "Could not load external link.");
      const current = mapLink(currentRow);
      if (!current) return { ok: false, code: "not_found" };

      /** @type {Record<string, unknown>} */
      const update = {};
      if (patch.isActive !== undefined) update.is_active = patch.isActive;
      if (patch.externalDisplayName !== undefined) update.external_display_name = patch.externalDisplayName;
      if (patch.externalId !== undefined) update.external_id = patch.externalId;

      const { data, error } = await db()
        .from("account_directory_external_links")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", linkId)
        .select("*")
        .maybeSingle();
      if (error) {
        if (String(error.code) === "23505") {
          return { ok: false, code: "duplicate_external_id" };
        }
        throw dbError(error, "Could not update external link.");
      }
      if (!data) return { ok: false, code: "not_found" };
      return { ok: true, link: mapLink(data) };
    },

    async listExternalLinks(organizationId, accountId) {
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .order("linked_at", { ascending: false });
      if (error) throw dbError(error, "Could not list external links.");
      return (data || []).map(mapLink);
    },

    /**
     * Batched active external links for Live Digital Estimates (no per-account round trip).
     * @param {string} organizationId
     * @param {string[]} accountIds
     * @param {string} [externalSystem]
     */
    async listActiveExternalLinksForAccountIds(
      organizationId,
      accountIds,
      externalSystem = "quickbooks_desktop"
    ) {
      const ids = [...new Set((accountIds || []).map(String).filter(Boolean))];
      if (!ids.length) return [];
      let q = db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("account_id", ids);
      if (externalSystem) q = q.eq("external_system", externalSystem);
      const { data, error } = await q;
      if (error) throw dbError(error, "Could not list external links.");
      return (data || []).map(mapLink);
    },

    async listExternalLinksForOrganization(organizationId) {
      try {
        const data = await fetchAllMatching("account_directory_external_links", (q) =>
          q.eq("organization_id", organizationId)
        );
        return (data || []).map(mapLink);
      } catch (error) {
        throw dbError(error, "Could not list organization external links.");
      }
    },

    async listExternalLinksForAccountIds(organizationId, accountIds) {
      const ids = [...new Set((accountIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
      if (!ids.length) return [];
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .in("account_id", ids);
      if (error) throw dbError(error, "Could not list external links for accounts.");
      return (data || []).map(mapLink);
    },

    /**
     * Exact org-scoped ListID lookup against trusted staged facts.
     * Does not page the full customer table. Does not mutate existing links.
     */
    async getQuickBooksCustomerFactByListId(organizationId, listId) {
      const id = String(listId || "").trim();
      if (!organizationId || !id) return null;
      const { data, error } = await db()
        .from("ad_qb_customer_facts")
        .select("organization_id,qb_list_id,parent_list_id,is_job,name,full_name,is_active")
        .eq("organization_id", organizationId)
        .eq("qb_list_id", id)
        .maybeSingle();
      if (error) {
        if (isQbFactsRelationMissing(error)) {
          throw new AccountDirectoryError(
            "qb_facts_unavailable",
            "QuickBooks customer facts are unavailable. The link was not created.",
            503
          );
        }
        throw dbError(error, "Could not look up QuickBooks customer fact.");
      }
      return mapQbCustomerFact(data);
    },

    /**
     * Bounded lookup for Account 360 connection display. Missing facts stay
     * linked — this never deactivates historical external links.
     */
    async listQuickBooksCustomerFactsByListIds(organizationId, listIds) {
      const ids = [...new Set((listIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
      if (!organizationId || !ids.length) return [];
      const { data, error } = await db()
        .from("ad_qb_customer_facts")
        .select("organization_id,qb_list_id,parent_list_id,is_job,name,full_name,is_active")
        .eq("organization_id", organizationId)
        .in("qb_list_id", ids);
      if (error) {
        if (isQbFactsRelationMissing(error)) return [];
        throw dbError(error, "Could not look up QuickBooks customer facts.");
      }
      return (data || []).map(mapQbCustomerFact).filter(Boolean);
    },

    /**
     * Org-scoped root-customer discovery. Jobs/subcustomers excluded.
     * Bounded ILIKE + optional exact ListID. Never writes to QuickBooks.
     */
    async searchQuickBooksRootCustomers(organizationId, { query, limit } = {}) {
      const q = normalizeQbCustomerSearchQuery(query);
      if (isQbCustomerSearchQueryTooShort(q)) return [];
      const max = Math.min(
        QB_CUSTOMER_SEARCH_MAX_RESULTS,
        Math.max(1, Number(limit) || QB_CUSTOMER_SEARCH_MAX_RESULTS)
      );
      const needle = sanitizeQbCustomerSearchNeedle(q);
      /** @type {object[]} */
      const facts = [];
      if (needle.length >= QB_CUSTOMER_SEARCH_MIN_QUERY) {
        const term = `%${needle}%`;
        const { data, error } = await db()
          .from("ad_qb_customer_facts")
          .select("organization_id,qb_list_id,parent_list_id,is_job,name,full_name,is_active")
          .eq("organization_id", organizationId)
          .eq("is_job", false)
          .or(`full_name.ilike."${term}",name.ilike."${term}"`)
          .order("full_name", { ascending: true })
          .order("qb_list_id", { ascending: true })
          .limit(max);
        if (error) {
          if (isQbFactsRelationMissing(error)) {
            throw new AccountDirectoryError(
              "qb_facts_unavailable",
              "QuickBooks customer facts are unavailable. Search could not be completed.",
              503
            );
          }
          throw dbError(error, "Could not search QuickBooks customers.");
        }
        for (const row of data || []) {
          const mapped = mapQbCustomerFact(row);
          if (mapped) facts.push(mapped);
        }
      }
      const exact = await this.getQuickBooksCustomerFactByListId(organizationId, q);
      if (exact && exact.isJob !== true && !facts.some((f) => f.qbListId === exact.qbListId)) {
        facts.unshift(exact);
      }
      return sortQbCustomerSearchItems(
        facts.map((fact) => assertSafeQbCustomerSearchItem(toPublicQuickBooksCustomerSearchItem(fact)))
      ).slice(0, max);
    },

    async insertAccountNote(row) {
      const { data, error } = await db()
        .from("account_directory_notes")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId,
          body: row.body,
          created_by: row.createdBy ?? null,
          updated_by: row.updatedBy ?? null
        })
        .select("*")
        .single();
      if (error) throw dbError(error, "Could not create note.");
      return mapNote(data);
    },

    async getAccountNote(organizationId, noteId) {
      const { data, error } = await db()
        .from("account_directory_notes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", noteId)
        .maybeSingle();
      if (error) throw dbError(error, "Could not load note.");
      return mapNote(data);
    },

    async listAccountNotes(organizationId, accountId, { page = 1, limit = 25, includeArchived = false } = {}) {
      const safePage = Math.max(1, Number.parseInt(String(page ?? "1"), 10) || 1);
      const safeLimit = Math.max(1, Number.parseInt(String(limit ?? "25"), 10) || 25);
      const from = (safePage - 1) * safeLimit;
      const to = from + safeLimit - 1;
      let q = db()
        .from("account_directory_notes")
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("account_id", accountId);
      if (!includeArchived) q = q.is("archived_at", null);
      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
      const { data, error, count } = await q.range(from, to);
      if (error) throw dbError(error, "Could not list notes.");
      const total = count ?? (data || []).length;
      return {
        items: (data || []).map(mapNote),
        pagination: {
          page: safePage,
          limit: safeLimit,
          has_more: total > from + safeLimit
        }
      };
    },

    async updateAccountNote(organizationId, noteId, patch, expectedRowVersion) {
      const current = await this.getAccountNote(organizationId, noteId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current };
      }
      /** @type {Record<string, unknown>} */
      const update = { updated_by: patch.updatedBy ?? null };
      if (patch.body !== undefined) update.body = patch.body;
      if (patch.archivedAt !== undefined) update.archived_at = patch.archivedAt;
      if (patch.archivedBy !== undefined) update.archived_by = patch.archivedBy;
      let q = db()
        .from("account_directory_notes")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", noteId);
      if (expectedRowVersion != null) q = q.eq("row_version", Number(expectedRowVersion));
      const { data, error } = await q.select("*").maybeSingle();
      if (error) throw dbError(error, "Could not update note.");
      if (!data) {
        const again = await this.getAccountNote(organizationId, noteId);
        if (!again) return { ok: false, code: "not_found" };
        return { ok: false, code: "conflict", current: again };
      }
      return { ok: true, note: mapNote(data) };
    },

    async insertAccountFollowUp(row) {
      const { data, error } = await db()
        .from("account_directory_follow_ups")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId,
          title: row.title,
          details: row.details ?? null,
          due_at: row.dueAt,
          status: row.status || "open",
          assigned_to: row.assignedTo ?? null,
          created_by: row.createdBy ?? null,
          updated_by: row.updatedBy ?? null
        })
        .select("*")
        .single();
      if (error) throw dbError(error, "Could not create follow-up.");
      return mapFollowUp(data);
    },

    async getAccountFollowUp(organizationId, followUpId) {
      const { data, error } = await db()
        .from("account_directory_follow_ups")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", followUpId)
        .maybeSingle();
      if (error) throw dbError(error, "Could not load follow-up.");
      return mapFollowUp(data);
    },

    async listAccountFollowUps(
      organizationId,
      accountId,
      { page = 1, limit = 25, status = "open", includeArchived = false } = {}
    ) {
      const safePage = Math.max(1, Number.parseInt(String(page ?? "1"), 10) || 1);
      const safeLimit = Math.max(1, Number.parseInt(String(limit ?? "25"), 10) || 25);
      const from = (safePage - 1) * safeLimit;
      const to = from + safeLimit - 1;
      const filter = String(status || "open").toLowerCase();
      let q = db()
        .from("account_directory_follow_ups")
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("account_id", accountId);
      if (!includeArchived) q = q.is("archived_at", null);
      if (filter === "open" || filter === "completed") q = q.eq("status", filter);
      if (filter === "completed") {
        q = q.order("completed_at", { ascending: false }).order("id", { ascending: false });
      } else if (filter === "all") {
        q = q
          .order("status", { ascending: false })
          .order("due_at", { ascending: true })
          .order("id", { ascending: true });
      } else {
        q = q.order("due_at", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true });
      }
      const { data, error, count } = await q.range(from, to);
      if (error) throw dbError(error, "Could not list follow-ups.");
      const total = count ?? (data || []).length;
      return {
        items: (data || []).map(mapFollowUp),
        pagination: {
          page: safePage,
          limit: safeLimit,
          has_more: total > from + safeLimit
        }
      };
    },

    async updateAccountFollowUp(organizationId, followUpId, patch, expectedRowVersion) {
      const current = await this.getAccountFollowUp(organizationId, followUpId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current };
      }
      /** @type {Record<string, unknown>} */
      const update = { updated_by: patch.updatedBy ?? null };
      if (patch.title !== undefined) update.title = patch.title;
      if (patch.details !== undefined) update.details = patch.details;
      if (patch.dueAt !== undefined) update.due_at = patch.dueAt;
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.assignedTo !== undefined) update.assigned_to = patch.assignedTo;
      if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
      if (patch.completedBy !== undefined) update.completed_by = patch.completedBy;
      if (patch.archivedAt !== undefined) update.archived_at = patch.archivedAt;
      if (patch.archivedBy !== undefined) update.archived_by = patch.archivedBy;
      let q = db()
        .from("account_directory_follow_ups")
        .update(update)
        .eq("organization_id", organizationId)
        .eq("id", followUpId);
      if (expectedRowVersion != null) q = q.eq("row_version", Number(expectedRowVersion));
      const { data, error } = await q.select("*").maybeSingle();
      if (error) throw dbError(error, "Could not update follow-up.");
      if (!data) {
        const again = await this.getAccountFollowUp(organizationId, followUpId);
        if (!again) return { ok: false, code: "not_found" };
        return { ok: false, code: "conflict", current: again };
      }
      return { ok: true, followUp: mapFollowUp(data) };
    },

    async insertAuditEvent(event) {
      const { data, error } = await db()
        .from("account_directory_audit_events")
        .insert({
          organization_id: event.organizationId,
          entity_type: event.entityType,
          entity_id: event.entityId,
          account_id: event.accountId ?? null,
          action: event.action,
          actor_user_id: event.actorUserId ?? null,
          changed_fields: event.changedFields ?? [],
          old_values: event.oldValues ?? null,
          new_values: event.newValues ?? null,
          request_id: event.requestId ?? null
        })
        .select("*")
        .single();
      if (error) {
        console.warn("[account-directory] audit insert failed:", error.message);
        return null;
      }
      return mapAudit(data);
    },

    async listAuditEvents(organizationId, accountId, { limit = 100 } = {}) {
      const { data, error } = await db()
        .from("account_directory_audit_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw dbError(error, "Could not list audit history.");
      return (data || []).map(mapAudit);
    },

    async listAuditEventsByAction(organizationId, action, { limit = 1000 } = {}) {
      const { data, error } = await db()
        .from("account_directory_audit_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("action", action)
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(limit) || 1000, 5000));
      if (error) throw dbError(error, "Could not list audit history.");
      return (data || []).map(mapAudit);
    },

    async listNoteHeadsForOrganization(organizationId, { cap = 20000 } = {}) {
      try {
        const fetched = await fetchMatchingUntilCap(
          "account_directory_notes",
          (q) => q.eq("organization_id", organizationId).is("archived_at", null),
          { select: "account_id,created_at,updated_at,archived_at", cap }
        );
        if (fetched.truncated) return { items: [], complete: false, truncated: true };
        return {
          items: (fetched.rows || []).map(mapNoteHead),
          complete: true,
          truncated: false
        };
      } catch (error) {
        throw dbError(error, "Could not list note heads.");
      }
    },

    async listNoteHeadsForAccountIds(organizationId, accountIds, { cap = 20000 } = {}) {
      const ids = [...new Set((accountIds || []).map(String).filter(Boolean))];
      if (!ids.length) return { items: [], complete: true, truncated: false };
      try {
        const fetched = await fetchMatchingUntilCap(
          "account_directory_notes",
          (q) => q.eq("organization_id", organizationId).is("archived_at", null).in("account_id", ids),
          { select: "account_id,created_at,updated_at,archived_at", cap }
        );
        if (fetched.truncated) return { items: [], complete: false, truncated: true };
        return {
          items: (fetched.rows || []).map(mapNoteHead),
          complete: true,
          truncated: false
        };
      } catch (error) {
        throw dbError(error, "Could not list note heads for accounts.");
      }
    },

    async listOpenFollowUpHeadsForOrganization(organizationId, { cap = 20000 } = {}) {
      try {
        const fetched = await fetchMatchingUntilCap(
          "account_directory_follow_ups",
          (q) => q.eq("organization_id", organizationId).is("archived_at", null).eq("status", "open"),
          { select: "account_id,due_at,status,created_at,updated_at,archived_at", cap }
        );
        if (fetched.truncated) return { items: [], complete: false, truncated: true };
        return {
          items: (fetched.rows || []).map(mapFollowUpHead),
          complete: true,
          truncated: false
        };
      } catch (error) {
        throw dbError(error, "Could not list follow-up heads.");
      }
    },

    async listOpenFollowUpHeadsForAccountIds(organizationId, accountIds, { cap = 20000 } = {}) {
      const ids = [...new Set((accountIds || []).map(String).filter(Boolean))];
      if (!ids.length) return { items: [], complete: true, truncated: false };
      try {
        const fetched = await fetchMatchingUntilCap(
          "account_directory_follow_ups",
          (q) =>
            q
              .eq("organization_id", organizationId)
              .is("archived_at", null)
              .eq("status", "open")
              .in("account_id", ids),
          { select: "account_id,due_at,status,created_at,updated_at,archived_at", cap }
        );
        if (fetched.truncated) return { items: [], complete: false, truncated: true };
        return {
          items: (fetched.rows || []).map(mapFollowUpHead),
          complete: true,
          truncated: false
        };
      } catch (error) {
        throw dbError(error, "Could not list follow-up heads for accounts.");
      }
    }
  };
}
