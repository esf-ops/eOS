/**
 * Governed Moraware external links + review queue (no live Supabase writes).
 */
import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";
import {
  accumulateMorawareJobStats,
  buildDirectoryNameIndex,
  buildQbDisplayNameIndex,
  deriveMorawareJobStatsFromJobs,
  finalizeMorawareJobStatsMap,
  rankMorawareDirectoryCandidates,
  resolveMorawareJobStats
} from "./accountDirectoryMorawareMatching.mjs";
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
const CURRENT_POP = {
  available: true,
  census_scope: "full",
  complete: true,
  uncapped: true,
  full_census_import_group_id: "census-epoch",
  full_census_started_at: "2026-08-15T00:00:00.000Z"
};

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
    jobStatsByMorawareId: new Map(),
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
    const ops = buildTrustedMorawareOperations({
      links,
      jobs,
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(ops.jobs_state, "available");
    assert.equal(ops.job_count_2026, 2);
    assert.equal(ops.sqft_state, "available");
    assert.equal(ops.sqft_2026, 0);
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
    assert.equal(failed.sqft_state, "unavailable");
    assert.equal(failed.sqft_2026, null);
    assert.equal(JSON.stringify(failed).includes('"job_count_2026":0'), false);
    assert.equal(JSON.stringify(failed).includes('"sqft_2026":0'), false);
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
    const ops = buildTrustedMorawareOperations({
      links,
      jobs,
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
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
        last_seen_at: "2026-08-15"
      }
    ];
    const ops = buildTrustedMorawareOperations({
      links,
      jobs,
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(ops.job_count_2026, 3);
    assert.equal(ops.accounts.find((a) => a.source_account_id === "635").job_count, 2);
    assert.equal(ops.accounts.find((a) => a.source_account_id === "553").job_count, 1);
    console.log("ok: multi-Moraware IDs keep jobs across different last_seen_at dates");
  }

  {
    const links = [
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "553",
        externalDisplayName: "Broihahn A"
      },
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "635",
        externalDisplayName: "Broihahn B"
      }
    ];
    const jobs = [
      {
        source_job_id: "stale-pre-census",
        source_account_id: "553",
        job_name: "Stale leftover",
        created_at_source: "2026-04-01",
        last_seen_at: "2026-05-18T16:08:47.722Z"
      },
      {
        source_job_id: "full-untouched",
        source_account_id: "553",
        job_name: "Census member",
        created_at_source: "2026-02-01",
        last_seen_at: "2026-08-15T12:00:00.000Z"
      },
      {
        source_job_id: "incremental-updated",
        source_account_id: "635",
        job_name: "Updated after census",
        created_at_source: "2026-03-01",
        last_seen_at: "2026-08-16T09:00:00.000Z"
      },
      {
        source_job_id: "incremental-new",
        source_account_id: "635",
        job_name: "New after census",
        created_at_source: "2026-08-16",
        last_seen_at: "2026-08-16T10:00:00.000Z"
      }
    ];
    const ops = buildTrustedMorawareOperations({
      links,
      jobs,
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(ops.job_count_2026, 3);
    assert.equal(
      ops.recent_jobs.some((j) => j.source_job_id === "stale-pre-census"),
      false
    );
    assert.ok(ops.recent_jobs.some((j) => j.source_job_id === "full-untouched"));
    assert.ok(ops.recent_jobs.some((j) => j.source_job_id === "incremental-updated"));
    assert.ok(ops.recent_jobs.some((j) => j.source_job_id === "incremental-new"));
    assert.equal(ops.accounts.find((a) => a.source_account_id === "553").job_count, 1);
    assert.equal(ops.accounts.find((a) => a.source_account_id === "635").job_count, 2);
    console.log("ok: CURRENT_MORAWARE_JOB_SET excludes stale, keeps census+incremental overlay, unions IDs");
  }

  {
    function wsJob(id, accountId, sqft, lastSeen, date = "2026-03-15") {
      return {
        source_job_id: id,
        source_account_id: accountId,
        job_name: `Job ${id}`,
        status_name: "complete",
        created_at_source: date,
        last_seen_at: lastSeen,
        raw_payload: {
          forms: [
            {
              formTemplateName: "Job Worksheet",
              fields: [{ label: "Sq.Ft.", numericValue: sqft }]
            },
            {
              formTemplateName: "Accounting Form",
              fields: [{ label: "Sq.Ft.", numericValue: 9999 }]
            }
          ]
        }
      };
    }
    const links553 = [
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "553",
        externalDisplayName: "Broihahn A"
      }
    ];
    const linksBoth = [
      ...links553,
      {
        isActive: true,
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        externalId: "635",
        externalDisplayName: "Broihahn B"
      }
    ];
    const exact553 = [120, 100, 110, 90, 123];
    const exact635 = [100, 80, 90, 95, 85, 110, 90.5, 90];
    assert.equal(exact553.reduce((a, b) => a + b, 0), 543);
    assert.equal(exact635.reduce((a, b) => a + b, 0), 740.5);

    const one = buildTrustedMorawareOperations({
      links: links553,
      jobs: exact553.map((sqft, i) => wsJob(`553-${i + 1}`, "553", sqft, "2026-08-15T12:00:00.000Z")),
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(one.job_count_2026, 5);
    assert.equal(one.sqft_2026, 543);
    console.log("ok: one Moraware ID SqFt aggregates correctly");

    const broihahn = buildTrustedMorawareOperations({
      links: linksBoth,
      jobs: [
        ...exact553.map((sqft, i) => wsJob(`553-${i + 1}`, "553", sqft, "2026-08-15T12:00:00.000Z")),
        ...exact635.map((sqft, i) => wsJob(`635-${i + 1}`, "635", sqft, "2026-08-15T12:00:00.000Z")),
        wsJob("stale", "553", 917.5, "2026-05-18T16:00:00.000Z"),
        wsJob("unrelated", "999", 5000, "2026-08-15T12:00:00.000Z"),
        wsJob("prior-year", "635", 400, "2026-08-15T12:00:00.000Z", "2025-11-01")
      ],
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(broihahn.job_count_2026, 13);
    assert.equal(broihahn.sqft_state, "available");
    assert.equal(broihahn.sqft_2026, 1283.5);
    assert.equal(JSON.stringify(broihahn).includes("raw_payload"), false);
    assert.equal(JSON.stringify(broihahn).includes("9999"), false);
    console.log("ok: Broihahn fixture returns 13 jobs / 1,283.5 SqFt; multi-ID sum; stale/unrelated/prior-year excluded");

    const deduped = buildTrustedMorawareOperations({
      links: links553,
      jobs: [
        wsJob("same", "553", 999, "2026-08-15T08:00:00.000Z"),
        wsJob("same", "553", 150, "2026-08-16T08:00:00.000Z")
      ],
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(deduped.job_count_2026, 1);
    assert.equal(deduped.sqft_2026, 150);
    console.log("ok: same source_job_id cannot double-count SqFt");

    const incremental = buildTrustedMorawareOperations({
      links: linksBoth,
      jobs: [
        wsJob("census", "553", 200, "2026-08-15T12:00:00.000Z"),
        wsJob("updated", "635", 300, "2026-08-16T09:00:00.000Z"),
        wsJob("new", "635", 40.5, "2026-08-16T10:00:00.000Z"),
        wsJob("stale-left", "553", 917.5, "2026-06-01T00:00:00.000Z")
      ],
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(incremental.job_count_2026, 3);
    assert.equal(incremental.sqft_2026, 540.5);
    console.log("ok: incremental-updated/current jobs remain included; stale pre-watermark excluded");

    const zero = buildTrustedMorawareOperations({
      links: links553,
      jobs: [
        {
          source_job_id: "no-ws",
          source_account_id: "553",
          created_at_source: "2026-04-01",
          last_seen_at: "2026-08-15T12:00:00.000Z",
          raw_payload: {
            forms: [{ formTemplateName: "Accounting Form", fields: [{ label: "Sq.Ft.", numericValue: 50 }] }]
          }
        }
      ],
      jobsState: "available",
      currentPopulation: CURRENT_POP
    });
    assert.equal(zero.jobs_state, "available");
    assert.equal(zero.job_count_2026, 1);
    assert.equal(zero.sqft_state, "available");
    assert.equal(zero.sqft_2026, 0);
    console.log("ok: genuine zero SqFt remains available/0");

    const noPop = buildTrustedMorawareOperations({
      links: links553,
      jobs: exact553.map((sqft, i) => wsJob(`x-${i}`, "553", sqft, "2026-08-15T12:00:00.000Z")),
      jobsState: "unavailable",
      currentPopulation: null
    });
    assert.equal(noPop.sqft_state, "unavailable");
    assert.equal(noPop.sqft_2026, null);
    console.log("ok: unavailable current population returns null/unavailable, not zero");
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

  // ── Phase 0A-1: matcher CPU short-circuit (deterministic before fuzzy) ──
  {
    function fuzzyCounter() {
      let visits = 0;
      return {
        get visits() {
          return visits;
        },
        onFuzzyCandidateVisit() {
          visits += 1;
        }
      };
    }

    const directoryAccounts = [
      { id: "ad-exact-a", displayName: "Acme Cabinets LLC", legalName: null },
      { id: "ad-exact-b", displayName: "Acme Cabinets LLC", legalName: null },
      { id: "ad-unique", displayName: "Stoddard & Jensen Real Estate", legalName: null },
      { id: "ad-near", displayName: "Stoddard & Jensen Real Estates", legalName: null },
      { id: "ad-qb-only", displayName: "Directory Label Differs", legalName: null },
      { id: "ad-fuzzy", displayName: "Heartland Designs", legalName: null },
      { id: "ad-other", displayName: "Unrelated Millwork", legalName: null }
    ];
    const nameIndex = buildDirectoryNameIndex(directoryAccounts);
    const qbLinksByAccountId = new Map([
      ["ad-unique", { listId: "QB-U", displayName: "Stoddard & Jensen Real Estate" }],
      ["ad-qb-only", { listId: "QB-O", displayName: "Premier Stoneworks Inc" }],
      ["ad-fuzzy", { listId: "QB-F", displayName: "Heartland Designs" }]
    ]);
    const qbNameIndex = buildQbDisplayNameIndex(qbLinksByAccountId);
    const jobsTwo = [{ createdAtSource: "2026-01-01" }, { createdAtSource: "2026-03-01" }];

    // 1) Multi-exact CONFLICT — fuzzy previously discarded → zero fuzzy visits
    {
      const c = fuzzyCounter();
      const ranked = rankMorawareDirectoryCandidates({
        morawareAccount: { sourceAccountId: "9001", accountName: "Acme Cabinets LLC" },
        jobs: jobsTwo,
        directoryAccounts,
        qbLinksByAccountId,
        nameIndex,
        qbNameIndex,
        onFuzzyCandidateVisit: c.onFuzzyCandidateVisit
      });
      assert.equal(ranked.classification, "CONFLICT");
      assert.equal(ranked.reason, "multiple_exact_directory_names");
      assert.equal(ranked.proposedAccountId, null);
      assert.equal(ranked.confidenceScore, 45);
      assert.deepEqual(ranked.evidence, ["exact_name"]);
      assert.deepEqual(ranked.contradictions, ["two_or_more_directory_accounts_share_normalized_name"]);
      assert.equal(ranked.alternatives.length, 2);
      assert.equal(c.visits, 0);
      console.log("ok: Phase0A-1 multi-exact conflict skips fuzzy scan");
    }

    // 2) Unique QB-name — fuzzy previously discarded → zero fuzzy visits; output stable
    {
      const c = fuzzyCounter();
      const ranked = rankMorawareDirectoryCandidates({
        morawareAccount: { sourceAccountId: "9002", accountName: "Premier Stoneworks Inc" },
        jobs: jobsTwo,
        directoryAccounts,
        qbLinksByAccountId,
        nameIndex,
        qbNameIndex,
        onFuzzyCandidateVisit: c.onFuzzyCandidateVisit
      });
      assert.equal(ranked.classification, "HIGH_CONFIDENCE_CANDIDATE");
      assert.equal(ranked.reason, "unique_exact_quickbooks_customer_name");
      assert.equal(ranked.proposedAccountId, "ad-qb-only");
      assert.equal(ranked.proposedAccountName, "Directory Label Differs");
      assert.equal(ranked.confidenceScore, 70);
      assert.deepEqual(ranked.evidence, ["exact_qb_name", "quickbooks_linked"]);
      assert.deepEqual(ranked.contradictions, ["directory_display_name_differs_from_qb"]);
      assert.deepEqual(ranked.alternatives, []);
      assert.equal(ranked.qbLinked, true);
      assert.equal(c.visits, 0);
      console.log("ok: Phase0A-1 unique QB-name match skips fuzzy scan");
    }

    // 3) Unique exact — output unchanged; fuzzy still runs for alternatives
    {
      const c = fuzzyCounter();
      const ranked = rankMorawareDirectoryCandidates({
        morawareAccount: { sourceAccountId: "663", accountName: "Stoddard & Jensen Real Estate" },
        jobs: jobsTwo,
        directoryAccounts,
        qbLinksByAccountId,
        nameIndex,
        qbNameIndex,
        onFuzzyCandidateVisit: c.onFuzzyCandidateVisit
      });
      assert.equal(ranked.classification, "HIGH_CONFIDENCE_CANDIDATE");
      assert.equal(ranked.proposedAccountId, "ad-unique");
      assert.equal(ranked.confidenceScore, 85);
      assert.ok(ranked.evidence.includes("exact_name"));
      assert.ok(ranked.evidence.includes("quickbooks_linked"));
      assert.ok(ranked.alternatives.some((a) => a.accountId === "ad-near" && a.evidence.includes("fuzzy_name")));
      assert.ok(c.visits > 0);
      assert.equal(c.visits, directoryAccounts.length);
      console.log("ok: Phase0A-1 unique exact preserves fuzzy alternatives");
    }

    // 4) Fuzzy-only fallback still executes
    {
      const c = fuzzyCounter();
      const ranked = rankMorawareDirectoryCandidates({
        morawareAccount: { sourceAccountId: "37", accountName: "Heartland Design" },
        jobs: [{ createdAtSource: "2026-02-01" }],
        directoryAccounts,
        qbLinksByAccountId,
        nameIndex,
        qbNameIndex,
        onFuzzyCandidateVisit: c.onFuzzyCandidateVisit
      });
      assert.equal(ranked.classification, "UNMATCHED");
      assert.equal(ranked.proposedAccountId, null);
      assert.equal(ranked.reason, "fuzzy_name_only_not_identity");
      assert.ok(ranked.alternatives.some((a) => a.evidence.includes("fuzzy_name")));
      assert.equal(c.visits, directoryAccounts.length);
      console.log("ok: Phase0A-1 fuzzy-only path still scans");
    }

    // 5) Linked conflict overlay (active_link_differs_from_name_candidate)
    {
      const linkedAd = "ad-linked";
      const nameAd = "ad-unique";
      const queue = await listMorawareReconciliationQueue({
        organizationId: ORG,
        role: "admin",
        store: createAccountDirectoryMemoryStore(),
        dataset: {
          morawareAccounts: [{ sourceAccountId: "663", accountName: "Stoddard & Jensen Real Estate" }],
          jobsByMorawareId: new Map([["663", jobsTwo]]),
          directoryAccounts: [
            { id: linkedAd, displayName: "Wrong Linked Account", legalName: null },
            { id: nameAd, displayName: "Stoddard & Jensen Real Estate", legalName: null }
          ],
          qbLinksByAccountId: new Map([
            [nameAd, { listId: "QB-U", displayName: "Stoddard & Jensen Real Estate" }]
          ]),
          morawareLinksBySourceId: new Map([
            [
              "663",
              {
                id: "link-663",
                accountId: linkedAd,
                externalId: "663",
                externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
                isActive: true
              }
            ]
          ]),
          morawareLinksByAccountId: new Map([
            [
              linkedAd,
              [
                {
                  id: "link-663",
                  accountId: linkedAd,
                  externalId: "663",
                  externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
                  isActive: true
                }
              ]
            ]
          ])
        }
      });
      assert.equal(queue.items.length, 1);
      assert.equal(queue.items[0].classification, "CONFLICT");
      assert.equal(queue.items[0].reason, "active_link_differs_from_name_candidate");
      assert.ok(queue.items[0].contradictions.includes("linked_account_differs_from_proposed"));
      assert.equal(queue.items[0].confirmAllowed, false);
      assert.equal(queue.items[0].currentLink.linked, true);
      assert.equal(queue.items[0].currentLink.accountId, linkedAd);
      console.log("ok: Phase0A-1 linked conflict overlay unchanged");
    }

    // 6) One AD with multiple Moraware siblings
    {
      const adId = "ad-bro";
      const link635 = {
        id: "l635",
        accountId: adId,
        externalId: "635",
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        isActive: true
      };
      const link553 = {
        id: "l553",
        accountId: adId,
        externalId: "553",
        externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
        isActive: true
      };
      const queue = await listMorawareReconciliationQueue({
        organizationId: ORG,
        role: "admin",
        store: createAccountDirectoryMemoryStore(),
        dataset: {
          morawareAccounts: [
            { sourceAccountId: "635", accountName: "Dyersville- Broihahn Custom Woodworks" },
            { sourceAccountId: "553", accountName: "Dyersville - Broihahn Custom Woodworks" }
          ],
          jobsByMorawareId: new Map([
            ["635", jobsTwo],
            ["553", jobsTwo]
          ]),
          directoryAccounts: [{ id: adId, displayName: "Broihahn Custom Woodworks", legalName: null }],
          qbLinksByAccountId: new Map(),
          morawareLinksBySourceId: new Map([
            ["635", link635],
            ["553", link553]
          ]),
          morawareLinksByAccountId: new Map([[adId, [link635, link553]]])
        }
      });
      assert.equal(queue.items.length, 2);
      for (const row of queue.items) {
        assert.equal(row.currentLink.linked, true);
        assert.equal(row.currentLink.accountId, adId);
        assert.ok(row.siblingMorawareIds.length >= 1);
        assert.equal(row.multipleMorawareIdsExpected, true);
        assert.equal(row.confirmAllowed, false);
      }
      const siblings635 = queue.items.find((r) => r.morawareAccountId === "635").siblingMorawareIds;
      const siblings553 = queue.items.find((r) => r.morawareAccountId === "553").siblingMorawareIds;
      assert.ok(siblings635.includes("553"));
      assert.ok(siblings553.includes("635"));
      console.log("ok: Phase0A-1 multi-Moraware siblings unchanged");
    }

    // 7) Queue regression: order, classification, pagination, summary
    // pageSize is clamped to min 10 in listMorawareReconciliationQueue.
    {
      const morawareAccounts = [
        { sourceAccountId: "1", accountName: "Alpha Co" },
        { sourceAccountId: "2", accountName: "Beta Co" },
        { sourceAccountId: "3", accountName: "Direct" },
        { sourceAccountId: "4", accountName: "Gamma Designs" },
        { sourceAccountId: "5", accountName: "Heartland Design" },
        { sourceAccountId: "6", accountName: "Zeta Millwork" },
        { sourceAccountId: "7", accountName: "Eta Surfaces" },
        { sourceAccountId: "8", accountName: "Theta Stone" },
        { sourceAccountId: "9", accountName: "Iota Granite" },
        { sourceAccountId: "10", accountName: "Kappa Quartz" },
        { sourceAccountId: "11", accountName: "Lambda Tile" },
        { sourceAccountId: "12", accountName: "Mu Cabinets" }
      ];
      const directoryAccountsQ = [
        { id: "ad-a", displayName: "Alpha Co", legalName: null },
        { id: "ad-g", displayName: "Gamma Designs", legalName: null },
        { id: "ad-h", displayName: "Heartland Designs", legalName: null }
      ];
      const jobsByMorawareId = new Map(
        morawareAccounts.map((m) => [
          m.sourceAccountId,
          m.sourceAccountId === "4" || m.sourceAccountId === "5"
            ? [{ createdAtSource: "2026-02-01" }]
            : jobsTwo
        ])
      );
      const dataset = {
        morawareAccounts,
        jobsByMorawareId,
        directoryAccounts: directoryAccountsQ,
        qbLinksByAccountId: new Map([["ad-a", { listId: "QA", displayName: "Alpha Co" }]]),
        morawareLinksBySourceId: new Map(),
        morawareLinksByAccountId: new Map()
      };
      const page1 = await listMorawareReconciliationQueue({
        organizationId: ORG,
        role: "admin",
        store: createAccountDirectoryMemoryStore(),
        query: { page: 1, pageSize: 10 },
        dataset
      });
      const page2 = await listMorawareReconciliationQueue({
        organizationId: ORG,
        role: "admin",
        store: createAccountDirectoryMemoryStore(),
        query: { page: 2, pageSize: 10 },
        dataset
      });
      const full = await listMorawareReconciliationQueue({
        organizationId: ORG,
        role: "admin",
        store: createAccountDirectoryMemoryStore(),
        query: { page: 1, pageSize: 50 },
        dataset
      });
      const fullIds = full.items.map((r) => r.morawareAccountId);
      assert.deepEqual(
        fullIds,
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
      );
      assert.equal(full.items[0].classification, "HIGH_CONFIDENCE_CANDIDATE");
      assert.equal(full.items[1].classification, "UNMATCHED");
      assert.equal(full.items[2].classification, "UNMATCHED");
      assert.equal(full.items[2].internalBucket, true);
      assert.equal(full.items[3].classification, "REVIEW_REQUIRED");
      assert.equal(full.items[4].classification, "UNMATCHED");
      assert.equal(full.items[4].reason, "fuzzy_name_only_not_identity");
      assert.equal(full.summary.totalMorawareAccounts, 12);
      assert.equal(full.summary.highConfidenceUnlinked, 1);
      assert.equal(full.summary.reviewRequired, 1);
      assert.equal(full.summary.internalBuckets, 1);
      assert.equal(full.summary.alreadyLinked, 0);
      assert.deepEqual(
        page1.items.map((r) => r.morawareAccountId),
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
      );
      assert.deepEqual(
        page2.items.map((r) => r.morawareAccountId),
        ["11", "12"]
      );
      assert.equal(page1.summary.totalMorawareAccounts, 12);
      assert.equal(page2.summary.unmatched, full.summary.unmatched);
      assert.deepEqual(
        page1.items.map((r) => r.classification),
        full.items.slice(0, 10).map((r) => r.classification)
      );
      console.log("ok: Phase0A-1 queue order/classification/pagination/summary regression");
    }
  }

  // ── Phase 0A-2: compact jobStats ≡ legacy jobs arrays ──
  {
    const jobs = [
      { createdAtSource: "2026-01-10", installAtSource: null, completedAtSource: null },
      { createdAtSource: "2025-12-01", installAtSource: null, completedAtSource: null },
      { createdAtSource: null, installAtSource: "2026-06-15", completedAtSource: null },
      { createdAtSource: null, installAtSource: null, completedAtSource: "2024-01-01" }
    ];
    const fromJobs = deriveMorawareJobStatsFromJobs(jobs);
    const fromStats = resolveMorawareJobStats({ jobStats: fromJobs });
    assert.deepEqual(fromStats, fromJobs);
    const rankedJobs = rankMorawareDirectoryCandidates({
      morawareAccount: { sourceAccountId: "77", accountName: "No Match Co" },
      jobs,
      directoryAccounts: [{ id: "ad-x", displayName: "Other Name", legalName: null }],
      qbLinksByAccountId: new Map()
    });
    const rankedStats = rankMorawareDirectoryCandidates({
      morawareAccount: { sourceAccountId: "77", accountName: "No Match Co" },
      jobStats: fromJobs,
      directoryAccounts: [{ id: "ad-x", displayName: "Other Name", legalName: null }],
      qbLinksByAccountId: new Map()
    });
    assert.equal(rankedJobs.jobCount, rankedStats.jobCount);
    assert.equal(rankedJobs.jobs2026, rankedStats.jobs2026);
    assert.equal(rankedJobs.earliestJobDate, rankedStats.earliestJobDate);
    assert.equal(rankedJobs.latestJobDate, rankedStats.latestJobDate);
    assert.equal(rankedJobs.classification, rankedStats.classification);
    assert.equal(rankedJobs.reason, rankedStats.reason);
    assert.equal(rankedJobs.reason, "no_deterministic_directory_match");
    assert.equal(rankedJobs.jobCount, 4);
    assert.equal(rankedJobs.jobs2026, 2);
    assert.equal(rankedJobs.earliestJobDate, "2024-01-01");
    assert.equal(rankedJobs.latestJobDate, "2026-06-15");

    const volumeJobs = rankMorawareDirectoryCandidates({
      morawareAccount: { sourceAccountId: "78", accountName: "Tiny Volume Co" },
      jobs: [{ createdAtSource: "2026-02-01" }],
      directoryAccounts: [],
      qbLinksByAccountId: new Map()
    });
    const volumeStats = rankMorawareDirectoryCandidates({
      morawareAccount: { sourceAccountId: "78", accountName: "Tiny Volume Co" },
      jobStats: deriveMorawareJobStatsFromJobs([{ createdAtSource: "2026-02-01" }]),
      directoryAccounts: [],
      qbLinksByAccountId: new Map()
    });
    assert.equal(volumeJobs.reason, "insufficient_or_retail_volume");
    assert.equal(volumeStats.reason, "insufficient_or_retail_volume");
    assert.equal(volumeJobs.jobCount, volumeStats.jobCount);

    const zeroJobs = rankMorawareDirectoryCandidates({
      morawareAccount: { sourceAccountId: "79", accountName: "Zero Jobs Co" },
      jobs: [],
      directoryAccounts: [],
      qbLinksByAccountId: new Map()
    });
    const zeroStats = rankMorawareDirectoryCandidates({
      morawareAccount: { sourceAccountId: "79", accountName: "Zero Jobs Co" },
      jobStats: deriveMorawareJobStatsFromJobs([]),
      directoryAccounts: [],
      qbLinksByAccountId: new Map()
    });
    assert.equal(zeroJobs.jobCount, 0);
    assert.equal(zeroStats.jobCount, 0);
    assert.equal(zeroJobs.jobs2026, 0);
    assert.equal(zeroJobs.earliestJobDate, null);
    assert.equal(zeroStats.earliestJobDate, null);
    assert.equal(zeroJobs.reason, zeroStats.reason);

    // accumulate path matches array derivation (canonical-day semantics exercised in filter before accumulate)
    const acc = new Map();
    for (const j of [
      {
        source_account_id: "635",
        created_at_source: "2026-03-01",
        install_at_source: null,
        completed_at_source: null,
        last_seen_at: "2026-08-15"
      },
      {
        source_account_id: "635",
        created_at_source: "2026-04-01",
        install_at_source: null,
        completed_at_source: null,
        last_seen_at: "2026-08-15"
      },
      {
        source_account_id: "635",
        created_at_source: "2026-01-01",
        install_at_source: null,
        completed_at_source: null,
        last_seen_at: "2026-08-14"
      },
      {
        source_account_id: "999",
        created_at_source: "2026-05-01",
        install_at_source: null,
        completed_at_source: null,
        last_seen_at: "2026-08-15"
      }
    ]) {
      const id = String(j.source_account_id);
      const accountSet = new Set(["635"]);
      const canonicalDay = "2026-08-15";
      if (!accountSet.has(id)) continue;
      if (String(j.last_seen_at || "").slice(0, 10) !== canonicalDay) continue;
      accumulateMorawareJobStats(acc, id, j);
    }
    const finalized = finalizeMorawareJobStatsMap(acc);
    const expected = deriveMorawareJobStatsFromJobs([
      { createdAtSource: "2026-03-01" },
      { createdAtSource: "2026-04-01" }
    ]);
    assert.deepEqual(finalized.get("635"), expected);
    assert.equal(finalized.has("999"), false);
    console.log("ok: Phase0A-2 jobStats ≡ jobs; stale/wrong-account excluded; volume/zero unchanged");
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
