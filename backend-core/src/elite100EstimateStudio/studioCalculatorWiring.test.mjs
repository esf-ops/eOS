/**
 * Elite 100 Studio ↔ authoritative calculator wiring — integration tests.
 *
 * Exercises the REAL wiring end-to-end: studioEstimateService's default
 * calculateImpl (calculateStudioEstimateV4 → elite100RoomPricingStudioAdapter
 * → calculateElite100StudioEstimate, PR #95's pricingEngine
 * "elite100-room-pricing-v1" / pricingVersion 4), the manual physical Scope
 * normalize path (studioManualPhysicalScope.mjs), and the AI Takeoff scope
 * seed path (studioEstimateService.seedScopeFromTakeoffPayload). No pricing
 * math is re-implemented here — every dollar assertion either compares two
 * real calculations or matches a published rate constant.
 *
 * Run: npm run eos:test:elite100-studio-calculator-wiring
 */
import assert from "node:assert/strict";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import {
  createStudioEstimateService,
  seedScopeFromTakeoffPayload
} from "./studioEstimateService.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";
import {
  calculateStudioEstimateV4,
  mapStudioEstimateToElite100Input
} from "./elite100RoomPricingStudioAdapter.mjs";
import { calculateStudioEstimate } from "./studioEstimatePricing.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { normalizeManualRooms, MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";
import { roundPublicEstimateToNearestTen } from "../quotes/quoteCalculator.js";
import { ELITE100_CUTOUT_RATES } from "./elite100RoomPricingCalculator.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const PRICING_ENGINE_V1 = "elite100-room-pricing-v1";
const PRICING_VERSION_4 = 4;

console.log("\nstudioCalculatorWiring.test.mjs\n");

/** Manual-draft kitchen with one confirmed-edge counter run. */
function manualKitchenDraft({ quantity } = {}) {
  return {
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "piece-main",
            name: "Main run",
            pieceType: "counter",
            measurementMode: "dimensions",
            lengthIn: 96,
            depthIn: 25.5,
            ...(quantity != null ? { quantity } : {}),
            finishedEdge: {
              frontEdgeLengthIn: 96,
              totalFinishedEdgeLengthIn: 96,
              approved: true
            }
          }
        ]
      }
    ],
    addOns: {}
  };
}

function noTakeoffService(overrides = {}) {
  return createStudioEstimateService({
    repository: overrides.repository || new InMemoryStudioEstimateRepository(),
    env: overrides.env || {},
    loadTakeoffWorkspace: async () => {
      throw new Error("Takeoff workspace should not load for a confirmed manual/no-job estimate");
    },
    loadLatestTakeoffResult: async () => null,
    ...overrides.deps
  });
}

