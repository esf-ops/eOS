/**
 * image-manifest.test.mjs — unit tests for Slabsmith image discovery (no network).
 * Run: npm run eos:test:slabsmith-connector
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  classifyJpgFileName,
  discoverImageManifest,
  parseSlabRecordsFromXml,
  summarizeImageManifest,
} from "./image-manifest.mjs";
import { runImageManifest } from "./sync-images.mjs";

const TEST_XML = `<Slabsmith.dbo.Slabs SlabID="ABC-123" InventoryID="INV-1" Name="Alpha Slab" Material="Quartz" Type="Slab" Rack="A-01" Lot="LOT-1" Bundle="B-9" />
<Slabsmith.dbo.Slabs SlabID="DEF-456" InventoryID="INV-2" Name="Beta Slab" Material="Granite" Type="Slab" Rack="B-02" Lot="LOT-2" />
<Slabsmith.dbo.Slabs SlabID="GHI-789" InventoryID="INV-3" Name="Gamma Slab" Material="Marble" Type="Remnant" />`;

describe("classifyJpgFileName", () => {
  it("classifies full and thumb jpgs", () => {
    assert.deepEqual(classifyJpgFileName("ABC-123.jpg"), {
      kind: "full",
      stem: "ABC-123",
      fileName: "ABC-123.jpg",
    });
    assert.deepEqual(classifyJpgFileName("ABC-123_thumb.jpg"), {
      kind: "thumb",
      stem: "ABC-123",
      fileName: "ABC-123_thumb.jpg",
    });
    assert.equal(classifyJpgFileName("notes.txt"), null);
  });
});

describe("parseSlabRecordsFromXml", () => {
  it("extracts SlabID and helpful fields", () => {
    const rows = parseSlabRecordsFromXml(TEST_XML);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].SlabID, "ABC-123");
    assert.equal(rows[0].InventoryID, "INV-1");
    assert.equal(rows[0].Bundle, "B-9");
    assert.equal(rows[1].Lot, "LOT-2");
  });
});

describe("discoverImageManifest", () => {
  it("pairs images case-insensitively and reports unmatched files", () => {
    const imageRoot = mkdtempSync(join(tmpdir(), "slabsmith-images-"));
    writeFileSync(join(imageRoot, "abc-123.jpg"), "full");
    writeFileSync(join(imageRoot, "ABC-123_thumb.jpg"), "thumb");
    writeFileSync(join(imageRoot, "UNMATCHED.jpg"), "orphan");

    const syncDir = join(imageRoot, "sync");
    mkdirSync(syncDir);
    writeFileSync(join(syncDir, "IGNORED.jpg"), "ignored");

    const manifest = discoverImageManifest({
      xml: TEST_XML,
      sourceXmlPath: "/tmp/slabs.xml",
      imageRootPath: imageRoot,
    });

    assert.equal(manifest.summary.xml_slab_count, 3);
    assert.equal(manifest.summary.full_image_count, 2);
    assert.equal(manifest.summary.thumb_image_count, 1);
    assert.equal(manifest.summary.matched_slab_image_count, 1);
    assert.equal(manifest.summary.matched_full_and_thumb_count, 1);
    assert.equal(manifest.summary.missing_full_image_count, 2);
    assert.equal(manifest.summary.missing_thumb_image_count, 2);
    assert.equal(manifest.summary.unmatched_image_file_count, 1);
    assert.deepEqual(manifest.summary.sample_unmatched_images, [
      { file_name: "UNMATCHED.jpg", kind: "full" },
    ]);

    const alpha = manifest.slabs.find((s) => s.slab_id === "ABC-123");
    assert.ok(alpha.full_image);
    assert.ok(alpha.thumb_image);
    assert.equal(alpha.bundle, "B-9");
  });
});

describe("summarizeImageManifest", () => {
  it("limits sample lists to 10 entries", () => {
    const slabs = Array.from({ length: 12 }, (_, i) => ({
      slab_id: `S-${i}`,
      inventory_id: null,
      name: null,
      full_image: null,
      thumb_image: null,
    }));
    const summary = summarizeImageManifest(slabs, [], {
      fullByStem: new Map(),
      thumbByStem: new Map(),
    });
    assert.equal(summary.sample_missing_full_images.length, 10);
    assert.equal(summary.sample_missing_thumb_images.length, 10);
  });
});

describe("runImageManifest integration", () => {
  it("writes manifest json under logDir", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "slabsmith-manifest-run-"));
    const imageRoot = join(tmpDir, "images");
    const logDir = join(tmpDir, "logs");
    mkdirSync(imageRoot);
    mkdirSync(logDir);

    const xmlPath = join(tmpDir, "slabs.xml");
    writeFileSync(xmlPath, TEST_XML);
    writeFileSync(join(imageRoot, "ABC-123.jpg"), "full");
    writeFileSync(join(imageRoot, "ABC-123_thumb.jpg"), "thumb");

    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        sourceXmlPath: xmlPath,
        imageRootPath: imageRoot,
        logDir,
      })
    );

    const code = await runImageManifest(["node", "sync-images.mjs", "--config", configPath]);
    assert.equal(code, 0);

    const { readdirSync } = await import("node:fs");
    const artifacts = readdirSync(logDir).filter((name) => name.startsWith("image-manifest-"));
    assert.equal(artifacts.length, 1);

    const written = JSON.parse(
      (await import("node:fs")).readFileSync(join(logDir, artifacts[0]), "utf8")
    );
    assert.equal(written.summary.matched_full_and_thumb_count, 1);
    assert.equal(written.image_root_path, imageRoot);
  });
});

console.log("image-manifest.test.mjs: all tests passed");
