# quoteIntakeLab (unmounted — Phase 1)

Additive scaffold for future `/api/quote-intake-lab/*` routes.

## Phase 1 status

**Not mounted.** `backend-core/src/server.js` was intentionally left unchanged so production Express registration, middleware, CORS, and deployment wiring stay untouched.

Phase 1 serves the estimator queue from an in-app `FixtureQuoteIntakeRepository` inside `app-quote-intake-lab/`. No Brain HTTP API is required to run the lab locally.

## Future registration point (do not do in Phase 1)

When an approved later phase mounts the API:

1. Add `quoteIntakeLabRoutes.js` exporting `attachQuoteIntakeLabRoutes(app, deps)`.
2. Import and call it from `server.js` (single additive registration).
3. Gate with `requireAuth()` (+ later `requireHeadAccess("quote_intake_lab")` if slug is registered).
4. Still omit Home Launcher / `launcherHeads.js` until explicitly approved.

## Files here

| File | Purpose |
|------|---------|
| `README.md` | This note |
| `phase1Boundary.mjs` | Documents Phase 1 boundary helpers / future attach signature (no Express attach) |
| `phase31LiveBoundary.mjs` | Phase 3.1 note: live Gemini host is `app-quote-intake-lab/server` (loopback), not Brain |

## Phase 3.1 live AI

Live classification runs on an isolated lab server under `app-quote-intake-lab/server/` (`npm run live-server`). It is **not** registered in `server.js`.

Do not write production tables from this module.
