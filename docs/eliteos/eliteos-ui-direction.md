# eliteOS UI Direction

This is the **visual north-star** for eliteOS heads. The Home Launcher is the
reference implementation. Future heads should inherit these patterns so the
platform feels like **one** operating system, not a collection of separate apps.

> Inspiration quality bar: Stripe, Apple, Linear.
> Not a copy — a *quality* bar. eliteOS is a serious operating layer for stone
> fabrication, not a generic admin dashboard.

---

## 1. Design principles

1. **Bright, premium, calm.** Light base, soft layered washes, generous space.
   Never look like a dark factory dashboard or a default admin template.
2. **Operational, not decorative.** Every element earns its space by helping
   the user do their job. No fake metrics, no marketing fluff inside the app.
3. **Hierarchy first.** Type weight, scale, and color carry meaning before any
   icon, gradient, or shadow.
4. **Authoritative but quiet.** The Brain enforces rules; the UI explains them
   plainly. Status badges and access copy are factual, not loud.
5. **Restrained motion.** Motion confirms intent (focus, hover, entrance).
   Never decorative. Always respects `prefers-reduced-motion`.
6. **Accessibility is non-negotiable.** Visible focus rings, semantic
   elements, sufficient contrast, keyboard-first interactions.

---

## 2. Brand & voice

- **Product name:** `eliteOS` (never `eOS` in user-facing copy).
- **Motto:** *Keep the Titans running well.*
- **Positioning line:** *One operating layer for quotes, pricing, partners,
  sales, production, and shop flow.*
- **Core narrative:**
  - Moraware *records* the work.
  - eliteOS *explains* the work.
  - The heads *move* the work.

---

## 2.1 Brand architecture (slabOS / eliteOS / workspace)

eliteOS is one of two brand levels the user sees inside the platform. Future
SaaS tenants may have their own workspace identity, but the **platform** brand
stays consistent.

| Level | Name | Where it appears |
|---|---|---|
| **Platform / master brand** | `slabOS` | Sign-in, invite/recovery gate, and any other surface the user reaches *before* a workspace is selected. |
| **Tenant / workspace** | `eliteOS` *as Elite Stone Fabrication's workspace* | The signed-in launcher, head cards, hero, top bar. Future tenants would show their own workspace name and logo in the same slots. |
| **Organization identity** | Org logo + org name (Elite Stone Fabrication today) | Right side of the signed-in hero card. Optional `organization_name` / `organization_logo_url` on the backend `/api/me*` payloads when supplied; falls back to the current Elite asset and `"Elite Stone Fabrication"` literal. |

### Rules

1. **Do not globally rename eliteOS to slabOS.** Repo identifiers,
   environment variables, head slugs, route paths, head URLs, audit-log values,
   and backend API contracts continue to use `eliteOS` / `eos_*`. Only
   *user-facing copy at the platform layer* uses `slabOS`.
2. **slabOS shows up on platform surfaces only.** Sign-in card title and the
   left-hand brand panel. Once signed in, the user is in *a workspace* — show
   the workspace identity, not slabOS, as the primary mark. The hero
   workspace panel includes a quiet `"on slabOS"` line to anchor the
   relationship.
3. **No mixed-level branding inside the same surface.** Don't put a giant
   slabOS wordmark in the topbar next to a giant eliteOS wordmark. Pick one
   level per surface.
4. **Tenant logo resolution order** (used by the hero workspace panel):
   1. `me.user.organization_logo_url` (backend, when supplied)
   2. `headsPayload.user.organization_logo_url` (backend, when supplied)
   3. Local Elite Stone Fabrication asset (`EOS_LOGO_URL`)
   4. Initials in a gradient text frame
5. **Tenant name resolution order** mirrors the logo order, with
   `"Elite Stone Fabrication"` as the final fallback for the current tenant.
6. **Default workspace constants** live in one place
   (`DEFAULT_WORKSPACE_NAME` / `DEFAULT_WORKSPACE_SHORT` in
   `app-home/src/ui/App.tsx`). When backend supplies tenant fields, those
   defaults are bypassed automatically — no UI change required.

