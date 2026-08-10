# READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES
#
# live-read-smoke.ps1
#
# Temporary localhost-only smoke test for the QuickBooks Desktop VM.
# Speaks the SAME CData QuickBooks Gateway HTTP+QBXML protocol as:
#   backend-core/src/quickbooks/live/quickBooksGatewayHttpTransport.js
#   backend-core/src/quickbooks/live/quickBooksLiveQbxml.js
#
# HARD SAFETY:
#   - Exactly ONE EstimateQueryRq (MaxReturned=1, IncludeLinkedTxns=true)
#   - Rejects any QBXML containing AddRq / ModRq / DelRq / TxnDelRq / ListDelRq
#   - No write helpers, no arbitrary-QBXML escape hatch
#   - Never echoes, logs, saves, or serializes the Gateway password
#   - TLS certificate validation bypass is LOCALHOST-ONLY (127.0.0.1 / localhost)
#     and must NOT be reused for remote/production networking
#
# Requirements: Windows PowerShell 5.1 only. No Node, npm, Git, Python, modules,
# NuGet, or CData commercial drivers.
#
# Usage (on the QB VM):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\live-read-smoke.ps1

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$DefaultGatewayUrl = "https://127.0.0.1:8166"
$QbXmlVersion = "16.0"
$OutputPath = "C:\ThryveIntegration\slabOS-live-read-smoke.json"
$RequestTimeoutSec = 120

function Write-SmokeBanner {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " EliteOS QuickBooks LIVE READ SMOKE (PowerShell 5.1)"
    Write-Host " READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES"
    Write-Host " LOCALHOST-ONLY - self-signed TLS bypass is NOT for remote use"
    Write-Host "============================================================"
    Write-Host ""
}

function Test-IsLocalGatewayUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    try {
        $uri = [Uri]$Url
    } catch {
        return $false
    }

    if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") {
        return $false
    }

    $hostName = $uri.Host.ToLowerInvariant()
    return ($hostName -eq "127.0.0.1" -or $hostName -eq "localhost" -or $hostName -eq "::1")
}

function Assert-ReadOnlyQbXml {
    param([Parameter(Mandatory = $true)][string]$QbXml)

    if ([string]::IsNullOrWhiteSpace($QbXml)) {
        throw "QBXML payload must be a non-empty string."
    }

    # Mirror Node live-read write rejection + explicit user-required patterns.
    # Refuses Add/Mod/Del family including TxnDelRq / ListDelRq.
    $writePattern = '(?i)<(?:[A-Za-z0-9]*AddRq|[A-Za-z0-9]*ModRq|[A-Za-z0-9]*DelRq|TxnDelRq|ListDelRq)[\s>]'
    if ($QbXml -match $writePattern) {
        throw "Refusing to send write/modify/delete QBXML request through live-read smoke transport."
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
        [string]$QbXmlVersion = "16.0",
        [string]$FromTxnDate = $null
    )

    # Exact envelope / inner shape parity with Node:
    #   wrapQbXmlRequest + buildBoundedQueryRq(EstimateQueryRq, maxReturned=1,
    #   includeLineItems=false, includeLinkedTxns=true, OwnerID=0)
    $requestId = "live-read-smoke"
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
        '<QBXML><QBXMLMsgsRq onError="stopOnError">' + $inner + '</QBXMLMsgsRq></QBXML>'

    Assert-ReadOnlyQbXml -QbXml $qbXml
    return $qbXml
}

function Get-DefaultFromTxnDate {
    # Match Node probe defaultProbeFromTxnDate(): ~90 days ago (YYYY-MM-DD).
    return (Get-Date).AddDays(-90).ToString("yyyy-MM-dd")
}

