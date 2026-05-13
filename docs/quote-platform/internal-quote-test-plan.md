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
