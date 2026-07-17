# Lovable UI Integration Plan — Digital Estimate

**Source:** `/Users/chris.henely/Downloads/hub-spoke-hub-76031284-main`  
**Handoff:** `/Users/chris.henely/Downloads/hub-spoke-hub-76031284-main/CURSOR_HANDOFF.md`  
**Implementation shape:** one substantial customer-experience milestone

## Objective

Turn the existing Digital Estimate into a polished, premium, mobile-friendly customer configuration experience while preserving every existing eliteOS security, publication, pricing, session, envelope, and audit boundary.

This is an adaptation, not a port. The Lovable repository supplies interaction and visual references; eliteOS remains the only source of data and business authority.

## Proposed customer journey

1. **Review**
   - branded estimate header
   - customer/project context
   - original frozen estimate
   - pricing-valid-through date
   - concise locked professional scope explanation
2. **Customize**
   - room-oriented sections
   - estimator-approved finish cards
   - server-approved add-ons and quantities
   - clear included, unavailable, and estimator-review states
   - save action with explicit progress and error feedback
3. **Compare**
   - original estimate
   - updated estimate from the Brain
   - change from original
   - no client-derived totals
4. **Request review**
   - optional note
   - explicit “not acceptance” language
   - immutable prior request confirmation and reference
   - current-selections-differ warning
5. **Resume**
   - HttpOnly session restores saved selections
   - revoked, superseded, unavailable, and invalid states remain generic and fail closed

## Proposed Studio journey

Keep the current Studio contract and actions. A later presentation-only refinement may organize the existing workspace into:

1. frozen publication baseline
2. envelope status/history
3. room finish allowlist
4. approved option catalog
5. internal and customer-safe preview
6. validation blockers
7. guarded activation
8. review requests and amendment workflow

Studio should not copy the Lovable estimator’s browser pricing engine, editable professional measurements, custom price lines, raw token display model, or acceptance workflow. The current private authorization and Brain APIs remain mandatory.

## Exact eliteOS files

### Implemented in this milestone

- `app-digital-estimate/src/ConfigurationView.tsx`
  - presentation hierarchy, journey indicator, lock messaging, summary structure
- `app-digital-estimate/src/styles.css`
  - design tokens, responsive layout, cards, selected states, sticky summary, focus states

### Documentation

- `docs/digital-estimate/LOVABLE_PROTOTYPE_AUDIT.md`
- `docs/digital-estimate/LOVABLE_UI_INTEGRATION_PLAN.md`

### Candidate files for a future approved enhancement

- `app-digital-estimate/src/ConfigurationView.tsx`
  - room tabs or accordions, accessible picker dialog
- `app-digital-estimate/src/ReadOnlyEstimateView.tsx`
  - align read-only project presentation with the premium configuration shell
- `app-digital-estimate/src/publicConfigApi.ts`
  - types only if the existing public DTO is deliberately extended
- `app-elite100-estimate-studio/src/ConfigurationWorkspace.tsx`
  - clearer workflow grouping without changing requests
- `app-elite100-estimate-studio/src/ReviewWorkspace.tsx`
  - status hierarchy and comparison presentation
- `app-elite100-estimate-studio/src/styles.css`
  - matching presentational tokens
- `backend-core/src/digitalEstimate/configuration/configurationPublicSerializer.mjs`
  - only if a future product decision approves customer-safe catalog imagery/metadata
- corresponding existing UI/backend tests

Any backend or DTO file is explicitly outside the current implementation.

## Assets

Lovable includes a partial Elite 100 texture set that may be staged later:

- source: `/Users/chris.henely/Downloads/hub-spoke-hub-76031284-main/public/material-textures/elite100/{full,thumb}/*.jpg`
- proposed destination: `app-digital-estimate/public/material-textures/elite100/{full,thumb}/`
- not copied in this milestone, because the public DTO cannot yet authorize or serve them

If catalog imagery is approved later:

- prefer the authoritative, licensed eliteOS material catalog as the long-term source of truth
- the public DTO must expose only approved image identity/URLs and customer-safe labels
- missing images must have an intentional neutral fallback
- no pricing metadata may be inferred from image paths
- CSP `img-src` must remain compatible with the chosen asset origin

## Rebuild map

### Room and option cards

Build from `ConfigurationState.configuration.rooms` and `.options`. Customer clicks submit option identity and quantity only. Selected cards must reflect saved/current selections and server-approved defaults.

### Price summary

Render only:

- frozen baseline from the publication/configuration DTO
- configured result from the latest Brain calculation
- display delta from the latest Brain calculation

Never recompute material, tax, markup, discounts, account rules, or final rounding in React.

### Original-versus-updated comparison

