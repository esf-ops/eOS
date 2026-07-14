# Quote Intake Lab — Architecture

**Initiative:** AI Quote Intake Lab  
**Document status:** Phase 0 architecture lock (documentation only)  
**Date:** 2026-07-14  
**Related:** [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md) · [`DO_NOT_TOUCH.md`](./DO_NOT_TOUCH.md) · [`BUILD_PLAN.md`](./BUILD_PLAN.md)

---

## 1. Business objective

Build an isolated eliteOS head that helps ESF’s estimating team turn inbound sales emails into structured, reviewable Elite 100 estimates.

**Target outcome (product vision):**

1. Monitor incoming sales emails.
2. Decide whether an email is a quote/estimate request.
3. Gather information from the thread and attachments.
4. Run AI countertop takeoff.
5. Present a centralized estimator queue.
6. Let estimators correct AI output, add custom line items, approve, and (eventually) reply to the original sender.

**MVP constraint:** Elite 100 materials and fixed price-group pricing only. No production Quote Library writes, no live Outlook, no production email send.

---

## 2. MVP boundaries

| In MVP | Out of MVP |
|--------|------------|
| Isolated `app-quote-intake-lab` head (manual URL; **not** on Home Launcher) | Production launcher card |
| Fixture / `.eml` / paste email intake | Live mailbox polling |
| Classification + field extraction (lab tables) | Mutation of `quote_headers` |
| Takeoff via adapter (lab job records; may call pure takeoff modules) | `import-from-takeoff` into Internal Estimate |
| Estimator review workspace + custom line items | Partner / public / custom quote flows |
| Elite 100 price-group preview from isolated snapshot or read-only catalog adapter | Pricing Admin writes; production rate edits |
| Missing-info flags + draft customer follow-up **preview** | Sending through Outlook/Resend |
| Lab audit history (AI vs human) | Monday / Moraware / QuickBooks side effects |
| Simulated approve + `sent_simulated` | Real customer email delivery |
| Prefer separate staging Supabase project | Production migrations |

---

## 3. Long-term vision

Eventually the system should:

- Detect missing quote information and draft follow-ups.
- Send approved follow-ups through Outlook (new adapter; Graph does not exist today).
- Recognize customer replies and attach them to the correct intake case.
- Auto-populate newly received information.
- Notify customer and salesperson.
- Reduce estimators to verification and exception handling.

Each expansion must remain adapter-gated so production quote, delivery, and CRM systems are never silently coupled.

---

