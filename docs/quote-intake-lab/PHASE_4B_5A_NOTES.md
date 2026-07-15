# Phase 4B.5A — Offline Synthetic Takeoff Benchmark Corpus

## Overview

Phase 4B.5A creates a deterministic, offline-only benchmark corpus and harness for the QIL takeoff validation pipeline. All PDFs are synthetically generated (no real customer plans). No Gemini, no network, no live allowlist changes.

## Architecture

### Files Created

| File | Purpose |
|------|---------|
| `fixtures/takeoff/benchmark/pdfKit.mjs` | Reusable PDF-1.4 helpers (escaped text, content stream, assembly, sha256) |
| `fixtures/takeoff/benchmark/caseDefinitions.mjs` | 8 frozen case definitions with geometry, provider outputs, and expected values |
| `fixtures/takeoff/benchmark/generateBenchmarkCorpus.mjs` | CLI that writes PDFs, ground-truth JSON, provider-output JSON, manifest |
| `src/takeoff/benchmark/runOfflineBenchmark.mjs` | Benchmark harness — validates all 8 fixtures offline, returns structured report |
| `src/takeoff/phase4b5a.test.mjs` | 40 tests covering corpus, harness, safety gates, allowlist integrity |

### Generated Corpus (fixtures/takeoff/benchmark/)

```
pdfs/                       — 8 synthetic PDFs (PDF 1.4, Helvetica text, no JS/forms/links)
ground-truth/               — 8 JSON files (schemaVersion: qil_bench_ground_truth_v1)
provider-outputs/           — 8 JSON files (inventory + evidence + geometry raw shapes)
manifest.json               — fixture registry (schemaVersion: qil_bench_manifest_v1)
```

## The 8 Benchmark Cases

| ID | Description | Expected State | CT SF | BS SF | FHB SF | Sinks |
|----|-------------|----------------|-------|-------|--------|-------|
| `qil-bench-straight` | Single straight run 120×25.5, 1 sink, no_stone | `qil_takeoff_review` | 21.25 | 0 | 0 | 1 |
| `qil-bench-l-shape` | Two pieces: Leg A 96×25.5 + Leg B 84×25.5 (NOT bounding box 56 SF) | `qil_takeoff_review` | 31.88 | 0 | 0 | 0 |
| `qil-bench-kitchen-island` | Reuses verified `qil-synth-kitchen-island-plan.pdf` bytes | `qil_takeoff_review` | 39.25 | 3.33 | 0 | 1 |
| `qil-bench-multi-room` | Kitchen 120×25.5 + Bath 60×22, 2 sinks | `qil_takeoff_review` | 30.42 | 0 | 0 | 2 |
| `qil-bench-fhb` | Counter 60×25.5 + FHB panel 60×48, no standard splash | `qil_takeoff_review` | 10.63 | 0 | 20.00 | 0 |
| `qil-bench-missing-dim` | Piece length 90, depth null → MISSING_DIMENSION | `qil_takeoff_manual_review` | 0 | 0 | 0 | 0 |
| `qil-bench-conflict` | 100×25.5=17.71 SF but stated total 50 → CONFLICTING_DIMENSION | `qil_takeoff_manual_review` | 17.71 | 0 | 0 | 0 |
| `qil-bench-irregular` | Curved cove → UNSUPPORTED_GEOMETRY approval_blocking | `qil_takeoff_manual_review` | 18.00 | 0 | 0 | 0 |

## PDF Hashes (after generation)

```
qil-bench-straight          85548a59b49ee2dcea30d6136e1513fa1c48532adc5855d765ff9176f9ca045c (1556 bytes)
qil-bench-l-shape           e40aa408b1026cfa1bc48945cd6273ebfb4094bad5fa693e9226f677416e869a (1825 bytes)
qil-bench-kitchen-island    0833ca1afd77665f24590158535e90b60b6e78d3e176de6a34a336d97deae9cb (2272 bytes)
qil-bench-multi-room        cb2b53c765436b254bdd186f95806dec81d8e59105b2a5b7ff5c7b09ed93e694 (1769 bytes)
qil-bench-fhb               4638dc3d4c69f72b363dec090769ec3672a7bbd6f56d37f2512c8decef98391e (1759 bytes)
qil-bench-missing-dim       2c2ef3effe054bf88ee8aa6e0c8c2ef90b032c91f1e58d37050038f3fdf73a3b (1384 bytes)
qil-bench-conflict          8859e556ce5089fd16ff45fc0663c30c6d4ccd9e3809923d2b2fe5cf446c5413 (1644 bytes)
qil-bench-irregular         20cf390b374a0eb81febd9c3e6772cf6db06c3517866e14d232abd09fdfbae2d (1505 bytes)
```

