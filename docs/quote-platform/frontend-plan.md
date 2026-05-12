# Quote Platform — Frontend plan (heads & admin)

**Principle:** Reuse prototype workflows; **all authoritative pricing** from `POST /api/quote/calculate` / `submit` responses.

## Heads (Vite apps — future repos under `app-*`)

### 1. Partner Quoting Head (`app-partner-quote` or card in launcher)

- Auth: dealer_partner / partner role + `partner_quote` head (existing dealer-safe pattern).  
- Flow: same section order as prototype; room engine default on.  
- Calls: `/api/quote/calculate` on debounced edits; `/api/quote/submit` on “Submit to ESF”.  
- Hide: wholesale matrix on customer retail mode (server tells `displayMode`).

### 2. Public Retail Quoting Head (`app-public-quote`)

**UX brief (Eric / accessibility bar):** see **`docs/quote-platform/public-quote-ux.md`** — wizard, one question per step, large controls, presets + “I’m not sure,” Good/Better/Best or **range only** (no line items), always **“Have Elite help me finish this,”** no wholesale/partner/admin/Monday UI. Backend still persists quotes, forecast events, and Monday staging logs.

- Auth: unauthenticated **later** with rate limits + abuse controls; early versions may use minimal contact verification.  
- API: `quote_source = public_retail` only; server enforces **≥25%** markup and returns **customer-safe** calculate payloads.

### 3. Internal Quote / Estimator Head (`app-quote-internal`)

- Staff-only; full matrix, readiness, handoff, file upload to Storage.  
- Optional: import prototype JSON → `normalizePrototypeQuoteInput` → calculate.

### 4. Quote Review / Staging Head

- Queue: `quote_status in ('submitted','review_needed')`.  
- Readiness checklist from snapshot; approve → status `sent` or internal next step.

### 5. Pricing Structure Admin (System Admin or dedicated head)

- CRUD structures; edit rules in grid; clone structure for seasonal promos.  
- Validation: warn when `public_retail` markup < 25 (DB CHECK still blocks).

### 6. Partner Pricing Assignment Admin

- Pick `quote_partner_accounts`, assign `quote_pricing_structures`, effective dates.  
- Show diff vs previous structure.

### 7. Quote Forecast / pipeline widgets

- Embed in Executive or new **Quote Intelligence** dashboard: cards fed by `quoteAnalytics.js` APIs (future `GET /api/quote/analytics/*`).  
- Charts: value by rep/branch/partner, aging buckets, bid/close.

## Launcher / Home

- Add cards when `user_head_access` grants quote heads (governance doc update later).

## Non-goals (frontend)

- Re-implementing Moraware or Monday UI.  
- Trusting browser `grandTotal` without server echo.

## Phase sequencing

1. Internal head + calculate API only.  
2. Partner head + submit.  
3. Public retail + hardening.  
4. Admin pricing + assignments.  
5. Analytics widgets.
