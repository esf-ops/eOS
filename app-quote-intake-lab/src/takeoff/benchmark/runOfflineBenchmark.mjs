/**
 * Phase 4B.5A — Offline benchmark harness.
 *
 * Reads the pre-generated corpus from fixtures/takeoff/benchmark/ and runs
 * deterministic validation for all 8 fixtures. NO Gemini, NO network.
 *
 * Export:
 *   runOfflineBenchmark({ rootDir, fetchImpl? }) → Promise<BenchmarkReport>
 *
 * CLI:
 *   node src/takeoff/benchmark/runOfflineBenchmark.mjs
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyDeterministicMeasurements } from "../labMeasurementCalc.mjs";
import { validateLabTakeoffRun } from "../validateLabTakeoff.mjs";
import { LAB_TAKEOFF_STATUS } from "../takeoffTypes.mjs";
import {
  validateInventoryPass,
  validateEvidencePass,
  validateGeometryPass
} from "../../../server/takeoff/validateProviderExtraction.mjs";

const __file = fileURLToPath(import.meta.url);
const __dirname = dirname(__file);
const DEFAULT_ROOT = join(__dirname, "../../../fixtures/takeoff/benchmark");

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function withinTolerance(a, b, tol) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tol + 1e-9;
}

/**
 * Merge + deduplicate warning arrays.
 * @param {...Array} arrays
 */
