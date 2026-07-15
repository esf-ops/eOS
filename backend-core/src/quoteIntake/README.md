# Quote Intake (live promotion) — Phases 6P.1–6P.4

Flag-gated Quote Intake API with selectable persistence.

- Flag: `QUOTE_INTAKE_API_ENABLED=1` (off by default)
- Repository: `QUOTE_INTAKE_REPOSITORY=memory` (default) | `supabase`
- Prefix: `/api/quote-intake`
- Auth: `requireAuth` + `ai_takeoff` head; optional `QUOTE_INTAKE_PILOT_EMAILS`
- Org: authenticated server context only
- Takeoff: `FakeProductionTakeoffAdapter` only — no pipeline invocation
- Migration (manual, not auto-applied): `backend-core/supabase/eliteos_quote_intake_v1.sql`
- UI (6P.3): Estimator Queue in `app-ai-takeoff` behind `VITE_QUOTE_INTAKE_UI_ENABLED` (visibility only)
- Graph (6P.4): Manual mailbox preview/import behind `QUOTE_INTAKE_GRAPH_ENABLED` + `QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED` (both off by default). Server-only credentials. No polling/Takeoff/Storage.

See `docs/quote-intake-lab/PHASE_6P_*_NOTES.md`.
