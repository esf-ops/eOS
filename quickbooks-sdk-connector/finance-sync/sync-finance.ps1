# READ-ONLY QuickBooks Full Finance Foundation worker (PowerShell 5.1)
#
# Isolated domains. SELECT-only CData ODBC. No QuickBooks writes.
# Does NOT run 2025 historical backfill in Phase 1.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-finance.ps1 -Domain master -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-finance.ps1 -Domain ap
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-finance.ps1 -Domain accounting -CaptureOpening -DryRun
#
# Required env:
#   QB_FINANCE_DSN=slabOS_QuickBooks_Local_RO
#   QB_FINANCE_EXPECTED_COMPANY=Elite Stone Fabrications
#   QB_FINANCE_ORGANIZATION_ID=<uuid>
#   QB_FINANCE_SYNC_INGEST_URL=https://<backend>/api/internal/finance/quickbooks-sync
#   QB_FINANCE_SYNC_INGEST_TOKEN=<secret>  # NOT sales or AD tokens

#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("master", "revenue_ar", "ap", "cash", "accounting")]
    [string]$Domain,
    [switch]$DryRun,
    [switch]$CaptureOpening,
    [switch]$ForceCheckpoint,
    [switch]$HistoricalBackfill
)

$ErrorActionPreference = "Stop"
$WorkerVersion = "1.0.0"
$OpeningAsOf = "2024-12-31"
$HistoricalStart = "2025-01-01"

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
                if ($reader.IsDBNull($i)) { $map[$name] = $null }
                else { $map[$name] = $reader.GetValue($i) }
            }
            $rows.Add([pscustomobject]$map) | Out-Null
        }
    } finally {
        if ($null -ne $reader) { $reader.Close(); $reader.Dispose() }
        $cmd.Dispose()
    }
    return $rows.ToArray()
}

function Format-UsDate {
    param([datetime]$Date)
    return $Date.ToString("M/d/yyyy")
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
        $windows.Add([pscustomobject]@{ Start = $monthStart; End = $monthEnd }) | Out-Null
        $cursor = $cursor.AddMonths(1)
    }
    return $windows.ToArray()
}

function Invoke-Ingest {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)]$Body,
        [int]$MaxAttempts = 3
    )
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
    if ($json -match '(?i)password\s*[:=]|QB_FINANCE_SYNC_INGEST_TOKEN|QB_SALES_SYNC_INGEST_TOKEN') {
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
            return Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -Body $json -TimeoutSec 120
        } catch {
            if ($attempt -ge $MaxAttempts) { throw }
            Start-Sleep -Seconds ([Math]::Min(8, $attempt * 2))
        }
    }
}

function Send-UpsertChunks {
    param($Url, $Token, $OrganizationId, $SyncRunId, $Dataset, $Rows, [int]$ChunkSize, [switch]$DryRun)
    $rowArray = [array]$Rows
    if ($null -eq $rowArray) { $rowArray = @() }
    $total = $rowArray.Length
    $upserted = 0
    for ($i = 0; $i -lt $total; $i += $ChunkSize) {
        $chunk = [array]($rowArray | Select-Object -Skip $i -First $ChunkSize)
        if ($null -eq $chunk) { $chunk = @() }
        $payload = @{
            action = "upsert"
            organization_id = $OrganizationId
            sync_run_id = $SyncRunId
            dataset = $Dataset
            rows = $chunk
        }
        if ($DryRun) {
            Write-Host ("  DryRun upsert {0} {1}-{2}" -f $Dataset, $i, ($i + $chunk.Length - 1))
        } else {
            $resp = Invoke-Ingest -Url $Url -Token $Token -Body $payload
            $upserted += [int]($resp.upserted)
        }
    }
    return @{ upserted = $upserted; received = $total }
}

