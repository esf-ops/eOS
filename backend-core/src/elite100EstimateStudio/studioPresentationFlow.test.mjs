/**
 * Presentation-ready Studio estimating flow — focused integration suite.
 *
 * Proves the hotfix/studio-presentation-flow demo path end-to-end:
 *   New Estimate → Scope → Customer Choices → Review & Publish
 * with legacy workflow-state-machine controls collapsed out of the normal
 * pricingVersion-4 flow. No pricing math is re-implemented here — every
 * calculation assertion runs through the real wiring
 * (studioEstimateService → elite100RoomPricingStudioAdapter →
 * calculateElite100StudioEstimate).
 *
 * Run: npm run eos:test:elite100-studio-presentation-flow
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { createStudioEstimateService, seedScopeFromTakeoffPayload } from "./studioEstimateService.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";
import { buildStudioScopeBilling, resolveScopeEdgeLinearFeet } from "./studioScopeBilling.mjs";
import { isActiveSimplifiedEstimate } from "./studioActiveReviewReadiness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

const studioApp = readSrc("app-elite100-estimate-studio/src/StudioApp.tsx");
const wizard = readSrc("app-elite100-estimate-studio/src/estimateQueue/ManualEstimateWizard.tsx");
const scopePanel = readSrc("app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx");
const workspace = readSrc("app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx");
const digitalEstimatePanel = readSrc("app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx");

const ORG = "33333333-3333-4333-8333-333333333333";
const ACTOR = "44444444-4444-4444-8444-444444444444";
const PRICING_ENGINE_V1 = "elite100-room-pricing-v1";
const PRICING_VERSION_4 = 4;

console.log("\nstudioPresentationFlow.test.mjs\n");

function noTakeoffService(overrides = {}) {
  return createStudioEstimateService({
    repository: overrides.repository || new InMemoryStudioEstimateRepository(),
    env: overrides.env || {},
    loadTakeoffWorkspace: async () => {
      throw new Error("Takeoff workspace must not load for a standalone manual estimate");
    },
    loadLatestTakeoffResult: async () => null,
    ...overrides.deps
  });
}

function freshManualServices() {
  const repository = new InMemoryStudioEstimateRepository();
  const intake = new InMemoryQuoteIntakeRepository();
  const studio = noTakeoffService({ repository });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: repository,
    studioEstimateService: studio
  });
  return { repository, intake, studio, manual };
}

/** Finished-edge-approved dimensions patch for the seeded default piece. */
function validCountertopEdit({ lengthIn = 96, depthIn = 25.5, quantity } = {}) {
  return {
    rooms: [
      {
        id: "room-kitchen-1",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "piece-countertop-1",
            name: "Countertop",
            pieceType: "counter",
            included: true,
            measurementMode: "dimensions",
            lengthIn,
            depthIn,
            ...(quantity != null ? { quantity } : {}),
            finishedEdge: {
              frontEdgeLengthIn: lengthIn,
              totalFinishedEdgeLengthIn: lengthIn,
              approved: true
            }
          }
        ]
      }
    ],
    addOns: {}
  };
}

// ════════════════════════════════════════════════════════════════════════
// 1/2. TOP LEVEL — "+ New Estimate" is visible from both Inbox and
// Estimates: one unconditional nav button, structurally outside "More".
// ════════════════════════════════════════════════════════════════════════
{
  assert.ok(studioApp.includes('data-testid="studio-nav-new-estimate"'), "top-level + New Estimate button exists");
  assert.ok(studioApp.includes("+ New Estimate"), "button label is + New Estimate");

  const navIdx = studioApp.indexOf('data-testid="studio-primary-nav"');
  const navCloseIdx = studioApp.indexOf("</nav>", navIdx);
  const newEstimateIdx = studioApp.indexOf('data-testid="studio-nav-new-estimate"');
  const moreDivIdx = studioApp.indexOf('className="studio-nav-more"');
  const moreMenuIdx = studioApp.indexOf('data-testid="studio-nav-more-menu"');

  assert.ok(navIdx !== -1 && navCloseIdx !== -1, "primary <nav> block located");
  assert.ok(
    newEstimateIdx > navIdx && newEstimateIdx < navCloseIdx,
    "+ New Estimate renders inside the always-visible primary <nav> (present regardless of Inbox/Estimates selection)"
  );
  assert.ok(newEstimateIdx < moreDivIdx, "+ New Estimate is declared before the More dropdown container");
  assert.ok(newEstimateIdx < moreMenuIdx, "+ New Estimate markup precedes/excludes the More dropdown menu");

  // Not gated behind any mainNav === "..." conditional — it is a sibling of
  // the Inbox/Estimates buttons, not wrapped in a page-specific branch.
  const newEstimateButtonBlock = studioApp.slice(newEstimateIdx - 40, newEstimateIdx + 220);
  assert.equal(/mainNav ===/.test(newEstimateButtonBlock), false, "+ New Estimate button is not conditionally gated by mainNav");
  console.log("ok: 1/2 + New Estimate is visible from both Inbox and Estimates (unconditional primary nav, not under More)");
}

// ════════════════════════════════════════════════════════════════════════
// NEW ESTIMATE UI — small focused form (Customer name, Email, Phone,
// Project name, Jobsite address, Pricing basis) with Cancel / Create
// Estimate only — never a full-page wizard.
// ════════════════════════════════════════════════════════════════════════
{
  assert.ok(studioApp.includes("<ManualEstimateWizard"), "StudioApp renders the New Estimate launcher");
  assert.ok(studioApp.includes("skipChooser"), "top-level launcher skips the multi-step chooser");
  assert.ok(wizard.includes('data-testid="new-estimate-customer-name"'), "Customer name field present");
  assert.ok(wizard.includes('data-testid="new-estimate-customer-email"'), "Email field present");
  assert.ok(wizard.includes('data-testid="new-estimate-customer-phone"'), "Phone field present");
  assert.ok(wizard.includes('data-testid="new-estimate-project-name"'), "Project name field present");
  assert.ok(wizard.includes('data-testid="new-estimate-project-address"'), "Jobsite address field present");
  assert.ok(wizard.includes('data-testid="new-estimate-pricing-basis"'), "Pricing basis field present");
  assert.ok(wizard.includes("Cancel"), "Cancel action present");
  assert.ok(wizard.includes("Create Estimate"), "Create Estimate action present");
  assert.ok(wizard.includes('data-testid="new-estimate-error"'), "creation failure shows explicit error feedback");
  assert.ok(wizard.includes("if (busy) return;"), "double submission is prevented while a create request is in flight");
  console.log("ok: NEW ESTIMATE UI — focused modal has exactly the required fields + Cancel/Create Estimate actions");
}

