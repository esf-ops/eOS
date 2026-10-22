# eliteOS QuickBooks Desktop SDK preflight (QUERY-ONLY, CData-free)
#
# Transport: Intuit QBXMLRP2.RequestProcessor (same app identity as live-sdk-linked-smoke.ps1
# and run-sales-order-agent.ps1). No ODBC, no CData, no Remote Connector, no Brain/HTTP calls,
# no sales-order queue, no lock files, no scheduled-task changes.
#
# Guarantees:
#   - Only allowlisted *QueryRq requests (one per message, no iterators). Any Add/Mod/Del/Void
#     text is refused before ProcessRequest.
#   - Every list query is bounded by ListID or MaxReturned; total requests are capped.
#   - SDK work runs in a child process with a hard wall-clock limit. EndSession/CloseConnection/
#     ReleaseComObject run in finally; if the child overruns, the parent stops that child only,
#     which makes QuickBooks drop the session.
#   - Explicit company path: BeginSession receives -CompanyFile. The SDK refuses (does not switch)
#     when a different company is open. After BeginSession, CompanyName and
#     GetCurrentCompanyFileName must both match before any other query runs.
#   - Refuses to start unless QuickBooks is already running in this Windows session, so the SDK
#     never launches a hidden QuickBooks instance.
#
# Modes:
#   -DiscoverOpenCompany   reads only CompanyName + the open file path, then prints the exact
#                          explicit-path command. No other queries.
#   -CompanyFile <path> -ExpectedCompany <name>
#                          identity gate, then items/customer:job/classes/terms/tax codes.
#   -Focused (with -CompanyFile/-ExpectedCompany)
#                          identity gate, then only the manifest's items and its "references"
#                          (classes, terms, sales tax codes, sales tax items, templates), each
#                          looked up by exact ListID. No candidate searches, no full-list pulls.
#
# Every mode counts its planned requests before opening a session and refuses to start if
# they would exceed the request cap.
#
# Output: JSON report in C:\eliteOS\logs\qb-preflight. Customer names are hidden unless -ShowNames.
# Exit codes: 0 completed with identity verified; 2 refused by non-interference gate or inputs;
#             3 session/identity failure or timeout.

param(
    [string]$CompanyFile,
    [string]$ExpectedCompany,
    [switch]$DiscoverOpenCompany,
    [switch]$Focused,
    [string]$ManifestPath = (Join-Path $PSScriptRoot "sales-order-preflight-manifest.json"),
    [string]$CustomerListId = "80010429-1760380433",
    [switch]$ShowNames,
    [ValidateRange(60, 900)][int]$MaxSeconds = 300,
    [ValidateRange(5, 50)][int]$CandidateMax = 25,
    [string]$QbXmlVersion = "13.0",
    [string]$OutDir = "C:\eliteOS\logs\qb-preflight",
    [ValidateRange(0, 60)][int]$QuietMinutes = 5,
    [switch]$Child,
    [string]$PlanPath,
    [string]$ResultPath
)

$ErrorActionPreference = "Stop"
$PreflightVersion = "2.1.0-sdk"
$AppName = "EliteOS QuickBooks SDK Connector"
$AppId = "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
$MaxRequests = 40
$AllowedRequests = @(
    "CompanyQueryRq", "HostQueryRq", "CustomerQueryRq", "ItemQueryRq", "ClassQueryRq",
    "StandardTermsQueryRq", "DateDrivenTermsQueryRq", "SalesTaxCodeQueryRq",
    "ItemSalesTaxQueryRq", "ItemSalesTaxGroupQueryRq", "TemplateQueryRq"
)
# These return one small record set and accept no ListID/MaxReturned filter.
$UnfilteredRequests = @("CompanyQueryRq", "HostQueryRq", "TemplateQueryRq")
$WritePattern = '(?i)<\s*[A-Za-z0-9]*(?:Add|Mod|Del|Void)Rq[\s/>]|TxnDelRq|ListDelRq|TxnVoidRq|iterator\s*='
$CandidateKeywords = @("countertop", "install", "fabricat", "quartz", "granite", "slab", "sink", "bowl", "undermount", "farmhouse")
$WorkerLocks = @(
    "C:\eliteOS\logs\qb-odbc\qb-cdata-odbc.lock",
    "C:\eliteOS\logs\sales-qb-sync\sales-qb-sync.lock",
    "C:\eliteOS\logs\account-directory-qb-customer-sync\ad-qb-customer-sync.lock"
)
$WorkerLogDirs = @(
    "C:\eliteOS\logs\account-directory-qb-customer-sync",
    "C:\eliteOS\logs\sales-qb-sync",
    "C:\eliteOS\logs\finance-qb-sync",
    "C:\eliteOS\logs\qb-sales-order-agent"
)
$QbTaskPattern = '(?i)slabos|eliteos|quickbooks|\bqb\b|qb-|thryve|cdata'
$FailurePattern = '(?i)trial|licen[sc]e|expire|activation|HY000|qbsdklog|unexpected error|could not|failed|exception|error'
$Started = Get-Date

