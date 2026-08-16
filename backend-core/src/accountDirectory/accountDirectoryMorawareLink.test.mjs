/**
 * Governed Moraware external links + review queue (no live Supabase writes).
 */
import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";
import { rankMorawareDirectoryCandidates } from "./accountDirectoryMorawareMatching.mjs";
import {
  ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
  buildMorawareRelationship,
  buildTrustedMorawareOperations,
  isInternalMorawareAccountName
} from "./accountDirectoryMorawareLinkage.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ORG = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const ACTOR = "00000000-0000-4000-8000-000000000099";

const CANONICAL = new Map([
  ["635", { sourceAccountId: "635", accountName: "Dyersville- Broihahn Custom Woodworks" }],
  ["553", { sourceAccountId: "553", accountName: "Dyersville - Broihahn Custom Woodworks" }],
  ["663", { sourceAccountId: "663", accountName: "Stoddard & Jensen Real Estate" }],
  ["5", { sourceAccountId: "5", accountName: "Direct" }]
]);

function canonicalFor(orgId, extra = new Map()) {
  return async (organizationId, sourceAccountId) => {
    if (organizationId !== orgId && organizationId !== ORG) return extra.get(`${organizationId}:${sourceAccountId}`) || null;
    return extra.get(String(sourceAccountId)) || CANONICAL.get(String(sourceAccountId)) || null;
  };
}

function svc(opts = {}) {
  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({
    store,
    loadCanonicalMorawareAccount: opts.loadCanonicalMorawareAccount || canonicalFor(ORG),
    ...opts
  });
  return { store, service };
}

function emptyQueueMaps() {
  return {
    jobsByMorawareId: new Map(),
    qbLinksByAccountId: new Map(),
    morawareLinksBySourceId: new Map(),
    morawareLinksByAccountId: new Map()
  };
}

