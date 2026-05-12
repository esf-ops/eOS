# Quote Catalog Admin — architecture (future)

This document extends the **Pricing Admin Head** into a **flexible Quote Catalog Admin**: programs and catalog items are **data**, not hardcoded lists, while **per–pricing-structure economics** stay normalized so Public Retail, dealer tiers, builder/designer, and internal house can all share the same merchandising with different numbers.

Companion SQL (additive, not auto-applied): `backend-core/supabase/eos_quote_catalog_schema.sql`  
Related plans: `docs/quote-platform/pricing-admin-head-plan.md`, `docs/quote-platform/pricing-seed-map.md`

---

## 1. Problem statement

Elite needs to add and retire **quote programs** (shower, vanity, quartz shower walls, tub surrounds, laundry tops, bar tops, electrical add-ons, sinks, faucets, edge upgrades, hardware, brackets, trip fees, template/install add-ons, and future programs) **without shipping new code** for each SKU class. Today, much of that lives in `quote_pricing_rules.category` + `metadata` and in the HTML prototype — workable for v1, but not scalable.

The catalog model separates:

| Concern | Where it lives |
|--------|----------------|
| **What** we sell (merchandising, copy, visibility, assets) | `quote_programs`, `quote_catalog_items`, `quote_catalog_item_options`, `quote_catalog_item_media`, `quote_catalog_visibility_rules` |
| **How much** under each partner/public mode | `quote_catalog_pricing_rules` → `quote_pricing_structures` |
| **Who** gets which structure | Existing `quote_partner_pricing_assignments` |

Legacy `quote_pricing_rules` remains valid until the calculator and admin UI **resolve catalog_item_id** (or a stable `item_code` bridge) end-to-end.

---

## 2. Programs vs categories

- **`quote_programs`** = top-level commercial groupings (e.g. `shower`, `vanity`, `countertop`, `fees`, `hardware`).
- **`quote_catalog_items.program_id`** ties every SKU/config line to exactly one program.
- Optional **`program_kind`** (free text or controlled vocabulary in app) routes behavior in the engine (e.g. room-based vs line-item vs flat job).

Hardcoded engine modules (when needed) should key off **`program.code`** or **`pricing_behavior`**, not on table names in SQL.

---

## 3. Catalog item shape (merchandising + policy)

Each **`quote_catalog_item`** supports:

| Field area | Columns / pattern |
|------------|-------------------|
| Identity | `item_code` (unique per program), `item_name`, `description` |
| Classification | `program_id`, optional `parent_catalog_item_id` (variants) |
| Measurement | `unit_type` (e.g. `per_sqft`, `linear_ft`, `each`, `job`) |
| Pricing shape | `pricing_behavior` (`unit_price`, `tier_matrix`, `percent_of_line`, `passthrough`, `quote_only`, `custom` — app-defined extensions via `metadata`) |
| Visibility | `visible_to_public`, `visible_to_partner`, `visible_to_internal` |
| Governance | `requires_review`, `is_active`, `sort_order` |
| Assets | `image_url`, `spec_document_url`; richer assets in **`quote_catalog_item_media`** |
| Integrations | `monday_*`, `moraware_product_code`; spillover in `metadata` |
| Extensibility | `metadata` JSON for attributes not worth a column yet |

**Options** (`quote_catalog_item_options`): same visibility / review / unit / behavior pattern at one level of nesting (e.g. edge profile, faucet finish). Option-level **dedicated** price rows are a natural follow-up (nullable `catalog_item_option_id` on `quote_catalog_pricing_rules`); v1 can store option deltas in `metadata` on the parent item’s pricing rule until normalized.

**Media** (`quote_catalog_item_media`): `media_kind`, `storage_path` / `public_url`, `is_public_safe`. **Public** responses must only include media marked safe (and still never attach wholesale fields).

**Visibility rules** (`quote_catalog_visibility_rules`): when booleans are not enough (e.g. “show in partner portal only if branch = X” or feature flags), attach rules to **either** a program **or** a single item (`CHECK` exactly one target). `rule_scope` distinguishes `public_wizard`, `partner_portal`, `internal_estimate`, `api`. Resolution order: explicit rules by `priority`, then item flags, then program defaults.

---

## 4. Pricing by structure (same item, many economics)

**`quote_catalog_pricing_rules`**

- `(pricing_structure_id, catalog_item_id)` with **`UNIQUE` partial index where `is_active`** so there is a single current row per pair; history via `effective_*`, `is_active`, or new rows.
- Numeric columns mirror today’s rule row: `base_cost`, `price`, `markup_percent`, `min_charge`, plus **`metadata`** for tier matrices (e.g. vanity t1/t2) until split into child rows.

