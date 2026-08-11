# READ-ONLY QuickBooks Account Directory Customer Sync Worker (PowerShell 5.1)
#
# Transport: CData ODBC System DSN -> outbound HTTPS ingest only.
# Separate from Sales Financial Truth sync (different URL + token).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DiagnoseColumns
#
# Live DSN column verification (read-only; run before first ingest):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DiagnoseColumns
#   # Equivalent SQL against the System DSN:
#   SELECT ColumnName, DataType, Length, IsNullable
#   FROM sys_tablecolumns
#   WHERE TableName = 'Customers'
#   ORDER BY ColumnName
#
# Required env:
#   QB_AD_CUSTOMER_DSN=slabOS_QuickBooks_Local_RO
#   QB_AD_CUSTOMER_EXPECTED_COMPANY=Elite Stone Fabrications
#   QB_AD_CUSTOMER_ORGANIZATION_ID=<uuid>
#   QB_AD_CUSTOMER_SYNC_INGEST_URL=https://<backend>/api/internal/account-directory/quickbooks-customer-sync
#   QB_AD_CUSTOMER_SYNC_INGEST_TOKEN=<secret>
# Optional:
#   QB_AD_CUSTOMER_SYNC_CHUNK_SIZE=400
#
# CData Desktop Customers columns used by this worker:
#   Id (ListID), Name, FullName, ParentId, Sublevel, IsActive, BillingCity, BillingState
# Job detection: ParentId present and/or Sublevel > 0 → child job; else root customer.
# Canonical prepared identity: ListID (Id). The Job boolean column is not used.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$DiagnoseColumns
)

$ErrorActionPreference = "Stop"
$WorkerVersion = "1.0.1"

function Get-EnvOrDefault {
    param([string]$Name, [string]$Default = "")
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
    return $v.Trim()
}

function Assert-SelectOnlySql {
    param([Parameter(Mandatory = $true)][string]$Sql)
    $trimmed = $Sql.Trim()
    if ($trimmed -notmatch '^(?i)SELECT\b') {
        throw "Refusing non-SELECT ODBC statement."
    }
    if ($trimmed -match '(?i)\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|CREATE|ALTER|DROP|TRUNCATE)\b') {
        throw "Refusing mutating/DDL ODBC statement."
    }
    if ($trimmed -match '(?i)\b(AddRq|ModRq|DelRq|TxnDelRq|ListDelRq)\b') {
        throw "Refusing write-oriented QBXML request tags in SQL text."
    }
}

function New-OdbcConnection {
    param([Parameter(Mandatory = $true)][string]$Dsn)
    $conn = New-Object System.Data.Odbc.OdbcConnection
    $conn.ConnectionString = "DSN=$Dsn"
    $conn.Open()
    return $conn
}

function Invoke-ReadOnlyOdbcQuery {
    param(
        [Parameter(Mandatory = $true)]$Connection,
        [Parameter(Mandatory = $true)][string]$Sql
    )
    Assert-SelectOnlySql -Sql $Sql
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = 300
    $reader = $null
    $rows = New-Object System.Collections.Generic.List[object]
    try {
        $reader = $cmd.ExecuteReader()
        while ($reader.Read()) {
            $map = [ordered]@{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $name = $reader.GetName($i)
                if ($reader.IsDBNull($i)) {
                    $map[$name] = $null
                } else {
                    $map[$name] = $reader.GetValue($i)
                }
            }
            [void]$rows.Add([pscustomobject]$map)
        }
    } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $cmd) { $cmd.Dispose() }
    }
    return ,$rows.ToArray()
}

function Convert-ToBool {
    param($Value, [bool]$Default = $true)
    if ($null -eq $Value) { return $Default }
    if ($Value -is [bool]) { return $Value }
    $s = ([string]$Value).Trim().ToLowerInvariant()
    if ($s -eq "true" -or $s -eq "1" -or $s -eq "yes" -or $s -eq "y") { return $true }
    if ($s -eq "false" -or $s -eq "0" -or $s -eq "no" -or $s -eq "n") { return $false }
    return $Default
}

