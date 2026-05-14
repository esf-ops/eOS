# Internal Quote Tool — 2–4 week test plan

## Goal

Validate **Internal Quote Tool v1** math, UX, and **quote library** flows against the legacy calculator/spreadsheet method so preliminary quotes can move off desks without building estimates in QuickBooks first.

## Who tests

Elite Stone Fabrication internal sales and estimating staff with **Quote** head access in eliteOS.

## Duration

**2–4 weeks**, running **in parallel** with the existing calculator/spreadsheet workflow.

## How to test

1. Create quotes in the **Internal Estimate Head** (`app-internal-estimate`) while signed in with **Quote** head access — not in the public quote app.
2. For each real opportunity, also run the **legacy** method.
3. Record **discrepancies** (dollars, sqft, add-ons, tier selection).
4. Flag **missing account-specific pricing rules** for a future Pricing Admin / rules pass.

## Guardrails

- **Do not** treat this tool as the sole source for sold jobs until leadership approves.
- **QuickBooks** entry remains **after sold**, per current workflow (e.g. Dyersville branch data entry ownership — document locally in ops runbooks).
- **Moraware** handoff is **not** in scope for this phase (no unsafe API writeback).

## Success criteria

- Staff trust the **saved quote** list and can **reopen** rows from Supabase.
- **Monday internal board** receives items when `MONDAY_INTERNAL_QUOTES_BOARD_ID` + column env vars are configured, without breaking **public** Monday sync.

## TODO (future)

- Moraware job custom field **Entered by** for CNC/programming contact — map via **Moraware Admin / Integration Mapping Head** per org (`docs/eliteos/SYSTEM_BLUEPRINT.md`).

## 2026-05-11 — Phase 1 Internal Estimate UX (hybrid workspace)

- **Section pills** scroll to Job Info → Rooms/Areas → Materials → Add-ons → Review → Output → Save.
- **`job_info` + `project_address`:** new saves include `job_info` in `internal_ui` when the client posts `job_info`; header `project_address` when posted on save body.
- **Tear-out:** UI uses **Tear Out** custom line preset ($750 default) instead of checkbox; `addOns.tearout` is **not** incremented (avoid double-charging if both were used).
- **Hydration:** restores `project_address` and `internal_ui.job_info` when present.

## 2026-05-11 — Room model + catalog smoke checks

- **`GET /api/internal-quotes/material-colors`** (signed in, quote head): returns `colors[]` + `warnings[]`; empty DB should still return fallback colors with a warning.
- **Room-by-room** with two rooms, different material groups on pieces: calculate totals match expectation; snapshot includes `material_breakdown`.
- **Custom line items**: non-discount positive unit price; **Discount/Credit** with negative unit price; invalid rows skipped with calculator `warnings` when applicable.
- **`?quoteId=`** hydration: customer + `estimate_rooms` restore; gaps list when older snapshot lacks `estimate_rooms`.
- **Save**: `internal_ui` contains `estimate_rooms`, `custom_line_items`, `quote_default_material`, `readiness`, `file_checklist` on new saves.
- **Quote Library** detail: material breakdown list renders when snapshot has `material_breakdown`.

