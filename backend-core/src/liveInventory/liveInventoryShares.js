/**
 * Live Inventory — shareable customer picks.
 *
 * Staff (live_inventory / slab_inventory head access) create a read-only link for specific
 * slabs/remnants; customers open /s/<token> on the Live Inventory host with no login.
 *
 *   POST /api/live-inventory/shares               create (returns the raw token once)
 *   GET  /api/live-inventory/shares               recent links for the caller's org
 *   POST /api/live-inventory/shares/:id/revoke    revoke
 *   GET  /api/public/live-inventory/shares/:token public DTO (rate limited, generic 404/410)
 *
 * Only sha256(token) is stored. The public DTO is an explicit allow-list: no price group,
 * rack, lot, supplier codes, costs, or internal ids.
 */

import { createHash, randomBytes } from "node:crypto";

import express from "express";

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import {
  COLOR_INVENTORY_SELECT_COLUMNS,
  geometryFor,
  makeColorKey,
} from "../slabInventory/slabInventoryApi.js";
import { buildImageMap, lookupInventoryImage, SLAB_IMAGE_SELECT_COLUMNS } from "../slabInventory/slabInventoryImageResolver.js";
import { applyInventorySourceFilter, resolveInventorySourceFilter } from "../slabInventory/slabInventorySourceFilter.js";
import { fetchRowsForInventorySlabIds, fetchSlabImagesForInventoryRows } from "../slabInventory/slabInventorySummaryQueries.js";
import { GEOMETRY_CARD_COLUMNS, TABLE_SLAB_PIECE_GEOMETRY } from "../slabInventory/slabPieceGeometryJob.js";

export const TABLE_LIVE_INVENTORY_SHARES = "live_inventory_shares";
export const SHARE_TOKEN_BYTES = 32;
export const SHARE_MAX_PIECES = 60;
export const SHARE_EXPIRY_DAYS = Object.freeze([7, 30, 90]);
export const SHARE_DEFAULT_EXPIRY_DAYS = 30;
const PUBLIC_RATE_LIMIT_PER_MINUTE = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

const SHARE_ROW_COLUMNS =
  "id,organization_id,title,customer_name,message,items,show_contact,created_by,created_by_name,created_by_email,expires_at,revoked_at,view_count,last_viewed_at,created_at";

function trimStr(v) {
  return v == null ? "" : String(v).trim();
}

function clip(v, max) {
  const s = trimStr(v).replace(/\s+\n/g, "\n");
  return s ? s.slice(0, max) : null;
}

export function hashShareToken(rawToken) {
  return createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

export function generateShareToken() {
  const rawToken = randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
  return { rawToken, tokenHash: hashShareToken(rawToken) };
}

/**
 * Validate a create request. Piece ids keep the rep's order and are de-duplicated.
 * @returns {{ ok: true, value: { pieceIds: string[], title: string|null, customerName: string|null, message: string|null, expiresInDays: number, showContact: boolean } } | { ok: false, error: string }}
 */
export function parseShareCreateBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const raw = Array.isArray(b.piece_ids) ? b.piece_ids : [];
  const pieceIds = [...new Set(raw.map(trimStr).filter(Boolean))];
  if (!pieceIds.length) return { ok: false, error: "Pick at least one piece to share." };
  if (pieceIds.length > SHARE_MAX_PIECES) return { ok: false, error: `Share up to ${SHARE_MAX_PIECES} pieces per link.` };
  if (pieceIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Invalid piece id." };
  const days = b.expires_in_days == null ? SHARE_DEFAULT_EXPIRY_DAYS : Number(b.expires_in_days);
  if (!SHARE_EXPIRY_DAYS.includes(days)) return { ok: false, error: "Invalid expiry." };
  return {
    ok: true,
    value: {
      pieceIds,
      title: clip(b.title, 120),
      customerName: clip(b.customer_name, 120),
      message: clip(b.message, 1000),
      expiresInDays: days,
      showContact: b.show_contact !== false,
    },
  };
}

/** Display snapshot of the picked rows, in the rep's order. */
export function snapshotShareItems(pieceIds, rows) {
  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  return pieceIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r) => ({
      inventory_row_id: String(r.id),
      color_key: makeColorKey(r.color_name, r.material_name, r.price_group),
      color_name: r.color_name ?? null,
      material_name: r.material_name ?? null,
      source_inventory_type: r.source_inventory_type ?? null,
      thickness_nominal: r.thickness_nominal ?? null,
      length_in: r.length_actual_in != null ? Number(r.length_actual_in) : null,
      width_in: r.width_actual_in != null ? Number(r.width_actual_in) : null,
      inventory_id: r.inventory_id ?? null,
    }));
}

