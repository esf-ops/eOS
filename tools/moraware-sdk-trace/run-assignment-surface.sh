#!/usr/bin/env bash
# Read-only: reflect JobTrackerAPI5.dll + optional live probe (no XML trace to stdout).
# Writes:
#   debug/moraware/latest/moraware-sdk-activity-assignment-surface.json
#   debug/moraware/latest/moraware-sdk-activity-assignment-surface.txt
#   debug/moraware/latest/moraware-sdk-full-surface.json
#   debug/moraware/latest/moraware-sdk-full-surface.txt
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

export MORAWARE_SDK_TRACE_MODE="${MORAWARE_SDK_TRACE_MODE:-assignment}"
export MORAWARE_SDK_REPORT_REPO_ROOT="$REPO_ROOT"
export MORAWARE_SDK_SURFACE_OUT_JSON="${MORAWARE_SDK_SURFACE_OUT_JSON:-$REPO_ROOT/debug/moraware/latest/moraware-sdk-activity-assignment-surface.json}"
export MORAWARE_SDK_SURFACE_OUT_TXT="${MORAWARE_SDK_SURFACE_OUT_TXT:-$REPO_ROOT/debug/moraware/latest/moraware-sdk-activity-assignment-surface.txt}"
export MORAWARE_SDK_FULL_SURFACE_OUT_JSON="${MORAWARE_SDK_FULL_SURFACE_OUT_JSON:-$REPO_ROOT/debug/moraware/latest/moraware-sdk-full-surface.json}"
export MORAWARE_SDK_FULL_SURFACE_OUT_TXT="${MORAWARE_SDK_FULL_SURFACE_OUT_TXT:-$REPO_ROOT/debug/moraware/latest/moraware-sdk-full-surface.txt}"

if [[ ! -f tools/moraware-sdk-trace/lib/JobTrackerAPI5.dll ]]; then
  echo "Copy JobTrackerAPI5.dll into tools/moraware-sdk-trace/lib/ first." >&2
  exit 1
fi

PROJ="${MORAWARE_SDK_TRACE_PROJECT:-tools/moraware-sdk-trace/MorawareSdkTrace.net8.csproj}"
dotnet run --project "$PROJ"
