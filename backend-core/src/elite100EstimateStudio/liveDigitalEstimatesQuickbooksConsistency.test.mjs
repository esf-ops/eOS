/**
 * QuickBooks linkage consistency — Studio Account Directory panel authority
 * must match Live Digital Estimates portfolio enrichment for the same AD account.
 *
 * Run: node backend-core/src/elite100EstimateStudio/liveDigitalEstimatesQuickbooksConsistency.test.mjs
 */
import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import {
  isAccountQuickbooksLinked,
  quickbooksLinkedLabel,
  ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM
} from "../accountDirectory/accountDirectoryQuickbooksLinkage.mjs";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createLiveDigitalEstimatesService } from "./liveDigitalEstimatesService.mjs";

const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-07-24T15:00:00.000Z");

console.log("\nliveDigitalEstimatesQuickbooksConsistency.test.mjs\n");

{
  assert.equal(isAccountQuickbooksLinked([]), false);
  assert.equal(
    isAccountQuickbooksLinked([{ isActive: true, externalSystem: ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM }]),
    true
  );
  assert.equal(
    isAccountQuickbooksLinked([{ isActive: true, externalSystem: "moraware" }]),
    false
  );
  assert.equal(quickbooksLinkedLabel(true), "QuickBooks Linked");
  assert.equal(quickbooksLinkedLabel(false), "QuickBooks Not Linked");
  console.log("ok: A1 shared linkage helper + staff-safe labels only");
}

{
  const adStore = createAccountDirectoryMemoryStore();
  const linked = await adStore.insertAccount({
    organizationId: ORG,
    displayName: "319 Decor + Design",
    status: "active",
    source: "manual"
  });
  const unlinked = await adStore.insertAccount({
    organizationId: ORG,
    displayName: "Unlinked Cabinetry Co",
    status: "active",
    source: "manual"
  });
  await adStore.insertExternalLink({
    organizationId: ORG,
    accountId: linked.id,
    externalSystem: ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM,
    externalId: "QB-LIST-ID-MUST-NOT-LEAK"
  });

  const adService = createAccountDirectoryService({ store: adStore });
  const studioLinked = await adService.getAccount({
    organizationId: ORG,
    accountId: linked.id,
    role: "admin"
  });
  const studioUnlinked = await adService.getAccount({
    organizationId: ORG,
    accountId: unlinked.id,
    role: "admin"
  });
  assert.equal(studioLinked.quickbooksLinked, true);
  assert.equal(studioUnlinked.quickbooksLinked, false);

  const deRepo = createInMemoryDigitalEstimateRepository();
  for (const [id, accountId, name] of [
    ["pub-qb-linked", linked.id, "319 Decor + Design"],
    ["pub-qb-unlinked", unlinked.id, "Unlinked Cabinetry Co"]
  ]) {
    await deRepo.insertPublication({
      id,
      organization_id: ORG,
      source_quote_id: `est-${id}`,
      quote_family_root_id: `case-${id}`,
      quote_number: `SE-${id.slice(-4)}`,
      revision_number: 1,
      revision_label: "R1",
      status: "active",
      published_at: "2026-07-20T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-09-01"
    });
    await deRepo.insertSnapshot({
      organization_id: ORG,
      publication_id: id,
      customer_snapshot_json: {
        project: { customerName: name, projectName: "Kitchen" },
        totals: { estimatedProjectTotal: 2040 },
        customer_identity_snapshot: {
          accountId,
          accountDisplayName: name
        }
      },
      pricing_evidence_json: {}
    });
  }

  const studioByKey = new Map([
    [
      "case-pub-qb-linked",
      {
        id: "est-pub-qb-linked",
        intakeCaseId: "case-pub-qb-linked",
        accountDirectoryAccountId: linked.id,
        revision: 1,
        status: "approved",
        approval: { customerDisplayTotal: 2040 }
      }
    ],
    [
      "case-pub-qb-unlinked",
      {
        id: "est-pub-qb-unlinked",
        intakeCaseId: "case-pub-qb-unlinked",
        accountDirectoryAccountId: unlinked.id,
        revision: 1,
        status: "approved",
        approval: { customerDisplayTotal: 2040 }
      }
    ]
  ]);

  const live = createLiveDigitalEstimatesService({
    digitalEstimateRepository: deRepo,
    studioEstimateRepository: {
      async listByIdsForPortfolio() {
        return [...studioByKey.values()];
      }
    },
    amendmentRepository: { async listReviewRequests() { return []; } },
    accountDirectoryStore: adStore,
    now: () => NOW
  });

  const portfolio = await live.listPortfolio({ organizationId: ORG, limit: 25, offset: 0 });
  const linkedGroup = portfolio.groups.find((g) => g.accountDirectoryAccountId === linked.id);
  const unlinkedGroup = portfolio.groups.find((g) => g.accountDirectoryAccountId === unlinked.id);
  assert.ok(linkedGroup);
  assert.ok(unlinkedGroup);
  assert.equal(linkedGroup.quickbooksLinked, studioLinked.quickbooksLinked);
  assert.equal(unlinkedGroup.quickbooksLinked, studioUnlinked.quickbooksLinked);
  assert.equal(linkedGroup.quickbooksLinked, true);
  assert.equal(unlinkedGroup.quickbooksLinked, false);

  const payload = JSON.stringify(portfolio);
  assert.doesNotMatch(payload, /QB-LIST-ID-MUST-NOT-LEAK/);
  assert.doesNotMatch(payload, /ListID|list_id|rawWorkbookRow/i);
  console.log("ok: A2–A4 Studio panel and Live DE derive identical QB Linked/Not Linked; no List IDs");
}

