# eliteOS Stabilization Plan

**Effective date:** 2026-05-27  
**Phase name:** Stabilization Week / Stabilization Phase  
**Milestone baseline:** [STATUS_REPORT_2026-05-27.md](./STATUS_REPORT_2026-05-27.md)  
**Decision record:** [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md) §36

---

## Stabilization phase goal

Intentionally **pause broad feature expansion** after a major build push. Focus on:

- Verifying all **active** heads end-to-end  
- Fixing **blockers and regressions** only  
- Confirming **deployments and SQL apply** state  
- Documenting **readiness and risks**  
- Preventing drift into new large builds until exit criteria are met  

**Motto unchanged:** *Keep the Titans running well.*

---

## What we will do

| Activity | Detail |
|----------|--------|
| **Smoke test** | Every active head in the inventory below |
| **Backend discipline** | Restart `npm run eos:server` after pulls; confirm Sales routes are not 404 |
| **SQL verification** | Confirm which `backend-core/supabase/*.sql` files are applied in target Supabase |
| **Bug triage** | Log issues; fix P0/P1 blockers and small one-file polish |
| **Deploy verification** | Redeploy backend + heads touched in milestone; run smoke checklist |
| **Docs hygiene** | Use milestone report + this plan; update FEATURE_DECISIONS when phase decisions change |
| **Security gates** | Run `verifyPartnerQuoteLeakage.mjs` before any partner widen; no external Partner launch |
| **Verify scripts** | Run relevant `verify*.mjs` before merging stabilization fixes |

---

## What we will not do

| Deferred | Reason |
|----------|--------|
| **New major heads** | Breadth without depth risk |
| **Quote Library detail dialog refactor** | Large UX project; drawer is v1 detail |
| **Sales KPI v1.1** | Branch/rep splits, snapshots — after stabilization |
| **Historical KPI workbook import** | Data trust + scope |
| **Partner Quote external launch** | RLS + leakage must be green |
| **SaaS / multi-tenant packaging** | Foundation only; not production-ready |
| **Visual Layout Canvas authority** | Non-authoritative v1 is enough for now |
| **Large refactors** | Internal Estimate / System Admin monolith splits |
| **New SQL migrations in CI** | Manual apply only; document state |
| **Monday/QB writeback automation** | Integration hardening is separate phase |

---

## Active heads to smoke test

Priority order for stabilization QA:

1. **Home Launcher** (`app-home`) — sign-in, launcher, workspace name, profile, user menu, sign out  
2. **System Admin** (`app-system-admin`) — users, org dropdown, job title save/reload, head access, invite flow (staging)  
3. **Internal Estimate** (`app-internal-estimate`) — calculate, save, revision, customer PDF, CDT in library  
4. **Quote Library** (`app-quote-library`) — list, drawer, status, CDT total, handoff doc generation  
5. **Pricing Admin** (`app-pricing-admin`) — login, price groups, key config screens  
6. **Sales Dashboard** (`app-sales`) — Command Center, KPI History, Quote Pipeline tab  
7. **Public Quote** (`app-quote`) — public calculate/submit (staging/prod hostname)  
8. **Partner Quote** (`app-partner-quote`) — **internal pilot only**; leakage script, no external users  
9. **Brain Health** (`app-brain-health`) — sync health (ops)  
10. **Executive** (`app-executive`) — optional; lower priority if time-boxed  

**Not in stabilization scope:** Org Directory (planning only), roadmap-only heads.

---

## SQL / migration checklist

Confirm applied in target Supabase (manual apply — repo does not auto-run):

| File | Purpose | If missing |
|------|---------|------------|
| `eos_saas_foundation.sql` | `organizations`, org_id columns | Org dropdown empty; org name missing |
| `eliteos_user_preferences_v1.sql` | Profile preferences DB | Prefs use localStorage only |
| `eliteos_job_title_v1.sql` | `user_profiles.job_title` | Job title does not persist |
| `eliteos_audit_foundation.sql` | Audit columns / last_seen | Audit degraded |
| `eliteos_quote_library_foundation.sql` | Quote library core | Library broken |
| `eliteos_internal_quote_phase2.sql` | Revisions, ESF numbers | Revision workflow broken |
| `eliteos_sales_moraware_prepared_facts.sql` | Sales fast path | KPI/Moraware rollups empty/slow |
| `partner_quote_foundation_v1_additive.sql` | Partner tables | Partner pilot broken |
| `partner_quote_rls_draft.sql` | **Do NOT apply until exit gate** | External partner block |

**Operator action:** Record applied migrations in team runbook (date, environment, who applied).

---

## Production deployment checklist