function Redact {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $t = [regex]::Replace($Text, '(?i)(Bearer\s+)\S+', '$1***')
    $t = [regex]::Replace($t, '(?i)((?:token|password|pwd|secret|apikey|api_key|authorization)\S*\s*[=:]\s*)\S+', '$1***')
    return $t
}

function X { param([string]$s) return [System.Security.SecurityElement]::Escape($s) }

function Txt {
    param($Node, [string]$Path)
    if ($null -eq $Node) { return $null }
    $n = $Node.SelectSingleNode($Path)
    if ($null -eq $n) { return $null }
    return [string]$n.InnerText
}

function Assert-ReadOnlyRequest {
    param([Parameter(Mandatory = $true)][string]$QbXml)
    if ($QbXml -match $WritePattern) { throw "Refusing request: write/void/delete or iterator text detected." }
    [xml]$doc = $QbXml
    $msgs = $doc.SelectSingleNode("/QBXML/QBXMLMsgsRq")
    if ($null -eq $msgs) { throw "Refusing request: missing QBXMLMsgsRq." }
    $children = @($msgs.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element })
    if ($children.Count -ne 1) { throw "Refusing request: exactly one request per message is allowed." }
    $rq = $children[0]
    if ($AllowedRequests -notcontains $rq.LocalName) { throw ("Refusing request type {0}: not on the query-only allowlist." -f $rq.LocalName) }
    if ($UnfilteredRequests -notcontains $rq.LocalName) {
        if ($null -eq $rq.SelectSingleNode("ListID") -and $null -eq $rq.SelectSingleNode("MaxReturned")) {
            throw ("Refusing unbounded {0}: needs ListID or MaxReturned." -f $rq.LocalName)
        }
    }
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

function Get-WorkerLogEvidence {
    param([string]$Dir)
    if (-not (Test-Path -LiteralPath $Dir)) { return [ordered]@{ dir = $Dir; found = $false } }
    $logs = @(Get-ChildItem -LiteralPath $Dir -Filter "*.log" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    $latest = $logs | Select-Object -First 1
    $hits = @()
    foreach ($f in @($logs | Select-Object -First 5)) {
        foreach ($m in @(Select-String -LiteralPath $f.FullName -Pattern $FailurePattern -ErrorAction SilentlyContinue | Select-Object -Last 8)) {
            $hits += ("{0}:{1}: {2}" -f $f.Name, $m.LineNumber, (Redact ([string]$m.Line).Trim()))
        }
    }
    return [ordered]@{
        dir = $Dir
        found = $true
        logCount = $logs.Count
        latest = $(if ($latest) { $latest.Name } else { $null })
        latestWrite = $(if ($latest) { $latest.LastWriteTime.ToString("o") } else { $null })
        latestTail = $(if ($latest) { @(Get-Content -LiteralPath $latest.FullName -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Redact ([string]$_) }) } else { @() })
        failureLines = @($hits | Select-Object -Last 25)
    }
}

