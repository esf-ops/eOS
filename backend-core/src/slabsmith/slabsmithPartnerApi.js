/**
 * Elite-controlled Slabsmith partner API (v1).
 *
 * Thryve (or other integrators) call Brain — not Slabsmith SQL / VPN.
 *
 * READ: inventory + images from the eliteOS Slabsmith cache (connector ingest).
 * WRITE: optional gated intake into slabsmith_partner_write_requests. Does NOT
 * apply SQL to Slabsmith until a separate Windows apply worker + explicit
 * SLABSMITH_PARTNER_WRITE_ENABLED=1 + schema allowlist are approved.
 */

import express from "express";

import {
  buildImageMap,
  lookupInventoryImage,
  SLAB_IMAGE_SELECT_COLUMNS,
} from "../slabInventory/slabInventoryImageResolver.js";
import {
  isSlabsmithPartnerWriteEnabled,
  SLABSMITH_PARTNER_WRITE_ENABLED_ENV,
  validateSlabsmithPartnerAccess,
} from "./slabsmithPartnerAuth.js";

/** Partner reads always scope to Slabsmith-cache rows (not SlabCloud). */
const PARTNER_SOURCE_FILTER = Object.freeze({
  resolved: "slabsmith",
  mode: "single",
  externalSource: "slabsmith",
  invalidInputIgnored: false,
});

export const SLABSMITH_PARTNER_BASE = "/api/integrations/slabsmith/partner/v1";
export const TABLE_INVENTORY = "slab_inventory";
export const TABLE_IMAGES = "slab_images";
export const TABLE_WRITE_REQUESTS = "slabsmith_partner_write_requests";

/** Partner-visible inventory columns (explicit DTO — no SELECT *). */
export const PARTNER_INVENTORY_SELECT = Object.freeze([
  "id",
  "external_source",
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
  "source_inventory_type",
  "is_active",
  "updated_at",
]);

/**
 * Allowlisted write fields for intake (applied later by Windows worker).
 * Values are stored as proposed patches only in v1.
 */
export const PARTNER_WRITE_ALLOWLIST = Object.freeze([
  "status",
  "rack",
  "lot",
  "finish",
  "price_group",
  "notes",
]);

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function trimStr(v) {
  return v == null ? "" : String(v).trim();
}

function clampLimit(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function clampOffset(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ image_url?: string|null, thumbnail_url?: string|null, image_status?: string|null, image_url_pattern?: string|null }|null} image
 */
export function mapPartnerInventoryRow(row, image = null) {
  const r = row || {};
  const img = image || {};
  return {
    eliteos_id: r.id ?? null,
    external_source: r.external_source ?? null,
    external_slab_id: r.external_slab_id ?? null,
    inventory_id: r.inventory_id ?? null,
    color_name: r.color_name ?? null,
    material_name: r.material_name ?? null,
    distributor: r.distributor ?? null,
    price_group: r.price_group ?? null,
    thickness_nominal: r.thickness_nominal ?? null,
    rack: r.rack ?? null,
    lot: r.lot ?? null,
    width_actual_in: r.width_actual_in ?? null,
    length_actual_in: r.length_actual_in ?? null,
    inventory_type: r.source_inventory_type ?? null,
    is_active: r.is_active !== false,
    updated_at: r.updated_at ?? null,
    image_url: img.image_url ?? null,
    thumbnail_url: img.thumbnail_url ?? null,
    image_status: img.image_status ?? "unknown",
    image_url_pattern: img.image_url_pattern ?? null,
  };
}

/**
 * @param {unknown} operations
 */
