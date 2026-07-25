# Studio end-to-end process and surface ownership audit

**Audit date:** 2026-07-24  
**Audited main commit:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`  
**Branch:** `audit/studio-end-to-end-process-and-surface-ownership`

## Purpose

Evidence-backed documentation of the Elite 100 estimating, AI Takeoff, Digital Estimate, and customer review workflow. Identifies competing state models, duplicate read models, navigation overlap, revision risks, and safe cleanup opportunities.

**No application behavior was changed in this audit.** Documentation files only.

**Follow-up (2026-07-24):** Shared Inbox Phase 1 was implemented on `feature/studio-shared-inbox` (see FEATURE_DECISIONS §178). Secure plan viewing and All Estimates remain incomplete.

## Protected golden path

Recent merged Studio fixes (ancestors of audited HEAD) include workflow sequencing (`3eaacdd`) and published-estimate reopen (`3942332`). The currently working production path is treated as protected.

## Recommended reading order

1. [STUDIO_END_TO_END_PROCESS_AUDIT.md](./STUDIO_END_TO_END_PROCESS_AUDIT.md) — process traces A–H  
2. [STUDIO_SURFACE_OWNERSHIP_MATRIX.md](./STUDIO_SURFACE_OWNERSHIP_MATRIX.md) — who owns each screen  
3. [STUDIO_STATE_AUTHORITY_MATRIX.md](./STUDIO_STATE_AUTHORITY_MATRIX.md) — field-level authority  
4. [STUDIO_ENDPOINT_READ_MODEL_MAP.md](./STUDIO_ENDPOINT_READ_MODEL_MAP.md) — APIs and read models  
5. [STUDIO_DUPLICATION_CONFLICT_REGISTER.md](./STUDIO_DUPLICATION_CONFLICT_REGISTER.md) — numbered findings  
6. [STUDIO_GOLDEN_PATH_REGRESSION_PLAN.md](./STUDIO_GOLDEN_PATH_REGRESSION_PLAN.md) — test lock  
7. [STUDIO_TARGET_OPERATING_MODEL.md](./STUDIO_TARGET_OPERATING_MODEL.md) — recommended target  
8. [STUDIO_CLEANUP_EXECUTION_PLAN.md](./STUDIO_CLEANUP_EXECUTION_PLAN.md) — sequenced branches  

## File index

| File | Contents |
|------|----------|
| `STUDIO_END_TO_END_PROCESS_AUDIT.md` | Intake → Takeoff/Manual → Calculate → Publish → Review → Revision |
| `STUDIO_SURFACE_OWNERSHIP_MATRIX.md` | Surface responsibilities and overlap |
| `STUDIO_STATE_AUTHORITY_MATRIX.md` | Canonical vs derived vs frozen vs local |
| `STUDIO_ENDPOINT_READ_MODEL_MAP.md` | Routes, services, consumers |
| `STUDIO_DUPLICATION_CONFLICT_REGISTER.md` | STUDIO-AUDIT-NNN findings |
| `STUDIO_GOLDEN_PATH_REGRESSION_PLAN.md` | Required regression scenarios |
| `STUDIO_TARGET_OPERATING_MODEL.md` | Target lifecycle and object hierarchy |
| `STUDIO_CLEANUP_EXECUTION_PLAN.md` | Phased cleanup with first branch recommendation |
