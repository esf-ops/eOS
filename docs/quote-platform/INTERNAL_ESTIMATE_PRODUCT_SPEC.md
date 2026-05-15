# eliteOS Internal Estimate Head — Product Specification

**Audience:** Chris, estimators, sales leadership, and anyone planning or building the Internal Estimate experience. **Plain English first.** Technical detail appears only where it helps alignment with engineering.

**Status:** **Target / north-star document** — describes what “finished” and “best-in-class” mean. The live app will lag this spec until phases complete; **gaps between this doc and the code are expected** until each phase ships.

**Related source-of-truth docs:** [`SYSTEM_BLUEPRINT.md`](../eliteos/SYSTEM_BLUEPRINT.md) · [`FEATURE_DECISIONS.md`](../eliteos/FEATURE_DECISIONS.md) · [`CURRENT_SYSTEM_MAP.md`](../eliteos/CURRENT_SYSTEM_MAP.md) · [`quote-library-head-plan.md`](./quote-library-head-plan.md) · [`pricing-admin-head-plan.md`](./pricing-admin-head-plan.md) · [`pricing-seed-map.md`](./pricing-seed-map.md) · `.cursor/rules/*.mdc`

---

## 1. Product purpose

### What this head is for

The **eliteOS Internal Estimate Head** is the place where **Elite Stone Fabrication estimators and quoters** create and revise **detailed internal estimates**—fast enough for daily use, complete enough to catch problems before handoff, and structured enough that **saved data** flows cleanly into the **Quote Library**, **Monday** (visibility only), and **handoff documents** (Moraware / QuickBooks previews first; real writebacks later).

### What this head is **not**

- **Not the Quote Library.** The library is where teams **search**, **group by account**, **change statuses**, run **sold workflow**, and open **handoff docs**. Internal Estimate **creates and edits the estimate itself**; the library **manages the quote record** over its life.
- **Not Pricing Admin.** Standard catalogs, price groups, Elite Program colors, and standard add-on prices are **owned and edited** in **Pricing Admin** over time. Internal Estimate **consumes** that configuration through the **Brain**; it does not replace catalog governance.
- **Not System Admin.** Users, roles, and which staff can open which heads are governed in **System Admin**.
- **Not Monday.** Monday is **workflow visibility** for people who live in the board. **Supabase and the eliteOS Brain** remain the **system of record** for quote data and totals.
- **Not Moraware or QuickBooks automation yet.** The first finished version produces **clear handoff previews and checklists**. **Automatic writeback** to Moraware or QuickBooks is explicitly **out of scope** until mapping, security, and finance sign-off exist.

### Primary user

- **Estimators / quoters** doing detailed internal estimates (kitchens, multi-room jobs, mixed materials, add-ons, and exceptions).

### Product goals (balanced)

- **Fast enough** that staff prefer it over scattered spreadsheets for the same job.
- **Complete enough** that readiness warnings and handoff quality protect the shop before **Sold** and field execution.
- **Clear enough** that a new estimator can learn the happy path in one sitting, with advanced detail available when needed.

---

## 2. Ideal workflow overview

### Target order of work (conceptual)

1. **Job Info** — Who is the account, who is the customer, where is the job, who owns it internally.
2. **Rooms / Areas** — Break the job into quote-sized chunks (physical rooms or logical areas).
3. **Materials & Colors** — Price group is required; exact Elite Program color when known; inheritance from room to piece.
4. **Add-ons & Custom Items** — Cutouts, standard add-ons, and job-specific lines (including internal-only lines when needed).
5. **Review & Readiness** — Score and missing-info list before **Sent** / **Sold**; no surprise gaps at handoff.
6. **Estimate Output** — Internal worksheet vs customer-facing estimate vs handoff previews.
7. **Save / Send / Sold Workflow** — Save to Quote Library; status changes and handoff doc generation coordinated with the library (not duplicated as a second “system of record”).

### UX model

- **Hybrid guided workspace** — clear **main steps** and **quick jump** navigation so estimators can move non-linearly when reality demands it.
- **Sticky estimator summary** — always visible: totals, key scope, readiness, primary actions (**Calculate**, **Save**, **Print**).
- **Not** one endless wall of fields.
- **Not** a rigid step-by-step wizard that slows experts down.

---

## 3. Job Info section