### Voice per level

| Level | Voice |
|---|---|
| slabOS | Calm, premium, infrastructural. *"Fabrication operating system."* No motto, no Elite-specific language. |
| eliteOS (Elite workspace) | Tenant-flavored, Elite-specific. Motto and three-line core narrative live here. |

---

## 3. Color direction

All values live in `app-home/src/ui/styles.css` as CSS custom properties.

### 3.1 Core neutrals (text + structure)

| Token | Hex | Use |
|---|---|---|
| `--eos-ink` | `#0b1a33` | Primary text, titles |
| `--eos-ink-soft` | `#1e2b48` | Strong body |
| `--eos-ink-mid` | `#475067` | Body, descriptions |
| `--eos-ink-muted` | `#6b7892` | Secondary copy, captions |
| `--eos-ink-faint` | `#94a0b8` | Hints, URLs, tertiary |
| `--eos-line` | `rgba(11,26,51,.08)` | Default border / divider |
| `--eos-line-strong` | `rgba(11,26,51,.14)` | Input borders, hover borders |

### 3.2 Surfaces

| Token | Use |
|---|---|
| `--eos-bg` | App background fallback under the gradient wash |
| `--eos-surface` | Solid card |
| `--eos-surface-soft` | Translucent panel on washed background |

### 3.3 Brand accent — burgundy/maroon

| Token | Hex | Use |
|---|---|---|
| `--eos-accent` | `#a3132f` | Primary action gradient |
| `--eos-accent-hover` | `#8e0f28` | Hover |
| `--eos-accent-active` | `#79091e` | Pressed |
| `--eos-accent-ring` | `rgba(163,19,47,.35)` | Focus ring |

> The accent is reserved for the **primary action** and the **motto**. Do not
> use it as a background fill on large surfaces.

### 3.4 Category tints

Each head gets a soft, gradient-tinted glyph tile. Tints are presentational
only — they never reflect permissions or status.

`navy`, `burgundy`, `violet`, `teal`, `amber`, `slate` — see
`HEAD_TINT_BY_SLUG` in `app-home/src/ui/App.tsx`.

### 3.5 App-level wash

```
radial-gradient(60% 50% at 12% 4%, blue-tint, transparent)
+ radial-gradient(50% 50% at 92% 0%, violet-tint, transparent)
+ radial-gradient(45% 55% at 100% 100%, rose-tint, transparent)
+ linear-gradient(180deg, #fbfcfe, #f4f6fb, #eef1f8)
```

Layered radial washes give the page its premium feel without distracting from
content. Other heads can apply the same wash via the shared body background.

---

## 4. Typography

