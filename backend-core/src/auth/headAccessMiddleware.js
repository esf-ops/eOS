import { isDealerSafeHeadSlug, isKnownHeadSlug } from "./eosGovernanceConstants.js";
import { resolveHeadAccessContext } from "../me/launcherHeads.js";

const HEAD_ACCESS_DENIED = Object.freeze({
  ok: false,
  error: "You do not have access to this head."
});

/**
 * Head-level gate after `requireAuth()` (and usually `requireRole()`).
 *
 * **Admin bypass** — `role === "admin"` always passes (when active) so incomplete
 * `user_head_access` rows cannot lock operators out of recovery surfaces.
 * Explicit `user_head_access` still controls non-admin users.
 *
 * @param {string} headSlug — must exist in `EOS_HEAD_SLUGS`
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} options
 */
export function requireHeadAccess(headSlug, options = {}) {
  const slug = String(headSlug ?? "").trim();
  if (!isKnownHeadSlug(slug)) {
    throw new Error(`requireHeadAccess: unknown head slug "${headSlug}"`);
  }
  const getSupabase = options.getSupabase;
  if (typeof getSupabase !== "function") {
    throw new Error("requireHeadAccess: options.getSupabase must be a function () => SupabaseClient");
  }

  return async function headAccessMiddleware(req, res, next) {
    try {
      const u = req.user;
      if (!u || !u.id) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      if (u.isActive === false) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      /** Admin bypass prevents accidental lockout; explicit head assignment still controls non-admin users. */
      if (String(u.role ?? "").trim() === "admin") {
        return next();
      }

      const supabase = getSupabase();
      const ctx = await resolveHeadAccessContext(supabase, u);

      if (!ctx.ok) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }
      if (!ctx.active) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      if (ctx.dealer && !isDealerSafeHeadSlug(slug)) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      if (!ctx.actionableGrantSet.has(slug)) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      return next();
    } catch (e) {
      console.error("requireHeadAccess failed", e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}