async function main() {
  assert.equal(isInternalMorawareAccountName("Direct"), true);
  assert.equal(isInternalMorawareAccountName("Dyersville- Direct"), true);
  assert.equal(isInternalMorawareAccountName("Elite Stone Fabrication"), true);
  assert.equal(isInternalMorawareAccountName("Aceno Granite"), true);
  assert.equal(isInternalMorawareAccountName("Cambrian Granite & Stone"), true);
  assert.equal(isInternalMorawareAccountName("Retail Dyersville"), true);
  assert.equal(isInternalMorawareAccountName("Broihahn Custom Woodworks"), false);

  const fuzzy = rankMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "37", accountName: "Heartland Design" },
    jobs: [{ createdAtSource: "2026-02-01" }],
    directoryAccounts: [{ id: "ad-1", displayName: "Heartland Designs" }],
    qbLinksByAccountId: new Map([["ad-1", { displayName: "Heartland Designs" }]])
  });
  assert.equal(fuzzy.classification, "UNMATCHED");
  assert.equal(fuzzy.proposedAccountId, null);
  assert.ok(fuzzy.alternatives.some((a) => a.evidence.includes("fuzzy_name")));
  console.log("ok: fuzzy name does not become identity");

  const high = rankMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "663", accountName: "Stoddard & Jensen Real Estate" },
    jobs: [{ createdAtSource: "2026-01-01" }, { createdAtSource: "2026-03-01" }],
    directoryAccounts: [{ id: "ad-s", displayName: "Stoddard & Jensen Real Estate" }],
    qbLinksByAccountId: new Map([["ad-s", { displayName: "Stoddard & Jensen Real Estate" }]])
  });
  assert.equal(high.classification, "HIGH_CONFIDENCE_CANDIDATE");
  assert.equal(high.proposedAccountId, "ad-s");
  console.log("ok: high-confidence is a candidate only");

  {
    const { service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Broihahn Custom Woodworks" }
    });
    const uuid = a.id;
    await service.linkMoraware({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "635", externalDisplayName: "Dyersville- Broihahn Custom Woodworks" }
    });
    const resolved = await service.resolveMorawareAccount({
      organizationId: ORG,
      role: "sales",
      sourceAccountId: "635"
    });
    assert.equal(resolved.linked, true);
    assert.equal(resolved.accountId, a.id);

    const b = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Other Co" }
    });
    await assert.rejects(
      () =>
        service.linkMoraware({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: b.id,
          payload: { externalId: "635", externalDisplayName: "Dyersville- Broihahn Custom Woodworks" }
        }),
      (e) => e instanceof AccountDirectoryError && e.code === "duplicate_external_id" && e.status === 409
    );

    await service.linkMoraware({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "553", externalDisplayName: "Dyersville - Broihahn Custom Woodworks" }
    });
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    const mw = (detail.externalLinks || []).filter(
      (l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM && l.isActive
    );
    assert.equal(mw.length, 2);
    assert.equal(detail.id, uuid);

    await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { displayName: "Broihahn Renamed", rowVersion: detail.rowVersion }
    });
    const renamed = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    assert.equal(renamed.id, uuid);
    assert.equal(renamed.name, "Broihahn Renamed");

    const linkId = mw[0].id;
    const afterUnlink = await service.deactivateExternalLink({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      linkId
    });
    const inactive = afterUnlink.externalLinks.find((l) => l.id === linkId);
    assert.equal(inactive.isActive, false);
    const stillThere = afterUnlink.externalLinks.filter(
      (l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM
    );
    assert.equal(stillThere.length, 2);

    const relinked = await service.linkMoraware({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: inactive.externalId, externalDisplayName: inactive.externalDisplayName }
    });
    const activeAgain = relinked.externalLinks.find((l) => l.id === linkId);
    assert.equal(activeAgain.isActive, true);
    const audit = (relinked.auditHistory || []).map((e) => e.action);
    assert.ok(audit.includes("link_moraware"));
    assert.ok(audit.includes("deactivate_moraware_link"));
    assert.ok(audit.includes("relink_moraware"));
    console.log("ok: Option B cardinality, deactivate history, governed relink, UUID stable");
  }

  {
    const { service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "House" }
    });
    await assert.rejects(
      () =>
        service.linkMoraware({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: a.id,
          payload: { externalId: "5", externalDisplayName: "Not Direct At All" }
        }),
      (e) => e.code === "internal_identity_policy"
    );
    await assert.rejects(
      () =>
        service.linkMoraware({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: a.id,
          payload: { externalId: "5" }
        }),
      (e) => e.code === "internal_identity_policy"
    );
    await assert.rejects(
      () =>
        service.linkMoraware({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: a.id,
          payload: { externalId: "999999" }
        }),
      (e) => e.code === "moraware_account_not_found"
    );
    const links = (await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id }))
      .externalLinks;
    assert.equal((links || []).length, 0);
    console.log("ok: internal bucket and nonexistent ID cannot be linked");
  }

  {
    const { store, service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Stoddard & Jensen Real Estate" }
    });
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "LIST-STODDARD", externalDisplayName: "Stoddard & Jensen Real Estate" }
    });
    const queue = await listMorawareReconciliationQueue({
      organizationId: ORG,
      role: "admin",
      store,
      dataset: {
        morawareAccounts: [{ sourceAccountId: "663", accountName: "Stoddard & Jensen Real Estate" }],
        jobsByMorawareId: new Map([
          ["663", [{ createdAtSource: "2026-01-15" }, { createdAtSource: "2026-03-01" }]]
        ]),
        directoryAccounts: [{ id: a.id, displayName: a.name, legalName: null }],
        qbLinksByAccountId: new Map([
          [a.id, { listId: "LIST-STODDARD", displayName: "Stoddard & Jensen Real Estate" }]
        ]),
        morawareLinksBySourceId: new Map(),
        morawareLinksByAccountId: new Map()
      }
    });
    assert.equal(queue.summary.highConfidenceUnlinked, 1);
    assert.equal(queue.items[0].confirmAllowed, true);
    assert.equal(queue.items[0].currentLink.linked, false);
    const stillUnlinked = await service.resolveMorawareAccount({
      organizationId: ORG,
      role: "admin",
      sourceAccountId: "663"
    });
    assert.equal(stillUnlinked.linked, false);
    await assert.rejects(
      () =>
        listMorawareReconciliationQueue({
          organizationId: ORG,
          role: "sales",
          store,
          dataset: {
            morawareAccounts: [],
            directoryAccounts: [],
            ...emptyQueueMaps()
          }
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    console.log("ok: high-confidence still requires explicit confirmation");
  }

  {
    const { store } = svc();
    const morawareAccounts = Array.from({ length: 60 }, (_, i) => ({
      sourceAccountId: String(1000 + i),
      accountName: `Customer ${i}`
    }));
    const page1 = await listMorawareReconciliationQueue({
      organizationId: ORG,
      role: "admin",
      store,
      query: { page: 1, pageSize: 50 },
      dataset: {
        morawareAccounts,
        directoryAccounts: [],
        ...emptyQueueMaps()
      }
    });
    const page2 = await listMorawareReconciliationQueue({
      organizationId: ORG,
      role: "admin",
      store,
      query: { page: 2, pageSize: 50 },
      dataset: {
        morawareAccounts,
        directoryAccounts: [],
        ...emptyQueueMaps()
      }
    });
    assert.equal(page1.summary.totalMorawareAccounts, 60);
    assert.equal(page1.total, 60);
    assert.equal(page1.items.length, 50);
    assert.equal(page1.showingFrom, 1);
    assert.equal(page1.showingTo, 50);
    assert.equal(page2.items.length, 10);
    assert.equal(page2.showingFrom, 51);
    assert.equal(page2.showingTo, 60);
    const ids = new Set([...page1.items, ...page2.items].map((r) => r.morawareAccountId));
    assert.equal(ids.size, 60);
    console.log("ok: queue paging exposes more than 50 candidates");
  }

  {
    const relUnavailable = buildMorawareRelationship(
      [
        {
          isActive: true,
          externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
          externalId: "635",
          externalDisplayName: "Dyersville- Broihahn Custom Woodworks"
        }
      ],
      null,
      { jobsState: "unavailable" }
    );
    assert.equal(relUnavailable.jobs_state, "unavailable");
    assert.equal(relUnavailable.accounts[0].job_count, null);
    assert.equal(relUnavailable.total_job_count, null);
    assert.equal(JSON.stringify(relUnavailable).includes('"job_count":0'), false);
    const rel = buildMorawareRelationship(
      [
        {
          isActive: true,
          externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
          externalId: "635",
          externalDisplayName: "Dyersville- Broihahn Custom Woodworks"
        }
      ],
      { 635: 8 },
      { jobsState: "available" }
    );
    const json = JSON.stringify(rel);
    assert.equal(/raw_payload|rawPayload/i.test(json), false);
    assert.equal(rel.linked, true);
    assert.equal(rel.accounts[0].job_count, 8);
    assert.equal(rel.total_job_count, 8);
    const zeroReal = buildMorawareRelationship(
      [
        {
          isActive: true,
          externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
          externalId: "635",
          externalDisplayName: "Zero Jobs Co"
        }
      ],
      { 635: 0 },
      { jobsState: "available" }
    );
    assert.equal(zeroReal.jobs_state, "available");
    assert.equal(zeroReal.accounts[0].job_count, 0);
    console.log("ok: relationship shape has no raw Moraware payload; unavailable is not zero");
  }

  {
    const links = [
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "635",
        externalDisplayName: "Broihahn A"
      },
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "553",
        externalDisplayName: "Broihahn B"
      }
    ];
    const jobs = [
      {
        source_job_id: "j1",
        source_account_id: "635",
        job_name: "Kitchen A",
        status_name: "complete",
        salesperson_name: "Alex",
        created_at_source: "2026-03-01",
        last_seen_at: "2026-08-15",
        raw_payload: { secret: true }
      },
      {
        source_job_id: "j2",
        source_account_id: "553",
        job_name: "Kitchen B",
        status_name: "active",
        salesperson_name: "Blair",
        created_at_source: "2026-06-15",
        last_seen_at: "2026-08-15"
      },
      {
        source_job_id: "j1",
        source_account_id: "635",
        job_name: "Kitchen A dup",
        created_at_source: "2026-03-01",
        last_seen_at: "2026-08-14"
      },
      {
        source_job_id: "j-other",
        source_account_id: "999",
        job_name: "Unrelated",
        created_at_source: "2026-07-01",
        last_seen_at: "2026-08-15"
      },
      {
        source_job_id: "j-old",
        source_account_id: "635",
        job_name: "Old",
        created_at_source: "2025-12-01",
        last_seen_at: "2026-08-15"
      }
    ];
    const ops = buildTrustedMorawareOperations({ links, jobs, jobsState: "available" });
    assert.equal(ops.jobs_state, "available");
    assert.equal(ops.job_count_2026, 2);
    assert.equal(ops.earliest_job_date, "2026-03-01");
    assert.equal(ops.latest_job_date, "2026-06-15");
    assert.equal(ops.recent_jobs[0].source_job_id, "j2");
    assert.equal(ops.recent_jobs[0].salesperson_name, "Blair");
    assert.equal(ops.recent_jobs[1].source_job_id, "j1");
    assert.equal(ops.accounts.find((a) => a.source_account_id === "635").job_count, 1);
    assert.equal(ops.accounts.find((a) => a.source_account_id === "553").job_count, 1);
    assert.equal(JSON.stringify(ops).includes("raw_payload"), false);
    assert.equal(JSON.stringify(ops).includes("secret"), false);
    const failed = buildTrustedMorawareOperations({ links, jobs: null, jobsState: "unavailable" });
    assert.equal(failed.jobs_state, "unavailable");
    assert.equal(failed.job_count_2026, null);
    assert.equal(JSON.stringify(failed).includes('"job_count_2026":0'), false);
    console.log("ok: trusted ops union, dedupe, exclude unrelated, 2026-only, unavailable is not zero");
  }

  {
    const links = [
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "635",
        externalDisplayName: "Incremental Co"
      }
    ];
    const jobs = Array.from({ length: 13 }, (_, i) => ({
      source_job_id: `inc-${i + 1}`,
      source_account_id: "635",
      job_name: `Job ${i + 1}`,
      status_name: "complete",
      salesperson_name: "Pat",
      created_at_source: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
      last_seen_at: i === 12 ? "2026-08-16" : "2026-08-15"
    }));
    const ops = buildTrustedMorawareOperations({ links, jobs, jobsState: "available" });
    assert.equal(ops.job_count_2026, 13);
    assert.equal(ops.accounts[0].job_count, 13);
    assert.equal(ops.recent_jobs.length, 8);
    console.log("ok: incremental last_seen_at mix does not shrink 2026 job count");
  }

  {
    const links = [
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "635",
        externalDisplayName: "A"
      },
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "553",
        externalDisplayName: "B"
      }
    ];
    const jobs = [
      {
        source_job_id: "a1",
        source_account_id: "635",
        job_name: "A stale",
        created_at_source: "2026-01-10",
        last_seen_at: "2026-08-15"
      },
      {
        source_job_id: "a2",
        source_account_id: "635",
        job_name: "A fresh",
        created_at_source: "2026-04-10",
        last_seen_at: "2026-08-16"
      },
      {
        source_job_id: "b1",
        source_account_id: "553",
        job_name: "B stale",
        created_at_source: "2026-02-10",
        last_seen_at: "2026-08-14"
      }
    ];
    const ops = buildTrustedMorawareOperations({ links, jobs, jobsState: "available" });
    assert.equal(ops.job_count_2026, 3);
    assert.equal(ops.accounts.find((a) => a.source_account_id === "635").job_count, 2);
    assert.equal(ops.accounts.find((a) => a.source_account_id === "553").job_count, 1);
    console.log("ok: multi-Moraware IDs keep jobs across different last_seen_at dates");
  }

  {
    const { service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "QB Stay" }
    });
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "QB-KEEP", externalDisplayName: "QB Stay" }
    });
    const b = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "QB Other" }
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: b.id,
          payload: { externalId: "QB-KEEP" }
        }),
      (e) => e.code === "duplicate_external_id"
    );
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    assert.equal(detail.quickbooksLinked, true);
    const qbLinks = detail.externalLinks.filter((l) => l.externalSystem === "quickbooks_desktop" && l.isActive);
    assert.equal(qbLinks.length, 1);
    const qbLinkId = qbLinks[0].id;
    await assert.rejects(
      () =>
        service.deactivateExternalLink({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: a.id,
          linkId: qbLinkId,
          expectedSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM
        }),
      (e) => e.code === "external_system_mismatch"
    );
    const stillQb = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    assert.equal(
      stillQb.externalLinks.find((l) => l.id === qbLinkId).isActive,
      true
    );
    const afterQbUnlink = await service.deactivateExternalLink({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      linkId: qbLinkId
    });
    assert.equal(afterQbUnlink.externalLinks.find((l) => l.id === qbLinkId).isActive, false);
    console.log("ok: QuickBooks unique-link behavior unchanged; Moraware expectedSystem cannot unlink QB");
  }

  {
    const { store, service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Move From" }
    });
    const b = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Move To" }
    });
    await service.linkMoraware({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "635" }
    });
    const mw = (await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id })).externalLinks.find(
      (l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM
    );
    await assert.rejects(
      () =>
        service.deactivateExternalLink({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: b.id,
          linkId: mw.id
        }),
      (e) => e.status === 404
    );
    const stillActive = await store.getExternalLink(ORG, mw.id);
    assert.equal(stillActive.isActive, true);
    await service.deactivateExternalLink({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      linkId: mw.id,
      expectedSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM
    });
    await service.linkMoraware({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: b.id,
      payload: { externalId: "635" }
    });
    const onA = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    const onB = await service.getAccount({ organizationId: ORG, role: "admin", accountId: b.id });
    assert.equal(
      onA.externalLinks.find((l) => l.externalId === "635" && l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM)
        .isActive,
      false
    );
    assert.equal(
      onB.externalLinks.find((l) => l.externalId === "635" && l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM)
        .isActive,
      true
    );
    console.log("ok: wrong-account unlink is zero-mutation; move requires explicit unlink");
  }

  {
    const { store, service } = svc();
    const winner = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Winner" }
    });
    const loser = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Loser" }
    });
    await store.insertExternalLink({
      organizationId: ORG,
      accountId: winner.id,
      externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
      externalId: "635",
      externalDisplayName: "Dyersville- Broihahn Custom Woodworks",
      linkedBy: ACTOR
    });
    let precheckCalls = 0;
    const origList = store.listActiveExternalLinksByExternalId.bind(store);
    store.listActiveExternalLinksByExternalId = async (...args) => {
      precheckCalls += 1;
      if (precheckCalls === 1) return [];
      return origList(...args);
    };
    const origInsert = store.insertExternalLink.bind(store);
    store.insertExternalLink = async () => ({ ok: false, code: "duplicate_external_id" });
    try {
      await assert.rejects(
        () =>
          service.linkMoraware({
            organizationId: ORG,
            role: "admin",
            actorUserId: ACTOR,
            accountId: loser.id,
            payload: { externalId: "635" }
          }),
        (e) =>
          e.code === "duplicate_external_id" &&
          e.status === 409 &&
          e.extra?.existingAccountId === winner.id
      );
    } finally {
      store.listActiveExternalLinksByExternalId = origList;
      store.insertExternalLink = origInsert;
    }
    console.log("ok: uniqueness-race path returns governed 409 with existingAccountId");
  }

  {
    const { service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Org A Co" }
    });
    await service.linkMoraware({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "635" }
    });
    const resolvedB = await service.resolveMorawareAccount({
      organizationId: ORG_B,
      role: "admin",
      sourceAccountId: "635"
    });
    assert.equal(resolvedB.linked, false);
    const other = await service.createAccount({
      organizationId: ORG_B,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Org B Co" }
    });
    await assert.rejects(
      () =>
        service.linkMoraware({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: other.id,
          payload: { externalId: "635" }
        }),
      (e) => e.status === 404
    );
    console.log("ok: Moraware organization isolation");
  }

  {
    const { service } = svc();
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Role Matrix" }
    });
    for (const role of ["admin", "executive", "super_admin"]) {
      const { service: isolated } = svc();
      const created = await isolated.createAccount({
        organizationId: ORG,
        role: "admin",
        actorUserId: ACTOR,
        payload: { displayName: `Role ${role}` }
      });
      const linked = await isolated.linkMoraware({
        organizationId: ORG,
        role,
        actorUserId: ACTOR,
        accountId: created.id,
        payload: { externalId: "635" }
      });
      const mw = linked.externalLinks.find((l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM);
      await isolated.deactivateExternalLink({
        organizationId: ORG,
        role,
        actorUserId: ACTOR,
        accountId: created.id,
        linkId: mw.id,
        expectedSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM
      });
    }
    for (const role of ["sales", "office", "estimator", "installer"]) {
      await assert.rejects(
        () =>
          service.linkMoraware({
            organizationId: ORG,
            role,
            actorUserId: ACTOR,
            accountId: a.id,
            payload: { externalId: "635" }
          }),
        (e) => e.status === 403
      );
    }
    console.log("ok: mutation role matrix");
  }

  {
    const store = createAccountDirectoryMemoryStore();
    const origAudit = store.insertAuditEvent.bind(store);
    store.insertAuditEvent = async () => null;
    const service = createAccountDirectoryService({
      store,
      loadCanonicalMorawareAccount: canonicalFor(ORG)
    });
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "Audit Fail Co" }
    });
    await assert.rejects(
      () =>
        service.linkMoraware({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: a.id,
          payload: { externalId: "635" }
        }),
      (e) => e.code === "audit_write_failed" && e.status === 500
    );
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    const mw = (detail.externalLinks || []).find((l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM);
    assert.equal(mw?.isActive, true);
    assert.equal(mw?.linkedBy, ACTOR);
    store.insertAuditEvent = origAudit;
    console.log("ok: Moraware audit failure is not presented as success");
  }

  const apiSrc = readFileSync(fileURLToPath(new URL("./accountDirectoryApi.js", import.meta.url)), "utf8");
  assert.ok(apiSrc.includes("link-moraware"));
  assert.ok(apiSrc.includes("moraware-reconciliation"));
  assert.ok(apiSrc.includes("expectedSystem"));
  assert.equal(apiSrc.includes("Confirm All"), false);
  assert.ok(apiSrc.includes("raw_payload"));
  console.log("ok: API routes present; no bulk confirm");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
