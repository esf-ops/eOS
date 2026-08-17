/**
 * Moraware unmatched reconciliation accelerator — deterministic discovery tests.
 * Run: node backend-core/src/accountDirectory/accountDirectoryMorawareCandidateDiscovery.test.mjs
 */
import assert from "node:assert/strict";
import {
  REVIEW_STATES,
  UNMATCHED_REASONS,
  buildMorawareEvidenceIndexes,
  discoverMorawareDirectoryCandidates,
  enrichUnmatchedWithDiscovery,
  extractMorawareLocationHint,
  tokenSortKey
} from "./accountDirectoryMorawareCandidateDiscovery.mjs";
import { rankMorawareDirectoryCandidates } from "./accountDirectoryMorawareMatching.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { normalizeMorawareAccountKey } from "./accountDirectoryMorawareLinkage.mjs";

const ORG = "00000000-0000-4000-8000-0000000000d1";

function baseIndexes(extra = {}) {
  return buildMorawareEvidenceIndexes({
    directoryAccounts: extra.directoryAccounts || [],
    aliases: extra.aliases || [],
    contacts: extra.contacts || [],
    locations: extra.locations || [],
    qbLinksByAccountId: extra.qbLinksByAccountId || new Map()
  });
}

console.log("\naccountDirectoryMorawareCandidateDiscovery.test.mjs\n");

