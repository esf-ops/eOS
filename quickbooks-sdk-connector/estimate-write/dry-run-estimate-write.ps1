# eliteOS QuickBooks EstimateAdd — Phase 1.2 LIVE TEST dry-run (Windows QB VM)
#
# Opens QBXMLRP2, runs CompanyQuery + CustomerQuery + ItemQuery ONLY, then invokes
# the Node dry-run CLI with company identity + customer ListID. Never sends EstimateAdd.
#
# Prerequisites (manual):
#   - Separate TEST .QBW open in QuickBooks Desktop (or QB_COMPANY_FILE pointing at it)
#   - CompanyName contains "test"
#   - QB_WRITE_TEST_COMPANY_ALLOWLIST set to the EXACT CompanyName from discover-test-company.ps1
#   - Customer "ELITEOS TEST CUSTOMER" exists (exactly one active)
#   - Four mapped Items exist with expected ListIDs/FullNames
#
# First run discovery if allowlist is unknown:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\discover-test-company.ps1
#
# Then:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\dry-run-estimate-write.ps1
#
# Optional:
#   -EnvFile C:\eliteOS\config\qb-estimate-write-test.env
#   -OutJson C:\eliteOS\logs\qb-estimate-write\phase12-dry-run.json

[CmdletBinding()]
param(
    [string]$EnvFile = "",
    [string]$CompanyFile = $env:QB_COMPANY_FILE,
    [string]$OutJson = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Banner([string]$Message) {
    Write-Host $Message -ForegroundColor Cyan
}

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

function Escape-Xml([string]$Value) {
    return ($Value -replace "&", "&amp;" -replace '"', "&quot;" -replace "<", "&lt;" -replace ">", "&gt;")
}

function Get-XmlTag([string]$Xml, [string]$Tag) {
    if ($Xml -match "<$Tag>([^<]*)</$Tag>") { return $Matches[1].Trim() }
    return $null
}

if ($EnvFile) { Import-DotEnv $EnvFile }
elseif (Test-Path -LiteralPath "C:\eliteOS\config\qb-estimate-write-test.env") {
    Import-DotEnv "C:\eliteOS\config\qb-estimate-write-test.env"
}

$required = @(
    "QB_WRITE_ENABLED",
    "QB_WRITE_ENV",
    "QB_WRITE_DRY_RUN",
    "QB_WRITE_ORGANIZATION_ID",
    "QB_WRITE_TEST_COMPANY_ALLOWLIST",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
)
foreach ($name in $required) {
    if (-not [string]$env:$name) {
        throw "Missing required env: $name"
    }
}

if ($env:QB_WRITE_ENABLED -ne "true") { throw "QB_WRITE_ENABLED must be true" }
if ($env:QB_WRITE_ENV -ne "test") { throw "QB_WRITE_ENV must be test" }
if ($env:QB_WRITE_DRY_RUN -ne "true") { throw "Phase 1.2 requires QB_WRITE_DRY_RUN=true" }

$AppId = if ($env:QB_APP_ID) { $env:QB_APP_ID } else { "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" }
$AppName = if ($env:QB_APP_NAME) { $env:QB_APP_NAME } else { "EliteOS QuickBooks Estimate DryRun" }
$QbXmlVersion = if ($env:QBXML_VERSION) { $env:QBXML_VERSION } else { "13.0" }
$CustomerName = if ($env:QB_WRITE_TEST_CUSTOMER_NAME) { $env:QB_WRITE_TEST_CUSTOMER_NAME } else { "ELITEOS TEST CUSTOMER" }
$OpenConnectionTypeLocalQbd = 1
$OpenModeDontCare = 2

function New-QbXml([string]$Inner) {
    return @"
<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="$(Escape-Xml $QbXmlVersion)"?>
<QBXML><QBXMLMsgsRq onError="stopOnError">$Inner</QBXMLMsgsRq></QBXML>
"@
}

function Assert-ReadOnlyQbXml([string]$Xml) {
    if ($Xml -match "<(EstimateAdd|InvoiceAdd|SalesOrderAdd|CustomerAdd|ItemAdd|EstimateMod|CustomerMod|ItemMod|Delete)Rq") {
        throw "Refusing to ProcessRequest write/modify/delete qbXML in dry-run script."
    }
}

$expectedItems = @(
    @{ ListId = "8000005C-1327168522"; FullName = "Tear Out" },
    @{ ListId = "80000023-1327168507"; FullName = "Cooktop Cutout" },
    @{ ListId = "8000006D-1327168526"; FullName = "Undermount Sink Cutout" },
    @{ ListId = "8000023B-1652221291"; FullName = "Edge:Waterfall End Panels" }
)

$report = [ordered]@{
    phase = "phase1_2_live_dry_run"
    dryRunBanner = "DRY RUN — NOTHING SENT TO QUICKBOOKS"
    transmit = $false
    company = $null
    customer = $null
    items = @()
    nodeExitCode = $null
    ok = $false
    errors = @()
}

Write-Banner "eliteOS QB EstimateAdd Phase 1.2 LIVE TEST DRY RUN — queries only, then Node build (no transmit)"

$processor = $null
$ticket = $null
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
    $companyIdentity = Get-XmlTag $companyRs "CompanyName"
    $companyFileName = Get-XmlTag $companyRs "CompanyFileName"
    if (-not $companyIdentity) {
        throw "CompanyQuery did not return CompanyName."
    }
    Write-Host ("Company identity: {0}" -f $companyIdentity)
    if ($companyFileName) { Write-Host ("CompanyFileName: {0}" -f $companyFileName) }

    if (-not $companyIdentity.ToLowerInvariant().Contains("test")) {
        throw "FAIL CLOSED: CompanyName does not contain 'test'. Refusing dry-run against this company."
    }

    $allow = @($env:QB_WRITE_TEST_COMPANY_ALLOWLIST -split "[,\n]" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($allow -notcontains $companyIdentity) {
        throw ("FAIL CLOSED: company identity is not on QB_WRITE_TEST_COMPANY_ALLOWLIST.`nExact identity: {0}`nRun discover-test-company.ps1 and set allowlist to that exact string." -f $companyIdentity)
    }
    $forbidden = @()
    if ($env:QB_WRITE_FORBIDDEN_COMPANY_IDENTITIES) {
        $forbidden = @($env:QB_WRITE_FORBIDDEN_COMPANY_IDENTITIES -split "[,\n]" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
    if ($forbidden -contains $companyIdentity) {
        throw "FAIL CLOSED: company identity is forbidden/production."
    }

    $report.company = [ordered]@{
        companyName = $companyIdentity
        companyFileName = $companyFileName
        companyFileArg = if ($qbFile) { $qbFile } else { "(currently open company file)" }
        allowlistMatch = $true
        containsTest = $true
        safetyGate = "PASS"
    }

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
        throw "FAIL: customer '$CustomerName' not found. Create it manually in TEST company. CustomerAdd is forbidden."
    }
    if ($matches.Count -gt 1) {
        throw "FAIL: customer '$CustomerName' resolved to $($matches.Count) rows; exactly one is required."
    }
    if ($matches[0].isActive -eq $false) {
        throw "FAIL: customer '$CustomerName' is inactive."
    }
    $customerListId = [string]$matches[0].listId
    $report.customer = $matches[0]
    Write-Host ("Customer ListID: {0} (active={1})" -f $customerListId, $matches[0].isActive)

    Write-Banner "Validating TEST ItemQuery ListIDs (read-only)"
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
            $result = "FAIL"
            throw ("STOP: TEST company missing item ListID {0} (expected FullName '{1}'). Do not remap automatically." -f $item.ListId, $item.FullName)
        }
        if ($obsListId -ne $item.ListId) {
            throw ("STOP: ItemQuery ListID mismatch for {0}." -f $item.ListId)
        }
        if ($obsActive -eq $false) {
            throw ("STOP: Item ListID {0} is inactive in TEST company." -f $item.ListId)
        }
        if ($obsFullName -ne $item.FullName) {
            throw ("STOP: ListID {0} FullName '{1}' !== expected '{2}'. Do not remap automatically." -f $item.ListId, $obsFullName, $item.FullName)
        }
        $report.items += [ordered]@{
            listId = $item.ListId
            expectedFullName = $item.FullName
            observedFullName = $obsFullName
            isActive = $obsActive
            validation = $result
        }
        Write-Host ("OK item: {0} = {1}" -f $item.ListId, $obsFullName)
    }

    $env:QB_WRITE_COMPANY_IDENTITY = $companyIdentity
    $env:QB_WRITE_CUSTOMER_LIST_ID = $customerListId

    # Close SDK session before Node (Node does not open SDK when overrides are set)
    if ($null -ne $processor -and $null -ne $ticket) {
        try { $processor.EndSession($ticket) | Out-Null } catch { }
        $ticket = $null
    }
    if ($null -ne $processor) {
        try { $processor.CloseConnection() | Out-Null } catch { }
        $processor = $null
    }

    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    Write-Banner "Invoking Node dry-run (build EstimateAdd; do not transmit)"
    Push-Location $repoRoot.Path
    try {
        & node "backend-core/src/scripts/qbEstimateDryRun.mjs"
        $report.nodeExitCode = $LASTEXITCODE
        if ($LASTEXITCODE -ne 0) { throw "Node dry-run exited with code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $report.ok = $true
    Write-Banner "DRY RUN — NOTHING SENT TO QUICKBOOKS"
}
catch {
    $report.ok = $false
    $report.errors += [string]$_.Exception.Message
    throw
}
finally {
    if ($null -ne $processor -and $null -ne $ticket) {
        try { $processor.EndSession($ticket) | Out-Null } catch { }
    }
    if ($null -ne $processor) {
        try { $processor.CloseConnection() | Out-Null } catch { }
    }
    if (-not $OutJson) {
        $OutJson = Join-Path $env:TEMP "eliteos-qb-phase12-dry-run.json"
    }
    try {
        $dir = Split-Path -Parent $OutJson
        if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        ($report | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $OutJson -Encoding UTF8
        Write-Host ("Phase 1.2 report: {0}" -f $OutJson)
    } catch {
        Write-Host ("Could not write report JSON: {0}" -f $_.Exception.Message)
    }
}