function Get-TaskSchedulerEvents {
    param([string[]]$TaskNames)
    $out = @()
    try {
        $events = @(Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 2000 -ErrorAction Stop)
        foreach ($e in $events) {
            $msg = [string]$e.Message
            $hit = $false
            foreach ($n in $TaskNames) { if ($n -and $msg.IndexOf($n, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $hit = $true; break } }
            if (-not $hit) { continue }
            $out += [ordered]@{ time = $e.TimeCreated.ToString("o"); id = $e.Id; level = [string]$e.LevelDisplayName; message = (Redact (($msg -split "`r?`n")[0])) }
            if ($out.Count -ge 40) { break }
        }
        return [ordered]@{ readable = $true; events = $out }
    } catch {
        return [ordered]@{ readable = $false; error = [string]$_.Exception.Message }
    }
}

# ---------------------------------------------------------------------------------------------
# Child: the only code that touches QBXMLRP2. Writes a parsed (no raw XML) result file.
# ---------------------------------------------------------------------------------------------
function Invoke-ChildSdk {
    $plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
    $deadline = (Get-Date).AddSeconds([int]$plan.maxSeconds - 15)
    $result = [ordered]@{
        ok = $false; stage = "init"; error = $null; requestCount = 0
        connectionOpened = $false; sessionOpened = $false; sessionEnded = $false; connectionClosed = $false
        companyFileName = $null; company = $null; identity = $null
    }
    $script:rp = $null
    $script:ticket = $null
    $script:reqCount = 0

    function Invoke-Rq {
        param([string]$Inner)
        if ($script:reqCount -ge $MaxRequests) { throw ("Request cap of {0} reached." -f $MaxRequests) }
        if ((Get-Date) -gt $deadline) { throw "Child time budget reached; stopping before the next request." }
        $q = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="' + (X $plan.qbXmlVersion) + '"?><QBXML><QBXMLMsgsRq onError="stopOnError">' + $Inner + '</QBXMLMsgsRq></QBXML>'
        Assert-ReadOnlyRequest -QbXml $q
        $script:reqCount++
        [xml]$d = [string]$script:rp.ProcessRequest($script:ticket, $q)
        $rs = $d.SelectSingleNode("/QBXML/QBXMLMsgsRs/*[1]")
        $code = 0
        [void][int]::TryParse([string]$rs.GetAttribute("statusCode"), [ref]$code)
        return [pscustomobject]@{ node = $rs; code = $code; severity = [string]$rs.GetAttribute("statusSeverity"); message = [string]$rs.GetAttribute("statusMessage") }
    }

    function Get-RetNodes { param($Rs, [string]$Like) return @($Rs.node.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and $_.LocalName -like $Like }) }

    function Get-ListResult {
        param([string]$Rq, [int]$Max, [scriptblock]$Map)
        $r = Invoke-Rq ("<{0} requestID=""1""><MaxReturned>{1}</MaxReturned><ActiveStatus>ActiveOnly</ActiveStatus></{0}>" -f $Rq, $Max)
        if ($r.code -ne 0 -and $r.code -ne 1) { return [ordered]@{ verified = $false; statusCode = $r.code; error = $r.message } }
        $rows = @(Get-RetNodes $r "*Ret" | ForEach-Object { & $Map $_ })
        return [ordered]@{ verified = $true; count = $rows.Count; truncated = ($rows.Count -ge $Max); rows = $rows }
    }

    try {
        $result.stage = "connect"
        $script:rp = New-Object -ComObject "QBXMLRP2.RequestProcessor"
        try { $script:rp.OpenConnection2($AppId, $AppName, 1) } catch { $script:rp.OpenConnection($AppId, $AppName) }
        $result.connectionOpened = $true

        $result.stage = "begin_session"
        $script:ticket = [string]$script:rp.BeginSession([string]$plan.companyFile, 2)
        $result.sessionOpened = $true

        $result.stage = "identity"
        $result.companyFileName = [string]$script:rp.GetCurrentCompanyFileName($script:ticket)
        $c = Invoke-Rq '<CompanyQueryRq requestID="1"/>'
        if ($c.code -ne 0) { throw ("CompanyQueryRq failed: {0} {1}" -f $c.code, $c.message) }
        $ret = $c.node.SelectSingleNode("CompanyRet")
        $result.company = [ordered]@{ companyName = (Txt $ret "CompanyName"); legalCompanyName = (Txt $ret "LegalCompanyName") }

        if ($plan.mode -eq "discover") {
            $result.ok = $true
            $result.stage = "done"
            return
        }

        $nameMatch = ([string]$result.company.companyName).Trim() -ieq ([string]$plan.expectedCompany).Trim()
        $fileMatch = $false
        try { $fileMatch = [IO.Path]::GetFullPath($result.companyFileName) -ieq [IO.Path]::GetFullPath([string]$plan.companyFile) } catch { }
        $result.identity = [ordered]@{ companyNameMatches = $nameMatch; companyFileMatches = $fileMatch }
        if (-not ($nameMatch -and $fileMatch)) { throw "Company identity mismatch; no further queries were sent." }

        $result.stage = "host"
        $h = Invoke-Rq '<HostQueryRq requestID="1"/>'
        $hr = $h.node.SelectSingleNode("HostRet")
        $result.host = [ordered]@{
            productName = (Txt $hr "ProductName"); majorVersion = (Txt $hr "MajorVersion"); country = (Txt $hr "Country")
            supportedQbXmlVersions = @($(if ($hr) { $hr.SelectNodes("SupportedQBXMLVersion") | ForEach-Object { $_.InnerText } }))
            isAutomaticLogin = (Txt $hr "IsAutomaticLogin"); qbFileMode = (Txt $hr "QBFileMode")
        }

        $result.stage = "items"
        $mapItem = {
            param($n)
            [ordered]@{
                type = ($n.LocalName -replace 'Ret$', '')
                listId = (Txt $n "ListID"); fullName = (Txt $n "FullName"); isActive = (Txt $n "IsActive")
                salesTaxCode = (Txt $n "SalesTaxCodeRef/FullName")
                incomeAccount = (@((Txt $n "SalesOrPurchase/AccountRef/FullName"), (Txt $n "SalesAndPurchase/IncomeAccountRef/FullName"), (Txt $n "IncomeAccountRef/FullName")) | Where-Object { $_ } | Select-Object -First 1)
            }
        }
        $result.items = @()
        foreach ($it in @($plan.items | Where-Object { $_ -and $_.listId })) {
            $r = Invoke-Rq ("<ItemQueryRq requestID=""1""><ListID>{0}</ListID></ItemQueryRq>" -f (X $it.listId))
            $found = @(Get-RetNodes $r "Item*Ret" | ForEach-Object { & $mapItem $_ }) | Select-Object -First 1
            $result.items += [ordered]@{
                concept = $it.concept; listId = $it.listId; expectedFullName = $it.fullName
                found = ($null -ne $found); statusCode = $r.code; qb = $found
                fullNameMatches = ($null -ne $found -and ([string]$found.fullName) -ieq ([string]$it.fullName))
            }
        }

        if ($plan.mode -eq "focused") {
            $result.itemCandidates = [ordered]@{ skipped = "focused mode" }
        } else {
            $result.stage = "item_candidates"
            $cands = @{}
            $truncated = @()
            foreach ($kw in $CandidateKeywords) {
                $r = Invoke-Rq ("<ItemQueryRq requestID=""1""><MaxReturned>{0}</MaxReturned><ActiveStatus>ActiveOnly</ActiveStatus><NameFilter><MatchCriterion>Contains</MatchCriterion><Name>{1}</Name></NameFilter></ItemQueryRq>" -f [int]$plan.candidateMax, (X $kw))
                $rows = @(Get-RetNodes $r "Item*Ret" | ForEach-Object { & $mapItem $_ })
                if ($rows.Count -ge [int]$plan.candidateMax) { $truncated += $kw }
                foreach ($row in $rows) { if ($row.listId -and -not $cands.ContainsKey($row.listId)) { $row.matchedKeyword = $kw; $cands[$row.listId] = $row } }
            }
            $result.itemCandidates = [ordered]@{ keywords = $CandidateKeywords; truncatedKeywords = $truncated; rows = @($cands.Values | Sort-Object { $_.fullName }) }
        }

        $result.stage = "customer"
        $custFields = "<IncludeRetElement>ListID</IncludeRetElement><IncludeRetElement>FullName</IncludeRetElement><IncludeRetElement>IsActive</IncludeRetElement><IncludeRetElement>ParentRef</IncludeRetElement><IncludeRetElement>Sublevel</IncludeRetElement><IncludeRetElement>SalesTaxCodeRef</IncludeRetElement><IncludeRetElement>ItemSalesTaxRef</IncludeRetElement><IncludeRetElement>TermsRef</IncludeRetElement><IncludeRetElement>ClassRef</IncludeRetElement>"
        $cust = [ordered]@{ listId = $plan.customerListId; found = $false }
        if ($plan.customerListId) {
            $r = Invoke-Rq ("<CustomerQueryRq requestID=""1""><ListID>{0}</ListID>{1}</CustomerQueryRq>" -f (X $plan.customerListId), $custFields)
            $cr = @(Get-RetNodes $r "CustomerRet") | Select-Object -First 1
            $cust.statusCode = $r.code
            if ($cr) {
                $fullName = Txt $cr "FullName"
                $cust.found = $true
                $cust.fullName = $(if ($plan.showNames) { $fullName } else { "(hidden; rerun with -ShowNames)" })
                $cust.isActive = Txt $cr "IsActive"
                $cust.sublevel = Txt $cr "Sublevel"
                $cust.isJob = ([int](Txt $cr "Sublevel") -gt 0)
                $cust.parentListId = Txt $cr "ParentRef/ListID"
                $cust.salesTaxCode = Txt $cr "SalesTaxCodeRef/FullName"
                $cust.itemSalesTax = Txt $cr "ItemSalesTaxRef/FullName"
                $cust.terms = Txt $cr "TermsRef/FullName"
                $cust.class = Txt $cr "ClassRef/FullName"
                $jobMax = 51
                $j = Invoke-Rq ("<CustomerQueryRq requestID=""1""><MaxReturned>{0}</MaxReturned><ActiveStatus>All</ActiveStatus><NameFilter><MatchCriterion>StartsWith</MatchCriterion><Name>{1}</Name></NameFilter>{2}</CustomerQueryRq>" -f $jobMax, (X ($fullName + ":")), $custFields)
                $jobs = @(Get-RetNodes $j "CustomerRet")
                $direct = @($jobs | Where-Object { (Txt $_ "ParentRef/ListID") -eq $plan.customerListId })
                $cust.jobQuery = [ordered]@{
                    statusCode = $j.code; descendantCount = $jobs.Count; directJobCount = $direct.Count; truncated = ($jobs.Count -ge $jobMax)
                    directJobs = @($direct | Select-Object -First 20 | ForEach-Object {
                        [ordered]@{ listId = (Txt $_ "ListID"); isActive = (Txt $_ "IsActive"); fullName = $(if ($plan.showNames) { Txt $_ "FullName" } else { $null }) }
                    })
                }
            }
        }
        $result.customer = $cust

        if ($plan.mode -eq "focused") {
            $result.stage = "references"
            $norm = { param([string]$s) ([string]$s).ToLowerInvariant() -replace '[^a-z0-9]', '' }
            $refCheck = {
                param($Ref, $Node, [int]$Code)
                $name = $(if ($Node) { @((Txt $Node "FullName"), (Txt $Node "Name")) | Where-Object { $_ } | Select-Object -First 1 } else { $null })
                [ordered]@{
                    listId = $Ref.listId; expectedName = $Ref.name; found = ($null -ne $Node); statusCode = $Code
                    name = $name; isActive = $(if ($Node) { Txt $Node "IsActive" } else { $null })
                    nameMatches = ($null -ne $Node -and (& $norm $name) -eq (& $norm $Ref.name))
                    isTaxable = $(if ($Node) { Txt $Node "IsTaxable" } else { $null })
                    taxRate = $(if ($Node) { Txt $Node "TaxRate" } else { $null })
                    stdDueDays = $(if ($Node) { Txt $Node "StdDueDays" } else { $null })
                    templateType = $(if ($Node) { Txt $Node "TemplateType" } else { $null })
                }
            }
            $result.references = [ordered]@{}
            $specs = @(
                @{ group = "classes"; rq = "ClassQueryRq"; ret = "ClassRet" },
                @{ group = "terms"; rq = "StandardTermsQueryRq"; ret = "StandardTermsRet" },
                @{ group = "salesTaxCodes"; rq = "SalesTaxCodeQueryRq"; ret = "SalesTaxCodeRet" },
                @{ group = "salesTaxItems"; rq = "ItemSalesTaxQueryRq"; ret = "ItemSalesTaxRet" }
            )
            foreach ($spec in $specs) {
                $rows = @()
                foreach ($ref in @($plan.references.($spec.group) | Where-Object { $_ -and $_.listId })) {
                    $r = Invoke-Rq ("<{0} requestID=""1""><ListID>{1}</ListID></{0}>" -f $spec.rq, (X $ref.listId))
                    $node = @(Get-RetNodes $r $spec.ret) | Select-Object -First 1
                    $rows += & $refCheck $ref $node $r.code
                }
                $result.references[$spec.group] = $rows
            }
            $templateRefs = @($plan.references.templates | Where-Object { $_ -and $_.listId })
            if ($templateRefs.Count) {
                $r = Invoke-Rq '<TemplateQueryRq requestID="1"/>'
                $all = @(Get-RetNodes $r "TemplateRet")
                $rows = @()
                foreach ($ref in $templateRefs) {
                    $node = $all | Where-Object { (Txt $_ "ListID") -eq $ref.listId } | Select-Object -First 1
                    $rows += & $refCheck $ref $node $r.code
                }
                $result.references.templates = $rows
                $result.references.templateCount = $all.Count
            }
            $result.ok = $true
            $result.stage = "done"
            return
        }

        $result.stage = "classes"
        $result.classes = Get-ListResult "ClassQueryRq" 500 { param($n) [ordered]@{ listId = (Txt $n "ListID"); fullName = (Txt $n "FullName") } }
        $result.stage = "terms"
        $result.standardTerms = Get-ListResult "StandardTermsQueryRq" 200 { param($n) [ordered]@{ listId = (Txt $n "ListID"); name = (Txt $n "Name"); stdDueDays = (Txt $n "StdDueDays") } }
        $result.dateDrivenTerms = Get-ListResult "DateDrivenTermsQueryRq" 200 { param($n) [ordered]@{ listId = (Txt $n "ListID"); name = (Txt $n "Name"); dayOfMonthDue = (Txt $n "DayOfMonthDue") } }
        $result.stage = "tax"
        $result.salesTaxCodes = Get-ListResult "SalesTaxCodeQueryRq" 100 { param($n) [ordered]@{ listId = (Txt $n "ListID"); name = (Txt $n "Name"); isTaxable = (Txt $n "IsTaxable"); desc = (Txt $n "Desc") } }
        $result.salesTaxItems = Get-ListResult "ItemSalesTaxQueryRq" 200 { param($n) [ordered]@{ listId = (Txt $n "ListID"); name = (Txt $n "Name"); taxRate = (Txt $n "TaxRate"); taxVendor = (Txt $n "TaxVendorRef/FullName") } }
        $result.salesTaxGroups = Get-ListResult "ItemSalesTaxGroupQueryRq" 100 { param($n) [ordered]@{ listId = (Txt $n "ListID"); name = (Txt $n "Name") } }

        $result.ok = $true
        $result.stage = "done"
    } catch {
        $result.error = Redact ([string]$_.Exception.Message)
    } finally {
        if ($script:ticket) { try { $script:rp.EndSession($script:ticket) | Out-Null; $result.sessionEnded = $true } catch { } }
        if ($result.connectionOpened) { try { $script:rp.CloseConnection() | Out-Null; $result.connectionClosed = $true } catch { } }
        if ($script:rp) { try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:rp) } catch { } }
        $script:rp = $null
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
        $result.requestCount = $script:reqCount
        $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
    }
}

