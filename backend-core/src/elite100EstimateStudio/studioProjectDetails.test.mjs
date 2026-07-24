/**
 * Studio editable project details — metadata-only updates + publication blocker.
 * Run: npm run eos:test:studio-project-details
 * Sentinel data only.
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
  isDisallowedCustomerFacingProjectName,
  projectNameDisplayLabel,
  validateProjectNameForPublication
} from "./studioProjectDetails.mjs";
import { assessStudioEstimatePublicationReadiness } from "./studioEstimatePublicationAdapter.mjs";
import { toCommandCenterItem } from "./studioCommandCenterViewModel.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ORG = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

console.log("\nstudioProjectDetails.test.mjs\n");

assert.equal(projectNameDisplayLabel(""), "Project not named");
assert.equal(projectNameDisplayLabel("  "), "Project not named");
assert.equal(projectNameDisplayLabel("Kitchen"), "Kitchen");
assert.equal(isDisallowedCustomerFacingProjectName("Unknown"), true);
assert.equal(isDisallowedCustomerFacingProjectName("Test"), true);
assert.equal(isDisallowedCustomerFacingProjectName("Kitchen Remodel"), false);
assert.equal(
  isDisallowedCustomerFacingProjectName("Acme", { customerName: "Acme" }),
  true
);
console.log("ok: 1–2 display label + disallowed names");

{
  const blank = validateProjectNameForPublication({ projectName: "" });
  assert.equal(blank.ok, false);
  assert.equal(blank.blocker.code, "project_name_required");
  assert.equal(blank.blocker.action, "edit_project_details");
  assert.equal(blank.blocker.title, "Project name required");

  const ws = validateProjectNameForPublication({ projectName: "   " });
  assert.equal(ws.ok, false);

  const ok = validateProjectNameForPublication({ projectName: "Nietert Kitchen" });
  assert.equal(ok.ok, true);
  console.log("ok: 8–9,12–14 publication name validation + blocker shape");
}

{
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates
  });
  const studio = createStudioEstimateService({
    repository: estimates,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    loadTakeoffWorkspace: async () => null,
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async ({ scope }) => ({
      fingerprint: `fp-${scope.projectName || "blank"}`,
      pricingEngine: "sentinel",
      pricingVersion: 1,
      totals: { exactInternalTotal: 1000, customerDisplayTotal: 1200 },
      fabrication: { edge: { finalLf: 10 } },
      scopeFingerprint: "s"
    })
  });

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "proj-details-blank",
    body: { customerName: "Acme Cabinets" }
  });
  let row = await estimates.getById(ORG, created.estimateId);
  assert.equal(String(row.scope.projectName || "").trim(), "");
  console.log("ok: 1 create without project name");

  const rooms = [
    {
      id: "room-kitchen",
      name: "Kitchen",
      roomType: "Kitchen",
      openEdgeMeasurementMode: "room_total",
      openEdgeLf: 10,
      pieces: [
        {
          id: "p1",
          name: "Run",
          pieceType: "counter",
          measurementMode: "dimensions",
          lengthIn: 96,
          depthIn: 25.5
        }
      ]
    }
  ];
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: { rooms, addOns: { "qty-sink": 1 } } }
  });
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
  assert.equal(priced.status, STUDIO_ESTIMATE_STATUSES.PRICED);
  const calcFp = priced.calculation?.fingerprint || priced.calculationFingerprint;

  const approved = await studio.approve({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(approved.status, STUDIO_ESTIMATE_STATUSES.APPROVED);

  row = await estimates.getById(ORG, created.estimateId);
  const readinessBefore = assessStudioEstimatePublicationReadiness({
    estimate: row,
    repositoryMode: "memory",
    takeoffReviewStatus: "approved",
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    configuration: { pricingValidThrough: "2099-12-31" },
    now: new Date("2026-07-24T12:00:00.000Z")
  });
  assert.equal(readinessBefore.eligible, false);
  const projectBlocker = readinessBefore.blockingReasons.find(
    (b) => b.code === "project_name_required"
  );
  assert.ok(projectBlocker);
  assert.equal(projectBlocker.action, "edit_project_details");
  assert.equal(projectBlocker.title, "Project name required");
  console.log("ok: 12–14 blank name blocks publication with edit action");

  const saved = await studio.updateProjectDetails({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {
      projectName: "  Acme Kitchen Remodel  ",
      projectAddress: "12 Jobsite Rd"
    }
  });
  assert.equal(saved.published, false);
  assert.equal(saved.notified, false);
  assert.equal(saved.calculationCleared, false);
  assert.equal(saved.revised, false);
  assert.equal(saved.estimate.scope.projectName, "Acme Kitchen Remodel");
  assert.equal(saved.estimate.scope.projectAddress, "12 Jobsite Rd");
  assert.equal(saved.estimate.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.equal(row.calculationSnapshot?.fingerprint, calcFp);
  assert.equal(row.approval?.calculationFingerprint, calcFp);
  console.log("ok: 4–6,15–18,22–25 save name after approval; calc preserved; no publish");

  const readinessAfter = assessStudioEstimatePublicationReadiness({
    estimate: row,
    repositoryMode: "memory",
    takeoffReviewStatus: "approved",
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    configuration: { pricingValidThrough: "2099-12-31" },
    now: new Date("2026-07-24T12:00:00.000Z")
  });
  assert.equal(
    readinessAfter.blockingReasons.some((b) => b.code === "project_name_required"),
    false
  );
  console.log("ok: 15 adding valid name clears project_name_required");

  // Cross-org rejected
  let crossDenied = false;
  try {
    await studio.updateProjectDetails({
      organizationId: "00000000-0000-4000-8000-000000000099",
      estimateId: created.estimateId,
      actorUserId: ACTOR,
      body: { projectName: "Stolen" }
    });
  } catch (e) {
    crossDenied = e?.code === "estimate_not_found" || e?.statusCode === 404;
  }
  assert.equal(crossDenied, true);
  console.log("ok: 11 cross-organization update rejected");

  // Metadata-only via updateScope also preserves approval (partial patch).
  const viaScope = await studio.updateScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: { projectName: "Acme Kitchen Remodel v2" } }
  });
  assert.equal(viaScope.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.ok(viaScope.calculation || viaScope.calculationFingerprint);
  row = await estimates.getById(ORG, created.estimateId);
  assert.equal(row.scope.projectName, "Acme Kitchen Remodel v2");
  assert.equal(row.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  console.log("ok: updateScope metadata-only preserves approval + calculation");
}

{
  const item = toCommandCenterItem({
    id: "est-1",
    customerName: "Acme",
    projectName: "",
    sourceType: "manual",
    estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
    workflowStatus: "Scope in progress",
    openTarget: "scope"
  });
  assert.equal(item.projectLabel, "Project not named");
  assert.notEqual(item.projectLabel, "Unknown");
  assert.notEqual(item.projectLabel, "Untitled project");
  assert.equal(item.needsCompletionHint, true);
  console.log("ok: 29 Command Center shows Project not named");
}

{
  const panel = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/ProjectDetailsPanel.tsx"),
    "utf8"
  );
  const de = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
    "utf8"
  );
  const ws = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
    "utf8"
  );
  assert.match(panel, /project-details-edit/);
  assert.match(panel, /Project not named/);
  assert.match(panel, /project-details/);
  assert.match(de, /eq-de-edit-project-details/);
  assert.match(de, /edit_project_details/);
  assert.match(ws, /ProjectDetailsPanel/);
  assert.doesNotMatch(panel, /publishDigitalEstimate|link-copied/);
  console.log("ok: 3 UI contracts for Project Details + DE edit action");
}

console.log("\nstudioProjectDetails.test.mjs: ok\n");