Every estimate should open with a **clean job / account header** so downstream systems and humans see the same story.

### Required starting fields

| Field | Intent |
|--------|--------|
| **Account** | The builder, dealer, partner, or commercial relationship the job rolls up under for reporting and handoff. |
| **Account contact info** | How Elite reaches the account (phone/email as appropriate). |
| **Customer** | End customer or homeowner name when applicable. |
| **Customer contact info** | Phone and/or email for customer-facing follow-up. |
| **Elite Job Name** | Elite’s internal project label (distinct from generic “project name” if both are needed). |
| **Project Address** | Job site address for install and handoff docs. |
| **Branch** | Which Elite location owns the estimate. |
| **Salesperson** | Who owns the commercial relationship for this estimate. |
| **Entered By** | Which staff member built or last edited the estimate in the tool. |

### Account rules

- **Account is required** on every internal estimate.
- If the job is **not** tied to a partner/builder account, use **Direct** as the account choice.
- **Direct** should be the **primary** non-account path—clear, honest, and easy to filter in the library.
- **Avoid** filler placeholder accounts such as “Walk-in,” “Builder TBD,” or “House” **unless leadership explicitly approves** them for reporting. Prefer **Direct** + good notes.

### Salesperson rules

- **Salesperson is required** on every internal estimate.
- If **Account = Direct**, the estimator still picks the **real salesperson** when known.
- If no individual salesperson applies, choose **Direct** as the salesperson value (consistent with account).
- **First-version pick list (fixed set):** Casey, Thera, MJ, House, Direct.  
  - **TODO:** Replace with configurable roster from admin when product is ready (see Phase 5 / governance).

### Entered By rules

- **Default:** the signed-in eliteOS user (display name from profile when available).
- **Editable** when someone else is entering on behalf of another (still auditable).
- **Saved quote** should store both **who was logged in** (user id when available) and the **displayed “Entered By”** text so audits stay honest.

### Branch rules (fixed set for first finished version)

- Dyersville  
- Iowa City  
- Lisbon  

**TODO:** Confirm whether “Entered By” and “Salesperson” eventually sync to Monday columns as text, person, or mirror-only (engineering + ops).

---

## 4. Quote number and revision rules

### Branch-aware internal quote numbers

Internal quotes should use **readable, branch-prefixed** numbers so the field team and office can recognize origin at a glance.

**Format:** `ESF-{BRANCH_CODE}-{SEQUENCE}`

| Branch | Code |
|--------|------|
| Dyersville | `DYER` |
| Iowa City | `IC` |
| Lisbon | `LIS` |

**Examples:** `ESF-DYER-000001`, `ESF-IC-000001`, `ESF-LIS-000001`

**Sequence rules**

- **Six digits**, zero-padded.
- **Separate running sequence per branch** (so Dyersville and Iowa City don’t steal each other’s numbers).

**Revisions**

- Same **base** quote number with a visible **revision suffix**, e.g. `ESF-DYER-000001-R2`, `ESF-DYER-000001-R3`.
- Revisions must remain **linked** to the same logical job in the library (family / parent link — **TODO:** exact data model: `parent_quote_id` vs `quote_family_id` to be decided in Phase 2).

### Public quote lead IDs

- Public Quote Head may keep **public-style** IDs (e.g. `Q-YYMMDD-XXXXXX`) for homeowner leads.
- When staff **converts** a public lead into an official internal ESF quote, eliteOS should assign the **branch-aware `ESF-…` number** and **retain the public id** as **origin / source** on the record for traceability.

**TODO:** Define the conversion UX trigger (who can convert, single vs duplicate row, audit trail).

---

## 5. Room / Area model

### Naming

Use the label **“Room / Area”** everywhere user-facing.

### What a Room / Area can represent

- A **physical room** (e.g. Kitchen).
- A **quoting area** (e.g. Kitchen Perimeter vs Kitchen Island).
- A **logical bundle** of work (e.g. “Master bath package”).

### Examples of good names

Kitchen · Kitchen Perimeter · Kitchen Island · Master Vanity · Guest Bath Vanity · Laundry · Bar · Pantry

### What each Room / Area should support