// ════════════════════════════════════════════════════════════════════════
// MANUAL PATH
// ════════════════════════════════════════════════════════════════════════
{
  const repository = new InMemoryStudioEstimateRepository();
  const intake = new InMemoryQuoteIntakeRepository();
  const studio = noTakeoffService({ repository });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: repository,
    studioEstimateService: studio
  });

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "wiring-manual-1",
    body: { projectName: "Wiring Kitchen", customerName: "Wiring Test Co" }
  });

  // Quantity omitted entirely on create-time draft → server default is 1.
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: manualKitchenDraft() }
  });
  let row = await repository.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].pieces[0].quantity, 1, "quantity defaults to 1 when omitted");
  assert.equal(row.scope.rooms[0].pieces[0].id, "piece-main", "stable piece id preserved");
  assert.equal(row.scope.rooms[0].pieces[0].source, MANUAL_ESTIMATE_ORIGIN);
  console.log("ok: 1 manual piece quantity defaults to 1");

  // Quantity > 1 persists exactly, survives a reload, keeps ids/source/dimensions.
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: manualKitchenDraft({ quantity: 3 }) }
  });
  row = await repository.getById(ORG, created.estimateId);
  const savedPiece = row.scope.rooms[0].pieces[0];
  assert.equal(savedPiece.quantity, 3, "quantity 3 persists");
  assert.equal(savedPiece.lengthIn, 96);
  assert.equal(savedPiece.depthIn, 25.5);
  assert.equal(savedPiece.id, "piece-main", "reload preserves stable piece id");
  assert.equal(row.scope.rooms[0].id, "room-kitchen", "reload preserves stable room id");
  assert.equal(savedPiece.source, MANUAL_ESTIMATE_ORIGIN, "reload preserves source=manual_staff");
  console.log("ok: 2 quantity>1 persists and reload preserves dimensions/ids/source");

  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const priced = await studio.calculate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.calculation.pricingEngine, PRICING_ENGINE_V1, "manual path calculates with v1 engine");
  assert.equal(priced.calculation.pricingVersion, PRICING_VERSION_4, "manual path calculates with pricingVersion 4");
  assert.ok(priced.calculationFingerprint, "calculation fingerprint present");
  assert.ok(Number(priced.calculation.totals.customerDisplayTotal) > 0, "customer total computed");
  console.log("ok: 3 manual path calculation reports elite100-room-pricing-v1 / pricingVersion 4");

  // Quantity 3 vs quantity 1 (same piece, isolated adapter+calculator call):
  // dimensions-mode measured SF must scale by quantity per the canonical
  // Scope contract (lengthIn×depthIn÷144×quantity) — proven through the real
  // adapter + calculator, not a hand-derived formula.
  const qty1Scope = { ...emptyStudioEstimateScope(), pricingBasis: "wholesale", rooms: normalizeManualRooms(manualKitchenDraft({ quantity: 1 }).rooms) };
  const qty3Scope = { ...emptyStudioEstimateScope(), pricingBasis: "wholesale", rooms: normalizeManualRooms(manualKitchenDraft({ quantity: 3 }).rooms) };
  const calc1 = await calculateStudioEstimateV4({ scope: qty1Scope, env: {} });
  const calc3 = await calculateStudioEstimateV4({ scope: qty3Scope, env: {} });
  const sf1 = calc1.elite100.rooms[0].measuredCountertopSf;
  const sf3 = calc3.elite100.rooms[0].measuredCountertopSf;
  assert.equal(Math.round(sf3 * 100) / 100, Math.round(sf1 * 3 * 100) / 100, "quantity 3 measures exactly 3x the SF of quantity 1");
  assert.ok(calc3.totals.exactInternalTotal > calc1.totals.exactInternalTotal, "quantity 3 exact total exceeds quantity 1");
  console.log("ok: 4 quantity multiplies measured SF and total through the real v4 adapter+calculator");

  // Direct-area mode remains an explicit, estimator-approved absolute override.
  const directAreaRooms = normalizeManualRooms([
    {
      id: "room-direct",
      name: "Irregular Island",
      roomType: "Kitchen",
      pieces: [
        { id: "piece-direct", name: "Irregular top", measurementMode: "direct_area", sqft: 22, lengthIn: 60, depthIn: 30, quantity: 5 }
      ]
    }
  ]);
  assert.equal(directAreaRooms[0].pieces[0].measurementMode, "direct_area");
  assert.equal(directAreaRooms[0].pieces[0].directAreaOverride, true);
  const directScope = { ...emptyStudioEstimateScope(), pricingBasis: "wholesale", rooms: directAreaRooms };
  const directCalc = await calculateStudioEstimateV4({ scope: directScope, env: {} });
  assert.equal(directCalc.elite100.rooms[0].measuredCountertopSf, 22, "direct-area override is an absolute SF total, not ×quantity(5)");
  console.log("ok: 5 direct-area mode stays explicit and is never multiplied by quantity");
}

