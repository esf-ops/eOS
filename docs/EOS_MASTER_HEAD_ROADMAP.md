# eOS Master Head & Module Roadmap

## Vision

**eOS is the unified digital operating layer for Elite Stone Fabrication** — not a single dashboard, but a company-wide system of **heads** (modules) sharing common identity, permissions, Brain data, and integrations. Code ships from GitHub; durable business data lives in Supabase; sensitive logic stays in `backend-core`; secrets live in Vercel environment variables.

This roadmap is **planning-only**. It prevents narrow “dashboard-only” architecture while allowing a disciplined **90-day proof of concept**.

---

## 90-day proof of concept (Phase 0 / POC)

1. **Live Titan production visibility** — “Your paper Titan list, live” (Brain + activities + clear UX).
2. **Quoting / revenue leverage** — bring the existing quoting tool into eOS as a **controlled Partner Quoting Platform** (auth-isolated dealers, no internal leakage).
3. **Material Flow / Purchasing Intelligence (foundational)** — Moraware demand + signals now; **SlabSmith / inventory** when ready — tell operations what should be ordered and which jobs are at **material risk**.

Moraware **data completeness** is a **gating priority** before stacking more heads: measure coverage (`deep-brain-coverage` audit), then plan additive ingestion.

---

## Phase 1 — Prove eOS value

| Head / deliverable | Purpose | Primary users / roles | Main data sources | Backend / API shape | Supabase (likely) | Priority | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Executive Head** | Leadership visibility across jobs, flow, trends | `admin`, `executive` | `brain_*`, aggregates | `/api/executive/*` (existing) | Existing Brain tables | **Shipped** | Moraware Brain |
| **Are the Titans Flowing** | Live Titan/saw queue + “today” context | `executive`, `production`, `shop_tv` | `brain_job_activities`, `brain_jobs`, `brain_fields` | `/api/titans/today` (to add), signals endpoints | Brain tables; optional denorm later | **P0** | Moraware |
| **Sales Head** | Pipeline, rep/account views, handoff to quoting | `sales`, `executive` | `brain_jobs`, `brain_fields` | Sales summary APIs (new) | Brain + future CRM | **P1** | Moraware |
| **Quote Head (Partner Quoting Platform)** | Dealer-facing quoting + history + isolation | `dealer_admin`, `dealer_user`, internal `sales` | Moraware fields + **authoritative quote tables** | `/api/quotes/*` (new), strict auth | `quote_*` (future), `brain_*` read | **P0** | Moraware + Supabase |

---

## Phase 2 — Operational infrastructure

| Head | Purpose | Roles | Data | APIs / tables | Priority | Depends |
| --- | --- | --- | --- | --- | --- | --- |
| **Partner / ESFN Head** | Dealer programs, resources, enablement | `dealer_*`, `marketing` | Docs metadata, programs | `/api/partner/*` | `resources`, `programs` (future) | P1 | Files + Supabase |
| **Production Head** | Deep floor visibility beyond Titan strip | `production`, `executive` | Activities, operational summary | `/api/production/*` | Brain + rules tables | P1 | Moraware |
| **Brand & Resource Library Head** | Central assets, controlled access | `marketing`, `sales`, `dealer_*` | Storage + metadata | `/api/library/*` | `assets`, `asset_acl` | P2 | Storage |
| **Admin / SOP Builder Head** | SOPs, audits, assignments | `admin`, `HR`, `safety` | SOP content | `/api/sop/*` | `sops`, `sop_assignments` | P2 | Supabase |

---

## Phase 3 — Internal scalability

| Head | Purpose | Roles | Data | Depends |
| --- | --- | --- | --- | --- |
| **HR / Onboarding Head** | Roles, onboarding tasks | `HR`, `admin` | HR tables | Supabase |
| **Workforce / Time & Labor / Payroll Prep** | Timecards, exports | `HR`, `accounting`, `production` | Labor tables | Supabase + devices optional |
| **Training Head** | Assignments, completion | `HR`, all staff | Training records | Supabase |
| **Knowledge Base Head** | Searchable playbooks | All | Articles + ACL | Supabase |

---

## Phase 4 — Profitability and control

| Head | Purpose | Roles | Data | Depends |
| --- | --- | --- | --- | --- |
| **Pricing Admin Head** | Tiers, rules, versions | `admin` | Pricing tables | Supabase (**not** frontend math) |
| **Finance Head** | AR/AP summaries, exports | `accounting`, `executive` | ERP + aggregates | Integrations |
| **Job Costing Head** | Actual vs expected | `accounting`, `executive` | Jobs + costs | Moraware + accounting |
| **Inventory / Slab Head** | Slab inventory, locations | `purchasing`, `production` | SlabSmith + Brain | Integration |
| **Remnant Head** | Remnant pricing & usage | `production`, `sales` | Inventory + pricing | Supabase |

---

## Phase 5 — Enterprise operations

Install, Service/Warranty, QC, Scheduling, Safety/Compliance — each ties **Brain jobs** to **field execution** and **customer promise**.

| Head | Notes |
| --- | --- |
| **Install Head** | Crew assignments, day-of; activities + external calendar optional |
| **Service / Warranty Head** | Tickets linked to jobs |
| **Quality Control Head** | Checklists, holds |
| **Scheduling Head** | Resource scheduling across phases |
| **Safety / Compliance Head** | Incidents, JSA, audits |

---

## Phase 6 — Scale ESFN and external value

| Head | Purpose |
| --- | --- |
| **Dealer Success Head** | Health scores, co-marketing |
| **Customer Portal Head** | Status, docs (no internal data) |
| **AI Assistant Head** | Scoped to role + RAG over allowed content |
| **Digital Kiosk Head** | Shop floor / lobby |
| **Expansion / Launch Head** | Playbooks for new branches |

---

## Long-tail modules (do not build now — keep architecture wide)

Notifications, Tasks, Meetings, CRM/Lead, Reports hub, Branch/Location, Equipment, Fleet, Marketing ops — **shared services** (auth, audit, Brain read models, file ACL) should be designed so these are **additive**.

---

## Classification reminder (before any new work)

For every new feature artifact, classify:

1. **Code/UI** — app or `backend-core` route.
2. **Business data** — Supabase tables, seed via migrations or admin tools.
3. **Sensitive backend logic** — `backend-core` only (pricing, permissions, merge rules).
4. **Secret/config** — Vercel env vars.
5. **Temporary prototype** — mark `TEMPORARY MOCK DATA — TODO: replace with Supabase table`.

---

*Partner documentation: `docs/MORAWARE_DATA_COVERAGE_MAP.md`, `docs/EOS_ROLES_AND_PERMISSIONS_MAP.md`.*
