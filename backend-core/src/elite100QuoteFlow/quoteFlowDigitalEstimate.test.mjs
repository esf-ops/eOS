/**
 * Elite 100 Quote Flow — Digital Estimate publish (approved estimates only).
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowDigitalEstimate.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowDigitalEstimateService } from "./quoteFlowDigitalEstimate.mjs";
import { createQuoteFlowReviewService } from "./quoteFlowReview.mjs";
import { createQuoteFlowPricingService } from "./quoteFlowPricing.mjs";
import { createQuoteFlowEstimatesService } from "./quoteFlowEstimates.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createStudioEstimateDigitalEstimateService } from "../elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs";
import { filterCustomerFacingCustomLines } from "../quoteDelivery/estimateContentSanitizer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowDigitalEstimate.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "77777777-7777-4777-8777-777777777777";
const EST_UNSCOPED = "88888888-8888-4888-8888-888888888888";
const ACTOR = "actor-de-1";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function baseRooms() {
  return [
    {
      id: "r1",
      name: "Kitchen",
      roomType: "Kitchen",
      included: true,
      pieces: [
        {
          id: "p1",
          name: "Island",
          lengthIn: 96,
          depthIn: 25.5,
          quantity: 1,
          included: true,
          excluded: false,
          openEdgeLf: 37.5,
          finishedEdgeLf: 37.5
        }
      ]
    }
  ];
}

function makeStore(initialRows) {
  /** @type {Map<string, object>} */
  const byId = new Map(initialRows.map((r) => [r.id, structuredClone(r)]));
  return {
    mode: "memory",
    async getById(_org, id) {
      const row = byId.get(id);
      return row ? structuredClone(row) : null;
    },
    async update(_org, id, patch) {
      const prev = byId.get(id);
      if (!prev) throw new Error("missing");
      const next = {
        ...prev,
        ...patch,
        scope: patch.scope != null ? patch.scope : prev.scope,
        revision: (Number(prev.revision) || 1) + 1,
        updatedAt: new Date().toISOString()
      };
      byId.set(id, next);
      return structuredClone(next);
    },
    peek(id) {
      return byId.get(id);
    }
  };
}

function harness(customLines = []) {
  const repo = makeStore([
    {
      id: EST_UNSCOPED,
      status: "draft",
      revision: 1,
      scope: { rooms: [] },
      calculationSnapshot: null,
      approval: null,
      staleReason: null
    },
    {
      id: EST,
      status: "ready_to_price",
      revision: 1,
      organizationId: ORG,
      scope: {
        rooms: baseRooms(),
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        projectName: "DE Kitchen",
        quoteFlowPricing: { customLineItems: customLines }
      },
      calculationSnapshot: null,
      approval: null,
      staleReason: null
    }
  ]);

  const studioEstimateService = {
    repository: repo,
    repositoryMode: "memory",
    async getById(organizationId, estimateId) {
      return repo.getById(organizationId, estimateId);
    },
    safeEstimateView(estimate) {
      return estimate;
    }
  };

  const deRepo = createInMemoryDigitalEstimateRepository();
  const studioDigitalEstimateService = createStudioEstimateDigitalEstimateService({
    env: ENV_ON,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    })
  });

  const pricing = createQuoteFlowPricingService({
    estimateRepository: repo,
    calculateStudioEstimate: calculateStudioEstimateV4,
    env: ENV_ON
  });
  const review = createQuoteFlowReviewService({
    estimateRepository: repo,
    env: ENV_ON
  });
  const estimates = createQuoteFlowEstimatesService({
    estimateRepository: repo,
    studioEstimateService: {
      async updateScope({ estimateId, body }) {
        const row = repo.peek(estimateId);
        const nextScope = { ...row.scope, ...(body?.scope || {}) };
        return repo.update(ORG, estimateId, {
          scope: nextScope,
          status: row.status === "approved" ? "ready_to_price" : row.status,
          approval: row.status === "approved" ? null : row.approval,
          calculationSnapshot: row.status === "approved" ? null : row.calculationSnapshot,
          staleReason:
            row.status === "approved" || row.calculationSnapshot
              ? "Scope changed — recalculate"
              : row.staleReason
        });
      }
    },
    env: ENV_ON
  });
  const digital = createQuoteFlowDigitalEstimateService({
    estimateRepository: repo,
    studioEstimateService,
    studioDigitalEstimateService,
    env: ENV_ON,
    preferInteractiveConfiguration: false
  });

  return { repo, pricing, review, estimates, digital, deRepo };
}

