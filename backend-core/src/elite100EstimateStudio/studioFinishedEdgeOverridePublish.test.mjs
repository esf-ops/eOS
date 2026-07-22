/**
 * Finished-edge confirmation persistence + Pricing Setup override + publish readiness.
 * Run: node backend-core/src/elite100EstimateStudio/studioFinishedEdgeOverridePublish.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  flattenPieces,
  patchRunFinishedEdge
} from "../../../app-ai-takeoff/src/lib/consolidatedWorksheetRows.mjs";
import { buildTakeoffImportPayload } from "../takeoff/takeoffImportPayload.mjs";
import { computeTakeoffMeasurements } from "../takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../takeoff/takeoffValidator.mjs";
import {
  seedScopeFromTakeoffPayload
} from "./studioEstimateService.mjs";
import {
  normalizeFinishedEdgeOverride,
  resolveScopeEdgeLinearFeet,
  collectScopeAdjustmentIssues
} from "./studioScopeBilling.mjs";
import { assessStudioEstimatePublicationReadiness } from "./studioEstimatePublicationAdapter.mjs";
import { buildStudioPublicationReadinessDto } from "./studioPublicationReadiness.mjs";
import { calculateStudioEstimate } from "./studioEstimatePricing.mjs";
import { STUDIO_ESTIMATE_STATUSES, EDGE_SCOPE_SOURCES } from "./studioEstimateTypes.mjs";
import { buildCustomerSafeEdgeOptionEffects } from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "../digitalEstimate/configuration/configurationPublicSerializer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(
  join(here, "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
  "utf8"
);
const dePanel = readFileSync(
  join(here, "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
  "utf8"
);

console.log("\nstudioFinishedEdgeOverridePublish.test.mjs\n");

function draftTakeoff() {
  return {
    schemaVersion: "1.0",
    status: "needs_review",
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        roomType: "Kitchen",
        areas: [
          {
            id: "a1",
            label: "Main",
            runs: [
              {
                id: "run-1",
                label: "Sink Wall",
                lengthIn: 150,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: true
              },
              {
                id: "run-2",
                label: "Right Wall",
                lengthIn: 39,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: true
              }
            ]
          }
        ]
      }
    ]
  };
}

function confirmAll(result) {
  let next = result;
  for (const row of flattenPieces(next, new Set())) {
    next = patchRunFinishedEdge(
      next,
      { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
      {
        frontEdgeLengthIn: row.lengthIn,
        leftExposedEdgeLengthIn: 0,
        rightExposedEdgeLengthIn: 0,
        otherExposedEdgeLengthIn: 0
      }
    );
  }
  return next;
}

function approvedImport(takeoffResult) {
  const computed = computeTakeoffMeasurements(takeoffResult);
  return buildTakeoffImportPayload({
    takeoffJobId: "job-fe",
    takeoffResultId: "result-fe",
    takeoffResult,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { r1: true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed,
    validation: validateTakeoffResult(takeoffResult, computed),
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
}

function approvedEstimate(scope, calc) {
  return {
    id: "est-fe-1",
    organizationId: "00000000-0000-4000-8000-000000000001",
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope,
    calculationFingerprint: calc.fingerprint,
    calculationSnapshot: calc,
    pricingEngine: calc.pricingEngine || "studio_estimate_v1",
    pricingVersion: calc.pricingVersion ?? 2,
    approval: {
      approvedAt: "2026-07-22T12:00:00Z",
      calculationFingerprint: calc.fingerprint,
      customerDisplayTotal: calc.totals.customerDisplayTotal
    },
    takeoffJobId: "job-fe"
  };
}

// 1–3. Confirmed geometry persists through save/reload → approval → Studio hydrate
{
  const confirmed = confirmAll(draftTakeoff());
  const rows = flattenPieces(confirmed, new Set());
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.finishedEdgeApproved, true);
    assert.equal(r.finishedEdge?.finishedEdgeConfirmed ?? confirmed.rooms[0].areas[0].runs.find((x) => x.id === r.runId)?.finishedEdge?.finishedEdgeConfirmed, true);
  }
  const run = confirmed.rooms[0].areas[0].runs[0];
  assert.equal(run.finishedEdge.finishedEdgeConfirmed, true);
  assert.equal(run.finishedEdge.frontEdgeLengthIn, 150);

  const payload = approvedImport(confirmed);
  assert.equal(payload.scopeSummary.edgeScopeSource, "finished_edge_v2");
  assert.equal(payload.scopeSummary.edgeGeometryConfirmationRequired, false);
  assert.ok(payload.rooms[0].pieces.every((p) => p.finishedEdge?.finishedEdgeConfirmed || p.finishedEdge?.approved));

  const scope = seedScopeFromTakeoffPayload(payload, null);
  const counterPieces = scope.rooms[0].pieces.filter((p) => {
    const pt = String(p.pieceType || "counter").toLowerCase();
    return pt === "counter" || pt === "";
  });
  assert.equal(counterPieces.length, 2);
  assert.ok(
    counterPieces.every((p) => p.finishedEdge?.approved || p.finishedEdge?.finishedEdgeConfirmed)
  );
  assert.equal(scope.takeoffScopeSummary.edgeGeometryConfirmationRequired, false);
  assert.equal(scope.takeoffScopeSummary.edgeScopeSource, "finished_edge_v2");
  const resolved = resolveScopeEdgeLinearFeet(scope);
  assert.equal(resolved.confirmationRequired, false);
  assert.equal(resolved.finalLf, Math.round(((150 + 39) / 12) * 100) / 100);
  console.log("ok: confirmed geometry persists save → approval → Studio hydrate");
}

// 4–6. Approved estimate does not fail duplicate geometry gate; 0 LF warns
{
  const confirmed = confirmAll(draftTakeoff());
  const scope = seedScopeFromTakeoffPayload(approvedImport(confirmed), null);
  scope.customerName = "Acme";
  scope.projectName = "Kitchen";
  scope.edgeProfileToken = "edge_eased";
  const calc = await calculateStudioEstimate({
    scope,
    actorUserId: "u1",
    env: {}
  });
  const estimate = approvedEstimate(scope, calc);

  // Stale confirmation flag must not block after approval.
  estimate.scope = {
    ...scope,
    takeoffScopeSummary: {
      ...scope.takeoffScopeSummary,
      edgeGeometryConfirmationRequired: true,
      edgeScopeSource: "finished_edge_geometry_required"
    }
  };

  const readiness = assessStudioEstimatePublicationReadiness({
    estimate,
    repositoryMode: "injected",
    takeoffReviewStatus: "approved",
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    configuration: {
      pricingValidThrough: "2026-08-15",
      allowedOptionKeys: [],
      customerChoiceGroups: []
    }
  });
  assert.equal(
    readiness.blockers.some((b) => b.code === "finished_edge_geometry_required"),
    false
  );
  assert.ok(
    readiness.warnings.some((w) => w.code === "legacy_finished_edge_geometry_advisory")
  );

  const dto = buildStudioPublicationReadinessDto({
    estimate,
    readiness,
    configuration: { pricingValidThrough: "2026-08-15" },
    publishedConfiguration: { envelopeFingerprint: readiness.details.envelopeFingerprint },
    activePublication: null
  });
  assert.notEqual(dto.primaryMessage?.code, "finished_edge_geometry_required");
  assert.equal(
    /Confirm finished-edge geometry/i.test(dto.primaryMessage?.message || ""),
    false
  );
  // Ready or "save settings" — never a geometry confirmation block after approval.
  assert.equal(dto.pricing.approvalStatus, "approved_current");
  assert.equal(readiness.eligible, true);
  assert.ok(
    dto.primaryMessage?.code === "ready" ||
      dto.primaryMessage?.code === "ready_with_geometry_advisory" ||
      dto.primaryMessage?.code === "publication_settings_unsaved"
  );

  // Approved 0 LF → warning, not block
  const zeroCalc = {
    ...calc,
    fingerprint: "fp-zero",
    fabrication: {
      ...calc.fabrication,
      edge: { ...calc.fabrication.edge, finalLf: 0, amount: 0 }
    }
  };
  const zeroEst = approvedEstimate(scope, zeroCalc);
  zeroEst.calculationFingerprint = "fp-zero";
  zeroEst.approval.calculationFingerprint = "fp-zero";
  const zeroReadiness = assessStudioEstimatePublicationReadiness({
    estimate: zeroEst,
    repositoryMode: "injected",
    takeoffReviewStatus: "approved",
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    configuration: { pricingValidThrough: "2026-08-15", allowedOptionKeys: [] }
  });
  assert.equal(
    zeroReadiness.blockers.some((b) => b.code === "finished_edge_geometry_required"),
    false
  );
  assert.ok(zeroReadiness.warnings.some((w) => w.code === "finished_edge_zero_lf"));
  console.log("ok: approved estimate skips duplicate geometry gate; 0 LF warns");
}

// 7–12. Override contract
{
  const confirmed = confirmAll(draftTakeoff());
  const baseScope = seedScopeFromTakeoffPayload(approvedImport(confirmed), null);
  const takeoffLf = resolveScopeEdgeLinearFeet(baseScope).finalLf;
  assert.ok(takeoffLf > 0);

  assert.equal(normalizeFinishedEdgeOverride({}).active, false);
  assert.equal(
    resolveScopeEdgeLinearFeet({ ...baseScope, finishedEdgeOverride: null }).finalLf,
    takeoffLf
  );

  const withOverride = {
    ...baseScope,
    finishedEdgeOverride: { finalLf: 12.5, reason: "field measure" }
  };
  const over = resolveScopeEdgeLinearFeet(withOverride);
  assert.equal(over.overrideActive, true);
  assert.equal(over.finalLf, 12.5);
  assert.equal(over.source, EDGE_SCOPE_SOURCES.OVERRIDE);
  assert.equal(over.confirmationRequired, false);

  assert.ok(
    collectScopeAdjustmentIssues({
      finishedEdgeOverride: { finalLf: 10, reason: "" }
    }).some((i) => i.code === "finished_edge_override_reason_required")
  );
  assert.ok(
    collectScopeAdjustmentIssues({
      finishedEdgeOverride: { finalLf: -1, reason: "bad" }
    }).some((i) => i.code === "finished_edge_override_negative")
  );

  baseScope.customerName = "Acme";
  baseScope.projectName = "Kitchen";
  baseScope.edgeProfileToken = "edge_knife";
  baseScope.pricingBasis = "wholesale";
  baseScope.finishedEdgeOverride = { finalLf: 20, reason: "waterfall sides" };
  const calc = await calculateStudioEstimate({
    scope: baseScope,
    actorUserId: "u1",
    env: {}
  });
  assert.equal(calc.fabrication.edge.finalLf, 20);
  console.log("ok: blank override uses Takeoff; absolute override replaces; validation works");
}

// 13–15. Publication freezes final LF; DE effects; no public LF/rate
{
  const confirmed = confirmAll(draftTakeoff());
  const scope = seedScopeFromTakeoffPayload(approvedImport(confirmed), null);
  scope.customerName = "Acme";
  scope.projectName = "Kitchen";
  scope.edgeProfileToken = "edge_crescent";
  scope.pricingBasis = "direct";
  scope.finishedEdgeOverride = { finalLf: 18, reason: "site verify" };
  const calc = await calculateStudioEstimate({ scope, actorUserId: "u1", env: {} });
  assert.equal(calc.fabrication.edge.finalLf, 18);
  const effects = buildCustomerSafeEdgeOptionEffects({
    finalPricedEdgeLf: calc.fabrication.edge.finalLf,
    pricingBasis: "direct",
    originalProfileToken: "edge_eased",
    roomKey: "kitchen",
    roomName: "Kitchen"
  });
  const crescent = effects.find((e) => e.profileKey === "edge_crescent");
  assert.ok(crescent.priceEffectCents > 0);
  assert.match(crescent.priceEffectLabel, /^\+\$/);
  assertPublicConfigurationHasNoForbiddenContent({
    edgeOptions: effects.map((e) => ({
      profile: e.profile,
      priceEffectLabel: e.priceEffectLabel,
      priceEffectCents: e.priceEffectCents
    }))
  });
  console.log("ok: publication / DE effects use final approved LF; no public geometry/rates");
}

// 16–18. Advisory + UI never ready+blocked simultaneously; legacy approved LF
{
  assert.ok(panel.includes("eq-finished-edge-override"));
  assert.ok(panel.includes("Approved finished edge from Takeoff"));
  assert.ok(dePanel.includes("finished_edge_geometry_required"));
  assert.ok(dePanel.includes('approvalStatus === "approved_current"'));

  const legacyScope = {
    customerName: "Legacy",
    projectName: "Bath",
    physicalScopeSource: "takeoff",
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    edgeProfileToken: "edge_eased",
    takeoffScopeSummary: {
      edgeGeometryConfirmationRequired: true,
      edgeScopeSource: "finished_edge_geometry_required",
      derivedOpenEdgeLf: 10.5,
      approvedFinishedEdgeLf: 0,
      edgeEligibleLinearFeet: 0
    },
    rooms: [
      {
        id: "r1",
        name: "Bath",
        included: true,
        countertopSqft: 20,
        pieces: [{ id: "p1", name: "Vanity", included: true, sqft: 20, lengthIn: 60, depthIn: 22 }]
      }
    ],
    addOns: {},
    customLineItems: []
  };
  // Legacy approved calc with valid final LF may publish despite draft flag.
  const legacyCalc = await calculateStudioEstimate({
    scope: {
      ...legacyScope,
      finishedEdgeOverride: { finalLf: 10.5, reason: "legacy approved LF preserved" }
    },
    actorUserId: "u1",
    env: {}
  });
  const legacyEst = approvedEstimate(
    {
      ...legacyScope,
      finishedEdgeOverride: { finalLf: 10.5, reason: "legacy approved LF preserved" }
    },
    legacyCalc
  );
  const legacyReady = assessStudioEstimatePublicationReadiness({
    estimate: legacyEst,
    repositoryMode: "injected",
    takeoffReviewStatus: "approved",
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    configuration: { pricingValidThrough: "2026-08-15", allowedOptionKeys: [] }
  });
  assert.equal(
    legacyReady.blockers.some((b) => b.code === "finished_edge_geometry_required"),
    false
  );
  console.log("ok: advisory warnings do not block; legacy approved LF may publish");
}

console.log("\nAll studioFinishedEdgeOverridePublish tests passed.\n");