1. Merge stabilization fixes to `main` only after smoke on branch  
2. Deploy **backend-core** first  
3. Deploy heads changed since last prod push (typically home, system-admin, sales, quote-library, internal-estimate)  
4. Verify `HEAD_URL_*` and `EOS_ALLOWED_ORIGINS` include all production head URLs  
5. Verify `SUPABASE_INVITE_REDIRECT_URL` points to Home auth callback  
6. Post-deploy smoke (see STATUS_REPORT smoke section)  
7. Confirm no stale serverless/backend instance serving old route table  

---

## Bug triage rules

| Priority | Definition | Action |
|----------|------------|--------|
| **P0** | Data loss, auth bypass, cross-tenant leak, production down | Fix immediately; may use Sonnet/Opus |
| **P1** | Core workflow broken (save, login, launcher, 404 on required API) | Fix in stabilization; small diff preferred |
| **P2** | Visual polish, copy, non-blocking errors | Fix if one-file; else backlog |
| **P3** | Nice-to-have, new feature request | **Defer** — log only |

**Regression rule:** Any fix must run `npm run eos:check:local` if touching JS; run targeted `verify*.mjs` if touching math/auth/partner paths.

---

## Cursor / model usage discipline

| Task type | Model |
|-----------|--------|
| Tiny one-file fixes (copy, label, single bug) | **Auto** |
| Smoke test execution, doc updates | **Auto** |
| Multi-file feature work | **Deferred** until stabilization exit |
| Architecture reset, critical P0, complex auth | **Sonnet / Opus** when needed |

**Rule:** Do not start new large builds in Auto during stabilization.

---

## Allowed small fixes

- Single-file UI copy or label fixes  
- Single-file bug fixes with clear reproduction  
- Backend route mount verification (if regression)  
- Doc updates  
- Test script fixes for false negatives  
- CSS focus/active states (e.g. button visibility)  

**Max scope guidance:** Prefer PRs under ~100 lines unless P0.

---

## Deferred big features (explicit backlog)

1. Quote Library full dialog / major UX redesign  
2. Sales KPI v1.1 (branch/rep, snapshots, CDT in aggregates)  
3. Historical KPI workbook import  
4. Partner Quote external rollout  
5. New production / shop / install heads  
6. Multi-tenant onboarding UI  
7. Internal Estimate monolith extraction  
8. Shared `<UserMenu>` component extraction across heads  
9. Profile self-service name edit  
10. Monday writeback automation  

---

## Exit criteria for stabilization phase

Stabilization phase **ends** when all are true:

- [ ] All **active heads** (§ above) passed smoke on staging or prod  
- [ ] **backend-core** post-deploy smoke: health + sales routes + `/api/me` with `job_title`  
- [ ] **SQL checklist** reviewed; known gaps documented or applied  
- [ ] **P0/P1** stabilization bugs closed or explicitly accepted  
- [ ] **Partner Quote** remains internal; leakage script passed or scheduled with owner  
- [ ] **No open 404** on required Sales/API routes in target environment  
- [ ] Team agrees on **one** next major build (not parallel large builds)  
- [ ] Updated STATUS_REPORT or short “stabilization complete” note in FEATURE_DECISIONS  

---

## Smoke-test checklist (copy for QA)

### Backend
- [ ] `GET /api/health` → 200  
- [ ] `GET /api/sales/dashboard-foundation` → not 404  
- [ ] `GET /api/sales/kpi-v1` → not 404  
- [ ] `GET /api/me` (auth) → includes `job_title`, `organization_name` when set  

### Home
- [ ] Launcher loads; no console crash  
- [ ] Workspace shows org **name** (not raw UUID as primary)  
- [ ] Hero stat shows job title value when set; label “Your role”  
- [ ] Profile read-only; prefs save (or localStorage fallback documented)  

### System Admin
- [ ] Org dropdown lists organizations  
- [ ] Job title saves and reloads  
- [ ] Permission role dropdown unchanged (canonical)  

### Internal Estimate
- [ ] Calculate + save  
- [ ] Customer PDF total matches rounded lines  
- [ ] Quote appears in library with CDT when applicable  

### Quote Library
- [ ] List loads; drawer opens  
- [ ] Customer estimate total displayed  
- [ ] Status + handoff doc flow  

### Sales
- [ ] Command Center loads data or clear error (not route missing)  
- [ ] KPI History loads or unavailable card (not 404)  

### Partner (internal only)
- [ ] Leakage script run on schedule — **no external users**  

---

## Related documents

- [SYSTEM_BLUEPRINT.md](./SYSTEM_BLUEPRINT.md)  
- [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md)  
- [eliteOS-master-head-map.md](./eliteOS-master-head-map.md)  
- [sales-kpi-history-plan.md](./sales-kpi-history-plan.md)  
- [STATUS_REPORT_2026-05-27.md](./STATUS_REPORT_2026-05-27.md)  
