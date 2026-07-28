/**
 * Takeoff-first AI estimating — Studio surface contracts.
 *
 * Proves AI-assisted estimates mount Takeoff Review (not ManualPhysicalScopeEditor),
 * drop the three-tab workflow, keep poll status-only (no dirty overwrite), and
 * hand off approval → canonical Scope → pricingVersion 4.
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/takeoffFirstWorkflow.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStudioEstimateRepository } from "../../../backend-core/src/elite100EstimateStudio/inMemoryStudioEstimateRepository.mjs";
import {
  createStudioEstimateService,
  seedScopeFromTakeoffPayload
} from "../../../backend-core/src/elite100EstimateStudio/studioEstimateService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "../../../backend-core/src/elite100EstimateStudio/studioEstimateTypes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = readFileSync(
  join(root, "src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);
const panel = readFileSync(join(root, "src/estimateQueue/AiTakeoffFirstPanel.tsx"), "utf8");
const takeoffReview = readFileSync(
  join(root, "../app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
const manualEditor = readFileSync(
  join(root, "src/estimateQueue/ManualPhysicalScopeEditor.tsx"),
  "utf8"
);
const sharedInboxApi = readFileSync(join(root, "src/lib/sharedInboxApi.mjs"), "utf8");

const ORG = "org-takeoff-first";
const ACTOR = "user-takeoff-first";
const PRICING_VERSION_4 = 4;

console.log("\ntakeoffFirstWorkflow.ui.test.mjs\n");

// ── 1. Single editable geometry workspace for AI ──────────────────────────
{
  assert.ok(workspace.includes("AiTakeoffFirstPanel"), "AI branch mounts AiTakeoffFirstPanel");
  assert.ok(panel.includes('data-testid="eq-takeoff-iframe"'), "Takeoff Review iframe mounts");
  assert.ok(panel.includes("aiTakeoffHeadUrl"), "iframe uses production Takeoff head URL");
  assert.ok(panel.includes("consolidated=1"), "iframe opens consolidated Takeoff Review");
  assert.match(
    workspace,
    /state\.kind === "ready" && !state\.manualMode[\s\S]*?<AiTakeoffFirstPanel/,
    "AI ready branch renders AiTakeoffFirstPanel"
  );
  const aiBranch = workspace.slice(
    workspace.indexOf('state.kind === "ready" && !state.manualMode'),
    workspace.indexOf('state.kind === "ready" && state.manualMode')
  );
  assert.equal(
    aiBranch.includes("ManualPhysicalScopeEditor"),
    false,
    "ManualPhysicalScopeEditor is not mounted for AI-assisted estimates"
  );
  assert.equal(
    aiBranch.includes("EstimateScopePanel"),
    false,
    "EstimateScopePanel is not mounted for AI-assisted estimates"
  );
  assert.equal(
    aiBranch.includes("eq-section-tabs"),
    false,
    "three tabs do not render for AI-assisted estimates"
  );
  assert.equal(
    aiBranch.includes("EstimateWorkflowHeader"),
    false,
    "EstimateWorkflowHeader does not render for AI"
  );
  assert.ok(
    workspace.includes('state.kind === "ready" && state.manualMode'),
    "manual estimates keep a separate branch"
  );
  assert.ok(
    workspace.includes("<ManualPhysicalScopeEditor"),
    "manual estimates still mount ManualPhysicalScopeEditor"
  );
  assert.equal(
    (workspace.match(/scopeMode="ai_assisted"/g) || []).length,
    0,
    "ai_assisted ManualPhysicalScopeEditor mode is not used"
  );
  console.log("ok: 1 only Takeoff Review is the AI editable geometry workspace");
}

// ── 2. Poll must not overwrite dirty Takeoff / Scope drafts ───────────────
{
  const pollIdx = workspace.indexOf("Status-label poll only");
  assert.ok(pollIdx !== -1, "status-label poll comment present");
  const pollSection = workspace.slice(pollIdx, pollIdx + 2500);
  assert.ok(pollSection.includes("Labels only"), "poll is status-label only");
  assert.equal(
    /scopeRefreshKey:\s*prev\.scopeRefreshKey\s*\+\s*1/.test(pollSection),
    false,
    "poll must never bump scopeRefreshKey"
  );
  assert.equal(pollSection.includes("setRooms"), false);
  assert.ok(takeoffReview.includes("beforeunload"), "Takeoff warns on unsaved navigation");
  assert.ok(
    takeoffReview.includes('dirtyLocal || saveStatusRef.current === "dirty"'),
    "Takeoff poll skips loadWorkspace when dirty"
  );
  assert.ok(
    manualEditor.includes("dirtyRef.current && refreshKey > 0"),
    "Manual editor skips poll-driven reload when dirty"
  );
  console.log("ok: 2 poll does not overwrite dirty drafts");
}

// ── 3. Save draft / approval / publish wiring ─────────────────────────────
{
  assert.ok(takeoffReview.includes("Save draft"), "explicit Save draft remains");
  assert.ok(panel.includes("isValidTakeoffApprovedMessage"));
  assert.ok(panel.includes("refresh-from-takeoff"));
  assert.ok(panel.includes("/calculate"));
  assert.ok(panel.includes("simplified-publish"));
  assert.ok(panel.includes('data-testid="eq-ai-approved-measurements"'));
  assert.ok(panel.includes('data-testid="eq-publish-digital-estimate"'));
  assert.ok(panel.includes('data-testid="eq-copy-customer-link"'));
  assert.ok(panel.includes('data-testid="eq-open-customer-preview"'));
  assert.ok(panel.includes("Edit measurements"));
  assert.equal(panel.includes("eq-section-tab"), false);
  assert.equal(panel.includes('data-testid="eq-section-tabs"'), false);
  assert.equal(panel.includes("CustomerChoicesEstimatorPanel"), false);
  console.log("ok: 3 approval handoff + compact publish card");
}

// ── 4. Kitchen geometry → canonical Scope → pricingVersion 4 ──────────────
{
  const kitchenPayload = {
    takeoffJobId: "takeoff-job-kitchen-restore-1",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          {
            label: "Kitchen",
            shapeType: "counter",
            pieces: [
              { label: "Cooktop wall", pieceType: "counter", lengthIn: 112.5, depthIn: 25.5 },
              { label: "Sink wall", pieceType: "counter", lengthIn: 96, depthIn: 25.5 },
              { label: "Cooktop wall FHB", pieceType: "counter", lengthIn: 112.5, depthIn: 18 },
              { label: "Sink wall FHB", pieceType: "counter", lengthIn: 96, depthIn: 18 }
            ]
          }
        ],
        pieces: [
          {
            name: "Cooktop wall",
            lengthIn: 112.5,
            depthIn: 25.5,
            finishedEdge: {
              frontEdgeLengthIn: 112.5,
              totalFinishedEdgeLengthIn: 112.5,
              approved: true
            },
            reviewStatus: "approved"
          },
          {
            name: "Sink wall",
            lengthIn: 96,
            depthIn: 25.5,
            finishedEdge: { frontEdgeLengthIn: 96, totalFinishedEdgeLengthIn: 96, approved: true },
            reviewStatus: "approved"
          },
          {
            name: "Cooktop wall FHB",
            lengthIn: 112.5,
            depthIn: 18,
            finishedEdge: {
              frontEdgeLengthIn: 112.5,
              totalFinishedEdgeLengthIn: 112.5,
              approved: true
            },
            reviewStatus: "approved"
          },
          {
            name: "Sink wall FHB",
            lengthIn: 96,
            depthIn: 18,
            finishedEdge: { frontEdgeLengthIn: 96, totalFinishedEdgeLengthIn: 96, approved: true },
            reviewStatus: "approved"
          }
        ],
        backsplash: { lengthIn: 208.5, heightIn: 4, included: true }
      }
    ]
  };

  const seeded = seedScopeFromTakeoffPayload(kitchenPayload, {
    projectName: "Restore Kitchen",
    customerName: "Restore Co",
    customerEmail: "restore@example.com"
  });
  assert.ok(seeded?.rooms?.length >= 1, "seeded Scope has Kitchen");

  // Simulate estimator edit of Sink wall 96 → 100 before approval.
  const edited = {
    ...seeded,
    rooms: seeded.rooms.map((room) => ({
      ...room,
      pieces: (room.pieces || []).map((p) =>
        String(p.name || p.label) === "Sink wall" ? { ...p, lengthIn: 100 } : p
      )
    }))
  };
  const sink = edited.rooms[0].pieces.find((p) => String(p.name || p.label) === "Sink wall");
  assert.equal(Number(sink?.lengthIn), 100);

  const repository = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" }),
    loadLatestTakeoffResult: async () => null
  });
  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-takeoff-first-1",
    takeoffJobId: "takeoff-job-kitchen-restore-1",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: edited,
    createdByUserId: ACTOR
  });

  await studio.updateScope({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { scope: edited }
  });
  const afterEdit = await repository.getById(ORG, created.id);
  const persistedSink = afterEdit.scope.rooms[0].pieces.find(
    (p) => String(p.name || p.label) === "Sink wall"
  );
  assert.equal(Number(persistedSink?.lengthIn), 100, "canonical Scope keeps edited Sink wall 100");

  const cooktop = afterEdit.scope.rooms[0].pieces.find(
    (p) => String(p.name || p.label) === "Cooktop wall"
  );
  assert.equal(Number(cooktop?.lengthIn), 112.5);
  assert.equal(Number(cooktop?.depthIn), 25.5);

  const recalculated = await studio.calculate({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(
    recalculated.calculation.pricingVersion,
    PRICING_VERSION_4,
    "approved Takeoff-derived Scope calculates pricingVersion 4"
  );
  assert.ok(
    Number(recalculated.calculation.totals.customerDisplayTotal) > 0,
    "starting estimate total is calculable"
  );
  console.log("ok: 4 kitchen geometry → canonical Scope → pricingVersion 4");
}

// ── 5. Shared Inbox Start Estimate confirmation preserved ─────────────────
{
  assert.match(sharedInboxApi, /confirm:\s*true/);
  assert.match(sharedInboxApi, /forceManual:\s*opts\.forceManual\s*===\s*true/);
  assert.match(sharedInboxApi, /idempotencyKey:\s*opts\.idempotencyKey/);
  console.log("ok: 5 Shared Inbox Start Estimate still sends confirm:true");
}

console.log("\ntakeoffFirstWorkflow.ui.test.mjs — passed\n");
