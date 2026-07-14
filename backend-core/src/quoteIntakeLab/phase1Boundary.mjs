/**
 * Quote Intake Lab — Phase 1 boundary markers (unmounted).
 *
 * This module is intentionally not imported by server.js.
 * When a later phase mounts routes, replace this stub with
 * `attachQuoteIntakeLabRoutes(app, { requireAuth, requireHeadAccess, getSupabase })`
 * following installDashboard / hrWorkforce patterns.
 *
 * Phase 1 frontend data path:
 *   app-quote-intake-lab → FixtureQuoteIntakeRepository → fixtures
 *
 * Forbidden in Phase 1 (and until explicitly approved later):
 *   - quote_headers / Quote Library writes
 *   - production takeoff tables / /api/takeoff*
 *   - calculateQuote / Resend / Microsoft Graph
 *   - Home Launcher registration
 */

export const QUOTE_INTAKE_LAB_API_PREFIX = "/api/quote-intake-lab";

export const PHASE1_MOUNT_STATUS = Object.freeze({
  mounted: false,
  reason:
    "Phase 1 keeps Express unmounted to avoid editing server.js / production registration. Use FixtureQuoteIntakeRepository in the lab head.",
  futureAttach: "attachQuoteIntakeLabRoutes"
});

/**
 * Placeholder document for the future attach function signature.
 * Not registered. Calling this throws to prevent accidental use.
 */
export function attachQuoteIntakeLabRoutes() {
  throw new Error(
    "quoteIntakeLab routes are not mounted in Phase 1. Use app-quote-intake-lab FixtureQuoteIntakeRepository."
  );
}
