/**
 * Estimate Studio account lookup — sentinel memory-store tests only.
 */
import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import { AccountDirectoryError } from "../accountDirectory/accountDirectoryErrors.mjs";
import {
  createProspectForEstimate,
  loadAccountForEstimateSelection,
  lookupAccountsForEstimate,
  toEstimateLookupItem
} from "./internalQuoteAccountLookup.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000099";

async function seedDirectory() {
  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({ store });

  const active = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: {
      displayName: "Sentinel Cabinets Co",
      legalName: "Sentinel Cabinets LLC",
      primaryContactName: "Jamie Contact",
      primaryEmail: "jamie@sentinel-cabinets.example",
      primaryPhone: "319-555-0199",
      city: "Dubuque",
      state: "IA",
      postalCode: "52001",
      line1: "12 Fabricator Way"
    }
  });

  await service.addAlias({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: active.id,
    payload: { alias: "Sentinel Cab" }
  });

  await service.addContact({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: active.id,
    payload: {
      displayName: "Alex Secondary",
      email: "alex@sentinel-cabinets.example",
      phone: "319-555-0200",
      isPrimary: false
    }
  });

  await service.addLocation({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: active.id,
    payload: {
      label: "Warehouse",
      line1: "99 Dock Rd",
      city: "Dyersville",
      state: "IA",
      postalCode: "52040",
      isPrimary: false
    }
  });

  const archived = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: {
      displayName: "Archived Sentinel Partner",
      primaryContactName: "Old Contact",
      primaryEmail: "old@archived.example",
      city: "Cedar Rapids",
      state: "IA"
    }
  });
  await service.archiveAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: archived.id
  });

  // Link QuickBooks without exposing ListID through estimate lookup mapper
  await service.linkQuickBooks({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: active.id,
    payload: { externalId: "QB-LIST-ID-SHOULD-NOT-LEAK" }
  });

  return { store, service, activeId: active.id, archivedId: archived.id };
}

async function main() {
  const { service, activeId, archivedId } = await seedDirectory();

  // 1–5 search facets
  for (const [label, q] of [
    ["account name", "Sentinel Cabinets"],
    ["legal name", "Sentinel Cabinets LLC"],
    ["contact name", "Jamie Contact"],
    ["email", "jamie@sentinel-cabinets.example"],
    ["phone", "319-555-0199"],
    ["city", "Dubuque"],
    ["state", "IA"],
    ["alias", "Sentinel Cab"]
  ]) {
    const found = await lookupAccountsForEstimate({
      service,
      organizationId: ORG,
      role: "estimator",
      search: q,
      limit: 20
    });
    assert.ok(
      found.items.some((i) => i.id === activeId),
      `lookup by ${label} should find active account`
    );
  }

  // 6 archived not normal selectable
  {
    const found = await lookupAccountsForEstimate({
      service,
      organizationId: ORG,
      role: "estimator",
      search: "Archived Sentinel",
      limit: 20
    });
    assert.ok(!found.items.some((i) => i.id === archivedId));
    assert.ok(!found.items.some((i) => String(i.status).toLowerCase() === "archived"));
  }

  // 7 no raw QuickBooks IDs
  {
    const found = await lookupAccountsForEstimate({
      service,
      organizationId: ORG,
      role: "estimator",
      search: "Sentinel Cabinets",
      limit: 5
    });
    const hit = found.items.find((i) => i.id === activeId);
    assert.ok(hit);
    assert.equal(hit.quickbooksLinked, true);
    const json = JSON.stringify(hit);
    assert.equal(json.includes("QB-LIST-ID"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(hit, "externalId"), false);
  }

  // 8–13 select account, defaults, alternate contact/location, working snapshot
  {
    const detail = await loadAccountForEstimateSelection({
      service,
      organizationId: ORG,
      role: "estimator",
      accountId: activeId
    });
    assert.equal(detail.account.id, activeId);
    assert.ok(detail.primaryContact);
    assert.equal(detail.primaryContact.displayName, "Jamie Contact");
    assert.ok(detail.primaryLocation);
    assert.ok(detail.draftSnapshot);
    assert.equal(detail.draftSnapshot.contactDisplayName, "Jamie Contact");
    assert.equal(detail.draftSnapshot.city, "Dubuque");

    const secondaryContact = detail.contacts.find((c) => c.displayName === "Alex Secondary");
    const secondaryLocation = detail.locations.find((l) => l.label === "Warehouse");
    assert.ok(secondaryContact);
    assert.ok(secondaryLocation);

    const { buildCustomerIdentitySnapshot } = await import("./customerIdentitySnapshot.mjs");
    const altSnap = buildCustomerIdentitySnapshot({
      account: detail.account,
      contact: secondaryContact,
      location: secondaryLocation
    });
    assert.equal(altSnap.contactDisplayName, "Alex Secondary");
    assert.equal(altSnap.city, "Dyersville");
    assert.equal(altSnap.accountId, activeId);
  }

  // 33–34 prospect create path + unauthorized rejection
  {
    await assert.rejects(
      () =>
        createProspectForEstimate({
          service,
          organizationId: ORG,
          role: "installer",
          actorUserId: ACTOR,
          payload: { displayName: "Unauthorized Prospect" }
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );

    const created = await createProspectForEstimate({
      service,
      organizationId: ORG,
      role: "estimator",
      actorUserId: ACTOR,
      payload: { displayName: "Estimate Studio Prospect Sentinel" }
    });
    assert.equal(created.account.status, "prospect");
    assert.ok(created.draftSnapshot);
    assert.equal(created.draftSnapshot.accountDisplayName, "Estimate Studio Prospect Sentinel");
  }

  // mapper safety
  {
    const item = toEstimateLookupItem({
      id: activeId,
      displayName: "X",
      quickbooksLinked: true,
      externalId: "RAW",
      raw_payload: { a: 1 }
    });
    assert.equal(Object.prototype.hasOwnProperty.call(item, "externalId"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "raw_payload"), false);
  }

  console.log("internalQuoteAccountLookup.test.mjs: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
