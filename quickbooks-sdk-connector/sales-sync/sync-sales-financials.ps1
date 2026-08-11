# READ-ONLY QuickBooks Sales Financial Sync Worker (PowerShell 5.1)
#
# Transport: CData ODBC System DSN -> outbound HTTPS ingest only.
# Does NOT use Gateway raw HTTP.
# Does NOT require Node/Python/npm on the QB Server.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1 -Backfill
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1 -DryRun
#
# Required env:
#   QB_SALES_DSN=slabOS_QuickBooks_Local_RO
#   QB_SALES_EXPECTED_COMPANY=Elite Stone Fabrications
#   QB_SALES_ORGANIZATION_ID=<uuid>
#   QB_SALES_SYNC_INGEST_URL=https://<backend>/api/internal/sales/quickbooks-sync
#   QB_SALES_SYNC_INGEST_TOKEN=<secret>
# Optional:
#   QB_SALES_SYNC_START_DATE=YYYY-MM-DD   (required for -Backfill)
#   QB_SALES_SYNC_LOOKBACK_DAYS=60
#   QB_SALES_SYNC_CHUNK_SIZE=400

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Backfill,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$WorkerVersion = "1.0.0"

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

function Convert-ToYmd {
    param($Value)
    if ($null -eq $Value -or $Value -eq "") { return $null }
    if ($Value -is [datetime]) { return $Value.ToString("yyyy-MM-dd") }
    $parsed = [datetime]::MinValue
    if ([datetime]::TryParse([string]$Value, [ref]$parsed)) {
        return $parsed.ToString("yyyy-MM-dd")
    }
    $s = [string]$Value
    if ($s -match '^\d{4}-\d{2}-\d{2}') { return $s.Substring(0, 10) }
    return $null
}

function Convert-ToNumber {
    param($Value)
    if ($null -eq $Value -or $Value -eq "") { return $null }
    $n = 0.0
    if ([double]::TryParse([string]$Value, [ref]$n)) { return $n }
    return $null
}

function New-OdbcConnection {
    param([Parameter(Mandatory = $true)][string]$Dsn)
    # Windows PowerShell 5.1: constructor-argument form throws "Argument types do not match".
    # Set ConnectionString after New-Object (proven on QB Server).
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
            $rows.Add([pscustomobject]$map) | Out-Null
        }
    } finally {
        if ($null -ne $reader) { $reader.Close(); $reader.Dispose() }
        $cmd.Dispose()
    }
    # PS 5.1: @($genericList) throws "Argument types do not match"; use ToArray().
    return $rows.ToArray()
}

function Get-MonthWindows {
    param(
        [Parameter(Mandatory = $true)][datetime]$Start,
        [Parameter(Mandatory = $true)][datetime]$End
    )
    $windows = New-Object System.Collections.Generic.List[object]
    $cursor = Get-Date -Year $Start.Year -Month $Start.Month -Day 1
    $endDay = $End.Date
    while ($cursor -le $endDay) {
        $monthStart = $cursor
        $monthEnd = $cursor.AddMonths(1).AddDays(-1)
        if ($monthStart -lt $Start.Date) { $monthStart = $Start.Date }
        if ($monthEnd -gt $endDay) { $monthEnd = $endDay }
        $windows.Add([pscustomobject]@{
            Start = $monthStart
            End = $monthEnd
        }) | Out-Null
        $cursor = $cursor.AddMonths(1)
    }
    return $windows.ToArray()
}

function Format-UsDate {
    param([datetime]$Date)
    return $Date.ToString("M/d/yyyy")
}

function Invoke-Ingest {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)]$Body,
        [int]$MaxAttempts = 3
    )
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
    if ($json -match '(?i)password\s*[:=]|QB_SALES_SYNC_INGEST_TOKEN') {
        throw "Refusing to send payload that appears to contain secrets."
    }
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
            if ($attempt -ge $MaxAttempts) { throw }
            Start-Sleep -Seconds ([Math]::Min(8, $attempt * 2))
        }
    }
}

function Send-TransactionChunks {
    param(
        $Url, $Token, $OrganizationId, $SyncRunId, $Rows, [int]$ChunkSize, [switch]$DryRun
    )
    # Normalize input to a true array (never @($Generic.List)).
    $rowArray = [array]$Rows
    if ($null -eq $rowArray) { $rowArray = @() }
    $total = $rowArray.Length
    $upserted = 0
    for ($i = 0; $i -lt $total; $i += $ChunkSize) {
        $chunk = [array]($rowArray | Select-Object -Skip $i -First $ChunkSize)
        if ($null -eq $chunk) { $chunk = @() }
        $payload = @{
            action = "upsert_transactions"
            organization_id = $OrganizationId
            sync_run_id = $SyncRunId
            transactions = $chunk
        }
        if ($DryRun) {
            Write-Host ("  DryRun chunk transactions {0}-{1}" -f $i, ($i + $chunk.Length - 1))
        } else {
            $resp = Invoke-Ingest -Url $Url -Token $Token -Body $payload
            $upserted += [int]($resp.upserted)
        }
    }
    return $upserted
}

