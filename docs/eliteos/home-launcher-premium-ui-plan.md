# Home Launcher Premium UI Plan

**Scope:** `app-home` (eliteOS Home Launcher) — visual foundation pass only.  
**Date:** 2026-06-17  
**Status:** Step A (plan) complete; Step B (implementation) in progress on this branch.

---

## 1. Current app-home architecture summary

### Stack & entry

| Piece | Location | Role |
|---|---|---|
| Vite + React 19 | `app-home/` | SPA shell |
| Entry | `app-home/src/main.tsx` | Mounts `App`, imports CSS |
| Root component | `app-home/src/ui/App.tsx` | Auth, launcher, profile — all client logic |
| Styles | `app-home/src/ui/styles.css` | Home-specific layout, cards, auth, profile |
| Shared tokens | `shared/eliteos-ui/eliteosTokens.css` | Original `--eos-*` design tokens |
| Shared topbar | `shared/eliteos-ui/EliteosTopbar.tsx` + `eliteosTopbar.css` | Presentational header; portal dropdown |
| Supabase client | `app-home/src/lib/supabase.ts` | Session only |
| API helper | `app-home/src/lib/api.ts` | Bearer-token fetch to Brain |
| Config | `app-home/src/lib/config.ts` | Backend base URL, launcher URL sanitization |

### Auth & session flow

