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
- **Brand row (left):** logo tile + `eliteOS` wordmark + a sub line that
  combines the head name and the workspace name. For operational heads use
  the format `<Head name> · <Workspace>`
  (e.g. `Quote Library · Elite Stone Fabrication`). For the Launcher itself
  the sub line is just `<Workspace>`.
- **Account chip (right):** initials avatar (navy gradient) + display name +
  optional caption (role or email if shown) + a small caret that rotates
  when the menu is open. Click toggles the **user menu** (see §6.1.1).
- **Quiet actions** (Refresh, etc.) belong inside the user menu for
  operational heads. The Launcher may show them inline because they are
  identity-level actions on the *platform* surface. Avoid putting more than
  one inline action next to the chip on a head — keep that surface calm.
- The chip is always a `<button>` (not a `<div>`), `aria-haspopup="menu"`,
  `aria-expanded` reflects open state, focus ring + Escape to close.

#### 6.1.1 User menu

A small dropdown rooted on the account chip. Same pattern across every
protected head.

- **Header block** (inside the panel): user display name, email, and a
  quiet `Workspace · <name> · on slabOS` line. Echoes §2.1 brand levels.
- **Item rows** (`.user-menu-item`): icon tile + label stack
  (primary line + 0.72 rem muted meta line) + optional trailing `↗` glyph
  for links that leave the head.
- **Standard items** (in this order):
  1. **Open Home** — anchor to `https://www.eliteosfab.com` (or
     `VITE_HEAD_URL_HOME`); trailing `↗`.
  2. **Refresh data / Refresh access** — re-runs the head's existing data
     fetches. Disabled while in-flight; label flips to `Refreshing…`.
  3. **System Admin** — *only* rendered when the current user is
     `admin` / `super_admin` / `executive` *and* that role is already known
     client-side. If a head has no role information without a new backend
     call, **omit** this item entirely. Never gate by initials, email, or
     UI-only check.
  4. **Profile & preferences** — placeholder, disabled with a
     `Coming soon` meta line. No backend page is built yet.
  5. **Sign out** — sits in a `.user-menu-footer` separator block.
     Burgundy on hover; calls the existing `signOut` handler.
- **Behavior:** outside click + `Escape` close the menu; opening sets focus
  to the menu container; respects `prefers-reduced-motion` (no
  pop-in animation when reduced).
- **No new backend endpoints.** The chip identity comes from the local
  Supabase `session.user` (`email`, `id`, `user_metadata.full_name`); role
  comes from existing payloads only — never from speculative API calls
  added during a UI pass.

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
| `app-internal-estimate/src/InternalEstimateApp.tsx` | Reference estimating head: shared topbar + hero + rail/main/aside + sticky action bar |
| `app-internal-estimate/src/styles.css` | Reuses the token block locally; pattern reference for dense, calc-driven estimating heads |
| `app-internal-estimate/src/CustomerEstimatePrint.tsx` | Customer-facing print component — **isolated** from the app shell; do not restyle without explicit approval |
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
    <section class="ql-hero">
      <div class="ql-hero-grid">
        <div class="ql-hero-main">   ← eyebrow + h1 + sub + domain ref
        <aside class="hero-workspace"> ← workspace identity panel
      </div>
    </section>
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
- **Hero** is *operational, not promotional*: a 2-column grid with operational
  copy on the left (eyebrow + one-line title + one sub line + a domain/handle
  reference) and the **workspace identity panel** on the right. Below 820 px
  the panel stacks beneath the main column. No KPI strip if the metrics
  already appear as their own grid below.
- **Workspace identity panel** mirrors the Home Launcher hero workspace block
  (see §6.2): small uppercase `WORKSPACE` eyebrow → framed workspace logo →
  workspace name → quiet `"on slabOS · <short id>"` meta. Resolution order
  follows §2.1: backend `organization_logo_url` if available, otherwise the
  Elite Stone fallback asset, otherwise gradient initials. Operational heads
  that do not call `/api/me` are allowed to use a local
  `resolveWorkspaceLogoUrl` helper that hard-codes the fallback constants —
  the helper signature must remain backend-friendly so that adding the
  payload later is a one-line change.
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
- **Debug accordion** stays available behind a dashed-border details block —
  staff need raw payloads in production, but they should never compete with
  the operational view.

