# Public retail quoting — UX & product requirements

**Product bar (Eric):** The public quoting tool must be easy enough for a **77-year-old woman** to complete a quote without help. Optimize for **trust, clarity, and completion** — not maximum technical detail.

This head is **not** a slimmed-down copy of the internal HTML prototype. It is a **separate, wizard-first** experience that shares only the backend calculation and persistence pipeline.

---

## Design principles

1. **Step-by-step wizard** — linear flow with clear progress (“Step 2 of 6”). Allow back without losing answers.
2. **Plain language** — short sentences; avoid fabrication jargon unless a **one-line plain explanation** appears first or in a “What’s this?” link.
3. **Large touch targets** — primary actions as full-width or large buttons; comfortable spacing; high contrast.
4. **One major question per screen** — e.g. only “What space are you updating?” before moving on; no dense forms.
5. **Helpful examples** — under each field, e.g. *“Example: ‘L-shaped kitchen along two walls’”* or *“Example: 10 ft wall”*.
6. **Dimensions optional** — prefer **simple size presets** (Small / Medium / Large kitchen, “Apartment bath,” “Not sure”) before any numeric fields.
7. **“I’m not sure” everywhere it fits** — maps to ranges or flags the quote for human follow-up; never blocks progress.
8. **Good / Better / Best or a single range** — show **tiered options** or **one estimated total band** (e.g. *“About $X – $Y”*). Do **not** show wholesale line items, cutout lists, or internal add-on matrices.
9. **Always offer “Have Elite help me finish this.”** — visible on every step (secondary link or sticky footer). Captures intent to hand off to staff; can pre-fill `quote_status` / metadata for routing.
10. **Completion over precision** — allow submit with partial scope; backend + staff refine later.

---

## What the public user must **never** see

- Wholesale or partner cost
- Margin or markup controls
- Pricing structure names or rule codes
- Monday.com fields, board IDs, or sync status
- Internal ESF handoff checklist, rep-only readiness, or file-upload requirements meant for partners
- Protected admin-only identifiers

All of the above may exist **only** on the server and in internal heads after submit.

---

## What still happens **behind the scenes** on submit

Even though the UI is minimal, **public submissions** should still drive the same durable pipeline as other sources (implementation detail, not shown in UI):

- **`quote_headers`** with `quote_source = public_retail`, customer-safe totals, and **`calculation_snapshot`** (full detail for internal review — not rendered to the homeowner).
- **`quote_forecast_events`** for pipeline / aging / value analytics.
- **`quote_monday_sync_log`** (and future Monday item creation) in **staged** mode — no Monday UI in the public flow.

The public client receives only **sanitized** API responses (e.g. retail total or range, confirmation copy), consistent with `POST /api/quote/calculate` public mode today.

---

## Suggested wizard outline (draft)

Steps are indicative; product can reorder after user testing.

| Step | One question (headline) | Presets / “not sure” | Output to user |
|------|-------------------------|----------------------|----------------|
| 1 | What are you looking to update? | Kitchen / Bath / Other + “Not sure” | — |
| 2 | Roughly how big is the space? | Presets + “I’m not sure” | Maps to SF **range** server-side |
| 3 | Do you already know the material look you want? | “Show me options” / “I have a brand in mind” / “Not sure” | May narrow material **tier** for display only |
| 4 | When are you hoping to move forward? | Timeframe chips + “Not sure” | Forecast metadata |
| 5 | How should we reach you? | Name, phone, email (large fields + examples) | — |
| 6 | Your estimate | **Good / Better / Best** or **range** + one sentence of what it includes | No line-item table |

**Persistent:** “Have Elite help me finish this” + “Save and email me a copy” (when auth/email flow exists).

---

## Copy & accessibility checklist

- [ ] Flesch-Kincaid or manual pass: grade ~8 or below on body copy.
- [ ] Field labels as questions where possible (“What’s your zip code?” vs “ZIP”).
- [ ] Error messages: what to do next, not error codes.
- [ ] Support phone / chat visible on every step (trust).
- [ ] Test on **375px width** + **200% zoom** + keyboard-only navigation.

---

## Relation to other docs

- **Internal prototype:** `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html` — **do not** reuse its layout for public retail; reuse **business rules** via backend only.  
- **Architecture / phases:** `docs/quote-platform/PHASE0_IMPLEMENTATION_PLAN.md`, `docs/quote-platform/frontend-plan.md`.

---

## Open product decisions (to resolve with Eric)

- Exact preset → SF range mapping table and disclosure language (“estimate only”).
- Whether public users may upload **one** optional photo without account creation.
- SMS vs email confirmation for “finish later” handoffs.
