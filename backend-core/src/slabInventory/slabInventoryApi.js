/**
 * Slab Inventory Head (v1) — protected, READ-ONLY internal slab browser API.
 *
 * Source/authority rule:
 *   SlabCloud/Slabsmith remains the external source of truth. slabOS reads from
 *   its normalized Supabase cache (slab_inventory / slab_images / slab_materials /
 *   slabcloud_sync_runs). This head NEVER mutates those tables and NEVER writes
 *   back to SlabCloud/Slabsmith. Every route here is a GET.
 *
 * Auth:
 *   requireAuth() + requireHeadAccess("slab_inventory"). Admin/super_admin bypass
 *   the head check inside the middleware (anti-lockout) but still must be signed in.
 *   Queries are organization_id scoped via resolveOrganizationContext.
 *
 * Price group rule:
 *   slab_inventory.price_group is the IMPORTED SlabCloud price group only. It is
 *   surfaced as `source_price_group` (label "Source price group"); it is NOT the
 *   final slabOS pricing authority and there is no override UI in v1.
 */

import { resolveOrganizationContext } from "../organizations/organizationContext.js";

export const SLAB_INVENTORY_HEAD_SLUG = "slab_inventory";

/** Staff-safe columns returned to the internal head. Intentionally explicit (no SELECT *). */
export const INVENTORY_SELECT_COLUMNS = Object.freeze([
  "id",
  "external_slab_id",
  "inventory_id",
  "color_name",
  "material_name",
  "distributor",
  "price_group",
  "thickness_nominal",
  "rack",
  "lot",
  "width_actual_in",
  "length_actual_in",
  "is_active",
  "last_seen_sync_run_id",
  "updated_at"
]);

/** Sort key (API) → physical column (whitelist; anything else falls back to color). */
export const SORT_COLUMNS = Object.freeze({
  color: "color_name",
  material: "material_name",
  inventory_id: "inventory_id",
  rack: "rack",
  updated_at: "updated_at"
});

/** Columns matched by free-text search (ILIKE). */
export const SEARCH_COLUMNS = Object.freeze([
  "color_name",
  "material_name",
  "inventory_id",
  "rack",
  "lot",
  "distributor"
]);

export const IMAGE_STATUS_VALUES = Object.freeze(["unknown", "ok", "missing", "error"]);

/** UI label for the imported (non-authoritative) SlabCloud price group. */
export const SOURCE_PRICE_GROUP_LABEL = "Source price group";

/** Image URL pattern preferred when a slab has multiple slab_images rows. */
const PREFERRED_IMAGE_PATTERN = "slabcloud_slab_jpg";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const jsonNoStore = (res) => res.set("Cache-Control", "no-store");

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function trimStr(v) {
  return v == null ? "" : String(v).trim();
}

/** PostgREST ILIKE escaping for user-supplied search fragments. */
function escapeIlike(term) {
  return String(term ?? "").replace(/[%,()\\]/g, " ").trim();
}

