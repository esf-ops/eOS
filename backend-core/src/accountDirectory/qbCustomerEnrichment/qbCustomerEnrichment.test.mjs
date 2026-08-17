/**
 * Account Directory QB customer enrichment — unit tests (Phases 0–2).
 * Run: node backend-core/src/accountDirectory/qbCustomerEnrichment/qbCustomerEnrichment.test.mjs
 */

import assert from "node:assert/strict";
import {
  normalizeMatchKey,
  rankAccountCandidates,
  scoreDisplayNameSimilarity
} from "./nameRank.js";
import {
  applySuggestionUpsertPreservation,
  planAdQbCustomerReconciliation
} from "./reconcile.js";
import {
  computeCustomerFactHash,
  validateBeginPayload,
  validateCompletePayload,
  validateCustomerChunk
} from "./syncIngest.js";
import {
  AD_QB_ACCOUNT_LINK_LABELS,
  AD_QB_ENRICHMENT_STATUSES,
  emptyEnrichmentFeedStatus,
  getAdQbCustomerEnrichmentFeedStatus,
  indexSuggestionsByAccountId,
  listAllAdQbLinkSuggestionsForIndex,
  listAdQbLinkSuggestions,
  resolveAccountQbEnrichmentLabel
} from "./feedStatus.js";
import { constantTimeEqualString, requireAdQbCustomerSyncToken } from "./syncAuth.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createAccountDirectoryMemoryStore } from "../accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "../accountDirectoryService.mjs";
import { seedTrustedQuickBooksCustomerFact } from "../accountDirectoryQbLinkValidation.mjs";
import { attachAccountDirectoryRoutes } from "../accountDirectoryApi.js";
import { ACCOUNT_DIRECTORY_HEAD_SLUG } from "../accountDirectoryAuth.mjs";

{
  assert.equal(normalizeMatchKey("Fox & Sons, LLC"), "fox and sons llc");
  const exact = scoreDisplayNameSimilarity("Fox Cabinets", "Fox Cabinets");
  assert.equal(exact.score, 1);
  assert.equal(exact.method, "exact_norm_name");
  const ranked = rankAccountCandidates(
    { fullName: "Fox Cabinets" },
    [
      { id: "a1", displayName: "Fox Cabinets", quickbooksLinked: false },
      { id: "a2", displayName: "Other Co", quickbooksLinked: false }
    ]
  );
  assert.equal(ranked[0].accountId, "a1");
  console.log("ok: name ranking never auto-links");
}

{
  const plan = planAdQbCustomerReconciliation({
    rootFacts: [
      { qb_list_id: "L-ROOT", full_name: "Root Co", name: "Root Co", is_job: false, is_active: true },
      { qb_list_id: "L-LINKED", full_name: "Linked Co", name: "Linked Co", is_job: false, is_active: true },
      { qb_list_id: "L-JOB", full_name: "Root Co:Job", name: "Job", is_job: true, is_active: true, parent_list_id: "L-ROOT" },
      { qb_list_id: "L-CONFLICT", full_name: "Dup Name", name: "Dup Name", is_job: false, is_active: true }
    ],
    linksByListId: new Map([["L-LINKED", { accountId: "acct-linked", externalId: "L-LINKED" }]]),
    accounts: [
      { id: "acct-linked", displayName: "Linked Co", quickbooksLinked: true, linkedListId: "L-LINKED" },
      { id: "acct-open", displayName: "Root Co", quickbooksLinked: false },
      { id: "acct-other", displayName: "Dup Name", quickbooksLinked: true, linkedListId: "OTHER-LIST" }
    ]
  });
  assert.equal(plan.stats.skippedJobs, 1);
  assert.equal(plan.stats.reconciled, 1);
  assert.ok(plan.stats.open + plan.stats.needsReview + plan.stats.conflict >= 1);
  const conflict = plan.upserts.find((u) => u.qb_list_id === "L-CONFLICT");
  assert.equal(conflict.status, "conflict");
  const linked = plan.upserts.find((u) => u.qb_list_id === "L-LINKED");
  assert.equal(linked.status, "reconciled");
  const jobSuggestion = plan.upserts.find((u) => u.qb_list_id === "L-JOB");
  assert.equal(jobSuggestion, undefined);
  console.log("ok: reconcile exact/conflict/jobs-never-suggested");
}