1. **Signed out:** `showShell === false` → two-column auth stage (slabOS brand + sign-in panel). `supabase.auth.signInWithPassword`.
2. **Session restore:** `getSession()` on mount; `onAuthStateChange` handles `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `INITIAL_SESSION`, `USER_UPDATED`.
3. **Invite/recovery:** URL hash/search detection → optional invite password gate; OAuth errors surfaced via `readOAuthErrorFromBrowser()`.
4. **Hydration:** When token present, parallel `GET /api/me`, `GET /api/me/heads`, `GET /api/me/preferences`.
5. **Sign out:** Best-effort `POST /api/auth/log-event` then `supabase.auth.signOut()`.

### Launcher rendering

- Heads from `headsPayload.heads` (Brain authority).
- Split into **Available Tools** (has launch URL) vs **Coming Soon Tools** (no URL).
- Card open: `pickLaunchUrl` → `sanitizeLauncherLaunchUrl` → `window.open` or `location.href` per prefs.
- Search filters client-side over title, description, category, badge text.
- Badges: Live / Preview / Available / Public / Admin / Not assigned / Coming soon — derived in `resolveCardBadges`.
- Admin/executive see collapsible **Access details** with technical slug → URL reference.

### States

| State | Trigger | UI |
|---|---|---|
| Loading | `loadingData && !headsPayload` | Skeleton card grid |
| Error | `loadError` | Banner + retry |
| Inactive account | `headsPayload.inactive` | Warning banner |
| Empty assigned | `assignableHeads.length === 0` | Empty box (admin vs user copy) |
| Search empty | `searchActive && searchTotalCount === 0` | Search empty box |

### Account menu

- `EliteosTopbar` owns dropdown open/close state.
- Menu **portaled to `document.body`** (`eliteos-topbar-menu--portal`) to avoid `contain: paint` clipping.
- Position computed from chip `getBoundingClientRect()` with viewport clamping.
- Home passes `searchSlot`, `menuItems` (profile, refresh access), `onSignOut`.

### API usage

| Endpoint | When | Purpose |
|---|---|---|
| `GET /api/me` | After sign-in | User identity, role, org fields |
| `GET /api/me/heads` | After sign-in | Allowed head cards, launch URLs, enabled flags |
| `GET /api/me/preferences` | After sign-in | User prefs (best-effort) |
| `PATCH /api/me/preferences` | Profile save | Persist prefs |
| `POST /api/auth/log-event` | Sign out | Audit (best-effort) |

---

## 2. Files safe to change

- `app-home/src/ui/styles.css` — primary visual surface
- `app-home/src/ui/App.tsx` — **presentational markup/classes only** (no auth/API logic changes)
- `app-home/src/main.tsx` — CSS import order
- `app-home/index.html` — meta/theme-color if needed
- `shared/eliteos-ui/eliteosTokens.css` — new shared tokens (presentational)
- `docs/eliteos/home-launcher-premium-ui-plan.md` — this document

Optional, low-risk shared touch:

- `shared/eliteos-ui/eliteosTopbar.css` — only if aligning token references; **no portal/position logic changes**

---

## 3. Files not to change

| Area | Paths / reason |
|---|---|
| Backend auth & head access | `backend-core/src/**` auth, `testHeadAccess.js`, RLS |
| API contracts | `/api/me`, `/api/me/heads` response shapes |
| Supabase config | `app-home/src/lib/supabase.ts`, env examples |
| Redirect / invite behavior | OAuth callback paths, `bootUrlRef` flow |
| Quote / pricing / Moraware / Monday / QB | All quote-platform heads and math |
| Slab Inventory / AI Takeoff | `app-slab-inventory/`, related backend |
| `app-home/src/lib/api.ts`, `config.ts` | Unless purely cosmetic comments |

---

## 4. “Do not break” checklist

- [ ] Signed-out auth stage renders and submits login
- [ ] `supabase.auth.getSession()` restores session on reload
- [ ] `onAuthStateChange` clears state on `SIGNED_OUT`
- [ ] `TOKEN_REFRESHED` does **not** re-hydrate unnecessarily
- [ ] Invite/recovery URL detection and password gate unchanged
- [ ] `hydrate()` still calls `/api/me` + `/api/me/heads` in parallel
- [ ] `pickLaunchUrl` / `sanitizeLauncherLaunchUrl` / prod HTTPS rules unchanged
- [ ] Disabled or unassigned heads do not get working Open buttons
- [ ] Heads not returned by Brain are never invented client-side
- [ ] `EliteosTopbar` account menu portals to body and positions correctly
- [ ] Sign-out still calls audit log then `signOut()`
- [ ] Profile view navigation (`?view=profile`) unchanged
- [ ] Search filters heads but does not bypass permissions

---

## 5. Proposed premium visual direction

**Feel:** Premium SaaS operating system for stone fabrication — calm, warm, authoritative.

| Principle | Application |
|---|---|
| Warm stone canvas | Off-white `#f7f5f1` base, cream cards, subtle stone/gold accents |
| Elite maroon anchor | Primary actions, focus rings, hero motto |
| Layered depth | Soft orbs behind content (not `background-attachment: fixed`) |
| Bento composition | Featured tools span wider; roadmap stays compact |
| Restrained motion | 130–320ms transforms/opacity; `prefers-reduced-motion` fallbacks |
| Typography hierarchy | Display greeting, uppercase eyebrows, tabular stat numbers |
| Factual badges | Status pills with dot indicators — no gamification |

**Not doing:** Canvas/WebGL, heavy blur on sticky chrome, copied third-party selectors/tokens/gradients.

---

## 6. Original eliteOS / slabOS token strategy

Tokens live in `shared/eliteos-ui/eliteosTokens.css` under `@layer tokens`:

- **Canvas:** `--eos-canvas`, `--eos-cream`, `--eos-parchment`
- **Ink:** `--eos-ink` … `--eos-ink-faint`
- **Brand:** `--eos-accent` (Elite maroon), `--eos-accent-ring`
- **Stone accents:** `--eos-stone-gold`, `--eos-stone-warm` (sparse use)
- **Orbs:** `--eos-orb-warm`, `--eos-orb-rose`, `--eos-orb-maroon`, `--eos-orb-slate`
- **Layout:** `--eos-content-max`, `--eos-bento-gap`, `--eos-space-*`
- **Legacy aliases:** `--elite-action-red*` for backward compatibility

Each head imports tokens in `main.tsx` **before** local `styles.css`. Shared topbar references `--eos-*` but does not define them.

---

## 7. Proposed Home Launcher layout improvements

### Hero (bento header)

- Two-column grid: greeting + stats | workspace identity card
- Cursor spotlight on desktop (disabled for reduced-motion / touch)
- Warm aurora wash; maroon-forward accent on motto

### Available tools (bento grid)

- 12-column grid at `≥960px`
- `quote` and `quote_library` cards span 6 columns (featured row)
- Remaining cards span 4 columns (3 per row)
- Single column on mobile

### Roadmap section

- Denser dashed cards, 2-column grid on tablet, muted glyphs

### Background

- `.shell-orbs` fixed decorative layers on signed-in shell (transform/opacity only)
- Body uses static gradient — **no** `background-attachment: fixed`

### States

- Loading: shimmer skeletons + polite `aria-live` status
- Error: icon + structured banner
- Empty: icon + clear CTA copy (unchanged logic)

---

## 8. CSS performance guardrails

| Rule | Rationale |
|---|---|
| No `background-attachment: fixed` | Scroll jank on mobile |
| No heavy `backdrop-filter` on sticky topbar | GPU cost on long pages |
| Prefer `transform` + `opacity` for hover/lift | Compositor-friendly |
| `contain: paint` on topbar only | Isolates header; menu portals out |
| Short animations (≤320ms) | Snappy SaaS feel |
| `prefers-reduced-motion: reduce` | Disable entrance, shimmer, spotlight |
| No new runtime deps | CSS-only visual system |

---

## 9. Mobile / responsive behavior plan

| Breakpoint | Behavior |
|---|---|
| `≤960px` | Auth stage stacks; hero workspace compacts to horizontal strip |
| `≤820px` | Hero single column; workspace inline row |
| `≤720px` | Main padding reduced; available cards single column; topbar padding tightened |
| `≤560px` | Search wraps full width below brand + chip |
| `≤440px` | Roadmap single column; topbar subtitle hidden (shared CSS) |

Touch: hero spotlight disabled for `pointerType === "touch"` (existing JS).

---

## 10. Accessibility checklist

- [ ] `role="main"`, `role="banner"`, `role="contentinfo"` preserved
- [ ] `focus-visible` rings on buttons, inputs, summary, menu items
- [ ] `aria-live` on loading status
- [ ] `aria-label` on search, account menu, sections
- [ ] Color contrast ≥ 4.5:1 for body text on cream/white
- [ ] `prefers-reduced-motion` disables animations and spotlight
- [ ] Keyboard: Escape closes account menu (topbar)
- [ ] Semantic headings: one `h1` per view

---

## 11. QA checklist

### Automated

- [ ] `npm run build --prefix app-home`
- [ ] `npm run eos:check:local`
- [ ] `npm run eos:test:head-access`

### Manual

1. Signed-out state renders slabOS brand + sign-in
2. Sign-in with valid credentials reaches launcher
3. Hard refresh restores session
4. Network tab shows `GET /api/me` and `GET /api/me/heads` with Bearer token
5. Assigned heads show Open button; unassigned show muted state
6. Heads not in API response do not appear
7. Account menu opens, stays unclipped at viewport edges, sign-out works
8. Mobile layout: search, cards, hero usable at 375px width
9. Tab through cards and buttons — visible focus
10. OS reduced-motion: no card entrance / shimmer / spotlight
11. No backend or quote/pricing files in diff

---

## 12. Recommended rollout order after Home Launcher

| Order | Head | Reasoning |
|---|---|---|
| 1 | **app-quote-library** | Already uses `EliteosTopbar`; inherits tokens with minimal work; high daily traffic |
| 2 | **app-internal-estimate** (`quote`) | Core estimating workflow; users return via launcher frequently |
| 3 | **app-pricing-admin** | Admin surface; benefits from shared cards/forms patterns |
| 4 | **app-system-admin** | Org/head assignment UI; consistency reduces support confusion |
| 5 | **app-slab-inventory** | Distinct data density; apply tokens + topbar first, defer bento |
| 6 | Remaining heads | `shop_tv`, `executive`, etc. — lower change frequency |

**Reasoning:** Roll out shared tokens + topbar to heads that already import `EliteosTopbar` first (low regression risk, immediate cohesion). Defer inventory and TV heads until card/table patterns are extracted from Home + Quote Library.

---

## Implementation log (Step B)

| Change | File |
|---|---|
| Shared token file | `shared/eliteos-ui/eliteosTokens.css` |
| Token import | `app-home/src/main.tsx` |
| Layered CSS, orbs, bento grid, state polish | `app-home/src/ui/styles.css` |
| Shell orbs, bento classes, loading a11y | `app-home/src/ui/App.tsx` |

**Behavior unchanged:** auth, session, API calls, head access, redirects, URL sanitization.
