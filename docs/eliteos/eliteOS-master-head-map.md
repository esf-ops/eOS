# eliteOS Master Head Map

This document is the **roadmap-level map** of eliteOS “heads” (product surfaces). It exists so future work—human or Cursor—understands the **whole platform** and avoids shipping isolated one-offs that do not fit shared patterns.

**Scope of this file:** documentation only. It does not rename technical internals (`eos_*`, npm scripts, routes, env vars), change application code, or prescribe immediate implementation of every head listed below.

---

## 1. Purpose

**eliteOS** is a **multi-head operating system** for stone fabrication companies. Each head is a focused experience (launcher entry, UI, APIs) that should:

- Connect to the **shared Brain** (Supabase-backed and related backend services).
- Respect **roles**, **auditability**, and (over time) **tenant** boundaries.
- Eventually support **multi-tenant SaaS**: many fabricators, one platform, strict isolation where it matters.

Heads are **not** separate products; they are **coherent slices** of one operating system.

---

## 2. Guiding principle

**Build for Elite / Eric today, but design for 1,000 fabricators tomorrow.**

Near-term shipping can favor Elite workflows and seed data, but **architecture** (data model, org context, integrations, admin configuration) should assume many tenants, not a single hardcoded shop.

---

## 3. Core platform rules

These rules apply across heads unless a head is explicitly experimental and quarantined:

| Rule | Intent |
|------|--------|
| **Shared Brain / Supabase-backed data** | One system of record; heads read/write through governed APIs and schemas. |
| **Role-based access** | Every sensitive action is authorized; “launcher visibility” is not the same as “API permission.” |
| **Audit / action logs** | Material changes are traceable (who, when, what head, what entity). |
| **`organization_id` / tenant-aware data** | Prefer additive tenant columns and org-scoped queries; avoid silent cross-tenant reads. |
| **No hardcoded fabricator-specific assumptions** | Elite can be the **default tenant**, not magic strings scattered through business logic. |
| **Admin-configurable settings** | Behavior that will differ by customer belongs in data/config, not only in env vars long term. |
| **Integration abstraction** | Monday, Moraware, QuickBooks, SlabSmith, etc. are **connectors** with stable app-level contracts. |
| **SaaS-ready where possible** | Prefer patterns that survive RLS, org switchers, and per-tenant branding without rewrites. |

---

## 4. Head categories

Heads are grouped for **navigation and ownership**, not org-chart perfection. A single initiative may touch multiple categories.

| Category | Role in the OS |
|----------|----------------|
| **Platform / Admin** | Identity, governance, health, quality, org and integration settings, audit. |
| **Quote / Revenue** | Consumer, internal, and partner quoting; pipeline; pricing; territories; takeoff and visualization. |
| **Sales / Accounts** | Performance, mapping, accounts, CRM-adjacent flows, marketing analytics, forecast. |
| **Executive / Leadership** | Cross-functional visibility, bottlenecks, reports, branches, expansion. |
| **Production / Shop** | Flow, floor, machines, capacity, CAD/programming, fabrication, QC, rework, maintenance, safety. |
| **Install / Field** | Scheduling, crews, service/warranty, customer experience. |
| **Purchasing / Material** | Readiness, vendors, inventory/slab, SlabSmith, remnants, risk/reorder. |
| **Finance / Accounting** | GL alignment, finance KPIs, job costing, payroll prep, QuickBooks, invoicing/payments. |
| **HR / Workforce** | HR, time/labor, training, knowledge, SOPs, compliance. |
| **Partner / Customer Portals** | External-facing surfaces for dealers, builders, homeowners, kiosk, network. |
| **AI / Automation** | Assistant, notifications, tasks, meetings, follow-ups, automation engine, report builder. |
| **Brand / Resources** | Brand library, marketing assets, documents, communication templates. |
| **SaaS / Multi-Tenant** | Tenant admin, onboarding, marketplace/connectors, billing, support console, implementation wizards, tenant benchmarks. |

---

## 5. Heads list (identified so far)

