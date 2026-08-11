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
import { planAdQbCustomerReconciliation } from "./reconcile.js";
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
  resolveAccountQbEnrichmentLabel
} from "./feedStatus.js";
import { constantTimeEqualString, requireAdQbCustomerSyncToken } from "./syncAuth.js";
import { createAccountDirectoryMemoryStore } from "../accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "../accountDirectoryService.mjs";

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
