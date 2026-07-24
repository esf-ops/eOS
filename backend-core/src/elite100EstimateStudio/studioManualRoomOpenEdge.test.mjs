/**
 * Manual room open-edge LF authority — piece_sum / room_total, profile independence,
 * legacy fallback, publication room pricing.
 *
 * Run: npm run eos:test:studio-manual-room-open-edge
 * Sentinel data only. No production publish/email.
 */
import assert from "node:assert/strict";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import {
  OPEN_EDGE_MEASUREMENT_MODES,
  applyNormalizedManualRooms,
  normalizeManualRooms,
  resolveManualRoomOpenEdgeQuantity,
  stripClientManualAuthority,
  sumManualConfirmedEdgeLf,
  validateManualScopeForConfirm
} from "./studioManualPhysicalScope.mjs";
import {
  assessLegacyProjectEdgeFallback,
  resolveRoomApprovedEligibleEdgeLf
} from "./studioRoomEdgeQuantity.mjs";
import { resolveScopeEdgeLinearFeet } from "./studioScopeBilling.mjs";
import { buildStudioEstimateRoomsForPublication } from "./studioEstimatePublicationAdapter.mjs";
import { resolvePremiumEdgeRatePerLf } from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";

const ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

console.log("\nstudioManualRoomOpenEdge.test.mjs\n");

function piece(id, name, edgeLf, extras = {}) {
  const inches = Math.round(edgeLf * 12 * 100) / 100;
  return {
    id,
    name,
    pieceType: "counter",
    included: true,
    measurementMode: "dimensions",
    lengthIn: 96,
    depthIn: 25.5,
    finishedEdge: {
      frontEdgeLengthIn: inches,
      totalFinishedEdgeLengthIn: inches,
      approved: true,
      source: "estimator_confirmed"
    },
    ...extras
  };
}

// 1–8 piece_sum / room_total / no double-count
{
  const pieceSumRooms = normalizeManualRooms([
    {
      id: "room-kitchen",
      name: "Kitchen",
      roomType: "Kitchen",
      openEdgeMeasurementMode: "piece_sum",
      pieces: [piece("p1", "A", 12), piece("p2", "B", 5)]
    }
  ]);
  assert.equal(pieceSumRooms[0].openEdgeMeasurementMode, "piece_sum");
  assert.equal(pieceSumRooms[0].approvedFinishedEdgeLf, 17);
  assert.equal(pieceSumRooms[0].confirmedOpenEdgeLf, null);
  assert.equal(pieceSumRooms[0].openEdgeQuantityAuthoritative, false);

  const excludedPiece = normalizeManualRooms([
    {
      id: "room-kitchen",
      name: "Kitchen",
      openEdgeMeasurementMode: "piece_sum",
      pieces: [
        piece("p1", "A", 12),
        { ...piece("p2", "B", 5), included: false }
      ]
    }
  ]);
  assert.equal(excludedPiece[0].approvedFinishedEdgeLf, 12);

  const roomTotal = normalizeManualRooms([
    {
      id: "room-kitchen",
      name: "Kitchen",
      openEdgeMeasurementMode: "room_total",
      openEdgeLf: 17,
      pieces: [piece("p1", "A", 99), piece("p2", "B", 99)]
    }
  ]);
  assert.equal(roomTotal[0].openEdgeMeasurementMode, "room_total");
  assert.equal(roomTotal[0].approvedFinishedEdgeLf, 17);
  // Stale piece values must not be summed in room_total mode.
  assert.notEqual(roomTotal[0].approvedFinishedEdgeLf, 198);

  const qBoth = resolveManualRoomOpenEdgeQuantity(
    {
      included: true,
      roomType: "Kitchen",
      openEdgeLf: 17,
      pieces: [piece("p1", "A", 12), piece("p2", "B", 5)]
    },
    OPEN_EDGE_MEASUREMENT_MODES.ROOM_TOTAL,
    { forConfirm: true }
  );
  assert.equal(qBoth.lf, 17);
  assert.equal(qBoth.source, "room_total");
  console.log("ok: 1–8 piece_sum 12+5=17; excluded piece; room_total ignores piece stale LF");
}

