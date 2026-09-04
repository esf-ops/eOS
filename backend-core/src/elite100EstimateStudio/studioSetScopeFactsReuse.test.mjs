/**
 * Set Scope request-scoped takeoff facts reuse (Phase 3 latency).
 * Run: node backend-core/src/elite100EstimateStudio/studioSetScopeFactsReuse.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioSetScopeFactsReuse.test.mjs\n");

{
  const src = readFileSync(join(__dirname, "studioEstimateService.mjs"), "utf8");
  assert.match(src, /setScopeFacts/);
  assert.match(src, /refresh_gate_reuse_facts/);
  assert.match(src, /refresh_gate_workspace/);
  const setScope = readFileSync(join(__dirname, "../elite100QuoteFlow/quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScope, /setScopeFacts/);
  assert.match(setScope, /prime_takeoff_facts/);
  console.log("ok: source contracts for request-scoped Set Scope facts");
}

{
  let workspaceLoads = 0;
  let latestLoads = 0;
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE,
    takeoffJobId: JOB,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
    scope: emptyStudioEstimateScope()
  });

  const svc = createStudioEstimateService({
    repository: repo,
    loadTakeoffWorkspace: async () => {
      workspaceLoads += 1;
      return { reviewStatus: "approved", latestResult: { id: "res-1" } };
    },
    loadLatestTakeoffResult: async () => {
      latestLoads += 1;
      return {
        id: "res-1",
        normalizedTakeoffJson: {
          rooms: [
            {
              id: "r1",
              name: "Kitchen",
              areas: [
                {
                  id: "a1",
                  runs: [{ id: "p1", label: "Sink", lengthIn: 100, depthIn: 25, quantity: 1 }]
                }
              ]
            }
          ]
        },
        computedMeasurementsJson: { countertopExactSf: 17.36 },
        reviewState: null
      };
    }
  });

  const withFacts = await svc.getOrCreateForCase({
    organizationId: ORG,
    intakeCaseId: CASE,
    takeoffJobId: JOB,
    actorUserId: ACTOR,
    setScopeFacts: {
      takeoffJobId: JOB,
      reviewStatus: "approved",
      resultId: "res-facts",
      normalizedTakeoffJson: {
        rooms: [
          {
            id: "r1",
            name: "Kitchen",
            areas: [
              {
                id: "a1",
                runs: [{ id: "p1", label: "Sink", lengthIn: 100, depthIn: 25, quantity: 1 }]
              }
            ]
          }
        ]
      },
      computedMeasurementsJson: { countertopExactSf: 17.36 },
      validationDiagnosticsJson: { errorCount: 0 },
      reviewState: null,
      approvedAt: "2026-09-04T12:00:00.000Z",
      approvedByUserId: ACTOR
    }
  });

  assert.equal(workspaceLoads, 0, "must not reload workspace when setScopeFacts provided");
  assert.equal(latestLoads, 0, "must not reload latest when setScopeFacts provided");
  assert.ok(Array.isArray(withFacts.scope?.rooms) && withFacts.scope.rooms.length > 0);
  console.log("ok: getOrCreateForCase reuses freeze setScopeFacts without takeoff rereads");

  // Without facts, loads happen.
  const CASE2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE2,
    takeoffJobId: JOB,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
    scope: emptyStudioEstimateScope()
  });
  await svc.getOrCreateForCase({
    organizationId: ORG,
    intakeCaseId: CASE2,
    takeoffJobId: JOB,
    actorUserId: ACTOR
  });
  assert.ok(workspaceLoads >= 1);
  assert.ok(latestLoads >= 1);
  console.log("ok: without facts, refreshTakeoffGate still loads workspace + latest");
}

console.log("\nstudioSetScopeFactsReuse.test.mjs: ok\n");
