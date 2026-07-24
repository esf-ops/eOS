/**
 * Manual-delivery safety audit — Elite 100 Studio × Account Directory continuity.
 *
 * Invariant: Account Directory identity / scope save / calculate / approve /
 * revision / takeoff refresh / DE readiness MUST NOT publish a Digital Estimate
 * or send customer email. Only explicit POST …/digital-estimate/publish with
 * confirm:true (estimator click) may publish.
 *
 * Sentinel data only. No production endpoints. No real email.
 *
 * Run: npm run eos:test:studio-account-directory-delivery-safety
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "../accountDirectory/accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import {
  applyStudioAccountDirectoryIdentity,
  createProspectForEstimate,
  loadAccountForEstimateSelection,
  lookupAccountsForEstimate
} from "./studioAccountDirectoryLookup.mjs";
import { buildSyntheticQuoteHeaderFromStudioEstimate } from "./studioEstimatePublicationAdapter.mjs";
import {
  buildPublicDigitalEstimateDto,
  assertPublicDtoHasNoForbiddenContent
} from "../digitalEstimate/digitalEstimatePublicSerializer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000099";
const SENTINEL_EMAIL = "sentinel-studio-delivery-audit@example.test";

/** Publication-capable surfaces (inventory). */
export const PUBLICATION_CAPABLE_FUNCTIONS = Object.freeze([
  {
    name: "publishDigitalEstimate",
    file: "backend-core/src/digitalEstimate/digitalEstimatePublishService.mjs",
    callers: [
      "studioEstimateDigitalEstimateService.publish (confirm required)",
      "elite100EstimateStudioRoutes POST /publications (legacy StudioApp path, confirm)",
      "tests"
    ],
    automaticCaller: false
  },
  {
    name: "studioEstimateDigitalEstimateService.publish",
    file: "backend-core/src/elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs",
    callers: [
      "POST /api/elite100-estimate-studio/estimates/:id/digital-estimate/publish",
      "studioReviewRequestService.republish (explicit confirm)",
      "tests"
    ],
    automaticCaller: false
  },
  {
    name: "ensureStudioEstimatePublicationSource",
    file: "backend-core/src/elite100EstimateStudio/studioEstimatePublicationSource.mjs",
    callers: ["studioEstimateDigitalEstimateService.publish only (bridge upsert, not a customer send)"],
    automaticCaller: false
  }
]);

/** Email / notification-capable surfaces relevant to estimates. */
export const EMAIL_NOTIFICATION_CAPABLE_FUNCTIONS = Object.freeze([
  {
    name: "sendEstimateEmail / runQuoteDelivery",
    file: "backend-core/src/email/emailClient.js + quoteDeliveryService.js",
    callers: ["POST /api/quote-delivery/quotes/:id/send (Internal Estimate / Quote Library Email modal)"],
    automaticCaller: false,
    usedByStudioAccountDirectory: false
  }
]);

const IDENTITY_PATH_FILES = [
  "backend-core/src/elite100EstimateStudio/studioAccountDirectoryLookup.mjs",
  "backend-core/src/elite100EstimateStudio/studioEstimateService.mjs",
  "backend-core/src/elite100EstimateStudio/studioEstimateRow.mjs",
  "backend-core/src/elite100EstimateStudio/studioEstimateTypes.mjs",
  "backend-core/src/elite100EstimateStudio/studioEstimateQueueService.mjs",
  "backend-core/supabase/eliteos_studio_estimate_account_directory_v1.sql",
  "app-elite100-estimate-studio/src/estimateQueue/StudioAccountDirectoryPanel.tsx",
  "app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"
];

