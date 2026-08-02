/**
 * Studio V2 Customer Selection Review — saved DE selections for estimators.
 * Run: node backend-core/src/elite100EstimateStudio/studioCustomerSelectionReview.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  buildEmptyCustomerSelectionReview,
  buildStudioCustomerSelectionReview,
  friendlyMaterialLabel,
  scrubSelectionReviewDto
} from "./studioCustomerSelectionReview.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import {
  CUSTOMER_CONFIGURATION_FOUNDATION_KEY,
  finalizeCustomerConfigurationFoundation
} from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { mergeSelectionPayloadMeta } from "../digitalEstimate/configuration/customerConfigurationDraft.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PUB_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ENV_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

console.log("\nstudioCustomerSelectionReview.test.mjs\n");

function selectionPayload() {
  const foundation = finalizeCustomerConfigurationFoundation({
    selectedMaterial: {
      materialGroup: "C",
      colorId: "aurataj",
      colorName: "Aurataj",
      roomId: "kitchen"
    },
    selectedEdgeProfile: {
      profileToken: "edge_small_ogee",
      profileName: "Small Ogee",
      roomId: "kitchen"
    },
    backsplashPreference: { preference: "keep_approved", note: null },
    requestedOpenings: [],
    requestedWaterfalls: [
      {
        id: "wf-1",
        side: "left",
        legHeight: 36,
        requiresEstimatorReview: true,
        priced: false
      }
    ],
    customerNotes: [],
    lastSavedAt: "2026-07-31T16:00:00.000Z"
  });

  return mergeSelectionPayloadMeta(
    {
      "material:kitchen:aurataj": 1,
      "edge:kitchen:edge_small_ogee": 1,
      "sink:kitchen:esf:demo-sink": 1,
      "specialty:kitchen:esf:demo-specialty": 1
    },
    {
      customerConfiguration: foundation,
      projectNote: "Please confirm waterfall before fabrication.",
      customerProductDrafts: {
        kitchen: { sink: { manufacturer: "Kraus", model: "KHU100-32" } }
      }
    }
  );
}

{
  // 1. Empty state is clean
  const empty = buildEmptyCustomerSelectionReview({ publicationId: PUB_ID });
  assert.equal(empty.hasSavedSelections, false);
  assert.equal(empty.lastSavedAt, null);
  assert.equal(empty.pricedSelections.rooms.length, 0);
  assert.equal(empty.scopeRequests.count, 0);
  assert.equal(empty.totals.customerEstimateTotal, null);
  console.log("ok: 1 empty selection review state");
}

{
  // 2–7. Saved material/edge/sink/specialty + totals + scope separation
  const payload = selectionPayload();
  const review = buildStudioCustomerSelectionReview({
    selection: {
      id: randomUUID(),
      selection_hash: "hash-1",
      selection_payload_json: payload,
      created_at: "2026-07-31T16:00:00.000Z"
    },
    calculation: {
      id: randomUUID(),
      baseline_total: 7120,
      configured_total: 11478,
      customer_result_json: {
        baselineDisplayTotal: 7120,
        configuredDisplayTotal: 11478,
        pricedSelectionTotal: 11478,
        publishedBaselineTotal: 7120,
        displayTotalDelta: 4358,
        pricingAuthority: "authoritative_backend_reprice"
      }
    },
    rooms: [{ id: "kitchen", name: "Kitchen", roomKey: "kitchen" }],
    publicationId: PUB_ID,
    envelopeId: ENV_ID,
    reviewRequested: true
  });

  assert.equal(review.hasSavedSelections, true);
  assert.equal(review.lastSavedAt, "2026-07-31T16:00:00.000Z");
  assert.equal(review.reviewRequested, true);
  assert.equal(review.totals.publishedBaselineTotal, 7120);
  assert.equal(review.totals.customerEstimateTotal, 11478);
  assert.equal(review.totals.difference, 4358);

  const kitchen = review.pricedSelections.rooms.find((r) => r.roomKey === "kitchen");
  assert.ok(kitchen, "kitchen room present");
  assert.match(String(kitchen.material?.label || ""), /Aurataj/i);
  assert.match(String(kitchen.edge?.label || ""), /Small Ogee/i);
  assert.ok(kitchen.sink || review.pricedSelections.selectionChangeItems.some((i) => i.kind === "sink"));
  assert.ok(
    kitchen.specialty?.length ||
      review.pricedSelections.selectionChangeItems.some((i) => i.kind === "specialty")
  );

  assert.ok(review.scopeRequests.count > 0, "scope requests present");
  assert.ok(
    review.scopeRequests.items.some((i) => i.kind === "waterfall"),
    "waterfall is a scope request"
  );
  assert.ok(
    review.scopeRequests.items.some((i) => i.kind === "project_note"),
    "project note is a scope request"
  );

  // Material/edge must NOT appear as scope requests
  for (const item of review.scopeRequests.items) {
    assert.notEqual(item.kind, "material");
    assert.notEqual(item.kind, "edge_profile");
    assert.notEqual(item.kind, "sink");
    assert.notEqual(item.kind, "specialty");
  }
  assert.ok(
    review.pricedSelections.selectionChangeItems.some((i) => i.kind === "material")
  );
  assert.ok(
    review.pricedSelections.selectionChangeItems.some((i) => i.kind === "edge_profile")
  );

  const raw = JSON.stringify(review);
  assert.equal(raw.includes("pricing_evidence"), false);
  assert.equal(raw.includes("service_role"), false);
  assert.equal(raw.includes("internal_evidence"), false);
  assert.equal(raw.includes("selection_payload_json"), false);
  assert.equal(raw.includes(CUSTOMER_CONFIGURATION_FOUNDATION_KEY), false);

  console.log("ok: 2–7 priced selections, totals, review flag, scope separation, no leaks");
}

{
  // 8. scrub strips forbidden keys
  const scrubbed = scrubSelectionReviewDto({
    ok: true,
    pricingEvidence: { secret: true },
    internal_evidence: {},
    service_role: "x",
    nested: { cost: 1, label: "ok" }
  });
  assert.equal(scrubbed.pricingEvidence, undefined);
  assert.equal(scrubbed.internal_evidence, undefined);
  assert.equal(scrubbed.service_role, undefined);
  assert.equal(scrubbed.nested.cost, undefined);
  assert.equal(scrubbed.nested.label, "ok");
  console.log("ok: 8 scrub removes forbidden fields");
}

{
  // 9. getCustomerActivity reads real selection via configurationRepository
  const repo = new InMemoryStudioEstimateRepository();
  const scope = {
    ...emptyStudioEstimateScope(),
    customerName: "Acme",
    projectName: "Kitchen",
    estimateOrigin: "manual",
    physicalScopeSource: "manual",
    rooms: [{ id: "kitchen", name: "Kitchen", included: true, pieces: [] }]
  };
  const row = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    scope,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    approval: {
      approvedAt: "2026-07-30T00:00:00.000Z",
      approvedByUserId: ACTOR,
      customerDisplayTotal: 7120,
      calculationFingerprint: "fp-1"
    },
    calculationSnapshot: {
      fingerprint: "fp-1",
      totals: { customerDisplayTotal: 7120 }
    }
  });

  const payload = selectionPayload();
  const selectionId = randomUUID();
  const calcId = randomUUID();
  const configurationRepository = {
    async getActiveEnvelope() {
      return { id: ENV_ID, status: "active" };
    },
    async getLatestSelectionForPublicationEnvelope(organizationId, publicationId, envelopeId) {
      assert.equal(organizationId, ORG);
      assert.equal(publicationId, PUB_ID);
      assert.equal(envelopeId, ENV_ID);
      return {
        id: selectionId,
        organization_id: ORG,
        selection_hash: "hash-saved",
        selection_payload_json: payload,
        created_at: "2026-07-31T16:00:00.000Z"
      };
    },
    async getCalculationBySelectionId(organizationId, id) {
      assert.equal(id, selectionId);
      return {
        id: calcId,
        organization_id: ORG,
        selection_id: selectionId,
        baseline_total: 7120,
        configured_total: 11478,
        customer_result_json: {
          baselineDisplayTotal: 7120,
          configuredDisplayTotal: 11478,
          pricedSelectionTotal: 11478,
          publishedBaselineTotal: 7120,
          displayTotalDelta: 4358,
          pricingAuthority: "authoritative_backend_reprice"
        }
      };
    }
  };

  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    configurationRepository,
    studioDigitalEstimateService: {
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: PUB_ID,
            customerUrl: "https://example.test/e/tok",
            customerActivityState: "viewed",
            reviewRequestOpen: true
          },
          activePublication: {
            id: PUB_ID,
            status: "active",
            revisionNumber: 1,
            customerUrl: "https://example.test/e/tok"
          },
          publications: [
            {
              id: PUB_ID,
              status: "active",
              revisionNumber: 1,
              customerUrl: "https://example.test/e/tok"
            }
          ],
          reviewRequests: [
            {
              id: "rr-1",
              status: "open",
              publicationId: PUB_ID,
              requestedAt: "2026-07-31T17:00:00.000Z"
            }
          ]
        };
      },
      async assessReadiness() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: PUB_ID,
            customerUrl: "https://example.test/e/tok",
            customerActivityState: "viewed",
            reviewRequestOpen: true
          },
          activePublication: {
            id: PUB_ID,
            status: "active",
            revisionNumber: 1,
            customerUrl: "https://example.test/e/tok"
          },
          publications: [
            {
              id: PUB_ID,
              status: "active",
              revisionNumber: 1,
              customerUrl: "https://example.test/e/tok"
            }
          ],
          reviewRequests: [
            {
              id: "rr-1",
              status: "open",
              publicationId: PUB_ID,
              requestedAt: "2026-07-31T17:00:00.000Z"
            }
          ]
        };
      }
    }
  });

  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID
  });

  assert.equal(activity.ok, true);
  assert.equal(activity.activity.viewed, true);
  assert.equal(activity.activity.savedSelections, true, "must read real saved selection, not activity-state regex");
  assert.equal(activity.activity.reviewRequested, true);
  assert.equal(activity.activity.lastSavedAt, "2026-07-31T16:00:00.000Z");
  assert.equal(activity.selectionReview.hasSavedSelections, true);
  assert.equal(activity.selectionReview.totals.customerEstimateTotal, 11478);
  assert.equal(activity.selectionReview.totals.difference, 4358);
  assert.match(
    String(activity.selectionReview.pricedSelections.rooms[0]?.material?.label || ""),
    /Aurataj/i
  );
  assert.ok(activity.selectionReview.scopeRequests.count > 0);
  assert.ok(
    !activity.selectionReview.scopeRequests.items.some((i) => i.kind === "material"),
    "material is not a scope request"
  );

  const body = JSON.stringify(activity);
  assert.equal(body.includes("service_role"), false);
  assert.equal(body.includes("pricing_evidence"), false);
  assert.equal(body.includes("internal_evidence_json"), false);

  console.log("ok: 9 getCustomerActivity surfaces saved selections + review + totals");
}

{
  // 10. Active publication with no selections → clean empty state
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID + "-empty",
    createdByUserId: ACTOR,
    scope: {
      ...emptyStudioEstimateScope(),
      customerName: "Empty",
      projectName: "Empty",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      rooms: []
    },
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    approval: {
      approvedAt: "2026-07-30T00:00:00.000Z",
      approvedByUserId: ACTOR,
      customerDisplayTotal: 1000,
      calculationFingerprint: "fp-empty"
    },
    calculationSnapshot: {
      fingerprint: "fp-empty",
      totals: { customerDisplayTotal: 1000 }
    }
  });

  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    configurationRepository: {
      async getActiveEnvelope() {
        return { id: ENV_ID, status: "active" };
      },
      async getLatestSelectionForPublicationEnvelope() {
        return null;
      }
    },
    studioDigitalEstimateService: {
      async assessReadiness() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: PUB_ID,
            customerUrl: "https://example.test/e/tok",
            customerActivityState: "waiting"
          },
          activePublication: { id: PUB_ID, status: "active" },
          publications: [{ id: PUB_ID, status: "active" }],
          reviewRequests: []
        };
      }
    }
  });

  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID + "-empty"
  });
  assert.equal(activity.activity.savedSelections, false);
  assert.equal(activity.selectionReview.hasSavedSelections, false);
  assert.equal(activity.selectionReview.pricedSelections.rooms.length, 0);
  assert.equal(activity.selectionReview.scopeRequests.count, 0);
  console.log("ok: 10 no selections → clean empty state");
}

{
  // 11. Frontend panel + shell wiring
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2CustomerSelectionReviewPanel.tsx"),
    "utf8"
  );
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  assert.ok(panel.includes("studio-v2-customer-selection-review"));
  assert.ok(panel.includes("Priced customer selections"));
  assert.ok(panel.includes("Scope requests requiring review"));
  assert.ok(panel.includes("Staff diagnostics"));
  assert.ok(panel.includes("Read-only review"));
  assert.ok(shell.includes("StudioV2CustomerSelectionReviewPanel"));
  assert.ok(shell.includes("selectionReview"));
  assert.equal(shell.includes("studio-v2-customer-activity"), false);
  assert.ok(!panel.includes("apply changes"), "no apply-changes CTA");
  console.log("ok: 11 frontend panel wired below publish; read-only");
}

{
  // 12. Friendly catalog names — never show raw e100-* slugs when catalog knows the color
  assert.equal(friendlyMaterialLabel("e100-bayshore-sand"), "Bayshore Sand");
  assert.equal(friendlyMaterialLabel("e100-bear-hug"), "Bear Hug");
  assert.equal(friendlyMaterialLabel("e100-axbridge"), "Axbridge");
  assert.equal(friendlyMaterialLabel("e100-carrara-classic"), "Carrara Classic");
  assert.equal(friendlyMaterialLabel("bayshore-sand"), "Bayshore Sand");

  const payload = mergeSelectionPayloadMeta(
    {
      "material:kitchen:e100-bayshore-sand": 1,
      "material:master:e100-bear-hug": 1,
      "material:ll:e100-axbridge": 1
    },
    {
      customerConfiguration: finalizeCustomerConfigurationFoundation({
        selectedMaterial: {
          materialGroup: "promo",
          colorId: "e100-bayshore-sand",
          colorName: null,
          roomId: "kitchen"
        },
        lastSavedAt: "2026-08-02T12:00:00.000Z"
      })
    }
  );
  const review = buildStudioCustomerSelectionReview({
    selection: {
      id: randomUUID(),
      selection_hash: "hash-friendly",
      selection_payload_json: payload,
      created_at: "2026-08-02T12:00:00.000Z"
    },
    calculation: {
      id: randomUUID(),
      baseline_total: 7120,
      configured_total: 8739,
      customer_result_json: {
        baselineDisplayTotal: 7120,
        configuredDisplayTotal: 8739,
        pricedSelectionTotal: 8739,
        publishedBaselineTotal: 7120,
        displayTotalDelta: 1619,
        pricingAuthority: "authoritative_backend_reprice"
      }
    },
    rooms: [
      { id: "kitchen", name: "Kitchen" },
      { id: "master", name: "Master Bath" },
      { id: "ll", name: "LL Bath" }
    ],
    publicationId: PUB_ID,
    envelopeId: ENV_ID,
    reviewRequested: false
  });
  const labels = (review.pricedSelections.rooms || []).map((r) => r.material?.label).filter(Boolean);
  assert.ok(labels.some((l) => /Bayshore Sand/i.test(String(l))));
  const raw = JSON.stringify(review);
  assert.equal(raw.includes("e100-bayshore-sand"), false);
  assert.equal(raw.includes("e100-bear-hug"), false);
  assert.equal(raw.includes("service_role"), false);
  console.log("ok: 12 Studio V2 review shows friendly material names");
}

{
  // 13. Saved selections only (no Send selections) → Review requested: No
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID + "-saved-only",
    createdByUserId: ACTOR,
    scope: {
      ...emptyStudioEstimateScope(),
      customerName: "Acme",
      projectName: "Kitchen",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      rooms: [{ id: "kitchen", name: "Kitchen", included: true, pieces: [] }]
    },
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    approval: {
      approvedAt: "2026-07-30T00:00:00.000Z",
      approvedByUserId: ACTOR,
      customerDisplayTotal: 7120,
      calculationFingerprint: "fp-saved-only"
    },
    calculationSnapshot: {
      fingerprint: "fp-saved-only",
      totals: { customerDisplayTotal: 7120 }
    }
  });

  const selectionId = randomUUID();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    configurationRepository: {
      async getActiveEnvelope() {
        return { id: ENV_ID, status: "active" };
      },
      async getLatestSelectionForPublicationEnvelope() {
        // Priced material/edge only — no physical scope requests.
        return {
          id: selectionId,
          organization_id: ORG,
          selection_hash: "hash-saved-only",
          selection_payload_json: {
            version: 1,
            rooms: {
              kitchen: {
                materialId: "e100-aurataj",
                materialGroup: "C",
                edgeProfileId: "edge-eased"
              }
            }
          },
          created_at: "2026-08-02T12:00:00.000Z"
        };
      },
      async getCalculationBySelectionId() {
        return {
          id: randomUUID(),
          organization_id: ORG,
          selection_id: selectionId,
          baseline_total: 7120,
          configured_total: 8739,
          customer_result_json: {
            baselineDisplayTotal: 7120,
            configuredDisplayTotal: 8739,
            pricedSelectionTotal: 8739,
            publishedBaselineTotal: 7120,
            displayTotalDelta: 1619,
            pricingAuthority: "authoritative_backend_reprice"
          }
        };
      }
    },
    studioDigitalEstimateService: {
      async assessReadiness() {
        return {
          publicationSummary: {
            state: "customer_viewed",
            active: true,
            statusLabel: "Published — customer viewed",
            publicationId: PUB_ID,
            customerUrl: "https://example.test/e/tok",
            customerActivityState: "viewed",
            reviewRequestOpen: false
          },
          activePublication: { id: PUB_ID, status: "active", revisionNumber: 1 },
          publications: [{ id: PUB_ID, status: "active", revisionNumber: 1 }],
          reviewRequests: []
        };
      }
    }
  });

  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID + "-saved-only"
  });
  assert.equal(activity.activity.savedSelections, true);
  assert.equal(activity.activity.reviewRequested, false);
  assert.equal(activity.selectionReview.reviewRequested, false);
  assert.equal(activity.activity.accepted, false);
  assert.equal(activity.selectionReview.scopeRequests.count, 0);
  assert.ok(
    !activity.selectionReview.scopeRequests.items.some((i) => i.kind === "material"),
    "priced material is not a physical scope request"
  );
  console.log("ok: 13 saved selections only → Review requested No; no scope requests");
}

{
  // 14. Customer clicked Send selections → DE status `review_requested` → Review requested: Yes
  // Stub summary intentionally leaves reviewRequestOpen false so the status mapping is authoritative.
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID + "-review",
    createdByUserId: ACTOR,
    scope: {
      ...emptyStudioEstimateScope(),
      customerName: "Acme",
      projectName: "Kitchen",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      rooms: [{ id: "kitchen", name: "Kitchen", included: true, pieces: [] }]
    },
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    approval: {
      approvedAt: "2026-07-30T00:00:00.000Z",
      approvedByUserId: ACTOR,
      customerDisplayTotal: 7120,
      calculationFingerprint: "fp-review"
    },
    calculationSnapshot: {
      fingerprint: "fp-review",
      totals: { customerDisplayTotal: 7120 }
    }
  });

  const payload = selectionPayload();
  const selectionId = randomUUID();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    configurationRepository: {
      async getActiveEnvelope() {
        return { id: ENV_ID, status: "active" };
      },
      async getLatestSelectionForPublicationEnvelope() {
        return {
          id: selectionId,
          organization_id: ORG,
          selection_hash: "hash-review",
          selection_payload_json: payload,
          created_at: "2026-08-02T12:00:00.000Z"
        };
      },
      async getCalculationBySelectionId() {
        return {
          id: randomUUID(),
          organization_id: ORG,
          selection_id: selectionId,
          baseline_total: 7120,
          configured_total: 8739,
          customer_result_json: {
            baselineDisplayTotal: 7120,
            configuredDisplayTotal: 8739,
            pricedSelectionTotal: 8739,
            publishedBaselineTotal: 7120,
            displayTotalDelta: 1619,
            pricingAuthority: "authoritative_backend_reprice"
          }
        };
      }
    },
    studioDigitalEstimateService: {
      async assessReadiness() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: PUB_ID,
            customerUrl: "https://example.test/e/tok",
            customerActivityState: "viewed",
            // Must not rely on this stub flag — production writes status review_requested.
            reviewRequestOpen: false
          },
          activePublication: { id: PUB_ID, status: "active", revisionNumber: 1 },
          publications: [{ id: PUB_ID, status: "active", revisionNumber: 1 }],
          reviewRequests: [
            {
              id: "rr-open",
              status: "review_requested",
              publicationId: PUB_ID,
              requestedAt: "2026-08-02T13:00:00.000Z"
            }
          ]
        };
      }
    }
  });

  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID + "-review"
  });
  assert.equal(activity.activity.reviewRequested, true);
  assert.equal(activity.selectionReview.reviewRequested, true);
  assert.equal(activity.activity.savedSelections, true);
  assert.equal(activity.activity.accepted, false);
  assert.equal(activity.selectionReview.totals.customerEstimateTotal, 8739);
  assert.equal(activity.selectionReview.totals.difference, 1619);
  assert.ok(activity.selectionReview.pricedSelections.rooms.length > 0);
  assert.ok(activity.selectionReview.scopeRequests.count > 0);
  assert.ok(
    !activity.selectionReview.scopeRequests.items.some((i) => i.kind === "material"),
    "priced material is not a physical scope request"
  );
  assert.equal(activity.reviewRequests.some((r) => r.open && r.status === "review_requested"), true);
  console.log("ok: 14 Send selections (review_requested) → Review requested Yes; totals preserved");
}

{
  // 15. Publication summary recognizes real DE.2F status (not only legacy "open")
  const { buildSafeStudioPublicationSummary } = await import("./studioPublicationSummary.mjs");
  const s = buildSafeStudioPublicationSummary({
    estimate: { id: "est-rr", revision: 1 },
    activePublication: {
      id: PUB_ID,
      status: "active",
      revisionNumber: 1,
      customerUrl: "https://example.test/e/tok",
      linkStatus: "active"
    },
    reviewRequests: [
      {
        id: "rr-de",
        status: "review_requested",
        publication_id: PUB_ID
      }
    ]
  });
  assert.equal(s.reviewRequestOpen, true);
  assert.equal(s.customerActivityState, "review_requested");
  assert.equal(s.state, "customer_review_requested");
  console.log("ok: 15 publication summary open for review_requested");
}

{
  // 16. No approval/publish/calculate side effects in selection-review path
  const src = readFileSync(
    join(__dirname, "studioCustomerSelectionReview.mjs"),
    "utf8"
  );
  const v2Src = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  const activityFn = v2Src.slice(
    v2Src.indexOf("async function getCustomerActivity"),
    v2Src.indexOf("return {\n    getWorkingDraft")
  );
  for (const forbidden of [
    "autoApprove",
    "autoCalculate",
    "simplified-publish",
    "refresh-from-takeoff",
    "ensure-editable-draft"
  ]) {
    assert.equal(src.includes(forbidden), false, `selection review must not mention ${forbidden}`);
    assert.equal(
      activityFn.includes(forbidden),
      false,
      `getCustomerActivity must not mention ${forbidden}`
    );
  }
  assert.equal(activityFn.includes("createSiblingRevisionFrom"), false);
  assert.ok(activityFn.includes("isOpenDigitalEstimateReviewRequestStatus"));
  console.log("ok: 16 no approval/publish/calculate/revision side effects on reviewRequested");
}

console.log("\nAll studioCustomerSelectionReview tests passed.\n");
