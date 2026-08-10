# READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES
#
# live-sdk-linked-smoke.ps1
#
# Temporary QuickBooks Desktop VM smoke using the Intuit Desktop SDK
# COM Request Processor (same identity as the eliteOS SDK connector):
#   ProgID: QBXMLRP2.RequestProcessor
#   AppName: EliteOS QuickBooks SDK Connector
#   AppId:   {A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
#
# HARD SAFETY:
#   - Exactly ONE EstimateQueryRq (MaxReturned=1, IncludeLinkedTxns=true)
#   - Rejects any QBXML containing AddRq / ModRq / DelRq / TxnDelRq / ListDelRq
#   - No write helpers, no arbitrary-QBXML escape hatch
#   - No CData Gateway, no driver, no credentials prompts
#   - Always EndSession / CloseConnection / ReleaseComObject in finally
#
# Requirements: Windows PowerShell 5.1 only. No Node, npm, Git, Python,
# NuGet, or CData commercial drivers. QuickBooks Desktop + Desktop SDK
# must be installed; company file should be open (Multi-User Mode OK).
#
# Usage (on the QB VM):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\live-sdk-linked-smoke.ps1

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RequestProcessorProgId = "QBXMLRP2.RequestProcessor"
$DefaultAppName = "EliteOS QuickBooks SDK Connector"
$DefaultAppId = "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
$QbXmlVersion = "13.0"
$OutputPath = "C:\ThryveIntegration\slabOS-sdk-linked-smoke.json"
# OpenConnection2 connectionType: ctLocalQBD = 1
$OpenConnectionTypeLocalQbd = 1
# BeginSession openMode: qbFileOpenDoNotCare = 2 (Multi-User OK; do not force single-user)
$OpenModeDontCare = 2

function Write-SmokeBanner {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " EliteOS QuickBooks SDK LINKED SMOKE (PowerShell 5.1)"
    Write-Host " READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES"
    Write-Host " Transport: QBXMLRP2.RequestProcessor (direct Desktop SDK)"
    Write-Host "============================================================"
    Write-Host ""
}

function Assert-ReadOnlyQbXml {
    param([Parameter(Mandatory = $true)][string]$QbXml)

    if ([string]::IsNullOrWhiteSpace($QbXml)) {
        throw "QBXML payload must be a non-empty string."
    }

    # Reject Add / Mod / Del family including TxnDelRq / ListDelRq.
    $writePattern = '(?i)<(?:[A-Za-z0-9]*AddRq|[A-Za-z0-9]*ModRq|[A-Za-z0-9]*DelRq|TxnDelRq|ListDelRq)[\s>]'
    if ($QbXml -match $writePattern) {
        throw "Refusing to send write/modify/delete QBXML request through SDK smoke transport."
    }

    # Allow only EstimateQueryRq for this smoke script (single bounded read).
    $requestTags = [regex]::Matches($QbXml, '<([A-Za-z][A-Za-z0-9]*)Rq\b') | ForEach-Object {
        $_.Groups[1].Value + "Rq"
    } | Where-Object { $_ -ne "QBXMLMsgsRq" }

    $tagList = @($requestTags)
    if ($tagList.Count -eq 0) {
        throw "QBXML payload contains no recognized *Rq request tag."
    }
    foreach ($tag in $tagList) {
        if ($tag -ne "EstimateQueryRq") {
            throw "Smoke script allowlist permits only EstimateQueryRq. Found: $tag"
        }
    }
}

function New-EstimateLinkedSmokeQbXml {
    param(
        [string]$QbXmlVersion = "13.0",
        [string]$FromTxnDate = $null
    )

    # Mirror connector envelope (QbXmlBuilder) + single EstimateQueryRq.
    $requestId = "sdk-linked-smoke"
    $inner = '<EstimateQueryRq requestID="' + $requestId + '">' +
        "<MaxReturned>1</MaxReturned>"

    if (-not [string]::IsNullOrWhiteSpace($FromTxnDate)) {
        $inner += "<TxnDateRangeFilter><FromTxnDate>$FromTxnDate</FromTxnDate></TxnDateRangeFilter>"
    }

    $inner += "<IncludeLineItems>false</IncludeLineItems>" +
        "<IncludeLinkedTxns>true</IncludeLinkedTxns>" +
        "<OwnerID>0</OwnerID>" +
        "</EstimateQueryRq>"

    $qbXml =
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<?qbxml version="' + $QbXmlVersion + '"?>' +
        '<QBXML><QBXMLMsgsRq onError="continueOnError">' + $inner + '</QBXMLMsgsRq></QBXML>'

    Assert-ReadOnlyQbXml -QbXml $qbXml
    return $qbXml
}

function Get-DefaultFromTxnDate {
    return (Get-Date).AddDays(-90).ToString("yyyy-MM-dd")
}

