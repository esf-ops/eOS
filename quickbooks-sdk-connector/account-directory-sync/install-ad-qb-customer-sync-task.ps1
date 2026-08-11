# Optional Task Scheduler installer for Account Directory QB Customer Enrichment sync.
# Does NOT register a task unless -Apply is passed.
#
# Repo on QB Server (do not require a second clone at C:\eliteOS):
#   C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync
# Runtime data (outside git):
#   config C:\eliteOS\config\ad-qb-customer-sync.env
#   logs   C:\eliteOS\logs\account-directory-qb-customer-sync\
#
# Proposed:
#   Name   : slabOS Account Directory QB Customer Sync
#   Cadence: once nightly (default 02:15 local)
#   Action : run-ad-qb-customer-sync.ps1 relative to this folder ($PSScriptRoot)
#
# Preview + collision preflight (read-only; does not register):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1 -Preflight
#
# Explicit register (only after successful manual wrapper verification):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1 -Apply
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1 -Apply -RunAsUser DOMAIN\qb-sync-user
#     (secure credential prompt; password is never printed/logged/committed)
#
# Or register interactive, then set "Run whether user is logged on or not" in Task Scheduler UI
# with a dedicated account that can open QuickBooks Multi-User + System DSN
# slabOS_QuickBooks_Local_RO. Interactive Admin success does NOT prove unattended access.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Preflight,
    [string]$TaskName = "slabOS Account Directory QB Customer Sync",
    [string]$WrapperPath = "",
    [string]$DailyAt = "02:15",
    [string]$ConfigPath = "C:\eliteOS\config\ad-qb-customer-sync.env",
    [string]$RunAsUser = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WrapperPath)) {
    $WrapperPath = Join-Path $PSScriptRoot "run-ad-qb-customer-sync.ps1"
}

$workerPath = Join-Path $PSScriptRoot "sync-ad-qb-customers.ps1"

if (-not (Test-Path -LiteralPath $WrapperPath)) {
    throw "Wrapper script not found: $WrapperPath"
}
if (-not (Test-Path -LiteralPath $workerPath)) {
    throw "Worker script not found next to installer (expected relative to `$PSScriptRoot): $workerPath"
}

if ($DailyAt -notmatch '^\d{1,2}:\d{2}$') {
    throw "DailyAt must be HH:mm (24h), got: $DailyAt"
}

function Get-DailyAtMinutes {
    param([string]$HhMm)
    $parts = $HhMm.Split(":")
    return (([int]$parts[0]) * 60) + [int]$parts[1]
}

function Get-TriggerTimeSummary {
    param($Task)
    $bits = New-Object System.Collections.Generic.List[string]
    foreach ($t in @($Task.Triggers)) {
        try {
            $desc = [string]$t
            if ($t.PSObject.Properties.Name -contains "StartBoundary" -and $t.StartBoundary) {
                $desc = ("StartBoundary={0}" -f $t.StartBoundary)
            }
            if ($t.CimClass -and $t.CimClass.CimClassName) {
                $desc = ("{0}; {1}" -f $t.CimClass.CimClassName, $desc)
            }
            [void]$bits.Add($desc)
        } catch {
            [void]$bits.Add("(trigger)")
        }
    }
    if ($bits.Count -eq 0) { return "(no triggers)" }
    return ($bits -join " | ")
}

function Test-TriggerNearDailyAt {
    param(
        $Task,
        [int]$TargetMinutes,
        [int]$WindowMinutes = 120
    )
    foreach ($t in @($Task.Triggers)) {
        try {
            $sb = $null
            if ($t.PSObject.Properties.Name -contains "StartBoundary") {
                $sb = [string]$t.StartBoundary
            }
            if ([string]::IsNullOrWhiteSpace($sb)) { continue }
            # StartBoundary often like 2026-08-11T02:15:00
            if ($sb -match 'T(\d{2}):(\d{2})') {
                $mins = ([int]$Matches[1] * 60) + [int]$Matches[2]
                $delta = [Math]::Abs($mins - $TargetMinutes)
                $wrap = [Math]::Min($delta, 1440 - $delta)
                if ($wrap -le $WindowMinutes) { return $true }
            }
        } catch { }
    }
    return $false
}