if ($Child) {
    Invoke-ChildSdk
    exit 0
}

# ---------------------------------------------------------------------------------------------
# Parent: inputs, read-only inventory, non-interference gate, bounded child, report.
# ---------------------------------------------------------------------------------------------
Write-Host ("eliteOS QuickBooks SDK preflight {0} - QUERY-ONLY (QBXMLRP2; no CData, no writes, no locks, no Brain, no queue)" -f $PreflightVersion)

$mode = $(if ($DiscoverOpenCompany) { "discover" } elseif ($Focused) { "focused" } else { "query" })
$inputErrors = @()
$manifest = $null
if ($DiscoverOpenCompany -and $Focused) { $inputErrors += "-DiscoverOpenCompany and -Focused cannot be combined." }
if ($mode -ne "discover") {
    if ([string]::IsNullOrWhiteSpace($CompanyFile)) { $inputErrors += "-CompanyFile is required (or use -DiscoverOpenCompany first)." }
    elseif ($CompanyFile -notmatch '(?i)\.qbw$') { $inputErrors += "-CompanyFile must be a .QBW path." }
    elseif (-not (Test-Path -LiteralPath $CompanyFile -PathType Leaf)) { $inputErrors += "-CompanyFile does not exist or is not readable from this account." }
    if ([string]::IsNullOrWhiteSpace($ExpectedCompany)) { $inputErrors += "-ExpectedCompany is required." }
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { $inputErrors += "Manifest not found next to the script." }
    else {
        $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
        if ($ExpectedCompany -and ([string]$manifest.expectedCompany).Trim() -ine $ExpectedCompany.Trim()) { $inputErrors += "-ExpectedCompany differs from the manifest expectedCompany." }
    }
}
$plannedRequests = 0
if ($manifest) {
    $itemCount = @($manifest.items | Where-Object { $_ -and $_.listId }).Count
    $customerRequests = $(if ($CustomerListId) { 2 } else { 0 })
    if ($mode -eq "focused") {
        if ($null -eq $manifest.references) { $inputErrors += "-Focused needs a manifest with a ""references"" section." }
        $refCount = 0
        foreach ($g in @("classes", "terms", "salesTaxCodes", "salesTaxItems")) { $refCount += @($manifest.references.$g | Where-Object { $_ -and $_.listId }).Count }
        $templateRequests = $(if (@($manifest.references.templates | Where-Object { $_ -and $_.listId }).Count) { 1 } else { 0 })
        $plannedRequests = 2 + $itemCount + $customerRequests + $refCount + $templateRequests
    } else {
        $plannedRequests = 2 + $itemCount + $CandidateKeywords.Count + $customerRequests + 1 + 2 + 3
    }
    if ($plannedRequests -gt $MaxRequests) {
        $inputErrors += ("Manifest plans {0} requests; the cap is {1}. Use -Focused or split the manifest." -f $plannedRequests, $MaxRequests)
    }
}
if ($inputErrors.Count) { $inputErrors | ForEach-Object { Write-Host ("INPUT: {0}" -f $_) }; exit 2 }