### 12.3 Detail drawer pattern (Quote Library reference)

The right-anchored drawer is the canonical detail/workflow surface for any
operational head. It is **not a modal** — staff can still read the list
behind it. Structure (top to bottom):

1. **Sticky header** (`.drawer-header`, glass, blurred):
   - `Quote` eyebrow + small ghost close button (× icon, 36×36 hit target).
   - Identifier row: monospace quote-number chip (`.quote-num-lg`),
     status pill, source pill.
   - `.drawer-title` (account-derived, 1.35 rem 700, tight tracking).
   - `.drawer-subtitle` for the optional customer/project line.
2. **Drawer body** (`.drawer-body`, scrollable, `scrollbar-gutter: stable`):
   each section uses `.drawer-block` (top border separator between sections;
   first block has no top border) and an uppercase `<h3>` eyebrow heading.
3. **Overview**:
   - `.stat-grid` of 4 cards (1 prominent + 3 standard). Total is prominent;
     Sq ft, Created, Updated are standard. Tabular numerics, accent dot on
     the prominent card.
   - `.drawer-meta-dl` two-column definition grid for Account, Customer,
     Project, Location, and (when populated) Sales rep / Branch.
4. **Workflow** (action surface):
   - Primary `Open latest in Internal Estimate` is a full-width
     `.btn-primary .btn-block` with a quiet arrow glyph.
   - `Update status` group: Mark sent (secondary), Mark sold
     (`.btn-status-sold`, green wash), Mark lost (danger).
   - `Manage` group: Archive, Duplicate quote, Open Monday item (when
     `monday_*` ids are present).
   - All destructive or hand-off-altering actions stay behind
     `window.confirm`. The `runAction` wrapper and existing API calls do
     **not** change.
   - Longer guidance lives in a `.quiet-detail` `<details>` so the surface
     stays scannable.
5. **Revisions** (`internal_quote` only):
   - `.revision-list` of card rows. Each row shows a large `Rn` chip,
     `Latest`/`Viewing` pills, the snapshot total, the updated date, the
     revision quote number (monospace inline code), and inline actions
     (View · Open IE · Restore). `Restore` retains its confirm prompt.
   - The current revision and the row being viewed get green/violet
     accents so staff can tell them apart at a glance.
6. **Handoff documents**:
   - `.handoff-grid` of two `.handoff-status-card`s (Moraware, QuickBooks).
     Each shows the latest doc status as a pill, the generation timestamp
     (or "Not generated yet."), and a full-width `Generate` / `Regenerate`
     button.
   - Past documents collapse into a `Document history` `.quiet-detail` to
     keep the surface calm.
7. **Measurements & estimate**:
   - A short summary line plus a compact `.drawer-meta-dl-compact` grid for
     material basis, sinks/cooktops/cutouts, rooms, line items, passthrough
     and custom-line counts.
   - Long lists (Rooms, Material/color breakdown) collapse into
     `.quiet-detail` so they never dominate.
8. **Timeline**: unchanged structure — refined `.timeline` styling only.
9. **Admin debug accordion**: dashed-border block at the bottom. Hidden by
   default; toggled with the same ghost button.

### 12.4 Behavior the visual pass must preserve

When restyling an operational head, never touch:

- API calls, search/filter/sort params, pagination semantics.
- Status transitions, archive/duplicate/restore flows.
- Auth and `requireHeadAccess` assumptions.
- Quote math, revision/save semantics, Monday/Moraware/QuickBooks payloads.
- `runAction` wrapper, `window.confirm` prompts, error/success copy paths.

These remain a **backend** responsibility; the visual pass is purely surface.

---

## 12.5 Pattern: estimating heads (Internal Estimate reference)

The Quote Library is the reference for *search → list → detail* heads.
**Internal Estimate** is the first reference for *estimating* heads — dense,
calc-driven workspaces that center on a long form, a sticky live summary,
and a pinned action bar. The same shell pattern from §13 applies; the
specifics below capture what makes an estimating head trustworthy without
sacrificing the eliteOS visual quality bar.

### 12.5.1 Page skeleton

