import assert from "node:assert/strict";
import {
  buildIdentitySaveFields,
  jobInfoFieldsFromSnapshot,
  liveAccountDiffersFromSnapshot
} from "./accountDirectoryEstimate.mjs";

const snap = {
  accountId: "11111111-1111-4111-8111-111111111111",
  accountDisplayName: "Acme Cabinets",
  accountStatus: "active",
  contactDisplayName: "Pat",
  contactEmail: "pat@acme.example",
  contactPhone: "555-0100"
};

{
  const fields = jobInfoFieldsFromSnapshot(snap);
  assert.equal(fields.accountName, "Acme Cabinets");
  assert.equal(fields.customerName, "Pat");
  assert.equal(fields.accountEmail, "pat@acme.example");
}

{
  assert.equal(liveAccountDiffersFromSnapshot(snap, { displayName: "Acme Cabinets", status: "active" }), false);
  assert.equal(liveAccountDiffersFromSnapshot(snap, { displayName: "Acme Renamed", status: "active" }), true);
}

{
  const unlinked = buildIdentitySaveFields({});
  assert.equal(unlinked.account_directory_account_id, null);
  const linked = buildIdentitySaveFields({
    accountId: snap.accountId,
    contactId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    snapshot: snap,
    explicitRelink: true,
    refreshIdentity: true
  });
  assert.equal(linked.account_directory_account_id, snap.accountId);
  assert.equal(linked.explicit_account_relink, true);
  assert.equal(linked.refresh_customer_identity, true);
}

console.log("accountDirectoryEstimate.test.mjs: ok");
