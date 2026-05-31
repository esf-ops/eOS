# Cursor active handoff (eliteOS / slabOS)

**Purpose:** Cheap context for new Cursor chats. Do not treat old chat transcripts as source of truth — use this file + `docs/eliteos/*` + `.cursor/rules/*`.

**Last updated:** 2026-05-31

---

## Active workstream: Moraware report feeds

Additive ingestion lane beside existing Moraware API sync. Combines saved-report **CSV** + rendered **HTML** identity links → validated staging → optional promotion to prepared facts. **Does not replace** API sync.

### Current status

| Area | State |
|------|--------|
| Schema | Applied manually in Supabase |
| POC parse/enrich | Done (local files, fixtures, tests) |
| Staging persistence | Validated (`SUPABASE_WRITE_ENABLED=1`) |
| API mirror identity enrichment | **Built** — `enrichRunFromApiMirror` + CLI; dry-run default; exact account+job match only; no fuzzy |
| Promotion | Validated **test org only**; real Elite org **not** promoted |
| Governed download design (Phase A) | **Documented** — see [`moraware-report-feeds.md` § Governed download design](./moraware-report-feeds.md#governed-download-design-phase-a--docs-only) |
| Live download / scrape / cron / API routes | **Not built** |
| Dashboards reading prepared facts | **Not built** |

Full detail: [`moraware-report-feeds.md`](./moraware-report-feeds.md)

### Key IDs

| Org | `organization_id` | Feed id | Notable run id |
|-----|-------------------|---------|----------------|
| Real Elite | `89180433-9fab-4024-bec9-a14d870bd0a8` | `e8c0433a-c243-4cc5-b8bb-7842ec64a0e7` | `afc7b49d` (validated staging, no promotion); `cb765461` (failed — schema drift + identity-link dupe; prompted 76-col hardening) |
| Test org | `00000000-0000-0000-0000-000000000001` | `a053cb9a-e362-4c5a-8f47-895314cec85a` | `a660473b-b200-4d14-ba0b-5b713c475c9c` (promo smoke 1); `6d54c835-058f-47f8-a831-db8efca86a5b` (promo smoke 2, supersede) |

Sales Worksheet Facts contract: view `219`, `report_type=sales_worksheet_facts`, header hash `8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade` (76-column real Moraware export — full shape including activity/CS/install columns, no Branch — hardened 2026-05-30). Columns 1–15 + col 76 mapped to prepared facts; cols 16–75 raw_row only.

### Key commands

```bash
# Dry-run POC (no Supabase)
npm run eos:moraware:report-feed-poc

# Staging (+ optional promotion with MORAWARE_REPORT_FEED_PROMOTE=1)
npm run eos:moraware:persist-report-feed-local

# Post-hoc API mirror enrichment (dry-run first, then --apply)
npm run eos:moraware:enrich-report-run-api-mirror
npm run eos:moraware:enrich-report-run-api-mirror -- --apply  # add SUPABASE_WRITE_ENABLED=1

# Tests
npm run eos:test:moraware-report-feed
npm run eos:test:moraware-report-feed-persistence
npm run eos:test:moraware-api-mirror-enrichment
npm run eos:test:moraware-report-feed-promotion
npm run eos:test:moraware-report-feed-promote-persistence

# Repo sanity
npm run eos:check:local
```

Promotion gates: `SUPABASE_WRITE_ENABLED=1`, `MORAWARE_REPORT_FEED_PROMOTE=1`, run `validated`, no schema drift / ambiguous identities / duplicate row hashes.

Code: `backend-core/src/moraware/reportFeeds/`, scripts under `backend-core/src/scripts/moraware/`.

---

## Next slice (recommended)

**Phase A complete (2026-05-30):** Governed download design contract is in [`moraware-report-feeds.md`](./moraware-report-feeds.md#governed-download-design-phase-a--docs-only). No fetch code yet.

**Staging hardening complete (2026-05-30):** 76-column real contract in place; identity-link dedup fixed; error serialization improved. **Manual Supabase UPDATE required** — update the Elite and test org `moraware_report_feeds` rows to `expected_column_hash = '8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade'` before the next staging run.

**HTML pagination finding (2026-05-30):** The saved view 219 HTML (`/sys/report/?view=219`) is paginated by Moraware — only **22 job links + 4 account links** visible, vs 6,986 CSV rows. HTML identity enrichment is intentionally best-effort. High `needs_identity_review` counts are expected and normal until a full-coverage identity source is wired (true all-pages HTML, Moraware API mirror, or Account Mapping). This does not block staging. Do not attempt to solve HTML pagination in the current slice.

**API mirror enrichment built (2026-05-31):** `enrichRunFromApiMirror` + CLI implemented. Uses `brain_moraware_jobs` as full-coverage identity source after HTML-only staging. Dry-run default; exact account+job match only; no fuzzy matching; never touches promoted runs or prepared facts.

**Next immediate steps:**

1. Update `expected_column_hash` in Supabase for Elite org feed (if not yet done — hash: `8e12bfb5…`).
2. Re-run `persistReportFeedLocal.js` for the current real Elite CSV+HTML to get a fresh run ID.
3. Dry-run enrichment: `MORAWARE_REPORT_RUN_ID=<new-run-id> ... npm run eos:moraware:enrich-report-run-api-mirror`
4. Review dry-run output (eligible, would-match, would-ambiguous counts).
5. Apply: add `SUPABASE_WRITE_ENABLED=1 ... -- --apply`
6. Review new run counts — if `matched_identity_count` is acceptable for the intended analytics, consider promotion (separate decision).

**Phase B (governed download — still pending):**

1. Verify Moraware login mechanics manually — use [`moraware-login-mechanics-checklist.md`](./moraware-login-mechanics-checklist.md) (browser/network only; no fetch code yet).
2. If feasible: implement `fetchReportFeedArtifacts` (network-only) → existing `processReportFeedLocal` → `persistReportFeedRun` path.
3. If not feasible: document findings; do **not** add headless browser without separate threat-model approval.

Use **Sonnet** for credential/session/fetch work. Still no cron, API routes, dashboards, or Elite org promotion.

Later slices (separate approval): raw artifact storage decision → scheduled worker → dashboard reads behind RLS.

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

Durable decisions: `FEATURE_DECISIONS.md` entries **37** (additive lane), **38** (SQL supersede semantics), **39** (governed download v1 contract), **40** (Option B real export shape, Branch deferred), **41** (76-column full contract, identity-link dedup, error serialization hardening), **42** (HTML identity is best-effort; view 219 HTML is paginated; full identity deferred), **43** (API mirror enrichment: exact match, dry-run default, no promotion).

---

## Model usage (Cursor)

| Task | Model |
|------|--------|
| Docs, handoff updates, tiny script comment fixes, running local tests | Auto / cheaper default |
| Governed download, credentials/security, transaction logic, auth/RLS, quote/pricing math | Sonnet (or stronger) — review security checklist in `.cursor/rules/security-audit.mdc` |

---

## Other heads (unchanged this slice)

Quote platform, Monday sync, Moraware API worker, pricing admin — **out of scope** unless the user names them. See `docs/eliteos/SYSTEM_BLUEPRINT.md` and `docs/eliteos/eliteOS-master-head-map.md`.
