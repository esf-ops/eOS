# AI takeoff & visual quoting — forward plan

This document aligns **schema**, **calculator snapshots**, and **API behavior** so future **AI plan takeoff** and **visual layout** quoting plug in without reworking the quote platform core. It does **not** implement takeoff models, CAD, or homeowner wizards.

**Additive SQL (manual apply):** `backend-core/supabase/eos_quote_takeoff_visual_foundation.sql`  
**Related:** `docs/quote-platform/quote-catalog-admin-architecture.md`, `docs/quote-platform/PHASE0_IMPLEMENTATION_PLAN.md`

---

## 1. Quote input modes (contract)

These modes describe **how measurements entered the quote**, not the pricing engine name. They are carried on input as `quoteInputMode` / `quote_input_mode` and echoed in `calculation_snapshot.measurement_source` (see `quoteCalculator.js`).

| Mode | Typical user | Notes |
|------|----------------|------|
| `simple_public_preset` | Public | Guided presets; minimal numbers exposed. |
| `manual_dimensions` | Partner / internal | Typed L×D per room or legacy single-area. |
| `room_builder` | Partner / internal | Structured room list + pieces (current `engine: rooms`). |
| `visual_layout` | Partner / internal | Measurements derived from `quote_visual_layouts` JSON. |
| `ai_takeoff_from_plans` | Partner / internal | Plans → `quote_takeoff_jobs` → `quote_takeoff_results`. |
| `staff_adjusted` | Staff | Overrides after review; must log provenance in `quote_measurement_sources`. |
| `final_template` | Staff / production | Locked template applied to job; still auditable. |

**Defaulting (today):** `quoteSource === public_retail` → `simple_public_preset`; otherwise → `manual_dimensions` unless the client sends a known mode.

---

## 2. AI takeoff — future workflow

1. **Ingest** — User uploads plans; files tracked as storage objects; `quote_takeoff_jobs` row created (`status=pending`, `review_status=needs_review`). File UUIDs or paths live in `input_file_ids` + `metadata.input_file_refs` when ids are not UUIDs.
2. **Process** — Worker sets `processing` → model produces **candidate** `quote_takeoff_results` (per surface/room, `confidence_score`, `needs_review=true` by default).
3. **Review** — Staff uses internal UI: accept/reject/adjust rows; `approved_by` / `approved_at` set only on approved lines.
4. **Apply to quote** — Approved results **materialize** into `quote_measurement_sources` (active row per room) and optionally update `quote_rooms` counter/splash fields. **No automatic** merge into final pricing until policy explicitly allows it (default: **staff gate**).
5. **Recalculate** — `POST /api/quote/calculate` runs with rooms/areas; snapshot records `measurement_source` provenance.

**Guardrail:** takeoff rows are **never** authoritative for `grand_total` until the calculator runs server-side with reviewed inputs.

---

## 3. Visual layout — feature concept

- **`quote_visual_layouts`** stores **schemaless** `geometry` and `measurements` JSON (with optional `metadata.schema_version` when a format stabilizes).
- **Public** experiences use **simplified** shapes (rect presets, tap-to-size), not full CAD.
- **Partner/internal** may use richer editors later; geometry stays JSON for iteration speed.
- **`quote_room_id`** links a layout to a `quote_rooms` row when the layout is room-scoped; `room_name` remains for display if the room row is not yet created.
- **Rendered preview** — `rendered_preview_path` points to storage (thumbnail); public APIs only return **public-safe** preview URLs when product allows.

**Flow:** layout saved → measurements JSON interpreted by a future **layout resolver** → writes/updates `quote_measurement_sources` (`source_type=visual_layout`, `source_id=<layout id>`) → rooms engine consumes active sources.

---

## 4. Public simple vs partner/internal advanced

| Aspect | Public | Partner / internal |
|--------|--------|---------------------|
| Input modes | Primarily `simple_public_preset`; optional guided `manual_dimensions` with tight validation. | All modes including `ai_takeoff_from_plans`, `visual_layout`, `staff_adjusted`. |
| Takeoff | Not exposed until product decides; never raw model output. | Full jobs, confidence, review queue, adjustment history. |
| Visuals | Illustrations / presets, not editable CAD. | Layout tools + previews + linkage to rooms. |
| Calculator response | **Sanitized** (see `sanitizePublicCalculateResponse` in `quoteRoutes.js`): no `inputSummary`, **no** `measurement_source` detail (takeoff ids, confidence stripped). | Full snapshot including `measurement_source` for audit. |
| Pricing | Retail-safe totals only; no wholesale/partner structure leakage. | Full economics per assigned pricing structure. |

