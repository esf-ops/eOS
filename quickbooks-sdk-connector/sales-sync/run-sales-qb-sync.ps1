# Production wrapper for Sales QuickBooks Financial Truth sync.
# READ-ONLY ODBC (slabOS_QuickBooks_Local_RO) -> HTTPS ingest. No QB writes.
# Separate from Account Directory customer sync (never uses QB_AD_CUSTOMER_*).
#
# Manual verification (before Task Scheduler) - from the eOS working copy on the QB Server:
#   cd C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\sales-sync
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-qb-sync.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-qb-sync.ps1 -ConfigPath C:\eliteOS\config\sales-qb-sync.env
#
# Default incremental uses existing worker lookback (QB_SALES_SYNC_LOOKBACK_DAYS, default 60).
# Pass -Backfill only for explicit historical backfill (requires QB_SALES_SYNC_START_DATE).
#
# Worker is Join-Path $PSScriptRoot sync-sales-financials.ps1 (no second repo at C:\eliteOS).
# Runtime config/logs remain under C:\eliteOS\config and C:\eliteOS\logs (outside git).
#
# Do NOT register Task Scheduler from this script - use install-sales-qb-sync-task.ps1 (preview by default).

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [switch]$DryRun,
    [switch]$Backfill,
    [switch]$SkipLock
)

$ErrorActionPreference = "Stop"
$WrapperVersion = "1.0.0"
$DefaultConfigPath = "C:\eliteOS\config\sales-qb-sync.env"
$DefaultLogDir = "C:\eliteOS\logs\sales-qb-sync"
$LockFileName = "sales-qb-sync.lock"
$WorkerScriptName = "sync-sales-financials.ps1"

function Write-SalesQbLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$LogFile = ""
    )
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    if (-not [string]::IsNullOrWhiteSpace($LogFile)) {
        Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    }
}

function ConvertTo-RedactedLogText {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }
    $out = $Text
    $out = [regex]::Replace($out, '(?i)(Bearer\s+)[A-Za-z0-9._\-+=/]{8,}', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(QB_SALES_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(QB_AD_CUSTOMER_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(password\s*[=:]\s*)\S+', '$1***REDACTED***')
    return $out
}

function Import-SalesQbEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw ("Config file not found: {0}" -f $Path)
    }
    $lines = Get-Content -LiteralPath $Path -ErrorAction Stop
    foreach ($raw in $lines) {
        $line = [string]$raw
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith("#")) { continue }
        $eq = $trimmed.IndexOf("=")
        if ($eq -lt 1) { continue }
        $name = $trimmed.Substring(0, $eq).Trim()
        $value = $trimmed.Substring($eq + 1).Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            if ($value.Length -ge 2) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        if ($name -notmatch '^QB_SALES_') {
            throw ("Refusing non-QB_SALES_* config key '{0}' in {1}" -f $name, $Path)
        }
        if ($name -match '(?i)AD_CUSTOMER') {
            throw ("Refusing AD customer config key '{0}'. Sales worker uses QB_SALES_* only." -f $name)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Get-EnvTrimmed {
    param([string]$Name)
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ($null -eq $v) { return "" }
    return ([string]$v).Trim()
}

function Assert-RequiredSalesConfig {
    param(
        [switch]$AllowMissingIngest,
        [switch]$RequireStartDate
    )
    # Match worker defaults so config can omit DSN/company.
    if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed "QB_SALES_DSN"))) {
        [Environment]::SetEnvironmentVariable("QB_SALES_DSN", "slabOS_QuickBooks_Local_RO", "Process")
    }
    if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed "QB_SALES_EXPECTED_COMPANY"))) {
        [Environment]::SetEnvironmentVariable("QB_SALES_EXPECTED_COMPANY", "Elite Stone Fabrications", "Process")
    }

    $required = @(
        "QB_SALES_ORGANIZATION_ID"
    )
    if (-not $AllowMissingIngest) {
        $required += @(
            "QB_SALES_SYNC_INGEST_URL",
            "QB_SALES_SYNC_INGEST_TOKEN"
        )
    }
    if ($RequireStartDate) {
        $required += "QB_SALES_SYNC_START_DATE"
    }
    $missing = @()
    foreach ($name in $required) {
        if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed $name))) {
            $missing += $name
        }
    }
    if ($missing.Count -gt 0) {
        throw ("Missing required Sales QB sync settings: {0}" -f ($missing -join ", "))
    }

    $salesToken = Get-EnvTrimmed "QB_SALES_SYNC_INGEST_TOKEN"
    $adToken = Get-EnvTrimmed "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN"
    if (
        -not [string]::IsNullOrWhiteSpace($salesToken) -and
        -not [string]::IsNullOrWhiteSpace($adToken) -and
        ($salesToken -eq $adToken)
    ) {
        throw "QB_SALES_SYNC_INGEST_TOKEN must not equal QB_AD_CUSTOMER_SYNC_INGEST_TOKEN."
    }
}

