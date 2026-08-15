/**
 * Chunked Moraware Foundation snapshot tests — synthetic fixtures only.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSnapshotFromSource } from "./generateTinySnapshot.js";
import { generateChunkedFoundationSnapshot } from "./generateChunkedFoundationSnapshot.js";
import {
  pickImportSecret,
  runMorawareSnapshotImport,
  validateChunkedManifest
} from "./importSnapshotToBrain.js";
import { BATCH_KEYS, CHUNKED_MANIFEST_FORMAT } from "./morawareSnapshotCanonical.js";
import { shouldRebuild } from "./runScheduledMorawarePipeline.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
let passed = 0;
let failed = 0;

function test(label, fn) {
  const result = Promise.resolve().then(fn);
  return result
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${label}`);
    })
    .catch((e) => {
      failed += 1;
      console.error(`  ✗ ${label}\n    ${e?.stack || e}`);
    });
}

function saveEnv(keys, fn) {
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
}

function makeJob(id, { fields = 3, activities = 2 } = {}) {
  return {
    jobId: String(id),
    job_name: `Job ${id}`,
    accountId: `acct-${id}`,
    accountName: `Account ${id}`,
    jobStatus: "In Production",
    processName: "Retail",
    forms: [
      {
        formId: `form-${id}`,
        formName: "Worksheet",
        fields: Array.from({ length: fields }, (_, i) => ({
          fieldId: `f${i}`,
          label: i === 0 ? "Sq.Ft." : `Field ${i}`,
          value: String(10 + i)
        }))
      }
    ],
    artifactPath: `jobs/${id}.json`
  };
}

function makeOperational(id, activities = 2) {
  return {
    jobId: String(id),
    activities: Array.from({ length: activities }, (_, i) => ({
      activityId: `${id}-act-${i}`,
      activityType: i === 0 ? "Template" : "Install",
      activityStatus: "Scheduled",
      startDate: "2026-03-01"
    }))
  };
}

async function writeFixture(dir, jobCount, { fields = 4, activities = 2 } = {}) {
  const jobsDir = path.join(dir, "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const index = [];
  for (let i = 1; i <= jobCount; i += 1) {
    const job = makeJob(i, { fields, activities });
    await fs.writeFile(path.join(jobsDir, `${i}.json`), JSON.stringify(job), "utf8");
    await fs.writeFile(path.join(jobsDir, `${i}.operational.json`), JSON.stringify(makeOperational(i, activities)), "utf8");
    index.push({ jobId: String(i), artifactPath: `jobs/${i}.json`, accountId: `acct-${i}`, accountName: `Account ${i}` });
  }
  const indexPath = path.join(jobsDir, "index.json");
  await fs.writeFile(indexPath, JSON.stringify(index), "utf8");
  return indexPath;
}

function rowIds(batches) {
  return Object.fromEntries(
    BATCH_KEYS.map((k) => [(k), (batches[k] || []).map((r) => r.source_record_id).sort()])
  );
}

async function concatChunks(chunkDir, manifest) {
  const merged = Object.fromEntries(BATCH_KEYS.map((k) => [k, []]));
  for (const chunk of manifest.chunks) {
    const json = JSON.parse(await fs.readFile(path.join(chunkDir, chunk.file), "utf8"));
    for (const k of BATCH_KEYS) merged[k].push(...(json.batches?.[k] || []));
  }
  return merged;
}

const ENV_KEYS = [
  "MORAWARE_SNAPSHOT_MODE",
  "MORAWARE_TINY_SOURCE_FILE",
  "MORAWARE_CHUNKED_OUTPUT_DIR",
  "MORAWARE_BASELINE_MAX_JOBS",
  "MORAWARE_BASELINE_MAX_ACTIVITIES",
  "MORAWARE_BASELINE_MAX_FORMS",
  "MORAWARE_BASELINE_MAX_FILES",
  "MORAWARE_BASELINE_MAX_ASSIGNEES",
  "MORAWARE_BASELINE_MAX_ACCOUNTS",
  "MORAWARE_IMPORT_MAX_PAYLOAD_BYTES",
  "MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK",
  "MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK",
  "MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK",
  "MORAWARE_IMPORT_MAX_FILES_PER_CHUNK",
  "MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK",
  "MORAWARE_IMPORT_DRY_RUN",
  "MORAWARE_IMPORT_CHUNKED",
  "MORAWARE_IMPORT_ALLOW_LARGE_BASELINE",
  "MORAWARE_SYNC_IMPORT_FILE",
  "MORAWARE_SYNC_IMPORT_SECRET",
  "EOS_CRON_SECRET",
  "MORAWARE_IMPORT_RESUME_GROUP_ID",
  "MORAWARE_IMPORT_START_CHUNK_INDEX",
  "MORAWARE_DEFAULT_ORGANIZATION_ID"
];

console.log("\nmoraware chunked foundation:");

await test("1. small fixture parity: legacy mapping vs chunked rows", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-parity-"));
  const indexPath = await writeFixture(dir, 2, { fields: 5, activities: 2 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_BASELINE_MAX_FILES = "250";
    process.env.MORAWARE_BASELINE_MAX_ASSIGNEES = "100";
    process.env.MORAWARE_IMPORT_MAX_PAYLOAD_BYTES = "3500000";
    const indexJson = JSON.parse(await fs.readFile(indexPath, "utf8"));
    const legacy = await buildSnapshotFromSource(indexPath, indexJson, new Map());
    const outDir = path.join(dir, "chunked");
    process.env.MORAWARE_TINY_SOURCE_FILE = indexPath;
    process.env.MORAWARE_CHUNKED_OUTPUT_DIR = outDir;
    await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const manifest = JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
    const merged = await concatChunks(outDir, manifest);
    assert.deepEqual(rowIds(merged), rowIds(legacy.batches));
    const fieldRows = merged.job_forms.length;
    assert.equal(fieldRows, 10, "2 jobs × 5 fields");
  });
});

await test("2-4. multiple size-aware chunks + aggregate counts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-chunks-"));
  const indexPath = await writeFixture(dir, 4, { fields: 8, activities: 3 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK = "5";
    process.env.MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK = "2";
    process.env.MORAWARE_IMPORT_MAX_PAYLOAD_BYTES = "8000";
    const outDir = path.join(dir, "chunked");
    const result = await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
    assert.ok(manifest.chunk_count >= 2, `expected multiple chunks, got ${manifest.chunk_count}`);
    assert.equal(manifest.format, CHUNKED_MANIFEST_FORMAT);
    const agg = Object.fromEntries(BATCH_KEYS.map((k) => [k, 0]));
    for (const c of manifest.chunks) {
      for (const k of BATCH_KEYS) agg[k] += Number(c.row_counts[k]) || 0;
      assert.ok(c.byte_size > 0);
      assert.ok(c.sha256);
    }
    assert.deepEqual(agg, manifest.totals);
    assert.equal(manifest.totals.job_forms, 32);
    assert.equal(manifest.totals.jobs, 4);
  });
});

await test("5. cap warnings remain blocking-shaped", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-cap-"));
  const indexPath = await writeFixture(dir, 3, { fields: 10, activities: 1 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "5";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    const outDir = path.join(dir, "chunked");
    const result = await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    assert.ok(result.warnings.some((w) => String(w).startsWith("job_forms reached cap 5")));
    assert.equal(result.counts.job_forms, 5);
  });
});

await test("6+7. dry-run performs no HTTP and reads chunks sequentially", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-dry-"));
  const indexPath = await writeFixture(dir, 3, { fields: 4, activities: 1 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK = "4";
    process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE = "1";
    const outDir = path.join(dir, "chunked");
    await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const postFn = async () => {
      throw new Error("HTTP should not run during dry-run");
    };
    process.env.MORAWARE_SYNC_IMPORT_FILE = path.join(outDir, "manifest.json");
    process.env.MORAWARE_IMPORT_DRY_RUN = "1";
    const result = await runMorawareSnapshotImport({ dryRun: true, postFn, file: path.join(outDir, "manifest.json") });
    assert.equal(result.httpRequests, 0);
    assert.equal(result.dryRun, true);
  });
});

await test("8. resume starts at requested chunk (HTTP only for remaining)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-resume-"));
  const indexPath = await writeFixture(dir, 4, { fields: 3, activities: 1 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK = "1";
    process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE = "1";
    const outDir = path.join(dir, "chunked");
    await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const posted = [];
    process.env.MORAWARE_IMPORT_RESUME_GROUP_ID = "resume-group-1";
    process.env.MORAWARE_IMPORT_START_CHUNK_INDEX = "3";
    await runMorawareSnapshotImport({
      dryRun: false,
      secret: "test-secret",
      file: path.join(outDir, "manifest.json"),
      url: "http://127.0.0.1/unused",
      postFn: async ({ body }) => {
        posted.push(body.metadata.chunk_index);
        return { ok: true, sync_run_id: `run-${body.metadata.chunk_index}` };
      }
    });
    assert.ok(posted.length >= 1);
    assert.ok(posted.every((idx) => idx >= 3));
    assert.equal(posted[0], 3);
  });
});

await test("9. malformed/missing chunk is rejected", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-miss-"));
  const indexPath = await writeFixture(dir, 2, { fields: 2, activities: 1 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE = "1";
    const outDir = path.join(dir, "chunked");
    await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const manifest = JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
    await fs.unlink(path.join(outDir, manifest.chunks[0].file));
    await assert.rejects(
      () =>
        runMorawareSnapshotImport({
          dryRun: true,
          file: path.join(outDir, "manifest.json")
        }),
      /Missing chunk file/
    );
  });
});

await test("10. count mismatch is rejected", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-mismatch-"));
  const indexPath = await writeFixture(dir, 2, { fields: 2, activities: 1 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE = "1";
    const outDir = path.join(dir, "chunked");
    await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const manifestPath = path.join(outDir, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.totals.jobs = 99;
    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await assert.rejects(
      () => runMorawareSnapshotImport({ dryRun: true, file: manifestPath }),
      /jobs count mismatch/
    );
  });
});

await test("11. checksum mismatch is rejected", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-sha-"));
  const indexPath = await writeFixture(dir, 2, { fields: 2, activities: 1 });
  await saveEnv(ENV_KEYS, async () => {
    process.env.MORAWARE_SNAPSHOT_MODE = "baseline";
    process.env.MORAWARE_BASELINE_MAX_JOBS = "50";
    process.env.MORAWARE_BASELINE_MAX_FORMS = "250";
    process.env.MORAWARE_BASELINE_MAX_ACTIVITIES = "250";
    process.env.MORAWARE_IMPORT_ALLOW_LARGE_BASELINE = "1";
    const outDir = path.join(dir, "chunked");
    await generateChunkedFoundationSnapshot({ sourceFile: indexPath, outDir });
    const manifest = JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
    const chunkPath = path.join(outDir, manifest.chunks[0].file);
    const json = JSON.parse(await fs.readFile(chunkPath, "utf8"));
    json.metadata = { ...(json.metadata || {}), tampered: true };
    await fs.writeFile(chunkPath, JSON.stringify(json), "utf8");
    await assert.rejects(
      () => runMorawareSnapshotImport({ dryRun: true, file: path.join(outDir, "manifest.json") }),
      /Checksum mismatch/
    );
  });
});

await test("12. secret fallback: MORAWARE_SYNC_IMPORT_SECRET then EOS_CRON_SECRET", async () => {
  await saveEnv(["MORAWARE_SYNC_IMPORT_SECRET", "EOS_CRON_SECRET"], async () => {
    assert.equal(pickImportSecret({ dryRun: true }), "");
    delete process.env.MORAWARE_SYNC_IMPORT_SECRET;
    delete process.env.EOS_CRON_SECRET;
    assert.throws(() => pickImportSecret({ dryRun: false }), /MORAWARE_SYNC_IMPORT_SECRET or EOS_CRON_SECRET/);
    process.env.EOS_CRON_SECRET = "cron-only";
    assert.equal(pickImportSecret({ dryRun: false }), "cron-only");
    process.env.MORAWARE_SYNC_IMPORT_SECRET = "import-first";
    assert.equal(pickImportSecret({ dryRun: false }), "import-first");
    const importerSrc = await fs.readFile(new URL("./importSnapshotToBrain.js", import.meta.url), "utf8");
    assert.equal(importerSrc.includes("redact(secret)"), false);
    assert.equal(importerSrc.includes("secret_configured"), true);
  });
});

await test("memory safety: chunked generator never stringifies a full batches object", async () => {
  const gen = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "generateChunkedFoundationSnapshot.js"), "utf8");
  assert.equal(gen.includes("JSON.stringify(body"), false);
  assert.equal(gen.includes("for (const row of indexRows)"), true);
  assert.equal(gen.includes("await writer.addRow"), true);
  assert.equal(gen.includes("JSON.stringify(payload)"), true, "per-chunk stringify only");
  const imp = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "importSnapshotToBrain.js"), "utf8");
  assert.match(imp, /for \(const chunkMeta of manifest\.chunks\)/);
});

await test("14. dry-run never rebuilds prepared facts", () => {
  assert.equal(shouldRebuild({ pipelineDryRun: true, importOk: true }), false);
});

await test("validateChunkedManifest rejects bad format", () => {
  assert.throws(() => validateChunkedManifest({ chunks: [] }), /Not a Moraware chunked foundation manifest/);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
