/**
 * slabsmithImageUploadApi — Windows connector Slabsmith image upload (v1).
 *
 * POST /api/integrations/slabsmith/inventory/images
 *
 * SECURITY:
 *   - X-EliteOS-Slabsmith-Sync-Token (same as XML ingest).
 *   - Service role stays server-side.
 *   - Sanitized JSON responses only.
 *
 * STORAGE:
 *   - Supabase Storage bucket eliteos-slab-images (public read URLs in slab_images).
 *   - Upserts slab_images with image_url_pattern = slabsmith_local_upload.
 */

import express from "express";

import { parseMultipartForm } from "./multipartParse.mjs";
import {
  buildSlabsmithImageStoragePaths,
  MAX_FULL_IMAGE_BYTES,
  MAX_THUMB_IMAGE_BYTES,
  SLABSMITH_IMAGE_BUCKET,
  SLABSMITH_IMAGE_EXTERNAL_SOURCE,
  SLABSMITH_IMAGE_URL_PATTERN,
  uploadPublicJpeg,
  validateImageBuffer,
} from "./slabsmithImageStorage.mjs";
import {
  readSlabsmithSyncToken,
  resolveSlabsmithSyncOrganizationId,
  SLABSMITH_SYNC_TOKEN_HEADER,
  validateIngestServerEnv,
  validateSlabsmithSyncToken,
} from "./slabsmithIngestApi.js";

export const SLABSMITH_IMAGE_UPLOAD_ROUTE = "/api/integrations/slabsmith/inventory/images";
export const TABLE_SLAB_IMAGES = "slab_images";
export const TABLE_INVENTORY = "slab_inventory";
export const SLAB_IMAGES_CONFLICT_KEY =
  "organization_id,external_source,external_slab_id,image_url_pattern";

const MAX_MULTIPART_BYTES = MAX_FULL_IMAGE_BYTES + MAX_THUMB_IMAGE_BYTES + 64 * 1024;

/**
 * @param {Record<string, string>} fields
 */
export function parseImageUploadFields(fields) {
  return {
    slabId: String(fields.slab_id ?? fields.SlabID ?? "").trim(),
    inventoryId: String(fields.inventory_id ?? fields.InventoryID ?? "").trim() || null,
    fullModifiedAt: String(fields.full_modified_at ?? "").trim() || null,
    thumbModifiedAt: String(fields.thumb_modified_at ?? "").trim() || null,
    fullBytes: Number(fields.full_bytes ?? 0) || null,
    thumbBytes: Number(fields.thumb_bytes ?? 0) || null,
  };
}

/**
 * @param {{ slabId?: string|null, inventoryId?: string|null }} params
 */
export function validateImageUploadIdentity({ slabId, inventoryId }) {
  if (!slabId && !inventoryId) {
    return { ok: false, error: "slab_id or inventory_id is required" };
  }
  return { ok: true };
}

/**
 * Find slabsmith inventory row by inventory_id / external_slab_id.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {{ slabId?: string|null, inventoryId?: string|null }} identity
 */
export async function findSlabsmithInventoryRow(db, organizationId, { slabId, inventoryId }) {
  const base = () =>
    db
      .from(TABLE_INVENTORY)
      .select("id,external_slab_id,inventory_id")
      .eq("organization_id", organizationId)
      .eq("external_source", SLABSMITH_IMAGE_EXTERNAL_SOURCE);

  if (inventoryId) {
    const byExternal = await base().eq("external_slab_id", inventoryId).maybeSingle();
    if (byExternal.data) return byExternal.data;
    if (byExternal.error) throw new Error(byExternal.error.message);

    const byInventoryCol = await base().eq("inventory_id", inventoryId).maybeSingle();
    if (byInventoryCol.data) return byInventoryCol.data;
    if (byInventoryCol.error) throw new Error(byInventoryCol.error.message);
  }

  if (slabId) {
    const bySlabAsExternal = await base().eq("external_slab_id", slabId).maybeSingle();
    if (bySlabAsExternal.data) return bySlabAsExternal.data;
    if (bySlabAsExternal.error) throw new Error(bySlabAsExternal.error.message);
  }

  return null;
}

/**
 * @param {object} params
 */