- Name  
- Material **group** and optional **exact color**  
- **Pieces / shapes** (measurement model)  
- Countertop square footage (derived and/or manual override)  
- Backsplash square footage (derived and/or manual override)  
- Add-ons / cutouts (prefer room-level defaults; piece-level when needed)  
- Custom line items (optional association)  
- Notes  
- Room subtotal (for estimator clarity; customer visibility controlled in output settings)  
- **Later:** room readiness / status if it proves useful in the field

### Flexibility rule

**Do not** force one rigid room template. Estimators choose whether **Kitchen** is one room with many pieces or **split** into Perimeter + Island—whatever matches how they sell and measure.

---

## 6. Room Builder / visual layout

### Measurement workflow defaults

- **Guided Shape** is the **default** path for the detailed estimator tool (pieces, presets, clear geometry).
- **Manual square feet** remains a **secondary** path for experienced estimators or repair jobs.
- **Rapid Linear Foot** stays **hidden / removed** for internal users (too easy to misuse vs guided pieces).

### Initial experience

- **No** shape clutter on first paint.
- Estimator sees **clean preset choices** first.
- Choosing a preset **creates editable piece rows** immediately (labels pre-filled, dimensions empty).

### Presets / shapes to support (first finished target)

- Rectangle  
- L-shape  
- U-shape  
- Island  
- Backsplash pieces  
- Waterfalls (see §7 for material + labor split)

### Preset behavior (examples)

- **L-shape:** creates clearly labeled pieces such as **Long Wall** and **Return** (editable).
- **U-shape:** **Left Run**, **Back Run**, **Right Run** (editable).
- Labels are **guides**, not locks—every dimension stays editable.

### Units and display

- Support **inches** and **feet + inches** input.
- **Normalize internally to inches** for geometry; **show square feet** clearly for pricing.
- Always show **resulting countertop sf** and **backsplash sf** next to the inputs that drive them.

### Visual vs math

- **Visual clarity** and **accurate geometry** both matter.
- **Math wins:** pricing uses **validated dimensions and calculated sf**, not how pretty the canvas looks.

### Visual editor — phases

**Phase A (first useful):**

- Rotate pieces **90°**.
- **Drag** pieces on a simple canvas for communication and review.

**Phase B (best-in-class near term):**

- Scale, snapping, grouping, labels, annotations, plan-like controls.

If Phase B cannot ship safely with the first “finished” release, keep it as **high-priority Phase 4** (see §23) and do not block shipping Phase A.

### Piece labels / callouts (canvas)

Support short **visible callouts** tied to pieces, e.g.:

- Sink centered here  
- Cooktop cutout  
- Waterfall left side  
- Overhang note  
- Polish backside  
- Island separate color  
- Full-height backsplash review  

### Seams

- **Dedicated seam planning** is **out of scope** for the first finished Internal Estimate Head.
- **Do not** add seam layout or seam-specific annotations in v1.

### Plan underlay

- **Future:** cabinet plan image/PDF underlay behind the canvas.
- **Not required** for first finished version.
- **Data model** must not paint eliteOS into a corner—leave room for underlay + **AI takeoff** later without rewriting the room/piece core.

---

## 7. Pieces

Pieces **belong inside** a Room / Area.

### Piece fields (target)

| Field | Notes |
|--------|--------|
| **Label** | Free text; preset seeds a default. |
| **Type** | Perimeter · Island · Top · Backsplash · Waterfall · Vanity top · Bar top · Laundry top · Other |
| **Length / Depth** | Drives geometry. |
| **Calculated sf** | Always shown; editable override if estimator must correct. |
| **Add backsplash toggle** | Where relevant (see §9). |
| **Material / color** | Inherit from room unless overridden. |
| **Notes / callouts** | For canvas + internal worksheet. |

### Waterfall rule (material + labor)

Waterfalls are **two parts**:

1. **Material (the panel)**  
   - Estimator enters **real waterfall panel dimensions**.  
   - Contributes **square footage** and **material cost**.  
   - Inherits room material or uses **piece override** when different.

2. **Waterfall fabrication / labor add-on**  
   - Separate line (standard add-on or structured line).  
   - **Does not replace** material square footage.

**Example**

- Island top `96" × 42"` → **28 sf** material.  
- Waterfall panel `42" × 36"` → **10.5 sf** material.  
- Waterfall fabrication add-on **1 × $600** (example).  
- **Total** = **38.5 sf material** + **$600 fabrication** (plus any other scope).

