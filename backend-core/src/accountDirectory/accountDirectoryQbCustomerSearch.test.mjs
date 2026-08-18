/**
 * Phase 1 — trusted QuickBooks customer search (discovery only).
 * Run: node backend-core/src/accountDirectory/accountDirectoryQbCustomerSearch.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { seedTrustedQuickBooksCustomerFact } from "./accountDirectoryQbLinkValidation.mjs";
import {
  QB_CUSTOMER_SEARCH_MAX_RESULTS,
  QB_CUSTOMER_SEARCH_MIN_QUERY,
  assertSafeQbCustomerSearchItem,
  isQbCustomerSearchQueryTooShort,
  selectTrustedQuickBooksRootCustomers
} from "./accountDirectoryQbCustomerSearch.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ACTOR = "00000000-0000-4000-8000-000000000099";
const here = dirname(fileURLToPath(import.meta.url));

function svc() {
  const store = createAccountDirectoryMemoryStore();
  return { store, service: createAccountDirectoryService({ store }) };
}

async function seedNamedAccount(service, name, org = ORG) {
  return service.createAccount({
    organizationId: org,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: name }
  });
}

async function main() {
  assert.equal(QB_CUSTOMER_SEARCH_MIN_QUERY, 2);
  assert.equal(QB_CUSTOMER_SEARCH_MAX_RESULTS, 20);
  assert.equal(isQbCustomerSearchQueryTooShort(""), true);
  assert.equal(isQbCustomerSearchQueryTooShort("A"), true);
  assert.equal(isQbCustomerSearchQueryTooShort("Ac"), false);
  console.log("ok: short-query gate");

  {
    const facts = [
      { organizationId: ORG, qbListId: "ROOT-1", isJob: false, name: "Alpha Stone", fullName: "Alpha Stone" },
      { organizationId: ORG, qbListId: "JOB-1", isJob: true, parentListId: "ROOT-1", name: "Alpha Kitchen", fullName: "Alpha Stone:Kitchen" },
      { organizationId: ORG, qbListId: "ROOT-2", isJob: false, name: "Beta Cabinets", fullName: "Beta Cabinets" }
    ];
    const items = selectTrustedQuickBooksRootCustomers(facts, { query: "Alpha" });
    assert.equal(items.length, 1);
    assert.equal(items[0].listId, "ROOT-1");
    assert.equal(items[0].displayName, "Alpha Stone");
    assert.equal(Object.keys(items[0]).sort().join(","), "active,displayName,existingAccountId,listId");
    console.log("ok: helper excludes jobs and returns safe fields");
  }

  const { store, service } = svc();
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: "80000001-ROOT",
    name: "Stoddard Jensen",
    fullName: "Stoddard & Jensen Real Estate",
    isJob: false
  });
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: "80000001-JOB",
    parentListId: "80000001-ROOT",
    name: "Kitchen Remodel",
    fullName: "Stoddard & Jensen Real Estate:Kitchen Remodel",
    isJob: true
  });
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG_B,
    qbListId: "OTHER-ORG-ROOT",
    name: "Stoddard Other Org",
    fullName: "Stoddard Other Org",
    isJob: false
  });
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: "80000002-ROOT",
    name: "Inactive Co",
    fullName: "Inactive Co",
    isJob: false,
    isActive: false
  });

  let searchCalls = 0;
  const origSearch = store.searchQuickBooksRootCustomers.bind(store);
  store.searchQuickBooksRootCustomers = async (...args) => {
    searchCalls += 1;
    return origSearch(...args);
  };

  {
    const empty = await service.searchQuickBooksCustomers({
      organizationId: ORG,
      role: "admin",
      query: ""
    });
    assert.equal(empty.queryTooShort, true);
    assert.deepEqual(empty.items, []);
    assert.equal(searchCalls, 0, "empty query must not scan facts");
    const short = await service.searchQuickBooksCustomers({
      organizationId: ORG,
      role: "admin",
      query: "S"
    });
    assert.equal(short.queryTooShort, true);
    assert.deepEqual(short.items, []);
    assert.equal(searchCalls, 0, "1-char query must not scan facts");
    console.log("ok: empty/short query does not dump customers");
  }

  {
    const found = await service.searchQuickBooksCustomers({
      organizationId: ORG,
      role: "admin",
      query: "Stoddard"
    });
    assert.equal(found.queryTooShort, false);
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].listId, "80000001-ROOT");
    assert.equal(found.items[0].displayName, "Stoddard & Jensen Real Estate");
    assert.equal(found.items[0].active, true);
    assert.equal(JSON.stringify(found).includes("Kitchen Remodel"), false);
    assert.equal(JSON.stringify(found).includes("80000001-JOB"), false);
    assert.equal(JSON.stringify(found).includes("OTHER-ORG-ROOT"), false);
    assert.equal(JSON.stringify(found).includes("raw_payload"), false);
    assert.equal(JSON.stringify(found).includes("raw_hash"), false);
    assert.equal(JSON.stringify(found).includes("bill_city"), false);
    found.items.forEach((item) => assertSafeQbCustomerSearchItem(item));
    assert.equal(found.items[0].existingAccountId, null);
    console.log("ok: searches root customers, excludes jobs, org-isolated, safe fields");
  }

  {
    const exact = await service.searchQuickBooksCustomers({
      organizationId: ORG,
      role: "admin",
      query: "80000001-ROOT"
    });
    assert.equal(exact.items.length, 1);
    assert.equal(exact.items[0].listId, "80000001-ROOT");
    console.log("ok: exact ListID retained in discovery result");
  }

  {
    const account = await seedNamedAccount(service, "Robertson Manufacturing, Inc.");
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { externalId: "80000001-ROOT", externalDisplayName: "Robertson Manufacturing, Inc." }
    });
    const found = await service.searchQuickBooksCustomers({
      organizationId: ORG,
      role: "admin",
      query: "Stoddard"
    });
    assert.equal(found.items[0].existingAccountId, account.id);
    assertSafeQbCustomerSearchItem(found.items[0]);
    console.log("ok: QB search hydrates existingAccountId from exact active ListID link");
  }

  {
    for (let i = 0; i < 25; i += 1) {
      await seedTrustedQuickBooksCustomerFact(store, {
        organizationId: ORG,
        qbListId: `BOUND-${String(i).padStart(2, "0")}`,
        name: `Bound Customer ${String(i).padStart(2, "0")}`,
        fullName: `Bound Customer ${String(i).padStart(2, "0")}`,
        isJob: false
      });
    }
    const bounded = await service.searchQuickBooksCustomers({
      organizationId: ORG,
      role: "admin",
      query: "Bound Customer"
    });
    assert.equal(bounded.items.length, 20);
    const names = bounded.items.map((i) => i.displayName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    assert.deepEqual(names, sorted);
    console.log("ok: bounded result count and deterministic order");
  }

  {
    await assert.rejects(
      () =>
        service.searchQuickBooksCustomers({
          organizationId: ORG,
          role: "sales",
          query: "Stoddard"
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    console.log("ok: search requires EXTERNAL_LINK (ListID not leaked to view-only)");
  }

  {
    const account = await seedNamedAccount(service, "Stale Link Co");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "STALE-WAS-ROOT",
      name: "Was Root",
      isJob: false
    });
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { externalId: "STALE-WAS-ROOT", externalDisplayName: "Was Root" }
    });
    // Remove trusted fact without touching the historical link.
    const origList = store.listQuickBooksCustomerFactsByListIds.bind(store);
    const origGet = store.getQuickBooksCustomerFactByListId.bind(store);
    store.listQuickBooksCustomerFactsByListIds = async () => [];
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    const qb = (detail.externalLinks || []).find((l) => l.externalSystem === "quickbooks_desktop" && l.isActive !== false);
    assert.ok(qb);
    assert.equal(qb.externalId, "STALE-WAS-ROOT");
    assert.equal(qb.qbTrusted?.available, false);
    assert.equal((detail.externalLinks || []).filter((l) => l.isActive !== false).length, 1);
    store.listQuickBooksCustomerFactsByListIds = origList;
    store.getQuickBooksCustomerFactByListId = origGet;
    console.log("ok: missing trusted fact does not unlink historical identity");
  }

  {
    const account = await seedNamedAccount(service, "Named Link Co");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "LIVE-ROOT",
      name: "Live Customer",
      fullName: "Live Customer LLC",
      isJob: false
    });
    const linked = await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { externalId: "LIVE-ROOT", externalDisplayName: "typed leftover" }
    });
    const qb = (linked.externalLinks || []).find((l) => l.externalId === "LIVE-ROOT");
    assert.equal(qb.qbTrusted.available, true);
    assert.equal(qb.qbTrusted.displayName, "Live Customer LLC");
    const viewer = await service.getAccount({ organizationId: ORG, role: "sales", accountId: account.id });
    const viewerQb = (viewer.externalLinks || []).find((l) => l.system && String(l.system).includes("QuickBooks"));
    assert.equal(viewerQb.externalId, undefined);
    assert.equal(viewerQb.qbTrusted.displayName, "Live Customer LLC");
    console.log("ok: hydrate exposes trusted display name; ListID stays EXTERNAL_LINK-gated");
  }

  {
    const searchSrc = readFileSync(join(here, "accountDirectoryQbCustomerSearch.mjs"), "utf8");
    const serviceSrc = readFileSync(join(here, "accountDirectoryService.mjs"), "utf8");
    const apiSrc = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
    const supabaseSrc = readFileSync(join(here, "accountDirectorySupabaseStore.mjs"), "utf8");
    assert.equal(/insert\(|upsert\(|quickbooks-customer-sync|writeback/i.test(searchSrc), false);
    assert.ok(serviceSrc.includes("searchQuickBooksCustomers"));
    assert.ok(serviceSrc.includes("EXTERNAL_LINK"));
    assert.ok(apiSrc.includes("/api/account-directory/quickbooks-customers/search"));
    assert.ok(apiSrc.includes("req.query?.q"));
    assert.equal(apiSrc.includes("writeGuard") && /quickbooks-customers\/search[\s\S]{0,80}writeGuard/.test(apiSrc), false);
    assert.ok(supabaseSrc.includes(".eq(\"is_job\", false)") || supabaseSrc.includes(".eq('is_job', false)"));
    assert.ok(supabaseSrc.includes(".limit("));
    assert.ok(supabaseSrc.includes("ad_qb_customer_facts"));
    assert.equal(supabaseSrc.includes("raw_payload") && /searchQuickBooksRootCustomers[\s\S]{0,800}raw_payload/.test(supabaseSrc), false);
    console.log("ok: search is read-only Account Directory route against trusted facts");
  }

  {
    const { store: store2, service: service2 } = svc();
    const a = await seedNamedAccount(service2, "Multi QB Co");
    await seedTrustedQuickBooksCustomerFact(store2, { organizationId: ORG, qbListId: "QB-A", name: "A Co", isJob: false });
    await seedTrustedQuickBooksCustomerFact(store2, { organizationId: ORG, qbListId: "QB-B", name: "B Co", isJob: false });
    await service2.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "QB-A", externalDisplayName: "A Co" }
    });
    await service2.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "QB-B", externalDisplayName: "B Co" }
    });
    const detail = await service2.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    const qb = (detail.externalLinks || []).filter(
      (l) => l.externalSystem === "quickbooks_desktop" && l.isActive !== false
    );
    await service2.deactivateExternalLink({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      linkId: qb[0].id,
      expectedSystem: "quickbooks_desktop"
    });
    const after = await service2.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    const remaining = (after.externalLinks || []).filter(
      (l) => l.externalSystem === "quickbooks_desktop" && l.isActive !== false
    );
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].externalId, "QB-B");
    await assert.rejects(
      () =>
        service2.deactivateExternalLink({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          accountId: a.id,
          linkId: remaining[0].id,
          expectedSystem: "quickbooks_desktop"
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    console.log("ok: governed QB unlink; sales cannot mutate; sibling QB link remains");
  }

  console.log("accountDirectoryQbCustomerSearch.test.mjs — all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
