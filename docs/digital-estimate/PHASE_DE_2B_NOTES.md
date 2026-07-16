# Phase DE.2B — Configuration + Pricing-Policy Persistence Foundation

**Date:** 2026-07-16
**Status:** Implemented (unapplied SQL + repositories + tests). **Not deployed. SQL not applied. Flags off.**
**Branch context:** `elite-100-digital-estimate`
**Does not begin:** DE.2C was next; **DE.2C engine now implemented** — see `PHASE_DE_2C_NOTES.md`. **DE.2D Studio builder now implemented** — see `PHASE_DE_2D_NOTES.md`. Do not begin DE.2E without instruction.

---

## 1. What shipped

| Deliverable | Location |
|-------------|----------|
| Additive unapplied migration | `backend-core/supabase/eliteos_digital_estimate_configuration_v1.sql` |
| Confirmed pricing fixtures (not production seeds) | `backend-core/src/digitalEstimate/configuration/approvedPricingFixtures.mjs` |
| Pricing-policy repository + resolvers | `pricingPolicyRepository.mjs` |
| Configuration repository (memory + Supabase stubs) | `configurationRepository.mjs` |
| Factory (fail-closed) | `configurationFactory.mjs` |
| Validation / public serializer / flags | `configurationValidation.mjs`, `configurationPublicSerializer.mjs`, `configurationConfig.mjs` |
| Contract tests | `phaseDe2b.test.mjs` |

**Not shipped:** customer configuration UI, Studio envelope UI, production pricing engine, SQL apply, production seeds, DNS, feature flags enabled, commits/pushes.

---

## 2. Confirmed business rules vs schema vs fixtures vs calculator

| Rule | Confirmed business | Schema support | Test fixture | Unapplied migration seeds? | `calculateQuote()` |
|------|--------------------|----------------|--------------|----------------------------|-------------------|
| Direct group rates Promo→F + Remnant 50 | Yes | `digital_estimate_material_group_rates` on Direct schedule | Yes | **No** | Unchanged (Direct Remnant 50) |
| Wholesale group rates Promo→F + Remnant **45** | Yes | Wholesale schedule rates | Yes (Remnant **45**) | **No** | Unchanged (Remnant Wholesale still **50** — documented conflict) |
| Global material use tax **2%** on material sell | Yes | `digital_estimate_material_tax_policies` | Yes | **No** | Unchanged; IE still 2% on CT+BS with vanity-program exclusions — conflict noted for DE.2C |
| Watt’s Promo **$40/SF** for trusted group only | Yes | account groups + membership + material overrides | Yes | **No** | Unchanged / not wired |
| Spahn & Rose **+3%** entire estimate | Yes | account estimate adjustments | Yes | **No** | Unchanged / not wired |
| Order of Spahn % vs 2% tax | **Confirmed DE.2C:** Spahn after complete pre-rounded subtotal including tax | `calculation_order_hint` / engine order | Golden fixtures | — | — |
| Tax customer presentation | **Confirmed DE.2C:** bundled into customer total; not a separate public line | `customer_presentation` | Engine public DTO | — | — |
| Blanco 450 vs 495, waterfall, rounding, etc. | Unresolved | Option/pricing columns exist | Not seeded as authority | **No** | Unchanged |

---

## 3. Account-group identity (Watt’s / Spahn & Rose)

**Stable membership key:** `quote_partner_accounts.id` (`partner_account_id` UUID), org-scoped via membership row `organization_id`.

**Forbidden:** activating rules from `quote_headers.customer_name` or any free-form name substring.

**Gap (documented, not papered over):**

- Retail/homeowner quotes without a `partner_account_id` cannot receive Watt’s/Spahn pricing until a future stable identity exists.
- No production Watt’s / Spahn & Rose group rows are seeded in DE.2B.
- Existing Admin / partner pricing structures are **insufficient** as DE pricing authority because they are not bound to Digital Estimate policy versions, freeze fingerprints, or publication envelopes — hence additive DE tables.

---

## 4. Activation atomicity

- **Memory:** transactional checkpoint + restore on failure; publication-level mutex for concurrent activate.
- **Supabase:** RPC `digital_estimate_activate_configuration_envelope` with `search_path = public`, org checks inside RPC, `service_role` execute only; revokes from `PUBLIC`/`anon`/`authenticated`.

Activation steps: verify org + active publication + snapshot → validate groups/options → freeze fingerprints → activate → supersede prior active → append events → fail closed / roll back.

---

## 5. Flags

| Flag | Default | Role |
|------|---------|------|
| `DIGITAL_ESTIMATE_CONFIGURATION_ENABLED` | off | DE.2B configuration stack |
| `DIGITAL_ESTIMATE_API_ENABLED` | off | Existing DE API |
| `ELITE100_ESTIMATE_STUDIO_ENABLED` | off | Studio pilot |

Factory returns `null` when flags off. Supabase mode without `db` throws `supabase_misconfigured` (no memory fallback).

---

## 6. Token path (prep only)

DE.1 path tokens remain. DE.2E should move to `/e#token` + Authorization header per `PHASE_DE_2A_API_AND_SECURITY.md`. No DE.2B public selection routes.

---

## 7. Tests run

```text
node backend-core/src/digitalEstimate/configuration/phaseDe2b.test.mjs
node backend-core/src/digitalEstimate/phaseDe1.test.mjs
```

---

## 8. Explicit non-goals completed as non-goals

- No `calculateQuote()` edits
- No IE / QL / Takeoff / delivery edits
- No Pricing Admin cutover
- No production rate seeding
- No SQL apply
