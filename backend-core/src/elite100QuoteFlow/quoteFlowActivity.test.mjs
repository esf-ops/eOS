/**
 * Elite 100 Quote Flow — Activity tab + customer selections + library collapse.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowActivity.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  buildQuoteFlowActivityPayload,
  createQuoteFlowActivityService
} from "./quoteFlowActivity.mjs";
import {
  loadQuoteFlowCustomerSelectionReview,
  mapQuoteFlowCustomerSelectionStatus
} from "./quoteFlowCustomerSelections.mjs";
import { selectOfficialQuoteFlowLibraryRows } from "./quoteFlowLibraryRows.mjs";
import { createQuoteFlowEstimatesService } from "./quoteFlowEstimates.mjs";
import {
  buildStudioCustomerSelectionReview,
  presentSelectionComparisonFromCalculation
} from "../elite100EstimateStudio/studioCustomerSelectionReview.mjs";
import { finalizeCustomerConfigurationFoundation } from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { mergeSelectionPayloadMeta } from "../digitalEstimate/configuration/customerConfigurationDraft.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nquoteFlowActivity.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "case-activity-1";
const EST_R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const EST_R2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const EST_UNSCOPED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const PUB_ID = "pub-2";
const ENV_ID = "env-2";

function scopedRow(id, revision, extras = {}) {
  return {
    id,
    intakeCaseId: CASE,
    revision,
    status: "approved",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: `2026-08-0${revision}T12:00:00.000Z`,
    takeoffJobId: "to-1",
    approval: {
      approvedAt: "2026-08-02T15:00:00.000Z",
      approvedByUserId: "actor-1",
      calculationFingerprint: "fp-1",
      customerDisplayTotal: 4200
    },
    calculationSnapshot: {
      fingerprint: "fp-1",
      calculatedAt: "2026-08-02T14:00:00.000Z",
      pricingEngine: "elite100-room-pricing-v1",
      pricingVersion: 4,
      totals: { customerDisplayTotal: 4200, exactInternalTotal: 4000 }
    },
    scope: {
      projectName: "Activity Kitchen",
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          included: true,
          pieces: [{ id: "p1", name: "Island", included: true, openEdgeLf: 10, lengthIn: 96, depthIn: 25.5 }]
        }
      ],
      quoteFlowReview: {
        status: "approved",
        approvedAt: "2026-08-02T15:00:00.000Z",
        approvedByUserId: "actor-1",
        calculationFingerprint: "fp-1"
      },
      quoteFlowDigitalEstimate: {
        status: "published",
        publishedAt: "2026-08-03T16:00:00.000Z",
        publishedByUserId: "actor-1",
        publicationId: "pub-1",
        customerUrl: "http://localhost:5190/e/token-1",
        sourceApprovalFingerprint: "fp-1",
        sourceCalculationFingerprint: "fp-1"
      },
      ...extras.scope
    },
    ...extras
  };
}

function edgeChangeSelectionReview({ reviewRequested = true } = {}) {
  const payload = mergeSelectionPayloadMeta(
    {
      "material:kitchen:e100-bear-hug": 1,
      "edge:kitchen:edge_small_ogee": 1
    },
    {
      customerConfiguration: finalizeCustomerConfigurationFoundation({
        selectedMaterial: {
          colorId: "e100-bear-hug",
          colorName: "Bear Hug",
          roomId: "kitchen"
        },
        selectedEdgeProfile: {
          profileToken: "edge_small_ogee",
          profileName: "Small Ogee",
          roomId: "kitchen"
        },
        lastSavedAt: "2026-08-04T18:00:00.000Z"
      })
    }
  );
  return buildStudioCustomerSelectionReview({
    selection: {
      id: randomUUID(),
      selection_hash: "hash-edge",
      selection_payload_json: payload,
      created_at: "2026-08-04T18:00:00.000Z"
    },
    calculation: {
      id: randomUUID(),
      baseline_total: 4310,
      configured_total: 4873,
      customer_result_json: {
        baselineDisplayTotal: 4310,
        configuredDisplayTotal: 4873,
        pricedSelectionTotal: 4873,
        publishedBaselineTotal: 4310,
        displayTotalDelta: 563,
        pricingAuthority: "authoritative_backend_reprice",
        roomPricingChanges: {
          kind: "changes",
          totalDelta: 563,
          rows: [
            {
              roomName: "Kitchen",
              category: "edge",
              categoryLabel: "Edge profile",
              originalLabel: "Eased",
              updatedLabel: "Small Ogee",
              amountDelta: 563,
              status: "changed"
            },
            {
              roomName: "Kitchen",
              category: "material",
              categoryLabel: "Material",
              originalLabel: "Carrara Classic",
              updatedLabel: "Bear Hug",
              amountDelta: 0,
              status: "changed"
            }
          ]
        }
      }
    },
    rooms: [{ id: "kitchen", name: "Kitchen", roomKey: "kitchen" }],
    publicationId: PUB_ID,
    envelopeId: ENV_ID,
    reviewRequested
  });
}

{
  const r1 = scopedRow(EST_R1, 1);
  const r2 = scopedRow(EST_R2, 2, {
    scope: {
      ...scopedRow(EST_R2, 2).scope,
      quoteFlowDigitalEstimate: {
        ...scopedRow(EST_R2, 2).scope.quoteFlowDigitalEstimate,
        publicationId: "pub-2",
        customerUrl: "http://localhost:5190/e/token-2",
        publishedAt: "2026-08-04T10:00:00.000Z"
      }
    }
  });
  const unscoped = {
    id: EST_UNSCOPED,
    intakeCaseId: CASE,
    revision: 3,
    status: "draft",
    scope: { rooms: [] }
  };
  const selected = selectOfficialQuoteFlowLibraryRows([r1, r2, unscoped]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, EST_R2);
  console.log("ok: library collapse keeps one official row per intake case (highest revision)");
}

{
  const row = scopedRow(EST_R2, 2);
  const activity = buildQuoteFlowActivityPayload(row, {
    publications: [
      {
        id: "pub-1",
        status: "superseded",
        publishedAt: "2026-08-03T16:00:00.000Z",
        revisionLabel: "R1",
        supersededAt: "2026-08-04T10:00:00.000Z",
        customerUrl: "http://localhost:5190/e/token-1"
      },
      {
        id: "pub-2",
        status: "active",
        publishedAt: "2026-08-04T10:00:00.000Z",
        revisionLabel: "R2",
        customerUrl: "http://localhost:5190/e/token-2",
        linkStatus: "active"
      }
    ],
    activePublication: {
      id: "pub-2",
      status: "active",
      publishedAt: "2026-08-04T10:00:00.000Z",
      customerUrl: "http://localhost:5190/e/token-2"
    },
    publicationEvents: [],
    reviewRequests: [],
    organizationId: ORG
  });

  assert.equal(activity.ok, true);
  assert.ok(activity.timeline.some((e) => e.type === "review_approved"));
  assert.ok(activity.timeline.some((e) => e.type === "de_published" || e.type === "de_republished"));
  assert.equal(activity.publicationHistory.length, 2);
  assert.equal(activity.summary.customerLinkAvailable, true);
  assert.match(String(activity.customerSelections.label), /No customer selections yet/i);
  assert.equal(activity.selectionReview?.hasSavedSelections, false);
  assert.equal(activity.sideEffects.sold, false);
  assert.equal(activity.sideEffects.accepted, false);
  assert.equal(activity.sideEffects.handoffCreated, false);
  assert.equal(activity.sideEffects.emailed, false);
  assert.equal(activity.sideEffects.mutated, false);
  console.log("ok: activity returns no customer selections when none exist");
}

{
  // Reuses previous-head helper: buildStudioCustomerSelectionReview + roomPricingChanges
  const review = edgeChangeSelectionReview({ reviewRequested: true });
  assert.equal(review.hasSavedSelections, true);
  assert.equal(review.totals.publishedBaselineTotal, 4310);
  assert.equal(review.totals.customerEstimateTotal, 4873);
  assert.equal(review.totals.difference, 563);
  const edgeRow = review.selectionComparison.rows.find((r) => /edge/i.test(r.category));
  assert.ok(edgeRow);
  assert.equal(edgeRow.publishedSelection, "Eased");
  assert.equal(edgeRow.customerSelection, "Small Ogee");
  assert.equal(edgeRow.priceDelta, 563);
  const materialRow = review.selectionComparison.rows.find((r) => /material/i.test(r.category));
  assert.ok(materialRow);
  assert.equal(materialRow.publishedSelection, "Carrara Classic");
  assert.equal(materialRow.customerSelection, "Bear Hug");
  const kitchen = review.pricedSelections.rooms.find((r) => r.roomKey === "kitchen");
  assert.match(String(kitchen?.edge?.label || ""), /Small Ogee/i);
  assert.match(String(kitchen?.material?.label || ""), /Bear Hug/i);

  const raw = JSON.stringify(review);
  assert.equal(raw.includes("exactInternalTotal"), false);
  assert.equal(raw.includes("pricing_evidence"), false);
  assert.equal(raw.includes("service_role"), false);
  assert.equal(raw.includes("selection_payload_json"), false);
  assert.equal(raw.includes("internal_evidence"), false);

  const activity = buildQuoteFlowActivityPayload(scopedRow(EST_R2, 2), {
    activePublication: { id: PUB_ID, status: "active", customerUrl: "http://localhost:5190/e/token-2" },
    publications: [{ id: PUB_ID, status: "active", customerUrl: "http://localhost:5190/e/token-2" }],
    selectionReview: review,
    reviewRequests: [{ id: "rr-1", status: "review_requested", requestedAt: "2026-08-04T18:05:00.000Z" }],
    organizationId: ORG
  });
  assert.equal(activity.customerSelections.key, "needs_staff_review");
  assert.equal(activity.summary.needsStaffReview, true);
  assert.equal(activity.summary.customerChangesReceived, true);
  assert.equal(activity.summary.publishedCustomerTotal, 4310);
  assert.equal(activity.summary.customerSelectedTotal, 4873);
  assert.equal(activity.summary.customerSelectionDifference, 563);
  assert.ok(activity.selectionReview.selectionComparison.rows.some((r) => r.customerSelection === "Small Ogee"));
  assert.equal(activity.sideEffects.sold, false);
  assert.equal(activity.sideEffects.accepted, false);
  assert.equal(activity.sideEffects.handoffCreated, false);
  console.log("ok: edge/material before-after + totals + needs staff review via Studio helper");
}

{
  const cmp = presentSelectionComparisonFromCalculation({
    customer_result_json: {
      roomPricingChanges: {
        rows: [
          {
            roomName: "Kitchen",
            categoryLabel: "Edge profile",
            originalLabel: "Eased",
            updatedLabel: "Small Ogee",
            amountDelta: 563,
            status: "changed"
          }
        ],
        totalDelta: 563
      }
    }
  });
  assert.equal(cmp.rows[0].publishedSelection, "Eased");
  assert.equal(cmp.rows[0].customerSelection, "Small Ogee");
  assert.equal(cmp.totalDelta, 563);
  console.log("ok: presentSelectionComparisonFromCalculation maps DE roomPricingChanges");
}

{
  const emptyStatus = mapQuoteFlowCustomerSelectionStatus(
    { hasSavedSelections: false, pricedSelections: { selectionChangeCount: 0 }, totals: {} },
    { hasLink: true, hasView: false }
  );
  assert.equal(emptyStatus.key, "none");
  const opened = mapQuoteFlowCustomerSelectionStatus(
    { hasSavedSelections: false, pricedSelections: { selectionChangeCount: 0 }, totals: {} },
    { hasLink: true, hasView: true }
  );
  assert.match(opened.label, /opened link.*no changes/i);
  console.log("ok: customer selection status mapping for empty / opened");
}

{
  const byId = new Map([
    [EST_R2, scopedRow(EST_R2, 2)],
    [EST_UNSCOPED, { id: EST_UNSCOPED, status: "draft", scope: { rooms: [] } }]
  ]);
  const repo = {
    async getById(_org, id) {
      return byId.has(id) ? structuredClone(byId.get(id)) : null;
    },
    async listActiveForOrganization() {
      return [scopedRow(EST_R1, 1), scopedRow(EST_R2, 2)];
    }
  };

  const selectionPayload = mergeSelectionPayloadMeta(
    { "edge:kitchen:edge_small_ogee": 1, "material:kitchen:e100-bear-hug": 1 },
    {
      customerConfiguration: finalizeCustomerConfigurationFoundation({
        selectedEdgeProfile: {
          profileToken: "edge_small_ogee",
          profileName: "Small Ogee",
          roomId: "kitchen"
        },
        selectedMaterial: {
          colorId: "e100-bear-hug",
          colorName: "Bear Hug",
          roomId: "kitchen"
        },
        lastSavedAt: "2026-08-04T18:00:00.000Z"
      })
    }
  );
  const selectionId = randomUUID();
  const configurationRepository = {
    async getActiveEnvelope() {
      return { id: ENV_ID, status: "active" };
    },
    async getLatestSelectionForPublicationEnvelope() {
      return {
        id: selectionId,
        selection_hash: "h1",
        selection_payload_json: selectionPayload,
        created_at: "2026-08-04T18:00:00.000Z"
      };
    },
    async getCalculationBySelectionId() {
      return {
        id: randomUUID(),
        baseline_total: 4310,
        configured_total: 4873,
        customer_result_json: {
          publishedBaselineTotal: 4310,
          pricedSelectionTotal: 4873,
          configuredDisplayTotal: 4873,
          displayTotalDelta: 563,
          pricingAuthority: "authoritative_backend_reprice",
          roomPricingChanges: {
            totalDelta: 563,
            rows: [
              {
                roomName: "Kitchen",
                categoryLabel: "Edge profile",
                originalLabel: "Eased",
                updatedLabel: "Small Ogee",
                amountDelta: 563,
                status: "changed"
              }
            ]
          },
          // Forbidden internals must not leak through scrub
          pricing_evidence: { secret: true },
          exactInternalTotal: 9999
        }
      };
    }
  };

  const activity = createQuoteFlowActivityService({
    estimateRepository: repo,
    studioDigitalEstimateService: {
      async listPublications() {
        return {
          publications: [
            {
              id: PUB_ID,
              status: "active",
              publishedAt: "2026-08-04T10:00:00.000Z",
              customerUrl: "http://localhost:5190/e/token-2"
            }
          ],
          activePublication: {
            id: PUB_ID,
            status: "active",
            customerUrl: "http://localhost:5190/e/token-2"
          }
        };
      },
      async assessReadiness() {
        return {
          reviewRequests: [
            { id: "rr-1", status: "review_requested", requestedAt: "2026-08-04T18:05:00.000Z" }
          ]
        };
      }
    },
    configurationRepository,
    env: {}
  });

  const loaded = await activity.getActivity({ organizationId: ORG, estimateId: EST_R2 });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.selectionReview.hasSavedSelections, true);
  assert.equal(loaded.summary.publishedCustomerTotal, 4310);
  assert.equal(loaded.summary.customerSelectedTotal, 4873);
  assert.equal(loaded.summary.customerSelectionDifference, 563);
  assert.ok(
    loaded.selectionReview.selectionComparison.rows.some(
      (r) => r.publishedSelection === "Eased" && r.customerSelection === "Small Ogee"
    )
  );
  assert.match(String(loaded.customerSelections.label), /staff review|submitted/i);
  const loadedRaw = JSON.stringify(loaded);
  assert.equal(loadedRaw.includes("pricing_evidence"), false);
  assert.equal(loadedRaw.includes("exactInternalTotal"), false);
  assert.equal(loaded.sideEffects.sold, false);
  assert.equal(loaded.sideEffects.accepted, false);
  assert.equal(loaded.sideEffects.handoffCreated, false);
  assert.equal(loaded.sideEffects.emailed, false);
  assert.equal(loaded.sideEffects.mutated, false);

  await assert.rejects(
    () => activity.getActivity({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );

  const estimates = createQuoteFlowEstimatesService({ estimateRepository: repo, env: {} });
  const listed = await estimates.listEstimates({ organizationId: ORG });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].estimateId, EST_R2);
  console.log("ok: activity service loads DE selections via previous-head helpers; no mutations");
}

{
  const emptyLoad = await loadQuoteFlowCustomerSelectionReview({
    organizationId: ORG,
    estimate: scopedRow(EST_R2, 2),
    activePublication: { id: PUB_ID },
    reviewRequests: [],
    configurationRepository: {
      async getActiveEnvelope() {
        return { id: ENV_ID, status: "active" };
      },
      async getLatestSelectionForPublicationEnvelope() {
        return null;
      }
    }
  });
  assert.equal(emptyLoad.hasSavedSelections, false);
  assert.equal(emptyLoad.selectionComparison.rows.length, 0);
  console.log("ok: loadQuoteFlowCustomerSelectionReview empty when no selection row");
}

{
  const src = readFileSync(join(__dirname, "quoteFlowActivity.mjs"), "utf8");
  assert.match(src, /buildStudioCustomerSelectionReview|loadQuoteFlowCustomerSelectionReview/);
  assert.doesNotMatch(src, /markSold|finalAcceptance|sendEmail|notifyCustomer/i);
  assert.match(src, /sold:\s*false/);
  assert.match(src, /accepted:\s*false/);
  assert.match(src, /handoffCreated:\s*false/);
  const helper = readFileSync(join(__dirname, "quoteFlowCustomerSelections.mjs"), "utf8");
  assert.match(helper, /buildStudioCustomerSelectionReview/);
  assert.doesNotMatch(helper, /markSold|createJob|sendEmail|createHandoff|finalAcceptance/i);
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /estimates\/:estimateId\/activity/);
  assert.match(routes, /configurationRepository/);
  assert.match(routes, /quoteFlowActivityService/);
  const lib = readFileSync(join(__dirname, "quoteFlowLibraryRows.mjs"), "utf8");
  assert.match(lib, /selectOfficialQuoteFlowLibraryRows/);
  assert.match(lib, /Does not delete sibling revisions|non-destructive/i);
  assert.doesNotMatch(lib, /\.delete\(|destroy\(|hardReset|TRUNCATE/i);
  console.log("ok: route/source contracts; reuses Studio selection review; no sold/handoff");
}

console.log("\nquoteFlowActivity.test.mjs: ok\n");
