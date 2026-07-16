# Phase DE.2A — Configuration Model

**Date:** 2026-07-16
**Status:** Documentation only
**Depends on:** [`PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md`](./PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md), [`PHASE_DE_2A_PRICING_INVENTORY.md`](./PHASE_DE_2A_PRICING_INVENTORY.md) (included-vs-optional matrix + interactive display treatments)

---

## 1. Core invariant

```
immutable published baseline
+ immutable allowed configuration envelope
+ customer selections
+ versioned server pricing rules (frozen into envelope/calc)
= immutable calculated configuration revision
```

**Never mutate:** `quote_headers`, original IE revision, publication snapshot, Takeoff result, or an earlier configuration calculation snapshot.

**Brain is sole calculation authority.** Browser totals are display-only.

**“Hidden fees”** means internal cost components **bundled into** a clearly displayed customer-facing package or line price — **not** an undisclosed mandatory charge added after selection.

---

## 2. Actors and surfaces

| Actor | Surface | Role |
|-------|---------|------|
| Estimator (pilot) | Elite 100 Estimate Studio | Build envelope, activate, review configurations, later amendments |
| Customer | Public Digital Estimate head | Select within envelope, save draft configuration |
| Brain | `backend-core` | Validate, price, persist, authorize |

Internal Estimate / Quote Library remain out of this workflow for DE.2.

---

## 3. Allowed configuration envelope

The envelope is an **estimator-authored allowlist**, not a live full catalog dump.

### 3.1 Must specify

| Element | Requirement |
|---------|-------------|
| Allowed option IDs | Stable IDs within envelope version |
| Display labels / descriptions / images | Customer-safe copy only |
| Min / max quantities | Per option or group |
| Mutually exclusive groups | e.g. one color, one sink package |
| Required selections | Must be satisfied before “configuration saved” |
| Included / default selections | Pre-checked; may be non-removable |
| Upgrade / downgrade rules | Relative to baseline included set |
| Compatibility constraints | e.g. faucet ↔ sink; edge ↔ room type |
| Option availability | Active at envelope activation; historical freeze retains inactive later |
| Customer-visible price treatment | Absolute price, delta vs included, or “included” |
| Estimator notes | Optional customer-visible or staff-only |
| Pricing validity | `pricing_valid_through` + access TTL interaction |
| Frozen catalog / rate / engine versions | Mandatory references |
| Behavior when catalog goes inactive later | **Keep serving frozen envelope options**; do not live-delete |

### 3.2 Must not

- Auto-expose entire live Admin or slab catalog
- Accept customer-supplied prices or org/account identifiers
- Allow measurement or takeoff edits
- Recalculate by silently calling current `calculateQuote()` against live constants

### 3.3 Envelope binding

| Bind to | Required |
|---------|----------|
| `organization_id` | Yes |
| `publication_id` | Yes (active publication) |
| `source_quote_id` / revision identity | Yes (from publication) |
| Baseline fingerprint / snapshot hashes | Yes |
| Envelope version | Monotonic per publication family |

---

## 4. Selection model

| Concept | Mutability |
|---------|------------|
| Envelope (activated) | Immutable content; new version supersedes |
| Customer session | Mutable until superseded/expired |
| Selection set at “saved” | Immutable snapshot row(s) |
| Calculation for a selection set | Immutable output document |
| Draft in-progress | Mutable; may be abandoned |

Idempotency: same session + same selection payload hash → same calculation id (or 409 with existing).

Optimistic concurrency: session `row_version` / `updated_at` on write.

---

## 5. Customer-visible pricing presentation

Customer may see:

- Baseline (published) total
- Included selections (labeled included)
- Option price or price difference vs included
- Updated configuration total
- Taxes **only if** treated as authoritative in the frozen policy (today: material use tax is internal to IE math — decide in DE.2C whether to surface as separate line or keep embedded)
- Pricing-valid-through
- Clear **nonbinding / draft** language until a later acceptance phase (out of DE.2)

Customer must **never** see: costs, margins, markup %, fee breakdown, rule IDs, evidence JSON, organization internals.

---

## 6. Internal pricing components (not public)

Supported in evidence / Studio staff views only:

- Material cost basis
- Material markup percentage (if used on options)
- Fabrication / labor components
- Account-specific adjustment (frozen)
- Bundled service / risk / handling components
- Estimator override (+ reason + actor)
- Internal margin evidence
- Option cost and sell price
- Custom customer-facing lines (sell)

Define at envelope activation which values are **frozen** vs which may be recalculated **before** activation only (never after customer sessions exist on that version).

---

## 7. Lifecycle states (DE.2 — no acceptance/sold)

| State | Meaning |
|-------|---------|
| `envelope_draft` | Estimator editing allowlist |
| `envelope_ready` | Validated; not yet customer-visible |
| `envelope_active` | Bound to publication; customers may configure |
| `customer_configuring` | Session open with draft selections |
| `customer_configuration_saved` | Immutable selection + calculation recorded |
| `estimator_review_required` | Optional flag when rules require staff review |
| `configuration_superseded` | Newer envelope version or new publication |
| `configuration_expired` | Past pricing/access validity |

**Explicitly deferred:** accepted, sold, payment, handoff.

---

## 8. Amendment path (later, not DE.2 implement)

Studio may later create a **structured estimator amendment** → new publication and/or new envelope version. Customer prior calculations remain immutable historical rows.

---

## 9. Failure behavior (configuration)

Fail closed for missing pricing/catalog version, option outside envelope, stale revision, revoked/superseded publication, expired pricing, cross-org, unknown mapping, engine mismatch, invalid quantity, incompatible combo, missing locked measurement basis, ambiguous Elite 100 eligibility, and any client-authored price/markup/org/account/rule identity.