---

## 5. How visual layouts become rooms / line items

1. User or staff saves `quote_visual_layouts` with `geometry` + `measurements`.
2. Resolver (future) computes **sqft per surface** → proposes `quote_rooms` updates or new rows.
3. **`quote_measurement_sources`** records `source_type=visual_layout`, `source_id`, `quote_room_id`, sqft columns, `is_active=true` after confirmation.
4. **`calculateQuote`** with `engine: rooms` uses room sqft (from DB-loaded rooms or inline payload) as today; snapshot `measurement_source.rooms[]` lists each room’s **active** source type and optional `source_id`.
5. **Line items** continue to be derived server-side from sqft × rules (no trust of client totals).

---

## 6. How AI takeoff results become quote measurements

1. Model writes **`quote_takeoff_results`** linked to **`quote_takeoff_jobs`**.
2. Staff approves a subset; optionally merge duplicate surfaces.
3. Application creates **`quote_measurement_sources`** rows: `source_type=ai_takeoff`, `source_id` → result id, `confidence_score` preserved for internal audit.
4. **`quote_rooms`** updated from active measurement source (or kept in sync via trigger later — **not** in this migration).
5. Calculator runs; **`calculation_snapshot.measurement_source`** references modes and source ids (internal responses only).

Until review is complete, **`needs_review`** on results stays true and the merge step is skipped.

---

## 7. Staff review / approval flow

| Stage | `quote_takeoff_jobs.review_status` | Result rows |
|-------|-------------------------------------|---------------|
| Job finished | `needs_review` | `needs_review=true` |
| Staff triage | `in_review` | partial approvals possible per row |
| Ready for quote | `approved` | approved rows have `approved_by/at` |
| Replaced by new job | `superseded` | old results retained for audit |

**Staff_adjusted** mode: when a user edits sqft after takeoff, insert a new `quote_measurement_sources` row with `source_type=staff_adjusted`, `metadata.prior_source_id`, and flip `is_active`; keep history.

---

## 8. Measurement source tracking

- **`quote_rooms.measurement_source`** (existing column) remains a **simple string** denormalization for exports and Monday payloads.
- **`quote_measurement_sources`** is the **system of record** for provenance, confidence, approval, and stacking history.
- **`calculation_snapshot.measurement_source`** (JSON inside `quote_headers.calculation_snapshot`) captures what the **calculator actually used** at run time: `quote_input_mode`, `engine`, per-room hints (`measurementSource`, optional `takeoffResultId`, `visualLayoutId` from payload when present).

This satisfies: **every calculation snapshot records measurement provenance** at the summary level; deep history stays in relational tables.

---

## 9. Calculator integration (current code)

- **`normalizePrototypeQuoteInput`** accepts `quoteInputMode` / `quote_input_mode` and validates against `QUOTE_INPUT_MODES`.
- **`buildCalculationSnapshot`** adds **`measurement_source`** (built from normalized input; extensible when takeoff/layout APIs populate room objects with ids).
- **Public** `POST /api/quote/calculate` strips `measurement_source` from the returned snapshot to avoid leaking takeoff/layout identifiers and review metadata.

Future work: load active `quote_measurement_sources` from DB when `quoteId` is passed and merge into `input.rooms` before calculation.

---

## 10. Risks and guardrails

| Risk | Mitigation |
|------|------------|
| Model hallucinates sqft | Mandatory `needs_review`; no auto-merge to pricing; confidence stored but not trusted for public. |
| Public sees internal geometry | Strip or simplify in public DTOs; only `is_public_safe` media from catalog/visual tables when exposed. |
| Stale layout vs rooms | `is_active` on `quote_measurement_sources`; single active row per room policy enforced in app. |
| PII in takeoff metadata | Avoid raw addresses in `result_summary`; use `metadata` with retention policy. |
| Regulatory / pricing disputes | Immutable `calculation_snapshot` + `quote_calculation_audit` + measurement source history. |

---

## 11. Future UX ideas

- Split view: **plan thumbnail** + **editable room table** with confidence heatmap (internal).
- **Diff** between takeoff v1 and staff_adjusted v2 for training feedback loops.
- **Replay** calculation from historical snapshot + sources for support.
- **Visual layout** “magic wand” snap edges to cabinet runs (later).
- **Mobile** public: single-room preset flow only.

---

## 12. Out of scope (explicit)

- Moraware sync, Sales Head, Identity Resolution — **unchanged**.
- Building the full AI pipeline, labeling UI, or homeowner wizard — **not** in this deliverable.

Apply **`eos_quote_takeoff_visual_foundation.sql`** only after DBA review in Supabase.
