/**
 * QB-first Moraware spine adaptation tests.
 * Run: node backend-core/src/accountDirectory/accountDirectoryMorawareQbSpine.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";
import { buildMorawareEvidenceIndexes } from "./accountDirectoryMorawareCandidateDiscovery.mjs";
import {
  SPINE_REVIEW_STATES,
  buildQbRootFactIndexes,
  discoverMorawareSpineCandidates
} from "./accountDirectoryMorawareQbSpine.mjs";
import { seedTrustedQuickBooksCustomerFact } from "./accountDirectoryQbLinkValidation.mjs";
import { ACCOUNT_DIRECTORY_MORAWARE_SYSTEM } from "./accountDirectoryMorawareLinkage.mjs";

const ORG = "00000000-0000-4000-8000-0000000000e1";
const ACTOR = "00000000-0000-4000-8000-0000000000e9";
const here = dirname(fileURLToPath(import.meta.url));

console.log("\naccountDirectoryMorawareQbSpine.test.mjs\n");

{
  const qbRootFacts = [
    { qb_list_id: "QB-ROOT", full_name: "319 Decor Design", is_job: false, is_active: true },
    { qb_list_id: "QB-JOB", full_name: "319 Decor Design:Kitchen", is_job: true, is_active: true }
  ];
  const indexes = buildQbRootFactIndexes(qbRootFacts, new Map());
  assert.ok(indexes.byListId.has("QB-ROOT"));
  assert.equal(indexes.byListId.has("QB-JOB"), false, "jobs excluded from root index");
  console.log("ok: 3) QB root Job/subcustomer excluded");
}

{
  const directoryAccounts = [
    { id: "ad-qb", displayName: "319 Decor Design", legalName: null, status: "active" }
  ];
  const qbLinksByAccountId = new Map([
    ["ad-qb", { listId: "QB-ROOT", displayName: "319 Decor Design" }]
  ]);
  const evidence = buildMorawareEvidenceIndexes({ directoryAccounts, qbLinksByAccountId });
  for (const a of directoryAccounts) evidence.byId.get(a.id).status = a.status;
  const qbRootIndexes = buildQbRootFactIndexes(
    [{ qb_list_id: "QB-ROOT", full_name: "319 Decor Design", is_job: false, is_active: true }],
    qbLinksByAccountId
  );
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "900", accountName: "319 Decor Design LLC" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.equal(spine.reviewState, SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED);
  assert.equal(spine.proposedAccountId, "ad-qb");
  assert.equal(spine.candidates[0].confirmMorawareAllowed, true);
  assert.equal(spine.candidates[0].createFromQuickBooksAllowed, false);
  console.log("ok: 1) Moraware → existing exact QB-backed AD");
}

{
  const directoryAccounts = [];
  const evidence = buildMorawareEvidenceIndexes({ directoryAccounts, qbLinksByAccountId: new Map() });
  const qbRootIndexes = buildQbRootFactIndexes(
    [{ qb_list_id: "QB-NEW", full_name: "Sunrise Quartz Partners", is_job: false, is_active: true }],
    new Map()
  );
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "901", accountName: "Sunrise Quartz Partners LLC" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.equal(spine.reviewState, SPINE_REVIEW_STATES.QB_ROOT_NOT_IN_DIRECTORY);
  assert.equal(spine.candidates[0].qbListId, "QB-NEW");
  assert.equal(spine.candidates[0].createFromQuickBooksAllowed, true);
  assert.equal(spine.candidates[0].confirmMorawareAllowed, false);
  console.log("ok: 2) Moraware → trusted QB root not represented in AD");
}

{
  const directoryAccounts = [
    { id: "ad-exist", displayName: "Premier Stoneworks", legalName: null, status: "active" }
  ];
  const evidence = buildMorawareEvidenceIndexes({
    directoryAccounts,
    qbLinksByAccountId: new Map()
  });
  for (const a of directoryAccounts) evidence.byId.get(a.id).status = a.status;
  const qbRootIndexes = buildQbRootFactIndexes(
    [{ qb_list_id: "QB-PS", full_name: "Premier Stoneworks", is_job: false, is_active: true }],
    new Map()
  );
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "902", accountName: "Premier Stoneworks Inc" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.equal(spine.reviewState, SPINE_REVIEW_STATES.EXISTING_AD_QB_LINK_CANDIDATE);
  assert.equal(spine.proposedAccountId, "ad-exist");
  assert.equal(spine.candidates[0].confirmQbLinkAllowed, true);
  assert.equal(spine.candidates[0].createFromQuickBooksAllowed, false);
  console.log("ok: 4) existing AD preferred over creating duplicate");
}

{
  const directoryAccounts = [
    { id: "ad-p", displayName: "Future Kitchen Co", legalName: null, status: "prospect" }
  ];
  const evidence = buildMorawareEvidenceIndexes({
    directoryAccounts,
    qbLinksByAccountId: new Map()
  });
  for (const a of directoryAccounts) evidence.byId.get(a.id).status = a.status;
  const qbRootIndexes = buildQbRootFactIndexes([], new Map());
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "903", accountName: "Future Kitchen Co" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.equal(spine.reviewState, SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT);
  assert.equal(spine.candidates[0].identityKind, "EXISTING_AD_PROSPECT");
  console.log("ok: 5) Prospect candidate remains clearly Prospect");
}

{
  const evidence = buildMorawareEvidenceIndexes({ directoryAccounts: [], qbLinksByAccountId: new Map() });
  const qbRootIndexes = buildQbRootFactIndexes(
    [{ qb_list_id: "QB-OLD", full_name: "Legacy Cabinets", is_job: false, is_active: false }],
    new Map()
  );
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "904", accountName: "Legacy Cabinets LLC" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.equal(spine.candidates[0].qbActive, false);
  assert.equal(spine.candidates[0].createFromQuickBooksAllowed, true);
  console.log("ok: 6) inactive QB root visible (create still allowed; UI warns)");
}

{
  const evidence = buildMorawareEvidenceIndexes({ directoryAccounts: [], qbLinksByAccountId: new Map() });
  const qbRootIndexes = buildQbRootFactIndexes(
    [
      { qb_list_id: "QB-A", full_name: "Acme Cabinets", is_job: false, is_active: true },
      { qb_list_id: "QB-B", full_name: "Acme Cabinets", is_job: false, is_active: true }
    ],
    new Map()
  );
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "905", accountName: "Acme Cabinets LLC" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.equal(spine.reviewState, SPINE_REVIEW_STATES.CONFLICT);
  console.log("ok: 7) multiple QB roots ambiguous → conflict");
}

{
  const directoryAccounts = [{ id: "ad-near", displayName: "Heartland Designs", legalName: null, status: "active" }];
  const evidence = buildMorawareEvidenceIndexes({
    directoryAccounts,
    qbLinksByAccountId: new Map()
  });
  const qbRootIndexes = buildQbRootFactIndexes([], new Map());
  const spine = discoverMorawareSpineCandidates({
    morawareAccount: { sourceAccountId: "906", accountName: "Heartland Design" },
    indexes: evidence,
    qbRootIndexes,
    directoryById: evidence.byId
  });
  assert.ok(
    spine.reviewState === SPINE_REVIEW_STATES.NO_CANDIDATE ||
      spine.candidates.every((c) => !c.confirmMorawareAllowed || (c.confidence || 0) < 55)
  );
  assert.equal(spine.candidates.some((c) => c.createFromQuickBooksAllowed), false);
  console.log("ok: 8) weak fuzzy name does not authorize link / create-from-QB");
}

{
  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({ store });
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: "QB-JIT-1",
    fullName: "JIT Customer Co",
    isJob: false,
    isActive: true
  });
  const created = await service.createAccountFromQuickBooks({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: { qbListId: "QB-JIT-1" }
  });
  assert.equal(created.ok, true);
  assert.equal(created.qbLinked, true);
  assert.equal(created.morawareAutoLinked, false);
  assert.equal(created.incomplete, false);
  assert.ok(created.account?.id);
  const links = await store.listActiveExternalLinksByExternalId(ORG, "quickbooks_desktop", "QB-JIT-1");
  assert.equal(links.length, 1);
  assert.equal(links[0].accountId, created.account.id);

  await assert.rejects(
    () =>
      service.createAccountFromQuickBooks({
        organizationId: ORG,
        role: "admin",
        actorUserId: ACTOR,
        payload: { qbListId: "QB-JIT-1" }
      }),
    (e) => e instanceof AccountDirectoryError && e.code === "duplicate_external_id"
  );

  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: "QB-JOB-X",
    fullName: "Job Only",
    isJob: true,
    isActive: true
  });
  await assert.rejects(
    () =>
      service.createAccountFromQuickBooks({
        organizationId: ORG,
        role: "admin",
        actorUserId: ACTOR,
        payload: { qbListId: "QB-JOB-X" }
      }),
    (e) => e instanceof AccountDirectoryError && e.code === "qb_job_not_linkable"
  );
  console.log("ok: 9–13) create-from-QB explicit, no QB write, no Moraware auto-link, ListID uniqueness, job blocked");
}

{
  const store = createAccountDirectoryMemoryStore();
  await seedTrustedQuickBooksCustomerFact(store, {
    organizationId: ORG,
    qbListId: "QB-ISO",
    fullName: "Org Isolation Co",
    isJob: false
  });
  const factsA = await store.listQuickBooksRootCustomerFacts(ORG);
  const factsB = await store.listQuickBooksRootCustomerFacts("00000000-0000-4000-8000-0000000000e2");
  assert.ok(factsA.some((f) => f.qbListId === "QB-ISO"));
  assert.equal(factsB.length, 0);
  console.log("ok: 14) organization isolation on root fact listing");
}

{
  const recon = readFileSync(join(here, "accountDirectoryMorawareReconciliation.mjs"), "utf8");
  assert.ok(recon.includes("listAliasesForAccountIds"));
  assert.ok(recon.includes("listContactsForAccountIds"));
  assert.ok(recon.includes("listLocationsForAccountIds"));
  assert.equal(recon.includes("listAliasesForOrganization"), false);
  assert.equal(recon.includes("listContactsForOrganization"), false);
  assert.equal(recon.includes("listLocationsForOrganization"), false);
  assert.ok(recon.includes("is_job"));
  assert.equal(recon.includes("Confirm All"), false);
  const api = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
  assert.ok(api.includes("from-quickbooks"));
  assert.equal(api.includes("Confirm All"), false);
  const svc = readFileSync(join(here, "accountDirectoryService.mjs"), "utf8");
  assert.ok(svc.includes("createAccountFromQuickBooks"));
  assert.ok(svc.includes("morawareAutoLinked: false"));
  assert.equal(svc.includes("linkMoraware(") && svc.includes("createAccountFromQuickBooks"), true);
  // createAccountFromQuickBooks body must not call linkMoraware
  const fn = svc.split("async createAccountFromQuickBooks")[1].split("async deactivateExternalLink")[0];
  assert.equal(fn.includes("linkMoraware"), false);
  console.log("ok: 15–18) no bulk, scoped hydration, no Moraware in create-from-QB, API present");
}

{
  const queue = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store: createAccountDirectoryMemoryStore(),
    dataset: {
      morawareAccounts: [{ sourceAccountId: "1", accountName: "No Match Anywhere" }],
      jobsByMorawareId: new Map(),
      jobStatsByMorawareId: new Map([["1", { jobCount: 2, jobs2026: 2 }]]),
      directoryAccounts: [{ id: "ad-x", displayName: "Other", legalName: null, status: "active" }],
      aliases: [],
      contacts: [],
      locations: [],
      qbRootFacts: [],
      qbLinksByAccountId: new Map(),
      morawareLinksBySourceId: new Map(),
      morawareLinksByAccountId: new Map()
    }
  });
  assert.ok(queue.summary.noCandidate >= 1 || queue.items[0].reviewState === "NO_CANDIDATE");
  console.log("ok: queue summary exposes noCandidate / spine fields");
}

{
  // Fixture reproducing the live double-count: linked rows with supporting classification CONFLICT
  // must count only as LINKED in exclusive summary (not also as conflicts).
  const { resolvePrimaryMorawareReviewState, buildExclusiveMorawareReviewSummary, PRIMARY_REVIEW_STATE_PRECEDENCE } =
    await import("./accountDirectoryMorawareQbSpine.mjs");

  assert.equal(
    resolvePrimaryMorawareReviewState({
      currentLink: { linked: true },
      reviewState: "CONFLICT",
      classification: "CONFLICT",
      internalBucket: false
    }),
    "LINKED"
  );
  assert.equal(
    resolvePrimaryMorawareReviewState({
      currentLink: { linked: false },
      internalBucket: true,
      reviewState: "EXISTING_AD_QB_BACKED",
      classification: "HIGH_CONFIDENCE_CANDIDATE"
    }),
    "INTERNAL"
  );
  assert.equal(
    resolvePrimaryMorawareReviewState({
      currentLink: { linked: false },
      reviewState: "CONFLICT",
      candidates: [{ identityKind: "QB_ROOT_NOT_IN_DIRECTORY" }]
    }),
    "CONFLICT"
  );
  assert.equal(
    resolvePrimaryMorawareReviewState({
      currentLink: { linked: false },
      reviewState: "POSSIBLE_CANDIDATE"
    }),
    "POSSIBLE_CANDIDATE"
  );

  const linkedConflictRows = Array.from({ length: 9 }, (_, i) => ({
    morawareAccountId: String(100 + i),
    currentLink: { linked: true },
    reviewState: i === 0 ? "CONFLICT" : "LINKED",
    classification: "CONFLICT",
    internalBucket: false
  }));
  const unresolvedRows = [
    { currentLink: { linked: false }, reviewState: "EXISTING_AD_QB_BACKED" },
    { currentLink: { linked: false }, reviewState: "EXISTING_AD_QB_LINK_CANDIDATE" },
    { currentLink: { linked: false }, reviewState: "QB_ROOT_NOT_IN_DIRECTORY" },
    { currentLink: { linked: false }, reviewState: "EXISTING_AD_PROSPECT" },
    { currentLink: { linked: false }, reviewState: "POSSIBLE_CANDIDATE" },
    { currentLink: { linked: false }, reviewState: "CONFLICT" },
    { currentLink: { linked: false }, reviewState: "NO_CANDIDATE" },
    { currentLink: { linked: false }, reviewState: "INTERNAL", internalBucket: true }
  ];
  const exclusive = buildExclusiveMorawareReviewSummary([...linkedConflictRows, ...unresolvedRows]);
  assert.equal(exclusive.totalMorawareAccounts, 17);
  assert.equal(exclusive.alreadyLinked, 9);
  assert.equal(exclusive.unresolved, 8);
  assert.equal(exclusive.conflicts, 1); // not 1+9
  assert.equal(exclusive.internalBuckets, 1);
  assert.equal(exclusive.alreadyLinked + exclusive.unresolved, exclusive.totalMorawareAccounts);
  assert.equal(exclusive.unresolvedBucketSum, exclusive.unresolved);

  const store = createAccountDirectoryMemoryStore();
  const dataset = {
    morawareAccounts: [
      { sourceAccountId: "L1", accountName: "Linked Conflict Co" },
      { sourceAccountId: "C1", accountName: "Twin Root Alpha" },
      { sourceAccountId: "I1", accountName: "Direct" },
      { sourceAccountId: "P1", accountName: "Almost Similar Name" }
    ],
    jobsByMorawareId: new Map(),
    jobStatsByMorawareId: new Map([
      ["L1", { jobCount: 2, jobs2026: 2 }],
      ["C1", { jobCount: 2, jobs2026: 2 }],
      ["I1", { jobCount: 1, jobs2026: 1 }],
      ["P1", { jobCount: 2, jobs2026: 2 }]
    ]),
    directoryAccounts: [
      { id: "ad-linked", displayName: "Linked Conflict Co", legalName: null, status: "active" },
      { id: "ad-wrong", displayName: "Wrong Linked", legalName: null, status: "active" },
      { id: "ad-near", displayName: "Almost Similar Named", legalName: null, status: "active" }
    ],
    aliases: [],
    contacts: [],
    locations: [],
    qbRootFacts: [
      { qbListId: "QB-A", fullName: "Twin Root Alpha", name: "Twin Root Alpha", isJob: false, isActive: true },
      { qbListId: "QB-B", fullName: "Twin Root Alpha", name: "Twin Root Alpha", isJob: false, isActive: true }
    ],
    qbLinksByAccountId: new Map([["ad-linked", { listId: "QB-L", displayName: "Linked Conflict Co" }]]),
    morawareLinksBySourceId: new Map([
      [
        "L1",
        {
          id: "link-l1",
          accountId: "ad-wrong",
          externalId: "L1",
          externalSystem: "moraware",
          isActive: true
        }
      ]
    ]),
    morawareLinksByAccountId: new Map([
      [
        "ad-wrong",
        [
          {
            id: "link-l1",
            accountId: "ad-wrong",
            externalId: "L1",
            externalSystem: "moraware",
            isActive: true
          }
        ]
      ]
    ])
  };

  const full = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store,
    dataset,
    query: { page: 1, pageSize: 50 }
  });

  // 1) every row exactly one primary
  for (const row of full.items) {
    assert.ok(PRIMARY_REVIEW_STATE_PRECEDENCE.includes(row.reviewState), row.reviewState);
    assert.equal(row.reviewState, resolvePrimaryMorawareReviewState(row));
  }

  // 2–3) invariants
  const s = full.summary;
  assert.equal(s.alreadyLinked + s.unresolved, s.totalMorawareAccounts);
  assert.equal(s.unresolvedBucketSum, s.unresolved);

  // 4) conflict with QB candidates → CONFLICT only
  const conflictRow = full.items.find((r) => r.morawareAccountId === "C1");
  assert.equal(conflictRow.reviewState, "CONFLICT");
  assert.ok((conflictRow.candidates || []).length >= 1);

  // 5) internal only INTERNAL
  const internalRow = full.items.find((r) => r.morawareAccountId === "I1");
  assert.equal(internalRow.reviewState, "INTERNAL");
  assert.equal(internalRow.internalBucket, true);

  // 6) possible / weak only POSSIBLE or NO_CANDIDATE (not also conflict)
  const possibleRow = full.items.find((r) => r.morawareAccountId === "P1");
  assert.ok(["POSSIBLE_CANDIDATE", "NO_CANDIDATE"].includes(possibleRow.reviewState));

  // linked + supporting conflict metadata stays LINKED
  const linkedRow = full.items.find((r) => r.morawareAccountId === "L1");
  assert.equal(linkedRow.reviewState, "LINKED");
  assert.equal(linkedRow.currentLink.linked, true);
  assert.equal(linkedRow.classification, "CONFLICT");
  assert.ok(linkedRow.contradictions.includes("linked_account_differs_from_proposed"));

  // 7–8) filters return disjoint primary populations
  const conflictFilter = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store,
    dataset,
    query: { page: 1, pageSize: 50, classification: "CONFLICT" }
  });
  assert.ok(conflictFilter.items.every((r) => r.reviewState === "CONFLICT"));
  assert.equal(conflictFilter.items.some((r) => r.morawareAccountId === "L1"), false);

  const linkedFilter = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store,
    dataset,
    query: { page: 1, pageSize: 50, reviewState: "LINKED" }
  });
  assert.ok(linkedFilter.items.every((r) => r.reviewState === "LINKED"));
  assert.ok(linkedFilter.items.some((r) => r.morawareAccountId === "L1"));

  const idsConflict = new Set(conflictFilter.items.map((r) => r.morawareAccountId));
  const idsLinked = new Set(linkedFilter.items.map((r) => r.morawareAccountId));
  for (const id of idsConflict) assert.equal(idsLinked.has(id), false);

  // 10) summary counts match filtered item counts for primary states
  for (const state of [
    "LINKED",
    "INTERNAL",
    "CONFLICT",
    "EXISTING_AD_QB_BACKED",
    "EXISTING_AD_QB_LINK_CANDIDATE",
    "QB_ROOT_NOT_IN_DIRECTORY",
    "EXISTING_AD_PROSPECT",
    "POSSIBLE_CANDIDATE",
    "NO_CANDIDATE"
  ]) {
    const filtered = await listMorawareReconciliationQueue({
      organizationId: ORG,
      role: "admin",
      store,
      dataset,
      query: { page: 1, pageSize: 50, reviewState: state }
    });
    const expected =
      state === "LINKED"
        ? s.alreadyLinked
        : state === "INTERNAL"
          ? s.internalBuckets
          : state === "CONFLICT"
            ? s.conflicts
            : state === "EXISTING_AD_QB_BACKED"
              ? s.existingAdQbBacked
              : state === "EXISTING_AD_QB_LINK_CANDIDATE"
                ? s.existingAdQbLinkCandidate
                : state === "QB_ROOT_NOT_IN_DIRECTORY"
                  ? s.qbRootNotInDirectory
                  : state === "EXISTING_AD_PROSPECT"
                    ? s.existingAdProspect
                    : state === "POSSIBLE_CANDIDATE"
                      ? s.possibleCandidates
                      : s.noCandidate;
    assert.equal(filtered.total, expected, `filter ${state}`);
  }

  console.log("ok: exclusive primary review-state invariants (linked conflict not double-counted)");
}

console.log("\naccountDirectoryMorawareQbSpine.test.mjs — all passed\n");
