# Studio target operating model

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`  
**Status:** Recommendation based on code evidence — not a FEATURE_DECISIONS declaration.

---

## Verdict on hierarchy

The repository already supports a clear hierarchy that should be preserved and named consistently:

```
organization
  → quote_intake_cases (intake case / quote family key)
    → studio_estimates (revisions; one active per case)
      → calculation / approval fingerprints on the active revision
      → digital_estimate publications (frozen customer-facing snapshots)
        → customer activity / review requests (attached to publications)
          → sold-job snapshot (not yet implemented as a Studio surface)
```

**Fact:** Quote family key is `intake_case_id`. Active revision is the non-`superseded` `studio_estimates` row (unique index `uq_studio_estimates_one_active_per_case`). Quote number is derived (`SE-` + first 8 hex of case id).

**Recommendation:** Do not invent a separate `estimate_family` table until All Estimates needs search features that cannot be served by intake case + revisions views. Prefer a read model / registry over a new write authority.

---

## Lifecycle stages

| Stage | System owner | Canonical object | Canonical status | Primary user | Entry | Exit | Next | Frozen at boundary | Explicit actions | Prohibited automatic |
|-------|--------------|------------------|------------------|--------------|-------|------|------|--------------------|------------------|----------------------|
| Shared Inbox | Quote Intake | Graph message → intake case | intake eligibility / assignment | Intake / estimator | Unprocessed mailbox message | Case created + attached | Command Center | Message hashes; attachment metadata | Import, classify, assign | Outlook delete/move; publish; email customer |
| Command Center | Estimate Queue | Intake case + active estimate projection | Queue workflow status (derived) | Estimator | Case needs attention | Open Takeoff or Studio | Takeoff or Studio | None (operational) | Assign, open, filter | Publish; sold; QB/Moraware |
| AI Takeoff | Takeoff jobs | Takeoff job + approved geometry | job / review status | Estimator | Plan-eligible attachment | Takeoff approved | Estimate Studio scope | Approved geometry snapshot into scope | Approve / reject / re-run | Customer publish |
| Manual Scope | Studio estimate | Active `studio_estimates` physical scope | manualScopeConfirmed | Estimator | Manual path or Takeoff fallback | Confirm fingerprint | Pricing Setup | Confirmed scope fingerprint | Save, confirm | Overwrite Takeoff without explicit switch |
| Estimate Studio | Studio | Active revision | workspace `currentStage` / next action | Estimator | Open estimate | Approved revision | Digital Estimate | Calc + approval fingerprints | Calculate, Approve | Auto-calc on load; auto-approve |
| Digital Estimate | Publication services | Publication record | active / historical / revoked | Estimator | Approved + configured | Explicit publish | Live DE / customer | Customer-facing identity + pricing snapshot | Publish, replace, revoke | Publish on load/refresh/copy |
| Review Requests | Review Request services | Review request ↔ publication | open / resolved (derived) | Estimator | Customer submission | Resolve / revise | Studio or replace publication | Request payload at submit | Resolve, open revision | Auto-replace publication |
| Sold Job | Future | Sold-job snapshot | accepted / handed off | Ops | Customer accepted | Handoff complete | QB / Moraware / production | Full operational freeze | Mark sold, export | Auto from publish |
| Historical retrieval | Future All Estimates | Family + all revisions + pubs | historical labels | Estimator / admin | Search | Open read-only or clone | Studio / Live DE | All prior snapshots | Search, open, restore (later) | Mutate frozen pubs |

---

## Canonical identifiers (recommended)

| Concept | Recommended ID | Evidence today |
|---------|----------------|----------------|
| Intake case / quote family | `intake_case_id` (UUID) | `studio_estimates.intake_case_id` |
| Current revision | `studio_estimates.id` where status ≠ superseded | Unique active index |
| Historical revision | same table, `superseded` | `createRevisionFrom` |
| Human quote number | derived `SE-{caseId[0:8]}` | Studio quote number helpers |
| Publication | publication id in DE tables | publication services |
| Customer URL | stable public token/path recovered by staff APIs | link recovery (no raw token leak) |
| Review request | review request id → publication id | Review Request routes |
| Sold job | **not yet** — future `sold_job_id` or snapshot row | Queue “Sold” is placeholder |

---

## Identity model (confirm)

| Layer | Owner | Behavior |
|-------|-------|----------|
| Live account/contact | Account Directory | Mutable; used for linking and grouping |
| Estimating identity on revision | Active `studio_estimates` + project details | May update for metadata; price-affecting changes revise |
| Customer-facing identity | Publication snapshot | Frozen until replace/revoke |
| Historical | Superseded estimates + historical publications | Never silently mutate |

**Recommendation:** Keep this three-layer model. Do not “sync” AD renames into frozen publications.

---

## Status model (target)

1. **Operational next action** — single derived adapter from workspace workflow + publication summary (staff UI).
2. **Queue projection** — Command Center consumes the same adapter (not a parallel enum forever).
3. **Publication lifecycle** — active / historical / revoked / replaced — owned by publication services only.
4. **Review request lifecycle** — owned by Review Request services; never equal to “published.”
5. **Sold** — separate from published; future Sold Job only.

---

## Current vs target gaps (summary)

| Target | Current gap |
|--------|-------------|
| Shared Inbox workspace | Mailbox sync modal + Graph preview; auto Takeoff optional |
| Command Center as sole “needs attention” | Strong; overlaps Live DE for digital actions |
| Estimate Studio = active revision only | Mostly true; panel race risk |
| Live Digital Estimates = publication portfolio | True |
| All Estimates registry | Missing — Quote Library / Internal Estimate fill gap poorly |
| Sold Job | Not implemented |
| One workflow vocabulary | Dual vocabularies (AUDIT-001) |

---

## Actions that must remain explicit forever

- Publish, replace, revoke customer links
- Email / notification send
- Mark sold / operational handoff
- QuickBooks create/writeback
- Moraware create/writeback
- Authority switch Manual ↔ Takeoff (if ever offered)
- Outlook mailbox destructive actions (if ever offered — currently not implemented)
