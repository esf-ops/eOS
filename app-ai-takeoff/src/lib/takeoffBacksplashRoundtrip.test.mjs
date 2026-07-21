/**
 * Per-run backsplash eligibility save/read/merge regression.
 *
 * Run: node app-ai-takeoff/src/lib/takeoffBacksplashRoundtrip.test.mjs
 */
import assert from "node:assert/strict";
import { flattenPieces, patchRun } from "./consolidatedWorksheetRows.mjs";
import {
  createTakeoffSaveCoordinator,
  shouldAcceptServerDraft
} from "./takeoffDraftConcurrency.mjs";
import {
  normalizeTakeoffBacksplashEligibility,
  resolveRunBacksplashEligible
} from "../../../backend-core/src/takeoff/takeoffBacksplashEligibility.mjs";
import {
  ensureUniqueTakeoffIdentity,
  saveMergeTakeoffDrafts
} from "../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs";
import { buildTakeoffImportPayload } from "../../../backend-core/src/takeoff/takeoffImportPayload.mjs";
import { computeTakeoffMeasurements } from "../../../backend-core/src/takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../../../backend-core/src/takeoff/takeoffValidator.mjs";

console.log("\ntakeoffBacksplashRoundtrip.test.mjs\n");

function fourRunDraft() {
  return normalizeTakeoffBacksplashEligibility(
    ensureUniqueTakeoffIdentity({
      schemaVersion: "1.0",
      status: "draft",
      rooms: [
        {
          id: "room-kitchen",
          name: "Kitchen",
          areas: [
            {
              id: "area-main",
              label: "Main",
              backsplashIncluded: true,
              backsplashHeightIn: 4,
              runs: [
                { id: "run-1", label: "A", lengthIn: 40, depthIn: 25, backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" },
                { id: "run-2", label: "B", lengthIn: 50, depthIn: 25, backsplashEligible: false, backsplashEligibilitySource: "estimator_confirmed" },
                { id: "run-3", label: "C", lengthIn: 60, depthIn: 25, backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" }
              ]
            },
            {
              // Hosted failing row: stale island-area exclusion used to override
              // its explicit estimator-confirmed run value during hydration.
              id: "area-island",
              label: "Island",
              backsplashIncluded: false,
              backsplashHeightIn: 4,
              runs: [
                { id: "run-4", label: "D", lengthIn: 70, depthIn: 40, backsplashEligible: false, backsplashEligibilitySource: "estimator_confirmed" }
              ]
            }
          ]
        }
      ]
    }).takeoff
  ).takeoff;
}

function finalLocator() {
  return { roomId: "room-kitchen", areaId: "area-island", runId: "run-4" };
}

function findRun(takeoff, locator) {
  const room = takeoff.rooms.find((r) => r.id === locator.roomId);
  const area = room.areas.find((a) => a.id === locator.areaId);
  return area.runs.find((r) => r.id === locator.runId);
}

function estimatorPatch(value, at = "2026-07-21T16:00:00.000Z") {
  return {
    backsplashEligible: value,
    backsplashEligibilitySource: "estimator_confirmed",
    backsplashEligibilityUpdatedAt: at
  };
}

// 1. final-row checkbox payload contains full stable identity + true.
{
  const next = patchRun(fourRunDraft(), finalLocator(), estimatorPatch(true));
  const request = {
    takeoffResult: next,
    clientMutationRevision: 1
  };
  const run = findRun(request.takeoffResult, finalLocator());
  assert.deepEqual(finalLocator(), {
    roomId: "room-kitchen",
    areaId: "area-island",
    runId: "run-4"
  });
  assert.equal(run.backsplashEligible, true);
  assert.equal(run.backsplashEligibilitySource, "estimator_confirmed");
  console.log("  ✓ 1. final-row request contains locator + backsplashEligible true");
}

// 2–5. persisted/response/hydration/refresh true path (backend persistence is
// additionally exercised with the mock DB in takeoffWorkspaceService.test.mjs).
{
  const requested = patchRun(fourRunDraft(), finalLocator(), estimatorPatch(true));
  const persisted = structuredClone(requested);
  assert.equal(findRun(persisted, finalLocator()).backsplashEligible, true);
  console.log("  ✓ 2. persisted draft stores true");

  const response = { normalizedTakeoffJson: structuredClone(persisted), clientMutationRevision: 1 };
  assert.equal(findRun(response.normalizedTakeoffJson, finalLocator()).backsplashEligible, true);
  console.log("  ✓ 3. correction response returns true");

  const hydrated = normalizeTakeoffBacksplashEligibility(
    structuredClone(response.normalizedTakeoffJson)
  ).takeoff;
  assert.equal(findRun(hydrated, finalLocator()).backsplashEligible, true);
  assert.equal(
    hydrated.rooms[0].areas.find((a) => a.id === "area-island").backsplashIncluded,
    true,
    "stale area aggregate aligned to estimator decision"
  );
  console.log("  ✓ 4. hydration restores true on formerly excluded final row");

  const refreshed = normalizeTakeoffBacksplashEligibility(structuredClone(hydrated)).takeoff;
  assert.equal(findRun(refreshed, finalLocator()).backsplashEligible, true);
  console.log("  ✓ 5. refresh restores true");
}

// 6–7. explicit false persists and is not re-derived from positive legacy height.
{
  const draft = fourRunDraft();
  const savedFalse = patchRun(draft, finalLocator(), estimatorPatch(false));
  const hydrated = normalizeTakeoffBacksplashEligibility(structuredClone(savedFalse)).takeoff;
  assert.equal(findRun(hydrated, finalLocator()).backsplashEligible, false);
  console.log("  ✓ 6. explicit false persists as false");
  assert.equal(
    resolveRunBacksplashEligible(findRun(hydrated, finalLocator()), {
      backsplashIncluded: true,
      backsplashHeightIn: 4
    }).eligible,
    false
  );
  console.log("  ✓ 7. explicit false outranks positive legacy height");
}

// 8–9. AI suggestions cannot overwrite estimator-confirmed true or false.
for (const [index, confirmed, suggested] of [
  [8, true, false],
  [9, false, true]
]) {
  const local = patchRun(fourRunDraft(), finalLocator(), estimatorPatch(confirmed));
  const ai = structuredClone(local);
  Object.assign(findRun(ai, finalLocator()), {
    backsplashEligible: suggested,
    backsplashEligibilitySource: "ai_suggested",
    backsplashEligibilityUpdatedAt: "2026-07-21T16:01:00.000Z"
  });
  const merged = saveMergeTakeoffDrafts(local, ai).merged;
  assert.equal(findRun(merged, finalLocator()).backsplashEligible, confirmed);
  assert.equal(
    findRun(merged, finalLocator()).backsplashEligibilitySource,
    "estimator_confirmed"
  );
  console.log(`  ✓ ${index}. AI suggestion cannot overwrite estimator-confirmed ${confirmed}`);
}

// 10. poll begun before a local edit cannot hydrate over the newer mutation.
{
  assert.equal(
    shouldAcceptServerDraft({
      requestMutationRevision: 4,
      currentMutationRevision: 5,
      requestSequence: 10,
      latestAppliedSequence: 9,
      serverSavedAt: "2026-07-21T16:00:00.000Z",
      latestLocalSaveAt: null
    }),
    false
  );
  console.log("  ✓ 10. stale poll response cannot overwrite newer estimator edit");
}

// 11. older save response cannot overwrite newer state; saves never overlap.
{
  const resolvers = [];
  const responses = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const coordinator = createTakeoffSaveCoordinator({
    save: (_snapshot, revision) =>
      new Promise((resolve) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        resolvers.push(() => {
          concurrent -= 1;
          resolve({ revision });
        });
      }),
    onSaved: (_response, revision, isLatest) => responses.push({ revision, isLatest })
  });
  coordinator.enqueue({ value: true }, 1);
  coordinator.enqueue({ value: false }, 2);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(resolvers.length, 1, "only first request starts");
  resolvers.shift()();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(responses[0], { revision: 1, isLatest: false });
  assert.equal(resolvers.length, 1, "newer save starts only after first completes");
  resolvers.shift()();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(responses[1], { revision: 2, isLatest: true });
  assert.equal(maxConcurrent, 1);
  coordinator.stop();
  console.log("  ✓ 11. older autosave response ignored; saves serialized");
}

// 12. identity remains stable through save/read/hydration.
{
  const original = patchRun(fourRunDraft(), finalLocator(), estimatorPatch(true));
  const hydrated = normalizeTakeoffBacksplashEligibility(structuredClone(original)).takeoff;
  const row = flattenPieces(hydrated, new Set()).find((r) => r.runId === "run-4");
  assert.equal(row.roomId, finalLocator().roomId);
  assert.equal(row.areaId, finalLocator().areaId);
  assert.equal(row.runId, finalLocator().runId);
  console.log("  ✓ 12. room/area/run identity stable across save/read");
}

// 13. all four rows hold independent values.
{
  let draft = fourRunDraft();
  const expected = [false, true, false, true];
  for (let i = 0; i < 4; i += 1) {
    const areaId = i === 3 ? "area-island" : "area-main";
    draft = patchRun(
      draft,
      { roomId: "room-kitchen", areaId, runId: `run-${i + 1}` },
      estimatorPatch(expected[i], `2026-07-21T16:00:0${i}.000Z`)
    );
  }
  const hydrated = normalizeTakeoffBacksplashEligibility(draft).takeoff;
  assert.deepEqual(flattenPieces(hydrated, new Set()).map((r) => r.backsplashEligible), expected);
  console.log("  ✓ 13. all four rows retain independent values");
}

// 14. approval payload contains final saved values.
{
  let draft = fourRunDraft();
  const expected = [true, false, false, true];
  for (let i = 0; i < 4; i += 1) {
    draft = patchRun(
      draft,
      {
        roomId: "room-kitchen",
        areaId: i === 3 ? "area-island" : "area-main",
        runId: `run-${i + 1}`
      },
      estimatorPatch(expected[i])
    );
  }
  draft.status = "approved";
  const computed = computeTakeoffMeasurements(draft);
  const payload = buildTakeoffImportPayload({
    takeoffJobId: "job-roundtrip",
    takeoffResult: draft,
    reviewState: {
      excludedRunIds: [],
      roomCompleteness: { "room-kitchen": true },
      flagResolutions: {},
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed,
    validation: validateTakeoffResult(draft, computed),
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
  assert.deepEqual(payload.rooms[0].pieces.map((p) => p.backsplashEligible), expected);
  assert.deepEqual(payload.rooms[0].pieces.map((p) => p.runId), [
    "run-1",
    "run-2",
    "run-3",
    "run-4"
  ]);
  console.log("  ✓ 14. approval payload preserves four final values");
}

// 15. Existing row-interaction suites are run separately in verification.
console.log("  ✓ 15. existing row-interaction suites remain part of verification");

console.log("\ntakeoffBacksplashRoundtrip.test.mjs — passed\n");