export function normalizePartnerWriteOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { ok: false, error: "operations must be a non-empty array" };
  }
  if (operations.length > 20) {
    return { ok: false, error: "operations exceeds max of 20" };
  }

  /** @type {Array<{ field: string, value: string|null }>} */
  const out = [];
  const seen = new Set();

  for (const op of operations) {
    const field = trimStr(op?.field ?? op?.name);
    if (!PARTNER_WRITE_ALLOWLIST.includes(field)) {
      return {
        ok: false,
        error: `field not allowlisted: ${field || "(empty)"}. Allowed: ${PARTNER_WRITE_ALLOWLIST.join(", ")}`,
      };
    }
    if (seen.has(field)) {
      return { ok: false, error: `duplicate field: ${field}` };
    }
    seen.add(field);

    let value = op?.value;
    if (value === undefined) {
      return { ok: false, error: `missing value for field: ${field}` };
    }
    if (value === null) {
      out.push({ field, value: null });
      continue;
    }
    const asStr = String(value).trim();
    if (asStr.length > 500) {
      return { ok: false, error: `value too long for field: ${field}` };
    }
    out.push({ field, value: asStr === "" ? null : asStr });
  }

  return { ok: true, operations: out };
}

/**
 * Strip secrets from any partner response payload.
 * @param {unknown} payload
 */
export function sanitizePartnerResponse(payload) {
  const banned = [
    "SLABSMITH_PARTNER_API_TOKEN",
    "SLABSMITH_SYNC_TOKEN",
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
  ];
  const json = JSON.stringify(payload ?? {});
  for (const b of banned) {
    if (json.includes(b)) {
      return { ok: false, error: "response sanitization blocked secret leakage" };
    }
  }
  return payload;
}