export function buildSlabImageUpsertRow({
  organizationId,
  externalSlabId,
  imageUrl,
  thumbnailUrl,
  now = () => new Date().toISOString(),
}) {
  const ts = now();
  return {
    organization_id: organizationId,
    external_source: SLABSMITH_IMAGE_EXTERNAL_SOURCE,
    external_slab_id: externalSlabId,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    image_url_pattern: SLABSMITH_IMAGE_URL_PATTERN,
    image_status: "ok",
    last_checked_at: ts,
    updated_at: ts,
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
export function sanitizeImageUploadResponse(payload) {
  const json = JSON.stringify(payload);
  const banned = ["SUPABASE_SERVICE_ROLE_KEY", "SLABSMITH_SYNC_TOKEN", "service_role"];
  for (const needle of banned) {
    if (json.includes(needle)) {
      throw new Error("Image upload response must not expose secrets");
    }
  }
  return payload;
}

/**
 * @param {object} params
 */
export async function ingestSlabsmithImagePair({
  db,
  organizationId,
  fields,
  files,
  uploadFn = uploadPublicJpeg,
  now = () => new Date().toISOString(),
}) {
  const identity = parseImageUploadFields(fields);
  const identityCheck = validateImageUploadIdentity(identity);
  if (!identityCheck.ok) {
    throw new Error(identityCheck.error);
  }

  const fullFile = files.full_image ?? files.full ?? null;
  const thumbFile = files.thumb_image ?? files.thumb ?? null;
  if (!fullFile?.buffer?.length) {
    throw new Error("full_image file is required");
  }
  if (!thumbFile?.buffer?.length) {
    throw new Error("thumb_image file is required");
  }

  validateImageBuffer(fullFile.buffer, MAX_FULL_IMAGE_BYTES, "full_image");
  validateImageBuffer(thumbFile.buffer, MAX_THUMB_IMAGE_BYTES, "thumb_image");

  const inventoryRow = await findSlabsmithInventoryRow(db, organizationId, identity);
  if (!inventoryRow) {
    return sanitizeImageUploadResponse({
      ok: true,
      status: "skipped_no_inventory_match",
      slab_id: identity.slabId || null,
      inventory_id: identity.inventoryId,
      external_slab_id: null,
      message: "No matching slabsmith slab_inventory row",
    });
  }

  const externalSlabId = String(inventoryRow.external_slab_id ?? "").trim();
  const paths = buildSlabsmithImageStoragePaths({
    organizationId,
    externalSlabId,
    slabId: identity.slabId,
  });

  const imageUrl = await uploadFn(db, SLABSMITH_IMAGE_BUCKET, paths.fullPath, fullFile.buffer);
  const thumbnailUrl = await uploadFn(db, SLABSMITH_IMAGE_BUCKET, paths.thumbPath, thumbFile.buffer);
  if (!imageUrl || !thumbnailUrl) {
    throw new Error("Failed to resolve public URLs after storage upload");
  }

  const upsertRow = buildSlabImageUpsertRow({
    organizationId,
    externalSlabId,
    imageUrl,
    thumbnailUrl,
    now,
  });

  const { error } = await db.from(TABLE_SLAB_IMAGES).upsert(upsertRow, {
    onConflict: SLAB_IMAGES_CONFLICT_KEY,
  });
  if (error) {
    throw new Error(error.message);
  }

  return sanitizeImageUploadResponse({
    ok: true,
    status: "uploaded",
    slab_id: identity.slabId || null,
    inventory_id: identity.inventoryId ?? inventoryRow.inventory_id ?? null,
    external_slab_id: externalSlabId,
    image_status: "ok",
    image_url_pattern: SLABSMITH_IMAGE_URL_PATTERN,
    full_bytes: fullFile.buffer.length,
    thumb_bytes: thumbFile.buffer.length,
    full_modified_at: identity.fullModifiedAt,
    thumb_modified_at: identity.thumbModifiedAt,
  });
}

/**
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   ingestSlabsmithImagePair?: typeof ingestSlabsmithImagePair,
 * }} deps
 */
export function createSlabsmithImageUploadHandler(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createSlabsmithImageUploadHandler: getSupabase required");
  }
  const getSupabase = deps.getSupabase;
  const ingestFn = deps.ingestSlabsmithImagePair ?? ingestSlabsmithImagePair;

  return async function slabsmithImageUploadHandler(req, res) {
    try {
      const tokenCheck = validateSlabsmithSyncToken(req);
      if (!tokenCheck.ok) {
        return res.status(tokenCheck.status).json({ ok: false, error: tokenCheck.error });
      }

      const envCheck = validateIngestServerEnv();
      if (!envCheck.ok) {
        return res.status(envCheck.status).json({ ok: false, error: envCheck.error });
      }

      const body = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(String(req.body ?? ""), "utf8");
      if (!body.length) {
        return res.status(400).json({ ok: false, error: "Empty multipart body" });
      }
      if (body.length > MAX_MULTIPART_BYTES) {
        return res.status(413).json({ ok: false, error: "Upload too large" });
      }

      const { fields, files } = parseMultipartForm(body, req.headers["content-type"], {
        maxFileBytes: Math.max(MAX_FULL_IMAGE_BYTES, MAX_THUMB_IMAGE_BYTES),
      });

      const payload = await ingestFn({
        db: getSupabase(),
        organizationId: envCheck.organizationId,
        fields,
        files,
      });

      const httpStatus = payload.ok ? 200 : 500;
      return res.status(httpStatus).json(payload);
    } catch (err) {
      console.error("[slabsmith-image-upload] failed:", err?.message || String(err));
      return res.status(500).json({
        ok: false,
        error: String(err?.message || err),
      });
    }
  };
}

/**
 * @param {import("express").Application} app
 * @param {Parameters<typeof createSlabsmithImageUploadHandler>[0]} deps
 */
export function attachSlabsmithImageUploadRoutes(app, deps) {
  const rawParser = express.raw({ type: () => true, limit: MAX_MULTIPART_BYTES });
  app.post(SLABSMITH_IMAGE_UPLOAD_ROUTE, rawParser, createSlabsmithImageUploadHandler(deps));
  console.log(
    `[slabsmith-image-upload] mounted POST ${SLABSMITH_IMAGE_UPLOAD_ROUTE} (token auth, multipart)`
  );
}

export { readSlabsmithSyncToken, SLABSMITH_SYNC_TOKEN_HEADER };