{
  // Same display name, different stable unlinked keys → separate groups
  const deRepo = createInMemoryDigitalEstimateRepository();
  const adStore = createAccountDirectoryMemoryStore();
  for (const [id, family, quote] of [
    ["pub-same-name-a", "case-same-a", "est-same-a"],
    ["pub-same-name-b", "case-same-b", "est-same-b"]
  ]) {
    await deRepo.insertPublication({
      id,
      organization_id: ORG,
      source_quote_id: quote,
      quote_family_root_id: family,
      quote_number: `SE-${id.slice(-1)}`,
      revision_number: 1,
      revision_label: "R1",
      status: "active",
      published_at: "2026-07-20T10:00:00.000Z",
      published_by_user_id: "user-1",
      access_expires_at: "2026-10-01T00:00:00.000Z",
      pricing_valid_through: "2026-09-01"
    });
    await deRepo.insertSnapshot({
      organization_id: ORG,
      publication_id: id,
      customer_snapshot_json: {
        project: { customerName: "Example Homes LLC", projectName: `Project ${id}` },
        totals: { estimatedProjectTotal: 1000 },
        customer_identity_snapshot: null
      },
      pricing_evidence_json: {}
    });
  }
  const live = createLiveDigitalEstimatesService({
    digitalEstimateRepository: deRepo,
    studioEstimateRepository: {
      async listByIdsForPortfolio() {
        return [
          {
            id: "est-same-a",
            intakeCaseId: "case-same-a",
            accountDirectoryAccountId: null,
            revision: 1,
            status: "approved",
            approval: { customerDisplayTotal: 1000 }
          },
          {
            id: "est-same-b",
            intakeCaseId: "case-same-b",
            accountDirectoryAccountId: null,
            revision: 1,
            status: "approved",
            approval: { customerDisplayTotal: 1000 }
          }
        ];
      }
    },
    amendmentRepository: { async listReviewRequests() { return []; } },
    accountDirectoryStore: adStore,
    now: () => NOW
  });
  const portfolio = await live.listPortfolio({ organizationId: ORG, limit: 25, offset: 0 });
  const unlinkedGroups = portfolio.groups.filter((g) => g.isUnlinkedGroup);
  assert.equal(unlinkedGroups.length, 2);
  assert.ok(unlinkedGroups.every((g) => g.accountDisplayName === "Example Homes LLC"));
  assert.ok(unlinkedGroups.every((g) => g.accountLinkageLabel === "Account Directory not linked"));
  assert.notEqual(unlinkedGroups[0].groupKey, unlinkedGroups[1].groupKey);
  assert.ok(!unlinkedGroups.some((g) => g.accountDisplayName === "Unlinked customers"));
  console.log("ok: B5–B8 unlinked same-name stay separate; frozen titles; no generic Unlinked customers spam");
}

console.log("\nliveDigitalEstimatesQuickbooksConsistency.test.mjs: ok\n");