- **Family:** system stack first (`Inter`, then `ui-sans-serif`,
  `system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, …). No webfont download.
- **Letter spacing:** titles tighten (`-0.018em` → `-0.04em` for large
  display). Eyebrows / kickers expand (`0.16em`).
- **Numerics:** tabular figures on KPI values (`font-variant-numeric:
  tabular-nums`).
- **Scale (current launcher):**

| Role | Size | Weight |
|---|---|---|
| Display (auth wordmark) | `clamp(2.4rem, 4.2vw, 3.2rem)` | 750 |
| Hero title | `clamp(1.7rem, 2.6vw, 2.3rem)` | 700 |
| Section title | `1.04rem` | 700 |
| Card title | `1.04rem` | 700 |
| Body / desc | `0.86rem` – `0.96rem` | 400–500 |
| Eyebrow / caption | `0.7rem` | 700 uppercase |
| Pill | `0.62rem` | 700 uppercase |

---

## 5. Layout & spacing

- **Page width:** `max-width: 1180px` content column, centered.
- **Page padding:** `32px 28px` on desktop, `20px 16px` on mobile.
- **Section gaps:** `36px` between major sections.
- **Card grid:** `repeat(auto-fill, minmax(286px, 1fr))` for live tools,
  `minmax(224px, 1fr)` for roadmap.
- **Card padding:** `20px 20px 18px` live, `16px 16px 14px` roadmap.
- **Radii:** `8 / 12 / 18 / 22 px` (`--r-sm` … `--r-xl`). Cards use `--r-lg`,
  hero uses `--r-xl`.

---

## 6. Component patterns

### 6.1 Top bar

- Sticky, glass-like (`backdrop-filter: blur(14px)`, ~74% white).
- Brand mark on the left (logo tile + wordmark + sub).
- Account chip + quiet/ghost buttons on the right.
- Account chip uses initials in a navy gradient avatar.

### 6.2 Hero (signed-in only)

- Soft white card with a layered **aurora** wash (burgundy + violet + blue)
  blurred behind content.
- Two-column grid: welcome content on the left, **workspace identity panel**
  on the right (≥ 821px). Below 821px the workspace panel collapses to a
  horizontal row beneath the welcome block.
- **Left column:** eyebrow (`Workspace · <name>`) → greeting → motto
  (burgundy) → positioning line → KPI strip (Tools available · On the roadmap
  · Your role).
- **Right column (workspace panel):** small uppercase `WORKSPACE` eyebrow →
  framed workspace logo → workspace name → quiet `"on slabOS · <short id>"`
  meta line. The framed logo uses a white inner card so any tenant logo —
  including a dark mark — reads cleanly. Falls back to gradient initials when
  no logo asset is available.
- KPIs and workspace fields are read from real backend data; never invent
  metrics or tenant identities. See §2.1 for resolution order.

### 6.2.1 Auth (slabOS platform brand)

- Two-column layout: slabOS brand panel on the left, sign-in card on the
  right. Stacks below 960px.
- **Left:** small slab glyph + `slabOS` wordmark + tagline
  ("Fabrication operating system.") + a one-line positioning paragraph +
  a quiet pill that names the current workspace
  (`Elite Stone Fabrication runs on slabOS`).
- **Right (sign-in card):** title `Sign in to your workspace`, sub
  `Continue to the eliteOS launcher for Elite Stone Fabrication.`
- **Invite gate** reuses the slabOS mark above the form title to anchor it
  as a platform surface (it appears *before* a workspace context exists).

### 6.3 Head card

- White surface, `1px var(--eos-line)` border, `--sh-card` shadow.
- **Top row:** tinted glyph tile (38×38) + status pill row.
- **Title:** 1.04rem, -0.018em tracking.
- **Description:** 0.86rem, `--eos-ink-mid`.
- **Optional URL:** monospace, `--eos-ink-faint` (only when safe to show).
- **Primary action:** gradient burgundy button with `↗` glyph that nudges on
  hover.
- **Hover:** card lifts `-2px` and shadow deepens.
- **Roadmap variant:** dashed border, translucent surface, smaller glyph,
  no primary action, "Coming soon" pill.

### 6.4 Buttons

| Variant | Use |
|---|---|
| `.btn` | Default secondary |
| `.btn-quiet` | Toolbar neutral (refresh, retry) |
| `.btn-ghost` | Sign out, dismiss |
| `.btn-primary` | Sign-in / save — full-width on auth |
| `.btn-open` | Primary action inside head cards |

All buttons:
- 9–10px vertical padding, `0.86rem` text, 600 weight.
- Focus ring: `2px solid var(--eos-accent-ring)`, offset 2.
- Disabled: 60% opacity, no transform.

### 6.5 Pills (status badges)

- Pill-shaped, uppercase, 4×9px padding, 0.62rem.
- Each pill carries a 5px colored leading dot (subtle, currentColor at 70%).
- Variants: `live`, `preview`, `available`, `public`, `admin`, `warn`,
  `roadmap`, `muted`. Use them to express **status**, not category.

### 6.6 Forms

- Inputs: 11/13px padding, 0.94rem, `--r-md` radius.
- Focus: accent border + 4px ring.
- Labels: 0.78rem 600, `--eos-ink-soft`.

### 6.7 Banners

`banner-error` (accent), `banner-warn` (amber), `banner-info` (blue). Always
explanatory, never raw exception output. Provide a quiet retry button when an
API fails.

### 6.8 Empty / loading

- **Loading:** four shimmering skeleton cards while heads load.
- **Empty:** dashed-border panel, plain explanation, role-aware copy
  ("Open System Admin to assign tool access" vs "Ask your administrator").

---

## 7. Motion guidance

- **Durations:** 140ms (`--eos-dur-1`) for state changes, 220ms
  (`--eos-dur-2`) for hover/lift, 360ms for card entrance.
- **Easing:** `cubic-bezier(0.2, 0.7, 0.2, 1)` (`--eos-ease`).
- **Allowed motion:**
  - Hover lift on head cards (`translateY(-2px)`).
  - Arrow nudge inside `.btn-open` on hover.
  - Card entrance fade-and-rise on mount.
  - Skeleton shimmer while loading.
  - Caret rotation on `<details>` open.
- **Forbidden:** parallax, marquees, looping background animation, large
  modal transitions, anything decorative.
- **Always wrap motion in `@media (prefers-reduced-motion: reduce)` opt-outs.**

---

## 8. Accessibility

- Visible focus ring on every interactive element.
- Use semantic elements: `header`, `main`, `section`, `article`, `nav`,
  `footer`. Buttons for actions; anchors for navigation only.
- `aria-label` on icons-only controls. `aria-hidden` on decorative SVGs.
- Banners use `role="alert"` where appropriate; empty states use
  `role="status"`.
- Color contrast: body text ≥ 4.5:1; large titles ≥ 3:1.
- Touch targets: 32×32 minimum (most controls are larger).

---

## 9. How future heads inherit this style

When a new head is built (Sales, Production, Shop TV, …), it must:

1. **Reuse the design tokens.** Copy the `:root` block from
   `app-home/src/ui/styles.css` or import a shared stylesheet when one is
   extracted. Never invent new accent colors per head.
2. **Adopt the top-bar pattern.** Sticky glass bar with brand mark on the
   left and account chip on the right. Same heights, same shadows.
3. **Mirror the hero.** Greeting + motto + positioning + KPI strip *only*
   when the head has meaningful real data. If a head has nothing useful to
   surface above the fold, prefer a quiet header instead of a fake hero.
4. **Use the card pattern.** Same border, radius, shadow, hover lift,
   focus behavior. Choose a `tint-*` based on head category, not status.
5. **Use the pill vocabulary.** Status only — Live / Preview / Available /
   Public / Admin / Coming soon / Not assigned. Never invent new variants
   without a documented reason here.
6. **Match the motion budget.** Same `--eos-dur-*` and `--eos-ease`.
7. **Respect the wash.** Reuse the body gradient wash so heads feel like
   the same surface seen through different windows.
8. **Plain-English copy.** Avoid jargon, expose internal slugs only inside
   collapsible "Access details" / "Technical reference" sections for
   admin/exec users.
9. **Respect the brand levels (see §2.1).** Inside a signed-in head, the
   workspace (e.g. *Elite Stone Fabrication*) is the visible identity. The
   `slabOS` platform brand appears only at pre-workspace / auth surfaces. If
   a head ever needs to mention the platform, use a quiet `"on slabOS"`
   trailing line, not a wordmark.
10. **Default tenant constants in one place.** When a head needs the
    workspace name or logo, read it from backend `me`/`heads` fields with
    fallbacks to a single constant (model after `DEFAULT_WORKSPACE_NAME` /
    `resolveWorkspaceLogoUrl` in `app-home/src/ui/App.tsx`). Never scatter
    `"Elite Stone Fabrication"` literals through head logic.

---

## 10. Anti-patterns (do not ship)

- Dark factory dashboard look.
- Generic admin template feel (sidebar + table + tabs).
- Neon gradients or animated gradient backgrounds.
- Fake KPIs and decorative analytics.
- Multi-color button systems (more than one accent color).
- Icon zoos — keep glyphs uniform, single-stroke, currentColor.
- Modal overlays that block the launcher when they aren't required by flow.
- Hiding real diagnostics in production *without* a collapse — keep them
  available behind `<details>` for admins and execs.
- Mixing brand levels on the same surface — large slabOS *and* eliteOS
  wordmarks at the same hierarchy (see §2.1). Pick one level per surface.
- Renaming `eliteOS` to `slabOS` in repo identifiers, env vars, head slugs,
  or backend contracts. Brand levels are a **UI/copy** concern only.

---

## 11. File map

| File | Role |
|---|---|
| `app-home/src/ui/App.tsx` | Launcher React entry, head cards, hero, auth flows |
| `app-home/src/ui/styles.css` | Design tokens + all launcher styling |
| `app-home/index.html` | `theme-color`, description, title |
| `app-quote-library/src/QuoteLibraryApp.tsx` | Reference operational head: topbar + content hero + filters + table + drawer |
| `app-quote-library/src/styles.css` | Reuses the token block locally; pattern reference for operational/workflow heads |
| `docs/eliteos/eliteos-ui-direction.md` | This document |

When extracting a shared design package later, lift the `:root` token block,
buttons, pills, cards, and banners first. Hero + topbar can stay head-specific
until two heads need them.

---

## 12. Pattern: operational heads (Quote Library reference)

The Home Launcher is the *primary* north star, but it is a launcher, not an
operational tool. The **Quote Library** is the first operational head in the
new visual system, so use it as the reference when building heads that center
on **search → list → detail** workflows (future heads: Sales, Production,
Shop TV, Invoices, …).

### 12.1 Page skeleton

```
<div class="shell">
  <header class="topbar"> brand-row + topbar-actions </header>
  <main class="main">
    <section class="ql-hero"> eyebrow + h1 + sub + domain ref </section>
    [optional status banners]
    <div class="metrics">             ← real KPIs only, no fake data
    <div class="tabs">                ← view switcher (sticky-ish, glass)
    <section class="card">            ← search & filters
    <section class="card">            ← list (table) or grid (by-account)
  </main>
  [optional <aside class="drawer">]   ← detail / workflow / timeline
  <footer class="footer-bar">
</div>
```

### 12.2 Operational specifics

- **Top bar** matches §6.1 exactly. Brand row reads `eliteOS · <Head Name> ·
  <Workspace>`. Head-specific context lives in the **hero eyebrow**, not the
  topbar.
- **Hero** is *operational, not promotional*: eyebrow + one-line title + one
  sub line + a domain/handle reference. No KPI strip if the metrics already
  appear as their own grid below.
- **Metric cards** use the same accent stripe + tabular-num value + uppercase
  label as Home, but they are **real metrics from the backend**. Zero-state
  values (`—`, `0`, `$0`) get a quiet neutral stripe via `.metric-zero`.
- **Tabs** are pill-style inside a glass tray. Active tab carries a small
  burgundy dot. Use tabs only when the underlying API supports view-scoped
  queries (here: `all`, `by_account`, `my`, `internal`, `public`, `sold`,
  `handoff`).
- **Filter card** uses the standard card chrome, an inline filter-count meta,
  and a `filter-toolbar` separated by a top border for Apply / Clear.
- **Data table** keeps a `min-width` so columns never crush. Status uses
  pill vocabulary from §6.5; quote number uses a monospace chip.
- **Skeleton row** (`.ql-skeleton-row`) replaces the table while busy on
  empty rows. Same shimmer system as Home.
- **Empty states** include a soft tinted glyph tile (56×56), title, sentence,
  and one primary action. The "no internal estimates" variant deep-links to
  the Internal Estimate Head.
- **Drawer** (`.drawer`) for detail/workflow is *right-anchored, full-height*,
  uses the new fade+slide entrance, and respects `prefers-reduced-motion`.
  Workflow buttons go inside a `.workflow-grid` flex row; destructive actions
  always live behind a `window.confirm`.
- **Debug accordion** stays available behind a dashed-border details block —
  staff need raw payloads in production, but they should never compete with
  the operational view.

### 12.3 Behavior the visual pass must preserve

When restyling an operational head, never touch:

- API calls, search/filter/sort params, pagination semantics.
- Status transitions, archive/duplicate/restore flows.
- Auth and `requireHeadAccess` assumptions.
- Quote math, revision/save semantics, Monday/Moraware/QuickBooks payloads.

These remain a **backend** responsibility; the visual pass is purely surface.