function Send-Checkpoint {
    param($Url, $Token, $OrganizationId, $SyncRunId, $Domain, $Dataset, $Start, $End, $Status, $RowCount, [switch]$DryRun, [switch]$Force)
    $payload = @{
        action = "checkpoint"
        organization_id = $OrganizationId
        sync_run_id = $SyncRunId
        domain = $Domain
        dataset = $Dataset
        period_start = $Start.ToString("yyyy-MM-dd")
        period_end = $End.ToString("yyyy-MM-dd")
        status = $Status
        row_count = $RowCount
        force = [bool]$Force
    }
    if ($DryRun) {
        Write-Host ("  DryRun checkpoint {0} {1} {2}" -f $Dataset, $Status, $payload.period_start)
        return @{ ok = $true; skipped = $false }
    }
    return Invoke-Ingest -Url $Url -Token $Token -Body $payload
}

# --- config ---
$Dsn = Get-EnvOrDefault "QB_FINANCE_DSN" "slabOS_QuickBooks_Local_RO"
$ExpectedCompany = Get-EnvOrDefault "QB_FINANCE_EXPECTED_COMPANY" "Elite Stone Fabrications"
$OrganizationId = Get-EnvOrDefault "QB_FINANCE_ORGANIZATION_ID" ""
$IngestUrl = Get-EnvOrDefault "QB_FINANCE_SYNC_INGEST_URL" ""
$IngestToken = Get-EnvOrDefault "QB_FINANCE_SYNC_INGEST_TOKEN" ""
$LookbackDays = 14
[void][int]::TryParse((Get-EnvOrDefault "QB_FINANCE_SYNC_LOOKBACK_DAYS" "14"), [ref]$LookbackDays)
if ($LookbackDays -lt 1) { $LookbackDays = 14 }
$ChunkSize = 400
[void][int]::TryParse((Get-EnvOrDefault "QB_FINANCE_SYNC_CHUNK_SIZE" "400"), [ref]$ChunkSize)
if ($ChunkSize -lt 50) { $ChunkSize = 50 }
if ($ChunkSize -gt 500) { $ChunkSize = 500 }
$AllowHistorical = Get-EnvOrDefault "QB_FINANCE_ALLOW_HISTORICAL_BACKFILL" ""

Write-Host ""
Write-Host "============================================================"
Write-Host " eliteOS QuickBooks Finance Foundation worker $WorkerVersion"
Write-Host " READ-ONLY domain=$Domain DSN=$Dsn"
Write-Host " Canonical basis=Accrual. No QB writes."
Write-Host "============================================================"
Write-Host ""

if ($HistoricalBackfill) {
    if ($AllowHistorical -ne "1") {
        throw "Phase 1 refuses historical backfill. Do not set -HistoricalBackfill (QB_FINANCE_ALLOW_HISTORICAL_BACKFILL is not 1)."
    }
}

if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
    throw "QB_FINANCE_ORGANIZATION_ID is required."
}
if (-not $DryRun) {
    if ([string]::IsNullOrWhiteSpace($IngestUrl)) { throw "QB_FINANCE_SYNC_INGEST_URL is required (or use -DryRun)." }
    if ([string]::IsNullOrWhiteSpace($IngestToken)) { throw "QB_FINANCE_SYNC_INGEST_TOKEN is required (or use -DryRun)." }
}

$today = (Get-Date).Date
$coverageEnd = $today
$coverageStart = $today.AddDays(-1 * $LookbackDays)
$runKind = "incremental"
if ($CaptureOpening) {
    if ($Domain -ne "accounting") { throw "-CaptureOpening is only valid with -Domain accounting" }
    $coverageStart = [datetime]::ParseExact($OpeningAsOf, "yyyy-MM-dd", $null)
    $coverageEnd = $coverageStart
    $runKind = "opening"
}
if ($HistoricalBackfill) {
    $coverageStart = [datetime]::ParseExact($HistoricalStart, "yyyy-MM-dd", $null)
    $runKind = "window"
}

$windows = @()
if ($Domain -eq "master" -or $CaptureOpening) {
    $windows = @([pscustomobject]@{ Start = $coverageStart; End = $coverageEnd })
} else {
    $windows = Get-MonthWindows -Start $coverageStart -End $coverageEnd
}

Write-Host ("Mode={0} {1} -> {2} windows={3}" -f $runKind, $coverageStart.ToString("yyyy-MM-dd"), $coverageEnd.ToString("yyyy-MM-dd"), $windows.Count)

