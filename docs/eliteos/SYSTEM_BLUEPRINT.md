# eliteOS Living System Blueprint

**Audience:** Founder, operators, and engineers. This is the **living** source of truth for **intent**, **architecture**, **business logic**, **integrations**, and **security** expectations as eliteOS grows.

**Maintenance rule:** Whenever architecture, data flow, pricing logic, integrations, security posture, deployment steps, or SaaS assumptions change in a meaningful way, **update this document** or add an entry to [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md).

---

## 1. Product identity

| Item | Detail |
|------|--------|
| **Product name** | **eliteOS** |
| **User-facing name** | **eliteOS** (not “eOS” in customer-facing copy, marketing, or public UIs). |
| **Technical legacy** | Repo scripts, env prefixes, and internal identifiers may still use `eos`, `eOS`, or `EOS_*` until intentionally renamed. Prefer **eliteOS** in new user-visible strings and new docs. |

---

## 2. System purpose

- **eliteOS** is a **multi-head operating system** for **stone fabrication** companies (and adjacent workflows).
- **Heads** are focused surfaces (public quote, brain health, executive, future Moraware admin, etc.).
- **Heads share the same Brain** (backend APIs, shared data model, shared auth patterns).
- **Design principle:** Build for **Elite / Eric today**; architect for **~1,000 fabricators tomorrow** (multi-tenant SaaS awareness, org boundaries, configurable settings over hardcoded shop logic).

---

## 3. Architecture overview

| Layer | Role |
|-------|------|
| **Heads / frontends** | Vite + React apps (`app-*`). Each head is a product slice; must not duplicate **eliteOS Brain** business logic as the source of truth. |
| **eliteOS Brain / API** | `backend-core` — Express (or serverless entry), quote routes, integrations, org context, permission checks. |
| **Supabase** | Database, Auth (anon + user JWT for heads), Row Level Security where enabled; **organization-scoped** data for SaaS. |
| **Monday.com** | Optional CRM sync for public (and other) quotes; **server-side only** token. |
| **Moraware** (future) | Read-oriented integration; credentials and mappings stay **server-side**; dedicated **Moraware Admin / Integration Mapping Head** planned. |
| **Cloudflare** | DNS and domain routing (e.g. public quote hostname). |
| **Vercel** | Hosting for heads and Brain/API deployments. |
| **GitHub + Cursor** | Source control; AI-assisted development with project rules under `.cursor/rules/`. |

**Data flow (conceptual):** Head → **eliteOS Brain** API (with auth where required) → Supabase (+ external APIs such as Monday from the Brain only).

---

## 4. Current deployed URLs

| Surface | URL |
|---------|-----|
| **Home / Launcher Head (`app-home`)** | **`https://www.eliteosfab.com`** — **eliteOS Home**; central Supabase sign-in and **eliteOS Launcher** (calls `GET /api/me`, `GET /api/me/heads`). **Invite / recovery links** from System Admin should use **`SUPABASE_INVITE_REDIRECT_URL`** (e.g. `https://www.eliteosfab.com/auth/callback`) so magic links complete here—not on localhost. |
| **System Admin Head (`app-system-admin`)** | **`https://system.eliteosfab.com`** — **governance console**: users, roles, head access, invites, deactivate/reactivate, guarded test-user delete, org UUID on profiles, per-user audit snippets, schema/diagnostics. **Quote workflow** and **primary pricing configuration** are **not** long-term owners here (see **Quote Library** and **Pricing Admin** heads; `FEATURE_DECISIONS.md` §13). Invites and recovery links are sent **server-side** from **backend-core** with `redirectTo` pointing at **eliteOS Home**. |
| **Public Quote Head (`app-quote`)** | **`https://quote.eliteosfab.com`** — **eliteOS Public Quote Head** |
| **Public Quote (Vercel fallback)** | https://eliteos-quote.vercel.app |
| **Internal Estimate Head (`app-internal-estimate`)** | **`https://internal.eliteosfab.com`** or **`https://estimate.eliteosfab.com`**; until DNS cutover, set **`HEAD_URL_INTERNAL_ESTIMATE`**. **eliteOS Internal Estimate Head** — staff auth required. |
| **Pricing Admin Head (`app-pricing-admin`)** | **`https://pricing.eliteosfab.com`**; **`HEAD_URL_PRICING_ADMIN`**. **eliteOS Pricing Admin Head** — login + `pricing_admin` head access and route-level role gates on `/api/pricing-admin/*`. |
| **eliteOS Brain / API** | https://backend-core-six.vercel.app |
| **Future API hostname** | `api.eliteosfab.com` — **if/when** DNS and Vercel project wiring are configured |

Always confirm live URLs in deployment dashboards if anything drifts.

---

## 5. Head map reference

- **Canonical head inventory and roadmap:** [`eliteOS-master-head-map.md`](./eliteOS-master-head-map.md)

