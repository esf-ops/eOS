# Moraware cloud worker runbook (Phase 1 production)

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