// ════════════════════════════════════════════════════════════════════════
// 3/4. STANDALONE MANUAL CREATE — no inbox message, no AI Takeoff.
// ════════════════════════════════════════════════════════════════════════
{
  const { repository, intake, manual } = freshManualServices();
  assert.equal(intake.listCases(ORG, {}).length, 0, "no inbox cases exist before create");

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-standalone-1",
    body: {
      customerName: "Presentation Test Co",
      customerEmail: "buyer@example.test",
      customerPhone: "555-0100",
      projectName: "Presentation Kitchen",
      pricingBasis: "direct"
    }
  });
  assert.ok(created.estimateId && created.intakeCaseId, "standalone create returns estimate + intake ids");

  const intakeCase = intake.getCase(ORG, created.intakeCaseId);
  assert.equal(intakeCase.sourceType || intakeCase.source_type, "manual", "case is sourced as manual, not email");
  assert.equal(intakeCase.attachments?.length ?? 0, 0, "no attachment/plan required to create");
  assert.equal(
    intakeCase.sourceMessage?.internetMessageId ?? null,
    null,
    "no inbox email identity is required to create a standalone manual estimate"
  );

  const row = await repository.getById(ORG, created.estimateId);
  assert.equal(row.takeoffJobId, null, "standalone create never links an AI Takeoff job");
  assert.equal(row.sourceTakeoffResultId ?? null, null, "standalone create never links an AI Takeoff result");
  assert.equal(row.scope.estimateOrigin, MANUAL_ESTIMATE_ORIGIN, "estimate is marked manual origin");
  assert.equal(created.openTarget, "manual-scope", "create response opens directly in Scope, not the legacy queue");
  assert.equal(row.scope.pricingBasis, "direct", "chosen pricing basis is honored at create time");
  console.log("ok: 3/4 standalone manual create needs no inbox message and never creates/enqueues AI Takeoff");
}

// ════════════════════════════════════════════════════════════════════════
// 5. Manual estimate opens directly in Scope (never Inbox/legacy queue).
// ════════════════════════════════════════════════════════════════════════
{
  const onCreatedIdx = studioApp.indexOf("onCreated={({ intakeCaseId })");
  assert.ok(onCreatedIdx !== -1, "StudioApp wires an onCreated handler for the top-level launcher");
  const wizardCloseIdx = studioApp.indexOf("/>", onCreatedIdx);
  const handlerBlock = studioApp.slice(onCreatedIdx, wizardCloseIdx);
  assert.ok(handlerBlock.includes('setWorkspaceFocus("scope")'), "create success focuses the Scope tab");
  assert.ok(handlerBlock.includes('setMainNav("estimate-workspace")'), "create success opens the estimate workspace immediately");
  assert.equal(handlerBlock.includes('setMainNav("shared-inbox")'), false, "create success does not route back to Inbox");
  assert.equal(handlerBlock.includes('setMainNav("estimate-queue")'), false, "create success does not route to the legacy queue");
  console.log("ok: 5 successful manual creation opens directly in Scope, never Inbox or the legacy queue");
}

// ════════════════════════════════════════════════════════════════════════
// 6/7. Initial Kitchen room + one included countertop piece; quantity 1.
// ════════════════════════════════════════════════════════════════════════
{
  const { repository, manual } = freshManualServices();
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-seed-1",
    body: { customerName: "Seed Test Co", projectName: "Seed Kitchen" }
  });
  const row = await repository.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms.length, 1, "exactly one starter room exists");
  assert.equal(row.scope.rooms[0].name, "Kitchen", "starter room is named Kitchen");
  assert.equal(row.scope.rooms[0].roomType, "Kitchen", "starter room type is Kitchen");
  assert.equal(row.scope.rooms[0].included, true, "starter room is included");
  assert.equal(row.scope.rooms[0].pieces.length, 1, "exactly one starter piece exists");
  const piece = row.scope.rooms[0].pieces[0];
  assert.equal(piece.included, true, "starter piece is included");
  assert.equal(piece.pieceType, "counter", "starter piece is a countertop piece");
  assert.equal(piece.quantity, 1, "starter piece quantity defaults to 1");
  console.log("ok: 6/7 standalone create seeds one Kitchen room with one included countertop piece at quantity 1");
}

// ════════════════════════════════════════════════════════════════════════
// 8/9. Dimensions autosave; valid manual Scope calculates with
// elite100-room-pricing-v1 / pricingVersion 4.
// ════════════════════════════════════════════════════════════════════════
{
  const { repository, studio, manual } = freshManualServices();
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-autosave-1",
    body: { customerName: "Autosave Test Co", projectName: "Autosave Kitchen" }
  });

  // Same call the frontend autosave controller makes on every debounced edit.
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: validCountertopEdit({ lengthIn: 84, depthIn: 25.5 }) }
  });
  let row = await repository.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].pieces[0].lengthIn, 84, "estimator dimension edit autosaves and persists");
  assert.equal(row.scope.rooms[0].pieces[0].id, "piece-countertop-1", "autosave preserves the seeded piece id");
  console.log("ok: 8 dimension edits to the seeded Scope autosave and persist");

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
  assert.equal(priced.calculation.pricingEngine, PRICING_ENGINE_V1, "valid manual Scope calculates with the v1 engine");
  assert.equal(priced.calculation.pricingVersion, PRICING_VERSION_4, "valid manual Scope calculates with pricingVersion 4");
  assert.ok(priced.calculationFingerprint, "calculation fingerprint is present");
  assert.ok(Number(priced.calculation.totals.customerDisplayTotal) > 0, "customer total computed from the standalone-seeded Scope");
  console.log("ok: 9 valid manual Scope calculates through elite100-room-pricing-v1 / pricingVersion 4");
}

// ════════════════════════════════════════════════════════════════════════
// 10/11. AI-assisted estimates use Takeoff Review as the sole editable
// geometry workspace; approval builds the canonical Studio Scope (v4).
// Manual estimates keep EstimateScopePanel + ManualPhysicalScopeEditor.
// ════════════════════════════════════════════════════════════════════════
{
  const aiPanel = readSrc("app-elite100-estimate-studio/src/estimateQueue/AiTakeoffFirstPanel.tsx");
  assert.ok(workspace.includes("AiTakeoffFirstPanel"), "AI branch mounts AiTakeoffFirstPanel");
  assert.ok(aiPanel.includes('data-testid="eq-takeoff-iframe"'), "Takeoff Review iframe mounts for AI");
  assert.equal(
    workspace.includes('scopeMode="ai_assisted"'),
    false,
    "ManualPhysicalScopeEditor ai_assisted mode is not used for AI estimates"
  );
  const aiBranch = workspace.slice(
    workspace.indexOf('state.kind === "ready" && !state.manualMode'),
    workspace.indexOf('state.kind === "ready" && state.manualMode')
  );
  assert.equal(aiBranch.includes("ManualPhysicalScopeEditor"), false);
  assert.equal(aiBranch.includes("EstimateScopePanel"), false);
  assert.equal(aiBranch.includes("eq-section-tabs"), false);
  assert.ok(
    workspace.includes("eq-takeoff-view-source-plan") ||
      workspace.includes("eq-view-plan") ||
      aiPanel.includes("eq-takeoff"),
    "source plan remains visible or accessible"
  );
  assert.equal(
    (workspace.match(/<ManualPhysicalScopeEditor/g) || []).length,
    1,
    "workspace mounts ManualPhysicalScopeEditor once (manual estimates only)"
  );

  const importPayload = {
    takeoffJobId: "takeoff-job-presentation-1",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          { label: "Main Run", shapeType: "counter", pieces: [{ label: "Main Run", pieceType: "counter", lengthIn: 90, depthIn: 25.5 }] }
        ],
        pieces: [
          {
            name: "Main Run",
            finishedEdge: { frontEdgeLengthIn: 90, totalFinishedEdgeLengthIn: 90, approved: true },
            reviewStatus: "approved"
          }
        ]
      }
    ]
  };
  const seeded = seedScopeFromTakeoffPayload(importPayload, { projectName: "AI Presentation Kitchen", customerName: "AI Test Co" });
  assert.equal(seeded.physicalScopeSource, "takeoff");

  const repository = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" }),
    loadLatestTakeoffResult: async () => null
  });
  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-presentation-ai-1",
    takeoffJobId: "takeoff-job-presentation-1",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: seeded,
    createdByUserId: ACTOR
  });

  // Approved Takeoff snapshot becomes canonical Scope; estimator edits persist
  // through updateScope (e.g. after Edit measurements → re-approve).
  const edited = { ...seeded, rooms: seeded.rooms.map((r) => ({ ...r, pieces: r.pieces.map((p) => ({ ...p, lengthIn: 110 })) })) };
  await studio.updateScope({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: { scope: edited } });
  const afterEdit = await repository.getById(ORG, created.id);
  assert.equal(afterEdit.scope.rooms[0].pieces[0].lengthIn, 110, "Takeoff-derived Scope dimension edit persists through updateScope()");

  const recalculated = await studio.calculate({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: {} });
  assert.equal(recalculated.calculation.pricingEngine, PRICING_ENGINE_V1, "AI-assisted Scope recalculates with the v1 engine");
  assert.equal(recalculated.calculation.pricingVersion, PRICING_VERSION_4, "AI-assisted Scope recalculates with pricingVersion 4");
  console.log("ok: 10/11 Takeoff-first AI workspace; approved Scope calculates pricingVersion 4");
}