$report = [ordered]@{
    preflightVersion = $PreflightVersion
    mode = $mode
    ranAt = $Started.ToUniversalTime().ToString("o")
    host = $env:COMPUTERNAME
    transport = [ordered]@{ sdk = "QBXMLRP2.RequestProcessor"; appName = $AppName; appId = $AppId; qbXmlVersion = $QbXmlVersion; odbcUsed = $false; remoteConnectorUsed = $false; brainContacted = $false }
    requested = [ordered]@{ companyFile = $CompanyFile; expectedCompany = $ExpectedCompany; customerListId = $CustomerListId; maxSeconds = $MaxSeconds; manifest = $(if ($manifest) { Split-Path -Leaf $ManifestPath } else { $null }); plannedRequests = $plannedRequests; requestCap = $MaxRequests }
    environment = [ordered]@{}
    blockers = @()
}

try { $report.environment.lastBoot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString("o") } catch { }
$mySession = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
$qbProcs = @()
try {
    $qbProcs = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'QBW%' OR Name LIKE 'QBDBMgr%' OR Name LIKE '%CData%' OR Name LIKE '%RemoteConnector%'" |
        ForEach-Object { [ordered]@{ name = $_.Name; pid = $_.ProcessId; sessionId = $_.SessionId; started = $(if ($_.CreationDate) { $_.CreationDate.ToString("o") } else { $null }); commandLine = (Redact ([string]$_.CommandLine)) } })
} catch { $report.environment.processError = [string]$_.Exception.Message }
$report.environment.windowsSessionId = $mySession
$report.environment.processes = $qbProcs
try {
    $report.environment.services = @(Get-Service -ErrorAction Stop | Where-Object { ("{0} {1}" -f $_.Name, $_.DisplayName) -match '(?i)cdata|thryve|quickbooks|qbcf|qbdata|intuit' } |
        ForEach-Object { [ordered]@{ name = $_.Name; displayName = $_.DisplayName; status = [string]$_.Status; startType = [string]$_.StartType } })
} catch { $report.environment.serviceError = [string]$_.Exception.Message }

