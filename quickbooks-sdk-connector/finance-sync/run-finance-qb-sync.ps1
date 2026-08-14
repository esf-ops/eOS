# Production wrapper for eliteOS QuickBooks Full Finance Foundation sync.
# READ-ONLY ODBC -> HTTPS ingest. No QB writes.
# Historical backfill is explicit opt-in (-HistoricalBackfill + QB_FINANCE_ALLOW_HISTORICAL_BACKFILL=1).
#
# Single-flight CData lock is shared with Sales (qb-cdata-odbc.lock) plus peer lock checks.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("master", "revenue_ar", "ap", "cash", "accounting")]
    [string]$Domain,
    [string]$ConfigPath = "",
    [switch]$DryRun,
    [switch]$CaptureOpening,
    [switch]$ForceCheckpoint,
    [switch]$SkipLock,
    [switch]$HistoricalBackfill
)

$ErrorActionPreference = "Stop"
$WrapperVersion = "1.0.0"
$DefaultConfigPath = "C:\eliteOS\config\finance-qb-sync.env"
$DefaultLogDir = "C:\eliteOS\logs\finance-qb-sync"
$SharedLockDir = "C:\eliteOS\logs\qb-odbc"
$SharedLockName = "qb-cdata-odbc.lock"
$WorkerScriptName = "sync-finance.ps1"

function Write-FinanceQbLog {
    param([Parameter(Mandatory = $true)][string]$Message, [string]$LogFile = "")
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
    $out = [regex]::Replace($out, '(?i)(QB_FINANCE_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(QB_SALES_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(QB_AD_CUSTOMER_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(password\s*[=:]\s*)\S+', '$1***REDACTED***')
    return $out
}

function Import-FinanceQbEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw ("Config file not found: {0}" -f $Path) }
    foreach ($raw in (Get-Content -LiteralPath $Path -ErrorAction Stop)) {
        $trimmed = ([string]$raw).Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) { continue }
        $eq = $trimmed.IndexOf("=")
        if ($eq -lt 1) { continue }
        $name = $trimmed.Substring(0, $eq).Trim()
        $value = $trimmed.Substring($eq + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            if ($value.Length -ge 2) { $value = $value.Substring(1, $value.Length - 2) }
        }
        if ($name -notmatch '^QB_FINANCE_') {
            throw ("Refusing non-QB_FINANCE_* config key '{0}' in {1}" -f $name, $Path)
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

function Test-ProcessAlive {
    param([int]$ProcessId)
    try { return ($null -ne (Get-Process -Id $ProcessId -ErrorAction Stop)) } catch { return $false }
}

function Enter-QbCdataOdbcLock {
    param([Parameter(Mandatory = $true)][string]$LockPath, [string]$LogFile = "")
    $lockDir = Split-Path -Parent $LockPath
    if (-not (Test-Path -LiteralPath $lockDir)) { New-Item -ItemType Directory -Path $lockDir -Force | Out-Null }
    if (Test-Path -LiteralPath $LockPath) {
        $existing = Get-Content -LiteralPath $LockPath -ErrorAction SilentlyContinue
        $existingPid = 0
        if ($existing -and [int]::TryParse(([string]$existing[0]).Trim(), [ref]$existingPid)) {
            if ($existingPid -gt 0 -and (Test-ProcessAlive -ProcessId $existingPid)) {
                Write-FinanceQbLog -LogFile $LogFile -Message ("RESULT: FAIL - another QuickBooks/CData reader is already running (pid={0}, lock={1}). Single-flight lock engaged." -f $existingPid, $LockPath)
                exit 2
            }
        }
        Write-FinanceQbLog -LogFile $LogFile -Message ("Stale lock found (pid not running); removing {0}" -f $LockPath)
        Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
    }
    Set-Content -LiteralPath $LockPath -Value ("{0}`r`n{1}`r`nfinance {2}" -f $PID, (Get-Date -Format "o"), $Domain) -Encoding ASCII
}

function Exit-QbCdataOdbcLock {
    param([string]$LockPath)
    if ([string]::IsNullOrWhiteSpace($LockPath)) { return }
    if (-not (Test-Path -LiteralPath $LockPath)) { return }
    try {
        $existing = Get-Content -LiteralPath $LockPath -ErrorAction SilentlyContinue
        $existingPid = 0
        if ($existing -and [int]::TryParse(([string]$existing[0]).Trim(), [ref]$existingPid)) {
            if ($existingPid -eq $PID) { Remove-Item -LiteralPath $LockPath -Force -ErrorAction Stop }
        }
    } catch { }
}

function Test-PeerQbLock {
    param([string]$Path, [string]$Label, [string]$LogFile)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $existing = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue
    $existingPid = 0
    if ($existing -and [int]::TryParse(([string]$existing[0]).Trim(), [ref]$existingPid)) {
        if ($existingPid -gt 0 -and (Test-ProcessAlive -ProcessId $existingPid)) {
            Write-FinanceQbLog -LogFile $LogFile -Message ("RESULT: FAIL - peer {0} ODBC reader is running (pid={1}, lock={2}). Concurrent CData readers are not allowed." -f $Label, $existingPid, $Path)
            exit 2
        }
    }
}

$scriptRoot = $PSScriptRoot
$workerPath = Join-Path $scriptRoot $WorkerScriptName
if (-not (Test-Path -LiteralPath $workerPath)) { throw ("Worker script not found: {0}" -f $workerPath) }
if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath = $DefaultConfigPath }

$logDir = $DefaultLogDir
$logFile = $null
$lockPath = $null
$exitCode = 1