This maps 1:1 to business requirement:

- **Public Retail**, **Dealer Tier 1/2**, **Builder**, **Designer**, **Internal / House** = rows in `quote_pricing_structures`; each catalog item may have **one active** catalog pricing row per structure.

**Public retail protection** stays as today: structure `pricing_mode = public_retail` + calculator **total-level** markup floor; catalog rows still store **baseline unit economics** the engine treats as wholesale unless product decides otherwise.

---

## 5. Public vs partner vs internal (API contract)

| Channel | Catalog projection |
|---------|----------------------|
| **Public quote UI** | Only programs/items with `visible_to_public = true` **and** passing `quote_catalog_visibility_rules` for `public_wizard`. Response DTO: **no** `base_cost`, **no** partner-only `metadata` keys, **no** `quote_catalog_pricing_rules` for non–`public_retail` structures. Optionally expose **list** prices only after server-side retail transform if product requires line-level display. |
| **Partner portal** | Full catalog for assigned structure; may show wholesale/partner economics per policy. |
| **Internal** | Full catalog + internal-only items and internal media. |

**Rule:** the browser never receives a dump of `quote_catalog_pricing_rules` for all structures. Server composes allowed fields per `quoteSource` / role.

---

## 6. Migration path from `quote_pricing_rules`

1. Seed **`quote_programs`** (e.g. `countertop`, `vanity`, `addons`, `fees`).
2. Backfill **`quote_catalog_items`** from existing rules (derive `program_id` from `category` / `metadata.prototype_key`).
3. Insert **`quote_catalog_pricing_rules`** per `(structure_id, catalog_item_id)` from current `quote_pricing_rules` rows (prototype seed duplicated per structure).
4. Teach **`quoteCalculator`** (or a resolver layer) to load rules via catalog first, fallback to legacy `quote_pricing_rules`.
5. Deprecate writing new rows to legacy rules in admin UI once parity is proven.

---

## 7. Example programs (non-exhaustive)

Examples to register as **`quote_programs.code`** / display names:

- Shower program, vanity program, quartz shower walls, tub surrounds  
- Laundry tops, bar tops  
- Pop-up outlets, sinks, faucets  
- Edge upgrades, hardware, brackets/supports  
- Trip fees, template/install add-ons  
- Future Elite programs → new `quote_programs` row + items

---

## 8. Monday / Moraware

Nullable columns on **`quote_catalog_items`** (`monday_item_id`, `monday_board_id`, `moraware_product_code`) support sync keys without coupling catalog DDL to Moraware’s full model. Heavy payloads stay in **`metadata`** until stable.

**Do not** change Moraware sync pipelines in this initiative; catalog tables are **consumer** metadata for quoting and future sync mappers.

---

## 9. Admin UI evolution (Pricing Admin → Catalog Admin)

Screens grow from “pricing tables” to:

1. **Program catalog** — CRUD programs, sort, activate.  
2. **Item browser** — filter by program, visibility, review state.  
3. **Item editor** — merchandising, behavior, media, integration keys.  
4. **Structure matrix** — grid: rows = catalog items (or options), columns = pricing structures, cells = price / matrix metadata.  
5. **Visibility debugger** — simulate public vs partner projection for QA.

Same auth model as today: **system_admin** + **admin** for write; stricter read roles later if needed.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Catalog and legacy rules diverge | Single write path in admin API; nightly consistency report (future). |
| Public leak of wholesale | DTO layer + tests; never expose bulk pricing endpoints publicly. |
| Rule explosion | Programs + search + soft `is_active`; archive old rows instead of delete. |
| Performance | Indexes on `(program_id)`, `(visible_to_public)`, `(pricing_structure_id, catalog_item_id)` — see SQL file. |

---

## 11. Next implementation steps (engineering)

1. Apply `eos_quote_catalog_schema.sql` in Supabase after review.  
2. Add **read-only** admin routes: list programs, list catalog items (filtered), get item by id (no prices in public route).  
3. Add **admin** CRUD for programs/items/options/media/visibility/catalog pricing.  
4. Wire **calculator resolver** to prefer `quote_catalog_pricing_rules` when `catalog_item_id` present on input lines.  
5. Public **catalog feed** endpoint returning sanitized DTO only.

No homeowner wizard UI in this track; catalog feed exists to support it later.

**See also:** `docs/quote-platform/ai-takeoff-and-visualize-plan.md` and `backend-core/supabase/eos_quote_takeoff_visual_foundation.sql` (measurement provenance, AI takeoff, visual layouts feeding the same calculator snapshots).