$tasks = @()
try { $tasks = Get-QbTasks; $report.environment.scheduledTasks = $tasks }
catch { $report.environment.scheduledTaskError = [string]$_.Exception.Message; $report.blockers += "scheduled_tasks_unreadable_refusing_to_run" }
$report.environment.taskSchedulerEvents = Get-TaskSchedulerEvents -TaskNames @($tasks | ForEach-Object { $_.name })
$report.environment.workerLogs = @($WorkerLogDirs | ForEach-Object { Get-WorkerLogEvidence -Dir $_ })
$sdkLog = "C:\ProgramData\Intuit\QuickBooks\qbsdklog.txt"
if (Test-Path -LiteralPath $sdkLog) {
    $report.environment.qbSdkLogTail = @(Get-Content -LiteralPath $sdkLog -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { Redact ([string]$_) })
}

if (-not @($qbProcs | Where-Object { $_.name -match '^(?i)QBW(32)?\.exe$' -and $_.sessionId -eq $mySession }).Count) {
    $report.blockers += "quickbooks_not_running_in_this_windows_session (open QuickBooks and the company file first; this script never launches it)"
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

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$exitCode = 0
if ($report.blockers.Count) {
    $exitCode = 2
} else {
    $tmpId = [guid]::NewGuid().ToString("N")
    $planFile = Join-Path $OutDir ("tmp-plan-{0}.json" -f $tmpId)
    $resultFile = Join-Path $OutDir ("tmp-result-{0}.json" -f $tmpId)
    $plan = [ordered]@{
        mode = $mode
        companyFile = $(if ($mode -eq "discover") { "" } else { $CompanyFile })
        expectedCompany = $ExpectedCompany
        qbXmlVersion = $QbXmlVersion
        maxSeconds = $MaxSeconds
        candidateMax = $CandidateMax
        customerListId = $CustomerListId
        showNames = [bool]$ShowNames
        items = $(if ($manifest) { @($manifest.items) } else { @() })
        references = $(if ($manifest -and $mode -eq "focused") { $manifest.references } else { $null })
    }
    $plan | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $planFile -Encoding UTF8
    try {
        $exe = (Get-Process -Id $PID).Path
        $argLine = ('-NoProfile -ExecutionPolicy Bypass -STA -File "{0}" -Child -PlanPath "{1}" -ResultPath "{2}"' -f $PSCommandPath, $planFile, $resultFile)
        Write-Host ("Opening one SDK session (limit {0}s). If QuickBooks shows an application certificate prompt, answer it in the QuickBooks window." -f $MaxSeconds)
        $proc = Start-Process -FilePath $exe -ArgumentList $argLine -PassThru -WindowStyle Hidden
        if (-not $proc.WaitForExit($MaxSeconds * 1000)) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $report.sdk = [ordered]@{ ok = $false; stage = "timeout"; error = ("SDK child exceeded {0}s and was stopped; QuickBooks releases its session when the client process ends." -f $MaxSeconds) }
            $exitCode = 3
        } elseif (Test-Path -LiteralPath $resultFile) {
            $report.sdk = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            if (-not $report.sdk.ok) { $exitCode = 3 }
        } else {
            $report.sdk = [ordered]@{ ok = $false; stage = "child_no_result"; error = ("SDK child exited with code {0} without a result." -f $proc.ExitCode) }
            $exitCode = 3
        }
    } finally {
        Remove-Item -LiteralPath $planFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue
    }
}

