/**
 * Supabase-backed Account Directory store.
 * Domain objects use camelCase; columns use snake_case.
 * Soft-archive only — no hard deletes.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";

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

/**
 * @param {() => import("@supabase/supabase-js").SupabaseClient} getSupabase
 */
export function createAccountDirectorySupabaseStore(getSupabase) {
  if (typeof getSupabase !== "function") {
    throw new Error("createAccountDirectorySupabaseStore: getSupabase required");
  }
  const db = () => getSupabase();

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
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("external_system", externalSystem)
        .eq("is_active", true);
      if (error) throw dbError(error, "Could not list external links.");
      return (data || []).map(mapLink);
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

    async listExternalLinksForOrganization(organizationId) {
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) throw dbError(error, "Could not list organization external links.");
      return (data || []).map(mapLink);
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
    }
  };
}
