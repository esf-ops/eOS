#!/usr/bin/env bash
# eliteOS Moraware nightly pipeline — Mac mini host wrapper only.
# Sets deployment paths, then execs the governed run-moraware-worker.sh.
# No sync business logic. No secrets.

set -euo pipefail

export ELITEOS_REPO="${ELITEOS_REPO:-/Users/chrishenely/eOS-worker}"
export ELITEOS_ENV="${ELITEOS_ENV:-/Users/chrishenely/.eliteos/moraware-worker.env}"
export LOG_DIR="${LOG_DIR:-/Users/chrishenely/Library/Logs/eliteOS}"
export MORAWARE_VIEW_219_SYNC="${MORAWARE_VIEW_219_SYNC:-1}"
export TZ="${TZ:-America/Chicago}"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

WRAPPER="${ELITEOS_REPO}/deploy/moraware-worker/run-moraware-worker.sh"

if [[ ! -x "${WRAPPER}" && ! -f "${WRAPPER}" ]]; then
  echo "Missing governed worker wrapper: ${WRAPPER}" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"

exec /bin/bash "${WRAPPER}"
