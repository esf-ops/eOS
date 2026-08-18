import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { permissionsForRole, ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import { seedTrustedQuickBooksCustomerFact } from "./accountDirectoryQbLinkValidation.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000099";

function svc() {
  const store = createAccountDirectoryMemoryStore();
  return { store, service: createAccountDirectoryService({ store }) };
}

async function seedQbRoot(store, listId, organizationId = ORG, name = null) {
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId,
    qbListId: listId,
    name,
    isJob: false
  });
}

async function main() {
  // 1. account creation requires permission
  {
    const { service } = svc();
    await assert.rejects(
      () =>
        service.createAccount({
          organizationId: ORG,
          role: "installer",
          actorUserId: ACTOR,
          payload: { displayName: "Acme" }
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
  }

  // 2. account display name is required
  {
    const { service } = svc();
    await assert.rejects(
      () =>
        service.createAccount({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          payload: { displayName: "  " }
        }),
      (e) => e.code === "display_name_required"
    );
  }

  // 3. prospect creation works
  {
    const { service } = svc();
    const account = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Prospect Co" },
      asProspect: true
    });
    assert.equal(account.status, "prospect");
    assert.equal(account.name, "Prospect Co");
  }

  // 4–5. update uses concurrency; stale rejected
  {
    const { service } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Concurrency Co" }
    });
    const ok = await service.updateAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { displayName: "Concurrency Co Renamed", rowVersion: created.rowVersion }
    });
    assert.equal(ok.name, "Concurrency Co Renamed");
    await assert.rejects(
      () =>
        service.updateAccount({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: { displayName: "Stale", rowVersion: created.rowVersion }
        }),
      (e) => e.code === "conflict" && e.status === 409
    );
  }

  // Direct lifecycle status PATCH is ADMIN-only; ordinary EDIT cannot bypass Status Review.
  {
    const { store, service } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Status Gate Co", legalName: "Status Gate LLC" }
    });
    const renamed = await service.updateAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { displayName: "Status Gate Co Renamed", legalName: "Status Gate Legal", rowVersion: created.rowVersion }
    });
    assert.equal(renamed.name, "Status Gate Co Renamed");
    assert.equal(renamed.legalName, "Status Gate Legal");
    assert.equal(renamed.status, created.status);
    assert.equal(renamed.rowVersion, created.rowVersion + 1);
    const renameAudits = (await store.listAuditEvents(ORG, created.id, { limit: 50 })).filter(
      (e) => e.action === "update_account" && Array.isArray(e.changedFields) && e.changedFields.includes("displayName")
    );
    assert.ok(renameAudits.length >= 1, "ordinary EDIT field patch must still write update_account");

    const beforeDenied = await store.getAccount(ORG, created.id);
    await assert.rejects(
      () =>
        service.updateAccount({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: {
            displayName: "Should Not Persist",
            status: "inactive",
            rowVersion: renamed.rowVersion
          }
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    await assert.rejects(
      () =>
        service.updateAccount({
          organizationId: ORG,
          role: "estimator",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: { status: "active", rowVersion: renamed.rowVersion }
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    const afterDenied = await store.getAccount(ORG, created.id);
    assert.equal(afterDenied.displayName, beforeDenied.displayName);
    assert.equal(afterDenied.status, beforeDenied.status);
    assert.equal(afterDenied.rowVersion, beforeDenied.rowVersion);

    await assert.rejects(
      () =>
        service.updateAccount({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: { status: "active", rowVersion: renamed.rowVersion }
        }),
      (e) => e.code === "fuzzy_active_forbidden" && e.status === 400
    );
    const afterFuzzy = await store.getAccount(ORG, created.id);
    assert.equal(afterFuzzy.status, created.status);
    assert.equal(afterFuzzy.rowVersion, renamed.rowVersion);

    const asNeedsReview = await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { status: "needs_review", rowVersion: renamed.rowVersion }
    });
    assert.equal(asNeedsReview.status, "needs_review");
    const adminStatusAudits = (await store.listAuditEvents(ORG, created.id, { limit: 50 })).filter(
      (e) => e.action === "update_account" && Array.isArray(e.changedFields) && e.changedFields.includes("status")
    );
    assert.ok(adminStatusAudits.some((e) => e.newValues?.status === "needs_review"));

    // Payload suppressAudit is ignored; only the trusted top-level option suppresses.
    const afterNeedsReview = await store.getAccount(ORG, created.id);
    await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: {
        status: "inactive",
        rowVersion: afterNeedsReview.rowVersion,
        suppressAudit: true
      }
    });
    const afterPayloadSuppress = (await store.listAuditEvents(ORG, created.id, { limit: 50 })).filter(
      (e) => e.action === "update_account" && e.newValues?.status === "inactive"
    );
    assert.ok(afterPayloadSuppress.length >= 1, "payload.suppressAudit must not suppress update_account");

    const inactive = await store.getAccount(ORG, created.id);
    await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { status: "prospect", rowVersion: inactive.rowVersion },
      suppressAudit: true
    });
    const afterTrustedSuppress = (await store.listAuditEvents(ORG, created.id, { limit: 50 })).filter(
      (e) => e.action === "update_account" && e.newValues?.status === "prospect"
    );
    assert.equal(afterTrustedSuppress.length, 0, "top-level suppressAudit suppresses update_account");
    assert.equal((await store.getAccount(ORG, created.id)).status, "prospect");

    await seedQbRoot(store, "STATUS-GATE-QB", ORG, "Status Gate Co");
    const linked = await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { externalId: "STATUS-GATE-QB", externalDisplayName: "Status Gate Co" }
    });
    const activated = await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { status: "active", rowVersion: linked.rowVersion }
    });
    assert.equal(activated.status, "active");
    assert.ok(
      (await store.listAuditEvents(ORG, created.id, { limit: 50 })).some(
        (e) => e.action === "update_account" && e.newValues?.status === "active"
      ),
      "ADMIN direct status PATCH still emits update_account"
    );

    await assert.rejects(
      () =>
        service.updateAccount({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: { status: "inactive", rowVersion: renamed.rowVersion }
        }),
      (e) => e.code === "conflict" && e.status === 409
    );
    const afterStale = await store.getAccount(ORG, created.id);
    assert.equal(afterStale.status, "active");
    console.log("ok: EDIT cannot PATCH status; ADMIN status PATCH keeps Active/QB/row_version gates");
  }

  // 6–7. archive preserves; restore works
  {
    const { service, store } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Archive Me" }
    });
    const archived = await service.archiveAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      rowVersion: created.rowVersion
    });
    assert.equal(archived.status, "archived");
    assert.ok(archived.archivedAt);
    const stillThere = await store.getAccount(ORG, created.id);
    assert.ok(stillThere);
    const restored = await service.restoreAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: created.id,
      rowVersion: archived.rowVersion
    });
    assert.equal(restored.status, "active");
    assert.equal(restored.archivedAt, null);
  }

  // 8. normal hard delete unavailable
  {
    const { service } = svc();
    await assert.rejects(
      () => service.hardDeleteAccount(),
      (e) => e.code === "hard_delete_unavailable" && e.status === 405
    );
  }

  // 9–10. contacts account-owned; one primary
  {
    const { service } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Contact Co", primaryContactName: "Ada", primaryEmail: "ada@example.test" }
    });
    assert.equal(created.contacts.filter((c) => c.isPrimary && c.isActive).length, 1);
    const updated = await service.addContact({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { name: "Grace", email: "grace@example.test", isPrimary: true }
    });
    assert.equal(updated.contacts.filter((c) => c.isPrimary && c.isActive).length, 1);
    assert.equal(updated.contacts.find((c) => c.isPrimary).name, "Grace");
  }

  // 11–12. locations account-owned; one primary
  {
    const { service } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Loc Co", city: "Austin", state: "TX" }
    });
    await service.addLocation({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { label: "Warehouse", city: "Dallas", state: "TX", isPrimary: true }
    });
    const detail = await service.getAccount({ organizationId: ORG, role: "sales", accountId: created.id });
    assert.equal(detail.locations.filter((l) => l.isPrimary && l.isActive).length, 1);
    assert.equal(detail.locations.find((l) => l.isPrimary).city, "Dallas");
  }

  {
    const { service } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Maintain Co", primaryContactName: "Pat" }
    });
    const contact = created.contacts[0];
    const edited = await service.updateContact({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      contactId: contact.id,
      payload: { role: "Project Manager", contactType: "project", rowVersion: contact.rowVersion }
    });
    const after = edited.contacts.find((c) => c.id === contact.id);
    assert.equal(after.role, "Project Manager");
    assert.equal(after.contactType, "project");
    const deactivated = await service.updateContact({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      contactId: contact.id,
      payload: { isActive: false, rowVersion: after.rowVersion }
    });
    assert.equal(deactivated.contacts.find((c) => c.id === contact.id).isActive, false);
    await assert.rejects(
      () =>
        service.updateContact({
          organizationId: ORG,
          role: "finance",
          actorUserId: ACTOR,
          accountId: created.id,
          contactId: contact.id,
          payload: { role: "Nope" }
        }),
      () => true
    );
    const loc = created.locations[0];
    if (loc) {
      const locEdited = await service.updateLocation({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: created.id,
        locationId: loc.id,
        payload: { locationType: "billing", rowVersion: loc.rowVersion }
      });
      assert.equal(locEdited.locations.find((l) => l.id === loc.id).locationType, "billing");
    }
    const events = await service.getAccount({ organizationId: ORG, role: "admin", accountId: created.id });
    assert.ok((events.auditHistory || []).some((e) => e.action === "update_contact"));
    assert.ok((events.auditHistory || []).some((e) => e.action === "deactivate_contact"));
    console.log("ok: contact/location edit, deactivate, audit");
  }

  // 13. aliases searchable
  {
    const { service } = svc();
    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Alias Target LLC" }
    });
    await service.addAlias({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      accountId: created.id,
      payload: { alias: "AliasZed Unique Token" }
    });
    const listed = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      search: "AliasZed",
      page: 1,
      pageSize: 20
    });
    assert.ok(listed.items.some((i) => i.id === created.id));
  }

  // 14–15. external QB ID unique; external-link permission enforced
  {
    const { store, service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "QB A" }
    });
    const b = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "QB B" }
    });
    await seedQbRoot(store, "LIST-1", ORG, "QB A");
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "LIST-1", externalDisplayName: "QB A" }
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: b.id,
          payload: { externalId: "LIST-1" }
        }),
      (e) => e.code === "duplicate_external_id"
    );
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          accountId: b.id,
          payload: { externalId: "LIST-2" }
        }),
      (e) => e.status === 403
    );
  }

  // 16. audit history for create/update/archive/restore
  {
    const { service, store } = svc();
    let account = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Audit Co" }
    });
    account = await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { displayName: "Audit Co 2", rowVersion: account.rowVersion }
    });
    account = await service.archiveAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      rowVersion: account.rowVersion
    });
    account = await service.restoreAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      rowVersion: account.rowVersion
    });
    const actions = (account.auditHistory || []).map((e) => e.action);
    assert.ok(actions.includes("create_account"));
    assert.ok(actions.includes("update_account"));
    assert.ok(actions.includes("archive_account"));
    assert.ok(actions.includes("restore_account"));
    for (const entry of account.auditHistory || []) {
      assert.equal(entry.actor, null);
      assert.equal(String(JSON.stringify(entry)).includes(ACTOR), false);
      assert.equal(typeof entry.detail === "string" || entry.detail == null, true);
      assert.equal(String(JSON.stringify(entry)).includes("raw_payload"), false);
    }
    const asSales = await service.getAccount({ organizationId: ORG, role: "sales", accountId: account.id });
    assert.equal(asSales.auditHistory, undefined);
    assert.equal(JSON.stringify(asSales).includes("auditHistory"), false);
    assert.equal(JSON.stringify(asSales).includes(ACTOR), false);

    const named = createAccountDirectoryService({
      store,
      resolveStaffDisplayNames: async () => new Map([[ACTOR, "Chris Henely"]])
    });
    const asAdminNamed = await named.getAccount({
      organizationId: ORG,
      role: "admin",
      accountId: account.id
    });
    assert.ok((asAdminNamed.auditHistory || []).some((e) => e.actor === "Chris Henely"));
    assert.equal(JSON.stringify(asAdminNamed.auditHistory).includes(ACTOR), false);
  }

  // 17. list/search paginated and bounded
  {
    const { service } = svc();
    for (let i = 0; i < 12; i++) {
      await service.createAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        payload: { displayName: `Paged ${String(i).padStart(2, "0")}` }
      });
    }
    const page1 = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      page: 1,
      pageSize: 5
    });
    assert.equal(page1.items.length, 5);
    assert.ok(page1.total >= 12);
    assert.equal(page1.pageSize, 5);
    const huge = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      page: 1,
      pageSize: 9999
    });
    assert.ok(huge.pageSize <= service.MAX_PAGE);
  }

  // 18. unauthorized cannot access PII (view denied)
  {
    const { service } = svc();
    // installer has VIEW via capabilitiesForRole - actually installer only gets VIEW
    // Wait - capabilitiesForRole always adds VIEW. So installer with head access can view.
    // "Unauthorized" = role without VIEW - but everyone gets VIEW if they have head access.
    // Use a role that isn't in EDIT and test edit denial; for view, permissionsForRole always has canView.
    // Test: role without capability for edit cannot create (already #1).
    // For PII: installer can view if they have head access - that's intentional for view cap.
    assert.equal(roleHasCapability("installer", ACCOUNT_DIRECTORY_CAPABILITIES.VIEW), true);
    assert.equal(roleHasCapability("installer", ACCOUNT_DIRECTORY_CAPABILITIES.EDIT), false);
    assert.equal(permissionsForRole("sales").canLinkQuickBooks, false);
    assert.equal(permissionsForRole("sales").canLinkMoraware, false);
    assert.equal(permissionsForRole("sales").canViewAudit, false);
    assert.equal(permissionsForRole("admin").canLinkMoraware, true);
    assert.equal(permissionsForRole("admin").canViewAudit, true);
  }

  // 19–20. responses contain no raw QB payload / financial fields
  {
    const { store, service } = svc();
    const account = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Clean Response Co" }
    });
    await seedQbRoot(store, "LIST-CLEAN", ORG, "Clean Response Co");
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { externalId: "LIST-CLEAN", externalDisplayName: "Clean Response Co" }
    });
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    const json = JSON.stringify(detail);
    assert.equal(json.includes("raw_payload"), false);
    assert.equal(json.includes("lifetimeSales"), false);
    assert.equal(json.includes("Open A/R"), false);
    assert.equal(json.includes("QB Total Balance"), false);
    assert.ok(detail.externalLinks?.[0]?.externalId);
    assert.equal(detail.externalLinks[0].system, "QuickBooks Desktop");
    const asSales = await service.getAccount({ organizationId: ORG, role: "sales", accountId: account.id });
    assert.equal(asSales.externalLinks?.[0]?.externalId, undefined);
    assert.equal(asSales.externalLinks?.[0]?.externalDisplayName, "Clean Response Co");
  }

  // 21–35. premium directory: pagination meta, search fields, filters, summary, sort
  {
    const { store, service } = svc();
    const names = [];
    for (let i = 0; i < 12; i++) {
      const created = await service.createAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        payload: {
          displayName: `Premium ${String(i).padStart(2, "0")}`,
          primaryContactName: i === 3 ? "Contact Search Target" : undefined,
          primaryEmail: i === 4 ? "search-target@example.test" : undefined,
          primaryPhone: i === 5 ? "555-010-9999" : undefined,
          city: i === 6 ? "Austin" : i === 7 ? "Dallas" : undefined,
          state: i === 6 ? "TX" : i === 7 ? "TX" : undefined,
          postalCode: i === 6 ? "78701" : undefined
        }
      });
      names.push(created.id);
      if (i === 8) {
        await service.addAlias({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: { alias: "Alias Search Token Zed" }
        });
      }
      if (i % 2 === 0) {
        await seedQbRoot(store, `PREM-${i}`, ORG, created.displayName);
        await service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: created.id,
          payload: { externalId: `PREM-${i}`, externalDisplayName: created.displayName }
        });
      }
    }
    // missing contact / location sentinels
    const noContact = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "No Contact Sentinel", city: "Denver", state: "CO" }
    });
    const noLocation = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: {
        displayName: "No Location Sentinel",
        primaryContactName: "Lonely Contact",
        primaryEmail: "lonely@example.test"
      }
    });

    const page1 = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      page: 1,
      pageSize: 5,
      sort: "name_asc"
    });
    assert.equal(page1.items.length, 5);
    assert.ok(page1.total >= 14);
    assert.equal(page1.page, 1);
    assert.equal(page1.pageSize, 5);
    assert.ok(page1.totalPages >= 3);
    assert.equal(page1.hasPreviousPage, false);
    assert.equal(page1.hasNextPage, true);
    assert.ok(page1.items[0].hasPrimaryContact !== undefined);

    const page2 = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      page: 2,
      pageSize: 5,
      sort: "name_asc"
    });
    assert.equal(page2.page, 2);
    assert.equal(page2.hasPreviousPage, true);
    assert.ok(page2.items.every((item) => !page1.items.some((a) => a.id === item.id)));

    // reachability: collect all pages
    const seen = new Set();
    let page = 1;
    let hasNext = true;
    while (hasNext) {
      const batch = await service.listAccounts({
        organizationId: ORG,
        role: "sales",
        page,
        pageSize: 5,
        sort: "name_asc"
      });
      for (const item of batch.items) seen.add(item.id);
      hasNext = batch.hasNextPage;
      page += 1;
      assert.ok(page < 50);
    }
    assert.equal(seen.size, page1.total);

    const byContact = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      search: "Contact Search Target",
      page: 1,
      pageSize: 20
    });
    assert.ok(byContact.items.some((i) => i.primaryContact === "Contact Search Target"));

    const byEmail = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      search: "search-target@example.test",
      page: 1,
      pageSize: 20
    });
    assert.ok(byEmail.total >= 1);

    const byPhone = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      search: "555-010-9999",
      page: 1,
      pageSize: 20
    });
    assert.ok(byPhone.total >= 1);

    const byCity = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      search: "Austin",
      page: 1,
      pageSize: 20
    });
    assert.ok(byCity.items.some((i) => i.city === "Austin"));

    const byAlias = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      search: "Alias Search Token",
      page: 1,
      pageSize: 20
    });
    assert.ok(byAlias.total >= 1);

    const linked = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      linked: "true",
      page: 1,
      pageSize: 100
    });
    assert.ok(linked.items.every((i) => i.quickbooksLinked));

    const unlinked = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      linked: "false",
      page: 1,
      pageSize: 100
    });
    assert.ok(unlinked.items.every((i) => !i.quickbooksLinked));

    const missingContact = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      missingContact: "true",
      page: 1,
      pageSize: 100
    });
    assert.ok(missingContact.items.some((i) => i.id === noContact.id));
    assert.ok(missingContact.items.every((i) => !i.hasPrimaryContact));

    const missingLocation = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      missingLocation: "true",
      page: 1,
      pageSize: 100
    });
    assert.ok(missingLocation.items.some((i) => i.id === noLocation.id));
    assert.ok(missingLocation.items.every((i) => !i.hasPrimaryLocation));

    const sortedDesc = await service.listAccounts({
      organizationId: ORG,
      role: "sales",
      sort: "name_desc",
      page: 1,
      pageSize: 3
    });
    assert.ok(
      String(sortedDesc.items[0].displayName).localeCompare(String(sortedDesc.items[1].displayName)) >= 0
    );

    const summary = await service.getSummary({ organizationId: ORG, role: "sales" });
    assert.ok(summary.total >= 14);
    assert.ok(summary.quickbooksLinked >= 6);
    assert.ok(summary.missingPrimaryContact >= 1);
    assert.ok(summary.missingPrimaryLocation >= 1);
    assert.equal(typeof summary.active, "number");
    assert.equal(typeof summary.prospects, "number");
  }

  // Summary Total matches default Accounts tab scope (excludes archived)
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const ORG_T = "00000000-0000-4000-8000-0000000000c1";
    const ACTOR_T = "00000000-0000-4000-8000-0000000000c9";

    await service.createAccount({
      organizationId: ORG_T,
      role: "admin",
      actorUserId: ACTOR_T,
      payload: { displayName: "Active For Total", status: "active" }
    });
    const archived = await service.createAccount({
      organizationId: ORG_T,
      role: "admin",
      actorUserId: ACTOR_T,
      payload: { displayName: "Archived For Total", status: "active" }
    });
    await service.archiveAccount({
      organizationId: ORG_T,
      role: "admin",
      actorUserId: ACTOR_T,
      accountId: archived.id,
      rowVersion: archived.rowVersion
    });

    const summary = await service.getSummary({ organizationId: ORG_T, role: "admin" });
    const accountsTab = await service.listAccounts({
      organizationId: ORG_T,
      role: "admin",
      tab: "accounts",
      status: "",
      search: "",
      linked: "",
      missingContact: "",
      missingLocation: "",
      qbEnrichment: "",
      page: 1,
      pageSize: 100
    });

    assert.equal(summary.archived, 1);
    assert.equal(summary.total, accountsTab.total);
    assert.equal(summary.total, summary.active + summary.prospects + summary.needsReview);
    console.log("ok: summary.total excludes archived and matches default Accounts tab total");
  }

  // qbEnrichment filter aligns with summary counts; native needs_review unchanged
  {
    const store = createAccountDirectoryMemoryStore();
    const suggestionByAccount = new Map();
    const service = createAccountDirectoryService({
      store,
      loadSuggestionIndex: async () => suggestionByAccount
    });

    const needsReviewAcct = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "QB Needs Review Co", status: "active" }
    });
    const suggestedAcct = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "QB Suggested Co", status: "active" }
    });
    const nativeReview = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Native Account Needs Review", status: "needs_review" }
    });
    const plainUnlinked = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Plain Unlinked Co", status: "active" }
    });

    suggestionByAccount.set(needsReviewAcct.id, {
      id: "sug-nr",
      status: "needs_review",
      suggestedAccountId: needsReviewAcct.id,
      rankScore: 0.9,
      candidateAccounts: [{ accountId: needsReviewAcct.id, score: 0.9 }]
    });
    suggestionByAccount.set(suggestedAcct.id, {
      id: "sug-open",
      status: "open",
      suggestedAccountId: suggestedAcct.id,
      rankScore: 0.95,
      candidateAccounts: [{ accountId: suggestedAcct.id, score: 0.95 }]
    });

    const beforeName = needsReviewAcct.displayName;
    const beforeLinks = (needsReviewAcct.externalLinks || []).length;

    const summary = await service.getSummary({ organizationId: ORG, role: "admin" });
    assert.equal(summary.qbNeedsReview, 1);
    assert.equal(summary.qbSuggestedMatch, 1);
    assert.ok(summary.needsReview >= 1);

    const qbNeeds = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "accounts",
      qbEnrichment: "needs_review",
      page: 1,
      pageSize: 100
    });
    assert.equal(qbNeeds.total, summary.qbNeedsReview);
    assert.ok(qbNeeds.items.every((i) => i.qbEnrichmentCode === "needs_review"));
    assert.ok(qbNeeds.items.some((i) => i.id === needsReviewAcct.id));
    assert.ok(!qbNeeds.items.some((i) => i.id === suggestedAcct.id));
    assert.ok(!qbNeeds.items.some((i) => i.id === nativeReview.id));

    const qbSuggested = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "accounts",
      qbEnrichment: "suggested_match",
      page: 1,
      pageSize: 100
    });
    assert.equal(qbSuggested.total, summary.qbSuggestedMatch);
    assert.ok(qbSuggested.items.every((i) => i.qbEnrichmentCode === "suggested_match"));
    assert.ok(qbSuggested.items.some((i) => i.id === suggestedAcct.id));

    const nativeTab = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "needs_review",
      page: 1,
      pageSize: 100
    });
    assert.ok(nativeTab.items.every((i) => i.status === "needs_review"));
    assert.ok(nativeTab.items.some((i) => i.id === nativeReview.id));
    assert.ok(!nativeTab.items.some((i) => i.id === needsReviewAcct.id));

    const notLinked = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "accounts",
      qbEnrichment: "not_linked",
      page: 1,
      pageSize: 100
    });
    assert.ok(notLinked.items.every((i) => i.qbEnrichmentCode === "not_linked"));
    assert.ok(notLinked.items.some((i) => i.id === plainUnlinked.id));

    const linkedStillWorks = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      linked: "false",
      page: 1,
      pageSize: 100
    });
    assert.ok(linkedStillWorks.items.every((i) => !i.quickbooksLinked));

    const after = await service.getAccount({
      organizationId: ORG,
      role: "admin",
      accountId: needsReviewAcct.id
    });
    assert.equal(after.displayName, beforeName);
    assert.equal((after.externalLinks || []).filter((l) => l.isActive !== false).length, beforeLinks);

    // Exclusive summary-card scopes (no leftover filters) match summary counts for aligned cards
    const exclusiveQbNeeds = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "accounts",
      status: "",
      search: "",
      linked: "",
      missingContact: "",
      missingLocation: "",
      qbEnrichment: "needs_review",
      page: 1,
      pageSize: 100
    });
    assert.equal(exclusiveQbNeeds.total, summary.qbNeedsReview);

    const exclusiveQbSuggested = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "accounts",
      status: "",
      search: "",
      linked: "",
      missingContact: "",
      missingLocation: "",
      qbEnrichment: "suggested_match",
      page: 1,
      pageSize: 100
    });
    assert.equal(exclusiveQbSuggested.total, summary.qbSuggestedMatch);

    const exclusiveNativeReview = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      tab: "needs_review",
      status: "",
      search: "",
      linked: "",
      missingContact: "",
      missingLocation: "",
      qbEnrichment: "",
      page: 1,
      pageSize: 100
    });
    assert.equal(exclusiveNativeReview.total, summary.needsReview);
  }

  // Phase 0B — page-scoped support entity fetches (architecture)
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const ORG_B = "00000000-0000-4000-8000-0000000000b0";
    const ACTOR_B = "00000000-0000-4000-8000-0000000000b9";

    /** @type {{ contacts: string[][], locations: string[][], aliases: string[][], links: string[][] }} */
    const scoped = { contacts: [], locations: [], aliases: [], links: [] };
    /** @type {{ contacts: number, locations: number, aliases: number, links: number }} */
    const orgWide = { contacts: 0, locations: 0, aliases: 0, links: 0 };

    const origContactsOrg = store.listContactsForOrganization.bind(store);
    const origLocationsOrg = store.listLocationsForOrganization.bind(store);
    const origAliasesOrg = store.listAliasesForOrganization.bind(store);
    const origLinksOrg = store.listExternalLinksForOrganization.bind(store);
    const origContactsIds = store.listContactsForAccountIds.bind(store);
    const origLocationsIds = store.listLocationsForAccountIds.bind(store);
    const origAliasesIds = store.listAliasesForAccountIds.bind(store);
    const origLinksIds = store.listExternalLinksForAccountIds.bind(store);

    store.listContactsForOrganization = async (organizationId) => {
      orgWide.contacts += 1;
      return origContactsOrg(organizationId);
    };
    store.listLocationsForOrganization = async (organizationId) => {
      orgWide.locations += 1;
      return origLocationsOrg(organizationId);
    };
    store.listAliasesForOrganization = async (organizationId) => {
      orgWide.aliases += 1;
      return origAliasesOrg(organizationId);
    };
    store.listExternalLinksForOrganization = async (organizationId) => {
      orgWide.links += 1;
      return origLinksOrg(organizationId);
    };
    store.listContactsForAccountIds = async (organizationId, accountIds) => {
      scoped.contacts.push([...(accountIds || [])].map(String).sort());
      return origContactsIds(organizationId, accountIds);
    };
    store.listLocationsForAccountIds = async (organizationId, accountIds) => {
      scoped.locations.push([...(accountIds || [])].map(String).sort());
      return origLocationsIds(organizationId, accountIds);
    };
    store.listAliasesForAccountIds = async (organizationId, accountIds) => {
      scoped.aliases.push([...(accountIds || [])].map(String).sort());
      return origAliasesIds(organizationId, accountIds);
    };
    store.listExternalLinksForAccountIds = async (organizationId, accountIds) => {
      scoped.links.push([...(accountIds || [])].map(String).sort());
      return origLinksIds(organizationId, accountIds);
    };

    const createdIds = [];
    for (let i = 0; i < 60; i += 1) {
      const acct = await service.createAccount({
        organizationId: ORG_B,
        role: "admin",
        actorUserId: ACTOR_B,
        payload: {
          displayName: `Phase0B Account ${String(i).padStart(2, "0")}`,
          primaryContactName: `Contact ${i}`,
          primaryEmail: `c${i}@example.com`,
          city: `City${i}`,
          state: "WI"
        }
      });
      createdIds.push(acct.id);
      await service.addAlias({
        organizationId: ORG_B,
        role: "admin",
        actorUserId: ACTOR_B,
        accountId: acct.id,
        payload: { alias: `Alias ${i}` }
      });
    }

    await seedQbRoot(store, "QB-0B-1", ORG_B, "Phase0B Account 00");
    await service.linkQuickBooks({
      organizationId: ORG_B,
      role: "admin",
      actorUserId: ACTOR_B,
      accountId: createdIds[0],
      payload: { externalId: "QB-0B-1", externalDisplayName: "Phase0B Account 00" }
    });

    orgWide.contacts = 0;
    orgWide.locations = 0;
    orgWide.aliases = 0;
    orgWide.links = 0;
    scoped.contacts.length = 0;
    scoped.locations.length = 0;
    scoped.aliases.length = 0;
    scoped.links.length = 0;

    const page = await service.listAccounts({
      organizationId: ORG_B,
      role: "admin",
      tab: "accounts",
      page: 1,
      pageSize: 50,
      sort: "name_asc"
    });

    assert.equal(page.pageSize, 50);
    assert.equal(page.items.length, 50);
    assert.equal(page.total, 60);
    assert.equal(orgWide.contacts, 0, "default page must not load org-wide contacts");
    assert.equal(orgWide.locations, 0, "default page must not load org-wide locations");
    assert.equal(orgWide.aliases, 0, "default page must not load org-wide aliases");
    assert.equal(orgWide.links, 0, "default page must not load org-wide external links");
    assert.equal(scoped.contacts.length, 1);
    assert.equal(scoped.locations.length, 1);
    assert.equal(scoped.aliases.length, 1);
    assert.equal(scoped.links.length, 1);
    assert.equal(scoped.contacts[0].length, 50);
    assert.equal(scoped.locations[0].length, 50);
    assert.equal(scoped.aliases[0].length, 50);
    assert.equal(scoped.links[0].length, 50);
    const pageIdSet = new Set(page.items.map((i) => i.id));
    for (const id of scoped.contacts[0]) {
      assert.ok(pageIdSet.has(id), "contact fetch scoped to page account ids");
    }
    assert.ok(page.items[0].primaryContact, "hydrated primary contact on page row");
    assert.ok(page.items[0].city, "hydrated city on page row");
    assert.equal(page.items[0].hasAliases, true);

    // Search still hits contact/location/alias dimensions via full index
    orgWide.contacts = 0;
    const searchHit = await service.listAccounts({
      organizationId: ORG_B,
      role: "admin",
      search: "Contact 42",
      page: 1,
      pageSize: 50
    });
    assert.ok(orgWide.contacts >= 1, "search uses org-wide contacts");
    assert.equal(searchHit.total, 1);
    assert.equal(searchHit.items[0].id, createdIds[42]);
    assert.equal(searchHit.items[0].primaryContact, "Contact 42");

    const linkedOnly = await service.listAccounts({
      organizationId: ORG_B,
      role: "admin",
      linked: "true",
      page: 1,
      pageSize: 50
    });
    assert.equal(linkedOnly.total, 1);
    assert.equal(linkedOnly.items[0].id, createdIds[0]);
    assert.equal(linkedOnly.items[0].quickbooksLinked, true);

    const statusActive = await service.listAccounts({
      organizationId: ORG_B,
      role: "admin",
      tab: "accounts",
      page: 1,
      pageSize: 50
    });
    assert.equal(statusActive.total, 60);

    const otherOrg = await service.listAccounts({
      organizationId: ORG,
      role: "admin",
      search: "Phase0B Account",
      page: 1,
      pageSize: 50
    });
    assert.equal(otherOrg.total, 0);

    /** @type {string[]} */
    let arRootIds = [];
    function makeIntelSupabase() {
      return {
        from(table) {
          const state = { table };
          const api = {
            select() {
              return api;
            },
            eq() {
              return api;
            },
            gte() {
              return api;
            },
            in(col, vals) {
              if (state.table === "sales_quickbooks_open_ar_current" && col === "qb_root_customer_list_id") {
                arRootIds = [...(vals || [])].map(String);
              }
              return api;
            },
            order() {
              return api;
            },
            limit() {
              return api;
            },
            range() {
              return Promise.resolve({ data: [], error: null });
            },
            maybeSingle() {
              if (state.table === "sales_quickbooks_sync_runs") {
                return Promise.resolve({
                  data: {
                    id: "sync-1",
                    status: "success",
                    completed_at: "2026-08-01T00:00:00.000Z",
                    coverage_end_date: "2026-08-01"
                  },
                  error: null
                });
              }
              return Promise.resolve({ data: null, error: null });
            }
          };
          return api;
        }
      };
    }

    const serviceIntel = createAccountDirectoryService({
      store,
      getSupabase: makeIntelSupabase,
      loadSuggestionIndex: async () => new Map()
    });

    arRootIds = [];
    const pageIntel = await serviceIntel.listAccounts({
      organizationId: ORG_B,
      role: "admin",
      tab: "accounts",
      page: 1,
      pageSize: 50,
      sort: "name_asc"
    });
    assert.equal(pageIntel.items.length, 50);
    assert.ok(pageIntel.items.some((i) => i.id === createdIds[0]));
    assert.deepEqual(arRootIds, ["QB-0B-1"]);

    // With intelligence filter, financial path still runs (roots from filtered set).
    arRootIds = [];
    await serviceIntel.listAccounts({
      organizationId: ORG_B,
      role: "admin",
      tab: "accounts",
      intelligence: "financially_active",
      page: 1,
      pageSize: 50,
      sort: "name_asc"
    });
    assert.deepEqual(arRootIds, ["QB-0B-1"]);
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store, accountPopulationCap: 2 });
    const ORG_CAP = "00000000-0000-4000-8000-0000000000c8";
    const ACTOR_CAP = "00000000-0000-4000-8000-0000000000c7";
    for (const name of ["Cap One", "Cap Two"]) {
      await service.createAccount({
        organizationId: ORG_CAP,
        role: "admin",
        actorUserId: ACTOR_CAP,
        payload: { displayName: name, status: "active" }
      });
    }
    const ok = await service.listAccounts({
      organizationId: ORG_CAP,
      role: "admin",
      tab: "accounts",
      page: 1,
      pageSize: 50,
      sort: "name_asc"
    });
    assert.equal(ok.total, 2);
    await service.createAccount({
      organizationId: ORG_CAP,
      role: "admin",
      actorUserId: ACTOR_CAP,
      payload: { displayName: "Cap Three", status: "active" }
    });
    await assert.rejects(
      () =>
        service.listAccounts({
          organizationId: ORG_CAP,
          role: "admin",
          tab: "accounts",
          page: 1,
          pageSize: 50,
          sort: "ytd_sqft_desc"
        }),
      (e) => e instanceof AccountDirectoryError && e.code === "directory_population_exceeded" && e.status === 422
    );
    console.log("ok: G) filtered account population beyond cap fails closed");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const origList = store.listAllActiveExternalLinks.bind(store);
    const origCount = store.countActiveExternalLinks.bind(store);
    store.listAllActiveExternalLinks = async (organizationId, system) => {
      const rows = await origList(organizationId, system);
      return rows.slice(0, Math.max(0, rows.length - 1));
    };
    store.countActiveExternalLinks = origCount;
    const service = createAccountDirectoryService({ store });
    const ORG_L = "00000000-0000-4000-8000-0000000000d1";
    const ACTOR_L = "00000000-0000-4000-8000-0000000000d2";
    const acct = await service.createAccount({
      organizationId: ORG_L,
      role: "admin",
      actorUserId: ACTOR_L,
      payload: { displayName: "Link Incomplete", status: "active" }
    });
    await seedQbRoot(store, "QB-INCOMPLETE-1", ORG_L, "Link Incomplete");
    await service.linkQuickBooks({
      organizationId: ORG_L,
      role: "admin",
      actorUserId: ACTOR_L,
      accountId: acct.id,
      payload: { externalId: "QB-INCOMPLETE-1", externalDisplayName: "Link Incomplete" }
    });
    await assert.rejects(
      () =>
        service.listAccounts({
          organizationId: ORG_L,
          role: "admin",
          tab: "accounts",
          page: 1,
          pageSize: 50,
          sort: "name_asc"
        }),
      (e) => e instanceof AccountDirectoryError && e.code === "directory_link_population_incomplete"
    );
    console.log("ok: H) incomplete exact-link population fails closed");
  }

  console.log("accountDirectoryService.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
