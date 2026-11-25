/**
 * slabPieceGeometryJob — keep slab_piece_geometry current for active Slabsmith pieces.
 *
 * Idempotent and replay-safe: a piece is (re)derived only when it has no geometry row,
 * or its photo URL / photo updated_at / source dimensions / derivation method changed.
 * Errors are retried after GEOMETRY_ERROR_RETRY_MS. Writes only slab_piece_geometry.
 */

import jpeg from "jpeg-js";

import { deriveGeometryFromImage, GEOMETRY_METHOD } from "./slabPieceGeometry.js";
import { fetchAllRowsPaginated, SLAB_IMAGE_ID_CHUNK_SIZE } from "./slabInventorySummaryQueries.js";

export const TABLE_SLAB_PIECE_GEOMETRY = "slab_piece_geometry";
export const GEOMETRY_SOURCE = "slabsmith";
const GEOMETRY_IMAGE_PATTERN = "slabsmith_local_upload";
const GEOMETRY_ERROR_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

export const GEOMETRY_SELECT_COLUMNS =
  "external_source,external_slab_id,status,px_per_in,outline_px,image_width_px,image_height_px,area_sqft,bbox_long_in,bbox_short_in,max_rect_long_in,max_rect_short_in,fit_frontier_in,fill_ratio,is_rectangular";

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
  if (existing.status === "error" && now - Date.parse(existing.computed_at) > GEOMETRY_ERROR_RETRY_MS) return true;
  return false;
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
      "id,organization_id,external_slab_id,method,status,source_image_url,source_image_updated_at,source_length_in,source_width_in,computed_at",
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

/**
 * Derive + upsert geometry for up to `limit` pending pieces.
 * @param {{ db: import("@supabase/supabase-js").SupabaseClient, limit?: number, concurrency?: number, organizationId?: string|null, fetchImpl?: typeof fetch, decodeImage?: (url: string) => Promise<any> }} opts
 */
export async function runSlabGeometryDerivation({
  db,
  limit = 150,
  concurrency = 4,
  organizationId = null,
  fetchImpl = fetch,
  decodeImage,
}) {
  const startedAt = Date.now();
  const work = await selectPendingGeometryWork(db, { organizationId });
  const batch = work.pending.slice(0, Math.max(0, limit));
  const decode = decodeImage ?? ((url) => fetchJpeg(url, fetchImpl));
  const counts = { ok: 0, no_stone: 0, no_dims: 0, error: 0 };
  const errors = [];

  async function processOne({ inv, image }) {
    let result;
    try {
      const img = await decode(image.image_url);
      result = deriveGeometryFromImage(img, { lengthIn: inv.length_actual_in, widthIn: inv.width_actual_in });
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
      ...result,
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

  return {
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
