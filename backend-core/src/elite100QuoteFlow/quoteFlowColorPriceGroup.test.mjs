/**
 * Elite 100 color → authoritative price group in Quote Flow pricing, review and Studio approve.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowColorPriceGroup.test.mjs
 */
import assert from "node:assert/strict";
import { createQuoteFlowPricingService } from "./quoteFlowPricing.mjs";
import { assessQuoteFlowReviewReadiness } from "./quoteFlowReview.mjs";
import { assessQuoteFlowDigitalEstimateReadiness } from "./quoteFlowDigitalEstimate.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";
import {
  applyElite100ColorPriceGroups,
  canApplyQuoteFlowPriceGroupException,
  listElite100ColorPriceGroups,
  resolveElite100ColorPriceGroup
} from "../elite100EstimateStudio/elite100ColorPriceGroup.mjs";
import { assessStudioV2ApprovalReadiness } from "../elite100EstimateStudio/studioV2Approval.mjs";
import { pinForNewPublication } from "../digitalEstimate/configuration/publicationPricingPin.mjs";

console.log("\nquoteFlowColorPriceGroup.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "77777777-7777-4777-8777-777777777777";
const ADMIN = { id: "admin-1", role: "admin", email: "admin@example.test" };
const ESTIMATOR = { id: "est-1", role: "estimator", email: "estimator@example.test" };
const PROMO_COLOR = listElite100ColorPriceGroups().find((c) => c.group === "Group Promo").colorName;

function smokeScope(roomPatch = {}) {
  return {
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    colorName: "",
    colorTbd: false,
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          { id: "p1", name: "Sink run", lengthIn: 120, depthIn: 25.5, quantity: 1, included: true, excluded: false, openEdgeLf: 0 }
        ],
        ...roomPatch
      }
    ]
  };
}

function makeStore(rows) {
  const byId = new Map(rows.map((r) => [r.id, structuredClone(r)]));
  return {
    async getById(_org, id) {
      const row = byId.get(id);
      return row ? structuredClone(row) : null;
    },
    async update(_org, id, patch) {
      const prev = byId.get(id);
      const next = { ...prev, ...patch, scope: patch.scope != null ? patch.scope : prev.scope, revision: (prev.revision || 1) + 1 };
      byId.set(id, next);
      return structuredClone(next);
    },
    peek(id) {
      return structuredClone(byId.get(id));
    }
  };
}

function service(row, env = {}) {
  const repo = makeStore([row]);
  const svc = createQuoteFlowPricingService({
    estimateRepository: repo,
    calculateStudioEstimate: (args) => calculateStudioEstimateV4(args),
    env
  });
  return { repo, svc };
}

const kitchen = (repo) => repo.peek(EST).scope.rooms.find((r) => r.id === "kitchen");
const roomPatch = (p) => ({ pricing: { roomSelections: [{ roomId: "kitchen", ...p }] } });

{
  assert.deepEqual(resolveElite100ColorPriceGroup("Calacatta Fioressa")?.groupLabel, "Group C");
  assert.equal(resolveElite100ColorPriceGroup("  calacatta   FIORESSA ")?.colorName, "Calacatta Fioressa");
  assert.equal(resolveElite100ColorPriceGroup("Calacatta"), null, "no fuzzy / partial match");
  assert.equal(resolveElite100ColorPriceGroup("Customer's own quartz"), null);
  assert.equal(resolveElite100ColorPriceGroup(""), null);
  assert.ok(listElite100ColorPriceGroups().every((c) => c.group && c.group !== "Remnant"));
  console.log("ok: exact catalog colors resolve to their price group; partial names never do");
}

{
  assert.equal(canApplyQuoteFlowPriceGroupException(ADMIN, {}), true);
  assert.equal(canApplyQuoteFlowPriceGroupException({ ...ADMIN, role: "super_admin" }, {}), true);
  assert.equal(canApplyQuoteFlowPriceGroupException(ESTIMATOR, {}), false);
  assert.equal(canApplyQuoteFlowPriceGroupException(null, {}), false);
  const env = { ELITE100_QUOTE_FLOW_PRICE_EXCEPTION_ALLOWLIST: "Estimator@Example.test" };
  assert.equal(canApplyQuoteFlowPriceGroupException(ESTIMATOR, env), true);
  assert.equal(canApplyQuoteFlowPriceGroupException({ id: "x", role: "estimator", email: "other@example.test" }, env), false);
  console.log("ok: price-group exceptions limited to admins and the configured allowlist");
}

