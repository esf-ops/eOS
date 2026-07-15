/**
 * Phase 4B.5A — Offline benchmark corpus generator.
 *
 * Writes:
 *   fixtures/takeoff/benchmark/pdfs/{id}.pdf
 *   fixtures/takeoff/benchmark/ground-truth/{id}.json
 *   fixtures/takeoff/benchmark/provider-outputs/{id}.json
 *   fixtures/takeoff/benchmark/manifest.json
 *
 * NO Gemini, NO network. Kitchen-island PDF is copied from the verified fixture.
 * Do NOT modify syntheticLiveAllowlist.mjs.
 *
 * Usage (from app-quote-intake-lab):
 *   node fixtures/takeoff/benchmark/generateBenchmarkCorpus.mjs
 */

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTextPlanPdf, sha256Hex } from "./pdfKit.mjs";
import { BENCHMARK_CASE_DEFINITIONS } from "./caseDefinitions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDFS_DIR = join(__dirname, "pdfs");
const GT_DIR = join(__dirname, "ground-truth");
const PO_DIR = join(__dirname, "provider-outputs");

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Build ground-truth JSON for a case.
 * @param {import('./caseDefinitions.mjs').BenchmarkCaseDefinition} def
 * @param {string} contentHash
 * @param {number} sizeBytes
 */
function buildGroundTruth(def, contentHash, sizeBytes) {
  const geo = def.providerOutput.geometry;

  // Reconstruct rooms from geometry for ground truth (pieces with dims from provider output)
  const rooms = (geo.rooms ?? []).map((room) => ({
    id: room.id,
    name: room.name,
    pieces: (room.pieces ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      lengthIn: p.lengthIn ?? null,
      depthIn: p.depthIn ?? null,
      shape: p.shape ?? "rect",
      pieceType: p.pieceType ?? "counter",
      cutouts: p.cutouts ?? []
    })),
    backsplash: room.backsplashScope
      ? {
          scope: room.backsplashScope,
          linearIn: room.backsplashLinearIn ?? null,
          heightIn: room.backsplashHeightIn ?? null
        }
      : null
  }));

  return {
    schemaVersion: "qil_bench_ground_truth_v1",
    fixtureId: def.fixtureId,
    version: def.version,
    filename: def.filename,
    mimeType: "application/pdf",
    contentHash,
    sizeBytes,
    project: {
      ...def.project,
      synthetic: true,
      banner: "SYNTHETIC QUOTE INTAKE LAB FIXTURE — NOT A REAL CUSTOMER PLAN"
    },
    pages: [{ pageNumber: 1, role: "plan" }],
    rooms,
    expected: {
      countertopSf: def.expected.countertopSf,
      backsplashSf: def.expected.backsplashSf,
      fhbSf: def.expected.fhbSf,
      combinedSf: def.expected.combinedSf,
      sinkCount: def.expected.sinkCount,
      state: def.expected.state,
      warningCodes: def.expected.warningCodes,
      readyForReview: def.expected.readyForReview,
      ...(def.expected.forbiddenCountertopSf != null
        ? { forbiddenCountertopSf: def.expected.forbiddenCountertopSf }
        : {})
    },
    toleranceSf: def.toleranceSf,
    notes: [
      `Offline benchmark fixture — ${def.description}`,
      "No real customer information.",
      "Sink cutouts are count-only and must never be deducted from measured SF.",
      "eliteOS deterministic calc is authoritative for measured SF."
    ]
  };
}

/**
 * Build provider output JSON for a case.
 * @param {import('./caseDefinitions.mjs').BenchmarkCaseDefinition} def
 */
function buildProviderOutput(def) {
  return {
    schemaVersion: "qil_bench_provider_output_v1",
    fixtureId: def.fixtureId,
    version: def.version,
    inventory: def.providerOutput.inventory,
    evidence: def.providerOutput.evidence,
    geometry: def.providerOutput.geometry
  };
}

function generateCorpus() {
  const manifest = [];

  for (const def of BENCHMARK_CASE_DEFINITIONS) {
    const pdfPath = join(PDFS_DIR, def.filename);
    const gtPath = join(GT_DIR, `${def.fixtureId}.json`);
    const poPath = join(PO_DIR, `${def.fixtureId}.json`);

    let pdfBytes;

    if (def.copyFromExisting) {
      // Kitchen-island: copy existing verified fixture bytes
      const srcPath = join(__dirname, def.copyFromExisting);
      copyFileSync(srcPath, pdfPath);
      pdfBytes = readFileSync(pdfPath);
      console.log(`[corpus] copied ${def.fixtureId} from ${def.copyFromExisting}`);
    } else {
      // Generate text PDF from pdfLines
      pdfBytes = buildTextPlanPdf(def.pdfLines);
      writeFileSync(pdfPath, pdfBytes);
      console.log(`[corpus] generated ${def.filename} (${pdfBytes.length} bytes)`);
    }

    // Verify %PDF- header
    const header = pdfBytes.subarray(0, 5).toString("utf8");
    if (header !== "%PDF-") {
      throw new Error(`${def.fixtureId}: PDF missing %PDF- header (got: ${JSON.stringify(header)})`);
    }

    const contentHash = sha256Hex(pdfBytes);
    const sizeBytes = pdfBytes.length;

    // Verify known hash for kitchen-island
    if (def.knownHash && contentHash !== def.knownHash) {
      throw new Error(
        `${def.fixtureId}: hash mismatch.\n  expected: ${def.knownHash}\n  got:      ${contentHash}`
      );
    }

    // Write ground truth
    const gt = buildGroundTruth(def, contentHash, sizeBytes);
    writeFileSync(gtPath, JSON.stringify(gt, null, 2) + "\n");
    console.log(`[corpus] wrote ground-truth/${def.fixtureId}.json  sha256=${contentHash}`);

    // Write provider output
    const po = buildProviderOutput(def);
    writeFileSync(poPath, JSON.stringify(po, null, 2) + "\n");
    console.log(`[corpus] wrote provider-outputs/${def.fixtureId}.json`);

    manifest.push({
      fixtureId: def.fixtureId,
      version: def.version,
      filename: def.filename,
      contentHash,
      sizeBytes,
      expectedState: def.expected.state,
      readyForReview: def.expected.readyForReview,
      groundTruthPath: `ground-truth/${def.fixtureId}.json`,
      providerOutputPath: `provider-outputs/${def.fixtureId}.json`
    });
  }

  // Write manifest
  const manifestPath = join(__dirname, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: "qil_bench_manifest_v1",
        generatedAt: new Date().toISOString(),
        fixtureCount: manifest.length,
        fixtures: manifest
      },
      null,
      2
    ) + "\n"
  );
  console.log(`\n[corpus] manifest.json — ${manifest.length} fixtures`);

  // Verify unique IDs
  const ids = manifest.map((m) => m.fixtureId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error("Corpus has duplicate fixture IDs!");
  }

  // Verify filenames unique
  const filenames = manifest.map((m) => m.filename);
  const uniqueFilenames = new Set(filenames);
  if (uniqueFilenames.size !== filenames.length) {
    throw new Error("Corpus has duplicate filenames!");
  }

  console.log("\n[corpus] all checks passed ✓");
  console.log(`[corpus] ${manifest.length} fixtures written to fixtures/takeoff/benchmark/`);

  // Print hash summary
  console.log("\nHash summary:");
  for (const m of manifest) {
    console.log(`  ${m.fixtureId.padEnd(36)} ${m.contentHash} (${m.sizeBytes} bytes)`);
  }

  return manifest;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  generateCorpus();
}

export { generateCorpus };