{
  const begin = validateBeginPayload({
    organization_id: "00000000-0000-4000-8000-000000000001",
    worker_version: "1.0.0",
    company_name: "Elite Stone Fabrications"
  });
  assert.equal(begin.ok, true);
  const chunk = validateCustomerChunk({
    organization_id: "00000000-0000-4000-8000-000000000001",
    sync_run_id: "00000000-0000-4000-8000-000000000002",
    customers: [
      { qb_list_id: "R1", name: "Root", full_name: "Root", is_job: false, is_active: true },
      { qb_list_id: "J1", parent_list_id: "R1", name: "Job", full_name: "Root:Job", is_job: true }
    ]
  });
  assert.equal(chunk.ok, true);
  assert.equal(chunk.value.customers[1].parent_list_id, "R1");
  assert.equal(chunk.value.customers[0].parent_list_id, null);
  const badJob = validateCustomerChunk({
    organization_id: "00000000-0000-4000-8000-000000000001",
    sync_run_id: "00000000-0000-4000-8000-000000000002",
    customers: [{ qb_list_id: "J2", is_job: true }]
  });
  assert.equal(badJob.ok, false);
  const billingAlias = validateCustomerChunk({
    organization_id: "00000000-0000-4000-8000-000000000001",
    sync_run_id: "00000000-0000-4000-8000-000000000002",
    customers: [
      {
        qb_list_id: "R2",
        Name: "Root2",
        FullName: "Root2",
        ParentId: null,
        Sublevel: 0,
        BillingCity: "Austin",
        BillingState: "TX",
        IsActive: true
      },
      {
        qb_list_id: "J3",
        Name: "Kitchen",
        FullName: "Root2:Kitchen",
        ParentId: "R2",
        Sublevel: 1,
        BillingCity: "Austin",
        BillingState: "TX"
      }
    ]
  });
  assert.equal(billingAlias.ok, true);
  assert.equal(billingAlias.value.customers[0].is_job, false);
  assert.equal(billingAlias.value.customers[0].bill_city, "Austin");
  assert.equal(billingAlias.value.customers[1].is_job, true);
  assert.ok(computeCustomerFactHash(chunk.value.customers[0]));
  const complete = validateCompletePayload({
    organization_id: "00000000-0000-4000-8000-000000000001",
    sync_run_id: "00000000-0000-4000-8000-000000000002",
    status: "success",
    customers_count: 2,
    jobs_count: 1,
    roots_count: 1
  });
  assert.equal(complete.ok, true);
  console.log("ok: ingest payload validation");
}

