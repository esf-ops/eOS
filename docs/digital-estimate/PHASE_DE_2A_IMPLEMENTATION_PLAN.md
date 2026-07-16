# Phase DE.2A — Implementation Plan

**Date:** 2026-07-16
**Status:** Documentation only — stop after DE.2A
**Prior art:** DE.1 immutable publish · DE.1.1 private Studio

---

## 1. Phased roadmap (bounded)

| Phase | Focus | Deliverable | Stop |
|-------|-------|-------------|------|
| **DE.2B** | Additive schema + repository contracts | SQL (unapplied) + memory/supabase repos + contract tests; **no** customer UI | complete (unapplied) — see `PHASE_DE_2B_NOTES.md` |
| **DE.2C** | Deterministic pricing foundation | Versioned delta calculator + fixtures (baseline vs configured, rounding, account freeze) | ← **complete (flags off)** — see `PHASE_DE_2C_NOTES.md` |
| **DE.2C** | Deterministic pricing foundation | Versioned delta calculator + fixtures (baseline vs configured, rounding, account freeze) | After golden fixtures pass |
| **DE.2D** | Studio envelope builder | Staff UI to author/validate/activate envelopes | After pilot-only Studio feature works |
| **DE.2E** | Public customer configuration UI | Fragment-token auth + select/calculate UX | After public DTO + security tests |
| **DE.2F** | Revision comparison + estimator review | Compare baseline vs configured; review flag | After staff review loop |
| **DE.2G** | Private synthetic deployment | Flags, staging hosts, synthetic quotes only | No real customer traffic |

Do not collapse DE.2C–E. Do not start acceptance/sold/payment/email/IE import.

---

## 2. Validation strategy (cross-phase)

| Area | Tests |
|------|-------|
| Calculator / delta | Deterministic fixtures; baseline vs configured deltas; exact rounding |
| Pricing | Account freeze; markup; included vs optional; custom lines |
| Catalog | Stale/inactive option still served from freeze; unknown option rejected |
| Immutability | Publication unchanged; prior calc unchanged; no `quote_headers` mutation |
| Tampering | Client price/org/markup rejected |
| Isolation | Cross-org 404 |
| Concurrency | Activate race; idempotent selection |
| Reproducibility | Replay calc from frozen inputs after constant/Admin drift simulation |
| Public DTO | Forbidden-field suite |
| Regression | IE / QL / Takeoff / delivery / `calculateQuote()` untouched smoke |

---

## 3. Exact DE.2B scope

**In:**

1. Additive SQL migration file (e.g. `eliteos_digital_estimate_configuration_v1.sql`) — **create only, do not apply**
2. Tables for envelopes, groups, options, sessions, selections, calculations, events (names per data model doc)
3. RLS/grants/search_path/org immutability/partial uniques mirroring DE.1 closure posture
4. In-memory + Supabase repository interfaces
5. Atomic activate RPC (draft → freeze options → mark active → supersede prior) if multi-statement
6. Contract/unit tests for repository invariants (no HTTP UI required)
7. Docs update: PHASE_DE_2B_NOTES.md
8. **No** Studio envelope UI, **no** public configure UI, **no** calculator productization beyond stubs/interfaces

**Out:** DE.2C+ pricing engine implementation details beyond interface hooks; fragment token cutover (may stub link builder); acceptance/sold; Pricing Admin cutover into IE; any change to `calculateQuote()` behavior.

---

## 4. Risks / open decisions

1. Override approval authority (finance vs pilot-only)
2. Material group change: full material reprice vs constrained deltas
3. Tax presentation to customer
4. Blanco / pop-up price reconciliation before merchandising
5. Whether CDT $10 rounding becomes server policy for configured totals
6. Cookie session vs header-only token for public API
7. Clone-on-activate vs in-place freeze for envelope graphs

---

## 5. Doc index (DE.2A)

| Doc | Purpose |
|-----|---------|
| `PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md` | calculateQuote / Admin / reproducibility |
| `PHASE_DE_2A_PRICING_INVENTORY.md` | Full Elite 100 pricing inventory, conflicts, order, matrices |
| `PHASE_DE_2A_1_BUSINESS_PRICING_DECISIONS.md` | Business approval worksheet + DE.2B readiness gate |
| `PHASE_DE_2A_CONFIGURATION_MODEL.md` | Envelope, lifecycle, visible vs internal price |
| `PHASE_DE_2A_DATA_MODEL.md` | Proposed tables |
| `PHASE_DE_2A_API_AND_SECURITY.md` | APIs + fragment token plan |
| `PHASE_DE_2A_IMPLEMENTATION_PLAN.md` | This file |

---

## 6. Paste-ready DE.2B Cursor prompt

```text
Implement Phase DE.2B — Additive Digital Estimate Configuration Schema and Repository Contracts.

Context:
- Branch: elite-100-digital-estimate
- DE.1 + DE.1.1 are complete (immutable publications, Studio pilot head, public read-only portal)
- DE.2A docs are authoritative under docs/digital-estimate/PHASE_DE_2A_*.md
- Pricing strategy: Hybrid — frozen publication baseline + future versioned config delta engine (DE.2C). Do NOT change calculateQuote() behavior.
- Do NOT implement customer configuration UI, Studio envelope UI, or DE.2C pricing math beyond interfaces/stubs.

Goals:
1. Create additive SQL migration file only (do not apply): envelopes, groups, options, sessions, selections, calculations, events per PHASE_DE_2A_DATA_MODEL.md
2. Security posture matching DE.1 closure: fixed search_path, narrow grants, RLS on, revoke anon/authenticated, org immutability, child org match, immutable calc snapshots, append-only events, partial unique one active envelope per publication, no raw tokens, no quote_headers mutation
3. Implement in-memory + Supabase repository contracts with organization_id filtering from trusted context
4. Atomic activate boundary (SQL RPC or equivalent) — never leave two active envelopes; never activate without frozen option economics
5. Contract tests for: org isolation, activate concurrency, immutability, forbidden raw token storage, no quote_headers writes
6. Update docs with PHASE_DE_2B_NOTES.md; adjust DE.2A plan status if needed

Boundaries:
- Documentation + schema file + repository/tests only as needed
- No application UI changes to IE, QL, Takeoff, delivery
- No calculateQuote() changes
- No Pricing Admin cutover
- No DNS, deploy, commit, push, SQL apply, or production flags
- Do not begin DE.2C

Report: files changed, schema summary, RPC list, test results, git status --short, git diff --check. Do not commit.
```

---

## 7. Stop condition

DE.2A ends when the DE.2A documents exist (including the expanded pricing inventory), roadmap docs acknowledge DE.2A, and no application/SQL-apply/deploy actions have been taken.