---

## 8. Material and Elite Program color rules

### Selection model (priority)

1. **Room / Area material** first (this is what estimators should think about by default).  
2. **Piece override** second.  
3. **Optional price-group comparison** third (decision support—not the primary quote unless selected).

**Do not** assume one material/color for the entire quote unless the estimator explicitly chooses a single-room job.

### Price group vs exact color

- **Price group is required** whenever material is quoted.  
- **Exact Elite Program color** is **optional**.  
- If color unknown: quote by **price group** and mark color **TBD** in the UI and outputs.

### Color readiness

- If **group is chosen** but **color is TBD**, show a **warning** before **Sent** and **Sold**.  
- **Do not hard-block** sending—warnings, not dead ends.

### Inheritance rules

- Pieces **inherit** Room / Area material unless overridden.  
- Backsplash **inherits** countertop / room / piece material unless the “different backsplash material” path is on (§9).  
- **Island** may differ from **perimeter**.  
- **Each vanity room** may differ from others.

### Elite Program color catalog (ownership)

- **Pricing Admin** owns the catalog long-term (active/inactive, mapping to price group, supplier, material type, color name).  
- **Internal Estimate** reads **active** rows through the **Brain** (never a giant hardcoded list in the browser as the long-term plan).  
- The **legacy prototype** `config.materials` remains a **seed reference**, not the forever source.

**First finished catalog capabilities**

- Color name, supplier, material type, price group, active/inactive.

**Later**

- Effective dates and history; audit of catalog edits.

### Pricing snapshots

- Saved quotes must **freeze** what was used: group, color (or TBD), rates, and calculation snapshot.  
- **Pricing Admin changes** affect **new** work, not silent edits to old sold quotes.

---

## 9. Backsplash rules

### Toggle-first

- **Default: off** until the estimator turns backsplash on for that scope (room/piece per product decision—**TODO:** confirm whether toggle lives at room, piece, or both with clear hierarchy).

### When on

- **Default height:** 4 inches.  
- Estimator may set **shorter or taller**.  
- Guided **Type → Backsplash** sets depth/height to **4″** when the field was blank, 0, or still at the countertop default (25.5″); custom heights (e.g. 6″, 8″) are preserved. Switching back to **Counter** defaults to **25.5″** only when depth was blank, 0, or 4″.  
- Backsplash sf = **length × backsplash height** (plus any explicit backsplash pieces when modeled separately).

### Backsplash material

- **Defaults** to match countertop / room / piece material.  
- Optional **“Use different backsplash material”** toggle.  
- **Only show** the second material/color picker **when that toggle is on**—keep the default path clean.

### Summary display

Separate clearly where helpful:

- Countertop sf  
- Backsplash sf  
- Countertop material dollars  
- Backsplash material dollars  
- **Total with backsplash**  
- Optionally **total without backsplash** for estimator-only views

---

## 10. Price group comparison rules

### Estimator control

- Estimator chooses **which price groups** appear as **comparison columns** (e.g. Promo vs Group B vs Group F).

### Two comparison modes

1. **Material-only** comparison (sf × group rates, countertop + backsplash split).  
2. **Full estimate** comparison (materials + add-ons + custom lines that apply globally).

### Per group, show

- Countertop material  
- Backsplash material  
- Material subtotal  
- Add-ons / custom (as defined for comparison—**TODO:** which custom lines roll into “full comparison” vs material-only; default: all non-internal lines in full comparison)

### Primary quote

- The **selected material** path remains the **authoritative quote total** for status, library, and sold.

### Customer-facing comparison

- Estimator chooses whether comparison groups appear on **customer estimate / PDF**.  
- **Default: off** (clean customer doc).

### Shipped math behavior (Direct / Wholesale parity, 2026)