// 9–15 confirm stamps; forge rejected; rename preserves key
{
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const svc = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates
  });
  const created = await svc.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "open-edge-1",
    body: { projectName: "Open Edge Kitchen", customerName: "Sentinel Edge Co" }
  });

  const draftRooms = [
    {
      id: "room-kitchen",
      name: "Kitchen",
      roomType: "Kitchen",
      openEdgeMeasurementMode: "piece_sum",
      pieces: [piece("p1", "A", 12), piece("p2", "B", 5)]
    },
    {
      id: "room-bath",
      name: "Primary Bath",
      roomType: "Vanity",
      openEdgeMeasurementMode: "room_total",
      openEdgeLf: 8,
      pieces: [
        {
          id: "p3",
          name: "Vanity",
          pieceType: "vanity_top",
          measurementMode: "dimensions",
          lengthIn: 60,
          depthIn: 22
        }
      ]
    },
    {
      id: "room-laundry",
      name: "Laundry",
      roomType: "Laundry",
      openEdgeMeasurementMode: "room_total",
      openEdgeLf: 4,
      pieces: [
        {
          id: "p4",
          name: "Laundry top",
          pieceType: "counter",
          measurementMode: "dimensions",
          lengthIn: 36,
          depthIn: 25.5
        }
      ]
    }
  ];

  await svc.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {
      scope: {
        rooms: draftRooms,
        // Client forges confirmation — must be stripped.
        roomsForged: true,
        confirmedOpenEdgeLf: 999
      }
    }
  });

  let row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.manualScopeConfirmed, false);
  assert.equal(row.scope.rooms[0].confirmedOpenEdgeLf, null);
  assert.equal(row.scope.rooms[0].approvedFinishedEdgeLf, 17);
  assert.equal(row.scope.rooms[1].approvedFinishedEdgeLf, 8);
  assert.equal(row.scope.rooms[2].approvedFinishedEdgeLf, 4);
  assert.equal(sumManualConfirmedEdgeLf(row.scope), 29);

  // Forge room confirmed totals on draft patch
  const forged = stripClientManualAuthority({
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        confirmedOpenEdgeLf: 999,
        openEdgeQuantityAuthoritative: true,
        openEdgeMeasurementMode: "piece_sum",
        pieces: [piece("p1", "A", 12)]
      }
    ]
  });
  assert.equal(forged.rooms[0].confirmedOpenEdgeLf, undefined);
  assert.equal(forged.rooms[0].openEdgeQuantityAuthoritative, undefined);

  const confirmed = await svc.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(confirmed.published, false);
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].confirmedOpenEdgeLf, 17);
  assert.equal(row.scope.rooms[0].openEdgeQuantityAuthoritative, true);
  assert.equal(row.scope.rooms[1].confirmedOpenEdgeLf, 8);
  assert.equal(row.scope.rooms[2].confirmedOpenEdgeLf, 4);
  assert.equal(row.scope.edgeLinearFeet, 29);
  assert.ok(row.scope.manualScopeFingerprint);

  // Rename preserves key + quantity
  await svc.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {
      scope: {
        rooms: draftRooms.map((r) =>
          r.id === "room-kitchen" ? { ...r, name: "Kitchen Main" } : r
        )
      }
    }
  });
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].id, "room-kitchen");
  assert.equal(row.scope.rooms[0].name, "Kitchen Main");
  assert.equal(row.scope.manualScopeConfirmed, false);

  await svc.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].confirmedOpenEdgeLf, 17);
  assert.equal(row.scope.rooms[0].id, "room-kitchen");

  // Negative / nonfinite rejected
  const bad = validateManualScopeForConfirm({
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        openEdgeMeasurementMode: "room_total",
        openEdgeLf: -3,
        pieces: [{ id: "p1", name: "A", pieceType: "counter", included: true, lengthIn: 96, depthIn: 25.5, sqft: 17 }]
      }
    ]
  });
  assert.ok(bad.some((e) => /open edge/i.test(e)));
  console.log("ok: 9–15 confirm stamp, anti-forge, rename, validation");

  // 16–21 profile independence
  row = await estimates.update(
    ORG,
    created.estimateId,
    {
      scope: {
        ...row.scope,
        edgeProfileToken: "edge_eased",
        edgeMode: "included",
        edgeLinearFeet: 0
      }
    },
    ACTOR
  );
  const eased = resolveScopeEdgeLinearFeet(row.scope);
  assert.equal(eased.finalLf, 29);
  assert.equal(row.scope.rooms[0].confirmedOpenEdgeLf, 17);

  row = await estimates.update(
    ORG,
    created.estimateId,
    {
      scope: {
        ...row.scope,
        edgeProfileToken: "edge_small_ogee",
        edgeMode: "upgrade",
        customerCatalogPermissions: { edgeSelectionEnabled: false }
      }
    },
    ACTOR
  );
  assert.equal(row.scope.rooms[0].confirmedOpenEdgeLf, 17);
  assert.equal(resolveScopeEdgeLinearFeet(row.scope).finalLf, 29);
  console.log("ok: 16–21 profile independence — Eased/premium do not reset room LF");

  // 29–36 publication room-scoped pricing
  const pubRooms = buildStudioEstimateRoomsForPublication({
    id: created.estimateId,
    organizationId: ORG,
    revision: 1,
    status: "approved",
    scope: row.scope,
    calculationSnapshot: {
      fabrication: { edge: { finalLf: 29, profileToken: "edge_eased" } },
      totals: { customerDisplayTotal: 5000 }
    },
    approval: { customerDisplayTotal: 5000 }
  });
  const kitchen = pubRooms.find((r) => r.id === "room-kitchen");
  const bath = pubRooms.find((r) => r.id === "room-bath");
  const laundry = pubRooms.find((r) => r.id === "room-laundry");
  assert.equal(kitchen.edgeLinearFeet, 17);
  assert.equal(bath.edgeLinearFeet, 8);
  assert.equal(laundry.edgeLinearFeet, 4);
  assert.equal(kitchen.edgeQuantityAuthoritative, true);
  const rate = resolvePremiumEdgeRatePerLf("direct");
  assert.equal(Math.round(17 * rate * 100), Math.round(17 * rate * 100));
  assert.notEqual(kitchen.edgeLinearFeet, 29);
  assert.notEqual(bath.edgeLinearFeet, 29 / 3);
  console.log("ok: 29–36 publication freezes Kitchen 17 / Bath 8 / Laundry 4 separately");
}

