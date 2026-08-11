# Optional Task Scheduler installer for QuickBooks Sales ODBC sync.
# Does NOT register a task unless -Apply is passed.
#
# Prerequisites (must be production-tested before enabling schedule):
# - 64-bit System DSN slabOS_QuickBooks_Local_RO works for the task account
# - QuickBooks Multi-User session accessible to that account
# - Worker env vars set for the task (never store token in this script)
#
# Example:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1 -Apply

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$TaskName = "eliteOS QuickBooks Sales Sync",
    [string]$WorkerPath = "",
    [string]$EveryMinutes = "15"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkerPath)) {
    $WorkerPath = Join-Path $PSScriptRoot "sync-sales-financials.ps1"
}

if (-not (Test-Path -LiteralPath $WorkerPath)) {
    throw "Worker script not found: $WorkerPath"
}

$minutes = 15
[void][int]::TryParse($EveryMinutes, [ref]$minutes)
if ($minutes -lt 5) { $minutes = 5 }

$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$WorkerPath`""
Write-Host ""
Write-Host "Proposed Task Scheduler registration"
Write-Host ("  Name   : {0}" -f $TaskName)
Write-Host ("  Action : {0}" -f $action)
Write-Host ("  Trigger: every {0} minutes" -f $minutes)
Write-Host "  Note   : Task account must access QuickBooks + 64-bit System DSN."
Write-Host "           Interactive Admin success does NOT prove unattended access."
Write-Host ""

if (-not $Apply) {
    Write-Host "Dry proposal only. Re-run with -Apply to register (explicit)."
    exit 0
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $WorkerPath)
$taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes $minutes) -RepetitionDuration ([TimeSpan]::MaxValue)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings | Out-Null
Write-Host ("Registered task '{0}'. Validate unattended QuickBooks access before relying on it." -f $TaskName)
exit 0