function Show-AdQbTaskPreflight {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ProposedDailyAt
    )

    Write-Host ""
    Write-Host "=== Read-only Task Scheduler preflight (no changes) ==="
    Write-Host ("Proposed task name : {0}" -f $Name)
    Write-Host ("Proposed cadence   : daily at {0} local" -f $ProposedDailyAt)

    $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host ("Named task exists  : NO (safe to create '{0}')" -f $Name)
    } else {
        $info = Get-ScheduledTaskInfo -TaskName $Name -ErrorAction SilentlyContinue
        Write-Host ("Named task exists  : YES")
        Write-Host ("  State            : {0}" -f $existing.State)
        Write-Host ("  Path             : {0}" -f $existing.TaskPath)
        if ($info) {
            Write-Host ("  LastRunTime      : {0}" -f $info.LastRunTime)
            Write-Host ("  NextRunTime      : {0}" -f $info.NextRunTime)
            Write-Host ("  LastTaskResult   : {0}" -f $info.LastTaskResult)
        }
        Write-Host ("  Triggers         : {0}" -f (Get-TriggerTimeSummary -Task $existing))
        Write-Host "  Action required  : review/unregister before -Apply (installer replaces same name)."
    }

    $targetMins = Get-DailyAtMinutes -HhMm $ProposedDailyAt
    Write-Host ""
    Write-Host ("Nearby scheduled tasks (trigger start within +/- 2 hours of {0}, or name hints QB/Sales/slabOS/eliteOS/AD):" -f $ProposedDailyAt)

    $all = @(Get-ScheduledTask -ErrorAction SilentlyContinue)
    $hits = New-Object System.Collections.Generic.List[object]
    foreach ($task in $all) {
        $nm = [string]$task.TaskName
        $nameHit = $nm -match '(?i)quickbooks|qb\b|sales|slabos|eliteos|account.?directory|ad.?qb'
        $near = Test-TriggerNearDailyAt -Task $task -TargetMinutes $targetMins -WindowMinutes 120
        if (-not ($nameHit -or $near)) { continue }
        $info = $null
        try { $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue } catch { }
        [void]$hits.Add([pscustomobject]@{
            Name = $nm
            Path = [string]$task.TaskPath
            State = [string]$task.State
            NextRun = $(if ($info) { [string]$info.NextRunTime } else { "" })
            Triggers = (Get-TriggerTimeSummary -Task $task)
            Why = $(if ($nameHit -and $near) { "name+time" } elseif ($nameHit) { "name" } else { "time" })
        })
    }

    if ($hits.Count -eq 0) {
        Write-Host "  (none matched name hints or +/- 2h window)"
    } else {
        $hits |
            Sort-Object Name |
            Select-Object -First 40 |
            ForEach-Object {
                Write-Host ("  - [{0}] {1}{2} state={3} next={4}" -f $_.Why, $_.Path, $_.Name, $_.State, $_.NextRun)
                Write-Host ("      triggers: {0}" -f $_.Triggers)
            }
        if ($hits.Count -gt 40) {
            Write-Host ("  ... {0} more omitted" -f ($hits.Count - 40))
        }
    }
    Write-Host "=== end preflight ==="
    Write-Host ""
}

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$WrapperPath`" -ConfigPath `"$ConfigPath`""
$actionDisplay = "powershell.exe $arg"