if ($mode -eq "query" -and $report.sdk -and $report.sdk.ok) {
    $missing = @()
    foreach ($i in @($report.sdk.items)) { if (-not $i.found) { $missing += ("item_listid_not_found:" + $i.concept) } elseif ($i.qb.isActive -ne "true") { $missing += ("item_inactive:" + $i.concept) } }
    $mapped = @($report.sdk.items | ForEach-Object { $_.concept })
    foreach ($c in @($manifest.requiredConcepts)) { if ($mapped -notcontains $c) { $missing += ("concept_unmapped:" + $c) } }
    if (-not $report.sdk.customer.found) { $missing += "customer_not_found" } elseif ($report.sdk.customer.isActive -ne "true") { $missing += "customer_inactive" }
    if (-not $report.sdk.classes.verified) { $missing += "classes_unverified" }
    if (-not $report.sdk.standardTerms.verified -and -not $report.sdk.dateDrivenTerms.verified) { $missing += "terms_unverified" }
    if (-not $report.sdk.salesTaxCodes.verified) { $missing += "sales_tax_codes_unverified" }
    $missing += "sales_order_config_not_chosen (terms, class, tax treatment are operator decisions; nothing is auto-selected)"
    $report.previewGaps = $missing
}

if ($mode -eq "focused" -and $report.sdk -and $report.sdk.ok) {
    $missing = @()
    foreach ($i in @($report.sdk.items)) {
        if (-not $i.found) { $missing += ("item_listid_not_found:" + $i.concept) }
        elseif ($i.qb.isActive -ne "true") { $missing += ("item_inactive:" + $i.concept) }
        elseif (-not $i.fullNameMatches) { $missing += ("item_name_mismatch:" + $i.concept) }
    }
    if ($CustomerListId) {
        if (-not $report.sdk.customer.found) { $missing += "customer_not_found" } elseif ($report.sdk.customer.isActive -ne "true") { $missing += "customer_inactive" }
    }
    foreach ($g in @("classes", "terms", "salesTaxCodes", "salesTaxItems", "templates")) {
        foreach ($r in @($report.sdk.references.$g | Where-Object { $_ })) {
            $label = ("{0}:{1}" -f $g, $r.expectedName)
            if (-not $r.found) { $missing += ("reference_not_found:" + $label) }
            elseif ($r.isActive -ne "true") { $missing += ("reference_inactive:" + $label) }
            elseif (-not $r.nameMatches) { $missing += ("reference_name_mismatch:" + $label) }
        }
    }
    $report.previewGaps = $missing
}

