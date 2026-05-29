#!/usr/bin/env bash
# eliteOS Moraware cloud worker wrapper — deploy target only, no sync business logic.
#
# Install on VM:
#   chmod +x deploy/moraware-worker/run-moraware-worker.sh
#
# Cron should call this script only (not inline npm/env blocks).

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
: "${BACKEND_URL:?BACKEND_URL is required in ${ELITEOS_ENV}}"

mkdir -p "${LOG_DIR}"
mkdir -p "${ELITEOS_REPO}/debug/moraware/scheduled-runs"

cd "${ELITEOS_REPO}"

if [[ ! -f package.json ]]; then
  echo "package.json not found under ${ELITEOS_REPO}" >&2
  exit 1
fi

exec npm run eos:moraware:run-scheduled-pipeline