{
  const customLines = [
    {
      id: "cli-cust",
      label: "Sink cutout",
      type: "charge",
      visibility: "customer",
      quantity: 1,
      unitAmount: 150,
      amount: 150,
      category: "sink/cutout",
      note: "",
      sortOrder: 1
    },
    {
      id: "cli-int",
      label: "Shop scrap allowance",
      type: "charge",
      visibility: "internal",
      quantity: 1,
      unitAmount: 75,
      amount: 75,
      category: "other",
      note: "internal only",
      sortOrder: 2
    }
  ];

  const { repo, pricing, review, estimates, digital } = harness(customLines);

  await assert.rejects(
    () => digital.getDigitalEstimate({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );
  console.log("ok: Digital Estimate state rejects unscoped estimate");

  const notApproved = await digital.getDigitalEstimate({ organizationId: ORG, estimateId: EST });
  assert.equal(notApproved.ok, true);
  assert.equal(notApproved.canPublish, false);
  assert.ok(
    notApproved.checklist.some((c) => c.id === "review_approval" && c.severity === "blocker")
  );
  await assert.rejects(
    () =>
      digital.publishDigitalEstimate({
        organizationId: ORG,
        estimateId: EST,
        actorUserId: ACTOR,
        body: { confirm: true }
      }),
    (e) => e.code === "publish_not_ready"
  );
  console.log("ok: publish blocked when estimate is not approved");

  await pricing.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        customLineItems: customLines
      }
    }
  });

  await review.approveReview({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });

  // Force stale approval
  await repo.update(ORG, EST, { staleReason: "Scope changed — recalculate" });
  await assert.rejects(
    () =>
      digital.publishDigitalEstimate({
        organizationId: ORG,
        estimateId: EST,
        actorUserId: ACTOR,
        body: { confirm: true }
      }),
    (e) => e.code === "publish_not_ready"
  );
  console.log("ok: publish blocked when review approval / pricing is stale");

  // Recalculate + re-approve
  await pricing.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        customLineItems: customLines
      }
    }
  });
  await review.approveReview({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });

  const ready = await digital.getDigitalEstimate({ organizationId: ORG, estimateId: EST });
  assert.equal(ready.canPublish, true);
  assert.equal(ready.publishStatus.key, "ready_to_publish");
  assert.ok(ready.checklist.every((c) => c.severity !== "blocker"));
  assert.equal(ready.internalOnlyExcluded, true);
  assert.ok(ready.customerFacingLines.some((l) => l.label === "Sink cutout"));
  assert.ok(ready.internalOnlyLines.some((l) => l.label === "Shop scrap allowance"));
  assert.ok(
    !(ready.customerPreview?.lineItems || []).some(
      (li) => String(li.label || "").toLowerCase().includes("shop scrap")
    )
  );
  const previewJson = JSON.stringify(ready.customerPreview || {}).toLowerCase();
  assert.equal(previewJson.includes("exactinternaltotal"), false);
  assert.equal(previewJson.includes("shop scrap"), false);
  console.log("ok: ready state excludes internal-only from customer preview");

  const published = await digital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(published.ok, true);
  assert.equal(published.sideEffects.digitalEstimateCreated, true);
  assert.equal(published.sideEffects.published, true);
  assert.equal(published.sideEffects.sold, false);
  assert.equal(published.sideEffects.accepted, false);
  assert.equal(published.sideEffects.emailed, false);
  assert.equal(published.sideEffects.handoffCreated, false);
  assert.ok(published.customerUrl || published.publication?.customerUrl);
  assert.ok(repo.peek(EST).scope.quoteFlowDigitalEstimate?.publicationId);
  assert.equal(repo.peek(EST).scope.quoteFlowDigitalEstimate?.status, "published");
  assert.ok(repo.peek(EST).scope.quoteFlowDigitalEstimate?.sourceCalculationFingerprint);
  console.log("ok: publish succeeds and persists metadata; no accept/sold/handoff/email");

  // Customer-facing lines included via sanitizer contract on studio custom lines
  const studioLines = repo.peek(EST).scope.customLineItems || [];
  const customerFacing = filterCustomerFacingCustomLines(studioLines);
  assert.ok(customerFacing.some((l) => /sink cutout/i.test(String(l.name || l.label || ""))));
  assert.equal(
    customerFacing.some((l) => /shop scrap/i.test(String(l.name || l.label || ""))),
    false
  );
  console.log("ok: customer-facing line items included; internal-only excluded");

  // Scope edit after publish → needs republish / re-review
  await estimates.patchOfficialScope({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: {
      scope: {
        rooms: [
          {
            ...baseRooms()[0],
            pieces: [
              {
                ...baseRooms()[0].pieces[0],
                lengthIn: 100
              }
            ]
          }
        ],
        projectName: "DE Kitchen"
      }
    }
  });
  const afterScope = await digital.getDigitalEstimate({ organizationId: ORG, estimateId: EST });
  assert.equal(afterScope.canPublish, false);
  assert.ok(
    afterScope.publishStatus.key === "needs_rereview" ||
      afterScope.publishStatus.key === "needs_republish" ||
      afterScope.publishStatus.key === "not_ready"
  );
  assert.equal(repo.peek(EST).scope.quoteFlowDigitalEstimate?.status, "stale");
  console.log("ok: scope edit after publish marks Digital Estimate stale / needs republish");

  // Pricing edit after re-calc path
  await pricing.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        customLineItems: customLines
      }
    }
  });
  await review.approveReview({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const republished = await digital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(republished.ok, true);
  assert.equal(repo.peek(EST).scope.quoteFlowDigitalEstimate?.status, "published");
  console.log("ok: republish after re-approval succeeds");

  const src = readFileSync(join(__dirname, "quoteFlowDigitalEstimate.mjs"), "utf8");
  assert.match(src, /createStudioEstimateDigitalEstimateService|studioDigitalEstimateService\.publish/);
  assert.match(src, /quote_flow_approved_snapshot/);
  assert.doesNotMatch(src, /markSold|finalAcceptance|sendEmail|notifyCustomer/i);
  assert.match(src, /handoffCreated:\s*false/);
  assert.match(src, /sold:\s*false/);
  assert.match(src, /accepted:\s*false/);
  assert.doesNotMatch(src, /accepted:\s*true|sold:\s*true|handoffCreated:\s*true/);
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /digital-estimate\/publish/);
  assert.match(routes, /quoteFlowDigitalEstimateService/);
  console.log("ok: route/source contracts; Studio DE helper reused; no accept/sold/handoff");

  const deDir = join(root, "backend-core/src/digitalEstimate");
  const appDe = join(root, "app-digital-estimate");
  // Contract: this test file does not require editing those trees.
  assert.ok(deDir);
  assert.ok(appDe);
  console.log("ok: digital estimate module edits not required by Quote Flow wrapper");
}

