# Phase DE.2E — Public Interactive Elite 100 Digital Estimate Configuration

**Date:** 2026-07-16
**Status:** Implemented (flags off; SQL unapplied; no acceptance/sold/email/payment). DE.2F review/amendment is implemented separately — see `PHASE_DE_2F_NOTES.md`. **Do not begin DE.2G.**
**Depends on:** DE.2B–D (activated envelopes + DE.2C engine + Studio builder)

---

## 1. What shipped

| Deliverable | Path |
|-------------|------|
| Public config flags | `publicConfigurationConfig.mjs` |
| Session secret + cookie + Origin helpers | `publicConfigurationSession.mjs` |
| Public configuration service | `publicConfigurationService.mjs` |
| v2 public routes | `publicConfigurationRoutes.js` |
| Additive unapplied migration | `eliteos_digital_estimate_public_configuration_v1.sql` |
| Atomic selection+calc (memory + RPC) | `saveSelectionAndCalculationAtomic` |
| Fragment Studio links | `digitalEstimatePublishService.mjs` → `/e#token` |
| Public UI | `app-digital-estimate` ConfigurationView + fragment exchange |
| Tests | `phaseDe2e.test.mjs`, `phaseDe2e.ui.test.mjs` |

**Not shipped:** acceptance, sold, email, payment, migration apply, flag enablement, real-customer deploy. (DE.2F amendment/review is a separate phase.)

---

## 2. Fragment-token flow

1. Studio publishes → `https://digital.eliteosfab.com/e#<rawToken>`
2. Public SPA reads `location.hash` locally
3. `POST /api/public-digital-estimate/v2/session` with `Authorization: Bearer <rawToken>`
4. Fixed endpoint only; Origin must match configured public head
5. Server sets HttpOnly session cookie; response has no raw session secret
6. SPA `history.replaceState` clears fragment
7. Subsequent calls use cookie + credentials

Legacy DE.1 `GET /api/public-digital-estimate/v1/:token` remains read-only.

---

## 3. Session cookie model

| Property | Value |
|----------|--------|
| Cookie name | `de_cfg_session` |
| Path | `/api/public-digital-estimate/v2` |
| HttpOnly | yes |
| SameSite | Strict |
| Secure | production (or when not explicitly allowing insecure dev cookies) |
| DB storage | `session_secret_hash` SHA-256 only |

CSRF / credentialed protection:

- Strict `Origin` validation on every v2 request
- JSON-only mutations (`Content-Type: application/json`)
- No GET mutations
- Reject missing/unapproved Origin
- Cookie not readable by JS

---

## 4. Public API (v2)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/session` | Bearer publication-token exchange → cookie |
| GET | `/session` | Resume from cookie |
| GET | `/configuration` | Baseline + envelope + selections + calc |
| PUT | `/selections` | Validate + DE.2C + atomic persist |
| POST | `/recalculate` | Same contract as PUT (optional alias) |
| DELETE | `/session` | Clear cookie / revoke session only |

No public activate/clone/edit envelope.

---

## 5. Atomic selection / calculation

Successful PUT:

1. Validate session/publication/active envelope binding
2. Normalize allowlisted selections
3. Optimistic concurrency + idempotency
4. Build trusted DE.2C input server-side
5. Calculate
6. Persist selection + calculation + events atomically (memory rollback / SQL RPC)
7. Update session `latest_calculation_id` + `row_version`

Unapplied RPC: `digital_estimate_save_selection_and_calculation` (service_role, fixed `search_path`).

---

## 6. Lifecycle

- `active` — configure
- `superseded` — envelope replaced; safe “options were updated”; no silent remap
- `expired` / `revoked` / `blocked` — fail closed, generic copy

---

## 7. Flags (default off)

```bash
DIGITAL_ESTIMATE_API_ENABLED=0
DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED=0
DIGITAL_ESTIMATE_CONFIGURATION_ENABLED=0
DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED=0
DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN=0
DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE=0
VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED=false
```

---

## 8. Migration order (do not apply here)

1. `eliteos_digital_estimate_v1.sql`
2. `eliteos_digital_estimate_configuration_v1.sql`
3. `eliteos_digital_estimate_public_configuration_v1.sql`

---

## 9. Rate limiting

Process-local per-IP buckets for exchange / resume / selection / recalc.
**Deployment gate:** distributed limiter required before scaled production; do not claim multi-instance protection from memory maps alone.

---

## 10. Legacy DE.1 sunset

| Item | Plan |
|------|------|
| Path tokens `/e/:token` | Remain read-only behind existing flags |
| New Studio links | Fragment `/e#token` only |
| Path mutation | Never |
| Sunset | After all active publications expire or are re-issued; document operators to prefer fragment |

---

## 11. Exact DE.2F scope (implemented — see PHASE_DE_2F_NOTES.md)

DE.2F added customer review requests, Studio comparison queue, amendment drafts, and atomic re-publication. **Do not begin DE.2G** without instruction.

---

## 12. Tests

```bash
node backend-core/src/digitalEstimate/configuration/phaseDe2e.test.mjs
node backend-core/src/digitalEstimate/configuration/phaseDe2d.test.mjs
node backend-core/src/digitalEstimate/configuration/phaseDe2c.test.mjs
node backend-core/src/digitalEstimate/configuration/phaseDe2b.test.mjs
node backend-core/src/digitalEstimate/phaseDe1.test.mjs
node app-digital-estimate/src/phaseDe1.ui.test.mjs
node app-digital-estimate/src/phaseDe2e.ui.test.mjs
```