{
  const preserved = applySuggestionUpsertPreservation(
    {
      qb_list_id: "L1",
      status: "open",
      qb_full_name: "Updated Name",
      rank_score: 0.92,
      resolved_at: null,
      resolution_action: null
    },
    {
      status: "dismissed",
      resolved_at: "2026-01-01T00:00:00.000Z",
      resolution_action: "dismiss"
    }
  );
  assert.equal(preserved.status, "dismissed");
  assert.equal(preserved.qb_full_name, "Updated Name");
  assert.equal(preserved.rank_score, 0.92);
  assert.equal(preserved.resolved_at, "2026-01-01T00:00:00.000Z");
  assert.equal(preserved.resolution_action, "dismiss");

  const upgrade = applySuggestionUpsertPreservation(
    {
      qb_list_id: "L2",
      status: "reconciled",
      resolution_action: "exact_list_id_match",
      resolved_at: "2026-08-11T00:00:00.000Z"
    },
    { status: "linked", resolved_at: "2026-01-02T00:00:00.000Z", resolution_action: "link" }
  );
  assert.equal(upgrade.status, "reconciled");

  const plan1 = planAdQbCustomerReconciliation({
    rootFacts: [
      {
        qb_list_id: "L-DISMISS",
        full_name: "Dismiss Co",
        name: "Dismiss Co",
        is_job: false,
        is_active: true
      },
      {
        qb_list_id: "L-LINKED-SUG",
        full_name: "Linked Sug Co",
        name: "Linked Sug Co",
        is_job: false,
        is_active: true
      },
      {
        qb_list_id: "L-OPEN",
        full_name: "Open Co",
        name: "Open Co",
        is_job: false,
        is_active: true
      }
    ],
    linksByListId: new Map(),
    accounts: [
      { id: "a-d", displayName: "Dismiss Co", quickbooksLinked: false },
      { id: "a-l", displayName: "Linked Sug Co", quickbooksLinked: false },
      { id: "a-o", displayName: "Open Co", quickbooksLinked: false }
    ],
    existingSuggestionsByListId: new Map([
      [
        "L-DISMISS",
        {
          status: "dismissed",
          resolved_at: "2026-01-01T00:00:00.000Z",
          resolution_action: "dismiss"
        }
      ],
      [
        "L-LINKED-SUG",
        {
          status: "linked",
          resolved_at: "2026-01-02T00:00:00.000Z",
          resolution_action: "link_quickbooks"
        }
      ]
    ])
  });
  const d = plan1.upserts.find((u) => u.qb_list_id === "L-DISMISS");
  const l = plan1.upserts.find((u) => u.qb_list_id === "L-LINKED-SUG");
  const o = plan1.upserts.find((u) => u.qb_list_id === "L-OPEN");
  assert.equal(d.status, "dismissed");
  assert.equal(d.resolution_action, "dismiss");
  assert.equal(l.status, "linked");
  assert.equal(l.resolution_action, "link_quickbooks");
  assert.equal(o.status, "open");
  assert.equal(plan1.stats.preservedTerminal, 2);
  assert.equal(plan1.stats.openCount, 1);

  // Idempotent second pass with refreshed names still preserves terminals
  const plan2 = planAdQbCustomerReconciliation({
    rootFacts: [
      {
        qb_list_id: "L-DISMISS",
        full_name: "Dismiss Co Renamed",
        name: "Dismiss Co Renamed",
        is_job: false,
        is_active: true
      },
      {
        qb_list_id: "L-LINKED-SUG",
        full_name: "Linked Sug Co Renamed",
        name: "Linked Sug Co Renamed",
        is_job: false,
        is_active: true
      }
    ],
    linksByListId: new Map(),
    accounts: [
      { id: "a-d", displayName: "Dismiss Co Renamed", quickbooksLinked: false },
      { id: "a-l", displayName: "Linked Sug Co Renamed", quickbooksLinked: false }
    ],
    existingSuggestionsByListId: new Map([
      [
        "L-DISMISS",
        {
          status: "dismissed",
          resolved_at: "2026-01-01T00:00:00.000Z",
          resolution_action: "dismiss"
        }
      ],
      [
        "L-LINKED-SUG",
        {
          status: "linked",
          resolved_at: "2026-01-02T00:00:00.000Z",
          resolution_action: "link_quickbooks"
        }
      ]
    ])
  });
  assert.equal(plan2.upserts.find((u) => u.qb_list_id === "L-DISMISS").status, "dismissed");
  assert.equal(plan2.upserts.find((u) => u.qb_list_id === "L-LINKED-SUG").status, "linked");
  assert.equal(
    plan2.upserts.find((u) => u.qb_list_id === "L-DISMISS").qb_full_name,
    "Dismiss Co Renamed"
  );
  assert.equal(plan2.stats.openCount, 0);
  console.log("ok: terminal suggestion preservation + idempotent sync");
}

{
  assert.equal(constantTimeEqualString("abc", "abc"), true);
  assert.equal(constantTimeEqualString("abc", "abd"), false);
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  const ok = requireAdQbCustomerSyncToken(
    { header: () => "Bearer secret-token-value-1" },
    res,
    { QB_AD_CUSTOMER_SYNC_INGEST_TOKEN: "secret-token-value-1" }
  );
  assert.equal(ok, true);
  const bad = requireAdQbCustomerSyncToken(
    { header: () => "Bearer wrong" },
    res,
    { QB_AD_CUSTOMER_SYNC_INGEST_TOKEN: "secret-token-value-1" }
  );
  assert.equal(bad, false);
  assert.equal(res.statusCode, 401);
  console.log("ok: separate AD ingest token auth");
}

{
  assert.equal(
    resolveAccountQbEnrichmentLabel({ quickbooksLinked: true }, null).label,
    AD_QB_ACCOUNT_LINK_LABELS.LINKED
  );
  assert.equal(
    resolveAccountQbEnrichmentLabel({ quickbooksLinked: false }, { status: "open", id: "s1" }).label,
    AD_QB_ACCOUNT_LINK_LABELS.SUGGESTED_MATCH
  );
  assert.equal(
    resolveAccountQbEnrichmentLabel({ quickbooksLinked: false }, { status: "needs_review", id: "s2" }).label,
    AD_QB_ACCOUNT_LINK_LABELS.NEEDS_REVIEW
  );
  assert.equal(
    resolveAccountQbEnrichmentLabel({ quickbooksLinked: false }, null).label,
    AD_QB_ACCOUNT_LINK_LABELS.NOT_LINKED
  );
  const idx = indexSuggestionsByAccountId([
    {
      id: "s1",
      status: "open",
      suggestedAccountId: "a1",
      rankScore: 0.9,
      candidateAccounts: [{ accountId: "a2", score: 0.6 }]
    }
  ]);
  assert.equal(idx.get("a1").id, "s1");
  assert.equal(idx.get("a2").id, "s1");
  console.log("ok: enrichment labels");
}

