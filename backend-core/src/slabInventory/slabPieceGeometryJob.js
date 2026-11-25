/**
 * slabPieceGeometryJob — keep slab_piece_geometry current for active Slabsmith pieces.
 *
 * Idempotent and replay-safe: a piece is (re)derived only when it has no geometry row,
 * or its photo URL / photo updated_at / source dimensions / derivation method changed,
 * or it has no swatch yet. Errors are retried after GEOMETRY_ERROR_RETRY_MS.
 * Writes slab_piece_geometry and derived swatch JPEGs under the org's `slabsmith-derived/` prefix.
 */

import { createHash } from "node:crypto";

import jpeg from "jpeg-js";

import { cropResizeRgba, deriveGeometryFromImage, GEOMETRY_METHOD, swatchOutputSize } from "./slabPieceGeometry.js";
import { fetchAllRowsPaginated, SLAB_IMAGE_ID_CHUNK_SIZE } from "./slabInventorySummaryQueries.js";
import { sanitizeStorageSegment, SLABSMITH_IMAGE_BUCKET } from "../slabsmith/slabsmithImageStorage.mjs";
import { computeSwatchFeatures, SWATCH_FEATURES_VERSION } from "./swatchFeatures.js";

export const TABLE_SLAB_PIECE_GEOMETRY = "slab_piece_geometry";
export const GEOMETRY_SOURCE = "slabsmith";
const GEOMETRY_IMAGE_PATTERN = "slabsmith_local_upload";
const GEOMETRY_ERROR_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const SWATCH_JPEG_QUALITY = 84;

export const GEOMETRY_SELECT_COLUMNS =
  "external_source,external_slab_id,status,px_per_in,outline_px,image_width_px,image_height_px,area_sqft,bbox_long_in,bbox_short_in,max_rect_long_in,max_rect_short_in,fit_frontier_in,fill_ratio,is_rectangular,swatch_url";

/** Light projection for color cards (no outline / frontier). */
export const GEOMETRY_CARD_COLUMNS = "external_source,external_slab_id,status,area_sqft,swatch_url";

/** Card columns + appearance features (similarity / tone match). */
export const GEOMETRY_FEATURE_COLUMNS = `${GEOMETRY_CARD_COLUMNS},swatch_features`;

const sameNum = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.01);

/**
 * @param {{ organization_id: string, external_slab_id: string, length_actual_in: number|null, width_actual_in: number|null }} inv
 * @param {{ image_url: string, updated_at: string|null }} image
 * @param {Record<string, any>|undefined} existing
 */
export function geometryNeedsWork(inv, image, existing, now = Date.now()) {
  if (!existing) return true;
  if (existing.method !== GEOMETRY_METHOD) return true;
  if (existing.source_image_url !== image.image_url) return true;
  if (image.updated_at && existing.source_image_updated_at && Date.parse(image.updated_at) > Date.parse(existing.source_image_updated_at)) return true;
  if (!sameNum(existing.source_length_in, inv.length_actual_in) || !sameNum(existing.source_width_in, inv.width_actual_in)) return true;
  const stale = now - Date.parse(existing.computed_at) > GEOMETRY_ERROR_RETRY_MS;
  if (existing.status === "error" && stale) return true;
  // Swatch missing: build it now, but back off a day after a swatch failure.
  if (existing.status === "ok" && !existing.swatch_url && (!existing.error || stale)) return true;
  return false;
}

