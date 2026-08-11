# Production wrapper for Account Directory QuickBooks Customer Enrichment sync.
# READ-ONLY ODBC (slabOS_QuickBooks_Local_RO) -> HTTPS ingest. No QB writes.
# Separate from Sales Financial Truth (never uses QB_SALES_*).
#
# Manual verification (before Task Scheduler) — from the eOS working copy on the QB Server:
#   cd C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-ad-qb-customer-sync.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-ad-qb-customer-sync.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-ad-qb-customer-sync.ps1 -ConfigPath C:\eliteOS\config\ad-qb-customer-sync.env
#
# Worker is resolved as Join-Path $PSScriptRoot sync-ad-qb-customers.ps1 (no second repo at C:\eliteOS).
# Runtime config/logs remain under C:\eliteOS\config and C:\eliteOS\logs (outside git).
#
# Do NOT register Task Scheduler from this script — use install-ad-qb-customer-sync-task.ps1 (preview by default).

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [switch]$DryRun,
    [switch]$DiagnoseColumns,
    [switch]$SkipLock
)

$ErrorActionPreference = "Stop"
$WrapperVersion = "1.0.1"
$DefaultConfigPath = "C:\eliteOS\config\ad-qb-customer-sync.env"
$DefaultLogDir = "C:\eliteOS\logs\account-directory-qb-customer-sync"
$LockFileName = "ad-qb-customer-sync.lock"
$WorkerScriptName = "sync-ad-qb-customers.ps1"

