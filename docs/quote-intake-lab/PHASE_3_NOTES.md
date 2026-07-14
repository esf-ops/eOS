# Quote Intake Lab — Phase 3 notes

**Date:** 2026-07-14  
**Status:** Implemented (simulated classification + estimator review; no live AI)

## Classification contract

```
UI (ClassificationWorkspace)
   → LocalQuoteIntakeRepository.runClassification / applyCorrections / acceptClassification
       → ClassificationService
           → IntakeIntelligenceProvider.classify(request)
           → SimulatedIntakeIntelligenceProvider (deterministic rules)
       → IdbLabStore v2 (runs, snapshots, audit, overlays)
```

UI depends on the repository/provider boundary — not on simulated rules directly.

| Type | Role |
|------|------|
| `IntakeClassificationRequest` | Phase 2 normalized inputs only (no bytes) |
| `IntakeClassificationResult` | Intent, eligibility, fields, missing info, warnings |
| `IntakeClassificationRun` | Immutable history row + review state |
| `ExtractedField` + `ExtractionEvidence` | Value + proof |
| `MissingInformationItem` | Severity-tagged gaps |
| `EstimatorCorrection` | Human edits before accept |
| Reviewed snapshot | Frozen accept record (not a quote) |

Provider modes: **`simulated` only** in Phase 3.

## Extracted-field schema

Keys: `customerAccount`, `projectName`, `projectAddress`, `requestedColorText`, `elite100OrPriceGroupText`, `sinkCutoutCount`, `edgeProfile`, `backsplashDescription`, `statedSquareFootage`, `requestedTurnaround`, `salespersonMailbox`, `customerNotes`, `revisionReference`, `contactPhone`.

Unknown stays unknown. No SF calculation from dimensions. No authoritative price-group assignment.

## Evidence schema

`sourceType` ∈ subject | body | sender | recipient | attachment_filename | manual_correction  
Plus source id, excerpt, optional char range, method, confidence, human confirmed/corrected flags.

## Missing-information rules

**quote_blocking:** readable plan (filename signals only), color/price-group text, SF or plan-like attachment for future takeoff, sink count, edge.

**helpful_but_not_blocking:** customer, project name, address, sender contact.

**estimator_review:** ambiguous/unsupported plan-like attachments.

Plan “present” from filename ≠ visually read.

## State transitions (Phase 3)

- `qil_received` → `qil_classifying`
- `qil_classifying` → `qil_intake_review` | `qil_manual_review` | `qil_not_quote` | `qil_not_elite_100` | `qil_failed`
- Re-run allowed from intake/manual/not_* / failed / needs_information
- **Not** allowed: takeoff, ready-for-quote, approved, sent

New statuses: `qil_intake_review`, `qil_manual_review`.

Only the estimator **accepts** a run (frozen snapshot). Accept does not start takeoff or create a quote.

## Simulated-provider behavior

Deterministic keyword / regex rules on subject+body+filenames. Examples:

- “Need an Elite 100 estimate” → quote + elite_100_candidate
- Revision language + quote ref → quote_revision
- Quartzite / custom material → non_elite_100_candidate
- Schedule/service without quote keywords → not_quote_related
- Weak “quote” mention → unclear / manual_review
- Explicit color/edge/sinks/SF → extracted with evidence
- `kitchen-plan.pdf` → plan present_unverified warning (contents unread)

Catalog validation states are **simulated_*** / `not_checked` / `needs_human_review` — never production Elite 100 authority.

## Persistence changes

IndexedDB `quote-intake-lab-v1` upgraded **v1 → v2**:

| Store | Purpose |
|-------|---------|
| `classificationRuns` | Run history |
| `reviewedSnapshots` | Accepted frozen intake |
| `auditEvents` | Correction / accept audit |
| `caseOverlays` | Status + extracted summary for fixtures & imports |

Phase 2 cases remain readable. Clear imported deletes import artifacts only; fixture overlays/runs remain.

## Human-review requirements

- Explicit “Run simulated classification” (no auto-run)
- Confirm / edit / clear / mark unknown per field
- Human intent + Elite 100 eligibility decisions
- Accept → immutable snapshot + audit
- Raw normalized email (`importMeta`) never altered by corrections

## Known limitations

- No live Gemini / Vertex / OpenAI
- No attachment content inspection / OCR
- No takeoff / pricing
- Simulated color match ≠ catalog truth
- Fixture cases classify from subject + excerpt when full body absent

## Phase 3.1 live-AI boundary (not started)

Replace only `SimulatedIntakeIntelligenceProvider` with a **server-side** adapter that:

1. Lives under `backend-core/src/quoteIntakeLab/` (mounted only when approved)
2. Holds API keys in server env — **never** `VITE_*` / browser bundles
3. Implements the same `IntakeClassificationRequest` → `IntakeClassificationResult` contract
4. Writes runs through the same repository API
5. Remains disabled by default; no production table writes

Do not begin Phase 3.1 until this Phase 3 contract and review UX are accepted.

## Production connection confirmation

Phase 3 does **not** connect to AI providers, Outlook, Resend, Supabase, takeoff, `calculateQuote()`, Quote Library, Elite 100 production tables, or Home Launcher.