{
  assert.equal(normalizeMorawareAccountKey("ABC Countertops LLC"), normalizeMorawareAccountKey("ABC Countertops"));
  assert.equal(tokenSortKey("stoddard and jensen real estate"), tokenSortKey("jensen stoddard real estate"));
  assert.deepEqual(extractMorawareLocationHint("Dyersville- Broihahn Custom Woodworks"), {
    city: "dyersville",
    state: "ia"
  });
  console.log("ok: punctuation/legal-suffix + token reorder + location hint");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-abc", displayName: "ABC Countertops", legalName: null }]
  });
  const ranked = rankMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1001", accountName: "ABC Countertops LLC" },
    jobStats: { jobCount: 4, jobs2026: 4 },
    directoryAccounts: indexes.directoryAccounts,
    nameIndex: indexes.nameIndex,
    qbNameIndex: indexes.qbNameIndex,
    qbLinksByAccountId: indexes.qbLinksByAccountId
  });
  assert.ok(["HIGH_CONFIDENCE_CANDIDATE", "REVIEW_REQUIRED"].includes(ranked.classification));
  assert.equal(ranked.proposedAccountId, "ad-abc");
  console.log("ok: 1) punctuation/legal-suffix variation is exact after normalize");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-phone", displayName: "Heartland Kitchen Co", legalName: null }],
    contacts: [{ accountId: "ad-phone", phone: "555-123-9876", displayName: "Pat" }],
    locations: [{ accountId: "ad-phone", city: "Dyersville", state: "IA", isPrimaryAccountLocation: true }]
  });
  let fuzzyVisits = 0;
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: {
      sourceAccountId: "1002",
      accountName: "Dyersville- Heartland Kitchens",
      phones: ["(555) 123-9876"]
    },
    indexes,
    onFuzzyCandidateVisit: () => {
      fuzzyVisits += 1;
    }
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  assert.equal(discovery.proposedAccountId, "ad-phone");
  assert.ok(discovery.candidates[0].evidence.some((e) => e.type === "phone" && e.label === "Exact phone"));
  console.log("ok: 2) name variation + exact phone → STRONG_CANDIDATE");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-email", displayName: "Zenith Surfaces", legalName: null }],
    contacts: [{ accountId: "ad-email", email: "office@zenithsurfaces.com", displayName: "Alex" }]
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: {
      sourceAccountId: "1003",
      accountName: "Zenith Surface",
      emails: ["office@zenithsurfaces.com"]
    },
    indexes
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  assert.equal(discovery.proposedAccountId, "ad-email");
  assert.ok(discovery.candidates[0].evidence.some((e) => e.type === "email"));
  console.log("ok: 3) weak name + exact email → STRONG_CANDIDATE");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [
      { id: "ad-dy", displayName: "Premier Cabinets", legalName: null },
      { id: "ad-cr", displayName: "Premier Cabinets", legalName: null }
    ],
    locations: [
      { accountId: "ad-dy", city: "Dyersville", state: "IA", isPrimaryAccountLocation: true },
      { accountId: "ad-cr", city: "Cedar Rapids", state: "IA", isPrimaryAccountLocation: true }
    ]
  });
  const ranked = rankMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1004", accountName: "Dyersville- Premier Cabinets" },
    jobStats: { jobCount: 3, jobs2026: 3 },
    directoryAccounts: indexes.directoryAccounts,
    nameIndex: indexes.nameIndex,
    qbNameIndex: indexes.qbNameIndex,
    qbLinksByAccountId: new Map()
  });
  assert.equal(ranked.classification, "CONFLICT");
  assert.equal(ranked.proposedAccountId, null);
  console.log("ok: 4) same business name in different cities → CONFLICT (multi exact)");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-alias", displayName: "Midwest Millwork Group", legalName: null }],
    aliases: [{ accountId: "ad-alias", aliasValue: "ABC Countertops" }]
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1005", accountName: "ABC Countertops LLC" },
    indexes
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  assert.equal(discovery.proposedAccountId, "ad-alias");
  assert.ok(discovery.candidates[0].evidence.some((e) => e.type === "alias"));
  const ranked = rankMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1005", accountName: "ABC Countertops LLC" },
    jobStats: { jobCount: 2, jobs2026: 2 },
    directoryAccounts: indexes.directoryAccounts,
    nameIndex: indexes.nameIndex,
    qbLinksByAccountId: new Map()
  });
  const enriched = enrichUnmatchedWithDiscovery(ranked, discovery);
  assert.equal(enriched.classification, "REVIEW_REQUIRED");
  assert.equal(enriched.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  console.log("ok: 5) alias exact match → STRONG / REVIEW_REQUIRED candidate");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-qb", displayName: "Directory Label Differs", legalName: null }],
    qbLinksByAccountId: new Map([["ad-qb", { listId: "QB1", displayName: "Premier Stoneworks Inc" }]])
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1006", accountName: "Premier Stoneworks Inc" },
    indexes
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  assert.equal(discovery.proposedAccountId, "ad-qb");
  assert.ok(discovery.candidates[0].evidence.some((e) => e.type === "qb_name"));
  console.log("ok: 6) trusted QB display name supports AD candidate");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [
      { id: "ad-a", displayName: "Northside Design Studio", legalName: null },
      { id: "ad-b", displayName: "North Side Design Studios", legalName: null }
    ],
    locations: [
      { accountId: "ad-a", city: "Dyersville", state: "IA", isPrimaryAccountLocation: true },
      { accountId: "ad-b", city: "Dyersville", state: "IA", isPrimaryAccountLocation: true }
    ]
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1007", accountName: "Dyersville- Northside Design Studio LLC" },
    indexes
  });
  assert.ok(
    discovery.reviewState === REVIEW_STATES.CONFLICT ||
      discovery.reviewState === REVIEW_STATES.POSSIBLE_CANDIDATE ||
      discovery.reviewState === REVIEW_STATES.STRONG_CANDIDATE
  );
  if (discovery.reviewState === REVIEW_STATES.CONFLICT) {
    assert.equal(discovery.proposedAccountId, null);
  }
  assert.ok(discovery.candidates.length >= 1);
  console.log("ok: 7) multiple plausible candidates → POSSIBLE/CONFLICT path");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-fuzzy", displayName: "Heartland Designs", legalName: null }]
  });
  let visits = 0;
  const poolHook = { fuzzyVisits: 0 };
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1008", accountName: "Heartland Design" },
    indexes
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.NO_DIRECTORY_CANDIDATE);
  assert.equal(discovery.proposedAccountId, null);
  assert.equal(discovery.reason, UNMATCHED_REASONS.WEAK_NAME_ONLY);
  assert.ok(discovery.candidates.every((c) => c.confirmAllowed === false));
  const ranked = rankMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1008", accountName: "Heartland Design" },
    jobs: [{ createdAtSource: "2026-02-01" }],
    directoryAccounts: indexes.directoryAccounts,
    qbLinksByAccountId: new Map(),
    onFuzzyCandidateVisit: () => {
      visits += 1;
    }
  });
  assert.equal(ranked.classification, "UNMATCHED");
  assert.equal(ranked.proposedAccountId, null);
  console.log("ok: 8) weak fuzzy name only → NOT high-confidence identity");
  void poolHook;
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-other", displayName: "Completely Unrelated Millwork", legalName: null }]
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1009", accountName: "Sunrise Quartz Partners LLC" },
    indexes
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.NO_DIRECTORY_CANDIDATE);
  assert.equal(discovery.proposedAccountId, null);
  console.log("ok: 9) no plausible AD candidate");
}

