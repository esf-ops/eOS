# Quote Intake (live promotion) — Phase 6P.1 / 6P.2 (+ 6P.3 UI host)

Flag-gated Quote Intake API with selectable persistence.

- Flag: `QUOTE_INTAKE_API_ENABLED=1` (off by default)
- Repository: `QUOTE_INTAKE_REPOSITORY=memory` (default) | `supabase`
- Prefix: `/api/quote-intake`
- Auth: `requireAuth` + `ai_takeoff` head; optional `QUOTE_INTAKE_PILOT_EMAILS`
- Org: authenticated server context only
- Takeoff: `FakeProductionTakeoffAdapter` only — no pipeline invocation
- Migration (manual, not auto-applied): `backend-core/supabase/eliteos_quote_intake_v1.sql`
- UI (6P.3): Estimator Queue in `app-ai-takeoff` behind `VITE_QUOTE_INTAKE_UI_ENABLED` (visibility only)

See `docs/quote-intake-lab/PHASE_6P_1_NOTES.md`, `PHASE_6P_2_NOTES.md`, and `PHASE_6P_3_NOTES.md`.
