# eliteOS Slabsmith Inventory Sync — example runner (Windows)
#
# Copy this folder to C:\eliteos-slabsmith-sync and create config.json from config.example.json.
#
# Manual dry-run (local XML validation only — no backend call):
#   node sync-slabs.mjs --config config.json --dry-run
#
# Manual live send (POST XML to backend):
#   node sync-slabs.mjs --config config.json --send
#
# Or set "writeEnabled": true in config.json and run without --dry-run:
#   node sync-slabs.mjs --config config.json

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ScriptDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Transcript = Join-Path $LogDir ("run-{0:yyyyMMdd-HHmmss}.transcript.log" -f (Get-Date))
Start-Transcript -Path $Transcript

try {
  Set-Location $ScriptDir
  # Default: dry-run. Change to --send for live ingest.
  node sync-slabs.mjs --config config.json --dry-run
  exit $LASTEXITCODE
}
finally {
  Stop-Transcript
}
