# Moraware cloud worker runbook (Phase 1 production)

> **Current production host is the Mac mini, not a cloud VM** (FEATURE_DECISIONS §344). See [Mac mini production host](#mac-mini-production-host) below. The Ubuntu VM sections remain as the documented alternative deploy target.

This runbook describes how to run the **Moraware → Sales Dashboard** scheduled pipeline on a small **always-on Ubuntu cloud VM**. It is the **production** replacement for scheduling on a developer MacBook.

**Architecture rule:** The VM is a **deploy target only**, not a second codebase. All sync logic lives in this Git repo (`npm run eos:moraware:run-scheduled-pipeline`). The VM stores only a repo checkout, secrets outside Git, scheduler config, and logs.

| Component | Role |
|-----------|------|
| **Cloud VM worker** | Generate `baseline_2026` snapshot locally; POST chunked import + rebuild to backend |
| **Vercel backend** | API receiver only (`/api/internal/moraware-sync/import`, `/api/internal/moraware-sync/rebuild-prepared-facts`) |
| **Supabase** | Source of truth (`moraware_sync_runs`, mirror tables, prepared facts) |
| **Sales Dashboard** | Reads prepared facts only |
| **System Admin** | Sync health / diagnostics |

**Do not:**

- Run the full Moraware pull or hundreds of chunks **inside Vercel cron/serverless**
- Edit Moraware sync logic **only on the VM** (changes must be committed, pushed, and `git pull` on the worker)
- Put secrets in Git, cron lines, or wrapper scripts
- Put resume variables in the normal nightly cron/env file
- Paste large inline env blocks into crontab

**Related repo files:**

- Pipeline: `backend-core/src/scripts/moraware/runScheduledMorawarePipeline.js`
- Env template: `deploy/moraware-worker/moraware-worker.env.example`
- Wrapper: `deploy/moraware-worker/run-moraware-worker.sh`
- Cron example: `deploy/moraware-worker/crontab.example`
- Optional systemd: `deploy/moraware-worker/systemd/`
- Scheduling overview: `backend-core/SCHEDULING.md`

## Mac mini production host

| Item | Value |
|------|-------|
| Checkout | `/Users/chrishenely/eOS-worker` |
| Secrets | `/Users/chrishenely/.eliteos/moraware-worker.env` (outside Git) |
| Hourly | LaunchAgent `com.eliteos.moraware-incremental` → `deploy/moraware-worker/run-moraware-incremental.sh` (plist is **not** in the repo) |
| Nightly | LaunchAgent `com.eliteos.moraware-nightly` (01:30 America/Chicago, `RunAtLoad=false`) → `run-moraware-nightly-macos.sh` → `run-moraware-worker.sh` (incl. View 219) |
| Logs | `~/Library/Logs/eliteOS/` |
| Lock | `eos_sync_locks.lock_name = moraware_population` (shared by both jobs) |

Do not add a crontab, a second worker host, or a second copy of either job.

### Reboot behavior (important)

Both jobs are **LaunchAgents** in `~/Library/LaunchAgents`, which load into the `gui/<uid>` domain **only after that user logs in**. After a restart that stops at the login window (or a FileVault unlock screen), neither job runs. `StartCalendarInterval` runs missed while the agent was unloaded are not replayed. A powered-on Mac mini is therefore not proof the feed is running.

**Approved fix (2026-10-05, §395): convert both jobs to LaunchDaemons** that run as the worker user and start at boot without a login. Run on the Mac mini as the worker user:

```bash
cd ~/eOS-worker && git pull --ff-only
deploy/moraware-worker/convert-macos-agents-to-daemons.sh          # dry run: prints program/schedule per job
deploy/moraware-worker/convert-macos-agents-to-daemons.sh --apply  # sudo; installs daemons, boots out agents
sudo launchctl print system/com.eliteos.moraware-incremental | grep -E 'state|runs|last exit'
```

The script converts the plists already installed in `~/Library/LaunchAgents`, so the hourly job keeps its exact schedule. It adds only `UserName`, `GroupName` and `HOME`, boots out each agent before loading its daemon, and backs up the agent plists to `~/.eliteos/launchagent-backup/`. `--rollback` restores the agents. After converting, `install-macos-nightly-launchagent.sh` refuses to run so a second copy can't be created.

**Reboot test:** restart the Mac mini, do **not** log in, wait one hourly interval, then confirm a new production run (`moraware_sync_runs` / the stale-feed check). Until that passes, reboot survival is unverified.

Once converted, use `sudo launchctl print system/<label>` in the checks below instead of `gui/$(id -u)/<label>`.

### Checks when the stale-feed alert fires

Run on the Mac mini as the worker user:

```bash
# 1. Uptime / reboot / who is logged in
sysctl -n kern.boottime; last reboot | head -3; who

# 2. Are the agents loaded in this user's GUI domain? ("Could not find service" = not loaded)
launchctl print gui/$(id -u)/com.eliteos.moraware-incremental | grep -E 'state|runs|last exit|path ='
launchctl print gui/$(id -u)/com.eliteos.moraware-nightly    | grep -E 'state|runs|last exit|path ='
ls -la ~/Library/LaunchAgents/com.eliteos.*
plutil -p ~/Library/LaunchAgents/com.eliteos.moraware-incremental.plist   # RunAtLoad / StartInterval / KeepAlive

# 3. Reboot persistence prerequisites
fdesetup status
sudo defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo "no auto-login"
pmset -g | grep -E 'sleep|autorestart|womp'

# 4. Logs (newest first)
ls -lt ~/Library/Logs/eliteOS/ | head
tail -n 80 ~/Library/Logs/eliteOS/moraware-*.log
log show --last 6h --predicate 'eventMessage CONTAINS "com.eliteos.moraware"' | tail -n 40

# 5. Runtime dependencies the wrappers assume
ls -la /usr/local/bin/npm $(command -v node)   # incremental wrapper hard-codes /usr/local/bin/npm
test -f ~/.eliteos/moraware-worker.env && echo "env file present"
git -C ~/eOS-worker log -1 --oneline
curl -sS -o /dev/null -w 'brain %{http_code}\n' https://api.eliteosfab.com/api/health
```

If an agent is not loaded, load the **existing** one (not a copy): `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.eliteos.moraware-incremental.plist`, then `launchctl kickstart -p gui/$(id -u)/com.eliteos.moraware-incremental` for one supervised run.

### Confirming recovery (production, not the host)

The feed is healthy only when production shows it: a new `moraware_sync_runs` row (`mode = incremental-worker-import`, `status = success`), `organization_integration_configs.moraware_incremental_cursor.config.cursor.last_success_at` advancing, and `brain_moraware_jobs.updated_at` moving. The Brain stale-feed check (`/api/internal/integration-feeds/stale-check`, hourly Vercel Cron) reports each of these.

### Catch-up after a long outage

- The hourly incremental resumes its creation window from `cursor.advanced_to − 1h`, so after a 30-day gap the first run scans the whole gap. If creation candidates + the 100-job rolling batch exceed the live ceiling (default 150), it stops with `LIVE_CANDIDATE_CEILING_EXCEEDED` (no silent truncation). The stale-feed alert reports that as "running but failing".
- Existing-job changes are caught by the rolling refresh (100 jobs/run ≈ 41 runs for ~4,100 jobs).
- **Known defect (2026-10-05 audit):** from 2026-08-18 to 2026-09-02, 332 incremental runs reported `creation_window_candidates = 0`, and the newest `created_at_source` in `brain_moraware_jobs` is 2026-08-17. New Moraware jobs were not being discovered even before the outage. The `moraware_new_jobs` signal in the stale-feed check monitors this independently of run success. Resolve before trusting job counts.

---

## Recommended VM size

| Resource | Recommendation | Why |
|----------|----------------|-----|
| vCPU | **2** | Moraware HTTP discovery + JSON snapshot (~400MB) |
| RAM | **4 GB** | Node snapshot generation + chunked import client |
| Disk | **60–80 GB** | Repo, `node_modules`, snapshot JSON, JSONL logs, log rotation headroom |
| OS | **Ubuntu 22.04 or 24.04 LTS** | Provider-neutral; well-supported Node packages |

Typical supervised live run: **~60–90 minutes** (example: 2683 jobs, 436 chunks, ~82 minutes).

---

## Provider notes (provider-neutral core + two examples)

### Any provider

1. Create an Ubuntu VM with the size above.
2. Attach a static egress IP if your Moraware allowlist requires it.
3. Restrict SSH to operator IPs (security group / firewall).
4. No inbound ports required for the pipeline (outbound HTTPS only).

### DigitalOcean

- **Droplet:** Basic, **2 vCPU / 4 GB**, Ubuntu LTS, region closest to Moraware/backend.
- Enable **backups** optional; pipeline is reproducible from repo + env.
- Use **Cloud Firewall**: allow SSH from office IP; deny all inbound else.

### AWS Lightsail

- **Instance:** **$24–$32/mo class** (2 vCPU, 4 GB) or equivalent bundle.
- Attach **static IP**; note it for Moraware/network allowlists if used.
- Use instance firewall: SSH only from trusted CIDR.

---

## Initial VM setup

Run as root or with `sudo` unless noted.

### 1. Base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates build-essential
```

### 2. Node.js (22 LTS recommended)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x
npm -v
```

Repo requires Node **>= 18.18** (`package.json`); Node 22 LTS is recommended for long-lived workers.

### 3. Service user and directories

```bash
sudo useradd -m -s /bin/bash eliteos || true
sudo mkdir -p /opt/eliteos /etc/eliteos /var/log/eliteos
sudo chown eliteos:eliteos /opt/eliteos /var/log/eliteos
sudo chmod 750 /etc/eliteos
```

### 4. Clone repo (deploy target checkout)

```bash
sudo -u eliteos git clone https://github.com/YOUR_ORG/eOS.git /opt/eliteos/eOS
cd /opt/eliteos/eOS
sudo -u eliteos npm install
```

Use your real Git remote and branch. Production checkout path: **`/opt/eliteos/eOS`** (or `/home/eliteos/eOS` — stay consistent in cron/wrapper).

### 5. Secrets env file (outside Git)

```bash
sudo cp /opt/eliteos/eOS/deploy/moraware-worker/moraware-worker.env.example /etc/eliteos/moraware-worker.env
sudo chmod 600 /etc/eliteos/moraware-worker.env
sudo chown eliteos:eliteos /etc/eliteos/moraware-worker.env
```

Edit with real values (never commit this file):

```bash
sudo -u eliteos nano /etc/eliteos/moraware-worker.env
```

Required keys: see `deploy/moraware-worker/moraware-worker.env.example` and `docs/EOS_ENV_VARS.md`.

**Backend (Vercel)** must have matching `MORAWARE_SYNC_IMPORT_SECRET` / `EOS_CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`.

### 6. Wrapper script permissions

```bash
chmod +x /opt/eliteos/eOS/deploy/moraware-worker/run-moraware-worker.sh
```

---

## Testing on the VM

All tests run **as `eliteos`**, from repo root or via wrapper.

### Dry-run (safe — no HTTP import, no rebuild)

Temporarily set in `/etc/eliteos/moraware-worker.env`:

```bash
MORAWARE_IMPORT_DRY_RUN=1
```

Run:

```bash
sudo -u eliteos /opt/eliteos/eOS/deploy/moraware-worker/run-moraware-worker.sh
```

**Expect:**

- Import child: `Moraware import dry-run complete: no HTTP requests were sent.`
- Runner JSONL: `pipeline_dry_run_complete` with `import_executed: false`, `rebuild_executed: false`
- **No** `rebuild_start`, `rebuild_complete`, or `pipeline_success`
- Console banner stating no import/rebuild ran
- Exit code **0**

Structured logs: `/opt/eliteos/eOS/debug/moraware/scheduled-runs/*.jsonl` (git-ignored path in repo).

Set `MORAWARE_IMPORT_DRY_RUN=0` before live run.

### Supervised live run (once, before enabling cron)

```bash
# Ensure MORAWARE_IMPORT_DRY_RUN=0 in /etc/eliteos/moraware-worker.env
sudo -u eliteos /opt/eliteos/eOS/deploy/moraware-worker/run-moraware-worker.sh \
  2>&1 | tee -a /var/log/eliteos/moraware-supervised-live.log
```

**Expect (~60–90 min):**

- New `import_group_id` in logs
- `pipeline_success` with `jobs_scanned`, `facts_upserted`, `account_rollups_upserted`
- Example scale: ~2600+ jobs, ~430+ chunks

---

## Verification (System Admin + Sales Dashboard)

After a successful live run:

1. **System Admin → Moraware → Sync Health**  
   - `health_status`: healthy (or understood warnings)  
   - Recent `sync_freshness_seconds`  
   - Latest chunk group complete  

2. **System Admin → Prepared Facts**  
   - `freshness`: **fresh**  
   - Source group matches latest complete import  

3. **Sales Dashboard**  
   - Sync banner: recent last success, complete chunk group  
   - Sq.Ft. / KPI panels load from prepared facts  

4. **Optional API** (admin session): `GET /api/admin/moraware/health`

---

## Enable nightly schedule

### Phase 1 recommendation: **cron + wrapper**

Cron is simpler for Phase 1: one line, easy to disable, familiar ops. The wrapper keeps cron free of secrets and business logic.

**Install crontab for `eliteos`:**

```bash
sudo -u eliteos crontab -e
```

Paste from `deploy/moraware-worker/crontab.example` (default **1:30 AM America/Chicago**):

```cron
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
30 1 * * * TZ=America/Chicago /opt/eliteos/eOS/deploy/moraware-worker/run-moraware-worker.sh >> /var/log/eliteos/moraware-nightly.log 2>&1
```

Verify:

```bash
sudo -u eliteos crontab -l
```

### Optional: systemd timer

Templates: `deploy/moraware-worker/systemd/`. Use if your org standardizes on systemd timers.

```bash
sudo cp deploy/moraware-worker/systemd/moraware-worker.service /etc/systemd/system/
sudo cp deploy/moraware-worker/systemd/moraware-worker.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now moraware-worker.timer
sudo systemctl list-timers | grep moraware
```

**Do not enable both cron and systemd** for the same pipeline.

---

## Disable nightly schedule

### Cron

```bash
sudo -u eliteos crontab -e
# Delete or comment the moraware line, save
```

Or:

```bash
sudo -u eliteos crontab -r   # removes entire crontab — only if dedicated to this job
```

### systemd

```bash
sudo systemctl disable --now moraware-worker.timer
```

Pipeline stops scheduling; Vercel/Supabase keep last successful data.

---

## Failure recovery (chunk resume)

If import fails mid-group (e.g. chunk 200 of 436):

1. **Do not** regenerate snapshot.  
2. **Do not** add resume vars to nightly cron or `/etc/eliteos/moraware-worker.env` permanently.  
3. Run **one manual recovery** with the same chunk env as the failed run:

```bash
sudo -u eliteos bash -lc '
  set -a
  source /etc/eliteos/moraware-worker.env
  set +a
  export MORAWARE_PIPELINE_SKIP_GENERATE=1
  export MORAWARE_IMPORT_RESUME_GROUP_ID="<import_group_id from JSONL log>"
  export MORAWARE_IMPORT_START_CHUNK_INDEX=<failed_chunk_index>
  cd /opt/eliteos/eOS
  npm run eos:moraware:run-scheduled-pipeline
'
```

Import script also prints a suggested resume command on failure. After the group completes, the runner calls rebuild automatically (live mode only).

---

## Updating code on the worker (normal process)

**All Moraware sync changes belong in the repo** — commit, push, then pull on the VM:

```bash
sudo -u eliteos bash -lc '
  cd /opt/eliteos/eOS
  git fetch origin
  git checkout main
  git pull origin main
  npm install
'
```

If sync **code** changed, run a **dry-run** before the next cron night:

```bash
# MORAWARE_IMPORT_DRY_RUN=1 temporarily in env, or:
sudo -u eliteos bash -lc '
  set -a; source /etc/eliteos/moraware-worker.env; set +a
  export MORAWARE_IMPORT_DRY_RUN=1
  cd /opt/eliteos/eOS
  npm run eos:moraware:run-scheduled-pipeline
'
```

Then restore `MORAWARE_IMPORT_DRY_RUN=0`.

**Never** patch `runScheduledMorawarePipeline.js` or import logic only on the VM.

---

## Logs and rotation

| Location | Contents |
|----------|----------|
| `debug/moraware/scheduled-runs/*.jsonl` | Structured pipeline events (in repo checkout; git-ignored) |
| `/var/log/eliteos/moraware-nightly.log` | Cron/systemd stdout/stderr aggregate |

Check recent run:

```bash
ls -lt /opt/eliteos/eOS/debug/moraware/scheduled-runs/ | head
tail -100 /var/log/eliteos/moraware-nightly.log
```

**Logrotate example** (`/etc/logrotate.d/eliteos-moraware`):

```
/var/log/eliteos/moraware-nightly.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
```

Prune old JSONL periodically (e.g. keep 30 days) — snapshots and logs can be large.

---

## What not to do

| Don't | Do instead |
|-------|------------|
| Schedule full pipeline on Vercel cron | Cloud VM worker + Vercel API receiver |
| Keep production schedule on a MacBook | Ubuntu VM + cron/wrapper |
| Store secrets in Git or crontab | `/etc/eliteos/moraware-worker.env` mode 600 |
| Edit sync logic only on VM | Change repo → pull on VM |
| Put resume vars in nightly cron | One-off manual recovery shell |
| Change chunk env mid-group | Same chunk sizing for resume |
| Commit `debug/` snapshots | Already git-ignored |

---

## Checklist summary

- [ ] VM provisioned (2 vCPU / 4 GB / 60–80 GB, Ubuntu LTS)
- [ ] Node 22 + git + repo clone under `/opt/eliteos/eOS`
- [ ] `npm install` completed
- [ ] `/etc/eliteos/moraware-worker.env` created from example (600 perms)
- [ ] Vercel backend secrets aligned
- [ ] Dry-run passes (`pipeline_dry_run_complete`, no rebuild)
- [ ] Supervised live run passes (`pipeline_success`)
- [ ] System Admin + Sales Dashboard verified
- [ ] Cron or systemd timer enabled (not both)
- [ ] Log directory + rotation configured