# --- config ---
$Dsn = Get-EnvOrDefault "QB_SALES_DSN" "slabOS_QuickBooks_Local_RO"
$ExpectedCompany = Get-EnvOrDefault "QB_SALES_EXPECTED_COMPANY" "Elite Stone Fabrications"
$OrganizationId = Get-EnvOrDefault "QB_SALES_ORGANIZATION_ID" ""
$IngestUrl = Get-EnvOrDefault "QB_SALES_SYNC_INGEST_URL" ""
$IngestToken = Get-EnvOrDefault "QB_SALES_SYNC_INGEST_TOKEN" ""
$StartDateEnv = Get-EnvOrDefault "QB_SALES_SYNC_START_DATE" ""
$LookbackDays = 60
[void][int]::TryParse((Get-EnvOrDefault "QB_SALES_SYNC_LOOKBACK_DAYS" "60"), [ref]$LookbackDays)
if ($LookbackDays -lt 1) { $LookbackDays = 60 }
$ChunkSize = 400
[void][int]::TryParse((Get-EnvOrDefault "QB_SALES_SYNC_CHUNK_SIZE" "400"), [ref]$ChunkSize)
if ($ChunkSize -lt 50) { $ChunkSize = 50 }
if ($ChunkSize -gt 500) { $ChunkSize = 500 }

Write-Host ""
Write-Host "============================================================"
Write-Host " EliteOS QuickBooks Sales ODBC Sync Worker $WorkerVersion"
Write-Host " READ-ONLY - DSN $Dsn"
Write-Host "============================================================"
Write-Host ""

if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
    throw "QB_SALES_ORGANIZATION_ID is required."
}
if (-not $DryRun) {
    if ([string]::IsNullOrWhiteSpace($IngestUrl)) { throw "QB_SALES_SYNC_INGEST_URL is required (or use -DryRun)." }
    if ([string]::IsNullOrWhiteSpace($IngestToken)) { throw "QB_SALES_SYNC_INGEST_TOKEN is required (or use -DryRun)." }
}

$today = (Get-Date).Date
$coverageStart = $null
$coverageEnd = $today
$windows = @()

if ($Backfill) {
    if ([string]::IsNullOrWhiteSpace($StartDateEnv)) {
        throw "-Backfill requires QB_SALES_SYNC_START_DATE=YYYY-MM-DD"
    }
    $parsedStart = [datetime]::ParseExact($StartDateEnv, "yyyy-MM-dd", $null)
    $coverageStart = $parsedStart.Date
    $windows = Get-MonthWindows -Start $coverageStart -End $coverageEnd
    Write-Host ("Mode: Backfill {0} -> {1} ({2} month windows)" -f $coverageStart.ToString("yyyy-MM-dd"), $coverageEnd.ToString("yyyy-MM-dd"), $windows.Count)
} else {
    $coverageStart = $today.AddDays(-1 * $LookbackDays)
    $windows = @([pscustomobject]@{ Start = $coverageStart; End = $coverageEnd })
    Write-Host ("Mode: Incremental lookback {0} days ({1} -> {2})" -f $LookbackDays, $coverageStart.ToString("yyyy-MM-dd"), $coverageEnd.ToString("yyyy-MM-dd"))
}

$conn = $null
$syncRunId = $null
$estimateRows = New-Object System.Collections.Generic.List[object]
$salesOrderRows = New-Object System.Collections.Generic.List[object]
$invoiceRows = New-Object System.Collections.Generic.List[object]
$paymentRows = New-Object System.Collections.Generic.List[object]
$openArRows = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]

