# eliteOS QuickBooks SALES ORDER agent (PowerShell 5.1, QuickBooks VM)
#
# Outbound-only. Polls Brain for sales order work, runs exactly the qbXML step it is
# given against the open QuickBooks company through the Desktop SDK Request Processor
# (QBXMLRP2, same identity as quickbooks-sdk-connector), and posts the raw response back.
# Brain owns planning, idempotency, reconciliation and retries.
#
# HARD SAFETY (local, independent of Brain's own write gate):
#   - Writes are OFF unless QB_SO_AGENT_WRITE_ENABLED=1 AND QB_SO_AGENT_ENVIRONMENT=test.
#     With writes off the agent never claims work; -Probe only confirms the company.
#   - Allowed requests: CompanyQueryRq, SalesOrderQueryRq, SalesOrderAddRq. Exactly one
#     request per message. Any Mod/Del/other Add is refused.
#   - Before every SalesOrderAddRq the agent queries the open company in the same session
#     and requires it to equal BOTH QB_SO_AGENT_EXPECTED_COMPANY and Brain's expectedCompany.
#   - HTTPS required for Brain unless the host is localhost.
#   - The token is sent only in the Authorization header and never printed.
#
# Env (see sales-order-agent.env.example):
#   QB_SO_AGENT_BRAIN_URL        https://<brain>   (no trailing path)
#   QB_SO_AGENT_TOKEN            scoped agent token (Brain: QB_SALES_ORDER_AGENT_TOKEN)
#   QB_SO_AGENT_EXPECTED_COMPANY exact QuickBooks company name of the TEST file
#   QB_SO_AGENT_ENVIRONMENT      test   (anything else refuses writes)
#   QB_SO_AGENT_WRITE_ENABLED    0|1    (default 0)
#   QB_COMPANY_FILE              optional explicit .QBW path; default: currently open file
#   QB_APP_NAME / QB_APP_ID      optional SDK identity override
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-order-agent.ps1 -Probe
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-order-agent.ps1 -Once
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-order-agent.ps1 -Loop -IntervalSeconds 60

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Probe,
    [switch]$Once,
    [switch]$Loop,
    [int]$IntervalSeconds = 60,
    [int]$MaxJobsPerRun = 10
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.0.0"
$RequestProcessorProgId = "QBXMLRP2.RequestProcessor"
$DefaultAppName = "EliteOS QuickBooks SDK Connector"
$DefaultAppId = "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
$OpenConnectionTypeLocalQbd = 1
$OpenModeDontCare = 2
$AllowedRequests = @("CompanyQueryRq", "SalesOrderQueryRq", "SalesOrderAddRq")

function Get-EnvOrDefault {
    param([string]$Name, [string]$Default = "")
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
    return $v.Trim()
}

