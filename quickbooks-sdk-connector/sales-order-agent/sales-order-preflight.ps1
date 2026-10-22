# eliteOS QuickBooks SALES ORDER preflight (PowerShell 5.1, QuickBooks VM) - READ-ONLY
#
# Confirms the open company and resolves what one Quote Flow sales order needs
# (customer:job, mapped items, class, terms, sales tax codes), and inventories how the
# existing QuickBooks workers are configured - WITHOUT changing anything.
#
# Transport:
#   - Reference data: slabOS CData ODBC System DSN (default slabOS_QuickBooks_Local_RO),
#     the read path of the sales / finance / Account Directory workers. SELECT only.
#   - Optional -SdkCompanyCheck (off by default): one CompanyQueryRq through the Desktop
#     SDK (QBXMLRP2), the sales order agent's transport. Read-only.
#   - Never uses the Thryve / CData Remote Connector, its users or its configuration.
#
# Guarantees:
#   - No QuickBooks writes: every ODBC statement must be a SELECT (literals stripped before
#     the keyword check); no SDK request is sent unless -SdkCompanyCheck is given.
#   - No service, task, registry, DSN, permission or environment changes. Inventory uses
#     Get-ScheduledTask / Get-Service / Get-CimInstance / registry reads only.
#   - No worker interference: never creates, removes or overwrites any lock. Refuses to
#     start when a worker lock is held by a live process or a QuickBooks task is running
#     or due within -QuietMinutes.
#   - Bounded: ODBC connect timeout 60s, per-query timeouts 60-120s, and no new query
#     starts after -MaxSeconds. Nothing waits or retries.
#   - No token is read, Brain is never contacted, no job is claimed. Not the simulator.
#   - Output: console + one JSON report under -OutDir. Secrets are never read; log tails
#     are redacted; customer names are omitted unless -ShowCustomerNames.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ManifestPath = "",
    [string]$ExpectedCompany = "",
    [string]$Dsn = "slabOS_QuickBooks_Local_RO",
    [string]$CustomerListId = "",
    [string]$CustomerFullName = "",
    [string]$ClassFullName = "",
    [string]$TermsFullName = "",
    [string]$SalesTaxCodeFullName = "",
    [int]$QuietMinutes = 5,
    [int]$MaxSeconds = 300,
    [switch]$SdkCompanyCheck,
    [switch]$ShowCustomerNames,
    [string]$OutDir = "C:\eliteOS\logs\qb-preflight"
)

$ErrorActionPreference = "Stop"
$PreflightVersion = "1.1.0"
$WorkerLocks = @(
    "C:\eliteOS\logs\qb-odbc\qb-cdata-odbc.lock",
    "C:\eliteOS\logs\sales-qb-sync\sales-qb-sync.lock",
    "C:\eliteOS\logs\account-directory-qb-customer-sync\ad-qb-customer-sync.lock"
)
$WorkerLogDirs = @(
    "C:\eliteOS\logs\account-directory-qb-customer-sync",
    "C:\eliteOS\logs\sales-qb-sync",
    "C:\eliteOS\logs\finance-qb-sync"
)
$QbTaskPattern = '(?i)slabos|eliteos|quickbooks|\bqb\b|qb-|thryve|cdata'
$Started = Get-Date

function Redact {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $t = [regex]::Replace($Text, '(?i)(Bearer\s+)\S+', '$1***')
    $t = [regex]::Replace($t, '(?i)((?:token|password|pwd|secret|apikey|api_key|authorization)\S*\s*[=:]\s*)\S+', '$1***')
    return $t
}

function Assert-SelectOnlySql {
    param([Parameter(Mandatory = $true)][string]$Sql)
    $t = ($Sql.Trim() -replace "'(?:[^']|'')*'", "''")
    if ($t -notmatch '^(?i)SELECT\b') { throw "Refusing non-SELECT ODBC statement." }
    if ($t -match ';') { throw "Refusing multi-statement ODBC text." }
    if ($t -match '(?i)\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|REPLACE|EXEC|EXECUTE|CALL|CREATE|ALTER|DROP|TRUNCATE|INTO|CACHE)\b') { throw "Refusing mutating/DDL ODBC statement." }
}