## 4. Proposed component architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  app-quote-intake-lab (Vite/React head)                         │
│  Queue · Case detail · Review · Pricing preview · Draft UI      │
└────────────────────────────┬────────────────────────────────────┘
                             │ Bearer JWT → /api/quote-intake-lab/*
┌────────────────────────────▼────────────────────────────────────┐
│  backend-core/src/quoteIntakeLab/                                 │
│  Routes · Case state machine · Audit · Idempotency                │
│                                                                   │
│  Adapters (explicit contracts; no direct prod coupling):          │
│  ┌──────────────────┐ ┌────────────────┐ ┌─────────────────────┐ │
│  │ InboundEmail     │ │ Takeoff        │ │ Elite100Catalog     │ │
│  └──────────────────┘ └────────────────┘ └─────────────────────┘ │
│  ┌──────────────────┐ ┌────────────────┐ ┌─────────────────────┐ │
│  │ Pricing          │ │ QuoteLibrary   │ │ EmailDelivery       │ │
│  └──────────────────┘ └────────────────┘ └─────────────────────┘ │
│  ┌──────────────────┐                                             │
│  │ PdfRenderer      │                                             │
│  └──────────────────┘                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   Staging Supabase    Pure takeoff/*.mjs   Read-only snapshots
   quote_intake_lab_*   (compute/validate)   Elite 100 fixture
   (or dedicated project)
```

**Naming conventions (repo-aligned):**

| Piece | Name |
|-------|------|
| Head folder | `app-quote-intake-lab/` |
| Backend folder | `backend-core/src/quoteIntakeLab/` |
| API namespace | `/api/quote-intake-lab/*` |
| Head slug (later) | `quote_intake_lab` |
| Suggested local port | `5196` |

---

## 5. Email-to-queue workflow

```
Upload .eml / paste / fixtures
        │
        ▼
InboundEmailAdapter.normalize()
        │
        ▼
Idempotency check (Message-ID / content hash)
        │
        ▼
Create case → status: received
        │
        ▼
Classify (quote? Elite 100?)
   ├── not_quote
   ├── not_elite_100
   └── continue
        │
        ▼
Extract fields + attachments → processing_attachments
        │
        ▼
TakeoffAdapter.run() → takeoff_processing
   ├── needs_manual_takeoff
   ├── needs_information
   └── ready_for_review
        │
        ▼
Estimator opens case → in_review
        │
        ▼
Approve lab quote → approved_lab_quote
        │
        ▼
Draft communication / PDF preview → ready_to_send_lab
        │
        ▼
Simulate send → sent_simulated
```

Failures at any durable step → `failed` with recoverable error code; append audit event; never write production quote rows.

---

## 6. Data ownership boundaries

| Data | Owner in MVP | Must not |
|------|--------------|----------|
| Intake cases, email blobs, extraction JSON | Lab tables / staging project | Share `quote_headers` IDs |
| Attachments | Lab storage bucket / staging | Write `eliteos-quote-files` |
| Takeoff measurements for a case | Lab takeoff run record (+ optional call into pure takeoff modules) | Approve into IE via production import API |
| Pricing preview | Lab calculation snapshot | Persist as production quote totals |
| Estimator custom lines | Lab case lines | Appear in Quote Library |
| Audit trail | Lab audit events | Depend on `quote_status_history` |
| Org / user identity | Existing auth (`/api/me`) read-only | Change governance / roles |

**Organization scope:** every lab row must carry `organization_id` from server auth context (never trust client-supplied org).

---

## 7. Adapter contracts

Adapters are TypeScript/JS interfaces implemented by lab modules. Production systems are never imported into route handlers except through these adapters. MVP implementations are stubs, fixtures, or read-only facades.

### 7.1 `InboundEmailAdapter`

```ts
type InboundEmailSource =
  | { kind: "eml_upload"; bytes: Uint8Array; filename: string }
  | { kind: "pasted_text"; raw: string }
  | { kind: "fixture"; fixtureId: string };

type NormalizedEmail = {
  messageId: string | null;          // RFC Message-ID when present
  contentHash: string;               // sha256 of normalized raw
  receivedAt: string | null;
  from: { name?: string; email: string };
  to: Array<{ name?: string; email: string }>;
  cc: Array<{ name?: string; email: string }>;
  mailbox: string | null;            // receiving salesperson / shared mailbox
  subject: string;
  textBody: string;
  htmlBody: string | null;
  threadKey: string;                 // Conversation-ID or derived subject+participants key
  inReplyTo: string | null;
  references: string[];
  attachments: Array<{
    filename: string;
    contentType: string;
    sizeBytes: number;
    contentHash: string;
    storageRef?: string;             // lab storage only
  }>;
  headers: Record<string, string>;
};

interface InboundEmailAdapter {
  ingest(source: InboundEmailSource): Promise<NormalizedEmail>;
  /** Future: poll Graph mailbox. MVP: throws Unsupported. */
  pollMailbox?(since: string): Promise<NormalizedEmail[]>;
}
```

**MVP:** `.eml` parse + paste + fixtures. **Future Outlook:** implement `pollMailbox` only after Phase 9 approval; never call Resend.

### 7.2 `TakeoffAdapter`

```ts
type TakeoffRunRequest = {
  caseId: string;
  organizationId: string;
  planFileRefs: string[];            // lab storage refs
  hintNotes?: string;
};

type TakeoffRunResult = {
  labTakeoffRunId: string;
  contractVersion: string;           // align with TAKEOFF_SCHEMA_VERSION when using pure modules
  measurements: unknown;             // TakeoffResult-shaped JSON
  totalExactSf: number | null;
  sinkCutoutCount: number | null;
  edgeProfile: string | null;
  backsplash: unknown | null;
  confidence: number | null;
  missingFlags: string[];
  evidence: unknown[];
  status: "completed" | "needs_manual" | "failed";
};

