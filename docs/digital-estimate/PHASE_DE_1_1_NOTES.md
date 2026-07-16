# Phase DE.1.1 — Private Elite 100 Estimate Studio Head

**Date:** 2026-07-16
**Status:** Implemented (flags OFF; no DNS/deploy/migration apply; no user grants in source)
**Branch:** `elite-100-digital-estimate`
**Depends on:** DE.1 closure (backend Digital Estimate + public head)

---

## Product decision

Employee Digital Estimate controls moved out of Internal Estimate / Quote Library into a **private pilot head**:

| Item | Value |
|------|-------|
| Product name | Elite 100 Estimate Studio |
| App path | `app-elite100-estimate-studio/` |
| Head slug | `elite100_estimate_studio` |
| Vite port | **5191** |
| Proposed domain | `https://elite100.eliteosfab.com` |
| Env URL | `HEAD_URL_ELITE100_ESTIMATE_STUDIO` |

Public customer portal remains `app-digital-estimate` (`digital.eliteosfab.com`) — **not** in the employee launcher.

---

## Access-control chain (authoritative)

1. Authenticated employee (`requireAuth`)
2. Internal operator (`assertInternalQuoteOperator`)
3. Studio feature flag `ELITE100_ESTIMATE_STUDIO_ENABLED=1`
4. Head access `requireHeadAccess("elite100_estimate_studio")`
5. Server pilot allowlist (`ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS` / `_PILOT_EMAILS`)
6. Organization context for quote reads/publishes
7. Digital Estimate publish/public flags for mutation/public read respectively

Identity and pilot status come **only** from authenticated server context — never body/query/header claims.

`VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED` is UI-only and cannot grant access.

Launcher tile is filtered: Studio appears only when Studio enabled **and** user is on pilot allowlist (even admins with full catalog).

---

## Functionality moved from IE / QL

| Removed from | Item |
|--------------|------|
| Internal Estimate | `DigitalEstimatePanel`, publish button, DE API calls, `VITE_DIGITAL_ESTIMATE_UI_ENABLED` |
| Quote Library | `quote_publication_events` timeline soft-integration |

| Now in Studio | Publish, replace token, revoke, link_copied, history, customer-safe preview, open portal |

---

## Retained DE.1 backend / public

- `backend-core/src/digitalEstimate/**`
- `eliteos_digital_estimate_v1.sql` (unapplied)
- Atomic publish/replace/first-viewed RPCs
- `app-digital-estimate/**`
- Public DTO, tokens, events, print

Staff `/api/digital-estimate/*` now requires Studio feature + head + pilot (same gate as Studio APIs).

---

## Owner grant workflow (after deploy — not executed here)

1. System Admin → Access Scope → assign head `elite100_estimate_studio` to owner user only.
2. Set Brain env pilot user ID (and optional email).
3. Set `ELITE100_ESTIMATE_STUDIO_ENABLED=1` and Digital Estimate flags as needed.
4. Owner opens Home Launcher → Studio tile appears.
5. To revoke: remove head grant and/or clear pilot lists and/or set Studio/DE flags to `0`.

See `PRIVATE_STUDIO_DEPLOYMENT.md`.

---

## Tests

- `node backend-core/src/elite100EstimateStudio/phaseDe11.test.mjs`
- `node app-elite100-estimate-studio/src/phaseDe11.ui.test.mjs`
- Existing DE.1 / IE / QL suites remain green

---

## Out of scope

DE.2, customer configuration, DNS, deploy, migration apply, granting real users, automated email.