$conn = $null
$syncRunId = $null
$rowCounts = @{}
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
            domain = $Domain
            run_kind = $runKind
            worker_version = $WorkerVersion
            company_name = $companyName
            coverage_start_date = $coverageStart.ToString("yyyy-MM-dd")
            coverage_end_date = $coverageEnd.ToString("yyyy-MM-dd")
            report_basis = "Accrual"
        }
        $syncRunId = [string]$begin.sync_run_id
        Write-Host ("Sync run: {0}" -f $syncRunId)
    } else {
        $syncRunId = "dry-run"
        Write-Host "DryRun: skipping ingest begin"
    }

    function Invoke-DomainWindow {
        param($Window)
        $startUs = Format-UsDate -Date $Window.Start
        $endUs = Format-UsDate -Date $Window.End
        Write-Host ("Window {0} -> {1}" -f $Window.Start.ToString("yyyy-MM-dd"), $Window.End.ToString("yyyy-MM-dd"))

        if ($Domain -eq "master") {
            $acctSql = "SELECT ID, Name, FullName, Type, SpecialType, Number, Balance, AccountBalance, ParentId, ParentName, CashFlowClassification, IsActive, TimeModified FROM Accounts"
            $accts = @()
            foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $acctSql)) {
                $accts += [ordered]@{
                    qb_account_id = [string]$r.ID
                    name = $r.Name
                    full_name = $r.FullName
                    account_type = $r.Type
                    special_type = $r.SpecialType
                    account_number = $r.Number
                    current_balance = (Convert-ToNumber $r.Balance)
                    account_balance = (Convert-ToNumber $r.AccountBalance)
                    parent_account_id = $r.ParentId
                    parent_account_name = $r.ParentName
                    cash_flow_classification = $r.CashFlowClassification
                    is_active = $r.IsActive
                    time_modified = $r.TimeModified
                }
            }
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "accounts" -Rows $accts -ChunkSize $ChunkSize -DryRun:$DryRun)
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "account_balances_current" -Rows $accts -ChunkSize $ChunkSize -DryRun:$DryRun)
            $vendSql = "SELECT ID, Name, Company, Type, IsActive, AccountNumber, TimeModified FROM Vendors"
            $vendors = @()
            foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $vendSql)) {
                $vendors += [ordered]@{
                    qb_vendor_id = [string]$r.ID
                    name = $r.Name
                    company_name = $r.Company
                    vendor_type_name = $r.Type
                    is_active = $r.IsActive
                    account_number = $r.AccountNumber
                    time_modified = $r.TimeModified
                }
            }
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "vendors" -Rows $vendors -ChunkSize $ChunkSize -DryRun:$DryRun)
            $script:rowCounts["accounts"] = $accts.Count
            $script:rowCounts["vendors"] = $vendors.Count
            Write-Host ("  accounts={0} vendors={1}" -f $accts.Count, $vendors.Count)
            return
        }

        if ($Domain -eq "revenue_ar") {
            $datasets = @(
                @{ Name = "payment_applications"; Sql = @"
SELECT ID, ReceivePaymentId, AppliedToRefId, AppliedToAmount, AppliedToPaymentAmount, AppliedToTxnType, AppliedToTxnDate, AppliedToReferenceNumber, CustomerId, CustomerName, Date, TimeModified
FROM ReceivePaymentsAppliedTo
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@ },
                @{ Name = "credit_memos"; Sql = @"
SELECT ID, ReferenceNumber, Date, CustomerId, CustomerName, TotalAmount, OpenAmount, Memo, TimeModified
FROM CreditMemos
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@ },
                @{ Name = "sales_receipts"; Sql = @"
SELECT ID, ReferenceNumber, Date, CustomerId, CustomerName, TotalAmount, DepositToAccount, DepositToAccountId, Memo, TimeModified
FROM SalesReceipts
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@ }
            )
            foreach ($ds in $datasets) {
                $ck = Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset $ds.Name -Start $Window.Start -End $Window.End -Status "running" -RowCount 0 -DryRun:$DryRun -Force:$ForceCheckpoint
                if ($ck.skipped) { Write-Host ("  skip {0} (checkpoint success)" -f $ds.Name); continue }
                $mapped = New-Object System.Collections.Generic.List[object]
                foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $ds.Sql)) {
                    $mapped.Add($r) | Out-Null
                }
                $arr = $mapped.ToArray()
                [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset $ds.Name -Rows $arr -ChunkSize $ChunkSize -DryRun:$DryRun)
                [void](Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset $ds.Name -Start $Window.Start -End $Window.End -Status "success" -RowCount $arr.Length -DryRun:$DryRun -Force:$ForceCheckpoint)
                $script:rowCounts[$ds.Name] = ([int]$script:rowCounts[$ds.Name]) + $arr.Length
                Write-Host ("  {0}={1}" -f $ds.Name, $arr.Length)
            }
            return
        }

        if ($Domain -eq "ap") {
            $billSql = @"
SELECT ID, ReferenceNumber, Date, DueDate, Terms, TermsId, VendorName, VendorId, Amount, OpenAmount, IsPaid, AccountsPayable, AccountsPayableId, Memo, TimeCreated, TimeModified
FROM Bills
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@
            $ck = Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset "bills" -Start $Window.Start -End $Window.End -Status "running" -RowCount 0 -DryRun:$DryRun -Force:$ForceCheckpoint
            if (-not $ck.skipped) {
                $bills = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $billSql
                [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "bills" -Rows $bills -ChunkSize $ChunkSize -DryRun:$DryRun)
                [void](Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset "bills" -Start $Window.Start -End $Window.End -Status "success" -RowCount @($bills).Length -DryRun:$DryRun -Force:$ForceCheckpoint)
                $script:rowCounts["bills"] = ([int]$script:rowCounts["bills"]) + @($bills).Length
                Write-Host ("  bills={0}" -f @($bills).Length)
            }

            foreach ($pair in @(
                @{ Dataset = "bill_applications"; Method = "check"; Sql = @"
SELECT ID, BillPaymentId, PayeeName, PayeeId, Date, AppliedToRefId, AppliedToAmount, AppliedToBalanceRemaining, AppliedToReferenceNumber, AppliedToTxnDate, AppliedToTxnType, BankAccountId, BankAccountName, TimeModified
FROM BillPaymentChecksAppliedTo
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@ },
                @{ Dataset = "bill_applications"; Method = "credit_card"; Sql = @"
SELECT ID, BillPaymentId, PayeeName, PayeeId, Date, AppliedToRefId, AppliedToAmount, AppliedToBalanceRemaining, AppliedToReferenceNumber, AppliedToTxnDate, AppliedToTxnType, TimeModified
FROM BillPaymentCreditCardsAppliedTo
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@ }
            )) {
                $ckName = "bill_applications_$($pair.Method)"
                $ck2 = Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset $ckName -Start $Window.Start -End $Window.End -Status "running" -RowCount 0 -DryRun:$DryRun -Force:$ForceCheckpoint
                if ($ck2.skipped) { continue }
                $rows = New-Object System.Collections.Generic.List[object]
                foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $pair.Sql)) {
                    $ht = [ordered]@{}
                    $r.PSObject.Properties | ForEach-Object { $ht[$_.Name] = $_.Value }
                    $ht["payment_method"] = $pair.Method
                    $rows.Add([pscustomobject]$ht) | Out-Null
                }
                $arr = $rows.ToArray()
                [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "bill_applications" -Rows $arr -ChunkSize $ChunkSize -DryRun:$DryRun)
                [void](Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset $ckName -Start $Window.Start -End $Window.End -Status "success" -RowCount $arr.Length -DryRun:$DryRun -Force:$ForceCheckpoint)
                Write-Host ("  {0}={1}" -f $ckName, $arr.Length)
            }

            $vcSql = @"