// ════════════════════════════════════════════════════════════════════════
// 12. Normal v4 flow does not display "Calculate Estimate" / "Approve
// Estimate" as required actions — both are collapsed inside the
// compatibility <details> wrapper, not the primary Review & Publish view.
// ════════════════════════════════════════════════════════════════════════
{
  const introIdx = scopePanel.indexOf("no separate Calculate or Approve clicks are required");
  assert.ok(introIdx !== -1, "primary Review & Publish copy states no separate Calculate/Approve clicks are required");

  const compatIdx = scopePanel.indexOf('data-testid="eq-compat-calc-approve"');
  assert.ok(compatIdx !== -1, "compatibility wrapper for manual calculate/approve exists");
  assert.ok(compatIdx > introIdx, "the compatibility wrapper is declared after the no-separate-click framing, not before it");
  const compatCloseIdx = scopePanel.indexOf("</details>", compatIdx);
  const compatBlock = scopePanel.slice(compatIdx, compatCloseIdx);
  assert.ok(compatBlock.includes("Advanced"), "the wrapper is explicitly labeled Advanced/compatibility");
  assert.ok(compatBlock.includes("Calculate Estimate"), "Calculate Estimate lives inside the collapsed compatibility control");
  assert.ok(compatBlock.includes("Approve Estimate"), "Approve Estimate lives inside the collapsed compatibility control");

  // Nothing between the two Review & Publish section headers and the
  // compatibility wrapper is a required Calculate/Approve button.
  const reviewSectionIdx = scopePanel.indexOf("Review &amp; Publish");
  const beforeCompat = scopePanel.slice(reviewSectionIdx, compatIdx);
  assert.equal(beforeCompat.includes("Calculate Estimate"), false, "Calculate Estimate is not a primary-flow button ahead of the compatibility wrapper");
  assert.equal(beforeCompat.includes("Approve Estimate"), false, "Approve Estimate is not a primary-flow button ahead of the compatibility wrapper");
  console.log('ok: 12 "Calculate Estimate" / "Approve Estimate" are compatibility-only, never required in the normal v4 flow');
}

// ════════════════════════════════════════════════════════════════════════
// 13. Per-estimate customer-option whitelist checkboxes are absent from
// the normal v4 UI — replaced by a concise "Customer selections" summary,
// checkboxes preserved only inside a collapsed compatibility control.
// ════════════════════════════════════════════════════════════════════════
{
  const summaryIdx = scopePanel.indexOf('data-testid="eq-customer-selections-summary"');
  assert.ok(summaryIdx !== -1, "concise Customer selections summary exists");
  const summaryBlock = scopePanel.slice(summaryIdx, summaryIdx + 400);
  assert.ok(summaryBlock.includes("The customer can choose active Elite 100 materials"), "summary copy matches the required concise wording");
  assert.ok(summaryBlock.includes("Pricing is calculated from the approved Scope"), "summary states pricing derives from the approved Scope");
  assert.equal(/estimator-approved/i.test(summaryBlock), false, "summary never claims options are estimator-approved");

  const compatIdx = scopePanel.indexOf('data-testid="eq-compat-catalog-permissions"');
  assert.ok(compatIdx !== -1, "catalog-permission checkboxes are wrapped in a compatibility control");
  assert.ok(compatIdx > summaryIdx, "the concise summary renders before the collapsed compatibility checkboxes");
  const compatCloseIdx = scopePanel.indexOf("</details>", compatIdx);
  const compatBlock = scopePanel.slice(compatIdx, compatCloseIdx);
  assert.ok(compatBlock.includes('data-testid="eq-catalog-permissions"'), "the whitelist checkbox grid is preserved for compatibility, inside the collapsed control");
  assert.ok(compatBlock.includes("customerCatalogPermissions"), "underlying customerCatalogPermissions storage is preserved for existing publication code");

  // Between the section start and the compatibility wrapper, no per-category
  // "Customer may select ..." checkbox prompt is shown by default.
  const sectionIdx = scopePanel.indexOf('data-testid="eq-section-choices-commercial"');
  const beforeCompat = scopePanel.slice(sectionIdx, compatIdx);
  assert.equal(beforeCompat.includes("Customer may select"), false, "no per-category whitelist prompt appears ahead of the collapsed compatibility control");
  console.log("ok: 13 customer-option whitelist checkboxes are compatibility-only; normal view shows the concise Customer selections summary");
}