interface TakeoffAdapter {
  enqueue(req: TakeoffRunRequest): Promise<{ labTakeoffRunId: string }>;
  get(labTakeoffRunId: string): Promise<TakeoffRunResult>;
}
```

**MVP:** may invoke pure functions under `backend-core/src/takeoff/*.mjs` and store results in **lab** tables. Must **not** call `POST /api/internal-quotes/import-from-takeoff` or write `quote_takeoff_jobs` in production.

**Authorized future refactor:** extract shared takeoff orchestration behind this adapter so `app-ai-takeoff` and the lab share one boundary — without changing Internal Estimate import UX.

### 7.3 `Elite100CatalogAdapter`

```ts
type Elite100Color = {
  colorName: string;
  priceGroup: string;                // Group Promo … Group F
  aliases?: string[];
  active: boolean;
};

interface Elite100CatalogAdapter {
  listColors(organizationId: string): Promise<Elite100Color[]>;
  resolveColor(organizationId: string, rawText: string): Promise<{
    match: Elite100Color | null;
    confidence: number;
    candidates: Elite100Color[];
  }>;
  resolvePriceGroup(organizationId: string, colorName: string): Promise<string | null>;
}
```

**MVP:** load from isolated snapshot (prefer copy of `elite100-2026.json` / exported `material_color` rows) — not live Pricing Admin writes. Optional read-only call to catalog helpers is allowed only if it cannot mutate and is org-safe.

### 7.4 `PricingAdapter`

```ts
type LabPricingInput = {
  organizationId: string;
  priceGroup: string;
  exactCountertopSf: number;
  exactBacksplashSf?: number;
  sinkCutouts?: number;
  edgeProfile?: string;
  customLines?: Array<{ description: string; amount: number; quantity?: number }>;
};

type LabPricingPreview = {
  authority: "calculateQuote_readonly" | "lab_snapshot";
  byGroup: Record<string, { subtotal: number; total: number }>;
  selectedGroupTotal: number;
  lineItems: Array<{ description: string; amount: number }>;
  warnings: string[];
  calculatedAt: string;
};

interface PricingAdapter {
  preview(input: LabPricingInput): Promise<LabPricingPreview>;
}
```

**MVP:** wrap `calculateQuote()` in a lab-only facade that never persists. Frontend must not invent totals. Price comparison across Elite 100 groups is in-scope for preview only.

### 7.5 `QuoteLibraryAdapter`

```ts
type LabQuoteDraft = {
  caseId: string;
  payload: unknown;                  // lab-shaped estimate document
};

interface QuoteLibraryAdapter {
  saveLabDraft(draft: LabQuoteDraft): Promise<{ labQuoteId: string }>;
  getLabDraft(labQuoteId: string): Promise<LabQuoteDraft>;
  /** Phase 10 only — gated, audited, never default-on */
  promoteToProduction?(labQuoteId: string): Promise<{ quoteHeaderId: string }>;
}
```

**MVP:** `saveLabDraft` / `getLabDraft` only. `promoteToProduction` remains unimplemented or hard-disabled.

### 7.6 `EmailDeliveryAdapter`

```ts
type LabEmailDraft = {
  caseId: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
};

