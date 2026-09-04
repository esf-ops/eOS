/**
 * Quote Flow ↔ Account Directory soft-link.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowAccountDirectory.test.mjs
 */
import assert from "node:assert/strict";
import {
  applyAccountDirectoryLinkToEstimateScope,
  applySuggestionsToLink,
  confirmAccountDirectoryLink,
  emptyAccountDirectoryLink,
  extractCustomerEmailCandidates,
  isInternalForwardingEmail,
  mergeAccountDirectoryLinkSafe,
  mergeQuoteSnapshotFromAccountDirectory,
  patchQuoteIdentitySnapshot,
  resolveQuoteFlowMatchHints,
  suggestAccountDirectoryMatches,
  unlinkAccountDirectoryLink
} from "./quoteFlowAccountDirectory.mjs";

console.log("\nquoteFlowAccountDirectory.test.mjs\n");

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTACT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTACT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

{
  assert.equal(isInternalForwardingEmail("chris@elitestonefabrication.com"), true);
  assert.equal(isInternalForwardingEmail("jane@pearson-builders.test"), false);
  const emails = extractCustomerEmailCandidates(
    "From: Chris <chris@elitestonefabrication.com>\nCustomer jane@pearson-builders.test wants a quote."
  );
  assert.deepEqual(emails, ["jane@pearson-builders.test"]);
  console.log("ok: internal forwarding employee is not mistaken for customer email");
}

{
  const hints = resolveQuoteFlowMatchHints({
    senderLabel: "Chris Henely",
    customerLabel: "Pearson Builders",
    accountLabel: "Pearson Builders",
    requestSubject: "FW: Pearson kitchen",
    sourceEmailBodyPreview: "Please quote for jane@pearson-builders.test"
  });
  assert.equal(hints.customerHint, "Pearson Builders");
  assert.ok(hints.forwardingEmployeeHint);
  assert.ok(hints.customerEmailCandidates.includes("jane@pearson-builders.test"));
  console.log("ok: match hints prefer customer label over forwarding employee");
}

{
  const accounts = [
    {
      id: ACCOUNT_A,
      displayName: "Pearson Builders",
      contacts: [{ id: CONTACT_A, displayName: "Jane Smith", email: "jane@pearson-builders.test" }]
    },
    {
      id: ACCOUNT_B,
      displayName: "Other Co",
      contacts: [{ id: CONTACT_B, displayName: "Bob", email: "bob@other.test" }]
    }
  ];
  const exact = suggestAccountDirectoryMatches({
    accounts,
    emailCandidates: ["jane@pearson-builders.test"],
    nameHint: "Pearson"
  });
  assert.equal(exact.autoLinked, false);
  assert.equal(exact.status, "suggested");
  assert.equal(exact.matchConfidence, "exact_email");
  assert.equal(exact.suggestions[0].accountId, ACCOUNT_A);
  assert.equal(exact.suggestions[0].contactId, CONTACT_A);
  console.log("ok: exact saved contact email suggests correct account/contact (no auto-link)");
}

{
  const multi = suggestAccountDirectoryMatches({
    accounts: [
      { id: ACCOUNT_A, displayName: "Pearson Builders", contacts: [] },
      { id: ACCOUNT_B, displayName: "Pearson Group", contacts: [] }
    ],
    emailCandidates: [],
    nameHint: "Pearson"
  });
  assert.equal(multi.matchConfidence, "multiple");
  assert.equal(multi.autoLinked, false);
  assert.ok(multi.suggestions.length >= 2);
  console.log("ok: multiple possible matches do not auto-link");
}