/** @returns {"active"|"expired"|"revoked"} */
export function shareState(share, now = Date.now()) {
  if (share?.revoked_at) return "revoked";
  if (!share?.expires_at || Date.parse(share.expires_at) <= now) return "expired";
  return "active";
}

function num(v) {
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}

/**
 * Customer-facing DTO. Explicit allow-list only.
 * @param {{ share: any, organizationName: string|null, liveRows: any[], imageMap: Map<any, any>, geometryMap: Map<string, any>, sourceFilter: any }} p
 */
export function toPublicShareDto({ share, organizationName, liveRows, imageMap, geometryMap, sourceFilter }) {
  const live = new Map((liveRows ?? []).map((r) => [String(r.id), r]));
  const items = Array.isArray(share.items) ? share.items : [];
  const pieces = items.map((snap, i) => {
    const row = live.get(String(snap.inventory_row_id));
    const available = Boolean(row && row.is_active !== false);
    const img = row ? lookupInventoryImage(imageMap, row, sourceFilter) : null;
    const g = row ? geometryFor(geometryMap, row) : null;
    const geo = g?.status === "ok" ? g : null;
    const L = num(row?.length_actual_in ?? snap.length_in);
    const W = num(row?.width_actual_in ?? snap.width_in);
    return {
      key: `p${i + 1}`,
      color_name: row?.color_name ?? snap.color_name ?? null,
      material_name: row?.material_name ?? snap.material_name ?? null,
      type: (row?.source_inventory_type ?? snap.source_inventory_type) === "Remnant" ? "remnant" : "slab",
      thickness: row?.thickness_nominal ?? snap.thickness_nominal ?? null,
      length_in: L,
      width_in: W,
      area_sqft: num(geo?.area_sqft) ?? (L && W ? Math.round(((L * W) / 144) * 10) / 10 : null),
      item_number: row?.inventory_id ?? snap.inventory_id ?? null,
      available,
      image_url: available ? img?.image_url ?? null : null,
      thumbnail_url: available ? img?.thumbnail_url ?? null : null,
      swatch_url: available ? geo?.swatch_url ?? null : null,
    };
  });
  return {
    ok: true,
    share: {
      title: share.title ?? null,
      customer_name: share.customer_name ?? null,
      message: share.message ?? null,
      organization_name: organizationName ?? null,
      contact: share.show_contact
        ? { name: share.created_by_name ?? null, email: share.created_by_email ?? null }
        : null,
      created_at: share.created_at ?? null,
      expires_at: share.expires_at ?? null,
    },
    pieces,
  };
}

/** Rep-facing list row. */
export function toShareListDto(share, now = Date.now()) {
  return {
    id: share.id,
    title: share.title ?? null,
    customer_name: share.customer_name ?? null,
    piece_count: Array.isArray(share.items) ? share.items.length : 0,
    state: shareState(share, now),
    created_at: share.created_at ?? null,
    created_by_name: share.created_by_name ?? null,
    expires_at: share.expires_at ?? null,
    revoked_at: share.revoked_at ?? null,
    view_count: Number(share.view_count) || 0,
    last_viewed_at: share.last_viewed_at ?? null,
  };
}

/**
 * Process-local per-IP limiter. Not a distributed guarantee on serverless; token entropy and
 * generic 404s are the primary defence.
 */
export function createShareRateLimiter(limit = PUBLIC_RATE_LIMIT_PER_MINUTE, windowMs = 60_000) {
  const buckets = new Map();
  return function check(key, now = Date.now()) {
    let b = buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      b = { start: now, count: 0 };
      buckets.set(key, b);
      if (buckets.size > 10_000) {
        for (const [k, v] of buckets) if (now - v.start >= windowMs) buckets.delete(k);
      }
    }
    if (b.count >= limit) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - b.start)) / 1000)) };
    b.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  };
}