function Write-AgentLog {
    param([string]$Message)
    Write-Host ("[{0}] {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $Message)
}

function Get-AgentConfig {
    $brain = (Get-EnvOrDefault "QB_SO_AGENT_BRAIN_URL").TrimEnd("/")
    if ([string]::IsNullOrWhiteSpace($brain)) { throw "QB_SO_AGENT_BRAIN_URL is required." }
    $uri = [Uri]$brain
    $isLocal = @("localhost", "127.0.0.1", "::1") -contains $uri.Host
    if ($uri.Scheme -ne "https" -and -not $isLocal) { throw "QB_SO_AGENT_BRAIN_URL must use https." }
    $expected = Get-EnvOrDefault "QB_SO_AGENT_EXPECTED_COMPANY"
    if ([string]::IsNullOrWhiteSpace($expected)) { throw "QB_SO_AGENT_EXPECTED_COMPANY is required." }
    $environment = (Get-EnvOrDefault "QB_SO_AGENT_ENVIRONMENT").ToLowerInvariant()
    $writeFlag = Get-EnvOrDefault "QB_SO_AGENT_WRITE_ENABLED" "0"
    return @{
        BrainUrl        = $brain
        Token           = Get-EnvOrDefault "QB_SO_AGENT_TOKEN"
        ExpectedCompany = $expected
        Environment     = $environment
        WritesEnabled   = ($writeFlag -eq "1" -and $environment -eq "test")
        CompanyFile     = Get-EnvOrDefault "QB_COMPANY_FILE"
        AppName         = Get-EnvOrDefault "QB_APP_NAME" $DefaultAppName
        AppId           = Get-EnvOrDefault "QB_APP_ID" $DefaultAppId
    }
}

function Get-RequestTags {
    param([string]$QbXml)
    return @([regex]::Matches($QbXml, '<([A-Za-z][A-Za-z0-9]*)Rq\b') | ForEach-Object { $_.Groups[1].Value + "Rq" } | Where-Object { $_ -ne "QBXMLMsgsRq" })
}

function Assert-AllowedQbXml {
    param([string]$QbXml, [string]$ExpectedTag)
    if ([string]::IsNullOrWhiteSpace($QbXml)) { throw "Empty qbXML." }
    if ($QbXml -match '(?i)<(?:[A-Za-z0-9]*ModRq|[A-Za-z0-9]*DelRq|TxnDelRq|ListDelRq|TxnVoidRq)[\s/>]') {
        throw "Refusing modify/delete/void qbXML."
    }
    $tags = @(Get-RequestTags -QbXml $QbXml)
    if ($tags.Count -ne 1) { throw ("Expected exactly one request, found {0}." -f $tags.Count) }
    if ($AllowedRequests -notcontains $tags[0]) { throw ("Request not allowed: {0}" -f $tags[0]) }
    if ($tags[0] -ne $ExpectedTag) { throw ("Request {0} does not match the step ({1})." -f $tags[0], $ExpectedTag) }
}

function Open-QbSdkSession {
    param([hashtable]$Config)
    $processor = New-Object -ComObject $RequestProcessorProgId
    $state = @{ Processor = $processor; Ticket = $null; Connected = $false }
    try {
        try { $processor.OpenConnection2($Config.AppId, $Config.AppName, $OpenConnectionTypeLocalQbd) }
        catch { $processor.OpenConnection($Config.AppId, $Config.AppName) }
        $state.Connected = $true
        $state.Ticket = [string]$processor.BeginSession($Config.CompanyFile, $OpenModeDontCare)
        return $state
    } catch {
        Close-QbSdkSession -State $state
        throw
    }
}

function Close-QbSdkSession {
    param($State)
    if ($null -eq $State -or $null -eq $State.Processor) { return }
    try {
        if ($State.Ticket) { try { $State.Processor.EndSession([string]$State.Ticket) | Out-Null } catch { } }
        if ($State.Connected) { try { $State.Processor.CloseConnection() | Out-Null } catch { } }
    } finally {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($State.Processor) } catch { }
        $State.Processor = $null
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

function Get-OpenCompanyName {
    param($Session)
    $rq = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="13.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><CompanyQueryRq requestID="agent-company"/></QBXMLMsgsRq></QBXML>'
    Assert-AllowedQbXml -QbXml $rq -ExpectedTag "CompanyQueryRq"
    [xml]$doc = [string]$Session.Processor.ProcessRequest([string]$Session.Ticket, $rq)
    $name = $doc.QBXML.QBXMLMsgsRs.CompanyQueryRs.CompanyRet.CompanyName
    if ($name -is [System.Xml.XmlElement]) { $name = $name.InnerText }
    return [string]$name
}

function Invoke-Brain {
    param([hashtable]$Config, [string]$Path, [hashtable]$Body)
    $headers = @{ Authorization = "Bearer " + $Config.Token }
    $json = $Body | ConvertTo-Json -Depth 6 -Compress
    return Invoke-RestMethod -Method Post -Uri ($Config.BrainUrl + $Path) -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 60
}

function Invoke-WorkStep {
    param([hashtable]$Config, $Session, $Work)
    $responseXml = $null
    $transportError = $null
    try {
        Assert-AllowedQbXml -QbXml ([string]$Work.qbXml) -ExpectedTag ([string]$Work.requestType)
        if ($Work.requestType -eq "SalesOrderAddRq") {
            if (-not $Config.WritesEnabled) { throw "agent_write_disabled" }
            $open = Get-OpenCompanyName -Session $Session
            if ($open -ne $Config.ExpectedCompany -or $open -ne [string]$Work.expectedCompany) {
                throw ("company_mismatch: open company does not match the approved TEST company.")
            }
        }
        $responseXml = [string]$Session.Processor.ProcessRequest([string]$Session.Ticket, [string]$Work.qbXml)
    } catch {
        $transportError = ([string]$_.Exception.Message)
        if ($transportError.Length -gt 400) { $transportError = $transportError.Substring(0, 400) }
    }
    $body = @{ jobId = $Work.jobId; attemptId = $Work.attemptId; step = $Work.step }
    if ($null -ne $responseXml) { $body.responseXml = $responseXml } else { $body.transportError = $transportError }
    Write-AgentLog ("job {0} step {1} -> {2}" -f $Work.jobId, $Work.step, $(if ($transportError) { "error: " + $transportError } else { "response sent" }))
    return Invoke-Brain -Config $Config -Path "/api/internal/qb-sales-order-agent/result" -Body $body
}

function Invoke-AgentRun {
    param([hashtable]$Config)
    $session = $null
    $jobs = 0
    try {
        while ($jobs -lt $MaxJobsPerRun) {
            $next = Invoke-Brain -Config $Config -Path "/api/internal/qb-sales-order-agent/next" -Body @{ agentVersion = $AgentVersion }
            $work = $next.work
            if ($null -eq $work) { break }
            if ($null -eq $session) { $session = Open-QbSdkSession -Config $Config }
            $jobs++
            while ($null -ne $work) {
                $result = Invoke-WorkStep -Config $Config -Session $session -Work $work
                if ($result.stale) { Write-AgentLog ("job {0}: result was stale; Brain will re-check before any add." -f $work.jobId) }
                if ($null -ne $result.job) { Write-AgentLog ("job {0}: {1} {2}" -f $work.jobId, $result.job.statusLabel, $result.job.qbRefNumber) }
                $work = $result.work
            }
        }
    } finally {
        Close-QbSdkSession -State $session
    }
    return $jobs
}

# --- main ---
$config = Get-AgentConfig
Write-AgentLog ("eliteOS sales order agent {0}; environment={1}; writes={2}" -f $AgentVersion, $config.Environment, $(if ($config.WritesEnabled) { "ENABLED (test)" } else { "off" }))

if ($Probe) {
    $s = $null
    try {
        $s = Open-QbSdkSession -Config $config
        $open = Get-OpenCompanyName -Session $s
        $match = ($open -eq $config.ExpectedCompany)
        Write-AgentLog ("open company matches QB_SO_AGENT_EXPECTED_COMPANY: {0}" -f $match)
        if (-not $match) { exit 1 }
        exit 0
    } finally {
        Close-QbSdkSession -State $s
    }
}

if (-not $config.WritesEnabled) {
    Write-AgentLog "Writes are off (QB_SO_AGENT_WRITE_ENABLED=1 and QB_SO_AGENT_ENVIRONMENT=test are both required). Not claiming work."
    exit 0
}
if ([string]::IsNullOrWhiteSpace($config.Token)) { throw "QB_SO_AGENT_TOKEN is required." }

if ($Loop) {
    while ($true) {
        try { [void](Invoke-AgentRun -Config $config) } catch { Write-AgentLog ("run failed: {0}" -f $_.Exception.Message) }
        Start-Sleep -Seconds ([Math]::Max(15, $IntervalSeconds))
    }
} else {
    $count = Invoke-AgentRun -Config $config
    Write-AgentLog ("processed {0} job(s)" -f $count)
}