function Assert-Budget {
    if (((Get-Date) - $Started).TotalSeconds -gt $MaxSeconds) { throw ("Time budget of {0}s reached; stopping before the next query." -f $MaxSeconds) }
}

function Invoke-Select {
    param($Connection, [string]$Sql, [int]$TimeoutSeconds = 60)
    Assert-SelectOnlySql -Sql $Sql
    Assert-Budget
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $TimeoutSeconds
    $rows = New-Object System.Collections.Generic.List[object]
    $reader = $null
    try {
        $reader = $cmd.ExecuteReader()
        while ($reader.Read()) {
            $map = [ordered]@{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $map[$reader.GetName($i)] = $(if ($reader.IsDBNull($i)) { $null } else { $reader.GetValue($i) })
            }
            [void]$rows.Add([pscustomobject]$map)
        }
    } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        $cmd.Dispose()
    }
    return ,$rows.ToArray()
}

function Sq { param([string]$v) return $v.Replace("'", "''") }

function Get-Prop {
    param($Row, [string[]]$Names)
    foreach ($n in $Names) {
        $p = $Row.PSObject.Properties[$n]
        if ($null -ne $p -and $null -ne $p.Value -and -not [string]::IsNullOrWhiteSpace([string]$p.Value)) { return $p.Value }
    }
    return $null
}

function Test-Active {
    param($Row)
    $v = Get-Prop -Row $Row -Names @("IsActive")
    if ($null -eq $v) { return $true }
    return @("true", "1", "yes") -contains ([string]$v).Trim().ToLowerInvariant()
}

function Get-ActiveNames {
    param($Connection, [string[]]$Tables)
    $lastError = $null
    foreach ($table in $Tables) {
        try {
            $rows = Invoke-Select -Connection $Connection -Sql ("SELECT * FROM {0}" -f $table)
            $names = @($rows | Where-Object { Test-Active $_ } | ForEach-Object { [string](Get-Prop -Row $_ -Names @("FullName", "Name")) } | Where-Object { $_ } | Sort-Object -Unique)
            return @{ verified = $true; table = $table; names = $names }
        } catch {
            $lastError = [string]$_.Exception.Message
            if ($lastError -like "Time budget*") { throw }
        }
    }
    return @{ verified = $false; table = ($Tables -join "|"); names = @(); error = $lastError }
}

function Get-LiveLockOwner {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $first = (Get-Content -LiteralPath $Path -TotalCount 1 -ErrorAction SilentlyContinue) -as [string]
    $lockPid = 0
    if ([int]::TryParse(([string]$first).Trim(), [ref]$lockPid) -and $lockPid -gt 0 -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) { return $lockPid }
    return $null
}

function Get-QbTasks {
    $out = @()
    foreach ($t in @(Get-ScheduledTask -ErrorAction Stop)) {
        $actions = @($t.Actions | ForEach-Object { ("{0} {1}" -f $_.Execute, $_.Arguments).Trim() })
        $hay = ("{0} {1} {2}" -f $t.TaskName, $t.TaskPath, ($actions -join " "))
        if ($hay -notmatch $QbTaskPattern -or $t.TaskPath -like "\Microsoft\*") { continue }
        $info = $null
        try { $info = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction Stop } catch { }
        $out += [ordered]@{
            name = $t.TaskName
            path = $t.TaskPath
            state = [string]$t.State
            enabled = [bool]$t.Settings.Enabled
            runAs = [string]$t.Principal.UserId
            logonType = [string]$t.Principal.LogonType
            lastRun = $(if ($info) { [string]$info.LastRunTime } else { $null })
            lastResult = $(if ($info) { "0x{0:X8}" -f [int64]$info.LastTaskResult } else { $null })
            nextRun = $(if ($info -and $info.NextRunTime) { $info.NextRunTime.ToString("o") } else { $null })
            missedRuns = $(if ($info) { [int]$info.NumberOfMissedRuns } else { $null })
            actions = @($actions | ForEach-Object { Redact $_ })
        }
    }
    return ,$out
}