function clientIp(req) {
  const fwd = trimStr(req.headers?.["x-forwarded-for"]).split(",")[0]?.trim();
  return fwd || trimStr(req.headers?.["x-real-ip"]) || String(req.ip ?? "unknown");
}

const PUBLIC_UNAVAILABLE = { ok: false, error: "This link is not available." };

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireAnyHeadAccess: Function, headSlugs: string[], getSupabase: () => any, now?: () => number, resolveOrgId?: (req: any) => Promise<string|null>, rateLimiter?: Function }} deps
 */
export function attachLiveInventoryShareRoutes(
  app,
  {
    requireAuth,
    requireAnyHeadAccess,
    headSlugs,
    getSupabase,
    now = Date.now,
    resolveOrgId = async (req) =>
      (await resolveOrganizationContext({ req, supabase: getSupabase(), mode: "authenticated" })).organizationId || null,
    rateLimiter = createShareRateLimiter(),
  }
) {
  const guard = [requireAuth(), requireAnyHeadAccess([...headSlugs], { getSupabase })];
  const jsonParser = express.json({ limit: "32kb" });
  const rateLimit = rateLimiter;

  async function requireOrg(req, res) {
    const organizationId = await resolveOrgId(req);
    if (!organizationId) {
      res.status(403).json({ ok: false, error: "No organization on this account." });
      return null;
    }
    return organizationId;
  }

  app.post("/api/live-inventory/shares", ...guard, jsonParser, async (req, res) => {
    try {
      const organizationId = await requireOrg(req, res);
      if (!organizationId) return;
      const parsed = parseShareCreateBody(req.body);
      if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
      const { pieceIds, title, customerName, message, expiresInDays, showContact } = parsed.value;

      const supabase = getSupabase();
      const { data: rows, error: rowsErr } = await supabase
        .from("slab_inventory")
        .select(COLOR_INVENTORY_SELECT_COLUMNS.join(","))
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("id", pieceIds);
      if (rowsErr) throw rowsErr;
      const items = snapshotShareItems(pieceIds, rows);
      if (items.length !== pieceIds.length) {
        return res.status(400).json({ ok: false, error: "Some picked pieces are no longer in stock. Refresh and try again." });
      }

      const { rawToken, tokenHash } = generateShareToken();
      const expiresAt = new Date(now() + expiresInDays * 86_400_000).toISOString();
      const { data: inserted, error: insErr } = await supabase
        .from(TABLE_LIVE_INVENTORY_SHARES)
        .insert({
          organization_id: organizationId,
          token_hash: tokenHash,
          title,
          customer_name: customerName,
          message,
          items,
          show_contact: showContact,
          created_by: req.user.id,
          created_by_name: trimStr(req.user.full_name) || null,
          created_by_email: trimStr(req.user.email) || null,
          expires_at: expiresAt,
        })
        .select(SHARE_ROW_COLUMNS)
        .single();
      if (insErr) throw insErr;
      console.info(
        JSON.stringify({
          event: "live_inventory.share.created",
          share_id: inserted.id,
          organization_id: organizationId,
          user_id: req.user.id,
          pieces: items.length,
          expires_at: expiresAt,
        })
      );
      res.status(201).json({ ok: true, token: rawToken, path: `/s/${rawToken}`, share: toShareListDto(inserted, now()) });
    } catch (e) {
      console.error("[live-inventory-shares] create failed", e?.message || e);
      res.status(500).json({ ok: false, error: "Could not create the link." });
    }
  });

  app.get("/api/live-inventory/shares", ...guard, async (req, res) => {
    try {
      const organizationId = await requireOrg(req, res);
      if (!organizationId) return;
      const { data, error } = await getSupabase()
        .from(TABLE_LIVE_INVENTORY_SHARES)
        .select(SHARE_ROW_COLUMNS)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const t = now();
      res.json({ ok: true, shares: (data ?? []).map((s) => toShareListDto(s, t)) });
    } catch (e) {
      console.error("[live-inventory-shares] list failed", e?.message || e);
      res.status(500).json({ ok: false, error: "Could not load links." });
    }
  });

  app.post("/api/live-inventory/shares/:id/revoke", ...guard, async (req, res) => {
    try {
      const organizationId = await requireOrg(req, res);
      if (!organizationId) return;
      const id = trimStr(req.params.id);
      if (!UUID_RE.test(id)) return res.status(404).json({ ok: false, error: "Not found" });
      const { data, error } = await getSupabase()
        .from(TABLE_LIVE_INVENTORY_SHARES)
        .update({ revoked_at: new Date(now()).toISOString(), revoked_by: req.user.id, updated_at: new Date(now()).toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .is("revoked_at", null)
        .select(SHARE_ROW_COLUMNS);
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ ok: false, error: "Not found" });
      console.info(
        JSON.stringify({ event: "live_inventory.share.revoked", share_id: id, organization_id: organizationId, user_id: req.user.id })
      );
      res.json({ ok: true, share: toShareListDto(data[0], now()) });
    } catch (e) {
      console.error("[live-inventory-shares] revoke failed", e?.message || e);
      res.status(500).json({ ok: false, error: "Could not revoke the link." });
    }
  });

  app.get("/api/public/live-inventory/shares/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Robots-Tag", "noindex, nofollow");
    const rl = rateLimit(clientIp(req));
    if (!rl.allowed) {
      res.set("Retry-After", String(rl.retryAfterSec));
      return res.status(429).json({ ok: false, error: "Too many requests" });
    }
    try {
      const rawToken = trimStr(req.params.token);
      if (!TOKEN_RE.test(rawToken)) return res.status(404).json(PUBLIC_UNAVAILABLE);
      const supabase = getSupabase();
      const { data: found, error } = await supabase
        .from(TABLE_LIVE_INVENTORY_SHARES)
        .select(SHARE_ROW_COLUMNS)
        .eq("token_hash", hashShareToken(rawToken))
        .limit(1);
      if (error) throw error;
      const share = found?.[0];
      if (!share) return res.status(404).json(PUBLIC_UNAVAILABLE);
      if (shareState(share, now()) !== "active") return res.status(410).json(PUBLIC_UNAVAILABLE);

      const organizationId = share.organization_id;
      const ids = (share.items ?? []).map((i) => String(i.inventory_row_id)).filter((id) => UUID_RE.test(id));
      const sourceFilter = resolveInventorySourceFilter({});
      const scope = (q) => applyInventorySourceFilter(q.eq("organization_id", organizationId), sourceFilter);

      const [{ data: liveRows, error: liveErr }, { data: orgRows }] = await Promise.all([
        ids.length
          ? supabase.from("slab_inventory").select(COLOR_INVENTORY_SELECT_COLUMNS.join(",")).eq("organization_id", organizationId).in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("organizations").select("display_name").eq("id", organizationId).limit(1),
      ]);
      if (liveErr) throw liveErr;
      const active = (liveRows ?? []).filter((r) => r.is_active !== false);
      const [imgRows, geoRows] = await Promise.all([
        fetchSlabImagesForInventoryRows(supabase, scope, active, SLAB_IMAGE_SELECT_COLUMNS),
        fetchRowsForInventorySlabIds(supabase, TABLE_SLAB_PIECE_GEOMETRY, scope, active, GEOMETRY_CARD_COLUMNS).catch(() => []),
      ]);
      const geometryMap = new Map(geoRows.map((g) => [`${trimStr(g.external_source)}|${trimStr(g.external_slab_id)}`, g]));

      const dto = toPublicShareDto({
        share,
        organizationName: orgRows?.[0]?.display_name ?? null,
        liveRows: liveRows ?? [],
        imageMap: buildImageMap(imgRows, sourceFilter),
        geometryMap,
        sourceFilter,
      });

      // Best-effort view tracking (awaited: serverless may drop work after the response).
      const { error: vErr } = await supabase
        .from(TABLE_LIVE_INVENTORY_SHARES)
        .update({ view_count: (Number(share.view_count) || 0) + 1, last_viewed_at: new Date(now()).toISOString() })
        .eq("id", share.id);
      if (vErr) console.warn("[live-inventory-shares] view count failed", vErr.message);

      res.json(dto);
    } catch (e) {
      console.error("[live-inventory-shares] public read failed", e?.message || e);
      res.status(500).json({ ok: false, error: "Something went wrong. Try again shortly." });
    }
  });

  console.log(
    "[live-inventory] mounted POST/GET /api/live-inventory/shares, POST /api/live-inventory/shares/:id/revoke, GET /api/public/live-inventory/shares/:token"
  );
}
