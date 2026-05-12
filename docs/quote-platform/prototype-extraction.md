# ESF Quoting Tool v1.01 — Prototype extraction notes

**Source:** `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html`

## 1. Strengths to preserve

- **Dual estimation engines** (legacy single-scope vs room-by-room) with clear UX toggle.
- **Elite Program 100-color → price group** discovery workflow + “all groups” comparison matrix.
- **Vanity program** with kitchen SF threshold (35 sf) driving tier 1 vs tier 2.
- **Partner selling packages** (Value / Core / Premium) for guided selling.
- **Readiness score + checklist** bridging estimate quality to ESF review.
- **Job handoff package** consolidating edge/sink/faucet/appliance + template dates.
- **Partner-to-customer message** auto-generation from scope + retail total.
- **Print/PDF** layout tuned for customer-facing paper.
- **Draft persistence** via keys + export/import JSON for demos.

## 2. Hardcoded pricing data (extract to `quote_pricing_rules`)

| Bucket | Source | Notes |
|--------|--------|------|
| Group $/sf | `config.tiers` (Promo 45 … F 115) | `category=material_group`, `unit_type=per_sqft` |
| Add-on unit prices | `config.addOns`, `tearOut` | `category=cutout|hardware|tearout` |
| Vanity matrix | `config.vanityPricing` (t1/t2/b) | `category=vanity`, metadata for bowl mult |
| Sink option $ | `config.vanitySinkOptions` | `category=sink` |
| Remnant formula | `calculateRoom` non-stock branch | $55/sf + $100 + bowl + rect upcharge in rule `metadata.formula` |

## 3. Material / color / group data

- **`config.materials`**: ~100 `{ name, supplier, material, group }` rows — seed table or CSV pipeline; link to Brain `eos_source_records` later via Identity Resolution.

## 4. Vanity pricing data

- See §2; tier selection uses **kitchen** qualifying SF across rooms (`calculateAllRooms` totals).

## 5. Quote input fields (canonical API input)

- **Partner:** company, contact.  
- **Customer/project:** name, phone, email, project name, address.  
- **Internal:** rep, branch, project type, valid days, prepared-by.  
- **Scope:** calc mode (inches/linear/direct), pieces OR room cards (type, name, material, group, modes, FHB, raised bar, notes).  
- **Global (legacy):** vanities rows, add-on qtys, upgrade toggles.  
- **Pricing UI:** estimate mode, confidence, backsplash type, markup method/%/flat.  
- **Handoff:** edge profile/notes, backsplash selection, sink/faucet/appliance fields, template contacts/dates, cabinet readiness, site access, decision maker, review notes.  
- **Checklist:** boolean flags + auto material flag.

## 6. Calculation functions (port to `quoteCalculator.js`)

| Function | Role |
|----------|------|
| `getQuotedPieces` / `calculateAreas` | Legacy SF from pieces |
| `calculateRoom` / `roomPieceSf` | Per-room SF + $ |
| `calculateAllRooms` / aggregations | Multi-room totals + qualifying SF |
| `tierByName` | Group → $/sf |
| `calculateVanities` | Legacy vanity rows |
| `calculateAddOns` | Legacy global add-ons |
| `calculateRetailFromWholesale` | Partner → retail (replace with `applyRetailProtection` + DB markup) |
| `roomAllGroupMatrix` | Comparison grid |
| `buildReviewReadiness` / `buildRoomReadiness` | Checklist |

## 7. Output totals

- Per-room wholesale/retail (mode dependent), matrix wholesale/retail/profit, package totals, vanity/add-on subtotals, `grand_total` equivalent for selected group.

## 8. Quote modes (`#estimate-mode`)

- Internal ESF Worksheet; Partner Wholesale; Customer Retail; Wholesale + Retail Worksheet — map to `quote_source` + response shaping flags.

## 9. Handoff / review fields

- All `#handoff-*`, `#review-*`, file list placeholders, `review-notes`, decision/template/install dates.

## 10. Readiness / checklist logic

- Auto: material selected when color picked.  
- Manual: drawings, sink, faucet, cooktop, edge, backsplash, decision-maker, cabinets.  
- Drives pills, progress %, missing list — persist summary JSON in `calculation_snapshot.review`.

## 11. localStorage / export / import

- Prefix `esf_partner_estimate_v21_` + `EST-*` key; legacy prefixes scanned in UI.  
- **Replace with:** `quote_headers` + children; export = signed URL or authenticated JSON download from API (never localStorage for production quotes).

## 12. Supabase tables (Phase 1 DDL)

- Use `eos_quote_platform.sql` tables: structures, rules, partners, assignments, headers, line_items, rooms, status_history, monday_sync_log, calculation_audit, files, forecast_events.

## 13. Monday.com mapping (initial)

- `quote_number`, `quote_status`, `quote_source`, customer, partner, rep, branch, project type, address, `grand_total`, `estimated_sqft`, material group, forecast placeholder, `quote_url`, `created_at`, `next_follow_up` placeholder.  
- Store `monday_item_id` on success future.

## 14. Forecasting / analytics fields

- Dimensions: rep, branch, partner, status, timestamps.  
- Measures: `grand_total`, optional `probability_percent` on events, aging from `created_at` / status transitions.  
- Bid/close: accepted / (accepted+rejected) cohorts by time window.

## 15. Backend vs frontend split

| Stay UI-only | Move to backend/Supabase |
|--------------|---------------------------|
| Layout, toggles, validation hints | All currency math, rule resolution |
| Room card DOM templates | Snapshot + persisted lines |
| Print CSS | PDF generation service (later) |
| Copy-to-clipboard text | Sanitized strings from API |

## 16. Admin control

- Structures, rules, partner assignments, quote list, manual status override, Monday replay.

## 17. Risks / gaps

- File binary in browser → need Storage + ACL.  
- Margin math edge cases (`margin percent` ≥100).  
- Monday column mapping per workspace.  
- Multi-tenant partner isolation in RLS (future).

## 18. Migration sequence

1. DDL apply.  
2. Seed rules from prototype `config`.  
3. API calculate → UI wire.  
4. Submit + files.  
5. Monday sync when env present.  
6. Deprecate localStorage for production paths.