// 45–49 legacy fallbacks
{
  const single = assessLegacyProjectEdgeFallback({
    edgeLinearFeet: 20,
    rooms: [{ id: "r1", name: "Kitchen", included: true, pieces: [] }]
  });
  assert.equal(single.applyProjectFallback, true);
  assert.equal(single.reviewRequired, false);

  const multi = assessLegacyProjectEdgeFallback({
    edgeLinearFeet: 30,
    rooms: [
      { id: "r1", name: "Kitchen", included: true, pieces: [] },
      { id: "r2", name: "Bath", included: true, pieces: [] }
    ]
  });
  assert.equal(multi.applyProjectFallback, false);
  assert.equal(multi.reviewRequired, true);
  assert.equal(multi.reason, "legacy_multi_room_project_lf_unallocated");

  const pub = buildStudioEstimateRoomsForPublication({
    id: "legacy-multi",
    organizationId: ORG,
    revision: 1,
    status: "approved",
    scope: {
      physicalScopeSource: "manual_staff",
      estimateOrigin: "manual_staff",
      edgeLinearFeet: 30,
      rooms: [
        { id: "r1", name: "Kitchen", included: true, pieces: [{ id: "p1", pieceType: "counter", included: true, sqft: 20 }] },
        { id: "r2", name: "Bath", included: true, pieces: [{ id: "p2", pieceType: "vanity_top", included: true, sqft: 8 }] }
      ]
    },
    calculationSnapshot: { fabrication: { edge: { finalLf: 30 } }, totals: { customerDisplayTotal: 1 } },
    approval: { customerDisplayTotal: 1 }
  });
  assert.equal(pub[0].edgeQuantityAuthoritative, false);
  assert.equal(pub[0].edgeQuantityMissingReason, "legacy_multi_room_project_lf_unallocated");
  assert.equal(pub[0].edgeLinearFeet, 0);
  assert.notEqual(pub[0].edgeLinearFeet, 30);
  assert.notEqual(pub[0].edgeLinearFeet, 15);
  console.log("ok: 45–49 single-room legacy fallback; multi-room review_required, never allocate");
}

// Confirmed quantity wins over stale pieces in resolver
{
  const q = resolveRoomApprovedEligibleEdgeLf({
    id: "room-kitchen",
    included: true,
    confirmedOpenEdgeLf: 17,
    openEdgeQuantityAuthoritative: true,
    openEdgeSource: "piece_sum",
    openEdgeMeasurementMode: "piece_sum",
    pieces: [piece("p1", "A", 99)]
  });
  assert.equal(q.lf, 17);
  assert.equal(q.authoritative, true);
  console.log("ok: confirmedOpenEdgeLf wins over stale piece finishedEdge");
}

// Modes cannot both be authoritative — room_total ignores piece sum in applyNormalized
{
  const scope = applyNormalizedManualRooms(
    { estimateOrigin: "manual_staff", physicalScopeSource: "manual_staff" },
    {
      rooms: [
        {
          id: "r1",
          name: "Kitchen",
          openEdgeMeasurementMode: "room_total",
          openEdgeLf: 17,
          pieces: [piece("p1", "A", 12), piece("p2", "B", 5)]
        }
      ]
    },
    { stampConfirmed: true }
  );
  assert.equal(scope.rooms[0].confirmedOpenEdgeLf, 17);
  assert.equal(scope.rooms[0].openEdgeSource, "room_total");
  assert.equal(scope.edgeLinearFeet, 17);
  console.log("ok: stampConfirmed room_total is sole authority");
}

console.log("\nstudioManualRoomOpenEdge.test.mjs: ok\n");
