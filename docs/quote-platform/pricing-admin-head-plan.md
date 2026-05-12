# Quote Pricing Admin Head — plan

## 1. Purpose

Give Elite **system administrators** a dedicated surface to manage quote economics **without editing code or raw SQL**: pricing structures, per-structure rules (material groups, color→group mappings, vanities, add-ons, tear-out), and which **partner account** uses which structure. This complements the **public** quote path, which must only ever see **sanitized** calculator output (see `POST /api/quote/calculate` public retail behavior).

**Future direction — Quote Catalog Admin:** programs, catalog items, options, media, and visibility will live in normalized tables so Elite can add shower, vanity, fees, hardware, and other **programs without code changes**. See **`docs/quote-platform/quote-catalog-admin-architecture.md`** and **`backend-core/supabase/eos_quote_catalog_schema.sql`** (additive; apply manually).

**See also:** `docs/quote-platform/ai-takeoff-and-visualize-plan.md` and `backend-core/supabase/eos_quote_takeoff_visual_foundation.sql` (AI takeoff jobs, visual layouts, measurement source history).

Backend foundation lives in `backend-core/src/quotes/quotePricingAdminApi.js` (mounted from `quoteRoutes.js`). Apply optional listing indexes from `backend-core/supabase/eos_quote_platform_admin_additions.sql` when convenient.

## 2. User roles

| Role | Access |
|------|--------|
| **System admin** (`admin` role + `system_admin` head) | Full CRUD on structures, rules, partners, assignments; quote list; analytics summary. |
| **Executive / non–system-admin** | No access to these routes (same pattern as other admin-only quote APIs). |
| **Dealer / partner users** | No access; protected pricing must not appear in public or partner-safe heads without an explicit future product decision. |

## 3. Screens (future UI)

1. **Pricing structures list** — codes, modes, retail markup %, active flag, `active_rule_count`, `active_partner_assignment_count` (partners with a live assignment to this structure).
2. **Pricing structure detail** — edit name/description/mode/markup/public default; link to filtered rules; **warning** when `pricing_mode === public_retail` (minimum 25% markup, aligned with DB constraint and calculator).
3. **Material group pricing table** — filter `category = material_group`; spreadsheet-style rows: `item_name` (must stay consistent with calculator, e.g. `Group Promo`), `item_code`, `price`, `unit_type`.
4. **Color-to-group mapping table** — filter `category = material_color`; columns from `metadata` (supplier, material, group, color_name); optional inline edit of `metadata.group` until a dedicated color admin exists.
5. **Vanity pricing table** — filter `category = vanity`; show `base_cost` / `price` (tier 1 / tier 2), `metadata` tier copy for clarity.
6. **Add-ons pricing table** — filter `category` in (`cutout`, `sink`, …); align `item_code` with calculator keys (`qty-sink`, `tearout`, etc.).
7. **Partner accounts list** — name, type, active; **current_pricing_assignment** summary (structure code/name).
8. **Partner detail / pricing assignment** — history from `GET .../pricing-assignment`; POST to rotate assignment (server ends prior active row, inserts new).
9. **Price change review / audit notes** — future: tie edits to `quote_calculation_audit` / version table; for v1, show “last edited” from `updated_at` and freeform internal process (Linear / email).

## 4. UX principles

- **Spreadsheet-simple** editing for rule grids (inline cells, tab between fields); defer Excel-like bulk paste to a later phase.
- **Search / filter** on every large grid: `pricing_structure_id`, `category`, `item_code`, `is_active`, text search (maps to API `search` query).
- **Bulk edit later** — API is row-oriented first; CSV import/export listed under future features.
- **Clear “Public retail protected by 25% markup”** callout on any `public_retail` structure and on publish/save confirmations (server enforces minimum; UI should explain *total-level* markup vs per-line list in `quoteCalculator.js`).
- **Show which partners use each structure** — structure detail uses `partners_using` from `GET /api/admin/quote-pricing-structures/:id`.
- **Never expose protected prices to public users** — public wizard (out of scope here) calls only sanitized public calculate; admin UI only behind system admin auth.

## 5. Admin workflow

1. **Create/edit pricing structure** — POST/PATCH admin APIs; validate UUIDs; soft-deactivate with `is_active: false` instead of delete.
2. **Edit pricing rules** — GET filtered list; PATCH row or POST new row; prefer deactivate over delete.
3. **Assign partner to structure** — POST `.../quote-partners/:id/pricing-assignment` with `pricing_structure_id` (prior active assignment ended server-side).
4. **Test quote calculation** — use `POST /api/quote/calculate` with `pricingStructureId` / partner context (authenticated partner portal path later); compare to prototype expectations.
5. **Publish pricing** — operational policy (e.g. announce to branches); future: versioned “publish” + effective dates.