function Test-IsChildJob {
    param(
        $ParentId,
        $Sublevel
    )
    $hasParent = $false
    if ($null -ne $ParentId -and -not [string]::IsNullOrWhiteSpace([string]$ParentId)) {
        $hasParent = $true
    }
    $childSublevel = $false
    if ($null -ne $Sublevel) {
        $n = 0
        if ([int]::TryParse([string]$Sublevel, [ref]$n)) {
            if ($n -gt 0) { $childSublevel = $true }
        }
    }
    return ($hasParent -or $childSublevel)
}

function Invoke-Ingest {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)][hashtable]$Body
    )
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
    $headers = @{
        Authorization = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    $attempt = 0
    while ($true) {
        $attempt++
        try {
            $resp = Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -Body $json -TimeoutSec 120
            return $resp
        } catch {
            if ($attempt -ge 3) { throw }
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}

$dsn = Get-EnvOrDefault "QB_AD_CUSTOMER_DSN" "slabOS_QuickBooks_Local_RO"
$expectedCompany = Get-EnvOrDefault "QB_AD_CUSTOMER_EXPECTED_COMPANY" "Elite Stone Fabrications"
$orgId = Get-EnvOrDefault "QB_AD_CUSTOMER_ORGANIZATION_ID"
$ingestUrl = Get-EnvOrDefault "QB_AD_CUSTOMER_SYNC_INGEST_URL"
$token = Get-EnvOrDefault "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN"
$chunkSize = 400
$chunkRaw = Get-EnvOrDefault "QB_AD_CUSTOMER_SYNC_CHUNK_SIZE" "400"
[void][int]::TryParse($chunkRaw, [ref]$chunkSize)
if ($chunkSize -lt 50) { $chunkSize = 50 }
if ($chunkSize -gt 500) { $chunkSize = 500 }

Write-Host "AD QB customer sync worker $WorkerVersion starting (DryRun=$DryRun DiagnoseColumns=$DiagnoseColumns)"

$conn = $null
$syncRunId = $null
try {
    $conn = New-OdbcConnection -Dsn $dsn

    if ($DiagnoseColumns) {
        $diagSql = @"
SELECT ColumnName, DataType, Length, IsNullable
FROM sys_tablecolumns
WHERE TableName = 'Customers'
ORDER BY ColumnName
"@
        $cols = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $diagSql
        Write-Host ("sys_tablecolumns Customers count={0}" -f $cols.Length)
        foreach ($c in $cols) {
            Write-Host ("  {0}`t{1}`t{2}`t{3}" -f $c.ColumnName, $c.DataType, $c.Length, $c.IsNullable)
        }
        $needed = @("Id", "Name", "FullName", "ParentId", "Sublevel", "IsActive", "BillingCity", "BillingState")
        $names = @{}
        foreach ($c in $cols) { $names[[string]$c.ColumnName] = $true }
        $missing = @()
        foreach ($n in $needed) {
            if (-not $names.ContainsKey($n)) { $missing += $n }
        }
        if ($missing.Count -gt 0) {
            throw ("DiagnoseColumns: missing required Customers columns: {0}" -f ($missing -join ", "))
        }
        Write-Host "RESULT: PASS (DiagnoseColumns — required columns present)"
        exit 0
    }

    if ([string]::IsNullOrWhiteSpace($orgId)) { throw "QB_AD_CUSTOMER_ORGANIZATION_ID is required." }
    if (-not $DryRun) {
        if ([string]::IsNullOrWhiteSpace($ingestUrl)) { throw "QB_AD_CUSTOMER_SYNC_INGEST_URL is required." }
        if ([string]::IsNullOrWhiteSpace($token)) { throw "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN is required." }
    }

    $companyRows = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql "SELECT Name FROM CompanyInfo"
    $companyName = $null
    if ($companyRows.Length -gt 0) {
        $companyName = [string]$companyRows[0].Name
    }
    if ([string]::IsNullOrWhiteSpace($companyName)) {
        throw "CompanyInfo.Name was empty."
    }
    if ($companyName -ne $expectedCompany) {
        throw ("Company gate failed. Expected '{0}' got '{1}'." -f $expectedCompany, $companyName)
    }

    # CData Desktop Customers: Id=ListID. Job detection via ParentId / Sublevel (not Job column).
    $sql = @"
SELECT Id, Name, FullName, ParentId, Sublevel, IsActive, BillingCity, BillingState
FROM Customers
"@
    $rawRows = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $sql
    Write-Host ("Loaded {0} customer/job rows from ODBC" -f $rawRows.Length)

    $customers = New-Object System.Collections.Generic.List[object]
    $roots = 0
    $jobs = 0
    foreach ($r in $rawRows) {
        $listId = [string]$r.Id
        if ([string]::IsNullOrWhiteSpace($listId)) { continue }
        $parentId = $null
        if ($null -ne $r.ParentId -and -not [string]::IsNullOrWhiteSpace([string]$r.ParentId)) {
            $parentId = [string]$r.ParentId
        }
        $isJob = Test-IsChildJob -ParentId $r.ParentId -Sublevel $r.Sublevel
        if ($isJob) { $jobs++ } else { $roots++ }
        [void]$customers.Add([ordered]@{
            qb_list_id = $listId
            parent_list_id = $(if ($isJob) { $parentId } else { $null })
            is_job = $isJob
            name = $(if ($null -ne $r.Name) { [string]$r.Name } else { $null })
            full_name = $(if ($null -ne $r.FullName) { [string]$r.FullName } else { $null })
            is_active = (Convert-ToBool -Value $r.IsActive -Default:$true)
            bill_city = $(if ($null -ne $r.BillingCity) { [string]$r.BillingCity } else { $null })
            bill_state = $(if ($null -ne $r.BillingState) { [string]$r.BillingState } else { $null })
        })
    }

    if ($DryRun) {
        Write-Host ("DRY RUN customers={0} roots={1} jobs={2}" -f $customers.Count, $roots, $jobs)
        Write-Host "RESULT: PASS"
        exit 0
    }

    $begin = Invoke-Ingest -Url $ingestUrl -Token $token -Body @{
        action = "begin"
        organization_id = $orgId
        worker_version = $WorkerVersion
        company_name = $companyName
    }
    $syncRunId = [string]$begin.sync_run_id
    if ([string]::IsNullOrWhiteSpace($syncRunId)) { throw "begin did not return sync_run_id" }

    $arr = $customers.ToArray()
    $upserted = 0
    for ($i = 0; $i -lt $arr.Length; $i += $chunkSize) {
        $end = [Math]::Min($i + $chunkSize - 1, $arr.Length - 1)
        $chunk = @()
        for ($j = $i; $j -le $end; $j++) { $chunk += $arr[$j] }
        $resp = Invoke-Ingest -Url $ingestUrl -Token $token -Body @{
            action = "upsert_customers"
            organization_id = $orgId
            sync_run_id = $syncRunId
            customers = $chunk
        }
        $upserted += [int]$resp.upserted
    }

    $complete = Invoke-Ingest -Url $ingestUrl -Token $token -Body @{
        action = "complete"
        organization_id = $orgId
        sync_run_id = $syncRunId
        status = "success"
        customers_count = $arr.Length
        jobs_count = $jobs
        roots_count = $roots
        run_reconciliation = $true
    }

    Write-Host ("RESULT: PASS upserted={0} suggestions_open={1}" -f $upserted, $complete.suggestions_open_count)
    exit 0
} catch {
    $msg = [string]$_.Exception.Message
    if ($msg -match '(?i)bearer\s+[a-z0-9+/=_-]{8,}|password\s*[:=]') {
        $msg = "Sync failed (secret material redacted)."
    }
    if (-not $DryRun -and -not $DiagnoseColumns -and -not [string]::IsNullOrWhiteSpace($syncRunId) -and -not [string]::IsNullOrWhiteSpace($ingestUrl) -and -not [string]::IsNullOrWhiteSpace($token)) {
        try {
            Invoke-Ingest -Url $ingestUrl -Token $token -Body @{
                action = "complete"
                organization_id = $orgId
                sync_run_id = $syncRunId
                status = "failed"
                error_summary = $msg.Substring(0, [Math]::Min(400, $msg.Length))
                run_reconciliation = $false
            } | Out-Null
        } catch { }
    }
    Write-Host ("RESULT: FAIL - {0}" -f $msg)
    exit 1
} finally {
    if ($null -ne $conn) {
        try { $conn.Close() } catch { }
        try { $conn.Dispose() } catch { }
    }
}