```
<div class="shell page-internal-estimate">
  <header class="topbar"> brand-row + user-menu </header>
  <div class="ie-shell-body">                       ← max-width content rail
    <section class="ie-hero">                       ← head intro card
      <div class="ie-hero-grid">
        <div class="ie-hero-main">   ← eyebrow + h1 + sub + contextual chips
        <aside class="hero-workspace"> ← workspace identity panel
      </div>
    </section>
    [optional ie-url-banner card]                   ← deep-link / loaded-quote status
    <div class="ie-app-shell">                       ← 3-col layout
      <nav class="ie-rail">                          ← left workflow rail (sticky)
      <main class="ie-main">                         ← project / rooms / addons / review / save
      <aside class="ie-aside side-col">              ← live estimator summary (sticky)
    </div>
  </div>
  <nav class="ie-sticky-actions">                    ← pinned global actions, glass-blur
  <footer class="footer-bar">
</div>
<CustomerEstimatePrint /> ← isolated print branch (see §12.5.4)
```

### 12.5.2 Density and trust rules

- **Estimator speed > visual flourish.** Fields keep their existing order
  and grouping. Section spacing is the only thing that should change in a
  visual pass; never reorder controls or move fields between sections.
- **One primary action per surface.** The sticky action bar is the
  canonical place for `Calculate / Save / Update / Save revision /
  Print`. Inline buttons inside sections stay secondary (`.btn.secondary`
  / `.btn.ghost`) so the global actions read first.
- **Hero is a live command band, not a promo strip.** Eyebrow + bold
  title (with a gradient `Workspace` accent) + supportive copy + a
  bordered live-stats strip showing **real** values pulled straight from
  the estimator state — `Rooms`, `Sq ft (engine)`, `Basis`,
  `Branch`, `Mode / Editing R{n}`. A single live status pill in the
  top-right of the hero ("Backend confirmed" / "Live preview" /
  "Calculating…" / "Sign in to save & calculate") makes the workspace
  feel alive without adding any new backend call. Never display KPIs
  that aren't already in scope.
- **Live summary card is a control panel, not a chart.** Tabular
  numerics, a single gradient hero total (`linear-gradient(135deg,
  ink → blue)`), a small list of rolled-up groups, and a
  collapsible audit `<details>` for engine fields. A 3 px gradient
  accent stripe runs across the top edge. No fake totals, no
  promotional embellishment.

### 12.5.3 Sticky bottom command bar

- Pinned with `position: fixed`, glass background
  (`rgba(255, 255, 255, 0.86)` + `saturate(180%) blur(18px)`), top border
  in `--eos-line`, soft drop shadow, and `safe-area-inset-bottom`
  padding for iOS.
- **Two clusters** separated by `justify-content: space-between`:
  - **Left:** live status pill (with pulsing dot + `prefers-reduced-motion`
    opt-out) — `Backend confirmed` (green) / `Live preview` (blue) /
    `Calculating…` (violet) / `Preview mode` (warn). Next to it, a
    `Live total · ${amount}` readout in tabular numerics. This makes the
    "is this calc trustworthy?" answer always visible without scrolling.
  - **Right:** action cluster. Order: `Calculate` (primary) ·
    `Print estimate` (secondary) · `Update / Save revision / Restore`
    (context-dependent, primary on the current-revision action,
    secondary on the alternate). On viewports ≤ 880 px the two clusters
    stack to a column with `Live total` centered.
- Buttons that gate on backend conditions (sign-in, dirty state, locked
  revision) keep their existing `title=` hover hint with the gating
  reason — never silently disable.

### 12.5.3a Left workflow rail

- Numbered step navigator (`01 Job Info`, `02 Rooms / Areas`, …) where
  the number lives in a quiet rounded chip and the label sits beside it.
  Hover state tints both the chip and the label in burgundy
  (`rgba(163, 19, 47, 0.x)`) so it reads like a navigable step list, not
  a row of plain links.
- A small uppercase `WORKFLOW` eyebrow sits above the list.
- Sub-areas (per-room links under `02 Rooms / Areas`) keep the existing
  collapse toggle, just restyled.

### 12.5.4 Customer print/PDF guardrail

The customer-facing `CustomerEstimatePrint` component lives as a **sibling**
of `.ie-no-print` and is hidden in screen media. The shell topbar, hero,
sticky bar, footer, and `.user-menu` are explicitly hidden inside the
`@media print` block (see `app-internal-estimate/src/styles.css`).

When restyling any estimating head:

- **Do not** apply app-shell tokens to `.cep-*` print classes.
- **Do not** introduce shadows, gradients, or fancy backgrounds in the
  PDF — printed pages must remain calm, readable, and ink-cheap.
- The customer estimate must continue to:
  - hide internal-only worksheet/math diagnostics;
  - hide per-sf rates;
  - lead with the customer-facing estimate summary;
  - include the **Quoted Material Breakdown** by room/group;
  - omit internal-only custom lines by name (they roll into
    *Additional adjustments*);
  - preserve the Lisbon address spelling as `200 Kraiburg Blvd`.

### 12.5.5 Behavior the visual pass must preserve

When restyling an estimating head, never touch:

- Quote math, calculator behavior, room measurement logic.
- Standard vanity vs Vanity Program opt-in, vanity tier labels.
- Add-on / custom-line pricing, use tax handling.
- Save / Update / Save revision / Restore-as-revision / Save-as-new-quote
  flows, hydration from existing `quoteId`.
- Monday / Moraware / QuickBooks payloads triggered on save.
- Visual Layout Canvas state, drag/rotate semantics.
- `runAction` (or equivalent) wrappers, `window.confirm` prompts,
  error/success copy paths.

These remain a **backend** (or quote-engine) responsibility; the visual
pass is purely surface.

---

## 13. Protected head app shell (template)

This is the **canonical app-shell pattern** every protected eliteOS head
should adopt. Home Launcher is the reference; Quote Library is the first
operational head wired up to the full shell. Future heads (Internal
Estimate, Sales, Production, Shop TV, Invoices, …) should start from this
template before adding head-specific surfaces.

### 13.1 Shell layout

```
<div class="shell">
  <header class="topbar" role="banner">
    <a class="brand-row brand-row-link">
      <span class="brand-mark"><img workspace logo /></span>
      <span class="brand-text">
        <span class="brand-wordmark">eliteOS</span>
        <span class="brand-sub">{HeadName · Workspace}</span>
      </span>
    </a>
    <div class="topbar-actions">
      <div class="topbar-account-wrap">
        <button class="topbar-account" aria-haspopup="menu" aria-expanded="…">
          <span class="topbar-avatar">{INITIALS}</span>
          <span class="topbar-account-text">
            <span class="topbar-account-name">{User name}</span>
            <span class="topbar-account-role">{email or role pill}</span>
          </span>
          <span class="topbar-account-caret">▾</span>
        </button>
        {open ? <div class="user-menu" role="menu"> … </div> : null}
      </div>
    </div>
  </header>

  <main class="main" role="main">
    {/* hero · banners · metrics · tabs · cards · list/drawer */}
  </main>

  <footer class="footer-bar" role="contentinfo">
    eliteOS · {Head name}
    Keep the Titans running well.
  </footer>
</div>
```

### 13.2 Left side: workspace + product identity

- `brand-mark` shows the workspace logo (resolution order in §2.1). The
  fallback is the local `EOS_LOGO_URL` asset for the current Elite tenant.
- `brand-wordmark` is **always** `eliteOS`. Never put `slabOS` here — the
  topbar is a workspace surface, not a platform surface (see §2.1).
- `brand-sub` is `<Head name> · <Workspace>` for operational heads and
  `<Workspace>` for the Launcher. Below 720 px the sub collapses.
- The brand row is a link to the head's own root (`/`). Hover background
  tint is shared with Home Launcher (`rgba(11, 26, 51, 0.04)`).

### 13.3 Right side: user chip + menu

See §6.1 and §6.1.1 for visual tokens. Behavior requirements:

- **Identity** comes from the local Supabase `session.user`:
  - `email` and `id` are always present.
  - `user_metadata.full_name` / `name` / `display_name` provide the
    friendly name when set. Otherwise derive a display name from the local
    part of the email.
  - Initials are derived from name (or email local part if no name).
- **Role pill** only renders when the role is already in scope (Home
  Launcher reads it from `/api/me`). Heads that have not wired up `/api/me`
  show the email as the secondary caption instead.
- **System Admin link** only renders when the role is one of
  `admin` / `super_admin` / `executive`. If the role is unknown, the link
  is omitted entirely — never gate by UI-only checks or by guessing from
  email.
- **Refresh action** calls the head's existing data loaders only
  (Launcher: `/api/me` + `/api/me/heads`; Quote Library: metrics + active
  list + open detail). Never invent new endpoints in a UI pass.