**Expectations for new heads:**

- Connect to the **eliteOS Brain** (no siloed “mini backends” without an explicit decision).
- Respect **roles** and server-side authorization (UI visibility ≠ permission).
- Be **organization-aware** where data is tenant-owned (`organization_id` or documented exception).

---

## 6. SaaS rules

- **`organization_id`** is required on **tenant-owned** tables as the platform matures; new tables that hold customer/fabricator data should plan for it.
- **Avoid** hardcoded fabricator-specific IDs, branch names, or “magic” customer strings in logic when configuration or org settings can carry the same meaning.
- **Integration settings** should converge on patterns like `organization_integration_configs` (and similar) rather than one-off env vars per customer long term.
- **Pricing and operational settings** should become **admin-configurable** over time (`quote_pricing_structures`, rules, territory assignment, etc.).
- **RLS / strict NOT NULL:** Do not assume every table is fully locked down until a deliberate security milestone; document exceptions in [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) when tightening.

---

## 7. Quote Platform source of truth

### Public Quote Tool — measurement methods (UX)

The homeowner-facing wizard supports (or will support):

- **Enter square footage** — manual countertop / backsplash SF.
- **Use cabinet lengths** — rapid linear approximation to SF.
- **Guided kitchen layout** — shape-based SF derivation.
- **Upload photos or plans** — *coming soon* (placeholder in product copy).

### Public calculate contract (authoritative)

- **`POST /api/public-quote/calculate`** and submit path use a **legacy area payload** for `estimates_by_group`:
  - `areas.countertopSqft`, `areas.backsplashSqft`
  - `addOns` (including tearout where applicable)
  - `engine: "legacy"` for the multi-tier estimate API
- **Room / guided UI** may exist in the head, but **before calculate/submit** the client must **collapse** guided or cabinet flows into those **legacy aggregate fields** so the Brain returns correct `estimates_by_group`.
- **Public estimate copy** must **not** expose internal pricing vocabulary (no Direct/Wholesale/dealer/protected jargon to homeowners).

### Internal Quote Tool (staff)

- **Frontend:** **`app-internal-estimate/`** — internal-only UI (Direct/Wholesale, library, internal Monday copy). Not bundled with **`app-quote`**.
- **Pricing Admin (head):** `app-pricing-admin/` + **`/api/pricing-admin/*`** — foundation tables in `eliteos_pricing_admin_foundation.sql` (`quote_price_groups`, `quote_price_group_rates`, `quote_pricing_policy_rules`, `quote_addon_catalog`, …). **`pricingConfigResolver.js`** loads DB config when installed and **falls back** to `quoteCalculator.js` constants until parity is proven — **no forced cutover** in this pass.
- **Persistence:** authenticated **`/api/internal-quotes/*`** routes (requires **Quote** head access) save `quote_source: internal_quote` into **`quote_headers`** with org scoping when `organization_id` exists.
- **Monday:** optional **separate** internal board via **`MONDAY_INTERNAL_QUOTES_BOARD_ID`** and **`MONDAY_INTERNAL_COL_*`** — does not reuse public column IDs (`docs/quote-platform/monday-internal-quotes-setup.md`).
- **Economics:** internal calculator supports **Direct vs Wholesale** material $/sf; **custom add-on lines** are passthrough (no public 25% homeowner markup). Public consumer paths stay on **Direct + planning markup** only.
- **Snapshots:** saved quotes must retain the pricing inputs used at calculation/save time (`calculation_snapshot`, line items) so later Pricing Admin edits do not rewrite history.

---

## 8. Public pricing logic

| Topic | Rule |
|-------|------|
| **Base economics** | Public consumer tiers use **ESF Direct $/sqft** (internal ESF table), **not** legacy prototype partner $/sqft for material. |
| **Direct rates ($/sqft)** | Promo **70**, A **77**, B **85**, C **95**, D **105**, E **120**, F **135**. |
| **Planning markup** | **25%** on top of Direct (default from `public_retail` pricing structure); add-ons use **Direct unit price × (1 + markup)** same as stone. |
| **Public “rate”** | Effectively **Direct × 1.25** per sqft for display math when markup is 25%. |
| **Display rounding** | Public-facing **tier totals** round **up** to the nearest **$10** (`Math.ceil(value / 10) * 10`). **No cents** in homeowner-facing totals. |
| **Exact math** | Backend may retain **exact** line totals on `estimates_by_group` fields (`total`, `countertop`, etc.) plus `*_display` fields for UI and pipeline. |
| **Monday Quote Amount** | Uses **Group Promo** row **only**, aligned to **rounded** public Promo total (`grand_total` / forecast / Monday numeric column). |
| **Monday Estimate Summary** | May list **all tiers**; use **rounded** whole-dollar amounts, compact string. |