- **Internal Estimate Direct / Wholesale math uses fixed rate books only.** **Wholesale** mode uses prototype wholesale group $/sf (partner seed mirror). **Direct / Retail** mode uses **ESF Direct** $/sf per group (same table as public consumer *before* the public planning markup).  
- **No** partner retail markup, **no** public consumer markup, and **no** extra retail markup percentage is applied on top for `quote_source: internal_quote`. Totals are **sf × selected rate + room fixed add-ons + structured custom lines** (and vanities where applicable), matching the legacy internal HTML tool concept (`p` vs `directP`, no `%` layer).  
- The **sticky summary** rolls up **countertop / backsplash / room extras / structured custom lines** from **`buildSelectedMaterialBreakdown`** (same mixed piece/room group basis as customer **Quoted Material Breakdown**); grand total comes from **`runLocalPrototypeQuote`** (material priced per-room via **`measureRoomDraft`** using that breakdown). **Calculate** (when signed in) remains the **backend line-item** source of truth and refreshes snapshot fields such as `material_breakdown`. **`addOns`** on calculate/save merges per-room catalog quantities, **`tearout`**, and FHB **`qty-outlet`** (when FHB scope exists) so **`calculateAddOns`** stays aligned with live room extras while **`applyGlobalAddOns`** stays false in the preview runner.  
- **Customer-facing group display:** checkboxes send `customerEstimateDisplayGroups` (stored on save as `internal_ui.customer_estimate_display_groups`). **Print customer estimate** is a separate branded layout (not the app shell): ESF logo + **Elite Stone Fabrication Estimate** header, compact **Project overview** grid, **Scope summary**, **Selected material breakdown** (per-group room/piece sf tables), **Add-ons / fixtures** (named lines + subtotal), **Estimate summary** rollup, optional **material group comparisons**, then **Terms & conditions**, dual signature lines, and three-branch contact footer. Internal-only custom adjustments may be in the total but are **not** listed on the customer print. Rates per sf are omitted. Estimators should disable browser print “Headers and footers” for the cleanest PDF. **Quote Library PDF** reuse is still **planned**.  
- Automated regression: `node backend-core/src/scripts/verifyInternalEstimateMath.mjs`.

---

## 11. Add-ons, cutouts, and custom line items

### Attachment levels

Add-ons and cutouts may exist at:

- **Quote** level (rare; global trip charge, etc.)  
- **Room / Area** level (**default UI emphasis**—fastest for most kitchens)  
- **Piece** level (sink on **this** perimeter run, cooktop on **this** wall)

### Cutouts

- Attach to a **specific piece** when possible.  
- Support **notes**.  
- Show as **labels / callouts** on the visual layout when that layout exists.

### Standard add-ons (catalog)

Eventually **Pricing Admin**; first finished version may use **documented defaults** in code or seed rules if finance agrees:

- Sink cutouts, cooktop cutouts, waterfalls, **polish waterfall backside**, outlets, ESF sinks, vanity sinks, standard fabrication/install fees if applicable.

**Rule:** estimators handle odd cases with **custom line items** until the catalog catches up.

### Tear out

- **Not** a standalone mystery toggle in the default flow.  
- Implemented as a **preset custom line item**: default **$750**, **editable**.

### Preset custom line items (acceptable for v1)

Hardcoded presets are OK **if** the estimator can always edit amount, name, description, qty, visibility, and absorb behavior.

Suggested presets:

| Preset | Default | Notes |
|--------|---------|--------|
| Tear Out | $750 | Editable |
| Trip Charge | TBD value | Editable |
| Additional Material Cost | $0 or suggested | Editable |
| Custom Sink / Faucet / Fixture | blank | Editable |
| Labor / Install Fee | blank | Editable |
| Discount / Credit | negative | Rules in calculator |
| Other | blank | Editable |

### Custom line item fields (full)

- Item name  
- Description / note  
- **Category:** Sink · Faucet · Plumbing fixture · Accessory · Labor · Fee · **Tear Out** · **Trip Charge** · **Additional Material Cost** · **Discount/Credit** · **Other**  
  - **Optional later:** “Risk / complexity allowance” if finance wants it as a first-class category (**TODO**).  
- Quantity  
- Unit price  
- Line total (computed; editable override only if product requires—**TODO:** prefer always computed)  
- **Customer-facing** yes/no  
- Internal note  
- Optional **room** and **piece** association  
- **Absorb behavior** (internal-only economics)

### Customer-facing defaults by category

| Category | Default customer-facing |
|----------|-------------------------|
| Sink, Faucet, Plumbing fixture, Accessory, Labor, Fee | Yes |
| Tear Out, Trip Charge | Yes (trip may flip to internal by policy—**TODO** ops) |
| Additional Material Cost | **Internal-only** default |
| Risk / complexity allowance (if added) | **Internal-only** default |
| Discount/Credit | Customer-facing unless marked internal |
| Other | **Estimator must choose** |