// The smoke test: Wholesale, estimate default Promo, room color Calacatta Fioressa (Group C).
{
  const { repo, svc } = service({ id: EST, status: "ready_to_price", revision: 1, scope: smokeScope(), calculationSnapshot: null });
  const saved = await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actor: ESTIMATOR,
    body: roomPatch({ colorNameOverride: "calacatta fioressa", materialGroupOverride: null, colorTbd: false })
  });
  assert.equal(kitchen(repo).materialGroupOverride, "Group C");
  assert.equal(kitchen(repo).colorNameOverride, "Calacatta Fioressa");
  assert.ok(saved.colorPriceGroupNotices.some((n) => /Group C/.test(n)));
  assert.equal(saved.colorPriceGroups.rooms[0].status, "matches");
  assert.equal(saved.colorPriceGroups.canApplyException, false);
  assert.ok(saved.colorPriceGroups.colors.some((c) => c.colorName === "Calacatta Fioressa" && c.group === "Group C"));

  const calc = await svc.calculatePricing({ organizationId: ORG, estimateId: EST, actor: ESTIMATOR });
  const room = repo.peek(EST).calculationSnapshot.elite100.rooms[0];
  assert.equal(room.materialGroup, "Group C");
  assert.ok(Number(room.materialRatePerSf) > 0);
  assert.equal(calc.lastCalculation.available, true);
  const review = assessQuoteFlowReviewReadiness(repo.peek(EST));
  assert.ok(!review.blockers.some((b) => b.id === "color_price_group"));
  console.log(`ok: selecting Calacatta Fioressa prices the room at Group C ($${room.materialRatePerSf}/SF wholesale)`);

  // Changing to a Promo color moves the group and invalidates the calculation.
  await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actor: ESTIMATOR,
    body: roomPatch({ colorNameOverride: PROMO_COLOR, materialGroupOverride: "Group C", colorTbd: false })
  });
  const after = repo.peek(EST);
  assert.equal(kitchen(repo).materialGroupOverride, "Group Promo", "stale Group C override replaced by the new color's group");
  assert.equal(after.calculationSnapshot, null);
  assert.equal(after.status, "ready_to_price");
  assert.match(after.staleReason, /recalculate/i);
  console.log("ok: changing color updates the price group and invalidates the prior calculation");
}

// An explicit conflicting group is replaced by the color's group, with a notice.
{
  const { repo, svc } = service({ id: EST, status: "ready_to_price", revision: 1, scope: smokeScope(), calculationSnapshot: null });
  const saved = await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actor: ESTIMATOR,
    body: roomPatch({ colorNameOverride: "Calacatta Fioressa", materialGroupOverride: "Group Promo" })
  });
  assert.equal(kitchen(repo).materialGroupOverride, "Group C");
  assert.ok(saved.colorPriceGroupNotices.length > 0);
  console.log("ok: a conflicting explicit group does not stick without an exception");
}

// Estimate-level color sets the estimate default; rooms without their own color follow it.
{
  const scope = smokeScope();
  scope.rooms.push({ id: "bath", name: "Bath", included: true, colorTbd: true, pieces: [] });
  const { repo, svc } = service({ id: EST, status: "ready_to_price", revision: 1, scope, calculationSnapshot: null });
  await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actor: ESTIMATOR,
    body: { pricing: { colorName: "Calacatta Fioressa", materialGroup: "Group Promo" } }
  });
  const s = repo.peek(EST).scope;
  assert.equal(s.materialGroup, "Group C");
  assert.equal(s.rooms.find((r) => r.id === "kitchen").materialGroupOverride ?? null, null);
  assert.equal(s.rooms.find((r) => r.id === "bath").materialGroupOverride, "Group Promo", "TBD room keeps the group it was priced at");
  console.log("ok: estimate color sets the estimate price group; TBD rooms keep theirs");
}

// Colors outside the catalog, TBD and custom slab rooms keep the staff-chosen group.
{
  const { repo, svc } = service({
    id: EST,
    status: "ready_to_price",
    revision: 1,
    scope: smokeScope({ materialGroupOverride: "Group B" }),
    calculationSnapshot: null
  });
  await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actor: ESTIMATOR,
    body: roomPatch({ colorNameOverride: "Customer supplied quartz", materialGroupOverride: "Group B" })
  });
  assert.equal(kitchen(repo).materialGroupOverride, "Group B");
  await svc.patchPricing({ organizationId: ORG, estimateId: EST, actor: ESTIMATOR, body: roomPatch({ colorTbd: true, materialGroupOverride: "Group D" }) });
  assert.equal(kitchen(repo).materialGroupOverride, "Group D");
  const slab = applyElite100ColorPriceGroups(
    smokeScope({ slabPackageId: "pkg-1", colorNameOverride: "Calacatta Fioressa", materialGroupOverride: "Group Promo" }),
    { touchedRoomIds: new Set(["kitchen"]) }
  );
  assert.equal(slab.scope.rooms[0].materialGroupOverride, "Group Promo");
  console.log("ok: non-catalog colors, TBD and custom slab rooms keep the group staff chose");
}