Implementation references: `backend-core/src/quotes/quoteCalculator.js`, `backend-core/src/quotes/quoteRoutes.js`, `backend-core/src/quotes/pricingConfigResolver.js`, `app-quote` public wizard and `publicEstimateDisplay.ts`; internal UI in `app-internal-estimate/`; Pricing Admin UI in `app-pricing-admin/`.

---

## 9. Monday integration logic

| Topic | Detail |
|-------|--------|
| **Example board** | **Retail Online Quotes** — board ID **18412881229** (documented in `docs/quote-platform/monday-public-quotes-setup.md`). |
| **Non-blocking** | Monday sync **must not block** successful public quote persistence; HTTP submit stays **200** with best-effort Monday. |
| **Resilience** | Incremental column groups; failures on optional columns **do not** delete the item; diagnostics in `quote_monday_sync_log.response_payload`. |
| **Safe columns (typical)** | Quote amount, city, state, est sq ft, eliteOS quote ID — as env-mapped column IDs allow. |
| **Optional columns (add carefully)** | Estimate summary, quote date, status, email, phone — one group at a time; status **labels must exist** on the board. |
| **Do not wire without mapping** | Salesperson (**People**), Branch (**Dropdown**), Address (**Location**) — require explicit ID/label/location payload design per Monday column type. |

---

## 10. Moraware integration strategy

**Intent:** Moraware remains a system of record for many shops; eliteOS **reads** (and later selectively writes) through governed integration.

| Pillar | Meaning |
|--------|--------|
| **Credentials** | Allow eliteOS (Brain) to authenticate to Moraware **server-side only**. Never browser. |
| **Mappings** | Tell eliteOS what Moraware entities **mean** in eliteOS terms (statuses, resources, branches, etc.). |
| **Moraware Admin / Integration Mapping Head** | **Required** before Moraware-powered features are **SaaS-reusable** across many orgs. |

**Future mapping domains (org-scoped):**

- Statuses, activity types, resources/machines, custom fields  
- Saved views, processes, branches, salespeople  
- Sync settings, unmapped items / resolution queue  

**Rule:** Every mapping row or config blob should be **`organization_id` scoped** (or explicitly global template with copy-on-activate per org — document which).

---

## 11. Security principles

- **No Supabase service role key** in any frontend bundle.
- **No Monday token** in frontend.
- **No Moraware credentials** in frontend.
- **Backend permission checks** are mandatory for protected routes; **never** rely on UI-only hiding.
- **Public routes** return only **public-safe** fields (e.g. sanitized calculate responses; no internal snapshots in browser for anonymous flows).
- **Public quote UI:** no Direct / Wholesale / internal margin language.
- **New write paths:** consider **audit**, **sync logs**, or **error logs** for operator traceability.

See also: `docs/EOS_REPO_SECRET_AUDIT.md`, `.cursor/rules/security-audit.mdc`.

---

## 12. Deployment workflow

1. **Local** — Cursor edits on a branch or `main` as per team habit.  
2. **Checks** — See §13.  
3. **Commit** — Clear message; no secrets.  
4. **Push** — GitHub.  
5. **Vercel** — Auto (or manual) redeploy for affected projects (`app-quote`, `app-internal-estimate`, `app-pricing-admin`, `backend-core`, etc.).  
6. **Cloudflare** — DNS points `quote.eliteosfab.com` (and future `api.*`) to the right targets.  
7. **Smoke test** — Hosted calculate, submit, Supabase row, Monday item/columns when integration-sensitive.

---

## 13. Required checks

| When | Command / action |
|------|------------------|
| **`app-quote` changed** | `npm run build --prefix app-quote` |
| **`app-internal-estimate` changed** | `npm install --prefix app-internal-estimate` (first clone) then `npm run build --prefix app-internal-estimate` |
| **`app-pricing-admin` changed** | `npm install --prefix app-pricing-admin` (first clone) then `npm run build --prefix app-pricing-admin` |
| **Backend JS touched** | `node --check <path-to-changed-file.js>` |
| **Repo-wide sanity** | `npm run eos:check:local` |
| **After deploy** (sensitive) | Hosted smoke: public calculate + submit + verify Supabase + Monday |

---

## 14. Blueprint maintenance rule

> **Whenever** Cursor or a human changes **architecture**, **data flow**, **pricing logic**, **integrations**, **security**, **deployment**, or **SaaS assumptions** in a durable way:  
> **Update this blueprint** *or* add a dated row to **[`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md)** with impacted files and a revisit trigger.

Stale docs cost more than short doc updates.

---

## Related documents

| Document | Purpose |
|----------|---------|
| [`eliteOS-master-head-map.md`](./eliteOS-master-head-map.md) | Head inventory and platform rules |
| [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) | Dated decisions, rationale, revisit triggers |
| [`../quote-platform/`](../quote-platform/) | Quote engine, Monday setup, math test cases |
| [`../EOS_ENV_VARS.md`](../EOS_ENV_VARS.md) | Environment variable reference |