`qil-bench-kitchen-island` hash equals the approved synthetic live fixture hash — the PDF bytes were copied verbatim from `fixtures/takeoff/qil-synth-kitchen-island-plan.pdf`.

## Benchmark Harness — `runOfflineBenchmark`

```js
import { runOfflineBenchmark } from "./src/takeoff/benchmark/runOfflineBenchmark.mjs";
const report = await runOfflineBenchmark({ rootDir });
// { results: [...], aggregate: {...}, ok: boolean }
```

For each fixture the harness:

1. Reads PDF bytes; verifies size, SHA-256, and `%PDF-` header
2. Loads ground-truth JSON; asserts hash match
3. Loads provider output JSON (inventory / evidence / geometry)
4. Calls `validateInventoryPass` → `validateEvidencePass` → `validateGeometryPass`
5. Calls `applyDeterministicMeasurements(rooms, providerTotals)` (authoritative calc)
6. Builds a `TakeoffRun` with `provider.mode = "simulated"` + overridden evidence `simulatedNote`
7. Calls `validateLabTakeoffRun`; applies forceManual logic (mirrors live pipeline)
8. Compares all results to ground truth with `toleranceSf = 0.05`

### Safety Gate

If `readyForReview = false` in ground truth but the harness resolves `qil_takeoff_review`, the fixture is reported as a **CRITICAL SAFETY FAILURE** and the benchmark exits 1.

### No Network

The harness never calls `fetch`. A test stubs `globalThis.fetch` to throw and confirms the benchmark still passes.

## Offline Confirmation

- `syntheticLiveAllowlist.mjs` — **not modified**. Still contains exactly 1 hash.
- No new hashes were added to `APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES`.
- Benchmark PDFs use `example.com` identities only; no real customer data.
- All fixtures contain the banner: `SYNTHETIC QUOTE INTAKE LAB FIXTURE — NOT A REAL CUSTOMER PLAN`

## NPM Scripts

```
npm run generate-benchmark-corpus     # (re)generate corpus from caseDefinitions.mjs
npm run benchmark:takeoff:offline     # run harness; exits 1 if any failure
npm test                              # includes phase4b5a.test.mjs (40 new tests)
```

## Test Results (Phase 4B.5A)

- 40 new tests in `src/takeoff/phase4b5a.test.mjs`
- Full suite: **232 tests, 0 failures**

## Phase 4B.5B Future Scope (paid-live synthetic benchmark)

Phase 4B.5B (explicitly approved, paid) can later run **selected existing synthetic benchmark fixtures** through Gemini — not the full corpus by default, and **not** real customer plans.

Suggested order:

1. Start with `qil-bench-kitchen-island` (already live-allowlisted; known ground truth: 39.25 / 3.33 / 42.58 / 1 sink).
2. Optionally add a small subset of ready-for-review cases (`straight`, `l-shape`, `fhb`) if cost and operator approval allow.
3. Keep incomplete/blocker cases (`missing-dim`, `conflict`, `irregular`) as offline-only unless a dedicated refusal/manual-review live check is approved.
4. Compare live Gemini inventory/evidence/geometry against committed offline provider outputs and ground truth via the same harness path (deterministic calc + validation remain authoritative).
5. Expand the live allowlist only one hash at a time, with the same safety gates as 4B.4B.

**Real customer plans remain prohibited** until a later explicitly approved phase with redaction review and legal sign-off. All current fixture IDs begin with `qil-bench-` and use `example.com` identities exclusively.