// No silent regrouping: an untouched draft keeps its group; Review blocks approval instead.
{
  const scope = smokeScope({ colorNameOverride: "Calacatta Fioressa", materialGroupOverride: null });
  const { repo, svc } = service({ id: EST, status: "ready_to_price", revision: 1, scope, calculationSnapshot: null });
  await svc.calculatePricing({ organizationId: ORG, estimateId: EST, actor: ESTIMATOR });
  const row = repo.peek(EST);
  assert.equal(row.calculationSnapshot.elite100.rooms[0].materialGroup, "Group Promo");
  const review = assessQuoteFlowReviewReadiness(row);
  const blocker = review.blockers.find((b) => b.id === "color_price_group");
  assert.ok(blocker, "conflict blocks approval");
  assert.match(blocker.detail, /Calacatta Fioressa is Group C but priced as Group Promo/);
  assert.equal(review.canApprove, false);

  const v2 = assessStudioV2ApprovalReadiness({ ...row, status: "priced", staleReason: null });
  assert.equal(v2.allowed, false);
  assert.ok(v2.blockers.some((b) => b.code === "color_price_group_conflict"));

  // Approved before the rule: the approval is left alone, but it cannot be published.
  const preRuleApproved = {
    ...row,
    status: "approved",
    approval: { approvedAt: "2026-09-30T16:55:51Z", calculationFingerprint: row.calculationSnapshot.fingerprint }
  };
  const publish = assessQuoteFlowDigitalEstimateReadiness(preRuleApproved, { env: {} });
  assert.ok(publish.blockers.some((b) => b.id === "color_price_group"));
  assert.equal(publish.canPublish, false);
  console.log("ok: existing conflicting drafts are not regrouped on calculate; approval and publish block");
}

// Documented exception: authorized only, reason required, audited, cleared when the color changes.
{
  const { repo, svc } = service({ id: EST, status: "ready_to_price", revision: 1, scope: smokeScope(), calculationSnapshot: null });
  const exceptionBody = roomPatch({
    colorNameOverride: "Calacatta Fioressa",
    materialGroupOverride: "Group Promo",
    priceGroupException: { group: "Group Promo", reason: "Builder contract honors 2025 Promo pricing for this color" }
  });
  await assert.rejects(
    () => svc.patchPricing({ organizationId: ORG, estimateId: EST, actor: ESTIMATOR, body: exceptionBody }),
    (e) => e.code === "pricing_invalid" && e.statusCode === 403 && /authorized estimator/.test(e.staffDetail)
  );
  assert.equal(kitchen(repo).priceGroupException, undefined, "refused exception is not persisted");

  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        actor: ADMIN,
        body: roomPatch({ colorNameOverride: "Calacatta Fioressa", priceGroupException: { group: "Group Promo", reason: "ok" } })
      }),
    (e) => e.statusCode === 422 && /explain why/.test(e.staffDetail)
  );

  const saved = await svc.patchPricing({ organizationId: ORG, estimateId: EST, actor: ADMIN, body: exceptionBody });
  const k = kitchen(repo);
  assert.equal(k.materialGroupOverride, "Group Promo");
  assert.equal(k.priceGroupException.appliedByUserId, "admin-1");
  assert.equal(k.priceGroupException.colorGroup, "Group C");
  assert.ok(k.priceGroupException.appliedAt);
  assert.equal(saved.priceGroupExceptionsApplied, 1);
  assert.equal(saved.colorPriceGroups.rooms[0].status, "exception");

  // A non-authorized estimator saving other fields keeps the documented exception.
  await svc.patchPricing({ organizationId: ORG, estimateId: EST, actor: ESTIMATOR, body: roomPatch({ colorNameOverride: "Calacatta Fioressa", materialGroupOverride: "Group Promo" }) });
  assert.equal(kitchen(repo).materialGroupOverride, "Group Promo");
  assert.ok(kitchen(repo).priceGroupException);

  await svc.calculatePricing({ organizationId: ORG, estimateId: EST, actor: ADMIN });
  const review = assessQuoteFlowReviewReadiness(repo.peek(EST));
  assert.ok(!review.blockers.some((b) => b.id === "color_price_group"));
  const w = review.warnings.find((x) => x.id === "price_group_exception");
  assert.ok(w && /Builder contract/.test(w.detail));
  console.log("ok: authorized, reasoned exception is honored, audited and shown in Review");

  const changed = await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    actor: ADMIN,
    body: roomPatch({ colorNameOverride: PROMO_COLOR, materialGroupOverride: "Group Promo" })
  });
  assert.equal(kitchen(repo).priceGroupException, undefined);
  assert.equal(kitchen(repo).materialGroupOverride, "Group Promo");
  assert.ok(changed.colorPriceGroupNotices.some((n) => /exception removed/.test(n)));
  console.log("ok: changing the color clears the exception instead of carrying it to another color");
}

// A published exception room is not repriced online: the pin blocks customer repricing.
{
  const pin = pinForNewPublication({
    pricingBasis: "wholesale",
    pricingRuleEvidence: {
      pricingBasis: "wholesale",
      materialRateTable: { "Group Promo": 30, "Group C": 60 },
      materialUseTaxPercent: 2,
      cutoutRates: { kitchenSink: 200, vanitySink: 150, cooktop: 150, electricalOutlet: 25 },
      rooms: [{ roomKey: "kitchen", materialGroup: "Group Promo", ratePerSf: 30, rateSource: "quote_calculator_authority", priceGroupException: true }],
      accountRules: {}
    }
  });
  assert.ok(pin.repricingBlockedReasons.includes("price_group_exception:kitchen"));
  console.log("ok: a price-group exception publishes view-only (repricing refused, never approximated)");
}

console.log("\nquoteFlowColorPriceGroup.test.mjs — passed\n");