export function clampLimit(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function clampOffset(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Resolve a safe sort column + direction. Unknown keys fall back to color_name asc.
 * @param {string} sortKey
 * @param {string} direction
 */
export function resolveSort(sortKey, direction) {
  const column = SORT_COLUMNS[trimStr(sortKey)] || SORT_COLUMNS.color;
  const dir = trimStr(direction).toLowerCase();
  const ascending = dir === "desc" ? false : true;
  return { column, ascending };
}

/**
 * Normalize list query params into a validated, backend-owned filter object.
 * @param {Record<string, unknown>} query
 */
export function parseListParams(query = {}) {
  const q = query || {};
  const isActiveRaw = trimStr(q.is_active).toLowerCase();
  // Default to active-only. Pass is_active=all to include inactive, is_active=false for inactive-only.
  let isActive = true;
  if (isActiveRaw === "all") isActive = null;
  else if (isActiveRaw === "false" || isActiveRaw === "0") isActive = false;
  else if (isActiveRaw === "true" || isActiveRaw === "1" || isActiveRaw === "") isActive = true;

  const imageStatus = trimStr(q.image_status).toLowerCase();
  const { column, ascending } = resolveSort(q.sort, q.direction);

  return {
    search: trimStr(q.search || q.q),
    material_name: trimStr(q.material_name),
    color_name: trimStr(q.color_name),
    price_group: trimStr(q.price_group),
    thickness_nominal: trimStr(q.thickness_nominal),
    rack: trimStr(q.rack),
    distributor: trimStr(q.distributor),
    image_status: IMAGE_STATUS_VALUES.includes(imageStatus) ? imageStatus : "",
    is_active: isActive,
    limit: clampLimit(q.limit),
    offset: clampOffset(q.offset),
    sortColumn: column,
    ascending
  };
}

/**
 * Build the staff-safe API row from a slab_inventory row + its resolved image row.
 * Surfaces price_group as `source_price_group` (imported, non-authoritative).
 * @param {Record<string, unknown>} row
 * @param {{ image_url?: string|null, thumbnail_url?: string|null, image_status?: string|null }|null} image
 */
export function mapSlabRow(row, image = null) {
  const r = row || {};
  const img = image || {};
  return {
    id: r.id ?? null,
    external_slab_id: r.external_slab_id ?? null,
    inventory_id: r.inventory_id ?? null,
    color_name: r.color_name ?? null,
    material_name: r.material_name ?? null,
    distributor: r.distributor ?? null,
    // Imported SlabCloud price group only — NOT slabOS pricing authority.
    source_price_group: r.price_group ?? null,
    price_group: r.price_group ?? null,
    source_price_group_label: SOURCE_PRICE_GROUP_LABEL,
    thickness_nominal: r.thickness_nominal ?? null,
    rack: r.rack ?? null,
    lot: r.lot ?? null,
    width_actual_in: r.width_actual_in ?? null,
    length_actual_in: r.length_actual_in ?? null,
    is_active: r.is_active !== false,
    last_seen_sync_run_id: r.last_seen_sync_run_id ?? null,
    updated_at: r.updated_at ?? null,
    image_url: img.image_url ?? null,
    thumbnail_url: img.thumbnail_url ?? null,
    image_status: img.image_status ?? "unknown"
  };
}

/**
 * Index slab_images rows by external_slab_id, preferring the canonical pattern
 * and an `ok` status when a slab has more than one image row.
 * @param {Array<Record<string, unknown>>} imageRows
 */
export function buildImageMap(imageRows = []) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  for (const raw of Array.isArray(imageRows) ? imageRows : []) {
    const key = trimStr(raw?.external_slab_id);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, raw);
      continue;
    }
    const better =
      (raw?.image_status === "ok" && existing?.image_status !== "ok") ||
      (raw?.image_url_pattern === PREFERRED_IMAGE_PATTERN && existing?.image_url_pattern !== PREFERRED_IMAGE_PATTERN);
    if (better) map.set(key, raw);
  }
  return map;
}

/**
 * Compute summary aggregates from a lightweight projection of ACTIVE slab rows.
 *
 * CRITICAL: actual slab count is the count of rows (distinct slabs), NEVER the
 * sum of SlabCloud's `count_for_color` (which is a repeated color-group value).
 * `count_for_color` is not even selected by this head.
 *
 * @param {Array<{ color_name?: string|null, material_name?: string|null, price_group?: string|null }>} rows
 */