try {
    $conn = New-OdbcConnection -Dsn $Dsn

    $companyRows = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql "SELECT Name FROM CompanyInfo"
    $companyRowArray = [array]$companyRows
    if ($null -eq $companyRowArray -or $companyRowArray.Length -lt 1) { throw "CompanyInfo returned no rows." }
    $companyName = [string]$companyRowArray[0].Name
    if ($companyName -ne $ExpectedCompany) {
        throw ("Company gate failed. Expected '{0}' but ODBC returned '{1}'." -f $ExpectedCompany, $companyName)
    }
    Write-Host ("Company verified: {0}" -f $companyName)

    if (-not $DryRun) {
        $begin = Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body @{
            action = "begin"
            organization_id = $OrganizationId
            worker_version = $WorkerVersion
            company_name = $companyName
            coverage_start_date = $coverageStart.ToString("yyyy-MM-dd")
            coverage_end_date = $coverageEnd.ToString("yyyy-MM-dd")
        }
        $syncRunId = [string]$begin.sync_run_id
        Write-Host ("Sync run: {0}" -f $syncRunId)
    } else {
        $syncRunId = "dry-run"
        Write-Host "DryRun: skipping ingest begin"
    }

    foreach ($w in $windows) {
        $startUs = Format-UsDate -Date $w.Start
        $endUs = Format-UsDate -Date $w.End
        Write-Host ("Window {0} -> {1}" -f $w.Start.ToString("yyyy-MM-dd"), $w.End.ToString("yyyy-MM-dd"))

        $estSql = @"
SELECT Id, ReferenceNumber, Date, CustomerName, TotalAmount
FROM Estimates
WHERE Date >= '$startUs'
  AND Date <= '$endUs'
"@
        foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $estSql)) {
            $amt = Convert-ToNumber $r.TotalAmount
            $dt = Convert-ToYmd $r.Date
            if ($null -eq $amt -or [string]::IsNullOrWhiteSpace([string]$r.Id) -or [string]::IsNullOrWhiteSpace($dt)) { continue }
            $estimateRows.Add([ordered]@{
                transaction_type = "estimate"
                source_id = [string]$r.Id
                reference_number = $(if ($null -ne $r.ReferenceNumber) { [string]$r.ReferenceNumber } else { $null })
                transaction_date = $dt
                customer_name = $(if ($null -ne $r.CustomerName) { [string]$r.CustomerName } else { $null })
                amount = $amt
            }) | Out-Null
        }

        $soSql = @"
SELECT Id, ReferenceNumber, Date, CustomerName, TotalAmount
FROM SalesOrders
WHERE Date >= '$startUs'
  AND Date <= '$endUs'
"@
        foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $soSql)) {
            $amt = Convert-ToNumber $r.TotalAmount
            $dt = Convert-ToYmd $r.Date
            if ($null -eq $amt -or [string]::IsNullOrWhiteSpace([string]$r.Id) -or [string]::IsNullOrWhiteSpace($dt)) { continue }
            $salesOrderRows.Add([ordered]@{
                transaction_type = "sales_order"
                source_id = [string]$r.Id
                reference_number = $(if ($null -ne $r.ReferenceNumber) { [string]$r.ReferenceNumber } else { $null })
                transaction_date = $dt
                customer_name = $(if ($null -ne $r.CustomerName) { [string]$r.CustomerName } else { $null })
                amount = $amt
            }) | Out-Null
        }

        $invSql = @"
SELECT Id, ReferenceNumber, Date, CustomerName, Amount
FROM Invoices
WHERE Date >= '$startUs'
  AND Date <= '$endUs'
"@
        foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $invSql)) {
            $amt = Convert-ToNumber $r.Amount
            $dt = Convert-ToYmd $r.Date
            if ($null -eq $amt -or [string]::IsNullOrWhiteSpace([string]$r.Id) -or [string]::IsNullOrWhiteSpace($dt)) { continue }
            $invoiceRows.Add([ordered]@{
                transaction_type = "invoice"
                source_id = [string]$r.Id
                reference_number = $(if ($null -ne $r.ReferenceNumber) { [string]$r.ReferenceNumber } else { $null })
                transaction_date = $dt
                customer_name = $(if ($null -ne $r.CustomerName) { [string]$r.CustomerName } else { $null })
                amount = $amt
            }) | Out-Null
        }

        $paySql = @"
SELECT Id, ReferenceNumber, Date, CustomerName, Amount, UnusedPayment
FROM ReceivePayments
WHERE Date >= '$startUs'
  AND Date <= '$endUs'
