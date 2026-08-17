#!/usr/bin/env bash
# eliteOS governed Moraware incremental worker (Mac production LaunchAgent).
#
# Invokes the existing incremental live CLI only — no business logic here.
# Secrets come from the non-repo env file; never from the plist.
#
# Example (LaunchAgent / manual supervised):
#   /Users/chrishenely/eOS-worker/deploy/moraware-worker/run-moraware-incremental.sh

set -euo pipefail

ELITEOS_REPO="${ELITEOS_REPO:-/Users/chrishenely/eOS-worker}"
ELITEOS_ENV="${ELITEOS_ENV:-/Users/chrishenely/.eliteos/moraware-worker.env}"
ROLLING_BATCH_SIZE="${MORAWARE_INCREMENTAL_ROLLING_BATCH_SIZE:-100}"
LIVE_CANDIDATE_CEILING="${MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING:-150}"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

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
# shellcheck source=/dev/null
source "${ELITEOS_ENV}"
set +a

export MORAWARE_INCREMENTAL_LIVE=1
export MORAWARE_INCREMENTAL_EXECUTE=I_UNDERSTAND_PRODUCTION_WRITES

cd "${ELITEOS_REPO}"

if [[ ! -f package.json ]]; then
  echo "package.json not found under ${ELITEOS_REPO}" >&2
  exit 1
fi

exec /usr/local/bin/npm run eos:moraware:incremental -- \
  --live \
  --allow-live-incremental \
  --rolling-batch-size="${ROLLING_BATCH_SIZE}" \
  --live-candidate-ceiling="${LIVE_CANDIDATE_CEILING}"