/** Content-addressed swatch path: a new photo gets a new object, so URLs can cache forever. */
export function swatchStoragePath(inv, image) {
  const hash = createHash("sha1")
    .update(`${GEOMETRY_METHOD}|${image.image_url}|${image.updated_at ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return `org/${inv.organization_id}/slabsmith-derived/${sanitizeStorageSegment(inv.external_slab_id)}/swatch-${hash}.jpg`;
}

async function loadByIds(db, table, select, ids, extra) {
  const out = [];
  for (let i = 0; i < ids.length; i += SLAB_IMAGE_ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + SLAB_IMAGE_ID_CHUNK_SIZE);
    out.push(...(await fetchAllRowsPaginated(() => extra(db.from(table).select(select).in("external_slab_id", chunk)))));
  }
  return out;
}

/**
 * Active Slabsmith pieces whose geometry is missing or stale.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 */
export async function selectPendingGeometryWork(db, { organizationId = null } = {}) {
  const scopeOrg = (q) => (organizationId ? q.eq("organization_id", organizationId) : q);
  const inv = await fetchAllRowsPaginated(() =>
    scopeOrg(
      db
        .from("slab_inventory")
        .select("id,organization_id,external_slab_id,length_actual_in,width_actual_in")
        .eq("external_source", GEOMETRY_SOURCE)
        .eq("is_active", true)
        .in("source_inventory_type", ["Slab", "Remnant"])
    )
  );
  const ids = [...new Set(inv.map((r) => String(r.external_slab_id ?? "").trim()).filter(Boolean))];
  const scopeSrc = (q) => scopeOrg(q.eq("external_source", GEOMETRY_SOURCE));
  const [images, geoms] = await Promise.all([
    loadByIds(db, "slab_images", "id,organization_id,external_slab_id,image_url,updated_at,image_status", ids, (q) =>
      scopeSrc(q.eq("image_url_pattern", GEOMETRY_IMAGE_PATTERN).eq("image_status", "ok"))
    ),
    loadByIds(
      db,
      TABLE_SLAB_PIECE_GEOMETRY,
      "id,organization_id,external_slab_id,method,status,error,source_image_url,source_image_updated_at,source_length_in,source_width_in,swatch_url,computed_at",
      ids,
      scopeSrc
    ),
  ]);
  const key = (org, id) => `${org}|${id}`;
  const imageBy = new Map(images.map((i) => [key(i.organization_id, i.external_slab_id), i]));
  const geomBy = new Map(geoms.map((g) => [key(g.organization_id, g.external_slab_id), g]));
  const now = Date.now();
  const pending = [];
  let withImage = 0;
  for (const r of inv) {
    const image = imageBy.get(key(r.organization_id, r.external_slab_id));
    if (!image?.image_url) continue;
    withImage += 1;
    if (geometryNeedsWork(r, image, geomBy.get(key(r.organization_id, r.external_slab_id)), now)) {
      pending.push({ inv: r, image });
    }
  }
  return { pending, active_pieces: inv.length, active_with_photo: withImage, derived: geoms.length };
}

async function fetchJpeg(url, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`image HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("image too large");
    return jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 });
  } finally {
    clearTimeout(timer);
  }
}

/** Crop the swatch from the decoded photo, encode, upload. Returns the public URL + size. */
async function uploadSwatch(db, img, rect, path) {
  const [w, h] = swatchOutputSize(rect);
  const crop = cropResizeRgba(img, rect, w, h);
  const { data } = jpeg.encode(crop, SWATCH_JPEG_QUALITY);
  const buf = Buffer.from(data);
  const { error } = await db.storage.from(SLABSMITH_IMAGE_BUCKET).upload(path, buf, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`swatch upload failed: ${error.message}`);
  const { data: pub } = db.storage.from(SLABSMITH_IMAGE_BUCKET).getPublicUrl(path);
  const url = String(pub?.publicUrl ?? "").trim();
  if (!url) throw new Error("swatch upload returned no public URL");
  return { swatch_url: url, swatch_width_px: w, swatch_height_px: h, swatch_features: computeSwatchFeatures(crop) };
}

/**
 * Compute appearance features for `ok` pieces whose swatch has no features or features from an older version.
 * Reads the small swatch JPEG, not the full photo. Idempotent; failures are skipped and retried next run.
 * @param {{ db: any, limit?: number, concurrency?: number, fetchImpl?: typeof fetch, decodeImage?: (url: string) => Promise<any> }} opts
 */
export async function runSwatchFeatureBackfill({ db, limit = 300, concurrency = 6, fetchImpl = fetch, decodeImage }) {
  const decode = decodeImage ?? ((url) => fetchJpeg(url, fetchImpl));
  const { data, error } = await db
    .from(TABLE_SLAB_PIECE_GEOMETRY)
    .select("id,swatch_url")
    .eq("status", "ok")
    .not("swatch_url", "is", null)
    .or(`swatch_features.is.null,swatch_features->>v.neq.${SWATCH_FEATURES_VERSION}`)
    .limit(Math.max(0, limit));
  if (error) throw error;
  const rows = data ?? [];
  const counts = { updated: 0, failed: 0 };
  for (let i = 0; i < rows.length; i += concurrency) {
    await Promise.all(
      rows.slice(i, i + concurrency).map(async (r) => {
        try {
          const features = computeSwatchFeatures(await decode(r.swatch_url));
          if (!features) throw new Error("no features");
          const { error: upErr } = await db.from(TABLE_SLAB_PIECE_GEOMETRY).update({ swatch_features: features }).eq("id", r.id);
          if (upErr) throw upErr;
          counts.updated += 1;
        } catch {
          counts.failed += 1;
        }
      })
    );
  }
  return { candidates: rows.length, ...counts };
}