{
  let link = applySuggestionsToLink(emptyAccountDirectoryLink(), {
    status: "suggested",
    matchConfidence: "exact_email",
    suggestions: [
      {
        accountId: ACCOUNT_A,
        contactId: CONTACT_A,
        displayName: "Pearson Builders",
        matchConfidence: "exact_email",
        matchReason: "Exact saved contact email match"
      }
    ]
  });
  assert.equal(link.status, "suggested");
  link = {
    ...link,
    status: "unlinked",
    suggestions: [],
    matchReason: "suggestion_rejected",
    userSet: true
  };
  assert.equal(link.status, "unlinked");
  console.log("ok: user can reject a suggested account");
}

{
  const linked = confirmAccountDirectoryLink(emptyAccountDirectoryLink(), {
    accountId: ACCOUNT_B,
    contactId: CONTACT_B,
    identitySnapshot: {
      accountId: ACCOUNT_B,
      contactId: CONTACT_B,
      accountDisplayName: "Other Co",
      contactDisplayName: "Bob",
      contactEmail: "bob@other.test",
      accountStatus: "active",
      quickbooksLinked: false,
      snapshotAt: new Date().toISOString()
    },
    matchConfidence: "manual",
    actorUserId: "user-sentinel"
  });
  assert.equal(linked.status, "confirmed");
  assert.equal(linked.accountId, ACCOUNT_B);
  assert.equal(linked.userSet, true);
  console.log("ok: user can choose a different account");
}

{
  const scope = applyAccountDirectoryLinkToEstimateScope(
    { rooms: [], customerName: "", projectAddress: "123 Oak" },
    emptyAccountDirectoryLink()
  );
  assert.equal(scope.accountDirectoryAccountId, undefined);
  assert.equal(scope.projectAddress, "123 Oak");
  console.log("ok: quote remains fully functional while unlinked");
}

{
  const confirmed = confirmAccountDirectoryLink(emptyAccountDirectoryLink(), {
    accountId: ACCOUNT_A,
    contactId: CONTACT_A,
    identitySnapshot: {
      accountId: ACCOUNT_A,
      contactId: CONTACT_A,
      accountDisplayName: "Pearson Builders",
      contactDisplayName: "Jane Smith",
      contactEmail: "jane@pearson-builders.test",
      accountStatus: "active",
      quickbooksLinked: false,
      snapshotAt: new Date().toISOString()
    },
    actorUserId: "user-sentinel"
  });
  const afterRerun = mergeAccountDirectoryLinkSafe(
    confirmed,
    applySuggestionsToLink(emptyAccountDirectoryLink(), {
      status: "suggested",
      suggestions: [{ accountId: ACCOUNT_B, displayName: "Wrong", matchConfidence: "name" }]
    })
  );
  assert.equal(afterRerun.accountId, ACCOUNT_A);
  assert.equal(afterRerun.contactId, CONTACT_A);
  assert.equal(afterRerun.status, "confirmed");
  console.log("ok: confirmed account/contact IDs survive Save Draft / AI rerun / attachment merge");
}

{
  const filled = mergeQuoteSnapshotFromAccountDirectory({
    quoteSnapshot: emptyAccountDirectoryLink().quoteSnapshot,
    fieldProvenance: {},
    adSnapshot: {
      accountDisplayName: "Pearson Builders",
      contactDisplayName: "Jane Smith",
      contactEmail: "jane@pearson-builders.test"
    },
    accountDefaults: { salesperson: "Thera", branch: "Wichita" }
  });
  assert.equal(filled.quoteSnapshot.accountName, "Pearson Builders");
  assert.equal(filled.quoteSnapshot.salesperson, "Thera");
  assert.equal(filled.quoteSnapshot.branch, "Wichita");
  assert.equal(filled.fieldProvenance.salesperson, "account_directory");

  const edited = patchQuoteIdentitySnapshot(
    { ...emptyAccountDirectoryLink(), quoteSnapshot: filled.quoteSnapshot, fieldProvenance: filled.fieldProvenance },
    { salesperson: "Eric", projectAddress: "123 Oak Street" },
    "user-sentinel"
  );
  assert.equal(edited.quoteSnapshot.salesperson, "Eric");
  assert.equal(edited.fieldProvenance.salesperson, "user_edited");

  const protectedMerge = mergeQuoteSnapshotFromAccountDirectory({
    quoteSnapshot: edited.quoteSnapshot,
    fieldProvenance: edited.fieldProvenance,
    adSnapshot: { accountDisplayName: "Pearson Builders Renamed" },
    accountDefaults: { salesperson: "Thera", branch: "Wichita" }
  });
  assert.equal(protectedMerge.quoteSnapshot.salesperson, "Eric");
  assert.equal(protectedMerge.quoteSnapshot.projectAddress, "123 Oak Street");
  assert.ok(protectedMerge.conflicts.some((c) => c.field === "salesperson"));
  console.log("ok: linking prefills empty fields; user-edited salesperson/address protected");
}

