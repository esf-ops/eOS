import { normalizeAccountDirectorySearch } from "./accountDirectoryMemoryStore.mjs";
import { ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";

export { AccountDirectoryError };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

function requireCap(role, capability) {
  if (!roleHasCapability(role, capability)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
}

function validateEmailOptional(email) {
  if (email == null || String(email).trim() === "") return null;
  const v = String(email).trim();
  if (!EMAIL_RE.test(v)) {
    throw new AccountDirectoryError("invalid_email", "Email address is not valid.");
  }
  return v;
}

function normalizePhoneForMatch(phone) {
  if (phone == null || String(phone).trim() === "") return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length ? digits : null;
}

function isSuspiciousPhone(phone) {
  if (phone == null || String(phone).trim() === "") return false;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length > 0 && digits.length < 7) return true;
  if (/^0+$/.test(digits)) return true;
  return false;
}

function normalizeAliasValue(value) {
  return normalizeAccountDirectorySearch(value);
}

/**
 * @param {{ store: any, logAction?: Function, getSupabase?: Function }} deps
 */
export function createAccountDirectoryService(deps) {
  const store = deps.store;
  if (!store) throw new Error("createAccountDirectoryService: store required");

  async function writeAudit({
    organizationId,
    accountId,
    entityType,
    entityId,
    action,
    actorUserId,
    changedFields,
    oldValues,
    newValues,
    requestId,
    role
  }) {
    const safeOld = scrubAuditValues(oldValues);
    const safeNew = scrubAuditValues(newValues);
    await store.insertAuditEvent({
      organizationId,
      accountId,
      entityType,
      entityId,
      action,
      actorUserId: actorUserId ?? null,
      changedFields: changedFields ?? [],
      oldValues: safeOld,
      newValues: safeNew,
      requestId: requestId ?? null
    });
    if (typeof deps.logAction === "function" && deps.getSupabase) {
      try {
        await deps.logAction({
          supabase: deps.getSupabase(),
          user: actorUserId ? { id: actorUserId } : null,
          toolSlug: "account_directory",
          action,
          metadata: {
            entityType,
            entityId,
            accountId,
            changedFields: changedFields ?? [],
            role: role ?? null
          }
        });
      } catch {
        /* audit best-effort */
      }
    }
  }

  function scrubAuditValues(values) {
    if (!values || typeof values !== "object") return values ?? null;
    const out = { ...values };
    delete out.rawWorkbookRow;
    delete out.raw_payload;
    delete out.financial;
    delete out.lifetimeSales;
    delete out.openAr;
    return out;
  }

  function toListItem(account, contacts, locations, links) {
    const primaryContact = contacts.find((c) => c.isPrimaryEstimating && c.isActive) || contacts.find((c) => c.isActive);
    const primaryLoc = locations.find((l) => l.isPrimaryAccountLocation && l.isActive) || locations.find((l) => l.isActive);
    const qbLinked = links.some((l) => l.isActive && l.externalSystem === "quickbooks_desktop");
    return {
      id: account.id,
      name: account.displayName,
      displayName: account.displayName,
      legalName: account.legalName,
      primaryContact: primaryContact?.displayName ?? null,
      primaryEmail: primaryContact?.email ?? null,
      primaryPhone: primaryContact?.phone ?? null,
      city: primaryLoc?.city ?? null,
      state: primaryLoc?.state ?? null,
      status: account.archivedAt ? "archived" : account.status,
      quickbooksLinked: qbLinked,
      updatedAt: account.updatedAt,
      rowVersion: account.rowVersion,
      archivedAt: account.archivedAt ?? null,
      source: account.source
    };
  }

  async function hydrateDetail(organizationId, account, { includeAudit, role }) {
    const [contacts, locations, aliases, links] = await Promise.all([
      store.listContacts(organizationId, account.id),
      store.listLocations(organizationId, account.id),
      store.listAliases(organizationId, account.id),
      store.listExternalLinks(organizationId, account.id)
    ]);
    const item = toListItem(account, contacts, locations, links);
    /** @type {any} */
    const detail = {
      ...item,
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.displayName,
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        role: c.titleRole,
        isPrimary: c.isPrimaryEstimating,
        isActive: c.isActive,
        rowVersion: c.rowVersion
      })),
      locations: locations.map((l) => ({
        id: l.id,
        label: l.label,
        line1: l.addressLine1,
        line2: l.addressLine2,
        city: l.city,
        state: l.state,
        postalCode: l.postalCode,
        sourceAddressRaw: l.sourceAddressRaw,
        isPrimary: l.isPrimaryAccountLocation,
        isActive: l.isActive,
        rowVersion: l.rowVersion
      })),
      aliases: aliases.map((a) => ({
        id: a.id,
        alias: a.aliasValue,
        source: a.aliasSource,
        isActive: a.isActive,
        rowVersion: a.rowVersion
      })),
      externalLinks: links.map((l) => ({
        id: l.id,
        system: l.externalSystem === "quickbooks_desktop" ? "QuickBooks" : l.externalSystem,
        externalSystem: l.externalSystem,
        externalId: l.externalId,
        externalDisplayName: l.externalDisplayName,
        isActive: l.isActive
      }))
    };
    if (includeAudit && roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN)) {
      const events = await store.listAuditEvents(organizationId, account.id, { limit: 100 });
      detail.auditHistory = events.map((e) => ({
        id: e.id,
        at: e.createdAt,
        actor: e.actorUserId,
        action: e.action,
        detail: Array.isArray(e.changedFields) ? e.changedFields.join(", ") : null
      }));
    } else {
      detail.auditHistory = undefined;
    }
    return detail;
  }

  return {
    async listAccounts({ organizationId, role, tab, status, search, page, pageSize }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const limit = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE, 1), MAX_PAGE);
      const pageNum = Math.max(Number(page) || 1, 1);
      const offset = (pageNum - 1) * limit;

      let statusIn = null;
      let includeArchived = false;
      const t = String(tab || "accounts").trim();
      if (t === "prospects") statusIn = ["prospect"];
      else if (t === "needs_review") statusIn = ["needs_review"];
      else if (t === "archived") {
        statusIn = ["archived"];
        includeArchived = true;
      } else {
        statusIn = status ? [String(status)] : ["active", "inactive", "prospect", "needs_review"];
      }

      const { total, items } = await store.listAccounts(organizationId, {
        statusIn,
        includeArchived,
        search: search ? String(search).trim() : null,
        limit,
        offset
      });

      const mapped = [];
      for (const account of items) {
        const [contacts, locations, links] = await Promise.all([
          store.listContacts(organizationId, account.id),
          store.listLocations(organizationId, account.id),
          store.listExternalLinks(organizationId, account.id)
        ]);
        mapped.push(toListItem(account, contacts, locations, links));
      }
      return { items: mapped, total, page: pageNum, pageSize: limit };
    },

    async getAccount({ organizationId, role, accountId }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async createAccount({ organizationId, role, actorUserId, requestId, payload, asProspect }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const displayName = String(payload?.displayName ?? "").trim();
      if (!displayName) {
        throw new AccountDirectoryError("display_name_required", "Account name is required.");
      }
      const status = asProspect ? "prospect" : String(payload?.status || "active");
      if (!["active", "prospect", "inactive", "needs_review"].includes(status)) {
        throw new AccountDirectoryError("invalid_status", "Invalid account status.");
      }
      const account = await store.insertAccount({
        organizationId,
        displayName,
        legalName: payload?.legalName ? String(payload.legalName).trim() : null,
        status,
        source: payload?.source || "manual",
        createdBy: actorUserId,
        updatedBy: actorUserId
      });

      const email = validateEmailOptional(payload?.primaryEmail);
      const phone = payload?.primaryPhone ? String(payload.primaryPhone).trim() : null;
      if (payload?.primaryContactName || email || phone) {
        await store.insertContact({
          organizationId,
          accountId: account.id,
          displayName: String(payload?.primaryContactName || displayName).trim(),
          email,
          phone,
          phoneNormalized: normalizePhoneForMatch(phone),
          isPrimaryEstimating: true,
          createdBy: actorUserId,
          updatedBy: actorUserId
        });
      }
      if (payload?.city || payload?.state || payload?.postalCode || payload?.line1 || payload?.sourceAddressRaw) {
        await store.insertLocation({
          organizationId,
          accountId: account.id,
          label: "Main",
          addressLine1: payload?.line1 ? String(payload.line1).trim() : null,
          city: payload?.city ? String(payload.city).trim() : null,
          state: payload?.state ? String(payload.state).trim() : null,
          postalCode: payload?.postalCode ? String(payload.postalCode).trim() : null,
          sourceAddressRaw: payload?.sourceAddressRaw
            ? String(payload.sourceAddressRaw).trim()
            : null,
          isPrimaryAccountLocation: true,
          createdBy: actorUserId,
          updatedBy: actorUserId
        });
      }

      await writeAudit({
        organizationId,
        accountId: account.id,
        entityType: "account",
        entityId: account.id,
        action: asProspect ? "create_prospect" : "create_account",
        actorUserId,
        changedFields: ["displayName", "status"],
        newValues: { displayName, status },
        requestId,
        role
      });

      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateAccount({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const current = await store.getAccount(organizationId, accountId);
      if (!current) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      if (current.archivedAt) {
        throw new AccountDirectoryError("archived", "Archived accounts cannot be edited. Restore first.", 409);
      }

      const expected = payload?.rowVersion ?? payload?.expectedRowVersion;
      const patch = {};
      const changed = [];
      if (payload?.displayName != null) {
        const displayName = String(payload.displayName ?? "").trim();
        if (!displayName) throw new AccountDirectoryError("display_name_required", "Account name is required.");
        patch.displayName = displayName;
        changed.push("displayName");
      }
      if (payload?.legalName !== undefined) {
        patch.legalName = payload.legalName ? String(payload.legalName).trim() : null;
        changed.push("legalName");
      }
      if (payload?.status != null) {
        const status = String(payload.status);
        if (!["active", "prospect", "inactive", "needs_review"].includes(status)) {
          throw new AccountDirectoryError("invalid_status", "Invalid account status.");
        }
        if (status === "archived") {
          throw new AccountDirectoryError("use_archive", "Use archive to archive an account.");
        }
        patch.status = status;
        changed.push("status");
      }
      patch.updatedBy = actorUserId;

      const result = await store.updateAccount(organizationId, accountId, patch, expected);
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError(
          "conflict",
          "This account was updated by someone else. Reload and try again.",
          409,
          { rowVersion: result.current?.rowVersion }
        );
      }
      if (!result.ok) throw new AccountDirectoryError("not_found", "Account not found.", 404);

      await writeAudit({
        organizationId,
        accountId,
        entityType: "account",
        entityId: accountId,
        action: "update_account",
        actorUserId,
        changedFields: changed,
        oldValues: { displayName: current.displayName, status: current.status },
        newValues: patch,
        requestId,
        role
      });

      return hydrateDetail(organizationId, result.account, { includeAudit: true, role });
    },

    async archiveAccount({ organizationId, role, actorUserId, requestId, accountId, rowVersion }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN);
      const current = await store.getAccount(organizationId, accountId);
      if (!current) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const result = await store.updateAccount(
        organizationId,
        accountId,
        {
          status: "archived",
          archivedAt: new Date().toISOString(),
          archivedBy: actorUserId,
          updatedBy: actorUserId
        },
        rowVersion
      );
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError(
          "conflict",
          "This account was updated by someone else. Reload and try again.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "account",
        entityId: accountId,
        action: "archive_account",
        actorUserId,
        changedFields: ["status", "archivedAt"],
        oldValues: { status: current.status },
        newValues: { status: "archived" },
        requestId,
        role
      });
      return hydrateDetail(organizationId, result.account, { includeAudit: true, role });
    },

    async restoreAccount({ organizationId, role, actorUserId, requestId, accountId, rowVersion }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN);
      const current = await store.getAccount(organizationId, accountId);
      if (!current) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const result = await store.updateAccount(
        organizationId,
        accountId,
        {
          status: "active",
          archivedAt: null,
          archivedBy: null,
          updatedBy: actorUserId
        },
        rowVersion
      );
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError(
          "conflict",
          "This account was updated by someone else. Reload and try again.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "account",
        entityId: accountId,
        action: "restore_account",
        actorUserId,
        changedFields: ["status", "archivedAt"],
        oldValues: { status: current.status },
        newValues: { status: "active" },
        requestId,
        role
      });
      return hydrateDetail(organizationId, result.account, { includeAudit: true, role });
    },

    async addContact({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const displayName = String(payload?.name ?? payload?.displayName ?? "").trim();
      if (!displayName) throw new AccountDirectoryError("contact_name_required", "Contact name is required.");
      const email = validateEmailOptional(payload?.email);
      const phone = payload?.phone ? String(payload.phone).trim() : null;
      const contact = await store.insertContact({
        organizationId,
        accountId,
        displayName,
        firstName: payload?.firstName ?? null,
        lastName: payload?.lastName ?? null,
        titleRole: payload?.role ?? payload?.titleRole ?? null,
        email,
        phone,
        phoneNormalized: normalizePhoneForMatch(phone),
        isPrimaryEstimating: Boolean(payload?.isPrimary),
        createdBy: actorUserId,
        updatedBy: actorUserId
      });
      await writeAudit({
        organizationId,
        accountId,
        entityType: "contact",
        entityId: contact.id,
        action: "add_contact",
        actorUserId,
        changedFields: ["displayName"],
        newValues: { displayName },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateContact({ organizationId, role, actorUserId, requestId, accountId, contactId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const patch = {};
      if (payload?.name != null || payload?.displayName != null) {
        patch.displayName = String(payload?.name ?? payload?.displayName).trim();
      }
      if (payload?.email !== undefined) patch.email = validateEmailOptional(payload.email);
      if (payload?.phone !== undefined) {
        patch.phone = payload.phone ? String(payload.phone).trim() : null;
        patch.phoneNormalized = normalizePhoneForMatch(patch.phone);
      }
      if (payload?.role !== undefined || payload?.titleRole !== undefined) {
        patch.titleRole = payload?.role ?? payload?.titleRole ?? null;
      }
      if (payload?.isPrimary !== undefined) patch.isPrimaryEstimating = Boolean(payload.isPrimary);
      if (payload?.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
      patch.updatedBy = actorUserId;

      const result = await store.updateContact(organizationId, contactId, patch, payload?.rowVersion);
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError("conflict", "Contact was updated elsewhere. Reload and try again.", 409);
      }
      if (!result.ok || result.contact.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "Contact not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "contact",
        entityId: contactId,
        action: payload?.isActive === false ? "deactivate_contact" : "update_contact",
        actorUserId,
        changedFields: Object.keys(patch),
        newValues: patch,
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async addLocation({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const location = await store.insertLocation({
        organizationId,
        accountId,
        label: payload?.label ? String(payload.label).trim() : "Main",
        addressLine1: payload?.line1 ? String(payload.line1).trim() : null,
        addressLine2: payload?.line2 ? String(payload.line2).trim() : null,
        city: payload?.city ? String(payload.city).trim() : null,
        state: payload?.state ? String(payload.state).trim() : null,
        postalCode: payload?.postalCode ? String(payload.postalCode).trim() : null,
        sourceAddressRaw: payload?.sourceAddressRaw ?? null,
        isPrimaryAccountLocation: Boolean(payload?.isPrimary),
        createdBy: actorUserId,
        updatedBy: actorUserId
      });
      await writeAudit({
        organizationId,
        accountId,
        entityType: "location",
        entityId: location.id,
        action: "add_location",
        actorUserId,
        changedFields: ["label"],
        newValues: { label: location.label },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateLocation({ organizationId, role, actorUserId, requestId, accountId, locationId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const patch = {};
      if (payload?.label !== undefined) patch.label = String(payload.label).trim() || "Main";
      if (payload?.line1 !== undefined) patch.addressLine1 = payload.line1 ? String(payload.line1).trim() : null;
      if (payload?.line2 !== undefined) patch.addressLine2 = payload.line2 ? String(payload.line2).trim() : null;
      if (payload?.city !== undefined) patch.city = payload.city ? String(payload.city).trim() : null;
      if (payload?.state !== undefined) patch.state = payload.state ? String(payload.state).trim() : null;
      if (payload?.postalCode !== undefined) {
        patch.postalCode = payload.postalCode ? String(payload.postalCode).trim() : null;
      }
      if (payload?.isPrimary !== undefined) patch.isPrimaryAccountLocation = Boolean(payload.isPrimary);
      if (payload?.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
      patch.updatedBy = actorUserId;

      const result = await store.updateLocation(organizationId, locationId, patch, payload?.rowVersion);
      if (!result.ok && result.code === "conflict") {
        throw new AccountDirectoryError("conflict", "Location was updated elsewhere. Reload and try again.", 409);
      }
      if (!result.ok || result.location.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "Location not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "location",
        entityId: locationId,
        action: payload?.isActive === false ? "deactivate_location" : "update_location",
        actorUserId,
        changedFields: Object.keys(patch),
        newValues: patch,
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async addAlias({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const aliasValue = String(payload?.alias ?? payload?.aliasValue ?? "").trim();
      if (!aliasValue) throw new AccountDirectoryError("alias_required", "Alias is required.");
      const alias = await store.insertAlias({
        organizationId,
        accountId,
        aliasValue,
        aliasSource: payload?.source || "manual",
        normalizedMatchValue: normalizeAliasValue(aliasValue),
        createdBy: actorUserId,
        updatedBy: actorUserId
      });
      await writeAudit({
        organizationId,
        accountId,
        entityType: "alias",
        entityId: alias.id,
        action: "add_alias",
        actorUserId,
        changedFields: ["aliasValue"],
        newValues: { aliasValue },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async updateAlias({ organizationId, role, actorUserId, requestId, accountId, aliasId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const patch = {};
      if (payload?.alias != null || payload?.aliasValue != null) {
        patch.aliasValue = String(payload?.alias ?? payload?.aliasValue).trim();
        patch.normalizedMatchValue = normalizeAliasValue(patch.aliasValue);
      }
      if (payload?.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
      patch.updatedBy = actorUserId;
      const result = await store.updateAlias(organizationId, aliasId, patch, payload?.rowVersion);
      if (!result.ok || result.alias.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "Alias not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "alias",
        entityId: aliasId,
        action: payload?.isActive === false ? "deactivate_alias" : "update_alias",
        actorUserId,
        changedFields: Object.keys(patch),
        newValues: patch,
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async linkQuickBooks({ organizationId, role, actorUserId, requestId, accountId, payload }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const externalId = String(payload?.externalId ?? "").trim();
      if (!externalId) {
        throw new AccountDirectoryError("external_id_required", "QuickBooks List ID is required.");
      }
      const result = await store.insertExternalLink({
        organizationId,
        accountId,
        externalSystem: "quickbooks_desktop",
        externalId,
        externalDisplayName: payload?.externalDisplayName
          ? String(payload.externalDisplayName).trim()
          : null,
        sourceSnapshotDate: payload?.sourceSnapshot ?? null,
        linkedBy: actorUserId
      });
      if (!result.ok && result.code === "duplicate_external_id") {
        throw new AccountDirectoryError(
          "duplicate_external_id",
          "That QuickBooks identity is already linked to another account.",
          409
        );
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "external_link",
        entityId: result.link.id,
        action: "link_quickbooks",
        actorUserId,
        changedFields: ["externalId"],
        newValues: { externalSystem: "quickbooks_desktop", externalId },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    async deactivateExternalLink({ organizationId, role, actorUserId, requestId, accountId, linkId }) {
      requireCap(role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK);
      const account = await store.getAccount(organizationId, accountId);
      if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
      const result = await store.updateExternalLink(organizationId, linkId, { isActive: false });
      if (!result.ok || result.link.accountId !== accountId) {
        throw new AccountDirectoryError("not_found", "External link not found on this account.", 404);
      }
      await writeAudit({
        organizationId,
        accountId,
        entityType: "external_link",
        entityId: linkId,
        action: "deactivate_external_link",
        actorUserId,
        changedFields: ["isActive"],
        newValues: { isActive: false },
        requestId,
        role
      });
      return hydrateDetail(organizationId, account, { includeAudit: true, role });
    },

    /** Hard delete is intentionally unavailable. */
    async hardDeleteAccount() {
      throw new AccountDirectoryError(
        "hard_delete_unavailable",
        "Hard delete is not available. Archive the account instead.",
        405
      );
    },

    isSuspiciousPhone,
    validateEmailOptional,
    MAX_PAGE
  };
}