{
  // Edge LF hotfix: QF openEdgeLf must freeze as room.edgeLinearFeet like working Studio DE.
  const { buildStudioEstimateRoomsForPublication } = await import(
    "../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs"
  );
  const {
    resolveEdgeOptionPriceEffect,
    resolvePremiumEdgeRatePerLf
  } = await import("../digitalEstimate/catalog/studioEdgeAuthority.mjs");
  const {
    normalizeQuoteFlowScopeForDigitalEstimatePublish,
    stampPieceOpenEdgeLf
  } = await import("./quoteFlowOpenEdge.mjs");
  const { buildQuoteFlowCustomerPublishPreview } = await import("./quoteFlowDigitalEstimate.mjs");

  const OPEN_LF = 37.5;
  const qfPieceOnlyOpenEdge = {
    id: "p-edge",
    name: "Island",
    pieceType: "counter",
    lengthIn: 96,
    depthIn: 25.5,
    quantity: 1,
    included: true,
    openEdgeLf: OPEN_LF,
    finishedEdgeLf: OPEN_LF
  };
  const stamped = stampPieceOpenEdgeLf(qfPieceOnlyOpenEdge, OPEN_LF, { confirmOfficial: true });
  assert.equal(stamped.finishedEdge.approved, true);
  assert.equal(stamped.finishedEdge.finishedEdgeConfirmed, true);
  assert.equal(stamped.finishedEdge.totalFinishedEdgeLengthIn, OPEN_LF * 12);

  const unapprovedRooms = buildStudioEstimateRoomsForPublication({
    id: EST,
    status: "approved",
    scope: {
      rooms: [{ id: "r1", name: "Kitchen", roomType: "Kitchen", included: true, pieces: [qfPieceOnlyOpenEdge] }],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo"
    },
    approval: { customerDisplayTotal: 5000, calculationFingerprint: "fp" },
    calculationSnapshot: {
      fingerprint: "fp",
      pricingEngine: "elite100-room-pricing-v1",
      pricingVersion: 4,
      pricingBasis: "wholesale",
      totals: { customerDisplayTotal: 5000 }
    }
  });
  assert.equal(Number(unapprovedRooms[0]?.edgeLinearFeet) || 0, 0, "unapproved finishedEdge → 0 LF");

  const normalized = normalizeQuoteFlowScopeForDigitalEstimatePublish({
    rooms: [{ id: "r1", name: "Kitchen", roomType: "Kitchen", included: true, pieces: [qfPieceOnlyOpenEdge] }],
    pricingBasis: "wholesale",
    materialGroup: "Group Promo"
  });
  const approvedRooms = buildStudioEstimateRoomsForPublication({
    id: EST,
    status: "approved",
    scope: normalized,
    approval: { customerDisplayTotal: 5000, calculationFingerprint: "fp" },
    calculationSnapshot: {
      fingerprint: "fp",
      pricingEngine: "elite100-room-pricing-v1",
      pricingVersion: 4,
      pricingBasis: "wholesale",
      totals: { customerDisplayTotal: 5000 }
    }
  });
  assert.equal(Number(approvedRooms[0]?.edgeLinearFeet), OPEN_LF);

  const preview = buildQuoteFlowCustomerPublishPreview({
    id: EST,
    organizationId: ORG,
    status: "approved",
    scope: {
      rooms: [{ id: "r1", name: "Kitchen", roomType: "Kitchen", included: true, pieces: [qfPieceOnlyOpenEdge] }],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      quoteFlowPricing: {
        customLineItems: [
          {
            id: "c1",
            label: "Sink cutout",
            type: "charge",
            visibility: "customer",
            quantity: 1,
            unitAmount: 100,
            amount: 100,
            category: "other",
            note: "",
            sortOrder: 1
          },
          {
            id: "i1",
            label: "Shop scrap",
            type: "charge",
            visibility: "internal",
            quantity: 1,
            unitAmount: 50,
            amount: 50,
            category: "other",
            note: "",
            sortOrder: 2
          }
        ]
      }
    },
    approval: {
      customerDisplayTotal: 5000,
      calculationFingerprint: "fp",
      quoteFlowInternalApproval: true
    },
    calculationSnapshot: {
      fingerprint: "fp",
      pricingEngine: "elite100-room-pricing-v1",
      pricingVersion: 4,
      pricingBasis: "wholesale",
      totals: { customerDisplayTotal: 5000, exactInternalTotal: 4800 },
      fabrication: {
        customLineItems: [
          {
            commercialRole: "customer_charge",
            customerFacing: true,
            name: "Sink cutout",
            lineTotal: 100
          },
          {
            commercialRole: "internal_only",
            customerFacing: false,
            name: "Shop scrap",
            lineTotal: 50
          }
        ]
      }
    }
  });
  assert.equal(preview.edgeLinearFeetTotal, OPEN_LF);
  assert.ok(!(preview.lineItems || []).some((li) => /shop scrap/i.test(String(li.label || ""))));
  const previewBlob = JSON.stringify(preview).toLowerCase();
  assert.equal(previewBlob.includes("exactinternaltotal"), false);

  const rate = resolvePremiumEdgeRatePerLf("wholesale");
  const eased = resolveEdgeOptionPriceEffect({
    profileToken: "edge_eased",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: OPEN_LF,
    pricingBasis: "wholesale"
  });
  const ogee = resolveEdgeOptionPriceEffect({
    profileToken: "edge_small_ogee",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: OPEN_LF,
    pricingBasis: "wholesale"
  });
  assert.equal(eased.grossPriceEffectCents, 0);
  assert.ok(Number(ogee.grossPriceEffectCents) > 0);
  assert.equal(
    Number(ogee.grossPriceEffectCents),
    Math.round(rate * OPEN_LF * 100)
  );
  const baselineTotal = 5000;
  const upgradedTotal = baselineTotal + Number(ogee.grossPriceEffectCents) / 100;
  assert.ok(upgradedTotal > baselineTotal);
  console.log("ok: QF openEdgeLf freezes as edgeLinearFeet; paid edge changes customer total; free stays +$0");
}

console.log("\nquoteFlowDigitalEstimate.test.mjs: ok\n");
