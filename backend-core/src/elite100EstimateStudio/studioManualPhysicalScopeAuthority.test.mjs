/**
 * Manual physical-scope authority — backsplash, edge LF, cutouts, project address.
 * Run: node backend-core/src/elite100EstimateStudio/studioManualPhysicalScopeAuthority.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import {
  MANUAL_ESTIMATE_ORIGIN,
  applyNormalizedManualRooms,
  isConfirmedManualPhysicalScope,
  normalizeManualRoomBacksplash,
  normalizeManualRooms,
  sumManualConfirmedEdgeLf,
  syncManualProjectEdgeFromRooms
} from "./studioManualPhysicalScope.mjs";
import { resolveScopeEdgeLinearFeet } from "./studioScopeBilling.mjs";
import { applyStudioAccountDirectoryIdentity } from "./studioAccountDirectoryLookup.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

console.log("\nstudioManualPhysicalScopeAuthority.test.mjs\n");

// 1–4 backsplash normalize / 180×4 = 5.00 SF / fingerprint include
{
  const bs = normalizeManualRoomBacksplash({
    includeBacksplash: true,
    backsplashHeightMode: "standard",
    backsplashMeasuredLengthIn: 180,
    backsplashHeightIn: 4
  });
  assert.equal(bs.includeBacksplash, true);
  assert.equal(bs.backsplashSqft, 5);
  assert.equal(bs.backsplashSource, MANUAL_ESTIMATE_ORIGIN);

  const rooms = normalizeManualRooms([
    {
      id: "room-kitchen",
      name: "Kitchen",
      roomType: "Kitchen",
      includeBacksplash: true,
      backsplashHeightMode: "standard",
      backsplashMeasuredLengthIn: 180,
      backsplashHeightIn: 4,
      pieces: [
        {
          id: "p1",
          name: "Run A",
          pieceType: "counter",
          measurementMode: "dimensions",
          lengthIn: 96,
          depthIn: 25.5,
          finishedEdge: { totalFinishedEdgeLengthIn: 204, approved: true }
        }
      ]
    }
  ]);
  assert.equal(rooms[0].backsplashSqft, 5);
  assert.equal(rooms[0].approvedFinishedEdgeLf, 17);
  assert.equal(rooms[0].id, "room-kitchen");

  const renamed = normalizeManualRooms([
    {
      ...rooms[0],
      name: "Kitchen Main",
      id: "room-kitchen"
    }
  ]);
  assert.equal(renamed[0].id, "room-kitchen");
  assert.equal(renamed[0].approvedFinishedEdgeLf, 17);
  assert.equal(renamed[0].backsplashSqft, 5);
  console.log("ok: 1–4,16 backsplash SF + room rename preserves key/geometry");
}

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
    idempotencyKey: "auth-scope-1",
    body: {
      projectName: "Authority Kitchen",
      projectAddress: "100 Jobsite Way",
      customerName: "Jobsite Cabinets"
    }
  });

  const draftRooms = [
    {
      id: "room-kitchen",
      name: "Kitchen",
      roomType: "Kitchen",
      includeBacksplash: true,
      backsplashHeightMode: "standard",
      backsplashMeasuredLengthIn: 180,
      backsplashHeightIn: 4,
      pieces: [
        {
          id: "p1",
          name: "Run A",
          measurementMode: "dimensions",
          lengthIn: 96,
          depthIn: 25.5,
          finishedEdge: {
            totalFinishedEdgeLengthIn: 204,
            frontEdgeLengthIn: 204,
            approved: true
          }
        }
      ]
    },
    {
      id: "room-bath",
      name: "Bath",
      roomType: "Vanity",
      pieces: [
        {
          id: "p2",
          name: "Vanity",
          pieceType: "vanity_top",
          measurementMode: "dimensions",
          lengthIn: 60,
          depthIn: 22,
          finishedEdge: { totalFinishedEdgeLengthIn: 60, approved: true }
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
        addOns: { "qty-sink": 1, "qty-cook": 1, "qty-outlet": 2, "qty-bar": 1 }
      }
    }
  });

  let row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].backsplashSqft, 5);
  assert.equal(row.scope.addOns["qty-sink"], 1);
  assert.equal(row.scope.addOns["qty-cook"], 1);
  assert.equal(row.scope.addOns["qty-outlet"], 2);
  assert.equal(row.scope.manualScopeConfirmed, false);
  assert.equal(sumManualConfirmedEdgeLf(row.scope), 22);
  assert.equal(row.scope.projectAddress, "100 Jobsite Way");

  const confirmed = await svc.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(confirmed.published, false);
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(isConfirmedManualPhysicalScope(row.scope), true);
  assert.equal(row.scope.rooms[0].backsplashSqft, 5);
  assert.equal(row.scope.edgeLinearFeet, 22);
  assert.equal(row.scope.edgeEligibleLinearFeet, 22);

  // Edge profile free tier must not zero confirmed room LF
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
  const resolved = resolveScopeEdgeLinearFeet(row.scope);
  assert.equal(resolved.finalLf, 22);
  assert.equal(resolved.derivedLf, 22);

  // Two rooms preserve separate edge quantities
  assert.equal(row.scope.rooms[0].approvedFinishedEdgeLf, 17);
  assert.equal(row.scope.rooms[1].approvedFinishedEdgeLf, 5);
  console.log("ok: 5–15 save/confirm/cutouts/edge LF authority + room separation");

  // 17–18 edit after confirm clears confirmation; after calc marks stale
  const studio = createStudioEstimateService({
    repository: estimates,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    loadTakeoffWorkspace: async () => null,
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async () => ({
      fingerprint: "fp-auth-1",
      pricingEngine: "sentinel",
      pricingVersion: 1,
      totals: { exactInternalTotal: 1000, customerDisplayTotal: 1200 },
      fabrication: { edge: { finalLf: 22 } },
      scopeFingerprint: "s"
    })
  });

  // Reconfirm then calculate
  await svc.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true, rooms: draftRooms, addOns: row.scope.addOns }
  });
  const priced = await studio.calculate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.status, "priced");

  await svc.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: { rooms: draftRooms, addOns: row.scope.addOns } }
  });
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.manualScopeConfirmed, false);
  assert.ok(
    row.status === STUDIO_ESTIMATE_STATUSES.DRAFT ||
      row.staleReason ||
      row.calculationSnapshot == null ||
      row.status === STUDIO_ESTIMATE_STATUSES.PRICED
  );
  // saveManualScopeDraft sets draft and clears confirmation
  assert.equal(row.status, STUDIO_ESTIMATE_STATUSES.DRAFT);
  console.log("ok: 17–18 edit after confirm requires reconfirm; calc path cleared");

  // 21 AD link does not overwrite nonblank project address
  const adSnap = {
    accountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    accountDisplayName: "AD Co",
    addressLine1: "999 Account Ave",
    city: "Boise",
    state: "ID",
    postalCode: "83702"
  };
  const applied = applyStudioAccountDirectoryIdentity({
    body: {
      accountDirectoryAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      refreshCustomerIdentity: true,
      customerIdentitySnapshot: adSnap
    },
    existingRow: {
      accountDirectoryAccountId: null,
      scope: { projectAddress: "100 Jobsite Way" }
    },
    nextScope: {
      ...row.scope,
      projectAddress: "100 Jobsite Way",
      refreshCustomerIdentity: true
    },
    saveMode: "update_existing"
  });
  assert.equal(applied.scope.projectAddress, "100 Jobsite Way");

  const explicit = applyStudioAccountDirectoryIdentity({
    body: {
      accountDirectoryAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      useAccountLocationAsProjectAddress: true,
      customerIdentitySnapshot: adSnap
    },
    existingRow: { accountDirectoryAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", scope: row.scope },
    nextScope: {
      ...row.scope,
      projectAddress: "100 Jobsite Way",
      useAccountLocationAsProjectAddress: true
    },
    saveMode: "update_existing"
  });
  assert.match(String(explicit.scope.projectAddress), /999 Account Ave/);
  console.log("ok: 21–22 project address preserved unless explicit use-as-project-address");
}

// UI contracts
{
  const editor = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/ManualPhysicalScopeEditor.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
    "utf8"
  );
  const ad = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioAccountDirectoryPanel.tsx"),
    "utf8"
  );
  assert.match(editor, /manual-scope-backsplash/);
  assert.match(editor, /Kitchen sink openings/);
  assert.doesNotMatch(editor, />qty-sink</);
  assert.match(panel, /eq-confirmed-physical-scope/);
  assert.match(panel, /eq-edit-manual-scope/);
  assert.match(panel, /eq-confirmed-finished-edge/);
  assert.match(panel, /eq-confirmed-cutouts-readonly/);
  assert.match(ad, /eq-ad-use-location-as-project-address/);
  assert.match(ad, /Never silently overwrite/);
  console.log("ok: UI contracts for Manual Scope authority + AD address");
}

// sync helper
{
  const scope = syncManualProjectEdgeFromRooms(
    applyNormalizedManualRooms(
      { edgeLinearFeet: 0, edgeEligibleLinearFeet: 0 },
      {
        rooms: [
          {
            id: "r1",
            name: "Kitchen",
            pieces: [
              {
                id: "p1",
                name: "A",
                measurementMode: "dimensions",
                lengthIn: 12,
                depthIn: 12,
                finishedEdge: { totalFinishedEdgeLengthIn: 204, approved: true }
              }
            ]
          }
        ]
      }
    )
  );
  assert.equal(scope.edgeLinearFeet, 17);
  assert.equal(scope.edgeEligibleLinearFeet, 17);
  console.log("ok: syncManualProjectEdgeFromRooms");
}

console.log("\nstudioManualPhysicalScopeAuthority.test.mjs: ok\n");
