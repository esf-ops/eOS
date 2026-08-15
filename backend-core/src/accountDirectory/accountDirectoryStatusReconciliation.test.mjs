/**
 * Account Directory status reconciliation — dry-run classifier tests.
 * Run: node backend-core/src/accountDirectory/accountDirectoryStatusReconciliation.test.mjs
 */

import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import {
  assertNoSensitivePayload,
  classifyAccountStatus,
  formatStatusReconcileConsole,
  summarizeStatusReconciliation
} from "./accountDirectoryStatusReconciliation.mjs";
import {
  classifyLoadedEvidence,
  loadStatusReconciliationEvidence
} from "./accountDirectoryStatusReconciliationLoad.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function base(overrides = {}) {
  return {
    accountId: "11111111-1111-4111-8111-111111111111",
    displayName: "Example Co",
    status: "active",
    source: "manual",
    contactCount: 1,
    locationCount: 1,
    aliasCount: 0,
    qb: {
      exactLinked: false,
      rootExists: false,
      qbActive: null,
      isJob: false,
      enrichmentState: "not_linked",
      sharedRootAccountCount: 0
    },
    eliteos: {
      quoteOrEstimateCount: 0,
      acceptedOrSoldEvidence: false,
      otherDeterministicEvidence: []
    },
    ...overrides
  };
}