// ════════════════════════════════════════════════════════════════════════
// AI-ASSISTED PATH (approved Takeoff → canonical Scope)
// ════════════════════════════════════════════════════════════════════════
{
  // A realistic already-approved Takeoff import payload (the shape
  // buildTakeoffImportPayload() produces after the existing approval gate —
  // that gate/extraction pipeline is untouched by this branch). The stored
  // sqft is deliberately wrong (should be 96×25.5÷144=17, not 99) so a
  // regression that trusts AI-supplied sqft instead of deriving from
  // lengthIn×depthIn is caught.
  const importPayload = {
    takeoffJobId: "takeoff-job-wiring-1",
    takeoffResultId: "takeoff-result-wiring-1",
    sourceFileName: "wiring-plans.pdf",
    approvedBy: ACTOR,
    approvedAt: "2026-07-27T00:00:00.000Z",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        sourcePages: [1],
        guidedShapeGroups: [
          {
            label: "Main Run",
            shapeType: "counter",
            pieces: [{ label: "Main Run", pieceType: "counter", lengthIn: 96, depthIn: 25.5, shape: "rect" }]
          }
        ],
        pieces: [
          {
            name: "Main Run",
            sqft: 99, // deliberately stale/wrong vs. lengthIn×depthIn÷144
            finishedEdge: { frontEdgeLengthIn: 96, totalFinishedEdgeLengthIn: 96, approved: true },
            reviewStatus: "approved"
          }
        ]
      }
    ]
  };

  const seeded = seedScopeFromTakeoffPayload(importPayload, {
    projectName: "AI Takeoff Kitchen",
    customerName: "Takeoff Test Co"
  });
  assert.equal(seeded.physicalScopeSource, "takeoff", "seeded scope carries takeoff source metadata");
  assert.equal(seeded.rooms.length, 1);
  const seededPiece = seeded.rooms[0].pieces[0];
  assert.equal(seededPiece.lengthIn, 96, "AI-seeded piece carries lengthIn");
  assert.equal(seededPiece.depthIn, 25.5, "AI-seeded piece carries depthIn");
  assert.equal(seededPiece.quantity, undefined, "Takeoff seed has no quantity field of its own (adapter defaults it to 1)");
  assert.ok(seededPiece.id, "AI-seeded piece has a stable id");
  assert.ok(seededPiece.finishedEdge?.approved, "AI-seeded piece carries approved finished-edge geometry");
  console.log("ok: 6 approved Takeoff payload seeds canonical rooms/pieces (stable ids, lengthIn/depthIn, edge geometry)");

  // Raw AI output (guidedShapeGroups / areaLabel / takeoffImportSource / the
  // stale sqft) is informational on the Studio scope but must NOT be what
  // reaches the calculator — only lengthIn/depthIn/quantity/pieceType do.
  const mappedFromTakeoff = mapStudioEstimateToElite100Input(seeded);
  const mappedPiece = mappedFromTakeoff.scope.rooms[0].pieces[0];
  assert.equal(mappedPiece.quantity, 1, "quantity defaults to 1 for AI-seeded piece with no explicit quantity");
  assert.equal(mappedPiece.directArea, undefined, "AI-seeded piece (no measurementMode) is not treated as direct-area");
  assert.equal("areaLabel" in mappedPiece, false, "raw AI areaLabel metadata is not passed to the calculator");
  assert.equal("takeoffImportSource" in mappedPiece, false, "raw AI source metadata is not passed to the calculator");
  console.log("ok: 7 AI-origin metadata stays informational; only canonical geometry reaches the calculator");

  const takeoffCalc = await calculateStudioEstimateV4({ scope: seeded, env: {} });
  assert.equal(takeoffCalc.pricingEngine, PRICING_ENGINE_V1);
  assert.equal(takeoffCalc.pricingVersion, PRICING_VERSION_4);
  const expectedSf = Math.round(((96 * 25.5) / 144) * 100) / 100;
  assert.equal(takeoffCalc.elite100.rooms[0].measuredCountertopSf, expectedSf, "measured SF derived from lengthIn×depthIn, ignoring the stale seeded sqft(99)");
  console.log("ok: 8 AI-assisted scope calculates with v1/pricingVersion 4; raw AI sqft is never trusted");

  // Estimator correction after import persists through the same Scope
  // workspace/persistence used by manual estimates, and changes pricing.
  // AI-seeded scope keeps its takeoffJobId linkage (physical-scope authority
  // is "approved Takeoff OR server-confirmed manual scope" — see
  // assertPhysicalScopeAuthorized), so calculate() re-verifies the Takeoff
  // is still approved on every call, exactly like the real service.
  const repository = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" }),
    loadLatestTakeoffResult: async () => null
  });
  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-takeoff-wiring-1",
    takeoffJobId: "takeoff-job-wiring-1",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: seeded,
    createdByUserId: ACTOR
  });
  const beforeEdit = await studio.calculate({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: {} });
  const correctedScope = {
    ...seeded,
    rooms: seeded.rooms.map((r) => ({
      ...r,
      pieces: r.pieces.map((p) => ({ ...p, lengthIn: 120 })) // estimator corrects a mis-measured run
    }))
  };
  await studio.updateScope({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: { scope: correctedScope } });
  const afterEditRow = await repository.getById(ORG, created.id);
  assert.equal(afterEditRow.scope.rooms[0].pieces[0].lengthIn, 120, "estimator edit to AI-seeded piece persists");
  assert.equal(afterEditRow.calculationSnapshot, null, "editing AI-seeded scope invalidates the prior calculation");
  const afterEdit = await studio.calculate({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: {} });
  assert.notEqual(
    afterEdit.calculation.totals.exactInternalTotal,
    beforeEdit.calculation.totals.exactInternalTotal,
    "recalculation after estimator edit produces a different authoritative total"
  );
  console.log("ok: 9 estimator edits to AI-seeded Scope persist and reach the v4 calculator on recalculation");
}

// ════════════════════════════════════════════════════════════════════════
// PARITY — manual and AI-assisted starts converge on identical pricing
// ════════════════════════════════════════════════════════════════════════
{
  const manualScope = {
    ...emptyStudioEstimateScope(),
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: normalizeManualRooms(manualKitchenDraft({ quantity: 2 }).rooms)
  };

  // Equivalent AI-assisted scope: same geometry/quantity, seeded via the real
  // Takeoff handoff path rather than the manual normalizer. Takeoff seeding
  // has no per-piece quantity field, so the estimator sets it after import —
  // exactly like a real reviewed-and-corrected Takeoff estimate.
  const importPayload = {
    takeoffJobId: "takeoff-parity-1",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          { label: "Main Run", shapeType: "counter", pieces: [{ label: "Main Run", pieceType: "counter", lengthIn: 96, depthIn: 25.5 }] }
        ],
        pieces: [{ name: "Main Run", finishedEdge: { frontEdgeLengthIn: 96, totalFinishedEdgeLengthIn: 96, approved: true } }]
      }
    ]
  };
  const aiSeeded = seedScopeFromTakeoffPayload(importPayload, {});
  const aiScope = {
    ...emptyStudioEstimateScope(),
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: aiSeeded.rooms.map((r) => ({
      ...r,
      pieces: r.pieces.map((p) => ({ ...p, quantity: 2, measurementMode: "dimensions" }))
    }))
  };

  const manualCalc = await calculateStudioEstimateV4({ scope: manualScope, env: {} });
  const aiCalc = await calculateStudioEstimateV4({ scope: aiScope, env: {} });

  assert.equal(manualCalc.pricingEngine, PRICING_ENGINE_V1);
  assert.equal(aiCalc.pricingEngine, PRICING_ENGINE_V1);
  assert.equal(
    manualCalc.elite100.rooms[0].measuredCountertopSf,
    aiCalc.elite100.rooms[0].measuredCountertopSf,
    "equivalent manual/AI-assisted scopes measure identical SF"
  );
  assert.equal(
    manualCalc.elite100.rooms[0].billedCountertopSf,
    aiCalc.elite100.rooms[0].billedCountertopSf,
    "equivalent manual/AI-assisted scopes bill identical SF"
  );
  assert.equal(
    manualCalc.elite100.rooms[0].exactTotal,
    aiCalc.elite100.rooms[0].exactTotal,
    "equivalent manual/AI-assisted scopes produce identical room totals"
  );
  assert.equal(
    manualCalc.totals.exactInternalTotal,
    aiCalc.totals.exactInternalTotal,
    "equivalent manual/AI-assisted scopes produce identical exact estimate totals"
  );
  assert.equal(
    manualCalc.totals.customerDisplayTotal,
    aiCalc.totals.customerDisplayTotal,
    "equivalent manual/AI-assisted scopes produce identical customer display totals"
  );
  console.log("ok: 10 manual and AI-assisted starts with equivalent Scope+Configuration produce identical pricing");
}