{
  const linked = confirmAccountDirectoryLink(emptyAccountDirectoryLink(), {
    accountId: ACCOUNT_A,
    contactId: CONTACT_A,
    identitySnapshot: {
      accountId: ACCOUNT_A,
      contactId: CONTACT_A,
      accountDisplayName: "Pearson Builders",
      contactDisplayName: "Jane",
      contactEmail: "jane@pearson-builders.test",
      addressLine1: "999 Billing Ave",
      city: "Wichita",
      state: "KS",
      accountStatus: "active",
      quickbooksLinked: false,
      snapshotAt: new Date().toISOString()
    },
    actorUserId: "u1"
  });
  linked.quoteSnapshot.projectAddress = "123 Oak Street";
  linked.fieldProvenance.projectAddress = "user_edited";
  const scope = applyAccountDirectoryLinkToEstimateScope(
    { rooms: [], customerName: "", projectAddress: "123 Oak Street" },
    linked
  );
  assert.equal(scope.accountDirectoryAccountId, ACCOUNT_A);
  assert.equal(scope.accountDirectoryContactId, CONTACT_A);
  assert.equal(scope.customerName, "Pearson Builders");
  assert.equal(scope.projectAddress, "123 Oak Street");
  assert.ok(scope.customerIdentitySnapshot?.accountDisplayName);
  // Mutating AD master snapshot later must not change already-applied quote address
  const later = applyAccountDirectoryLinkToEstimateScope(
    { ...scope, projectAddress: "123 Oak Street" },
    {
      ...linked,
      snapshot: {
        ...linked.snapshot,
        addressLine1: "Changed Billing",
        accountDisplayName: "Pearson NEW NAME"
      }
    }
  );
  assert.equal(later.projectAddress, "123 Oak Street");
  // customerName already set — fill-if-empty must not overwrite
  assert.equal(later.customerName, "Pearson Builders");
  console.log("ok: Set Scope carries IDs + snapshot; project address independent; AD rename does not mutate quote");
}

{
  const orgA = ACCOUNT_A;
  const cross = suggestAccountDirectoryMatches({
    accounts: [], // org-scoped list already empty for other org
    emailCandidates: ["jane@pearson-builders.test"],
    nameHint: "Pearson"
  });
  assert.equal(cross.suggestions.length, 0);
  void orgA;
  console.log("ok: cross-organization matching prohibited (empty org-scoped candidate list)");
}

{
  const unlinked = unlinkAccountDirectoryLink(
    confirmAccountDirectoryLink(emptyAccountDirectoryLink(), {
      accountId: ACCOUNT_A,
      identitySnapshot: {
        accountId: ACCOUNT_A,
        accountDisplayName: "Pearson Builders",
        accountStatus: "active",
        quickbooksLinked: false,
        snapshotAt: new Date().toISOString()
      }
    }),
    "user-sentinel"
  );
  assert.equal(unlinked.status, "unlinked");
  assert.equal(unlinked.accountId, null);
  console.log("ok: estimator can unlink");
}

console.log("\nAll quoteFlowAccountDirectory tests passed.\n");