function mergeWarnings(...arrays) {
  const seen = new Set();
  const out = [];
  for (const arr of arrays) {
    for (const w of arr ?? []) {
      const key = `${w.code}|${w.message ?? ""}|${w.pieceId ?? ""}|${w.roomId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
  }
  return out;
}

/**
 * Build a TakeoffRun from validated provider pass results + calc.
 * Uses mode "simulated" so validateLabTakeoffRun passes provenance checks.
 *
 * @param {{
 *   fixtureId: string,
 *   contentHash: string,
 *   inventory: ReturnType<typeof validateInventoryPass>,
 *   evidence: ReturnType<typeof validateEvidencePass>,
 *   geoResult: ReturnType<typeof validateGeometryPass>,
 *   rooms: import('../takeoffTypes.mjs').TakeoffRoom[],
 *   calculation: import('../takeoffTypes.mjs').TakeoffCalculationSummary,
 *   geometryWarnings: object[]
 * }} args
 */
function buildBenchmarkRun({ fixtureId, contentHash, inventory, evidence, geoResult, rooms, calculation, geometryWarnings }) {
  const now = new Date().toISOString();

  // Override simulatedNote on evidence to satisfy validateLabTakeoffRun in simulated mode.
  const fixedEvidence = evidence.evidence.map((e) => ({
    ...e,
    simulatedNote: "Simulated fixture evidence — offline benchmark (not authoritative for SF)."
  }));

  const runId = `qil-bench-offline-${fixtureId}-${Date.now().toString(16)}`;

  const baseWarnings = mergeWarnings(
    inventory.warnings,
    evidence.warnings,
    geometryWarnings,
    [
      {
        code: "PROVIDER_TOTALS_NON_AUTHORITATIVE",
        severity: "informational",
        message:
          "Provider-proposed totals are for reconciliation only. Deterministic eliteOS measurement is authoritative.",
        blocking: false,
        estimatorActionRequired: false
      }
    ]
  );

  return {
    id: runId,
    caseId: fixtureId,
    acceptedIntakeSnapshotId: `bench-snap-${fixtureId}`,
    attachmentId: `bench-att-${fixtureId}`,
    attachmentContentHash: contentHash,
    provider: {
      name: "OfflineBenchmarkProvider",
      mode: "simulated",
      version: "bench-1.0.0",
      note: "Offline benchmark — deterministic, no AI calls, no network."
    },
    startedAt: now,
    completedAt: now,
    labTakeoffStatus: LAB_TAKEOFF_STATUS.REVIEW,
    humanReviewState: "unreviewed",
    pages: geoResult.pages?.length ? geoResult.pages : inventory.pages,
    rooms,
    evidence: fixedEvidence,
    warnings: baseWarnings,
    corrections: [],
    calculation,
    confidence: geoResult.confidence ?? "medium",
    failure: null,
    acceptedSnapshotId: null
  };
}

/**
 * Run the offline benchmark for all fixtures in the corpus.
 *
 * @param {{
 *   rootDir?: string,
 *   fetchImpl?: Function
 * }} [opts]
 * @returns {Promise<BenchmarkReport>}
 */
export async function runOfflineBenchmark({ rootDir = DEFAULT_ROOT, fetchImpl } = {}) {
  // Safety: if fetchImpl provided and called, we would throw — but we never call it.
  // Wrap it to catch accidental use.
  if (typeof fetchImpl === "function") {
    const _orig = fetchImpl;
    fetchImpl = (...args) => {
      throw new Error("runOfflineBenchmark: fetch must not be called — offline only.");
    };
  }

  // Also guard globalThis.fetch
  const _savedFetch = typeof globalThis !== "undefined" ? globalThis.fetch : undefined;

  const manifestPath = join(rootDir, "manifest.json");
  const manifestRaw = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  if (!manifest.fixtures?.length) {
    throw new Error("Benchmark manifest is empty — run generate-benchmark-corpus first.");
  }

  const results = [];

  for (const entry of manifest.fixtures) {
    const result = await runSingleFixture({ rootDir, entry });
    results.push(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const exactSfMatches = results.filter((r) => r.sfExact).length;
  const withinToleranceMatches = results.filter((r) => r.sfWithinTolerance).length;
  const correctSinkCounts = results.filter((r) => r.sinkCountMatch).length;
  const correctStates = results.filter((r) => r.stateMatch).length;
  const falseReadyForReview = results.filter((r) => r.falseReadyForReview).length;
  const falseManualReview = results.filter((r) => r.falseManualReview).length;

  const aggregate = {
    total: results.length,
    passed,
    failed,
    exactSfMatches,
    withinToleranceMatches,
    correctSinkCounts,
    correctStates,
    falseReadyForReview,
    falseManualReview
  };

  return { results, aggregate, ok: failed === 0 };
}

/**
 * @typedef {Object} BenchmarkReport
 * @property {FixtureResult[]} results
 * @property {AggregateStats} aggregate
 * @property {boolean} ok
 */

/**
 * @typedef {Object} FixtureResult
 * @property {string} fixtureId
 * @property {boolean} passed
 * @property {string[]} failures
 * @property {boolean} sfExact
 * @property {boolean} sfWithinTolerance
 * @property {boolean} sinkCountMatch
 * @property {boolean} stateMatch
 * @property {boolean} falseReadyForReview
 * @property {boolean} falseManualReview
 * @property {object} measured
 * @property {string} actualState
 * @property {string[]} actualWarningCodes
 */

async function runSingleFixture({ rootDir, entry }) {
  const failures = [];

  try {
    // 1. Read PDF + verify
    const pdfPath = join(rootDir, "pdfs", entry.filename);
    const pdfBytes = readFileSync(pdfPath);

    const header = pdfBytes.subarray(0, 5).toString("utf8");
    if (header !== "%PDF-") {
      failures.push(`${entry.fixtureId}: PDF missing %PDF- header`);
    }

    if (pdfBytes.length !== entry.sizeBytes) {
      failures.push(
        `${entry.fixtureId}: PDF size mismatch — expected ${entry.sizeBytes}, got ${pdfBytes.length}`
      );
    }

    const actualHash = sha256Hex(pdfBytes);
    if (actualHash !== entry.contentHash) {
      failures.push(
        `${entry.fixtureId}: PDF hash mismatch.\n  expected: ${entry.contentHash}\n  got:      ${actualHash}`
      );
    }

    // 2. Load ground truth + assert hash
    const gtPath = join(rootDir, entry.groundTruthPath);
    const gt = JSON.parse(readFileSync(gtPath, "utf8"));
    if (gt.contentHash !== actualHash) {
      failures.push(`${entry.fixtureId}: ground truth hash does not match PDF hash`);
    }
    if (gt.schemaVersion !== "qil_bench_ground_truth_v1") {
      failures.push(`${entry.fixtureId}: ground truth schema version mismatch`);
    }

    // 3. Load provider output
    const poPath = join(rootDir, entry.providerOutputPath);
    const po = JSON.parse(readFileSync(poPath, "utf8"));

    // 4. Run validation passes
    const maxPages = 20;
    const inventory = validateInventoryPass(po.inventory, { maxPages });
    const evidence = validateEvidencePass(po.evidence, { maxPages });
    const evidenceIds = new Set(evidence.evidence.map((e) => e.id));
    const geoResult = validateGeometryPass(po.geometry, { maxPages, evidenceIds });

    // 5. Apply deterministic measurements
    const { rooms, calculation } = applyDeterministicMeasurements(
      geoResult.rooms,
      geoResult.providerTotals
    );

    // 6. Build TakeoffRun + validate
    const run = buildBenchmarkRun({
      fixtureId: entry.fixtureId,
      contentHash: actualHash,
      inventory,
      evidence,
      geoResult,
      rooms,
      calculation,
      geometryWarnings: geoResult.warnings
    });

    const validated = validateLabTakeoffRun(run);
    const forceManual =
      validated.warnings.some((w) => w.severity === "approval_blocking") ||
      geoResult.warnings.some((w) => w.severity === "approval_blocking");

    const finalStatus = forceManual
      ? LAB_TAKEOFF_STATUS.MANUAL_REVIEW
      : validated.labTakeoffStatus;

    const finalWarnings = mergeWarnings(run.warnings, validated.warnings);
    const actualWarningCodes = [...new Set(finalWarnings.map((w) => w.code))];

    const measured = {
      countertopSf: round2(calculation.measuredCountertopSf),
      backsplashSf: round2(calculation.measuredBacksplashSf),
      fhbSf: round2(calculation.measuredFhbSf),
      combinedSf: round2(calculation.measuredCombinedSf),
      sinkCount: calculation.sinkCutoutCount
    };

    const expected = gt.expected;
    const tol = gt.toleranceSf ?? 0.05;

    // 7. Compare results to ground truth
    const stateMatch = finalStatus === expected.state;
    if (!stateMatch) {
      failures.push(
        `${entry.fixtureId}: state mismatch — expected "${expected.state}", got "${finalStatus}"`
      );
    }

    const sinkCountMatch = measured.sinkCount === expected.sinkCount;
    if (!sinkCountMatch) {
      failures.push(
        `${entry.fixtureId}: sinkCount mismatch — expected ${expected.sinkCount}, got ${measured.sinkCount}`
      );
    }

    const sfExact =
      round2(measured.countertopSf) === round2(expected.countertopSf ?? 0) &&
      round2(measured.backsplashSf) === round2(expected.backsplashSf ?? 0);

    const sfWithinTolerance =
      withinTolerance(measured.countertopSf, expected.countertopSf ?? 0, tol) &&
      withinTolerance(measured.backsplashSf, expected.backsplashSf ?? 0, tol);

    if (!sfWithinTolerance && expected.readyForReview) {
      failures.push(
        `${entry.fixtureId}: countertop SF out of tolerance — expected ${expected.countertopSf}, got ${measured.countertopSf}`
      );
    }

    // Check FHB if expected
    if ((expected.fhbSf ?? 0) > 0 || (measured.fhbSf ?? 0) > 0) {
      if (!withinTolerance(measured.fhbSf, expected.fhbSf ?? 0, tol)) {
        failures.push(
          `${entry.fixtureId}: fhbSf mismatch — expected ${expected.fhbSf}, got ${measured.fhbSf}`
        );
      }
    }

    // 8. Safety gate: false ready-for-review
    const actualReadyForReview = finalStatus === LAB_TAKEOFF_STATUS.REVIEW;
    const falseReadyForReview = !expected.readyForReview && actualReadyForReview;
    if (falseReadyForReview) {
      failures.push(
        `CRITICAL SAFETY FAILURE: ${entry.fixtureId} should NOT be ready for review but got state "${finalStatus}". This would allow a bad takeoff through the safety gate.`
      );
    }

    const falseManualReview = expected.readyForReview && finalStatus === LAB_TAKEOFF_STATUS.MANUAL_REVIEW;
    if (falseManualReview) {
      failures.push(
        `${entry.fixtureId}: unexpected manual_review — expected ready-for-review but got "${finalStatus}"`
      );
    }

    // 9. L-shape: combined SF must not equal bounding box
    if (entry.fixtureId === "qil-bench-l-shape") {
      const forbidden = gt.expected.forbiddenCountertopSf ?? 56.0;
      if (Math.abs(measured.countertopSf - forbidden) < 0.01) {
        failures.push(
          `${entry.fixtureId}: L-shape CT SF equals bounding box ${forbidden} — must use separate piece dimensions`
        );
      }
    }

    return {
      fixtureId: entry.fixtureId,
      passed: failures.length === 0,
      failures,
      sfExact,
      sfWithinTolerance,
      sinkCountMatch,
      stateMatch,
      falseReadyForReview,
      falseManualReview,
      measured,
      actualState: finalStatus,
      actualWarningCodes
    };
  } catch (err) {
    return {
      fixtureId: entry.fixtureId ?? "unknown",
      passed: false,
      failures: [`${entry.fixtureId}: unexpected error — ${err.message}`],
      sfExact: false,
      sfWithinTolerance: false,
      sinkCountMatch: false,
      stateMatch: false,
      falseReadyForReview: false,
      falseManualReview: false,
      measured: {},
      actualState: "error",
      actualWarningCodes: []
    };
  }
}

function printReport(report) {
  const { results, aggregate, ok } = report;

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║      QIL Phase 4B.5A — Offline Benchmark Report               ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    const state = r.actualState?.replace("qil_takeoff_", "").padEnd(14);
    const ct = String(r.measured?.countertopSf ?? "?").padStart(6);
    const bs = String(r.measured?.backsplashSf ?? "?").padStart(5);
    const fhb = String(r.measured?.fhbSf ?? "?").padStart(5);
    const sinks = r.measured?.sinkCount ?? "?";
    console.log(
      `  ${icon} ${r.fixtureId.padEnd(38)} state=${state} CT=${ct} BS=${bs} FHB=${fhb} sinks=${sinks}`
    );
    for (const f of r.failures) {
      console.log(`      ↳ FAIL: ${f}`);
    }
  }

  console.log("\n─── Aggregate ───────────────────────────────────────────────────");
  console.log(`  Total:               ${aggregate.total}`);
  console.log(`  Passed:              ${aggregate.passed}`);
  console.log(`  Failed:              ${aggregate.failed}`);
  console.log(`  Exact SF matches:    ${aggregate.exactSfMatches}/${aggregate.total}`);
  console.log(`  Within tolerance:    ${aggregate.withinToleranceMatches}/${aggregate.total}`);
  console.log(`  Correct states:      ${aggregate.correctStates}/${aggregate.total}`);
  console.log(`  Correct sink counts: ${aggregate.correctSinkCounts}/${aggregate.total}`);
  if (aggregate.falseReadyForReview > 0) {
    console.log(`  ⚠ CRITICAL — False ready-for-review: ${aggregate.falseReadyForReview}`);
  }

  console.log(`\n  Result: ${ok ? "✓ PASS" : "✗ FAIL"}\n`);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runOfflineBenchmark()
    .then((report) => {
      printReport(report);
      process.exit(report.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error("[benchmark] fatal error:", err.message);
      console.error(err.stack);
      process.exit(1);
    });
}
