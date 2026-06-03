/**
 * eliteOS AI Takeoff — takeoffMeasurementCalc unit tests.
 *
 * Covers backsplash manual sf, scope overrides, and linear×height calculation (v6.3).
 * No AI calls. No Supabase calls. No side effects.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAreaSf, computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { makeTakeoffArea, makeTakeoffRun, makeTakeoffRoom } from "./takeoffContract.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeRun(opts = {}) {
  return makeTakeoffRun({ lengthIn: 60, depthIn: 25.5, pieceType: "counter", ...opts });
}

function makeArea(opts = {}) {
  const run = makeRun();
  return makeTakeoffArea({ runs: [run], ...opts });
}

// ── Linear × height (existing behavior, regression guard) ──────────────────────

describe("backsplash linear × height calculation", () => {
  it("computes backsplash from backsplashLinearIn × backsplashHeightIn", () => {
    const area = makeArea({ backsplashLinearIn: 144, backsplashHeightIn: 4 });
    const { backsplashSf } = computeAreaSf(area);
    // 144 × 4 / 144 = 4.00
    assert.equal(backsplashSf, 4.00);
  });

  it("defaults backsplash height to 4 when backsplashHeightIn not set", () => {
    const area = makeArea({ backsplashLinearIn: 288 });
    const { backsplashSf } = computeAreaSf(area);
    // 288 × 4 / 144 = 8.00
    assert.equal(backsplashSf, 8.00);
  });

  it("does not add linear-based backsplash when splash runs already exist", () => {
    const splash = makeTakeoffRun({ lengthIn: 144, depthIn: 4, pieceType: "splash" });
    const counter = makeRun();
    const area = makeTakeoffArea({ runs: [counter, splash], backsplashLinearIn: 144, backsplashHeightIn: 4 });
    const { backsplashSf } = computeAreaSf(area);
    // splash run = 144×4/144 = 4.00; linear-based is skipped because backsplashSf > 0
    assert.equal(backsplashSf, 4.00);
  });
});

// ── Manual sf override (v6.3) ───────────────────────────────────────────────────

describe("backsplashManualSf (v6.3)", () => {
  it("adds manual backsplash sf to computed total when set", () => {
    const area = makeArea({ backsplashManualSf: 4.00 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 4.00);
  });

  it("manual sf overrides linear × height when both are present", () => {
    const area = makeArea({ backsplashManualSf: 4.00, backsplashLinearIn: 288, backsplashHeightIn: 4 });
    const { backsplashSf } = computeAreaSf(area);
    // manual 4.00 should win over 288×4/144 = 8.00
    assert.equal(backsplashSf, 4.00);
  });

  it("rolls up through computeTakeoffMeasurements to backsplashExactSf", () => {
    const area = makeArea({ backsplashManualSf: 3.75 });
    const room = makeTakeoffRoom({ areas: [area] });
    const result = { schemaVersion: "1.0", id: "r1", status: "draft", rooms: [room] };
    const { backsplashExactSf } = computeTakeoffMeasurements(result);
    assert.equal(backsplashExactSf, 3.75);
  });

  it("backsplashManualSf = 0 results in no backsplash", () => {
    const area = makeArea({ backsplashManualSf: 0 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 0);
  });
});

// ── Scope overrides (v6.3) ──────────────────────────────────────────────────────

describe("backsplashScope = no_stone (v6.3)", () => {
  it("forces backsplash to 0 even when manual sf is set", () => {
    const area = makeArea({ backsplashScope: "no_stone", backsplashManualSf: 4.00 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 0, "no_stone scope should override manual sf");
  });

  it("forces backsplash to 0 even when linear inches are set", () => {
    const area = makeArea({ backsplashScope: "no_stone", backsplashLinearIn: 288, backsplashHeightIn: 4 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 0, "no_stone scope should override linear×height");
  });

  it("forces backsplash to 0 even when splash runs exist", () => {
    const splash = makeTakeoffRun({ lengthIn: 144, depthIn: 4, pieceType: "splash" });
    const counter = makeRun();
    const area = makeTakeoffArea({ runs: [counter, splash], backsplashScope: "no_stone" });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 0, "no_stone scope should override splash runs");
  });
});

describe("backsplashScope = tile_by_others (v6.3)", () => {
  it("forces backsplash to 0 (tile by others = excluded from stone)", () => {
    const area = makeArea({ backsplashScope: "tile_by_others", backsplashManualSf: 5.50 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 0, "tile_by_others should zero out stone backsplash");
  });

  it("tile_by_others does not affect countertop sf", () => {
    const area = makeArea({ backsplashScope: "tile_by_others", backsplashManualSf: 5.50 });
    const { countertopSf } = computeAreaSf(area);
    // run: 60 × 25.5 / 144 = 10.63
    assert.ok(countertopSf > 0, "countertop sf should be unaffected");
  });
});

describe("backsplashScope = standard and full_height (v6.3)", () => {
  it("standard scope allows manual sf to compute normally", () => {
    const area = makeArea({ backsplashScope: "standard", backsplashManualSf: 4.00 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 4.00);
  });

  it("full_height scope allows manual sf to compute normally", () => {
    const area = makeArea({ backsplashScope: "full_height", backsplashManualSf: 18.00 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 18.00);
  });

  it("needs_review scope falls through to linear × height calculation", () => {
    const area = makeArea({ backsplashScope: "needs_review", backsplashLinearIn: 144, backsplashHeightIn: 4 });
    const { backsplashSf } = computeAreaSf(area);
    assert.equal(backsplashSf, 4.00);
  });
});

// ── Hoskins scenario (v6.3) ─────────────────────────────────────────────────────

describe("Hoskins scenario: AI reference total not structured", () => {
  const hoskinsCt = makeTakeoffRun({ lengthIn: 157, depthIn: 25.5, label: "Kitchen perimeter" });
  const hoskinsRoom = makeTakeoffRoom({ name: "Kitchen", areas: [
    makeTakeoffArea({ runs: [hoskinsCt] })
  ]});
  const hoskinsBase = {
    schemaVersion: "1.0",
    id: "hoskins-test",
    status: "draft",
    rooms: [hoskinsRoom],
    aiProvidedTotals: { backsplashExactSf: 4.00 }
  };

  it("before estimator action: CT computes from runs, BS = 0", () => {
    const { countertopExactSf, backsplashExactSf } = computeTakeoffMeasurements(hoskinsBase);
    assert.ok(countertopExactSf > 0, "CT should be non-zero");
    assert.equal(backsplashExactSf, 0, "BS = 0 before estimator input");
  });

  it("after estimator sets manual sf=4: BS = 4.00", () => {
    const area = makeTakeoffArea({
      runs: [hoskinsCt],
      backsplashManualSf: 4.00,
      backsplashScope: "standard",
    });
    const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
    const result = { ...hoskinsBase, rooms: [room] };
    const { backsplashExactSf, countertopExactSf } = computeTakeoffMeasurements(result);
    assert.equal(backsplashExactSf, 4.00, "BS should be 4.00 after manual entry");
    assert.ok(countertopExactSf > 0, "CT unchanged");
  });

  it("after estimator chooses no_stone: BS = 0 (scope overrides manual sf)", () => {
    const area = makeTakeoffArea({
      runs: [hoskinsCt],
      backsplashManualSf: 4.00,
      backsplashScope: "no_stone",
    });
    const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
    const result = { ...hoskinsBase, rooms: [room] };
    const { backsplashExactSf } = computeTakeoffMeasurements(result);
    assert.equal(backsplashExactSf, 0, "no_stone scope forces BS=0");
  });

  it("after estimator sets linear 48in × 3in height: BS = 1.00", () => {
    const area = makeTakeoffArea({
      runs: [hoskinsCt],
      backsplashLinearIn: 48,
      backsplashHeightIn: 3,
      backsplashScope: "standard",
    });
    const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
    const result = { ...hoskinsBase, rooms: [room] };
    const { backsplashExactSf } = computeTakeoffMeasurements(result);
    // 48 × 3 / 144 = 1.00
    assert.equal(backsplashExactSf, 1.00);
  });
});

// ── No pricing / quote mutation guard ──────────────────────────────────────────

describe("no pricing / quote mutation", () => {
  it("computeAreaSf does not reference any pricing fields", () => {
    const area = makeArea({ backsplashManualSf: 5, backsplashScope: "standard" });
    const result = computeAreaSf(area);
    // Verify only measurement fields are returned, no pricing fields
    const keys = Object.keys(result);
    const hasPricingField = keys.some((k) => k.toLowerCase().includes("price") || k.toLowerCase().includes("cost"));
    assert.equal(hasPricingField, false, "computeAreaSf should not return pricing fields");
  });
});

console.log("takeoffMeasurementCalc.test.mjs: all tests registered.");