// ════════════════════════════════════════════════════════════════════════
// CALCULATION LIFECYCLE (stale → blocked → recalculate → approve)
// ════════════════════════════════════════════════════════════════════════
{
  const repository = new InMemoryStudioEstimateRepository();
  const intake = new InMemoryQuoteIntakeRepository();
  const studio = noTakeoffService({ repository });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: repository,
    studioEstimateService: studio
  });

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "wiring-lifecycle-1",
    body: { projectName: "Lifecycle Kitchen", customerName: "Lifecycle Test Co" }
  });
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: manualKitchenDraft() }
  });
  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });

  const calc1 = await studio.calculate({ organizationId: ORG, estimateId: created.estimateId, actorUserId: ACTOR, body: {} });
  const fp1 = calc1.calculationFingerprint;
  assert.ok(fp1);
  assert.equal(calc1.status, "priced");
  console.log("ok: 11 first calculate succeeds with a v4 fingerprint");

  // Scope edit BEFORE approval invalidates the just-computed calculation, and
  // (per studioManualPhysicalScope's confirmation gate) un-confirms manual
  // scope pending explicit re-confirmation — the same rule already proven in
  // the MANUAL PATH block above.
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: manualKitchenDraft({ quantity: 4 }) }
  });
  const afterEdit = await repository.getById(ORG, created.estimateId);
  assert.equal(afterEdit.calculationSnapshot, null, "scope edit clears the prior (unapproved) calculation");
  assert.equal(afterEdit.status, "ready_to_price", "scope edit reverts status to ready_to_price");
  assert.equal(afterEdit.scope.manualScopeConfirmed, false, "scope edit un-confirms manual scope pending re-confirmation");
  console.log("ok: 12 scope edit makes the previous calculation stale");

  // Approve is rejected while stale/unconfirmed (no current, confirmed calculation to approve).
  let blockedStale = false;
  try {
    await studio.approve({ organizationId: ORG, estimateId: created.estimateId, actorUserId: ACTOR, body: { confirm: true } });
  } catch (e) {
    blockedStale = e.code === "not_priced" || e.code === "manual_scope_not_confirmed";
  }
  assert.equal(blockedStale, true, "approve() rejects a stale/unconfirmed estimate");
  console.log("ok: 13 stale calculation response is rejected (approve requires a fresh, confirmed calculation)");

  // Re-confirm then recalculate: returns a current v4 result with a different
  // fingerprint (quantity 1 → 4 is price-relevant), and approve now succeeds.
  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const calc2 = await studio.calculate({ organizationId: ORG, estimateId: created.estimateId, actorUserId: ACTOR, body: {} });
  assert.equal(calc2.calculation.pricingEngine, PRICING_ENGINE_V1);
  assert.equal(calc2.calculation.pricingVersion, PRICING_VERSION_4);
  assert.notEqual(calc2.calculationFingerprint, fp1, "recalculation after a price-relevant edit yields a new fingerprint");
  assert.ok(
    calc2.calculation.totals.exactInternalTotal > calc1.calculation.totals.exactInternalTotal,
    "recalculated total reflects the higher quantity"
  );
  const approved2 = await studio.approve({ organizationId: ORG, estimateId: created.estimateId, actorUserId: ACTOR, body: { confirm: true } });
  assert.equal(approved2.status, "approved");
  assert.equal(approved2.approval.calculationFingerprint, calc2.calculationFingerprint);
  console.log("ok: 14 autosave→recalculation returns a current v4 result; approve succeeds once current");

  // Editing an ALREADY-APPROVED estimate must not mutate the frozen approved
  // snapshot — it opens a new revision, preserving the prior revision/snapshot
  // as historical evidence (Legacy and Revision Safety).
  const approvedRowId = created.estimateId;
  const approvedSnapshotBefore = (await repository.getById(ORG, approvedRowId)).calculationSnapshot;
  const revised = await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: approvedRowId,
    actorUserId: ACTOR,
    body: { scope: manualKitchenDraft({ quantity: 5 }) }
  });
  const supersededRow = await repository.getById(ORG, approvedRowId);
  assert.equal(supersededRow.status, "superseded", "editing an approved estimate supersedes the prior revision, never mutates it in place");
  assert.deepEqual(supersededRow.calculationSnapshot, approvedSnapshotBefore, "the superseded revision's frozen calculation snapshot is preserved unchanged");
  assert.equal(revised.id !== approvedRowId, true, "edit-after-approval opens a new active revision with a new id");
  assert.equal(revised.revision, 2, "new active revision increments the revision number");
  assert.equal(revised.calculation, null, "new active revision starts uncalculated (not the stale approved v4 result)");

  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: revised.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const revisedCalc = await studio.calculate({ organizationId: ORG, estimateId: revised.id, actorUserId: ACTOR, body: {} });
  assert.equal(revisedCalc.calculation.pricingEngine, PRICING_ENGINE_V1, "new active revision also calculates with the v1 engine");
  assert.equal(revisedCalc.calculation.pricingVersion, PRICING_VERSION_4, "new active revision also calculates with pricingVersion 4");
  const revisedApproved = await studio.approve({ organizationId: ORG, estimateId: revised.id, actorUserId: ACTOR, body: { confirm: true } });
  assert.equal(revisedApproved.status, "approved");
  console.log("ok: 15 editing an approved estimate preserves the frozen prior revision and calculates the new active revision with pricingVersion 4");
}