{
  const disabled = await getAdQbCustomerEnrichmentFeedStatus(null, "org", {
    AD_QB_CUSTOMER_ENRICHMENT_ENABLED: "0"
  });
  assert.equal(disabled.status, AD_QB_ENRICHMENT_STATUSES.DISABLED);
  const empty = emptyEnrichmentFeedStatus({ status: AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE, reason: "x" });
  assert.equal(empty.status, AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE);
  console.log("ok: feed status fail-soft");
}

{
  const SENTINEL = "SENTINEL_RELATION_account_directory_follow_ups";
  const boom = {
    from() {
      throw new Error(SENTINEL);
    }
  };
  const feed = await getAdQbCustomerEnrichmentFeedStatus(boom, "org", {
    AD_QB_CUSTOMER_ENRICHMENT_ENABLED: "1"
  });
  assert.equal(feed.status, AD_QB_ENRICHMENT_STATUSES.UNAVAILABLE);
  assert.equal(feed.reason, "enrichment_unavailable");
  assert.equal(JSON.stringify(feed).includes(SENTINEL), false);
  assert.equal(/account_directory_follow_ups|relation does not exist/i.test(JSON.stringify(feed)), false);

  const listed = await listAdQbLinkSuggestions(boom, "org");
  assert.equal(listed.unavailable, true);
  assert.equal(listed.error, undefined);
  assert.equal(JSON.stringify(listed).includes(SENTINEL), false);
  console.log("ok: enrichment feed/suggestion errors stay staff-safe");
}