export function summarizeActiveRows(rows = []) {
  const colors = new Set();
  const materials = new Set();
  /** @type {Map<string, number>} */
  const byPriceGroup = new Map();
  let totalActive = 0;

  for (const r of Array.isArray(rows) ? rows : []) {
    totalActive += 1;
    const color = trimStr(r?.color_name);
    const material = trimStr(r?.material_name);
    if (color) colors.add(color.toLowerCase());
    if (material) materials.add(material.toLowerCase());
    const pg = trimStr(r?.price_group) || "(none)";
    byPriceGroup.set(pg, (byPriceGroup.get(pg) || 0) + 1);
  }

  const byPriceGroupArr = [...byPriceGroup.entries()]
    .map(([price_group, count]) => ({ price_group, count }))
    .sort((a, b) => b.count - a.count || a.price_group.localeCompare(b.price_group));

  return {
    total_active_slabs: totalActive,
    distinct_colors: colors.size,
    distinct_materials: materials.size,
    slabs_by_price_group: byPriceGroupArr
  };
}

/** Distinct, sorted, non-empty string values from a column projection. */
function distinctValues(rows, column) {
  const set = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const v = trimStr(r?.[column]);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient
 * }} deps
 */
export function attachSlabInventoryRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachSlabInventoryRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") throw new Error("attachSlabInventoryRoutes: requireHeadAccess required");
  if (typeof getSupabase !== "function") throw new Error("attachSlabInventoryRoutes: getSupabase required");

  const headAccess = requireHeadAccess(SLAB_INVENTORY_HEAD_SLUG, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const db = () => getSupabase();

  async function orgId(req) {
    const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
    return ctx.organizationId || null;
  }

  function scopeOrg(query, organizationId) {
    return organizationId ? query.eq("organization_id", organizationId) : query;
  }

  // GET /api/slab-inventory/summary — counts + last sync metadata (read-only).
  app.get("/api/slab-inventory/summary", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);

      let activeQ = supabase.from("slab_inventory").select("color_name,material_name,price_group").eq("is_active", true);
      activeQ = scopeOrg(activeQ, organizationId);
      const { data: activeRows, error: activeErr } = await activeQ;
      if (activeErr) {
        if (isMissingRelationError(activeErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "Slab inventory cache not installed." });
        }
        throw activeErr;
      }
      const summary = summarizeActiveRows(activeRows ?? []);

      // Verified images (status ok), org-scoped.
      let imgQ = supabase.from("slab_images").select("id", { count: "exact", head: true }).eq("image_status", "ok");
      imgQ = scopeOrg(imgQ, organizationId);
      const { count: verifiedImages } = await imgQ;

      // Latest sync run.
      let syncQ = supabase
        .from("slabcloud_sync_runs")
        .select("id,status,started_at,finished_at,warning_count,slab_upserted_count,image_row_written_count,triggered_by")
        .order("started_at", { ascending: false })
        .limit(1);
      syncQ = scopeOrg(syncQ, organizationId);
      const { data: syncRows } = await syncQ;
      const lastSync = (syncRows && syncRows[0]) || null;

      res.json({
        ok: true,
        installed: true,
        organization_id: organizationId,
        summary: {
          ...summary,
          slabs_with_verified_images: Number(verifiedImages || 0),
          last_sync: lastSync
            ? {
                id: lastSync.id,
                status: lastSync.status,
                started_at: lastSync.started_at,
                finished_at: lastSync.finished_at,
                warning_count: Number(lastSync.warning_count || 0),
                slab_upserted_count: lastSync.slab_upserted_count ?? null,
                image_row_written_count: lastSync.image_row_written_count ?? null,
                triggered_by: lastSync.triggered_by ?? null
              }
            : null
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/filters — distinct filter options (read-only).
  app.get("/api/slab-inventory/filters", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);

      let q = supabase
        .from("slab_inventory")
        .select("material_name,color_name,price_group,thickness_nominal,rack,distributor")
        .eq("is_active", true);
      q = scopeOrg(q, organizationId);
      const { data: rows, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Slab inventory cache not installed." });
        }
        throw error;
      }

      let imgQ = supabase.from("slab_images").select("image_status");
      imgQ = scopeOrg(imgQ, organizationId);
      const { data: imgRows } = await imgQ;
      const imageStatuses = distinctValues(imgRows ?? [], "image_status");

      res.json({
        ok: true,
        installed: true,
        filters: {
          materials: distinctValues(rows ?? [], "material_name"),
          colors: distinctValues(rows ?? [], "color_name"),
          price_groups: distinctValues(rows ?? [], "price_group"),
          thicknesses: distinctValues(rows ?? [], "thickness_nominal"),
          racks: distinctValues(rows ?? [], "rack"),
          distributors: distinctValues(rows ?? [], "distributor"),
          image_statuses: imageStatuses.length ? imageStatuses : [...IMAGE_STATUS_VALUES]
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/slabs — filtered, paginated list (read-only).
  app.get("/api/slab-inventory/slabs", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);
      const params = parseListParams(req.query);

      let q = supabase.from("slab_inventory").select(INVENTORY_SELECT_COLUMNS.join(","), { count: "exact" });
      q = scopeOrg(q, organizationId);
      if (params.is_active !== null) q = q.eq("is_active", params.is_active);
      if (params.material_name) q = q.eq("material_name", params.material_name);
      if (params.color_name) q = q.eq("color_name", params.color_name);
      if (params.price_group) q = q.eq("price_group", params.price_group);
      if (params.thickness_nominal) q = q.eq("thickness_nominal", params.thickness_nominal);
      if (params.rack) q = q.eq("rack", params.rack);
      if (params.distributor) q = q.eq("distributor", params.distributor);

      if (params.search) {
        const term = escapeIlike(params.search);
        if (term) {
          const orExpr = SEARCH_COLUMNS.map((c) => `${c}.ilike.%${term}%`).join(",");
          q = q.or(orExpr);
        }
      }

      q = q
        .order(params.sortColumn, { ascending: params.ascending, nullsFirst: false })
        .order("id", { ascending: true })
        .range(params.offset, params.offset + params.limit - 1);

      const { data: rows, error, count } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Slab inventory cache not installed." });
        }
        throw error;
      }

      const slabIds = (rows ?? []).map((r) => trimStr(r.external_slab_id)).filter(Boolean);
      let imageMap = new Map();
      if (slabIds.length) {
        let imgQ = supabase
          .from("slab_images")
          .select("external_slab_id,image_url,thumbnail_url,image_status,image_url_pattern")
          .in("external_slab_id", slabIds);
        imgQ = scopeOrg(imgQ, organizationId);
        const { data: imgRows } = await imgQ;
        imageMap = buildImageMap(imgRows ?? []);
      }

      const mapped = (rows ?? []).map((r) => mapSlabRow(r, imageMap.get(trimStr(r.external_slab_id)) || null));

      res.json({
        ok: true,
        installed: true,
        rows: mapped,
        total: Number(count || 0),
        limit: params.limit,
        offset: params.offset,
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/slabs/:id — single slab detail (read-only).
  app.get("/api/slab-inventory/slabs/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const id = trimStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const supabase = db();
      const organizationId = await orgId(req);

      let q = supabase.from("slab_inventory").select(INVENTORY_SELECT_COLUMNS.join(",")).eq("id", id).limit(1);
      q = scopeOrg(q, organizationId);
      const { data: rows, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) return res.status(503).json({ ok: false, installed: false });
        throw error;
      }
      const row = rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "not found" });

      let imageMap = new Map();
      const sid = trimStr(row.external_slab_id);
      if (sid) {
        let imgQ = supabase
          .from("slab_images")
          .select("external_slab_id,image_url,thumbnail_url,image_status,image_url_pattern")
          .eq("external_slab_id", sid);
        imgQ = scopeOrg(imgQ, organizationId);
        const { data: imgRows } = await imgQ;
        imageMap = buildImageMap(imgRows ?? []);
      }

      res.json({
        ok: true,
        row: mapSlabRow(row, imageMap.get(sid) || null),
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log(
    "[slab-inventory-head] mounted GET /api/slab-inventory/summary, /filters, /slabs, /slabs/:id (read-only)"
  );
}