async function main() {
  {
    const row = classifyAccountStatus(
      base({
        displayName: "Blackstone Installation",
        qb: {
          exactLinked: true,
          rootExists: true,
          qbActive: true,
          isJob: false,
          enrichmentState: "linked",
          sharedRootAccountCount: 1
        }
      })
    );
    assert.equal(row.proposedStatus, "active");
    assert.equal(row.reasonCode, "exact_qb_active");
    assert.equal(row.evidence.qb.exactLinked, true);
    console.log("ok: linked active QB → Active");
  }

  {
    const row = classifyAccountStatus(
      base({
        status: "active",
        qb: {
          exactLinked: true,
          rootExists: true,
          qbActive: false,
          isJob: false,
          enrichmentState: "linked",
          sharedRootAccountCount: 1
        }
      })
    );
    assert.equal(row.proposedStatus, "inactive");
    assert.equal(row.reasonCode, "exact_qb_inactive");
    console.log("ok: linked inactive QB → Inactive");
  }

  {
    const row = classifyAccountStatus(
      base({
        status: "active",
        eliteos: { quoteOrEstimateCount: 2, acceptedOrSoldEvidence: false, otherDeterministicEvidence: [] }
      })
    );
    assert.equal(row.proposedStatus, "prospect");
    assert.equal(row.reasonCode, "presale_only");
    console.log("ok: unlinked pre-sale-only → Prospect");
  }

  {
    const row = classifyAccountStatus(
      base({
        status: "prospect",
        eliteos: { quoteOrEstimateCount: 1, acceptedOrSoldEvidence: true, otherDeterministicEvidence: ["sold"] }
      })
    );
    assert.equal(row.proposedStatus, "needs_review");
    assert.equal(row.reasonCode, "sold_without_qb");
    console.log("ok: unlinked established-customer evidence → Needs Review");
  }

  {
    const row = classifyAccountStatus(
      base({
        status: "prospect",
        nameSimilarityToUnlinkedQb: true,
        qb: {
          exactLinked: false,
          rootExists: false,
          qbActive: null,
          enrichmentState: "suggested_match",
          suggestionStatus: "open"
        }
      })
    );
    assert.equal(row.proposedStatus, "needs_review");
    assert.notEqual(row.proposedStatus, "active");
    assert.equal(row.reasonCode, "qb_suggestion");
    assert.ok(row.reviewFlags.includes("possible_qb_name_match"));
    console.log("ok: suggested QB match → Needs Review, never Active");
  }

  {
    const row = classifyAccountStatus(
      base({
        qb: {
          exactLinked: false,
          enrichmentState: "conflict",
          suggestionStatus: "conflict"
        }
      })
    );
    assert.equal(row.proposedStatus, "needs_review");
    assert.equal(row.reasonCode, "qb_conflict");
    console.log("ok: QB conflict → Needs Review");
  }

  {
    const row = classifyAccountStatus(
      base({
        status: "archived",
        archivedAt: "2026-01-01T00:00:00.000Z",
        qb: {
          exactLinked: true,
          rootExists: true,
          qbActive: true,
          enrichmentState: "linked",
          sharedRootAccountCount: 1
        }
      })
    );
    assert.equal(row.proposedStatus, "archived");
    assert.equal(row.reasonCode, "leave_archived");
    console.log("ok: archived remains Archived");
  }

  {
    const row = classifyAccountStatus(
      base({
        displayName: "Same Name As QuickBooks",
        nameSimilarityToUnlinkedQb: true,
        qb: { exactLinked: false, enrichmentState: "not_linked" },
        eliteos: { quoteOrEstimateCount: 0, acceptedOrSoldEvidence: false }
      })
    );
    assert.notEqual(row.proposedStatus, "active");
    assert.ok(row.reviewFlags.includes("possible_qb_name_match"));
    console.log("ok: same-name QB without exact link never establishes Active");
  }

  {
    const row = classifyAccountStatus(
      base({
        displayName: "Blackstone Installation:Kitchen",
        qb: {
          exactLinked: true,
          rootExists: true,
          qbActive: true,
          isJob: true,
          enrichmentState: "linked",
          sharedRootAccountCount: 1
        }
      })
    );
    assert.equal(row.proposedStatus, "needs_review");
    assert.equal(row.reasonCode, "qb_job_hierarchy");
    console.log("ok: QB Job/subcustomer does not establish a separate customer");
  }

  {
    const row = classifyAccountStatus(
      base({
        displayName: "Test Dummy",
        status: "active",
        contactCount: 0,
        locationCount: 0,
        aliasCount: 0,
        qb: { exactLinked: false, enrichmentState: "not_linked" }
      })
    );
    assert.equal(row.bucket, "archive_candidate");
    assert.equal(row.proposedStatus, "active");
    assert.notEqual(row.proposedStatus, "archived");
    console.log("ok: no evidence does not cause destructive classification");
  }

  {
    const empty = classifyAccountStatus(
      base({
        displayName: "Mystery Row",
        status: "active",
        contactCount: 0,
        locationCount: 0,
        aliasCount: 0,
        source: "",
        qb: { exactLinked: false, enrichmentState: "not_linked" }
      })
    );
    assert.equal(empty.proposedStatus, "needs_review");
    assert.equal(empty.bucket, "unresolved");
    assert.notEqual(empty.proposedStatus, "archived");
    console.log("ok: insufficient evidence → unresolved review, not archive");
  }

  {
    const { store, service } = (() => {
      const store = createAccountDirectoryMemoryStore();
      return { store, service: createAccountDirectoryService({ store }) };
    })();
    const writes = { n: 0 };
    const wrap = (name) => {
      const orig = store[name].bind(store);
      store[name] = async (...args) => {
        writes.n += 1;
        return orig(...args);
      };
    };
    wrap("insertAccount");
    wrap("updateAccount");
    wrap("insertExternalLink");
    wrap("insertAuditEvent");

    const created = await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Dry Run Co" },
      asProspect: true
    });
    const before = writes.n;
    const loaded = await loadStatusReconciliationEvidence({
      store,
      supabase: null,
      organizationId: ORG
    });
    const result = classifyLoadedEvidence(loaded);
    assert.equal(writes.n, before);
    assert.equal(loaded.databaseWrites, 0);
    assert.equal(result.databaseWrites, 0);
    assert.equal(result.classified[0].accountId, created.id);
    assert.equal(result.classified[0].proposedStatus, "prospect");
    console.log("ok: no mutations during dry run");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    await service.createAccount({
      organizationId: ORG,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Org A Only" }
    });
    await service.createAccount({
      organizationId: ORG_B,
      role: "sales",
      actorUserId: ACTOR,
      payload: { displayName: "Org B Only" }
    });
    const loadedA = await loadStatusReconciliationEvidence({ store, organizationId: ORG });
    const loadedB = await loadStatusReconciliationEvidence({ store, organizationId: ORG_B });
    assert.equal(loadedA.records.length, 1);
    assert.equal(loadedB.records.length, 1);
    assert.equal(loadedA.records[0].displayName, "Org A Only");
    assert.equal(loadedB.records[0].displayName, "Org B Only");
    console.log("ok: organization isolation");
  }

  {
    const shared = {
      exactLinked: true,
      rootExists: true,
      qbActive: true,
      isJob: false,
      enrichmentState: "linked",
      sharedRootAccountCount: 2
    };
    const a = classifyAccountStatus(base({ displayName: "Dup A", qb: shared }));
    assert.equal(a.proposedStatus, "needs_review");
    assert.equal(a.reasonCode, "qb_shared_root");
    assert.ok(a.reviewFlags.includes("possible_duplicate"));
    console.log("ok: shared exact QB root is a review/duplicate flag, not a merge");
  }

  {
    const seed = classifyAccountStatus(
      base({
        source: "quickbooks_workbook_seed",
        contactCount: 0,
        locationCount: 0,
        qb: { exactLinked: false, enrichmentState: "not_linked" }
      })
    );
    assert.equal(seed.proposedStatus, "needs_review");
    assert.equal(seed.reasonCode, "seed_unlinked_qb_workbook");
    console.log("ok: unlinked workbook seed stays Needs Review");
  }

  {
    const classified = [
      classifyAccountStatus(
        base({
          accountId: "a1",
          displayName: "One",
          qb: {
            exactLinked: true,
            rootExists: true,
            qbActive: true,
            enrichmentState: "linked",
            sharedRootAccountCount: 1
          }
        })
      ),
      classifyAccountStatus(base({ accountId: "a2", displayName: "Two", status: "prospect" }))
    ];
    assertNoSensitivePayload(classified);
    const summary = summarizeStatusReconciliation(classified);
    assert.equal(summary.total, 2);
    assert.equal(summary.transitions.active.active, 1);
    assert.equal(summary.transitions.prospect.prospect, 1);
    const text = formatStatusReconcileConsole(summary);
    assert.match(text, /databaseWrites: 0/);
    assert.equal(/80010|ListID|TxnID|entity_id/i.test(JSON.stringify(classified)), false);
    console.log("ok: summary matrix + staff-safe payload");
  }

  console.log("accountDirectoryStatusReconciliation.test.mjs — all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
