# Quote Intake (live promotion) — Phase 6P.1 / 6P.2

Flag-gated Quote Intake API with selectable persistence.

- Flag: `QUOTE_INTAKE_API_ENABLED=1` (off by default)
- Repository: `QUOTE_INTAKE_REPOSITORY=memory` (default) | `supabase`
- Prefix: `/api/quote-intake`
- Auth: `requireAuth` + `ai_takeoff` head; optional `QUOTE_INTAKE_PILOT_EMAILS`
- Org: authenticated server context only
- Takeoff: `FakeProductionTakeoffAdapter` only — no pipeline invocation
- Migration (manual, not auto-applied): `backend-core/supabase/eliteos_quote_intake_v1.sql`

See `docs/quote-intake-lab/PHASE_6P_1_NOTES.md` and `PHASE_6P_2_NOTES.md`.