SELECT ID, ReferenceNumber, Date, VendorId, VendorName, Amount, Memo, TimeModified
FROM VendorCredits
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@
            $credits = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $vcSql
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "vendor_credits" -Rows $credits -ChunkSize $ChunkSize -DryRun:$DryRun)

            # Current Open A/P snapshot once per run (last window)
            if ($Window.End.Date -eq $coverageEnd) {
                $openSql = "SELECT ID, ReferenceNumber, Date, DueDate, Terms, TermsId, VendorName, VendorId, Amount, OpenAmount, IsPaid FROM Bills WHERE IsPaid = false"
                $openRows = New-Object System.Collections.Generic.List[object]
                foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $openSql)) {
                    $openAmt = Convert-ToNumber $r.OpenAmount
                    if ($null -eq $openAmt -or $openAmt -le 0) { continue }
                    $openRows.Add($r) | Out-Null
                }
                $payload = @{
                    action = "replace_open_ap"
                    organization_id = $OrganizationId
                    sync_run_id = $syncRunId
                    open_ap = $openRows.ToArray()
                }
                if ($DryRun) { Write-Host ("  DryRun open_ap={0}" -f $openRows.Count) }
                else { [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body $payload) }
                $script:rowCounts["open_ap"] = $openRows.Count
            }
            return
        }

        if ($Domain -eq "cash") {
            $depSql = @"
SELECT ID, Date, DepositToAccount, DepositToAccountId, TotalDeposit, Memo, TimeCreated, TimeModified
FROM Deposits
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@
            $lineSql = @"
SELECT ID, DepositId, TotalDeposit, ItemAmount, ItemTxnType, ItemRefId, TimeModified
FROM DepositLineItems
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@
            $ck = Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset "deposits" -Start $Window.Start -End $Window.End -Status "running" -RowCount 0 -DryRun:$DryRun -Force:$ForceCheckpoint
            if (-not $ck.skipped) {
                $deps = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $depSql
                $lines = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $lineSql
                [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "deposits" -Rows $deps -ChunkSize $ChunkSize -DryRun:$DryRun)
                [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "deposit_line_items" -Rows $lines -ChunkSize $ChunkSize -DryRun:$DryRun)
                $cashEvents = New-Object System.Collections.Generic.List[object]
                foreach ($d in @($deps)) {
                    $cashEvents.Add([ordered]@{
                        event_role = "bank_deposit"
                        source_txn_type = "Deposit"
                        source_txn_id = [string]$d.ID
                        source_line_id = ""
                        txn_date = (Convert-ToYmd $d.Date)
                        amount = (Convert-ToNumber $d.TotalDeposit)
                        account_id = $d.DepositToAccountId
                        account_name = $d.DepositToAccount
                    }) | Out-Null
                }
                foreach ($ln in @($lines)) {
                    $cashEvents.Add([ordered]@{
                        event_role = "bank_deposit_line"
                        source_txn_type = "DepositLineItem"
                        source_txn_id = [string]$ln.DepositId
                        source_line_id = [string]$ln.ID
                        amount = (Convert-ToNumber $ln.ItemAmount)
                        linked_txn_type = $ln.ItemTxnType
                        linked_txn_id = $ln.ItemRefId
                    }) | Out-Null
                }
                [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "cash_events" -Rows $cashEvents.ToArray() -ChunkSize $ChunkSize -DryRun:$DryRun)
                [void](Send-Checkpoint -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Domain $Domain -Dataset "deposits" -Start $Window.Start -End $Window.End -Status "success" -RowCount @($deps).Length -DryRun:$DryRun -Force:$ForceCheckpoint)
                Write-Host ("  deposits={0} lines={1} (receipt vs deposit not summed)" -f @($deps).Length, @($lines).Length)
            }

            $checkSql = @"
SELECT ID, ReferenceNumber, Date, Payee, PayeeId, Amount, Memo, TimeModified
FROM Checks
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@
            $checks = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $checkSql
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "checks" -Rows $checks -ChunkSize $ChunkSize -DryRun:$DryRun)

            $xferSql = @"