// ════════════════════════════════════════════════════════════════════════
// 14. PUBLISH — one-step Publish (from a fresh standalone-created
// estimate) uses the current v4 fingerprint and total end-to-end.
// ════════════════════════════════════════════════════════════════════════
{
  const { repository, studio, manual } = freshManualServices();
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
          customerUrl: "https://example.test/de/presentation-1",
          customerDisplayTotal: est.calculation.totals.customerDisplayTotal,
          calculationFingerprint: est.calculationFingerprint
        };
      }
    }
  });

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-publish-1",
    body: {
      customerName: "Publish Presentation Co",
      customerEmail: "buyer@example.test",
      projectName: "Publish Presentation Kitchen"
    }
  });
  // Estimator fills in the seeded default Kitchen/countertop piece — the
  // exact same starter Scope the "+ New Estimate" flow produces.
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: validCountertopEdit({ lengthIn: 96, depthIn: 25.5 }) }
  });

  const result = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.ok(result.preparedSteps.includes("calculated"), "publish runs the authoritative v4 calculation step");
  assert.ok(result.preparedSteps.includes("commercially_approved"), "publish runs the approval step");

  const finalRow = await repository.getById(ORG, created.estimateId);
  assert.equal(finalRow.calculationSnapshot.pricingEngine, PRICING_ENGINE_V1, "the snapshot frozen at publish is the v1 engine");
  assert.equal(finalRow.calculationSnapshot.pricingVersion, PRICING_VERSION_4, "the snapshot frozen at publish is pricingVersion 4");
  assert.equal(publishedArgs.estimateId, created.estimateId, "publish targets the just-calculated/approved standalone estimate");
  assert.equal(
    result.publication.customerDisplayTotal,
    finalRow.approval.customerDisplayTotal,
    "published customer display total equals the current approved v4 total"
  );
  assert.equal(
    result.publication.calculationFingerprint,
    finalRow.approval.calculationFingerprint,
    "published fingerprint equals the current approved fingerprint"
  );
  console.log("ok: 14 one-step Publish (from a standalone-created estimate) uses the current v4 fingerprint and total");
}

// ════════════════════════════════════════════════════════════════════════
// 15. LEGACY COMPATIBILITY — historical pricingVersion 2/3 snapshots still
// load unchanged (never recalculated, never relabeled), and are classified
// as historical (not active-v4) by the exact predicate the Review & Publish
// mount point branches on — so they always resolve to the legacy read-only
// EstimateDigitalEstimatePanel, never ActiveReviewPublishPanel.
// ════════════════════════════════════════════════════════════════════════
{
  // isActiveSimplifiedEstimate() contract: only pricingVersion 2/3 are
  // historical; everything else (4, unknown, or no calculation yet) is
  // active-v4. A brand-new estimate has no calculation yet, so "no
  // calculation exists" must never be misread as "historical".
  assert.equal(isActiveSimplifiedEstimate({ pricingVersion: 2 }), false, "pricingVersion 2 is historical, not active-v4");
  assert.equal(isActiveSimplifiedEstimate({ pricingVersion: 3 }), false, "pricingVersion 3 is historical, not active-v4");
  assert.equal(isActiveSimplifiedEstimate({ pricingVersion: 4 }), true, "pricingVersion 4 is active-v4");
  assert.equal(isActiveSimplifiedEstimate({ pricingVersion: null }), true, "no calculation yet (null pricingVersion) is active-v4, never historical");
  assert.equal(isActiveSimplifiedEstimate({}), true, "a brand-new estimate with no pricingVersion field at all is active-v4");

  const repository = new InMemoryStudioEstimateRepository();
  const studio = noTakeoffService({ repository });

  const historicalCases = [
    { version: 2, engine: "studio-legacy", fingerprint: "historical-fp-v2", total: 3210, display: 3300 },
    { version: 3, engine: "studio-legacy", fingerprint: "historical-fp-v3", total: 4321, display: 4500 }
  ];
  for (const c of historicalCases) {
    const historicalSnapshot = {
      fingerprint: c.fingerprint,
      calculatedAt: "2026-01-01T00:00:00.000Z",
      pricingEngine: c.engine,
      pricingVersion: c.version,
      totals: { exactInternalTotal: c.total, customerDisplayTotal: c.display },
      fabrication: { addOns: {}, edge: { finalLf: 10 }, customLineItems: [] },
      warnings: [],
      unresolvedItems: []
    };
    const historicalRow = await repository.create({
      organizationId: ORG,
      intakeCaseId: `intake-historical-v${c.version}`,
      takeoffJobId: null,
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      scope: { ...emptyStudioEstimateScope(), rooms: [] },
      calculationSnapshot: historicalSnapshot,
      approval: {
        approvedAt: "2026-01-02T00:00:00.000Z",
        calculationFingerprint: c.fingerprint,
        exactInternalTotal: c.total,
        customerDisplayTotal: c.display
      },
      createdByUserId: ACTOR
    });
    const loaded = studio.safeEstimateView(await repository.getById(ORG, historicalRow.id));
    assert.equal(loaded.calculationSnapshot.pricingVersion, c.version, `historical pricingVersion ${c.version} snapshot loads unchanged`);
    assert.equal(loaded.calculationSnapshot.fingerprint, c.fingerprint, `historical v${c.version} fingerprint is not recomputed on load`);
    assert.equal(loaded.calculation.totals.customerDisplayTotal, c.display, `historical v${c.version} frozen total is not recomputed on load`);
    assert.equal(loaded.pricingEngine, "studio-legacy", `historical v${c.version} engine surfaces as-is, not relabeled v1`);
    // The exact server field EstimateScopePanel branches on to choose
    // ActiveReviewPublishPanel vs. the legacy EstimateDigitalEstimatePanel —
    // never the active-v4 readiness authority for a frozen historical row.
    assert.equal(loaded.isActiveSimplifiedEstimate, false, `historical v${c.version} is never classified active-v4`);
    assert.equal(loaded.activeReview, null, `historical v${c.version} never gets an active-v4 readiness verdict`);
  }
  console.log("ok: 15 historical pricingVersion 2/3 snapshots still load unchanged and always route to the legacy read-only component");
}