{
  const SENTINEL_LIST = "SENTINEL-QB-LISTID-VIEW-LEAK";
  function thenable(getResult) {
    const self = {
      select() {
        return self;
      },
      eq() {
        return self;
      },
      in() {
        return self;
      },
      order() {
        return self;
      },
      limit() {
        return self;
      },
      maybeSingle() {
        return getResult().then((r) => ({
          data: Array.isArray(r.data) ? r.data[0] ?? null : r.data,
          error: r.error ?? null
        }));
      },
      then(onFulfilled, onRejected) {
        return getResult().then(onFulfilled, onRejected);
      }
    };
    return self;
  }
  const supabase = {
    from(table) {
      return thenable(async () => {
        if (table === "organizations") {
          return {
            data: [
              {
                id: "org-1",
                organization_key: "elite_stone_fabrication",
                display_name: "ESF"
              }
            ],
            error: null
          };
        }
        if (table === "user_profiles") {
          return { data: [{ organization_id: "org-1" }], error: null };
        }
        if (table === "ad_qb_link_suggestions") {
          return {
            data: [
              {
                id: "sug-1",
                qb_list_id: SENTINEL_LIST,
                qb_full_name: "Leak Co",
                qb_name: "Leak Co",
                status: "open",
                suggested_account_id: "acct-1",
                rank_score: 0.9,
                rank_method: "exact_norm_name",
                conflict_reason: null,
                candidate_accounts: [],
                updated_at: "2026-08-17T00:00:00.000Z"
              }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      });
    }
  };
  const apiSrc = readFileSync(fileURLToPath(new URL("../accountDirectoryApi.js", import.meta.url)), "utf8");
  const suggestionsBlock = apiSrc.split("qb-enrichment/suggestions")[1].split("suggestions/:suggestionId")[0];
  assert.ok(suggestionsBlock.includes("ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK"));
  assert.equal(suggestionsBlock.includes("ACCOUNT_DIRECTORY_CAPABILITIES.VIEW"), false);

  async function requestSuggestions(role) {
    const app = express();
    attachAccountDirectoryRoutes(app, {
      requireAuth: () => (req, _res, next) => {
        req.user = { id: "user-1", role };
        next();
      },
      requireHeadAccess: (slug) => {
        assert.equal(slug, ACCOUNT_DIRECTORY_HEAD_SLUG);
        return (_req, _res, next) => next();
      },
      getSupabase: () => supabase,
      store: createAccountDirectoryMemoryStore()
    });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/api/account-directory/qb-enrichment/suggestions`);
      const body = await res.json();
      return { status: res.status, body };
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  const asView = await requestSuggestions("sales");
  assert.equal(asView.status, 403);
  assert.equal(JSON.stringify(asView.body).includes(SENTINEL_LIST), false);
  assert.equal(JSON.stringify(asView.body).includes("qbListId"), false);

  const asLink = await requestSuggestions("admin");
  assert.equal(asLink.status, 200);
  assert.equal(asLink.body.ok, true);
  assert.ok((asLink.body.items || []).some((row) => row.qbListId === SENTINEL_LIST));
  console.log("ok: suggestions ListID requires EXTERNAL_LINK; VIEW cannot obtain it");
}

{
  // Paginated index loader must not silently stop at the inbox 500-row cap.
  const pageSize = 1000;
  const totalRows = 2500;
  let rangeCalls = 0;
  const fakeSupabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        async range(from, to) {
          rangeCalls += 1;
          const start = from;
          const end = Math.min(to, totalRows - 1);
          if (start >= totalRows) return { data: [], error: null };
          const data = [];
          for (let i = start; i <= end; i += 1) {
            data.push({
              id: `id-${i}`,
              qb_list_id: `L-${i}`,
              qb_full_name: `Name ${i}`,
              qb_name: `Name ${i}`,
              status: i % 50 === 0 ? "needs_review" : "open",
              suggested_account_id: `acct-${i}`,
              rank_score: 0.8,
              rank_method: "exact_norm_name",
              conflict_reason: null,
              candidate_accounts: [{ accountId: `acct-${i}`, score: 0.8 }],
              updated_at: "2026-08-11T00:00:00.000Z"
            });
          }
          return { data, error: null };
        }
      };
    }
  };
  const listed = await listAllAdQbLinkSuggestionsForIndex(fakeSupabase, "org", {
    pageSize,
    maxRows: 100000
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.items.length, totalRows);
  assert.ok(rangeCalls >= 3, "must page beyond a single 500/1000 window");
  const idx = indexSuggestionsByAccountId(listed.items);
  assert.equal(idx.size, totalRows);
  console.log("ok: suggestion index loads beyond 500-row inbox cap");
}

// Sync/reconcile cannot modify AD identity; links only via explicit linkQuickBooks
{
  const store = createAccountDirectoryMemoryStore();
  const org = "00000000-0000-4000-8000-000000000099";
  const service = createAccountDirectoryService({ store, getSupabase: null });
  const created = await service.createAccount({
    organizationId: org,
    role: "admin",
    actorUserId: "u1",
    payload: { displayName: "Identity Lock Co", status: "active" }
  });
  const beforeName = created.displayName;
  const beforeLinks = (created.externalLinks || []).length;

  const plan = planAdQbCustomerReconciliation({
    rootFacts: [
      {
        qb_list_id: "NEW-LIST",
        full_name: "Identity Lock Co",
        name: "Identity Lock Co",
        is_job: false,
        is_active: true
      },
      {
        qb_list_id: "JOB-1",
        full_name: "Identity Lock Co:Kitchen",
        name: "Kitchen",
        is_job: true,
        is_active: true,
        parent_list_id: "NEW-LIST"
      }
    ],
    linksByListId: new Map(),
    accounts: [{ id: created.id, displayName: "Identity Lock Co", quickbooksLinked: false }]
  });
  assert.ok(plan.upserts.some((u) => u.qb_list_id === "NEW-LIST"));
  assert.ok(!plan.upserts.some((u) => u.qb_list_id === "JOB-1"));

  const after = await service.getAccount({ organizationId: org, role: "admin", accountId: created.id });
  assert.equal(after.displayName, beforeName);
  assert.equal((after.externalLinks || []).filter((l) => l.isActive !== false).length, beforeLinks);

  // Explicit confirmation still works and blocks duplicates
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: org,
    qbListId: "NEW-LIST",
    name: "Identity Lock Co",
    isJob: false
  });
  const linked = await service.linkQuickBooks({
    organizationId: org,
    role: "admin",
    actorUserId: "u1",
    accountId: created.id,
    payload: { externalId: "NEW-LIST", externalDisplayName: "Identity Lock Co" }
  });
  assert.equal(linked.quickbooksLinked, true);

  const other = await service.createAccount({
    organizationId: org,
    role: "admin",
    actorUserId: "u1",
    payload: { displayName: "Other", status: "active" }
  });
  let blocked = null;
  try {
    await service.linkQuickBooks({
      organizationId: org,
      role: "admin",
      actorUserId: "u1",
      accountId: other.id,
      payload: { externalId: "NEW-LIST" }
    });
  } catch (e) {
    blocked = e;
  }
  assert.equal(blocked?.code, "duplicate_external_id");
  console.log("ok: identity immutable + no auto-link + duplicate ListID blocked + jobs not linked");
}

console.log("qbCustomerEnrichment.test.mjs — all passed");
