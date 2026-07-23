import { randomUUID } from "node:crypto";

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

/**
 * In-memory Account Directory store for tests and local foundation (no DB writes
 * to production). Org-scoped. Soft-archive only — no hard delete API.
 */
export function createAccountDirectoryMemoryStore() {
  /** @type {Map<string, any>} */
  const accounts = new Map();
  /** @type {Map<string, any>} */
  const contacts = new Map();
  /** @type {Map<string, any>} */
  const locations = new Map();
  /** @type {Map<string, any>} */
  const aliases = new Map();
  /** @type {Map<string, any>} */
  const externalLinks = new Map();
  /** @type {any[]} */
  const auditEvents = [];

  function assertOrg(row, organizationId) {
    if (!row || row.organizationId !== organizationId) return null;
    return row;
  }

  return {
    kind: "memory",

    async insertAccount(row) {
      const id = row.id || randomUUID();
      const record = {
        id,
        organizationId: row.organizationId,
        displayName: row.displayName,
        legalName: row.legalName ?? null,
        status: row.status,
        source: row.source ?? "manual",
        parentAccountId: row.parentAccountId ?? null,
        createdAt: row.createdAt ?? nowIso(),
        createdBy: row.createdBy ?? null,
        updatedAt: row.updatedAt ?? nowIso(),
        updatedBy: row.updatedBy ?? null,
        archivedAt: row.archivedAt ?? null,
        archivedBy: row.archivedBy ?? null,
        rowVersion: 1
      };
      accounts.set(id, record);
      return clone(record);
    },

    async getAccount(organizationId, accountId) {
      return clone(assertOrg(accounts.get(accountId), organizationId));
    },

    async updateAccount(organizationId, accountId, patch, expectedRowVersion) {
      const current = assertOrg(accounts.get(accountId), organizationId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current: clone(current) };
      }
      const next = {
        ...current,
        ...patch,
        id: current.id,
        organizationId: current.organizationId,
        rowVersion: Number(current.rowVersion) + 1,
        updatedAt: nowIso()
      };
      accounts.set(accountId, next);
      return { ok: true, account: clone(next) };
    },

    async listAccounts(organizationId, { statusIn, includeArchived, search, limit, offset } = {}) {
      let rows = Array.from(accounts.values()).filter((a) => a.organizationId === organizationId);
      if (!includeArchived) {
        rows = rows.filter((a) => !a.archivedAt && a.status !== "archived");
      }
      if (Array.isArray(statusIn) && statusIn.length) {
        const set = new Set(statusIn);
        rows = rows.filter((a) => set.has(a.status) || (set.has("archived") && a.archivedAt));
      }
      if (search) {
        const q = normalizeSearch(search);
        rows = rows.filter((a) => {
          const hay = [
            a.displayName,
            a.legalName,
            ...listContactsForAccount(a.id).map((c) => `${c.displayName} ${c.email} ${c.phone}`),
            ...listLocationsForAccount(a.id).map((l) => `${l.city} ${l.state}`),
            ...listAliasesForAccount(a.id).map((x) => x.aliasValue),
            ...listLinksForAccount(a.id).map((x) => x.externalDisplayName)
          ]
            .filter(Boolean)
            .join(" ");
          return normalizeSearch(hay).includes(q);
        });
      }
      rows.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)) || a.id.localeCompare(b.id));
      const total = rows.length;
      const page = rows.slice(offset ?? 0, (offset ?? 0) + (limit ?? 50)).map(clone);
      return { total, items: page };
    },

    async insertContact(row) {
      const id = row.id || randomUUID();
      const record = {
        id,
        organizationId: row.organizationId,
        accountId: row.accountId,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        displayName: row.displayName,
        titleRole: row.titleRole ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        phoneNormalized: row.phoneNormalized ?? null,
        contactType: row.contactType ?? null,
        isPrimaryEstimating: Boolean(row.isPrimaryEstimating),
        isActive: row.isActive !== false,
        createdAt: nowIso(),
        createdBy: row.createdBy ?? null,
        updatedAt: nowIso(),
        updatedBy: row.updatedBy ?? null,
        rowVersion: 1
      };
      if (record.isPrimaryEstimating && record.isActive) {
        clearPrimaryContacts(record.accountId, id);
      }
      contacts.set(id, record);
      return clone(record);
    },

    async updateContact(organizationId, contactId, patch, expectedRowVersion) {
      const current = assertOrg(contacts.get(contactId), organizationId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current: clone(current) };
      }
      const next = {
        ...current,
        ...patch,
        id: current.id,
        organizationId: current.organizationId,
        accountId: current.accountId,
        rowVersion: Number(current.rowVersion) + 1,
        updatedAt: nowIso()
      };
      if (next.isPrimaryEstimating && next.isActive) {
        clearPrimaryContacts(next.accountId, next.id);
      }
      contacts.set(contactId, next);
      return { ok: true, contact: clone(next) };
    },

    async listContacts(organizationId, accountId) {
      return listContactsForAccount(accountId)
        .filter((c) => c.organizationId === organizationId)
        .map(clone);
    },

    async insertLocation(row) {
      const id = row.id || randomUUID();
      const record = {
        id,
        organizationId: row.organizationId,
        accountId: row.accountId,
        label: row.label || "Main",
        addressLine1: row.addressLine1 ?? null,
        addressLine2: row.addressLine2 ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        postalCode: row.postalCode ?? null,
        sourceAddressRaw: row.sourceAddressRaw ?? null,
        locationType: row.locationType || "account",
        isPrimaryAccountLocation: Boolean(row.isPrimaryAccountLocation),
        isActive: row.isActive !== false,
        createdAt: nowIso(),
        createdBy: row.createdBy ?? null,
        updatedAt: nowIso(),
        updatedBy: row.updatedBy ?? null,
        rowVersion: 1
      };
      if (record.isPrimaryAccountLocation && record.isActive) {
        clearPrimaryLocations(record.accountId, id);
      }
      locations.set(id, record);
      return clone(record);
    },

    async updateLocation(organizationId, locationId, patch, expectedRowVersion) {
      const current = assertOrg(locations.get(locationId), organizationId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current: clone(current) };
      }
      const next = {
        ...current,
        ...patch,
        id: current.id,
        organizationId: current.organizationId,
        accountId: current.accountId,
        rowVersion: Number(current.rowVersion) + 1,
        updatedAt: nowIso()
      };
      if (next.isPrimaryAccountLocation && next.isActive) {
        clearPrimaryLocations(next.accountId, next.id);
      }
      locations.set(locationId, next);
      return { ok: true, location: clone(next) };
    },

    async listLocations(organizationId, accountId) {
      return listLocationsForAccount(accountId)
        .filter((l) => l.organizationId === organizationId)
        .map(clone);
    },

    async insertAlias(row) {
      const id = row.id || randomUUID();
      const record = {
        id,
        organizationId: row.organizationId,
        accountId: row.accountId,
        aliasValue: row.aliasValue,
        aliasSource: row.aliasSource || "manual",
        normalizedMatchValue: row.normalizedMatchValue,
        isActive: row.isActive !== false,
        createdAt: nowIso(),
        createdBy: row.createdBy ?? null,
        updatedAt: nowIso(),
        updatedBy: row.updatedBy ?? null,
        rowVersion: 1
      };
      aliases.set(id, record);
      return clone(record);
    },

    async updateAlias(organizationId, aliasId, patch, expectedRowVersion) {
      const current = assertOrg(aliases.get(aliasId), organizationId);
      if (!current) return { ok: false, code: "not_found" };
      if (expectedRowVersion != null && Number(current.rowVersion) !== Number(expectedRowVersion)) {
        return { ok: false, code: "conflict", current: clone(current) };
      }
      const next = {
        ...current,
        ...patch,
        id: current.id,
        organizationId: current.organizationId,
        accountId: current.accountId,
        rowVersion: Number(current.rowVersion) + 1,
        updatedAt: nowIso()
      };
      aliases.set(aliasId, next);
      return { ok: true, alias: clone(next) };
    },

    async listAliases(organizationId, accountId) {
      return listAliasesForAccount(accountId)
        .filter((a) => a.organizationId === organizationId)
        .map(clone);
    },

    async insertExternalLink(row) {
      const id = row.id || randomUUID();
      const dup = Array.from(externalLinks.values()).find(
        (l) =>
          l.organizationId === row.organizationId &&
          l.externalSystem === row.externalSystem &&
          l.externalId === row.externalId &&
          l.isActive
      );
      if (dup) return { ok: false, code: "duplicate_external_id", existing: clone(dup) };
      const record = {
        id,
        organizationId: row.organizationId,
        accountId: row.accountId,
        externalSystem: row.externalSystem,
        externalId: row.externalId,
        externalDisplayName: row.externalDisplayName ?? null,
        sourceSnapshotDate: row.sourceSnapshotDate ?? null,
        linkedAt: nowIso(),
        linkedBy: row.linkedBy ?? null,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        rowVersion: 1
      };
      externalLinks.set(id, record);
      return { ok: true, link: clone(record) };
    },

    async updateExternalLink(organizationId, linkId, patch) {
      const current = assertOrg(externalLinks.get(linkId), organizationId);
      if (!current) return { ok: false, code: "not_found" };
      const next = {
        ...current,
        ...patch,
        id: current.id,
        organizationId: current.organizationId,
        accountId: current.accountId,
        rowVersion: Number(current.rowVersion) + 1,
        updatedAt: nowIso()
      };
      if (next.isActive) {
        const dup = Array.from(externalLinks.values()).find(
          (l) =>
            l.id !== next.id &&
            l.organizationId === next.organizationId &&
            l.externalSystem === next.externalSystem &&
            l.externalId === next.externalId &&
            l.isActive
        );
        if (dup) return { ok: false, code: "duplicate_external_id", existing: clone(dup) };
      }
      externalLinks.set(linkId, next);
      return { ok: true, link: clone(next) };
    },

    async listExternalLinks(organizationId, accountId) {
      return listLinksForAccount(accountId)
        .filter((l) => l.organizationId === organizationId)
        .map(clone);
    },

    async insertAuditEvent(event) {
      const row = {
        id: randomUUID(),
        createdAt: nowIso(),
        ...event
      };
      auditEvents.push(row);
      return clone(row);
    },

    async listAuditEvents(organizationId, accountId, { limit = 100 } = {}) {
      return auditEvents
        .filter((e) => e.organizationId === organizationId && e.accountId === accountId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit)
        .map(clone);
    },

    /** Test helper — proves dry-run path never touches store. */
    __stats() {
      return {
        accounts: accounts.size,
        contacts: contacts.size,
        locations: locations.size,
        aliases: aliases.size,
        externalLinks: externalLinks.size,
        auditEvents: auditEvents.length
      };
    }
  };

  function listContactsForAccount(accountId) {
    return Array.from(contacts.values()).filter((c) => c.accountId === accountId);
  }
  function listLocationsForAccount(accountId) {
    return Array.from(locations.values()).filter((l) => l.accountId === accountId);
  }
  function listAliasesForAccount(accountId) {
    return Array.from(aliases.values()).filter((a) => a.accountId === accountId);
  }
  function listLinksForAccount(accountId) {
    return Array.from(externalLinks.values()).filter((l) => l.accountId === accountId);
  }
  function clearPrimaryContacts(accountId, exceptId) {
    for (const [id, c] of contacts) {
      if (c.accountId === accountId && c.isPrimaryEstimating && id !== exceptId) {
        contacts.set(id, { ...c, isPrimaryEstimating: false, rowVersion: Number(c.rowVersion) + 1 });
      }
    }
  }
  function clearPrimaryLocations(accountId, exceptId) {
    for (const [id, l] of locations) {
      if (l.accountId === accountId && l.isPrimaryAccountLocation && id !== exceptId) {
        locations.set(id, { ...l, isPrimaryAccountLocation: false, rowVersion: Number(l.rowVersion) + 1 });
      }
    }
  }
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export { normalizeSearch as normalizeAccountDirectorySearch };