// ── Configuration reaching the calculator: material override, edge, cutouts, custom lines ──
{
  const baseScope = () => ({
    ...emptyStudioEstimateScope(),
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    rooms: normalizeManualRooms(manualKitchenDraft().rooms)
  });

  // Room material override reaches the calculator.
  const overrideScope = { ...baseScope(), rooms: baseScope().rooms.map((r) => ({ ...r, materialGroupOverride: "Group C" })) };
  const overrideCalc = await calculateStudioEstimateV4({ scope: overrideScope, env: {} });
  assert.equal(overrideCalc.elite100.rooms[0].materialGroup, "Group C", "room materialGroupOverride reaches the v4 calculator");
  console.log("ok: 16 room material override reaches the calculator");

  // Canonical edge profile + approved finished-edge LF reach the calculator.
  const edgeScope = { ...baseScope(), edgeProfileToken: "edge_small_ogee" };
  const edgeCalc = await calculateStudioEstimateV4({ scope: edgeScope, env: {} });
  assert.equal(edgeCalc.fabrication.edge.profileToken, "edge_small_ogee", "canonical edgeProfileToken reaches the calculator");
  assert.ok(edgeCalc.fabrication.edge.finalLf > 0, "approved finished-edge LF reaches the calculator");
  assert.ok(edgeCalc.fabrication.edge.amount > 0, "edge profile is priced");
  console.log("ok: 17 canonical edge profile + finished-edge LF reach the calculator");

  // Cutout quantities (qty-cook) reach the calculator at the published rate.
  const baselineCalc = await calculateStudioEstimateV4({ scope: baseScope(), env: {} });
  const cutoutScope = { ...baseScope(), addOns: { "qty-cook": 1 } };
  const cutoutCalc = await calculateStudioEstimateV4({ scope: cutoutScope, env: {} });
  assert.equal(
    round2(cutoutCalc.totals.exactInternalTotal - baselineCalc.totals.exactInternalTotal),
    ELITE100_CUTOUT_RATES.cooktop,
    "qty-cook addOn reaches the calculator at the published cooktop cutout rate"
  );
  console.log("ok: 18 cutout add-on quantities reach the calculator at published rates");

  // Custom visible (customer-facing) line reaches the calculator and adds to
  // the customer display total.
  const visibleLineScope = {
    ...baseScope(),
    customLineItems: [
      { id: "cust-visible-1", name: "Trip charge", category: "Fee", commercialRole: "customer_charge", quantity: 1, unitPrice: 65 }
    ]
  };
  const visibleCalc = await calculateStudioEstimateV4({ scope: visibleLineScope, env: {} });
  // customerDisplayTotal is the exact total rounded UP to the nearest $10 for
  // customer presentation (published, tested behavior of the v1 calculator —
  // see elite100RoomPricingCalculator.test.mjs's "display total rounds up
  // once to the nearest $10"), so a $65 line does not necessarily move the
  // *rounded* display total by exactly $65. Assert the exact economics (what
  // the customer is actually charged before presentation rounding) increase
  // by the line's full amount, then independently confirm the display total
  // is the real rounding of that new exact total.
  assert.equal(
    round2(visibleCalc.totals.exactInternalTotal - baselineCalc.totals.exactInternalTotal),
    65,
    "customer-facing custom line increases the exact estimate total by its full amount"
  );
  assert.equal(
    visibleCalc.totals.customerDisplayTotal,
    roundPublicEstimateToNearestTen(visibleCalc.totals.exactTotal),
    "customer display total is the real nearest-$10 rounding of the new exact total"
  );
  const visibleItem = visibleCalc.fabrication.customLineItems.find((l) => l.id === "cust-visible-1");
  assert.ok(visibleItem, "custom line appears in fabrication.customLineItems");
  assert.equal(visibleItem.customerFacing, true, "customer-facing role reaches the read model as customerFacing:true");
  assert.equal(visibleItem.roomId, null, "estimate-level custom line has no roomId");
  console.log("ok: 19 custom visible (customer-facing) line reaches the calculator and the read model");

  // Hidden customer-impacting charge: increases the customer total by its
  // full amount, is folded into Countertop Material display (not its own
  // visible line), remains independently auditable, and is never taxed as
  // stone (material use tax base is unaffected).
  const roomId = baseScope().rooms[0].id;
  const hiddenLineScope = {
    ...baseScope(),
    customLineItems: [
      {
        id: "hidden-1",
        name: "Trip protection padding",
        category: "Fee",
        quantity: 1,
        unitPrice: 60,
        roomId,
        customerFacing: false // legacy shape → inferred role legacy_hidden_customer_charge
      }
    ]
  };
  const hiddenCalc = await calculateStudioEstimateV4({ scope: hiddenLineScope, env: {} });
  assert.equal(
    round2(hiddenCalc.totals.customerDisplayTotal - baselineCalc.totals.customerDisplayTotal),
    60,
    "hidden customer-impacting charge increases the customer display total by its full amount"
  );
  assert.equal(
    hiddenCalc.elite100.rooms[0].materialUseTaxAmount,
    baselineCalc.elite100.rooms[0].materialUseTaxAmount,
    "hidden customer-impacting charge never becomes taxable stone (material use tax base unchanged)"
  );
  assert.equal(
    round2(hiddenCalc.elite100.rooms[0].countertopMaterialDisplayAmount - baselineCalc.elite100.rooms[0].countertopMaterialDisplayAmount),
    60,
    "hidden charge dollar amount is allocated into the Countertop Material customer-safe display line"
  );
  assert.ok(
    hiddenCalc.elite100.rooms[0].hiddenCustomerChargeLines.some((l) => l.id === "hidden-1"),
    "hidden charge remains independently auditable in the internal snapshot"
  );
  const hiddenPublicNames = JSON.stringify(hiddenCalc.elite100.customerFacing || {});
  assert.equal(hiddenPublicNames.includes("Trip protection padding"), false, "hidden charge is not exposed as its own customer-facing line item");
  console.log("ok: 20 hidden customer-impacting charge: increases customer total, folds into material, untaxed, auditable internally");
}

