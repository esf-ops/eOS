/**
 * slabsmithImageUploadApi — unit tests (mock Supabase/storage, no network).
 * Run: npm run eos:test:slabsmith-image-upload
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMultipartForm } from "./multipartParse.mjs";
import {
  buildSlabImageUpsertRow,
  findSlabsmithInventoryRow,
  ingestSlabsmithImagePair,
  parseImageUploadFields,
  sanitizeImageUploadResponse,
  validateImageUploadIdentity,
} from "./slabsmithImageUploadApi.js";
import {
  buildSlabsmithImageStoragePaths,
  isJpegBuffer,
  SLABSMITH_IMAGE_URL_PATTERN,
} from "./slabsmithImageStorage.mjs";

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);

function buildMultipart({ fields = {}, files = {} }) {
  const boundary = "----eos-test-boundary";
  /** @type {Buffer[]} */
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }
  for (const [name, file] of Object.entries(files)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
    ));
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function mockDb({ inventoryRow = null, upsertError = null } = {}) {
  const upserts = [];
  return {
    upserts,
    from(table) {
      if (table === "slab_inventory") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: inventoryRow, error: null });
          },
        };
      }
      if (table === "slab_images") {
        return {
          upsert(row, opts) {
            upserts.push({ row, opts });
            return Promise.resolve({ error: upsertError });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("parseImageUploadFields", () => {
  it("reads slab and inventory ids", () => {
    const parsed = parseImageUploadFields({
      slab_id: "abc-123",
      inventory_id: "54198",
      full_modified_at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(parsed.slabId, "abc-123");
    assert.equal(parsed.inventoryId, "54198");
  });
});

describe("validateImageUploadIdentity", () => {
  it("requires at least one identifier", () => {
    assert.equal(validateImageUploadIdentity({}).ok, false);
    assert.equal(validateImageUploadIdentity({ inventoryId: "54198" }).ok, true);
  });
});

describe("parseMultipartForm", () => {
  it("parses fields and jpeg files", () => {
    const { body, contentType } = buildMultipart({
      fields: { slab_id: "S1", inventory_id: "INV-1" },
      files: {
        full_image: { filename: "full.jpg", buffer: JPEG },
        thumb_image: { filename: "thumb.jpg", buffer: JPEG },
      },
    });
    const parsed = parseMultipartForm(body, contentType);
    assert.equal(parsed.fields.slab_id, "S1");
    assert.equal(parsed.files.full_image.buffer.length, JPEG.length);
    assert.ok(isJpegBuffer(parsed.files.full_image.buffer));
  });
});

describe("buildSlabImageUpsertRow", () => {
  it("uses slabsmith_local_upload pattern and ok status", () => {
    const row = buildSlabImageUpsertRow({
      organizationId: ORG_ID,
      externalSlabId: "54198",
      imageUrl: "https://example.com/full.jpg",
      thumbnailUrl: "https://example.com/thumb.jpg",
      now: () => "2026-01-01T00:00:00.000Z",
    });
    assert.equal(row.image_url_pattern, SLABSMITH_IMAGE_URL_PATTERN);
    assert.equal(row.image_status, "ok");
    assert.equal(row.external_slab_id, "54198");
  });
});

describe("ingestSlabsmithImagePair", () => {
  it("skips safely when inventory row is missing", async () => {
    const db = mockDb({ inventoryRow: null });
    const result = await ingestSlabsmithImagePair({
      db,
      organizationId: ORG_ID,
      fields: { slab_id: "missing", inventory_id: "99999" },
      files: {
        full_image: { buffer: JPEG },
        thumb_image: { buffer: JPEG },
      },
    });
    assert.equal(result.status, "skipped_no_inventory_match");
    assert.equal(result.ok, true);
    assert.equal(db.upserts.length, 0);
  });

  it("uploads and upserts when inventory row exists", async () => {
    const db = mockDb({
      inventoryRow: {
        id: "inv-uuid",
        external_slab_id: "54198",
        inventory_id: "54198",
      },
    });
    const uploads = [];
    const result = await ingestSlabsmithImagePair({
      db,
      organizationId: ORG_ID,
      fields: {
        slab_id: "3c179475-5052-4b0d-ae38-9f154bf5daf6",
        inventory_id: "54198",
      },
      files: {
        full_image: { buffer: JPEG },
        thumb_image: { buffer: JPEG },
      },
      uploadFn: async (_db, bucket, path, buffer) => {
        uploads.push({ bucket, path, size: buffer.length });
        return `https://cdn.example/${path}`;
      },
    });
    assert.equal(result.status, "uploaded");
    assert.equal(result.external_slab_id, "54198");
    assert.equal(uploads.length, 2);
    assert.equal(db.upserts.length, 1);
    assert.equal(db.upserts[0].row.image_url_pattern, SLABSMITH_IMAGE_URL_PATTERN);
  });
});

describe("sanitizeImageUploadResponse", () => {
  it("rejects secret-like payloads", () => {
    assert.throws(() =>
      sanitizeImageUploadResponse({ ok: true, token: "SUPABASE_SERVICE_ROLE_KEY" })
    );
  });
});

describe("buildSlabsmithImageStoragePaths", () => {
  it("scopes storage under org and slabsmith folder", () => {
    const paths = buildSlabsmithImageStoragePaths({
      organizationId: ORG_ID,
      externalSlabId: "21936-1",
      slabId: "uuid-slab",
    });
    assert.match(paths.fullPath, new RegExp(`^org/${ORG_ID}/slabsmith/`));
    assert.ok(paths.fullPath.endsWith("/full.jpg"));
  });
});

console.log("slabsmithImageUploadApi.test.mjs: all tests passed");
