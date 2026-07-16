# Phase DE.2A — API and Security

**Date:** 2026-07-16
**Status:** Documentation only
**Depends on:** Configuration model + data model

---

## 1. Authz summary

| Surface | Auth |
|---------|------|
| Studio envelope APIs | Same chain as DE.1.1: auth + internal operator + Studio enabled + head `elite100_estimate_studio` + pilot allowlist + org scope |
| Public configuration APIs | Publication token authority only (improved transport — §5); public-read flag; rate limit |
| IE / QL | Unchanged; no new DE configuration hooks |

Never trust body/query/header for `organization_id`, user id, pilot status, prices, markup, or rule ids.

---

## 2. Internal Studio API contracts (proposed)

Base prefix: `/api/elite100-estimate-studio/configurations` (exact paths flexible in DE.2B)

| Method | Purpose |
|--------|---------|
| `POST .../envelopes` | Create draft envelope for a publication |
| `PATCH .../envelopes/:id` | Edit draft groups/options (not after active) |
| `POST .../envelopes/:id/validate` | Server validate completeness/compat |
| `GET .../envelopes/:id/preview` | Staff preview of customer-visible options + sell presentation |
| `POST .../envelopes/:id/activate` | Freeze catalog economics; set active; confirm required |
| `GET .../publications/:id/envelopes` | List versions |
| `GET .../envelopes/:id/sessions` | Inspect customer sessions |
| `GET .../calculations/:id` | Staff view customer result + internal evidence |
| `GET .../calculations/:id/compare` | Diff vs baseline publication totals |
| `POST .../amendments` | **Stub/later** — structured estimator amendment (out of DE.2 core UI) |

All mutations: explicit `confirm` where destructive; audit events; no `quote_headers` writes.

---

## 3. Public API contracts (proposed)

Base prefix: `/api/public-digital-estimate/v1/...` (evolve carefully)

| Method | Purpose |
|--------|---------|
| `GET` resolve publication | Existing DE.1 read-only DTO (keep) |
| `POST .../sessions` | Start/resume configuration session for token + active envelope |
| `GET .../sessions/:id/options` | List **only** frozen allowed options |
| `POST .../sessions/:id/selections` | Submit selections (idempotency-key header) |
| `POST .../sessions/:id/calculate` | Server recalculate → immutable calc (or combine with selections) |
| `GET .../sessions/:id/current` | Retrieve latest saved customer-safe draft result |

Public responses: allowlisted DTO only (extend DE.1 serializer rules). No evidence, no costs, no org ids as authority.

---

## 4. Fail-closed matrix

| Condition | Public | Studio |
|-----------|--------|--------|
| Flag off | 404 generic | 404 generic |
| Bad/revoked token | 404 | n/a |
| No active envelope | 404 or empty configure capability | 400 on activate misuse |
| Option outside envelope | 400 | n/a |
| Stale session version | 409 | |
| Cross-org | 404 | 404 |
| Client price/markup/org | 400 forbidden fields | 400 |
| Engine/catalog mismatch | 409/422 | 422 on activate |

Event-write failures on public read paths: fail-open for **read-only** views; fail-closed for **pricing submits** (must persist calc).

---

## 5. Token-path logging risk — DE.2 mitigation

### Problem (DE.1)

Raw token in path (`/e/:token`, `/api/public-digital-estimate/v1/:token`) appears in **CDN/proxy/platform access logs**. Application redaction does not control hosting logs.

### Options

| Approach | Pros | Cons |
|----------|------|------|
| Path token (status quo) | Simple | Access-log exposure |
| Query `?t=` | — | Worse (Referer leakage) |
| **URL fragment** `/e#<token>` | Fragment not sent to server on static asset fetch | Requires SPA to read hash; first navigation must not put token in path |
| Header `Authorization: Bearer` / `X-Estimate-Token` | Never in URL | Needs POST/GET with custom header (CORS) |
| POST body token exchange → short-lived session cookie | Strong | Cookie CSRF design; more moving parts |

### Recommended DE.2 approach (exact)

1. **Public head routes:** `https://digital.eliteosfab.com/e` (no path token).
2. Customer link format: `https://digital.eliteosfab.com/e#<rawToken>` (fragment only).
3. SPA reads `location.hash`, strips `#`, holds token in memory (not `localStorage`).
4. API calls send token via **`Authorization: Bearer <rawToken>`** (or `X-Digital-Estimate-Token`) on Brain origin; **never** as path or query.
5. Optional: `POST /api/public-digital-estimate/v1/session` exchanges token for HttpOnly `__Host-` session cookie scoped to API host — **phase after** header approach proves out.
6. Keep `Referrer-Policy: no-referrer` and strict CSP on HTML + API.
7. **Transition:** Support DE.1 path tokens in parallel behind a sunset flag; rewrite UX to fragment links for new publishes from Studio; log metric when path form used.
8. Never put token in analytics, errors, audit metadata, or QL timeline.

Studio “copy link” must emit **fragment** links once DE.2 ships.

---

## 6. Public DTO forbidden fields (extend DE.1)

Continue asserting absence of: wholesale, cost, margin, markup, rule ids, organization internals, pricing evidence, raw token, full IP, raw UA, calculator warnings dumps.

---

## 7. Concurrency & idempotency

- Envelope activate: transactional; one active per publication (partial unique).
- Selection submit: `Idempotency-Key` + selection hash unique per session.
- Concurrent replace of DE.1 tokens remains atomic (existing RPC).

---

## 8. Logging

- Reuse path redaction helpers; prefer no token in URL so redaction is defense-in-depth only.
- Studio logs: publication id, envelope id, event type — never raw token or full snapshots.
