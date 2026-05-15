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

## 2026-05-11 — Internal Direct / Wholesale math parity (legacy internal HTML tool)

- **Parity rule:** total = **measured material $** at the selected basis (**wholesale** tier `p` mirror vs **direct** ESF Direct $/sf) **+** room fixed add-ons **+** structured custom lines. **No** markup percent on top; **no** partner retail method for internal quotes.
- **Payload:** Internal Estimate client sends **`internalMaterialBasis`** and optional **`customerEstimateDisplayGroups`**; it does **not** send `retailMarkupPercent` / `retailMethod`. Backend `normalizePrototypeQuoteInput` still forces **0% / Pass Through** for `internal_quote` if a generic client sends markup fields.
- **Live UX:** sticky summary + math check use **`runLocalPrototypeQuote({ quoteMode: "internal", ... })`** on every relevant edit (no per-keystroke API).
- **Print:** “Internal — all price groups” table = full tier comparison (material columns + full total). “Customer estimate — selected…” = **only** checked groups.
- **Automated checks:** `node backend-core/src/scripts/verifyInternalEstimateMath.mjs` (10 sf Promo wholesale vs direct; Group A + $750; counter+backsplash; evil `retailMarkupPercent: 99` ignored).
- **Manual:** toggle Wholesale ↔ Direct and confirm hero total jumps between wholesale vs Direct totals with **no** extra 20%; add Tear Out and confirm +$750 immediately on sticky total; check only Group A + Group C and confirm print customer block has two rows only.

## 2026-05-15 — Customer print: selected material breakdown + compact layout

- **Mixed groups:** Kitchen perimeter Group Promo + island Group F (piece override or separate rooms) → customer print **Selected material breakdown** lists each group with room/piece sf lines; **Estimate summary** rolls up countertop $ + backsplash $ + add-ons + visible custom lines.
- **Optional comparison:** section titled **Optional all-group comparison**; only checked groups; copy clarifies all-scope alternate pricing.
- **One page:** typical 1–2 room kitchen with 0–3 comparison groups should fit one letter page (compact grid project overview, tight margins).
- **Internal-only custom lines:** included in project total; **not** listed or noted on customer print (staff worksheet only).

## 2026-05-15 — Customer print layout polish

- **Header:** ESF logo + **Elite Stone Fabrication Estimate**; date under title; quote ref in project overview.
- **Add-ons:** **Add-ons / fixtures** section lists each customer-facing add-on by name with subtotal.
- **Footer:** Terms box, customer + ESF signature lines, three branch contacts, website.
- **Print dialog:** On-screen note to disable browser “Headers and footers” for cleaner PDF (browser-controlled).

## 2026-05-15 — Backsplash depth default + estimate summary rollup

- **Backsplash type:** Add guided piece → change Type to **Backsplash** → depth/height becomes **4″** when prior value was blank, 0, or 25.5″; user can set 6″, 8″, etc. and other edits do not reset it.
- **Counter type:** Change Backsplash back to **Counter** → depth defaults to **25.5″** only when blank, 0, or 4″ (preserves custom depths).
- **Customer print summary:** **Estimate summary** shows Countertop material + Backsplash material + room add-ons + named customer custom lines = estimated project total (rounded $10). **Selected material breakdown** above stays per-group sf detail.
- **Mixed groups:** Kitchen perimeter Group Promo + backsplash Group Promo + island Group F → breakdown shows Promo counter + Promo backsplash sf and Group F counter sf separately.