Keep the current v2 semantics and wording “Change from original.” The original number is immutable; the updated number is a configuration estimate pending review.

### Review request

Keep the current prerequisite: selections must be saved and have a latest server calculation. The customer submits note, expected row version, selection identity, and idempotency—not totals or authority fields.

### Material/product picker

Defer until customer-safe catalog data exists. When approved, implement an accessible dialog/bottom sheet with:

- search and server-approved filters
- keyboard focus trap and Escape close
- selected state by text/icon/color
- responsive card grid
- no rates or hidden internal evidence

## Mobile behavior

- Single-column reading order below 860px.
- Summary becomes a bottom-sticky action surface without covering focused controls.
- Cards and inputs remain full width.
- Long room/material labels wrap instead of truncating critical meaning.
- Primary controls meet 44px touch target.
- Any future picker opens as a full-height bottom sheet and preserves scroll position.
- Print layout remains separate from interactive mobile layout.

## Accessibility acceptance criteria

- WCAG 2.2 AA color contrast.
- Logical heading order and landmark labels.
- Visible focus indicators with at least 3:1 contrast.
- Native controls or correct ARIA roles/states.
- Save and review status exposed through polite live regions.
- Errors associated with the affected action/control.
- Selected/unavailable/locked states conveyed without color alone.
- Reduced-motion support.
- Zoom to 200% without loss of content or horizontal page scrolling at 320 CSS px.

## Security and pricing acceptance criteria

- No Supabase import in `app-digital-estimate`.
- No service-role credential or protected environment value in either Vite app.
- No raw token in storage, query, or customer path.
- Fragment token is captured once, cleared, and exchanged for the existing HttpOnly session.
- Public mutations remain same-origin JSON requests with existing Origin enforcement.
- Browser submits no price, rate, tax, markup, organization, account, total, locked measurement, or internal evidence.
- `elite100-config-delta-v1` and `elite100-config-delta-v2` identities remain unchanged.
- No existing publication, envelope, session, selection, calculation, review, amendment, or event history is mutated by the UI work.

## Test plan

### Automated

- `npm run test:ui --prefix app-digital-estimate`
- `npm run build --prefix app-digital-estimate`
- `npm run test:ui --prefix app-elite100-estimate-studio`
- `npm run build --prefix app-elite100-estimate-studio`
- `git diff --check`
- static scan of Vite apps for service-role, protected secret, direct pricing table, and Supabase additions
- verify v1/v2 engine constant files are absent from the UI diff
- verify protected DE.2G lifecycle file checksums are unchanged

### Manual

- desktop at 1440px: two-column configuration and sticky summary
- tablet at 768px: single-column cards and bottom summary
- phone at 375px: no clipped content, reachable save/review actions
- keyboard-only: all material, option, save, print, and review controls
- 200% zoom and reduced motion
- baseline-only estimate remains readable
- active configuration saves and refreshes through the existing session
- server 409 shows retry guidance
- generic 404 returns unavailable state
- print preview excludes interactive controls and includes configured comparison

No review request should be submitted during validation.

## Rollback plan

This milestone is presentation-only:

1. Revert the `ConfigurationView.tsx` hierarchy/class additions.
2. Revert the new CSS token/layout blocks.
3. Keep the audit and plan for reference if desired.
4. Re-run customer UI tests and build.

No database, migration, token, publication, envelope, calculation, or production rollback is required.

## One coherent implementation milestone

### Premium Customer Configuration Pass

Deliver the customer-facing estimate shell, journey indicator, room/finish cards, locked-scope reassurance, original-versus-updated hierarchy, desktop sticky summary, mobile bottom summary, review-request presentation, accessibility states, and regression coverage as one reviewable UI change.

The current milestone implements the safe presentation foundation. It intentionally excludes catalog imagery/pickers, customer acceptance, payment, new DTO fields, and Studio restructuring because those need product/data decisions or broader testing.

## Remaining decisions

1. Whether customer-safe material images and supplier/color labels should be added to the public DTO.
2. Whether multi-room estimates need tab/accordion navigation once real room counts exceed the current pilot.
3. Whether the review request should remain below the configuration or open in an accessible confirmation sheet.
4. Whether Studio should receive a separate presentation pass after the customer milestone is reviewed.
5. Whether any future acceptance/order flow belongs in Digital Estimate; it must not be inferred from the Lovable mock.

## Recommended next single step

Review the implemented Premium Customer Configuration Pass locally with the synthetic fixture at desktop and mobile widths. If the direction is approved, the next single implementation should be an authoritative customer-safe material picker: first approve the minimal image/label DTO, then build the accessible dialog over that DTO without exposing rates or changing the v2 engine.
