#!/usr/bin/env bash
# Install com.eliteos.moraware-nightly for the Mac mini worker checkout.
# Does not modify com.eliteos.moraware-incremental.
# Does not start a full pipeline (RunAtLoad is false).

set -euo pipefail

REPO="${ELITEOS_REPO:-/Users/chrishenely/eOS-worker}"
PLIST_SRC="${REPO}/deploy/moraware-worker/launchd/com.eliteos.moraware-nightly.plist"
LABEL="com.eliteos.moraware-nightly"
DEST_DIR="${HOME}/Library/LaunchAgents"
DEST="${DEST_DIR}/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/eliteOS"
UID_NUM="$(id -u)"
GUI_DOMAIN="gui/${UID_NUM}"

if [[ ! -f "${PLIST_SRC}" ]]; then
  echo "Missing plist: ${PLIST_SRC}" >&2
  exit 1
fi

if [[ ! -f "${REPO}/deploy/moraware-worker/run-moraware-nightly-macos.sh" ]]; then
  echo "Missing Mac nightly wrapper under ${REPO}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}" "${LOG_DIR}"
chmod +x "${REPO}/deploy/moraware-worker/run-moraware-nightly-macos.sh"
chmod +x "${REPO}/deploy/moraware-worker/run-moraware-worker.sh"
/usr/bin/plutil -lint "${PLIST_SRC}"

cp "${PLIST_SRC}" "${DEST}"

if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${GUI_DOMAIN}/${LABEL}" || true
fi

if launchctl bootstrap "${GUI_DOMAIN}" "${DEST}"; then
  :
elif launchctl load "${DEST}"; then
  :
else
  echo "Failed to load ${LABEL}" >&2
  exit 1
fi

echo "installed ${LABEL}"
echo "plist ${DEST}"
echo "repo ${REPO}"
launchctl print "${GUI_DOMAIN}/${LABEL}" | /usr/bin/grep -E 'path = |state = |runs = |program = |Hour = |Minute = |stdout path|stderr path|label =' || true
echo "hourly incremental (must remain):"
launchctl print "${GUI_DOMAIN}/com.eliteos.moraware-incremental" >/dev/null 2>&1 && echo "com.eliteos.moraware-incremental LOADED" || echo "WARNING: hourly incremental not visible in this domain"
