# Phase DE.2D — Private Studio Configuration Envelope Builder

**Date:** 2026-07-16
**Status:** Implemented (pilot APIs + Studio UI + tests). **Flags off. SQL not applied.** Public customer configuration is DE.2E — see `PHASE_DE_2E_NOTES.md`.
**Depends on:** DE.2B schema/repos, DE.2C `elite100-config-delta-v1` engine, DE.1.1 Studio pilot chain.

---

## 1. What shipped

| Deliverable | Path |
|-------------|------|
| Trusted context builder | `configurationTrustedContext.mjs` |
| Studio service (create/edit/validate/preview/activate/clone) | `configurationStudioService.mjs` |
| Internal configuration routes | `configurationRoutes.js` (mounted from `quoteRoutes.js`) |
| Atomic calc+event RPC (unapplied) | `digital_estimate_insert_configuration_calculation` in `eliteos_digital_estimate_configuration_v1.sql` |
| Supabase repo contract completion | `configurationRepository.mjs` (draft/graph/clone/list + RPC insert) |
| Studio configuration UI | `app-elite100-estimate-studio/src/ConfigurationWorkspace.tsx` |
| Backend tests | `phaseDe2d.test.mjs` |
| UI static tests | `phaseDe2d.ui.test.mjs` |

**Not shipped:** public customer configuration, sessions/selections for customers, acceptance, amendments, sold, email, payments, live merchandising, calculator cutover, IE/QL/Takeoff/delivery/Pricing Admin changes, migration apply, real pilot grants, DE.2E.

---

## 2. Access chain (every configuration route)

1. Authenticated user (`requireAuth`)
2. Internal operator (`assertInternalQuoteOperator`)
3. `DIGITAL_ESTIMATE_API_ENABLED=1`
4. `DIGITAL_ESTIMATE_CONFIGURATION_ENABLED=1`
5. `ELITE100_ESTIMATE_STUDIO_ENABLED=1`
6. `requireHeadAccess("elite100_estimate_studio")`
7. Pilot user-ID allowlist
8. Optional pilot email allowlist
9. Trusted organization from auth context (never body/query)
10. Org-scoped publication/source estimate

UI flag `VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED` controls **visibility only** (default `false`).

---

## 3. Internal API routes

All under `/api/digital-estimate/configuration/*`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/config` | Safe flag/engine summary |
| GET | `/publications/:publicationId/context` | Trusted baseline + catalog (staff) |
| POST | `/envelopes` | Create draft bound to publication |
| GET | `/envelopes/:id` | Envelope graph |
| GET | `/publications/:publicationId/envelopes` | Version list |
| PATCH | `/envelopes/:id` | Draft metadata + optimistic concurrency |
| PUT | `/envelopes/:id/groups` | Draft groups |
| PUT | `/envelopes/:id/options` | Draft options (IDs/labels; server prices) |
| POST | `/envelopes/:id/validate` | Structural + context blockers |
| POST | `/envelopes/:id/preview` | Staff DE.2C preview (does not activate) |
| POST | `/envelopes/:id/activate` | Atomic activate (`confirm` + `acknowledgeFreeze`) |
| POST | `/envelopes/:id/clone` | Clone active → new draft |
| GET | `/envelopes/:id/events` | Audit events |

No public customer-selection routes.

Rejected from request bodies: prices, rates, tax, totals, account groups, Watt’s/Spahn identity, org IDs, fingerprints, engine version, approver identity. Permitted markup input is requested %/bps + reason; authoritative only after server validation + override audit row.

---

## 4. Trusted context construction

`buildTrustedConfigurationContext` resolves server-side:

- Org + active publication + snapshot
- Baseline customer-safe total / project
- Locked rooms + chargeable SF from publication evidence (`estimate_rooms`)
- Baseline material groups
- `partner_account_id` from source quote header only (no name/email matching)
- Policy fixtures / memberships / overrides / estimate adjustments
- Frozen Direct/Wholesale rates, tax policy, engine + policy/catalog fingerprints
- Server-approved option catalog (customer-safe fields omit sell prices; staff catalog keeps them)

Fail closed / structural blockers when locked SF or baseline group missing — **no guessing / recalculating** the source estimate.

---

## 5. Studio UI workflow

After selecting an eligible publication (existing publish/history unchanged):

A. Baseline summary (locked SF, rooms, mapping notice)
B. Envelope status / version history
C. Room material group defaults (Promo, A–F, Remnant)
D. Server-approved options (unresolved = unavailable / review_required)
E. Pilot material markup % + reason (internal only)
F. Dual preview: internal evidence vs customer-safe
G. Validation blockers
H. Activation with dual confirmation → lock → Clone to edit

Clears sensitive state on 401/403 and publication switch. No `localStorage` for internals. No rates in URLs.

---

## 6. Account-resolution behavior

| Case | Behavior |
|------|----------|
| Trusted `partner_account_id` + Watts membership | Promo **$40/SF** |
| Customer name “Watt’s” only | Ordinary Direct/Wholesale; staff notice |
| Trusted Spahn membership | **+3%** after pre-rounded net (includes tax) |
| No mapping | Ordinary schedule; staff-only “No trusted account pricing mapping” notice |

---

## 7. Markup authorization

- Default 0
- Nonzero requires reason
- Server writes estimator override audit (`pilotOnly`)
- Never in customer-safe preview
- Labeled pilot/internal — not generally approved production policy

---

## 8. Activation / clone / supersession

Uses DE.2B atomic activation (memory transactional + SQL RPC). One active envelope per publication. Prior active superseded only by explicit replacement activation. Clone gets new IDs/version; source unchanged. Publication snapshots/tokens/quotes untouched.

---

## 9. Calculation / event atomicity

Sequential insert+event was a partial-failure risk. DE.2D adds:

- Unapplied RPC `digital_estimate_insert_configuration_calculation` (fixed `search_path`, `service_role` only, org/selection consistency, idempotent fingerprint reuse)
- Memory repository checkpoint/rollback parity
- Supabase `insertCalculation` calls the RPC

Studio staff preview itself does **not** require selection persistence; persistence path is ready for DE.2E sessions.

---

## 10. Feature flags (all default off)

```bash
DIGITAL_ESTIMATE_API_ENABLED=0
DIGITAL_ESTIMATE_CONFIGURATION_ENABLED=0
ELITE100_ESTIMATE_STUDIO_ENABLED=0
# Vite (UI only)
VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED=false
VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED=false
```

No real pilot grants. No production account mappings. SQL not applied.

---

## 11. Tests

```bash
node backend-core/src/digitalEstimate/configuration/phaseDe2d.test.mjs
node backend-core/src/digitalEstimate/configuration/phaseDe2c.test.mjs
node backend-core/src/digitalEstimate/configuration/phaseDe2b.test.mjs
node backend-core/src/digitalEstimate/phaseDe1.test.mjs
node backend-core/src/elite100EstimateStudio/phaseDe11.test.mjs
node app-elite100-estimate-studio/src/phaseDe11.ui.test.mjs
node app-elite100-estimate-studio/src/phaseDe2d.ui.test.mjs
node app-digital-estimate/src/phaseDe1.ui.test.mjs
npm run eos:test:quote-output-gate
```

---

## 12. Follow-on

DE.2E public configuration is implemented separately (`PHASE_DE_2E_NOTES.md`). Do not begin DE.2F without instruction.
