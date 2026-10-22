# eliteOS QuickBooks Phase 1.2 — TEST company DISCOVERY (read-only)
#
# Runs CompanyQuery + CustomerQuery + ItemQuery ONLY via QBXMLRP2.
# Does NOT build EstimateAdd. Does NOT touch Supabase. Does NOT send Add/Mod/Delete.
#
# Use this FIRST to obtain the exact company identity string for:
#   QB_WRITE_TEST_COMPANY_ALLOWLIST=<exact CompanyName from CompanyQuery>
#
# Prerequisites (manual — do not create via SDK):
#   1. Separate TEST .QBW (not production)
#   2. That TEST company is the one currently open in QuickBooks Desktop
#      (or set QB_COMPANY_FILE to the TEST .QBW path)
#   3. CompanyName contains "test" (case-insensitive)
#   4. Customer "ELITEOS TEST CUSTOMER" exists and is active (exactly one)
#   5. The four mapped Items exist with the expected ListIDs/FullNames
#
# Usage (on the Windows QB VM):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\discover-test-company.ps1
#
# Optional:
#   -EnvFile C:\eliteOS\config\qb-estimate-write-test.env
#   -OutJson C:\eliteOS\logs\qb-estimate-write\phase12-discover.json

[CmdletBinding()]
param(
    [string]$EnvFile = "",
    [string]$CompanyFile = $env:QB_COMPANY_FILE,
    [string]$OutJson = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

if ($EnvFile) { Import-DotEnv $EnvFile }
elseif (Test-Path -LiteralPath "C:\eliteOS\config\qb-estimate-write-test.env") {
    Import-DotEnv "C:\eliteOS\config\qb-estimate-write-test.env"
}

$AppId = if ($env:QB_APP_ID) { $env:QB_APP_ID } else { "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" }
$AppName = if ($env:QB_APP_NAME) { $env:QB_APP_NAME } else { "EliteOS QuickBooks Estimate Discover" }
$QbXmlVersion = if ($env:QBXML_VERSION) { $env:QBXML_VERSION } else { "13.0" }
$CustomerName = if ($env:QB_WRITE_TEST_CUSTOMER_NAME) { $env:QB_WRITE_TEST_CUSTOMER_NAME } else { "ELITEOS TEST CUSTOMER" }
$OpenConnectionTypeLocalQbd = 1
$OpenModeDontCare = 2

function Escape-Xml([string]$Value) {
    return ($Value -replace "&", "&amp;" -replace '"', "&quot;" -replace "<", "&lt;" -replace ">", "&gt;")
}

function New-QbXml([string]$Inner) {
    return @"
<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="$(Escape-Xml $QbXmlVersion)"?>
<QBXML><QBXMLMsgsRq onError="stopOnError">$Inner</QBXMLMsgsRq></QBXML>
"@
}

function Assert-ReadOnlyQbXml([string]$Xml) {
    if ($Xml -match "<(EstimateAdd|InvoiceAdd|SalesOrderAdd|CustomerAdd|ItemAdd|EstimateMod|CustomerMod|ItemMod|Delete)Rq") {
        throw "Refusing to ProcessRequest write/modify/delete qbXML in discovery script."
    }
}

function Get-XmlTag([string]$Xml, [string]$Tag) {
    if ($Xml -match "<$Tag>([^<]*)</$Tag>") { return $Matches[1].Trim() }
    return $null
}

$expectedItems = @(
    @{ ListId = "8000005C-1327168522"; FullName = "Tear Out" },
    @{ ListId = "80000023-1327168507"; FullName = "Cooktop Cutout" },
    @{ ListId = "8000006D-1327168526"; FullName = "Undermount Sink Cutout" },
    @{ ListId = "8000023B-1652221291"; FullName = "Edge:Waterfall End Panels" }
)

Write-Host "eliteOS Phase 1.2 DISCOVER — QUERY ONLY (no EstimateAdd, no queue writes)" -ForegroundColor Cyan

$processor = $null
$ticket = $null
$report = [ordered]@{
    phase = "phase1_2_discover"
    dryRunBanner = "DISCOVER — NOTHING SENT TO QUICKBOOKS (queries only)"
    transmit = $false
    company = $null
    customer = $null
    items = @()
    allowlistValueSuggested = $null
    ok = $false
    errors = @()
}

try {
    $processor = New-Object -ComObject "QBXMLRP2.RequestProcessor"
    try {
        $processor.OpenConnection2($AppId, $AppName, $OpenConnectionTypeLocalQbd) | Out-Null
    } catch {
        $processor.OpenConnection($AppId, $AppName) | Out-Null
    }
    $qbFile = if ($CompanyFile) { $CompanyFile } else { "" }
    $ticket = $processor.BeginSession($qbFile, $OpenModeDontCare)

    $companyXml = New-QbXml '<CompanyQueryRq requestID="company-query"></CompanyQueryRq>'
    Assert-ReadOnlyQbXml $companyXml
    $companyRs = [string]$processor.ProcessRequest([string]$ticket, $companyXml)
    $companyName = Get-XmlTag $companyRs "CompanyName"
    $companyFileName = Get-XmlTag $companyRs "CompanyFileName"
    if (-not $companyName) { throw "CompanyQuery did not return CompanyName." }

    $containsTest = $companyName.ToLowerInvariant().Contains("test")
    $report.company = [ordered]@{
        companyName = $companyName
        companyFileName = $companyFileName
        companyFileArg = if ($qbFile) { $qbFile } else { "(currently open company file)" }
        containsTest = $containsTest
        qbXmlVersion = $QbXmlVersion
    }
    $report.allowlistValueSuggested = $companyName

    Write-Host ""
    Write-Host "=== COMPANY IDENTITY (use EXACTLY for allowlist) ===" -ForegroundColor Yellow
    Write-Host ("CompanyName     : {0}" -f $companyName)
    Write-Host ("CompanyFileName : {0}" -f $(if ($companyFileName) { $companyFileName } else { "(not returned)" }))
    Write-Host ("Session file    : {0}" -f $report.company.companyFileArg)
    Write-Host ("Contains 'test' : {0}" -f $containsTest)
    Write-Host ""
    Write-Host "Set this exact value (do not guess; do not auto-add to production env):" -ForegroundColor Yellow
    Write-Host ("QB_WRITE_TEST_COMPANY_ALLOWLIST={0}" -f $companyName)
    Write-Host ""

    if (-not $containsTest) {
        $report.errors += "CompanyName does not contain 'test' — refuse to treat as TEST company."
        Write-Host "FAIL: CompanyName must contain 'test'." -ForegroundColor Red
    }

    # CustomerQuery — exactly one active match
    $custInner = "<CustomerQueryRq requestID=`"customer-query`"><FullName>$(Escape-Xml $CustomerName)</FullName></CustomerQueryRq>"
    $customerXml = New-QbXml $custInner
    Assert-ReadOnlyQbXml $customerXml
    $customerRs = [string]$processor.ProcessRequest([string]$ticket, $customerXml)
    $customerRets = [regex]::Matches($customerRs, "<CustomerRet\b[\s\S]*?</CustomerRet>")
    $matches = @()
    foreach ($m in $customerRets) {
        $block = $m.Value
        $listId = Get-XmlTag $block "ListID"
        $fullName = Get-XmlTag $block "FullName"
        $isActiveRaw = Get-XmlTag $block "IsActive"
        $isActive = if ($null -eq $isActiveRaw) { $null } else { $isActiveRaw.ToLowerInvariant() -eq "true" }
        if ($fullName -and ($fullName -eq $CustomerName -or $fullName.ToLowerInvariant() -eq $CustomerName.ToLowerInvariant())) {
            $matches += [ordered]@{ listId = $listId; fullName = $fullName; isActive = $isActive }
        }
    }

    if ($matches.Count -eq 0) {
        $report.errors += "Customer '$CustomerName' not found. Create manually in TEST company. CustomerAdd forbidden."
        Write-Host "FAIL: customer missing." -ForegroundColor Red
    } elseif ($matches.Count -gt 1) {
        $report.errors += "Customer '$CustomerName' resolved to $($matches.Count) rows; exactly one required."
        Write-Host "FAIL: customer not unique." -ForegroundColor Red
    } elseif ($matches[0].isActive -eq $false) {
        $report.errors += "Customer '$CustomerName' is inactive."
        Write-Host "FAIL: customer inactive." -ForegroundColor Red
    } else {
        $report.customer = $matches[0]
        Write-Host "=== CUSTOMER ===" -ForegroundColor Yellow
        Write-Host ("FullName : {0}" -f $report.customer.fullName)
        Write-Host ("ListID   : {0}" -f $report.customer.listId)
        Write-Host ("IsActive : {0}" -f $report.customer.isActive)
        Write-Host ""
    }

    Write-Host "=== ITEMS ===" -ForegroundColor Yellow
    $allItemsOk = $true
    foreach ($item in $expectedItems) {
        $itemInner = "<ItemQueryRq requestID=`"item-$($item.ListId)`"><ListID>$(Escape-Xml $item.ListId)</ListID></ItemQueryRq>"
        $itemXml = New-QbXml $itemInner
        Assert-ReadOnlyQbXml $itemXml
        $itemRs = [string]$processor.ProcessRequest([string]$ticket, $itemXml)
        $ret = $null
        if ($itemRs -match "<Item\w*Ret\b[\s\S]*?</Item\w*Ret>") { $ret = $Matches[0] }
        $obsListId = if ($ret) { Get-XmlTag $ret "ListID" } else { $null }
        $obsFullName = if ($ret) { Get-XmlTag $ret "FullName" } else { $null }
        $obsActiveRaw = if ($ret) { Get-XmlTag $ret "IsActive" } else { $null }
        $obsActive = if ($null -eq $obsActiveRaw) { $null } else { $obsActiveRaw.ToLowerInvariant() -eq "true" }

        $result = "PASS"
        if (-not $ret -or -not $obsListId) {
            $result = "FAIL"; $allItemsOk = $false
            $report.errors += "Missing item ListID $($item.ListId) (expected '$($item.FullName)')."
        } elseif ($obsListId -ne $item.ListId) {
            $result = "FAIL"; $allItemsOk = $false
            $report.errors += "ListID mismatch for $($item.ListId)."
        } elseif ($obsActive -eq $false) {
            $result = "FAIL"; $allItemsOk = $false
            $report.errors += "Item $($item.ListId) inactive."
        } elseif ($obsFullName -ne $item.FullName) {
            $result = "FAIL"; $allItemsOk = $false
            $report.errors += "ListID $($item.ListId) FullName '$obsFullName' !== expected '$($item.FullName)'. Do not auto-remap."
        }

        $row = [ordered]@{
            listId = $item.ListId
            expectedFullName = $item.FullName
            observedFullName = $obsFullName
            isActive = $obsActive
            validation = $result
        }
        $report.items += $row
        Write-Host ("{0} | {1} | Active={2} | {3}" -f $item.ListId, $(if ($obsFullName) { $obsFullName } else { "(missing)" }), $obsActive, $result)
    }

    $report.ok = ($report.errors.Count -eq 0) -and $containsTest -and $null -ne $report.customer -and $allItemsOk

    Write-Host ""
    if ($report.ok) {
        Write-Host "DISCOVER OK — set allowlist to the CompanyName above, then run dry-run-estimate-write.ps1" -ForegroundColor Green
    } else {
        Write-Host "DISCOVER FAILED — fix TEST company manually; do not remap or Add via SDK." -ForegroundColor Red
        foreach ($e in $report.errors) { Write-Host ("  - {0}" -f $e) }
    }
    Write-Host "DISCOVER — NOTHING SENT TO QUICKBOOKS (queries only)" -ForegroundColor Cyan
}
finally {
    if ($null -ne $processor -and $null -ne $ticket) {
        try { $processor.EndSession($ticket) | Out-Null } catch { }
    }
    if ($null -ne $processor) {
        try { $processor.CloseConnection() | Out-Null } catch { }
    }
}

if (-not $OutJson) {
    $OutJson = Join-Path $env:TEMP "eliteos-qb-phase12-discover.json"
}
$dir = Split-Path -Parent $OutJson
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
($report | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $OutJson -Encoding UTF8
Write-Host ("Report written: {0}" -f $OutJson)

if (-not $report.ok) { exit 1 }
exit 0