SELECT ID, TxnDate, Amount, TimeCreated, TimeModified,
       TransferFromAccountRef_ListID,
       TransferFromAccountRef_FullName,
       TransferToAccountRef_ListID,
       TransferToAccountRef_FullName,
       Memo
FROM Transfers
WHERE TxnDate >= '$startUs' AND TxnDate <= '$endUs'
"@
            $xfers = New-Object System.Collections.Generic.List[object]
            foreach ($r in (Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $xferSql)) {
                $xfers.Add([ordered]@{
                    qb_transfer_id = [string]$r.ID
                    txn_date = (Convert-ToYmd $r.TxnDate)
                    from_account_id = $r.TransferFromAccountRef_ListID
                    from_account_name = $r.TransferFromAccountRef_FullName
                    to_account_id = $r.TransferToAccountRef_ListID
                    to_account_name = $r.TransferToAccountRef_FullName
                    amount = (Convert-ToNumber $r.Amount)
                    memo = $r.Memo
                    time_created = $r.TimeCreated
                    time_modified = $r.TimeModified
                }) | Out-Null
            }
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "transfers" -Rows $xfers.ToArray() -ChunkSize $ChunkSize -DryRun:$DryRun)

            if ($Window.End.Date -eq $coverageEnd) {
                $undepSql = "SELECT ID, TxnType, TxnDate, CustomerRef_ListID, CustomerRef_FullName, Amount, RefNumber FROM ReceivePaymentToDeposit"
                $undep = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $undepSql
                $payload = @{
                    action = "replace_undeposited"
                    organization_id = $OrganizationId
                    sync_run_id = $syncRunId
                    undeposited = @($undep)
                    allow_empty_undeposited = $true
                }
                if ($DryRun) { Write-Host ("  DryRun undeposited={0}" -f @($undep).Length) }
                else { [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body $payload) }
            }
            return
        }

        if ($Domain -eq "accounting") {
            if ($CaptureOpening) {
                $bsSql = "SELECT Label, Total FROM BalanceSheetStandard WHERE ReportPeriod = '${OpeningAsOf}:${OpeningAsOf}' AND ReportBasis = 'Accrual'"
                Write-Host "  Opening Balance Sheet as-of $OpeningAsOf (Accrual). Do not use ReturnRows."
                $bsRows = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $bsSql
                $lines = New-Object System.Collections.Generic.List[object]
                $i = 0
                foreach ($r in @($bsRows)) {
                    $lines.Add([ordered]@{
                        line_order = $i
                        label = $r.Label
                        amount = (Convert-ToNumber $r.Total)
                    }) | Out-Null
                    $i++
                }
                $payload = @{
                    action = "upsert_report_snapshot"
                    organization_id = $OrganizationId
                    sync_run_id = $syncRunId
                    report_type = "balance_sheet"
                    source_view = "BalanceSheetStandard"
                    report_basis = "Accrual"
                    as_of_date = $OpeningAsOf
                    is_opening = $true
                    lines = $lines.ToArray()
                }
                if ($DryRun) { Write-Host ("  DryRun opening BS lines={0}" -f $lines.Count) }
                else {
                    $resp = Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body $payload
                    Write-Host ("  opening snapshot_id stored; identity={0}" -f $resp.identity.status)
                }
                $script:rowCounts["opening_bs_lines"] = $lines.Count
                return
            }

            $jeSql = @"
SELECT JournalEntryID, LineId, LineType, LineAccount, LineAccountId, LineAmount, TimeModified
FROM JournalEntryLines
WHERE TimeModified >= '$startUs' AND TimeModified <= '$endUs'
"@
            try {
                $je = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $jeSql
            } catch {
                $warnings.Add("JournalEntryLines TimeModified window failed; Date filter not assumed. Skipping JE this window.")
                $je = @()
            }
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "journal_entry_lines" -Rows $je -ChunkSize $ChunkSize -DryRun:$DryRun)

            $txnSql = @"