Status is **conceptual** unless a separate tracker says otherwise. Use the labels in [§7 Status labels](#7-status-labels).

### Platform / Admin

- **Home / Launcher Head** — **`app-home/`**; production **`https://www.eliteosfab.com`**; Supabase sign-in + **`GET /api/me`** / **`GET /api/me/heads`** to render allowed head cards (Brain is source of truth for assignments; admin / executive / `super_admin` see full catalog in the launcher response).
- System Admin Head  
- User Management Head  
- Role / Permissions / Head Access Head  
- Brain Health / Sync Admin Head  
- Data Quality Head  
- Identity Resolution Head  
- Admin Dashboard Configuration Head  
- Audit Log / Action History Head  
- Organization / Tenant Settings Head  
- Integration Settings Head  
- Moraware Admin / Integration Mapping Head  

### Quote / Revenue

- Public Consumer Quote Tool (**`app-quote`** — deployed public hostname above)  
- Internal Quoting / **Internal Estimate** Tool (**`app-internal-estimate`** — separate staff head; auth required)  
- **Pricing Admin** Tool (**`app-pricing-admin`** — separate head; `pricing_admin` head access + admin/finance/executive role gate on `/api/pricing-admin/*`; distinct from legacy System Admin quote structure APIs)
- Partner Quoting Tool  
- Quote Pipeline / Quote Leads Head  
- Quote Catalog Admin (normalized catalog programs — future; see `quote-catalog-admin-architecture.md`)  
- Quote Source Configuration Head  
- Sales Territory Admin Head  
- Partner Pricing Assignment Head  
- AI Takeoff Head  
- Visualize / Layout Quote Head  
- Quote Forecasting / Bid-Close Analytics Head  

### Sales / Accounts

- Sales Performance Head  
- Sales Account Mapping Admin Head  
- Account Performance Head  
- Dealer / Builder / Partner Account Head  
- Dealer Success Head  
- CRM / Lead Management Head  
- Marketing / Lead Source Analytics Head  
- Sales Forecast Head  

### Executive / Leadership

- Executive Head  
- Are the Titans Flowing Widget / Head  
- Company Flow / Bottleneck Head  
- Reports Head  
- Branch / Location Performance Head  
- Expansion / Launch Head  

### Production / Shop

- Production Flow Head  
- Shop Floor TV Head  
- Titans / Machines Head  
- Machine Capacity / Resource Mapping Head  
- Programming / CAD Readiness Head  
- Template Head  
- Fabrication Head  
- Quality Control Head  
- Rework / Remake Head  
- Equipment / Maintenance Head  
- Safety Head  

### Install / Field

- Install Head  
- Install Schedule Head  
- Field Crew Head  
- Service / Warranty Head  
- Customer Service / Exception Head  
- Customer Experience Head  

### Purchasing / Material

- Purchasing / Material Readiness Head  
- Supplier / Vendor Head  
- Inventory / Slab Head  
- SlabSmith Integration Head  
- Remnant Head  
- Material Risk / Reorder Recommendation Head  

### Finance / Accounting

- Accounting Head  
- Finance Head  
- Job Costing Head  
- Payroll Prep / Workforce Cost Head  
- QuickBooks / Accounting Integration Head  
- Invoice / Payment Status Head  

### HR / Workforce

- HR / Onboarding Head  
- Workforce / Time & Labor Head  
- Training Head  
- Knowledge Base Head  
- SOP Builder / Admin Process Head  
- Compliance / Policy Head  

### Partner / Customer Portals

- Partner Portal Head  
- Dealer Resource Library Head  
- Builder Portal Head  
- Customer Portal Head  
- Homeowner Quote / Status Portal Head  
- Digital Kiosk Head  
- ESFN / Partner Network Head  

### AI / Automation

- AI Assistant Head  
- Notifications / Alerts Head  
- Tasks / Action Items Head  
- Meeting Head  
- Automated Follow-Up Head  
- Firehose / Automation Engine Head  
- Report Builder Head  

### Brand / Resources

- Brand & Resource Library Head  
- Marketing Asset Library Head  
- Document / File Library Head  
- Customer Communication Templates Head  

### SaaS / Multi-Tenant

- Tenant / Organization Admin Head  
- SaaS Onboarding Head  
- Integration Marketplace / Connector Head  
- Tenant Billing / Subscription Head  
- Multi-Tenant Support Console Head  
- Implementation / Setup Wizard Head  
- Moraware Mapping Setup Wizard  
- Tenant Public Quote Branding Head  
- Tenant Pricing Template Library  
- Tenant Analytics Benchmarking Head  

---

## 6. Current priority order (near term)

This is **execution priority**, not a claim that lower items are unimportant. It keeps vertical slices shippable for Elite while laying groundwork for scale.

1. **Public Quote Tool MVP** — homeowner-safe path end-to-end.  
2. **Quote Pipeline / Sales follow-up** — operational handling of leads and statuses.  
3. **Pricing + Territory Admin** — governed rules and routing, not spreadsheet chaos.  
4. **Monday integration hardening** — reliable sync, clear failure modes, env + future tenant config.  
5. **Private hosted preview** — controlled environment for Eric/stakeholders.  
6. **Moraware Admin foundation** — mapping and health without destabilizing Brain sync.  
7. **Sales Head trust / account mapping** — confidence in “who owns what account.”  
8. **Production / Titans visibility** — leadership and shop alignment on reality.  
9. **Internal Quote Tool** — staff-grade quoting on shared pricing.  
10. **Partner Quote Tool** — partner-grade economics with correct redaction and roles.  

Revisit this order as customer risk and revenue impact shift.

---

## 7. Status labels

Use consistent labels in roadmaps, ADRs, and issues:

| Label | Meaning |
|-------|---------|
| **Planned** | Intent documented; no meaningful implementation yet. |
| **Scaffolded** | Shell UI/API/route exists; not safe for real workflows. |
| **In progress** | Active development; may work in dev only. |
| **Working locally** | Demo-ready on developer machines; may lack auth, data, or ops hardening. |
| **Deployed preview** | Hosted for a limited audience; still iterating. |
| **Production-ready** | Meets agreed SLOs for security, data integrity, and support for a defined scope. |

A head can combine surfaces at different statuses (e.g. “Pipeline **Working locally**, Monday **In progress**”).

---

## 8. Do not overbuild

This master map is a **shared mental model and roadmap**, not a directive to implement every head immediately.

- Prefer **production-ready vertical slices** (quote → pipeline → follow-up → integration) over breadth without depth.  
- New work should **name which head(s)** it serves and which **platform rules** it obeys (especially org, audit, and integration boundaries).  
- When in doubt, **narrow the slice**, ship, measure, then expand—still aligned to this map so the platform stays one coherent **eliteOS**.

---

## Deliverable

**Created:** `docs/eliteos/eliteOS-master-head-map.md`  

**Contents:** Purpose, guiding principle, core platform rules, thirteen head categories, full enumerated head list (as specified), near-term priority order (1–10), recommended status labels, and an explicit “do not overbuild” note.

**Not changed:** Application code, backend routes, SQL, deployments, or technical internal naming.

**Tests:** None run (documentation-only; no markdown lint task in scope).
