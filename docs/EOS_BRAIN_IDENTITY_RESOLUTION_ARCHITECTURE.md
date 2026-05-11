# eOS Brain Identity Resolution — Architecture

This document describes how eOS resolves **the same real-world thing** across Moraware, Monday.com, QuickBooks, SlabSmith, native eOS tools, and future systems—without destroying source evidence or locking in wrong links.

---

## Why eOS needs identity resolution

Each system has its own identifiers, naming conventions, and lifecycle:

- **Moraware** — jobs, accounts, worksheet colors/materials, Moraware salesperson strings.
- **Monday.com** — boards, items, account names, sales executives, statuses.
- **QuickBooks** — customers, vendors, invoices, chart lines.
- **SlabSmith** — slab/material/inventory semantics that may not align with Moraware color strings.
- **Native eOS** — Brain-normalized jobs, future Quote Platform quotes, internal entities.

Names are often **misspelled, abbreviated, or prefixed** (e.g. `Dyersville- Nichols…` vs `Nichols Home Improvement Center`). Without a deliberate resolution layer, dashboards duplicate entities, mis-attribute volume, and erode trust.

---

## Raw source records vs canonical eOS entities

| Layer | Role |
|--------|------|
| **Source records** | Immutable-ish evidence: what a system said, when it said it, with its native IDs and payloads (`raw_json`). |
| **Canonical eOS entities** | Company-level truth **after** human-approved linking: one account, one job concept, one material, one person, etc. |

**Critical rule:** Do not permanently connect records automatically. Preserve raw rows, generate **suggestions**, require **approval** for fuzzy/uncertain matches, and keep **audit/history** so links can be corrected later.

---

## Why each source keeps its own raw identity

- **Regulatory and operational traceability** — you must answer “what did Moraware say on date X?”
- **Re-sync safety** — imports can change; raw payloads prove what was ingested.
- **Dispute resolution** — conflicting names across systems are resolved in eOS, not by overwriting QuickBooks or Moraware.

Moraware remains SoT for production facts where defined; Monday may own account ownership where defined; QuickBooks owns financial customer IDs where defined. **eOS links** them—it does not replace them.

---

## Canonical entity types (initial set)

Examples of `entity_type` values eOS may normalize over time:

- `account` — customer / builder / dealer account
- `job` — production job (often anchored to Moraware job id + Brain job)
- `material` / `color` — worksheet / slab / catalog alignment
- `person` — sales rep, estimator, vendor contact
- `vendor` — supplier distinct from customer account
- `invoice` — QuickBooks invoice (future)
- `quote` — Quote Platform quote (future)

Canonical rows live in **`eos_entities`** (see SQL proposal). Display names and `canonical_key` support deduplication and UI.

---

## Mapping and linking model

Conceptually:

```
eos_source_records (Moraware account name X)
        │
        ► eos_entity_links (suggested | needs_review | approved | …)
        │
        ▼
eos_entities (canonical account Y)
```

- **`eos_source_records`** — one row per observed source key + payload fingerprint strategy (implementation detail per connector).
- **`eos_entity_links`** — the approved or candidate edge from source → canonical.
- **`eos_identity_suggestions`** — batch/job output before a human picks “approve / reject / unmapped.”

---

## Review workflow — link status

| Status | Meaning |
|--------|---------|
| `suggested` | System generated a candidate; not yet triaged. |
| `needs_review` | In queue for human decision. |
| `approved` | Human or strict auto-rule accepted; drives downstream attribution. |
| `rejected` | Human declined; do not auto-resurrect without new evidence. |
| `intentional_unmapped` | Deliberate decision: no canonical link (reduces noise). |
| `superseded` | Replaced by a newer approved link; history retained. |

---

## Matching confidence and types

| Label | Typical use |
|--------|-------------|
| `exact` | Native IDs match or byte-identical strings. |
| `normalized_exact` | Same after normalization (case, punctuation, whitespace). |
| `alias` | Curated alias table or approved synonym. |
| `fuzzy` | Token overlap / similarity score—**never auto-approve** for ownership. |
| `manual` | Admin created or edited in Mapping Admin / System Admin. |
| `imported` | Bulk import with explicit policy (still may be `needs_review`). |

**Precedence (non-negotiable):**

1. **Approved** eOS mapping / link wins.
2. **Seed rules** and **fuzzy suggestions** never override an approved mapping.
3. New evidence creates **new suggestions** or **supersedes** only after explicit approval workflow.

---

## Effective dating and history

- **`effective_start_date` / `effective_end_date`** on links and assignments — “who owned this account in Q1?” vs “today.”
- **`eos_identity_audit_log`** — append-only style actions: who changed what, old/new JSON, reason string.

Do **not** delete old links when reassigning; deactivate or supersede.

---

## Relationship to Sales Account Mapping Admin

Sales attribution is the **first vertical slice**:

- `sales_account_master` / `sales_account_aliases` / `sales_account_assignments` implement **account-level** identity for Sales Head.
- The same **pattern** generalizes to `eos_entities` + `eos_source_records` + `eos_entity_links` for all systems.

When the generic layer is adopted, Sales tables can remain as a **specialized projection** or migrate toward shared primitives—**without** breaking the rule: raw Moraware/Monday rows stay evidence; approved links are truth.

---

## Future integrations

| System | Typical source records | Canonical touchpoints |
|--------|------------------------|-------------------------|
| Monday | Items, groups, owners | `account`, `person` |
| QuickBooks | Customer, Invoice, Item | `account`, `invoice`, `vendor` |
| SlabSmith | Inventory / material keys | `material`, `job` (where wired) |
| Quote Platform | Quotes, line items | `quote`, `account`, `job` |

Each connector: **upsert `eos_source_records`**, **emit `eos_identity_suggestions`**, **never** flip `approved` without policy + UI.

---

## Rules summary

- **No destructive merges** of source systems into one blob row.
- **No automatic fuzzy approval** for entity identity (Sq.Ft. reconciliation may still sum raw facts separately).
- **No overwrite** of source payloads in place of audit—updates are new rows or versioned metadata.
- **Raw data is evidence**; **canonical eOS entities** are company-level truth **only after** governance.
- **Approved mapping wins** over seeds; **seeds never override** approved.

---

## Examples (naming pain)

1. **Dyersville- Nichols Home Improvement Center** (Moraware) ↔ **Nichols Home Improvement Center** (Monday) — prefix strip + human confirm.
2. **KBD - Davenport** vs **Kitchens By Design** family — token and branch context; fuzzy suggestion only.
3. **Calacatta Laza** — Moraware worksheet string vs SlabSmith catalog SKU vs marketing name — three source records, one `material` entity after approval.
4. **QuickBooks customer** “ABC Builders LLC” vs Moraware account “Abc Builders” — different IDs; link via approved alias, not string overwrite.

---

## Implementation stance (this repo)

- **Architecture + additive SQL** live in-repo; **do not auto-run** migrations.
- **`identityResolver.js`** stubs document the intended API; production wiring comes per connector.
- **Sales Account Mapping Admin** remains the operational UI for the first entity class (`account`).

For SQL file location and table list, see `backend-core/supabase/eos_identity_resolution.sql`.