// Trusted account ID reaches pricing context safely (env-driven allowlist,
// never inferred from customer name; never leaked to customer-safe output).
{
  const trustedEnv = { ELITE100_TRUSTED_WATTS_PARTNER_ACCOUNT_IDS: "trusted-watts-test-id" };
  const scopeBase = {
    ...emptyStudioEstimateScope(),
    pricingBasis: "direct",
    materialGroup: "Group Promo",
    customerName: "Totally Unrelated Name LLC",
    rooms: normalizeManualRooms(manualKitchenDraft().rooms)
  };
  const untrustedCalc = await calculateStudioEstimateV4({ scope: scopeBase, env: trustedEnv });
  const trustedCalc = await calculateStudioEstimateV4({
    scope: { ...scopeBase, partnerAccountId: "trusted-watts-test-id" },
    env: trustedEnv
  });
  assert.notEqual(
    trustedCalc.totals.exactInternalTotal,
    untrustedCalc.totals.exactInternalTotal,
    "trusted partnerAccountId (env allowlist) changes pricing vs. an untrusted/customer-name-only scope"
  );
  assert.equal(
    trustedCalc.elite100.rooms[0].materialRateSource,
    "watts_trusted_promo",
    "trusted account id reaches pricing context and resolves the Watts trusted rate"
  );
  const customerSafeBlob = JSON.stringify(trustedCalc.elite100.customerFacing || {});
  assert.equal(customerSafeBlob.includes("trusted-watts-test-id"), false, "trusted partner account id is never leaked into the customer-safe projection");
  assert.equal(/watts/i.test(customerSafeBlob), false, "trusted-account internal naming never leaks into the customer-safe projection");
  console.log("ok: 21 trusted account id reaches pricing context via env-driven config, not customer name, and never leaks customer-safe output");
}