try {
    if (Test-Path -LiteralPath $ConfigPath) { Import-FinanceQbEnvFile -Path $ConfigPath }
    elseif ($ConfigPath -ne $DefaultConfigPath) { throw ("Config file not found: {0}" -f $ConfigPath) }

    if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed "QB_FINANCE_DSN"))) {
        [Environment]::SetEnvironmentVariable("QB_FINANCE_DSN", "slabOS_QuickBooks_Local_RO", "Process")
    }
    if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed "QB_FINANCE_EXPECTED_COMPANY"))) {
        [Environment]::SetEnvironmentVariable("QB_FINANCE_EXPECTED_COMPANY", "Elite Stone Fabrications", "Process")
    }

    $customLog = Get-EnvTrimmed "QB_FINANCE_SYNC_LOG_DIR"
    if (-not [string]::IsNullOrWhiteSpace($customLog)) { $logDir = $customLog }
    if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $logFile = Join-Path $logDir ("finance-qb-sync-{0}-{1}.log" -f $Domain, (Get-Date -Format "yyyyMMdd-HHmmss"))

    Write-FinanceQbLog -LogFile $logFile -Message ("Finance QB sync wrapper {0} domain={1} DryRun={2} CaptureOpening={3} HistoricalBackfill={4}" -f $WrapperVersion, $Domain, [bool]$DryRun, [bool]$CaptureOpening, [bool]$HistoricalBackfill)
    Write-FinanceQbLog -LogFile $logFile -Message ("Worker={0}" -f $workerPath)
    Write-FinanceQbLog -LogFile $logFile -Message "IngestToken=(set but never logged)"

    $required = @("QB_FINANCE_ORGANIZATION_ID")
    if (-not $DryRun) { $required += @("QB_FINANCE_SYNC_INGEST_URL", "QB_FINANCE_SYNC_INGEST_TOKEN") }
    foreach ($name in $required) {
        if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed $name))) { throw ("Missing required setting: {0}" -f $name) }
    }
    $fin = Get-EnvTrimmed "QB_FINANCE_SYNC_INGEST_TOKEN"
    $sales = Get-EnvTrimmed "QB_SALES_SYNC_INGEST_TOKEN"
    $ad = Get-EnvTrimmed "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN"
    if ($fin -and $sales -and ($fin -eq $sales)) { throw "QB_FINANCE_SYNC_INGEST_TOKEN must not equal QB_SALES_SYNC_INGEST_TOKEN." }
    if ($fin -and $ad -and ($fin -eq $ad)) { throw "QB_FINANCE_SYNC_INGEST_TOKEN must not equal QB_AD_CUSTOMER_SYNC_INGEST_TOKEN." }

    if ($HistoricalBackfill) {
        $allowHistorical = Get-EnvTrimmed "QB_FINANCE_ALLOW_HISTORICAL_BACKFILL"
        if ($allowHistorical -ne "1") {
            throw "Historical backfill is opt-in. -HistoricalBackfill requires QB_FINANCE_ALLOW_HISTORICAL_BACKFILL=1."
        }
    }

    if (-not $SkipLock) {
        Test-PeerQbLock -Path "C:\eliteOS\logs\sales-qb-sync\sales-qb-sync.lock" -Label "Sales" -LogFile $logFile
        Test-PeerQbLock -Path "C:\eliteOS\logs\account-directory-qb-customer-sync\ad-qb-customer-sync.lock" -Label "AD customer" -LogFile $logFile
        $lockPath = Join-Path $SharedLockDir $SharedLockName
        Enter-QbCdataOdbcLock -LockPath $lockPath -LogFile $logFile
        Write-FinanceQbLog -LogFile $logFile -Message ("Shared CData lock acquired pid={0} path={1}" -f $PID, $lockPath)
    }

    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $workerPath, "-Domain", $Domain)
    if ($DryRun) { $argList += "-DryRun" }
    if ($CaptureOpening) { $argList += "-CaptureOpening" }
    if ($ForceCheckpoint) { $argList += "-ForceCheckpoint" }
    if ($HistoricalBackfill) { $argList += "-HistoricalBackfill" }

    Write-FinanceQbLog -LogFile $logFile -Message ("Invoking sync-finance.ps1 Domain={0} DryRun={1} CaptureOpening={2} ForceCheckpoint={3} HistoricalBackfill={4}" -f $Domain, [bool]$DryRun, [bool]$CaptureOpening, [bool]$ForceCheckpoint, [bool]$HistoricalBackfill)
    $output = & powershell.exe @argList 2>&1
    $exitCode = [int]$LASTEXITCODE
    foreach ($item in @($output)) {
        $text = ConvertTo-RedactedLogText -Text ([string]$item)
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            Write-FinanceQbLog -LogFile $logFile -Message ("worker: {0}" -f $text)
        }
    }
    if ($exitCode -eq 0) { Write-FinanceQbLog -LogFile $logFile -Message "RESULT: PASS" }
    else {
        Write-FinanceQbLog -LogFile $logFile -Message ("RESULT: FAIL exitCode={0}" -f $exitCode)
        if ($exitCode -eq 0) { $exitCode = 1 }
    }
} catch {
    $msg = ConvertTo-RedactedLogText -Text ([string]$_.Exception.Message)
    Write-FinanceQbLog -LogFile $logFile -Message ("RESULT: FAIL - {0}" -f $msg)
    $exitCode = 1
} finally {
    Exit-QbCdataOdbcLock -LockPath $lockPath
    if (-not [string]::IsNullOrWhiteSpace($logFile)) {
        Write-FinanceQbLog -LogFile $logFile -Message ("Wrapper finished exitCode={0}" -f $exitCode)
    }
}

exit $exitCode