### Internal-only charges

- Affect **quote total**.  
- **Do not** print as separate lines on **customer** estimate.  
- **Do** appear on **Internal Worksheet**, **Quote Library detail** (staff view), and **handoff docs** for audit.  
- Must be **auditable** (who added, when, absorb target).

### Absorb options

- Into **material** cost bucket  
- Into **fabrication / install** bucket  
- Into **project total** (lump absorption)

**Default guidance:** **Additional Material Cost** defaults to **absorb into material** because Elite’s material pricing philosophy already bundles much of template/install into material tiers—**confirm with finance** (**TODO**).

---

## 12. Sticky estimator summary

A **sticky right-hand summary** should always be visible on desktop layouts (mobile may collapse to a bottom sheet—**TODO** responsive pattern).

### Summary contents

- Grand total (**live preview** from the same internal rate-book model as Calculate; updates as dimensions, add-ons, custom lines, pricing mode, and primary group change)  
- When **Calculate** has run against the API, show **backend total** for confidence (line-level snapshot)  
- Countertop sf / backsplash sf / total sf  
- Selected material / color summary (including TBD states)  
- Material breakdown (by room / piece / group as appropriate)  
- Add-ons subtotal  
- Custom line items subtotal (split visible vs internal if space allows)  
- Readiness score + short missing list  
- **Calculate**  
- **Save to Quote Library**  
- **Print / export**  
- **View in Quote Library** after save (deep link)

Keep it **compact**—a cockpit, not a second full quote.

---

## 13. Estimate output modes

Three modes for the first finished version:

### 1) Internal Worksheet

- Shows **everything**: exact math, internal lines, comparisons, readiness, absorb behavior.  
- For **Elite staff** only.

### 2) Customer Estimate

- Clean **ESF / eliteOS** branded proposal.  
- Room / area summary, pieces/dimensions, sf, material/color (or TBD), **Estimate summary** (countertop $ + backsplash $ + add-ons + customer custom lines), final total, terms, signature block.  
- **No** raw JSON, **no** developer keys, **no** internal-only lines or staff notes on the customer print (may still affect total on the internal worksheet).

### 3) Sold-job handoff previews

- **Moraware Entry** preview payload (human checklist).  
- **QuickBooks Entry** preview payload.  
- Missing-handoff warnings.  
- **No automatic writeback** in v1.

### Branding

- **Elite Stone Fabrication / eliteOS** now.  
- **Partner / builder co-branding** later (configurable).

### Customer rounding rules

- **No cents** on customer-facing outputs.  
- Round **section subtotals** **up** to nearest **$10**.  
- Round **final total** **up** to nearest **$10**.  
- Internal worksheet keeps **exact** numbers and may show **rounded customer view** side-by-side.

### Room subtotals on customer doc

- Estimator toggle: **show / hide** room subtotals.  
- **Default: hide** unless it helps readability for that job.

### Price group comparisons on customer doc

- Estimator toggle; **default off**.

---

## 14. Save, reopen, and revision behavior

### New estimate

- **Save** creates a **new** Quote Library record (today’s foundation behavior).

### Opened from Quote Library (`?quoteId=`)

Estimator must explicitly choose **before save**:

1. **Update existing quote** (in-place revision—**product requires clear confirmation**).  
2. **Save as new revision** (same job family, new `-R#` suffix rules).  
3. **Save as new quote / duplicate** (new ESF number).

The UI must show **plain-English consequences** (“This will overwrite the saved total on quote ESF-DYER-000014” vs “This will create ESF-DYER-000014-R2”).

### Hydration completeness

`https://internal.eliteosfab.com?quoteId=<id>` must restore everything stored, including:

- Job / account / customer / project fields  
- Branch, salesperson, entered by  
- Rooms / areas, pieces, materials, overrides  
- Backsplash settings  
- Custom line items  
- Standard add-ons where safely mapped  
- Output toggles when stored  

**Never** leave the loaded quote as **raw JSON only**. If something cannot hydrate yet, show a **clear checklist** of missing fields.

**Known today:** full three-way save choice + in-place update are **not** complete—tracked as Phase 2 (§22–§23).

---

## 15. Quote statuses (internal estimate lifecycle)

