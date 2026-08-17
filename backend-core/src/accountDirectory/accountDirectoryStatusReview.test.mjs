/**
 * Account Directory Phase 4B status review queue tests.
 * Run: node backend-core/src/accountDirectory/accountDirectoryStatusReview.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { permissionsForRole } from "./accountDirectoryAuth.mjs";
import { attachAccountDirectoryRoutes } from "./accountDirectoryApi.js";
import { ACCOUNT_DIRECTORY_HEAD_SLUG } from "./accountDirectoryAuth.mjs";
import { evidenceFingerprint, isExceptionTransition } from "./accountDirectoryStatusReconciliation.mjs";
import { classifyAccountStatus } from "./accountDirectoryStatusReconciliation.mjs";
import { decideStatusReview, listStatusReviewQueue } from "./accountDirectoryStatusReview.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const here = dirname(fileURLToPath(import.meta.url));

function ctx(store, role = "admin") {
  const service = createAccountDirectoryService({ store });
  return { store, service, supabase: null, organizationId: ORG, role, actorUserId: ACTOR, requestId: "req-1" };
}

async function seedActiveUnlinked(store, name, source = "manual") {
  return store.insertAccount({
    organizationId: ORG,
    displayName: name,
    status: "active",
    source,
    createdBy: ACTOR,
    updatedBy: ACTOR
  });
}

async function main() {
  assert.equal(permissionsForRole("sales").canReviewStatus, false);
  assert.equal(permissionsForRole("office").canReviewStatus, false);
  assert.equal(permissionsForRole("customer_service").canReviewStatus, false);
  assert.equal(permissionsForRole("admin").canReviewStatus, true);
  assert.equal(permissionsForRole("executive").canReviewStatus, true);
  console.log("ok: only ADMIN roles get canReviewStatus");

  {
    const store = createAccountDirectoryMemoryStore();
    await seedActiveUnlinked(store, "Exception Co");
    await assert.rejects(
      () => listStatusReviewQueue({ ...ctx(store, "sales") }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    await assert.rejects(
      () =>
        decideStatusReview({
          ...ctx(store, "sales"),
          accountId: "x",
          decision: "keep_current"
        }),
      (e) => e.status === 403
    );
    console.log("ok: ordinary VIEW/EDIT cannot access review API");
  }

  {
    const linked = classifyAccountStatus({
      accountId: "1",
      displayName: "Blackstone",
      status: "active",
      qb: {
        exactLinked: true,
        rootExists: true,
        qbActive: true,
        enrichmentState: "linked",
        sharedRootAccountCount: 1
      },
      eliteos: { quoteOrEstimateCount: 0, acceptedOrSoldEvidence: false }
    });
    assert.equal(linked.proposedStatus, "active");
    const unlinked = classifyAccountStatus({
      accountId: "2",
      displayName: "Trade",
      status: "active",
      contactCount: 1,
      qb: { exactLinked: false, enrichmentState: "not_linked" },
      eliteos: { quoteOrEstimateCount: 0, acceptedOrSoldEvidence: false }
    });
    assert.equal(unlinked.proposedStatus, "prospect");
    console.log("ok: exact Phase 4 classification reused");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const account = await seedActiveUnlinked(store, "Keep Active Co");
    await store.insertContact({
      organizationId: ORG,
      accountId: account.id,
      displayName: "Pat",
      isPrimaryEstimating: true
    });
    const listed = await listStatusReviewQueue({ ...ctx(store), query: { reviewed: "unresolved" } });
    const item = listed.items.find((row) => row.accountId === account.id);
    assert.ok(item);
    assert.equal(item.recommendedStatus, "prospect");
    assert.equal(item.currentStatus, "active");
    await decideStatusReview({
      ...ctx(store),
      accountId: account.id,
      decision: "keep_current",
      evidenceFingerprint: item.evidenceFingerprint,
      keepReason: "known_customer_awaiting_qb",
      note: "Waiting on QB setup"
    });
    const again = await listStatusReviewQueue({ ...ctx(store) });
    const after = again.items.find((row) => row.accountId === account.id);
    assert.equal(after.suppressed, true);
    assert.equal(after.review.decision, "keep_current");
    assert.equal(after.review.keepReason, "known_customer_awaiting_qb");
    assert.equal(after.review.actorUserId, ACTOR);
    assert.ok(after.review.at);
    const unresolved = await listStatusReviewQueue({
      ...ctx(store),
      query: { reviewed: "unresolved" }
    });
    assert.equal(
      unresolved.items.some((row) => row.accountId === account.id),
      false
    );
    const events = await store.listAuditEvents(ORG, account.id);
    assert.ok(events.some((e) => e.action === "status_reconciliation_reviewed"));
    const still = await store.getAccount(ORG, account.id);
    assert.equal(still.status, "active");
    console.log("ok: keep_current persists and unchanged fingerprint suppresses repeat review");
  }

  {
    const a = classifyAccountStatus({
      accountId: "f",
      displayName: "X",
      status: "active",
      qb: { exactLinked: false, enrichmentState: "not_linked" },
      eliteos: { acceptedOrSoldEvidence: false }
    });
    const b = classifyAccountStatus({
      accountId: "f",
      displayName: "X",
      status: "active",
      qb: { exactLinked: true, rootExists: true, qbActive: true, enrichmentState: "linked" },
      eliteos: { acceptedOrSoldEvidence: false }
    });
    assert.notEqual(evidenceFingerprint(a), evidenceFingerprint(b));
    const store = createAccountDirectoryMemoryStore();
    const account = await seedActiveUnlinked(store, "Reopen Co");
    await store.insertContact({
      organizationId: ORG,
      accountId: account.id,
      displayName: "Pat",
      isPrimaryEstimating: true
    });
    const listed = await listStatusReviewQueue({ ...ctx(store) });
    const item = listed.items.find((row) => row.accountId === account.id);
    await assert.rejects(
      () =>
        decideStatusReview({
          ...ctx(store),
          accountId: account.id,
          decision: "keep_current",
          evidenceFingerprint: "stale-fingerprint",
          keepReason: "other"
        }),
      (e) => e.code === "evidence_changed" && e.status === 409
    );
    assert.ok(item.evidenceFingerprint);
    console.log("ok: changed evidence fingerprint reopens / rejects stale review");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const keep = await seedActiveUnlinked(store, "Stay Active");
    const change = await seedActiveUnlinked(store, "Become Prospect");
    await store.insertContact({
      organizationId: ORG,
      accountId: keep.id,
      displayName: "A",
      isPrimaryEstimating: true
    });
    await store.insertContact({
      organizationId: ORG,
      accountId: change.id,
      displayName: "B",
      isPrimaryEstimating: true
    });
    const listed = await listStatusReviewQueue({ ...ctx(store) });
    const item = listed.items.find((row) => row.accountId === change.id);
    await decideStatusReview({
      ...ctx(store),
      accountId: change.id,
      decision: "accept_recommendation",
      evidenceFingerprint: item.evidenceFingerprint,
      rowVersion: change.rowVersion
    });
    const updated = await store.getAccount(ORG, change.id);
    const other = await store.getAccount(ORG, keep.id);
    assert.equal(updated.status, "prospect");
    assert.equal(other.status, "active");
    assert.equal(store.__stats().externalLinks, 0);
    console.log("ok: accepting Prospect recommendation changes only that account");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const account = await store.insertAccount({
      organizationId: ORG,
      displayName: "Seed Unlinked",
      status: "active",
      source: "quickbooks_workbook_seed",
      createdBy: ACTOR
    });
    const listed = await listStatusReviewQueue({ ...ctx(store) });
    const item = listed.items.find((row) => row.accountId === account.id);
    assert.equal(item.recommendedStatus, "needs_review");
    await decideStatusReview({
      ...ctx(store),
      accountId: account.id,
      decision: "accept_recommendation",
      evidenceFingerprint: item.evidenceFingerprint,
      rowVersion: account.rowVersion
    });
    const updated = await store.getAccount(ORG, account.id);
    assert.equal(updated.status, "needs_review");
    console.log("ok: accepting Needs Review changes only that account");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const account = await seedActiveUnlinked(store, "Stale Row");
    await store.insertContact({
      organizationId: ORG,
      accountId: account.id,
      displayName: "A",
      isPrimaryEstimating: true
    });
    const listed = await listStatusReviewQueue({ ...ctx(store) });
    const item = listed.items.find((row) => row.accountId === account.id);
    await store.updateAccount(ORG, account.id, { displayName: "Stale Row Edited" }, account.rowVersion);
    await assert.rejects(
      () =>
        decideStatusReview({
          ...ctx(store),
          accountId: account.id,
          decision: "accept_recommendation",
          evidenceFingerprint: item.evidenceFingerprint,
          rowVersion: account.rowVersion
        }),
      (e) => e.code === "conflict" && e.status === 409
    );
    console.log("ok: stale row_version rejected");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    await store.insertAccount({
      organizationId: ORG_B,
      displayName: "Other Org Exception",
      status: "active",
      source: "manual"
    });
    await store.insertContact({
      organizationId: ORG_B,
      accountId: (await store.listAccounts(ORG_B, { includeArchived: true, limit: 10 })).items[0].id,
      displayName: "X",
      isPrimaryEstimating: true
    });
    const listed = await listStatusReviewQueue({ ...ctx(store) });
    assert.equal(
      listed.items.some((row) => row.displayName === "Other Org Exception"),
      false
    );
    console.log("ok: organization isolation");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const account = await seedActiveUnlinked(store, "No Fuzzy Active");
    await store.insertContact({
      organizationId: ORG,
      accountId: account.id,
      displayName: "A",
      isPrimaryEstimating: true
    });
    const listed = await listStatusReviewQueue({ ...ctx(store) });
    const item = listed.items.find((row) => row.accountId === account.id);
    assert.notEqual(item.recommendedStatus, "active");
    const json = JSON.stringify(listed);
    assert.equal(/listid|txnid|gross_profit|cogs|payroll|entity_id/i.test(json), false);
    console.log("ok: no fuzzy Active; owner-sensitive data absent");
  }

  {
    const apiSrc = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
    assert.equal(apiSrc.includes("apply-all"), false);
    assert.equal(apiSrc.includes("applyAll"), false);
    assert.ok(apiSrc.includes("/api/account-directory/status-review/:accountId/decision"));
    assert.equal(apiSrc.includes("status-review/decision"), false);
    assert.equal(isExceptionTransition("active", "active"), false);
    assert.equal(isExceptionTransition("prospect", "prospect"), false);
    assert.equal(isExceptionTransition("archived", "archived"), false);
    assert.equal(isExceptionTransition("active", "needs_review"), true);
    assert.equal(isExceptionTransition("prospect", "needs_review"), true);
    assert.equal(isExceptionTransition("active", "prospect"), true);
    console.log("ok: exception queue excludes consistent Active/Prospect/Archived");

    const reviewSrc = readFileSync(join(here, "accountDirectoryStatusReview.mjs"), "utf8");
    assert.equal(reviewSrc.includes("insertExternalLink"), false);
    assert.equal(reviewSrc.includes("linkQuickBooks"), false);
    assert.equal(reviewSrc.includes("apply-all"), false);
    console.log("ok: no auto QB links and no bulk apply in review service");
  }

  {
    const routes = new Map();
    const app = {
      get(path) {
        routes.set(`GET ${path}`, true);
      },
      post(path) {
        routes.set(`POST ${path}`, true);
      },
      patch() {},
      delete() {}
    };
    attachAccountDirectoryRoutes(app, {
      requireAuth: () => (req, res, next) => next(),
      requireHeadAccess: (slug) => {
        assert.equal(slug, ACCOUNT_DIRECTORY_HEAD_SLUG);
        return (req, res, next) => next();
      },
      getSupabase: () => ({}),
      store: createAccountDirectoryMemoryStore()
    });
    assert.ok(routes.has("GET /api/account-directory/status-review"));
    assert.ok(routes.has("POST /api/account-directory/status-review/:accountId/decision"));
    assert.equal(routes.has("POST /api/account-directory/status-review/apply-all"), false);
    console.log("ok: review routes registered without bulk apply");
  }

  // Phase 0C — pagination + targeted decide scoping
  {
    const store = createAccountDirectoryMemoryStore();
    const seeded = [];
    for (let i = 0; i < 12; i += 1) {
      const account = await seedActiveUnlinked(store, `Phase0C Page ${String(i).padStart(2, "0")}`);
      await store.insertContact({
        organizationId: ORG,
        accountId: account.id,
        displayName: `Contact ${i}`,
        isPrimaryEstimating: true
      });
      seeded.push(account);
    }

    const page1 = await listStatusReviewQueue({
      ...ctx(store),
      query: { reviewed: "unresolved", page: 1, pageSize: 5 }
    });
    const page2 = await listStatusReviewQueue({
      ...ctx(store),
      query: { reviewed: "unresolved", page: 2, pageSize: 5 }
    });
    assert.equal(page1.pageSize, 5);
    assert.equal(page1.page, 1);
    assert.equal(page1.items.length, 5);
    assert.equal(page2.page, 2);
    assert.equal(page2.items.length, 5);
    assert.ok(page1.total >= 12);
    assert.equal(page1.total, page2.total);
    const page1Ids = new Set(page1.items.map((r) => r.accountId));
    const page2Ids = page2.items.map((r) => r.accountId);
    assert.ok(page2Ids.every((id) => !page1Ids.has(id)), "page 2 must not duplicate page 1");
    assert.equal(page1.hasNextPage, true);
    assert.equal(page2.hasPreviousPage, true);

    let orgContacts = 0;
    let orgLocations = 0;
    let orgLinks = 0;
    let scopedContactAccountIds = [];
    const origContactsOrg = store.listContactsForOrganization.bind(store);
    const origLocationsOrg = store.listLocationsForOrganization.bind(store);
    const origLinksOrg = store.listExternalLinksForOrganization.bind(store);
    const origContacts = store.listContacts.bind(store);
    store.listContactsForOrganization = async (organizationId) => {
      orgContacts += 1;
      return origContactsOrg(organizationId);
    };
    store.listLocationsForOrganization = async (organizationId) => {
      orgLocations += 1;
      return origLocationsOrg(organizationId);
    };
    store.listExternalLinksForOrganization = async (organizationId) => {
      orgLinks += 1;
      return origLinksOrg(organizationId);
    };
    store.listContacts = async (organizationId, accountId) => {
      scopedContactAccountIds.push(String(accountId));
      return origContacts(organizationId, accountId);
    };

    const target = seeded[3];
    const listed = await listStatusReviewQueue({
      ...ctx(store),
      query: { search: target.displayName, page: 1, pageSize: 50 }
    });
    const item = listed.items.find((r) => r.accountId === target.id);
    assert.ok(item);

    orgContacts = 0;
    orgLocations = 0;
    orgLinks = 0;
    scopedContactAccountIds = [];
    await decideStatusReview({
      ...ctx(store),
      accountId: target.id,
      decision: "keep_current",
      keepReason: "known_customer_awaiting_qb",
      evidenceFingerprint: item.evidenceFingerprint,
      rowVersion: item.rowVersion
    });
    assert.equal(orgContacts, 0, "decide must not load org-wide contacts");
    assert.equal(orgLocations, 0, "decide must not load org-wide locations");
    assert.equal(orgLinks, 0, "decide must not load org-wide external links");
    assert.deepEqual(scopedContactAccountIds, [target.id]);

    // Stale fingerprint still rejects
    await assert.rejects(
      () =>
        decideStatusReview({
          ...ctx(store),
          accountId: target.id,
          decision: "keep_current",
          keepReason: "strategic_manual",
          evidenceFingerprint: "stale-fingerprint",
          rowVersion: item.rowVersion
        }),
      (e) => e instanceof AccountDirectoryError && e.code === "evidence_changed"
    );

    // Keep-current suppression still works after reload
    const afterKeep = await listStatusReviewQueue({
      ...ctx(store),
      query: { search: target.displayName, page: 1, pageSize: 50 }
    });
    const kept = afterKeep.items.find((r) => r.accountId === target.id);
    assert.equal(kept?.suppressed, true);

    // Org isolation on decide
    const other = await store.insertAccount({
      organizationId: ORG_B,
      displayName: "Other Org Decide",
      status: "active",
      source: "manual",
      createdBy: ACTOR,
      updatedBy: ACTOR
    });
    await assert.rejects(
      () =>
        decideStatusReview({
          ...ctx(store),
          accountId: other.id,
          decision: "mark_needs_review",
          rowVersion: 1
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 404
    );

    console.log("ok: Phase 0C pagination + targeted decide scoping");
  }

  console.log("accountDirectoryStatusReview.test.mjs — all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
