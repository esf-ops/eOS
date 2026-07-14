# Quote Intake Lab — Phase 1 notes

**Date:** 2026-07-14  
**Status:** Implemented (local fixture queue)

## Deviations from Phase 0 BUILD_PLAN.md

| BUILD_PLAN Phase 1 expectation | Phase 1 delivery (human-approved prompt) |
|--------------------------------|------------------------------------------|
| Mount `/api/quote-intake-lab/cases` via `server.js` | **Not mounted.** Editing `server.js` is disallowed for isolation. Frontend uses `FixtureQuoteIntakeRepository`. |
| Auth via head access for queue | **Fixture identity only** (`Lab Estimator` / `lab.estimator@example.com`). Optional Supabase session display deferred — requires env + tsconfig accommodation for `shared/eliteos-supabase` and still cannot call `/api/me` while Express is unmounted. |
| Backend fixture JSON under `backend-core/.../fixtures` | Fixtures live in `app-quote-intake-lab/src/fixtures/` for a clean UI↔repository boundary. Backend has an unmounted README + boundary stub only. |

## AI Takeoff correction (binding)

No AI Takeoff files, APIs, tables, or UI imports were used. Future takeoff work remains Phase 4 + `TakeoffAdapter` only.

## Local run

```bash
cd app-quote-intake-lab
npm install
npm run dev
```

Open [http://127.0.0.1:5196/](http://127.0.0.1:5196/).

## Auth note

| Mode | When |
|------|------|
| `fixture` | Phase 1 — `Lab Estimator` / `lab.estimator@example.com` |

Supabase cookie session chrome can be reintroduced later without changing production auth code, once the lab either mounts Brain routes or accepts a documented tsconfig/`VITE_*` setup for display-only session read.

## Future smallest Brain mount step

After Phase 1 acceptance, the smallest additive integration is:

1. Implement `attachQuoteIntakeLabRoutes` in `backend-core/src/quoteIntakeLab/quoteIntakeLabRoutes.js`.
2. Single import/call in `server.js`.
3. Add `ApiQuoteIntakeRepository` in the head behind `getQuoteIntakeRepository()`.
4. Still omit `launcherHeads.js` / Home card.
