# Phase DE.2A — Data Model (Proposed)

**Date:** 2026-07-16
**Status:** Documentation only — **no migrations in DE.2A**
**Depends on:** Configuration model + pricing audit

Names below are proposals; DE.2B may rename for consistency with `quote_publication_*` conventions.

---

## 1. Design principles

1. **Additive** tables only; never alter IE production math tables’ meaning.
2. **Organization-scoped** every row (`organization_id` NOT NULL).
3. **Bind to publication**, not to mutable “current” quote header alone.
4. **Immutable** activated envelopes, selection snapshots, and calculation documents.
5. **No raw tokens** on any configuration table (reuse DE.1 token store).
6. **No writes** to `quote_headers` from configuration APIs.
7. **RLS** enabled; revoke anon/authenticated table privileges; Brain service_role + org filters.
8. Prefer **append-only events** for audit.

---

## 2. Proposed tables

### 2.1 `digital_estimate_configuration_envelopes`

Lifecycle header for an allowlist version bound to a publication.

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `organization_id` | NOT NULL, immutable |
| `publication_id` | FK → `quote_publications` ON DELETE RESTRICT |
| `source_quote_id` | denormalized from publication |
| `envelope_version` | int ≥ 1 |
| `status` | draft \| ready \| active \| superseded \| expired |
| `baseline_customer_snapshot_hash` | from publication |
| `baseline_pricing_evidence_hash` | from publication |
| `pricing_engine_version` | e.g. `elite100_config_delta_v1` |
| `catalog_freeze_id` / json | frozen rates + option economics |
| `pricing_valid_through` | date |
| `activated_at` / `activated_by_user_id` | |
| `superseded_by_envelope_id` | nullable FK |
| `created_at` / `updated_at` | |

**Partial unique:** one `active` envelope per `publication_id`.

### 2.2 `digital_estimate_configuration_groups`

| Column | Notes |
|--------|-------|
| `id` | uuid |
| `organization_id` | |
| `envelope_id` | FK cascade from envelope (only while draft — or copy-on-activate pattern) |
| `group_key` | e.g. `material_color`, `sink_package` |
| `display_label` | |
| `selection_mode` | single \| multi |
| `required` | bool |
| `mutually_exclusive` | bool |
| `sort_order` | int |

**Immutability:** On activate, either freeze groups as immutable or clone draft → immutable active graph (recommended: **clone on activate** so drafts remain editable).

### 2.3 `digital_estimate_configuration_options`

| Column | Notes |
|--------|-------|
| `id` | uuid |
| `organization_id` | |
| `envelope_id` | |
| `group_id` | |
| `option_key` | stable within envelope |
| `display_label` / `description` | customer-safe |
| `image_asset_ref` | optional |
| `min_qty` / `max_qty` | |
| `default_qty` | |
| `included_in_baseline` | bool |
| `customer_price_treatment` | included \| absolute \| delta |
| `sell_price_cents` or decimal | frozen at activate |
| `cost_basis_cents` | internal only |
| `compatibility_json` | constraints |
| `source_catalog_ref` | opaque reference to Admin/slab/product id at freeze time |
| `is_active_in_envelope` | |

### 2.4 `digital_estimate_configuration_sessions`

Mutable customer workspace.

| Column | Notes |
|--------|-------|
| `id` | uuid |
| `organization_id` | |
| `publication_id` | |
| `envelope_id` | must be active |
| `access_token_id` | FK to DE.1 token row (hash-backed auth) — **not** raw token |
| `status` | configuring \| saved \| expired \| abandoned |
| `row_version` | optimistic concurrency |
| `last_client_idempotency_key` | |
| `expires_at` | |
| `created_at` / `updated_at` | |

### 2.5 `digital_estimate_configuration_selections`

Immutable selection document when customer saves (or each priced submit).

| Column | Notes |
|--------|-------|
| `id` | uuid |
| `organization_id` | |
| `session_id` | |
| `envelope_id` | |
| `selection_payload_json` | allowlisted option_key → qty |
| `selection_hash` | sha256 canonical |
| `created_at` | |

### 2.6 `digital_estimate_configuration_calculations`

Immutable calculation output.

| Column | Notes |
|--------|-------|
| `id` | uuid |
| `organization_id` | |
| `selection_id` | 1:1 or N:1 if repriced (prefer 1:1) |
| `engine_version` | |
| `customer_result_json` | public-safe DTO fragment |
| `internal_evidence_json` | costs/margins — never public |
| `baseline_total` / `configured_total` | |
| `pricing_valid_through` | |
| `created_at` | |

Trigger: content immutable after insert (mirror DE.1 snapshot pattern).

### 2.7 `digital_estimate_configuration_events`

Append-only: `envelope_created`, `envelope_activated`, `session_started`, `selection_saved`, `calculated`, `superseded`, `expired`, `review_flagged`, …

Metadata must not contain raw tokens or full estimate bodies.

---

## 3. Relationships (logical)

```text
quote_publications 1──1 quote_publication_snapshots
        │
        └───1──* configuration_envelopes (versioned; ≤1 active)
                    │
                    ├──* groups ──* options
                    │
                    └───1──* sessions ──* selections ──1── calculations
                              │
                              └──* events
```

---

## 4. Delete / supersession behavior

| Parent | Child |
|--------|-------|
| Publication revoke | Sessions fail closed on access; envelopes → expired/superseded; **do not** delete evidence |
| New envelope version | Prior active → superseded; sessions on old envelope cannot save new calcs |
| Org delete | CASCADE only if org cascade policy matches platform; prefer RESTRICT while publications exist |

---

## 5. RLS / grants (DE.2B target)

- ENABLE RLS on all new tables
- REVOKE ALL FROM `anon`, `authenticated`
- No policies for client roles (Brain service_role only), matching DE.1 posture
- Repository methods always filter `organization_id` from trusted context
- Functions (if any): `SECURITY DEFINER`, fixed `search_path`, execute grant to `service_role` only

---

## 6. Explicit non-goals for schema

- No columns for acceptance, payment, sold
- No raw access tokens
- No FK that allows configuration to update `quote_headers`
- No live FK dependency that deletes historical options when Admin catalog rows change (use frozen copies)