$report.elapsedSeconds = [int]((Get-Date) - $Started).TotalSeconds
$outFile = Join-Path $OutDir ("sales-order-sdk-preflight-{0}-{1}.json" -f $mode, (Get-Date -Format "yyyyMMdd-HHmmss"))
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outFile -Encoding UTF8

Write-Host ""
if ($report.blockers.Count) { Write-Host "REFUSED (nothing sent to QuickBooks):"; $report.blockers | ForEach-Object { Write-Host ("  - {0}" -f $_) } }
elseif ($report.sdk) {
    Write-Host ("SDK stage: {0}  ok: {1}  requests: {2}  sessionEnded: {3}  connectionClosed: {4}" -f $report.sdk.stage, $report.sdk.ok, $report.sdk.requestCount, $report.sdk.sessionEnded, $report.sdk.connectionClosed)
    if ($report.sdk.error) { Write-Host ("SDK error: {0}" -f $report.sdk.error) }
    if ($report.sdk.company) { Write-Host ("Company name: {0}" -f $report.sdk.company.companyName) }
    if ($report.sdk.companyFileName) { Write-Host ("Company file: {0}" -f $report.sdk.companyFileName) }
    if ($mode -eq "discover" -and $report.sdk.ok) {
        $next = ('powershell -NoProfile -ExecutionPolicy Bypass -File "{0}" -CompanyFile "{1}" -ExpectedCompany "{2}"' -f $PSCommandPath, $report.sdk.companyFileName, $report.sdk.company.companyName)
        $report.nextCommand = $next
        $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outFile -Encoding UTF8
        Write-Host ""
        Write-Host "Explicit-path command for the full query-only preflight (verify the path and name above first):"
        Write-Host ("  {0}" -f $next)
    }
    if ($report.sdk.identity) { Write-Host ("Identity: name match {0}, file match {1}" -f $report.sdk.identity.companyNameMatches, $report.sdk.identity.companyFileMatches) }
    if ($report.previewGaps) { Write-Host "Preview gaps:"; $report.previewGaps | ForEach-Object { Write-Host ("  - {0}" -f $_) } }
}
Write-Host ""
Write-Host ("Report: {0}" -f $outFile)
exit $exitCode