SELECT ID, TxnLineId, Type, Date, Entity, EntityId, AccountName, AccountId, ReferenceNumber, Amount, AmountInHomeCurrency, Memo, TimeModified
FROM Transactions
WHERE Date >= '$startUs' AND Date <= '$endUs'
"@
            $txn = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $txnSql
            [void](Send-UpsertChunks -Url $IngestUrl -Token $IngestToken -OrganizationId $OrganizationId -SyncRunId $syncRunId -Dataset "transaction_index" -Rows $txn -ChunkSize $ChunkSize -DryRun:$DryRun)
            Write-Host "  Transactions stored as activity index only (not double-entry ledger)."

            $fromYmd = $Window.Start.ToString("yyyy-MM-dd")
            $toYmd = $Window.End.ToString("yyyy-MM-dd")
            $pnlSql = "SELECT Label, Amount, RowType FROM ProfitAndLossStandard WHERE ReportPeriod = '${fromYmd}:${toYmd}' AND ReportBasis = 'Accrual'"
            $pnl = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $pnlSql
            $pnlLines = New-Object System.Collections.Generic.List[object]
            $pi = 0
            foreach ($r in @($pnl)) {
                $pnlLines.Add([ordered]@{
                    line_order = $pi
                    label = $r.Label
                    amount = (Convert-ToNumber $r.Amount)
                    row_type = $r.RowType
                }) | Out-Null
                $pi++
            }
            $pnlPayload = @{
                action = "upsert_report_snapshot"
                organization_id = $OrganizationId
                sync_run_id = $syncRunId
                report_type = "profit_and_loss"
                source_view = "ProfitAndLossStandard"
                report_basis = "Accrual"
                period_start = $fromYmd
                period_end = $toYmd
                lines = $pnlLines.ToArray()
            }
            if ($DryRun) { Write-Host ("  DryRun P&L Accrual lines={0}" -f $pnlLines.Count) }
            else { [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body $pnlPayload) }

            if ($Window.End.Date -eq $coverageEnd) {
                $asOf = $coverageEnd.ToString("yyyy-MM-dd")
                $bsSql = "SELECT Label, Total FROM BalanceSheetStandard WHERE ReportPeriod = '${asOf}:${asOf}' AND ReportBasis = 'Accrual'"
                $bs = Invoke-ReadOnlyOdbcQuery -Connection $conn -Sql $bsSql
                $bsLines = New-Object System.Collections.Generic.List[object]
                $bi = 0
                foreach ($r in @($bs)) {
                    $bsLines.Add([ordered]@{
                        line_order = $bi
                        label = $r.Label
                        amount = (Convert-ToNumber $r.Total)
                    }) | Out-Null
                    $bi++
                }
                $bsPayload = @{
                    action = "upsert_report_snapshot"
                    organization_id = $OrganizationId
                    sync_run_id = $syncRunId
                    report_type = "balance_sheet"
                    source_view = "BalanceSheetStandard"
                    report_basis = "Accrual"
                    as_of_date = $asOf
                    is_opening = $false
                    lines = $bsLines.ToArray()
                }
                if ($DryRun) { Write-Host ("  DryRun BS Accrual lines={0} (no ReturnRows)" -f $bsLines.Count) }
                else { [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body $bsPayload) }
            }
        }
    }

    foreach ($w in $windows) {
        Invoke-DomainWindow -Window $w
    }

    if (-not $DryRun) {
        [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body @{
            action = "complete"
            organization_id = $OrganizationId
            sync_run_id = $syncRunId
            status = "success"
            row_counts = $rowCounts
            warnings = $warnings.ToArray()
        })
    }
    Write-Host "RESULT: PASS"
} catch {
    Write-Host ("RESULT: FAIL - {0}" -f $_.Exception.Message)
    if (-not $DryRun -and -not [string]::IsNullOrWhiteSpace($syncRunId) -and $syncRunId -ne "dry-run") {
        try {
            [void](Invoke-Ingest -Url $IngestUrl -Token $IngestToken -Body @{
                action = "complete"
                organization_id = $OrganizationId
                sync_run_id = $syncRunId
                status = "failed"
                error_summary = ([string]$_.Exception.Message).Substring(0, [Math]::Min(500, ([string]$_.Exception.Message).Length))
            })
        } catch { }
    }
    throw
} finally {
    if ($null -ne $conn) { $conn.Close(); $conn.Dispose() }
}