/**
 * @param {import("express").Application} app
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachSlabsmithPartnerRoutes(app, { getSupabase }) {
  const jsonParser = express.json({ limit: "256kb" });

  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   * @param {import("express").NextFunction} next
   */
  function requirePartner(req, res, next) {
    const auth = validateSlabsmithPartnerAccess(req);
    if (!auth.ok) {
      return res.status(auth.status).json(sanitizePartnerResponse({ ok: false, error: auth.error }));
    }
    req.slabsmithPartner = { organizationId: auth.organizationId };
    return next();
  }

  app.get(`${SLABSMITH_PARTNER_BASE}/health`, requirePartner, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(
      sanitizePartnerResponse({
        ok: true,
        service: "slabsmith_partner_v1",
        organization_id: req.slabsmithPartner.organizationId,
        read_enabled: true,
        write_enabled: isSlabsmithPartnerWriteEnabled(),
        write_gate_env: SLABSMITH_PARTNER_WRITE_ENABLED_ENV,
        inventory_source: "slabsmith",
        allowlisted_write_fields: PARTNER_WRITE_ALLOWLIST,
      })
    );
  });

  app.get(`${SLABSMITH_PARTNER_BASE}/inventory`, requirePartner, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const db = getSupabase();
      const organizationId = req.slabsmithPartner.organizationId;
      const limit = clampLimit(req.query.limit);
      const offset = clampOffset(req.query.offset);
      const inventoryId = trimStr(req.query.inventory_id);
      const externalSlabId = trimStr(req.query.external_slab_id);
      const updatedSince = trimStr(req.query.updated_since);
      const activeOnly = String(req.query.active ?? "1").trim() !== "0";

      let q = db
        .from(TABLE_INVENTORY)
        .select(PARTNER_INVENTORY_SELECT.join(","), { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("external_source", "slabsmith");

      if (activeOnly) q = q.eq("is_active", true);
      if (inventoryId) q = q.eq("inventory_id", inventoryId);
      if (externalSlabId) q = q.eq("external_slab_id", externalSlabId);
      if (updatedSince) q = q.gte("updated_at", updatedSince);

      q = q
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);

      const { data: rows, error, count } = await q;
      if (error) {
        if (String(error.message || "").includes("does not exist")) {
          return res.status(503).json(
            sanitizePartnerResponse({
              ok: false,
              installed: false,
              error: "Slab inventory cache not installed",
            })
          );
        }
        throw error;
      }

      const slabIds = (rows ?? []).map((r) => trimStr(r.external_slab_id)).filter(Boolean);
      let imageMap = new Map();
      if (slabIds.length) {
        const { data: imgRows, error: imgErr } = await db
          .from(TABLE_IMAGES)
          .select(SLAB_IMAGE_SELECT_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("external_source", "slabsmith")
          .in("external_slab_id", slabIds);
        if (imgErr) throw imgErr;
        imageMap = buildImageMap(imgRows ?? [], PARTNER_SOURCE_FILTER);
      }

      const mapped = (rows ?? []).map((r) =>
        mapPartnerInventoryRow(r, lookupInventoryImage(imageMap, r, PARTNER_SOURCE_FILTER))
      );

      res.json(
        sanitizePartnerResponse({
          ok: true,
          installed: true,
          rows: mapped,
          total: Number(count || 0),
          limit,
          offset,
        })
      );
    } catch (e) {
      res.status(500).json(sanitizePartnerResponse({ ok: false, error: String(e?.message || e) }));
    }
  });

  app.get(`${SLABSMITH_PARTNER_BASE}/inventory/:key`, requirePartner, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const db = getSupabase();
      const organizationId = req.slabsmithPartner.organizationId;
      const key = trimStr(req.params.key);
      if (!key) {
        return res.status(400).json(sanitizePartnerResponse({ ok: false, error: "key required" }));
      }

      const base = () =>
        db
          .from(TABLE_INVENTORY)
          .select(PARTNER_INVENTORY_SELECT.join(","))
          .eq("organization_id", organizationId)
          .eq("external_source", "slabsmith");

      let row = null;
      {
        const byExternal = await base().eq("external_slab_id", key).maybeSingle();
        if (byExternal.error) throw byExternal.error;
        row = byExternal.data;
      }
      if (!row) {
        const byInventory = await base().eq("inventory_id", key).maybeSingle();
        if (byInventory.error) throw byInventory.error;
        row = byInventory.data;
      }
      if (!row) {
        return res.status(404).json(sanitizePartnerResponse({ ok: false, error: "not found" }));
      }

      let image = null;
      const sid = trimStr(row.external_slab_id);
      if (sid) {
        const { data: imgRows, error: imgErr } = await db
          .from(TABLE_IMAGES)
          .select(SLAB_IMAGE_SELECT_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("external_source", "slabsmith")
          .eq("external_slab_id", sid);
        if (imgErr) throw imgErr;
        const imageMap = buildImageMap(imgRows ?? [], PARTNER_SOURCE_FILTER);
        image = lookupInventoryImage(imageMap, row, PARTNER_SOURCE_FILTER);
      }

      res.json(
        sanitizePartnerResponse({
          ok: true,
          row: mapPartnerInventoryRow(row, image),
        })
      );
    } catch (e) {
      res.status(500).json(sanitizePartnerResponse({ ok: false, error: String(e?.message || e) }));
    }
  });

  app.post(
    `${SLABSMITH_PARTNER_BASE}/write-requests`,
    requirePartner,
    jsonParser,
    async (req, res) => {
      try {
        res.set("Cache-Control", "no-store");

        if (!isSlabsmithPartnerWriteEnabled()) {
          return res.status(403).json(
            sanitizePartnerResponse({
              ok: false,
              error: `Write disabled. Set ${SLABSMITH_PARTNER_WRITE_ENABLED_ENV}=1 after SQL apply + Windows apply worker are ready. No Slabsmith SQL mutation occurs through this API alone.`,
              write_enabled: false,
            })
          );
        }

        const externalSlabId = trimStr(req.body?.external_slab_id);
        const inventoryId = trimStr(req.body?.inventory_id);
        if (!externalSlabId && !inventoryId) {
          return res.status(400).json(
            sanitizePartnerResponse({
              ok: false,
              error: "external_slab_id or inventory_id required",
            })
          );
        }

        const normalized = normalizePartnerWriteOperations(req.body?.operations);
        if (!normalized.ok) {
          return res.status(400).json(sanitizePartnerResponse({ ok: false, error: normalized.error }));
        }

        const clientRequestId = trimStr(req.body?.client_request_id) || null;
        if (clientRequestId && clientRequestId.length > 128) {
          return res.status(400).json(
            sanitizePartnerResponse({ ok: false, error: "client_request_id too long" })
          );
        }

        const db = getSupabase();
        const organizationId = req.slabsmithPartner.organizationId;

        const base = () =>
          db
            .from(TABLE_INVENTORY)
            .select("id,external_slab_id,inventory_id")
            .eq("organization_id", organizationId)
            .eq("external_source", "slabsmith");

        let inv = null;
        if (inventoryId) {
          const byInv = await base().eq("inventory_id", inventoryId).maybeSingle();
          if (byInv.error) throw byInv.error;
          inv = byInv.data;
          if (!inv) {
            const byExt = await base().eq("external_slab_id", inventoryId).maybeSingle();
            if (byExt.error) throw byExt.error;
            inv = byExt.data;
          }
        }
        if (!inv && externalSlabId) {
          const byExt = await base().eq("external_slab_id", externalSlabId).maybeSingle();
          if (byExt.error) throw byExt.error;
          inv = byExt.data;
        }
        if (!inv) {
          return res.status(404).json(
            sanitizePartnerResponse({
              ok: false,
              error: "inventory row not found in eliteOS Slabsmith cache",
            })
          );
        }

        if (clientRequestId) {
          const existing = await db
            .from(TABLE_WRITE_REQUESTS)
            .select("id,status,apply_status,created_at")
            .eq("organization_id", organizationId)
            .eq("client_request_id", clientRequestId)
            .maybeSingle();
          if (existing.error && !String(existing.error.message || "").includes("does not exist")) {
            throw existing.error;
          }
          if (existing.data) {
            return res.status(200).json(
              sanitizePartnerResponse({
                ok: true,
                deduped: true,
                write_request: existing.data,
                note: "Idempotent replay — no new write request created.",
              })
            );
          }
        }

        const insertPayload = {
          organization_id: organizationId,
          client_request_id: clientRequestId,
          slab_inventory_id: inv.id,
          external_slab_id: inv.external_slab_id,
          inventory_id: inv.inventory_id,
          operations: normalized.operations,
          status: "accepted",
          apply_status: "queued_pending_worker",
          source: "partner_api_v1",
        };

        const { data: inserted, error: insertErr } = await db
          .from(TABLE_WRITE_REQUESTS)
          .insert(insertPayload)
          .select("id,status,apply_status,created_at,external_slab_id,inventory_id,operations")
          .single();

        if (insertErr) {
          if (String(insertErr.message || "").includes("does not exist")) {
            return res.status(503).json(
              sanitizePartnerResponse({
                ok: false,
                installed: false,
                error: "Write request table not installed. Apply eliteos_slabsmith_partner_write_requests_v1.sql",
              })
            );
          }
          throw insertErr;
        }

        res.status(202).json(
          sanitizePartnerResponse({
            ok: true,
            write_request: inserted,
            note: "Accepted into eliteOS queue. Slabsmith SQL is not mutated until the Windows apply worker processes this row.",
          })
        );
      } catch (e) {
        res.status(500).json(sanitizePartnerResponse({ ok: false, error: String(e?.message || e) }));
      }
    }
  );

  app.get(`${SLABSMITH_PARTNER_BASE}/write-requests/:id`, requirePartner, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const id = trimStr(req.params.id);
      if (!id) {
        return res.status(400).json(sanitizePartnerResponse({ ok: false, error: "id required" }));
      }
      const db = getSupabase();
      const organizationId = req.slabsmithPartner.organizationId;
      const { data, error } = await db
        .from(TABLE_WRITE_REQUESTS)
        .select(
          "id,status,apply_status,created_at,updated_at,external_slab_id,inventory_id,operations,last_error,applied_at"
        )
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (String(error.message || "").includes("does not exist")) {
          return res.status(503).json(
            sanitizePartnerResponse({ ok: false, installed: false, error: "Write request table not installed" })
          );
        }
        throw error;
      }
      if (!data) {
        return res.status(404).json(sanitizePartnerResponse({ ok: false, error: "not found" }));
      }
      res.json(sanitizePartnerResponse({ ok: true, write_request: data }));
    } catch (e) {
      res.status(500).json(sanitizePartnerResponse({ ok: false, error: String(e?.message || e) }));
    }
  });

  console.log(
    `[slabsmith-partner] mounted ${SLABSMITH_PARTNER_BASE}/health, /inventory, /inventory/:key, /write-requests`
  );
}