- **Profile & preferences** is a placeholder until a real
  `/preferences` surface ships. Render it disabled with a
  `Coming soon` meta line.
- **Sign out** always calls the existing `signOut` helper for the head;
  never bypass the helper to call Supabase directly inline.

### 13.4 New head starter checklist

Every new protected head must satisfy this checklist before being merged:

1. **Shared Brain APIs.** Read identity / heads / business data from
   `backend-core` (or its documented successor). Do not introduce parallel
   sources of truth for users, organizations, quotes, pricing, or sync
   logs.
2. **Backend-enforced permissions.** Authorization lives in backend
   middleware (and RLS where used). The shell may *hide* a menu item
   when the role is known, but **never** rely on UI hiding for security.
   Every protected route still needs `requireAuth` + `requireHeadAccess`
   (or the documented equivalent) server-side.
3. **Workspace identity.** Show the workspace logo + name in the topbar
   brand row *and* (when there is a hero) in the hero workspace panel.
   Use `resolveWorkspaceName` / `resolveWorkspaceLogoUrl` helpers that
   default to the Elite Stone fallback but accept backend payload values
   without code changes.
4. **User chip + menu.** Wire up the chip from the local Supabase session
   only — no speculative `/api/me` call added during a UI pass. Use the
   standard menu order from §6.1.1.
5. **Loading / error / empty states.** Every list, every async surface,
   every dependent component must explicitly render:
   - a loading state (skeleton or shimmer);
   - an empty state (tinted glyph + title + one sentence + one CTA);
   - an error banner (`banner-error`) with a plain-English message and a
     retry / contact path. Raw exception text never reaches the user.
6. **No fake metrics.** KPIs and counts are real values from the backend
   or are omitted. Zero / `—` states use `.metric-zero` quieting; they
   never get fake fallback numbers.
7. **No secrets in the frontend.** No Supabase service-role key, Monday
   token, Moraware credential, partner API secret, signing key, or
   webhook secret may live in the browser bundle, in client env vars
   exposed to the bundle, in client logs, or in DevTools-visible payloads.
   Only the Supabase **anon** key and head URLs are safe.
8. **Tenant scoping.** New tables / new payloads must carry
   `organization_id` (and use it in queries) or document a narrow
   exception in `docs/eliteos/FEATURE_DECISIONS.md`.
9. **Design tokens.** Reuse the token block from the Home Launcher
   (`:root { --eos-* }`). Do not introduce per-head accent colors. Reuse
   the topbar, buttons, pills, banners, hero, drawer patterns documented
   here (§6, §12, §13).
10. **Reduced-motion + a11y.** Every animation has a
    `prefers-reduced-motion` opt-out. Every interactive element has a
    visible focus ring. Icon-only controls carry `aria-label`. Modals,
    drawers, and menus respect Escape and outside-click.
11. **Documentation.** When the head ships, update
    `docs/eliteos/SYSTEM_BLUEPRINT.md`, `docs/eliteos/CURRENT_SYSTEM_MAP.md`,
    and `docs/eliteos/eliteos-master-head-map.md` to register the head
    and its domain. Record any architectural decision in
    `docs/eliteos/FEATURE_DECISIONS.md`.
12. **No premature extraction.** The shared `AppShell` / `UserMenu`
    components are not extracted yet. Mirror the patterns in your head;
    once Home, Quote Library, and Internal Estimate all converge, the
    shared package will be carved out (§13.5).

### 13.5 Future: shared AppShell package

When at least three heads (Home, Quote Library, Internal Estimate) carry
the same shell, lift these primitives into a shared package under
`shared/eliteos-app-shell/`:

- `<Topbar>` (brand row + actions slot).
- `<UserMenu>` (chip + dropdown + standard items + role-gated System Admin).
- `<HeroWorkspacePanel>` (right-column workspace identity).
- `<EmptyState>`, `<SkeletonRow>`, `<Banner>` primitives.

Until then, the rules of thumb:

- **Tokens move first.** A single `:root` token block is already shared
  in spirit; the next consolidation step is to make it a literal import.
- **Patterns move second.** Lift only what at least two heads have
  proven works — don't extract speculatively.
- **APIs stay backend-driven.** The shared package must remain a
  presentational/identity layer; it must not own data fetching for
  business entities (quotes, pricing, partners).