function Get-XmlInnerText {
    param($Node, [string]$ChildName)

    if ($null -eq $Node) { return $null }
    $child = $Node.$ChildName
    if ($null -eq $child) { return $null }
    if ($child -is [string]) { return $child }
    if ($null -ne $child."#text") { return [string]$child."#text" }
    if ($null -ne $child.InnerText) { return [string]$child.InnerText }
    return [string]$child
}

function Get-LinkedTxnSafeRows {
    param($EstimateRet)

    $rows = New-Object System.Collections.Generic.List[object]
    if ($null -eq $EstimateRet) { return @() }

    $linked = $EstimateRet.LinkedTxn
    if ($null -eq $linked) { return @() }

    $items = @()
    if ($linked -is [System.Array]) {
        $items = $linked
    } else {
        $items = @($linked)
    }

    foreach ($lt in $items) {
        if ($null -eq $lt) { continue }
        $rows.Add([ordered]@{
            txnId     = Get-XmlInnerText -Node $lt -ChildName "TxnID"
            txnType   = Get-XmlInnerText -Node $lt -ChildName "TxnType"
            txnDate   = Get-XmlInnerText -Node $lt -ChildName "TxnDate"
            refNumber = Get-XmlInnerText -Node $lt -ChildName "RefNumber"
            linkType  = Get-XmlInnerText -Node $lt -ChildName "LinkType"
            amount    = Get-XmlInnerText -Node $lt -ChildName "Amount"
        }) | Out-Null
    }

    return @($rows)
}

function ConvertTo-SanitizedSdkSmokeResult {
    param(
        [string]$ResponseBody,
        [string]$FromTxnDate,
        [string]$AppName,
        [string]$CompanyFileMode
    )

    $result = [ordered]@{
        generatedAt        = (Get-Date).ToUniversalTime().ToString("o")
        result             = "FAIL"
        mode               = "read-only-sdk-linked-smoke"
        protocol           = "qbxmlrp2-com"
        protocolParityWith = "quickbooks-sdk-connector/QbSdk/QbRequestProcessor.cs"
        appName            = $AppName
        companyFileMode    = $CompanyFileMode
        openMode           = "qbFileOpenDoNotCare"
        query              = [ordered]@{
            requestTag        = "EstimateQueryRq"
            maxReturned       = 1
            includeLineItems  = $false
            includeLinkedTxns = $true
            fromTxnDate       = $FromTxnDate
            qbXmlVersion      = $QbXmlVersion
            queryCount        = 1
        }
        qbStatusCode       = $null
        qbStatusSeverity   = $null
        qbStatusMessage    = $null
        estimate           = $null
        linkedTransactions = @()
        error              = $null
        notes              = @(
            "READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES",
            "Exactly one EstimateQueryRq was sent via QBXMLRP2.RequestProcessor.",
            "Customer names, addresses, phones, emails, descriptions, and memos are omitted."
        )
    }

    if ([string]::IsNullOrWhiteSpace($ResponseBody) -or ($ResponseBody -notmatch "<")) {
        $result.error = "SDK returned non-XML or empty body."
        return $result
    }

    try {
        [xml]$doc = $ResponseBody
    } catch {
        $result.error = "Failed to parse SDK XML response."
        return $result
    }

    $rs = $null
    try {
        $rs = $doc.QBXML.QBXMLMsgsRs.EstimateQueryRs
    } catch {
        $result.error = "EstimateQueryRs missing from response."
        return $result
    }

    if ($null -eq $rs) {
        $result.error = "EstimateQueryRs missing from response."
        return $result
    }

    if ($rs -is [System.Xml.XmlElement]) {
        $result.qbStatusCode = $rs.GetAttribute("statusCode")
        $result.qbStatusSeverity = $rs.GetAttribute("statusSeverity")
        $result.qbStatusMessage = $rs.GetAttribute("statusMessage")
    } else {
        if ($null -ne $rs.statusCode) { $result.qbStatusCode = [string]$rs.statusCode }
        if ($null -ne $rs.statusSeverity) { $result.qbStatusSeverity = [string]$rs.statusSeverity }
        if ($null -ne $rs.statusMessage) { $result.qbStatusMessage = [string]$rs.statusMessage }
    }

    $statusCodeNum = 0
    [void][int]::TryParse([string]$result.qbStatusCode, [ref]$statusCodeNum)

    $est = $rs.EstimateRet
    if ($null -eq $est) {
        if ($statusCodeNum -eq 1) {
            $result.result = "PASS"
            $result.error = $null
            $result.notes += "No Estimate matched MaxReturned=1 filter (QB statusCode=1)."
            return $result
        }
        $result.error = "No EstimateRet in response (statusCode=$($result.qbStatusCode))."
        return $result
    }

    if ($est -is [System.Array]) {
        $est = $est[0]
    }

    $totalAmount = Get-XmlInnerText -Node $est -ChildName "TotalAmount"
    $subtotal = Get-XmlInnerText -Node $est -ChildName "Subtotal"
    if ([string]::IsNullOrWhiteSpace($totalAmount)) {
        $tax = Get-XmlInnerText -Node $est -ChildName "SalesTaxTotal"
        if (-not [string]::IsNullOrWhiteSpace($subtotal) -or -not [string]::IsNullOrWhiteSpace($tax)) {
            $subN = 0.0
            $taxN = 0.0
            [void][double]::TryParse($subtotal, [ref]$subN)
            [void][double]::TryParse($tax, [ref]$taxN)
            $totalAmount = ("{0:0.00}" -f ($subN + $taxN))
        }
    }

    $result.estimate = [ordered]@{
        txnId       = Get-XmlInnerText -Node $est -ChildName "TxnID"
        refNumber   = Get-XmlInnerText -Node $est -ChildName "RefNumber"
        txnDate     = Get-XmlInnerText -Node $est -ChildName "TxnDate"
        totalAmount = $totalAmount
        subtotal    = $subtotal
    }
    $result.linkedTransactions = @(Get-LinkedTxnSafeRows -EstimateRet $est)

    if ($statusCodeNum -ne 0 -and $statusCodeNum -ne 1) {
        $result.error = "QB statusCode=$statusCodeNum $($result.qbStatusSeverity) $($result.qbStatusMessage)"
        return $result
    }

    if ([string]::IsNullOrWhiteSpace([string]$result.estimate.txnId)) {
        $result.error = "EstimateRet missing TxnID."
        return $result
    }

    $result.result = "PASS"
    $result.error = $null
    return $result
}

