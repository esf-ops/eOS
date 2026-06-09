/**
 * image-upload.test.mjs — unit tests for Slabsmith image upload planner/state.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildUploadFingerprint,
  isLocalFileMissingError,
  isUnchangedUpload,
  isUploadablePair,
  loadUploadState,
  planImageUploads,
  readImagePairBuffers,
  runImageUploads,
  saveUploadState,
  uploadImagePair,
} from "./image-upload.mjs";
import { buildMultipartUploadBody } from "./image-upload.mjs";
import { discoverImageManifest } from "./image-manifest.mjs";
import { runImageManifest } from "./sync-images.mjs";

const SAMPLE_MANIFEST = {
  summary: {
    missing_full_image_count: 5,
    unmatched_image_file_count: 2,
  },
  slabs: [
    {
      slab_id: "ABC-123",
      inventory_id: "54198",
      full_image: {
        path: "/tmp/ABC-123.jpg",
        bytes: 100,
        modified_at: "2026-01-01T00:00:00.000Z",
      },
      thumb_image: {
        path: "/tmp/ABC-123_thumb.jpg",
        bytes: 50,
        modified_at: "2026-01-01T00:00:00.000Z",
      },
    },
    {
      slab_id: "DEF-456",
      inventory_id: "53037",
      full_image: null,
      thumb_image: null,
    },
    {
      slab_id: "GHI-789",
      inventory_id: "53038",
      full_image: {
        path: "/tmp/GHI-789.jpg",
        bytes: 200,
        modified_at: "2026-01-02T00:00:00.000Z",
      },
      thumb_image: {
        path: "/tmp/GHI-789_thumb.jpg",
        bytes: 80,
        modified_at: "2026-01-02T00:00:00.000Z",
      },
    },
  ],
};

describe("isUploadablePair", () => {
  it("requires full and thumb images", () => {
    assert.equal(isUploadablePair(SAMPLE_MANIFEST.slabs[0]), true);
    assert.equal(isUploadablePair(SAMPLE_MANIFEST.slabs[1]), false);
  });
});

describe("planImageUploads", () => {
  it("plans only matched pairs and respects limit", () => {
    const plan = planImageUploads(SAMPLE_MANIFEST, null, { limit: 1 });
    assert.equal(plan.planned_upload_count, 1);
    assert.equal(plan.missing_image_count, 5);
    assert.equal(plan.unmatched_image_count, 2);
    assert.equal(plan.uploadable[0].slab_id, "ABC-123");
  });

  it("skips unchanged fingerprints from state", () => {
    const fp = buildUploadFingerprint(SAMPLE_MANIFEST.slabs[0]);
    const state = {
      version: 1,
      uploads: {
        "abc-123": { ...fp, last_status: "uploaded" },
      },
    };
    const plan = planImageUploads(SAMPLE_MANIFEST, state);
    assert.equal(plan.planned_upload_count, 1);
    assert.equal(plan.skipped_unchanged_count, 1);
    assert.equal(plan.uploadable[0].slab_id, "GHI-789");
  });

  it("filters by slab id", () => {
    const plan = planImageUploads(SAMPLE_MANIFEST, null, { slabIdFilter: "GHI-789" });
    assert.equal(plan.planned_upload_count, 1);
    assert.equal(plan.uploadable[0].slab_id, "GHI-789");
  });
});

describe("isUnchangedUpload", () => {
  it("detects matching file metadata", () => {
    const fp = buildUploadFingerprint(SAMPLE_MANIFEST.slabs[0]);
    assert.equal(isUnchangedUpload({ ...fp, last_status: "uploaded" }, fp), true);
    assert.equal(
      isUnchangedUpload({ ...fp, last_status: "uploaded", full_bytes: 999 }, fp),
      false
    );
  });
});

describe("upload state file", () => {
  it("loads and saves state under logDir", () => {
    const logDir = mkdtempSync(join(tmpdir(), "slabsmith-upload-state-"));
    const state = { version: 1, uploads: { "abc-123": { last_status: "uploaded" } } };
    saveUploadState(logDir, state);
    const loaded = loadUploadState(logDir);
    assert.equal(loaded.uploads["abc-123"].last_status, "uploaded");
  });
});

describe("isLocalFileMissingError", () => {
  it("detects ENOENT errors", () => {
    const err = new Error("ENOENT: no such file or directory, open '/tmp/missing.jpg'");
    err.code = "ENOENT";
    assert.equal(isLocalFileMissingError(err), true);
    assert.equal(isLocalFileMissingError(new Error("Invalid sync token")), false);
  });
});

describe("readImagePairBuffers", () => {
  it("returns missing_local when full image disappeared", () => {
    const slab = SAMPLE_MANIFEST.slabs[0];
    const result = readImagePairBuffers(slab, () => {
      const err = new Error(`ENOENT: no such file or directory, open '${slab.full_image.path}'`);
      err.code = "ENOENT";
      throw err;
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing_local");
    assert.equal(result.missing_kind, "full");
  });
});

describe("runImageUploads", () => {
  it("dry-run does not call backend", async () => {
    let calls = 0;
    const plan = planImageUploads(SAMPLE_MANIFEST, null);
    const summary = await runImageUploads({
      plan,
      backendBaseUrl: "https://example.com",
      syncToken: "secret",
      logDir: "",
      state: { version: 1, uploads: {} },
      dryRun: true,
      uploadPair: async () => {
        calls += 1;
        return { status: 200, body: { ok: true } };
      },
    });
    assert.equal(calls, 0);
    assert.equal(summary.uploaded_count, 0);
    assert.equal(summary.planned_upload_count, 2);
  });

  it("uploads and records state", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "slabsmith-upload-run-"));
    const plan = planImageUploads(SAMPLE_MANIFEST, null, { limit: 1 });
    const summary = await runImageUploads({
      plan,
      backendBaseUrl: "https://example.com",
      syncToken: "secret",
      logDir,
      state: { version: 1, uploads: {} },
      dryRun: false,
      uploadPair: async () => ({
        status: 200,
        body: { ok: true, status: "uploaded" },
      }),
    });
    assert.equal(summary.uploaded_count, 1);
    const loaded = loadUploadState(logDir);
    assert.equal(loaded.uploads["abc-123"].last_status, "uploaded");
  });

  it("skips ENOENT as non-fatal production churn without updating upload state", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "slabsmith-upload-missing-"));
    const imageRoot = join(logDir, "images");
    mkdirSync(imageRoot);

    const fullPath = join(imageRoot, "ABC-123.jpg");
    const thumbPath = join(imageRoot, "ABC-123_thumb.jpg");
    writeFileSync(fullPath, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    writeFileSync(thumbPath, Buffer.from([0xff, 0xd8, 0xff, 0x01]));

    const manifest = {
      summary: { missing_full_image_count: 0, unmatched_image_file_count: 0 },
      slabs: [
        {
          slab_id: "ABC-123",
          inventory_id: "54198",
          full_image: {
            path: fullPath,
            bytes: 4,
            modified_at: "2026-01-01T00:00:00.000Z",
          },
          thumb_image: {
            path: thumbPath,
            bytes: 4,
            modified_at: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    };

    const plan = planImageUploads(manifest, null);
    assert.equal(plan.planned_upload_count, 1);

    unlinkSync(fullPath);

    const summary = await runImageUploads({
      plan,
      backendBaseUrl: "https://example.com",
      syncToken: "secret",
      logDir,
      state: { version: 1, uploads: {} },
      dryRun: false,
      uploadPair: async (params) => uploadImagePair(params),
    });

    assert.equal(summary.skipped_missing_during_upload_count, 1);
    assert.equal(summary.failed_count, 0);
    assert.equal(summary.uploaded_count, 0);
    const loadedMissing = loadUploadState(logDir);
    assert.equal(loadedMissing.uploads["abc-123"], undefined);
  });

  it("exits cleanly when only missing-local skips occur via runImageManifest", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "slabsmith-upload-exit-"));
    const imageRoot = join(tmpDir, "images");
    const logDir = join(tmpDir, "logs");
    mkdirSync(imageRoot);
    mkdirSync(logDir);

    const xmlPath = join(tmpDir, "slabs.xml");
    writeFileSync(
      xmlPath,
      `<Slabsmith.dbo.Slabs SlabID="ABC-123" InventoryID="54198" Name="Alpha" Material="Quartz" Type="Slab" />`
    );

    const fullPath = join(imageRoot, "ABC-123.jpg");
    const thumbPath = join(imageRoot, "ABC-123_thumb.jpg");
    writeFileSync(fullPath, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    writeFileSync(thumbPath, Buffer.from([0xff, 0xd8, 0xff, 0x01]));

    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        backendBaseUrl: "https://example.com",
        syncToken: "test-secret",
        sourceXmlPath: xmlPath,
        imageRootPath: imageRoot,
        logDir,
      })
    );

    const code = await runImageManifest(
      ["node", "sync-images.mjs", "--config", configPath, "--upload"],
      {
        discoverImageManifest: (params) => {
          const manifest = discoverImageManifest(params);
          try {
            unlinkSync(fullPath);
          } catch {
            // already removed
          }
          return manifest;
        },
        uploadImagePair: async (params) => uploadImagePair(params),
      }
    );
    assert.equal(code, 0);
  });
});

describe("buildMultipartUploadBody", () => {
  it("builds multipart with metadata fields", () => {
    const slab = SAMPLE_MANIFEST.slabs[0];
    const body = buildMultipartUploadBody({
      slab,
      fullBuffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      thumbBuffer: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
    });
    const text = body.body.toString("latin1");
    assert.match(text, /name="slab_id"/);
    assert.match(text, /name="inventory_id"/);
    assert.match(text, /filename="full.jpg"/);
    assert.match(text, /filename="thumb.jpg"/);
    assert.match(body.contentType, /multipart\/form-data/);
  });
});

describe("runImageManifest plan-upload", () => {
  it("prints upload plan without posting", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "slabsmith-plan-upload-"));
    const imageRoot = join(tmpDir, "images");
    const logDir = join(tmpDir, "logs");
    mkdirSync(imageRoot);
    mkdirSync(logDir);

    const xmlPath = join(tmpDir, "slabs.xml");
    writeFileSync(
      xmlPath,
      `<Slabsmith.dbo.Slabs SlabID="ABC-123" InventoryID="54198" Name="Alpha" Material="Quartz" Type="Slab" />`
    );
    writeFileSync(join(imageRoot, "ABC-123.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    writeFileSync(join(imageRoot, "ABC-123_thumb.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0x01]));

    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        backendBaseUrl: "https://example.com",
        syncToken: "test-secret",
        sourceXmlPath: xmlPath,
        imageRootPath: imageRoot,
        logDir,
      })
    );

    const code = await runImageManifest(
      ["node", "sync-images.mjs", "--config", configPath, "--plan-upload"],
      {
        uploadImagePair: async () => {
          throw new Error("should not upload in plan mode");
        },
      }
    );
    assert.equal(code, 0);
  });
});

console.log("image-upload.test.mjs: all tests passed");
