/**
 * Exact QB ListID ↔ AD UUID consistency (Robertson production shape).
 * Run: node backend-core/src/accountDirectory/accountDirectoryQbLinkResolution.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";
import { seedTrustedQuickBooksCustomerFact } from "./accountDirectoryQbLinkValidation.mjs";
import { ACCOUNT_DIRECTORY_MORAWARE_SYSTEM } from "./accountDirectoryMorawareLinkage.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";
import {
  overlayExactQuickBooksLinkOnCandidate,
  resolveActiveQuickBooksAccountByListId,
  resolveActiveQuickBooksAccountsByListIds
} from "./accountDirectoryQbLinkResolution.mjs";
import { SPINE_REVIEW_STATES } from "./accountDirectoryMorawareQbSpine.mjs";
import {
  applyExistingQbAccountToCandidate,
  buildUnifiedCustomerSearchResults,
  duplicateQbExistingAccountId,
  primaryReviewAction
} from "../../../app-account-directory/src/lib/morawareReviewWorkflow.mjs";
import { customerFinancialsEmptyCopy } from "../../../app-account-directory/src/lib/accountDirectoryFinancialCopy.mjs";
import { getAccountDirectoryFinancials } from "./accountDirectoryFinancialIntelligence.mjs";

const ORG = "00000000-0000-4000-8000-00000000a576";
const ACTOR = "00000000-0000-4000-8000-00000000b576";
const LIST_ID = "80000057-ROBERTSON";
const here = dirname(fileURLToPath(import.meta.url));

function canonicalFor() {
  return async (organizationId, sourceAccountId) => {
    if (organizationId !== ORG) return null;
    if (String(sourceAccountId) === "576") {
      return { sourceAccountId: "576", accountName: "Robertson Manufacturing" };
    }
    return null;
  };
}

console.log("\naccountDirectoryQbLinkResolution.test.mjs\n");

{
  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({
    store,
    loadCanonicalMorawareAccount: canonicalFor()
  });

  const account = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: "Robertson Manufacturing, Inc.", status: "active" }
  });
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: LIST_ID,
    name: "Robertson Manufacturing, Inc.",
    fullName: "Robertson Manufacturing, Inc.",
    isJob: false,
    isActive: true
  });
  const linked = await service.linkQuickBooks({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: account.id,
    payload: { externalId: LIST_ID, externalDisplayName: "Robertson Manufacturing, Inc." }
  });
  assert.equal(linked.quickbooksLinked, true);

  const resolved = await resolveActiveQuickBooksAccountByListId(store, {
    organizationId: ORG,
    listId: `  ${LIST_ID}  `
  });
  assert.equal(resolved?.accountId, account.id);

  const search = await service.searchQuickBooksCustomers({
    organizationId: ORG,
    role: "admin",
    query: "Robertson Manufacturing"
  });
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].existingAccountId, account.id);
  const unified = buildUnifiedCustomerSearchResults({ qbItems: search.items });
  assert.match(unified.quickbooks[0].subtitle, /Already in Account Directory/);
  assert.equal(unified.quickbooks[0].createFromQuickBooksAllowed, false);
  assert.equal(unified.quickbooks[0].accountId, account.id);
  console.log("ok: 1–2) QB search returns existingAccountId and already-in-AD label");

  const queue = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store,
    dataset: {
      morawareAccounts: [{ sourceAccountId: "576", accountName: "Robertson Manufacturing" }],
      jobsByMorawareId: new Map(),
      jobStatsByMorawareId: new Map([["576", { jobCount: 4, jobs2026: 4 }]]),
      directoryAccounts: [
        { id: account.id, displayName: "Robertson Manufacturing, Inc.", legalName: null, status: "active" }
      ],
      aliases: [],
      contacts: [],
      locations: [],
      qbLinksByAccountId: new Map([
        [account.id, { listId: LIST_ID, displayName: "Robertson Manufacturing, Inc." }]
      ]),
      qbRootFacts: [
        { qbListId: LIST_ID, fullName: "Robertson Manufacturing, Inc.", isJob: false, isActive: true }
      ],
      morawareLinksBySourceId: new Map(),
      morawareLinksByAccountId: new Map()
    }
  });
  const row = queue.items[0];
  assert.equal(row.reviewState, SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED);
  assert.equal(row.proposedAccountId, account.id);
  assert.equal(row.createFromQuickBooksAllowed, false);
  assert.equal(row.candidates[0].createFromQuickBooksAllowed, false);
  assert.equal(row.candidates[0].accountId, account.id);
  const action = primaryReviewAction(row, row.candidates[0]);
  assert.equal(action.kind, "connect_moraware");
  assert.equal(action.label, "YES — Connect");
  console.log("ok: 3–4) spine is EXISTING_AD_QB_BACKED; Create from QuickBooks is not offered");

  const qbBefore = (await store.listExternalLinks(ORG, account.id)).filter(
    (l) => l.externalSystem === ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM && l.isActive !== false
  );
  const accountCountBefore = await store.countAccounts(ORG);
  await service.linkMoraware({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: account.id,
    payload: { externalId: "576", externalDisplayName: "Robertson Manufacturing" }
  });
  const after = await store.listExternalLinks(ORG, account.id);
  const qbAfter = after.filter(
    (l) => l.externalSystem === ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM && l.isActive !== false
  );
  const mwAfter = after.filter(
    (l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM && l.isActive !== false
  );
  assert.equal(await store.countAccounts(ORG), accountCountBefore);
  assert.equal(qbAfter.length, qbBefore.length);
  assert.equal(qbAfter[0].externalId, LIST_ID);
  assert.equal(mwAfter.length, 1);
  assert.equal(mwAfter[0].externalId, "576");
  console.log("ok: 5–9) YES links Moraware 576 to existing UUID; no new AD/QB link/QB write");

  await assert.rejects(
    () =>
      service.createAccountFromQuickBooks({
        organizationId: ORG,
        role: "admin",
        actorUserId: ACTOR,
        payload: { qbListId: LIST_ID, displayName: "Robertson Manufacturing, Inc." }
      }),
    (e) =>
      e instanceof AccountDirectoryError &&
      e.code === "duplicate_external_id" &&
      e.status === 409 &&
      e.extra?.existingAccountId === account.id
  );
  const recovered = applyExistingQbAccountToCandidate(row, {
    accountId: account.id,
    displayName: "Robertson Manufacturing, Inc.",
    qbListId: LIST_ID
  });
  assert.equal(recovered.reviewState, "EXISTING_AD_QB_BACKED");
  assert.equal(recovered.createFromQuickBooksAllowed, false);
  assert.equal(primaryReviewAction(recovered, recovered.candidates[0]).kind, "connect_moraware");
  assert.equal(
    duplicateQbExistingAccountId({
      body: { code: "duplicate_external_id", existingAccountId: account.id }
    }),
    account.id
  );
  assert.equal(await store.countAccounts(ORG), accountCountBefore);
  console.log("ok: 10) duplicate_external_id 409 recovery resolves to existing UUID without retrying create");
}

{
  const missed = overlayExactQuickBooksLinkOnCandidate(
    {
      accountId: null,
      qbListId: "QB-MISS",
      identityKind: "QB_ROOT_NOT_IN_DIRECTORY",
      createFromQuickBooksAllowed: true,
      displayName: "Ghost"
    },
    new Map([["QB-MISS", "ad-existing"]])
  );
  assert.equal(missed.identityKind, "EXISTING_AD_QB_BACKED");
  assert.equal(missed.accountId, "ad-existing");
  assert.equal(missed.createFromQuickBooksAllowed, false);
  const batch = await resolveActiveQuickBooksAccountsByListIds(createAccountDirectoryMemoryStore(), {
    organizationId: ORG,
    listIds: [LIST_ID]
  });
  assert.equal(batch.size, 0);
  console.log("ok: overlay promotes exact ListID hits; empty org has no false positives");
}

{
  const store = createAccountDirectoryMemoryStore();
  const unlinkedCopy = customerFinancialsEmptyCopy({ linked: false, status: "unlinked" });
  const linkedEmpty = customerFinancialsEmptyCopy({ linked: true, status: "unavailable" });
  const linkedOkEmpty = customerFinancialsEmptyCopy({ linked: true, status: "ok" });
  assert.match(unlinkedCopy, /Connect QuickBooks/);
  assert.match(linkedEmpty, /QuickBooks is connected/);
  assert.match(linkedOkEmpty, /No staged financial activity/);
  assert.equal(unlinkedCopy.includes("linked to QuickBooks"), false);
  const app = readFileSync(join(here, "../../../app-account-directory/src/ui/Account360Panels.tsx"), "utf8");
  assert.ok(app.includes("customerFinancialsEmptyCopy"));
  assert.equal(app.includes("Customer financials appear after this account is linked to QuickBooks."), false);
  const profile = await getAccountDirectoryFinancials({
    supabase: {
      from() {
        throw new Error("no financial tables");
      }
    },
    store: {
      async getAccount() {
        return { id: "ad-1", organizationId: ORG };
      },
      async listExternalLinks() {
        return [
          {
            isActive: true,
            externalSystem: ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM,
            externalId: LIST_ID
          }
        ];
      }
    },
    organizationId: ORG,
    accountId: "ad-1",
    role: "sales"
  });
  assert.equal(profile.linked, true);
  assert.equal(profile.status, "unavailable");
  assert.equal(/until this Account Directory record is linked to QuickBooks/i.test(profile.warnings.join(" ")), false);
  console.log("ok: 11–13) linked+no data never uses connect-QB-first copy; unlinked still does");
}

{
  const ui = readFileSync(join(here, "../../../app-account-directory/src/ui/MorawareReview.tsx"), "utf8");
  assert.ok(ui.includes("duplicateQbExistingAccountId"));
  assert.ok(ui.includes("recoverExistingQbAccount"));
  assert.ok(ui.includes("This QuickBooks customer is already in Account Directory"));
  assert.equal(ui.includes("Confirm All"), false);
  console.log("ok: client 409 recovery + no bulk confirm");
}

console.log("\naccountDirectoryQbLinkResolution.test.mjs — all passed\n");