Use **estimate lifecycle** statuses—not production install statuses.

| Status | Meaning (plain English) |
|--------|-------------------------|
| **Draft** | Work in progress. |
| **Needs Info** | Blocked on customer/site info. |
| **Ready for ESF Review** | Estimator believes shop can price/review. |
| **Sent** | Delivered to customer/channel (definition per ops). |
| **Revised** | Superseded by a newer revision; history kept. |
| **Sold** | Won; triggers handoff doc generation path. |
| **Lost** | Did not win; retained for learning. |
| **Archived** | No longer active in default views. |

**Do not** use shop floor statuses (template ready, awaiting material, install scheduled, etc.) **on the quote** until the quote becomes a **sold job** owned by Moraware/ops workflows.

---

## 16. Sold workflow

When user marks **Sold**:

1. Set status to **Sold** (library + internal views consistent).  
2. **Generate Moraware Entry Doc** (stored checklist payload).  
3. **Generate QuickBooks Entry Doc** (stored checklist payload).  
4. **Monday internal board** update/create if configured (**visibility only**).  
5. Prepare data for **future** Moraware/QB automation—**no writeback** in v1.

### Permissions (v1)

- Any authenticated user with **Internal Estimate** access may mark **Sold** (subject to later tightening—**TODO** leadership).

### Confirmation UX

- Require **confirmation dialog**.  
- Show **missing handoff warnings** before completion.  
- If critical info missing, allow **“Mark Sold anyway”** with a **required reason** captured in **audit / timeline** and echoed in handoff warnings.

### Recommended warnings before Sold

**Warn (configurable severity later):**

- Account  
- Customer name  
- Customer phone **or** email  
- Elite Job Name / project label  
- Project address  
- Branch  
- Salesperson  
- Entered By  
- At least one Room / Area  
- Some measured countertop or backsplash scope  
- Material **group** (color may be TBD with warning only)  
- Quote total  
- Sink / faucet / cooktop details **if** related cutouts or line items exist  

**Not required for v1 warnings:**

- Cabinet/site readiness checklist  
- Template decision-maker / contact  

---

## 17. Handoff documents

### Moraware Entry Doc (preview / stored payload)

Must include: account; customer; project; address; branch; salesperson; entered by; rooms/areas; pieces; measurements; material/color per room/piece; sinks/faucets/fixtures; cooktop/appliance details; custom lines; notes; missing-field warnings; file/drawing references.

### QuickBooks Entry Doc (preview / stored payload)

Must include: quote number; account/customer; branch; salesperson; pricing mode; room totals; material/color breakdown; **visible and internal** custom lines as appropriate for accounting; final total; notes/warnings.

### Automation

- **No** automatic Moraware or QuickBooks posting in the first finished version.

---

## 18. Monday internal estimate workflow

- Board id: **`MONDAY_INTERNAL_QUOTES_BOARD_ID=18413174398`** (documented for ops).  
- Monday is **workflow visibility**, not system of truth.

### When to sync

Create/update Monday on major status changes, e.g. **initial save**, **sent**, **revised**, **sold**, **lost**.

### Internal item title format

`{quote_number} - {account} - {customer_name}`

Examples:

- `ESF-DYER-000123 - SNR Construction - Jane Smith`  
- `ESF-IC-000041 - Direct - Mike Johnson`

**Do not** reuse **public** board column IDs for internal items—internal columns get their own env mapping (`MONDAY_INTERNAL_COL_*`).

---

## 19. Pricing Admin relationship (long-term)

Pricing Admin owns, over time:

- Price groups and tier tables  
- Direct / wholesale / partner economics as configured  
- Elite Program colors and **color → group** mapping  
- Material catalog entries  
- Sinks, faucets, fixtures  
- Standard add-ons and **preset custom line defaults**  
- Effective dates / history and audit (**later**)

### First finished version expectations

- Standard add-on **defaults** may remain code/seed-backed **if documented and good enough**.  
- Preset custom lines may be **hardcoded** if always editable.  
- Elite Program colors need **active/inactive** and current mapping in admin.  
- Saved quotes still carry their own **snapshots**.

### Who edits Pricing Admin

- Anyone with **Pricing Admin Head** access.  
- **System Admin** controls **who gets** that access.

### Future

- “Refresh quote with today’s catalog” as a **deliberate new revision** (never silent).

