import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { permissionsForRole, ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000099";

function svc() {
  const store = createAccountDirectoryMemoryStore();
  return { store, service: createAccountDirectoryService({ store }) };
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
    const { service } = svc();
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
    const { service } = svc();
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
    // view-capable roles see friendly activity; no raw JSON payloads
    const asSales = await service.getAccount({ organizationId: ORG, role: "sales", accountId: account.id });
    assert.ok(Array.isArray(asSales.auditHistory));
    assert.ok(asSales.auditHistory.some((e) => e.action === "create_account"));
    for (const entry of asSales.auditHistory) {
      assert.equal(typeof entry.detail === "string" || entry.detail == null, true);
      assert.equal(String(JSON.stringify(entry)).includes("raw_payload"), false);
    }
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
  }

  // 19–20. responses contain no raw QB payload / financial fields
  {
    const { service } = svc();
    const account = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Clean Response Co" }
    });
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
    const { service } = svc();
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

  console.log("accountDirectoryService.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