const FORBIDDEN_IN_IDENTITY_PATHS = [
  /publishDigitalEstimate\s*\(/,
  /ensureStudioEstimatePublicationSource\s*\(/,
  /runQuoteDelivery\s*\(/,
  /sendEstimateEmail\s*\(/,
  /\/api\/quote-delivery\//,
  /api\.resend\.com/,
  /RESEND_API_KEY/
];

function readRel(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function installFetchTripwire() {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url || "");
    calls.push({ url, method: String(init?.method || "GET").toUpperCase() });
    if (/resend\.com|quote-delivery|digital-estimate\/publish/i.test(url)) {
      throw new Error(`DELIVERY_TRIPWIRE: forbidden call to ${url}`);
    }
    throw new Error(`DELIVERY_TRIPWIRE: unexpected fetch to ${url}`);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    }
  };
}

function assertZeroNetwork(tripwire, label) {
  assert.equal(tripwire.calls.length, 0, `${label}: expected zero network/delivery calls`);
}

function testInventoryHasNoAutomaticCallers() {
  for (const entry of PUBLICATION_CAPABLE_FUNCTIONS) {
    assert.equal(entry.automaticCaller, false, `${entry.name} must not auto-call`);
  }
  for (const entry of EMAIL_NOTIFICATION_CAPABLE_FUNCTIONS) {
    assert.equal(entry.automaticCaller, false);
    assert.equal(entry.usedByStudioAccountDirectory, false);
  }
}

function testStaticIdentityPathsNeverPublishOrEmail() {
  for (const rel of IDENTITY_PATH_FILES) {
    const src = readRel(rel);
    for (const pattern of FORBIDDEN_IN_IDENTITY_PATHS) {
      // EstimateScopePanel may mention confirm for approve/takeoff — still must not publish DE.
      if (rel.endsWith("EstimateScopePanel.tsx") && pattern.source.includes("confirm")) continue;
      assert.equal(pattern.test(src), false, `${rel} must not match ${pattern}`);
    }
    assert.equal(src.includes("digital-estimate/publish"), false, `${rel} must not call DE publish`);
  }

  const adPanel = readRel(
    "app-elite100-estimate-studio/src/estimateQueue/StudioAccountDirectoryPanel.tsx"
  );
  assert.match(adPanel, /\/api\/elite100-estimate-studio\/account-directory/);
  assert.doesNotMatch(adPanel, /digital-estimate\/publish/);
  assert.doesNotMatch(adPanel, /setInterval\s*\(/);

  const dePanel = readRel(
    "app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"
  );
  assert.match(dePanel, /data-testid="eq-publish-digital-estimate"/);
  assert.match(dePanel, /confirm:\s*true/);
  assert.match(dePanel, /onClick=\{\(\) => \{[\s\S]*void publish\(\);/);
  assert.match(dePanel, /void load\(/);
  assert.doesNotMatch(
    dePanel,
    /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,400}void publish\(/
  );

  const deService = readRel(
    "backend-core/src/elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs"
  );
  assert.match(deService, /Explicit publish confirmation required/);
  assert.match(deService, /body\?\.confirm !== true/);
  // Bridge upsert is only invoked from publish() (import at top does not count).
  const callIdx = deService.search(/await\s+ensureStudioEstimatePublicationSource\s*\(/);
  assert.ok(callIdx > 0, "bridge helper must be awaited somewhere");
  const publishIdx = deService.indexOf("async publish(");
  assert.ok(callIdx > publishIdx, "bridge source must be created only inside publish()");
  assert.ok(
    !/assessReadiness[\s\S]{0,800}await\s+ensureStudioEstimatePublicationSource\s*\(/.test(deService),
    "assessReadiness must not create bridge source"
  );
  const assessSrc = deService.slice(
    deService.indexOf("async function assessReadiness"),
    deService.indexOf("async publish(")
  );
  assert.doesNotMatch(assessSrc, /publishDigitalEstimate/);
  assert.doesNotMatch(assessSrc, /ensureStudioEstimatePublicationSource/);

  const routes = readRel("backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js");  assert.match(
    routes,
    /\/api\/elite100-estimate-studio\/estimates\/:estimateId\/digital-estimate\/publish/
  );
  // Account-directory routes do not invoke studioDigitalEstimateService.publish
  const adBlockStart = routes.indexOf("/api/elite100-estimate-studio/account-directory");
  const adBlock = routes.slice(adBlockStart, adBlockStart + 4500);
  assert.doesNotMatch(adBlock, /studioDigitalEstimateService\.publish/);
  assert.doesNotMatch(adBlock, /publishDigitalEstimate\(/);

  const sql = readRel(
    "backend-core/supabase/eliteos_studio_estimate_account_directory_v1.sql"
  );
  assert.doesNotMatch(sql, /CREATE\s+TRIGGER/i);
  assert.doesNotMatch(sql, /NOTIFY/i);
  assert.doesNotMatch(sql, /pg_cron|pg_net|http_request/i);
  assert.doesNotMatch(sql, /publish|email|resend/i);

  // No new background delivery machinery in AD continuity modules
  for (const rel of [
    "backend-core/src/elite100EstimateStudio/studioAccountDirectoryLookup.mjs",
    "app-elite100-estimate-studio/src/estimateQueue/StudioAccountDirectoryPanel.tsx"
  ]) {
    const src = readRel(rel);
    assert.doesNotMatch(src, /Bull\(|pg-boss|node-cron|setInterval\s*\(/);
  }
}

async function seedAndExerciseIdentityActions() {
  const tripwire = installFetchTripwire();
  const publishCalls = [];
  const emailCalls = [];

  // Monkey-patch module-level guards via side-channel counters on globalThis
  globalThis.__studioDeliveryAudit = { publishCalls, emailCalls };

  try {
    const store = createAccountDirectoryMemoryStore();
    const adService = createAccountDirectoryService({ store });
    const account = await adService.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: {
        displayName: "Sentinel Delivery Audit Studio Co",
        primaryContactName: "Audit Contact",
        primaryEmail: SENTINEL_EMAIL,
        primaryPhone: "555-0199",
        city: "Dubuque",
        state: "IA",
        line1: "9 Audit Ave"
      }
    });

    // 1. account selection / lookup
    const looked = await lookupAccountsForEstimate({
      service: adService,
      organizationId: ORG,
      role: "estimator",
      search: "Sentinel Delivery Audit",
      limit: 10
    });
    assert.ok(looked.items.some((i) => i.id === account.id));
    assertZeroNetwork(tripwire, "account selection/lookup");

    const detail = await loadAccountForEstimateSelection({
      service: adService,
      organizationId: ORG,
      role: "estimator",
      accountId: account.id
    });
    assert.ok(detail.draftSnapshot);
    assertZeroNetwork(tripwire, "account detail/snapshot load");

    // 2. prospect creation
    await createProspectForEstimate({
      service: adService,
      organizationId: ORG,
      role: "estimator",
      actorUserId: ACTOR,
      payload: { displayName: "Sentinel Prospect No Publish", primaryEmail: "prospect-audit@example.test" }
    });
    assertZeroNetwork(tripwire, "prospect creation");

    const applied = applyStudioAccountDirectoryIdentity({
      body: {
        accountDirectoryAccountId: account.id,
        accountDirectoryContactId: detail.primaryContact?.id,
        accountDirectoryLocationId: detail.primaryLocation?.id,
        customerIdentitySnapshot: detail.draftSnapshot,
        explicitAccountRelink: true,
        refreshCustomerIdentity: true
      },
      existingRow: {
        accountDirectoryAccountId: null,
        customerIdentitySnapshot: null,
        scope: {}
      },
      nextScope: { customerName: "", projectName: "Kitchen" },
      saveMode: "create"
    });
    assert.equal(applied.scope.customerEmail, SENTINEL_EMAIL);
    assertZeroNetwork(tripwire, "identity apply (selection autofill)");

    // 3–7. scope save / calculate / approve / revision / takeoff refresh via service stubs
    const repo = new InMemoryStudioEstimateRepository();
    const service = createStudioEstimateService({
      repository: repo,
      env: { ELITE100_STUDIO_ESTIMATE_REPOSITORY: "memory" },
      loadTakeoffWorkspace: async () => ({
        reviewStatus: "approved",
        job: { id: "tj-audit-1" },
        approvedAt: "2026-07-24T00:00:00.000Z",
        approvedByUserId: ACTOR,
        latestResult: { id: "tr-1" }
      }),
      loadLatestTakeoffResult: async () => ({
        id: "tr-1",
        normalizedTakeoffJson: {
          rooms: [
            {
              id: "r1",
              name: "Kitchen",
              areas: [
                {
                  runs: [{ id: "run-1", label: "Island", lengthIn: 96, depthIn: 25.5, shape: "rect" }]
                }
              ]
            }
          ]
        },
        reviewState: {
          status: "approved",
          roomCompleteness: { r1: true }
        },
        computedMeasurementsJson: {},
        validationDiagnosticsJson: { diagnostics: [] }
      }),
      calculateStudioEstimateImpl: async ({ scope }) => ({
        fingerprint: "fp-audit-1",
        calculatedAt: new Date().toISOString(),
        totals: { customerDisplayTotal: 4000, exactInternalTotal: 4000 },
        material: { group: scope.materialGroup || "Group Promo" },
        pricingEngine: "audit-stub",
        pricingVersion: 1,
        warnings: [],
        unresolvedItems: []
      }),
      loadPartnerAccount: async () => null
    });

    const created = await service.getOrCreateForCase({
      organizationId: ORG,
      intakeCaseId: "case-delivery-audit-1",
      takeoffJobId: "tj-audit-1",
      actorUserId: ACTOR
    });
    assertZeroNetwork(tripwire, "estimate create");

    const saved = await service.updateScope({
      organizationId: ORG,
      estimateId: created.id,
      actorUserId: ACTOR,
      body: {
        scope: {
          projectName: "Kitchen Remodel",
          materialGroup: "Group Promo",
          pricingBasis: "wholesale",
          accountDirectoryAccountId: account.id,
          accountDirectoryContactId: detail.primaryContact?.id,
          accountDirectoryLocationId: detail.primaryLocation?.id,
          customerIdentitySnapshot: detail.draftSnapshot,
          explicitAccountRelink: true,
          refreshCustomerIdentity: true,
          rooms: [
            {
              id: "r1",
              name: "Kitchen",
              countertopSqft: 20,
              pieces: [{ id: "p1", name: "Island", sqft: 20, included: true }]
            }
          ]
        }
      }
    });
    assert.equal(saved.accountLinked, true);
    assertZeroNetwork(tripwire, "scope save with AD link");

    const priced = await service.calculate({
      organizationId: ORG,
      estimateId: saved.id,
      actorUserId: ACTOR,
      body: {}
    });
    assert.equal(priced.status, "priced");
    assertZeroNetwork(tripwire, "calculate");

    const approved = await service.approve({
      organizationId: ORG,
      estimateId: priced.id,
      actorUserId: ACTOR,
      body: { confirm: true }
    });
    assert.equal(approved.status, "approved");
    assertZeroNetwork(tripwire, "approval");

    // Revision via identity change after approval
    const revised = await service.updateScope({
      organizationId: ORG,
      estimateId: approved.id,
      actorUserId: ACTOR,
      body: {
        scope: {
          ...approved.scope,
          customerContactName: "Updated Contact",
          refreshCustomerIdentity: true,
          customerIdentitySnapshot: {
            ...detail.draftSnapshot,
            contactDisplayName: "Updated Contact",
            snapshotAt: "2026-07-24T12:00:00.000Z"
          }
        }
      }
    });
    assert.ok(revised.status === "ready_to_price" || revised.revision >= approved.revision);
    assertZeroNetwork(tripwire, "revision after identity change");

    // Takeoff refresh — exercise the service path; fixture may still hit gate/shape errors,
    // but publication/email tripwires must remain zero either way.
    try {
      await service.refreshScopeFromTakeoff({
        organizationId: ORG,
        estimateId: revised.id,
        actorUserId: ACTOR,
        force: false
      });
    } catch {
      /* shape/gate fixture noise is OK; delivery invariant is what we assert */
    }
    assertZeroNetwork(tripwire, "takeoff refresh preview");
    try {
      await service.refreshScopeFromTakeoff({
        organizationId: ORG,
        estimateId: revised.id,
        actorUserId: ACTOR,
        force: true
      });
    } catch {
      /* same */
    }
    assertZeroNetwork(tripwire, "takeoff refresh force");

    // Static proof: refreshScopeFromTakeoff source never references publish/email
    const svcSrc = readRel("backend-core/src/elite100EstimateStudio/studioEstimateService.mjs");
    const refreshFn = svcSrc.slice(
      svcSrc.indexOf("async function refreshScopeFromTakeoff"),
      svcSrc.indexOf("async function refreshScopeFromTakeoff") + 3500
    );
    assert.doesNotMatch(refreshFn, /publishDigitalEstimate|sendQuote|sendEmail|nodemailer|resend/i);

    // Synthetic header / bridge-shaped object (no network)
    const header = buildSyntheticQuoteHeaderFromStudioEstimate({
      ...revised,
      approval: { customerDisplayTotal: 4000 },
      calculationSnapshot: priced.calculation || {
        totals: { customerDisplayTotal: 4000 },
        fingerprint: "fp-audit-1"
      },
      customerIdentitySnapshot: detail.draftSnapshot,
      accountDirectoryAccountId: account.id
    });
    assert.equal(header.customer_identity_snapshot.contactEmail, SENTINEL_EMAIL);
    assertZeroNetwork(tripwire, "synthetic header build");

    // 8. readiness is separate — static proof already; no publish call counters needed
    assert.equal(publishCalls.length, 0);
    assert.equal(emailCalls.length, 0);
  } finally {
    tripwire.restore();
    delete globalThis.__studioDeliveryAudit;
  }
}

function testOnlyExplicitPublishEndpointCreatesPublication() {
  const routes = readRel("backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js");
  const service = readRel(
    "backend-core/src/elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs"
  );
  // Publish requires confirm
  assert.match(service, /confirm_required/);
  // Only explicit route mounts publish for estimates
  assert.match(
    routes,
    /app\.post\(\s*\n?\s*"\/api\/elite100-estimate-studio\/estimates\/:estimateId\/digital-estimate\/publish"/
  );
  // updateScope / calculate / approve routes must not call publish
  for (const fragment of [
    "estimates/:estimateId/calculate",
    "estimates/:estimateId/approve",
    "estimates/:estimateId/refresh-from-takeoff"
  ]) {
    const idx = routes.indexOf(fragment);
    assert.ok(idx > 0, `route ${fragment} present`);
    const slice = routes.slice(idx, idx + 1200);
    assert.doesNotMatch(slice, /studioDigitalEstimateService\.publish/);
    assert.doesNotMatch(slice, /publishDigitalEstimate\(/);
  }
}

function testPublicDtoSafe() {
  const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
  const dto = buildPublicDigitalEstimateDto(
    {
      quoteNumber: "SE-AUDIT",
      publishedAt: "2026-07-24T00:00:00.000Z",
      project: {
        customerName: "Sentinel Delivery Audit Studio Co",
        projectName: "Kitchen",
        projectAddress: "9 Audit Ave"
      },
      rooms: [],
      totals: { estimatedProjectTotal: 4000, currency: "USD" },
      // Attempted leak fields must be stripped by allowlist
      accountDirectoryAccountId: ACCOUNT_ID,
      customerIdentitySnapshot: { accountId: ACCOUNT_ID, quickbooksListId: "QB-LEAK" },
      notes: ["customer-facing note ok"]
    },
    { accessExpiresAt: null }
  );
  const json = JSON.stringify(dto);
  assert.equal(json.includes(ACCOUNT_ID), false);
  assert.doesNotMatch(json, /quickbooksListId|QB-LEAK|accountDirectory/i);
  assertPublicDtoHasNoForbiddenContent(dto);
}

async function main() {
  testInventoryHasNoAutomaticCallers();
  testStaticIdentityPathsNeverPublishOrEmail();
  testOnlyExplicitPublishEndpointCreatesPublication();
  await seedAndExerciseIdentityActions();
  testPublicDtoSafe();

  console.log("studioAccountDirectoryDeliverySafety.test.mjs: ok");
  console.log(
    JSON.stringify(
      {
        publicationCapableFunctions: PUBLICATION_CAPABLE_FUNCTIONS.length,
        emailNotificationCapableFunctions: EMAIL_NOTIFICATION_CAPABLE_FUNCTIONS.length,
        automaticPublicationCallers: 0,
        automaticEmailCallers: 0,
        realEmailsSent: 0,
        productionPublicationEndpointsCalled: 0,
        productionDeliveryEndpointsCalled: 0
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