## 6. Future features

- **Effective dates** — `effective_from` / `effective_to` on rules (columns already exist); resolver picks applicable row.
- **Approval flow** — draft structure + submit for approval; role separation (pricing editor vs approver).
- **Pricing version comparison** — diff two snapshots or structure copies.
- **Import/export CSV** — round-trip for material colors and add-ons.
- **Audit trail** — append-only `quote_pricing_change_log` (not in schema yet).
- **Margin simulation** — hypothetical sqft + mix against selected structure.
- **Quote impact analysis** — “how many open quotes reference structure X” before deactivating.

## 7. API reference (admin)

All under `requireAuth` + `admin` role + `system_admin` head. JSON errors: `{ ok: false, error: "..." }`.

| Method | Path |
|--------|------|
| GET | `/api/admin/quote-pricing-structures` |
| GET | `/api/admin/quote-pricing-structures/:id` |
| POST | `/api/admin/quote-pricing-structures` |
| PATCH | `/api/admin/quote-pricing-structures/:id` |
| GET | `/api/admin/quote-pricing-rules` (query: `pricing_structure_id`, `category`, `item_code`, `is_active`, `search`, `limit`) |
| GET | `/api/admin/quote-pricing-rules/:id` |
| POST | `/api/admin/quote-pricing-rules` |
| PATCH | `/api/admin/quote-pricing-rules/:id` |
| GET | `/api/admin/quote-partners` |
| GET | `/api/admin/quote-partners/:id` |
| POST | `/api/admin/quote-partners` |
| PATCH | `/api/admin/quote-partners/:id` |
| GET | `/api/admin/quote-partners/:id/pricing-assignment` |
| POST | `/api/admin/quote-partners/:id/pricing-assignment` |
| GET | `/api/admin/quote-analytics/summary` |
| GET | `/api/admin/quotes`, `/api/admin/quotes/:id` |

## 8. Quote source config and sales territories (foundation)

**Tables:** `quote_source_configs`, `quote_sales_territories` (see `backend-core/supabase/eos_quote_public_internal_partner_foundation.sql`).

**Admin capabilities (backend):**

- List / create / update **quote source configs** — maps `public_consumer` | `internal_quote` | `partner_quote` to Monday board env key names, `requires_auth`, `public_safe`, default pricing structure code.
- List / create / update **sales territories** — match type (`zip`, `city`, `county`, `state`, `branch`, `manual`) + `match_value` → assigned rep / branch / email; `priority` for ordering.

**Catalog visibility (future columns or `metadata` on catalog items):**

- `public_visible`, `partner_visible`, `internal_only`, `requires_review` — until columns exist, store in `metadata` JSON and enforce in list APIs for each head.

**Monday board configuration:** Board IDs remain **env-only** (no tokens in DB). `monday_board_env_key` on `quote_source_configs` documents which env var to read at runtime.

**Public retail rule:** Admin cannot persist `public_retail` with markup below **25%** — enforced in DB (`eos_quote_platform.sql`) and in `quotePricingAdminApi.js` + `quoteCalculator.js`.

### Admin API additions

| Method | Path |
|--------|------|
| GET | `/api/admin/quote-source-configs` |
| POST | `/api/admin/quote-source-configs` |
| PATCH | `/api/admin/quote-source-configs/:id` |
| GET | `/api/admin/quote-sales-territories` |
| POST | `/api/admin/quote-sales-territories` |
| PATCH | `/api/admin/quote-sales-territories/:id` |

## 9. Optional UI stub

System Admin app includes a **“Quote pricing (preview)”** nav entry that opens a placeholder panel pointing to this document and listing the endpoints above. Full grids ship in a later iteration. **Quote source configs** and **territories** should appear as simple tables in a follow-up UI pass.

## 10. Quote Catalog Admin (future)

The Pricing Admin Head evolves into a **Quote Catalog Admin**: programs and SKUs as data (`quote_programs`, `quote_catalog_items`, …), with **per–pricing-structure** prices in `quote_catalog_pricing_rules`. Public channels only receive **public-safe** catalog projections (no protected wholesale fields). See **`quote-catalog-admin-architecture.md`** and the additive SQL **`backend-core/supabase/eos_quote_catalog_schema.sql`**.
