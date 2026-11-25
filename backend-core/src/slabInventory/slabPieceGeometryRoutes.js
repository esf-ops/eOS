/**
 * Internal piece-geometry derivation (cron-secret gated). Vercel Cron invokes GET.
 * GET|POST /api/internal/slab-inventory/geometry/derive[?limit=150]
 *
 * Reads slab_inventory + slab_images, fetches eliteOS-hosted Slabsmith photos,
 * writes only slab_piece_geometry. No provider calls.
 */

import { validateCronSecret } from "../takeoff/takeoffInternalRoutes.js";
import { runSlabGeometryDerivation } from "./slabPieceGeometryJob.js";

export const SLAB_GEOMETRY_DERIVE_ROUTE = "/api/internal/slab-inventory/geometry/derive";
const MAX_LIMIT = 600;

export function attachSlabPieceGeometryRoutes(app, deps = {}) {
  const env = deps.env ?? process.env;

  async function handler(req, res) {
    res.set("Cache-Control", "no-store");
    const secretCheck = validateCronSecret(req, env);
    if (!secretCheck.ok) return res.status(secretCheck.status).json({ ok: false, error: secretCheck.error });

    const supabase = deps.getSupabase?.();
    if (!supabase) return res.status(503).json({ ok: false, error: "Supabase unavailable", code: "store_unavailable" });

    const requested = Number(req.query?.limit);
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(MAX_LIMIT, Math.floor(requested)) : 150;
    try {
      const result = await runSlabGeometryDerivation({ db: supabase, limit });
      console.log(JSON.stringify({ slab_geometry_derive: true, ...result, sample_errors: result.sample_errors.length }));
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 500);
      console.error(JSON.stringify({ slab_geometry_derive_failed: true, error: msg }));
      return res.status(500).json({ ok: false, error: "Geometry derivation failed.", code: "geometry_derive_failed" });
    }
  }

  app.get(SLAB_GEOMETRY_DERIVE_ROUTE, handler);
  app.post(SLAB_GEOMETRY_DERIVE_ROUTE, handler);
}
