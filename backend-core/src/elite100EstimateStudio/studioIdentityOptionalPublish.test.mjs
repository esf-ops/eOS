/**
 * Digital Estimate identity is optional for publish.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioIdentityOptionalPublish.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveActiveReviewPublishReadiness } from "./studioActiveReviewReadiness.mjs";
import {
  assessStudioEstimatePublicationReadiness,
  buildSyntheticQuoteHeaderFromStudioEstimate,
  resolveCustomerFacingEstimateTitle
} from "./studioEstimatePublicationAdapter.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { validateDeliveryRecipients } from "../quoteDelivery/quoteDeliveryService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICING_VERSION_4 = 4;

console.log("\nstudioIdentityOptionalPublish.test.mjs\n");

function blankIdentityScope(overrides = {}) {
  return {
    customerName: "",
    customerEmail: "",
    projectName: "",
    materialGroup: "Group 1",
    pricingBasis: "direct",
    sourceFileName: "kitchen-plans.pdf",
    addOns: { "qty-sink": 1 },
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        included: true,
        countertopSqft: 48.45,
        includeBacksplash: false,
        backsplashSqft: 0,
        materialGroup: "Group 1",
        pieces: [
          {
            id: "p1",
            name: "Sink wall",
            included: true,
            lengthIn: 120,
            depthIn: 25.5,
            sqft: 21.25,
            pieceType: "counter"
          },
          {
            id: "p2",
            name: "Island",
            included: true,
            lengthIn: 96,
            depthIn: 40.5,
            sqft: 27,
            pieceType: "counter"
          }
        ]
      }
    ],
    ...overrides
  };
}

{
  const readiness = deriveActiveReviewPublishReadiness({
    scope: blankIdentityScope(),
    calculation: {
      pricingVersion: PRICING_VERSION_4,
      totals: { customerDisplayTotal: 4130 },
      unresolvedItems: []
    }
  });
  assert.equal(readiness.eligible, true);
  const codes = readiness.blockers.map((b) => b.code);
  assert.equal(codes.includes("customer_email_required"), false);
  assert.equal(codes.includes("project_name_required"), false);
  assert.equal(codes.includes("customer_name_required"), false);
  console.log("ok: 1 activeReview.eligible with blank identity");
}

{
  const estimate = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    intakeCaseId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    organizationId: ORG,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: blankIdentityScope(),
    calculation: {
      pricingVersion: PRICING_VERSION_4,
      pricingEngine: "elite100-room-pricing-v1",
      fingerprint: "fp-identity-optional-1",
      totals: { customerDisplayTotal: 4130 },
      unresolvedItems: []
    },
    calculationSnapshot: {
      pricingVersion: PRICING_VERSION_4,
      pricingEngine: "elite100-room-pricing-v1",
      fingerprint: "fp-identity-optional-1",
      totals: { customerDisplayTotal: 4130 }
    },
    approval: {
      approvedAt: "2026-07-28T20:00:00.000Z",
      customerDisplayTotal: 4130,
      calculationFingerprint: "fp-identity-optional-1"
    }
  };

  const pub = assessStudioEstimatePublicationReadiness({
    estimate,
    repositoryMode: "memory",
    takeoffReviewStatus: "approved",
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    configuration: { pricingValidThrough: "", allowedOptionKeys: [] },
    now: new Date("2026-07-28T20:00:00.000Z")
  });
  const codes = (pub.blockingReasons || []).map((b) => b.code);
  assert.equal(codes.includes("customer_name_required"), false, "3 no customer_name_required");
  assert.equal(codes.includes("project_name_required"), false, "4 no project_name_required");
  assert.equal(codes.includes("customer_email_required"), false, "5 no customer_email_required");
  assert.equal(pub.eligible, true, "publication eligible without identity");

  const title = resolveCustomerFacingEstimateTitle(estimate);
  assert.equal(title, "kitchen-plans.pdf");
  assert.equal(/^[0-9a-f-]{36}$/i.test(title), false, "8 no UUID title");

  const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, { organizationId: ORG });
  assert.equal(header.customer_name, null);
  assert.equal(header.customer_email, null);
  assert.equal(header.project_name, "kitchen-plans.pdf");
  const printName =
    header.calculation_snapshot?.internal_ui?.customer_estimate_print_snapshot?.header?.projectName;
  assert.equal(printName, "kitchen-plans.pdf", "7 safe fallback display title");

  // Preserve existing identity when present.
  const named = {
    ...estimate,
    scope: blankIdentityScope({
      projectName: "Nietert Kitchen",
      customerName: "Casey Nietert",
      customerEmail: "casey@example.test",
      sourceFileName: "kitchen-plans.pdf"
    })
  };
  assert.equal(resolveCustomerFacingEstimateTitle(named), "Nietert Kitchen");
  const namedHeader = buildSyntheticQuoteHeaderFromStudioEstimate(named, { organizationId: ORG });
  assert.equal(namedHeader.customer_name, "Casey Nietert");
  assert.equal(namedHeader.customer_email, "casey@example.test");
  assert.equal(namedHeader.project_name, "Nietert Kitchen");
  console.log("ok: 3–5,7–8 publication adapter + fallback title; existing identity preserved");
}

{
  const repository = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" }),
    loadLatestTakeoffResult: async () => null
  });
  let publishedUrl = null;
  const workflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: studio,
    manualEstimateService: {
      async createManualEstimate() {
        throw new Error("unused");
      }
    },
    digitalEstimateService: {
      async publish({ estimateId }) {
        publishedUrl = `https://estimate.example.test/p/${estimateId}`;
        return {
          ok: true,
          customerUrl: publishedUrl,
          publication: { customerUrl: publishedUrl, active: true }
        };
      }
    }
  });

  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    takeoffJobId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: blankIdentityScope(),
    createdByUserId: ACTOR
  });

  const priced = await studio.calculate({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.calculation.pricingVersion, PRICING_VERSION_4);
  assert.ok(Number(priced.calculation.totals.customerDisplayTotal) > 0);

  const view = await studio.getById(ORG, created.id);
  assert.equal(view.activeReview.eligible, true, "1 read model eligible without identity");

  const published = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "identity-optional-1" }
  });
  assert.ok(published?.customerUrl || publishedUrl, "2/6 simplified-publish succeeds with URL");
  console.log("ok: 2/6 simplified-publish succeeds with blank identity");
}

{
  // Explicit email-delivery still requires recipients.
  const missing = validateDeliveryRecipients([]);
  assert.equal(missing.ok, false);
  assert.match(missing.errors[0], /recipient/i);
  const ok = validateDeliveryRecipients([{ email: "customer@example.com", type: "to" }]);
  assert.equal(ok.ok, true);
  console.log("ok: email-delivery action still validates recipients");
}

{
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/AiEstimatorWorkspace.tsx"),
    "utf8"
  );
  assert.equal(panel.includes("eq-ai-publish-required-fields"), false, "10 no project/email form");
  assert.equal(panel.includes("Required to publish"), false);
  assert.equal(panel.includes("Details saved."), false);
  assert.equal(panel.includes("saveProjectFields"), false);
  assert.equal(panel.includes("/project-details"), false);
  assert.ok(panel.includes("eq-publish-digital-estimate"));
  assert.ok(panel.includes("eq-copy-customer-link"));
  assert.ok(panel.includes("eq-open-customer-preview"));
  assert.ok(panel.includes("activeReview.eligible") || panel.includes("activeReview ? activeReview.eligible"));
  console.log("ok: 9–10 AI panel has publish/copy/open; no identity form");
}

{
  // No-plan fallback uses Studio quote number, never a raw UUID.
  const title = resolveCustomerFacingEstimateTitle({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    intakeCaseId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    scope: { projectName: "", customerName: "", customerEmail: "" }
  });
  assert.match(title, /^SE-[A-F0-9]{8}$/);
  assert.equal(title.includes("ffffffff"), false);
  console.log("ok: quote-number fallback when no plan filename");
}

console.log("\nstudioIdentityOptionalPublish.test.mjs — passed\n");
