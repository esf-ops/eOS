/**
 * slabsmithImageStorage — Supabase Storage paths and JPEG validation for Slabsmith uploads.
 */

export const SLABSMITH_IMAGE_BUCKET = "eliteos-slab-images";
export const SLABSMITH_IMAGE_URL_PATTERN = "slabsmith_local_upload";
export const SLABSMITH_IMAGE_EXTERNAL_SOURCE = "slabsmith";

export const MAX_FULL_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_THUMB_IMAGE_BYTES = 2 * 1024 * 1024;

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * @param {string} segment
 */
export function sanitizeStorageSegment(segment) {
  const trimmed = String(segment ?? "").trim();
  if (!trimmed) return "unknown";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

/**
 * @param {{ organizationId: string, externalSlabId: string, slabId?: string|null }} params
 */
export function buildSlabsmithImageStoragePaths({ organizationId, externalSlabId, slabId }) {
  const folderKey = sanitizeStorageSegment(slabId || externalSlabId);
  const base = `org/${organizationId}/slabsmith/${folderKey}`;
  return {
    fullPath: `${base}/full.jpg`,
    thumbPath: `${base}/thumb.jpg`,
  };
}

/**
 * @param {Buffer} buffer
 */
export function isJpegBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return false;
  return buffer.subarray(0, 3).equals(JPEG_MAGIC);
}

/**
 * @param {Buffer} buffer
 * @param {number} maxBytes
 * @param {string} label
 */
export function validateImageBuffer(buffer, maxBytes, label) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(`${label} is empty`);
  }
  if (buffer.length > maxBytes) {
    throw new Error(`${label} exceeds max size (${buffer.length} > ${maxBytes} bytes)`);
  }
  if (!isJpegBuffer(buffer)) {
    throw new Error(`${label} must be a JPEG image`);
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} bucket
 * @param {string} path
 * @param {Buffer} buffer
 * @param {string} [contentType="image/jpeg"]
 */
export async function uploadPublicFile(db, bucket, path, buffer, contentType = "image/jpeg") {
  const { error } = await db.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(`Storage upload failed for ${path}: ${error.message}`);
  }
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return String(data?.publicUrl ?? "").trim() || null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} bucket
 * @param {string} path
 * @param {Buffer} buffer
 */
export async function uploadPublicJpeg(db, bucket, path, buffer) {
  return uploadPublicFile(db, bucket, path, buffer, "image/jpeg");
}
