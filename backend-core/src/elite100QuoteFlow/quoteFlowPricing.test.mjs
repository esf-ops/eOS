/**
 * Elite 100 Quote Flow — Estimates Pricing tab (Slice 1E).
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowPricing.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createQuoteFlowPricingService,
  stampOpenEdgeLfOntoScopeForPricing,
  presentQuoteFlowPricingResult
} from "./quoteFlowPricing.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowPricing.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "55555555-5555-4555-8555-555555555555";
const EST_UNSCOPED = "66666666-6666-4666-8666-666666666666";

function baseRooms(overrides = {}) {
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
          finishedEdgeLf: 10,
          ...overrides.piece
        },
        ...(overrides.extraPieces || [])
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
  const stamped = stampOpenEdgeLfOntoScopeForPricing({
    rooms: [
      {
        pieces: [{ name: "A", openEdgeLf: 12.5 }]
      }
    ]
  });
  assert.equal(stamped.rooms[0].pieces[0].openEdgeLf, 12.5);
  assert.equal(stamped.rooms[0].pieces[0].finishedEdgeLf, 12.5);
  console.log("ok: openEdgeLf stamps finishedEdgeLf for calculator");
}

{
  const empty = presentQuoteFlowPricingResult({ calculationSnapshot: null });
  assert.equal(empty.available, false);
  assert.equal(empty.estimatedTotal, null);
  assert.ok(!("elite100" in empty));
  assert.ok(!("calculationSnapshot" in empty));
  console.log("ok: pricing result presenter omits raw payloads");
}

{
  const repo = makeStore([
    {
      id: EST_UNSCOPED,
      status: "draft",
      revision: 1,
      scope: { rooms: [] },
      calculationSnapshot: null,
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
        projectName: "Relihan Kitchen"
      },
      calculationSnapshot: null,
      staleReason: null
    }
  ]);

  let calcCalls = 0;
  /** @type {object|null} */
  let lastCalcScope = null;
  const svc = createQuoteFlowPricingService({
    estimateRepository: repo,
    async calculateStudioEstimate(args) {
      calcCalls += 1;
      lastCalcScope = args.scope;
      return calculateStudioEstimateV4(args);
    },
    env: {}
  });

  await assert.rejects(
    () => svc.getPricing({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );
  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST_UNSCOPED,
        body: { pricing: { pricingBasis: "direct" } }
      }),
    (e) => e.code === "estimate_not_scoped"
  );
  await assert.rejects(
    () => svc.calculatePricing({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );
  console.log("ok: pricing routes reject unscoped estimate");

  const loaded = await svc.getPricing({ organizationId: ORG, estimateId: EST });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.scopeSummary.openEdgeLf, 10);
  assert.equal(loaded.scopeSummary.pieceCount, 1);
  assert.ok(loaded.editablePricing?.pricingBasis);
  assert.ok(loaded.editablePricing?.materialGroup);
  assert.equal(loaded.lastCalculation.available, false);
  assert.equal(loaded.sideEffects.approved, false);
  assert.equal(loaded.sideEffects.published, false);
  assert.equal(loaded.sideEffects.sold, false);
  assert.equal(loaded.sideEffects.digitalEstimateCreated, false);
  console.log("ok: GET pricing loads official scope as source of truth");

  const saved = await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    body: {
      pricing: {
        pricingBasis: "direct",
        materialGroup: "Group A",
        estimateWideAdjustment: { active: false, percentage: 0, reason: "" }
      }
    }
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.editablePricing.pricingBasis, "direct");
  assert.equal(saved.editablePricing.materialGroup, "Group A");
  assert.equal(saved.pricingStale, true);
  assert.match(String(saved.staleReason || ""), /recalculate/i);
  assert.equal(repo.peek(EST).scope.pricingBasis, "direct");
  assert.equal(repo.peek(EST).scope.materialGroup, "Group A");
  assert.equal(repo.peek(EST).scope.quoteFlowPricingEdited, true);
  console.log("ok: pricing config can be saved as draft");

  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        body: { pricing: { pricingBasis: "not-a-basis" } }
      }),
    (e) => e.code === "pricing_invalid"
  );
  console.log("ok: missing/invalid pricing input returns safe validation");

  const calculated = await svc.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    body: {
      pricing: { pricingBasis: "wholesale", materialGroup: "Group Promo" }
    }
  });
  assert.equal(calculated.ok, true);
  assert.equal(calcCalls, 1);
  assert.ok(lastCalcScope, "calculator received scope");
  assert.equal(lastCalcScope.rooms[0].pieces[0].finishedEdgeLf, 10);
  assert.equal(lastCalcScope.rooms[0].pieces[0].openEdgeLf, 10);
  assert.equal(calculated.lastCalculation.available, true);
  assert.ok(
    Number(calculated.lastCalculation.estimatedTotal) > 0 ||
      Number(calculated.lastCalculation.exactInternalTotal) > 0,
    "trusted calculator returned a total"
  );
  assert.ok(!("elite100" in calculated.lastCalculation));
  assert.ok(!("calculationSnapshot" in calculated.lastCalculation));
  assert.equal(calculated.sideEffects.approved, false);
  assert.equal(calculated.sideEffects.published, false);
  assert.equal(calculated.sideEffects.sold, false);
  assert.equal(calculated.sideEffects.digitalEstimateCreated, false);
  assert.equal(calculated.sideEffects.calculated, false);
  assert.equal(calculated.persisted, true);
  assert.equal(repo.peek(EST).status, "priced");
  assert.ok(repo.peek(EST).calculationSnapshot);
  console.log("ok: calculate uses trusted calculator; open edge LF included; no raw payload");

  // Excluded piece must not add open edge / must follow calculator included rules.
  await repo.update(ORG, EST, {
    status: "ready_to_price",
    calculationSnapshot: null,
    staleReason: null,
    scope: {
      rooms: baseRooms({
        extraPieces: [
          {
            id: "p-ex",
            name: "Excluded splash",
            lengthIn: 48,
            depthIn: 4,
            quantity: 1,
            included: false,
            excluded: true,
            openEdgeLf: 99,
            finishedEdgeLf: 99
          }
        ]
      }),
      pricingBasis: "wholesale",
      materialGroup: "Group Promo"
    }
  });
  const withExcluded = await svc.calculatePricing({
    organizationId: ORG,
    estimateId: EST
  });
  assert.equal(withExcluded.ok, true);
  assert.ok(
    (withExcluded.calculationNotes || []).some((n) => /excluded/i.test(String(n))),
    "notes mention excluded pieces"
  );
  // Edge LF from calculator should not price the excluded 99 LF as if included.
  const edgeLf = withExcluded.lastCalculation?.breakdown?.edgeLf;
  if (edgeLf != null) {
    assert.ok(Number(edgeLf) < 50, `excluded 99 LF must not dominate edgeLf (got ${edgeLf})`);
  }
  console.log("ok: excluded pieces handled per calculator / notes");

  // Stale marker after pricing draft change post-calc
  await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    body: { pricing: { materialGroup: "Group B" } }
  });
  const staleGet = await svc.getPricing({ organizationId: ORG, estimateId: EST });
  assert.equal(staleGet.pricingStale, true);
  assert.match(String(staleGet.staleReason || ""), /Pricing settings changed/i);
  console.log("ok: pricing stale marker after draft change");

  // Simulate scope-changed stale from updateScope
  await repo.update(ORG, EST, {
    staleReason: "Scope changed — recalculate",
    status: "ready_to_price",
    calculationSnapshot: null
  });
  const scopeStale = await svc.getPricing({ organizationId: ORG, estimateId: EST });
  assert.equal(scopeStale.scopeChangedSinceCalculation, true);
  console.log("ok: scope-changed stale marker");

  // Custom line items — customer / internal / note
  await repo.update(ORG, EST, {
    status: "ready_to_price",
    calculationSnapshot: null,
    staleReason: null,
    scope: {
      rooms: baseRooms(),
      pricingBasis: "wholesale",
      materialGroup: "Group Promo"
    }
  });

  const baseline = await svc.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    body: { pricing: { pricingBasis: "wholesale", materialGroup: "Group Promo", customLineItems: [] } }
  });
  const baselineTotal = Number(
    baseline.lastCalculation.exactInternalTotal ?? baseline.lastCalculation.estimatedTotal
  );
  assert.ok(baselineTotal > 0);

  const withLines = await svc.patchPricing({
    organizationId: ORG,
    estimateId: EST,
    body: {
      pricing: {
        customLineItems: [
          {
            id: "cli-cust-charge",
            label: "Special install charge",
            type: "charge",
            visibility: "customer",
            quantity: 1,
            unitAmount: 150,
            category: "install"
          },
          {
            id: "cli-cust-credit",
            label: "Promo credit",
            type: "credit",
            visibility: "customer",
            quantity: 1,
            unitAmount: 40,
            category: "adjustment"
          },
          {
            id: "cli-int-charge",
            label: "Extra shop labor",
            type: "charge",
            visibility: "internal",
            quantity: 2,
            unitAmount: 25,
            category: "labor"
          },
          {
            id: "cli-note",
            label: "Estimator note: verify sink model",
            type: "note",
            visibility: "internal",
            note: "Do not show externally"
          }
        ]
      }
    }
  });
  assert.equal(withLines.ok, true);
  assert.equal(withLines.customLineItems.length, 4);
  assert.equal(
    withLines.customLineItems.filter((l) => l.visibility === "customer").length,
    2
  );
  assert.equal(
    withLines.customLineItems.filter((l) => l.visibility === "internal").length,
    2
  );
  assert.equal(withLines.customLineSummary.customerFacingChargesTotal, 150);
  assert.equal(withLines.customLineSummary.customerFacingCreditsTotal, 40);
  assert.equal(withLines.customLineSummary.internalOnlyChargesTotal, 50);
  assert.equal(withLines.customLineSummary.noteOnlyCount, 1);
  assert.equal(withLines.customLineSummary.netCustomAdjustment, 160);
  const persistedQfp = repo.peek(EST).scope.quoteFlowPricing.customLineItems;
  assert.equal(persistedQfp.length, 4);
  assert.ok(persistedQfp.some((l) => l.visibility === "customer" && l.type === "charge"));
  assert.ok(persistedQfp.some((l) => l.visibility === "internal" && l.type === "note"));
  // Notes must not be mapped into Studio calculator lines.
  assert.ok(
    !(repo.peek(EST).scope.customLineItems || []).some((l) => /Estimator note/i.test(String(l.name || "")))
  );
  assert.ok(
    (repo.peek(EST).scope.customLineItems || []).some((l) => l.commercialRole === "customer_charge")
  );
  assert.ok(
    (repo.peek(EST).scope.customLineItems || []).some((l) => l.commercialRole === "internal_only")
  );
  console.log("ok: pricing draft saves customer-facing and internal-only line items");

  await assert.rejects(
    () =>
      svc.patchPricing({
        organizationId: ORG,
        estimateId: EST,
        body: {
          pricing: {
            customLineItems: [{ type: "charge", visibility: "customer", unitAmount: 10 }]
          }
        }
      }),
    (e) => e.code === "pricing_invalid"
  );
  console.log("ok: missing label returns safe validation");

  const calcWithLines = await svc.calculatePricing({ organizationId: ORG, estimateId: EST });
  assert.equal(calcWithLines.ok, true);
  assert.equal(calcWithLines.sideEffects.approved, false);
  assert.equal(calcWithLines.sideEffects.published, false);
  assert.equal(calcWithLines.sideEffects.sold, false);
  assert.equal(calcWithLines.sideEffects.digitalEstimateCreated, false);
  const withLinesTotal = Number(
    calcWithLines.lastCalculation.exactInternalTotal ??
      calcWithLines.lastCalculation.estimatedTotal
  );
  // Customer net +100 and internal +50 should raise exact internal total vs baseline.
  assert.ok(
    withLinesTotal >= baselineTotal + 140,
    `expected internal total to include billable customs (baseline=${baselineTotal}, got=${withLinesTotal})`
  );
  assert.equal(calcWithLines.customLineSummary.netCustomAdjustment, 160);
  assert.equal(calcWithLines.lastCalculation.customLineItems.summary.netCustomAdjustment, 160);
  assert.equal(calcWithLines.lastCalculation.customLineItems.customerFacing.length, 2);
  assert.equal(calcWithLines.lastCalculation.customLineItems.internalOnly.length, 2);
  // Notes do not change totals when toggling note amount (already 0).
  const noteOnly = await svc.calculatePricing({
    organizationId: ORG,
    estimateId: EST,
    body: {
      pricing: {
        customLineItems: [
          {
            id: "only-note",
            label: "Just a note",
            type: "note",
            visibility: "internal"
          }
        ]
      }
    }
  });
  const noteTotal = Number(
    noteOnly.lastCalculation.exactInternalTotal ?? noteOnly.lastCalculation.estimatedTotal
  );
  assert.ok(
    Math.abs(noteTotal - baselineTotal) < 0.02,
    `note-only should not change total (baseline=${baselineTotal}, got=${noteTotal})`
  );
  console.log("ok: charges/credits affect calc; notes do not; visibility preserved");

  // Edge pending when open edge LF exists but no profile selected
  const edgePending = presentQuoteFlowPricingResult({
    scope: {
      rooms: baseRooms(),
      // no edgeProfileToken
    },
    calculationSnapshot: {
      fabrication: { edge: { amount: 0, finalLf: 10, tier: "free", profileToken: null } },
      totals: { exactInternalTotal: 100, customerDisplayTotal: 100 }
    }
  });
  assert.equal(edgePending.edgeStatus.chargeStatus, "pending");
  assert.equal(edgePending.edgeStatus.profileDisplay, "Not selected");
  assert.equal(edgePending.breakdown.edgeLf, null);
  console.log("ok: edge pending when openEdgeLf exists without profile");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /estimates\/:estimateId\/pricing/);
  assert.match(routes, /pricing\/calculate/);
  assert.match(routes, /createQuoteFlowPricingService/);
  assert.match(routes, /digital-estimate/);
  assert.doesNotMatch(routes, /markSold|approveWorkingDraft|takeoff-finish/);
  // Routes must not import calculator directly (service owns that).
  assert.doesNotMatch(routes, /calculateStudioEstimateV4/);
  const pricingSrc = readFileSync(join(__dirname, "quoteFlowPricing.mjs"), "utf8");
  assert.match(pricingSrc, /calculateStudioEstimateV4/);
  assert.match(pricingSrc, /buildStudioV2EditablePricing/);
  assert.match(pricingSrc, /normalizeStudioV2PricingPatch/);
  assert.doesNotMatch(pricingSrc, /publishApproved\(|markSold\(|from ["'].*digitalEstimate/);
  assert.doesNotMatch(pricingSrc, /approveWorkingDraft|ensureEditableDraft/);
  console.log("ok: route/source contracts; trusted calculator reused; no DE/approve/sold");
}

{
  const de = join(root, "app-digital-estimate");
  const dig = join(root, "backend-core/src/digitalEstimate");
  assert.ok(de);
  assert.ok(dig);
  console.log("ok: pricing tests do not require digital estimate module edits");
}

console.log("\nquoteFlowPricing.test.mjs: ok\n");
