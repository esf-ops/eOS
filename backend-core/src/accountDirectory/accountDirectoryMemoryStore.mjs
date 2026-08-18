import { randomUUID } from "node:crypto";
import { selectTrustedQuickBooksRootCustomers } from "./accountDirectoryQbCustomerSearch.mjs";

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
  /** @type {Map<string, any>} */
  const qbCustomerFacts = new Map();
  /** @type {Map<string, any>} */
  const notes = new Map();
  /** @type {Map<string, any>} */
  const followUps = new Map();
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

    /**
     * Batched account fetch — one logical AD lookup for portfolio grouping.
     * @param {string} organizationId
     * @param {string[]} accountIds
     */
    async getAccountsByIds(organizationId, accountIds) {
      const out = [];
      for (const id of accountIds || []) {
        const row = assertOrg(accounts.get(String(id)), organizationId);
        if (row) out.push(clone(row));
      }
      return out;
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
            ...listLocationsForAccount(a.id).map((l) => `${l.city} ${l.state} ${l.postalCode}`),
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

    async listContactsForOrganization(organizationId) {
      return Array.from(contacts.values())
        .filter((c) => c.organizationId === organizationId)
        .map(clone);
    },

    async listContactsForAccountIds(organizationId, accountIds) {
      const idSet = new Set((accountIds || []).map((id) => String(id || "").trim()).filter(Boolean));
      if (!idSet.size) return [];
      return Array.from(contacts.values())
        .filter((c) => c.organizationId === organizationId && idSet.has(String(c.accountId)))
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

    async listLocationsForOrganization(organizationId) {
      return Array.from(locations.values())
        .filter((l) => l.organizationId === organizationId)
        .map(clone);
    },

    async listLocationsForAccountIds(organizationId, accountIds) {
      const idSet = new Set((accountIds || []).map((id) => String(id || "").trim()).filter(Boolean));
      if (!idSet.size) return [];
      return Array.from(locations.values())
        .filter((l) => l.organizationId === organizationId && idSet.has(String(l.accountId)))
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

    async listAliasesForOrganization(organizationId) {
      return Array.from(aliases.values())
        .filter((a) => a.organizationId === organizationId)
        .map(clone);
    },

    async listAliasesForAccountIds(organizationId, accountIds) {
      const idSet = new Set((accountIds || []).map((id) => String(id || "").trim()).filter(Boolean));
      if (!idSet.size) return [];
      return Array.from(aliases.values())
        .filter((a) => a.organizationId === organizationId && idSet.has(String(a.accountId)))
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

    async listActiveExternalLinksByExternalId(organizationId, externalSystem, externalId) {
      return Array.from(externalLinks.values())
        .filter(
          (l) =>
            l.organizationId === organizationId &&
            l.externalSystem === externalSystem &&
            l.externalId === externalId &&
            l.isActive
        )
        .map(clone);
    },

    async listActiveExternalLinksByExternalIds(organizationId, externalSystem, externalIds) {
      const want = new Set((externalIds || []).map(String).filter(Boolean));
      if (!want.size) return [];
      return Array.from(externalLinks.values())
        .filter(
          (l) =>
            l.organizationId === organizationId &&
            l.isActive &&
            want.has(String(l.externalId)) &&
            (externalSystem == null || l.externalSystem === externalSystem)
        )
        .map(clone);
    },

    async countAccounts(organizationId) {
      return Array.from(accounts.values()).filter((a) => a.organizationId === organizationId).length;
    },

    async countContacts(organizationId) {
      return Array.from(contacts.values()).filter((c) => c.organizationId === organizationId).length;
    },

    async countLocations(organizationId) {
      return Array.from(locations.values()).filter((l) => l.organizationId === organizationId).length;
    },

    async countActiveExternalLinks(organizationId, externalSystem = null) {
      return Array.from(externalLinks.values()).filter(
        (l) =>
          l.organizationId === organizationId &&
          l.isActive &&
          (externalSystem == null || l.externalSystem === externalSystem)
      ).length;
    },

    async listAllActiveExternalLinks(organizationId, externalSystem = "quickbooks_desktop") {
      return Array.from(externalLinks.values())
        .filter(
          (l) =>
            l.organizationId === organizationId &&
            l.isActive &&
            l.externalSystem === externalSystem
        )
        .map(clone);
    },

    async getExternalLink(organizationId, linkId) {
      const current = assertOrg(externalLinks.get(linkId), organizationId);
      return current ? clone(current) : null;
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

    /**
     * Batched active external links for portfolio / list enrichment (no N+1).
     * @param {string} organizationId
     * @param {string[]} accountIds
     * @param {string} [externalSystem]
     */
    async listActiveExternalLinksForAccountIds(
      organizationId,
      accountIds,
      externalSystem = "quickbooks_desktop"
    ) {
      const want = new Set((accountIds || []).map(String).filter(Boolean));
      if (!want.size) return [];
      return Array.from(externalLinks.values())
        .filter(
          (l) =>
            l.organizationId === organizationId &&
            want.has(String(l.accountId)) &&
            l.isActive &&
            (externalSystem == null || l.externalSystem === externalSystem)
        )
        .map(clone);
    },

    async listExternalLinksForOrganization(organizationId) {
      return Array.from(externalLinks.values())
        .filter((l) => l.organizationId === organizationId)
        .map(clone);
    },

    async listExternalLinksForAccountIds(organizationId, accountIds) {
      const idSet = new Set((accountIds || []).map((id) => String(id || "").trim()).filter(Boolean));
      if (!idSet.size) return [];
      return Array.from(externalLinks.values())
        .filter((l) => l.organizationId === organizationId && idSet.has(String(l.accountId)))
        .map(clone);
    },

    async upsertQuickBooksCustomerFact(row) {
      const qbListId = String(row.qbListId || "").trim();
      const organizationId = row.organizationId;
      if (!organizationId || !qbListId) {
        throw new Error("organizationId and qbListId are required");
      }
      const key = `${organizationId}::${qbListId}`;
      const record = {
        organizationId,
        qbListId,
        parentListId: row.parentListId ?? null,
        isJob: Boolean(row.isJob),
        name: row.name ?? null,
        fullName: row.fullName ?? null,
        isActive: row.isActive !== false
      };
      qbCustomerFacts.set(key, record);
      return clone(record);
    },

    /**
     * Exact org-scoped ListID lookup. Does not scan the full facts table.
     * Phase 0E does not deactivate existing external links when a fact is absent.
     */
    async getQuickBooksCustomerFactByListId(organizationId, listId) {
      const id = String(listId || "").trim();
      if (!organizationId || !id) return null;
      const row = qbCustomerFacts.get(`${organizationId}::${id}`);
      return row ? clone(row) : null;
    },

    /**
     * Bounded lookup for Account 360 connection display. Does not unlink
     * historical rows when a fact is missing.
     */
    async listQuickBooksCustomerFactsByListIds(organizationId, listIds) {
      const ids = [...new Set((listIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
      if (!organizationId || !ids.length) return [];
      const rows = [];
      for (const id of ids) {
        const row = qbCustomerFacts.get(`${organizationId}::${id}`);
        if (row) rows.push(clone(row));
      }
      return rows;
    },

    /**
     * Org-scoped root-customer name/ListID discovery. Jobs excluded.
     * Callers must still enforce min-query and max-results.
     */
    async searchQuickBooksRootCustomers(organizationId, { query, limit } = {}) {
      const facts = [];
      for (const row of qbCustomerFacts.values()) {
        if (row.organizationId === organizationId) facts.push(row);
      }
      return selectTrustedQuickBooksRootCustomers(facts, { query, limit });
    },

    /** All trusted ROOT facts for org (reconciliation index). Jobs excluded. */
    async listQuickBooksRootCustomerFacts(organizationId) {
      const out = [];
      for (const row of qbCustomerFacts.values()) {
        if (row.organizationId !== organizationId) continue;
        if (row.isJob === true) continue;
        out.push(clone(row));
      }
      return out;
    },

    async listNoteHeadsForOrganization(organizationId, { cap } = {}) {
      const items = Array.from(notes.values())
        .filter((n) => n.organizationId === organizationId && !n.archivedAt)
        .map((n) => ({
          accountId: n.accountId,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          archivedAt: n.archivedAt
        }))
        .map(clone);
      const limit = Number(cap) > 0 ? Number(cap) : Infinity;
      if (Number.isFinite(limit) && items.length > limit) {
        return { items: [], complete: false, truncated: true };
      }
      return { items, complete: true, truncated: false };
    },

    async listOpenFollowUpHeadsForOrganization(organizationId, { cap } = {}) {
      const items = Array.from(followUps.values())
        .filter((n) => n.organizationId === organizationId && !n.archivedAt && n.status === "open")
        .map((n) => ({
          accountId: n.accountId,
          dueAt: n.dueAt,
          status: n.status,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          archivedAt: n.archivedAt
        }))
        .map(clone);
      const limit = Number(cap) > 0 ? Number(cap) : Infinity;
      if (Number.isFinite(limit) && items.length > limit) {
        return { items: [], complete: false, truncated: true };
      }
      return { items, complete: true, truncated: false };
    },

    async insertAccountNote(row) {
      const id = row.id || randomUUID();
      const record = {
        id,
        organizationId: row.organizationId,
        accountId: row.accountId,
        body: row.body,
        createdAt: row.createdAt ?? nowIso(),
        createdBy: row.createdBy ?? null,
        updatedAt: row.updatedAt ?? nowIso(),
        updatedBy: row.updatedBy ?? null,
        archivedAt: row.archivedAt ?? null,
        archivedBy: row.archivedBy ?? null,
        rowVersion: 1
      };
      notes.set(id, record);
      return clone(record);
    },

    async getAccountNote(organizationId, noteId) {
      return clone(assertOrg(notes.get(noteId), organizationId));
    },

    async listAccountNotes(organizationId, accountId, { page = 1, limit = 25, includeArchived = false } = {}) {
      const safePage = Math.max(1, Number.parseInt(String(page ?? "1"), 10) || 1);
      const safeLimit = Math.max(1, Number.parseInt(String(limit ?? "25"), 10) || 25);
      let rows = Array.from(notes.values()).filter(
        (n) => n.organizationId === organizationId && n.accountId === accountId
      );
      if (!includeArchived) rows = rows.filter((n) => !n.archivedAt);
      rows.sort(
        (a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id))
      );
      const offset = (safePage - 1) * safeLimit;
      const slice = rows.slice(offset, offset + safeLimit);
      return {
        items: slice.map(clone),
        pagination: {
          page: safePage,
          limit: safeLimit,
          has_more: rows.length > offset + safeLimit
        }
      };
    },

    async updateAccountNote(organizationId, noteId, patch, expectedRowVersion) {
      const current = assertOrg(notes.get(noteId), organizationId);
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
      notes.set(noteId, next);
      return { ok: true, note: clone(next) };
    },

    async insertAccountFollowUp(row) {
      const id = row.id || randomUUID();
      const record = {
        id,
        organizationId: row.organizationId,
        accountId: row.accountId,
        title: row.title,
        details: row.details ?? null,
        dueAt: row.dueAt,
        status: row.status || "open",
        assignedTo: row.assignedTo ?? null,
        createdAt: row.createdAt ?? nowIso(),
        createdBy: row.createdBy ?? null,
        updatedAt: row.updatedAt ?? nowIso(),
        updatedBy: row.updatedBy ?? null,
        completedAt: row.completedAt ?? null,
        completedBy: row.completedBy ?? null,
        archivedAt: row.archivedAt ?? null,
        archivedBy: row.archivedBy ?? null,
        rowVersion: 1
      };
      followUps.set(id, record);
      return clone(record);
    },

    async getAccountFollowUp(organizationId, followUpId) {
      return clone(assertOrg(followUps.get(followUpId), organizationId));
    },

    async listAccountFollowUps(
      organizationId,
      accountId,
      { page = 1, limit = 25, status = "open", includeArchived = false } = {}
    ) {
      const safePage = Math.max(1, Number.parseInt(String(page ?? "1"), 10) || 1);
      const safeLimit = Math.max(1, Number.parseInt(String(limit ?? "25"), 10) || 25);
      let rows = Array.from(followUps.values()).filter(
        (n) => n.organizationId === organizationId && n.accountId === accountId
      );
      if (!includeArchived) rows = rows.filter((n) => !n.archivedAt);
      const filter = String(status || "open").toLowerCase();
      if (filter === "open" || filter === "completed") {
        rows = rows.filter((n) => n.status === filter);
      }
      rows.sort((a, b) => {
        if (filter === "completed") {
          return (
            String(b.completedAt || "").localeCompare(String(a.completedAt || "")) ||
            String(b.id).localeCompare(String(a.id))
          );
        }
        if (filter === "all") {
          const rank = (s) => (s === "open" ? 0 : 1);
          const byStatus = rank(a.status) - rank(b.status);
          if (byStatus) return byStatus;
        }
        return (
          String(a.dueAt).localeCompare(String(b.dueAt)) ||
          String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
          String(a.id).localeCompare(String(b.id))
        );
      });
      const offset = (safePage - 1) * safeLimit;
      const slice = rows.slice(offset, offset + safeLimit);
      return {
        items: slice.map(clone),
        pagination: {
          page: safePage,
          limit: safeLimit,
          has_more: rows.length > offset + safeLimit
        }
      };
    },

    async updateAccountFollowUp(organizationId, followUpId, patch, expectedRowVersion) {
      const current = assertOrg(followUps.get(followUpId), organizationId);
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
      followUps.set(followUpId, next);
      return { ok: true, followUp: clone(next) };
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

    async listAuditEventsByAction(organizationId, action, { limit = 1000 } = {}) {
      return auditEvents
        .filter((e) => e.organizationId === organizationId && e.action === action)
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
        notes: notes.size,
        followUps: followUps.size,
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
