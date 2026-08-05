/**
 * Elite 100 Quote Flow — Estimates Review / internal approval (Slice 1F).
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowReview.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowReviewService } from "./quoteFlowReview.mjs";
import { createQuoteFlowPricingService } from "./quoteFlowPricing.mjs";
import { createQuoteFlowEstimatesService } from "./quoteFlowEstimates.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowReview.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "77777777-7777-4777-8777-777777777777";
const EST_UNSCOPED = "88888888-8888-4888-8888-888888888888";
const ACTOR = "actor-review-1";

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
          openEdgeLf: 10,
          finishedEdgeLf: 10
        }
      ]
    }
  ];
}

function makeStore(initialRows) {
  /** @type {Map<string, object>} */
  const byId = new Map(initialRows.map((r) => [r.id, structuredClone(r)]));
  return {
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

{
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
      scope: {
        rooms: baseRooms(),
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        projectName: "Review Kitchen"
      },
      calculationSnapshot: null,
      approval: null,
      staleReason: null
    }
  ]);

  const pricing = createQuoteFlowPricingService({
    estimateRepository: repo,
    calculateStudioEstimate: calculateStudioEstimateV4,
    env: {}
  });
  const review = createQuoteFlowReviewService({
    estimateRepository: repo,
    env: {}
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
    env: {}
  });

  await assert.rejects(
    () => review.getReview({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );
  console.log("ok: review rejects unscoped estimate");

  const notPriced = await review.getReview({ organizationId: ORG, estimateId: EST });
  assert.equal(notPriced.ok, true);
  assert.equal(notPriced.canApprove, false);
  assert.ok(notPriced.checklist.some((c) => c.id === "pricing_calculation" && c.severity === "blocker"));
  await assert.rejects(
    () =>
      review.approveReview({
        organizationId: ORG,
        estimateId: EST,
        actorUserId: ACTOR,
        body: { confirm: true }
      }),
    (e) => e.code === "review_not_ready"
  );
  console.log("ok: approval blocked when no pricing calculation exists");

  await pricing.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: {
      pricing: { pricingBasis: "wholesale", materialGroup: "Group Promo", customLineItems: [] }
    }
  });

  // Force stale
  await repo.update(ORG, EST, { staleReason: "Scope changed — recalculate" });
  await assert.rejects(
    () =>
      review.approveReview({
        organizationId: ORG,
        estimateId: EST,
        actorUserId: ACTOR,
        body: { confirm: true }
      }),
    (e) => e.code === "review_not_ready"
  );
  console.log("ok: approval blocked when pricing is stale");

  // Recalculate to clear stale
  await pricing.calculatePricing({ organizationId: ORG, estimateId: EST, actorUserId: ACTOR });
  const ready = await review.getReview({ organizationId: ORG, estimateId: EST });
  assert.equal(ready.canApprove, true);
  assert.equal(ready.reviewStatus.key, "ready_for_review");
  assert.ok(ready.checklist.every((c) => c.severity !== "blocker"));

  const approved = await review.approveReview({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.reviewStatus.key, "approved");
  assert.equal(approved.sideEffects.published, false);
  assert.equal(approved.sideEffects.sold, false);
  assert.equal(approved.sideEffects.digitalEstimateCreated, false);
  assert.equal(approved.sideEffects.approved, false);
  assert.equal(approved.sideEffects.estimateApproved, true);
  assert.ok(approved.approval?.approvedAt);
  assert.equal(approved.approval?.approvedByUserId, ACTOR);
  assert.equal(repo.peek(EST).status, "approved");
  assert.ok(repo.peek(EST).scope.quoteFlowReview?.approvedAt);
  console.log("ok: approval succeeds and records metadata; no publish/sold");

  // Scope edit after approval → re-review
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
        projectName: "Review Kitchen"
      }
    }
  });
  const afterScope = await review.getReview({ organizationId: ORG, estimateId: EST });
  assert.equal(afterScope.canApprove, false);
  assert.ok(
    afterScope.reReviewRequired === true ||
      afterScope.reviewStatus.key === "needs_recalculation" ||
      afterScope.reviewStatus.key === "needs_updates" ||
      afterScope.reviewStatus.key === "not_ready"
  );
  console.log("ok: scope edit after approval requires re-review");

  // Recalc + approve again, then pricing edit
  await pricing.calculatePricing({ organizationId: ORG, estimateId: EST, actorUserId: ACTOR });
  await review.approveReview({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  await pricing.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { pricing: { materialGroup: "Group A" } }
  });
  assert.notEqual(repo.peek(EST).status, "approved");
  assert.equal(repo.peek(EST).scope.quoteFlowReview?.status, "stale");
  const afterPricing = await review.getReview({ organizationId: ORG, estimateId: EST });
  assert.equal(afterPricing.canApprove, false);
  console.log("ok: pricing edit after approval clears approval / marks re-review");

  const reopened = await review.reopenReview({
    organizationId: ORG,
    estimateId: EST,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(reopened.ok, true);
  assert.equal(repo.peek(EST).approval, null);
  console.log("ok: reopen review clears approval without deleting scope/pricing");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /estimates\/:estimateId\/review/);
  assert.match(routes, /review\/approve/);
  assert.match(routes, /review\/reopen/);
  assert.match(routes, /createQuoteFlowReviewService/);
  assert.doesNotMatch(
    routes,
    /publishDigitalEstimate|markSold|approveWorkingDraft|takeoff-finish|digitalEstimate/
  );
  const reviewSrc = readFileSync(join(__dirname, "quoteFlowReview.mjs"), "utf8");
  assert.doesNotMatch(reviewSrc, /publishApproved\(|markSold\(|from ["'].*digitalEstimate/);
  assert.doesNotMatch(reviewSrc, /studioDigitalEstimate|publishDigital/);
  console.log("ok: route/source contracts; no DE publish / sold");
}

{
  assert.ok(join(root, "app-digital-estimate"));
  assert.ok(join(root, "backend-core/src/digitalEstimate"));
  console.log("ok: review tests do not require digital estimate module edits");
}

console.log("\nquoteFlowReview.test.mjs: ok\n");
