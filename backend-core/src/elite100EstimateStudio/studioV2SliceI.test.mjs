/**
 * Elite 100 Studio V2 Slice I — piece-level scope detail controls.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceI.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";
import {
  buildStudioV2EditableScope,
  normalizeStudioV2EdgeProfileToken,
  normalizeStudioV2ScopePatch,
  STUDIO_V2_EDGE_PROFILE_OPTIONS
} from "./studioV2ScopeEditor.mjs";
import { mapStudioEstimateToElite100Input } from "./elite100RoomPricingStudioAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

console.log("\nstudioV2SliceI.test.mjs\n");

function baseScope(overrides = {}) {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
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
            name: "Main Wall",
            pieceType: "counter",
            included: true,
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            sqft: 17
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1 },
    ...overrides
  };
}

const fakeCalc = {
  fingerprint: "v2i-fp",
  calculatedAt: "2026-07-30T20:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010 },
  warnings: [],
  unresolvedItems: []
};

{
  assert.ok(STUDIO_V2_EDGE_PROFILE_OPTIONS.some((p) => p.value === "edge_eased"));
  assert.ok(STUDIO_V2_EDGE_PROFILE_OPTIONS.some((p) => p.value === "edge_small_ogee"));
  assert.equal(normalizeStudioV2EdgeProfileToken("Small Ogee").value, "edge_small_ogee");
  assert.equal(normalizeStudioV2EdgeProfileToken("edge_knife").value, "edge_knife");
  assert.equal(normalizeStudioV2EdgeProfileToken("bogus-profile").ok, false);
  assert.equal(normalizeStudioV2EdgeProfileToken("").value, null);
  console.log("ok: edge profile tokens validated");
}

{
  // Existing estimates without piece-level detail / exposedSides still load
  const editable = buildStudioV2EditableScope({ scope: baseScope() });
  assert.equal(editable.openings.kitchenSink, 1);
  assert.equal(editable.openingsSource, "estimate");
  assert.equal(editable.rooms[0].pieces[0].kitchenSinkCutouts, null);
  assert.equal(editable.rooms[0].pieces[0].edgeProfileToken, null);
  assert.equal(editable.rooms[0].pieces[0].exposedSides, null);
  console.log("ok: legacy estimates load without piece detail");
}

{
  // Exposed sides save + sync finishedEdgeLf from dimensions (geometry only)
  const ok = normalizeStudioV2ScopePatch({
    existingScope: baseScope(),
    incomingScope: {
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          pieces: [
            {
              id: "run-1",
              name: "Main Wall",
              lengthIn: 120,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              pieceTopology: "wall_run",
              exposedSides: { front: true, back: false, left: true, right: false },
              kitchenSinkCutouts: 1,
              cooktopCutouts: 0,
              outletCutouts: 0
            }
          ]
        }
      ]
    }
  });
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  const piece = ok.scope.rooms[0].pieces[0];
  assert.equal(piece.exposedSides.front, true);
  assert.equal(piece.exposedSides.left, true);
  assert.equal(piece.pieceTopology, "wall_run");
  // Front = 120in, Left = 25.5in → 145.5in → 12.125 LF
  assert.equal(piece.finishedEdgeLf, 12.13);
  assert.equal(piece.finishedEdge.frontEdgeLengthIn, 120);
  assert.equal(piece.finishedEdge.leftExposedEdgeLengthIn, 25.5);
  assert.equal(ok.scope.addOns["qty-sink"], 1);
  console.log("ok: exposed sides sync finishedEdgeLf from dimensions");
}

{
  // Piece-level cutouts persist + aggregate into addOns; invalid profile rejected
  const bad = normalizeStudioV2ScopePatch({
    existingScope: baseScope(),
    incomingScope: {
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          pieces: [
            {
              id: "run-1",
              name: "Main Wall",
              lengthIn: 96,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              edgeProfileToken: "not-a-real-profile"
            }
          ]
        }
      ]
    }
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.field.includes("edgeProfileToken")));

  const ok = normalizeStudioV2ScopePatch({
    existingScope: baseScope(),
    incomingScope: {
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          pieces: [
            {
              id: "run-1",
              name: "Main Wall",
              lengthIn: 120,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              kitchenSinkCutouts: 1,
              cooktopCutouts: 1,
              outletCutouts: 2,
              finishedEdgeLf: 12,
              edgeProfileToken: "edge_small_ogee",
              backsplashEligibleLengthIn: 96,
              sideSplashLeft: false,
              sideSplashRight: false
            },
            {
              id: "island",
              name: "Island Top",
              lengthIn: 72,
              depthIn: 36,
              quantity: 1,
              included: true,
              kitchenSinkCutouts: 0,
              cooktopCutouts: 0,
              outletCutouts: 0,
              finishedEdgeLf: 8,
              edgeProfileToken: "edge_eased"
            }
          ]
        },
        {
          id: "bath",
          name: "Powder",
          roomType: "Vanity",
          pieces: [
            {
              id: "vanity-1",
              name: "Vanity Top",
              lengthIn: 36,
              depthIn: 22,
              quantity: 1,
              included: true,
              vanityBarSinkCutouts: 1,
              sideSplashLeft: true,
              sideSplashRight: true,
              finishedEdgeLf: 4,
              edgeProfileToken: "edge_eased"
            }
          ]
        }
      ],
      openings: { kitchenSink: 99, vanityBarSink: 99, cooktop: 99, outlet: 99 }
    }
  });
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  assert.equal(ok.scope.addOns["qty-sink"], 1, "piece cutouts override project openings");
  assert.equal(ok.scope.addOns["qty-bar"], 1);
  assert.equal(ok.scope.addOns["qty-cook"], 1);
  assert.equal(ok.scope.addOns["qty-outlet"], 2);
  assert.equal(ok.scope.rooms[0].pieces[0].kitchenSinkCutouts, 1);
  assert.equal(ok.scope.rooms[0].pieces[0].edgeProfileToken, "edge_small_ogee");
  assert.equal(ok.scope.edgeProfileToken, "edge_small_ogee");
  assert.equal(ok.scope.rooms[1].pieces[0].vanityBarSinkCutouts, 1);
  assert.equal(ok.scope.rooms[1].pieces[0].sideSplashLeft, true);
  assert.equal(ok.scope.edgeEligibleLinearFeet, 24);
  assert.equal(ok.scope.takeoffScopeSummary.approvedFinishedEdgeLf, 24);
  assert.equal(ok.scope.rooms[0].backsplashMeasuredLengthIn, 96);
  console.log("ok: piece cutouts/edge/profile persist and aggregate");
}

{
  // Adapter maps piece openings to the owning room (not only default kitchen)
  const scope = normalizeStudioV2ScopePatch({
    existingScope: baseScope(),
    incomingScope: {
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          pieces: [
            {
              id: "run-1",
              name: "Main Wall",
              lengthIn: 96,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              kitchenSinkCutouts: 1,
              cooktopCutouts: 1
            }
          ]
        },
        {
          id: "bath",
          name: "Bath",
          roomType: "Vanity",
          pieces: [
            {
              id: "vanity-1",
              name: "Vanity Top",
              lengthIn: 36,
              depthIn: 22,
              quantity: 1,
              included: true,
              vanityBarSinkCutouts: 2,
              outletCutouts: 1
            }
          ]
        }
      ]
    }
  }).scope;
  const mapped = mapStudioEstimateToElite100Input(scope);
  assert.equal(mapped.configuration.rooms.kitchen.sinks[0].quantity, 1);
  assert.equal(mapped.configuration.rooms.kitchen.cutouts.cooktopQuantity, 1);
  assert.equal(mapped.configuration.rooms.bath.sinks[0].sinkKind, "vanity");
  assert.equal(mapped.configuration.rooms.bath.sinks[0].quantity, 2);
  assert.equal(mapped.configuration.rooms.bath.cutouts.electricalOutletQuantity, 1);
  console.log("ok: piece openings mapped per room into calculator input");
}

{
  // PATCH service: piece detail save + approved reject + stale/ready_to_price
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async ({ scope }) => ({
      ...fakeCalc,
      fingerprint: "v2i-fp-2",
      totals: {
        exactTotal: 1000 + (Number(scope.addOns?.["qty-sink"]) || 0) * 100,
        customerDisplayTotal: 1000 + (Number(scope.addOns?.["qty-sink"]) || 0) * 100,
        accountAdjustment: 0
      },
      fabrication: { addOns: { ...(scope.addOns || {}) } }
    }),
    studioEstimateService: {
      async ensureEditableEstimateDraft() {
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async updateScope() {
        throw new Error("must not call updateScope");
      }
    }
  });

  const patched = await v2.patchWorkingDraftScope({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      scope: {
        rooms: [
          {
            id: "kitchen",
            name: "Kitchen",
            roomType: "Kitchen",
            pieces: [
              {
                id: "run-1",
                name: "Main Wall",
                lengthIn: 96,
                depthIn: 25.5,
                quantity: 1,
                included: true,
                kitchenSinkCutouts: 2,
                cooktopCutouts: 1,
                outletCutouts: 1,
                finishedEdgeLf: 10,
                edgeProfileToken: "edge_crescent"
              }
            ]
          }
        ]
      }
    }
  });
  assert.equal(patched.ok, true);
  assert.equal(patched.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.equal(patched.editableScope.rooms[0].pieces[0].kitchenSinkCutouts, 2);
  assert.equal(patched.editableScope.rooms[0].pieces[0].edgeProfileToken, "edge_crescent");
  assert.equal(patched.editableScope.openings.kitchenSink, 2);
  assert.equal(patched.editableScope.openingsSource, "piece");
  assert.equal(patched.sideEffects.ensureEditableDraft, false);
  assert.equal(patched.sideEffects.refreshFromTakeoff, false);

  const calc = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.equal(calc.calculation.total, 1200);

  // Approved rejects piece detail edits
  const approvedRepo = new InMemoryStudioEstimateRepository();
  await approvedRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: baseScope(),
    approval: { approvedAt: "2026-07-30T12:00:00.000Z" },
    calculationSnapshot: fakeCalc
  });
  const v2Approved = createStudioV2Service({
    repository: approvedRepo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2Approved.patchWorkingDraftScope({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          scope: {
            rooms: [
              {
                id: "kitchen",
                name: "Kitchen",
                roomType: "Kitchen",
                pieces: [
                  {
                    id: "run-1",
                    name: "Main Wall",
                    lengthIn: 96,
                    depthIn: 25.5,
                    quantity: 1,
                    included: true,
                    kitchenSinkCutouts: 3
                  }
                ]
              }
            ]
          }
        }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  console.log("ok: piece detail save/stale + approved readonly");
}

{
  const {
    geometrySfFromDimensions,
    countertopSfMode,
    displayCountertopSf,
    cutoutsSummary,
    exposedSummaryText,
    edgeProfileLabel,
    backsplashNeedsRunLength
  } = await import(
    "../../../app-elite100-estimate-studio/src/estimateQueue/studioV2ScopeReviewHelpers.ts"
  );

  assert.equal(geometrySfFromDimensions({ lengthIn: 96, depthIn: 25.5, quantity: 1 }), 17);
  assert.equal(countertopSfMode({ included: true }), "dimensions");
  assert.equal(countertopSfMode({ included: true, approvedDirectSqft: 12 }), "direct");
  assert.equal(countertopSfMode({ included: false }), "excluded");
  assert.equal(
    displayCountertopSf({
      included: true,
      lengthIn: 96,
      depthIn: 25.5,
      quantity: 1
    }).countedSf,
    17
  );
  assert.equal(
    displayCountertopSf({
      included: true,
      lengthIn: 96,
      depthIn: 25.5,
      quantity: 1,
      approvedDirectSqft: 10
    }).mode,
    "direct"
  );
  assert.equal(
    displayCountertopSf({ included: false, lengthIn: 96, depthIn: 25.5, quantity: 1 }).countedSf,
    null
  );
  assert.equal(cutoutsSummary({}), "None");
  assert.equal(cutoutsSummary({ kitchenSinkCutouts: 1 }), "Sink ×1");
  assert.equal(
    cutoutsSummary({ kitchenSinkCutouts: 1, cooktopCutouts: 1, outletCutouts: 4 }),
    "Sink ×1 · Cooktop ×1 · Outlet ×4"
  );
  assert.ok(cutoutsSummary({ popupOutletCutouts: 1 }).includes("not priced"));
  assert.equal(
    exposedSummaryText({
      exposedSidesSummary: "Front 8.00 LF",
      finishedEdgeLf: 8
    }),
    "Front 8.00 LF"
  );
  assert.equal(edgeProfileLabel(null, [{ value: "edge_eased", label: "Eased" }]).label, "Estimate default");
  assert.equal(edgeProfileLabel("edge_knife", [{ value: "edge_knife", label: "Knife" }]).upgraded, true);
  assert.equal(
    backsplashNeedsRunLength({ includeBacksplash: true, backsplashEligibleLengthIn: null }),
    true
  );
  assert.equal(
    backsplashNeedsRunLength({ includeBacksplash: true, backsplashEligibleLengthIn: 96 }),
    false
  );
  console.log("ok: scope review helper display contracts");
}

{
  const editor = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ScopeEditor.tsx"),
    "utf8"
  );
  const helpers = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/studioV2ScopeReviewHelpers.ts"),
    "utf8"
  );
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  const styles = readFileSync(
    join(root, "app-elite100-estimate-studio/src/styles.css"),
    "utf8"
  );
  const svc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  const adapter = readFileSync(join(__dirname, "elite100RoomPricingStudioAdapter.mjs"), "utf8");

  assert.ok(editor.includes('data-testid="studio-v2-piece-table"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-row"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-length"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-depth"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-quantity"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-geometry-sf"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-sf-mode"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-sf-mode-select"'));
  assert.ok(editor.includes('data-testid="studio-v2-set-exposed-sides"'));
  assert.ok(editor.includes('data-testid="studio-v2-exposed-summary"'));
  assert.ok(editor.includes('data-testid="studio-v2-exposed-sides-modal"'));
  assert.ok(editor.includes("Front — ${lengthLabel}\""));
  assert.ok(editor.includes("Back — ${lengthLabel}\""));
  assert.ok(editor.includes("Left — ${depthLabel}\""));
  assert.ok(editor.includes("Right — ${depthLabel}\""));
  assert.ok(editor.includes('data-testid="studio-v2-side-diagram"'));
  assert.ok(editor.includes('data-testid="studio-v2-cutouts"'));
  assert.ok(editor.includes('data-testid="studio-v2-cutouts-summary"'));
  assert.ok(editor.includes('data-testid="studio-v2-cutouts-menu"'));
  assert.ok(editor.includes('data-testid="studio-v2-piece-edge-profile"'));
  assert.ok(editor.includes('data-testid="studio-v2-backsplash-run-warning"'));
  assert.ok(editor.includes("Use piece length"));
  assert.ok(editor.includes("Backsplash selected, but no run length is available."));
  assert.ok(editor.includes("Excluded from quote"));
  assert.ok(editor.includes('data-excluded={excluded ? "true" : "false"}'));
  assert.ok(editor.includes("Approved estimate is read-only."));
  assert.ok(editor.includes('data-testid="studio-v2-plan-preview"'));
  assert.ok(editor.includes('data-testid="studio-v2-workbench-panel"'));
  assert.ok(editor.includes('data-testid="studio-v2-scope-checklist"'));
  assert.ok(editor.includes('data-testid="studio-v2-selected-piece"'));
  assert.ok(
    editor.includes("Plan preview will be added when V2 intake/attachment links are wired.")
  );
  assert.ok(editor.includes('data-testid="studio-v2-scope-readonly"'));
  assert.ok(editor.includes("Legacy openings"));
  assert.ok(
    editor.includes("Legacy openings are kept for older estimates. Prefer piece-level cutouts.")
  );
  assert.ok(editor.includes('className="studio-v2-legacy-openings"'));
  assert.ok(editor.includes("studio-v2-piece-workbench"));
  assert.ok(editor.includes("STUDIO_V2_EDGE_PROFILES"));
  assert.ok(editor.includes("not priced yet"));
  assert.ok(editor.includes("readOnly"));
  assert.ok(helpers.includes("geometrySfFromDimensions"));
  assert.ok(helpers.includes("no countertop SF while included"));
  assert.ok(helpers.includes("scopeReviewChecklist"));
  assert.ok(styles.includes(".studio-v2-piece-row.is-excluded"));
  assert.ok(styles.includes(".studio-v2-workbench-panel"));
  assert.ok(styles.includes(".studio-v2-legacy-openings"));
  assert.ok(styles.includes(".studio-shell--v2"));
  assert.ok(styles.includes("min-width: 1180px"));
  assert.ok(styles.includes("4.5rem"));
  assert.ok(studioApp.includes("studio-shell--v2"));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(editor));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(editor));
  assert.ok(!/from\s+["'].*TakeoffReviewWorkbench["']/.test(editor));
  assert.ok(!/from\s+["'].*ConsolidatedTakeoffReview["']/.test(editor));
  assert.ok(!/from\s+["'].*ExposedSidesDialog["']/.test(editor));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("refresh-from-takeoff"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("open-measurement-revision"));
  assert.ok(!svc.includes("ensureEditableEstimateDraft("));
  assert.ok(adapter.includes("hasPieceOpenings"));
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("studioV2Preview"));
  // Dimensions must be in the main row (not only behind a collapsed details summary).
  const lengthIdx = editor.indexOf('data-testid="studio-v2-piece-length"');
  const detailsIdx = editor.indexOf('data-testid="studio-v2-piece-notes"');
  assert.ok(lengthIdx > 0 && detailsIdx > 0 && lengthIdx < detailsIdx);
  // Legacy openings must not be the primary/default expanded block above piece review.
  const openingsIdx = editor.indexOf('data-testid="studio-v2-openings"');
  const pieceTableIdx = editor.indexOf('data-testid="studio-v2-piece-table"');
  assert.ok(pieceTableIdx > 0 && openingsIdx > pieceTableIdx);
  // Legacy openings <details> must not force open by default.
  assert.ok(!/data-testid="studio-v2-openings"[^>]*\sopen(=|\s|>)/.test(editor));
  console.log("ok: frontend/source contracts for Slice I / scope review layout refinement");
}

console.log("\nAll Studio V2 Slice I tests passed.\n");