function Save-SmokeResult {
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $dir = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $json = $Result | ConvertTo-Json -Depth 8
    if ($json -match '(?i)password\s*[:=]') {
        throw "Refusing to write output that appears to contain a password field."
    }
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Open-QbSdkSession {
    param(
        [Parameter(Mandatory = $true)][string]$AppId,
        [Parameter(Mandatory = $true)][string]$AppName,
        [string]$CompanyFile = ""
    )

    $processor = $null
    try {
        $processor = New-Object -ComObject $RequestProcessorProgId
    } catch {
        throw ("Failed to create COM object {0}: {1}" -f $RequestProcessorProgId, $_.Exception.Message)
    }

    $connected = $false
    try {
        $processor.OpenConnection2($AppId, $AppName, $OpenConnectionTypeLocalQbd)
        $connected = $true
    } catch {
        # Older Request Processor builds may not expose OpenConnection2.
        try {
            $processor.OpenConnection($AppId, $AppName)
            $connected = $true
        } catch {
            throw ("Failed to OpenConnection2/OpenConnection: {0}" -f $_.Exception.Message)
        }
    }

    $qbFile = ""
    if (-not [string]::IsNullOrWhiteSpace($CompanyFile)) {
        $qbFile = $CompanyFile
    }

    $ticket = $null
    try {
        $ticket = [string]$processor.BeginSession($qbFile, $OpenModeDontCare)
    } catch {
        throw ("Failed to BeginSession (qbFileOpenDoNotCare): {0}" -f $_.Exception.Message)
    }

    return @{
        Processor = $processor
        Ticket    = $ticket
        Connected = $connected
        Session   = $true
    }
}

function Close-QbSdkSession {
    param($SessionState)

    if ($null -eq $SessionState) { return }

    $processor = $SessionState.Processor
    if ($null -eq $processor) { return }

    try {
        if ($SessionState.Session -eq $true -and -not [string]::IsNullOrWhiteSpace([string]$SessionState.Ticket)) {
            try {
                $processor.EndSession([string]$SessionState.Ticket) | Out-Null
            } catch {
                Write-Host ("WARN: EndSession failed: {0}" -f $_.Exception.Message)
            }
            $SessionState.Session = $false
            $SessionState.Ticket = $null
        }
    } finally {
        try {
            if ($SessionState.Connected -eq $true) {
                try {
                    $processor.CloseConnection() | Out-Null
                } catch {
                    Write-Host ("WARN: CloseConnection failed: {0}" -f $_.Exception.Message)
                }
                $SessionState.Connected = $false
            }
        } finally {
            try {
                [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($processor)
            } catch {
                # ignore release errors
            }
            $SessionState.Processor = $null
            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
        }
    }
}

# --- main ---
Write-SmokeBanner

$appName = $DefaultAppName
if (-not [string]::IsNullOrWhiteSpace($env:QB_APP_NAME)) {
    $appName = $env:QB_APP_NAME.Trim()
}

$appId = $DefaultAppId
if (-not [string]::IsNullOrWhiteSpace($env:QB_APP_ID)) {
    $appId = $env:QB_APP_ID.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($env:QBXML_VERSION)) {
    $QbXmlVersion = $env:QBXML_VERSION.Trim()
}

$companyFile = ""
$companyFileMode = "currently-open"
if (-not [string]::IsNullOrWhiteSpace($env:QB_COMPANY_FILE)) {
    $companyFile = $env:QB_COMPANY_FILE.Trim()
    $companyFileMode = "explicit-path"
}

Write-Host ("AppName     : {0}" -f $appName)
Write-Host ("AppId       : {0}" -f $appId)
Write-Host ("QBXML ver   : {0}" -f $QbXmlVersion)
Write-Host ("Company file: {0}" -f $(if ($companyFileMode -eq "currently-open") { "(currently open)" } else { $companyFile }))
Write-Host ("Open mode   : qbFileOpenDoNotCare (Multi-User OK)")
Write-Host ("Output file : {0}" -f $OutputPath)
Write-Host "Query       : exactly 1 EstimateQueryRq (IncludeLinkedTxns=true)"
Write-Host ""

$fromTxnDate = Get-DefaultFromTxnDate
$qbXml = New-EstimateLinkedSmokeQbXml -QbXmlVersion $QbXmlVersion -FromTxnDate $fromTxnDate

$sessionState = $null
$responseBody = ""
$failError = $null

try {
    Write-Host "Opening QBXMLRP2 session..."
    $sessionState = Open-QbSdkSession -AppId $appId -AppName $appName -CompanyFile $companyFile

    Assert-ReadOnlyQbXml -QbXml $qbXml
    Write-Host "Sending read-only EstimateQueryRq (MaxReturned=1)..."
    $responseBody = [string]$sessionState.Processor.ProcessRequest([string]$sessionState.Ticket, $qbXml)
} catch {
    $failError = [string]$_.Exception.Message
} finally {
    Close-QbSdkSession -SessionState $sessionState
    $sessionState = $null
}

$sanitized = ConvertTo-SanitizedSdkSmokeResult `
    -ResponseBody $responseBody `
    -FromTxnDate $fromTxnDate `
    -AppName $appName `
    -CompanyFileMode $companyFileMode

if (-not [string]::IsNullOrWhiteSpace($failError) -and $sanitized.result -ne "PASS") {
    $sanitized.result = "FAIL"
    if ([string]::IsNullOrWhiteSpace([string]$sanitized.error)) {
        $sanitized.error = $failError
    }
}

Save-SmokeResult -Result $sanitized -Path $OutputPath

Write-Host ""
Write-Host "------------------------------------------------------------"
if ($sanitized.result -eq "PASS") {
    Write-Host "RESULT: PASS"
    if ($null -ne $sanitized.estimate) {
        Write-Host ("  TxnID      : {0}" -f $sanitized.estimate.txnId)
        Write-Host ("  RefNumber  : {0}" -f $sanitized.estimate.refNumber)
        Write-Host ("  TxnDate    : {0}" -f $sanitized.estimate.txnDate)
        Write-Host ("  TotalAmount: {0}" -f $sanitized.estimate.totalAmount)
        if (-not [string]::IsNullOrWhiteSpace([string]$sanitized.estimate.subtotal)) {
            Write-Host ("  Subtotal   : {0}" -f $sanitized.estimate.subtotal)
        }
        $links = @($sanitized.linkedTransactions)
        Write-Host ("  LinkedTxns : {0}" -f $links.Count)
        foreach ($lt in $links) {
            Write-Host "  LinkedTxn:"
            Write-Host ("    TxnID    : {0}" -f $lt.txnId)
            Write-Host ("    TxnType  : {0}" -f $lt.txnType)
            Write-Host ("    TxnDate  : {0}" -f $lt.txnDate)
            if (-not [string]::IsNullOrWhiteSpace([string]$lt.refNumber)) {
                Write-Host ("    RefNumber: {0}" -f $lt.refNumber)
            }
            Write-Host ("    LinkType : {0}" -f $lt.linkType)
            Write-Host ("    Amount   : {0}" -f $lt.amount)
        }
    } else {
        Write-Host "  No Estimate rows in range (still a successful read)."
    }
    Write-Host ("  Saved     : {0}" -f $OutputPath)
    Write-Host "------------------------------------------------------------"
    exit 0
}

Write-Host "RESULT: FAIL"
if (-not [string]::IsNullOrWhiteSpace([string]$sanitized.error)) {
    Write-Host ("  Error: {0}" -f $sanitized.error)
}
Write-Host ("  Saved: {0}" -f $OutputPath)
Write-Host "------------------------------------------------------------"
exit 1
