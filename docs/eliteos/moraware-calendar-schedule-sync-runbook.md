# Moraware calendar schedule sync runbook (Install Dashboard)

Daily automated fetch → stage → promote for Moraware **view 222** (`calendar_schedule_rows`).

**Architecture:** DigitalOcean worker runs the sync script from this Git repo. Supabase is the source of truth for Install Dashboard reads. **No Moraware writeback.** Failed syncs do **not** wipe existing active schedule rows.

---

## What runs

Report exports (`/sys/report/?view=222…`) require **Moraware web session cookies** from a form login. The XML API `sessionId` alone does **not** authorize CSV/HTML export URLs.

| Step | Module |
|------|--------|
| 1. Web login + cookie jar | `morawareWebSession.js` (`establishMorawareWebSession`) |
| 2. Fetch CSV + HTML | `fetchReportFeedArtifacts.js` (GET with `Cookie` header) |
| 3. Parse + stage | `processReportFeedLocal` → `persistReportFeedRun` |
| 4. Promote | `promoteCalendarScheduleRowsFromRun` (`--apply`, replace-before-insert) |

**Manual / timer command:**

```bash
npm run eos:moraware:sync-calendar-schedule
```

**Wrapper (production VM):**

```bash
/opt/eliteos/eOS/deploy/moraware-worker/run-calendar-schedule-sync.sh
```

**Schedule:** daily **4:30 AM US Central** via `eliteos-calendar-schedule-sync.timer`.

---

## Required env vars (`/etc/eliteos/moraware-worker.env`)

Never commit this file. Never log secret values.

| Variable | Purpose |
|----------|---------|
| `MORAWARE_API_URL` | Moraware XML API endpoint (same as Brain worker) |
| `MORAWARE_USERNAME` | Moraware login |
| `MORAWARE_PASSWORD` | Moraware login |
| `MORAWARE_ACCOUNT_ID` | Optional; same as Brain worker if required |
| `MORAWARE_WEB_BASE_URL` | Optional override for web UI origin used for form login + report GET (derived from `MORAWARE_API_URL` when omitted) |
| `MORAWARE_DEFAULT_ORGANIZATION_ID` | eliteOS org UUID |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (worker only) |
| `SUPABASE_WRITE_ENABLED=1` | Required for staging + promotion writes |

Optional:

| Variable | Purpose |
|----------|---------|
| `MORAWARE_REPORT_VIEW_ID` | Default `222` |
| `MORAWARE_CALENDAR_SCHEDULE_ARTIFACT_DIR` | Debug snapshot directory (default: `debug/moraware/scheduled-runs/calendar-schedule`) |
| `MORAWARE_CALENDAR_SCHEDULE_ALLOW_EMPTY` | Set `1` only for intentional empty promote (not for production timer) |

`BACKEND_URL` is **not** required for this job (direct Supabase writes).

---

## DigitalOcean setup (one-time)

```bash
# On the worker VM as root/sudo
cd /opt/eliteos/eOS
sudo git pull
sudo -u eliteos npm install

# Ensure /etc/eliteos/moraware-worker.env includes Supabase vars + SUPABASE_WRITE_ENABLED=1
sudo chmod +x /opt/eliteos/eOS/deploy/moraware-worker/run-calendar-schedule-sync.sh

sudo cp deploy/moraware-worker/systemd/eliteos-calendar-schedule-sync.service /etc/systemd/system/
sudo cp deploy/moraware-worker/systemd/eliteos-calendar-schedule-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eliteos-calendar-schedule-sync.timer
```

Verify feed row exists in Supabase (`moraware_report_feeds`):

- `report_type = calendar_schedule_rows`
- `moraware_view_id = 222`
- `expected_column_hash = null`

Apply table SQL if needed: `backend-core/supabase/eliteos_moraware_calendar_schedule.sql`

---

## Manual trigger

```bash
cd /opt/eliteos/eOS
sudo -u eliteos bash -lc 'source /etc/eliteos/moraware-worker.env && export SUPABASE_WRITE_ENABLED=1 && npm run eos:moraware:sync-calendar-schedule'
```

Or:

```bash
sudo -u eliteos /opt/eliteos/eOS/deploy/moraware-worker/run-calendar-schedule-sync.sh
```

---

## Logs and status

```bash
# Timer status + next run
systemctl status eliteos-calendar-schedule-sync.timer
systemctl list-timers --all | grep calendar-schedule

# Last service run
systemctl status eliteos-calendar-schedule-sync.service

# Recent logs (last 200 lines)
journalctl -u eliteos-calendar-schedule-sync.service -n 200 --no-pager

# Appended log file
tail -n 200 /var/log/eliteos/calendar-schedule-sync.log
```

Debug artifacts (CSV/HTML/summary JSON per run):

```bash
ls -lt /opt/eliteos/eOS/debug/moraware/scheduled-runs/calendar-schedule | head
```

---

## Supabase verification SQL

**Latest calendar schedule report runs:**

```sql
select
  r.id,
  r.status,
  r.started_at,
  r.finished_at,
  r.row_count,
  f.report_type,
  f.moraware_view_id
from moraware_report_runs r
join moraware_report_feeds f on f.id = r.report_feed_id
where f.report_type = 'calendar_schedule_rows'
order by r.started_at desc
limit 10;
```

**Active promoted schedule rows (counts by date):**

```sql
select
  calendar_date,
  count(*) as active_stops
from moraware_calendar_schedule_rows
where is_active = true
group by calendar_date
order by calendar_date desc
limit 30;
```

**Duplicate check (should return zero rows):**

```sql
select
  calendar_date,
  scheduled_start_time,
  truck_or_crew_name,
  activity_type,
  job_name,
  count(*) as duplicate_count
from moraware_calendar_schedule_rows
where is_active = true
group by 1, 2, 3, 4, 5
having count(*) > 1;
```

---

## Failure behavior

| Failure | Active schedule rows | Run marked promoted |
|---------|----------------------|---------------------|
| Moraware fetch/auth error | Unchanged | No |
| Schema drift (missing core columns) | Unchanged | No (staged as `needs_review` only) |
| Promotion error / zero stops | Unchanged | No |
| Successful promotion | Replaced for affected dates only | Yes |

Install Dashboard remains **read-only**; it reads `moraware_calendar_schedule_rows` only.

---

## After deploy (routine)

```bash
cd /opt/eliteos/eOS
git pull
npm install
sudo systemctl restart eliteos-calendar-schedule-sync.timer
```

Optional manual verification run after `git pull`:

```bash
sudo -u eliteos /opt/eliteos/eOS/deploy/moraware-worker/run-calendar-schedule-sync.sh
```