// Warnings and unresolved items surface in the Studio read model.
{
  const repository = new InMemoryStudioEstimateRepository();
  const studio = noTakeoffService({ repository });
  // Two rooms with the one estimate-wide finished-edge LF triggers the
  // documented adapter warning (adapter_edge_lf_single_room_assignment).
  const rooms = normalizeManualRooms([
    ...manualKitchenDraft().rooms,
    { id: "room-vanity", name: "Powder Bath", roomType: "Vanity", pieces: [{ id: "piece-vanity", name: "Vanity top", measurementMode: "dimensions", lengthIn: 60, depthIn: 22 }] }
  ]);
  const row = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-warnings-1",
    takeoffJobId: null,
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: {
      ...emptyStudioEstimateScope(),
      pricingBasis: "wholesale",
      estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
      physicalScopeSource: MANUAL_ESTIMATE_ORIGIN,
      manualScopeConfirmed: true,
      rooms
    },
    createdByUserId: ACTOR
  });
  const priced = await studio.calculate({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: {} });
  assert.ok(Array.isArray(priced.calculation.warnings), "warnings array present on the read model");
  assert.ok(priced.calculation.warnings.length > 0, "multi-room estimate-wide edge LF assignment produces a visible warning");
  assert.ok(Array.isArray(priced.calculation.unresolvedItems), "unresolvedItems array present on the read model (even when empty)");
  console.log("ok: 22 warnings surface in the Studio read model (safeEstimateView)");
}

// ════════════════════════════════════════════════════════════════════════
// PUBLISH — one-step Publish uses the real v4 calculation end-to-end
// ════════════════════════════════════════════════════════════════════════
{
  const repository = new InMemoryStudioEstimateRepository();
  const intake = new InMemoryQuoteIntakeRepository();
  const studio = noTakeoffService({ repository });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: repository,
    studioEstimateService: studio
  });

  let publishedArgs = null;
  const workflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: studio,
    manualEstimateService: manual,
    digitalEstimateService: {
      async publish(args) {
        publishedArgs = args;
        const est = studio.safeEstimateView(await repository.getById(ORG, args.estimateId));
        return {
          ok: true,
          customerUrl: "https://example.test/de/wiring-1",
          customerDisplayTotal: est.calculation.totals.customerDisplayTotal,
          calculationFingerprint: est.calculationFingerprint
        };
      }
    }
  });

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "wiring-publish-1",
    body: {
      projectName: "Publish Wiring Kitchen",
      customerName: "Publish Test Co",
      customerEmail: "publish-wiring@example.test"
    }
  });
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: manualKitchenDraft({ quantity: 2 }) }
  });

  const result = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.ok(result.preparedSteps.includes("manual_scope_auto_confirmed"), "publish auto-confirms manual scope");
  assert.ok(result.preparedSteps.includes("calculated"), "publish path runs the real authoritative calculate step");
  assert.ok(result.preparedSteps.includes("commercially_approved"), "publish path runs the approval step");

  const finalRow = await repository.getById(ORG, created.estimateId);
  assert.equal(finalRow.calculationSnapshot.pricingEngine, PRICING_ENGINE_V1, "the calculation frozen at publish time is the v1 engine");
  assert.equal(finalRow.calculationSnapshot.pricingVersion, PRICING_VERSION_4, "the calculation frozen at publish time is pricingVersion 4");
  assert.equal(
    publishedArgs.estimateId,
    created.estimateId,
    "digital estimate publish call targets the just-calculated/approved estimate"
  );
  assert.equal(
    result.publication.customerDisplayTotal,
    finalRow.approval.customerDisplayTotal,
    "published customer display total equals the Review & Publish (approved) v4 total"
  );
  assert.equal(
    result.publication.calculationFingerprint,
    finalRow.approval.calculationFingerprint,
    "published fingerprint equals the approved current fingerprint"
  );
  console.log("ok: 23 one-step Publish flushes/calculates/approves with v4 and publishes the same total+fingerprint shown in Review & Publish");

  // Unresolved (legacy) commercial item blocks publication before any publish call.
  const blockedRepo = new InMemoryStudioEstimateRepository();
  const blockedIntake = new InMemoryQuoteIntakeRepository();
  const blockedStudio = noTakeoffService({ repository: blockedRepo });
  const blockedManual = createStudioManualEstimateService({
    quoteIntakeRepository: blockedIntake,
    studioEstimateRepository: blockedRepo,
    studioEstimateService: blockedStudio
  });
  let blockedPublishCalled = false;
  const blockedWorkflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: blockedStudio,
    manualEstimateService: blockedManual,
    digitalEstimateService: {
      async publish() {
        blockedPublishCalled = true;
        throw new Error("publish must not be reached when unresolved items block approval");
      }
    }
  });
  const blockedCreated = await blockedManual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "wiring-publish-blocked-1",
    body: {
      projectName: "Blocked Publish Kitchen",
      customerName: "Blocked Test Co",
      customerEmail: "blocked-publish@example.test"
    }
  });
  await blockedManual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: blockedCreated.estimateId,
    actorUserId: ACTOR,
    body: { scope: { ...manualKitchenDraft(), addOns: { "qty-blanco": 1 } } }
  });
  let blockedCode = null;
  try {
    await blockedWorkflow.publishDigitalEstimate({
      organizationId: ORG,
      estimateId: blockedCreated.estimateId,
      actorUserId: ACTOR,
      body: { confirm: true }
    });
  } catch (e) {
    blockedCode = e.code;
  }
  assert.equal(blockedCode, "unresolved_items", "unresolved price-required selection blocks publication");
  assert.equal(blockedPublishCalled, false, "publish is never invoked when approval is blocked by unresolved items");
  console.log("ok: 24 unresolved price-required selections block publication before publish is invoked");

  // Informational adapter warnings (multi-room single-room edge assignment)
  // do not block publication.
  const warnRepo = new InMemoryStudioEstimateRepository();
  const warnIntake = new InMemoryQuoteIntakeRepository();
  const warnStudio = noTakeoffService({ repository: warnRepo });
  const warnManual = createStudioManualEstimateService({
    quoteIntakeRepository: warnIntake,
    studioEstimateRepository: warnRepo,
    studioEstimateService: warnStudio
  });
  const warnWorkflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: warnStudio,
    manualEstimateService: warnManual,
    digitalEstimateService: {
      async publish() {
        return { ok: true, customerUrl: "https://example.test/de/warn-1" };
      }
    }
  });
  const warnCreated = await warnManual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "wiring-publish-warn-1",
    body: {
      projectName: "Multi-room Kitchen",
      customerName: "Warn Test Co",
      customerEmail: "warn-test@example.test"
    }
  });
  await warnManual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: warnCreated.estimateId,
    actorUserId: ACTOR,
    body: {
      scope: {
        rooms: [
          ...manualKitchenDraft().rooms,
          {
            id: "room-vanity-2",
            name: "Second Vanity",
            roomType: "Vanity",
            pieces: [
              {
                id: "piece-vanity-2",
                name: "Vanity top",
                measurementMode: "dimensions",
                lengthIn: 48,
                depthIn: 22,
                finishedEdge: { frontEdgeLengthIn: 48, totalFinishedEdgeLengthIn: 48, approved: true }
              }
            ]
          }
        ],
        addOns: {}
      }
    }
  });
  const warnResult = await warnWorkflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: warnCreated.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.ok(warnResult.ok, "informational adapter warnings do not block publication");
  console.log("ok: 25 informational warnings do not incorrectly block publication");
}

