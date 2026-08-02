/**
 * Studio V2 — create editable revision from submitted Digital Estimate selections.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2CustomerSelectionRevision.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import {
  mapCustomerConfigurationToStudioV2DraftPatch
} from "./studioV2CustomerSelectionRevision.mjs";
import {
  STUDIO_ESTIMATE_STATUSES,
  emptyStudioEstimateScope
} from "./studioEstimateTypes.mjs";
import { REVIEW_STATUS } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { CUSTOMER_CONFIGURATION_FOUNDATION_KEY } from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PUB_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQUEST_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SELECTION_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function sourceScope() {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    materialGroup: "Group Promo",
    colorName: "Published Color",
    edgeProfileToken: "edge_eased",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "run-1",
            name: "Main run",
            included: true,
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            sqft: 17,
            edgeProfileToken: "edge_eased"
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1 },
    customLineItems: []
  };
}

function reviewRequest() {
  return {
    id: REQUEST_ID,
    organization_id: ORG,
    publication_id: PUB_ID,
    selection_id: SELECTION_ID,
    selection_hash: "submitted-selection-hash",
    status: REVIEW_STATUS.REQUESTED,
    created_at: "2026-08-02T18:00:00.000Z",
    request_snapshot_json: {
      selectedOptions: [
        {
          optionKey: "material:kitchen:e100-bayshore-sand",
          displayLabel: "Bayshore Sand",
          quantity: 1
        },
        {
          optionKey: "edge:kitchen:edge_small_ogee",
          displayLabel: "Small Ogee",
          quantity: 1
        },
        {
          optionKey: "sink:kitchen:esf:blanco:precis-50-50:coal-black",
          displayLabel: "Precis 50/50 Sinks · Coal Black",
          quantity: 1
        },
        {
          optionKey: "backsplash:kitchen:include",
          displayLabel: "Include backsplash",
          quantity: 1
        }
      ]
    }
  };
}

function submittedSelection() {
  return {
    id: SELECTION_ID,
    organization_id: ORG,
    selection_hash: "submitted-selection-hash",
    selection_payload_json: {
      "material:kitchen:e100-bayshore-sand": 1,
      "edge:kitchen:edge_small_ogee": 1,
      "sink:kitchen:esf:blanco:precis-50-50:coal-black": 1,
      [CUSTOMER_CONFIGURATION_FOUNDATION_KEY]: {
        selectedMaterial: {
          roomId: "kitchen",
          colorId: "e100-bayshore-sand",
          colorName: "Bayshore Sand",
          materialGroup: "Group Promo"
        },
        selectedEdgeProfile: {
          roomId: "kitchen",
          profileToken: "edge_small_ogee",
          profileName: "Small Ogee"
        },
        backsplashPreference: {
          preference: "request_change",
          note: "Add full-height splash"
        },
        requestedOpenings: [
          {
            id: "opening-1",
            roomId: "kitchen",
            type: "cooktop",
            quantity: 1,
            note: "Move opening; customer says length should be 999"
          }
        ],
        requestedWaterfalls: [
          {
            id: "waterfall-1",
            roomId: "kitchen",
            side: "left",
            legHeight: 36
          }
        ],
        customerNotes: [
          {
            id: "note-1",
            note: "Please make the island ten feet long"
          }
        ],
        exactTotal: 1
      },
      __projectNote: "Customer asked for an extra room",
      __roomNotes: {
        kitchen: "Verify all dimensions before fabrication"
      },
      configuredDisplayTotal: 1
    }
  };
}

console.log("\nstudioV2CustomerSelectionRevision.test.mjs\n");

{
  const mapped = mapCustomerConfigurationToStudioV2DraftPatch({
    sourceScope: sourceScope(),
    reviewRequest: reviewRequest(),
    selection: submittedSelection(),
    actorUserId: ACTOR
  });
  assert.equal(mapped.scope.colorName, "Bayshore Sand");
  assert.equal(mapped.scope.materialGroup, "Group Promo");
  assert.equal(mapped.scope.rooms[0].materialGroupOverride, "Group Promo");
  assert.equal(mapped.scope.edgeProfileToken, "edge_small_ogee");
  assert.equal(mapped.scope.rooms[0].pieces[0].edgeProfileToken, "edge_small_ogee");
  assert.equal(mapped.scope.rooms[0].pieces[0].lengthIn, 96, "customer note cannot change dimensions");
  assert.equal(mapped.scope.addOns["qty-sink"], 1, "customer product cannot change physical cutouts");
  assert.equal(mapped.scope.configuredDisplayTotal, undefined);
  assert.equal(mapped.scope.exactTotal, undefined);
  assert.ok(mapped.appliedSummary.some((item) => item.kind === "material_color"));
  assert.ok(mapped.appliedSummary.some((item) => item.kind === "edge"));
  assert.ok(
    mapped.appliedSummary.some((item) => item.kind === "sink"),
    "allowed sink selections stay customer configuration, not revision warnings"
  );
  assert.equal(
    mapped.notAppliedRequests.some((item) => item.kind === "sink"),
    false
  );
  assert.ok(mapped.notAppliedRequests.some((item) => item.kind === "opening"));
  assert.ok(mapped.notAppliedRequests.some((item) => item.kind === "waterfall"));
  assert.ok(mapped.notAppliedRequests.some((item) => item.kind === "backsplash_change_request"));
  assert.ok(mapped.notAppliedRequests.some((item) => item.kind === "project_note"));
  assert.equal(mapped.classification.requiresEliteReview, true);
  console.log("ok: 1 safe design choices apply; products/scope requests remain review notes");
}

{
  const selectionOnly = {
    ...submittedSelection(),
    selection_payload_json: {
      "material:kitchen:e100-bayshore-sand": 1,
      "edge:kitchen:edge_small_ogee": 1,
      "sink:kitchen:esf:blanco:precis-50-50:coal-black": 1,
      [CUSTOMER_CONFIGURATION_FOUNDATION_KEY]: {
        selectedMaterial: {
          roomId: "kitchen",
          colorId: "e100-bayshore-sand",
          colorName: "Bayshore Sand",
          materialGroup: "Group Promo"
        },
        selectedEdgeProfile: {
          roomId: "kitchen",
          profileToken: "edge_small_ogee",
          profileName: "Small Ogee"
        },
        backsplashPreference: { preference: "keep_approved" },
        requestedOpenings: [],
        requestedWaterfalls: [],
        customerNotes: []
      }
    }
  };
  const mapped = mapCustomerConfigurationToStudioV2DraftPatch({
    sourceScope: sourceScope(),
    reviewRequest: {
      ...reviewRequest(),
      request_snapshot_json: {
        selectedOptions: [
          {
            optionKey: "material:kitchen:e100-bayshore-sand",
            displayLabel: "Bayshore Sand",
            quantity: 1
          },
          {
            optionKey: "edge:kitchen:edge_small_ogee",
            displayLabel: "Small Ogee",
            quantity: 1
          },
          {
            optionKey: "sink:kitchen:esf:blanco:precis-50-50:coal-black",
            displayLabel: "Precis 50/50 Sinks · Coal Black",
            quantity: 1
          },
          {
            optionKey: "backsplash:kitchen:keep_approved",
            displayLabel: "Keep approved backsplash",
            quantity: 1
          }
        ]
      }
    },
    selection: selectionOnly,
    actorUserId: ACTOR
  });
  assert.equal(mapped.classification.requiresEliteReview, false);
  assert.equal(mapped.classification.reviewKind, "selection_only");
  assert.ok(mapped.appliedSummary.some((item) => item.kind === "sink"));
  assert.ok(mapped.appliedSummary.some((item) => item.kind === "backsplash_preference"));
  assert.equal(mapped.notAppliedRequests.length, 0);
  console.log("ok: 1b selection-only choices do not require Elite review / revision notes");
}

function harness({ accepted = false, includeReview = true } = {}) {
  const repo = new InMemoryStudioEstimateRepository();
  const request = reviewRequest();
  const state = {
    request,
    selection: submittedSelection(),
    publicationId: PUB_ID,
    publicationRevision: 1
  };
  const events = [];
  const amendmentRepository = {
    async getReviewRequest(organizationId, requestId) {
      if (
        organizationId !== ORG ||
        requestId !== state.request.id ||
        !includeReview
      ) return null;
      return structuredClone(state.request);
    },
    async updateReviewRequestStatus(organizationId, requestId, status) {
      assert.equal(organizationId, ORG);
      assert.equal(requestId, state.request.id);
      state.request.status = status;
      return structuredClone(state.request);
    },
    async claimReviewRequestStatus(organizationId, requestId, fromStatuses, status) {
      if (
        organizationId !== ORG ||
        requestId !== state.request.id ||
        !includeReview
      ) return null;
      if (!(fromStatuses || []).includes(state.request.status)) return null;
      state.request.status = status;
      return structuredClone(state.request);
    },
    async appendEvent(event) {
      events.push(structuredClone(event));
      return event;
    }
  };
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    studioEstimateService: { repository: repo },
    studioDigitalEstimateService: {
      async assessReadiness() {
        return {
          publications: [
            {
              id: state.publicationId,
              status: "active",
              revisionNumber: state.publicationRevision
            }
          ],
          activePublication: {
            id: state.publicationId,
            publicationId: state.publicationId,
            status: "active",
            revisionNumber: state.publicationRevision
          },
          publicationSummary: {
            active: true,
            state: "published",
            publicationId: state.publicationId,
            reviewRequestOpen: includeReview
          },
          reviewRequests: includeReview
            ? [
                {
                  id: state.request.id,
                  status: state.request.status,
                  publicationId: state.publicationId,
                  requestedAt: state.request.created_at
                }
              ]
            : []
        };
      }
    },
    amendmentRepository,
    configurationRepository: {
      async getSelectionById(organizationId, selectionId) {
        return organizationId === ORG && selectionId === state.selection.id
          ? structuredClone(state.selection)
          : null;
      }
    },
    lifecycleRepository: {
      async getAcceptanceForEstimate() {
        return accepted ? { id: "acceptance-1" } : null;
      }
    }
  });
  return { repo, v2, request, state, events };
}

async function seedApproved(repo) {
  return repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: sourceScope(),
    calculationSnapshot: {
      fingerprint: "approved-calc",
      totals: { exactTotal: 1000, customerDisplayTotal: 1000 }
    },
    approval: {
      approvedAt: "2026-08-02T17:00:00.000Z",
      approvedByUserId: ACTOR,
      calculationFingerprint: "approved-calc"
    }
  });
}

{
  const { repo, v2, request, events } = harness();
  const source = await seedApproved(repo);
  const sourceBefore = await repo.getById(ORG, source.id);
  const result = await v2.createRevisionFromCustomerSelections({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      publicationId: PUB_ID,
      reviewRequestId: REQUEST_ID,
      clientMutationId: "customer-revision-1"
    }
  });
  assert.equal(result.created, true);
  assert.equal(result.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.equal(result.customerSelectionRevision.createdFromCustomerSelections, true);
  assert.equal(result.customerSelectionRevision.needsRecalculation, true);
  assert.ok(result.notAppliedScopeRequests.some((item) => item.kind === "opening"));
  assert.equal(request.status, REVIEW_STATUS.AMENDMENT_PREPARED);
  assert.equal(events.length, 1);

  const revised = await repo.getById(ORG, result.estimateId);
  assert.equal(revised.approval, null);
  assert.equal(revised.calculationSnapshot, null);
  assert.equal(revised.scope.colorName, "Bayshore Sand");
  assert.equal(revised.scope.rooms[0].pieces[0].lengthIn, 96);

  const sourceAfter = await repo.getById(ORG, source.id);
  assert.deepEqual(sourceAfter.scope, sourceBefore.scope);
  assert.deepEqual(sourceAfter.approval, sourceBefore.approval);
  assert.deepEqual(sourceAfter.calculationSnapshot, sourceBefore.calculationSnapshot);
  assert.equal(sourceAfter.status, STUDIO_ESTIMATE_STATUSES.APPROVED);

  const duplicate = await v2.createRevisionFromCustomerSelections({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      publicationId: PUB_ID,
      reviewRequestId: REQUEST_ID,
      clientMutationId: "customer-revision-double-click"
    }
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.estimateId, result.estimateId);
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 2);

  request.status = REVIEW_STATUS.CLARIFICATION;
  const clarificationReplay = await v2.createRevisionFromCustomerSelections({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      reviewRequestId: REQUEST_ID
    }
  });
  assert.equal(clarificationReplay.estimateId, result.estimateId);
  assert.equal(
    request.status,
    REVIEW_STATUS.CLARIFICATION,
    "replay must preserve a later clarification state"
  );

  request.status = REVIEW_STATUS.PUBLISHED;
  const resolvedReplay = await v2.createRevisionFromCustomerSelections({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      reviewRequestId: REQUEST_ID
    }
  });
  assert.equal(resolvedReplay.estimateId, result.estimateId);
  assert.equal(request.status, REVIEW_STATUS.PUBLISHED, "resolved review must not reopen");

  await repo.update(
    ORG,
    result.estimateId,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: {
        fingerprint: "approved-r2",
        totals: { exactTotal: 1100, customerDisplayTotal: 1100 }
      },
      approval: {
        approvedAt: "2026-08-02T19:00:00.000Z",
        approvedByUserId: ACTOR,
        calculationFingerprint: "approved-r2"
      }
    },
    ACTOR
  );
  const manual = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: result.estimateId,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: "manual-after-customer-revision" }
  });
  const manualRow = await repo.getById(ORG, manual.estimateId);
  assert.equal(
    manualRow.scope.studioV2CustomerSelectionRevision,
    undefined,
    "manual revision must not inherit direct customer-selection identity"
  );
  console.log("ok: 2 revision is editable/stale, source immutable, double-click reuses");
}

{
  const { repo, v2 } = harness();
  await seedApproved(repo);
  const calls = await Promise.allSettled([
    v2.createRevisionFromCustomerSelections({
      organizationId: ORG,
      intakeCaseId: CASE_ID,
      actorUserId: ACTOR,
      body: { confirmed: true, reviewRequestId: REQUEST_ID }
    }),
    v2.createRevisionFromCustomerSelections({
      organizationId: ORG,
      intakeCaseId: CASE_ID,
      actorUserId: ACTOR,
      body: { confirmed: true, reviewRequestId: REQUEST_ID }
    })
  ]);
  assert.ok(calls.every((result) => result.status === "fulfilled"));
  assert.equal(calls[0].value.estimateId, calls[1].value.estimateId);
  assert.ok(calls.some((result) => result.value.created === true));
  assert.ok(calls.some((result) => result.value.reused === true));
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 2);
  console.log("ok: 3 deterministic revision id prevents concurrent duplicate siblings");
}

{
  const { repo, v2, state } = harness();
  await seedApproved(repo);
  const first = await v2.createRevisionFromCustomerSelections({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true, reviewRequestId: REQUEST_ID }
  });
  await repo.update(
    ORG,
    first.estimateId,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: {
        fingerprint: "approved-cycle-1",
        totals: { exactTotal: 1100, customerDisplayTotal: 1100 }
      },
      approval: {
        approvedAt: "2026-08-02T20:00:00.000Z",
        approvedByUserId: ACTOR,
        calculationFingerprint: "approved-cycle-1"
      }
    },
    ACTOR
  );
  state.publicationId = "pub-cycle-2";
  state.publicationRevision = 2;
  state.request = {
    ...reviewRequest(),
    id: "review-cycle-2",
    publication_id: state.publicationId,
    selection_id: "selection-cycle-2",
    selection_hash: "selection-hash-cycle-2",
    status: REVIEW_STATUS.REQUESTED,
    created_at: "2026-08-02T21:00:00.000Z"
  };
  state.selection = {
    ...submittedSelection(),
    id: state.request.selection_id,
    selection_hash: state.request.selection_hash
  };
  const second = await v2.createRevisionFromCustomerSelections({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      publicationId: state.publicationId,
      reviewRequestId: state.request.id
    }
  });
  assert.equal(second.created, true);
  assert.equal(second.basedOnEstimateId, first.estimateId);
  assert.equal(
    second.customerSelectionRevision.sourceReviewRequestId,
    state.request.id
  );
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 3);
  console.log("ok: 4 later published revision can start a new customer-selection cycle");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  const request = {
    ...reviewRequest(),
    status: REVIEW_STATUS.AMENDMENT_PREPARED
  };
  const publishedSource = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 2,
    scope: {
      ...sourceScope(),
      studioV2CustomerSelectionRevision: {
        createdFromCustomerSelections: true,
        createdFromCustomerSelectionsAt: "2026-08-02T20:00:00.000Z",
        sourcePublicationId: PUB_ID,
        sourceReviewRequestId: REQUEST_ID,
        sourceSelectionId: SELECTION_ID,
        sourceSelectionHash: "submitted-selection-hash",
        sourceApprovedEstimateId: "approved-r1",
        appliedSelectionsSummary: [],
        notAppliedScopeRequests: [],
        warnings: []
      }
    },
    calculationSnapshot: {
      fingerprint: "approved-customer-revision",
      totals: { exactTotal: 1100, customerDisplayTotal: 1100 }
    },
    approval: {
      approvedAt: "2026-08-02T21:00:00.000Z",
      approvedByUserId: ACTOR,
      calculationFingerprint: "approved-customer-revision"
    }
  });
  const events = [];
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    studioEstimateService: { repository: repo },
    amendmentRepository: {
      async getReviewRequest(organizationId, requestId) {
        return organizationId === ORG && requestId === REQUEST_ID
          ? structuredClone(request)
          : null;
      },
      async claimReviewRequestStatus(
        organizationId,
        requestId,
        expectedStatuses,
        status
      ) {
        assert.equal(organizationId, ORG);
        assert.equal(requestId, REQUEST_ID);
        if (!expectedStatuses.includes(request.status)) return null;
        request.status = status;
        return structuredClone(request);
      },
      async appendEvent(event) {
        events.push(structuredClone(event));
        return event;
      }
    },
    studioDigitalEstimateService: {
      async publish() {
        return {
          ok: true,
          publication: {
            id: "replacement-publication",
            status: "active",
            publishedAt: "2026-08-02T22:00:00.000Z",
            customerUrl: "https://example.test/e/replacement"
          },
          customerUrl: "https://example.test/e/replacement",
          linkStatus: "active",
          envelope: { configured: true },
          publishedConfiguration: {
            customerChoiceGroups: ["material_color", "sink", "edge"],
            allowedOptionKeys: ["qty-sink"]
          }
        };
      },
      async assessReadiness() {
        return {
          publications: [
            {
              id: "replacement-publication",
              status: "active",
              revisionNumber: 2,
              customerUrl: "https://example.test/e/replacement"
            }
          ],
          activePublication: {
            id: "replacement-publication",
            status: "active",
            revisionNumber: 2,
            customerUrl: "https://example.test/e/replacement"
          },
          publicationSummary: {
            active: true,
            publicationId: "replacement-publication"
          },
          reviewRequests: []
        };
      }
    }
  });
  const published = await v2.publishApproved({
    organizationId: ORG,
    estimateId: publishedSource.id,
    actorUserId: ACTOR,
    body: { confirmed: true, deliveryMode: "link_only" }
  });
  assert.equal(published.ok, true);
  assert.equal(published.customerSelectionReviewStatusUpdated, true);
  assert.equal(request.status, REVIEW_STATUS.PUBLISHED);
  assert.ok(
    events.some(
      (event) =>
        event.event_type === "studio_v2_customer_selection_revision_published"
    )
  );
  console.log("ok: 5 successful republish resolves the linked customer review request");
}

{
  const { repo, v2 } = harness({ accepted: true });
  await seedApproved(repo);
  await assert.rejects(
    () =>
      v2.createRevisionFromCustomerSelections({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (error) => error?.code === "customer_selections_already_accepted"
  );
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 1);
  console.log("ok: 6 accepted unchanged estimate cannot create customer-selection revision");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  await seedApproved(repo);
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    studioEstimateService: { repository: repo },
    amendmentRepository: {
      getReviewRequest() {},
      claimReviewRequestStatus() {}
    },
    configurationRepository: {
      getSelectionById() {}
    }
  });
  await assert.rejects(
    () =>
      v2.createRevisionFromCustomerSelections({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (error) => error?.code === "unavailable"
  );
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 1);
  console.log("ok: 7 missing acceptance authority fails closed");
}

{
  const { repo, v2 } = harness({ includeReview: false });
  await seedApproved(repo);
  await assert.rejects(
    () =>
      v2.createRevisionFromCustomerSelections({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (error) => error?.code === "customer_selections_not_sent"
  );
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 1);
  console.log("ok: 8 missing sent selections fails without creating a revision");
}

{
  const { repo, v2, state } = harness();
  await seedApproved(repo);
  state.selection = {
    ...submittedSelection(),
    selection_payload_json: {
      "material:kitchen:e100-bayshore-sand": 1,
      "edge:kitchen:edge_small_ogee": 1,
      "sink:kitchen:esf:blanco:precis-50-50:coal-black": 1,
      [CUSTOMER_CONFIGURATION_FOUNDATION_KEY]: {
        selectedMaterial: {
          roomId: "kitchen",
          colorId: "e100-bayshore-sand",
          colorName: "Bayshore Sand",
          materialGroup: "Group Promo"
        },
        selectedEdgeProfile: {
          roomId: "kitchen",
          profileToken: "edge_small_ogee",
          profileName: "Small Ogee"
        },
        backsplashPreference: { preference: "keep_approved" },
        requestedOpenings: [],
        requestedWaterfalls: [],
        customerNotes: []
      }
    }
  };
  state.request = {
    ...state.request,
    selected_options_json: [
      {
        optionKey: "material:kitchen:e100-bayshore-sand",
        label: "Bayshore Sand",
        quantity: 1
      },
      {
        optionKey: "sink:kitchen:esf:blanco:precis-50-50:coal-black",
        label: "Sink",
        quantity: 1
      }
    ]
  };
  await assert.rejects(
    () =>
      v2.createRevisionFromCustomerSelections({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true, reviewRequestId: REQUEST_ID }
      }),
    (error) => error?.code === "customer_selection_revision_not_required"
  );
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 1);
  console.log("ok: 8b selection-only submission rejects create-revision");
}

{
  const { repo, v2 } = harness();
  await seedApproved(repo);
  await assert.rejects(
    () =>
      v2.createRevisionFromCustomerSelections({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          confirmed: true,
          configuredDisplayTotal: 1,
          pricingFormula: "customer-controlled"
        }
      }),
    (error) =>
      error?.code === "validation_failed" &&
      error?.details?.rejectedFields?.includes("configuredDisplayTotal")
  );
  assert.equal((await repo.listByIntakeCase(ORG, CASE_ID)).length, 1);
  console.log("ok: 9 caller-supplied economics are rejected");
}

{
  const routes = readFileSync(join(here, "elite100StudioV2Routes.js"), "utf8");
  const routeStart = routes.indexOf(
    '"/api/elite100-studio-v2/cases/:caseId/customer-selections/create-revision"'
  );
  const routeBlock = routes.slice(routeStart, routeStart + 1500);
  assert.ok(routeStart >= 0);
  assert.ok(routeBlock.includes("...staffStack"));
  assert.ok(routeBlock.includes("orgIdFor(req)"));
  assert.ok(routeBlock.includes("createRevisionFromCustomerSelections"));
  assert.ok(routeBlock.includes("customer_selections.create_revision"));
  console.log("ok: 10 route requires staff stack, org context, and audit marker");
}

{
  const configurationRepository = readFileSync(
    join(here, "../digitalEstimate/configuration/configurationRepository.mjs"),
    "utf8"
  );
  const methodStart = configurationRepository.lastIndexOf(
    "async getSelectionById(organizationId, selectionId)"
  );
  const method = configurationRepository.slice(methodStart, methodStart + 500);
  assert.ok(method.includes('.eq("organization_id", organizationId)'));
  assert.ok(method.includes('.eq("id", selectionId)'));
  console.log("ok: 11 submitted selection lookup is organization scoped");
}

console.log("\nAll Studio V2 customer-selection revision tests passed.\n");