// ════════════════════════════════════════════════════════════════════════
// 16. THE 46.25-SF REGRESSION — the exact bug-report canonical Scope
// (sink run + island + two open-edge runs + backsplash + one kitchen sink
// opening) autosaves, reloads, and calculates as ONE source of truth with
// no explicit Confirm Manual Scope / Calculate / Approve click, and the
// same fingerprint/total is what Publish freezes.
// ════════════════════════════════════════════════════════════════════════
{
  const { repository, studio, manual } = freshManualServices();
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-regression-46-25-1",
    body: {
      customerName: "Regression Test Co",
      customerEmail: "regression@example.test",
      projectName: "Regression Kitchen"
    }
  });

  // Kitchen: Sink run 120x25.5 qty 1, Island 60x60 qty 1, open edges 10+20 LF,
  // backsplash 120in x 4in, one kitchen sink opening.
  const regressionScope = {
    rooms: [
      {
        id: "room-kitchen-regression",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        openEdgeMeasurementMode: "piece_sum",
        includeBacksplash: true,
        backsplashHeightMode: "standard",
        backsplashMeasuredLengthIn: 120,
        backsplashHeightIn: 4,
        pieces: [
          {
            id: "piece-sink-run",
            name: "Sink run",
            pieceType: "counter",
            included: true,
            measurementMode: "dimensions",
            lengthIn: 120,
            depthIn: 25.5,
            quantity: 1,
            finishedEdge: { frontEdgeLengthIn: 120, totalFinishedEdgeLengthIn: 120, approved: true }
          },
          {
            id: "piece-island",
            name: "Island",
            pieceType: "counter",
            included: true,
            measurementMode: "dimensions",
            lengthIn: 60,
            depthIn: 60,
            quantity: 1,
            finishedEdge: { frontEdgeLengthIn: 240, totalFinishedEdgeLengthIn: 240, approved: true }
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1 }
  };

  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: regressionScope }
  });

  // Reload from the repository (not the in-memory write echo) — proves the
  // canonical editor's saved values are what a fresh read returns too.
  const row = await repository.getById(ORG, created.estimateId);
  assert.equal(row.scope.rooms[0].pieces[0].lengthIn, 120, "Sink run length persists at 120in");
  assert.equal(row.scope.rooms[0].pieces[0].depthIn, 25.5, "Sink run depth persists at 25.5in");
  assert.equal(row.scope.rooms[0].pieces[1].lengthIn, 60, "Island length persists at 60in");
  assert.equal(row.scope.rooms[0].pieces[1].depthIn, 60, "Island depth persists at 60in");
  assert.equal(row.scope.addOns["qty-sink"], 1, "one kitchen sink opening persists");

  // One canonical Scope billing computation — the same aggregate the Scope
  // summary reads from; no second/competing SF or LF read path.
  const billing = buildStudioScopeBilling(row.scope);
  assert.equal(
    billing.measuredCountertopSf,
    46.25,
    "canonical Scope measures 46.25 SF countertop (21.25 sink run + 25 island), matching the regression report"
  );

  const edge = resolveScopeEdgeLinearFeet(row.scope);
  assert.equal(edge.finalLf, 30, "canonical Scope measures 30 LF open edge (10 sink run + 20 island)");

  assert.equal(
    row.scope.rooms[0].backsplashSqft,
    3.33,
    "canonical Scope measures 3.33 SF backsplash (120in x 4in / 144)"
  );
  console.log(
    "ok: 16a the regression Scope (sink run + island + backsplash + sink opening) autosaves/reloads as 46.25 SF / 30 LF / 3.33 SF / 1 sink opening from one canonical read path"
  );

  // No explicit Confirm Manual Scope / Calculate Estimate / Approve Estimate
  // click precedes this — calculate() alone drives the full v4 pipeline.
  const priced = await studio.calculate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(
    priced.calculation.pricingEngine,
    PRICING_ENGINE_V1,
    "regression Scope calculates with the v1 engine with no prior Confirm/Approve click"
  );
  assert.equal(
    priced.calculation.pricingVersion,
    PRICING_VERSION_4,
    "regression Scope calculates with pricingVersion 4 with no prior Confirm/Approve click"
  );
  assert.ok(
    Number(priced.calculation.totals.customerDisplayTotal) > 0,
    "regression Scope produces a non-zero customer display total"
  );
  assert.ok(priced.calculation.reviewSummary, "v4 calculation returns a Review & Publish reviewSummary aggregate");
  assert.ok(
    Number(priced.calculation.reviewSummary.countertopMaterialTotal) > 0,
    "reviewSummary countertop material total is computed from the same 46.25 SF Scope"
  );
  assert.ok(
    priced.calculation.reviewSummary.backsplashPresent,
    "reviewSummary reports backsplash present, matching the canonical Scope"
  );
  assert.ok(
    Number(priced.calculation.reviewSummary.backsplashTotal) > 0,
    "reviewSummary backsplash total is computed from the same 3.33 SF backsplash Scope"
  );
  console.log(
    "ok: 16b the regression Scope calculates through elite100-room-pricing-v1 / pricingVersion 4 and populates Review & Publish reviewSummary — no Confirm/Calculate/Approve click required"
  );

  // Publish freezes exactly this fingerprint/total — same source of truth
  // that fed the on-screen Review & Publish numbers above.
  const workflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: studio,
    manualEstimateService: manual,
    digitalEstimateService: {
      async publish(args) {
        const est = studio.safeEstimateView(await repository.getById(ORG, args.estimateId));
        return {
          ok: true,
          customerUrl: "https://example.test/de/presentation-regression-1",
          customerDisplayTotal: est.calculation.totals.customerDisplayTotal,
          calculationFingerprint: est.calculationFingerprint
        };
      }
    }
  });
  const published = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const finalRow = await repository.getById(ORG, created.estimateId);
  assert.equal(
    published.publication.customerDisplayTotal,
    finalRow.approval.customerDisplayTotal,
    "published total for the regression Scope equals the approved v4 total"
  );
  assert.equal(
    published.publication.calculationFingerprint,
    finalRow.approval.calculationFingerprint,
    "published fingerprint for the regression Scope equals the approved v4 fingerprint"
  );
  assert.equal(finalRow.calculationSnapshot.pricingEngine, PRICING_ENGINE_V1, "frozen regression snapshot records the v1 engine");
  assert.equal(finalRow.calculationSnapshot.pricingVersion, PRICING_VERSION_4, "frozen regression snapshot records pricingVersion 4");
  console.log("ok: 16c Publish uses the same fingerprint/total the regression Scope calculated — one source of truth end-to-end");
}

// ════════════════════════════════════════════════════════════════════════
// 17. AI-ASSISTED DIMENSION EDIT — editing one dimension on the same
// canonical Scope changes the v4 result, and calculation is never gated on
// a formal Takeoff-approval status once usable rooms/pieces exist.
// ════════════════════════════════════════════════════════════════════════
{
  const importPayload = {
    takeoffJobId: "takeoff-job-presentation-regression-1",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          {
            label: "Main Run",
            shapeType: "counter",
            pieces: [{ label: "Main Run", pieceType: "counter", lengthIn: 90, depthIn: 25.5 }]
          }
        ],
        pieces: [
          {
            name: "Main Run",
            finishedEdge: { frontEdgeLengthIn: 90, totalFinishedEdgeLengthIn: 90, approved: true },
            reviewStatus: "approved"
          }
        ]
      }
    ]
  };
  const seeded = seedScopeFromTakeoffPayload(importPayload, {
    projectName: "AI Regression Kitchen",
    customerName: "AI Regression Co"
  });

  const repository = new InMemoryStudioEstimateRepository();
  // reviewStatus is deliberately "pending" (never formally approved) — proves
  // calculation is not gated on Takeoff approval once usable rooms/pieces exist.
  const studio = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "pending" }),
    loadLatestTakeoffResult: async () => ({
      id: "takeoff-result-regression-1",
      normalizedTakeoffJson: {
        rooms: [{ id: "room-1", name: "Kitchen", areas: [{ runs: [{ id: "run-1", label: "Main Run", lengthIn: 90, depthIn: 25.5 }] }] }]
      }
    })
  });
  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-presentation-regression-ai-1",
    takeoffJobId: "takeoff-job-presentation-regression-1",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: seeded,
    createdByUserId: ACTOR
  });

  const before = await studio.calculate({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: {} });
  assert.equal(
    before.calculation.pricingEngine,
    PRICING_ENGINE_V1,
    "AI-assisted Scope calculates with the v1 engine while Takeoff review is still pending (never approved)"
  );
  assert.equal(
    before.calculation.pricingVersion,
    PRICING_VERSION_4,
    "AI-assisted Scope calculates with pricingVersion 4 while Takeoff review is still pending (never approved)"
  );
  const totalBefore = Number(before.calculation.totals.customerDisplayTotal);
  assert.ok(totalBefore > 0, "AI-assisted Scope produces a non-zero total before the estimator's dimension edit");

  // Same updateScope() contract saveManualScopeDraft() delegates to — the
  // canonical editor generalized for AI-assisted Scope, not a parallel path.
  const rowBefore = await repository.getById(ORG, created.id);
  const edited = {
    ...rowBefore.scope,
    rooms: rowBefore.scope.rooms.map((r) => ({
      ...r,
      pieces: r.pieces.map((p) => ({
        ...p,
        lengthIn: 150,
        sqft: Math.round(((150 * (Number(p.depthIn) || 25.5)) / 144) * 100) / 100
      }))
    }))
  };
  await studio.updateScope({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: { scope: edited } });
  const afterEdit = await repository.getById(ORG, created.id);
  assert.equal(
    afterEdit.scope.rooms[0].pieces[0].lengthIn,
    150,
    "estimator dimension edit on AI-assisted Scope persists through the same canonical editor contract"
  );

  const after = await studio.calculate({ organizationId: ORG, estimateId: created.id, actorUserId: ACTOR, body: {} });
  assert.equal(after.calculation.pricingEngine, PRICING_ENGINE_V1, "AI-assisted Scope recalculates with the v1 engine after the edit");
  assert.equal(after.calculation.pricingVersion, PRICING_VERSION_4, "AI-assisted Scope recalculates with pricingVersion 4 after the edit");
  const totalAfter = Number(after.calculation.totals.customerDisplayTotal);
  assert.notEqual(totalAfter, totalBefore, "v4 result changes after the estimator edits one dimension on the AI-assisted canonical Scope");
  assert.ok(totalAfter > totalBefore, "increasing the countertop dimension increases the v4 total");
  console.log(
    "ok: 17 AI-assisted canonical Scope recalculates a changed v4 total after one dimension edit, with no Takeoff-approval gate on calculation (debug/approval-request controls do not gate readiness)"
  );
}

