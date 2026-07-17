# Lovable Prototype Audit — Digital Estimate

**Audit date:** 2026-07-16  
**Prototype repository:** `/Users/chris.henely/Downloads/hub-spoke-hub-76031284-main`  
**Cursor handoff:** `/Users/chris.henely/Downloads/hub-spoke-hub-76031284-main/CURSOR_HANDOFF.md`  
**Target:** existing eliteOS Digital Estimate and private Elite 100 Estimate Studio

## Executive decision

Use the prototype as a visual and interaction reference only. Its strongest contribution is a clear customer journey built from room cards, approachable option selection, a persistent total, responsive picker sheets, and plain-language change requests. None of its persistence, token, pricing, acceptance, or authorization implementation should be ported.

The safe first integration is presentation-only in `app-digital-estimate`. The existing Brain APIs, public DTOs, fragment exchange, HttpOnly session, activated envelopes, v2 delta engine, review request flow, and immutable publication baseline remain the authority.

## Prototype architecture

- TanStack Start application with file routes under `src/routes`.
- React 19, Vite 8, Tailwind CSS 4, Radix primitives, TanStack Router/Query, React Hook Form, Zod, Lucide, Sonner, and a large generated `src/components/ui` library.
- Lovable Cloud Supabase persistence through TanStack server functions.
- Browser-side mock domain and pricing model in `src/lib/sales-order-mock.ts`.
- Customer link at `/q/$token`; staff routes under `/_authenticated`.
- Direct Supabase browser client exists for authentication and queue behavior.
- A single SQL migration creates `sales_orders`, `quote_tokens`, and `quote_events`.

The prototype had no installed dependency directory. `npm run build` was attempted without installing packages and stopped at `vite: command not found`. No dependency installation, deployment, database connection, or production action was performed.

## Screen and component inventory

### Customer experience

- `src/routes/q.$token.tsx`
  - branded estimate header
  - customer/project introduction
  - room cards
  - material/color selector
  - edge-profile chips
  - backsplash choices
  - sink and faucet summaries
  - vanity panel
  - sticky total summary
  - request-a-change modal
  - typed-signature acceptance
  - accepted-state mock
- `src/components/ProductPickerModal.tsx`
  - mobile bottom sheet / desktop modal
  - search, brand, and usage filters
  - selected-count footer
- Customer flow: open link → personalize rooms/options → see immediate total → save automatically → request a change or sign.

### Staff experience

- `src/routes/_authenticated/queue.tsx`
  - status filters, search, pipeline labels, demo and live rows
- `src/routes/_authenticated/estimator.tsx`
  - customer and channel details
  - room builder
  - materials, edges, sinks, faucets, backsplash, vanities, and custom lines
  - calculated summary
  - draft persistence and customer-link generation
- `src/routes/quote.$id.tsx`
  - quote detail and operational status
- `src/routes/auth.tsx`
  - prototype email/password authentication

## Styles and design tokens

`src/styles.css` defines a restrained neutral system using OKLCH semantic variables, rounded surfaces, subtle borders, high-contrast primary actions, muted supporting text, and responsive Tailwind utilities. The most useful ideas are:

- warm off-white page background and white content surfaces
- large but restrained typography
- compact uppercase section kickers
- pill-shaped filters and choices
- roomy cards with clear hierarchy
- desktop content-plus-summary layout
- bottom-sheet behavior on phones
- tabular numeric totals

The generated Radix component wrappers are not directly reusable in the current Vite apps without importing a large dependency and Tailwind stack. Rebuild their behavior in existing eliteOS CSS/React.

## Asset inventory

Present under the Lovable download:

- `public/favicon.ico`
- `public/material-textures/elite100/full/` — 11 JPG textures
- `public/material-textures/elite100/thumb/` — 11 JPG textures

Covered textures (partial Elite 100 set): antique-gray, bayshore-sand, bianco-carrara, carrara-classic, carrara-royale, classic-gray, india-black-pearl-polished, sicilia, silver-pearl-polished, suede-brown-polished, white-dove.

These are presentation assets only. They must not be wired into Digital Estimate until a customer-safe catalog/DTO decision exists; the current public configuration contract does not expose image URLs. CSS hex swatches covering the remaining colors in `sales-order-mock.ts` are placeholders and must not become business authority.

Also reusable as design reference only: semantic tokens in `src/styles.css`. Emoji product icons and generated Radix wrappers should not be copied.

## Dependency inventory and disposition

- Useful concepts, but no new dependency required: Radix dialog semantics, Lucide-style iconography, Zod validation patterns, Tailwind responsive breakpoints.
- Not needed for the first integration: TanStack Start, TanStack Router, TanStack Query, Tailwind, the generated UI library, Recharts, Embla, Vaul, and Lovable Vite tooling.
- Explicitly reject: `@lovable.dev/vite-tanstack-config` and Lovable runtime error hooks in eliteOS customer surfaces.
- Existing `app-digital-estimate` can deliver the desired pass with React and CSS only.

## Decision classification

### 1. Reuse directly