"@
        foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $paySql)) {
            $amt = Convert-ToNumber $r.Amount
            $dt = Convert-ToYmd $r.Date
            if ($null -eq $amt -or [string]::IsNullOrWhiteSpace([string]$r.Id) -or [string]::IsNullOrWhiteSpace($dt)) { continue }
            $paymentRows.Add([ordered]@{
                transaction_type = "payment"
                source_id = [string]$r.Id
                reference_number = $(if ($null -ne $r.ReferenceNumber) { [string]$r.ReferenceNumber } else { $null })
                transaction_date = $dt
                customer_name = $(if ($null -ne $r.CustomerName) { [string]$r.CustomerName } else { $null })
                amount = $amt
            }) | Out-Null
        }
    }

    Write-Host ("Estimates: {0} rows" -f $estimateRows.Count)
    Write-Host ("Sales Orders: {0} rows" -f $salesOrderRows.Count)
    Write-Host ("Invoices: {0} rows" -f $invoiceRows.Count)
    Write-Host ("Payments: {0} rows" -f $paymentRows.Count)

    $allTxn = New-Object System.Collections.Generic.List[object]
    if ($estimateRows.Count -gt 0) { $allTxn.AddRange($estimateRows) }
    if ($salesOrderRows.Count -gt 0) { $allTxn.AddRange($salesOrderRows) }
    if ($invoiceRows.Count -gt 0) { $allTxn.AddRange($invoiceRows) }
    if ($paymentRows.Count -gt 0) { $allTxn.AddRange($paymentRows) }
    $allTxnArray = $allTxn.ToArray()

    if (-not $DryRun) {
        [void](Send-TransactionChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Rows $allTxnArray -ChunkSize $ChunkSize)
    } else {
        [void](Send-TransactionChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Rows $allTxnArray -ChunkSize $ChunkSize -DryRun)
    }

    $arSql = @"
SELECT Id, ReferenceNumber, Date, CustomerName, Amount, Balance, IsPaid
FROM Invoices
WHERE IsPaid = false
"@
    foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $arSql)) {
        $bal = Convert-ToNumber $r.Balance
        if ($null -eq $bal -or $bal -le 0) { continue }
        if ([string]::IsNullOrWhiteSpace([string]$r.Id)) { continue }
        $openArRows.Add([ordered]@{
            source_invoice_id = [string]$r.Id
            reference_number = $(if ($null -ne $r.ReferenceNumber) { [string]$r.ReferenceNumber } else { $null })
            invoice_date = Convert-ToYmd $r.Date
            customer_name = $(if ($null -ne $r.CustomerName) { [string]$r.CustomerName } else { $null })
            original_amount = Convert-ToNumber $r.Amount
            balance = $bal
        }) | Out-Null
    }
    Write-Host ("Open A/R: {0} rows" -f $openArRows.Count)

    if (-not $DryRun) {
        $arPayload = @{
            action = "replace_open_ar"
            organization_id = $OrganizationId
            sync_run_id = $syncRunId
            open_ar = $openArRows.ToArray()
            allow_empty_open_ar = $false
        }
        [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body $arPayload)

        [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body @{
            action = "complete"
            organization_id = $OrganizationId
            sync_run_id = $syncRunId
            status = "success"
            company_name = $companyName
            coverage_start_date = $coverageStart.ToString("yyyy-MM-dd")
            coverage_end_date = $coverageEnd.ToString("yyyy-MM-dd")
            estimates_count = $estimateRows.Count
            sales_orders_count = $salesOrderRows.Count
            invoices_count = $invoiceRows.Count
            payments_count = $paymentRows.Count
            open_ar_count = $openArRows.Count
            warnings = $warnings.ToArray()
        })
        Write-Host "Upload complete"
    } else {
        Write-Host "DryRun complete (no upload)"
    }

    Write-Host "RESULT: PASS"
    exit 0
} catch {
    $msg = [string]$_.Exception.Message
    if ($msg -match '(?i)bearer\s+[a-z0-9+/=_-]{8,}|password\s*[:=]') {
        $msg = "Sync failed (secret material redacted)."
    }
    Write-Host ("RESULT: FAIL - {0}" -f $msg)
    if (-not $DryRun -and -not [string]::IsNullOrWhiteSpace($syncRunId) -and $syncRunId -ne "dry-run") {
        try {
            [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body @{
                action = "complete"
                organization_id = $OrganizationId
                sync_run_id = $syncRunId
                status = "failed"
                error_summary = $msg.Substring(0, [Math]::Min(400, $msg.Length))
                estimates_count = $estimateRows.Count
                sales_orders_count = $salesOrderRows.Count
                invoices_count = $invoiceRows.Count
                payments_count = $paymentRows.Count
                open_ar_count = $openArRows.Count
            })
        } catch {
            Write-Host "WARN: failed to mark sync run failed"
        }
    }
    exit 1
} finally {
    if ($null -ne $conn) {
        try { $conn.Close() } catch {}
        try { $conn.Dispose() } catch {}
    }
    $IngestToken = $null
}