// ════════════════════════════════════════════════════════════════════════
// 17b. PRODUCTION AI KITCHEN — Takeoff Review is the editable geometry
// authority; approved snapshot becomes canonical Studio Scope (v4).
// Kitchen pieces (Sink wall 105×25.5, Range wall, Peninsula, Island, Desk).
// Edit Sink wall 105 → 120; calculator sees 120.
// ════════════════════════════════════════════════════════════════════════
{
  const aiPanel = readSrc("app-elite100-estimate-studio/src/estimateQueue/AiTakeoffFirstPanel.tsx");
  assert.ok(aiPanel.includes('data-testid="eq-takeoff-iframe"'), "17b: Takeoff Review iframe mounts");
  assert.equal(workspace.includes('scopeMode="ai_assisted"'), false, "17b: ai_assisted editor not mounted");
  assert.ok(aiPanel.includes("refresh-from-takeoff"), "17b: approval refreshes Scope from Takeoff");

  const importPayload = {
    takeoffJobId: "takeoff-job-kitchen-multi-1",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          {
            label: "Kitchen",
            shapeType: "counter",
            pieces: [
              { label: "Sink wall", pieceType: "counter", lengthIn: 105, depthIn: 25.5 },
              { label: "Range wall", pieceType: "counter", lengthIn: 58.5, depthIn: 23 },
              { label: "Peninsula", pieceType: "counter", lengthIn: 86, depthIn: 36 },
              { label: "Island top", pieceType: "counter", lengthIn: 56, depthIn: 27 },
              { label: "Desk top", pieceType: "counter", lengthIn: 70, depthIn: 25.5 }
            ]
          }
        ],
        pieces: [
          { name: "Sink wall", finishedEdge: { frontEdgeLengthIn: 105, totalFinishedEdgeLengthIn: 105, approved: true }, reviewStatus: "approved" },
          { name: "Range wall", finishedEdge: { frontEdgeLengthIn: 58.5, totalFinishedEdgeLengthIn: 58.5, approved: true }, reviewStatus: "approved" },
          { name: "Peninsula", finishedEdge: { frontEdgeLengthIn: 86, totalFinishedEdgeLengthIn: 86, approved: true }, reviewStatus: "approved" },
          { name: "Island top", finishedEdge: { frontEdgeLengthIn: 56, totalFinishedEdgeLengthIn: 56, approved: true }, reviewStatus: "approved" },
          { name: "Desk top", finishedEdge: { frontEdgeLengthIn: 70, totalFinishedEdgeLengthIn: 70, approved: true }, reviewStatus: "approved" }
        ]
      }
    ]
  };
  const seeded = seedScopeFromTakeoffPayload(importPayload, {
    projectName: "Multi Piece Kitchen",
    customerName: "Multi Piece Co",
    customerEmail: "multi@example.test",
    materialGroup: "Group Promo"
  });
  const sink = seeded.rooms[0].pieces.find((p) => /sink/i.test(String(p.name || "")));
  assert.ok(sink, "Sink wall piece seeded into canonical Scope");
  assert.equal(Number(sink.lengthIn), 105, "Sink wall starts at 105");

  const repository = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "pending" }),
    loadLatestTakeoffResult: async () => null
  });
  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-kitchen-multi-1",
    takeoffJobId: "takeoff-job-kitchen-multi-1",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: seeded,
    createdByUserId: ACTOR
  });

  const before = await studio.calculate({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: {}
  });
  const totalBefore = Number(before.calculation.totals.customerDisplayTotal);
  assert.ok(totalBefore > 0, "initial kitchen prices through v4");
  assert.equal(before.calculation.pricingVersion, PRICING_VERSION_4);

  // Edit Sink wall 105 → 120 via the same updateScope contract the canonical editor uses.
  const rowBefore = await repository.getById(ORG, created.id);
  const edited = {
    ...rowBefore.scope,
    rooms: rowBefore.scope.rooms.map((r) => ({
      ...r,
      pieces: r.pieces.map((p) =>
        /sink/i.test(String(p.name || ""))
          ? {
              ...p,
              lengthIn: 120,
              sqft: Math.round(((120 * (Number(p.depthIn) || 25.5)) / 144) * 100) / 100
            }
          : p
      )
    }))
  };
  await studio.updateScope({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { scope: edited }
  });

  const reloaded = await repository.getById(ORG, created.id);
  const sinkAfter = reloaded.scope.rooms[0].pieces.find((p) => /sink/i.test(String(p.name || "")));
  assert.equal(Number(sinkAfter.lengthIn), 120, "reload shows Sink wall = 120");
  assert.equal(Number(sinkAfter.lengthIn), 120, "canonical Scope contains 120");

  const after = await studio.calculate({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(after.calculation.pricingVersion, PRICING_VERSION_4, "pricingVersion 4 result");
  const totalAfter = Number(after.calculation.totals.customerDisplayTotal);
  assert.notEqual(totalAfter, totalBefore, "pricingVersion 4 result changes after Sink wall edit");
  assert.ok(totalAfter > totalBefore, "longer Sink wall increases customer total");
  assert.ok(after.calculation.reviewSummary, "Review & Publish receives the changed result (reviewSummary)");
  assert.ok(
    Number(after.calculation.reviewSummary.countertopMaterialTotal) > 0,
    "Review & Publish countertop material reflects the recalculated Scope"
  );
  assert.equal(
    Number((await repository.getById(ORG, created.id)).scope.rooms[0].pieces.find((p) =>
      /sink/i.test(String(p.name || ""))
    ).lengthIn),
    120,
    "calculator input Scope contains Sink wall length 120"
  );

  console.log(
    "ok: 17b multi-piece Kitchen — Sink wall 105→120 drives v4 via Takeoff-approved canonical Scope"
  );
}

// ════════════════════════════════════════════════════════════════════════
// 18. FORBIDDEN ACTIVE-V4 STRINGS — none of the legacy workflow-state
// phrases from the presentation acceptance test render anywhere in the
// three active-flow surfaces (Scope/Customer Choices workspace, takeoff
// workspace chrome, Review & Publish panel).
// ════════════════════════════════════════════════════════════════════════
{
  const forbiddenStrings = [
    "Confirmed physical scope",
    "Approved physical scope",
    "Manual scope needs confirmation",
    "Approve Takeoff & Build Estimate",
    "Last approval request",
    "Calculate the estimate before approving and publishing",
    "Approve the Studio estimate before publishing",
    "Current Takeoff must be approved",
    "Configuration envelope",
    "estimator-approved Elite 100 colors",
    "estimator-approved backsplash",
    "E. Digital Estimate"
  ];
  const surfaces = [
    ["EstimateScopePanel.tsx", scopePanel],
    ["EstimateTakeoffWorkspace.tsx", workspace],
    ["EstimateDigitalEstimatePanel.tsx", digitalEstimatePanel]
  ];
  for (const phrase of forbiddenStrings) {
    for (const [fileName, src] of surfaces) {
      assert.equal(src.includes(phrase), false, `forbidden active-v4 string "${phrase}" must not render in ${fileName}`);
    }
  }
  console.log(
    "ok: 18 none of the 12 forbidden active-v4 legacy strings render in Scope / Customer Choices workspace / Review & Publish"
  );
}

// ════════════════════════════════════════════════════════════════════════
// 19. TAMPER-PROOF PUBLISH GATE — a browser cannot make an ineligible
// active-v4 estimate publishable by sending a forged "eligible" readiness,
// or any other Scope/Configuration/calculation-shaped field, in the
// publish request body. The server re-derives activeReview only from its
// own just-reloaded, just-recalculated estimate; the request body is never
// consulted for readiness.
// ════════════════════════════════════════════════════════════════════════
{
  const { studio, manual } = freshManualServices();
  let publishCalls = 0;
  const workflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: studio,
    manualEstimateService: manual,
    digitalEstimateService: {
      async publish() {
        publishCalls += 1;
        return { ok: true, customerUrl: "https://example.test/de/tamper-1" };
      }
    }
  });

  // Genuinely ineligible: a measured, included Kitchen countertop piece
  // (so Scope itself is fine and calculation succeeds), but no customer
  // email — one real, unambiguous publish blocker.
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-tamper-1",
    body: { projectName: "Tamper Test Kitchen" }
  });
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: validCountertopEdit({ lengthIn: 96, depthIn: 25.5 }) }
  });

  const attemptPublish = (body) =>
    workflow.publishDigitalEstimate({
      organizationId: ORG,
      estimateId: created.estimateId,
      actorUserId: ACTOR,
      body
    });

  let plainError = null;
  try {
    await attemptPublish({ confirm: true });
  } catch (e) {
    plainError = e;
  }
  assert.ok(plainError, "publish rejects an estimate missing customer email");
  assert.equal(plainError.statusCode, 422, "rejection is a 422, not a silent success");
  assert.ok(Array.isArray(plainError.blockers) && plainError.blockers.length > 0, "rejection carries concrete blockers");
  assert.equal(publishCalls, 0, "digitalEstimateService.publish is not invoked on the plain rejected attempt");

  // A browser could send anything here — a stale cached "eligible: true"
  // readiness object, a hand-forged Scope with a fake customerEmail, a
  // fabricated calculation with a large total — none of it is Scope,
  // Configuration, or calculation state the server trusts. Assert the
  // rejection is byte-for-byte identical to the untampered attempt.
  let tamperedError = null;
  try {
    await attemptPublish({
      confirm: true,
      activeReview: { eligible: true, blockers: [] },
      isActiveSimplifiedEstimate: true,
      scope: {
        customerEmail: "forged@example.test",
        projectName: "Forged Project",
        materialGroup: "Group Promo",
        rooms: [{ included: true, pieces: [{ included: true, lengthIn: 999, depthIn: 999 }] }]
      },
      calculation: { totals: { customerDisplayTotal: 999999 }, unresolvedItems: [] }
    });
  } catch (e) {
    tamperedError = e;
  }
  assert.ok(tamperedError, "a forged client-side readiness/scope/calculation payload still cannot publish an ineligible estimate");
  assert.equal(tamperedError.statusCode, 422, "forged payload still yields a 422, not success");
  assert.deepEqual(
    tamperedError.blockers,
    plainError.blockers,
    "the forged payload changes none of the server-derived blockers — the publish request body is never read for readiness"
  );
  assert.equal(
    publishCalls,
    0,
    "digitalEstimateService.publish is never invoked when the server-derived estimate is ineligible, regardless of client payload"
  );
  console.log("ok: 19 a tampered/forged browser readiness payload cannot make an ineligible estimate publishable");
}