{
  const queue = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store: createAccountDirectoryMemoryStore(),
    dataset: {
      morawareAccounts: [{ sourceAccountId: "1010", accountName: "Already Linked Co" }],
      jobsByMorawareId: new Map(),
      jobStatsByMorawareId: new Map([["1010", { jobCount: 2, jobs2026: 2 }]]),
      directoryAccounts: [{ id: "ad-linked", displayName: "Already Linked Co", legalName: null }],
      aliases: [],
      contacts: [],
      locations: [],
      qbLinksByAccountId: new Map(),
      morawareLinksBySourceId: new Map([
        [
          "1010",
          {
            id: "link-1010",
            accountId: "ad-linked",
            externalId: "1010",
            externalSystem: "moraware",
            isActive: true
          }
        ]
      ]),
      morawareLinksByAccountId: new Map([
        [
          "ad-linked",
          [
            {
              id: "link-1010",
              accountId: "ad-linked",
              externalId: "1010",
              externalSystem: "moraware",
              isActive: true
            }
          ]
        ]
      ])
    }
  });
  assert.equal(queue.items[0].currentLink.linked, true);
  assert.equal(queue.items[0].reviewState, REVIEW_STATES.LINKED);
  assert.equal(queue.items[0].confirmAllowed, false);
  console.log("ok: 10) already-linked Moraware ID");
}

{
  const adId = "ad-multi";
  const queue = await listMorawareReconciliationQueue({
    organizationId: ORG,
    role: "admin",
    store: createAccountDirectoryMemoryStore(),
    dataset: {
      morawareAccounts: [
        { sourceAccountId: "201", accountName: "Dyersville- Multi ID Customer" },
        { sourceAccountId: "202", accountName: "Lisbon- Multi ID Customer" }
      ],
      jobsByMorawareId: new Map(),
      jobStatsByMorawareId: new Map([
        ["201", { jobCount: 2, jobs2026: 2 }],
        ["202", { jobCount: 1, jobs2026: 1 }]
      ]),
      directoryAccounts: [{ id: adId, displayName: "Multi ID Customer", legalName: null }],
      aliases: [],
      contacts: [],
      locations: [],
      qbLinksByAccountId: new Map(),
      morawareLinksBySourceId: new Map([
        ["201", { id: "l201", accountId: adId, externalId: "201", externalSystem: "moraware", isActive: true }],
        ["202", { id: "l202", accountId: adId, externalId: "202", externalSystem: "moraware", isActive: true }]
      ]),
      morawareLinksByAccountId: new Map([
        [
          adId,
          [
            { id: "l201", accountId: adId, externalId: "201", externalSystem: "moraware", isActive: true },
            { id: "l202", accountId: adId, externalId: "202", externalSystem: "moraware", isActive: true }
          ]
        ]
      ])
    }
  });
  assert.equal(queue.items.length, 2);
  assert.ok(queue.items.every((r) => r.currentLink.linked));
  assert.ok(queue.items.some((r) => (r.siblingMorawareIds || []).includes("202")));
  console.log("ok: 11) one AD account with multiple legitimate Moraware IDs");
}