/**
 * Derive + upsert geometry for up to `limit` pending pieces.
 * @param {{ db: import("@supabase/supabase-js").SupabaseClient, limit?: number, concurrency?: number, organizationId?: string|null, fetchImpl?: typeof fetch, decodeImage?: (url: string) => Promise<any>, writeSwatch?: (img: any, rect: number[], path: string) => Promise<{ swatch_url: string, swatch_width_px: number, swatch_height_px: number }> }} opts
 */
export async function runSlabGeometryDerivation({
  db,
  limit = 150,
  concurrency = 4,
  organizationId = null,
  fetchImpl = fetch,
  decodeImage,
  writeSwatch,
  featureLimit = 300,
}) {
  const startedAt = Date.now();
  const work = await selectPendingGeometryWork(db, { organizationId });
  const batch = work.pending.slice(0, Math.max(0, limit));
  const decode = decodeImage ?? ((url) => fetchJpeg(url, fetchImpl));
  const putSwatch = writeSwatch ?? ((img, rect, path) => uploadSwatch(db, img, rect, path));
  const counts = { ok: 0, no_stone: 0, no_dims: 0, error: 0, swatches: 0, swatch_errors: 0 };
  const errors = [];

  async function processOne({ inv, image }) {
    let result;
    let swatch = { swatch_url: null, swatch_width_px: null, swatch_height_px: null, swatch_features: null };
    try {
      const img = await decode(image.image_url);
      result = deriveGeometryFromImage(img, { lengthIn: inv.length_actual_in, widthIn: inv.width_actual_in });
      if (result.status === "ok" && result.swatch_rect_px) {
        try {
          swatch = { ...swatch, ...(await putSwatch(img, result.swatch_rect_px, swatchStoragePath(inv, image))) };
          counts.swatches += 1;
        } catch (e) {
          counts.swatch_errors += 1;
          result.error = `swatch: ${String(e?.message || e)}`.slice(0, 300);
          if (errors.length < 5) errors.push({ external_slab_id: inv.external_slab_id, error: result.error });
        }
      }
    } catch (e) {
      result = { method: GEOMETRY_METHOD, status: "error", error: String(e?.message || e).slice(0, 300) };
      if (errors.length < 5) errors.push({ external_slab_id: inv.external_slab_id, error: result.error });
    }
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    const nowIso = new Date().toISOString();
    const row = {
      organization_id: inv.organization_id,
      external_source: GEOMETRY_SOURCE,
      external_slab_id: inv.external_slab_id,
      source_image_url: image.image_url,
      source_image_updated_at: image.updated_at ?? null,
      source_length_in: inv.length_actual_in ?? null,
      source_width_in: inv.width_actual_in ?? null,
      error: null,
      image_width_px: null,
      image_height_px: null,
      px_per_in: null,
      scale_mismatch_pct: null,
      outline_px: null,
      area_sqft: null,
      bbox_long_in: null,
      bbox_short_in: null,
      max_rect_long_in: null,
      max_rect_short_in: null,
      fit_frontier_in: null,
      fill_ratio: null,
      is_rectangular: null,
      swatch_rect_px: null,
      ...result,
      ...swatch,
      computed_at: nowIso,
      updated_at: nowIso,
    };
    const { error } = await db
      .from(TABLE_SLAB_PIECE_GEOMETRY)
      .upsert(row, { onConflict: "organization_id,external_source,external_slab_id" });
    if (error) throw error;
  }

  for (let i = 0; i < batch.length; i += concurrency) {
    await Promise.all(batch.slice(i, i + concurrency).map(processOne));
  }

  let features = null;
  if (featureLimit > 0) {
    try {
      features = await runSwatchFeatureBackfill({ db, limit: featureLimit, fetchImpl, decodeImage });
    } catch (e) {
      features = { error: String(e?.message || e).slice(0, 200) };
    }
  }

  return {
    features,
    method: GEOMETRY_METHOD,
    active_pieces: work.active_pieces,
    active_with_photo: work.active_with_photo,
    pending_before: work.pending.length,
    processed: batch.length,
    remaining: work.pending.length - batch.length,
    counts,
    sample_errors: errors,
    duration_ms: Date.now() - startedAt,
  };
}