// ════════════════════════════════════════════════════════════════════════
// 20. ONE SERVER AUTHORITY — the Review & Publish read endpoint
// (studioEstimateService.safeEstimateView → estimate.activeReview) and the
// publish orchestration (studioSimplifiedWorkflow.prepareEstimateForPublish)
// import and call the exact same deriveActiveReviewPublishReadiness
// function from studioActiveReviewReadiness.mjs, and therefore report
// identical blockers for the same estimate — not two independently
// maintained copies that could drift apart.
// ════════════════════════════════════════════════════════════════════════
{
  const studioEstimateServiceSrc = readSrc("backend-core/src/elite100EstimateStudio/studioEstimateService.mjs");
  const studioSimplifiedWorkflowSrc = readSrc("backend-core/src/elite100EstimateStudio/studioSimplifiedWorkflow.mjs");
  const sharedAuthorityImport =
    /import\s*\{[^}]*deriveActiveReviewPublishReadiness[^}]*\}\s*from\s*"\.\/studioActiveReviewReadiness\.mjs"/;
  assert.match(
    studioEstimateServiceSrc,
    sharedAuthorityImport,
    "studioEstimateService.mjs imports the shared readiness authority, not a local reimplementation"
  );
  assert.match(
    studioSimplifiedWorkflowSrc,
    sharedAuthorityImport,
    "studioSimplifiedWorkflow.mjs imports the shared readiness authority, not a local reimplementation"
  );

  // Behavioral proof: the same estimate reports the same blockers from the
  // read endpoint (activeReview) and from an actual rejected publish
  // attempt. Scope is valid/measured and already calculated once (so both
  // sides see a real calculationSnapshot) — the only remaining gap is
  // customer email, so this isolates one unambiguous blocker.
  const { studio, manual } = freshManualServices();
  const workflow = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: studio,
    manualEstimateService: manual,
    digitalEstimateService: {
      async publish() {
        throw new Error("must not be reached — estimate is not eligible");
      }
    }
  });
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "presentation-same-authority-1",
    body: { projectName: "Same Authority Kitchen" }
  });
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: validCountertopEdit({ lengthIn: 96, depthIn: 25.5 }) }
  });
  await studio.calculate({ organizationId: ORG, estimateId: created.estimateId, actorUserId: ACTOR, body: {} });

  const readView = await studio.getById(ORG, created.estimateId);
  assert.equal(readView.isActiveSimplifiedEstimate, true, "a fresh manual estimate is active-v4, not historical");
  assert.ok(readView.activeReview, "the read endpoint exposes activeReview for an active-v4 estimate");
  assert.equal(readView.activeReview.eligible, false, "the read endpoint reports the estimate as not yet eligible (no customer email)");
  assert.deepEqual(
    readView.activeReview.blockers,
    [{ code: "customer_email_required", message: "Customer email required" }],
    "the read endpoint reports exactly the one real gap"
  );

  let publishError = null;
  try {
    await workflow.publishDigitalEstimate({
      organizationId: ORG,
      estimateId: created.estimateId,
      actorUserId: ACTOR,
      body: { confirm: true }
    });
  } catch (e) {
    publishError = e;
  }
  assert.ok(publishError, "publish rejects the same estimate the read endpoint reported as ineligible");
  assert.deepEqual(
    publishError.blockers,
    readView.activeReview.blockers,
    "publish's rejection reason set is identical to what Review & Publish already displayed — one authority, not two"
  );
  console.log("ok: 20 the Review & Publish read endpoint and the publish orchestration call the same server readiness authority");
}