function ConvertFrom-SecureStringToPlainText {
    param([Parameter(Mandatory = $true)][SecureString]$Secure)

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Enable-LocalhostInsecureTls {
    # LOCALHOST-ONLY. Do not copy this pattern for remote/production networking.
    Write-Host "TLS: bypassing certificate validation for LOCALHOST smoke only."
    Write-Host "     Do NOT reuse this bypass for remote or production connections."

    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

    # PS 5.1 / .NET Framework callback (explicit localhost smoke only).
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {
        param($sender, $certificate, $chain, $sslPolicyErrors)
        return $true
    }
}

function Invoke-GatewayQbXmlPost {
    param(
        [Parameter(Mandatory = $true)][string]$GatewayUrl,
        [Parameter(Mandatory = $true)][string]$UserName,
        [Parameter(Mandatory = $true)][SecureString]$Password,
        [Parameter(Mandatory = $true)][string]$QbXml
    )

    Assert-ReadOnlyQbXml -QbXml $QbXml

    $plainPassword = $null
    $authHeader = $null
    try {
        $plainPassword = ConvertFrom-SecureStringToPlainText -Secure $Password
        $pairBytes = [System.Text.Encoding]::UTF8.GetBytes(($UserName + ":" + $plainPassword))
        $authHeader = "Basic " + [Convert]::ToBase64String($pairBytes)
    } finally {
        # Best-effort clear of plaintext password material.
        if ($null -ne $plainPassword) {
            $plainPassword = $null
        }
        [GC]::Collect()
    }

    # Headers must match Node quickBooksGatewayHttpTransport.postQbXml exactly:
    #   Authorization: Basic <base64(user:pass)>
    #   Content-Type: application/x-qbxml
    #   Accept: application/x-qbxml, text/xml, application/xml, text/plain, */*
    #   Connection: close
    $headers = @{
        Authorization = $authHeader
        Accept        = "application/x-qbxml, text/xml, application/xml, text/plain, */*"
        Connection    = "close"
    }

    try {
        $response = Invoke-WebRequest `
            -Uri $GatewayUrl `
            -Method Post `
            -Headers $headers `
            -Body $QbXml `
            -ContentType "application/x-qbxml" `
            -TimeoutSec $RequestTimeoutSec `
            -UseBasicParsing

        return @{
            StatusCode = [int]$response.StatusCode
            Body       = [string]$response.Content
        }
    } finally {
        $authHeader = $null
        $headers = $null
    }
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
            amount    = Get-XmlInnerText -Node $lt -ChildName "Amount"
            linkType  = Get-XmlInnerText -Node $lt -ChildName "LinkType"
            refNumber = Get-XmlInnerText -Node $lt -ChildName "RefNumber"
        }) | Out-Null
    }

    return @($rows)
}

function ConvertTo-SanitizedSmokeResult {
    param(
        [int]$HttpStatus,
        [string]$ResponseBody,
        [string]$GatewayUrl,
        [string]$FromTxnDate
    )

    $result = [ordered]@{
        generatedAt           = (Get-Date).ToUniversalTime().ToString("o")
        result                = "FAIL"
        mode                  = "read-only-smoke"
        protocol              = "gateway-http-qbxml"
        protocolParityWith    = "backend-core/src/quickbooks/live/quickBooksGatewayHttpTransport.js"
        gatewayHost           = ([Uri]$GatewayUrl).Host
        gatewayPort           = ([Uri]$GatewayUrl).Port
        tlsBypassLocalhostOnly = $true
        query                 = [ordered]@{
            requestTag          = "EstimateQueryRq"
            maxReturned         = 1
            includeLineItems    = $false
            includeLinkedTxns   = $true
            fromTxnDate         = $FromTxnDate
            qbXmlVersion        = $QbXmlVersion
            queryCount          = 1
        }
        httpStatus            = $HttpStatus
        qbStatusCode          = $null
        qbStatusSeverity      = $null
        qbStatusMessage       = $null
        estimate              = $null
        linkedTransactions    = @()
        error                 = $null
        notes                 = @(
            "READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES",
            "Exactly one EstimateQueryRq was sent.",
            "Customer names, addresses, phones, emails, descriptions, and memos are omitted."
        )
    }

    if ($HttpStatus -lt 200 -or $HttpStatus -ge 300) {
        $result.error = "Gateway HTTP status $HttpStatus"
        return $result
    }

    if ([string]::IsNullOrWhiteSpace($ResponseBody) -or ($ResponseBody -notmatch "<")) {
        $result.error = "Gateway returned non-XML or empty body."
        return $result
    }

    try {
        [xml]$doc = $ResponseBody
    } catch {
        $result.error = "Failed to parse Gateway XML response."
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

    # status attributes on EstimateQueryRs
    if ($null -ne $rs.statusCode) { $result.qbStatusCode = [string]$rs.statusCode }
    elseif ($null -ne $rs.GetAttribute) {
        $result.qbStatusCode = $rs.GetAttribute("statusCode")
        $result.qbStatusSeverity = $rs.GetAttribute("statusSeverity")
        $result.qbStatusMessage = $rs.GetAttribute("statusMessage")
    }
    if ($null -ne $rs.statusSeverity) { $result.qbStatusSeverity = [string]$rs.statusSeverity }
    if ($null -ne $rs.statusMessage) { $result.qbStatusMessage = [string]$rs.statusMessage }

    # Prefer attribute access via XmlElement
    if ($rs -is [System.Xml.XmlElement]) {
        if ([string]::IsNullOrWhiteSpace([string]$result.qbStatusCode)) {
            $result.qbStatusCode = $rs.GetAttribute("statusCode")
        }
        if ([string]::IsNullOrWhiteSpace([string]$result.qbStatusSeverity)) {
            $result.qbStatusSeverity = $rs.GetAttribute("statusSeverity")
        }
        if ([string]::IsNullOrWhiteSpace([string]$result.qbStatusMessage)) {
            $result.qbStatusMessage = $rs.GetAttribute("statusMessage")
        }
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

    # If multiple somehow returned, take first only (request asked for 1).
    if ($est -is [System.Array]) {
        $est = $est[0]
    }

    $totalAmount = Get-XmlInnerText -Node $est -ChildName "TotalAmount"
    if ([string]::IsNullOrWhiteSpace($totalAmount)) {
        $sub = Get-XmlInnerText -Node $est -ChildName "Subtotal"
        $tax = Get-XmlInnerText -Node $est -ChildName "SalesTaxTotal"
        if (-not [string]::IsNullOrWhiteSpace($sub) -or -not [string]::IsNullOrWhiteSpace($tax)) {
            $subN = 0.0
            $taxN = 0.0
            [void][double]::TryParse($sub, [ref]$subN)
            [void][double]::TryParse($tax, [ref]$taxN)
            $totalAmount = ("{0:0.00}" -f ($subN + $taxN))
        }
    }

    $result.estimate = [ordered]@{
        txnId       = Get-XmlInnerText -Node $est -ChildName "TxnID"
        refNumber   = Get-XmlInnerText -Node $est -ChildName "RefNumber"
        txnDate     = Get-XmlInnerText -Node $est -ChildName "TxnDate"
        totalAmount = $totalAmount
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
    # Belt-and-suspenders: never allow obvious secret material into the file.
    if ($json -match '(?i)password\s*[:=]') {
        throw "Refusing to write output that appears to contain a password field."
    }
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

# --- main ---
Write-SmokeBanner

$gatewayUrl = $DefaultGatewayUrl
if (-not [string]::IsNullOrWhiteSpace($env:QB_GATEWAY_URL)) {
    $gatewayUrl = $env:QB_GATEWAY_URL.Trim().TrimEnd("/")
    if ($gatewayUrl -notmatch '://') {
        $gatewayUrl = "https://$gatewayUrl"
    }
}

if (-not (Test-IsLocalGatewayUrl -Url $gatewayUrl)) {
    Write-Host "FAIL: This smoke script is LOCALHOST-ONLY."
    Write-Host "      Refusing non-local Gateway URL. Use https://127.0.0.1:8166 on the QB VM."
    exit 1
}

Write-Host "Gateway URL : $gatewayUrl"
Write-Host "Output file : $OutputPath"
Write-Host "Query       : exactly 1 EstimateQueryRq (IncludeLinkedTxns=true)"
Write-Host ""

$gatewayUser = Read-Host "Gateway username"
if ([string]::IsNullOrWhiteSpace($gatewayUser)) {
    Write-Host "FAIL: Gateway username is required."
    exit 1
}

$gatewayPassword = Read-Host "Gateway password" -AsSecureString
if ($null -eq $gatewayPassword -or $gatewayPassword.Length -le 0) {
    Write-Host "FAIL: Gateway password is required."
    exit 1
}

Enable-LocalhostInsecureTls

$fromTxnDate = Get-DefaultFromTxnDate
$qbXml = New-EstimateLinkedSmokeQbXml -QbXmlVersion $QbXmlVersion -FromTxnDate $fromTxnDate

Write-Host "Sending read-only EstimateQueryRq (MaxReturned=1)..."
$httpStatus = 0
$responseBody = ""
$failError = $null

try {
    $response = Invoke-GatewayQbXmlPost `
        -GatewayUrl $gatewayUrl `
        -UserName $gatewayUser `
        -Password $gatewayPassword `
        -QbXml $qbXml
    $httpStatus = [int]$response.StatusCode
    $responseBody = [string]$response.Body
} catch {
    $failError = [string]$_.Exception.Message
    # Never print exception objects that might echo connection headers with auth.
    if ($failError -match '(?i)basic\s+[a-z0-9+/=]+') {
        $failError = "Gateway request failed (auth header redacted)."
    }
}

# Drop password reference ASAP.
$gatewayPassword = $null

$sanitized = ConvertTo-SanitizedSmokeResult `
    -HttpStatus $httpStatus `
    -ResponseBody $responseBody `
    -GatewayUrl $gatewayUrl `
    -FromTxnDate $fromTxnDate

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
        $linkCount = @($sanitized.linkedTransactions).Count
        Write-Host ("  LinkedTxns : {0}" -f $linkCount)
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
Write-Host ("  HTTP : {0}" -f $sanitized.httpStatus)
Write-Host ("  Saved: {0}" -f $OutputPath)
Write-Host "------------------------------------------------------------"
exit 1