function New-SalesQbLogFile {
    param([Parameter(Mandatory = $true)][string]$LogDir)
    if (-not (Test-Path -LiteralPath $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    $name = "sales-qb-sync-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss")
    return (Join-Path $LogDir $name)
}

function Invoke-SalesQbLogRetention {
    param(
        [Parameter(Mandatory = $true)][string]$LogDir,
        [int]$KeepDays = 30
    )
    if (-not (Test-Path -LiteralPath $LogDir)) { return }
    $cutoff = (Get-Date).AddDays(-1 * [Math]::Abs($KeepDays))
    Get-ChildItem -LiteralPath $LogDir -Filter "sales-qb-sync-*.log" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch { }
        }
}

function Test-ProcessAlive {
    param([int]$ProcessId)
    try {
        $p = Get-Process -Id $ProcessId -ErrorAction Stop
        return ($null -ne $p)
    } catch {
        return $false
    }
}

function Enter-SalesQbSyncLock {
    param(
        [Parameter(Mandatory = $true)][string]$LockPath,
        [string]$LogFile = ""
    )
    $lockDir = Split-Path -Parent $LockPath
    if (-not (Test-Path -LiteralPath $lockDir)) {
        New-Item -ItemType Directory -Path $lockDir -Force | Out-Null
    }

    if (Test-Path -LiteralPath $LockPath) {
        $existing = Get-Content -LiteralPath $LockPath -ErrorAction SilentlyContinue
        $existingPid = 0
        if ($existing -and [int]::TryParse(([string]$existing[0]).Trim(), [ref]$existingPid)) {
            if ($existingPid -gt 0 -and (Test-ProcessAlive -ProcessId $existingPid)) {
                Write-SalesQbLog -LogFile $LogFile -Message ("RESULT: FAIL - another Sales QB sync is already running (pid={0}, lock={1}). Non-overlap protection engaged." -f $existingPid, $LockPath)
                exit 2
            }
        }
        Write-SalesQbLog -LogFile $LogFile -Message ("Stale lock found (pid not running); removing {0}" -f $LockPath)
        Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
    }

    Set-Content -LiteralPath $LockPath -Value ("{0}`r`n{1}" -f $PID, (Get-Date -Format "o")) -Encoding ASCII
}

function Exit-SalesQbSyncLock {
    param([string]$LockPath)
    if ([string]::IsNullOrWhiteSpace($LockPath)) { return }
    if (-not (Test-Path -LiteralPath $LockPath)) { return }
    try {
        $existing = Get-Content -LiteralPath $LockPath -ErrorAction SilentlyContinue
        $existingPid = 0
        if ($existing -and [int]::TryParse(([string]$existing[0]).Trim(), [ref]$existingPid)) {
            if ($existingPid -eq $PID) {
                Remove-Item -LiteralPath $LockPath -Force -ErrorAction Stop
            }
        }
    } catch { }
}

# --- main ---
$scriptRoot = $PSScriptRoot
$workerPath = Join-Path $scriptRoot $WorkerScriptName
if (-not (Test-Path -LiteralPath $workerPath)) {
    throw ("Worker script not found: {0}" -f $workerPath)
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = $DefaultConfigPath
}

$logDir = $DefaultLogDir
$lockDir = $DefaultLogDir
$logFile = $null
$lockPath = $null
$exitCode = 1

