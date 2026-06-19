#!/usr/bin/env bash
# eliteOS Moraware calendar schedule sync — deploy wrapper (view 222).
#
# Install on VM:
#   chmod +x deploy/moraware-worker/run-calendar-schedule-sync.sh
#
# systemd timer should call this script (not inline npm/env blocks).

set -euo pipefail

ELITEOS_REPO="${ELITEOS_REPO:-/opt/eliteos/eOS}"
ELITEOS_ENV="${ELITEOS_ENV:-/etc/eliteos/moraware-worker.env}"
LOG_DIR="/var/log/eliteos"

if [[ ! -d "${ELITEOS_REPO}" ]]; then
  echo "Missing repo checkout: ${ELITEOS_REPO}" >&2
  exit 1
fi

if [[ ! -f "${ELITEOS_ENV}" ]]; then
  echo "Missing worker env file: ${ELITEOS_ENV}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ELITEOS_ENV}"
set +a

: "${MORAWARE_DEFAULT_ORGANIZATION_ID:?MORAWARE_DEFAULT_ORGANIZATION_ID is required in ${ELITEOS_ENV}}"
: "${MORAWARE_API_URL:?MORAWARE_API_URL is required in ${ELITEOS_ENV}}"
: "${MORAWARE_USERNAME:?MORAWARE_USERNAME is required in ${ELITEOS_ENV}}"
: "${MORAWARE_PASSWORD:?MORAWARE_PASSWORD is required in ${ELITEOS_ENV}}"
: "${SUPABASE_URL:?SUPABASE_URL is required in ${ELITEOS_ENV}}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required in ${ELITEOS_ENV}}"

export SUPABASE_WRITE_ENABLED="${SUPABASE_WRITE_ENABLED:-1}"

mkdir -p "${LOG_DIR}"
mkdir -p "${ELITEOS_REPO}/debug/moraware/scheduled-runs/calendar-schedule"

cd "${ELITEOS_REPO}"

if [[ ! -f package.json ]]; then
  echo "package.json not found under ${ELITEOS_REPO}" >&2
  exit 1
fi

exec npm run eos:moraware:sync-calendar-schedule