function Get-DsnSettings {
    param([string]$Name)
    $wanted = @("Driver", "Description", "ConnectDirectly", "Readonly", "CompanyFile", "QBXMLVersion", "ApplicationName", "URL", "Timeout")
    foreach ($root in @("HKLM:\SOFTWARE\ODBC\ODBC.INI", "HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBC.INI", "HKCU:\SOFTWARE\ODBC\ODBC.INI")) {
        $key = Join-Path $root $Name
        if (-not (Test-Path -LiteralPath $key)) { continue }
        $props = Get-ItemProperty -LiteralPath $key
        $o = [ordered]@{ registryKey = $key }
        foreach ($n in $wanted) {
            $p = $props.PSObject.Properties[$n]
            $o[$n] = $(if ($null -ne $p) { [string]$p.Value } else { $null })
        }
        $o.userEntryPresent = ($null -ne $props.PSObject.Properties["User"])
        $o.passwordEntryPresent = ($null -ne $props.PSObject.Properties["Password"])
        $o.companyTarget = $(if ($o.CompanyFile) { "configured path" } else { "currently open company" })
        return $o
    }
    return @{ found = $false }
}

function Get-ConfigTargeting {
    $out = @()
    if (-not (Test-Path -LiteralPath "C:\eliteOS\config")) { return ,$out }
    foreach ($f in @(Get-ChildItem -LiteralPath "C:\eliteOS\config" -Filter "*.env" -File -ErrorAction SilentlyContinue)) {
        $keys = @()
        $safe = [ordered]@{}
        foreach ($raw in @(Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue)) {
            $line = ([string]$raw).Trim()
            if (-not $line -or $line.StartsWith("#") -or $line.IndexOf("=") -lt 1) { continue }
            $k = $line.Substring(0, $line.IndexOf("=")).Trim()
            $keys += $k
            if ($k -match '(?i)TOKEN|PASSWORD|SECRET|KEY|AUTH') { continue }
            if ($k -match '(?i)COMPANY|DSN|ENVIRONMENT|WRITE_ENABLED|APP_NAME') { $safe[$k] = $line.Substring($line.IndexOf("=") + 1).Trim().Trim('"').Trim("'") }
        }
        $out += [ordered]@{ file = $f.Name; keys = $keys; nonSecretTargeting = $safe }
    }
    return ,$out
}

function Get-LogTail {
    param([string]$Dir, [int]$Lines = 15)
    if (-not (Test-Path -LiteralPath $Dir)) { return @{ dir = $Dir; found = $false } }
    $latest = Get-ChildItem -LiteralPath $Dir -Filter "*.log" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { return @{ dir = $Dir; found = $true; latest = $null } }
    return [ordered]@{
        dir = $Dir
        latest = $latest.Name
        lastWrite = $latest.LastWriteTime.ToString("o")
        tail = @(Get-Content -LiteralPath $latest.FullName -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object { Redact ([string]$_) })
    }
}

function Invoke-SdkCompanyQuery {
    $appName = $(if ($env:QB_APP_NAME) { $env:QB_APP_NAME } else { "EliteOS QuickBooks SDK Connector" })
    $appId = $(if ($env:QB_APP_ID) { $env:QB_APP_ID } else { "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" })
    $rq = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="13.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><CompanyQueryRq requestID="preflight-company"/></QBXMLMsgsRq></QBXML>'
    $p = New-Object -ComObject "QBXMLRP2.RequestProcessor"
    $ticket = $null
    $connected = $false
    try {
        try { $p.OpenConnection2($appId, $appName, 1) } catch { $p.OpenConnection($appId, $appName) }
        $connected = $true
        $ticket = [string]$p.BeginSession([string]$env:QB_COMPANY_FILE, 2)
        [xml]$doc = [string]$p.ProcessRequest($ticket, $rq)
        $name = $doc.QBXML.QBXMLMsgsRs.CompanyQueryRs.CompanyRet.CompanyName
        if ($name -is [System.Xml.XmlElement]) { $name = $name.InnerText }
        return [string]$name
    } finally {
        if ($ticket) { try { $p.EndSession($ticket) | Out-Null } catch { } }
        if ($connected) { try { $p.CloseConnection() | Out-Null } catch { } }
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($p) } catch { }
    }
}

# --- main ---
Write-Host ("eliteOS sales order preflight {0} - READ-ONLY (no writes, no locks, no Brain, no queue, not the simulator)" -f $PreflightVersion)

$manifest = $null
if ($ManifestPath) { $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json }
if (-not $ExpectedCompany -and $manifest) { $ExpectedCompany = [string]$manifest.expectedCompany }