try {
    if (Test-Path -LiteralPath $ConfigPath) {
        Import-SalesQbEnvFile -Path $ConfigPath
    } elseif ($ConfigPath -eq $DefaultConfigPath) {
        # Allow Machine/User env-only setups when default file is absent.
    } else {
        throw ("Config file not found: {0}" -f $ConfigPath)
    }

    $customLog = Get-EnvTrimmed "QB_SALES_SYNC_LOG_DIR"
    if (-not [string]::IsNullOrWhiteSpace($customLog)) { $logDir = $customLog }
    $customLock = Get-EnvTrimmed "QB_SALES_SYNC_LOCK_DIR"
    if (-not [string]::IsNullOrWhiteSpace($customLock)) { $lockDir = $customLock }

    $logFile = New-SalesQbLogFile -LogDir $logDir
    Invoke-SalesQbLogRetention -LogDir $logDir -KeepDays 30

    $lookback = Get-EnvTrimmed "QB_SALES_SYNC_LOOKBACK_DAYS"
    if ([string]::IsNullOrWhiteSpace($lookback)) { $lookback = "60" }

    Write-SalesQbLog -LogFile $logFile -Message ("Sales QB sync wrapper {0} starting" -f $WrapperVersion)
    Write-SalesQbLog -LogFile $logFile -Message ("ConfigPath={0} DryRun={1} Backfill={2}" -f $ConfigPath, [bool]$DryRun, [bool]$Backfill)
    Write-SalesQbLog -LogFile $logFile -Message ("Worker={0}" -f $workerPath)
    Write-SalesQbLog -LogFile $logFile -Message ("DSN={0} Company={1} OrgId={2}" -f (Get-EnvTrimmed "QB_SALES_DSN"), (Get-EnvTrimmed "QB_SALES_EXPECTED_COMPANY"), (Get-EnvTrimmed "QB_SALES_ORGANIZATION_ID"))
    if (-not $Backfill) {
        Write-SalesQbLog -LogFile $logFile -Message ("Mode=incremental LookbackDays={0}" -f $lookback)
    } else {
        Write-SalesQbLog -LogFile $logFile -Message ("Mode=backfill StartDate={0}" -f (Get-EnvTrimmed "QB_SALES_SYNC_START_DATE"))
    }
    $ingestUrl = Get-EnvTrimmed "QB_SALES_SYNC_INGEST_URL"
    if (-not [string]::IsNullOrWhiteSpace($ingestUrl)) {
        Write-SalesQbLog -LogFile $logFile -Message ("IngestUrl={0}" -f $ingestUrl)
    }
    Write-SalesQbLog -LogFile $logFile -Message "IngestToken=(set but never logged)"

    Assert-RequiredSalesConfig -AllowMissingIngest:$DryRun -RequireStartDate:$Backfill

    if (-not $SkipLock) {
        $lockPath = Join-Path $lockDir $LockFileName
        Enter-SalesQbSyncLock -LockPath $lockPath -LogFile $logFile
        Write-SalesQbLog -LogFile $logFile -Message ("Lock acquired pid={0} path={1}" -f $PID, $lockPath)
    }

    $argList = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $workerPath
    )
    if ($DryRun) { $argList += "-DryRun" }
    if ($Backfill) { $argList += "-Backfill" }

    Write-SalesQbLog -LogFile $logFile -Message "Invoking sync-sales-financials.ps1"
    $output = & powershell.exe @argList 2>&1
    $exitCode = [int]$LASTEXITCODE
    foreach ($item in @($output)) {
        $text = ConvertTo-RedactedLogText -Text ([string]$item)
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            Write-SalesQbLog -LogFile $logFile -Message ("worker: {0}" -f $text)
        }
    }

    if ($exitCode -eq 0) {
        Write-SalesQbLog -LogFile $logFile -Message "RESULT: PASS"
    } else {
        Write-SalesQbLog -LogFile $logFile -Message ("RESULT: FAIL exitCode={0}" -f $exitCode)
        if ($exitCode -eq 0) { $exitCode = 1 }
    }
} catch {
    $msg = ConvertTo-RedactedLogText -Text ([string]$_.Exception.Message)
    if ($null -eq $logFile) {
        try { $logFile = New-SalesQbLogFile -LogDir $DefaultLogDir } catch { $logFile = "" }
    }
    Write-SalesQbLog -LogFile $logFile -Message ("RESULT: FAIL - {0}" -f $msg)
    $exitCode = 1
} finally {
    Exit-SalesQbSyncLock -LockPath $lockPath
    if (-not [string]::IsNullOrWhiteSpace($logFile)) {
        Write-SalesQbLog -LogFile $logFile -Message ("Wrapper finished exitCode={0} log={1}" -f $exitCode, $logFile)
        Write-Host ""
        Write-Host "Log retention: keep ~30 days of sales-qb-sync-*.log under the log directory; wrapper deletes older files on each run."
        Write-Host ("Log file: {0}" -f $logFile)
    }
}

exit $exitCode