// ════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY — v3 module untouched; historical snapshots unaffected
// ════════════════════════════════════════════════════════════════════════
{
  // v3 (studioEstimatePricing.mjs) still calculates independently of v4 —
  // proves the legacy calculator path is fully intact and reachable.
  const scope = {
    ...emptyStudioEstimateScope(),
    pricingBasis: "wholesale",
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        included: true,
        countertopSqft: 20,
        pieces: [{ id: "r1-p1", name: "Top", included: true, pieceType: "counter", sqft: 20, lengthIn: 96, depthIn: 30 }]
      }
    ]
  };
  const v3Calc = await calculateStudioEstimate({ scope, env: {} });
  assert.ok(v3Calc.ok, "legacy v3 calculator still calculates");
  assert.notEqual(v3Calc.pricingEngine, PRICING_ENGINE_V1, "v3 calculation is not mislabeled as the v1 engine");
  console.log("ok: 26 legacy studioEstimatePricing.mjs (pricingVersion 3) calculates independently, unmodified");

  // A historical row with a frozen v1(legacy)/v2/v3-shaped snapshot loads
  // unchanged — safeEstimateView must not recompute or mutate it.
  const repository = new InMemoryStudioEstimateRepository();
  const historicalSnapshot = {
    fingerprint: "historical-fp-v3",
    calculatedAt: "2026-01-01T00:00:00.000Z",
    pricingEngine: "studio-legacy",
    pricingVersion: 3,
    totals: { exactInternalTotal: 4321, customerDisplayTotal: 4500 },
    fabrication: { addOns: {}, edge: { finalLf: 10 }, customLineItems: [] },
    warnings: [],
    unresolvedItems: []
  };
  const historicalRow = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-historical-1",
    takeoffJobId: null,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    scope: { ...emptyStudioEstimateScope(), rooms: [] },
    calculationSnapshot: historicalSnapshot,
    approval: {
      approvedAt: "2026-01-02T00:00:00.000Z",
      calculationFingerprint: "historical-fp-v3",
      exactInternalTotal: 4321,
      customerDisplayTotal: 4500
    },
    createdByUserId: ACTOR
  });
  const studio = noTakeoffService({ repository });
  const loaded = studio.safeEstimateView(await repository.getById(ORG, historicalRow.id));
  assert.equal(loaded.calculationSnapshot.pricingVersion, 3, "historical pricingVersion 3 snapshot loads unchanged");
  assert.equal(loaded.calculationSnapshot.fingerprint, "historical-fp-v3", "historical fingerprint is not recomputed on load");
  assert.equal(loaded.calculation.totals.customerDisplayTotal, 4500, "historical frozen total is not recomputed on load");
  assert.equal(loaded.pricingEngine, "studio-legacy", "read model surfaces the historical engine as-is, not relabeled v1");
  console.log("ok: 27 historical pricingVersion 3 snapshot loads unchanged (not recalculated, not relabeled)");
}

console.log("\nAll studioCalculatorWiring integration tests passed.\n");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