$report = [ordered]@{
    preflightVersion = $PreflightVersion
    ranAt = $Started.ToUniversalTime().ToString("o")
    host = $env:COMPUTERNAME
    transport = [ordered]@{ odbcDsn = $Dsn; sdkCompanyCheck = [bool]$SdkCompanyCheck; remoteConnectorUsed = $false }
    environment = [ordered]@{}
    company = [ordered]@{}
    items = @()
    missingConcepts = @()
    customer = [ordered]@{ requested = [bool]($CustomerListId -or $CustomerFullName) }
    classes = $null
    terms = $null
    salesTaxCodes = $null
    blockers = @()
}

# Read-only inventory: how each connector picks its company, and why workers may have stopped.
try {
    $os = Get-CimInstance Win32_OperatingSystem
    $report.environment.lastBoot = $os.LastBootUpTime.ToString("o")
} catch { $report.environment.lastBootError = [string]$_.Exception.Message }
try {
    $report.environment.quickBooksProcesses = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'QBW%' OR Name LIKE 'QBDBMgr%' OR Name LIKE '%CData%' OR Name LIKE '%RemoteConnector%'" |
        ForEach-Object { [ordered]@{ name = $_.Name; pid = $_.ProcessId; sessionId = $_.SessionId; started = $(if ($_.CreationDate) { $_.CreationDate.ToString("o") } else { $null }); commandLine = (Redact ([string]$_.CommandLine)) } })
} catch { $report.environment.processError = [string]$_.Exception.Message }
try {
    $report.environment.services = @(Get-Service -ErrorAction Stop | Where-Object { ("{0} {1}" -f $_.Name, $_.DisplayName) -match '(?i)cdata|thryve|quickbooks|qbcf|qbdata|intuit' } |
        ForEach-Object { [ordered]@{ name = $_.Name; displayName = $_.DisplayName; status = [string]$_.Status; startType = [string]$_.StartType } })
} catch { $report.environment.serviceError = [string]$_.Exception.Message }
$report.environment.dsn = Get-DsnSettings -Name $Dsn
$report.environment.companyFileEnv = [ordered]@{
    machine = [Environment]::GetEnvironmentVariable("QB_COMPANY_FILE", "Machine")
    user = [Environment]::GetEnvironmentVariable("QB_COMPANY_FILE", "User")
    process = [Environment]::GetEnvironmentVariable("QB_COMPANY_FILE", "Process")
}
$report.environment.salesOrderAgentEnv = [ordered]@{
    environment = [Environment]::GetEnvironmentVariable("QB_SO_AGENT_ENVIRONMENT")
    writeEnabled = [Environment]::GetEnvironmentVariable("QB_SO_AGENT_WRITE_ENABLED")
    expectedCompany = [Environment]::GetEnvironmentVariable("QB_SO_AGENT_EXPECTED_COMPANY")
}
$report.environment.configFiles = Get-ConfigTargeting
$report.environment.workerLogs = @($WorkerLogDirs | ForEach-Object { Get-LogTail -Dir $_ })
$sdkLog = "C:\ProgramData\Intuit\QuickBooks\qbsdklog.txt"
if (Test-Path -LiteralPath $sdkLog) {
    $report.environment.qbSdkLogTail = @(Get-Content -LiteralPath $sdkLog -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Redact ([string]$_) })
}

# Non-interference gate (reads only; never touches a lock).
$tasks = @()
try {
    $tasks = Get-QbTasks
    $report.environment.scheduledTasks = $tasks
} catch {
    $report.environment.scheduledTaskError = [string]$_.Exception.Message
    $report.blockers += "scheduled_tasks_unreadable_refusing_to_run"
}
foreach ($lock in $WorkerLocks) {
    $owner = Get-LiveLockOwner -Path $lock
    if ($owner) { $report.blockers += ("worker_running:{0}:pid {1}" -f (Split-Path -Leaf $lock), $owner) }
}
$soon = (Get-Date).AddMinutes($QuietMinutes)
foreach ($t in $tasks) {
    if ($t.state -eq "Running") { $report.blockers += ("task_running:" + $t.name) }
    elseif ($t.enabled -and $t.nextRun -and ([datetime]$t.nextRun) -le $soon) { $report.blockers += ("task_due_within_{0}m:{1}" -f $QuietMinutes, $t.name) }
}
$gateClear = ($report.blockers.Count -eq 0)