Write-Host ""
Write-Host "Proposed Task Scheduler registration (AD customer enrichment — not Sales)"
Write-Host ("  ScriptRoot: {0}" -f $PSScriptRoot)
Write-Host ("  Wrapper   : {0}" -f $WrapperPath)
Write-Host ("  Worker    : {0}" -f $workerPath)
Write-Host ("  Name      : {0}" -f $TaskName)
Write-Host ("  Action    : {0}" -f $actionDisplay)
Write-Host ("  Trigger   : daily at {0} local" -f $DailyAt)
Write-Host ("  Config    : {0}" -f $ConfigPath)
Write-Host "  Overlap   : Do not start a new instance if one is running (task + wrapper lock)"
Write-Host "  Logs      : C:\eliteOS\logs\account-directory-qb-customer-sync\"
Write-Host "  Secrets   : ingest token in config/env only; Windows password never on CLI / never logged"
Write-Host "  Note      : Separate from 'eliteOS QuickBooks Sales Sync'. Never reuse QB_SALES_SYNC_INGEST_TOKEN."
Write-Host "  Note      : Thryve Remote Connector untouched. QuickBooks writes forbidden."
Write-Host "  Note      : Repo path is this working copy — do not require C:\eliteOS as a second eOS clone."
Write-Host ""

Show-AdQbTaskPreflight -Name $TaskName -ProposedDailyAt $DailyAt

if ($Preflight -and -not $Apply) {
    Write-Host "Preflight only. No task registered."
    exit 0
}

if (-not $Apply) {
    Write-Host "Dry proposal only. Re-run with -Apply to register (explicit)."
    Write-Host ""
    Write-Host "Manual wrapper verification first (from this folder):"
    Write-Host ("  powershell -NoProfile -ExecutionPolicy Bypass -File `"{0}`" -ConfigPath `"{1}`" -DryRun" -f $WrapperPath, $ConfigPath)
    Write-Host ("  powershell -NoProfile -ExecutionPolicy Bypass -File `"{0}`" -ConfigPath `"{1}`"" -f $WrapperPath, $ConfigPath)
    Write-Host ""
    Write-Host "Read-only collision preflight:"
    Write-Host ("  powershell -NoProfile -ExecutionPolicy Bypass -File `"{0}`" -Preflight" -f $MyInvocation.MyCommand.Path)
    exit 0
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg

# Daily at local clock time
$parts = $DailyAt.Split(":")
$hour = [int]$parts[0]
$minute = [int]$parts[1]
$start = (Get-Date).Date.AddHours($hour).AddMinutes($minute)
if ($start -lt (Get-Date)) {
    $start = $start.AddDays(1)
}
$taskTrigger = New-ScheduledTaskTrigger -Daily -At $start

# MultipleInstances IgnoreNew = non-overlap at scheduler layer
$taskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

if (-not [string]::IsNullOrWhiteSpace($RunAsUser)) {
    Write-Host ("Secure credential prompt for '{0}' (password will not be printed or logged)..." -f $RunAsUser)
    $cred = Get-Credential -UserName $RunAsUser -Message "Windows password for unattended AD QB customer sync (never logged/committed)."
    if ($null -eq $cred) {
        throw "Credential prompt cancelled. Task not registered."
    }
    # Password used only for Register-ScheduledTask; never Write-Host / log / commit.
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $taskAction `
        -Trigger $taskTrigger `
        -Settings $taskSettings `
        -User $cred.UserName `
        -Password $cred.GetNetworkCredential().Password `
        -RunLevel Highest | Out-Null
    Write-Host ("Registered task '{0}' as '{1}' (Password logon / run whether user is logged on)." -f $TaskName, $cred.UserName)
} else {
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $taskAction `
        -Trigger $taskTrigger `
        -Principal $taskPrincipal `
        -Settings $taskSettings | Out-Null
    Write-Host ("Registered task '{0}' as interactive user '{1}'." -f $TaskName, $env:USERNAME)
    Write-Host "For production unattended QB access, either:"
    Write-Host "  1) Task Scheduler UI → task Properties → 'Run whether user is logged on or not' + dedicated account, or"
    Write-Host "  2) Re-run: -Apply -RunAsUser DOMAIN\qb-sync-user  (secure prompt; no CLI password)."
}

Write-Host "Validate one manual wrapper run + one scheduled run before relying on nightly sync."
exit 0