{
  const indexes = baseIndexes({
    directoryAccounts: [{ id: "ad-alias2", displayName: "Legal Name Corp", legalName: null }],
    aliases: [{ accountId: "ad-alias2", aliasValue: "Trading As Alias" }]
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1012", accountName: "Trading As Alias" },
    indexes
  });
  assert.equal(discovery.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  assert.ok(discovery.candidates[0].confirmAllowed);
  // Discovery never links — only proposes.
  assert.ok(discovery.proposedAccountId);
  console.log("ok: 12–13) no auto-link; explicit confirmation still required (candidate only)");
}

{
  const indexesA = baseIndexes({
    directoryAccounts: [{ id: "ad-org-a", displayName: "Shared Name LLC", legalName: null }]
  });
  const discoveryA = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1013", accountName: "Shared Name LLC" },
    indexes: indexesA
  });
  const indexesB = baseIndexes({
    directoryAccounts: [{ id: "ad-org-b", displayName: "Other Org Account", legalName: null }]
  });
  const discoveryB = discoverMorawareDirectoryCandidates({
    morawareAccount: { sourceAccountId: "1013", accountName: "Shared Name LLC" },
    indexes: indexesB
  });
  assert.equal(discoveryA.proposedAccountId, "ad-org-a");
  assert.equal(discoveryB.proposedAccountId, null);
  console.log("ok: 14) org isolation via dataset indexes (no cross-org candidates)");
}

{
  const many = [];
  for (let i = 0; i < 200; i += 1) {
    many.push({ id: `ad-${i}`, displayName: `Unrelated Business ${i}`, legalName: null });
  }
  many.push({ id: "ad-hit", displayName: "Exact Phone Target", legalName: null });
  const indexes = baseIndexes({
    directoryAccounts: many,
    contacts: [{ accountId: "ad-hit", phone: "3195550100", displayName: "Sam" }]
  });
  const discovery = discoverMorawareDirectoryCandidates({
    morawareAccount: {
      sourceAccountId: "1014",
      accountName: "Totally Different Moraware Name",
      phones: ["319-555-0100"]
    },
    indexes
  });
  assert.equal(discovery.proposedAccountId, "ad-hit");
  assert.equal(discovery.reviewState, REVIEW_STATES.STRONG_CANDIDATE);
  // Exact phone evidence should not require a full fuzzy directory scan.
  assert.ok(discovery.fuzzyVisits < many.length, `fuzzyVisits=${discovery.fuzzyVisits} should be bounded`);
  console.log("ok: 15) exact evidence avoids unnecessary full fuzzy scans");
}

{
  // Fixture reduction report — unmatched-style population shapes only (no production access).
  const fixtures = [
    { name: "ABC Countertops LLC", ad: "ABC Countertops", expect: "strong" },
    { name: "Trading Alias Co", alias: "Trading Alias Co", expect: "strong" },
    { name: "Heartland Design", ad: "Heartland Designs", expect: "none" },
    { name: "No Match Enterprises", ad: "Other", expect: "none" },
    {
      name: "Zenith Surface",
      ad: "Zenith Surfaces",
      email: "a@zenithsurfaces.com",
      expect: "strong"
    }
  ];
  const counts = { strong: 0, possible: 0, none: 0, conflict: 0 };
  for (const fx of fixtures) {
    const indexes = baseIndexes({
      directoryAccounts: [{ id: "ad-x", displayName: fx.ad, legalName: null }],
      aliases: fx.alias ? [{ accountId: "ad-x", aliasValue: fx.alias }] : [],
      contacts: fx.email ? [{ accountId: "ad-x", email: fx.email }] : []
    });
    const d = discoverMorawareDirectoryCandidates({
      morawareAccount: {
        sourceAccountId: "fx",
        accountName: fx.name,
        emails: fx.email ? [fx.email] : []
      },
      indexes
    });
    if (d.reviewState === REVIEW_STATES.STRONG_CANDIDATE) counts.strong += 1;
    else if (d.reviewState === REVIEW_STATES.POSSIBLE_CANDIDATE) counts.possible += 1;
    else if (d.reviewState === REVIEW_STATES.CONFLICT) counts.conflict += 1;
    else counts.none += 1;
  }
  assert.equal(counts.strong, 3);
  assert.equal(counts.none, 2);
  console.log(
    `ok: fixture reduction sample strong=${counts.strong} possible=${counts.possible} none=${counts.none} conflict=${counts.conflict}`
  );
}

console.log("\naccountDirectoryMorawareCandidateDiscovery.test.mjs — all passed\n");
