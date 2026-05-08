#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f lib/JobTrackerAPI5.dll ]]; then
  echo "Copy JobTrackerAPI5.dll into tools/moraware-sdk-trace/lib/ first." >&2
  exit 1
fi

mkdir -p ../../debug/moraware
dotnet run --project "$SCRIPT_DIR/MorawareSdkTrace.csproj" 2>&1 | tee ../../debug/moraware/sdk-trace-output.txt
