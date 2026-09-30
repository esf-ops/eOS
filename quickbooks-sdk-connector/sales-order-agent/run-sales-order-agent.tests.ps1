# Offline checks for run-sales-order-agent.ps1 (no QuickBooks, no network).
# Loads the agent's functions without running main, then drives Invoke-WorkStep
# with a fake SDK session and a captured Brain call.
#   pwsh -NoProfile -File ./run-sales-order-agent.tests.ps1

$ErrorActionPreference = "Stop"
$path = Join-Path $PSScriptRoot "run-sales-order-agent.ps1"
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
foreach ($fn in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    Invoke-Expression $fn.Extent.Text
}
$AllowedRequests = @("CompanyQueryRq", "SalesOrderQueryRq", "SalesOrderAddRq")

$script:sent = New-Object System.Collections.Generic.List[string]
$script:companyName = "Elite Stone TEST"
$script:lastBrainBody = $null
function Invoke-Brain { param($Config, $Path, $Body) $script:lastBrainBody = $Body; return @{ stale = $false; work = $null; job = $null } }

$session = [pscustomobject]@{ Ticket = "t"; Processor = [pscustomobject]@{} }
$session.Processor | Add-Member -MemberType ScriptMethod -Name ProcessRequest -Value {
    param($ticket, $xml)
    $script:sent.Add($xml)
    if ($xml -match "CompanyQueryRq") { return "<QBXML><QBXMLMsgsRs><CompanyQueryRs statusCode=`"0`"><CompanyRet><CompanyName>$($script:companyName)</CompanyName></CompanyRet></CompanyQueryRs></QBXMLMsgsRs></QBXML>" }
    return "<QBXML><QBXMLMsgsRs><SalesOrderAddRs statusCode=`"0`"/></QBXMLMsgsRs></QBXML>"
}

$config = @{ WritesEnabled = $true; ExpectedCompany = "Elite Stone TEST" }
$add = '<?xml version="1.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><SalesOrderAddRq><SalesOrderAdd/></SalesOrderAddRq></QBXMLMsgsRq></QBXML>'
$work = [pscustomobject]@{ jobId = "j"; attemptId = "a"; step = "add"; requestType = "SalesOrderAddRq"; expectedCompany = "Elite Stone TEST"; qbXml = $add }
$failures = 0
function Check([string]$name, [bool]$ok) { if ($ok) { Write-Host "ok: $name" } else { Write-Host "FAIL: $name"; $script:failures++ } }

[void](Invoke-WorkStep -Config $config -Session $session -Work $work)
Check "matching TEST company: add is sent after a company check" (($script:sent.Count -eq 2) -and ($script:sent[1] -match "SalesOrderAddRq") -and $null -ne $script:lastBrainBody.responseXml)

$script:sent.Clear(); $script:companyName = "Elite Stone Fabrications"
[void](Invoke-WorkStep -Config $config -Session $session -Work $work)
Check "different open company: add is NOT sent, error reported" ((-not ($script:sent -match "SalesOrderAddRq")) -and ($script:lastBrainBody.transportError -match "company_mismatch"))

$script:sent.Clear(); $script:companyName = "Elite Stone TEST"
$w2 = $work.PSObject.Copy(); $w2.expectedCompany = "Some Other TEST"
[void](Invoke-WorkStep -Config $config -Session $session -Work $w2)
Check "Brain's expected company differs: add is NOT sent" ((-not ($script:sent -match "SalesOrderAddRq")) -and ($script:lastBrainBody.transportError -match "company_mismatch"))

$script:sent.Clear()
[void](Invoke-WorkStep -Config @{ WritesEnabled = $false; ExpectedCompany = "Elite Stone TEST" } -Session $session -Work $work)
Check "writes disabled: nothing sent" (($script:sent.Count -eq 0) -and ($script:lastBrainBody.transportError -match "agent_write_disabled"))

$script:sent.Clear()
$w3 = $work.PSObject.Copy(); $w3.qbXml = '<QBXML><QBXMLMsgsRq><SalesOrderModRq/></QBXMLMsgsRq></QBXML>'
[void](Invoke-WorkStep -Config $config -Session $session -Work $w3)
Check "modify request refused" (($script:sent.Count -eq 0) -and ($script:lastBrainBody.transportError -match "Refusing"))

$script:sent.Clear()
$w4 = $work.PSObject.Copy(); $w4.qbXml = '<QBXML><QBXMLMsgsRq><InvoiceAddRq/></QBXMLMsgsRq></QBXML>'; $w4.requestType = "InvoiceAddRq"
[void](Invoke-WorkStep -Config $config -Session $session -Work $w4)
Check "invoice add refused" (($script:sent.Count -eq 0) -and ($script:lastBrainBody.transportError -match "not allowed"))

$script:sent.Clear()
$w5 = $work.PSObject.Copy(); $w5.requestType = "SalesOrderQueryRq"
[void](Invoke-WorkStep -Config $config -Session $session -Work $w5)
Check "request that doesn't match the step refused" (($script:sent.Count -eq 0) -and ($script:lastBrainBody.transportError -match "does not match"))

if ($failures -gt 0) { exit 1 }
Write-Host "run-sales-order-agent.tests.ps1: ok"
