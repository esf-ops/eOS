#!/usr/bin/env bash
# Convert the Mac mini Moraware LaunchAgents into LaunchDaemons so they start at boot
# without a GUI login (approved 2026-10-05; FEATURE_DECISIONS §395).
#
# Converts the plists that are INSTALLED in ~/Library/LaunchAgents — it does not use a repo
# template — so each job keeps its exact program, schedule, environment and log paths.
# Only adds UserName/GroupName/HOME so the job still runs as the worker user.
#
# Exactly one copy of each job exists afterwards: the agent is booted out and its plist is
# moved to a backup only after the daemon is verified loaded.
#
# Usage (on the Mac mini, as the worker user; prompts for sudo):
#   deploy/moraware-worker/convert-macos-agents-to-daemons.sh            # dry run (default)
#   deploy/moraware-worker/convert-macos-agents-to-daemons.sh --apply
#   deploy/moraware-worker/convert-macos-agents-to-daemons.sh --rollback

set -euo pipefail

LABELS=("com.eliteos.moraware-incremental" "com.eliteos.moraware-nightly")
WORKER_USER="$(id -un)"
WORKER_UID="$(id -u)"
WORKER_GROUP="$(id -gn)"
WORKER_HOME="${HOME}"
AGENT_DIR="${WORKER_HOME}/Library/LaunchAgents"
DAEMON_DIR="/Library/LaunchDaemons"
BACKUP_DIR="${WORKER_HOME}/.eliteos/launchagent-backup"
PLISTBUDDY="/usr/libexec/PlistBuddy"
MODE="${1:---dry-run}"

if [[ "${WORKER_UID}" -eq 0 ]]; then
  echo "Run as the worker user (not root); the script uses sudo where needed." >&2
  exit 1
fi

say() { printf '%s\n' "$*"; }

daemon_loaded() { sudo launchctl print "system/$1" >/dev/null 2>&1; }
agent_loaded() { launchctl print "gui/${WORKER_UID}/$1" >/dev/null 2>&1; }

convert_one() {
  local label="$1"
  local agent="${AGENT_DIR}/${label}.plist"
  local daemon="${DAEMON_DIR}/${label}.plist"
  local staged
  staged="$(mktemp -t "${label}")"

  if [[ -f "${daemon}" ]] && daemon_loaded "${label}"; then
    say "[${label}] already a loaded LaunchDaemon — skipping."
    [[ -f "${agent}" ]] && say "[${label}] WARNING: agent plist still present at ${agent}; it is not loaded by this script."
    return 0
  fi
  if [[ ! -f "${agent}" ]]; then
    say "[${label}] ERROR: no installed agent plist at ${agent} and no loaded daemon. Nothing to convert." >&2
    return 1
  fi

  cp "${agent}" "${staged}"
  /usr/bin/plutil -convert xml1 "${staged}"
  "${PLISTBUDDY}" -c "Delete :UserName" "${staged}" 2>/dev/null || true
  "${PLISTBUDDY}" -c "Delete :GroupName" "${staged}" 2>/dev/null || true
  "${PLISTBUDDY}" -c "Add :UserName string ${WORKER_USER}" "${staged}"
  "${PLISTBUDDY}" -c "Add :GroupName string ${WORKER_GROUP}" "${staged}"
  "${PLISTBUDDY}" -c "Add :EnvironmentVariables dict" "${staged}" 2>/dev/null || true
  "${PLISTBUDDY}" -c "Delete :EnvironmentVariables:HOME" "${staged}" 2>/dev/null || true
  "${PLISTBUDDY}" -c "Add :EnvironmentVariables:HOME string ${WORKER_HOME}" "${staged}"
  /usr/bin/plutil -lint "${staged}" >/dev/null

  say "[${label}] program:  $("${PLISTBUDDY}" -c 'Print :ProgramArguments' "${staged}" | tr '\n' ' ')"
  say "[${label}] schedule: $( ("${PLISTBUDDY}" -c 'Print :StartInterval' "${staged}" 2>/dev/null && echo s) || "${PLISTBUDDY}" -c 'Print :StartCalendarInterval' "${staged}" 2>/dev/null | tr '\n' ' ')"
  say "[${label}] RunAtLoad: $("${PLISTBUDDY}" -c 'Print :RunAtLoad' "${staged}" 2>/dev/null || echo unset) · runs as ${WORKER_USER}:${WORKER_GROUP}"

  if [[ "${MODE}" != "--apply" ]]; then
    say "[${label}] dry run — would install ${daemon}, boot out gui/${WORKER_UID}/${label}, back up the agent plist."
    rm -f "${staged}"
    return 0
  fi

  sudo install -m 0644 -o root -g wheel "${staged}" "${daemon}"
  rm -f "${staged}"

  # Unload the agent first so the two copies never overlap.
  if agent_loaded "${label}"; then
    launchctl bootout "gui/${WORKER_UID}/${label}" || true
  fi
  if ! sudo launchctl bootstrap system "${daemon}"; then
    say "[${label}] ERROR: daemon bootstrap failed — restoring the agent." >&2
    sudo rm -f "${daemon}"
    launchctl bootstrap "gui/${WORKER_UID}" "${agent}" || true
    return 1
  fi
  if ! daemon_loaded "${label}"; then
    say "[${label}] ERROR: daemon not visible after bootstrap — restoring the agent." >&2
    sudo launchctl bootout "system/${label}" 2>/dev/null || true
    sudo rm -f "${daemon}"
    launchctl bootstrap "gui/${WORKER_UID}" "${agent}" || true
    return 1
  fi

  mkdir -p "${BACKUP_DIR}"
  mv "${agent}" "${BACKUP_DIR}/${label}.plist"
  say "[${label}] converted. Agent plist backed up to ${BACKUP_DIR}/${label}.plist"
  sudo launchctl print "system/${label}" | /usr/bin/grep -E 'state =|runs =|last exit|program =' || true
}

rollback_one() {
  local label="$1"
  local backup="${BACKUP_DIR}/${label}.plist"
  local daemon="${DAEMON_DIR}/${label}.plist"
  if [[ ! -f "${backup}" ]]; then
    say "[${label}] no backup at ${backup} — skipping."
    return 0
  fi
  sudo launchctl bootout "system/${label}" 2>/dev/null || true
  sudo rm -f "${daemon}"
  cp "${backup}" "${AGENT_DIR}/${label}.plist"
  launchctl bootstrap "gui/${WORKER_UID}" "${AGENT_DIR}/${label}.plist"
  say "[${label}] restored as LaunchAgent."
}

case "${MODE}" in
  --dry-run | --apply)
    say "Mode: ${MODE}  user: ${WORKER_USER}  home: ${WORKER_HOME}"
    for l in "${LABELS[@]}"; do convert_one "${l}"; done
    if [[ "${MODE}" == "--apply" ]]; then
      say ""
      say "Verify after the next scheduled run (production is the source of truth):"
      say "  sudo launchctl print system/com.eliteos.moraware-incremental | grep -E 'runs|last exit'"
      say "  then confirm a new moraware_sync_runs row / the Brain stale-feed check turns fresh."
      say "Reboot test: restart, do NOT log in, wait one interval, confirm a new production run."
    fi
    ;;
  --rollback)
    for l in "${LABELS[@]}"; do rollback_one "${l}"; done
    ;;
  *)
    echo "Usage: $0 [--dry-run|--apply|--rollback]" >&2
    exit 2
    ;;
esac