- No image or icon files.
- Adapt the semantic color/radius/spacing approach from `src/styles.css`.
- Reuse only generic wording patterns that accurately describe the existing estimate flow.

### 2. Rebuild in eliteOS

- Customer room cards using `configuration.rooms` and estimator-approved options.
- Material/finish cards using `ConfigOption`; never copy mock colors or rates.
- Persistent desktop price summary using server-returned baseline/configured/delta values.
- Mobile sticky summary and future picker-sheet patterns.
- Original-versus-updated comparison.
- Review-request experience using the existing save-then-review contract.
- Staff envelope-workflow hierarchy in Studio, if a later presentation pass is approved.

### 3. Inspiration only

- Three-step journey: review → customize → save/request review.
- Warm premium palette and generous spacing.
- Search/filter treatment for a future server-approved material catalog.
- Responsive bottom sheets.
- Plain-language locked-scope explanations.
- Immediate but honest save/recalculation feedback.

### 4. Reject

- `priceOrder()` and all browser price/rate tables.
- Sending `payload` and `total_cents` from the customer browser and persisting them as authority.
- Raw tokens stored in `quote_tokens.token`.
- Raw credential in `/q/<token>` path and generated customer links.
- Broad authenticated RLS policies using `USING (true)` with no `organization_id`.
- Authenticated delete access to orders.
- Public mutation through service-role-backed server functions without the eliteOS DTO and session boundaries.
- Client-driven acceptance/signature and mock “sold”, Moraware, QuickBooks, invoice, or payment behavior.
- Mutable published totals and unversioned calculations.
- Lovable error-reporting hooks and any third-party telemetry.
- Emoji product icons as production visual assets.
- Prototype material, sink, faucet, vanity, tax, markup, and channel data as business authority.

## Security and pricing findings

### Critical

- `src/lib/sales-orders.functions.ts` accepts a complete customer-controlled `Order` and `total_cents`, then writes both. The server does not recompute pricing.
- `src/lib/sales-order-mock.ts` contains price groups, rates, tax, products, and totals in browser code.
- Raw quote tokens are stored and queried directly, returned to staff, and embedded in path URLs.
- The migration has no `organization_id`; authenticated policies permit all authenticated users to read, update, and delete all orders and manage all tokens.

### High

- Customer state is debounced and persisted without optimistic concurrency or a versioned engine identity.
- Acceptance freezes the current payload without authoritative repricing and logs a customer-provided signature.
- The accepted screen claims downstream Moraware and QuickBooks progress that is not implemented.
- Error messages expose distinct invalid/revoked/expired token states instead of the eliteOS generic fail-closed response.

### eliteOS controls that remain mandatory

- immutable publications and frozen baseline
- hashed/revocable token exchange through a URL fragment
- immediate fragment clearing and HttpOnly customer session
- synthetic allowlist and private Studio authorization
- activated immutable configuration envelopes
- locked professional scope and measurements
- identity-only customer selections
- server-authoritative, versioned `elite100-config-delta-v2` calculations
- review request/amendment audit history
- no browser organization, account, rate, tax, markup, total, or pricing-evidence authority

## Gaps in the pre-audit eliteOS UI

- Customer configuration was a narrow single-column form rather than a premium project review.
- The total summary competed with content on desktop instead of remaining visibly anchored beside it.
- Selection cards had limited visual hierarchy and weak selected-state affordance.
- Locked scope was technically explained but not visually reassuring.
- The journey from original estimate to customization to review request was not explicit.
- Mobile behavior was functional but lacked a deliberate summary/picker pattern.
- Studio is operationally complete for the pilot but dense and developer-oriented.
- Catalog imagery is not available in the current public DTO and should not be invented in the browser.

## Current safe implementation

A presentation-only customer pass was applied to:

- `app-digital-estimate/src/ConfigurationView.tsx`
- `app-digital-estimate/src/styles.css`

It adds:

- premium ESF brand lockup
- explicit three-step journey
- clearer locked-scope presentation
- stronger finish/option cards
- selected-state check affordance
- two-column desktop layout with sticky summary
- mobile sticky summary
- more legible original/updated/delta hierarchy
- responsive and reduced-motion behavior

No API calls, payloads, DTOs, persistence, calculations, token logic, cookies, envelopes, or review actions changed.

## Accessibility expectations

- Maintain semantic headings, lists, labels, tables, and radiogroup naming.
- Preserve keyboard operation and visible focus on every control.
- Use real dialogs with focus trapping before adding future picker sheets.
- Meet WCAG 2.2 AA contrast and 44px touch targets for primary mobile controls.
- Announce save/recalculation state without stealing focus.
- Respect `prefers-reduced-motion`.
- Do not rely on color alone for selected, locked, warning, or unavailable states.
- Keep print output meaningful and exclude interactive-only controls.

## Conclusion

The prototype validates the desired customer-experience direction but not the architecture. The right path is to progressively rebuild its room-card, picker, summary, and journey ideas over eliteOS’s existing authoritative contracts. The first presentation-only pass is safe; material imagery, richer room navigation, and advanced pickers require a separately reviewed DTO/product decision.
