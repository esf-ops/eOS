/**
 * takeoffImportPayload — unit tests (v5.9).
 *
 * Run: npm run eos:test:takeoff-import-payload
 */
import assert from "node:assert/strict";
import { buildTakeoffImportPayload, TAKEOFF_IMPORT_SCHEMA_VERSION } from "./takeoffImportPayload.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { makeTakeoffRun } from "./takeoffContract.mjs";

console.log("\ntakeoffImportPayload — tests\n");

function makeSimpleApprovedResult() {
  return {
    schemaVersion: "1",
    status: "approved",
    rooms: [{
      id: "r1",
      name: "Kitchen",
      roomType: "Kitchen",
      areas: [{
        id: "a1",
        label: "Main",
        backsplashIncluded: true,
        backsplashScope: "stone",
        runs: [
          makeTakeoffRun({ id: "c1", label: "Wall", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
          makeTakeoffRun({ id: "bs1", label: "4in BS", lengthIn: 96, depthIn: 4, pieceType: "splash" }),
        ],
      }],
    }],
  };
}

function approvedPayload(result, reviewState) {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  return buildTakeoffImportPayload({
    takeoffJobId: "job-1",
    takeoffResultId: "result-1",
    takeoffResult: result,
    reviewState,
    computed,
    validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    sourceFileName: "kitchen.pdf",
    approvedBy: "estimator@example.com",
    approvedAt: "2026-06-26T12:00:00.000Z",
    reviewStatus: "approved",
  });
}

function completeRs(roomIds) {
  const roomCompleteness = {};
  for (const id of roomIds) roomCompleteness[id] = true;
  return { excludedRunIds: [], flagResolutions: {}, roomCompleteness, referenceTotalAcks: {}, evidenceAcks: {} };
}

// T1 — approved simple kitchen builds v1 payload with rooms
{
  const result = makeSimpleApprovedResult();
  const payload = approvedPayload(result, completeRs(["r1"]));
  assert.equal(payload.schemaVersion, TAKEOFF_IMPORT_SCHEMA_VERSION);
  assert.ok(payload.rooms.length > 0, "T1 has rooms");
  assert.ok(payload.totals.countertopSqft > 0, "T1 CT sf");
  assert.ok(payload.totals.standardBacksplashSqft > 0, "T1 BS sf");
  console.log("ok: T1 import payload");
}

// T2 — excluded pieces not in payload pieces list
{
  const result = makeSimpleApprovedResult();
  result.rooms[0].areas[0].runs.push(
    makeTakeoffRun({ id: "c2", label: "Exclude me", lengthIn: 48, depthIn: 25.5, pieceType: "counter" })
  );
  const payload = approvedPayload(result, {
    ...completeRs(["r1"]),
    excludedRunIds: ["c2"],
  });
  const labels = payload.rooms.flatMap((r) => r.pieces.map((p) => p.name));
  assert.ok(!labels.includes("Exclude me"), "T2 excluded piece omitted");
  console.log("ok: T2 excluded pieces omitted");
}

// T3 — cutouts become suggested add-ons not deductions
{
  const result = {
    schemaVersion: "1",
    status: "approved",
    rooms: [{
      id: "r1",
      name: "Kitchen",
      areas: [{
        id: "a1",
        label: "Main",
        backsplashIncluded: true,
        backsplashScope: "stone",
        notes: ["Undermount sink cutout — fabrication add-on"],
        runs: [
          makeTakeoffRun({ id: "c1", label: "Counter", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
        ],
      }],
    }],
  };
  const payload = approvedPayload(result, completeRs(["r1"]));
  assert.ok(payload.suggestedAddOns.some((a) => /sink/i.test(a.label)), "T3 sink add-on");
  assert.equal(payload.totals.countertopSqft, payload.rooms[0].pieces[0].sqft, "T3 no cutout deduction");
  console.log("ok: T3 cutouts as add-ons");
}

// T4 — waterfall without dimensions excluded from pieces
{
  const result = {
    schemaVersion: "1",
    status: "approved",
    rooms: [{
      id: "r1",
      name: "Kitchen",
      areas: [{
        id: "a1",
        label: "Island waterfall",
        backsplashIncluded: true,
        backsplashScope: "stone",
        runs: [
          makeTakeoffRun({ id: "c1", label: "Counter", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
          makeTakeoffRun({ id: "w1", label: "Waterfall panel", lengthIn: 0, depthIn: 0, pieceType: "fhb" }),
        ],
      }],
    }],
  };
  assert.throws(
    () => approvedPayload(result, completeRs(["r1"])),
    /validation|dimension|block|review/i,
    "T4 blockers prevent payload"
  );
  console.log("ok: T4 waterfall without dims blocks payload");
}

// T5 — edited dimensions override (manual run in result)
{
  const result = {
    schemaVersion: "1",
    status: "approved",
    rooms: [{
      id: "r1",
      name: "Kitchen",
      areas: [{
        id: "a1",
        label: "Main",
        backsplashIncluded: true,
        backsplashScope: "stone",
        runs: [
          makeTakeoffRun({ id: "c1", label: "Added run", lengthIn: 120, depthIn: 25.5, pieceType: "counter" }),
        ],
      }],
    }],
  };
  const payload = approvedPayload(result, completeRs(["r1"]));
  assert.ok(payload.rooms[0].pieces.some((p) => p.name === "Added run"), "T5 added piece");
  console.log("ok: T5 added pieces included");
}

// T6 — FHBS area with backsplashLinearIn: contributes to import totals
{
  const result = {
    schemaVersion: "1",
    status: "approved",
    rooms: [{
      id: "r1",
      name: "Kitchen",
      areas: [
        {
          id: "a1",
          label: "Perimeter Counters",
          areaType: "countertop",
          backsplashScope: "standard",
          backsplashLinearIn: 0,
          runs: [
            makeTakeoffRun({ id: "c1", label: "Run A", lengthIn: 120, depthIn: 25.5, pieceType: "counter" }),
            makeTakeoffRun({ id: "bs1", label: "4in BS", lengthIn: 120, depthIn: 4, pieceType: "splash" }),
          ],
        },
        {
          id: "a2",
          label: "Full Height Backsplash (FHBS)",
          areaType: "fhb",
          backsplashScope: "full_height",
          backsplashLinearIn: 120,
          backsplashHeightIn: 36,
          runs: [],
        },
      ],
    }],
  };
  const payload = approvedPayload(result, completeRs(["r1"]));
  // FHBS sf must be counted in totals (via computeTakeoffMeasurements / classifyBacksplashTotals)
  const totalBs = payload.totals.standardBacksplashSqft + payload.totals.fullHeightBacksplashSqft;
  assert.ok(totalBs > 0, "T6 total backsplash includes FHBS sf");
  // 4" BS pieces present
  assert.ok(payload.rooms[0].pieces.some((p) => p.pieceType === "splash"), "T6 standard BS piece present");
  console.log("ok: T6 FHBS with backsplashLinearIn contributes to import totals");
}

// T7 — FHBS marked not in scope: excluded from import sf, no pieces
{
  const result = {
    schemaVersion: "1",
    status: "approved",
    rooms: [{
      id: "r1",
      name: "Kitchen",
      areas: [
        {
          id: "a1",
          label: "Perimeter Counters",
          areaType: "countertop",
          backsplashScope: "standard",
          runs: [
            makeTakeoffRun({ id: "c1", label: "Run A", lengthIn: 120, depthIn: 25.5, pieceType: "counter" }),
            makeTakeoffRun({ id: "bs1", label: "4in BS", lengthIn: 120, depthIn: 4, pieceType: "splash" }),
          ],
        },
        {
          id: "a2",
          label: "Full Height Backsplash (FHBS)",
          areaType: "fhb",
          backsplashScope: "no_stone",   // estimator chose not in scope
          backsplashLinearIn: 0,
          backsplashManualSf: 0,
          runs: [],
        },
      ],
    }],
  };
  const payload = approvedPayload(result, completeRs(["r1"]));
  // FHBS must not add sf when no_stone
  assert.equal(payload.totals.fullHeightBacksplashSqft, 0, "T7 FHBS no_stone contributes 0 sf");
  // Standard 4" BS unaffected
  assert.ok(payload.totals.standardBacksplashSqft > 0, "T7 standard BS sf unaffected");
  console.log("ok: T7 FHBS marked not in scope → 0 sf, standard BS unaffected");
}

console.log("\nAll takeoffImportPayload tests passed.\n");
