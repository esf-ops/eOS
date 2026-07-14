/**
 * Phase 3.1 live AI boundary note (unmounted).
 *
 * The live Gemini intelligence server intentionally lives under
 * `app-quote-intake-lab/server/` (loopback-only, separate process).
 *
 * This file documents that backend-core/server.js is NOT the host for Phase 3.1
 * live classification. Do not mount routes here until a later approved phase.
 */

export const PHASE_31_LIVE_HOST = "app-quote-intake-lab/server";
export const PHASE_31_MOUNTED_IN_BRAIN = false;

export function describePhase31Boundary() {
  return {
    liveHost: PHASE_31_LIVE_HOST,
    mountedInBrain: PHASE_31_MOUNTED_IN_BRAIN,
    note: "Use npm run live-server inside app-quote-intake-lab. Do not register in server.js."
  };
}
