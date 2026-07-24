/**
 * Elite 100 Studio ↔ Account Directory continuity tests (sentinel data only).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { buildSyntheticQuoteHeaderFromStudioEstimate } from "./studioEstimatePublicationAdapter.mjs";
import {
  applyStudioAccountDirectoryIdentity,
  lookupAccountsForEstimate,
  loadAccountForEstimateSelection,
  studioCustomerLabelFromIdentity
} from "./studioAccountDirectoryLookup.mjs";
import { buildPublicDigitalEstimateDto, assertPublicDtoHasNoForbiddenContent } from "../digitalEstimate/digitalEstimatePublicSerializer.mjs";
import { isWattsTrustedPartner } from "./studioEstimateTrustedAccounts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ORG = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const ACTOR = "00000000-0000-4000-8000-000000000099";
const PARTNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SENTINEL_EMAIL = "sentinel-studio-ad@example.test";

function readRel(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

async function seedAccount(service, organizationId, name) {
  return service.createAccount({
    organizationId,
    role: "admin",
    actorUserId: ACTOR,
    payload: {
      displayName: name,
      legalName: `${name} LLC`,
      primaryContactName: "Pat Studio",
      primaryEmail: SENTINEL_EMAIL,
      primaryPhone: "555-0140",
      city: "Dubuque",
      state: "IA",
      line1: "10 Studio Way"
    }
  });
}

async function main() {
  const store = createAccountDirectoryMemoryStore();
  const adService = createAccountDirectoryService({ store });
  const account = await seedAccount(adService, ORG, "Sentinel Studio Cabinets");
  await seedAccount(adService, ORG_B, "Other Org Cabinets");

  // 1. org-scoped search
  {
    const found = await lookupAccountsForEstimate({
      service: adService,
      organizationId: ORG,
      role: "estimator",
      search: "Sentinel Studio",
      limit: 10
    });
    assert.ok(found.items.some((i) => i.id === account.id));
    const cross = await lookupAccountsForEstimate({
      service: adService,
      organizationId: ORG_B,
      role: "estimator",
      search: "Sentinel Studio",
      limit: 10
    });
    assert.ok(!cross.items.some((i) => i.id === account.id));
  }

  const detail = await loadAccountForEstimateSelection({
    service: adService,
    organizationId: ORG,
    role: "estimator",
    accountId: account.id
  });
  assert.ok(detail.draftSnapshot);
  assert.equal(detail.draftSnapshot.contactEmail, SENTINEL_EMAIL);

  // 2–5. populate + partner independence + no Watts grant by AD id
  {
    const applied = applyStudioAccountDirectoryIdentity({
      body: {
        accountDirectoryAccountId: account.id,
        accountDirectoryContactId: detail.primaryContact?.id,
        accountDirectoryLocationId: detail.primaryLocation?.id,
        customerIdentitySnapshot: detail.draftSnapshot,
        explicitAccountRelink: true,
        refreshCustomerIdentity: true,
        partnerAccountId: PARTNER_ID
      },
      existingRow: {
        accountDirectoryAccountId: null,
        accountDirectoryContactId: null,
        accountDirectoryLocationId: null,
        customerIdentitySnapshot: null,
        scope: { partnerAccountId: PARTNER_ID }
      },
      nextScope: {
        customerName: "",
        projectName: "Kitchen Remodel",
        partnerAccountId: PARTNER_ID
      },
      saveMode: "create"
    });
    assert.equal(applied.scope.customerName, "Sentinel Studio Cabinets");
    assert.equal(applied.scope.customerEmail, SENTINEL_EMAIL);
    assert.equal(applied.scope.partnerAccountId, PARTNER_ID);
    assert.notEqual(applied.accountDirectoryAccountId, PARTNER_ID);
    // Selecting AD account must not equal Watts trust via AD UUID
    assert.equal(
      isWattsTrustedPartner(applied.accountDirectoryAccountId, {
        wattsPartnerAccountIds: new Set([PARTNER_ID]),
        spahnPartnerAccountIds: new Set()
      }),
      false
    );
    assert.equal(
      isWattsTrustedPartner(applied.scope.partnerAccountId, {
        wattsPartnerAccountIds: new Set([PARTNER_ID.toLowerCase()]),
        spahnPartnerAccountIds: new Set()
      }),
      true
    );
  }

  // 3. save/reload identity via Studio estimate service
  {
    const repo = new InMemoryStudioEstimateRepository();
    const service = createStudioEstimateService({
      repository: repo,
      env: {
        ELITE100_STUDIO_ESTIMATE_REPOSITORY: "memory",
        ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1"
      },
      loadTakeoffWorkspace: async () => ({ reviewStatus: "approved", job: { id: "tj-1" } }),
      loadLatestTakeoffResult: async () => null
    });
    const created = await service.getOrCreateForCase({
      organizationId: ORG,
      intakeCaseId: "case-sentinel-ad-1",
      takeoffJobId: "tj-1",
      actorUserId: ACTOR
    });
    const updated = await service.updateScope({
      organizationId: ORG,
      estimateId: created.id,
      actorUserId: ACTOR,
      body: {
        scope: {
          projectName: "Kitchen Remodel",
          accountDirectoryAccountId: account.id,
          accountDirectoryContactId: detail.primaryContact?.id,
          accountDirectoryLocationId: detail.primaryLocation?.id,
          customerIdentitySnapshot: detail.draftSnapshot,
          explicitAccountRelink: true,
          refreshCustomerIdentity: true,
          partnerAccountId: PARTNER_ID
        }
      }
    });
    assert.equal(updated.accountLinked, true);
    assert.equal(updated.accountDirectoryAccountId, account.id);
    assert.equal(updated.scope.customerName, "Sentinel Studio Cabinets");
    assert.equal(updated.scope.partnerAccountId, PARTNER_ID);

    const reloaded = await service.getOrCreateForCase({
      organizationId: ORG,
      intakeCaseId: "case-sentinel-ad-1",
      takeoffJobId: "tj-1",
      actorUserId: ACTOR
    });
    assert.equal(reloaded.accountDirectoryAccountId, account.id);
    assert.equal(reloaded.customerIdentitySnapshot.accountDisplayName, "Sentinel Studio Cabinets");
  }

  // 6–7. approved identity frozen; live AD rename does not mutate snapshot without refresh
  {
    const snap = { ...detail.draftSnapshot, accountDisplayName: "Frozen Name", snapshotAt: "2026-07-24T00:00:00.000Z" };
    const kept = applyStudioAccountDirectoryIdentity({
      body: {
        accountDirectoryAccountId: account.id,
        customerIdentitySnapshot: {
          ...snap,
          accountDisplayName: "LIVE RENAMED SHOULD NOT APPLY"
        }
      },
      existingRow: {
        accountDirectoryAccountId: account.id,
        accountDirectoryContactId: detail.primaryContact?.id,
        accountDirectoryLocationId: detail.primaryLocation?.id,
        customerIdentitySnapshot: snap,
        scope: {}
      },
      nextScope: { customerName: "Frozen Name", accountDirectoryAccountId: account.id },
      saveMode: "update_existing"
    });
    assert.equal(kept.customerIdentitySnapshot.accountDisplayName, "Frozen Name");

    const refreshed = applyStudioAccountDirectoryIdentity({
      body: {
        accountDirectoryAccountId: account.id,
        refreshCustomerIdentity: true,
        customerIdentitySnapshot: {
          ...snap,
          accountDisplayName: "Refreshed Name",
          snapshotAt: "2026-07-24T12:00:00.000Z"
        }
      },
      existingRow: {
        accountDirectoryAccountId: account.id,
        customerIdentitySnapshot: snap,
        scope: {}
      },
      nextScope: { customerName: "Frozen Name" },
      saveMode: "update_existing"
    });
    assert.equal(refreshed.customerIdentitySnapshot.accountDisplayName, "Refreshed Name");
  }

  // 8–9. Digital Estimate synthetic header receives frozen snapshot; later rename ignored
  {
    const frozen = {
      ...detail.draftSnapshot,
      accountDisplayName: "Published Frozen Co",
      snapshotAt: "2026-07-24T01:00:00.000Z"
    };
    const estimate = {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: ORG,
      intakeCaseId: "case-pub",
      revision: 1,
      status: "approved",
      scope: {
        customerName: "Published Frozen Co",
        projectName: "Bath",
        projectAddress: "1 Job St",
        partnerAccountId: PARTNER_ID,
        materialGroup: "Group Promo",
        rooms: [{ id: "r1", name: "Bath", countertopSqft: 20, pieces: [] }]
      },
      accountDirectoryAccountId: account.id,
      accountDirectoryContactId: detail.primaryContact?.id,
      accountDirectoryLocationId: detail.primaryLocation?.id,
      customerIdentitySnapshot: frozen,
      approval: { customerDisplayTotal: 5000 },
      calculationSnapshot: { totals: { customerDisplayTotal: 5000 }, fingerprint: "fp1" }
    };
    const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate);
    assert.equal(header.customer_identity_snapshot.accountDisplayName, "Published Frozen Co");
    assert.equal(header.account_directory_account_id, account.id);
    assert.equal(header.partner_account_id, PARTNER_ID);
    assert.notEqual(header.partner_account_id, header.account_directory_account_id);

    // Existing publication envelope stays frozen even if estimate row later mutates in memory
    const mutated = {
      ...estimate,
      customerIdentitySnapshot: { ...frozen, accountDisplayName: "Later Rename" }
    };
    assert.equal(header.customer_identity_snapshot.accountDisplayName, "Published Frozen Co");
    const laterHeader = buildSyntheticQuoteHeaderFromStudioEstimate(mutated);
    assert.equal(laterHeader.customer_identity_snapshot.accountDisplayName, "Later Rename");
    // prior header object unchanged
    assert.equal(header.customer_identity_snapshot.accountDisplayName, "Published Frozen Co");
  }

  // 10–11. public DTO must not expose AD UUIDs / QB ids
  {
    const publicDto = buildPublicDigitalEstimateDto(
      {
        quoteNumber: "SE-TEST",
        project: {
          customerName: "Published Frozen Co",
          projectName: "Bath",
          projectAddress: "1 Job St"
        },
        rooms: [],
        publishedAt: "2026-07-24T01:00:00.000Z"
      },
      { accessExpiresAt: null }
    );
    const json = JSON.stringify(publicDto);
    assert.equal(json.includes(account.id), false);
    assert.doesNotMatch(json, /accountDirectory|quickbooksListId|QB-LIST/i);
    assertPublicDtoHasNoForbiddenContent(publicDto);
  }

  // 12. no automatic publish/send in Studio AD module / routes wiring
  {
    const lookupSrc = readRel("backend-core/src/elite100EstimateStudio/studioAccountDirectoryLookup.mjs");
    assert.doesNotMatch(lookupSrc, /runQuoteDelivery|sendEstimateEmail|publishDigitalEstimate/);
    const routes = readRel("backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js");
    assert.match(routes, /\/api\/elite100-estimate-studio\/account-directory/);
    assert.equal(routes.includes("app.get(\"/api/internal-quotes/account-lookup\""), false);
    assert.equal(routes.includes("app.post(\"/api/internal-quotes/account-lookup"), false);
    assert.match(routes, /digital-estimate\/publish/);
  }

  // 13. unlinked estimates still label from free-text
  {
    assert.equal(
      studioCustomerLabelFromIdentity({ customerName: "Legacy FreeText" }, null), "Legacy FreeText");
  }

  // 14. frontend entry renders selector in EstimateScopePanel
  {
    const panel = readRel(
      "app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"
    );
    assert.match(panel, /StudioAccountDirectoryPanel/);
    const adPanel = readRel(
      "app-elite100-estimate-studio/src/estimateQueue/StudioAccountDirectoryPanel.tsx"
    );
    assert.match(adPanel, /data-testid="eq-account-directory"/);
    assert.match(adPanel, /Customer not linked to Account Directory/);
    assert.doesNotMatch(adPanel, /\/api\/internal-quotes\/account-lookup/);
    assert.match(adPanel, /\/api\/elite100-estimate-studio\/account-directory/);
  }

  // SQL migration present, not applied by this test
  {
    const sql = readRel(
      "backend-core/supabase/eliteos_studio_estimate_account_directory_v1.sql"
    );
    assert.match(sql, /account_directory_account_id/);
    assert.match(sql, /customer_identity_snapshot/);
    assert.doesNotMatch(sql, /CREATE\s+TRIGGER/i);
  }

  console.log("studioAccountDirectoryContinuity.test.mjs: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
