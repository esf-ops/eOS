# Cursor active handoff (eliteOS / slabOS)

**Purpose:** Cheap context for new Cursor chats. Do not treat old chat transcripts as source of truth — use this file + `docs/eliteos/*` + `.cursor/rules/*`.

**Last updated:** 2026-05-30

---

## Active workstream: Moraware report feeds

Additive ingestion lane beside existing Moraware API sync. Combines saved-report **CSV** + rendered **HTML** identity links → validated staging → optional promotion to prepared facts. **Does not replace** API sync.

### Current status

| Area | State |
|------|--------|
| Schema | Applied manually in Supabase |
| POC parse/enrich | Done (local files, fixtures, tests) |
| Staging persistence | Validated (`SUPABASE_WRITE_ENABLED=1`) |
| Promotion | Validated **test org only**; real Elite org **not** promoted |
| Live download / scrape / cron / API routes | **Not built** |
| Dashboards reading prepared facts | **Not built** |

Full detail: [`moraware-report-feeds.md`](./moraware-report-feeds.md)

### Key IDs

| Org | `organization_id` | Feed id | Notable run id |
|-----|-------------------|---------|----------------|
| Real Elite | `89180433-9fab-4024-bec9-a14d870bd0a8` | `e8c0433a-c243-4cc5-b8bb-7842ec64a0e7` | `afc7b49d-af7a-4fec-85a0-0fdb11046ea3` (validated staging, no promotion) |
| Test org | `00000000-0000-0000-0000-000000000001` | `a053cb9a-e362-4c5a-8f47-895314cec85a` | `a660473b-b200-4d14-ba0b-5b713c475c9c` (promo smoke 1); `6d54c835-058f-47f8-a831-db8efca86a5b` (promo smoke 2, supersede) |

Sales Worksheet Facts contract: view `219`, `report_type=sales_worksheet_facts`, header hash `4e657f1f731e9fb054e0b9d8d4d6b1f586e612875d139ee33e4a083a5a6cfdb8`.

### Key commands

```bash
# Dry-run POC (no Supabase)
npm run eos:moraware:report-feed-poc

# Staging (+ optional promotion with MORAWARE_REPORT_FEED_PROMOTE=1)
npm run eos:moraware:persist-report-feed-local

# Tests
npm run eos:test:moraware-report-feed
npm run eos:test:moraware-report-feed-persistence
npm run eos:test:moraware-report-feed-promotion
npm run eos:test:moraware-report-feed-promote-persistence

# Repo sanity
npm run eos:check:local
```

Promotion gates: `SUPABASE_WRITE_ENABLED=1`, `MORAWARE_REPORT_FEED_PROMOTE=1`, run `validated`, no schema drift / ambiguous identities / duplicate row hashes.

Code: `backend-core/src/moraware/reportFeeds/`, scripts under `backend-core/src/scripts/moraware/`.

---

## Next slice (recommended)

**Governed download planning/design only** — credential vault, org-scoped Moraware Admin config, raw file retention, fetch contract, security review. No implementation until design is approved.

After that (separate slices): server-side fetch → store raw artifacts → reuse existing staging/promotion path → dashboard reads behind RLS.

---

## Do not build yet (unless explicitly requested)

- Live Moraware download automation
- Browser scraping or session/cookie handling in repo
- API routes, cloud worker cron, deployment changes for report feeds
- Dashboard reads from `moraware_prepared_sales_worksheet_facts`
- Changes to quote math, Internal Estimate, public/partner quote, Monday sync
- Replacing or breaking existing Moraware API sync
- Committing real Moraware exports, cookies, SID, or credentials
- Promoting prepared facts for real Elite org without explicit approval

---

## Safety invariants (report feeds)

- Prepared facts promoted only with `MORAWARE_REPORT_FEED_PROMOTE=1`
- Failed / `needs_review` runs must not replace latest successful prepared facts
- Old prepared facts: supersede/deactivate (`is_active`, `superseded_by`), not blind delete
- Service-role Supabase writes: backend/scripts only, gated by env flags

Durable decisions: `FEATURE_DECISIONS.md` entries **37** (additive lane) and **38** (SQL supersede semantics).

---

## Model usage (Cursor)

| Task | Model |
|------|--------|
| Docs, handoff updates, tiny script comment fixes, running local tests | Auto / cheaper default |
| Governed download, credentials/security, transaction logic, auth/RLS, quote/pricing math | Sonnet (or stronger) — review security checklist in `.cursor/rules/security-audit.mdc` |

---

## Other heads (unchanged this slice)

Quote platform, Monday sync, Moraware API worker, pricing admin — **out of scope** unless the user names them. See `docs/eliteos/SYSTEM_BLUEPRINT.md` and `docs/eliteos/eliteOS-master-head-map.md`.
