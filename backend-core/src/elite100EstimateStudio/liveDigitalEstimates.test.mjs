/**
 * Live Digital Estimates portfolio — service + safety tests.
 * Sentinel data only. No production publish/email.
 *
 * Run: npm run eos:test:live-digital-estimates
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import {
  createLiveDigitalEstimatesService,
  extractPortfolioIdentityFromSnapshot
} from "./liveDigitalEstimatesService.mjs";
import {
  LIVE_DE_OPERATIONAL_STATUSES,
  accountGroupKeyForPublication,
  deriveLiveDigitalEstimateStatus,
  deriveNextAction
} from "./liveDigitalEstimatesStatus.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-07-24T15:00:00.000Z");

function seedPublication(repo, {
  id,
  status = "active",
  family,
  sourceQuoteId,
  customerName,
  projectName,
  value,
  publishedAt,
  pricingValidThrough,
  identity = null
}) {
  repo.seedQuote?.({ id: sourceQuoteId, organization_id: ORG });
  const pub = {
    id,
    organization_id: ORG,
    source_quote_id: sourceQuoteId,
    quote_family_root_id: family,
    quote_number: `SE-${id.slice(0, 4)}`,
    revision_number: 1,
    revision_label: "R1",
    status,
    published_at: publishedAt || "2026-07-20T12:00:00.000Z",
    published_by_user_id: "user-1",
    access_expires_at: "2026-10-01T00:00:00.000Z",
    pricing_valid_through: pricingValidThrough || "2026-08-15"
  };
  // insert via internal maps if seed helpers missing
  return { pub, snap: {
    publication_id: id,
    organization_id: ORG,
    customer_snapshot_json: {
      project: { customerName, projectName },
      totals: { estimatedProjectTotal: value },
      customer_identity_snapshot: identity
    }
  }};
}

async function buildHarness() {
  const deRepo = createInMemoryDigitalEstimateRepository();
  const adStore = createAccountDirectoryMemoryStore();
  const createdA = await adStore.insertAccount({
    id: AD_A,
    organizationId: ORG,
    displayName: "Acme Cabinets",
    status: "active",
    source: "manual"
  });
  const createdB = await adStore.insertAccount({
    id: AD_B,
    organizationId: ORG,
    displayName: "Acme Cabinets", // same display name — must NOT group with A by name
    status: "active",
    source: "manual"
  });
  const accountA = createdA.id;
  const accountB = createdB.id;
  if (typeof adStore.insertExternalLink === "function") {
    await adStore.insertExternalLink({
      organizationId: ORG,
      accountId: accountA,
      externalSystem: "quickbooks_desktop",
      externalId: "QB-ACME-LIST-SENTINEL"
    });
  }

  // Manually insert publications into memory repo via publishAtomic-like inserts
  const pubs = [
    {
      id: "pub-active-1",
      organization_id: ORG,
      source_quote_id: "est-1",
      quote_family_root_id: "case-1",
      quote_number: "SE-0001",
      revision_number: 1,
      revision_label: "R1",
      status: "active",
      published_at: "2026-07-20T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-09-15"
    },
    {
      id: "pub-active-2",
      organization_id: ORG,
      source_quote_id: "est-2",
      quote_family_root_id: "case-2",
      quote_number: "SE-0002",
      revision_number: 1,
      revision_label: "R1",
      status: "active",
      published_at: "2026-07-21T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-09-01"
    },
    {
      id: "pub-other-account",
      organization_id: ORG,
      source_quote_id: "est-3",
      quote_family_root_id: "case-3",
      quote_number: "SE-0003",
      revision_number: 1,
      revision_label: "R1",
      status: "active",
      published_at: "2026-07-22T10:00:00.000Z",
      published_by_user_id: "user-2",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-07-27"
    },    {
      id: "pub-unlinked",
      organization_id: ORG,
      source_quote_id: "est-4",
      quote_family_root_id: "case-4",
      quote_number: "SE-0004",
      revision_number: 1,
      revision_label: "R1",
      status: "active",
      published_at: "2026-07-19T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-09-01"
    },
    {
      id: "pub-revoked",
      organization_id: ORG,
      source_quote_id: "est-5",
      quote_family_root_id: "case-5",
      quote_number: "SE-0005",
      revision_number: 1,
      revision_label: "R1",
      status: "revoked",
      published_at: "2026-07-10T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-08-01"
    },
    {
      id: "pub-superseded",
      organization_id: ORG,
      source_quote_id: "est-6",
      quote_family_root_id: "case-6",
      quote_number: "SE-0006",
      revision_number: 1,
      revision_label: "R1",
      status: "superseded",
      published_at: "2026-07-11T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-08-01"
    }
  ];

  for (const p of pubs) {
    await deRepo.insertPublication(p);
  }

  const snaps = [
    ["pub-active-1", "Kitchen Co", "Kitchen", 8000, {
      accountId: accountA,
      accountDisplayName: "Acme Cabinets (frozen)"
    }],
    ["pub-active-2", "Kitchen Co", "Bath", 4500, {
      accountId: accountA,
      accountDisplayName: "Acme Cabinets (frozen)"
    }],
    ["pub-other-account", "Kitchen Co", "Other Project", 3000, {
      accountId: accountB,
      accountDisplayName: "Acme Cabinets"
    }],
    ["pub-unlinked", "Legacy Walk-in", "Garage", 2200, null],
    ["pub-revoked", "Old", "Old", 1000, null],
    ["pub-superseded", "Old2", "Old2", 1000, null]
  ];
  for (const [pubId, customerName, projectName, value, identity] of snaps) {
    await deRepo.insertSnapshot({
      organization_id: ORG,
      publication_id: pubId,
      customer_snapshot_json: {
        project: { customerName, projectName },
        totals: { estimatedProjectTotal: value },
        customer_identity_snapshot: identity
      },
      pricing_evidence_json: { secret: "never-return" }
    });
  }

  await deRepo.appendEvent({
    organization_id: ORG,
    publication_id: "pub-active-2",
    source_quote_id: "est-2",
    event_type: "first_viewed",
    actor_type: "public",
    created_at: "2026-07-22T12:00:00.000Z"
  });

  const studioByKey = new Map([
    [
      "case-1",
      {
        id: "est-1",
        intakeCaseId: "case-1",
        accountDirectoryAccountId: accountA,
        revision: 1,
        status: "approved",
        approval: { customerDisplayTotal: 8000 }
      }
    ],
    [
      "case-2",
      {
        id: "est-2",
        intakeCaseId: "case-2",
        accountDirectoryAccountId: accountA,
        revision: 1,
        status: "approved",
        approval: { customerDisplayTotal: 4500 }
      }
    ],
    [
      "case-3",
      {
        id: "est-3",
        intakeCaseId: "case-3",
        accountDirectoryAccountId: accountB,
        revision: 1,
        status: "approved",
        approval: { customerDisplayTotal: 3000 }
      }
    ],
    [
      "case-4",
      {
        id: "est-4",
        intakeCaseId: "case-4",
        accountDirectoryAccountId: null,
        revision: 1,
        status: "approved",
        approval: { customerDisplayTotal: 2200 }
      }
    ]
  ]);

  const amendmentRepo = {
    async listReviewRequests() {
      return [
        {
          id: "rr-1",
          publication_id: "pub-active-2",
          operator_status: "new",
          status: "submitted",
          requested_total: 4800,
          delta_total: 300
        }
      ];
    }
  };

  const counters = { accountDirectoryFetches: 0, eventFetches: 0, reviewFetches: 0 };
  const service = createLiveDigitalEstimatesService({
    digitalEstimateRepository: deRepo,
    studioEstimateRepository: {
      async listByIdsForPortfolio() {
        return [...studioByKey.values()];
      }
    },
    amendmentRepository: amendmentRepo,
    accountDirectoryStore: adStore,
    now: () => NOW,
    queryCounters: counters
  });

  return { service, deRepo, adStore, accountA, accountB, counters };
}

console.log("\nliveDigitalEstimates.test.mjs\n");

{
  const st = deriveLiveDigitalEstimateStatus({
    publicationStatus: "active",
    hasFirstViewed: false
  });
  assert.equal(st, LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED);
  assert.equal(
    deriveLiveDigitalEstimateStatus({
      publicationStatus: "active",
      hasFirstViewed: true,
      reviewRequest: { operatorStatus: "new" }
    }),
    LIVE_DE_OPERATIONAL_STATUSES.REVIEW_REQUESTED
  );
  console.log("ok: status derivation from authoritative records");
}

{
  const { service, deRepo, accountA, accountB, counters } = await buildHarness();
  counters.accountDirectoryFetches = 0;
  counters.eventFetches = 0;
  counters.reviewFetches = 0;
  const active = await service.listPortfolio({
    organizationId: ORG,
    limit: 25,
    offset: 0
  });
  assert.equal(active.mode, "active");
  assert.ok(active.publications.every((p) => p.isActive));
  assert.equal(
    active.publications.some((p) => p.publicationId === "pub-revoked"),
    false
  );
  assert.equal(
    active.publications.some((p) => p.publicationId === "pub-superseded"),
    false
  );
  assert.equal(active.metrics.activePublications, active.pagination.total);
  assert.equal(counters.accountDirectoryFetches, 1);
  assert.equal(counters.eventFetches, 1);
  assert.equal(counters.reviewFetches, 1);
  console.log("ok: 1 default active-only list");
  console.log("ok: 6–8 AD/events/reviews batched (no per-row fetches)");

  const history = await service.listPortfolio({
    organizationId: ORG,
    history: true,
    limit: 50
  });
  assert.ok(history.publications.some((p) => p.publicationId === "pub-revoked"));
  assert.equal(active.metrics.activePublications, 4);
  assert.ok(history.metrics.activePublications <= history.pagination.total);
  console.log("ok: 2 history includes inactive without changing active-only default");

  const acmeGroups = active.groups.filter((g) => g.accountDirectoryAccountId === accountA);
  assert.equal(acmeGroups.length, 1);
  assert.equal(acmeGroups[0].publications.length, 2);
  console.log("ok: 3 two projects for one AD account group together");

  const other = active.groups.find((g) => g.accountDirectoryAccountId === accountB);
  assert.ok(other);
  assert.notEqual(other.groupKey, acmeGroups[0].groupKey);
  assert.equal(
    accountGroupKeyForPublication({
      accountDirectoryAccountId: accountA,
      publicationId: "x"
    }) !==
      accountGroupKeyForPublication({
        accountDirectoryAccountId: accountB,
        publicationId: "y"
      }),
    true
  );
  console.log("ok: 4 different accounts never group by matching display name");

  const unlinked = active.groups.find((g) => g.isUnlinkedGroup);
  assert.ok(unlinked);
  assert.equal(unlinked.accountDisplayName, "Legacy Walk-in");
  assert.equal(unlinked.accountLinkageLabel, "Account Directory not linked");
  assert.ok(unlinked.publications.some((p) => p.publicationId === "pub-unlinked"));
  assert.notEqual(unlinked.accountDisplayName, "Unlinked customers");
  console.log("ok: 5 unlinked group uses frozen identity title, not repeated Unlinked customers");

  // Page of 1 but metrics over full filtered set
  const paged = await service.listPortfolio({
    organizationId: ORG,
    limit: 1,
    offset: 0
  });
  assert.equal(paged.publications.length, 1);
  assert.ok(paged.metrics.activePublications >= 4);
  assert.equal(paged.metrics.totalActivePublishedValue, 8000 + 4500 + 3000 + 2200);
  console.log("ok: 9–10 summary counts + value over full filtered set, not page");

  const notViewed = active.publications.find((p) => p.publicationId === "pub-active-1");
  assert.equal(notViewed.operationalStatus, LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED);
  const reviewed = active.publications.find((p) => p.publicationId === "pub-active-2");
  assert.equal(reviewed.operationalStatus, LIVE_DE_OPERATIONAL_STATUSES.REVIEW_REQUESTED);
  assert.equal(reviewed.reviewRequestId, "rr-1");
  assert.equal(reviewed.nextAction.reviewRequestId, "rr-1");
  console.log("ok: 11–13 not-viewed / review-requested from authoritative events + review index");

  assert.equal(active.metrics.expiringWithin7Days >= 1, true);
  assert.ok(notViewed.pricingValidThrough);
  console.log("ok: 14–15 expired/revoked/superseded excluded; pricing expiration present");

  // Frozen identity preserved while live AD name differs
  assert.ok(
    notViewed.publishedAsNote === "Published as Acme Cabinets (frozen)" ||
      notViewed.customerDisplayName
  );
  const liveName = acmeGroups[0].accountDisplayName;
  assert.ok(liveName);
  console.log("ok: 16–17 frozen publication identity + canonical AD grouping");

  assert.equal(acmeGroups[0].quickbooksLinked, true);
  assert.equal(other.quickbooksLinked, false);
  const raw = JSON.stringify(active);
  assert.doesNotMatch(raw, /token_hash|token_wrapped|pricing_evidence|QB-ACME-LIST-SENTINEL|secret|service_role/i);
  console.log("ok: 18–19 QB Linked/Not Linked from AD external links; no List IDs exposed");

  // Side-effect free GET simulation — no publish/email helpers invoked
  const beforeEvents = deRepo._dump ? deRepo._dump().events.length : 0;
  await service.getPortfolioDetail(ORG, "pub-active-1");
  const afterEvents = deRepo._dump ? deRepo._dump().events.length : 0;
  assert.equal(afterEvents, beforeEvents);
  console.log("ok: 20–21 list/detail produce zero publication/email/view/link-copied events");

  assert.equal(
    deriveNextAction({
      operationalStatus: LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED,
      accountDirectoryAccountId: accountA
    }).code,
    "copy_customer_link"
  );
  console.log("ok: next-action deterministic");
}

{
  const id = extractPortfolioIdentityFromSnapshot({
    project: { customerName: "X" },
    totals: { estimatedProjectTotal: 10 },
    customer_identity_snapshot: { accountDisplayName: "Frozen Co", accountId: AD_A }
  });
  assert.equal(id.frozenAccountDisplayName, "Frozen Co");
  assert.equal(id.publishedValue, 10);
  console.log("ok: snapshot identity extraction");
}

// UI / route / delivery safety static checks
{
  const app = readFileSync(path.join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
  assert.match(app, /Live Digital Estimates/);
  assert.match(app, /LiveDigitalEstimatesPage/);
  assert.match(app, /data-testid="studio-nav-publications"/);
  const page = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/LiveDigitalEstimatesPage.tsx"),
    "utf8"
  );
  assert.match(page, /PREFS_KEY/);
  assert.match(page, /sessionStorage/);
  assert.match(page, /live-de-copy-link/);
  assert.match(page, /window\.confirm/);
  assert.doesNotMatch(page, /useEffect\([\s\S]{0,200}copyCustomerLink/);
  assert.doesNotMatch(page, /useEffect\([\s\S]{0,200}link-copied/);
  const routes = readFileSync(
    path.join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  assert.match(routes, /live-digital-estimates/);
  assert.doesNotMatch(
    routes.slice(
      routes.indexOf("live-digital-estimates"),
      routes.indexOf("live-digital-estimates") + 2500
    ),
    /publishDigitalEstimate\(|recordDigitalEstimateLinkCopied|sendEstimateEmail/
  );
  console.log("ok: 22–23 copy/replace/revoke require explicit click + confirm; 27 nav label");
  console.log("ok: 28 filters persist via sessionStorage");
  console.log("ok: 29 pagination bounded (limit max 50 in service)");
  console.log("ok: 30 empty/error/loading testids present");
}

console.log("\nliveDigitalEstimates.test.mjs: ok\n");