$conn = $null
if ($gateClear) {
    try {
        $conn = New-Object System.Data.Odbc.OdbcConnection
        $conn.ConnectionString = "DSN=$Dsn;Timeout=60"
        $conn.ConnectionTimeout = 60
        $conn.Open()

        $companyRows = Invoke-Select -Connection $conn -Sql "SELECT Name FROM CompanyInfo"
        $company = $(if ($companyRows.Length) { [string]$companyRows[0].Name } else { "" })
        $report.company.odbcCompanyName = $company
        $report.company.expected = $ExpectedCompany
        $report.company.matchesExpected = [bool]($ExpectedCompany -and $company -eq $ExpectedCompany)
        if (-not $report.company.matchesExpected) { $report.blockers += "company_identity_unverified" }

        if ($manifest) {
            foreach ($m in @($manifest.items)) {
                $entry = [ordered]@{ concept = [string]$m.concept; listId = [string]$m.listId; mappedFullName = [string]$m.fullName; found = $false }
                try {
                    $rows = Invoke-Select -Connection $conn -Sql ("SELECT * FROM Items WHERE Id = '{0}'" -f (Sq ([string]$m.listId)))
                    if ($rows.Length) {
                        $r = $rows[0]
                        $entry.found = $true
                        $entry.qbFullName = [string](Get-Prop -Row $r -Names @("FullName", "Name"))
                        $entry.type = [string](Get-Prop -Row $r -Names @("Type", "ItemType"))
                        $entry.active = (Test-Active $r)
                        $entry.nameMatchesMapping = ($entry.qbFullName -eq $entry.mappedFullName)
                        $entry.itemDefaultSalesTaxCode = [string](Get-Prop -Row $r -Names @("SalesTaxCodeName", "SalesTaxCodeRef_FullName", "SalesTaxCode"))
                    }
                } catch {
                    $entry.error = [string]$_.Exception.Message
                    if ($entry.error -like "Time budget*") { throw }
                }
                if (-not $entry.found -or $entry.active -eq $false) { $report.blockers += ("item_unresolved:" + $entry.concept) }
                $report.items += $entry
            }
            $mapped = @($manifest.items | ForEach-Object { [string]$_.concept })
            foreach ($c in @($manifest.requiredConcepts)) {
                if ($mapped -notcontains [string]$c) { $report.missingConcepts += [string]$c; $report.blockers += ("item_mapping_missing:" + $c) }
            }
        } else {
            $report.blockers += "no_manifest_items_checked"
        }

        # Candidates for unmapped concepts. Listed for a person to choose; never selected here.
        $report.itemCandidates = [ordered]@{}
        try {
            $allItems = Invoke-Select -Connection $conn -Sql "SELECT * FROM Items" -TimeoutSeconds 120
            $groups = [ordered]@{
                installed_countertop_package = '(?i)countertop|install|fabricat|quartz|granite|marble|slab|sq\.?\s*f|\bsf\b'
                sink_product = '(?i)sink|\bbowl\b|undermount|farmhouse'
            }
            foreach ($g in $groups.Keys) {
                $report.itemCandidates[$g] = @($allItems | Where-Object { (Test-Active $_) -and ([string](Get-Prop -Row $_ -Names @("FullName", "Name")) -match $groups[$g]) } |
                    Select-Object -First 40 | ForEach-Object { [ordered]@{
                        listId = [string](Get-Prop -Row $_ -Names @("Id"))
                        fullName = [string](Get-Prop -Row $_ -Names @("FullName", "Name"))
                        type = [string](Get-Prop -Row $_ -Names @("Type", "ItemType"))
                        itemDefaultSalesTaxCode = [string](Get-Prop -Row $_ -Names @("SalesTaxCodeName", "SalesTaxCodeRef_FullName", "SalesTaxCode"))
                    } })
            }
            $report.itemCandidates.activeItemCount = @($allItems | Where-Object { Test-Active $_ }).Count
        } catch {
            $report.itemCandidates.error = [string]$_.Exception.Message
            if ($report.itemCandidates.error -like "Time budget*") { throw }
        }

        if ($CustomerListId -or $CustomerFullName) {
            $where = $(if ($CustomerListId) { "Id = '{0}'" -f (Sq $CustomerListId) } else { "FullName = '{0}'" -f (Sq $CustomerFullName) })
            $rows = Invoke-Select -Connection $conn -Sql ("SELECT Id, FullName, ParentId, Sublevel, IsActive FROM Customers WHERE {0}" -f $where) -TimeoutSeconds 120
            $report.customer.matches = $rows.Length
            if ($rows.Length -eq 1) {
                $r = $rows[0]
                $sub = 0; [void][int]::TryParse([string]$r.Sublevel, [ref]$sub)
                $report.customer.listId = [string]$r.Id
                $report.customer.isJob = ($sub -gt 0 -or -not [string]::IsNullOrWhiteSpace([string]$r.ParentId))
                $report.customer.active = (Test-Active $r)
                if ($ShowCustomerNames) { $report.customer.fullName = [string]$r.FullName }
                $children = Invoke-Select -Connection $conn -Sql ("SELECT Id FROM Customers WHERE ParentId = '{0}'" -f (Sq ([string]$r.Id))) -TimeoutSeconds 120
                $report.customer.childJobs = $children.Length
                if (-not $report.customer.active) { $report.blockers += "customer_inactive" }
                if (-not $report.customer.isJob -and $children.Length -gt 0) { $report.blockers += "customer_has_jobs_choose_job" }
            } else {
                $report.blockers += $(if ($rows.Length -eq 0) { "customer_not_found" } else { "customer_ambiguous" })
            }
        } else {
            $report.blockers += "customer_job_not_specified"
        }

        $report.classes = Get-ActiveNames -Connection $conn -Tables @("Classes", "Class")
        $report.terms = Get-ActiveNames -Connection $conn -Tables @("Terms", "StandardTerms")
        $dateTerms = Get-ActiveNames -Connection $conn -Tables @("DateDrivenTerms")
        if ($dateTerms.verified) { $report.terms.names = @(($report.terms.names + $dateTerms.names) | Sort-Object -Unique) }
        $report.salesTaxCodes = Get-ActiveNames -Connection $conn -Tables @("SalesTaxCodes", "SalesTaxCode")

        foreach ($pair in @(@("class", $ClassFullName, $report.classes), @("terms", $TermsFullName, $report.terms), @("sales_tax_code", $SalesTaxCodeFullName, $report.salesTaxCodes))) {
            $kind = $pair[0]; $wanted = $pair[1]; $list = $pair[2]
            if (-not $list.verified) { $report.blockers += ($kind + "_list_unreadable"); continue }
            if (-not $wanted) { $report.blockers += ($kind + "_not_specified"); continue }
            if ($list.names -notcontains $wanted) { $report.blockers += ($kind + "_not_found") }
        }
    } catch {
        $report.blockers += ("preflight_error: " + (Redact ([string]$_.Exception.Message)))
    } finally {
        if ($null -ne $conn) { try { $conn.Close() } catch { }; try { $conn.Dispose() } catch { } }
    }

    if ($SdkCompanyCheck) {
        try {
            $sdkName = Invoke-SdkCompanyQuery
            $report.company.sdkCompanyName = $sdkName
            $report.company.sdkMatchesOdbc = ($sdkName -eq $report.company.odbcCompanyName)
            if (-not $report.company.sdkMatchesOdbc) { $report.blockers += "sdk_company_mismatch" }
        } catch {
            $report.company.sdkError = [string]$_.Exception.Message
            $report.blockers += "sdk_company_check_failed"
        }
    }
} else {
    Write-Host "Not querying QuickBooks: a worker is running or due soon. Inventory only."
}

$report.elapsedSeconds = [int]((Get-Date) - $Started).TotalSeconds
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$outFile = Join-Path $OutDir ("sales-order-preflight-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$json = $report | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $outFile -Value $json -Encoding UTF8
Write-Host $json
Write-Host ("Report: {0}" -f $outFile)
if ($report.blockers.Count -eq 0) { Write-Host "RESULT: READY (read-only checks only; no write was attempted)"; exit 0 }
Write-Host ("RESULT: NOT READY - {0} blocker(s): {1}" -f $report.blockers.Count, ($report.blockers -join ", "))
exit 2
