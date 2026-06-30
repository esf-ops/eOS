# AI Takeoff + Imported Takeoff UI — Shared UI Implementation Note

**Date:** 2026-06-29  
**Scope:** UI-only consistency pass (no business logic, gates, pricing, or API changes)  
**Architecture:** [SHARED_UI_ARCHITECTURE.md](./SHARED_UI_ARCHITECTURE.md) Phase 1 pilot

---

## What was reused / extracted

### New shared assets (`shared/eliteos-ui/`)

| File | Purpose |
|------|---------|
| `tokens.css` | Canonical `--eos-*` design tokens (Home Launcher source of truth) |
| `primitives.css` | Section cards, panel heads, status pills, alert banners, beta banner, metric grid, DL grid, action rows, modals, feedback form |
| `takeoffWorkflow.css` | Takeoff receipt, compare table, readiness/checklist panels, drawer, import readiness, active review banner, source badges |
| `takeoffBetaCopy.ts` | Shared beta label, confirmation copy, issue categories, feedback/issue payload types |
| `TakeoffBetaBanner.tsx` | Presentational beta label (AI Takeoff + IE receipt) |
| `TakeoffFeedbackForm.tsx` | Presentational beta feedback form |
| `TakeoffIssueReportModal.tsx` | Presentational issue report modal |
| `EosSectionCard.tsx` | Premium white card shell |
| `EosPanelHead.tsx` | Title + subtitle + status/actions row |
| `EosStatusPill.tsx` | Semantic status chip (warn/success/info/neutral) |
| `EosAlertBanner.tsx` | Calm inline warning/info banner |
| `EosMetricCard.tsx` + `EosMetricGrid` | Measurement summary cards (AI Takeoff) |

### Pattern sources

| Reference head | Patterns borrowed |
|----------------|-------------------|
| **Home Launcher** | Token values, card elevation, calm premium surfaces |
| **Internal Estimate** | Panel head + checklist rows, receipt layout, drawer, room/source badges |
| **Quote Library** | Table typography (uppercase headers), status pill semantics |
| **AI Takeoff Lab** | Import readiness grouping, collapsible diagnostics (unchanged), workflow step chrome |

### Head imports

Both `app-ai-takeoff` and `app-internal-estimate` now import in `main.tsx`:

```ts
import "../../shared/eliteos-ui/tokens.css";
import "../../shared/eliteos-ui/primitives.css";
import "../../shared/eliteos-ui/takeoffWorkflow.css";
```

AI Takeoff also uses `@eliteos-ui/*` Vite alias for shared React components.

---

## Surfaces updated

### AI Takeoff (`app-ai-takeoff`)

- Measurement summary → `EosMetricCard` / `EosMetricGrid`
- Import readiness → `EosSectionCard` + shared import-readiness styles
- Import preview → `TakeoffBetaBanner`, shared modal classes
- Beta feedback / issue report → shared components
- Active review banner → shared `takeoffWorkflow.css`

### Internal Estimate imported takeoff

- `TakeoffImportReceiptPanel` → `TakeoffBetaBanner`, `eos-dl-grid`, `eos-action-row`
- `TakeoffMeasurementComparisonPanel` → `EosSectionCard`, `EosPanelHead`, `EosAlertBanner`
- `TakeoffQuoteReadinessSummary` → `EosSectionCard`, `EosPanelHead`, shared checklist list
- `TakeoffImportCompletionChecklist` → shared panel + checklist primitives
- `TakeoffSuggestedAddOnsReviewPanel` → `EosSectionCard`, `EosPanelHead`

---

## What stayed local (by design)

Per [SHARED_UI_CONTRIBUTING.md](./SHARED_UI_CONTRIBUTING.md):

- Save/revision/hydration orchestration (Internal Estimate monolith)
- Takeoff validation, approval gates, import API behavior
- Room scope editor business logic (`RoomScopeBuilder`)
- Diagnostics / dev tools collapsibles (AI Takeoff `lab-section-dev`)
- Head-specific button classes (`.btn`, `.btn-primary`) until global primitive migration
- Compact imported measurement table editor (IE-specific DOM)

---

## Alias strategy

Legacy class names (`ie-takeoff-*`, `takeoff-*`, `summary-*`, `import-*`) remain as **CSS aliases** in shared styles so existing markup continues to work while new code prefers `eos-*` primitives.

---

## Not in scope (intentionally)

- Full Internal Estimate / Quote Library monolith modularization
- Shared `EliteAppShell` or session hook migration
- Merging email modals or quote files UI
- Account Directory pickers
