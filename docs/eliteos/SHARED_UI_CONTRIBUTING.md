# Contributing to eliteOS Shared UI

**Date:** 2026-06-29  
**Phase:** 0 — guardrails only  
**Full plan:** [SHARED_UI_ARCHITECTURE.md](./SHARED_UI_ARCHITECTURE.md)

---

## Design reference

**Home Launcher (`app-home`) is the current design reference.** Its topbar, hero, bento cards, tokens, and motion patterns define how protected heads should look and feel. See [eliteos-ui-direction.md](./eliteos-ui-direction.md).

Do **not** redesign Home Launcher as part of shared UI extraction work. Borrow tokens and patterns; keep launcher behavior and layout stable.

---

## Where shared UI lives

| Path | Role |
|------|------|
| `shared/eliteos-ui/` | **Future shared UI layer** — topbar today; tokens, primitives, hooks, and components in later phases |
| `shared/eliteos-supabase/` | Supabase auth client options (not visual UI) |
| `shared/eliteos-api/` | *(Phase 2)* Single HTTP client and `ApiError` |

New reusable **visual** components, CSS tokens, and shell helpers belong in `shared/eliteos-ui/`, not in individual head folders.

---

## What is NOT shared UI

**`app-quote/src/lib/` is quote-domain only** — not a general UI package.

It correctly owns:

- Quote calculation and measurement math (`prototypeQuoteMath.ts`, vanity helpers)
- Customer estimate document rendering (`customerEstimate/`)
- Quote-specific API payload shapes and delivery helpers

Do **not** add Button, Card, Modal, or app-shell components to `app-quote/src/lib/`.

The `@quote-lib` Vite alias (used by Internal Estimate and Pricing Admin) is for **quote domain** imports. Phase 2 will move generic HTTP helpers to `shared/eliteos-api/` instead of expanding `@quote-lib` for UI.

Public/customer heads (`app-quote`, `app-partner-quote`) may keep separate styling namespaces until explicitly migrated.

---

## Heads and go-live guardrails

**Internal Estimate and Quote Library are production-critical for Elite 100.** They should eventually **consume** shared components from `shared/eliteos-ui/`, but:

- **Do not refactor them before go-live** (no monolith splits, no shared CSS imports, no modal merges).
- Do not change save/revision, archive, hydration, customer output gate, email/PDF, or quote math as part of shared UI work.

See the full **do-not-touch** list in [SHARED_UI_ARCHITECTURE.md § Do not touch before go-live](./SHARED_UI_ARCHITECTURE.md#do-not-touch-before-go-live).

---

## How to add shared UI (after Phase 0)

1. Read [SHARED_UI_ARCHITECTURE.md](./SHARED_UI_ARCHITECTURE.md) for the current phase and component inventory.
2. Prefer **CSS primitives before React wrappers** (tokens → `.btn` → optional `<Button>`).
3. Keep `EliteosTopbar` **presentational** — no Supabase, no backend calls, no env vars inside shared components.
4. One concern per PR; one head migration at a time when importing shared CSS.
5. Update this doc or `SHARED_UI_ARCHITECTURE.md` when ownership boundaries change.
6. Record non-obvious exceptions in [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md).

---

## Related docs

- [HEAD_ARCHITECTURE_MAP_2026-05-27.md](./HEAD_ARCHITECTURE_MAP_2026-05-27.md) — per-head API and shell behavior
- [MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md](./MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md) — large files and extraction order
- [eliteos-ui-direction.md](./eliteos-ui-direction.md) — visual north star and token values
