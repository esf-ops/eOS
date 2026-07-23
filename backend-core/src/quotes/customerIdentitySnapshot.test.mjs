import assert from "node:assert/strict";
import {
  buildCustomerIdentitySnapshot,
  documentIdentityFromHeader,
  legacyFieldsFromIdentitySnapshot,
  normalizeCustomerIdentitySnapshot,
  resolveIdentityPersistFields,
  FORBIDDEN_IDENTITY_SNAPSHOT_KEYS
} from "./customerIdentitySnapshot.mjs";
import { toEstimateLookupItem } from "./internalQuoteAccountLookup.mjs";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";

function sampleSnapshot() {
  return buildCustomerIdentitySnapshot({
    account: {
      id: ACCOUNT_ID,
      displayName: "Acme Cabinets",
      legalName: "Acme Cabinets LLC",
      status: "active",
      quickbooksLinked: true
    },
    contact: {
      id: CONTACT_ID,
      displayName: "Pat Estimator",
      email: "pat@acme.example",
      phone: "555-0100"
    },
    location: {
      id: LOCATION_ID,
      label: "Main",
      line1: "100 Main St",
      city: "Cedar Rapids",
      state: "IA",
      postalCode: "52401"
    },
    snapshotAt: "2026-07-23T12:00:00.000Z"
  });
}

{
  const snap = sampleSnapshot();
  assert.equal(snap.accountId, ACCOUNT_ID);
  assert.equal(snap.contactDisplayName, "Pat Estimator");
  assert.equal(snap.quickbooksLinked, true);
  assert.equal(snap.city, "Cedar Rapids");
  for (const k of FORBIDDEN_IDENTITY_SNAPSHOT_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(snap, k), false);
  }
}

{
  const normalized = normalizeCustomerIdentitySnapshot({
    account_id: ACCOUNT_ID,
    account_display_name: "Acme",
    contact_email: "a@b.com",
    snapshot_at: "2026-07-23T12:00:00.000Z"
  });
  assert.equal(normalized.accountId, ACCOUNT_ID);
  assert.equal(normalized.accountDisplayName, "Acme");
}

{
  assert.equal(normalizeCustomerIdentitySnapshot({ accountId: "not-a-uuid" }), null);
}

{
  const snap = sampleSnapshot();
  const legacy = legacyFieldsFromIdentitySnapshot(snap);
  assert.equal(legacy.account_name, "Acme Cabinets");
  assert.equal(legacy.customer_email, "pat@acme.example");
  assert.equal(legacy.job_info.account, "Acme Cabinets");
}

{
  const existing = {
    account_directory_account_id: ACCOUNT_ID,
    account_directory_contact_id: CONTACT_ID,
    account_directory_location_id: LOCATION_ID,
    customer_identity_snapshot: sampleSnapshot()
  };
  // update_existing without explicit relink keeps prior snapshot even if body tries new snapshot
  const kept = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: ACCOUNT_ID,
      customer_identity_snapshot: {
        ...sampleSnapshot(),
        accountDisplayName: "CHANGED NAME",
        snapshotAt: "2026-07-24T00:00:00.000Z"
      }
    },
    existingRow: existing,
    saveMode: "update_existing"
  });
  assert.equal(kept.customer_identity_snapshot.accountDisplayName, "Acme Cabinets");
  assert.equal(kept.customer_identity_snapshot.snapshotAt, "2026-07-23T12:00:00.000Z");

  const refreshed = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: ACCOUNT_ID,
      refresh_customer_identity: true,
      customer_identity_snapshot: {
        ...sampleSnapshot(),
        accountDisplayName: "Refreshed Acme",
        snapshotAt: "2026-07-24T00:00:00.000Z"
      }
    },
    existingRow: existing,
    saveMode: "update_existing"
  });
  assert.equal(refreshed.customer_identity_snapshot.accountDisplayName, "Refreshed Acme");

  const blockedRelink = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: "44444444-4444-4444-8444-444444444444",
      customer_identity_snapshot: sampleSnapshot()
    },
    existingRow: existing,
    saveMode: "update_existing"
  });
  assert.equal(blockedRelink.account_directory_account_id, ACCOUNT_ID);

  const allowedRelink = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: "44444444-4444-4444-8444-444444444444",
      explicit_account_relink: true,
      customer_identity_snapshot: {
        ...sampleSnapshot(),
        accountId: "44444444-4444-4444-8444-444444444444",
        accountDisplayName: "Other Co"
      }
    },
    existingRow: existing,
    saveMode: "update_existing"
  });
  assert.equal(allowedRelink.account_directory_account_id, "44444444-4444-4444-8444-444444444444");
}

{
  const existing = {
    account_directory_account_id: ACCOUNT_ID,
    account_directory_contact_id: CONTACT_ID,
    account_directory_location_id: LOCATION_ID,
    customer_identity_snapshot: sampleSnapshot()
  };
  const revision = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: ACCOUNT_ID,
      customer_identity_snapshot: {
        ...sampleSnapshot(),
        accountDisplayName: "Should Not Apply"
      }
    },
    existingRow: existing,
    saveMode: "save_revision"
  });
  assert.equal(revision.customer_identity_snapshot.accountDisplayName, "Acme Cabinets");
}

{
  const doc = documentIdentityFromHeader({
    customer_name: "Live Name",
    account_name: "Live Account",
    customer_identity_snapshot: sampleSnapshot()
  });
  assert.equal(doc.fromSnapshot, true);
  assert.equal(doc.accountName, "Acme Cabinets");
  assert.equal(doc.customerName, "Pat Estimator");
}

{
  const item = toEstimateLookupItem({
    id: ACCOUNT_ID,
    displayName: "Acme",
    quickbooksLinked: true,
    externalId: "SHOULD_NOT_PASS",
    primaryContact: "Pat"
  });
  assert.equal(item.quickbooksLinked, true);
  assert.equal(item.primaryContact, "Pat");
  assert.equal(Object.prototype.hasOwnProperty.call(item, "externalId"), false);
}

{
  const existing = {
    account_directory_account_id: ACCOUNT_ID,
    account_directory_contact_id: CONTACT_ID,
    account_directory_location_id: LOCATION_ID,
    customer_identity_snapshot: sampleSnapshot()
  };
  const unlinked = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: null,
      explicit_account_relink: true
    },
    existingRow: existing,
    saveMode: "update_existing"
  });
  assert.equal(unlinked.account_directory_account_id, null);
  assert.equal(unlinked.customer_identity_snapshot, null);

  const createFresh = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: ACCOUNT_ID,
      account_directory_contact_id: CONTACT_ID,
      account_directory_location_id: LOCATION_ID,
      customer_identity_snapshot: sampleSnapshot()
    },
    existingRow: null,
    saveMode: "create"
  });
  assert.equal(createFresh.account_directory_account_id, ACCOUNT_ID);
  assert.equal(createFresh.customer_identity_snapshot.accountDisplayName, "Acme Cabinets");

  const saveAsNew = resolveIdentityPersistFields({
    body: {
      account_directory_account_id: ACCOUNT_ID,
      customer_identity_snapshot: {
        ...sampleSnapshot(),
        snapshotAt: "2026-07-25T00:00:00.000Z",
        accountDisplayName: "New Quote Snap"
      }
    },
    existingRow: existing,
    saveMode: "save_as_new_quote"
  });
  assert.equal(saveAsNew.customer_identity_snapshot.accountDisplayName, "New Quote Snap");
}

console.log("customerIdentitySnapshot.test.mjs: ok");