interface EmailDeliveryAdapter {
  renderPreview(draft: LabEmailDraft): Promise<{ previewId: string; html: string }>;
  /** MVP: always simulates; never calls Resend/Graph */
  sendSimulated(draft: LabEmailDraft): Promise<{ simulationId: string }>;
  /** Future Outlook / Graph — opt-in */
  sendLive?(draft: LabEmailDraft): Promise<{ providerMessageId: string }>;
}
```

### 7.7 `PdfRendererAdapter`

```ts
interface PdfRendererAdapter {
  renderPreview(labQuoteId: string): Promise<{ previewUrl: string } | { html: string }>;
  /** Must not write production delivery logs or call live customer send */
}
```

**MVP:** HTML preview or isolated Puppeteer path writing only to lab storage. Do not invoke production quote-delivery send endpoints.

---

## 8. Proposed state machine

### 8.1 Why not reuse production status strings

Production already uses overlapping tokens:

- Takeoff: `needs_review`, `failed`, `processing`, `approved_for_import`, …
- Quotes: `draft`, `sent`, `archived`, …

Reusing them on a shared or adjacent table risks operator confusion and accidental query bleed. The lab uses a **dedicated column** `intake_status` with a **`qil_` prefix** (Quote Intake Lab).

### 8.2 Recommended statuses

| Status | Meaning |
|--------|---------|
| `qil_received` | Normalized email stored; case created |
| `qil_classifying` | Classifier running |
| `qil_not_quote` | Terminal / park — not a quote request |
| `qil_not_elite_100` | Terminal / park for MVP — out of Elite 100 scope |
| `qil_processing_attachments` | Attachment extract / plan detection |
| `qil_takeoff_processing` | TakeoffAdapter run in progress |
| `qil_needs_information` | Blocking missing fields; draft follow-up may exist |
| `qil_needs_manual_takeoff` | AI takeoff insufficient; human measurement required |
| `qil_ready_for_review` | Queue-visible for estimators |
| `qil_in_review` | Estimator lock / active review |
| `qil_approved_lab_quote` | Lab quote approved (not production) |
| `qil_ready_to_send_lab` | Preview communications ready; still not live send |
| `qil_sent_simulated` | Simulated outbound recorded |
| `qil_failed` | Recoverable failure; see last error |

Prompt names without `qil_` are accepted as **aliases in docs only**; persistence and APIs must use the prefixed forms.

### 8.3 Transition rules (high level)

- Forward transitions append an audit event with `actor` (`system` | user id), `from`, `to`, `reason`.
- Estimator may return `qil_in_review` → `qil_needs_information` / `qil_needs_manual_takeoff`.
- `qil_not_quote` / `qil_not_elite_100` / `qil_sent_simulated` are park/terminal for MVP.
- No transition may call production send, Monday sync, or `quote_headers` insert.

---

## 9. Proposed isolated data model

Prefer a **separate staging Supabase project**. If that is unavailable for early local work, use tables prefixed `quote_intake_lab_*` that are **never created via production migration in Phases 0–8**.

Suggested entities:

| Table | Purpose |
|-------|---------|
| `quote_intake_lab_cases` | Case header: status, org, mailbox, customer, project, confidence, missing flags |
| `quote_intake_lab_emails` | Immutable normalized email + raw pointer; thread key; hashes |
| `quote_intake_lab_attachments` | Attachment metadata + lab storage refs |
| `quote_intake_lab_extractions` | AI/heuristic field extraction versions |
| `quote_intake_lab_takeoff_runs` | Lab takeoff results + evidence |
| `quote_intake_lab_quotes` | Approved/preview lab quote documents |
| `quote_intake_lab_line_items` | Estimator custom lines (flexible description/price) |
| `quote_intake_lab_messages` | Draft / simulated outbound messages |
| `quote_intake_lab_audit_events` | Append-only AI-vs-human history |
| `quote_intake_lab_idempotency_keys` | Message-ID / content-hash uniqueness per org |

**Case field checklist (MVP requirements):**

- Original sender + recipients  
- Receiving salesperson/mailbox  
- Customer/account  
- Project name + address (nullable)  
- Subject, body, thread, attachments  
- Requested Elite 100 color  
- Resolved Elite 100 price group  
- Countertop measurements + source evidence  
- Total sf, sink cutouts, edge profile, backsplash when supplied  
- Project notes  
- AI confidence + missing-information flags  
- Custom line items  
- Price comparison across Elite 100 groups (computed preview; may be stored as snapshot JSON)  
- Complete AI-versus-human audit history  

---

## 10. Security considerations

1. **Org scope:** every query filters `organization_id` from auth context.
2. **Server-side auth:** `requireAuth()` on all lab routes; optional later `requireHeadAccess("quote_intake_lab")` when slug is registered. UI hiding is never enough.
3. **Secrets:** no service role, OpenAI/Gemini, Resend, Monday, or Moraware secrets in the head bundle. Lab AI keys stay on Brain / staging.
4. **Cross-tenant:** attachment URLs signed short-lived; no browser-direct service-role reads.
5. **Production isolation:** feature flags default off for any promote/send path; refuse when `NODE_ENV=production` unless explicit lab allowlist env is set.
6. **PII:** email bodies/attachments are sensitive — restrict head access to estimators/admins; audit access in later phases if needed.
7. **Prompt injection:** treat email body/attachments as untrusted input to classifiers and takeoff prompts.

---

## 11. Attachment handling

- Store only in **lab** bucket/prefix (staging project preferred).
- Persist content hash; dedupe by hash within case/org.
- Supported MVP types: PDF plans, common image types, files pulled from `.eml`.
- Virus/malware scanning: out of MVP; document as Phase 9+ operational requirement before live mailbox.
- Never stream production `eliteos-quote-files` objects into lab cases by default.

---

## 12. Idempotency and duplicate-email prevention

1. Prefer RFC `Message-ID` uniqueness per `organization_id`.
2. Fallback: `sha256(normalized_raw_email)` uniqueness per org.
3. Threading: same `threadKey` may create **follow-up events** on an existing case rather than a duplicate case when classifier detects reply (long-term); MVP may create linked child cases with `parent_case_id`.
4. Re-upload of identical fixture returns existing case id with `deduped: true`.

---

## 13. Original email / thread preservation

- Store immutable `raw_eml` or raw text blob + normalized JSON.
- Never overwrite original body when extraction improves — write new `extractions` versions.
- Preserve full header map for future Graph correlation.
- Estimator edits live on case/quote rows, not by mutating the email row.

---

## 14. Audit-history requirements

Append-only `quote_intake_lab_audit_events` with at least:

| Field | Notes |
|-------|-------|
| `case_id` | Required |
| `at` | ISO timestamp |
| `actor_type` | `system` / `user` / `adapter` |
| `actor_id` | User id when human |
| `event_type` | e.g. `status_changed`, `field_corrected`, `takeoff_completed`, `line_item_added`, `send_simulated` |
| `before` / `after` | JSON patches for human corrections |
| `ai_suggestion` | Optional prior AI value |
| `source` | adapter name / model id |

AI-versus-human: any estimator correction to color, group, sf, cutouts, edge, backsplash, or notes must log before/after.

---

## 15. Staging and production separation

| Concern | Policy |
|---------|--------|
| Database | Prefer separate Supabase project; else non-prod-only prefixed tables |
| Migrations | **No production migrations** in Phases 0–8 |
| Env vars | New lab-only vars (e.g. `QUOTE_INTAKE_LAB_SUPABASE_URL`) — do not overload production quote delivery flags |
| Deploy | Optional preview deploy; not part of `eos:build:all-heads` until approved |
| Launcher | No card |
| Flags | `QUOTE_INTAKE_LAB_PROMOTE_ENABLED=0`, `QUOTE_INTAKE_LAB_LIVE_EMAIL=0` hard defaults |

---

## 16. Future Outlook integration boundary

- Today: **no** Microsoft Graph client in repo; production email is Resend.
- Phase 9 implements `InboundEmailAdapter.pollMailbox` + optional `EmailDeliveryAdapter.sendLive` against Graph **only** with lab credentials / shared mailbox allowlist.
- Must not enable `QUOTE_EMAIL_SEND_ENABLED` or call `sendEstimateEmail` for lab flows.
- Customer reply correlation uses `Message-ID` / `In-Reply-To` / `References` stored on lab email rows.

---

## 17. Future Quote Library promotion boundary

Phase 10 `QuoteLibraryAdapter.promoteToProduction` (if ever enabled) must:

1. Require explicit dual control / env flag / role check.
2. Map lab quote → Internal Estimate–compatible payload **without** editing IE UI.
3. Insert via existing Brain persist path only after review checklist passes.
4. Write lab audit event with resulting `quote_header_id`.
5. Never auto-promote from AI approval alone.

Until then, estimators use lab drafts only.

---

## 18. Classification of reuse (quick reference)

| Existing piece | Classification |
|----------------|----------------|
| Pure takeoff modules | Safe read-only reuse via TakeoffAdapter |
| `app-ai-takeoff` UI | Pattern reference; do not modify for lab MVP |
| Shared Topbar / tokens / supabase auth helpers | Safe import without modification |
| `calculateQuote` | Must wrap behind PricingAdapter |
| Elite 100 catalog / fixture | Must wrap behind Elite100CatalogAdapter |
| Quote Library / `quote_headers` | Must wrap; MVP replicates lab draft store |
| PDF / Resend | Must wrap; preview/simulate only |
| Internal Estimate / Public / Partner / Custom | Do not touch |
| Monday / Moraware / QuickBooks | Do not touch |
|}