---

## 20. File / drawing references

Until secure file storage exists:

- Support **metadata / text references** only (filenames, links, “on file in SharePoint,” etc.).  
- Label honestly: **“File upload/storage will be added later; list required files here for ESF review.”**

**Future:** Supabase Storage (or equivalent), plan underlay, AI takeoff.

---

## 21. UX principles (non-negotiable feel)

The Internal Estimate Head should feel:

- Faster than fighting a spreadsheet for the same complexity.  
- Clearer than “generic online quote” tools built for homeowners.  
- Powerful enough for real Elite jobs.  
- Clean enough to open every morning.

### Design principles

- **Simple first**, advanced behind progressive disclosure.  
- **No raw developer wording** in staff-facing surfaces.  
- **No homeowner-first copy** in the internal head.  
- **No intimidating wall of fields.**  
- **Sticky summary** always available.  
- Estimators always know **what moved the price**.  
- **Hidden/internal** money must remain **auditable**.

---

## 22. Current known gaps (from today’s foundation)

Honest list as of the spec authoring date—these are **expected** until phased work lands:

- **In-place update vs revision vs new quote** — UI + API behavior not finished; save today often creates a **new** row.  
- **Branch-aware `ESF-{BRANCH}-{SEQ}` numbering** — not implemented end-to-end.  
- **Pricing Admin CRUD** for Elite colors — partial / not estimator-grade yet.  
- **Room status enums** — not fully modeled in UI + data.  
- **Full visual editor** (snap, scale, grouping) — not complete.  
- **Seam planning** — intentionally excluded.  
- **Monday internal columns** — may still need env configuration and testing.  
- **Print** — browser print exists; **server PDF** is future.  
- **File upload** — references only.  
- **Public lead → official ESF number** conversion flow — future.  
- **Pricing effective dating** — future.  
- **Some hydration fields** — may still show gaps on older snapshots until backfilled.

---

## 23. Recommended build phases (for Cursor / engineering)

**Phase 1 — UX rebuild / simplify workspace**  
Job Info · Rooms/Areas · Guided shape defaults · Sticky summary · clearer materials · clearer add-ons/custom lines.

**Phase 2 — `quoteId` hydration + save / update / revision**  
Three explicit save paths · ESF branch numbering · revision suffix rules · library linkage.

**Phase 3 — Customer / internal output polish**  
Internal Worksheet · Customer Estimate · Sold handoff previews · customer rounding · print layout.

**Phase 4 — Visual layout editor**  
Rotate · drag · labels/callouts · later snap/scale/grouping.

**Phase 5 — Pricing Admin catalog improvements**  
Material color CRUD · standard add-ons · preset defaults · active/inactive · future effective dates.

**Phase 6 — Monday internal mapping**  
Columns · status-driven updates · revision-friendly titles.

**Phase 7 — Deeper handoff automation**  
Moraware Admin mapping · QuickBooks workflow · file storage · plan underlay · AI takeoff.

Phases may overlap slightly, but **do not skip Phase 1 clarity** to chase visuals.

---

## 24. Maintenance

- When shipped behavior **matches** a section here, update **§22** and add a dated note in [`FEATURE_DECISIONS.md`](../eliteos/FEATURE_DECISIONS.md).  
- When shipped behavior **diverges** intentionally, update **this spec** first, then `FEATURE_DECISIONS.md`.

---

## Appendix A — Open product / engineering TODOs (central list)

| ID | Topic | Owner |
|----|--------|--------|
| T1 | Exact data model for quote **families** / revisions (`parent_quote_id` vs family table) | Engineering + finance |
| T2 | Sequence generation strategy per branch (DB sequence, RPC, or queue-safe generator) | Engineering |
| T3 | Salesperson roster: fixed list vs admin-configured | Product / leadership |
| T4 | Which custom lines roll into **material-only** vs **full** comparison | Product |
| T5 | Backsplash toggle placement hierarchy (room vs piece) | Product + UX |
| T6 | “Direct” naming collision: **account Direct** vs **pricing Direct** — ensure UI copy disambiguates | UX |
| T7 | Customer-facing rounding: confirm **always round up** vs banker's rules | Finance |
| T8 | Sold permissions: everyone vs role-gated | Leadership |

---

**End of Internal Estimate Product Spec**