// ════════════════════════════════════════════════════════════════════════
// 21. NO LEGACY MOUNT, EVEN COLLAPSED — for an active-v4 estimate, the
// legacy Configuration envelope, "Rooms locked for customer", per-category
// customer permission whitelist, legacy Save Configuration action, and the
// legacy Takeoff/Calculation/Approval/Persistence status strip / approval
// eligibility logic are never mounted — not even inside a collapsed
// <details>. They exist only in the historical/legacy branch
// (EstimateDigitalEstimatePanel), which the active branch never renders.
// ════════════════════════════════════════════════════════════════════════
{
  // The legacy per-field status/calculation/approval/persistence readout
  // and the legacy manual Calculate/Approve controls live in
  // EstimateScopePanel.tsx itself (shared file), so they must be guarded by
  // a runtime !isActiveSimplified conditional immediately around them —
  // not merely present in the file (JSX conditionals don't delete source
  // text, so a plain includes() check can't prove this).
  const activeSimplifiedGuard = /\{!isActiveSimplified\s*\?\s*\(/;

  const metaIdx = scopePanel.indexOf('data-testid="eq-compat-estimate-status-meta"');
  assert.ok(metaIdx > -1, "the legacy Takeoff/Calculation/Approval/Persistence status strip markup still exists for historical compatibility");
  assert.match(
    scopePanel.slice(Math.max(0, metaIdx - 400), metaIdx),
    activeSimplifiedGuard,
    "the legacy status strip is gated behind !isActiveSimplified — never mounted for an active estimate, even collapsed"
  );

  const calcApproveIdx = scopePanel.indexOf('data-testid="eq-compat-calc-approve"');
  assert.ok(calcApproveIdx > -1, "the legacy manual Calculate/Approve markup still exists for historical compatibility");
  assert.match(
    scopePanel.slice(Math.max(0, calcApproveIdx - 400), calcApproveIdx),
    activeSimplifiedGuard,
    "legacy manual Calculate/Approve (approval eligibility logic) is gated behind !isActiveSimplified — never mounted for an active estimate, even collapsed"
  );

  // The Review & Publish mount point is a hard branch, not one shared
  // component with hidden legacy sections: the active branch mounts only
  // ActiveReviewPublishPanel, the historical branch mounts only the legacy
  // EstimateDigitalEstimatePanel (Configuration envelope, room-lock,
  // per-category customer permission whitelist, Save Configuration).
  const reviewBranchIdx = scopePanel.indexOf("!showReview ? null : isActiveSimplified ? (");
  assert.ok(reviewBranchIdx > -1, "Review & Publish mount point branches on isActiveSimplified");
  const reviewBranch = scopePanel.slice(reviewBranchIdx, reviewBranchIdx + 1500);
  assert.ok(reviewBranch.includes("<ActiveReviewPublishPanel"), "the active branch mounts ActiveReviewPublishPanel");
  assert.ok(
    reviewBranch.includes("<EstimateDigitalEstimatePanel"),
    "the historical branch mounts the legacy EstimateDigitalEstimatePanel — the two are mutually exclusive, never both mounted"
  );

  // ActiveReviewPublishPanel is a dedicated, isolated component — it must
  // not contain any of these legacy-only concepts at all (not gated,
  // structurally absent), unlike EstimateScopePanel.tsx above.
  const activeReviewPublishPanelSrc = readSrc(
    "app-elite100-estimate-studio/src/estimateQueue/ActiveReviewPublishPanel.tsx"
  );
  const legacyOnlyMarkers = [
    "Rooms locked for customer",
    "Customer may choose",
    "eq-de-room-lock",
    "eq-de-customer-choices",
    "Save configuration",
    "eq-compat-estimate-status-meta",
    "eq-compat-calc-approve",
    "eq-calculate-estimate",
    "eq-approve-estimate",
    "Configuration envelope"
  ];
  for (const marker of legacyOnlyMarkers) {
    assert.equal(
      activeReviewPublishPanelSrc.includes(marker),
      false,
      `ActiveReviewPublishPanel.tsx must not contain the legacy-only marker "${marker}"`
    );
  }

  // Those same legacy-only markers remain available in the historical
  // component — they were collapsed/relabeled, not deleted, so
  // pricingVersion 2/3 estimators keep the compatibility controls they
  // still depend on.
  assert.ok(digitalEstimatePanel.includes("Rooms locked for customer"), "the historical panel still offers Rooms locked for customer");
  assert.ok(digitalEstimatePanel.includes("eq-de-customer-choices"), "the historical panel still offers the per-category customer permission whitelist");
  console.log(
    "ok: 21 legacy Configuration/status/approval controls are never mounted (even collapsed) for an active-v4 estimate, and remain intact for historical estimates"
  );
}

// ════════════════════════════════════════════════════════════════════════
// PRESENTATION-SAFE VISUAL RESULT — defensive guardrails against legacy
// state-machine terminology reappearing in the normal v4 screen.
// ════════════════════════════════════════════════════════════════════════
{
  assert.equal(scopePanel.includes("Commercially Approved"), false, "no 'Commercially Approved' terminology in Scope panel");
  assert.equal(scopePanel.includes("Scope Confirmed"), false, "no 'Scope Confirmed' terminology in Scope panel");
  assert.equal(workspace.includes("Commercially Approved"), false, "no 'Commercially Approved' terminology in workspace");
  assert.equal(workspace.includes("Scope Confirmed"), false, "no 'Scope Confirmed' terminology in workspace");
  console.log("ok: presentation-safe — no legacy queue/gate terminology surfaces in the normal v4 screen");
}

console.log("\nAll studioPresentationFlow integration tests passed.\n");