function Write-AdQbLog {
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
    # Never persist bearer tokens or common secret shapes.
    $out = [regex]::Replace($out, '(?i)(Bearer\s+)[A-Za-z0-9._\-+=/]{8,}', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(QB_AD_CUSTOMER_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(QB_SALES_SYNC_INGEST_TOKEN\s*[=:]\s*)\S+', '$1***REDACTED***')
    $out = [regex]::Replace($out, '(?i)(password\s*[=:]\s*)\S+', '$1***REDACTED***')
    return $out
}

function Import-AdQbEnvFile {
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
        if ($name -notmatch '^QB_AD_CUSTOMER_') {
            throw ("Refusing non-QB_AD_CUSTOMER_* config key '{0}' in {1}" -f $name, $Path)
        }
        if ($name -match '(?i)SALES') {
            throw ("Refusing Sales-related config key '{0}'. AD worker uses QB_AD_CUSTOMER_* only." -f $name)
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

function Assert-RequiredAdConfig {
    param(
        [switch]$AllowMissingIngest
    )
    $required = @(
        "QB_AD_CUSTOMER_DSN",
        "QB_AD_CUSTOMER_EXPECTED_COMPANY",
        "QB_AD_CUSTOMER_ORGANIZATION_ID"
    )
    if (-not $AllowMissingIngest) {
        $required += @(
            "QB_AD_CUSTOMER_SYNC_INGEST_URL",
            "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN"
        )
    }
    $missing = @()
    foreach ($name in $required) {
        if ([string]::IsNullOrWhiteSpace((Get-EnvTrimmed $name))) {
            $missing += $name
        }
    }
    if ($missing.Count -gt 0) {
        throw ("Missing required AD customer sync settings: {0}" -f ($missing -join ", "))
    }

    # Hard separation from Sales worker secrets.
    $salesToken = Get-EnvTrimmed "QB_SALES_SYNC_INGEST_TOKEN"
    $adToken = Get-EnvTrimmed "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN"
    if (
        -not [string]::IsNullOrWhiteSpace($salesToken) -and
        -not [string]::IsNullOrWhiteSpace($adToken) -and
        ($salesToken -eq $adToken)
    ) {
        throw "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN must not equal QB_SALES_SYNC_INGEST_TOKEN."
    }
}

function New-AdQbLogFile {
    param([Parameter(Mandatory = $true)][string]$LogDir)
    if (-not (Test-Path -LiteralPath $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    $name = "ad-qb-customer-sync-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss")
    return (Join-Path $LogDir $name)
}

function Invoke-AdQbLogRetention {
    param(
        [Parameter(Mandatory = $true)][string]$LogDir,
        [int]$KeepDays = 30
    )
    if (-not (Test-Path -LiteralPath $LogDir)) { return }
    $cutoff = (Get-Date).AddDays(-1 * [Math]::Abs($KeepDays))
    Get-ChildItem -LiteralPath $LogDir -Filter "ad-qb-customer-sync-*.log" -File -ErrorAction SilentlyContinue |
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

function Enter-AdQbSyncLock {
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
                Write-AdQbLog -LogFile $LogFile -Message ("RESULT: FAIL - another AD customer sync is already running (pid={0}, lock={1}). Non-overlap protection engaged." -f $existingPid, $LockPath)
                exit 2
            }
        }
        Write-AdQbLog -LogFile $LogFile -Message ("Stale lock found (pid not running); removing {0}" -f $LockPath)
        Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
    }

    Set-Content -LiteralPath $LockPath -Value ("{0}`r`n{1}" -f $PID, (Get-Date -Format "o")) -Encoding ASCII
}

function Exit-AdQbSyncLock {
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
        Import-AdQbEnvFile -Path $ConfigPath
    } elseif ($ConfigPath -eq $DefaultConfigPath) {
        # Allow Machine/User env-only setups when default file is absent.
    } else {
        throw ("Config file not found: {0}" -f $ConfigPath)
    }

    $customLog = Get-EnvTrimmed "QB_AD_CUSTOMER_SYNC_LOG_DIR"
    if (-not [string]::IsNullOrWhiteSpace($customLog)) { $logDir = $customLog }
    $customLock = Get-EnvTrimmed "QB_AD_CUSTOMER_SYNC_LOCK_DIR"
    if (-not [string]::IsNullOrWhiteSpace($customLock)) { $lockDir = $customLock }

    $logFile = New-AdQbLogFile -LogDir $logDir
    Invoke-AdQbLogRetention -LogDir $logDir -KeepDays 30

    Write-AdQbLog -LogFile $logFile -Message ("AD QB customer sync wrapper {0} starting" -f $WrapperVersion)
    Write-AdQbLog -LogFile $logFile -Message ("ConfigPath={0} DryRun={1} DiagnoseColumns={2}" -f $ConfigPath, [bool]$DryRun, [bool]$DiagnoseColumns)
    Write-AdQbLog -LogFile $logFile -Message ("Worker={0}" -f $workerPath)
    Write-AdQbLog -LogFile $logFile -Message ("DSN={0} Company={1} OrgId={2}" -f (Get-EnvTrimmed "QB_AD_CUSTOMER_DSN"), (Get-EnvTrimmed "QB_AD_CUSTOMER_EXPECTED_COMPANY"), (Get-EnvTrimmed "QB_AD_CUSTOMER_ORGANIZATION_ID"))
    $ingestUrl = Get-EnvTrimmed "QB_AD_CUSTOMER_SYNC_INGEST_URL"
    if (-not [string]::IsNullOrWhiteSpace($ingestUrl)) {
        Write-AdQbLog -LogFile $logFile -Message ("IngestUrl={0}" -f $ingestUrl)
    }
    Write-AdQbLog -LogFile $logFile -Message "IngestToken=(set but never logged)"

    Assert-RequiredAdConfig -AllowMissingIngest:($DryRun -or $DiagnoseColumns)

    if (-not $SkipLock) {
        $lockPath = Join-Path $lockDir $LockFileName
        Enter-AdQbSyncLock -LockPath $lockPath -LogFile $logFile
        Write-AdQbLog -LogFile $logFile -Message ("Lock acquired pid={0} path={1}" -f $PID, $lockPath)
    }

    $argList = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $workerPath
    )
    if ($DryRun) { $argList += "-DryRun" }
    if ($DiagnoseColumns) { $argList += "-DiagnoseColumns" }

    Write-AdQbLog -LogFile $logFile -Message "Invoking sync-ad-qb-customers.ps1"
    $output = & powershell.exe @argList 2>&1
    $exitCode = [int]$LASTEXITCODE
    foreach ($item in @($output)) {
        $text = ConvertTo-RedactedLogText -Text ([string]$item)
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            Write-AdQbLog -LogFile $logFile -Message ("worker: {0}" -f $text)
        }
    }

    if ($exitCode -eq 0) {
        Write-AdQbLog -LogFile $logFile -Message "RESULT: PASS"
    } else {
        Write-AdQbLog -LogFile $logFile -Message ("RESULT: FAIL exitCode={0}" -f $exitCode)
        if ($exitCode -eq 0) { $exitCode = 1 }
    }
} catch {
    $msg = ConvertTo-RedactedLogText -Text ([string]$_.Exception.Message)
    if ($null -eq $logFile) {
        try { $logFile = New-AdQbLogFile -LogDir $DefaultLogDir } catch { $logFile = "" }
    }
    Write-AdQbLog -LogFile $logFile -Message ("RESULT: FAIL - {0}" -f $msg)
    $exitCode = 1
} finally {
    Exit-AdQbSyncLock -LockPath $lockPath
    if (-not [string]::IsNullOrWhiteSpace($logFile)) {
        Write-AdQbLog -LogFile $logFile -Message ("Wrapper finished exitCode={0} log={1}" -f $exitCode, $logFile)
        Write-Host ""
        Write-Host "Log retention: keep ~30 days of ad-qb-customer-sync-*.log under the log directory; wrapper deletes older files on each run."
        Write-Host ("Log file: {0}" -f $logFile)
    }
}

exit $exitCode
