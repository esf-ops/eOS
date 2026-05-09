# Titan Pulse — Operational sync cadence plan

Executive **“Are the Titans Flowing?”** reads **`GET /api/titans/today`** directly from Supabase Brain tables. Frontend polling discovers **already-ingested Moraware signals** — it cannot invent fresh shop-floor rows that never reached the Brain.

This document aligns sync expectations with Eric’s expectation of **paper-list immediacy**.

---

## 1. Why nightly sync alone falls short for Eric’s live Titan view

- **Eric’s Titan list evolves intraday.** Nightly snapshots can be **hours stale** vs current Moraware statuses.
- Pace metrics (**average minutes between Moraware completion signals**) are **meaningless** if completions happened on the floor minutes ago but ingest only refreshed overnight.
- The widget’s **freshness pill** (**Fresh / Aging / Stale**) is driven by **`brain_sync_runs.finished_at`** timestamps — stale rows erode exec trust immediately.

Nightlies remain essential for bulk history, remediation, worksheet reconciliation, and **failed-job backlog** retries — just not sufficient for pulse trust.

---

## 2. Recommended recent operational Brain sync cadence

**During production windows:** ingest **recent operational batches every 5–15 minutes.**

This matches the echoed product string surfaced in dashboards:

> *“For live Titan review, run recent operational sync every 5–15 minutes during production hours.”*

This is **operational governance**, not a substitute for stakeholder validation versus Eric’s paper checklist.

Starter automation (dev/staging only until tuned):

```bash
npm run eos:sync:recent-operational
```

The script deliberately caps ingestion breadth (`MORAWARE_MAX_JOBS_TO_INGEST=100`, bounded search paging) — **do not elevate it to multi-hundred-page global pulls on a cron without capacity review.**

---

## 3. Frontend polling vs backend sync

| Layer | Responsibility |
| --- | --- |
| **Executive browser polling (~30 s)** | Hits `/api/titans/today` for **whatever is already in Brain** · never calls Moraware |
| **Recent operational sync job** | **Refreshes** Brain tables (`brain_job_activities`, operational summaries, etc.) Moraware-side |
| **Nightly heavy sync / retries** | Reconciles full windows, heals drift, clears failed-job backlog |

Think: **polling = read thermometer · sync job = replenish coolant.**

See also: `docs/TITANS_TODAY_DATA_DISCOVERY.md` (+ `debug=1` mapping envelope).

---

## 4. Proposed schedules (conceptual · not enforced in code yet)

| Window | Operational cadence | Notes |
| --- | --- | --- |
| **Shop hours (~6 am–8 pm local placeholder)** | **Every 5–10 minutes** | Prioritize freshness for Titan Pulse + Executive trust |
| **Off-hours / weekends** | **Every 30–60 minutes** or **paused** depending on SLA & Moraware etiquette | Lower traffic; avoids redundant churn |
| **Nightly anchor** | **Full global/year sync + automated failed-job retries** | Data completeness + housekeeping |

Exact windows should be nailed down with Ops + Elite leadership — geography and Moraware SLA matter.

---

## 5. Risks & mitigation

| Risk | Mitigation sketch |
| --- | --- |
| **Moraware rate limits / undue load** | Keep recent windows **small batches**, backoff on errors, exponential retry for throttles |
| **Hosting timeouts (incl. Vercel-ish limits if API triggers sync)** | Never run full `MORAWARE_MAX_SEARCH_PAGES=400` inside short HTTP timers — offload to persistent worker (`spawn`/`queue`) guarded by **`eos_sync_locks`** semantics |
| **Lock contention (`moraware_global_sync` vs operational passes)** | One writer at a time; queue jobs; surfaced in Brain Health + logs |
| **Partial sync footprints** | Mark runs `partial_error`, surface unresolved failed jobs sampling, degrade Executive trust messaging instead of hallucinating completions |

**Production recommendation:** run sync cadence from a lock-aware worker (systemd cron, ECS scheduled task, Supabase cron HTTP hit to internal runner, etc.), not brittle long-lived SSH sessions.

---

## 6. Next implementation hooks (beyond this document)

1. Operational cron wiring for **`eos:sync:recent-operational`** (or infra-specific analogue).
2. Metrics / alerts on freshness label **Stale** sustained > SLA.
3. Eric validation checklist closure (`docs/TITANS_TODAY_DATA_DISCOVERY.md` § “Validation with Eric’s paper list”).

---

*Companion docs:* `docs/TITANS_TODAY_DATA_DISCOVERY.md`, Brain Health Titan Pulse freshness card (`app-brain-health`).

